import { parseWorkflowRepositoryGrants } from "../workflow/index.ts";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  createNodeDatabase: vi.fn(),
  createWorkflowRepository: vi.fn(),
  createOmpCliAdapter: vi.fn(),
  createLocalWayfinderExecutionAdapter: vi.fn(),
  createWorkflowRuntime: vi.fn(),
}));

vi.mock("@darkfactory/db/server", () => ({
  createNodeDatabase: mocks.createNodeDatabase,
}));

vi.mock("./workflow-repository.ts", () => ({
  createWorkflowRepository: mocks.createWorkflowRepository,
}));

vi.mock("./omp.ts", () => ({
  OmpProcessTerminationError: class OmpProcessTerminationError extends Error {},
  OMP_VERIFIER_COMMAND_IDENTITY: "darkfactory-verify-core-v2",
  createOmpCliAdapter: mocks.createOmpCliAdapter,
}));

vi.mock("./wayfinder.ts", () => ({
  createLocalWayfinderExecutionAdapter:
    mocks.createLocalWayfinderExecutionAdapter,
}));

vi.mock("./workflow-runtime.ts", () => ({
  createWorkflowRuntime: mocks.createWorkflowRuntime,
}));

import { createPilotWorker, runPilotWorkerMain } from "./pilot-worker.ts";

const VERIFIER_IMAGE_DIGEST = `sha256:${"a".repeat(64)}`;

describe("pilot worker default dependencies", () => {
  it("constructs the database, repository, adapter, and runtime with bounded defaults", async () => {
    const database = { db: {} as never, close: mocks.close };
    const repository = {} as never;
    const adapter = {} as never;
    const wayfinderAdapter = {} as never;
    const runtime = {
      application: {} as never,
      runOnce: vi.fn(async () => []),
      stop: vi.fn(async () => undefined),
    };
    mocks.createNodeDatabase.mockReturnValue(database);
    mocks.createWorkflowRepository.mockReturnValue(repository);
    mocks.createOmpCliAdapter.mockReturnValue(adapter);
    mocks.createLocalWayfinderExecutionAdapter.mockReturnValue(
      wayfinderAdapter
    );
    mocks.createWorkflowRuntime.mockReturnValue(runtime);

    const worker = await createPilotWorker({
      connectionString: "postgresql://localhost/darkfactory",
      repositoriesRoot: "/srv/repositories",
      leaseOwner: "pilot-defaults",
      pollIntervalMs: 60_000,
      shutdownTimeoutMs: 1000,
      repositoryGrants: parseWorkflowRepositoryGrants("owner-1=darkfactory"),
      verifierId: "darkfactory-verify-core-v2",
      verifierImageDigest: VERIFIER_IMAGE_DIGEST,
      modelGateway: null,
    });
    const running = worker.start();
    await vi.waitFor(() => expect(runtime.runOnce).toHaveBeenCalledOnce());
    await worker.stop();
    await running;

    expect(mocks.createNodeDatabase).toHaveBeenCalledWith({
      connectionString: "postgresql://localhost/darkfactory",
      maxConnections: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    expect(mocks.createWorkflowRepository).toHaveBeenCalledWith(database.db);
    expect(mocks.createOmpCliAdapter).toHaveBeenCalledWith({
      repositoriesRoot: "/srv/repositories",
      shutdownTimeoutMs: 500,
      verifierId: "darkfactory-verify-core-v2",
      verifierImageDigest: VERIFIER_IMAGE_DIGEST,
    });
    expect(mocks.createLocalWayfinderExecutionAdapter).toHaveBeenCalledWith({
      omp: adapter,
      repositoriesRoot: "/srv/repositories",
    });
    expect(mocks.createWorkflowRuntime).toHaveBeenCalledWith({
      repository,
      adapter,
      wayfinderAdapter,
      leaseOwner: "pilot-defaults",
      authorizeRepository: expect.any(Function),
    });
    return expect(mocks.close).toHaveBeenCalledOnce();
  });

  return it("propagates a polling failure through the environment-driven main entrypoint", async () => {
    const pollingError = new Error("polling failed");
    mocks.createNodeDatabase.mockReturnValue({
      db: {} as never,
      close: mocks.close,
    });
    mocks.createWorkflowRepository.mockReturnValue({} as never);
    mocks.createOmpCliAdapter.mockReturnValue({} as never);
    mocks.createWorkflowRuntime.mockReturnValue({
      application: {} as never,
      runOnce: vi.fn(async () => {
        throw pollingError;
      }),
      stop: vi.fn(async () => undefined),
    });

    await expect(
      runPilotWorkerMain({
        DATABASE_URL: "postgresql://localhost/darkfactory",
        WORKFLOW_REPOSITORIES_ROOT: "/srv/repositories",
        WORKFLOW_LEASE_OWNER: "pilot-main",
        WORKFLOW_POLL_INTERVAL_MS: "1",
        WORKFLOW_SHUTDOWN_TIMEOUT_MS: "100",
        WORKFLOW_REPOSITORY_GRANTS: "owner-1=darkfactory",
        WORKFLOW_VERIFIER_ID: "darkfactory-verify-core-v2",
        WORKFLOW_VERIFIER_IMAGE_DIGEST: VERIFIER_IMAGE_DIGEST,
        WORKFLOW_OMP_GATEWAY_URL: "http://127.0.0.1:4010",
        WORKFLOW_OMP_GATEWAY_TOKEN_FILE: "/srv/gateway/token",
        WORKFLOW_OMP_MODEL: "anthropic/claude-sonnet-5",
      })
    ).rejects.toBe(pollingError);
    expect(mocks.createOmpCliAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        modelGateway: {
          url: "http://127.0.0.1:4010",
          tokenFile: "/srv/gateway/token",
          model: "anthropic/claude-sonnet-5",
        },
      })
    );
    return expect(mocks.close).toHaveBeenCalled();
  });
});
