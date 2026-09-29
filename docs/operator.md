# Operator plane

The operator plane is an optional local brick that runs an agent SDLC against your repositories. A request is planned with Wayfinder, becomes a durable workflow run in Postgres, waits for your approval, and is then executed by an OMP agent inside a filesystem sandbox. Its packages declare `"brick": "agent-sdlc"`; no product brick may depend on them, and `deploy:web` never ships them.

## What it contains

| Piece | Path | Role |
| --- | --- | --- |
| Operator app | `apps/operator` (`@darkfactory/operator-app`) | Authenticated local UI at `https://operator.darkfactory.localhost` |
| Operator API | `packages/operator` | oRPC contract and services (runs, approvals, Wayfinder status) |
| Workflow runtime | `packages/jobs` | Workflow schema and repository, XState-driven runtime, pilot worker, OMP and Wayfinder adapters ([README](../packages/jobs/README.md)) |
| Verifier image | `packages/jobs/verifier/` | Pinned Docker image the worker uses to verify a run |
| Workflow machines | `packages/jobs/src/workflow/` | Approval, grants, guards and projections |

The seven `workflow_*` tables were created by migrations 0005–0007 in the product chain. They stay there, frozen, and are inert when the operator is unused. New workflow DDL goes to `packages/jobs/migrations` and must be applied with its own journal (`migrationsTable: "__operator_migrations"`); no script applies it yet because that folder is still empty.

## Platform support

| Platform | Status |
| --- | --- |
| macOS | Supported. The sandbox uses `/usr/bin/sandbox-exec`. |
| Linux | Not supported. The worker fails closed with `OmpConfigurationError: OMP filesystem sandbox is unsupported` (`packages/jobs/src/server/omp.ts#requireSandboxBackend`). |
| Windows | Not supported. |

The operator UI and API run anywhere, but no run can execute outside macOS. A Linux sandbox (for example bubblewrap) is deferred. Do not bypass the sandbox check.

## Enable it

1. Complete [getting-started.md](getting-started.md) so Postgres and the product run.
2. Install OMP, and the Wayfinder skill at `~/.agents/skills/wayfinder/SKILL.md`.
3. Build the verifier image once: `pnpm --filter @darkfactory/jobs verifier:image:setup`. It prints the digest for the next step. It builds on the Bun base pinned in `packages/jobs/verifier/Dockerfile`; to override it, set `DARKFACTORY_VERIFIER_BASE_IMAGE` to another `name@sha256:…` image.
4. Add to `.env` (see the comments in `.env.example`):

   | Key | Value |
   | --- | --- |
   | `WORKFLOW_REPOSITORIES_ROOT` | Absolute directory that holds the repositories the operator may touch |
   | `WORKFLOW_REPOSITORY_GRANTS` | Exact `ownerId=repositoryId` pairs, comma-separated, no wildcards. Secret. |
   | `WORKFLOW_VERIFIER_ID` | Approved Docker verification contract (default `darkfactory-verify-core-v2`) |
   | `WORKFLOW_VERIFIER_IMAGE_DIGEST` | Digest printed by `verifier:image:setup` |
   | `WORKFLOW_LEASE_OWNER`, `WORKFLOW_POLL_INTERVAL_MS`, `WORKFLOW_SHUTDOWN_TIMEOUT_MS` | Optional worker tuning |

   The operator API and the worker fail closed if `WORKFLOW_REPOSITORIES_ROOT` is missing or not absolute.
5. Start the operator app with portless. It writes `apps/operator/.dev.vars` first (`bun run operator:bindings` refreshes it alone):

   ```sh
   bun run operator:dev
   ```

6. Start the worker that processes queued runs. It reads the root `.env`, including `DATABASE_URL`:

   ```sh
   pnpm --filter @darkfactory/jobs run worker:pilot
   ```

Sign in as an admin (the seeded `admin@domain.test` locally), start a Wayfinder plan, review it, and approve it. HTTP and browser code never execute OMP; only the worker does, after the plan has been approved.

## Rebuild the verifier image

Rebuild after any change under `packages/jobs/verifier/`. The worker runs the image pinned in `.env`, so a rebuild alone changes nothing:

1. Run `pnpm --filter @darkfactory/jobs verifier:image:setup`, set the printed digest as `WORKFLOW_VERIFIER_IMAGE_DIGEST` in `.env`, then restart `worker:pilot`.
2. Delete every other verifier image. A rebuild untags the old one, so list them by label: `docker image ls --filter label=org.darkfactory.verifier.identity`, then `docker image rm` each ID except the new digest. Remove old images from any registry too.
3. Rotate the credentials from `.env` if an old image was exported, pushed or shared, and any real secrets in other `.env*` files under `apps/` or `packages/`.

Images from 0.3.0 or earlier hold each app's `.dev.vars` (every non-empty `.env` value) in their layers. `.dev.vars` stayed root-only in the image, so code under verification (uid 65532, no network) could not read it; anyone with access to the image can. World-readable `.env*` files there were readable in the container, with `/output` as the only way out.

## Remove it

For a product that does not need the agent plane:

1. Delete `apps/operator`, `packages/operator` and `packages/jobs`.
2. Remove the root scripts `operator:dev` and `operator:bindings`, the root `devDependencies` on `@darkfactory/jobs` and `@darkfactory/operator`, the `operator` target in `scripts/dev/targets.ts` and `scripts/dev-bindings.ts`, and the jobs and operator paths in `biome.jsonc`.
3. Remove `WORKFLOW_REPOSITORY_GRANTS` from `packages/config/src/server.ts` and the `WORKFLOW_*` keys from `.env.example`.
4. Run `pnpm install`, `bun run docs:generate`, then `bun run verify:prepush`.

Leave migrations 0005–0007 in place. Deleting applied migrations breaks the migration journal. If you want the tables gone, add a new migration that drops them.

## Safety

- The worker only runs approved plans, only inside the granted repositories, and only in the sandbox.
- An approval must match the run's current state; a stale approval is rejected (`StaleWorkflowApprovalError`).
- Only admins can use the operator API (`apps/operator/src/server/operator-session.ts`).
- The operator is a local development tool. Do not expose it on a public host.
