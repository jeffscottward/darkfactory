import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadingHoldCapMilliseconds,
  parseLoadingHoldId,
  releaseLoadingHold,
  waitForLoadingHold,
} from "./e2e-loading-hold.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("e2e loading hold", () => {
  it("accepts only one short URL-safe hold id", () => {
    expect(parseLoadingHoldId("a11y_hold-1")).toBe("a11y_hold-1");
    expect(parseLoadingHoldId(undefined)).toBeUndefined();
    expect(parseLoadingHoldId(["a", "b"])).toBeUndefined();
    expect(parseLoadingHoldId("")).toBeUndefined();
    expect(parseLoadingHoldId("a/b")).toBeUndefined();
    return expect(parseLoadingHoldId("x".repeat(65))).toBeUndefined();
  });

  it("holds until the test releases the id", async () => {
    vi.useFakeTimers();
    let outcome: string | undefined;
    const pending = waitForLoadingHold("held").then((value) => {
      outcome = value;
      return value;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(outcome).toBeUndefined();
    releaseLoadingHold("held");
    await vi.advanceTimersByTimeAsync(100);
    return expect(pending).resolves.toBe("released");
  });

  it("consumes a release that arrives before the wait", async () => {
    releaseLoadingHold("early");
    await expect(waitForLoadingHold("early", 100, 10)).resolves.toBe(
      "released"
    );
    return expect(waitForLoadingHold("early", 0, 10)).resolves.toBe("capped");
  });

  it("releases a hold that arrives on the last poll", async () => {
    vi.useFakeTimers();
    const pending = waitForLoadingHold("last", 10, 10);
    releaseLoadingHold("unrelated");
    setTimeout(() => releaseLoadingHold("last"), 5);
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBe("released");
    return expect(waitForLoadingHold("unrelated", 0)).resolves.toBe("released");
  });

  return it("stops at the safety cap", async () => {
    vi.useFakeTimers();
    const pending = waitForLoadingHold("forgotten");
    await vi.advanceTimersByTimeAsync(loadingHoldCapMilliseconds);
    return expect(pending).resolves.toBe("capped");
  });
});
