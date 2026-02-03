import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

import { GitAtomicManager } from "../utils/gsd-git";
import { GsdSpecManager } from "../utils/gsd-specs";

export function createGsdTools(ctx: PluginInput) {
  const specManager = new GsdSpecManager(ctx.directory);
  const gitManager = new GitAtomicManager(ctx.directory);

  return {
    gsd_init: tool({
      description:
        "Initialize the GSD Spec Stack (PROJECT.md, REQUIREMENTS.md, ROADMAP.md). Use this if they are missing.",
      args: {},
      execute: async () => {
        await specManager.ensureSpecDirs();

        const logs: string[] = [];

        // Check/Create PROJECT.md
        if (!(await specManager.getProjectSpec())) {
          await specManager.createProjectSpecTemplate();
          logs.push("Created PROJECT.md");
        }

        // We'll skip complex existence checks for others and just create if missing
        // (Simplified for this implementation)
        await specManager.createRequirementsTemplate();
        logs.push("Ensured REQUIREMENTS.md template");

        await specManager.createRoadmapTemplate();
        logs.push("Ensured ROADMAP.md template");

        return `GSD Specs initialized:\n- ${logs.join("\n- ")}`;
      },
    }),

    gsd_save_plan: tool({
      description: "Save an XML plan for a specific phase.",
      args: {
        phase: tool.schema.number().describe("Phase number"),
        plan_xml: tool.schema.string().describe("The full XML plan content"),
      },
      execute: async (args) => {
        await specManager.ensureSpecDirs();
        await specManager.savePlan(args.phase, args.plan_xml);
        return `Saved plan for Phase ${args.phase}.`;
      },
    }),

    gsd_atomic_commit: tool({
      description: "Execute an atomic task commit with verification. AUTO-COMMITS if verify passes.",
      args: {
        phase: tool.schema.string().describe("Phase number (e.g. '1')"),
        taskId: tool.schema.string().describe("Task ID (e.g. 't1')"),
        description: tool.schema.string().describe("Task description for commit message"),
        verifyCmd: tool.schema.string().describe("Command to verify the changes (e.g. 'npm test', 'tsc', 'echo ok')"),
      },
      execute: async (args) => {
        const result = await gitManager.verifyAndCommit(args.phase, args.taskId, args.description, args.verifyCmd);
        if (result.success) {
          return `✅ SUCCESS: ${result.message}`;
        } else {
          return `❌ FAILURE: ${result.message}\n\nPlease Fix the code and try again.`;
        }
      },
    }),
  };
}
