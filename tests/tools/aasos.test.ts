import { describe, expect, it, mock } from "bun:test";

import { createSpawnAgentTool } from "../../src/tools/spawn-agent";
import { createWaitForAgentsTool } from "../../src/tools/wait-for-agents";

describe("AASO (Asynchronous Agent Swarm Orchestration)", () => {
  const mockCtx: any = {
    directory: "/test",
    client: {
      session: {
        messages: mock(async () => ({ data: [] })),
        create: mock(async () => ({ data: { id: "sub-123" } })),
        promptAsync: mock(async () => {}),
        status: mock(async () => ({
          data: {
            "sub-123": { type: "idle" },
          },
        })),
        delete: mock(async () => {}),
      },
    },
  };

  it("spawn_agent should call promptAsync and return sessionID", async () => {
    const spawnAgent = createSpawnAgentTool(mockCtx);
    const result = await spawnAgent.execute(
      {
        agent: "explorer",
        prompt: "Find something",
        description: "Test task",
      },
      { sessionID: "parent-1", messageID: "msg-1" } as any,
    );

    expect(mockCtx.client.session.create).toHaveBeenCalled();
    expect(mockCtx.client.session.promptAsync).toHaveBeenCalled();
    expect(result).toContain("**SessionID**: sub-123");
  });

  it("wait_for_agents should poll until idle and return results", async () => {
    const waitForAgents = createWaitForAgentsTool(mockCtx);

    // Simulate polling: 1st call busy, 2nd call idle
    let callCount = 0;
    mockCtx.client.session.status = mock(async () => {
      callCount++;
      return {
        data: {
          "sub-123": { type: callCount === 1 ? "busy" : "idle" },
        },
      };
    });

    // Setup mock results for messages
    mockCtx.client.session.messages = mock(async () => ({
      data: [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Task completed successfully" }],
        },
      ],
    }));

    const result = await waitForAgents.execute(
      {
        sessionIDs: ["sub-123"],
        timeoutMs: 5000,
      },
      { sessionID: "parent-1", messageID: "msg-2" } as any,
    );

    expect(mockCtx.client.session.status).toHaveBeenCalledTimes(2);
    expect(mockCtx.client.session.messages).toHaveBeenCalledWith({
      path: { id: "sub-123" },
      query: { directory: "/test" },
    });
    expect(result).toContain("Task completed successfully");
  });

  it("wait_for_agents should timeout if session stays busy", async () => {
    const waitForAgents = createWaitForAgentsTool(mockCtx);

    // Always busy
    mockCtx.client.session.status = mock(async () => ({
      data: {
        "sub-123": { type: "busy" },
      },
    }));

    const result = await waitForAgents.execute(
      {
        sessionIDs: ["sub-123"],
        timeoutMs: 500, // Short timeout
      },
      { sessionID: "parent-1", messageID: "msg-3" } as any,
    );

    expect(result).toContain("wait_for_agents Timeout");
  });
});
