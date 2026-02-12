// src/utils/logger.ts
import type { createOpencodeClient } from "@opencode-ai/sdk";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

let opencodeClient: OpencodeClient | null = null;

export function setLoggerClient(client: OpencodeClient): void {
  opencodeClient = client;
}

export function clearLoggerClient(): void {
  opencodeClient = null;
}

function safeLog(
  level: "debug" | "info" | "warn" | "error",
  module: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!opencodeClient) return;

  const logBody = {
    service: module,
    level,
    message,
    extra: extra ?? {},
  };

  opencodeClient.app.log({ body: logBody }).catch((err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Logger Failed] ${level}: ${message}`, errorMessage);
  });
}

export const log = {
  debug(module: string, message: string, extra?: Record<string, unknown>): void {
    if (!process.env.DEBUG) return;
    safeLog("debug", module, message, extra);
  },

  info(module: string, message: string, extra?: Record<string, unknown>): void {
    safeLog("info", module, message, extra);
  },

  warn(module: string, message: string, extra?: Record<string, unknown>): void {
    safeLog("warn", module, message, extra);
  },

  error(module: string, message: string, error?: unknown): void {
    const extra =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : typeof error === "object" && error !== null && !(error instanceof Error)
          ? (error as Record<string, unknown>)
          : { error: String(error) };
    safeLog("error", module, message, extra);
  },
};
