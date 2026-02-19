import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { log } from "../utils/logger";
import { AsyncMutex, parseFrontmatter } from "./utils";

export interface SkillIndex {
  version: number;
  generatedAt: string;
  skills: SkillIndexEntry[];
}

export interface SkillIndexEntry {
  name: string;
  description: string;
  shortDesc: string;
  tags: string[];
  location: string;
}

const INDEX_VERSION = 4;
const MAX_DESC_LENGTH = 200;
const INDEX_FILE = "skill-index.json";

export class SkillIndexer {
  private indexPath: string;
  private projectSkillsDir: string;
  private globalSkillsDir: string;
  private bundledSkillsDir: string;
  private mutex = new AsyncMutex();

  constructor(pluginDir: string) {
    this.projectSkillsDir = path.join(pluginDir, ".open-engineer", "skills");
    this.globalSkillsDir = path.join(homedir(), ".config", "opencode", "skills");
    this.bundledSkillsDir = path.resolve(import.meta.dir, "bundled");
    this.indexPath = path.join(pluginDir, ".open-engineer", INDEX_FILE);
  }

  private async scanSkillsDir(skillsDir: string): Promise<SkillIndexEntry[]> {
    const glob = new Bun.Glob("**/*.md");
    const skills: SkillIndexEntry[] = [];

    try {
      for await (const match of glob.scan({ cwd: skillsDir, absolute: true })) {
        if (!match.endsWith("SKILL.md") && !match.endsWith("-SKILL.md")) continue;

        const content = await Bun.file(match).text();
        const entry = await this.parseSkill(content, match);

        if (entry) skills.push(entry);
      }
    } catch (err) {
      log.warn("skills", "Error scanning skills directory", { error: String(err), dir: skillsDir });
    }

    return skills;
  }

  async buildIndex(): Promise<SkillIndex> {
    return this.mutex.run(async () => {
      // Scan in precedence order: bundled (lowest) → global → project-local (highest)
      const bundledSkills = await this.scanSkillsDir(this.bundledSkillsDir);
      const globalSkills = await this.scanSkillsDir(this.globalSkillsDir);
      const projectSkills = await this.scanSkillsDir(this.projectSkillsDir);

      // Merge: later entries override earlier ones with the same name
      const skillMap = new Map<string, SkillIndexEntry>();
      for (const skill of bundledSkills) {
        skillMap.set(skill.name, skill);
      }
      for (const skill of globalSkills) {
        skillMap.set(skill.name, skill);
      }
      for (const skill of projectSkills) {
        skillMap.set(skill.name, skill);
      }

      const index: SkillIndex = {
        version: INDEX_VERSION,
        generatedAt: new Date().toISOString(),
        skills: Array.from(skillMap.values()),
      };

      await this.saveIndex(index);
      return index;
    });
  }

  async loadIndex(): Promise<SkillIndex | null> {
    try {
      const content = await readFile(this.indexPath, "utf-8");
      const index = JSON.parse(content) as SkillIndex;

      if (index.version !== INDEX_VERSION) {
        log.info("skills", "Index version mismatch, rebuilding");
        return null;
      }

      return index;
    } catch (err) {
      log.debug("skills", "Could not load index", { error: String(err) });
      return null;
    }
  }

  async getOrBuildIndex(): Promise<SkillIndex> {
    const cached = await this.loadIndex();
    if (cached) return cached;
    return this.buildIndex();
  }

  private async saveIndex(index: SkillIndex): Promise<void> {
    const dir = path.dirname(this.indexPath);
    try {
      await stat(dir);
    } catch {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }

  private async parseSkill(content: string, location: string): Promise<SkillIndexEntry | null> {
    const parsed = parseFrontmatter(content);

    if (!parsed) {
      log.warn("skills", "Failed to parse skill frontmatter", { location });
      return null;
    }

    const { name, description, tags = [] } = parsed;
    const shortDesc =
      description.length > MAX_DESC_LENGTH ? `${description.slice(0, MAX_DESC_LENGTH).trim()}...` : description;

    return { name, description, shortDesc, tags, location };
  }

  getCompactIndex(index: SkillIndex): string {
    return index.skills.map((s) => `${s.name}: ${s.shortDesc}`).join("\n");
  }
}
