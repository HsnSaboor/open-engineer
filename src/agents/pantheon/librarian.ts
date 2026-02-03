import type { AgentConfig } from "@opencode-ai/sdk";

import { LIBRARIAN_PROMPT } from "../../prompts/pantheon/librarian";

export const librarianAgent: AgentConfig = {
  description: "Indexes directory content and maintains the Atlas.",
  mode: "subagent",
  temperature: 0.1,
  tools: {
    read: true,
    write: true,
    glob: true,
    grep: true,
    look_at: true,
  },
  prompt: LIBRARIAN_PROMPT,
};
