import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { log } from "./logger";

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
  private rootDir: string;
  private extractions: Map<string, Map<string, string>>; // sessionId -> (toolCallId -> summary)

  constructor(
    rootDir: string,
    strategies: PruningStrategies = {
      deduplication: true,
      supersedeWrites: true,
      errorPurge: { enabled: true, turnsToKeep: 4 },
    },
    protectedTools: string[] = ["task", "todowrite", "todoread"],
  ) {
    this.rootDir = rootDir;
    this.strategies = strategies;
    this.protectedTools = new Set(protectedTools);
    this.extractions = new Map();
  }

  // Helper to load extractions
  private async loadExtractions(sessionId: string) {
    if (this.extractions.has(sessionId)) return;
    try {
      const path = join(this.rootDir, "thoughts", sessionId, "pruning.json");
      if (existsSync(path)) {
        const content = await readFile(path, "utf-8");
        const data = JSON.parse(content);
        this.extractions.set(sessionId, new Map(Object.entries(data)));
      } else {
        this.extractions.set(sessionId, new Map());
      }
    } catch {
      this.extractions.set(sessionId, new Map());
    }
  }

  // Helper to save extractions
  private async saveExtractions(sessionId: string) {
    const map = this.extractions.get(sessionId);
    if (!map) return;
    try {
      const dir = join(this.rootDir, "thoughts", sessionId);
      await mkdir(dir, { recursive: true });
      const path = join(dir, "pruning.json");
      await writeFile(path, JSON.stringify(Object.fromEntries(map), null, 2));
    } catch (e) {
      await log.error("dcp", `Failed to save pruning state for session ${sessionId}:`, e);
    }
  }

  public async registerExtraction(sessionId: string, toolCallId: string, summary: string) {
    await this.loadExtractions(sessionId);
    const map = this.extractions.get(sessionId)!;
    map.set(toolCallId, summary);
    await this.saveExtractions(sessionId);
  }

  public async pruneMessages(sessionId: string, messages: Message[]): Promise<Message[]> {
    await this.loadExtractions(sessionId);
    const manualMap = this.extractions.get(sessionId);

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
    // 0. Apply Manual Extractions first
    if (manualMap) {
      for (const [id, summary] of manualMap.entries()) {
        prunedOutputs.add(id);
        pruningReasons.set(id, `Extracted: ${summary}`);
      }
    }

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
                  // Prune the PREVIOUS output (if not manually extracted already)
                  if (!manualMap?.has(existingId)) {
                    prunedOutputs.add(existingId);
                    pruningReasons.set(existingId, "Deduplicated");
                  }
                }
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
                  if (lastWriteId && lastWriteId !== callId) {
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
                if (!manualMap?.has(callId)) {
                  prunedOutputs.add(callId);
                  pruningReasons.set(callId, "Stale Error");
                }
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
          const reason = pruningReasons.get(part.tool_use_id) || "";
          let newContent = `[Output pruned: ${reason}]`;
          if (reason.startsWith("Extracted: ")) {
            newContent = `[Summary: ${reason.substring(11)}]`;
          }

          return {
            ...part,
            content: newContent,
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

  public async saveIdMapping(sessionId: string, messages: Message[]) {
    const map = new Map<number, string>();
    let count = 1;
    for (const msg of messages) {
      if (msg.info.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "tool_use" && part.tool_use_id) {
            map.set(count, part.tool_use_id);
            count++;
          }
        }
      }
    }

    try {
      const dir = join(this.rootDir, "thoughts", sessionId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "id-map.json"), JSON.stringify(Object.fromEntries(map)));
    } catch (e) {
      await log.error("dcp", `Failed to save ID map for session ${sessionId}:`, e);
    }
  }

  public async getToolIdFromMap(sessionId: string, id: number): Promise<string | null> {
    try {
      const path = join(this.rootDir, "thoughts", sessionId, "id-map.json");
      if (existsSync(path)) {
        const content = await readFile(path, "utf-8");
        const data = JSON.parse(content);
        return data[String(id)] || null;
      }
    } catch {}
    return null;
  }

  public async generateHistoryMap(sessionId: string, messages: Message[]): Promise<string> {
    await this.loadExtractions(sessionId);
    const manualMap = this.extractions.get(sessionId);

    let output = "<history_map>\n";
    let count = 1;

    for (const msg of messages) {
      if (msg.info.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "tool_use" && part.tool_use_id) {
            let paramSummary = "";
            const input = part.input as any;
            if (input?.path) paramSummary = input.path;
            else if (input?.filePath) paramSummary = input.filePath;
            else if (input?.pattern) paramSummary = `"${input.pattern}"`;
            else paramSummary = JSON.stringify(part.input).slice(0, 30);

            let status = "";
            const extraction = manualMap?.get(part.tool_use_id);
            if (extraction) {
              if (extraction.startsWith("[Discarded:")) {
                status = " [Discarded]";
              } else {
                status = " [Extracted]";
              }
            }

            output += `  [${count}] ${part.name}: ${paramSummary}${status}\n`;
            count++;
          }
        }
      }
    }
    output += "</history_map>";
    return output;
  }

  public getToolIdFromIndex(messages: Message[], index: number): string | null {
    let count = 1;
    for (const msg of messages) {
      if (msg.info.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "tool_use" && part.tool_use_id) {
            if (count === index) return part.tool_use_id;
            count++;
          }
        }
      }
    }
    return null;
  }

  private computeHash(name: string, params: Record<string, unknown>): string {
    const keys = Object.keys(params).sort();
    const sortedParams = keys.map((k) => `${k}:${JSON.stringify(params[k])}`).join(",");
    return createHash("sha256").update(`${name}:${sortedParams}`).digest("hex");
  }
}
