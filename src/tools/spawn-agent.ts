import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

interface SessionCreateResponse {
  data?: { id?: string };
}

interface MessagePart {
  type: string;
  text?: string;
}

interface SessionMessage {
  info?: {
    role?: "user" | "assistant";
    providerID?: string;
    modelID?: string;
    model?: { providerID: string; modelID: string };
  };
  parts?: MessagePart[];
}

interface SessionMessagesResponse {
  data?: SessionMessage[];
}

export function createSpawnAgentTool(ctx: PluginInput) {
  return tool({
    description: `Spawn a subagent to execute a task asynchronously. The tool returns a sessionID immediately.
Use this when you are a COMMANDER or a SUBAGENT (executor, planner, project-initializer, mm-orchestrator) and need to spawn other specialists.
For parallel execution, call spawn_agent multiple times in ONE message, then use wait_for_agents to collect results.`,
    args: {
      agent: tool.schema
        .string()
        .describe("Agent to spawn (e.g., 'explorer', 'fixer', 'oracle', 'implementer', 'reviewer', 'librarian')"),
      prompt: tool.schema.string().describe("Full prompt/instructions for the agent"),
      description: tool.schema.string().describe("Short description of the task"),
    },
    execute: async (args, context) => {
      const { agent, prompt, description } = args;

      try {
        // Fetch parent session's last message to inherit the model
        const parentMessagesResp = (await ctx.client.session.messages({
          path: { id: context.sessionID },
          query: { directory: ctx.directory },
        })) as SessionMessagesResponse;

        const parentMessages = parentMessagesResp.data || [];
        const lastMsg = parentMessages[parentMessages.length - 1]?.info;

        let model: { providerID: string; modelID: string } | undefined;

        if (lastMsg) {
          if (lastMsg.role === "assistant" && lastMsg.providerID && lastMsg.modelID) {
            model = { providerID: lastMsg.providerID, modelID: lastMsg.modelID };
          } else if (lastMsg.role === "user" && lastMsg.model) {
            model = lastMsg.model;
          }
        }

        // Create new session for the subagent
        const sessionResp = (await ctx.client.session.create({
          body: {
            parentID: context.sessionID,
            title: `Subagent: ${agent} - ${description}`,
          },
          query: { directory: ctx.directory },
        })) as SessionCreateResponse;

        const sessionID = sessionResp.data?.id;
        if (!sessionID) {
          return `## spawn_agent Failed\n\nFailed to create session for agent "${agent}"`;
        }

        // Run the prompt asynchronously (returns immediately)
        await ctx.client.session.promptAsync({
          path: { id: sessionID },
          body: {
            parts: [{ type: "text", text: prompt }] as any,
            agent: agent,
            model: model as any, // Inherit model from parent
          },
          query: { directory: ctx.directory },
        });

        return `## Session Triggered\n\n**Agent**: ${agent}\n**Task**: ${description}\n**SessionID**: ${sessionID}\n\n*Use wait_for_agents with this SessionID to collect results.*`;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `## spawn_agent Failed\n\n**Agent**: ${agent}\n**Error**: ${errorMsg}`;
      }
    },
  });
}
