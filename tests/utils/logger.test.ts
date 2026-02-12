// tests/utils/logger.test.ts
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("logger utility", () => {
  let mockClient: any;
  let logMock: any;

  beforeEach(() => {
    logMock = mock(() => Promise.resolve());
    mockClient = {
      app: {
        log: logMock,
      },
    };
  });

  describe("log.info", () => {
    it("should log with module prefix", async () => {
      const { log, setLoggerClient } = await import("../../src/utils/logger");
      setLoggerClient(mockClient);
      log.info("my-module", "Hello world");
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            service: "my-module",
            level: "info",
            message: "Hello world",
          }),
        }),
      );
    });
  });

  describe("log.warn", () => {
    it("should warn with module prefix", async () => {
      const { log, setLoggerClient } = await import("../../src/utils/logger");
      setLoggerClient(mockClient);
      log.warn("my-module", "Something fishy");
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            service: "my-module",
            level: "warn",
            message: "Something fishy",
          }),
        }),
      );
    });
  });

  describe("log.error", () => {
    it("should error with module prefix", async () => {
      const { log, setLoggerClient } = await import("../../src/utils/logger");
      setLoggerClient(mockClient);
      log.error("my-module", "Something broke");
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            service: "my-module",
            level: "error",
            message: "Something broke",
          }),
        }),
      );
    });

    it("should include error object when provided", async () => {
      const { log, setLoggerClient } = await import("../../src/utils/logger");
      setLoggerClient(mockClient);
      const err = new Error("details");
      log.error("my-module", "Something broke", err);
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            service: "my-module",
            level: "error",
            message: "Something broke",
            extra: expect.objectContaining({
              message: "details",
            }),
          }),
        }),
      );
    });
  });

  describe("log.debug", () => {
    it("should not log when DEBUG is not set", async () => {
      delete process.env.DEBUG;
      const { log, setLoggerClient } = await import("../../src/utils/logger");
      setLoggerClient(mockClient);
      log.debug("my-module", "Debug info");
      expect(logMock).not.toHaveBeenCalled();
    });

    it("should log when DEBUG is set", async () => {
      process.env.DEBUG = "1";
      const { log, setLoggerClient } = await import("../../src/utils/logger");
      setLoggerClient(mockClient);
      log.debug("my-module", "Debug info");
      expect(logMock).toHaveBeenCalled();
    });
  });
});
