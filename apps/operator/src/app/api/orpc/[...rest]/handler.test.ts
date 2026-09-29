import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { runtime: "auth" },
  context: { requestId: "operator-request" },
  createOperatorContext: vi.fn(),
  createOperatorWayfinderWorkflowService: vi.fn(),
  createOperatorWorkflowPort: vi.fn(),
  withOperatorRequestScope: vi.fn(),
  createWorkflowRepository: vi.fn(),
  db: { runtime: "database" },
  handleOperatorRequest: vi.fn(async () => new Response("ok")),
  isWorkflowRepositoryGranted: vi.fn(() => true),
  env: vi.fn(),
  parseWorkflowRepositoryGrants: vi.fn(() => [
    { ownerId: "admin-1", repositoryId: "darkfactory" },
  ]),
  repository: { runtime: "workflow-repository" },
  requireRole: vi.fn(async () => ({ principal: { userId: "admin-1" } })),
  workflowOperator: { runtime: "workflow-operator" },
  wayfinder: {
    status: vi.fn(async () => ({
      availability: "installed",
      tracker: "local-markdown",
    })),
    start: vi.fn(async () => ({
      runId: "run-wayfinder-1",
      status: "queued",
      tracker: "local-markdown",
    })),
  },
}));

vi.mock("@darkfactory/auth/server", () => ({ requireRole: mocks.requireRole }));
vi.mock("@darkfactory/jobs/server/workflow-repository", () => ({
  createWorkflowRepository: mocks.createWorkflowRepository,
}));
vi.mock("@darkfactory/operator/server", () => ({
  createOperatorContext: mocks.createOperatorContext,
  createOperatorWorkflowPort: mocks.createOperatorWorkflowPort,
  createOperatorWayfinderWorkflowService:
    mocks.createOperatorWayfinderWorkflowService,
  handleOperatorRequest: mocks.handleOperatorRequest,
}));
vi.mock("@darkfactory/jobs/workflow", () => ({
  isWorkflowRepositoryGranted: mocks.isWorkflowRepositoryGranted,
  parseWorkflowRepositoryGrants: mocks.parseWorkflowRepositoryGrants,
}));
vi.mock("../../../../server/operator-auth.ts", () => ({
  withOperatorRequestScope: mocks.withOperatorRequestScope,
}));

import { handleOperatorOrpcRequest } from "./handler.ts";

describe("standalone operator oRPC composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORKFLOW_REPOSITORIES_ROOT", "/srv/repositories");
    mocks.env.mockReturnValue({
      APP_ENV: "development",
      WORKFLOW_REPOSITORY_GRANTS: "admin-1:darkfactory",
    });
    mocks.withOperatorRequestScope.mockImplementation(
      async (run: (scope: object) => Promise<Response>) =>
        run({ env: mocks.env(), db: mocks.db, auth: mocks.auth })
    );
    mocks.createWorkflowRepository.mockReturnValue(mocks.repository);
    mocks.createOperatorWorkflowPort.mockReturnValue(mocks.workflowOperator);
    mocks.createOperatorWayfinderWorkflowService.mockReturnValue(
      mocks.wayfinder
    );
    mocks.createOperatorContext.mockReturnValue(mocks.context);
    return mocks.handleOperatorRequest.mockResolvedValue(new Response("ok"));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("builds an administrator-only operator context inside the operator request scope", async () => {
    const request = new Request(
      "https://operator.darkfactory.localhost/api/orpc/operator/workspace",
      { headers: { origin: "https://operator.darkfactory.localhost" } }
    );
    const response = await handleOperatorOrpcRequest(request);
    expect(response.status).toBe(200);
    expect(mocks.createWorkflowRepository).toHaveBeenCalledWith(mocks.db);
    expect(mocks.createOperatorWorkflowPort).toHaveBeenCalledWith({
      repository: mocks.repository,
      authorizeRepository: expect.any(Function),
    });
    const workflowOptions = mocks.createOperatorWorkflowPort.mock.calls[0]![0];
    expect(mocks.createOperatorWayfinderWorkflowService).toHaveBeenCalledWith({
      repository: mocks.repository,
      authorizeRepository: workflowOptions.authorizeRepository,
      omp: { repositoriesRoot: "/srv/repositories" },
    });
    const dependencies = mocks.createOperatorContext.mock.calls[0]![1];
    expect(dependencies.wayfinder).toBe(mocks.wayfinder);
    await dependencies.requireSession(
      new Headers({ cookie: "session=opaque" })
    );
    expect(mocks.requireRole).toHaveBeenCalledWith(
      mocks.auth,
      expect.any(Headers),
      "admin"
    );
    expect(mocks.handleOperatorRequest).toHaveBeenCalledWith(
      request,
      mocks.context
    );
    expect(mocks.withOperatorRequestScope).toHaveBeenCalledOnce();
    return expect(mocks.wayfinder.start).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutations before opening a database", async () => {
    const response = await handleOperatorOrpcRequest(
      new Request(
        "https://operator.darkfactory.localhost/api/orpc/operator/runs",
        {
          method: "POST",
          headers: { origin: "https://darkfactory.localhost" },
        }
      )
    );
    expect(response.status).toBe(403);
    return expect(mocks.withOperatorRequestScope).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods without opening a database", async () => {
    const response = await handleOperatorOrpcRequest(
      new Request(
        "https://operator.darkfactory.localhost/api/orpc/operator/workspace",
        { method: "PUT" }
      )
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    return expect(mocks.withOperatorRequestScope).not.toHaveBeenCalled();
  });

  it("fails closed before opening a database when the repository root is missing", async () => {
    vi.stubEnv("WORKFLOW_REPOSITORIES_ROOT", "");
    await expect(
      handleOperatorOrpcRequest(
        new Request(
          "https://operator.darkfactory.localhost/api/orpc/operator/workspace"
        )
      )
    ).rejects.toThrow("WORKFLOW_REPOSITORIES_ROOT");
    return expect(mocks.withOperatorRequestScope).not.toHaveBeenCalled();
  });

  it("uses empty grants and delegates repository authorization", async () => {
    mocks.env.mockReturnValueOnce({
      APP_ENV: "development",
      WORKFLOW_REPOSITORY_GRANTS: undefined,
    });
    mocks.isWorkflowRepositoryGranted.mockReturnValueOnce(false);
    await handleOperatorOrpcRequest(
      new Request(
        "https://operator.darkfactory.localhost/api/orpc/operator/workspace"
      )
    );
    expect(mocks.parseWorkflowRepositoryGrants).not.toHaveBeenCalled();
    const authorizeRepository =
      mocks.createOperatorWorkflowPort.mock.calls[0]![0].authorizeRepository;
    expect(authorizeRepository("admin-1", "darkfactory")).toBe(false);
    return expect(mocks.isWorkflowRepositoryGranted).toHaveBeenCalledWith(
      [],
      "admin-1",
      "darkfactory"
    );
  });

  return it("rejects missing and relative repository roots", async () => {
    vi.stubEnv("WORKFLOW_REPOSITORIES_ROOT", undefined);
    await expect(
      handleOperatorOrpcRequest(
        new Request(
          "https://operator.darkfactory.localhost/api/orpc/operator/workspace"
        )
      )
    ).rejects.toThrow("WORKFLOW_REPOSITORIES_ROOT");

    vi.stubEnv("WORKFLOW_REPOSITORIES_ROOT", "repositories");
    await expect(
      handleOperatorOrpcRequest(
        new Request(
          "https://operator.darkfactory.localhost/api/orpc/operator/workspace"
        )
      )
    ).rejects.toThrow("WORKFLOW_REPOSITORIES_ROOT");
    return expect(mocks.withOperatorRequestScope).not.toHaveBeenCalled();
  });
});
