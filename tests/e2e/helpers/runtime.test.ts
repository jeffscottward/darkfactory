import { describe, expect, it } from "vitest";

import { createE2ERunPaths } from "./run-artifacts";
import { createE2EServerEnvironment, E2E_WORKER_BINDING_KEYS } from "./runtime";

describe("canonical E2E server environment", () => {
  it("configures contact preview delivery in the Vinext worker", () => {
    const environment = createE2EServerEnvironment({
      databaseUrl:
        "postgresql://runner:secret@127.0.0.1:5432/darkfactory_test_runtime",
      portlessPort: 1355,
      previewCaptureEndpoint: "http://127.0.0.1:41321/v1/capture",
      runPaths: createE2ERunPaths("runtime_contact_preview"),
      secret: "s".repeat(32),
      source: {
        APP_ENV: "test",
        E2E_EMAIL_PREVIEW_HMAC_KEY: "h".repeat(43),
        PORTLESS_APP_PORT: "host-owned-port",
      },
    });

    expect(environment).toMatchObject({
      CONTACT_EMAIL_TO: "contact@darkfactory.test",
      EMAIL_TRANSPORT: "preview",
      CLOUDFLARE_CF_FETCH_ENABLED: "false",
      MINIFLARE_REGISTRY_PATH: "",
    });
    // biome-ignore lint/complexity/useLiteralKeys: The execution environment is an index-signature boundary.
    expect(environment["PORTLESS_APP_PORT"]).toBeUndefined();
    expect(E2E_WORKER_BINDING_KEYS).not.toContain("PORTLESS_APP_PORT");
    expect(E2E_WORKER_BINDING_KEYS).not.toContain("MINIFLARE_REGISTRY_PATH");
    expect(E2E_WORKER_BINDING_KEYS).not.toContain(
      "CLOUDFLARE_CF_FETCH_ENABLED"
    );
    expect(E2E_WORKER_BINDING_KEYS).toContain("CONTACT_EMAIL_TO");
  });
});
