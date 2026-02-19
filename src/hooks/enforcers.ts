import type { PluginInput } from "@opencode-ai/plugin";

import type { LspManager } from "../tools/lsp";
import { getFileOps } from "./file-ops-tracker";

interface TodoItem {
  id: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  content: string;
}

export class EnforcerManager {
  private todos: Map<string, TodoItem[]> = new Map(); // SessionID -> Todos
  private lspManager: LspManager;

  constructor(lspManager: LspManager) {
    this.lspManager = lspManager;
  }

  public handleToolExecute(sessionID: string, tool: string, args: any) {
    if (tool === "todowrite" && args.todos) {
      this.todos.set(sessionID, args.todos);
    }
  }

  public getPendingTodos(sessionID: string): TodoItem[] {
    const items = this.todos.get(sessionID) || [];
    return items.filter((t) => t.status === "pending" || t.status === "in_progress");
  }

  public getLspErrors(filterPaths?: Set<string>): string {
    return this.lspManager.getErrors(filterPaths);
  }

  public cleanupSession(sessionID: string) {
    this.todos.delete(sessionID);
  }
}

export function createEnforcerHooks(_ctx: PluginInput, lspManager: LspManager) {
  const manager = new EnforcerManager(lspManager);

  return {
    "tool.execute.after": async (input: { sessionID: string; tool: string; args?: any }, _output: any) => {
      manager.handleToolExecute(input.sessionID, input.tool, input.args);
    },

    "experimental.chat.system.transform": async (input: { sessionID: string }, output: { system: string[] }) => {
      // 1. Quality Gate (LSP)
      // Get relevant files for this session (modified + read)
      const ops = getFileOps(input.sessionID);
      const relevantFiles = new Set([...ops.modified, ...ops.read]);

      // If no files touched, don't show any errors (prevents noise from other sessions)
      const errors = manager.getLspErrors(relevantFiles);
      let injection = "";

      if (errors) {
        injection += `\n\n<quality-gate>\nCRITICAL: You have active LSP errors in files you are working on. You MUST fix them before proceeding.\n${errors}\n</quality-gate>`;
      }

      // 2. Continuation Enforcer (Todos)
      const pending = manager.getPendingTodos(input.sessionID);
      if (pending.length > 0) {
        injection += `\n\n<continuation-enforcer>\nYou have ${pending.length} pending tasks:\n${pending.map((t) => `- [${t.status}] ${t.content}`).join("\n")}\nDo not stop until these are complete.\n</continuation-enforcer>`;
      }

      if (injection) {
        output.system.push(injection);
      }
    },

    cleanupSession: (sessionID: string) => {
      manager.cleanupSession(sessionID);
    },
  };
}
