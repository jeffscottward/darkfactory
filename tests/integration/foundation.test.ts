import { toClientEnv } from "@darkfactory/config";
import { parseServerEnv } from "@darkfactory/config/server";
import { createFixedClock, createIdSequence } from "@darkfactory/testkit";
import { describe, expect, it } from "vitest";

describe("foundation package integration", () =>
  it("composes a deterministic client context without exposing server settings", () => {
    const clock = createFixedClock(new Date("2026-01-02T03:04:05.000Z"));
    const nextRequestId = createIdSequence("foundation_request_01");
    const serverEnv = parseServerEnv({
      APP_ENV: "test",
      DATABASE_URL:
        "postgresql://darkfactory:darkfactory@database.test/darkfactory",
      BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
      CONTACT_THROTTLE_SECRET:
        "test-only-contact-throttle-secret-32-characters",
    });

    const context = {
      id: nextRequestId(),
      observedAt: clock.now().toISOString(),
      environment: toClientEnv(serverEnv),
    };

    expect(context).toEqual({
      id: "foundation_request_01",
      observedAt: "2026-01-02T03:04:05.000Z",
      environment: {
        APP_ENV: "test",
        APP_URL: "https://darkfactory.localhost",
        APP_NAME: "DarkFactory",
      },
    });
    expect(context.environment).not.toHaveProperty("DATABASE_URL");
    return expect(context.environment).not.toHaveProperty("BETTER_AUTH_SECRET");
  }));
