import * as path from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";

/**
 * WorktreeEnforcerHook
 *
 * Ensures that file modifications (write/edit) occur within the designated
 * git worktree when Open-Engineer is in worktree mode.
 */
export function createWorktreeEnforcerHook(ctx: PluginInput) {
  // Store the active worktree root for the current session
  // This is set when the Commander creates a worktree
  const activeWorktrees = new Map<string, string>();

  return {
    "tool.execute.before": async (input: { tool: string; sessionID: string; args?: Record<string, unknown> }) => {
      const toolName = input.tool.toLowerCase();

      // We only care about tools that modify files
      if (!["write", "edit"].includes(toolName)) {
        return;
      }

      const filePath = input.args?.filePath as string | undefined;
      if (!filePath) return;

      // Resolve absolute path
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(ctx.directory, filePath);

      // Check if this session has an active worktree
      // We'll look for a specific marker or context in the session
      // For now, we'll assume the Commander sets an environment variable or
      // we detect the worktree root from the session history.
      // IMPLEMENTATION DETAIL: Agents are now instructed to include
      // the worktree root in their 'Context Package'.

      const worktreeRoot = activeWorktrees.get(input.sessionID);

      if (worktreeRoot) {
        // Enforce that the path is INSIDE the worktree
        if (!absolutePath.startsWith(worktreeRoot)) {
          return {
            error:
              `[S-TIER ENFORCEMENT ERROR] Modification attempted on main branch while in Worktree Mode.\n` +
              `Attempted path: ${absolutePath}\n` +
              `Active worktree: ${worktreeRoot}\n\n` +
              `ACTION REQUIRED: Use the absolute path within the worktree directory. ` +
              `Never modify the main branch directly during a sandboxed task.`,
          };
        }
      } else {
        // If not in worktree mode, check if we SHOULD be
        // (e.g., if .worktrees directory exists and it's a non-trivial change)
        // This is a soft check to remind the agent to use worktrees.
      }
    },

    "chat.message": async (
      _input: { sessionID: string },
      output: { parts: Array<{ type: string; text?: string }> },
    ) => {
      // Look for the worktree root in the agent's output/decisions
      // to track which session is using which worktree
      for (const part of output.parts) {
        if (part.type === "text" && part.text) {
          const match = part.text.match(/root_directory=["'](.+?\.worktrees\/agent-.+?)["']/);
          if (match) {
            activeWorktrees.set(_input.sessionID, match[1]);
          }
        }
      }
    },
  };
}
