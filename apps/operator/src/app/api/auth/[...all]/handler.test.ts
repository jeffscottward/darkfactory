import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { runtime: "operator-auth" },
  createAuthHandler: vi.fn(),
  withOperatorRequestScope: vi.fn(
    async (run: (scope: { auth: unknown }) => Promise<Response>) =>
      run({ auth: { runtime: "operator-auth" } })
  ),
  delegate: vi.fn(async (_request: Request) => new Response("ok")),
}));

vi.mock("@darkfactory/auth/server", () => ({
  createAuthHandler: mocks.createAuthHandler,
}));
vi.mock("../../../../server/operator-auth.ts", () => ({
  withOperatorRequestScope: mocks.withOperatorRequestScope,
}));

import { handleOperatorAuthRequest } from "./handler.ts";

describe("operator auth composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthHandler.mockReturnValue(mocks.delegate);
  });

  it("delegates to Better Auth inside the operator request scope", async () => {
    const request = new Request(
      "https://operator.darkfactory.localhost/api/auth/get-session"
    );

    const response = await handleOperatorAuthRequest(request);

    expect(response.status).toBe(200);
    expect(mocks.withOperatorRequestScope).toHaveBeenCalledOnce();
    expect(mocks.createAuthHandler).toHaveBeenCalledWith(mocks.auth);
    expect(mocks.delegate).toHaveBeenCalledWith(request);
  });
});
