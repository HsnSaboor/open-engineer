import { describe, expect, it } from "bun:test";
import { which } from "bun";

describe("btca_resource_list error handling (Bug 3b)", () => {
  describe("source code structural verification", () => {
    it("should distinguish btca not installed from empty resources", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/tools/btca/manage.ts", "utf-8");

      // Must check which("btca") when exit code is non-zero
      expect(source).toContain('which("btca")');
      // Must NOT have the old misleading error message
      expect(source).not.toContain("Failed to list resources. Is 'btca' installed?");
    });

    it("should return helpful message for empty resources", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/tools/btca/manage.ts", "utf-8");

      // Should suggest using btca_resource_add
      expect(source).toContain("No resources configured");
      expect(source).toContain("btca_resource_add");
    });

    it("should handle empty stdout from successful btca call", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/tools/btca/manage.ts", "utf-8");

      // Should check for empty output even when exit code is 0
      expect(source).toContain("if (!output)");
    });

    it("should include specific install instruction when btca is not found", async () => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile("src/tools/btca/manage.ts", "utf-8");

      // When btca truly isn't installed, should give install instructions
      expect(source).toContain("not installed");
    });
  });

  describe("btca_resource_list tool", () => {
    it("should be a valid tool with correct schema", async () => {
      const { btca_resource_list } = await import("../../src/tools/btca/manage");

      expect(btca_resource_list).toBeDefined();
      expect(btca_resource_list.description).toContain("List");
    });

    it("should execute and return a string result", async () => {
      const { btca_resource_list } = await import("../../src/tools/btca/manage");

      // Execute the tool — regardless of whether btca is installed,
      // it should return a meaningful string (not crash)
      const result = await btca_resource_list.execute({}, { sessionID: "test", metadata: () => {} } as any);

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);

      // The result should NEVER be the old misleading error
      expect(result).not.toBe("Failed to list resources. Is 'btca' installed?");

      const btcaPath = which("btca");
      if (!btcaPath) {
        // btca not installed — should say so clearly
        expect(result).toContain("not installed");
      } else {
        // btca is installed — should either show resources or say "No resources configured"
        // It should NOT say "Is 'btca' installed?"
        expect(result).not.toContain("Is 'btca' installed?");
      }
    });
  });

  describe("btca_resource_add tool", () => {
    it("should be a valid tool with correct schema", async () => {
      const { btca_resource_add } = await import("../../src/tools/btca/manage");

      expect(btca_resource_add).toBeDefined();
      expect(btca_resource_add.description).toContain("Register");
      expect(btca_resource_add.args).toHaveProperty("name");
      expect(btca_resource_add.args).toHaveProperty("path");
    });
  });
});
