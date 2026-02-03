import type { AgentConfig } from "@opencode-ai/sdk";

import { EXPLORER_PROMPT } from "../../prompts/pantheon/explorer";

export const explorerAgent: AgentConfig = {
  description: "Finds files, symbols, and patterns without modifying code.",
  mode: "subagent",
  temperature: 0.1,
  tools: {
    glob: true,
    grep: true,
    read: true,
    ast_grep_search: true,
    look_at: true,
  },
  prompt: EXPLORER_PROMPT,
};
