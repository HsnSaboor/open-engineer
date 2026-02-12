import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";

import { createWisdomTools } from "../../src/tools/wisdom/extract-antipatterns";

const TEST_DIR = join(process.cwd(), "tests/temp_wisdom");

describe("extract_antipatterns", () => {
  beforeAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("creates file and appends antipattern", async () => {
    const ctx = { directory: TEST_DIR } as unknown as PluginInput;
    const { extract_antipatterns: extractAntipatternsTool } = createWisdomTools(ctx);

    // Mock ToolContext
    const toolCtx = { sessionID: "test", metadata: () => {} } as any;

    const result = await extractAntipatternsTool.execute(
      {
        category: "Testing",
        name: "Shallow Tests",
        context: "Writing unit tests",
        failure: "Bugs slip through",
        fix: "Write deep tests",
        badExample: "expect(true).toBe(true)",
        goodExample: "expect(complexLogic()).toBe(correctState)",
      },
      toolCtx,
    );

    expect(result).toContain("Successfully recorded antipattern");

    const filePath = join(TEST_DIR, ".mindmodel/ANTIPATTERNS.md");
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("## [Testing]");
    expect(content).toContain("### Shallow Tests");
    expect(content).toContain("// BAD");
  });
});
