import type { AgentConfig } from "@opencode-ai/sdk";

import { ORACLE_PROMPT } from "../../prompts/pantheon/oracle";

export const oracleAgent: AgentConfig = {
  description: "Critiques plans for performance, security, and maintainability.",
  mode: "subagent",
  temperature: 0.7,
  tools: {
    read: true,
    look_at: true,
  },
  prompt: ORACLE_PROMPT,
};
