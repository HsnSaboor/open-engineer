import { createHash } from "node:crypto";

// Define Message types based on usage
export interface MessagePart {
  type: string;
  text?: string;
  tool_use_id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | Array<{ type: string; text?: string }>; // tool_result content can be string or blocks
  is_error?: boolean;
}

export interface Message {
  info: { role: string };
  parts: MessagePart[];
}

interface ToolCallInfo {
  id: string;
  name: string;
  params: Record<string, unknown>;
  status: "success" | "error";
  turnIndex: number;
}

export interface PruningStrategies {
  deduplication?: boolean;
  supersedeWrites?: boolean;
  errorPurge?: {
    enabled: boolean;
    turnsToKeep: number;
  };
}

export class PruningManager {
  private strategies: PruningStrategies;
  private protectedTools: Set<string>;

  constructor(
    strategies: PruningStrategies = {
      deduplication: true,
      supersedeWrites: true,
      errorPurge: { enabled: true, turnsToKeep: 4 },
    },
    protectedTools: string[] = ["task", "todowrite", "todoread"],
  ) {
    this.strategies = strategies;
    this.protectedTools = new Set(protectedTools);
  }

  public pruneMessages(messages: Message[]): Message[] {
    const activeReadHashes = new Map<string, string>(); // hash -> callId
    const fileWrites = new Map<string, string>(); // path -> callId
    const toolCalls = new Map<string, ToolCallInfo>(); // callId -> Info

    const prunedOutputs = new Set<string>(); // callIds whose output should be pruned
    const prunedInputs = new Set<string>(); // callIds whose input should be pruned
    const pruningReasons = new Map<string, string>();

    let currentTurn = 0;

    // First Pass: Index tool calls and turns
    for (const msg of messages) {
      if (msg.info.role === "user") {
        const hasText = msg.parts.some((p) => p.type === "text");
        if (hasText || msg.parts.length === 0) currentTurn++; // Increment turn on user message
      }

      if (msg.info.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "tool_use" && part.tool_use_id) {
            toolCalls.set(part.tool_use_id, {
              id: part.tool_use_id,
              name: part.name || "unknown",
              params: part.input || {},
              status: "success", // Assume success initially
              turnIndex: currentTurn,
            });
          }
        }
      }

      if (msg.info.role === "user") {
        for (const part of msg.parts) {
          if (part.type === "tool_result" && part.tool_use_id) {
            const info = toolCalls.get(part.tool_use_id);
            if (info && part.is_error) {
              info.status = "error";
            }
          }
        }
      }
    }

    // Second Pass: Apply strategies
    // We need to re-iterate or just iterate over indexed calls?
    // Deduplication and Supersede Writes depend on order.
    // So we iterate through the history again.

    // Reset temporary tracking for this pass
    activeReadHashes.clear();
    fileWrites.clear();

    for (const msg of messages) {
      // Assistant: Process Tool Uses
      if (msg.info.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "tool_use" && part.tool_use_id) {
            const callId = part.tool_use_id;
            const name = part.name || "";
            const params = part.input || {};

            // 1. Deduplication (Track Reads)
            if (this.strategies.deduplication && !this.protectedTools.has(name)) {
              if (["ls", "glob", "grep", "read", "lsp_find_references", "lsp_symbols", "ast_search"].includes(name)) {
                const hash = this.computeHash(name, params);
                const existingId = activeReadHashes.get(hash);
                if (existingId) {
                  // Prune the PREVIOUS output
                  prunedOutputs.add(existingId);
                  pruningReasons.set(existingId, "Deduplicated");
                }
                // Update to latest (if we see it again, we prune THIS one's predecessor)
                activeReadHashes.set(hash, callId);
              }
            }

            // 2. Supersede Writes (Track Writes)
            if (this.strategies.supersedeWrites) {
              if (name === "write" || name === "edit") {
                const path = (params as any).filePath || (params as any).path;
                if (path && typeof path === "string") {
                  fileWrites.set(path, callId);
                }
              }
            }
          }
        }
      }

      // User: Process Tool Results
      if (msg.info.role === "user") {
        for (const part of msg.parts) {
          if (part.type === "tool_result" && part.tool_use_id) {
            const callId = part.tool_use_id;
            const info = toolCalls.get(callId);
            if (!info) continue;

            // 2. Supersede Writes (Trigger on Read)
            if (this.strategies.supersedeWrites && !this.protectedTools.has(info.name)) {
              if (["read", "cat"].includes(info.name)) {
                const path = (info.params as any).filePath || (info.params as any).path;
                if (path && typeof path === "string") {
                  const lastWriteId = fileWrites.get(path);
                  // If there is a previous write, and it is not already pruned (to avoid double pruning or confusion)
                  if (lastWriteId && lastWriteId !== callId) {
                    // Prune the INPUT of the write
                    prunedInputs.add(lastWriteId);
                    pruningReasons.set(lastWriteId, `Superseded by read at ${callId}`);
                  }
                }
              }
            }

            // 3. Error Purge
            if (this.strategies.errorPurge?.enabled && info.status === "error") {
              const age = currentTurn - info.turnIndex;
              if (age >= this.strategies.errorPurge.turnsToKeep) {
                prunedOutputs.add(callId);
                pruningReasons.set(callId, "Stale Error");
              }
            }
          }
        }
      }
    }

    // Third Pass: Reconstruct messages
    return messages.map((msg) => {
      const newParts = msg.parts.map((part) => {
        // Prune Output (Tool Result)
        if (part.type === "tool_result" && part.tool_use_id && prunedOutputs.has(part.tool_use_id)) {
          const reason = pruningReasons.get(part.tool_use_id);
          return {
            ...part,
            content: `[Output pruned: ${reason}]`,
          };
        }

        // Prune Input (Tool Use)
        if (part.type === "tool_use" && part.tool_use_id && prunedInputs.has(part.tool_use_id)) {
          const reason = pruningReasons.get(part.tool_use_id);
          const info = toolCalls.get(part.tool_use_id);
          if (info) {
            const newParams = { ...info.params };
            if ("content" in newParams) newParams.content = `[Content pruned: ${reason}]`;
            if ("newString" in newParams) newParams.newString = `[Content pruned: ${reason}]`;
            return {
              ...part,
              input: newParams,
            };
          }
        }

        return part;
      });

      return { ...msg, parts: newParts };
    });
  }

  private computeHash(name: string, params: Record<string, unknown>): string {
    const keys = Object.keys(params).sort();
    const sortedParams = keys.map((k) => `${k}:${JSON.stringify(params[k])}`).join(",");
    return createHash("sha256").update(`${name}:${sortedParams}`).digest("hex");
  }
}
