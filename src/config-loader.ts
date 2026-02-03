// src/config-loader.ts
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentConfig } from "@opencode-ai/sdk";

// Minimal type for provider validation - only what we need
export interface ProviderInfo {
  id: string;
  models: Record<string, unknown>;
}

/**
 * Load available models from opencode.json config file (synchronous)
 * Returns a Set of "provider/model" strings
 */
export function loadAvailableModels(configDir?: string): Set<string> {
  const availableModels = new Set<string>();
  const baseDir = configDir ?? join(homedir(), ".config", "opencode");

  try {
    const configPath = join(baseDir, "opencode.json");
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as { provider?: Record<string, { models?: Record<string, unknown> }> };

    if (config.provider) {
      for (const [providerId, providerConfig] of Object.entries(config.provider)) {
        if (providerConfig.models) {
          for (const modelId of Object.keys(providerConfig.models)) {
            availableModels.add(`${providerId}/${modelId}`);
          }
        }
      }
    }
  } catch {
    // Config doesn't exist or can't be parsed - return empty set
  }

  return availableModels;
}

// Safe properties that users can override
const SAFE_AGENT_PROPERTIES = ["model", "temperature", "maxTokens"] as const;

export interface AgentOverride {
  model?: string | string[];
  temperature?: number;
  maxTokens?: number;
}

export interface DcpConfig {
  enabled?: boolean;
  strategies?: {
    deduplication?: boolean;
    supersedeWrites?: boolean;
    errorPurge?: {
      enabled: boolean;
      turnsToKeep: number;
    };
  };
  protectedTools?: string[];
}

export interface MicodeConfig {
  agents?: Record<string, AgentOverride>;
  dcp?: DcpConfig;
}

/**
 * Load open-engineer.json from ~/.config/opencode/open-engineer.json
 * Returns null if file doesn't exist or is invalid JSON
 * @param configDir - Optional override for config directory (for testing)
 */
export async function loadMicodeConfig(configDir?: string): Promise<MicodeConfig | null> {
  const baseDir = configDir ?? join(homedir(), ".config", "opencode");
  const configPath = join(baseDir, "open-engineer.json");

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Sanitize the config - only allow safe properties
    const result: MicodeConfig = {};

    if (parsed.agents && typeof parsed.agents === "object") {
      const sanitizedAgents: Record<string, AgentOverride> = {};

      for (const [agentName, agentConfig] of Object.entries(parsed.agents)) {
        if (agentConfig && typeof agentConfig === "object") {
          const sanitized: AgentOverride = {};
          const config = agentConfig as Record<string, unknown>;

          for (const prop of SAFE_AGENT_PROPERTIES) {
            if (prop in config) {
              (sanitized as Record<string, unknown>)[prop] = config[prop];
            }
          }

          sanitizedAgents[agentName] = sanitized;
        }
      }

      result.agents = sanitizedAgents;
    }

    if (parsed.dcp) {
      result.dcp = parsed.dcp as DcpConfig;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Merge user config overrides into plugin agent configs
 * Model overrides are validated against available models from opencode.json
 * Invalid models are logged and skipped (agent uses opencode default)
 */
export function mergeAgentConfigs(
  pluginAgents: Record<string, AgentConfig>,
  userConfig: MicodeConfig | null,
  availableModels?: Set<string>,
): Record<string, AgentConfig> {
  if (!userConfig?.agents) {
    return pluginAgents;
  }

  const models = availableModels ?? loadAvailableModels();
  const shouldValidateModels = models.size > 0;

  const merged: Record<string, AgentConfig> = {};

  for (const [name, agentConfig] of Object.entries(pluginAgents)) {
    const userOverride = userConfig.agents[name];

    if (userOverride) {
      // Validate model if specified
      if (userOverride.model) {
        let selectedModel: string | undefined;

        if (Array.isArray(userOverride.model)) {
          // Find first available model
          for (const model of userOverride.model) {
            if (!shouldValidateModels || models.has(model)) {
              selectedModel = model;
              break;
            }
          }
        } else {
          // Single model
          if (!shouldValidateModels || models.has(userOverride.model)) {
            selectedModel = userOverride.model;
          }
        }

        if (selectedModel) {
          // Model is valid - apply all overrides
          // Cast to any because AgentConfig expects model to be string, but our internal AgentOverride allows array
          // We've resolved it to a string here (selectedModel)
          merged[name] = {
            ...agentConfig,
            ...userOverride,
            model: selectedModel,
          } as AgentConfig;
        } else {
          // Model invalid - log warning and apply other overrides only
          const requestedModels = Array.isArray(userOverride.model)
            ? userOverride.model.join(", ")
            : userOverride.model;

          console.warn(
            `[open-engineer] Model(s) "${requestedModels}" for agent "${name}" not available. Using opencode default.`,
          );
          const { model: _ignored, ...safeOverrides } = userOverride;
          merged[name] = {
            ...agentConfig,
            ...safeOverrides,
          } as AgentConfig;
        }
      } else {
        // No model specified - apply all overrides
        merged[name] = {
          ...agentConfig,
          ...userOverride,
        } as AgentConfig;
      }
    } else {
      merged[name] = agentConfig;
    }
  }

  return merged;
}

/**
 * Validate that configured models exist in available providers
 * Removes invalid model overrides and logs warnings
 */
export function validateAgentModels(userConfig: MicodeConfig, providers: ProviderInfo[]): MicodeConfig {
  if (!userConfig.agents) {
    return userConfig;
  }

  const hasAnyModels = providers.some((provider) => Object.keys(provider.models).length > 0);
  if (!hasAnyModels) {
    return userConfig;
  }

  // Build lookup map for providers and their models
  const providerMap = new Map<string, Set<string>>();
  for (const provider of providers) {
    providerMap.set(provider.id, new Set(Object.keys(provider.models)));
  }

  const validatedAgents: Record<string, AgentOverride> = {};

  for (const [agentName, override] of Object.entries(userConfig.agents)) {
    // No model specified - keep other properties as-is
    if (override.model === undefined) {
      validatedAgents[agentName] = override;
      continue;
    }

    // Empty or whitespace-only model - treat as invalid
    const modelValue = override.model;
    if (typeof modelValue === "string" && !modelValue.trim()) {
      const { model: _removed, ...otherProps } = override;
      console.warn(`[open-engineer] Empty model for agent "${agentName}". Using default model.`);
      if (Object.keys(otherProps).length > 0) {
        validatedAgents[agentName] = otherProps;
      }
      continue;
    }

    if (Array.isArray(modelValue)) {
      if (modelValue.length === 0) {
        const { model: _removed, ...otherProps } = override;
        console.warn(`[open-engineer] Empty model array for agent "${agentName}". Using default model.`);
        if (Object.keys(otherProps).length > 0) {
          validatedAgents[agentName] = otherProps;
        }
        continue;
      }

      // Filter valid models
      const validModels = modelValue.filter((m) => {
        const [providerID, ...rest] = m.split("/");
        const modelID = rest.join("/");
        const providerModels = providerMap.get(providerID);
        return providerModels?.has(modelID) ?? false;
      });

      if (validModels.length > 0) {
        validatedAgents[agentName] = { ...override, model: validModels };
      } else {
        const { model: _removed, ...otherProps } = override;
        console.warn(
          `[open-engineer] None of the models "${modelValue.join(", ")}" found for agent "${agentName}". Using default model.`,
        );
        if (Object.keys(otherProps).length > 0) {
          validatedAgents[agentName] = otherProps;
        }
      }
      continue;
    }

    // Parse "provider/model" format (string case)
    if (typeof modelValue === "string") {
      const [providerID, ...rest] = modelValue.split("/");
      const modelID = rest.join("/");

      const providerModels = providerMap.get(providerID);
      const isValid = providerModels?.has(modelID) ?? false;

      if (isValid) {
        validatedAgents[agentName] = override;
      } else {
        // Remove invalid model but keep other properties
        const { model: _removed, ...otherProps } = override;
        console.warn(`[open-engineer] Model "${modelValue}" not found for agent "${agentName}". Using default model.`);
        if (Object.keys(otherProps).length > 0) {
          validatedAgents[agentName] = otherProps;
        }
      }
    }
  }

  return { agents: validatedAgents };
}
