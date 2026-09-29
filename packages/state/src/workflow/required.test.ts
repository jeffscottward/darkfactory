import { describe, expect, it } from "vitest";

import { required } from "./required.ts";

describe("required", () => {
  it("returns present values unchanged", () => {
    const value = { id: "present" };
    expect(required(value, "value")).toBe(value);
    expect(required(0, "zero")).toBe(0);
    expect(required("", "empty string")).toBe("");
  });

  it.each([null, undefined])("fails closed for %s", (value) => {
    expect(() => required(value, "row")).toThrow("row is unexpectedly missing");
  });
});
