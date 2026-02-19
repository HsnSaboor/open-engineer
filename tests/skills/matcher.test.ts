import { describe, expect, it } from "bun:test";

import type { SkillIndex } from "../../src/skills/indexer";
import { SkillMatcher } from "../../src/skills/matcher";
import {
  buildSkillSelectionPrompt,
  parseFrontmatter,
  parseLLMResponse,
  stripFrontmatter,
} from "../../src/skills/utils";

describe("parseFrontmatter", () => {
  it("parses basic frontmatter", () => {
    const content = `---
name: test-skill
description: A test skill for testing
tags: [test, example]
---
# Content here`;

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("test-skill");
    expect(result?.description).toBe("A test skill for testing");
    expect(result?.tags).toEqual(["test", "example"]);
  });

  it("parses multiline description", () => {
    const content = `---
name: multiline-skill
description: |
  This is a multiline
  description that spans
  multiple lines.
tags: [multiline]
---
Content`;

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.description).toContain("multiline");
  });

  it("returns null for missing required fields", () => {
    const content = `---
name: incomplete-skill
tags: [test]
---
Content`;

    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });

  it("returns null for missing frontmatter", () => {
    const content = "No frontmatter here";
    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });
});

describe("stripFrontmatter", () => {
  it("removes frontmatter from content", () => {
    const content = `---
name: test
description: test
---
# Real content
More content here`;

    const result = stripFrontmatter(content);
    expect(result).not.toContain("---");
    expect(result).toContain("Real content");
  });
});

describe("SkillMatcher", () => {
  const mockIndex: SkillIndex = {
    version: 3,
    generatedAt: new Date().toISOString(),
    skills: [
      {
        name: "react-components",
        description: "Create React components with hooks",
        tags: ["react", "frontend"],
        shortDesc: "React components",
        location: "/test",
      },
      {
        name: "vue-setup",
        description: "Setup Vue.js project with composition API",
        tags: ["vue", "frontend"],
        shortDesc: "Vue setup",
        location: "/test",
      },
      {
        name: "debugging",
        description: "Debug and fix bugs in code",
        tags: ["debug", "testing"],
        shortDesc: "Debugging",
        location: "/test",
      },
    ],
  };

  it("matches by exact name", async () => {
    const matcher = new SkillMatcher(mockIndex);
    const results = await matcher.match("react-components");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.skillName).toBe("react-components");
    expect(results[0]?.score).toBe(1.0);
  });

  it("matches by description keywords", async () => {
    const matcher = new SkillMatcher(mockIndex);
    const results = await matcher.match("fix bugs in my code");

    const debugMatch = results.find((r) => r.skillName === "debugging");
    expect(debugMatch).toBeDefined();
  });

  it("matches by tags", async () => {
    const matcher = new SkillMatcher(mockIndex);
    const results = await matcher.match("vue");

    const vueMatch = results.find((r) => r.skillName === "vue-setup");
    expect(vueMatch).toBeDefined();
  });

  it("respects maxResults", async () => {
    const matcher = new SkillMatcher(mockIndex, { maxResults: 2 });
    const results = await matcher.match("frontend react vue");
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("filters by threshold", async () => {
    const matcher = new SkillMatcher(mockIndex, { threshold: 0.5 });
    const results = await matcher.matchWithThreshold("react-components");
    expect(results.every((r) => r.score >= 0.5)).toBe(true);
  });
});

describe("buildSkillSelectionPrompt", () => {
  it("builds prompt with skills", () => {
    const skills = [
      { name: "skill-1", description: "First skill", tags: ["a", "b"] },
      { name: "skill-2", description: "Second skill", tags: ["c"] },
    ];

    const prompt = buildSkillSelectionPrompt(skills, "test query", 3);

    expect(prompt).toContain("skill-1");
    expect(prompt).toContain("skill-2");
    expect(prompt).toContain("test query");
  });
});

describe("parseLLMResponse", () => {
  it("parses valid JSON response", () => {
    const response = `Here are the matches:
{
  "matches": [
    {"skill": "react-components", "score": 0.9, "reason": "direct match"},
    {"skill": "debugging", "score": 0.5, "reason": "might help"}
  ]
}`;

    const results = parseLLMResponse(response);

    expect(results.length).toBe(2);
    expect(results[0]?.skill).toBe("react-components");
    expect(results[0]?.score).toBe(0.9);
  });

  it("returns empty array for invalid JSON", () => {
    const results = parseLLMResponse("not valid json");
    expect(results).toEqual([]);
  });

  it("clamps scores to valid range", () => {
    const response = `{
      "matches": [
        {"skill": "test", "score": 1.5, "reason": "too high"},
        {"skill": "test2", "score": -0.5, "reason": "too low"}
      ]
    }`;

    const results = parseLLMResponse(response);

    expect(results[0]?.score).toBe(1.0);
    expect(results[1]?.score).toBe(0.0);
  });
});
