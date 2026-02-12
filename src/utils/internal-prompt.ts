import type { PluginInput } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";

import { log } from "./logger";
import { fetchSessionModel } from "./session";

export async function runInternalPrompt(
  ctx: PluginInput,
  options: {
    title: string;
    prompt: string;
    agent?: string;
    parentSessionID?: string;
    internalSessions: Set<string>;
    fallbackResponse: string;
  },
): Promise<string> {
  let sessionId: string | undefined;
  try {
    const model = options.parentSessionID ? await fetchSessionModel(ctx, options.parentSessionID) : undefined;
    const sessionResult = await ctx.client.session.create({
      body: { title: options.title },
      query: { directory: ctx.directory },
    });

    if (!sessionResult.data?.id) return options.fallbackResponse;
    sessionId = sessionResult.data.id;
    options.internalSessions.add(sessionId);

    const promptResult = await ctx.client.session.prompt({
      path: { id: sessionId },
      query: { directory: ctx.directory },
      body: {
        model: model as { providerID: string; modelID: string },
        agent: options.agent,
        parts: [{ type: "text", text: options.prompt }] as const,
      },
    });

    const parts = (promptResult.data as { parts?: Part[] })?.parts || [];
    return parts
      .filter((p): p is Part & { type: "text" } => p.type === "text" && "text" in p)
      .map((p) => p.text || "")
      .join("");
  } catch (error: unknown) {
    log.error(options.title, `${options.title} failed`, error);
    return options.fallbackResponse;
  } finally {
    if (sessionId) {
      options.internalSessions.delete(sessionId);
      await ctx.client.session.delete({ path: { id: sessionId } }).catch((err: unknown) => {
        log.warn(
          options.title,
          "Failed to delete internal session",
          err instanceof Error ? { error: err.message } : { error: String(err) },
        );
      });
    }
  }
}
