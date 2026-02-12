import { describe, expect, it } from "bun:test";

describe("planner agent", () => {
  it("should use spawn_agent for subagent research", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/agents/planner.ts", "utf-8");

    expect(source).toContain("spawn_agent");
    expect(source).toContain("codebase-locator");
  });

  it("should have parallel research documentation", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/agents/planner.ts", "utf-8");

    expect(source).toContain("parallel");
  });

  it("should mention external documentation tools", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/agents/planner.ts", "utf-8");

    // The planner should mention external documentation sources
    expect(source).toContain("context7");
  });
});

describe("executor agent", () => {
  it("should emphasize synchronization point for wait_for_agents", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/agents/executor.ts", "utf-8");

    expect(source).toContain("synchronization");
  });
});
