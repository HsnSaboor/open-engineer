import type { AgentConfig } from "@opencode-ai/sdk";

const SYNC_TASK_PROTOCOL = `
<subagent-tools>
- **PARALLEL DELEGATION PROTOCOL**: Use the native Task tool with subagent_type matching the agent names (e.g., implementer, reviewer).
- **SYNC**: Task tool calls are synchronous - results are available immediately after each call completes.
- **PARALLELISM**: Opencode executes Task calls in parallel when called as a batch in ONE message.
</subagent-tools>
`;

const SYNC_EXECUTION_PATTERN = `
<execution-pattern>
Maximize throughput by spawning multiple independent subagents (implementers, reviewers) in parallel via multiple Task tool calls in ONE message. Results are available immediately.
</execution-pattern>
`;

function downgradeSwarmToTask(prompt: string): string {
  let transformed = prompt
    .replace(/<subagent-tools>[\s\S]+?<\/subagent-tools>/, SYNC_TASK_PROTOCOL)
    .replace(/<execution-pattern>[\s\S]+?<\/execution-pattern>/, SYNC_EXECUTION_PATTERN)
    .replace(
      /Available tools: spawn_agent \(async trigger\), wait_for_agents \(synchronization point\)\./,
      "Available tools: Task (synchronous subagent delegation).",
    )
    .replace(
      /\*\*ASYNCHRONOUS SWARM PROTOCOL\*\*[\s\S]+?collect results before moving to the next phase\./,
      SYNC_TASK_PROTOCOL,
    )
    .replace(
      /spawn_agent returns a SessionID immediately\. You MUST use wait_for_agents\(sessionIDs=\[\.\.\.\]\) to collect results/,
      "Task results are available immediately after the call completes",
    )
    .replace(/THEN,.*call wait_for_agents with their SessionIDs\./g, "Results are available immediately.")
    .replace(
      /Wait for this final session via wait_for_agents to confirm writing is complete\./,
      "Task results are available immediately.",
    )
    // Remove wait_for_agents synchronization steps in workflow or process
    .replace(/\s*<step>.*wait_for_agents.*<\/step>/g, "")
    .replace(/\s*\d+\.\s*THEN,.*call wait_for_agents.*?\n/g, "\n")
    // Convert spawn_agent calls to Task calls
    .replace(/spawn_agent\(agent='(.+?)',/g, "Task(subagent_type='$1',")
    .replace(/call spawn_agent (\d+) times/g, "call Task $1 times")
    .replace(/call spawn_agent once/g, "call Task once")
    .replace(/NEVER fire the parallel swarm/g, "NEVER fire parallel delegation via multiple Task calls")
    .replace(/ALWAYS fire the parallel swarm/g, "ALWAYS fire parallel delegation via multiple Task calls")
    .replace(/- Always use spawn_agent for parallel execution/g, "- Always use Task for parallel delegation")
    .replace(
      /- ALWAYS use wait_for_agents to synchronize and collect parallel results/g,
      "- Task results are available immediately after the call completes",
    );

  // Re-index workflow steps
  let stepCount = 1;
  transformed = transformed.replace(/<step>\d+\./g, () => `<step>${stepCount++}.`);

  return transformed;
}

export function applyWorktreeMode(
  agents: Record<string, AgentConfig>,
  worktreeMode: boolean,
): Record<string, AgentConfig> {
  if (worktreeMode !== false) return agents;

  const transformed: Record<string, AgentConfig> = {};

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

  for (const agentName in agents) {
    const originalAgent = agents[agentName];
    const agent = { ...originalAgent };
    transformed[agentName] = agent;

    if (!agent.prompt) continue;

    // Detect and Downgrade Swarm Controllers
    if (agent.tools?.spawn_agent === true) {
      agent.tools = { ...agent.tools, spawn_agent: false, wait_for_agents: false };
      agent.prompt = downgradeSwarmToTask(agent.prompt);
    }

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
