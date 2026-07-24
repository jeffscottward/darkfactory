import { describe, expect, it } from "vitest";

import { containsSensitiveData } from "./sensitive-data";

describe("auth evidence sensitive-data detector", () => {
  it("detects nested sensitive keys and values without exposing them", () => {
    const sentinelValue = "private-sentinel-value";
    expect(
      containsSensitiveData(
        { data: { value: `prefix-${sentinelValue}-suffix` } },
        [sentinelValue]
      )
    ).toBe(true);
    expect(containsSensitiveData({ token: "opaque" }, [])).toBe(true);
    expect(
      containsSensitiveData(
        {
          name: "__Secure-better-auth.session_token",
          value: `${sentinelValue}; Path=/; HttpOnly`,
        },
        [sentinelValue]
      )
    ).toBe(true);
    expect(
      containsSensitiveData({ data: { value: "public" } }, [sentinelValue])
    ).toBe(false);
  });
});
