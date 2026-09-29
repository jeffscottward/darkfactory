import type { SafeAuthSession } from "@darkfactory/auth/types";
import { describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "./context.ts";
import {
  handleOperatorOpenApiRequest,
  handleOperatorRequest,
} from "./handler.ts";
import type { OperatorWorkflowPort } from "./operator-service.ts";

const session = {
  principal: { userId: "owner-1", role: "member", status: "active" },
} as SafeAuthSession;

const context = (): OperatorContext => ({
  requestId: "request-handler-1",
  requireSession: async () => session,
  workflowOperator: {
    workspace: vi.fn(async () => []),
  } as unknown as OperatorWorkflowPort,
});

describe("operator Fetch handlers", () => {
  it("returns Not Found for a missing RPC procedure", async () => {
    const response = await handleOperatorRequest(
      new Request(
        "https://operator.darkfactory.localhost/api/orpc/not-a-procedure"
      ),
      context()
    );
    expect(response.status).toBe(404);
    return await expect(response.text()).resolves.toBe("Not Found");
  });

  it("serves a matched OpenAPI route", async () => {
    const response = await handleOperatorOpenApiRequest(
      new Request(
        "https://operator.darkfactory.localhost/api/openapi/operator/workspace"
      ),
      context()
    );
    expect(response.status).toBe(200);
    return await expect(response.json()).resolves.toEqual({ runs: [] });
  });

  return it("returns Not Found for missing and invalid-method OpenAPI routes", async () => {
    const missing = await handleOperatorOpenApiRequest(
      new Request(
        "https://operator.darkfactory.localhost/api/openapi/not-a-procedure"
      ),
      context()
    );
    expect(missing.status).toBe(404);
    await expect(missing.text()).resolves.toBe("Not Found");

    const invalidMethod = await handleOperatorOpenApiRequest(
      new Request(
        "https://operator.darkfactory.localhost/api/openapi/operator/workspace",
        { method: "POST" }
      ),
      context()
    );
    expect(invalidMethod.status).toBe(404);
    return await expect(invalidMethod.text()).resolves.toBe("Not Found");
  });
});
