import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

interface SessionStatus {
  type: "idle" | "retry" | "busy";
}

interface SessionMessage {
  info?: {
    role?: "user" | "assistant";
  };
  parts?: {
    type: string;
    text?: string;
  }[];
}

interface SessionMessagesResponse {
  data?: SessionMessage[];
}

export function createWaitForAgentsTool(ctx: PluginInput) {
  return tool({
    description: `Synchronize and collect results from multiple asynchronously spawned agents.
This tool polls the status of the provided SessionIDs until they are all 'idle', then aggregates their final responses.`,
    args: {
      sessionIDs: tool.schema.array(tool.schema.string()).describe("List of SessionIDs returned by spawn_agent"),
    },
    execute: async (args, _context) => {
      const { sessionIDs } = args;
      const pendingIDs = new Set(sessionIDs);

      if (sessionIDs.length === 0) {
        return "## No Sessions Provided\n\nPlease provide at least one SessionID to wait for.";
      }

      try {
        // 1. Polling Loop (Indefinite until all idle)
        while (pendingIDs.size > 0) {
          const statusResp = (await ctx.client.session.status({
            query: { directory: ctx.directory },
          })) as { data?: Record<string, SessionStatus> };

          const statuses = statusResp.data || {};

          for (const id of Array.from(pendingIDs)) {
            const status = statuses[id];
            // If session is idle or no longer exists, we consider it done
            if (!status || status.type === "idle") {
              pendingIDs.delete(id);
            }
          }

          if (pendingIDs.size > 0) {
            // Wait 1.5 seconds before next poll to be respectful to the server
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }

        // 2. Aggregate Results
        let aggregatedReport = `## Swarm Execution Report\n\n**Total Agents**: ${sessionIDs.length}\n\n---\n\n`;

        for (const id of sessionIDs) {
          try {
            const messagesResp = (await ctx.client.session.messages({
              path: { id },
              query: { directory: ctx.directory },
            })) as SessionMessagesResponse;

            const messages = messagesResp.data || [];
            const lastAssistant = messages.filter((m) => m.info?.role === "assistant").pop();

            const result =
              lastAssistant?.parts
                ?.filter((p) => p.type === "text" && p.text)
                .map((p) => p.text)
                .join("\n") || "(No response from agent)";

            aggregatedReport += `### Session: ${id}\n\n${result}\n\n---\n\n`;

            // Clean up session
            await ctx.client.session
              .delete({
                path: { id },
                query: { directory: ctx.directory },
              })
              .catch(() => {
                // Ignore cleanup errors
              });
          } catch (err) {
            aggregatedReport += `### Session: ${id}\n\n**Error**: Failed to retrieve results: ${
              err instanceof Error ? err.message : String(err)
            }\n\n---\n\n`;
          }
        }

        return aggregatedReport;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `## wait_for_agents Failed\n\n**Error**: ${errorMsg}`;
      }
    },
  });
}
