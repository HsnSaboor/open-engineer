import type { AgentConfig } from "@opencode-ai/sdk";

import { FIXER_PROMPT } from "../../prompts/pantheon/fixer";

export const fixerAgent: AgentConfig = {
  description: "Executes a single, well-defined plan with surgical precision.",
  mode: "subagent",
  temperature: 0.2,
  tools: {
    read: true,
    write: true,
    edit: true,
    bash: true,
    ast_grep_replace: true,
  },
  prompt: FIXER_PROMPT,
};
