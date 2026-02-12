import type { PluginInput } from "@opencode-ai/plugin";

import { log } from "./logger";

export async function fetchSessionModel(ctx: PluginInput, sessionID: string) {
  if (!sessionID || sessionID === "{id}" || sessionID.startsWith("{")) return undefined;

  try {
    const resp = (await ctx.client.session.messages({
      path: { id: sessionID },
      query: { directory: ctx.directory },
    })) as {
      data?: Array<{
        info?: {
          role: string;
          providerID?: string;
          modelID?: string;
          model?: { providerID: string; modelID: string };
        };
      }>;
    };

    const messages = resp.data || [];
    const lastMsg = messages[messages.length - 1]?.info;

    if (lastMsg) {
      if (lastMsg.role === "assistant" && lastMsg.providerID && lastMsg.modelID) {
        return { providerID: lastMsg.providerID, modelID: lastMsg.modelID };
      }
      if (lastMsg.role === "user" && lastMsg.model) {
        return lastMsg.model;
      }
    }
  } catch (error: unknown) {
    log.error("session", "Failed to fetch model", error);
  }
  return undefined;
}
