import { afterEach, describe, expect, it, vi } from "vitest";

import { createOperatorClient } from "./client.ts";

describe("operator client", () => {
  afterEach(() => vi.unstubAllGlobals());

  return it("uses the default fetch boundary at the fixed RPC prefix", async () => {
    const fetch = vi.fn(async (_request: Request) => {
      return new Response("Not Found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetch);
    const client = createOperatorClient({
      baseUrl: new URL("https://operator.darkfactory.localhost/control"),
    });

    await expect(client.operator.wayfinder.status({})).rejects.toBeInstanceOf(
      Error
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    return expect(fetch.mock.calls[0]?.[0]).toMatchObject({
      url: "https://operator.darkfactory.localhost/api/orpc/operator/wayfinder/status",
      method: "POST",
    });
  });
});
