import type { AgentConfig } from "@opencode-ai/sdk";

export function applyWorktreeMode(
  agents: Record<string, AgentConfig>,
  worktreeMode: boolean,
): Record<string, AgentConfig> {
  if (worktreeMode !== false) return agents;

  const transformed = { ...agents };

  const NON_WORKTREE_PROTOCOL = `
- **PROJECT ROOT PROTOCOL**: You are working directly in the project root.
- **ISOLATION BY CONTEXT**: Since worktrees are disabled, you must maintain isolation by only modifying files defined in your gated context.
- **PARALLEL SAFETY**: The Planner must ensure that parallel tasks in the same batch do NOT modify the same files.
- **CRITICAL HANDSHAKE**: Immediately after starting a major task, you MUST output:
  "Active project root registered: root_directory='[ABSOLUTE_PATH_TO_PROJECT]'"
  (This enables the security sandbox hook).
`;

  const NON_WORKTREE_SAFETY = `
- **PARALLEL FILE SAFETY**: Since worktrees are disabled, you MUST NOT assign the same file to different tasks in the same wave or batch.
- **BATCHING STRATEGY**: Each batch must consist of tasks that modify mutually exclusive sets of files to avoid Git lock conflicts and implementation collisions.
`;

  for (const agentName in transformed) {
    const agent = transformed[agentName];
    if (!agent.prompt) continue;

    // Replace Worktree Protocol in Commander
    if (agentName === "commander") {
      agent.prompt = agent.prompt.replace(
        /- \*\*WORKTREE PROTOCOL\*\*[\s\S]+?Subagents MUST use these absolute paths for all file operations\./,
        NON_WORKTREE_PROTOCOL,
      );
    }

    // Replace worktree references in all agents
    agent.prompt = agent.prompt
      .replace(/in a worktree/g, "directly in the project root")
      .replace(/inside a git worktree/g, "directly in the project root")
      .replace(/inside the worktree root/g, "inside the project root")
      .replace(/worktree execution root/g, "project execution root")
      .replace(/verify the worktree root is valid/gi, "verify the project root is valid")
      .replace(/sandbox worktree/g, "project root")
      .replace(/provided worktree root/g, "project root")
      .replace(/Worktree aware/gi, "Project root aware")
      .replace(
        /Active worktree registered: root_directory='\[ABSOLUTE_PATH_TO_WORKTREE\]'/g,
        "Active project root registered: root_directory='[ABSOLUTE_PATH_TO_PROJECT]'",
      )
      .replace(/\[ABSOLUTE_PATH_TO_WORKTREE\]/g, "[ABSOLUTE_PATH_TO_PROJECT]");

    // Add safety rules to planner
    if (agentName === "planner") {
      agent.prompt += NON_WORKTREE_SAFETY;
    }
  }

  return transformed;
}
