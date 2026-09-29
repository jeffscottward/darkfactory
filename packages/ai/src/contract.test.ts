import { describe, expect, it } from "vitest";

import { createDisabledAiPort } from "./index.ts";
import { createRecordingAiPort } from "./test.ts";

describe("AiPort adapters", function () {
  it("returns an explicit disabled result without inventing text", async function () {
    const port = createDisabledAiPort("disabled");

    return await expect(
      port.generateText({ prompt: "private prompt" })
    ).resolves.toEqual({
      status: "disabled",
      reason: "disabled",
    });
  });

  it("returns an explicit unconfigured result", async function () {
    const port = createDisabledAiPort("not_configured");

    return await expect(
      port.generateText({ prompt: "private prompt" })
    ).resolves.toEqual({
      status: "disabled",
      reason: "not_configured",
    });
  });

  return it("records requests and returns the configured result deterministically", async function () {
    const result = { status: "generated", text: "deterministic text" } as const;
    const port = createRecordingAiPort({ result });
    const signal = new AbortController().signal;

    await expect(
      port.generateText({ prompt: "first prompt", signal })
    ).resolves.toEqual(result);
    await expect(
      port.generateText({ prompt: "second prompt" })
    ).resolves.toEqual(result);
    return expect(port.requests).toEqual([
      { prompt: "first prompt", signal },
      { prompt: "second prompt" },
    ]);
  });
});
