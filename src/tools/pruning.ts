import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

import { loadMicodeConfig } from "../config-loader";
import { PruningManager } from "../utils/context-pruning";

export function createPruningTools(ctx: PluginInput) {
  return {
    extract: tool({
      description: "Replaces a large tool output with a concise summary to save context space.",
      args: {
        id: tool.schema.number().describe("The ID from the <history_map>"),
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

        const toolCallId = await manager.getToolIdFromMap(sessionID, args.id);

        if (!toolCallId) {
          return `Error: ID ${args.id} not found in history map. Check the <history_map> block above.`;
        }

        await manager.registerExtraction(sessionID, toolCallId, args.summary);

        return `Successfully extracted ID ${args.id}. The content will be replaced with your summary in the next turn.`;
      },
    }),
  };
}
