import type { PluginInput } from "@opencode-ai/plugin";

import { Cartographer } from "../utils/cartography";
import { log } from "../utils/logger";

export function createCartographerHook(ctx: PluginInput) {
  let cartographer: Cartographer | null = null;

  async function initialize() {
    if (!cartographer) {
      cartographer = new Cartographer(ctx.directory);
      await cartographer.initialize();
    }
  }

  return {
    "tool.execute.after": async (input: { tool: string; args?: any }, _output: any) => {
      if (input.tool === "write" || input.tool === "edit") {
        await initialize();
        const path = input.args?.filePath || input.args?.path;
        if (path) {
          await cartographer!.markDirty(path);
          const dirty = await cartographer!.scanDirty();
          if (dirty.length > 0) {
            await log.info("cartography", "Atlas updated. Run 'librarian' to summarize changed directories.", {
              dirs: dirty,
            });
          }
        }
      }
    },

    "experimental.chat.system.transform": async (_input: { sessionID: string }, output: { system: string[] }) => {
      await initialize();
      const summary = cartographer!.generateAtlasSummary();
      if (summary) {
        output.system.push(summary);
      }
    },
  };
}
