import type { DatabaseExecutor } from "@darkfactory/db/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const REDACTION_MODULE = "@darkfactory/observability/redaction";

const repositoryWithRedaction = async (redacted: unknown) => {
  vi.resetModules();
  vi.doMock(REDACTION_MODULE, async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@darkfactory/observability/redaction")
      >();
    return {
      ...actual,
      redact: vi.fn(() => redacted),
    };
  });
  const module = await import("./workflow-repository.ts");
  const execute = vi.fn();
  const database = { execute } as unknown as DatabaseExecutor;
  return {
    execute,
    repository: module.createWorkflowRepository(database),
    WorkflowPersistenceInputError: module.WorkflowPersistenceInputError,
  };
};

afterEach(() => {
  vi.doUnmock(REDACTION_MODULE);
  return vi.resetModules();
});

describe("workflow persistence redaction failures", () => {
  it("rejects a text redaction that does not remain text", async () => {
    const { execute, repository, WorkflowPersistenceInputError } =
      await repositoryWithRedaction({ redacted: true });

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
    const { execute, repository, WorkflowPersistenceInputError } =
      await repositoryWithRedaction("x".repeat(4 * 1024 + 1));

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
