import type { PluginInput } from "@opencode-ai/plugin";

export interface AgentProgress {
  agentName: string;
  taskDescription: string;
  status: "idle" | "busy" | "error" | "running";
  lastTool?: string;
  lastToolArgs?: any;
  thoughtDelta?: string;
  updatedAt: Date;
}

export class SwarmManager {
  private activeAgents = new Map<string, AgentProgress>();
  private parentToChildren = new Map<string, Set<string>>();
  private ctx: PluginInput;

  constructor(ctx: PluginInput) {
    this.ctx = ctx;
  }

  registerSubagent(sessionID: string, parentID: string, agentName: string, taskDescription: string) {
    this.activeAgents.set(sessionID, {
      agentName,
      taskDescription,
      status: "running",
      updatedAt: new Date(),
    });

    if (!this.parentToChildren.has(parentID)) {
      this.parentToChildren.set(parentID, new Set());
    }
    this.parentToChildren.get(parentID)!.add(sessionID);

    this.updateStatusBoard(parentID);
  }

  async updateProgress(sessionID: string, update: Partial<AgentProgress>) {
    const progress = this.activeAgents.get(sessionID);
    if (progress) {
      const oldStatus = progress.status;
      Object.assign(progress, { ...update, updatedAt: new Date() });

      // Find parent to update dashboard
      const parentID = this.getParentID(sessionID);
      if (parentID) {
        if (update.status && update.status !== oldStatus) {
          this.updateStatusBoard(parentID);
        }
      }
    }
  }

  getSwarmSummary(parentID: string): string {
    const childrenIDs = this.parentToChildren.get(parentID);
    if (!childrenIDs || childrenIDs.size === 0) return "No active agents.";

    const children = Array.from(childrenIDs)
      .map((id) => this.activeAgents.get(id))
      .filter(Boolean) as AgentProgress[];

    const busy = children.filter((c) => c.status === "busy" || c.status === "running").length;
    const idle = children.filter((c) => c.status === "idle").length;
    const error = children.filter((c) => c.status === "error").length;

    return `🐝 Swarm: ${busy} Busy, ${idle} Done${error > 0 ? `, ${error} Error` : ""}`;
  }

  getSwarmDashboard(parentID: string): string {
    const childrenIDs = this.parentToChildren.get(parentID);
    if (!childrenIDs || childrenIDs.size === 0) return "### 🐝 Swarm Status\nNo active subagents.";

    let md = `### 🐝 Swarm Dashboard\n\n`;
    md += "| Agent | Status | Current Task | Last Action |\n";
    md += "| :--- | :--- | :--- | :--- |\n";

    const sortedChildren = Array.from(childrenIDs).sort();
    for (const childID of sortedChildren) {
      const p = this.activeAgents.get(childID);
      if (p) {
        const statusIcon = p.status === "busy" || p.status === "running" ? "⏳" : p.status === "error" ? "❌" : "✅";
        const toolInfo = p.lastTool ? `\`${p.lastTool}\`` : "Thinking...";
        md += `| ${p.agentName} | ${statusIcon} ${p.status} | ${p.taskDescription} | ${toolInfo} |\n`;
      }
    }
    md += "\n> Press `<Leader>+Right` or `Ctrl+Right` to switch to subagent sessions.";
    return md;
  }

  async updateStatusBoard(parentID: string) {
    const summary = this.getSwarmSummary(parentID);
    await this.ctx.client.tui
      .showToast({
        body: {
          title: "Swarm Status Update",
          message: summary,
          variant: "info",
        },
      })
      .catch(() => {});

    // Post dashboard to chat for persistence
    const dashboard = this.getSwarmDashboard(parentID);
    await this.ctx.client.session
      .prompt({
        path: { id: parentID },
        body: {
          parts: [{ type: "text", text: dashboard }] as any,
          noReply: true,
        },
      })
      .catch(() => {});
  }

  cleanupSession(sessionID: string) {
    this.activeAgents.delete(sessionID);
    for (const [parent, children] of this.parentToChildren.entries()) {
      if (children.delete(sessionID)) {
        if (children.size === 0) this.parentToChildren.delete(parent);
        this.updateStatusBoard(parent);
        break;
      }
    }
  }

  getParentID(sessionID: string): string | undefined {
    for (const [parent, children] of this.parentToChildren.entries()) {
      if (children.has(sessionID)) return parent;
    }
    return undefined;
  }
}
