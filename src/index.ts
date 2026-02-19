import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Config, McpLocalConfig, Part, TextPart } from "@opencode-ai/sdk";

import { agents, PRIMARY_AGENT_NAME } from "./agents";
import { loadMicodeConfig, mergeAgentConfigs } from "./config-loader";
import { createArtifactAutoIndexHook } from "./hooks/artifact-auto-index";
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
import { createSkillInjectorHook } from "./hooks/skill-injector";
import { createTokenAwareTruncationHook } from "./hooks/token-aware-truncation";
import { createWorktreeModeHook } from "./hooks/worktree-mode";
import { SkillLoader } from "./skills/loader";
import { artifact_search } from "./tools/artifact-search";
import { ast_grep_replace, ast_grep_search, checkAstGrepAvailable } from "./tools/ast-grep";
import { btca_ask, checkBtcaAvailable } from "./tools/btca";
import { btca_resource_add, btca_resource_list } from "./tools/btca/manage";
import { createCartographyTools } from "./tools/cartography";
import { createGsdTools } from "./tools/gsd";
import { look_at } from "./tools/look-at";
import { createLspTools, LspManager } from "./tools/lsp";
import { milestone_artifact_search } from "./tools/milestone-artifact-search";
import { createPruningTools } from "./tools/pruning";
import { createPtyTools, PTYManager } from "./tools/pty";
import { createSpawnAgentTool } from "./tools/spawn-agent";
import { createWaitForAgentsTool } from "./tools/wait-for-agents";
import { createWisdomTools } from "./tools/wisdom/extract-antipatterns";
import {
  cleanupSession as cleanupAgentSession,
  isBuiltinAgent,
  isSessionBuiltin,
  setSessionAgent,
} from "./utils/agent-tracker";
import { runInternalPrompt } from "./utils/internal-prompt";
import { log, setLoggerClient } from "./utils/logger";
import { getOrGenerateProjectName } from "./utils/project-config";
import { applyWorktreeMode } from "./utils/prompt-transformer";
import { SwarmManager } from "./utils/swarm-manager";

const THINK_KEYWORDS = [
  /\bthink\s*(hard|deeply|carefully|through)\b/i,
  /\bthink\b.*\b(about|on|through)\b/i,
  /\b(deeply|carefully)\s*think\b/i,
  /\blet('s|s)?\s*think\b/i,
];

function detectThinkKeyword(text: string): boolean {
  return THINK_KEYWORDS.some((pattern) => pattern.test(text));
}

function getTextFromParts(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text || "")
    .join(" ");
}

interface CustomHook {
  [key: string]: ((...args: any[]) => any) | undefined;
  cleanup?: (sessionID: string) => void;
  cleanupSession?: (sessionID: string) => void;
}

const openCodeConfigPlugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
  setLoggerClient(ctx.client);

  const MCP_SERVERS: Record<string, McpLocalConfig> = {
    context7: { type: "local", command: ["npx", "-y", "@upstash/context7-mcp@latest"] },
  };

  checkAstGrepAvailable().catch((err: unknown) => {
    log.error("init", "ast-grep check failed", err);
  });
  checkBtcaAvailable().catch((err: unknown) => {
    log.error("init", "btca check failed", err);
  });

  const userConfig = await loadMicodeConfig();
  const thinkModeState = new Map<string, boolean>();
  const toolCallArgs = new Map<string, Record<string, unknown>>();
  const TOOL_CALL_ARGS_MAX = 500;
  const internalSessions = new Set<string>();

  const lspManager = new LspManager();
  const ptyManager = new PTYManager();
  const swarmManager = new SwarmManager(ctx);

  const skillLoader = new SkillLoader(ctx.directory, userConfig?.skillMatcher);
  await skillLoader.init();

  const autoCompactHook: CustomHook = createAutoCompactHook(ctx);
  const contextInjectorHook: CustomHook = createContextInjectorHook(ctx);
  const ledgerLoaderHook: CustomHook = createLedgerLoaderHook(ctx);
  const sessionRecoveryHook: CustomHook = createSessionRecoveryHook(ctx);
  const tokenAwareTruncationHook: CustomHook = createTokenAwareTruncationHook(ctx);
  const contextWindowMonitorHook: CustomHook = createContextWindowMonitorHook(ctx);
  const commentCheckerHook: CustomHook = createCommentCheckerHook(ctx);
  const artifactAutoIndexHook: CustomHook = createArtifactAutoIndexHook(ctx);
  const fileOpsTrackerHook: CustomHook = createFileOpsTrackerHook(ctx);
  const worktreeModeHook = createWorktreeModeHook(ctx);
  const dcpPrunerHook: CustomHook = createDcpPrunerHook(ctx, userConfig);

  // Wire parent resolver so worktree mode propagates from commander to subagent sessions
  worktreeModeHook.setParentResolver((sessionID: string) => swarmManager.getParentID(sessionID));
  const cartographerHook: CustomHook = createCartographerHook(ctx);
  const enforcerHooks: CustomHook = createEnforcerHooks(ctx, lspManager);

  const skillInjectorHook = createSkillInjectorHook(ctx, skillLoader);

  const mindmodelClassifyFn = (classifierPrompt: string, parentSessionID?: string) =>
    runInternalPrompt(ctx, {
      title: "mindmodel-classifier",
      prompt: classifierPrompt,
      parentSessionID,
      internalSessions,
      fallbackResponse: "[]",
    });

  const mindmodelInjectorHook: CustomHook = createMindmodelInjectorHook(ctx, mindmodelClassifyFn);

  const constraintReviewerHook: CustomHook = createConstraintReviewerHook(ctx, (reviewPrompt, parentSessionID) =>
    runInternalPrompt(ctx, {
      title: "constraint-reviewer",
      prompt: reviewPrompt,
      agent: "mm-constraint-reviewer",
      parentSessionID,
      internalSessions,
      fallbackResponse: '{"status": "PASS"}',
    }),
  );

  const spawnAgentTool = createSpawnAgentTool(ctx, swarmManager);
  const waitForAgentsTool = createWaitForAgentsTool(ctx, swarmManager);
  const wisdomTools = createWisdomTools(ctx);

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
      spawn_agent: spawnAgentTool,
      wait_for_agents: waitForAgentsTool,
      ...createPtyTools(ptyManager),
      ...createPruningTools(ctx),
      ...createCartographyTools(ctx),
      ...createGsdTools(ctx),
      ...createLspTools(lspManager),
      ...wisdomTools,
    },

    config: async (config: Config) => {
      config.permission = {
        ...(config.permission || {}),
        edit: "allow",
        bash: "allow",
        webfetch: "allow",
        doom_loop: "allow",
        external_directory: "allow",
      };

      const mergedAgents = await mergeAgentConfigs(agents, userConfig);
      for (const agentName in mergedAgents) {
        const agent = mergedAgents[agentName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (agent) agent.permission = { ...(agent.permission || {}), task: "allow" } as any;
      }

      const transformedAgents = applyWorktreeMode(mergedAgents, userConfig?.worktreeMode ?? true);
      const projectName = getOrGenerateProjectName(ctx.directory);
      if (transformedAgents.researcher?.prompt) {
        transformedAgents.researcher.prompt = transformedAgents.researcher.prompt.replace(
          'tech="project"',
          `tech="${projectName}"`,
        );
      }

      config.agent = {
        ...(config.agent || {}),
        ...Object.fromEntries(Object.entries(transformedAgents).filter(([k]) => k !== PRIMARY_AGENT_NAME)),
        [PRIMARY_AGENT_NAME]: transformedAgents[PRIMARY_AGENT_NAME],
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
        search: { description: "Search past handoffs", agent: "artifact-searcher", template: "Search for: $ARGUMENTS" },
      };
    },

    "chat.message": async (input, output) => {
      if (input.agent) {
        setSessionAgent(input.sessionID, input.agent);
      }

      if (isBuiltinAgent(input.agent)) {
        return;
      }

      const parts = output.parts || [];
      const text = getTextFromParts(parts);

      await worktreeModeHook.detectWorktreeTrigger(input, { parts });
      thinkModeState.set(input.sessionID, detectThinkKeyword(text));
      await Promise.all([
        constraintReviewerHook["chat.message"]?.(input, output),
        skillInjectorHook["chat.message"]?.(input, output),
      ]);
    },

    "chat.params": async (input, output) => {
      if (isBuiltinAgent(input.agent)) {
        return;
      }

      if (thinkModeState.get(input.sessionID)) {
        output.options = { ...(output.options || {}), thinking: { type: "enabled", budget_tokens: 32000 } };
      }
    },

    "experimental.session.compacting": async (input, output) => {
      if (isSessionBuiltin(input.sessionID)) {
        return;
      }

      const fileOps = getFileOps(input.sessionID);
      const readPaths = Array.from(fileOps.read).sort();
      const modifiedPaths = Array.from(fileOps.modified).sort();
      output.prompt = `Create a structured summary for continuing this conversation. Use this EXACT format:\n\n# Session Summary\n\n## Goal\n{Core objective}\n\n## File Operations\n### Read\n${readPaths.map((p) => `- \`${p}\``).join("\n")}\n### Modified\n${modifiedPaths.map((p) => `- \`${p}\``).join("\n")}`;
    },

    "tool.execute.before": async (input, output) => {
      if (isSessionBuiltin(input.sessionID)) {
        if (input.tool === "spawn_agent" || input.tool === "wait_for_agents") {
          throw new Error(
            `Tool '${input.tool}' is not available for built-in OpenCode agents. Use the native Task tool instead.`,
          );
        }
        return;
      }

      // Block spawn_agent/wait_for_agents when effective worktree mode is OFF
      // This handles the runtime @worktree:off case where executor agent config
      // still has spawn_agent: true but the commander's session has worktree OFF
      if (input.tool === "spawn_agent" || input.tool === "wait_for_agents") {
        const effectiveMode = worktreeModeHook.getEffectiveMode(input.sessionID);
        if (effectiveMode === "OFF") {
          throw new Error(
            `Tool '${input.tool}' is not available when worktree mode is OFF. Use the native Task tool instead for parallel delegation.`,
          );
        }
      }

      if (input.callID && output.args) {
        // Enforce bounds on toolCallArgs to prevent unbounded growth
        if (toolCallArgs.size >= TOOL_CALL_ARGS_MAX) {
          const firstKey = toolCallArgs.keys().next().value;
          if (firstKey) toolCallArgs.delete(firstKey);
        }
        toolCallArgs.set(input.callID, output.args);
      }

      if (userConfig?.ui?.showStatusBoard !== false) {
        const parentID = swarmManager.getParentID(input.sessionID);
        if (parentID) {
          swarmManager.updateProgress(input.sessionID, {
            status: "busy",
            lastTool: input.tool,
            lastToolArgs: output.args,
          });
          await ctx.client.tui
            .showToast({
              body: {
                title: `${input.tool} (Subagent)`,
                message: `Agent is running ${input.tool}...`,
                variant: "info",
              },
            })
            .catch((err: unknown) => {
              log.warn(
                "ui",
                "Failed to show toast",
                err instanceof Error ? { error: err.message } : { error: String(err) },
              );
            });
        }
      }

      await worktreeModeHook["tool.execute.before"]?.(input, { args: output.args || {} });
    },

    "tool.execute.after": async (input, output) => {
      if (isSessionBuiltin(input.sessionID)) {
        return;
      }

      const args = toolCallArgs.get(input.callID);

      await Promise.all([
        tokenAwareTruncationHook["tool.execute.after"]?.({ name: input.tool, sessionID: input.sessionID }, output),
        commentCheckerHook["tool.execute.after"]?.({ tool: input.tool, args }, output),
        contextInjectorHook["tool.execute.after"]?.({ tool: input.tool, args }, output),
        artifactAutoIndexHook["tool.execute.after"]?.({ tool: input.tool, args }, output),
        fileOpsTrackerHook["tool.execute.after"]?.({ tool: input.tool, sessionID: input.sessionID, args }, output),
        cartographerHook["tool.execute.after"]?.({ tool: input.tool, args }, output),
        enforcerHooks["tool.execute.after"]?.({ sessionID: input.sessionID, tool: input.tool, args }, output),
        constraintReviewerHook["tool.execute.after"]?.({ tool: input.tool, sessionID: input.sessionID, args }, output),
      ]);

      if (input.callID) toolCallArgs.delete(input.callID);
    },

    "experimental.chat.messages.transform": async (input, output) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionID = (input as any).sessionID || output.messages?.[0]?.info?.sessionID;
      if (!sessionID || isSessionBuiltin(sessionID)) {
        return;
      }

      // SEQUENTIAL: Both hooks mutate output.messages — running in parallel causes TOCTOU races.
      // DCP pruner replaces output.messages entirely; mindmodel injector reads/modifies it.
      await dcpPrunerHook["experimental.chat.messages.transform"]?.(input, output);
      await mindmodelInjectorHook["experimental.chat.messages.transform"]?.(input, output);
    },

    "experimental.chat.system.transform": async (input, output) => {
      if (input.sessionID && isSessionBuiltin(input.sessionID)) {
        return;
      }

      await Promise.all([
        mindmodelInjectorHook["experimental.chat.system.transform"]?.(input, output),
        ledgerLoaderHook["experimental.chat.system.transform"]?.(input, output),
        dcpPrunerHook["experimental.chat.system.transform"]?.(input, output),
        cartographerHook["experimental.chat.system.transform"]?.(input, output),
        contextInjectorHook["experimental.chat.system.transform"]?.(input, output),
        enforcerHooks["experimental.chat.system.transform"]?.(input, output),
        contextWindowMonitorHook["experimental.chat.system.transform"]?.(input, output),
        skillInjectorHook["experimental.chat.system.transform"]?.(input, output),
      ]);

      if (input.sessionID) {
        // Use getEffectiveMode which walks the parent chain to inherit @worktree:off
        // from commander sessions into Task-tool subagent sessions
        const effectiveMode = worktreeModeHook.getEffectiveMode(input.sessionID);
        output.system = output.system || [];

        if (effectiveMode === "AUTO") {
          output.system.push(`[SYSTEM]: Worktree Mode is AUTO. Use native 'question' tool for Sandbox decision.`);
        } else if (effectiveMode === "OFF") {
          // Inject delegation instructions for subagents that inherit OFF from parent
          const instructions = worktreeModeHook.getDelegationInstructions(input.sessionID);
          if (!instructions) {
            // If no direct state exists (subagent session), generate OFF-mode instructions
            output.system.push(
              `[SYSTEM]: Worktree Mode is DISABLED (inherited from parent session). ` +
                `You MUST use the native Task tool for parallel delegation. ` +
                `Do NOT use spawn_agent or wait_for_agents — they are blocked in this mode.`,
            );
          } else {
            output.system.push(instructions);
          }
        }
      }
    },

    event: async ({ event }) => {
      if (event.type === "session.deleted") {
        const properties = event.properties as { info?: { id?: string } };
        const id = properties?.info?.id;
        if (id && typeof id === "string") {
          thinkModeState.delete(id);
          ptyManager.cleanupBySession(id);
          swarmManager.cleanupSession(id);
          constraintReviewerHook.cleanupSession?.(id);
          mindmodelInjectorHook.cleanupSession?.(id);
          enforcerHooks.cleanupSession?.(id);
          worktreeModeHook.cleanupSession(id);
          skillInjectorHook.cleanup(id);
          dcpPrunerHook.cleanup?.(id);
          internalSessions.delete(id);
          cleanupAgentSession(id);
        }
      }

      if (event.type === "session.idle") {
        const properties = event.properties as { sessionID?: string };
        const id = properties?.sessionID;
        if (id && typeof id === "string")
          await swarmManager.updateProgress(id, { status: "idle", lastTool: undefined });
      }

      if (event.type === "message.part.updated") {
        const properties = event.properties as { part?: { sessionID?: string }; delta?: string };
        const sessionID = properties?.part?.sessionID;
        if (sessionID && typeof sessionID === "string" && properties?.delta) {
          if (swarmManager.getParentID(sessionID)) await swarmManager.updateProgress(sessionID, { status: "busy" });
        }
      }

      await Promise.all([
        autoCompactHook.event?.({ event }),
        sessionRecoveryHook.event?.({ event }),
        tokenAwareTruncationHook.event?.({ event }),
        contextWindowMonitorHook.event?.({ event }),
        fileOpsTrackerHook.event?.({ event }),
        worktreeModeHook.event?.({ event }),
      ]);
      lspManager.handleEvent(event);
    },
  };
};

export default openCodeConfigPlugin;
