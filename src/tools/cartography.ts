import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

import { Cartographer } from "../utils/cartography";

export function createCartographyTools(ctx: PluginInput) {
  return {
    atlas_query: tool({
      description:
        "Search the project Atlas (Cartography Index) for directories or symbols. Use this instead of broad 'grep' when looking for high-level structure.",
      args: {
        query: tool.schema.string().describe("Natural language query or symbol name"),
      },
      execute: async (args) => {
        const cartographer = new Cartographer(ctx.directory);
        await cartographer.initialize();
        return await cartographer.query(args.query);
      },
    }),
  };
}
