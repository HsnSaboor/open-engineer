// src/hooks/mindmodel-injector.ts
import type { PluginInput } from "@opencode-ai/plugin";

import {
  buildClassifierPrompt,
  formatExamplesForInjection,
  type LoadedMindmodel,
  loadExamples,
  loadMindmodel,
  parseClassifierResponse,
} from "../mindmodel";
import { log } from "../utils/logger";

type ClassifyFn = (prompt: string) => Promise<string>;

interface MessagePart {
  type: string;
  text?: string;
}

interface MessageWithParts {
  info: { role: string };
  parts: MessagePart[];
}

// Simple hash function for task strings
function hashTask(task: string): string {
  let hash = 0;
  for (let i = 0; i < task.length; i++) {
    const char = task.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

// Simple LRU cache for classified tasks
class LRUCache<V> {
  private cache = new Map<string, V>();
  constructor(private maxSize: number) {}

  get(key: string): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}

export function createMindmodelInjectorHook(ctx: PluginInput, classifyFn: ClassifyFn) {
  let cachedMindmodel: LoadedMindmodel | null | undefined;

  // Pending injection content (shared across hooks for current request)
  let pendingInjection: string | null = null;

  // Flag to prevent recursive classification calls
  let isClassifying = false;

  // LRU cache for classified tasks (supports parallel agents, uses hashed keys)
  const classifiedTasks = new LRUCache<string>(2000);

  async function getMindmodel(): Promise<LoadedMindmodel | null> {
    if (cachedMindmodel === undefined) {
      cachedMindmodel = await loadMindmodel(ctx.directory);
    }
    return cachedMindmodel;
  }

  function extractTaskFromMessages(messages: MessageWithParts[]): string {
    // Get the last user message
    const lastUserMessage = [...messages].reverse().find((m) => m.info.role === "user");
    if (!lastUserMessage) return "";

    // Extract text from parts
    return lastUserMessage.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join(" ");
  }

  return {
    // Hook 1: Extract task from messages and prepare injection
    "experimental.chat.messages.transform": async (
      _input: Record<string, unknown>,
      output: { messages: MessageWithParts[] },
    ) => {
      // Skip if we're already classifying (prevents infinite recursion)
      if (isClassifying) {
        return;
      }

      try {
        const mindmodel = await getMindmodel();
        if (!mindmodel) {
          return;
        }

        const task = extractTaskFromMessages(output.messages);
        if (!task) {
          return;
        }

        // Skip if we've already classified this exact task (use cached result)
        const taskHash = hashTask(task);
        const cachedInjection = classifiedTasks.get(taskHash);
        if (cachedInjection !== undefined) {
          pendingInjection = cachedInjection;
          return;
        }

        // Set flag before classification to prevent recursive calls
        isClassifying = true;

        try {
          await log.info("mindmodel", "Classifying task for injection", { task: task.slice(0, 500) });
          // Classify the task
          const classifierPrompt = buildClassifierPrompt(task, mindmodel.manifest);
          const classifierResponse = await classifyFn(classifierPrompt);
          const categories = parseClassifierResponse(classifierResponse, mindmodel.manifest);

          if (categories.length === 0) {
            await log.debug("mindmodel", "No matching categories found");
            classifiedTasks.set(taskHash, ""); // Cache empty result
            return;
          }

          await log.info("mindmodel", "Matched categories for injection", { categories });

          // Load and format examples
          const examples = await loadExamples(mindmodel, categories);
          if (examples.length === 0) {
            await log.debug("mindmodel", "No examples found for categories", { categories });
            classifiedTasks.set(taskHash, ""); // Cache empty result
            return;
          }

          const formatted = formatExamplesForInjection(examples);

          // Store for the system transform hook and cache for future requests
          pendingInjection = formatted;
          classifiedTasks.set(taskHash, formatted);
          await log.info("mindmodel", "Prepared examples for injection", { count: examples.length });
        } finally {
          // Always reset the flag
          isClassifying = false;
        }
      } catch (error) {
        isClassifying = false;
        await log.warn(
          "mindmodel",
          `Failed to prepare examples: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    },

    // Hook 2: Inject into system prompt
    "experimental.chat.system.transform": async (_input: { sessionID: string }, output: { system: string[] }) => {
      if (!pendingInjection) return;

      // Consume the pending injection
      const injection = pendingInjection;
      pendingInjection = null;

      // Prepend to system prompt
      output.system.unshift(injection);
      await log.debug("mindmodel", "Injected examples into system prompt");
    },
  };
}
