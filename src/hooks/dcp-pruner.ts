import type { PluginInput } from "@opencode-ai/plugin";

import { loadMicodeConfig } from "../config-loader";
import { type Message, PruningManager } from "../utils/context-pruning";
import { log } from "../utils/logger";

export function createDcpPrunerHook(ctx: PluginInput) {
  let pruningManager: PruningManager | null = null;
  let isEnabled = false;
  // Cache history map per session to inject it in chat.params/system.transform
  const historyMaps = new Map<string, string>();

  async function initialize() {
    const config = await loadMicodeConfig(ctx.directory);
    if (config?.dcp?.enabled) {
      isEnabled = true;
      pruningManager = new PruningManager(ctx.directory, config.dcp.strategies, config.dcp.protectedTools);
    } else {
      isEnabled = false;
      pruningManager = null;
    }
  }

  return {
    "experimental.chat.messages.transform": async (input: any, output: { messages: unknown[] }) => {
      await initialize();

      if (!isEnabled || !pruningManager || !input.sessionID) {
        return;
      }

      const sessionID = input.sessionID as string;

      try {
        // Cast to our Message type
        const messages = output.messages as Message[];
        // Now await the async method
        const prunedMessages = await pruningManager.pruneMessages(sessionID, messages);

        // Update in place
        output.messages = prunedMessages;

        // Generate History Map
        const historyMap = pruningManager.generateHistoryMap(prunedMessages);
        historyMaps.set(sessionID, historyMap);

        // Save ID mapping for tools
        await pruningManager.saveIdMapping(sessionID, prunedMessages);

        await log.debug("dcp", "Pruning pass completed", {
          messageCount: output.messages.length,
          historyMapSize: historyMap.length,
        });
      } catch (error) {
        await log.warn("dcp", `Pruning failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },

    "chat.params": async (
      input: { sessionID: string },
      output: { options?: Record<string, unknown>; system?: any },
    ) => {
      if (!isEnabled) return;

      const map = historyMaps.get(input.sessionID);
      if (map) {
        const injection = `\n\n<!-- DCP History Map -->\nHere is the indexed history of tool calls. Use the ID to 'extract' findings or 'discard' noise.\n${map}\n<!-- End Map -->`;

        if (Array.isArray(output.system)) {
          output.system.push(injection);
        } else if (typeof output.system === "string") {
          output.system += injection;
        } else {
          output.system = injection;
        }
      }
    },
  };
}
