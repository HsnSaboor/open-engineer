import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

import { log } from "../../utils/logger";

export function createWisdomTools(ctx: PluginInput) {
  const extractAntipatterns = tool({
    description: "Extracts a learned antipattern from a failure and saves it to the wisdom index for future reference.",
    args: {
      category: tool.schema.string().describe("Category of the antipattern (e.g., 'Async', 'Security', 'Testing')"),
      name: tool.schema.string().describe("Short, descriptive name of the antipattern"),
      context: tool.schema.string().describe("The situation where this antipattern occurs"),
      failure: tool.schema.string().describe("How the system fails or why this is bad"),
      fix: tool.schema.string().describe("The correct approach or fix"),
      badExample: tool.schema.string().optional().describe("Code snippet demonstrating the bad pattern"),
      goodExample: tool.schema.string().optional().describe("Code snippet demonstrating the fix"),
    },
    execute: async (args) => {
      try {
        const { category, name, context: failureContext, failure, fix, badExample, goodExample } = args;

        const wisdomPath = join(ctx.directory, ".mindmodel/ANTIPATTERNS.md");

        // Ensure directory exists
        const dir = dirname(wisdomPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Initialize file if missing
        if (!existsSync(wisdomPath)) {
          writeFileSync(
            wisdomPath,
            "# Antipattern Index\n\n> A living record of lessons learned and mistakes to avoid.\n\n",
          );
        }

        // Format the entry
        let entry = `\n## [${category}]\n### ${name}\n- **Context**: ${failureContext}\n- **Failure**: ${failure}\n- **Fix**: ${fix}\n`;

        if (badExample || goodExample) {
          entry += `- **Example**:\n`;
          if (badExample) {
            entry += `  \`\`\`ts\n  // BAD\n${badExample
              .split("\n")
              .map((l) => "  " + l)
              .join("\n")}\n  \`\`\`\n`;
          }
          if (goodExample) {
            entry += `  \`\`\`ts\n  // GOOD\n${goodExample
              .split("\n")
              .map((l) => "  " + l)
              .join("\n")}\n  \`\`\`\n`;
          }
        }

        // Append to file
        appendFileSync(wisdomPath, entry);

        return `Successfully recorded antipattern: "${name}" in category [${category}]`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("wisdom-tool", "Failed to extract antipattern", error);
        return `Error recording antipattern: ${msg}`;
      }
    },
  });

  return { extract_antipatterns: extractAntipatterns };
}
