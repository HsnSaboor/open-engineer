import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MILESTONE_ARTIFACT_TYPES } from "../../../src/indexing/milestone-artifact-classifier";
import { ingestMilestoneArtifact } from "../../../src/indexing/milestone-artifact-ingest";
import { ArtifactIndex } from "../../../src/tools/artifact-index";

describe("milestone artifact ingest error paths", () => {
  let testDir: string;
  let logErrorMock: any;
  let mockClient: any;

  beforeEach(() => {
    testDir = join(tmpdir(), `milestone-error-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Mock logger client
    logErrorMock = mock(() => Promise.resolve());
    mockClient = {
      app: {
        log: logErrorMock,
      },
    };
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("falls back to session when classifier fails", async () => {
    // Setup logger mock
    const { setLoggerClient } = await import("../../../src/utils/logger");
    setLoggerClient(mockClient);

    const index = new ArtifactIndex(testDir);
    await index.initialize();

    try {
      await ingestMilestoneArtifact(
        {
          id: "artifact-err",
          milestoneId: "ms-err",
          sourceSessionId: "session-err",
          createdAt: "2026-01-16T13:00:00Z",
          tags: ["error"],
          payload: "Status update only.",
        },
        index,
        () => {
          throw new Error("classifier failure");
        },
      );

      const results = await index.searchMilestoneArtifacts("status", {
        milestoneId: "ms-err",
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].artifactType).toBe(MILESTONE_ARTIFACT_TYPES.SESSION);
      // Verify logger was called
      expect(logErrorMock).toHaveBeenCalled();
    } finally {
      await index.close();
    }
  });
});
