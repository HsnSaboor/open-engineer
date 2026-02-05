import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Config, McpLocalConfig } from "@opencode-ai/sdk";

// Agents
import { agents, PRIMARY_AGENT_NAME } from "./agents";
// Config loader
import { loadMicodeConfig, type MicodeConfig, mergeAgentConfigs } from "./config-loader";
import { createArtifactAutoIndexHook } from "./hooks/artifact-auto-index";
// Hooks
import { createAutoCompactHook } from "./hooks/auto-compact";
import { createCartographerHook } from "./hooks/cartographer";
import { createCommentCheckerHook } from "./hooks/comment-checker";
import { createConstraintReviewerHook } from "./hooks/constraint-reviewer";
import { createContextInjectorHook } from "./hooks/context-injector";
import { createContextWindowMonitorHook } from "./hooks/context-window-monitor";
import { createDcpPrunerHook } from "./hooks/dcp-pruner";
import { createEnforcerHooks } from "./hooks/enforcers";
import { createFileOpsTrackerHook, getFileOps } from "./hooks/file-ops-tracker";
import { createLedgerLoaderHook } from "./hooks/ledger-loader";
import { createMindmodelInjectorHook } from "./hooks/mindmodel-injector";
import { createSessionRecoveryHook } from "./hooks/session-recovery";
import { createTokenAwareTruncationHook } from "./hooks/token-aware-truncation";
import { createWorktreeEnforcerHook } from "./hooks/worktree-enforcer";
import { artifact_search } from "./tools/artifact-search";
// Tools
import { ast_grep_replace, ast_grep_search, checkAstGrepAvailable } from "./tools/ast-grep";
import { btca_ask, checkBtcaAvailable } from "./tools/btca";
import { btca_resource_add, btca_resource_list } from "./tools/btca/manage";
import { createCartographyTools } from "./tools/cartography";
import { createGsdTools } from "./tools/gsd";
import { look_at } from "./tools/look-at";
import { createLspTools, LspManager } from "./tools/lsp";
import { milestone_artifact_search } from "./tools/milestone-artifact-search";
import { createOcttoTools, createSessionStore } from "./tools/octto";
import { createPruningTools } from "./tools/pruning";
// PTY System
import { createPtyTools, PTYManager } from "./tools/pty";
import { createSpawnAgentTool } from "./tools/spawn-agent";
import { createWaitForAgentsTool } from "./tools/wait-for-agents";
import { log, setLoggerClient } from "./utils/logger";
import { getOrGenerateProjectName } from "./utils/project-config";

const OpenCodeConfigPlugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
  // Initialize background logger
  setLoggerClient(ctx.client);

  /**
   * Helper to fetch the model being used by a specific session
   */
  async function fetchSessionModel(sessionID: string) {
    if (!sessionID || sessionID === "{id}" || sessionID.startsWith("{")) return undefined;

    try {
      const resp = (await ctx.client.session.messages({
        path: { id: sessionID },
        query: { directory: ctx.directory },
      })) as any;

      const messages = resp.data || [];
      const lastMsg = messages[messages.length - 1]?.info;

      if (lastMsg) {
        if (lastMsg.role === "assistant" && lastMsg.providerID && lastMsg.modelID) {
          return { providerID: lastMsg.providerID, modelID: lastMsg.modelID };
        }
        if (lastMsg.role === "user" && lastMsg.model) {
          return lastMsg.model as { providerID: string; modelID: string };
        }
      }
    } catch (_error) {
      // Silent fail
    }
    return undefined;
  }

  // Think mode patterns
  const THINK_KEYWORDS = [
    /\bthink\s*(hard|deeply|carefully|through)\b/i,
    /\bthink\b.*\b(about|on|through)\b/i,
    /\b(deeply|carefully)\s*think\b/i,
    /\blet('s|s)?\s*think\b/i,
  ];

  function detectThinkKeyword(text: string): boolean {
    return THINK_KEYWORDS.some((pattern) => pattern.test(text));
  }

  // MCP server configurations
  const MCP_SERVERS: Record<string, McpLocalConfig> = {
    context7: {
      type: "local",
      command: ["npx", "-y", "@upstash/context7-mcp@latest"],
    },
  };

  // Background initialization tasks (non-blocking)
  checkAstGrepAvailable()
    .then((status) => {
      if (!status.available) {
        log.warn("open-engineer", status.message ?? "ast-grep is unavailable");
      }
    })
    .catch(() => {});

  checkBtcaAvailable()
    .then((status) => {
      if (!status.available) {
        log.warn("open-engineer", status.message ?? "btca is unavailable");
      }
    })
    .catch(() => {});

  const configPromise = loadMicodeConfig();
  let userConfig: MicodeConfig | null = null;
  configPromise
    .then((c) => {
      userConfig = c;
    })
    .catch(() => {});

  // Think mode state per session
  const thinkModeState = new Map<string, boolean>();

  // Hooks
  const autoCompactHook = createAutoCompactHook(ctx);
  const contextInjectorHook = createContextInjectorHook(ctx);
  const ledgerLoaderHook = createLedgerLoaderHook(ctx);
  const sessionRecoveryHook = createSessionRecoveryHook(ctx);
  const tokenAwareTruncationHook = createTokenAwareTruncationHook(ctx);
  const contextWindowMonitorHook = createContextWindowMonitorHook(ctx);
  const commentCheckerHook = createCommentCheckerHook(ctx);
  const artifactAutoIndexHook = createArtifactAutoIndexHook(ctx);
  const fileOpsTrackerHook = createFileOpsTrackerHook(ctx);
  const worktreeEnforcerHook = createWorktreeEnforcerHook(ctx);
  const dcpPrunerHook = createDcpPrunerHook(ctx);
  const cartographerHook = createCartographerHook(ctx);

  // LSP & Enforcers
  const lspManager = new LspManager();
  const enforcerHooks = createEnforcerHooks(ctx, lspManager);

  // Track internal sessions
  const internalSessions = new Set<string>();

  // Mindmodel injector hook
  const mindmodelClassifyFn = async (classifierPrompt: string, parentSessionID?: string): Promise<string> => {
    let sessionId: string | undefined;
    try {
      // Inherit model if parent session ID is provided
      const model = parentSessionID ? await fetchSessionModel(parentSessionID) : undefined;

      const sessionResult = await ctx.client.session.create({
        body: { title: "mindmodel-classifier" },
      });

      if (!sessionResult.data?.id) return "[]";
      sessionId = sessionResult.data.id;
      internalSessions.add(sessionId);

      const promptResult = await ctx.client.session.prompt({
        path: { id: sessionId },
        body: {
          model: model as any,
          parts: [{ type: "text", text: classifierPrompt }] as any,
        },
      });

      if (!promptResult.data?.parts) return "[]";

      let responseText = "";
      for (const part of promptResult.data.parts as any[]) {
        if (part.type === "text") responseText += part.text;
      }
      return responseText;
    } catch (_error) {
      return "[]";
    } finally {
      if (sessionId) {
        internalSessions.delete(sessionId);
        await ctx.client.session.delete({ path: { id: sessionId } }).catch(() => {});
      }
    }
  };
  const mindmodelInjectorHook = createMindmodelInjectorHook(ctx, mindmodelClassifyFn);

  // Constraint reviewer hook
  const constraintReviewerHook = createConstraintReviewerHook(
    ctx,
    async (reviewPrompt: string, parentSessionID?: string) => {
      let sessionId: string | undefined;
      try {
        // Inherit model if parent session ID is provided
        const model = parentSessionID ? await fetchSessionModel(parentSessionID) : undefined;

        const sessionResult = await ctx.client.session.create({
          body: { title: "constraint-reviewer" },
        });

        if (!sessionResult.data?.id) return '{"status": "PASS", "violations": [], "summary": "Review skipped"}';
        sessionId = sessionResult.data.id;
        internalSessions.add(sessionId);

        const promptResult = await ctx.client.session.prompt({
          path: { id: sessionId },
          body: {
            model: model as any,
            agent: "mm-constraint-reviewer",
            parts: [{ type: "text", text: reviewPrompt }] as any,
          },
        });

        if (!promptResult.data?.parts) return '{"status": "PASS", "violations": [], "summary": "Empty response"}';

        let responseText = "";
        for (const part of promptResult.data.parts as any[]) {
          if (part.type === "text") responseText += part.text;
        }
        return responseText;
      } catch (_error) {
        return '{"status": "PASS", "violations": [], "summary": "Review failed"}';
      } finally {
        if (sessionId) {
          internalSessions.delete(sessionId);
          await ctx.client.session.delete({ path: { id: sessionId } }).catch(() => {});
        }
      }
    },
  );

  const ptyManager = new PTYManager();
  const ptyTools = createPtyTools(ptyManager);
  const spawn_agent = createSpawnAgentTool(ctx);
  const wait_for_agents = createWaitForAgentsTool(ctx);
  const pruningTools = createPruningTools(ctx);
  const cartographyTools = createCartographyTools(ctx);
  const gsdTools = createGsdTools(ctx);
  const octtoSessionStore = createSessionStore();
  const lspTools = createLspTools(lspManager);

  const octtoSessionsMap = new Map<string, Set<string>>();

  const octtoTools = createOcttoTools(octtoSessionStore, ctx.client, {
    onCreated: (parentSessionId, octtoSessionId) => {
      const sessions = octtoSessionsMap.get(parentSessionId) ?? new Set<string>();
      sessions.add(octtoSessionId);
      octtoSessionsMap.set(parentSessionId, sessions);
    },
    onEnded: (parentSessionId, octtoSessionId) => {
      const sessions = octtoSessionsMap.get(parentSessionId);
      if (!sessions) return;
      sessions.delete(octtoSessionId);
      if (sessions.size === 0) octtoSessionsMap.delete(parentSessionId);
    },
  });

  return {
    tool: {
      ast_grep_search,
      ast_grep_replace,
      btca_ask,
      btca_resource_add,
      btca_resource_list,
      look_at,
      artifact_search,
      milestone_artifact_search,
      spawn_agent,
      wait_for_agents,
      ...ptyTools,
      ...octtoTools,
      ...pruningTools,
      ...cartographyTools,
      ...gsdTools,
      ...lspTools,
    },

    config: async (config: Config) => {
      await configPromise;

      config.permission = {
        ...(config.permission || {}),
        edit: "allow",
        bash: "allow",
        webfetch: "allow",
        doom_loop: "allow",
        external_directory: "allow",
      };

      const mergedAgents = mergeAgentConfigs(agents, userConfig);
      const projectName = getOrGenerateProjectName(ctx.directory);
      if (mergedAgents.researcher?.prompt) {
        mergedAgents.researcher.prompt = mergedAgents.researcher.prompt.replace(
          'tech="project"',
          `tech="${projectName}"`,
        );
      }

      config.agent = {
        ...(config.agent || {}),
        ...Object.fromEntries(Object.entries(mergedAgents).filter(([k]) => k !== PRIMARY_AGENT_NAME)),
        [PRIMARY_AGENT_NAME]: mergedAgents[PRIMARY_AGENT_NAME],
      };

      config.mcp = { ...(config.mcp || {}), ...MCP_SERVERS };

      config.command = {
        ...(config.command || {}),
        init: {
          description: "Initialize project",
          agent: "project-initializer",
          template: "Generate mindmodel for this project. $ARGUMENTS",
        },
        ledger: {
          description: "Update continuity ledger",
          agent: "ledger-creator",
          template: "Update the continuity ledger. $ARGUMENTS",
        },
        search: {
          description: "Search past handoffs",
          agent: "artifact-searcher",
          template: "Search for: $ARGUMENTS",
        },
      };
    },

    "chat.message": async (input: any, output: any) => {
      const text = (output.parts || [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join(" ");
      thinkModeState.set(input.sessionID, detectThinkKeyword(text));
      await (constraintReviewerHook as any)["chat.message"](input, output);
    },

    "chat.params": async (input: any, output: any) => {
      await (ledgerLoaderHook as any)["chat.params"](input, output);
      await (dcpPrunerHook as any)["chat.params"](input, output);
      await (cartographerHook as any)["chat.params"](input, output);
      await (contextInjectorHook as any)["chat.params"](input, output);
      await (enforcerHooks as any)["chat.params"](input, output);
      await (contextWindowMonitorHook as any)["chat.params"](input, output);

      if (thinkModeState.get(input.sessionID)) {
        output.options = { ...(output.options || {}), thinking: { type: "enabled", budget_tokens: 32000 } };
      }
    },

    "experimental.session.compacting": async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ) => {
      const fileOps = getFileOps(input.sessionID);
      const readPaths = Array.from(fileOps.read).sort();
      const modifiedPaths = Array.from(fileOps.modified).sort();

      const fileOpsSection = `
## File Operations
### Read
${readPaths.length > 0 ? readPaths.map((p) => `- \`${p}\``).join("\n") : "- (none)"}

### Modified
${modifiedPaths.length > 0 ? modifiedPaths.map((p) => `- \`${p}\``).join("\n") : "- (none)"}`;

      output.prompt = `Create a structured summary for continuing this conversation. Use this EXACT format:

# Session Summary

## Goal
{The core objective being pursued - one sentence describing success criteria}

## Constraints & Preferences
{Technical requirements, patterns to follow, things to avoid - or "(none)"}

## Progress
### Done
- [x] {Completed items with specific details}

### In Progress
- [ ] {Current work - what's actively being worked on}

### Blocked
- {Issues preventing progress, if any - or "(none)"}

## Key Decisions
- **{Decision}**: {Rationale - why this choice was made}

## Next Steps
1. {Ordered list of what to do next - be specific}

## Critical Context
- {Data, examples, references, or findings needed to continue work}
- {Important discoveries or insights from this session}
${fileOpsSection}

IMPORTANT:
- Preserve EXACT file paths and function names
- Focus on information needed to continue seamlessly
- Be specific about what was done, not vague summaries
- Include any error messages or issues encountered`;
    },

    "tool.execute.before": async (input: any) => {
      const result = await (worktreeEnforcerHook as any)["tool.execute.before"](input);
      if (result?.error) throw new Error(result.error);
    },

    "tool.execute.after": async (input: any, output: any) => {
      await (tokenAwareTruncationHook as any)["tool.execute.after"](
        { name: input.tool, sessionID: input.sessionID },
        output,
      );
      await (commentCheckerHook as any)["tool.execute.after"]({ tool: input.tool, args: input.args }, output);
      await (contextInjectorHook as any)["tool.execute.after"]({ tool: input.tool, args: input.args }, output);
      await (artifactAutoIndexHook as any)["tool.execute.after"]({ tool: input.tool, args: input.args }, output);
      await (fileOpsTrackerHook as any)["tool.execute.after"](
        { tool: input.tool, sessionID: input.sessionID, args: input.args },
        output,
      );
      await (cartographerHook as any)["tool.execute.after"]({ tool: input.tool, args: input.args }, output);
      await (enforcerHooks as any)["tool.execute.after"](
        { sessionID: input.sessionID, tool: input.tool, args: input.args },
        output,
      );
      await (constraintReviewerHook as any)["tool.execute.after"](
        { tool: input.tool, sessionID: input.sessionID, args: input.args },
        output,
      );
    },

    "experimental.chat.messages.transform": async (input: any, output: any) => {
      await (dcpPrunerHook as any)["experimental.chat.messages.transform"](input, output);
      await (mindmodelInjectorHook as any)["experimental.chat.messages.transform"](input, output);
    },

    "experimental.chat.system.transform": async (input: any, output: any) => {
      await (mindmodelInjectorHook as any)["experimental.chat.system.transform"](input, output);
      output.system = (output.system || []).filter((s: any) => {
        if (typeof s === "string" && s.startsWith("Instructions from:")) {
          const path = s.split("\n")[0];
          return !path.includes("CLAUDE.md") && !path.includes("AGENTS.md");
        }
        return true;
      });
    },

    event: async ({ event }: any) => {
      if (event.type === "session.deleted") {
        const id = (event.properties as any)?.info?.id;
        if (id) {
          thinkModeState.delete(id);
          ptyManager.cleanupBySession(id);
          (constraintReviewerHook as any).cleanupSession(id);
          const octtoSessions = octtoSessionsMap.get(id);
          if (octtoSessions) {
            for (const sid of octtoSessions) await octtoSessionStore.endSession(sid).catch(() => {});
            octtoSessionsMap.delete(id);
          }
        }
      }
      await (autoCompactHook as any).event({ event });
      await (sessionRecoveryHook as any).event({ event });
      await (tokenAwareTruncationHook as any).event({ event });
      await (contextWindowMonitorHook as any).event({ event });
      await (fileOpsTrackerHook as any).event({ event });
      lspManager.handleEvent(event);
    },
  } as any;
};

export default OpenCodeConfigPlugin;
