import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentConfig } from "@opencode-ai/sdk";
import * as v from "valibot";
import { parse as parseYaml } from "yaml";

import { log } from "./utils/logger";

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

export interface LLMProviderConfig {
  name?: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface SkillMatcherConfig {
  model?: string;
  threshold?: number;
  maxResults?: number;
  cacheResults?: boolean;
  minConfidence?: number;
  providers?: LLMProviderConfig[];
}

export interface MicodeConfig {
  agents?: Record<string, AgentOverride>;
  dcp?: DcpConfig;
  worktreeMode?: boolean;
  ui?: {
    streamSubagentThoughts?: boolean;
    showStatusBoard?: boolean;
  };
  skillMatcher?: SkillMatcherConfig;
}

const AgentOverrideSchema = v.object({
  model: v.optional(v.union([v.string(), v.array(v.string())])),
  temperature: v.optional(v.number()),
  maxTokens: v.optional(v.number()),
});

const MicodeConfigSchema = v.object({
  agents: v.optional(v.record(v.string(), AgentOverrideSchema)),
  dcp: v.optional(
    v.object({
      enabled: v.optional(v.boolean()),
      strategies: v.optional(
        v.object({
          deduplication: v.optional(v.boolean()),
          supersedeWrites: v.optional(v.boolean()),
          errorPurge: v.optional(
            v.object({
              enabled: v.boolean(),
              turnsToKeep: v.number(),
            }),
          ),
        }),
      ),
      protectedTools: v.optional(v.array(v.string())),
    }),
  ),
  worktreeMode: v.optional(v.boolean()),
  ui: v.optional(
    v.object({
      streamSubagentThoughts: v.optional(v.boolean()),
      showStatusBoard: v.optional(v.boolean()),
    }),
  ),
  skillMatcher: v.optional(
    v.object({
      model: v.optional(v.string()),
      threshold: v.optional(v.number()),
      maxResults: v.optional(v.number()),
      cacheResults: v.optional(v.boolean()),
      minConfidence: v.optional(v.number()),
      providers: v.optional(
        v.array(
          v.object({
            name: v.optional(v.string()),
            baseURL: v.string(),
            apiKey: v.string(),
            model: v.string(),
          }),
        ),
      ),
    }),
  ),
});

/**
 * Load available models from opencode.json config file (asynchronous)
 * Returns a Set of "provider/model" strings
 */
export async function loadAvailableModels(configDir?: string): Promise<Set<string>> {
  const availableModels = new Set<string>();
  const baseDir = configDir ?? join(homedir(), ".config", "opencode");

  try {
    const configPath = join(baseDir, "opencode.json");
    const content = await readFile(configPath, "utf-8");
    const config = parseYaml(content) as { provider?: Record<string, { models?: Record<string, unknown> }> };

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
    // Substitute environment variables $VAR or ${VAR}
    const substituted = content.replace(/\$\{?([A-Z0-9_]+)\}?/g, (_, key) => process.env[key] ?? "");
    const parsed = parseYaml(substituted) as Record<string, unknown>;

    // Validate the config using valibot
    return v.parse(MicodeConfigSchema, parsed);
  } catch {
    return null;
  }
}

/**
 * Merge user config overrides into plugin agent configs
 * Model overrides are validated against available models from opencode.json
 * Invalid models are logged and skipped (agent uses opencode default)
 */
export async function mergeAgentConfigs(
  pluginAgents: Record<string, AgentConfig>,
  userConfig: MicodeConfig | null,
  availableModels?: Set<string>,
): Promise<Record<string, AgentConfig>> {
  if (!userConfig?.agents) {
    const result: Record<string, AgentConfig> = {};
    for (const [name, config] of Object.entries(pluginAgents)) {
      result[name] = { ...config };
    }
    return result;
  }

  const models = availableModels ?? (await loadAvailableModels());
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

          log.warn(
            "open-engineer",
            `Model(s) "${requestedModels}" for agent "${name}" not available. Using opencode default.`,
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
      merged[name] = { ...agentConfig };
    }
  }

  return merged;
}
