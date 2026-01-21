// src/utils/logger.ts
// Standardized logging with module prefixes using OpenCode app.log API
// This prevents logs from leaking into the user's primary chat/TUI area.

import type { OpencodeClient } from "../tools/octto/types";

let opencodeClient: OpencodeClient | null = null;

/**
 * Initialize the logger with the OpenCode client to enable background logging.
 * If not initialized, logs are ignored to prevent leaking into the UI.
 */
export function setLoggerClient(client: OpencodeClient): void {
  opencodeClient = client;
}

/**
 * Logger with standardized [module] prefix format.
 * Uses client.app.log() to redirect to background log files.
 */
export const log = {
  /**
   * Debug level - only outputs when DEBUG environment variable is set.
   */
  async debug(module: string, message: string, extra?: object): Promise<void> {
    if (!process.env.DEBUG) return;

    if (opencodeClient) {
      await opencodeClient.app
        .log({
          body: {
            service: module,
            level: "debug",
            message,
            extra: extra as Record<string, unknown>,
          },
        })
        .catch(() => {});
    }
  },

  /**
   * Info level - general informational messages.
   */
  async info(module: string, message: string, extra?: object): Promise<void> {
    if (opencodeClient) {
      await opencodeClient.app
        .log({
          body: {
            service: module,
            level: "info",
            message,
            extra: extra as Record<string, unknown>,
          },
        })
        .catch(() => {});
    }
  },

  /**
   * Warning level - non-fatal issues.
   */
  async warn(module: string, message: string, extra?: object): Promise<void> {
    if (opencodeClient) {
      await opencodeClient.app
        .log({
          body: {
            service: module,
            level: "warn",
            message,
            extra: extra as Record<string, unknown>,
          },
        })
        .catch(() => {});
    }
  },

  /**
   * Error level - errors that were caught and handled.
   */
  async error(module: string, message: string, error?: unknown): Promise<void> {
    const extra =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : typeof error === "object"
          ? error
          : { error };

    if (opencodeClient) {
      await opencodeClient.app
        .log({
          body: {
            service: module,
            level: "error",
            message,
            extra: extra as Record<string, unknown>,
          },
        })
        .catch(() => {});
    }
  },
};
