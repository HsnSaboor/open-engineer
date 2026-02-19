import { $, which } from "bun";

import { type ToolContext, tool } from "@opencode-ai/plugin/tool";

import { log } from "../../utils/logger";

interface BtcaResource {
  name: string;
  type: string;
  path: string;
}

/**
 * Add a local directory as a BTCA resource
 */
export const btca_resource_add = tool({
  description: "Register a local directory as a BTCA resource for code indexing",
  args: {
    name: tool.schema.string(),
    path: tool.schema.string(),
  },
  execute: async ({ name, path }, _ctx: ToolContext) => {
    try {
      log.info("btca", `Registering resource '${name}' at path '${path}'`);

      // Step 1: Check existing resources to prevent duplicates
      const listResult = await $`btca config resources list`.nothrow().quiet();
      if (listResult.exitCode === 0) {
        try {
          const output = listResult.stdout.toString().trim();
          let resources: BtcaResource[] = [];

          // Try to parse JSON output
          if (output.startsWith("[") || output.startsWith("{")) {
            const parsed = JSON.parse(output);
            if (Array.isArray(parsed)) {
              resources = parsed;
            } else if (typeof parsed === "object") {
              resources = Object.values(parsed);
            }
          }

          // Check if name already exists
          if (resources.length > 0) {
            const exists = resources.find((r: any) => r.name === name);
            if (exists) {
              return `Resource '${name}' already exists.`;
            }
          }
        } catch (_e) {
          // Failed to parse or process list, proceed to add command as fallback
          log.warn("btca", "Failed to parse resources list, proceeding with add.");
        }
      }

      // Run the config command
      const result = await $`btca config resources add --name ${name} --type local --path ${path}`.nothrow().quiet();

      if (result.exitCode !== 0) {
        // If it fails, it might already exist (double check via stderr)
        const stderr = result.stderr.toString();
        if (stderr.includes("already exists")) {
          return `Resource '${name}' already exists.`;
        }
        throw new Error(`Failed to add resource: ${stderr}`);
      }

      return `Successfully registered resource '${name}' pointing to '${path}'. Indexing will happen on first query.`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      log.error("btca", `Failed to add resource: ${msg}`);
      return `Error registering resource: ${msg}`;
    }
  },
});

/**
 * List available BTCA resources
 */
export const btca_resource_list = tool({
  description: "List all configured BTCA resources",
  args: {},
  execute: async (_, _ctx: ToolContext) => {
    try {
      const result = await $`btca config resources list`.nothrow().quiet();
      if (result.exitCode !== 0) {
        // Distinguish "btca not installed" from "no resources configured"
        const btcaPath = which("btca");
        if (!btcaPath) {
          return "Failed to list resources. 'btca' is not installed. Install with: bun install -g @anthropic/btca";
        }
        // btca is installed but returned non-zero (e.g. empty resources list)
        const stderr = result.stderr.toString().trim();
        const stdout = result.stdout.toString().trim();
        if (!stdout && !stderr) {
          return "No resources configured. Use btca_resource_add to register a local directory.";
        }
        // If there's stderr output, include it for debugging
        return `No resources configured.${stderr ? ` (btca: ${stderr})` : ""}\nUse btca_resource_add to register a local directory.`;
      }
      const output = result.stdout.toString().trim();
      if (!output) {
        return "No resources configured. Use btca_resource_add to register a local directory.";
      }
      return output;
    } catch (error) {
      return `Error listing resources: ${error}`;
    }
  },
});
