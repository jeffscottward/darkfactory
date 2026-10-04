# Debugging

Start with `bun run doctor`, then find the symptom below. Paths are relative to the repo root; `#name` is the symbol to read first.

## Symptom → where to look

| Symptom | Where to look |
| --- | --- |
| Startup fails with `Invalid server environment` | `packages/config/src/server.ts#parseServerEnv`, `#EnvironmentValidationError` (lists each failing key) |
| Production or deploy check rejects the database URL | `packages/config/src/database.ts#validateRequestDatabaseEndpoint`, `scripts/deployment/database.ts#checkProductionWebDatabaseEndpoint` |
| `503` with `code: "DATABASE_CAPACITY"` and `retry-after` | `packages/db/src/server/request-scope.ts#requestDatabaseCapacityResponse`, `packages/db/src/server/client.ts#RequestDatabaseCapacityError`, `#REQUEST_DATABASE_POOL_MAX_CONNECTIONS`; `apps/web/src/server/request-scope.ts#withRequestScope` |
| `request-database.client-close-failed` or other `request-database.*` events | `apps/web/src/lib/request-database-diagnostics.ts#createRequestDatabaseDiagnosticSink` |
| `403` on a POST, PATCH or DELETE to `/api/orpc` | `apps/web/src/app/api/orpc/[...rest]/route.ts#unsafeRequestDenied` (`origin` must equal `APP_URL`'s origin; `sec-fetch-site`, if sent, must be `same-origin`) |
| `413` payload too large | `apps/web/src/lib/bounded-request-body.ts#bufferBoundedRequest`; `apps/web/src/app/api/orpc/[...rest]/route.ts#ORPC_REQUEST_MAX_BYTES` |
| Contact form returns `429` or `503` | `apps/web/src/app/api/orpc/[...rest]/contact-runtime.ts#createContactThrottleKey`, `packages/db/src/server/contact-throttle-repository.ts#createContactThrottleRepository`, `packages/api/src/server/contact-service.ts#ContactServiceError` |
| Local email never arrives | Expected: it is a file in `packages/email/previews/`. `packages/email/src/server/provider.ts#selectEmailPort`, `EMAIL_TRANSPORT` |
| Production email fails | The delivery result's `code` (`EMAIL_PROVIDER_*` or `CONTACT_PROVIDER_*`); `packages/email/src/server/provider.ts#createResendEmailPort`, `packages/email/src/server/contact.ts#createResendContactEmailPort` |
| Auth cookie missing or sign-in loops | `BETTER_AUTH_URL` must equal `APP_URL` (`packages/config/src/server.ts#parseServerEnv`); open the app on its portless `https://` URL, not a raw port |
| Sign-out does not stick | `packages/auth/src/db.ts#createDatabaseConfirmedSignOutHandler` |
| Dashboard render aborts or times out | `apps/web/src/lib/server-internal-dispatch.ts#dispatchWithAbort`, `apps/web/src/lib/theme-api-timeout.ts#THEME_API_REQUEST_TIMEOUT_MS` |
| Migration fails | `packages/db/src/server/migration.ts#migrate`, `packages/db/migrations/meta/_journal.json` |
| `db:seed` or `db:reset` refuses to run | Pass `-- --confirm-environment=<development\|test>` matching `APP_ENV`; `scripts/database/index.ts`, then `packages/db/src/seeds/index.ts#seedDevelopment` |
| Manifest rejected | `packages/config/src/server/capabilities-loader.ts#CapabilityManifestValidationError` |
| Server module crashes in the browser bundle | You imported a `./server` export from client code; its `browser` condition resolves to `unsupported.ts` |
| Integration tests refuse `DATABASE_URL` | `packages/testkit/src/postgres.ts`: only local hosts and the test maintenance database are allowed ([testing.md](testing.md#integration-tests)) |
| E2E fails on TLS | `playwright.config.ts` SPKI pin and portless state directory; see [testing.md](testing.md#how-e2e-runs) |
| `docs:check` fails | Run `bun run docs:generate`; a missing `brick` or a brick-rule violation is reported by `scripts/docs/docs.ts#buildPackageGraph` |
| Operator worker fails with `OmpConfigurationError` | `packages/jobs/src/server/omp.ts#requireSandboxBackend`: "unsupported" means neither macOS nor Linux; "unavailable" means `sandbox-exec` or `bwrap` is missing or not root-owned; "cannot create namespaces" means user namespaces are blocked, for example by AppArmor; "process filter is unsupported" means a CPU other than x86_64 or arm64; "process filter failed its probe" means the kernel refused bubblewrap's seccomp filter, or a test process could still start under it. See [operator.md](operator.md) |
| `pilot worker: <KEY> …` or `pilot worker failed to start (…)` | The first names the `.env` key to fix (`packages/jobs/src/server/pilot-worker.ts#parsePilotWorkerEnvironment`). The second is usually Postgres: check `DATABASE_URL` and that the database is running |
| `OMP implementation scope must exist on Linux` | `packages/jobs/src/server/omp.ts#ompSandboxCommand`: create the scope directory in the repository, then retry |
| `OMP model gateway is not configured`, `… token is unavailable`, `… is unavailable` or `… does not serve the configured model` | Linux runs need the model gateway (`packages/jobs/src/server/model-relay.ts#requireOmpModelGateway`): set `WORKFLOW_OMP_GATEWAY_URL`, `WORKFLOW_OMP_GATEWAY_TOKEN_FILE` (a 0600 file of the worker's user) and `WORKFLOW_OMP_MODEL` to a model your gateway serves, check `omp auth-gateway status`, and that the gateway's providers are signed in. See [operator.md](operator.md#models-and-credentials) |
| `OMP model relay is unavailable`, `… failed to start` or `OMP sandbox did not report its process` | `/usr/bin/nsenter` (util-linux) must be root-owned, and able to enter the sandbox's user namespace; `packages/jobs/src/server/model-relay.ts#openOmpModelRelay` |
| Verifier check fails with `EAGAIN` or `Resource temporarily unavailable` | The container's task limit, which counts threads (`packages/jobs/src/server/omp.ts#OMP_VERIFIER_PIDS`). Limit how many processes the failing test starts at once; see [operator.md](operator.md#how-the-verifier-runs) |
| Pages load slowly in `bun run dev` | Count the requests in the browser network tab. Hundreds of `node_modules` requests mean a barrel package (for example `lucide-react`) is not pre-bundled: add it to `CLIENT_OPTIMIZE_DEPS_INCLUDE` in `apps/web/vite.config.ts`, then restart with `--force`. See [Page-load performance](#page-load-performance) |

## Tools

### Logs

- **Local:** `bun run dev` prints evlog events in the terminal. Each event has a `name` such as `contact.submitted` or `request-database.client-close-failed`, plus the request id in `correlation`. `orpc.request` is the OpenTelemetry span name for oRPC calls.
- **Production:** Workers Logs are enabled in `apps/web/wrangler.jsonc` (`observability.logs`). Tail live with `cd apps/web && pnpm exec wrangler tail`.
- Events are redacted before emission (`packages/observability/src/redaction.ts#redact`). If you need a value that is redacted, add a safe derived attribute instead of removing redaction.

### Request ids

Every response from the request scope (the auth, strict sign-out and oRPC routes) carries `x-request-id`. It is the edge-set `cf-ray` id when present and well-formed, otherwise a fresh UUID (`packages/api/src/server/context.ts#resolveApiRequestId`). An incoming `x-request-id` header is ignored, so clients cannot choose their id. The same id is on the evlog events, the OpenTelemetry span and audit records. Server-rendered pages pass their id to in-process oRPC and auth calls, so one page view shares one id. Copy the header from the browser's network tab and search the logs for it.

### Source maps

Worker builds emit source maps, and `apps/web/wrangler.jsonc` sets `"upload_source_maps": true`, so production stack traces point at TypeScript lines. Client bundles do not publish source maps.

### VS Code launch configs

`.vscode/launch.json` ships these configurations:

| Configuration | What it does |
| --- | --- |
| Vitest: current file | Runs the open test file under the debugger |
| Vitest: current integration file (local test database) | The same with `APP_ENV=test` and the local test-maintenance `DATABASE_URL`, for integration tests |
| Attach: Worker (while bun run dev is running) | Attaches to the Worker inspector that `@cloudflare/vite-plugin` opens on port 9229. Without VS Code, open `/__debug` on the dev URL for Chrome DevTools. |

Set a breakpoint, open the test file and press F5. For Playwright, run `pnpm exec playwright test --debug path/to/spec.ts` or use `--ui` and its trace viewer.

### Doctor

`bun run doctor` checks the toolchain (Node, Bun, pnpm and their `mise.toml` pins, vinext, Wrangler, uv), required env keys, the Cloudflare config, and the probes the manifest implies (Docker and Postgres, portless, Graphify). Each check prints `pass`, `fail`, `optional` or `disabled`. The portless route and trust checks pass only while `bun run dev` is running. Run it first when a fresh clone or a teammate's machine misbehaves.

### Page-load performance

Measure the production build first. Dev mode serves each module as its own request, so it is always slower.

1. `bun run build`, then `cd apps/web && PORT=4317 bunx --no-install vite preview`.
2. In Chromium DevTools, use a cold load with the cache disabled. Check the request count, the transferred bytes, the HTML size and the first contentful paint.
3. Repeat on `bun run dev` to find dev-only causes.

Measured on 2026-10-04 (local machine, Chromium, median of cold loads):

| Build | Page | Requests | Ready (network idle) | First contentful paint |
| --- | --- | --- | --- | --- |
| Dev, before | `/` | 2,083 (12.6 MB of `lucide-react` icon modules) | 2.4 s warm, 5.5 s first load | 0.27 s |
| Dev, after | `/` | 216 | 0.5 s warm, 3.6 s first load | 0.26 s |
| Production | `/` | 31 | 0.16 s | 0.10 s |

The cause of the dev lag was `lucide-react` in the client `optimizeDeps.exclude` list. Its barrel export made the browser fetch every icon module. Production builds tree-shake icons, so production was not affected. Font files are never inlined as base64 (`keepFontFilesExternal` in `apps/web/vite.config.ts`), so no stylesheet carries font data for scripts that the page does not use.

### Code navigation

`bun run graph:build` builds an optional local Graphify graph for "who calls this" questions. It is not committed and nothing depends on it. For package-level structure, read [the generated package graph](generated/package-graph.md).
