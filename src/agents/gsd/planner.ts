import type { AgentConfig } from "@opencode-ai/sdk";

import { PLANNER_PROMPT } from "../../prompts/gsd/planner";

export const plannerAgent: AgentConfig = {
  description: "Generates atomic, XML-structured implementation plans.",
  mode: "subagent",
  temperature: 0.2,
  tools: {
    read: true,
    glob: true,
    gsd_save_plan: true,
    look_at: true,
    atlas_query: true,
  },
  prompt: PLANNER_PROMPT,
};
