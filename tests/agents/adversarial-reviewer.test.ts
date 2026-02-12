import { describe, expect, test } from "bun:test";

import { adversarialReviewerAgent } from "../../src/agents/adversarial-reviewer";

describe("adversarialReviewerAgent", () => {
  test("has correct configuration", () => {
    expect(adversarialReviewerAgent.mode).toBe("subagent");
    expect(adversarialReviewerAgent.temperature).toBe(0.7);
    expect(adversarialReviewerAgent.prompt).toContain("ADVERSARIAL REVIEWER");
    expect(adversarialReviewerAgent.prompt).toContain("PROVE THE IMPLEMENTATION WRONG");
  });
});
