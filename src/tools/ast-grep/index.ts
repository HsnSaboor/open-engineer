import { spawn, which } from "bun";

import { tool } from "@opencode-ai/plugin/tool";

/**
 * Known system paths where native package managers install binaries.
 * These are preferred over user-local bun/npm/cargo installs because
 * native binaries are more reliable (no postinstall shim issues).
 */
const SYSTEM_BIN_PREFIXES = ["/usr/bin/", "/usr/local/bin/", "/opt/homebrew/bin/", "/home/linuxbrew/.linuxbrew/bin/"];

function isSystemPath(p: string): boolean {
  return SYSTEM_BIN_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Detect the native package manager available on this system.
 * Returns a command to install ast-grep, or null if unknown.
 */
function detectNativeInstallCommand(): string | null {
  if (which("pacman")) return "sudo pacman -S ast-grep";
  if (which("apt")) return "sudo apt install ast-grep";
  if (which("dnf")) return "sudo dnf install ast-grep";
  if (which("brew")) return "brew install ast-grep";
  if (which("zypper")) return "sudo zypper install ast-grep";
  if (which("apk")) return "sudo apk add ast-grep";
  if (which("nix-env")) return "nix-env -iA nixpkgs.ast-grep";
  return null;
}

let _nativeInstallCmd: string | null | undefined;
function getNativeInstallCommand(): string | null {
  if (_nativeInstallCmd === undefined) {
    _nativeInstallCmd = detectNativeInstallCommand();
  }
  return _nativeInstallCmd;
}

/**
 * Resolve the ast-grep binary, preferring native system installs over bun/npm.
 *
 * Priority order:
 * 1. Native system install of "ast-grep" (/usr/bin, /usr/local/bin, brew prefix)
 * 2. Native system install of "sg" (same prefixes, excluding /usr/bin/sg which is Linux newgrp)
 * 3. User-local "ast-grep" (bun, npm, cargo installs via PATH)
 * 4. User-local "sg" (same, excluding /usr/bin/sg)
 */
let resolvedBinary: string | null = null;
/** Exported for testing — resets the cached binary so resolution runs again. */
export function _resetResolvedBinary(): void {
  resolvedBinary = null;
}

export function resolveAstGrepBinary(): string | null {
  if (resolvedBinary !== null) return resolvedBinary;

  const astGrepPath = which("ast-grep");
  const sgPath = which("sg");
  // Filter out /usr/bin/sg — that's the Linux "set group" (newgrp) command, NOT ast-grep
  const validSgPath = sgPath && sgPath !== "/usr/bin/sg" ? sgPath : null;

  // 1. Prefer a native system install of "ast-grep"
  if (astGrepPath && isSystemPath(astGrepPath)) {
    resolvedBinary = astGrepPath;
    return resolvedBinary;
  }

  // 2. Prefer a native system install of "sg"
  if (validSgPath && isSystemPath(validSgPath)) {
    resolvedBinary = validSgPath;
    return resolvedBinary;
  }

  // 3. Fall back to user-local "ast-grep" (bun/npm/cargo)
  if (astGrepPath) {
    resolvedBinary = astGrepPath;
    return resolvedBinary;
  }

  // 4. Fall back to user-local "sg"
  if (validSgPath) {
    resolvedBinary = validSgPath;
    return resolvedBinary;
  }

  return null;
}

function buildInstallMessage(): string {
  const nativeCmd = getNativeInstallCommand();
  const lines = ["ast-grep CLI not found. AST-aware search/replace will not work.", "Install with one of:"];
  if (nativeCmd) {
    lines.push(`  ${nativeCmd}  (recommended)`);
  }
  lines.push("  npm install -g @ast-grep/cli", "  cargo install ast-grep --locked", "  brew install ast-grep");
  return lines.join("\n");
}

/**
 * Check if ast-grep CLI (sg) is available on the system.
 * Returns installation instructions if not found.
 */
export async function checkAstGrepAvailable(): Promise<{ available: boolean; message?: string }> {
  const binary = resolveAstGrepBinary();
  if (binary) {
    return { available: true };
  }
  return {
    available: false,
    message: buildInstallMessage(),
  };
}

const LANGUAGES = [
  "c",
  "cpp",
  "csharp",
  "css",
  "dart",
  "elixir",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "sql",
  "swift",
  "tsx",
  "typescript",
  "yaml",
] as const;

interface Match {
  file: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
  text: string;
  replacement?: string;
}

async function runSg(args: string[]): Promise<{ matches: Match[]; error?: string }> {
  const binary = resolveAstGrepBinary();
  if (!binary) {
    return {
      matches: [],
      error: buildInstallMessage(),
    };
  }

  try {
    const proc = spawn([binary, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0 && !stdout.trim()) {
      if (stderr.includes("No files found")) {
        return { matches: [] };
      }
      return { matches: [], error: stderr.trim() || `Exit code ${exitCode}` };
    }

    if (!stdout.trim()) return { matches: [] };

    try {
      const matches = JSON.parse(stdout) as Match[];
      return { matches };
    } catch {
      return { matches: [], error: "Failed to parse output" };
    }
  } catch (e) {
    const err = e as Error;
    if (err.message?.includes("ENOENT")) {
      return {
        matches: [],
        error: buildInstallMessage(),
      };
    }
    return { matches: [], error: err.message };
  }
}

function formatMatches(matches: Match[], isDryRun = false): string {
  if (matches.length === 0) return "No matches found";

  const MAX = 100;
  const truncated = matches.length > MAX;
  const shown = matches.slice(0, MAX);

  const lines = shown.map((m) => {
    const loc = `${m.file}:${m.range.start.line}:${m.range.start.column}`;
    const text = m.text.length > 100 ? `${m.text.slice(0, 100)}...` : m.text;
    if (isDryRun && m.replacement) {
      return `${loc}\n  - ${text}\n  + ${m.replacement}`;
    }
    return `${loc}: ${text}`;
  });

  if (truncated) {
    lines.unshift(`Found ${matches.length} matches (showing first ${MAX}):`);
  }

  return lines.join("\n");
}

export const ast_grep_search = tool({
  description:
    "Search code patterns using AST-aware matching. " +
    "Use meta-variables: $VAR (single node), $$$ (multiple nodes). " +
    "Patterns must be complete AST nodes. " +
    "Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern with meta-variables"),
    lang: tool.schema.enum(LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search"),
  },
  execute: async (args) => {
    const sgArgs = ["-p", args.pattern, "--lang", args.lang, "--json=compact"];
    if (args.paths?.length) {
      sgArgs.push(...args.paths);
    } else {
      sgArgs.push(".");
    }

    const result = await runSg(sgArgs);
    if (result.error) return `Error: ${result.error}`;
    return formatMatches(result.matches);
  },
});

export const ast_grep_replace = tool({
  description:
    "Replace code patterns with AST-aware rewriting. " +
    "Dry-run by default. Use meta-variables in rewrite to preserve matched content. " +
    "Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern to match"),
    rewrite: tool.schema.string().describe("Replacement pattern"),
    lang: tool.schema.enum(LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search"),
    apply: tool.schema.boolean().optional().describe("Apply changes (default: false, dry-run)"),
  },
  execute: async (args) => {
    const sgArgs = ["-p", args.pattern, "-r", args.rewrite, "--lang", args.lang, "--json=compact"];

    if (args.apply) {
      sgArgs.push("--update-all");
    }

    if (args.paths?.length) {
      sgArgs.push(...args.paths);
    } else {
      sgArgs.push(".");
    }

    const result = await runSg(sgArgs);
    if (result.error) return `Error: ${result.error}`;

    const isDryRun = !args.apply;
    const output = formatMatches(result.matches, isDryRun);

    if (isDryRun && result.matches.length > 0) {
      return `${output}\n\n(Dry run - use apply=true to apply changes)`;
    }
    if (args.apply && result.matches.length > 0) {
      return `Applied ${result.matches.length} replacements:\n${output}`;
    }
    return output;
  },
});
