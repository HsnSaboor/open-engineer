import type { LLMProviderConfig, SkillMatcherConfig } from "../config-loader";
import { log } from "../utils/logger";
import type { SkillIndex, SkillIndexEntry } from "./indexer";
import { buildSkillSelectionPrompt, parseLLMResponse, sanitizeQuery } from "./utils";

export interface MatchResult {
  skillName: string;
  score: number;
  reason: string;
}

const DEFAULT_CONFIG: Required<Omit<SkillMatcherConfig, "providers" | "model">> & {
  providers: LLMProviderConfig[];
  model: string | undefined;
} = {
  threshold: 0.5,
  maxResults: 5,
  cacheResults: true,
  minConfidence: 0.7,
  providers: [],
  model: undefined,
};

export class SkillMatcher {
  private index: SkillIndex;
  private skillsByName: Map<string, SkillIndexEntry>;
  private config: typeof DEFAULT_CONFIG;
  private cache: Map<string, { results: MatchResult[]; timestamp: number }> = new Map();
  private static readonly MAX_CACHE_SIZE = 200;
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(index: SkillIndex, config: SkillMatcherConfig = {}) {
    this.index = index;
    this.skillsByName = new Map(index.skills.map((s) => [s.name, s]));
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async match(query: string, topK?: number): Promise<MatchResult[]> {
    const sanitized = sanitizeQuery(query);
    const maxResults = topK ?? this.config.maxResults;

    if (this.config.cacheResults) {
      const cached = this.cache.get(sanitized);
      if (cached && Date.now() - cached.timestamp < SkillMatcher.CACHE_TTL_MS) {
        return cached.results.slice(0, maxResults);
      }
      // Expired entry — remove it
      if (cached) this.cache.delete(sanitized);
    }

    let results: MatchResult[];

    if (this.config.providers.length > 0) {
      results = await this.matchWithLLM(sanitized, maxResults);
    } else {
      results = this.matchWithHeuristics(sanitized);
    }

    if (this.config.cacheResults) {
      // Enforce cache size bound
      if (this.cache.size >= SkillMatcher.MAX_CACHE_SIZE) {
        // Evict oldest entry (first key in Map insertion order)
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(sanitized, { results, timestamp: Date.now() });
    }

    return results.slice(0, maxResults);
  }

  async matchWithThreshold(query: string, threshold?: number): Promise<MatchResult[]> {
    const results = await this.match(query, 10);
    const minScore = threshold ?? this.config.threshold;
    return results.filter((r) => r.score >= minScore);
  }

  getSkill(name: string): SkillIndexEntry | undefined {
    return this.skillsByName.get(name);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async matchWithLLM(query: string, maxResults: number): Promise<MatchResult[]> {
    const provider = this.config.providers[0];
    if (!provider) return this.matchWithHeuristics(query);

    const model = this.config.model ?? provider.model;

    try {
      const prompt = buildSkillSelectionPrompt(
        this.index.skills.map((s) => ({ name: s.name, description: s.description, tags: s.tags })),
        query,
        maxResults,
      );

      const response = await this.callLLM(provider, prompt, model);
      const parsed = parseLLMResponse(response);

      if (parsed.length === 0) {
        log.debug("skills", "LLM returned no matches, falling back to heuristics");
        return this.matchWithHeuristics(query);
      }

      return parsed
        .filter((m) => this.skillsByName.has(m.skill))
        .filter((m) => m.score >= this.config.minConfidence)
        .map((m) => ({
          skillName: m.skill,
          score: m.score,
          reason: m.reason,
        }));
    } catch (err) {
      log.warn("skills", "LLM matching failed, falling back to heuristics", {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.matchWithHeuristics(query);
    }
  }

  private async callLLM(provider: LLMProviderConfig, prompt: string, model: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const isGemini = provider.baseURL.includes("googleapis.com") || model.startsWith("gemini");

      if (isGemini) {
        const url = `${provider.baseURL}/models/${model}:generateContent`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": provider.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 500,
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`LLM request failed: ${response.status} ${body.slice(0, 200)}`);
        }

        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };

        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } else {
        // OpenAI-compatible API
        const url = `${provider.baseURL}/chat/completions`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 500,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`LLM request failed: ${response.status} ${body.slice(0, 200)}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };

        return data.choices?.[0]?.message?.content ?? "";
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private matchWithHeuristics(query: string): MatchResult[] {
    const results: Map<string, MatchResult> = new Map();
    const queryLower = query.toLowerCase();

    this.matchByExactName(queryLower, results);
    this.matchByKeywords(queryLower, results);
    this.matchByTags(queryLower, results);

    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxResults);
  }

  private matchByExactName(query: string, results: Map<string, MatchResult>): void {
    for (const skill of this.index.skills) {
      const nameLower = skill.name.toLowerCase();

      if (query.includes(nameLower)) {
        const score = query === nameLower ? 1.0 : 0.9;
        results.set(skill.name, {
          skillName: skill.name,
          score,
          reason: "exact name match",
        });
      } else if (nameLower.includes(query) && query.length >= 3) {
        results.set(skill.name, {
          skillName: skill.name,
          score: 0.8,
          reason: "name contains query",
        });
      }
    }
  }

  private matchByKeywords(query: string, results: Map<string, MatchResult>): void {
    const queryWords = query.split(/\s+/).filter((w) => w.length >= 3);

    for (const skill of this.index.skills) {
      const descLower = skill.description.toLowerCase();
      let matchCount = 0;
      const matchedWords: string[] = [];

      for (const word of queryWords) {
        if (descLower.includes(word)) {
          matchCount++;
          matchedWords.push(word);
        }
      }

      if (matchCount >= 2) {
        const existing = results.get(skill.name);
        const score = Math.min(0.3 + matchCount * 0.1, 0.7);

        if (!existing || existing.score < score) {
          results.set(skill.name, {
            skillName: skill.name,
            score,
            reason: `description match: ${matchedWords.slice(0, 3).join(", ")}`,
          });
        }
      }
    }
  }

  private matchByTags(query: string, results: Map<string, MatchResult>): void {
    const queryWords = new Set(query.split(/\s+/).filter((w) => w.length >= 2));

    for (const skill of this.index.skills) {
      for (const tag of skill.tags) {
        const tagLower = tag.toLowerCase();

        if (queryWords.has(tagLower) || query.includes(tagLower)) {
          const existing = results.get(skill.name);

          if (existing) {
            if (existing.score < 0.85) {
              results.set(skill.name, {
                skillName: skill.name,
                score: Math.min(existing.score + 0.15, 0.85),
                reason: existing.reason,
              });
            }
          } else {
            results.set(skill.name, {
              skillName: skill.name,
              score: 0.6,
              reason: `tag: "${tag}"`,
            });
          }
        }
      }
    }
  }
}

export function buildLLMSelectionPrompt(index: SkillIndex, context: string, maxSkills: number = 10): string {
  return buildSkillSelectionPrompt(
    index.skills.map((s) => ({ name: s.name, description: s.description, tags: s.tags })),
    context,
    maxSkills,
  );
}
