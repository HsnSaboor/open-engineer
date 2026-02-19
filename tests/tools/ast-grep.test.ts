import { beforeEach, describe, expect, it } from "bun:test";
import { which } from "bun";

describe("ast-grep binary resolution (Bug 3a)", () => {
  describe("checkAstGrepAvailable", () => {
    it("should return an object with available property", async () => {
      const { checkAstGrepAvailable } = await import("../../src/tools/ast-grep/index");
      const result = await checkAstGrepAvailable();

      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    it("should include install instructions when not available", async () => {
      const { checkAstGrepAvailable } = await import("../../src/tools/ast-grep/index");
      const result = await checkAstGrepAvailable();

      if (!result.available) {
        expect(result.message).toContain("ast-grep");
        expect(result.message).toContain("npm install");
      }
    });
  });

  describe("resolveAstGrepBinary — priority logic", () => {
    beforeEach(async () => {
      // Reset cached binary before each test so resolution runs fresh
      const mod = await import("../../src/tools/ast-grep/index");
      mod._resetResolvedBinary();
    });

    it("should resolve to a non-null binary when ast-grep or sg is installed", async () => {
      const { resolveAstGrepBinary } = await import("../../src/tools/ast-grep/index");
      const binary = resolveAstGrepBinary();

      const astGrepPath = which("ast-grep");
      const sgPath = which("sg");
      const hasSomeAstGrep = !!astGrepPath || (!!sgPath && sgPath !== "/usr/bin/sg");

      if (hasSomeAstGrep) {
        expect(binary).not.toBeNull();
      } else {
        expect(binary).toBeNull();
      }
    });

    it("should never resolve to /usr/bin/sg (Linux newgrp)", async () => {
      const { resolveAstGrepBinary } = await import("../../src/tools/ast-grep/index");
      const binary = resolveAstGrepBinary();
      expect(binary).not.toBe("/usr/bin/sg");
    });

    it("should prefer system paths over user-local paths", async () => {
      const { resolveAstGrepBinary } = await import("../../src/tools/ast-grep/index");
      const binary = resolveAstGrepBinary();

      if (!binary) return; // nothing installed, skip

      const astGrepPath = which("ast-grep");
      const sgPath = which("sg");

      const SYSTEM_PREFIXES = ["/usr/bin/", "/usr/local/bin/", "/opt/homebrew/bin/", "/home/linuxbrew/.linuxbrew/bin/"];
      const isSystem = (p: string) => SYSTEM_PREFIXES.some((pfx) => p.startsWith(pfx));

      // If a system-installed ast-grep exists, we must have picked it
      if (astGrepPath && isSystem(astGrepPath)) {
        expect(binary).toBe(astGrepPath);
      }
      // If no system ast-grep but system sg exists (and is valid), we must have picked it
      else if (sgPath && sgPath !== "/usr/bin/sg" && isSystem(sgPath)) {
        expect(binary).toBe(sgPath);
      }
      // Otherwise it's a user-local fallback, which is fine
    });

    it("should cache the resolved binary on repeated calls", async () => {
      const { resolveAstGrepBinary } = await import("../../src/tools/ast-grep/index");
      const first = resolveAstGrepBinary();
      const second = resolveAstGrepBinary();
      expect(first).toBe(second);
    });
  });

  describe("source code structural verification", () => {
    let source: string;

    beforeEach(async () => {
      const { readFile } = await import("node:fs/promises");
      source = await readFile("src/tools/ast-grep/index.ts", "utf-8");
    });

    it("should define SYSTEM_BIN_PREFIXES for native path detection", () => {
      expect(source).toContain("SYSTEM_BIN_PREFIXES");
      expect(source).toContain("/usr/bin/");
      expect(source).toContain("/usr/local/bin/");
      expect(source).toContain("/opt/homebrew/bin/");
    });

    it("should detect native package managers for install instructions", () => {
      expect(source).toContain("detectNativeInstallCommand");
      expect(source).toContain('which("pacman")');
      expect(source).toContain('which("apt")');
      expect(source).toContain('which("brew")');
    });

    it("should check for both ast-grep and sg binaries", () => {
      expect(source).toContain('which("ast-grep")');
      expect(source).toContain('which("sg")');
    });

    it("should filter out /usr/bin/sg", () => {
      expect(source).toContain("/usr/bin/sg");
    });

    it("should have 4-step priority: system ast-grep > system sg > local ast-grep > local sg", () => {
      // The resolution function should check system paths first, then fall back
      expect(source).toContain("isSystemPath(astGrepPath)");
      expect(source).toContain("isSystemPath(validSgPath)");
      // The system checks must come before the user-local fallbacks
      const systemAstGrepIdx = source.indexOf("isSystemPath(astGrepPath)");
      const systemSgIdx = source.indexOf("isSystemPath(validSgPath)");
      const localAstGrepIdx = source.indexOf('// 3. Fall back to user-local "ast-grep"');
      const localSgIdx = source.indexOf('// 4. Fall back to user-local "sg"');
      expect(systemAstGrepIdx).toBeLessThan(systemSgIdx);
      expect(systemSgIdx).toBeLessThan(localAstGrepIdx);
      expect(localAstGrepIdx).toBeLessThan(localSgIdx);
    });

    it("should use resolved binary in runSg instead of hardcoded ast-grep", () => {
      expect(source).not.toContain('spawn(["ast-grep"');
      expect(source).toContain("resolveAstGrepBinary");
      expect(source).toContain("spawn([binary,");
    });

    it("should return early with error if no binary found in runSg", () => {
      expect(source).toContain("if (!binary)");
    });

    it("should suggest native package manager in install message when available", () => {
      expect(source).toContain("buildInstallMessage");
      expect(source).toContain("(recommended)");
    });
  });

  describe("install message", () => {
    it("should suggest native package manager first when available", async () => {
      const { checkAstGrepAvailable, _resetResolvedBinary } = await import("../../src/tools/ast-grep/index");

      // We can't easily test the "not found" branch without mocking,
      // but we can verify the structure includes the native detection logic
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/tools/ast-grep/index.ts", "utf-8");

      // On Arch (this system has pacman), the recommended command should be pacman
      if (which("pacman")) {
        expect(source).toContain("sudo pacman -S ast-grep");
      }
    });
  });

  describe("ast_grep_search tool", () => {
    it("should be a valid tool with correct schema", async () => {
      const { ast_grep_search } = await import("../../src/tools/ast-grep/index");

      expect(ast_grep_search).toBeDefined();
      expect(ast_grep_search.description).toContain("AST");
      expect(ast_grep_search.args).toHaveProperty("pattern");
      expect(ast_grep_search.args).toHaveProperty("lang");
    });
  });

  describe("ast_grep_replace tool", () => {
    it("should be a valid tool with correct schema", async () => {
      const { ast_grep_replace } = await import("../../src/tools/ast-grep/index");

      expect(ast_grep_replace).toBeDefined();
      expect(ast_grep_replace.description).toContain("Replace");
      expect(ast_grep_replace.args).toHaveProperty("pattern");
      expect(ast_grep_replace.args).toHaveProperty("rewrite");
      expect(ast_grep_replace.args).toHaveProperty("lang");
    });
  });
});
