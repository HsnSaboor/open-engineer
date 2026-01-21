import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

interface BtcaConfig {
  projectName: string;
  registeredAt: string;
}

const CONFIG_DIR = ".open-engineer";
const CONFIG_FILE = "btca-config.json";

/**
 * Get the unique project name for BTCA.
 * 1. Tries to read from .open-engineer/btca-config.json
 * 2. If missing, generates a unique name (project-slug-hash)
 * 3. Saves it to config and returns it
 */
export function getOrGenerateProjectName(rootDir: string): string {
  const configPath = join(rootDir, CONFIG_DIR, CONFIG_FILE);

  // Try to load existing config
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as BtcaConfig;
      if (config.projectName) {
        return config.projectName;
      }
    } catch {
      // Ignore errors, regenerate
    }
  }

  // Generate new name
  const absPath = resolve(rootDir);
  const slug = basename(absPath)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

  // Use first 6 chars of MD5 hash of absolute path for uniqueness
  const hash = createHash("md5").update(absPath).digest("hex").substring(0, 6);
  const projectName = `project-${slug}-${hash}`;

  // Save config
  saveProjectConfig(rootDir, projectName);

  return projectName;
}

/**
 * Save the project name to persistence config
 */
export function saveProjectConfig(rootDir: string, projectName: string): void {
  const configDirPath = join(rootDir, CONFIG_DIR);
  const configPath = join(configDirPath, CONFIG_FILE);

  if (!existsSync(configDirPath)) {
    mkdirSync(configDirPath, { recursive: true });
  }

  const config: BtcaConfig = {
    projectName,
    registeredAt: new Date().toISOString(),
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}
