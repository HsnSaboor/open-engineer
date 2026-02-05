import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ProjectSpec {
  vision: string;
  coreValue: string;
  antiGoals: string[];
  stack: Record<string, string>;
}

export interface Requirement {
  id: string;
  description: string;
  priority: "Must" | "Should" | "Could";
  phase: number;
  status: "Pending" | "Done";
}

export class GsdSpecManager {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  public async ensureSpecDirs() {
    await mkdir(join(this.rootDir, ".planning"), { recursive: true });
    await mkdir(join(this.rootDir, ".specs"), { recursive: true }); // Storing specs in root or .specs? Spec says root mostly.
    // Spec says PROJECT.md, REQUIREMENTS.md, ROADMAP.md usually at root.
  }

  public async getProjectSpec(): Promise<ProjectSpec | null> {
    const path = join(this.rootDir, "PROJECT.md");
    if (!existsSync(path)) return null;

    // Simple parsing for now - in reality would be more robust markdown parsing
    const _content = await readFile(path, "utf-8");
    // Parsing logic to be implemented or we just return raw content for LLM to parse
    // For the agent, reading raw markdown is often better.
    return null;
  }

  public async createProjectSpecTemplate() {
    const content = `# PROJECT.md (The North Star)

## Vision
One sentence describing the end state.

## Core Value
The single most important feature.

## Anti-Goals
- What we are NOT building.

## Stack
- Key libraries and versions.
`;
    await writeFile(join(this.rootDir, "PROJECT.md"), content);
  }

  public async createRequirementsTemplate() {
    const content = `# REQUIREMENTS.md

| ID | Requirement | Priority | Phase | Status |
|:---|:---|:---|:---|:---|
| R1 | [Requirement Description] | Must | 1 | [ ] |
`;
    await writeFile(join(this.rootDir, "REQUIREMENTS.md"), content);
  }

  public async createRoadmapTemplate() {
    const content = `# ROADMAP.md

## Phase 1: Foundation
- [ ] R1: [Description]

## Phase 2: MVP
`;
    await writeFile(join(this.rootDir, "ROADMAP.md"), content);
  }

  public async savePlan(phase: number, xmlContent: string) {
    const path = join(this.rootDir, ".planning", `phase-${phase}.xml`);
    await writeFile(path, xmlContent);
  }

  public async readPlan(phase: number): Promise<string | null> {
    const path = join(this.rootDir, ".planning", `phase-${phase}.xml`);
    if (existsSync(path)) {
      return await readFile(path, "utf-8");
    }
    return null;
  }
}
