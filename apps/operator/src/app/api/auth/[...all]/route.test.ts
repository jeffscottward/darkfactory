import { describe, expect, it, vi } from "vitest";

const handleOperatorAuthRequest = vi.hoisted(() =>
  vi.fn(async () => new Response("auth"))
);

vi.mock("./handler.ts", () => ({ handleOperatorAuthRequest }));

import { GET, POST } from "./route.ts";

describe("operator auth route exports", function () {
  return it("delegates GET and POST to the bounded auth handler", async function () {
    const getRequest = new Request(
      "https://operator.darkfactory.localhost/api/auth/session"
    );
    const postRequest = new Request(
      "https://operator.darkfactory.localhost/api/auth/sign-in",
      {
        method: "POST",
      }
    );
    expect(await (await GET(getRequest)).text()).toBe("auth");
    expect(await (await POST(postRequest)).text()).toBe("auth");
    expect(handleOperatorAuthRequest).toHaveBeenNthCalledWith(1, getRequest);
    return expect(handleOperatorAuthRequest).toHaveBeenNthCalledWith(
      2,
      postRequest
    );
  });
});
