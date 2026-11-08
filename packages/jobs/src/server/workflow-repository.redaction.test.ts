import type { DatabaseExecutor } from "@darkfactory/db/server";
import type * as Redaction from "@darkfactory/observability/redaction";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkflowRepository,
  WorkflowPersistenceInputError,
} from "./workflow-repository.ts";

// A file-wide mock and a static import load the repository's module graph
// (drizzle-orm and @darkfactory/db) once, in the import phase. Loading it
// inside a test took 3 s or more on a busy machine, and the test timed out.
const redact = vi.hoisted(() => vi.fn());

vi.mock("@darkfactory/observability/redaction", async (importOriginal) => ({
  ...(await importOriginal<typeof Redaction>()),
  redact,
}));

const repositoryWithRedaction = (redacted: unknown) => {
  redact.mockReturnValue(redacted);
  const execute = vi.fn();
  const database = { execute } as unknown as DatabaseExecutor;
  return { execute, repository: createWorkflowRepository(database) };
};

afterEach(() => {
  redact.mockReset();
});

describe("workflow persistence redaction failures", () => {
  it("rejects a text redaction that does not remain text", async () => {
    const { execute, repository } = repositoryWithRedaction({ redacted: true });

    const failure = repository.failRetainedResource({
      runId: "run-1",
      leaseOwner: "cleanup-worker",
      fence: 2,
      error: "cleanup failed",
    });
    await expect(failure).rejects.toBeInstanceOf(WorkflowPersistenceInputError);
    await expect(failure).rejects.toThrow("cleanup.error must be text");
    return expect(execute).not.toHaveBeenCalled();
  });

  return it("rejects text that expands beyond its limit during redaction", async () => {
    const { execute, repository } = repositoryWithRedaction(
      "x".repeat(4 * 1024 + 1)
    );

    const failure = repository.failRetainedResource({
      runId: "run-1",
      leaseOwner: "cleanup-worker",
      fence: 2,
      error: "cleanup failed",
    });
    await expect(failure).rejects.toBeInstanceOf(WorkflowPersistenceInputError);
    await expect(failure).rejects.toThrow(
      "cleanup.error exceeds its storage limit"
    );
    return expect(execute).not.toHaveBeenCalled();
  });
});
