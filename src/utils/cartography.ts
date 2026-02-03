import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

interface DirectoryNode {
  hash: string;
  summary: string;
  keySymbols: string[];
  childDirs: string[];
  childFiles: string[];
  lastScanned: number;
}

interface SymbolEntry {
  type: "class" | "function" | "interface" | "variable";
  path: string;
  line: number;
}

interface Atlas {
  root: string;
  lastUpdated: number;
  directories: Record<string, DirectoryNode>;
  symbolMap: Record<string, SymbolEntry>;
}

export class Cartographer {
  private rootDir: string;
  private atlas: Atlas;
  private dirty: Set<string>;
  private atlasPath: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.atlasPath = join(rootDir, "thoughts", "shared", "atlas.json");
    this.atlas = { root: rootDir, lastUpdated: 0, directories: {}, symbolMap: {} };
    this.dirty = new Set();
  }

  public async initialize() {
    await this.load();
  }

  private async load() {
    if (existsSync(this.atlasPath)) {
      try {
        const content = await readFile(this.atlasPath, "utf-8");
        this.atlas = JSON.parse(content);
      } catch (e) {
        console.error("Failed to load Atlas:", e);
      }
    }
  }

  private async save() {
    try {
      const dir = dirname(this.atlasPath);
      await mkdir(dir, { recursive: true });
      await writeFile(this.atlasPath, JSON.stringify(this.atlas, null, 2));
    } catch (e) {
      console.error("Failed to save Atlas:", e);
    }
  }

  public async markDirty(filePath: string) {
    const dir = dirname(filePath);
    this.dirty.add(dir);
    // Propagate up? No, local summary is enough usually.
    // But parent summary might depend on children.
    // For now, flat dirty marking.
  }

  public async query(query: string): Promise<string> {
    // Semantic search is hard without embeddings.
    // We'll do keyword matching on summaries and symbol map.
    const queryLower = query.toLowerCase();
    const results: string[] = [];

    // Search Directories
    for (const [dir, node] of Object.entries(this.atlas.directories)) {
      const relDir = relative(this.atlas.root, dir);
      if (node.summary.toLowerCase().includes(queryLower) || relDir.toLowerCase().includes(queryLower)) {
        results.push(`Directory: ${relDir}\nSummary: ${node.summary}`);
      }
    }

    // Search Symbols
    for (const [symbol, entry] of Object.entries(this.atlas.symbolMap)) {
      if (symbol.toLowerCase().includes(queryLower)) {
        const relPath = relative(this.atlas.root, entry.path);
        results.push(`Symbol: ${symbol} (${entry.type})\nLocation: ${relPath}:${entry.line}`);
      }
    }

    if (results.length === 0) return "No matches found in Atlas.";
    return results.slice(0, 10).join("\n\n");
  }

  // Update logic to be called by hook or manually
  // This just updates the hash and detects changes.
  // It returns list of directories that need re-summarization (Librarian task).
  public async scanDirty(): Promise<string[]> {
    const toSummarize: string[] = [];

    for (const dir of this.dirty) {
      try {
        const files = await readdir(dir, { withFileTypes: true });
        const fileNames = files
          .filter((f) => f.isFile())
          .map((f) => f.name)
          .sort();
        const childDirs = files
          .filter((f) => f.isDirectory())
          .map((f) => f.name)
          .sort();

        // Compute hash of mtimes
        const hash = createHash("md5");
        for (const file of fileNames) {
          const s = await stat(join(dir, file));
          hash.update(`${file}:${s.mtimeMs}`);
        }
        const digest = hash.digest("hex");

        // Check if changed
        const existing = this.atlas.directories[dir];
        if (!existing || existing.hash !== digest) {
          // Changed
          toSummarize.push(dir);

          // Update basic entry
          this.atlas.directories[dir] = {
            hash: digest,
            summary: existing?.summary || "(Pending scan)",
            keySymbols: existing?.keySymbols || [],
            childDirs,
            childFiles: fileNames,
            lastScanned: Date.now(),
          };
        }
      } catch {
        // Directory might have been deleted
        delete this.atlas.directories[dir];
      }
    }

    this.dirty.clear();
    await this.save();
    return toSummarize;
  }

  public updateEntry(dir: string, summary: string, keySymbols: string[]) {
    const entry = this.atlas.directories[dir];
    if (entry) {
      entry.summary = summary;
      entry.keySymbols = keySymbols;
      this.atlas.lastUpdated = Date.now();
      this.save().catch((e) => console.error(e));
    }
  }

  public generateAtlasSummary(): string {
    let output = "## Code Atlas (Top-Level)\n";
    const sortedDirs = Object.keys(this.atlas.directories).sort();

    // Always include root summary if available
    const rootNode = this.atlas.directories[this.atlas.root];
    if (rootNode) output += `- /: ${rootNode.summary}\n`;

    for (const dir of sortedDirs) {
      const rel = relative(this.atlas.root, dir);
      if (!rel || rel.startsWith("..")) continue;

      const depth = rel.split("/").length;
      if (depth > 2) continue; // Limit depth

      const indent = "  ".repeat(depth);
      const node = this.atlas.directories[dir];
      output += `${indent}- ${rel}: ${node.summary.slice(0, 60)}...\n`;
    }
    return output;
  }
}
