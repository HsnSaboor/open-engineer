import * as path from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";

export type WorktreeMode = "ON" | "OFF" | "PENDING" | "AUTO";

interface SessionState {
  mode: WorktreeMode;
  activeWorktreeRoot?: string;
  questionRequestID?: string;
}

/**
 * WorktreeEnforcerHook
 *
 * Ensures that file modifications (write/edit) occur within the designated
 * git worktree when Open-Engineer is in worktree mode.
 * Supports event-driven preference tracking via the native question tool.
 */
export function createWorktreeEnforcerHook(ctx: PluginInput, defaultMode: boolean = true) {
  const sessionStates = new Map<string, SessionState>();

  function getSessionState(sessionID: string): SessionState {
    if (!sessionStates.has(sessionID)) {
      sessionStates.set(sessionID, {
        mode: defaultMode ? "AUTO" : "OFF",
      });
    }
    return sessionStates.get(sessionID)!;
  }

  return {
    setMode: (sessionID: string, mode: WorktreeMode) => {
      const state = getSessionState(sessionID);
      state.mode = mode;
    },

    getMode: (sessionID: string) => {
      return getSessionState(sessionID).mode;
    },

    event: async (input: { event: any }) => {
      const { type, properties } = input.event;

      // Listen for the native question tool response
      if (type === "question.replied") {
        const sessionID = properties?.sessionID;
        if (!sessionID) return;

        const state = getSessionState(sessionID);
        const answers = properties?.answers as string[][] | undefined;

        // Check if this reply is for a worktree preference question
        const flatAnswers = (answers || []).flat().map((a) => a.toLowerCase());

        if (flatAnswers.includes("🛡️ sandbox") || flatAnswers.includes("yes (sandbox)")) {
          state.mode = "ON";
        } else if (flatAnswers.includes("🚀 direct") || flatAnswers.includes("no (direct)")) {
          state.mode = "OFF";
        }
      }
    },

    "chat.message": async (input: { sessionID: string }, output: { parts: Array<{ type: string; text?: string }> }) => {
      const state = getSessionState(input.sessionID);
      const text = (output.parts || [])
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ");

      // Handshake: Detect if the agent has set a worktree root
      const match = text.match(/root_directory=["'](.+?)["']/);
      if (match) {
        state.activeWorktreeRoot = match[1];
        state.mode = "ON";
      }
    },

    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ) => {
      const state = getSessionState(input.sessionID);
      const toolName = input.tool.toLowerCase();

      if (!["write", "edit"].includes(toolName)) return;

      // Strict enforcement for Worktree Mode
      if (state.mode === "ON") {
        const filePath = output.args?.filePath as string | undefined;
        if (!filePath) return;

        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(ctx.directory, filePath);
        const worktreeRoot = state.activeWorktreeRoot;

        if (worktreeRoot) {
          if (!absolutePath.startsWith(worktreeRoot)) {
            return {
              error:
                `[S-TIER ENFORCEMENT ERROR] Modification attempted on main branch while in Worktree Mode.\n` +
                `Attempted path: ${absolutePath}\n` +
                `Active worktree: ${worktreeRoot}\n\n` +
                `ACTION REQUIRED: Use the absolute path within the worktree directory.`,
            };
          }
        } else {
          return {
            error:
              `[S-TIER ENFORCEMENT ERROR] Worktree Mode is ENABLED but no active worktree root detected.\n` +
              `ACTION REQUIRED: You MUST create a git worktree (e.g. via bash) before modifying files.`,
          };
        }
      }
    },
  };
}
