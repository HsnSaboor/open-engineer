import type { PluginInput } from "@opencode-ai/plugin";

import { loadMicodeConfig } from "../config-loader";
import { type Message, PruningManager } from "../utils/context-pruning";
import { log } from "../utils/logger";

export function createDcpPrunerHook(ctx: PluginInput) {
  let pruningManager: PruningManager | null = null;
  let isEnabled = false;

  async function initialize() {
    // Reload config on every request? Or once?
    // Config might change. But usually loaded once per session or periodically.
    // For simplicity, let's load it here.
    // In `src/index.ts`, `config` hook runs once.
    // But `loadMicodeConfig` reads file.

    const config = await loadMicodeConfig(ctx.directory);
    if (config?.dcp?.enabled) {
      isEnabled = true;
      pruningManager = new PruningManager(config.dcp.strategies, config.dcp.protectedTools);
    } else {
      isEnabled = false;
      pruningManager = null;
    }
  }

  return {
    "experimental.chat.messages.transform": async (
      _input: Record<string, unknown>,
      output: { messages: unknown[] },
    ) => {
      // Re-initialize to pick up config changes if any?
      // Or just initialize once. `initialize` logic above checks `if (pruningManager) return`?
      // No, I removed that check to allow updates.
      // But reading file every message might be slow?
      // `loadMicodeConfig` reads from disk.
      // Let's assume it's fast enough or OS caches it.
      await initialize();

      if (!isEnabled || !pruningManager) {
        return;
      }

      try {
        // Cast to our Message type
        const messages = output.messages as Message[];
        const prunedMessages = pruningManager.pruneMessages(messages);

        // Update in place
        output.messages = prunedMessages;

        await log.debug("dcp", "Pruning pass completed");
      } catch (error) {
        await log.warn("dcp", `Pruning failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    },
  };
}
