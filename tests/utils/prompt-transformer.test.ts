import { describe, expect, it } from "bun:test";

import type { AgentConfig } from "@opencode-ai/sdk";

import { applyWorktreeMode } from "../../src/utils/prompt-transformer";

describe("prompt-transformer", () => {
  const mockExecutor: AgentConfig = {
    tools: {
      spawn_agent: true,
      wait_for_agents: true,
    },
    prompt: `
<subagent-tools>
CRITICAL: You MUST use the spawn_agent tool to spawn implementers and reviewers.
**ASYNCHRONOUS SWARM PROTOCOL**: spawn_agent returns a SessionID immediately. You MUST use wait_for_agents(sessionIDs=[...]) to collect results from the parallel swarm.
</subagent-tools>

<workflow>
  <step>1. spawn_agent(agent='implementer', ...) for ALL tasks in batch (in ONE message)</step>
  <step>2. wait_for_agents(sessionIDs=[...]) to synchronize</step>
</workflow>

<execution-pattern>
Maximize parallelism by calling multiple spawn_agent tools in one message:
1. Fire all implementers as spawn_agent calls in ONE message (Parallel Swarm)
</execution-pattern>
    `,
  };

  const mockAgents: Record<string, AgentConfig> = {
    executor: mockExecutor,
  };

  it("should downgrade executor swarm protocol when worktreeMode is false", () => {
    const transformed = applyWorktreeMode(mockAgents, false);
    const executor = transformed.executor;

    expect(executor.tools?.spawn_agent).toBe(false);
    expect(executor.tools?.wait_for_agents).toBe(false);

    expect(executor.prompt).toContain("<subagent-tools>");
    expect(executor.prompt).toContain("PARALLEL DELEGATION PROTOCOL");
    expect(executor.prompt).toContain("Task(subagent_type='implementer'");
    expect(executor.prompt).not.toContain("wait_for_agents");
    expect(executor.prompt).toContain("<step>1. Task(subagent_type='implementer'");

    // Check re-indexing
    expect(executor.prompt).toContain("<step>1.");
    expect(executor.prompt).not.toContain("<step>2."); // Should be removed because it was a wait step
  });

  it("should not modify agents when worktreeMode is true", () => {
    const transformed = applyWorktreeMode(mockAgents, true);
    expect(transformed.executor.tools?.spawn_agent).toBe(true);
    expect(transformed.executor.prompt).toContain("spawn_agent tool");
  });
});
