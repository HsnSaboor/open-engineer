import * as v from "valibot";

/**
 * Worktree mode constants
 */
export const WORKTREE_MODE = {
  ON: "ON",
  OFF: "OFF",
  AUTO: "AUTO",
} as const;

export type WorktreeMode = (typeof WORKTREE_MODE)[keyof typeof WORKTREE_MODE];

/**
 * Validation schemas for configuration
 */
export const worktreeConfigSchema = v.object({
  worktree: v.optional(
    v.object({
      defaultMode: v.optional(v.enum_(WORKTREE_MODE), WORKTREE_MODE.AUTO),
    }),
  ),
});

export type WorktreeConfig = v.InferOutput<typeof worktreeConfigSchema>;

export interface WorktreeSessionState {
  mode: WorktreeMode;
  worktreePath?: string;
  userOverridden?: boolean;
}
