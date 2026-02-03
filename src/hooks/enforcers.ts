import type { PluginInput } from "@opencode-ai/plugin";

import type { LspManager } from "../tools/lsp";
import { log } from "../utils/logger";

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

  public getLspErrors(): string {
    return this.lspManager.getErrors();
  }
}

export function createEnforcerHooks(ctx: PluginInput, lspManager: LspManager) {
  const manager = new EnforcerManager(lspManager);

  return {
    "tool.execute.after": async (input: { sessionID: string; tool: string; args?: any }, _output: any) => {
      manager.handleToolExecute(input.sessionID, input.tool, input.args);
    },

    "chat.params": async (input: { sessionID: string }, output: { system?: any }) => {
      // 1. Quality Gate (LSP)
      const errors = manager.getLspErrors();
      let injection = "";

      if (errors) {
        injection += `\n\n<quality-gate>\nCRITICAL: You have active LSP errors. You MUST fix them before proceeding.\n${errors}\n</quality-gate>`;
      }

      // 2. Continuation Enforcer (Todos)
      const pending = manager.getPendingTodos(input.sessionID);
      if (pending.length > 0) {
        injection += `\n\n<continuation-enforcer>\nYou have ${pending.length} pending tasks:\n${pending.map((t) => `- [${t.status}] ${t.content}`).join("\n")}\nDo not stop until these are complete.\n</continuation-enforcer>`;
      }

      if (injection) {
        if (Array.isArray(output.system)) {
          output.system.push(injection);
        } else if (typeof output.system === "string") {
          output.system += injection;
        } else {
          output.system = injection;
        }
      }
    },
  };
}
