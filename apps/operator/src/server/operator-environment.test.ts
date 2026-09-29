import { describe, expect, it, vi } from "vitest";

import {
  assertLocalOperatorEnvironment,
  isOperatorMutationDenied,
  OPERATOR_APP_ORIGIN,
  safeOperatorCallbackPath,
} from "./operator-environment.ts";

describe("local operator environment", () => {
  it("uses the dedicated HTTPS operator origin", () =>
    expect(OPERATOR_APP_ORIGIN).toBe("https://operator.darkfactory.localhost"));

  it("rejects production assembly", () => {
    expect(() =>
      assertLocalOperatorEnvironment({ APP_ENV: "production" })
    ).toThrow("Operator app is development-only");
    expect(() =>
      assertLocalOperatorEnvironment({ APP_ENV: "development" })
    ).not.toThrow();
    return expect(() =>
      assertLocalOperatorEnvironment({ APP_ENV: "test" })
    ).not.toThrow();
  });

  it("allows reads but denies cross-origin or cross-site mutations", () => {
    expect(
      isOperatorMutationDenied(
        new Request(`${OPERATOR_APP_ORIGIN}/api/orpc/operator/workspace`)
      )
    ).toBe(false);
    expect(
      isOperatorMutationDenied(
        new Request(`${OPERATOR_APP_ORIGIN}/api/orpc/operator/submit`, {
          method: "POST",
          headers: {
            origin: OPERATOR_APP_ORIGIN,
            "sec-fetch-site": "same-origin",
          },
        })
      )
    ).toBe(false);
    expect(
      isOperatorMutationDenied(
        new Request(`${OPERATOR_APP_ORIGIN}/api/orpc/operator/submit`, {
          method: "POST",
          headers: { origin: "https://darkfactory.localhost" },
        })
      )
    ).toBe(true);
    return expect(
      isOperatorMutationDenied(
        new Request(`${OPERATOR_APP_ORIGIN}/api/orpc/operator/submit`, {
          method: "POST",
          headers: {
            origin: OPERATOR_APP_ORIGIN,
            "sec-fetch-site": "cross-site",
          },
        })
      )
    ).toBe(true);
  });

  it("accepts only local operator callbacks", () => {
    expect(safeOperatorCallbackPath("/operator/runs/run-1?view=timeline")).toBe(
      "/operator/runs/run-1?view=timeline"
    );
    expect(safeOperatorCallbackPath("/")).toBe("/operator");
    expect(safeOperatorCallbackPath("//attacker.invalid")).toBe("/operator");
    return expect(safeOperatorCallbackPath("/dashboard")).toBe("/operator");
  });

  it("rejects every unsafe callback shape before navigation", () => {
    const tooLong = `/operator/${"a".repeat(2048)}`;
    for (const value of [
      undefined,
      null,
      "",
      "operator",
      tooLong,
      "/operator\\settings",
      "/operator#settings",
      "/operator/\u0000settings",
    ]) {
      expect(safeOperatorCallbackPath(value)).toBe("/operator");
    }
  });

  it("accepts the workspace root but rejects an adjacent path prefix", () => {
    expect(safeOperatorCallbackPath("/operator")).toBe("/operator");
    return expect(safeOperatorCallbackPath("/operatorish")).toBe("/operator");
  });

  return it("fails closed when URL parsing fails or resolves to another origin", () => {
    const originalURL = URL;
    try {
      vi.stubGlobal(
        "URL",
        class {
          constructor() {
            throw new TypeError("invalid URL");
          }
        }
      );
      expect(safeOperatorCallbackPath("/operator/settings")).toBe("/operator");

      vi.stubGlobal(
        "URL",
        class {
          readonly origin = "https://attacker.invalid";
          readonly pathname = "/operator";
          readonly search = "";
        }
      );
      return expect(safeOperatorCallbackPath("/operator/settings")).toBe(
        "/operator"
      );
    } finally {
      vi.stubGlobal("URL", originalURL);
    }
  });
});
