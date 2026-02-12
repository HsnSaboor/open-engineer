import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import * as v from "valibot";
import { parse as parseYaml } from "yaml";

import { WORKTREE_MODE, type WorktreeMode, type WorktreeSessionState, worktreeConfigSchema } from "../types/worktree";
import { log } from "../utils/logger";

const CONFIG_PATHS = {
  GLOBAL: path.join(os.homedir(), ".config", "opencode", "open-engineer.json"),
  PROJECT: ".open-engineer.json",
} as const;

interface ChatMessageOutput {
  parts: Array<{ type: string; text?: string }>;
}

/**
 * Directories and patterns to ignore when running in worktree mode
 * to prevent accessing parent repository files
 */
const PARENT_REPO_IGNORE_PATTERNS = [
  /^\.git\//,
  /^\.opencode\//,
  /^inspo\//,
  /^\.opencodeignore$/,
  /^\.opencode-?ignore$/i,
  /^\.gitignore$/,
];

function isParentRepoPath(filePath: string, worktreePath: string): boolean {
  const normalizedFile = path.normalize(filePath);
  const normalizedWorktree = path.normalize(worktreePath);

  if (!normalizedFile.startsWith(normalizedWorktree)) {
    return true;
  }

  const relativePath = normalizedFile.substring(normalizedWorktree.length);
  if (relativePath.length === 0 || relativePath.startsWith("/")) {
    return false;
  }

  for (const pattern of PARENT_REPO_IGNORE_PATTERNS) {
    if (pattern.test(relativePath)) {
      return true;
    }
  }

  return false;
}

function isValidPath(inputPath: string): { valid: boolean; reason?: string } {
  if (!inputPath || inputPath.length === 0) {
    return { valid: false, reason: "Path is empty" };
  }
  if (inputPath.length > 4096) {
    return { valid: false, reason: "Path exceeds maximum length" };
  }
  const normalized = path.normalize(inputPath);
  if (normalized.includes("..") || inputPath.includes("../") || inputPath.includes("..\\")) {
    return { valid: false, reason: "Path contains traversal sequence (..)" };
  }
  if (inputPath.includes("//")) {
    return { valid: false, reason: "Path contains double slash (//)" };
  }
  if (!path.isAbsolute(inputPath)) {
    return { valid: false, reason: "Path is not absolute" };
  }
  return { valid: true };
}

function isValidWorktreePath(worktreePath: string, parentDirectory: string): { valid: boolean; reason?: string } {
  const normalizedWorktree = path.normalize(worktreePath);
  const normalizedParent = path.normalize(parentDirectory);

  if (!normalizedWorktree.startsWith(normalizedParent)) {
    return { valid: false, reason: "Worktree must be within the project directory" };
  }

  return { valid: true };
}

export function createWorktreeModeHook(ctx: PluginInput) {
  const sessionStates = new Map<string, WorktreeSessionState>();
  const initializingSessions = new Map<string, Promise<WorktreeSessionState>>();
  const configCache = {
    global: null as WorktreeMode | null,
    project: null as WorktreeMode | null,
  };

  async function loadConfigMode(configPath: string, source: string): Promise<WorktreeMode> {
    try {
      if (fs.existsSync(configPath)) {
        const content = await fs.promises.readFile(configPath, "utf-8");
        const parsedData = parseYaml(content) as Record<string, unknown>;
        const parsed = v.parse(worktreeConfigSchema, parsedData);
        const mode = parsed.worktree?.defaultMode ?? WORKTREE_MODE.AUTO;
        log.debug("worktree-mode", `Loaded ${source} config: ${mode}`);
        return mode;
      }
    } catch (error: unknown) {
      const extra = error instanceof Error ? { name: error.name, message: error.message } : { error: String(error) };
      log.warn("worktree-mode", `Failed to load ${source} config`, extra);
    }
    return WORKTREE_MODE.AUTO;
  }

  async function getEffectiveDefaultMode(): Promise<WorktreeMode> {
    if (configCache.project === null) {
      configCache.project = await loadConfigMode(path.join(ctx.directory, CONFIG_PATHS.PROJECT), "project");
    }
    if (configCache.project !== WORKTREE_MODE.AUTO) return configCache.project;

    if (configCache.global === null) {
      configCache.global = await loadConfigMode(CONFIG_PATHS.GLOBAL, "global");
    }
    return configCache.global ?? WORKTREE_MODE.AUTO;
  }

  async function getSessionState(sessionID: string): Promise<WorktreeSessionState> {
    const existing = sessionStates.get(sessionID);
    if (existing) return existing;

    const initializing = initializingSessions.get(sessionID);
    if (initializing) return initializing;

    const initPromise = (async () => {
      const initialState: WorktreeSessionState = {
        mode: await getEffectiveDefaultMode(),
        userOverridden: false,
      };
      sessionStates.set(sessionID, initialState);
      initializingSessions.delete(sessionID);
      return initialState;
    })();

    initializingSessions.set(sessionID, initPromise);
    return initPromise;
  }

  return {
    setMode: async (sessionID: string, mode: WorktreeMode) => {
      const state = await getSessionState(sessionID);
      state.mode = mode;
      state.userOverridden = true;
    },

    getMode: (sessionID: string): WorktreeMode => {
      return sessionStates.get(sessionID)?.mode ?? WORKTREE_MODE.AUTO;
    },

    isWorktreeEnabled: (sessionID: string): boolean => {
      const state = sessionStates.get(sessionID);
      if (!state) return false;
      if (state.mode === WORKTREE_MODE.ON) return true;
      if (state.mode === WORKTREE_MODE.OFF) return false;
      return !!state.worktreePath;
    },

    getDelegationInstructions: (sessionID: string): string => {
      const state = sessionStates.get(sessionID);
      if (!state) return "";

      const isWorktree = state.mode === WORKTREE_MODE.ON || (state.mode === WORKTREE_MODE.AUTO && !!state.worktreePath);

      if (isWorktree) {
        return `
## WORKTREE MODE: ENABLED
### Status: ${state.userOverridden ? "User Override" : "Config/Auto"}

You MUST use spawn_agent + wait_for_agents for parallel delegation:
- Call spawn_agent multiple times in ONE message for parallel execution.
- Use wait_for_agents(sessionIDs=[...]) to collect results.
- Provide the ABSOLUTE FULL PATH of the worktree to subagents: ${state.worktreePath || ctx.directory}
- CRITICAL: Subagents MUST use these absolute paths for all file operations.
`;
      } else {
        return `
## WORKTREE MODE: DISABLED
### Status: ${state.userOverridden ? "User Override" : "Config/Auto"}

You MUST use the native Task tool for parallel delegation:
- Call Task(...) multiple times in ONE message for parallel execution.
- Task calls execute in parallel and return results immediately.
- No need for wait_for_agents - results are synchronous.
`;
      }
    },

    getToolsForSession: async (sessionID: string): Promise<{ spawn_agent: boolean; wait_for_agents?: boolean }> => {
      const s = await getSessionState(sessionID);
      const isWorktree = s.mode === WORKTREE_MODE.ON || (s.mode === WORKTREE_MODE.AUTO && !!s.worktreePath);
      return {
        spawn_agent: isWorktree,
        ...(isWorktree && { wait_for_agents: true }),
      };
    },

    event: async (input: { event: Event }) => {
      const { type } = input.event;

      if (type === "session.deleted") {
        const properties = input.event.properties as { info?: { id?: string } };
        const id = properties?.info?.id;
        if (id && typeof id === "string") {
          sessionStates.delete(id);
          initializingSessions.delete(id);
        }
      }
    },

    detectWorktreeTrigger: async (input: { sessionID: string }, output: ChatMessageOutput) => {
      const state = await getSessionState(input.sessionID);
      const text = (output.parts || [])
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ");

      if (text.includes("@worktree:off")) {
        state.mode = WORKTREE_MODE.OFF;
        state.userOverridden = true;
        await ctx.client.tui
          .showToast({
            body: { title: "Worktree Mode", message: "DISABLED (User Override)", variant: "info" },
          })
          .catch((err: unknown) => {
            const extra = err instanceof Error ? { name: err.name, message: err.message } : { error: String(err) };
            log.warn("worktree-mode", "Failed to show toast", extra);
          });
      } else if (text.includes("@worktree:on") || (/\B@worktree\b/.test(text) && !text.includes("@worktree:off"))) {
        state.mode = WORKTREE_MODE.ON;
        state.userOverridden = true;
        await ctx.client.tui
          .showToast({
            body: { title: "Worktree Mode", message: "ENABLED (User Override)", variant: "success" },
          })
          .catch((err: unknown) => {
            const extra = err instanceof Error ? { name: err.name, message: err.message } : { error: String(err) };
            log.warn("worktree-mode", "Failed to show toast", extra);
          });
      }

      const match = text.match(/root_directory=["'](.+?)["']/);
      if (match?.[1]) {
        const rawPath = match[1];
        const validation = isValidPath(rawPath);
        if (!validation.valid) {
          log.warn("worktree-mode", `Invalid worktree path rejected: ${validation.reason}`);
        } else {
          state.worktreePath = rawPath;
          if (!state.userOverridden) {
            state.mode = WORKTREE_MODE.ON;
          }
        }
      }
    },

    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, string | number | boolean | null | undefined | object> },
    ): Promise<{ error?: string }> => {
      const state = await getSessionState(input.sessionID);
      const toolName = input.tool.toLowerCase();

      if (!["write", "edit", "bash"].includes(toolName)) return { error: undefined };

      if (state.mode === WORKTREE_MODE.ON) {
        const filePath = (output.args?.filePath || output.args?.path) as string | undefined;
        const command = output.args?.command as string | undefined;

        if (command && toolName === "bash") {
          const worktreePath = state.worktreePath;
          if (worktreePath) {
            if (command.includes(".git") || command.includes(".opencode") || command.includes("inspo")) {
              return { error: `[S-TIER ENFORCEMENT ERROR] Command contains forbidden paths: ${command}` };
            }
          }
        }

        if (!filePath) return { error: undefined };

        const pathValidation = isValidPath(filePath);
        if (!pathValidation.valid) {
          log.warn("worktree-mode", `Path validation failed: ${pathValidation.reason}`);
          return { error: `[S-TIER ENFORCEMENT ERROR] Invalid path: ${pathValidation.reason}` };
        }

        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(ctx.directory, filePath);
        const worktreePath = state.worktreePath;

        if (worktreePath) {
          const worktreeValidation = isValidWorktreePath(worktreePath, ctx.directory);
          if (!worktreeValidation.valid) {
            log.warn("worktree-mode", `Worktree path validation failed: ${worktreeValidation.reason}`);
            return { error: `[S-TIER ENFORCEMENT ERROR] Invalid worktree configuration: ${worktreeValidation.reason}` };
          }

          if (isParentRepoPath(absolutePath, worktreePath)) {
            return {
              error: `[S-TIER ENFORCEMENT ERROR] Modification attempted on parent repository while in Worktree Mode.\nPath: ${absolutePath}\nWorktree: ${worktreePath}\n\nParent repository files are protected in worktree mode.`,
            };
          }

          if (!absolutePath.startsWith(worktreePath)) {
            return {
              error: `[S-TIER ENFORCEMENT ERROR] Modification attempted outside of active worktree.\nPath: ${absolutePath}\nWorktree: ${worktreePath}`,
            };
          }
        } else {
          return {
            error: `[S-TIER ENFORCEMENT ERROR] Worktree Mode is ENABLED but no active worktree root detected.`,
          };
        }
      }
      return { error: undefined };
    },

    cleanupSession: (sessionID: string) => {
      sessionStates.delete(sessionID);
      initializingSessions.delete(sessionID);
    },
  };
}
