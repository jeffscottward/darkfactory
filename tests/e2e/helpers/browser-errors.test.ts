import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BrowserErrorCollector } from "./browser-errors";

const CANONICAL_SOURCE_OPTIONS = {
  sourceOrigin: "https://darkfactory.localhost",
} as const;

const CANONICAL_ACCOUNT_MODULE_URL = new URL(
  "../../../apps/web/src/components/account/account-client.civet",
  import.meta.url
);
const CANONICAL_ACCOUNT_MODULE_PATH = fileURLToPath(
  CANONICAL_ACCOUNT_MODULE_URL
);
const FINGERPRINT_PATTERN = /fingerprint=([a-f0-9]{64})/u;
const fingerprintOf = (failure: string | undefined): string => {
  const fingerprint = FINGERPRINT_PATTERN.exec(failure ?? "")?.[1];
  if (fingerprint === undefined) {
    throw new Error("Missing browser error fingerprint.");
  }
  return fingerprint;
};

const sensitiveValues = [
  "BrowserAuth123!",
  "session-cookie-private",
  "reset-private-token",
  "person@example.com",
  "Bearer api-key-private",
  "select * from users where email = 'person@example.com'",
] as const;

describe("secret-safe browser error diagnostics", () => {
  it("reports only bounded categories, fingerprints, routes, names, and source classes", () => {
    const collector = new BrowserErrorCollector([], CANONICAL_SOURCE_OPTIONS);
    const message = [
      "Invalid hook call.",
      ...sensitiveValues,
      "\u0000\u001b[31m",
      "https://darkfactory.localhost/account/preferences?token=reset-private-token#session-cookie-private",
    ].join(" ");
    const pageError = new TypeError(
      `Cannot read properties of null (reading 'useMemo') ${message}`
    );
    pageError.stack = `${pageError.name}: ${pageError.message}\n    at render (${CANONICAL_ACCOUNT_MODULE_PATH}:40:7)\n    at external (/tmp/person@example.com/private-token.ts:99:1)`;
    const fileUrlPageError = new TypeError(pageError.message);
    fileUrlPageError.stack = `${fileUrlPageError.name}: ${fileUrlPageError.message}\n    at render (${CANONICAL_ACCOUNT_MODULE_URL.href}:41:7)\n    at external (/tmp/person@example.com/private-token.ts:99:1)`;

    collector.recordConsole(
      "error",
      message,
      "/account/preferences?token=reset-private-token#session-cookie-private"
    );
    collector.recordPageError(
      pageError,
      "/admin/users/reset-private-token?email=person@example.com"
    );
    collector.recordPageError(
      fileUrlPageError,
      "/admin/users/reset-private-token?email=person@example.com"
    );

    const output = JSON.stringify(collector.failures());
    for (const sensitive of sensitiveValues) {
      expect(output).not.toContain(sensitive);
    }
    for (const forbidden of [
      "reset-private-token",
      "darkfactory.localhost",
      CANONICAL_ACCOUNT_MODULE_PATH,
      CANONICAL_ACCOUNT_MODULE_URL.href,
      "/Users/jeffscottward",
      "/tmp/",
      "\\u0000",
      "\\u001b",
      "select * from users",
      "account-client.civet",
    ]) {
      expect(output).not.toContain(forbidden);
    }
    expect(output).toContain("category=react-invalid-hook");
    expect(output).toContain("category=react-dispatcher");
    expect(output).toContain("route=/account/[section]");
    expect(output).toContain("route=/admin/users/[userId]");
    expect(output).toContain("name=TypeError");
    expect(output).toContain("source=account-gateway:40");
    expect(output).toContain("source=account-gateway:41");
    expect(output).toMatch(FINGERPRINT_PATTERN);
  });

  it("keeps fingerprints stable only within one collector and distinguishes messages", () => {
    const firstCollector = new BrowserErrorCollector();
    firstCollector.recordConsole(
      "error",
      "Invalid   hook call\r\nwhile rendering",
      "/account/profile"
    );
    firstCollector.recordConsole(
      "error",
      "  Invalid hook call while rendering  ",
      "/account/address"
    );
    firstCollector.recordConsole(
      "error",
      "Hydration failed while rendering",
      "/account/profile"
    );
    const firstFailures = firstCollector.failures();
    const first = fingerprintOf(firstFailures[0]);
    const equivalent = fingerprintOf(firstFailures[1]);
    const different = fingerprintOf(firstFailures[2]);

    const secondCollector = new BrowserErrorCollector();
    secondCollector.recordConsole(
      "error",
      "Invalid hook call while rendering",
      "/account/profile"
    );
    const crossRunCandidate = fingerprintOf(secondCollector.failures()[0]);

    expect(first).toBe(equivalent);
    expect(first).not.toBe(different);
    expect(first).not.toBe(crossRunCandidate);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("classifies only finite exact framework and transport error semantics", () => {
    const collector = new BrowserErrorCollector();
    const cases = [
      [
        "Cannot parse response body, please check the response body and content-type.",
        "Error",
        "orpc-response-parse",
      ],
      ["Invalid RPC response format.", "Error", "orpc-response-format"],
      [
        "Security error: accessing non-existent path during deserialization. Path segment: reset-private-token",
        "Error",
        "orpc-deserialization",
      ],
      ["The operation was aborted.", "AbortError", "navigation-fetch-abort"],
      [
        'Abort fetching component for route: "reset-private-token"',
        "NavigationCancelledError",
        "framework-router-cancellation",
      ],
      [
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.",
        "Error",
        "client-error-boundary",
      ],
    ] as const;
    for (const [message, name] of cases) {
      const error = new Error(message);
      error.name = name;
      collector.recordPageError(error, "/account/profile");
    }
    const failures = collector.failures();
    for (const [index, [, , category]] of cases.entries()) {
      expect(failures[index]).toContain(`category=${category}`);
    }

    const nearMisses = [
      [
        "Cannot parse response body, please check the response body and content-type. ",
        "Error",
      ],
      ["The operation was aborted.", "Error"],
      ['Abort fetching component for route: "profile"', "Error"],
      [
        "An error occurred in the Server Components render. The specific message is omitted.",
        "Error",
      ],
    ] as const;
    const nearMissCollector = new BrowserErrorCollector();
    for (const [message, name] of nearMisses) {
      const error = new Error(message);
      error.name = name;
      nearMissCollector.recordPageError(error, "/account/profile");
    }
    for (const failure of nearMissCollector.failures()) {
      expect(failure).toContain("category=unknown");
    }
    expect(JSON.stringify(failures)).not.toContain("reset-private-token");
  });

  it("accepts sources only from the canonical origin or repository and emits fixed classes", () => {
    const collector = new BrowserErrorCollector([], CANONICAL_SOURCE_OPTIONS);
    const stacks = [
      "TypeError: failed\n    at render (https://darkfactory.localhost/assets/account-client.js:73:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/src/account.tsx:74:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/src/node_modules/react/index.js:75:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/apps/web/src/components/account/profile-page-client.civet:82:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/apps/web/src/components/account/address-page-client.civet:83:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/apps/web/src/components/account/preferences-page-client.civet:84:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/apps/web/src/components/account/security-page-client.civet:85:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/src/node_modules/@orpc/client/dist/index.js:86:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/src/node_modules/vinext/dist/shims/router.js:87:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/src/node_modules/zod/index.js:88:4)",
      "TypeError: failed\n    at render (https://attacker.invalid/assets/reset-secret.js:76:4)",
      "TypeError: failed\n    at render (https://user:reset-secret@darkfactory.localhost/assets/account.js:77:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/assets/account.js?token=reset-secret:78:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/assets/account.js#reset-secret:79:4)",
      "TypeError: failed\n    at render (https://darkfactory.localhost/assets/%E0%A4%A.js:80:4)",
      "TypeError: failed\n    at render (/tmp/person@example.com/reset-secret.ts:81:2)",
    ] as const;
    for (const [index, stack] of stacks.entries()) {
      const error = new TypeError("Rendering failed");
      error.stack = stack;
      collector.recordPageError(error, `/dashboard?case=${index}`);
    }

    const failures = collector.failures();
    expect(failures[0]).toContain("source=other-app:73");
    expect(failures[1]).toContain("source=other-app:74");
    expect(failures[2]).toContain("source=react-runtime:75");
    expect(failures[3]).toContain("source=account-profile:82");
    expect(failures[4]).toContain("source=account-address:83");
    expect(failures[5]).toContain("source=account-preferences:84");
    expect(failures[6]).toContain("source=account-security:85");
    expect(failures[7]).toContain("source=orpc-client:86");
    expect(failures[8]).toContain("source=framework-router:87");
    expect(failures[9]).toContain("source=other-dependency:88");
    for (const failure of failures.slice(10)) {
      expect(failure).not.toContain("source=");
    }
    const output = JSON.stringify(failures);
    expect(output).not.toContain("reset-secret");
    expect(output).not.toContain("attacker.invalid");
    expect(output).not.toContain("account-client.js");
  });

  it("rejects oversized inputs and rules before matching, hashing, or copying", () => {
    const collector = new BrowserErrorCollector();
    const sentinel = "Invalid hook call Bearer sentinel-private";
    collector.recordConsole(
      "error",
      `${"x".repeat(16 * 1024 + 1)}${sentinel}`,
      "/"
    );
    collector.recordConsole("error", "ordinary", `/${"y".repeat(2048)}`);
    collector.recordResponse({
      method: "GET",
      status: 500,
      url: `https://darkfactory.localhost/${"z".repeat(4096)}?token=${sentinel}`,
    });
    const oversizedStack = new Error("ordinary");
    oversizedStack.stack = `${"s".repeat(64 * 1024 + 1)}${sentinel}`;
    collector.recordPageError(oversizedStack, "/");

    expect(collector.failures()).toEqual([
      "Unexpected oversized console error",
      "Unexpected browser error metadata",
      "Unexpected HTTP response metadata",
      "Unexpected oversized page error",
    ]);
    expect(JSON.stringify(collector.failures())).not.toContain(sentinel);
    expect(() =>
      collector.allowConsoleError({
        message: `${"m".repeat(16 * 1024)}${sentinel}`,
        pathname: "/",
      })
    ).toThrow(TypeError);
  });

  it("caps observations and allowed rules with one static overflow failure", () => {
    const collector = new BrowserErrorCollector();
    for (let index = 0; index < 200; index += 1) {
      collector.recordConsole("error", `failure-${index}`, "/");
    }
    const failures = collector.failures();
    expect(failures).toHaveLength(129);
    expect(failures.at(-1)).toBe("Browser error observation limit exceeded");
    expect(
      failures.filter((failure) => failure.includes("limit exceeded"))
    ).toHaveLength(1);

    const rules = new BrowserErrorCollector();
    for (let index = 0; index < 128; index += 1) {
      rules.allowConsoleError({ message: `allowed-${index}`, pathname: "/" });
    }
    expect(() =>
      rules.allowConsoleError({ message: "allowed-overflow", pathname: "/" })
    ).toThrow("Browser error allowlist limit exceeded.");
  });

  it("keeps exact expected-message matching unchanged", () => {
    const collector = new BrowserErrorCollector();
    collector.allowConsoleError({
      message: "Expected diagnostic",
      pathname: "/account/profile",
    });
    collector.allowPageError({
      message: "Expected page failure",
      pathname: "/account/profile",
    });

    collector.recordConsole("error", "Expected diagnostic", "/account/profile");
    collector.recordPageError(
      new Error("Expected page failure"),
      "/account/profile"
    );
    expect(collector.failures()).toEqual([]);

    collector.recordConsole(
      "error",
      "Expected diagnostic ",
      "/account/profile"
    );
    expect(collector.failures()).toHaveLength(1);
  });
});
