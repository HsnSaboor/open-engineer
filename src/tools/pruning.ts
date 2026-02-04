import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

import { loadMicodeConfig } from "../config-loader";
import { PruningManager } from "../utils/context-pruning";

export function createPruningTools(ctx: PluginInput) {
  return {
    extract: tool({
      description: "Replaces large tool outputs with a concise summary to save context space.",
      args: {
        ids: tool.schema.array(tool.schema.number()).describe("Array of IDs from the <history_map>"),
        summary: tool.schema
          .string()
          .describe(
            "A technical distillation of the findings. Include file names, function signatures, or key logic found.",
          ),
      },
      execute: async (args, context) => {
        // Try to find sessionID in context
        // Context type is typically { sessionID: string, ... }
        const sessionID = (context as any)?.sessionID || (context as any)?.sessionId;

        if (!sessionID) {
          return "Error: Could not determine Session ID. Cannot perform extraction.";
        }

        const config = await loadMicodeConfig(ctx.directory);
        if (!config?.dcp?.enabled) {
          return "DCP Pruning is not enabled in this project.";
        }

        const manager = new PruningManager(ctx.directory, config.dcp.strategies, config.dcp.protectedTools);

        const results: string[] = [];
        const errors: string[] = [];

        for (const id of args.ids) {
          const toolCallId = await manager.getToolIdFromMap(sessionID, id);

          if (!toolCallId) {
            errors.push(`ID ${id} not found`);
            continue;
          }

          // For batch extraction, we register the same summary for all IDs
          // Or we could append "(Part of batch extract)"?
          // Let's just use the summary. If multiple items are compressed into one thought, that's fine.
          await manager.registerExtraction(sessionID, toolCallId, args.summary);
          results.push(String(id));
        }

        if (errors.length > 0) {
          return `Partially successful. Extracted IDs: ${results.join(", ")}. Errors: ${errors.join(", ")}`;
        }

        return `Successfully extracted IDs ${results.join(", ")}. The content will be replaced with your summary in the next turn.`;
      },
    }),

    discard: tool({
      description: "Discards tool outputs that are irrelevant or no longer needed.",
      args: {
        ids: tool.schema.array(tool.schema.number()).describe("Array of IDs from the <history_map>"),
        reason: tool.schema
          .string()
          .describe("Why is this being discarded? (e.g., 'noise', 'completed', 'superseded')"),
      },
      execute: async (args, context) => {
        const sessionID = (context as any)?.sessionID || (context as any)?.sessionId;
        if (!sessionID) return "Error: No Session ID.";

        const config = await loadMicodeConfig(ctx.directory);
        if (!config?.dcp?.enabled) return "DCP Disabled.";

        const manager = new PruningManager(ctx.directory, config.dcp.strategies, config.dcp.protectedTools);

        const results: string[] = [];
        const errors: string[] = [];

        for (const id of args.ids) {
          const toolCallId = await manager.getToolIdFromMap(sessionID, id);
          if (!toolCallId) {
            errors.push(`ID ${id} not found`);
            continue;
          }

          // We register a specific "Discarded" summary
          await manager.registerExtraction(sessionID, toolCallId, `[Discarded: ${args.reason}]`);
          results.push(String(id));
        }

        if (errors.length > 0) {
          return `Partially discarded. IDs: ${results.join(", ")}. Errors: ${errors.join(", ")}`;
        }
        return `Successfully discarded IDs ${results.join(", ")}.`;
      },
    }),
  };
}
