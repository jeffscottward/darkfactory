import { isAbsolute } from "node:path";
import { requireRole } from "@darkfactory/auth/server";
import { composeDatabaseProfile } from "@darkfactory/config/database";
import { parseServerEnv } from "@darkfactory/config/server";
import { createRequestDatabase } from "@darkfactory/db/server";
import { createWorkflowRepository } from "@darkfactory/jobs/server/workflow-repository";
import {
  createOperatorContext,
  createOperatorWayfinderWorkflowService,
  createOperatorWorkflowPort,
  handleOperatorRequest,
} from "@darkfactory/operator/server";
import {
  isWorkflowRepositoryGranted,
  parseWorkflowRepositoryGrants,
} from "@darkfactory/state/workflow";

import {
  createOperatorAuthForDatabase,
  type OperatorBackgroundTaskScheduler,
} from "../../../../server/operator-auth.ts";
import {
  assertLocalOperatorEnvironment,
  isOperatorMutationDenied,
} from "../../../../server/operator-environment.ts";

const SUPPORTED_METHODS = Object.freeze(["GET", "POST"] as const);

const methodNotAllowedResponse = (): Response => {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: SUPPORTED_METHODS.join(", ") },
  });
};

const forbiddenResponse = (): Response => {
  return Response.json({ error: "Forbidden" }, { status: 403 });
};

const repositoriesRoot = (): string => {
  const configured = process.env["WORKFLOW_REPOSITORIES_ROOT"]?.trim();
  if (
    configured === undefined ||
    configured.length === 0 ||
    !isAbsolute(configured)
  ) {
    throw new TypeError(
      "WORKFLOW_REPOSITORIES_ROOT must be an absolute directory"
    );
  }
  return configured;
};

export const handleOperatorOrpcRequest = async (
  request: Request
): Promise<Response> => {
  const method = request.method.toUpperCase();
  if (
    !SUPPORTED_METHODS.includes(method as (typeof SUPPORTED_METHODS)[number])
  ) {
    return methodNotAllowedResponse();
  }
  if (isOperatorMutationDenied(request)) return forbiddenResponse();

  const env = parseServerEnv(process.env);
  assertLocalOperatorEnvironment(env);
  const workflowRepositoriesRoot = repositoriesRoot();
  const databaseProfile = composeDatabaseProfile(env);
  const database = await createRequestDatabase({
    connectionString: databaseProfile.connection.connectionString,
  });
  const pendingTasks = new Set<Promise<unknown>>();
  const scheduleBackgroundTask: OperatorBackgroundTaskScheduler = (task) => {
    let observed: Promise<unknown>;
    observed = task
      .catch(() => undefined)
      .finally(() => pendingTasks.delete(observed));
    return pendingTasks.add(observed);
  };

  try {
    const grants =
      env.WORKFLOW_REPOSITORY_GRANTS === undefined
        ? Object.freeze([])
        : parseWorkflowRepositoryGrants(env.WORKFLOW_REPOSITORY_GRANTS);
    const auth = createOperatorAuthForDatabase(
      database.db,
      env,
      scheduleBackgroundTask
    );
    const repository = createWorkflowRepository(database.db);
    const authorizeRepository = (
      ownerId: string,
      repositoryId: string
    ): boolean => {
      return isWorkflowRepositoryGranted(grants, ownerId, repositoryId);
    };
    const workflowOperator = createOperatorWorkflowPort({
      repository,
      authorizeRepository,
    });
    const wayfinder = createOperatorWayfinderWorkflowService({
      repository,
      authorizeRepository,
      omp: { repositoriesRoot: workflowRepositoriesRoot },
    });
    const context = createOperatorContext(request, {
      workflowOperator,
      wayfinder,
      requireSession: (headers) => requireRole(auth, headers, "admin"),
    });
    return await handleOperatorRequest(request, context);
  } finally {
    while (pendingTasks.size > 0) {
      await Promise.allSettled([...pendingTasks]);
    }
    await database.close();
  }
};
