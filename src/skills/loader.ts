import { homedir } from "node:os";
import path from "node:path";

import { z } from "zod";

import type { SkillMatcherConfig } from "../config-loader";
import { type SkillIndex, type SkillIndexEntry, SkillIndexer } from "./indexer";
import { buildLLMSelectionPrompt, type MatchResult, SkillMatcher } from "./matcher";
import { AsyncMutex, parseFrontmatter, stripFrontmatter } from "./utils";

const SkillMeta = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).optional(),
  "allowed-tools": z.array(z.string()).optional(),
});

export type SkillMeta = {
  name: string;
  description: string;
  tags?: string[];
  allowedTools?: string[];
};

export type Skill = {
  meta: SkillMeta;
  content: string;
  location: string;
};

export class SkillLoader {
  private skills = new Map<string, Skill>();
  private pluginDir: string;
  private indexer: SkillIndexer;
  private index: SkillIndex | null = null;
  private matcher: SkillMatcher | null = null;
  private config: SkillMatcherConfig;
  private mutex = new AsyncMutex();
  private initialized = false;

  constructor(pluginDir: string, config: SkillMatcherConfig = {}) {
    this.pluginDir = pluginDir;
    this.indexer = new SkillIndexer(pluginDir);
    this.config = config;
  }

  private async loadSkillsFromDir(skillsDir: string): Promise<void> {
    const glob = new Bun.Glob("**/*.md");

    try {
      for await (const match of glob.scan({ cwd: skillsDir, absolute: true })) {
        if (!match.endsWith("SKILL.md") && !match.endsWith("-SKILL.md")) continue;

        const content = await Bun.file(match).text();
        const parsed = parseFrontmatter(content);

        if (!parsed?.name) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsedAny = parsed as any;
        this.skills.set(parsed.name, {
          meta: {
            name: parsed.name,
            description: parsed.description,
            tags: parsed.tags,
            allowedTools: parsedAny["allowed-tools"] || parsedAny.allowedTools,
          },
          content: stripFrontmatter(content),
          location: match,
        });
      }
    } catch (_err) {
      // Skills directory may not exist
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.mutex.run(async () => {
      if (this.initialized) return;

      // 1. Load bundled skills that ship with the plugin (lowest priority)
      const bundledSkillsDir = path.join(import.meta.dir, "bundled");
      await this.loadSkillsFromDir(bundledSkillsDir);

      // 2. Load global user skills from ~/.config/opencode/skills/ (medium priority)
      //    Follows OpenCode's convention for global config at ~/.config/opencode/
      const globalSkillsDir = path.join(homedir(), ".config", "opencode", "skills");
      await this.loadSkillsFromDir(globalSkillsDir);

      // 3. Load project-local skills (highest priority — overrides bundled and global)
      const projectSkillsDir = path.join(this.pluginDir, ".open-engineer", "skills");
      await this.loadSkillsFromDir(projectSkillsDir);

      this.index = await this.indexer.getOrBuildIndex();
      this.matcher = new SkillMatcher(this.index, this.config);
      this.initialized = true;
    });
  }

  async rebuildIndex(): Promise<SkillIndex> {
    return this.mutex.run(async () => {
      this.index = await this.indexer.buildIndex();
      this.matcher = new SkillMatcher(this.index, this.config);
      return this.index;
    });
  }

  getIndex(): SkillIndex | null {
    return this.index;
  }

  async match(query: string, topK?: number): Promise<MatchResult[]> {
    if (!this.matcher) return [];
    return this.matcher.match(query, topK);
  }

  async matchWithThreshold(query: string, threshold?: number): Promise<MatchResult[]> {
    if (!this.matcher) return [];
    return this.matcher.matchWithThreshold(query, threshold);
  }

  getCompactIndex(): string {
    if (!this.index) return "";
    return this.indexer.getCompactIndex(this.index);
  }

  buildLLMPrompt(context: string, maxSkills?: number): string {
    if (!this.index) return "";
    return buildLLMSelectionPrompt(this.index, context, maxSkills);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getContent(name: string): string | null {
    return this.skills.get(name)?.content ?? null;
  }

  getMeta(name: string): SkillIndexEntry | undefined {
    return this.matcher?.getSkill(name);
  }

  list(): Array<{ name: string; description: string }> {
    return Array.from(this.skills.values()).map((s) => ({
      name: s.meta.name,
      description: s.meta.description,
    }));
  }

  listCompact(): string[] {
    if (!this.index) return [];
    return this.index.skills.map((s) => `${s.name}: ${s.shortDesc}`);
  }

  count(): number {
    return this.skills.size;
  }

  clearCache(): void {
    this.matcher?.clearCache();
  }
}

export { SkillIndexer, SkillMatcher, buildLLMSelectionPrompt };
export type { SkillIndex, SkillIndexEntry, MatchResult };
