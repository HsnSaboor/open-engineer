import type { PluginInput } from "@opencode-ai/plugin";

import type { MicodeConfig } from "../config-loader";
import { type Message, PruningManager } from "../utils/context-pruning";
import { log } from "../utils/logger";

export function createDcpPrunerHook(ctx: PluginInput, userConfig: MicodeConfig | null) {
  let pruningManager: PruningManager | null = null;
  let isEnabled = false;
  // Cache history map per session to inject it in chat.params/system.transform
  const historyMaps = new Map<string, string>();

  if (userConfig?.dcp?.enabled) {
    isEnabled = true;
    pruningManager = new PruningManager(ctx.directory, userConfig.dcp.strategies, userConfig.dcp.protectedTools);
  }

  return {
    "experimental.chat.messages.transform": async (input: any, output: { messages: unknown[] }) => {
      const sessionID = input.sessionID || (output.messages?.[0] as any)?.info?.sessionID;
      if (!isEnabled || !pruningManager || !sessionID) {
        return;
      }

      try {
        // Cast to our Message type
        const messages = output.messages as Message[];
        // Now await the async method
        const prunedMessages = await pruningManager.pruneMessages(sessionID, messages);

        // Update in place
        output.messages = prunedMessages;

        // Generate History Map
        const historyMap = await pruningManager.generateHistoryMap(sessionID, prunedMessages);
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

    "experimental.chat.system.transform": async (input: { sessionID: string }, output: { system: string[] }) => {
      if (!isEnabled) return;

      const map = historyMaps.get(input.sessionID);
      if (map) {
        const injection = `\n\n<!-- DCP History Map -->\nHere is the indexed history of tool calls. Use the ID to 'extract' findings or 'discard' noise.\n${map}\n<!-- End Map -->`;
        output.system.push(injection);
      }
    },
  };
}
