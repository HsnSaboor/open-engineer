import type { AgentConfig } from "@opencode-ai/sdk";
import { brainstormerAgent } from "./brainstormer";
import { codebaseLocatorAgent } from "./codebase-locator";
import { codebaseAnalyzerAgent } from "./codebase-analyzer";
import { patternFinderAgent } from "./pattern-finder";
import { implementerAgent } from "./implementer";
import { reviewerAgent } from "./reviewer";
import { handoffCreatorAgent } from "./handoff-creator";
import { handoffResumerAgent } from "./handoff-resumer";
import { primaryAgent, PRIMARY_AGENT_NAME } from "./commander";
import { projectInitializerAgent } from "./project-initializer";

export const agents: Record<string, AgentConfig> = {
  [PRIMARY_AGENT_NAME]: primaryAgent,
  brainstormer: brainstormerAgent,
  "codebase-locator": codebaseLocatorAgent,
  "codebase-analyzer": codebaseAnalyzerAgent,
  "pattern-finder": patternFinderAgent,
  implementer: implementerAgent,
  reviewer: reviewerAgent,
  "handoff-creator": handoffCreatorAgent,
  "handoff-resumer": handoffResumerAgent,
  "project-initializer": projectInitializerAgent,
};

export {
  primaryAgent,
  PRIMARY_AGENT_NAME,
  brainstormerAgent,
  codebaseLocatorAgent,
  codebaseAnalyzerAgent,
  patternFinderAgent,
  implementerAgent,
  reviewerAgent,
  handoffCreatorAgent,
  handoffResumerAgent,
  projectInitializerAgent,
};
