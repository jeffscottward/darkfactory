import { describe, expect, it, vi } from "vitest";

const handleOperatorOrpcRequest = vi.hoisted(() =>
  vi.fn(async () => new Response("orpc"))
);

vi.mock("./handler.ts", () => ({ handleOperatorOrpcRequest }));

import { GET, POST } from "./route.ts";

describe("operator oRPC route exports", function () {
  return it("delegates GET and POST to the composed oRPC handler", async function () {
    const getRequest = new Request(
      "https://operator.darkfactory.localhost/api/orpc/operator/workspace"
    );
    const postRequest = new Request(
      "https://operator.darkfactory.localhost/api/orpc/operator/runs",
      {
        method: "POST",
      }
    );
    expect(await (await GET(getRequest)).text()).toBe("orpc");
    expect(await (await POST(postRequest)).text()).toBe("orpc");
    expect(handleOperatorOrpcRequest).toHaveBeenNthCalledWith(1, getRequest);
    return expect(handleOperatorOrpcRequest).toHaveBeenNthCalledWith(
      2,
      postRequest
    );
  });
});
