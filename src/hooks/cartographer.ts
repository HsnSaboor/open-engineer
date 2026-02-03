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
    "tool.execute.after": async (input: { tool: string; args?: any }, output: any) => {
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

    "chat.params": async (
      input: { sessionID: string },
      output: { options?: Record<string, unknown>; system?: any },
    ) => {
      await initialize();
      const summary = cartographer!.generateAtlasSummary();
      if (summary) {
        if (Array.isArray(output.system)) {
          output.system.push(summary);
        } else if (typeof output.system === "string") {
          output.system += `\n\n${summary}`;
        } else {
          output.system = summary;
        }
      }
    },
  };
}
