import { createFixedClock, createIdSequence } from "@darkfactory/testkit";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createIdentifier,
  failure,
  type Identifier,
  matchResult,
  normalizeUnknownError,
  success,
} from "./index.ts";

describe("createIdentifier", () => {
  it("brands a non-empty identifier without changing its runtime value", () => {
    type RequestId = Identifier<"request">;

    const identifier = createIdentifier<"request">("req_01");

    expect(identifier).toBe("req_01");
    expectTypeOf(identifier).toEqualTypeOf<RequestId>();
    return expectTypeOf(identifier).not.toMatchTypeOf<Identifier<"trace">>();
  });

  return it("rejects an empty identifier", () =>
    expect(() => createIdentifier<"request">("")).toThrowError(
      new TypeError("Identifier must not be empty")
    ));
});

describe("Result helpers", () => {
  it("constructs and exhaustively matches a success", () => {
    let didCallFailure = false;
    const result = success({ count: 2 });

    const output = matchResult(result, {
      success: (value) => {
        expectTypeOf(value).toEqualTypeOf<{ count: number }>();
        return `count:${value.count}`;
      },
      failure: (reason) => {
        expectTypeOf(reason).toBeNever();
        didCallFailure = true;
        return "failure";
      },
    });

    expect(result).toEqual({ ok: true, value: { count: 2 } });
    expect(output).toBe("count:2");
    expect(didCallFailure).toBe(false);
    return expectTypeOf(output).toEqualTypeOf<string>();
  });

  return it("constructs and exhaustively matches a failure", () => {
    let didCallSuccess = false;
    const reason = { code: "NOT_READY" as const };
    const result = failure(reason);

    const output = matchResult(result, {
      success: (value) => {
        expectTypeOf(value).toBeNever();
        didCallSuccess = true;
        return "success";
      },
      failure: (matchedReason) => {
        expectTypeOf(matchedReason).toEqualTypeOf<typeof reason>();
        return matchedReason.code;
      },
    });

    expect(result).toEqual({ ok: false, error: reason });
    expect(output).toBe("NOT_READY");
    expect(didCallSuccess).toBe(false);
    return expectTypeOf(output).toEqualTypeOf<string>();
  });
});

describe("normalizeUnknownError", () => {
  const normalizedError = {
    code: "UNEXPECTED_ERROR",
    message: "An unexpected error occurred.",
  };

  it("normalizes Error instances without exposing internal details", () => {
    const secret = "sk-do-not-expose";
    const source = new Error(`Provider rejected ${secret}`, {
      cause: { token: secret },
    });

    const normalized = normalizeUnknownError(source);

    expect(normalized).toEqual(normalizedError);
    expect(Object.keys(normalized)).toEqual(["code", "message"]);
    return expect(JSON.stringify(normalized)).not.toContain(secret);
  });

  return it("normalizes arbitrary unknown values to the same safe shape", () => {
    const secret = "session-do-not-expose";
    const unknownValues: readonly unknown[] = [
      `Session ${secret}`,
      { message: secret, details: { authorization: secret } },
      null,
      42,
    ];

    const results = [];
    for (const value of unknownValues) {
      const normalized = normalizeUnknownError(value);

      expect(normalized).toEqual(normalizedError);
      results.push(expect(JSON.stringify(normalized)).not.toContain(secret));
    }
    return results;
  });
});

describe("@darkfactory/testkit fixtures", () => {
  it("creates an isolated fixed clock that returns fresh dates", () => {
    const source = new Date("2026-01-02T03:04:05.000Z");
    const clock = createFixedClock(source);
    source.setUTCFullYear(1999);

    const first = clock.now();
    const second = clock.now();
    first.setUTCFullYear(2000);

    expect(second.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(clock.now().toISOString()).toBe("2026-01-02T03:04:05.000Z");
    return expect(first).not.toBe(second);
  });

  it("rejects invalid and out-of-range fixed instants", () => {
    const expectedError = new TypeError("Fixed clock requires a valid instant");

    expect(() => createFixedClock(new Date(Number.NaN))).toThrowError(
      expectedError
    );
    return expect(() => createFixedClock(9e15)).toThrowError(expectedError);
  });

  return it("creates an isolated deterministic branded ID sequence", () => {
    const first = createIdentifier<"fixture">("id_01");
    const second = createIdentifier<"fixture">("id_02");
    const nextId = createIdSequence(first, second);

    expect(nextId()).toBe(first);
    expect(nextId()).toBe(second);
    expect(() => nextId()).toThrowError(new RangeError("ID fixture exhausted"));
    return expectTypeOf(nextId).returns.toEqualTypeOf<Identifier<"fixture">>();
  });
});
