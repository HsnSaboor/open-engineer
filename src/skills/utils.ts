import { parse as parseYaml } from "yaml";

const MAX_QUERY_LENGTH = 2000;

export interface ParsedFrontmatter {
  name: string;
  description: string;
  tags?: string[];
  [key: string]: unknown;
}

export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  try {
    const parsed = parseYaml(match[1]);
    if (!parsed || typeof parsed !== "object") return null;

    const data = parsed as Record<string, unknown>;

    if (typeof data.name !== "string" || typeof data.description !== "string") {
      return null;
    }

    return {
      name: data.name,
      description: data.description,
      tags: Array.isArray(data.tags) ? data.tags : [],
      ...data,
    };
  } catch {
    return null;
  }
}

export function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

export class AsyncMutex {
  private promise: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.promise;
    let release: () => void;
    this.promise = new Promise((resolve) => {
      release = resolve;
    });

    await current;

    try {
      return await fn();
    } finally {
      release!();
    }
  }
}

export function sanitizeQuery(query: string): string {
  return query
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function buildSkillSelectionPrompt(
  skills: Array<{ name: string; description: string; tags: string[] }>,
  context: string,
  maxSkills: number = 5,
): string {
  const skillList = skills.map((s) => `- ${s.name}: ${s.description} [${s.tags.join(", ")}]`).join("\n");

  return `You are a skill matcher. Given a user query, select the most relevant skills.

USER QUERY:
${context}

AVAILABLE SKILLS:
${skillList}

TASK: Select up to ${maxSkills} skills that would help complete the task. Rate each match from 0.0 to 1.0.

OUTPUT (JSON only, no explanation):
{
  "matches": [
    {"skill": "skill-name", "score": 0.85, "reason": "brief reason"}
  ]
}`;
}

export function parseLLMResponse(response: string): Array<{ skill: string; score: number; reason: string }> {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.matches || !Array.isArray(parsed.matches)) return [];

    return parsed.matches
      .filter(
        (m: unknown) =>
          typeof m === "object" &&
          m !== null &&
          "skill" in m &&
          "score" in m &&
          typeof (m as { skill: unknown }).skill === "string" &&
          typeof (m as { score: unknown }).score === "number",
      )
      .map((m: { skill: string; score: number; reason?: string }) => ({
        skill: m.skill,
        score: Math.min(1, Math.max(0, m.score)),
        reason: m.reason || "llm match",
      }));
  } catch {
    return [];
  }
}
