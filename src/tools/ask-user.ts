import { tool } from "@opencode-ai/plugin/tool";
import type { PluginInput } from "@opencode-ai/plugin";

export function createAskUserTool(ctx: PluginInput) {
  return tool({
    description: `Ask the user a question and wait for their response.
Use this when you need clarification, want to present options, or need user input before proceeding.
The question will be displayed prominently and the user will respond in the chat.`,
    args: {
      question: tool.schema.string().describe("The question to ask the user"),
      options: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Optional list of choices (user can also provide custom answer)"),
      context: tool.schema
        .string()
        .optional()
        .describe("Optional context explaining why you're asking"),
    },
    execute: async (args) => {
      const { question, options, context: questionContext } = args;

      // Build formatted output
      let output = "";

      if (questionContext) {
        output += `**Context:** ${questionContext}\n\n`;
      }

      output += `**Question:** ${question}\n`;

      if (options && options.length > 0) {
        output += "\n**Options:**\n";
        options.forEach((opt, i) => {
          output += `  ${i + 1}. ${opt}\n`;
        });
        output += "\n_(You can pick a number or provide a different answer)_";
      }

      // Show toast to make it visible
      try {
        await ctx.client.tui.showToast({
          body: {
            title: "Question",
            message: question.slice(0, 100) + (question.length > 100 ? "..." : ""),
            variant: "info",
            duration: 5000,
          },
        });
      } catch {
        // Toast failed, continue anyway
      }

      return output;
    },
  });
}
