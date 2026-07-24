import { describe, expect, it } from "vitest";

import { formatE2ELifecycleFailure } from "./lifecycle-diagnostics";

const forbiddenDynamicContent =
  /https?:|postgres|password|token|authorization|cookie|\/Users\//iu;

describe("safe E2E lifecycle diagnostics", () => {
  it("emits an exact filter-visible startup stage without dynamic content", () => {
    const message = formatE2ELifecycleFailure("startup", "artifact-isolation");

    expect(message).toBe(
      "Error: E2E lifecycle startup failed during artifact-isolation.\n"
    );
    expect(message).not.toMatch(forbiddenDynamicContent);
  });

  it("emits an exact filter-visible cleanup stage without raw errors", () => {
    const message = formatE2ELifecycleFailure("cleanup", "server-ready");

    expect(message).toBe(
      "Error: E2E lifecycle cleanup failed during server-ready. Resources retained.\n"
    );
    expect(message).not.toMatch(forbiddenDynamicContent);
  });
});
