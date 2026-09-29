import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { runtime: "better-auth" },
  composeDatabaseProfile: vi.fn(),
  createAuth: vi.fn(),
  openRequestScope: vi.fn(),
  finalize: vi.fn(async () => undefined),
  trackedSchedule: vi.fn(),
  database: { runtime: "database" },
  email: { runtime: "preview-email" },
  parseServerEnv: vi.fn(),
  selectEmailPort: vi.fn(),
}));

vi.mock("@darkfactory/auth/server", () => ({ createAuth: mocks.createAuth }));
vi.mock("@darkfactory/config/database", () => ({
  composeDatabaseProfile: mocks.composeDatabaseProfile,
}));
vi.mock("@darkfactory/config/server", () => ({
  parseServerEnv: mocks.parseServerEnv,
}));
vi.mock("@darkfactory/db/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openRequestScope: mocks.openRequestScope,
}));
vi.mock("@darkfactory/jobs/server/workflow-repository", () => ({
  createWorkflowRepository: vi.fn(),
}));
vi.mock("@darkfactory/operator/server", () => ({}));
vi.mock("@darkfactory/state/workflow", () => ({}));
vi.mock("@darkfactory/email/server", () => ({
  selectEmailPort: mocks.selectEmailPort,
}));

import { RequestDatabaseCapacityError } from "@darkfactory/db/server";
import { handleOperatorAuthRequest } from "../app/api/auth/[...all]/handler.ts";
import { handleOperatorOrpcRequest } from "../app/api/orpc/[...rest]/handler.ts";
import {
  createOperatorAuthForDatabase,
  withOperatorAuth,
  withOperatorRequestScope,
  withOperatorScope,
} from "./operator-auth.ts";
import { OPERATOR_APP_ORIGIN } from "./operator-environment.ts";

describe("operator Better Auth policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuth.mockReturnValue(mocks.auth);
    mocks.selectEmailPort.mockReturnValue(mocks.email);
    mocks.composeDatabaseProfile.mockReset().mockReturnValue({
      connection: { connectionString: "postgres://operator.test/database" },
    });
    mocks.openRequestScope.mockReset().mockResolvedValue({
      db: mocks.database,
      schedule: mocks.trackedSchedule,
      finalize: mocks.finalize,
    });
    return mocks.parseServerEnv.mockReset().mockReturnValue({
      APP_ENV: "development",
      EMAIL_TRANSPORT: "preview",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: "DarkFactory <noreply@domain.test>",
      BETTER_AUTH_SECRET:
        "development-secret-with-at-least-thirty-two-characters",
    });
  });

  it("binds Better Auth and email links to the explicit local operator origin", () => {
    const database = { runtime: "database" };
    const scheduleBackgroundTask = vi.fn();
    const env = {
      APP_ENV: "development",
      EMAIL_TRANSPORT: "preview",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: "DarkFactory <noreply@domain.test>",
      BETTER_AUTH_SECRET:
        "development-secret-with-at-least-thirty-two-characters",
    };
    expect(
      createOperatorAuthForDatabase(
        database as never,
        env as never,
        scheduleBackgroundTask
      )
    ).toBe(mocks.auth);
    expect(mocks.selectEmailPort).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "development",
        trustedAppOrigin: OPERATOR_APP_ORIGIN,
      })
    );
    return expect(mocks.createAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        database,
        baseURL: OPERATOR_APP_ORIGIN,
        trustedOrigins: [OPERATOR_APP_ORIGIN],
        scheduleBackgroundTask,
      })
    );
  });

  it("rejects production before selecting an authentication adapter", () => {
    expect(() =>
      createOperatorAuthForDatabase(
        {} as never,
        { APP_ENV: "production" } as never
      )
    ).toThrow("Operator app is development-only");
    return expect(mocks.selectEmailPort).not.toHaveBeenCalled();
  });

  it("uses the test rate-limit policy and the default background scheduler", () => {
    mocks.createAuth.mockImplementationOnce((options) => {
      options.scheduleBackgroundTask(Promise.resolve());
      return mocks.auth;
    });
    expect(
      createOperatorAuthForDatabase(
        mocks.database as never,
        {
          APP_ENV: "test",
          EMAIL_TRANSPORT: "preview",
          RESEND_API_KEY: undefined,
          EMAIL_FROM: "DarkFactory <noreply@domain.test>",
          BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
        } as never
      )
    ).toBe(mocks.auth);
    return expect(mocks.createAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        rateLimitEnabled: false,
      })
    );
  });

  it("opens one request scope, wires auth to its tracked scheduler, and awaits finalization", async () => {
    const order: string[] = [];
    mocks.finalize.mockImplementationOnce(async () => {
      order.push("finalized");
    });

    await expect(
      withOperatorScope(async (scope) => {
        expect(scope).toEqual({
          env: mocks.parseServerEnv.mock.results[0]!.value,
          db: mocks.database,
          auth: mocks.auth,
        });
        return "done";
      }).then((value) => {
        order.push("returned");
        return value;
      })
    ).resolves.toBe("done");

    expect(order).toEqual(["finalized", "returned"]);
    expect(mocks.parseServerEnv).toHaveBeenCalledWith(process.env);
    expect(mocks.openRequestScope).toHaveBeenCalledWith({
      connectionString: "postgres://operator.test/database",
      schedule: expect.any(Function),
    });
    expect(mocks.createAuth).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleBackgroundTask: mocks.trackedSchedule })
    );
  });

  it("marks externally scheduled task rejections handled", async () => {
    await withOperatorScope(async () => "done");
    const [{ schedule }] = mocks.openRequestScope.mock.calls[0]!;
    const failed = Promise.reject(new Error("background task failed"));

    schedule(failed);

    await expect(failed).rejects.toThrow("background task failed");
  });

  it("refuses production before opening a database", async () => {
    mocks.parseServerEnv.mockReturnValueOnce({ APP_ENV: "production" });

    await expect(withOperatorScope(async () => "unused")).rejects.toThrow(
      "Operator app is development-only"
    );
    expect(mocks.openRequestScope).not.toHaveBeenCalled();
  });

  it("finalizes when the operation fails and preserves its error", async () => {
    await expect(
      withOperatorAuth(async () => {
        throw new Error("operation failed");
      })
    ).rejects.toThrow("operation failed");
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });

  it("runs an operation with request-scoped auth", async () => {
    const operation = vi.fn(async (auth: unknown) => {
      expect(auth).toBe(mocks.auth);
      return "complete";
    });

    await expect(withOperatorAuth(operation)).resolves.toBe("complete");
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });

  it("rethrows non-capacity failures from the route-handler scope", async () => {
    const failure = new Error("connect failed");
    mocks.openRequestScope.mockRejectedValueOnce(failure);

    await expect(
      withOperatorRequestScope(async () => new Response("unused"))
    ).rejects.toBe(failure);
  });

  it.each([
    [
      "auth",
      () =>
        handleOperatorAuthRequest(
          new Request(`${OPERATOR_APP_ORIGIN}/api/auth/get-session`)
        ),
    ],
    [
      "oRPC",
      () =>
        handleOperatorOrpcRequest(
          new Request(`${OPERATOR_APP_ORIGIN}/api/orpc/operator/workspace`)
        ),
    ],
  ])(
    "maps capacity exhaustion to the coded 503 in the operator %s handler",
    async (_name, handle) => {
      vi.stubEnv("WORKFLOW_REPOSITORIES_ROOT", "/srv/repositories");
      mocks.openRequestScope.mockRejectedValueOnce(
        new RequestDatabaseCapacityError()
      );

      try {
        const response = await handle();
        expect(response.status).toBe(503);
        expect(response.headers.get("retry-after")).toBe("1");
        await expect(response.json()).resolves.toEqual({
          error: "Service temporarily at capacity",
          code: "DATABASE_CAPACITY",
        });
        expect(mocks.createAuth).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );
});
