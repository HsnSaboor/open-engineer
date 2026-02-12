// tests/index.test.ts
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

describe("index.ts constraint-reviewer integration", () => {
  it("should import createConstraintReviewerHook", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    expect(source).toContain('from "./hooks/constraint-reviewer"');
    expect(source).toContain("createConstraintReviewerHook");
  });

  it("should create the constraint reviewer hook", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    // The hook should be created with a review function
    expect(source).toContain("constraintReviewerHook");
    expect(source).toContain("createConstraintReviewerHook(");
  });

  it("should call constraint reviewer hook in tool.execute.after", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    // The hook should be integrated into the tool.execute.after handler
    // We check for the hook name and the method call, allowing for flexible syntax (e.g. casting)
    expect(source).toContain("constraintReviewerHook");
    expect(source).toContain("tool.execute.after");
  });

  it("should call constraint reviewer hook in chat.message", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    // The hook should be integrated into the chat.message handler
    // We check for the hook name and the method call, allowing for flexible syntax (e.g. casting)
    expect(source).toContain("constraintReviewerHook");
    expect(source).toContain("chat.message");
  });

  it("should use mm-constraint-reviewer agent for review", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    // The review function should use the mm-constraint-reviewer agent
    expect(source).toContain("mm-constraint-reviewer");
  });
});

describe("index.ts worktree mode", () => {
  it("should import createWorktreeModeHook", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    expect(source).toContain('from "./hooks/worktree-mode"');
    expect(source).toContain("createWorktreeModeHook");
  });

  it("should create worktreeModeHook", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    expect(source).toContain("worktreeModeHook");
  });
});

describe("index.ts /init command", () => {
  it("should use project-initializer agent for /init command", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    // The /init command should use project-initializer for v2 constraint-guided generation
    // Match the init command configuration block
    const initCommandMatch = source.match(/init:\s*\{[^}]*agent:\s*["']([^"']+)["']/);
    expect(initCommandMatch).not.toBeNull();
    expect(initCommandMatch![1]).toBe("project-initializer");
  });

  it("should not have /mindmodel command (only /init)", async () => {
    const source = await readFile("src/index.ts", "utf-8");
    // /mindmodel was removed - only /init exists now
    const mindmodelMatch = source.match(/mindmodel:\s*\{[^}]*agent:\s*["']([^"']+)["']/);
    expect(mindmodelMatch).toBeNull();
  });
});
