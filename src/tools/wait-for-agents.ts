import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

import type { SessionMessagesResponse, SessionStatusResponse } from "../types/swarm";
import { isSessionBuiltin } from "../utils/agent-tracker";
import { log } from "../utils/logger";
import type { SwarmManager } from "../utils/swarm-manager";

export function createWaitForAgentsTool(ctx: PluginInput, swarmManager?: SwarmManager) {
  return tool({
    description: `Synchronize and collect results from multiple asynchronously spawned agents.
This tool polls the status of the provided SessionIDs until they are all 'idle', then aggregates their final responses.`,
    args: {
      sessionIDs: tool.schema.array(tool.schema.string()).describe("List of SessionIDs returned by spawn_agent"),
      timeoutMs: tool.schema.number().optional().describe("Timeout in milliseconds (default: 300000)"),
    },
    execute: async (args, _context) => {
      if (isSessionBuiltin(_context.sessionID)) {
        return `## wait_for_agents Not Available\n\nThis tool is not available for built-in agents.`;
      }

      const { sessionIDs, timeoutMs = 300000 } = args;
      const pendingIDs = new Set(sessionIDs);
      const startTime = Date.now();
      let pollCount = 0;

      if (sessionIDs.length === 0) {
        return "## No Sessions Provided\n\nPlease provide at least one SessionID to wait for.";
      }

      await log.info("swarm", `Waiting for ${sessionIDs.length} agents`, { sessionIDs });

      try {
        // 1. Polling Loop with Adaptive Interval
        while (pendingIDs.size > 0) {
          const statusResp = (await ctx.client.session.status({
            query: { directory: ctx.directory },
          })) as unknown as SessionStatusResponse;

          const statuses = statusResp.data || {};

          for (const id of Array.from(pendingIDs)) {
            const status = statuses[id];
            if (!status || status.type === "idle") {
              pendingIDs.delete(id);
            }
          }

          if (pendingIDs.size > 0) {
            if (swarmManager) {
              const summary = swarmManager.getSwarmSummary(_context.sessionID);
              _context.metadata?.({
                title: `🐝 Waiting for ${pendingIDs.size} Agents`,
                metadata: { summary, pending: Array.from(pendingIDs).join(", ") },
              });
            }

            // Adaptive interval: Start fast (500ms), gradually slow down to 2s
            const interval = Math.min(500 + pollCount * 100, 2000);
            await new Promise((resolve) => setTimeout(resolve, interval));
            pollCount++;

            if (Date.now() - startTime > timeoutMs) {
              return `## wait_for_agents Timeout\n\nTimed out after ${timeoutMs}ms while waiting for: ${Array.from(
                pendingIDs,
              ).join(", ")}`;
            }
          }
        }

        // 2. Aggregate Results
        let aggregatedReport = `## Swarm Execution Report\n\n**Total Agents**: ${sessionIDs.length}\n\n---\n\n`;

        for (const id of sessionIDs) {
          try {
            const messagesResp = (await ctx.client.session.messages({
              path: { id },
              query: { directory: ctx.directory },
            })) as unknown as SessionMessagesResponse;

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
              .catch((error) => {
                log.warn("swarm", "Failed to cleanup session", { sessionID: id, error });
              });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            aggregatedReport += `### Session: ${id}\n\n**Error**: Failed to retrieve results: ${error.message}\n\n---\n\n`;
          }
        }

        return aggregatedReport;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await log.error("swarm", "wait_for_agents failed", error instanceof Error ? error : new Error(errorMsg));
        return `## wait_for_agents Failed\n\n**Error**: ${errorMsg}`;
      }
    },
  });
}
