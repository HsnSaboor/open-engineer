import { beforeEach, describe, expect, it } from "bun:test";

import { createWorktreeModeHook } from "../../src/hooks/worktree-mode";

/**
 * Create a minimal mock PluginInput context for testing.
 */
function createMockCtx(directory = "/tmp/test-project") {
  return {
    directory,
    client: {
      tui: {
        showToast: async () => {},
      },
      session: {
        create: async () => ({ data: { id: "mock-session" } }),
        messages: async () => ({ data: [] }),
        promptAsync: async () => {},
      },
    },
  } as any;
}

describe("worktree-mode hook — parent chain propagation (Bug 1 & 2)", () => {
  let hook: ReturnType<typeof createWorktreeModeHook>;
  const parentMap = new Map<string, string>(); // childID -> parentID

  beforeEach(() => {
    parentMap.clear();
    hook = createWorktreeModeHook(createMockCtx());
    hook.setParentResolver((sessionID: string) => parentMap.get(sessionID));
  });

  describe("setParentResolver", () => {
    it("should accept a parent resolver function", () => {
      expect(() => {
        hook.setParentResolver((id: string) => undefined);
      }).not.toThrow();
    });
  });

  describe("getEffectiveMode", () => {
    it("should return AUTO for unknown sessions by default", () => {
      const mode = hook.getEffectiveMode("unknown-session");
      expect(mode).toBe("AUTO");
    });

    it("should return direct mode when session has explicit OFF override", async () => {
      await hook.setMode("session-1", "OFF");
      const mode = hook.getEffectiveMode("session-1");
      expect(mode).toBe("OFF");
    });

    it("should return direct mode when session has explicit ON override", async () => {
      await hook.setMode("session-1", "ON");
      const mode = hook.getEffectiveMode("session-1");
      expect(mode).toBe("ON");
    });

    it("should inherit OFF from parent session (commander -> executor)", async () => {
      // Commander session has @worktree:off
      await hook.setMode("commander-session", "OFF");

      // Executor is a child of commander
      parentMap.set("executor-session", "commander-session");

      // Executor session has no explicit mode set (defaults to AUTO)
      const mode = hook.getEffectiveMode("executor-session");
      expect(mode).toBe("OFF");
    });

    it("should inherit ON from parent session (commander -> executor)", async () => {
      // Commander session has @worktree:on
      await hook.setMode("commander-session", "ON");

      // Executor is a child of commander
      parentMap.set("executor-session", "commander-session");

      // Executor should inherit ON
      const mode = hook.getEffectiveMode("executor-session");
      expect(mode).toBe("ON");
    });

    it("should walk multiple levels (commander -> executor -> implementer)", async () => {
      // Commander has @worktree:off
      await hook.setMode("commander-session", "OFF");

      // Executor is child of commander
      parentMap.set("executor-session", "commander-session");

      // Implementer is child of executor (grandchild of commander)
      parentMap.set("implementer-session", "executor-session");

      // Implementer should inherit OFF from commander (2 levels up)
      const mode = hook.getEffectiveMode("implementer-session");
      expect(mode).toBe("OFF");
    });

    it("should return AUTO when no ancestor has user override", async () => {
      // Commander has no explicit override
      parentMap.set("executor-session", "commander-session");

      const mode = hook.getEffectiveMode("executor-session");
      expect(mode).toBe("AUTO");
    });

    it("should handle orphan sessions (no parent) gracefully", () => {
      // No parent registered for this session
      const mode = hook.getEffectiveMode("orphan-session");
      expect(mode).toBe("AUTO");
    });

    it("should prevent infinite cycles in parent chain", async () => {
      // Create a cycle: A -> B -> A
      parentMap.set("session-a", "session-b");
      parentMap.set("session-b", "session-a");

      // Should not hang — cycle detection breaks out
      const mode = hook.getEffectiveMode("session-a");
      expect(mode).toBe("AUTO");
    });

    it("should prefer direct mode over parent mode", async () => {
      // Commander has OFF
      await hook.setMode("commander-session", "OFF");

      // Executor explicitly has ON set
      await hook.setMode("executor-session", "ON");

      parentMap.set("executor-session", "commander-session");

      // Executor's direct ON should take precedence over parent's OFF
      const mode = hook.getEffectiveMode("executor-session");
      expect(mode).toBe("ON");
    });

    it("should work without a parent resolver (fallback to direct mode)", async () => {
      // Create a fresh hook without setting a parent resolver
      const freshHook = createWorktreeModeHook(createMockCtx());
      // Don't call setParentResolver

      await freshHook.setMode("session-1", "OFF");
      expect(freshHook.getEffectiveMode("session-1")).toBe("OFF");

      // Unknown session should return AUTO
      expect(freshHook.getEffectiveMode("unknown")).toBe("AUTO");
    });
  });

  describe("detectWorktreeTrigger sets mode that propagates to children", () => {
    it("should set OFF on commander session via @worktree:off trigger", async () => {
      await hook.detectWorktreeTrigger(
        { sessionID: "commander-session" },
        { parts: [{ type: "text", text: "do this task @worktree:off" }] },
      );

      expect(hook.getMode("commander-session")).toBe("OFF");

      // Child should inherit OFF
      parentMap.set("executor-session", "commander-session");
      expect(hook.getEffectiveMode("executor-session")).toBe("OFF");
    });

    it("should set ON on commander session via @worktree:on trigger", async () => {
      await hook.detectWorktreeTrigger(
        { sessionID: "commander-session" },
        { parts: [{ type: "text", text: "do this task @worktree:on" }] },
      );

      expect(hook.getMode("commander-session")).toBe("ON");

      // Child should inherit ON
      parentMap.set("executor-session", "commander-session");
      expect(hook.getEffectiveMode("executor-session")).toBe("ON");
    });
  });

  describe("getDelegationInstructions", () => {
    it("should return DISABLED instructions when mode is OFF", async () => {
      await hook.setMode("session-1", "OFF");

      const instructions = hook.getDelegationInstructions("session-1");
      expect(instructions).toContain("WORKTREE MODE: DISABLED");
      expect(instructions).toContain("Task tool");
    });

    it("should return ENABLED instructions when mode is ON", async () => {
      await hook.setMode("session-1", "ON");

      const instructions = hook.getDelegationInstructions("session-1");
      expect(instructions).toContain("WORKTREE MODE: ENABLED");
      expect(instructions).toContain("spawn_agent");
    });

    it("should return empty string for unknown sessions", () => {
      const instructions = hook.getDelegationInstructions("unknown-session");
      expect(instructions).toBe("");
    });
  });

  describe("getToolsForSession", () => {
    it("should disable spawn_agent when mode is OFF", async () => {
      await hook.setMode("session-1", "OFF");
      const tools = await hook.getToolsForSession("session-1");
      expect(tools.spawn_agent).toBe(false);
      expect(tools.wait_for_agents).toBeUndefined();
    });

    it("should enable spawn_agent when mode is ON", async () => {
      await hook.setMode("session-1", "ON");
      const tools = await hook.getToolsForSession("session-1");
      expect(tools.spawn_agent).toBe(true);
      expect(tools.wait_for_agents).toBe(true);
    });
  });

  describe("cleanupSession", () => {
    it("should remove session state", async () => {
      await hook.setMode("session-1", "OFF");
      expect(hook.getMode("session-1")).toBe("OFF");

      hook.cleanupSession("session-1");
      expect(hook.getMode("session-1")).toBe("AUTO"); // defaults to AUTO when not found
    });
  });
});

describe("worktree-mode — spawn_agent blocking in index.ts (Bug 2)", () => {
  describe("source code structural verification", () => {
    it("should block spawn_agent when effective worktree mode is OFF", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/index.ts", "utf-8");

      // Must check effective mode before allowing spawn_agent
      expect(source).toContain("getEffectiveMode");
      expect(source).toContain('input.tool === "spawn_agent"');
      // Must reference OFF mode for blocking
      expect(source).toContain('"OFF"');
    });

    it("should wire parent resolver from swarmManager into worktreeModeHook", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/index.ts", "utf-8");

      // Must call setParentResolver with swarmManager.getParentID
      expect(source).toContain("setParentResolver");
      expect(source).toContain("swarmManager.getParentID");
    });

    it("should use getEffectiveMode in experimental.chat.system.transform", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/index.ts", "utf-8");

      // The system.transform hook must use getEffectiveMode, not just getMode
      expect(source).toContain("getEffectiveMode");
      // Should inject instructions about worktree mode
      expect(source).toContain("Worktree Mode is DISABLED");
    });

    it("should inject spawn_agent blocked message for OFF mode subagents", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/index.ts", "utf-8");

      // Subagents with inherited OFF should be told spawn_agent is blocked
      expect(source).toContain("spawn_agent");
      expect(source).toContain("blocked");
    });
  });
});

describe("worktree-mode — prompt-transformer applyWorktreeMode", () => {
  it("should downgrade executor spawn_agent when worktreeMode is false", async () => {
    const { applyWorktreeMode } = await import("../../src/utils/prompt-transformer");

    const agents = {
      executor: {
        tools: { spawn_agent: true, wait_for_agents: true },
        prompt: `
<subagent-tools>
Use spawn_agent to spawn implementers.
</subagent-tools>
<execution-pattern>
Call spawn_agent for parallel execution.
</execution-pattern>
        `,
      },
    };

    const result = applyWorktreeMode(agents as any, false);
    expect(result.executor.tools?.spawn_agent).toBe(false);
    expect(result.executor.tools?.wait_for_agents).toBe(false);
  });

  it("should NOT downgrade executor when worktreeMode is true", async () => {
    const { applyWorktreeMode } = await import("../../src/utils/prompt-transformer");

    const agents = {
      executor: {
        tools: { spawn_agent: true, wait_for_agents: true },
        prompt: "Use spawn_agent to spawn implementers.",
      },
    };

    const result = applyWorktreeMode(agents as any, true);
    expect(result.executor.tools?.spawn_agent).toBe(true);
    expect(result.executor.tools?.wait_for_agents).toBe(true);
  });
});
