// src/utils/logger.ts
import type { OpencodeClient } from "../tools/octto/types";

let opencodeClient: OpencodeClient | null = null;

export function setLoggerClient(client: OpencodeClient): void {
  opencodeClient = client;
}

export const log = {
  debug(module: string, message: string, extra?: object): void {
    if (!process.env.DEBUG || !opencodeClient) return;
    opencodeClient.app
      .log({
        body: { service: module, level: "debug", message, extra: extra as any },
      })
      .catch(() => {});
  },

  info(module: string, message: string, extra?: object): void {
    if (!opencodeClient) return;
    opencodeClient.app
      .log({
        body: { service: module, level: "info", message, extra: extra as any },
      })
      .catch(() => {});
  },

  warn(module: string, message: string, extra?: object): void {
    if (!opencodeClient) return;
    opencodeClient.app
      .log({
        body: { service: module, level: "warn", message, extra: extra as any },
      })
      .catch(() => {});
  },

  error(module: string, message: string, error?: unknown): void {
    if (!opencodeClient) return;
    const extra =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : typeof error === "object"
          ? error
          : { error };
    opencodeClient.app
      .log({
        body: { service: module, level: "error", message, extra: extra as any },
      })
      .catch(() => {});
  },
};
