import { $ } from "bun";

import { type ToolContext, tool } from "@opencode-ai/plugin/tool";

import { log } from "../../utils/logger";

/**
 * Add a local directory as a BTCA resource
 */
export const btca_resource_add = tool({
  description: "Register a local directory as a BTCA resource for code indexing",
  args: {
    name: tool.schema.string(),
    path: tool.schema.string(),
  },
  execute: async ({ name, path }, ctx: ToolContext) => {
    try {
      log.info("btca", `Registering resource '${name}' at path '${path}'`);

      // Run the config command
      // Using --force to overwrite if it exists would be ideal, but let's just try to add
      const result = await $`btca config resources add --name ${name} --type local --path ${path}`.nothrow().quiet();

      if (result.exitCode !== 0) {
        // If it fails, it might already exist. Check output.
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
  execute: async (_, ctx: ToolContext) => {
    try {
      const result = await $`btca config resources list`.nothrow().quiet();
      if (result.exitCode !== 0) {
        return "Failed to list resources. Is 'btca' installed?";
      }
      return result.stdout.toString();
    } catch (error) {
      return `Error listing resources: ${error}`;
    }
  },
});
