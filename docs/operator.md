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
| Linux | Supported. The sandbox uses bubblewrap (`/usr/bin/bwrap`), which needs unprivileged user namespaces. |
| macOS | Supported. The sandbox uses `/usr/bin/sandbox-exec`. |
| Windows | Not supported. |

Both sandboxes apply one filesystem policy (`packages/jobs/src/server/omp.ts#sandboxProfileFor`, `packages/jobs/src/server/bubblewrap.ts#bubblewrapOmpArguments`):

- The agent reads only its scope paths and writes to them only in implementation runs, plus its Wayfinder tracker and session directory. The rest of the repository, `.git`, your home directory and `/etc` (except DNS and TLS trust files) are invisible.
- Git runs without network. On macOS the agent has network to reach its model API, and so do its tools: `read` can fetch URLs, and Wayfinder plans can use `web_search`. On Linux the agent has no network, so URL reads and web search fail and it reaches only its model (see [Models and credentials](#models-and-credentials)).
- No capabilities. On Linux the sandbox also has a private process namespace and dies with the worker.

Before every run the worker checks the sandbox and fails closed with `OmpConfigurationError` (`packages/jobs/src/server/omp.ts#requireSandboxBackend`): on any other platform, when `sandbox-exec` or `bwrap` is missing, when `bwrap` or `nsenter` is not root-owned or is writable by others, when bubblewrap cannot create namespaces (for example where AppArmor restricts user namespaces), or, on Linux, when the model gateway is not configured, does not answer, or does not serve the run's model. Do not bypass these checks.

Linux differs in three ways:

- An implementation scope path must already exist. Create the directory first; macOS can grant a path that the run creates.
- Bubblewrap limits what is mounted, not what may run. No shell or `/usr/bin` is mounted, and the agent has no shell or exec tool.
- The agent has no network and holds no credentials: it reaches one model through a relay. macOS runs still get provider keys from the worker's environment.

On Linux, the Docker verifier works with Docker Engine or rootless Docker. For rootless Docker, set `DOCKER_HOST=unix:///run/user/<uid>/docker.sock` in `.env` and in the shell that builds the image. The worker accepts only a local unix socket, and the `cpu`, `memory` and `pids` cgroup controllers must be delegated to your user.

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
   | `WORKFLOW_OMP_GATEWAY_URL`, `WORKFLOW_OMP_GATEWAY_TOKEN_FILE` | Linux: the model gateway and its bearer file (see [Models and credentials](#models-and-credentials)) |
   | `WORKFLOW_OMP_IMPLEMENT_MODEL`, `WORKFLOW_OMP_PLAN_MODEL` | Optional: override the default models |

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

## Models and credentials

On Linux, OMP runs with no network and no credentials. Each run reaches exactly one model through a relay (`packages/jobs/src/server/model-relay.ts`) to a local `omp auth-gateway`, which holds the credentials:

| Step | Default model | Setting |
| --- | --- | --- |
| Implementation (writes code) | `anthropic/claude-opus-5-5` | `WORKFLOW_OMP_IMPLEMENT_MODEL` |
| Planning (Wayfinder) and review | `openrouter/google/gemini-3.8-flash` | `WORKFLOW_OMP_PLAN_MODEL` |

How a run reaches its model:

1. Before the run, the worker reads the gateway's bearer file, checks that the gateway answers and serves the run's model, and checks that `/usr/bin/nsenter` is root-owned. Otherwise the run fails closed.
2. It writes `models.yml` into the run's session directory, which sends the model's provider to `http://127.0.0.1:4000` over OMP's pi-native protocol, and starts bubblewrap paused.
3. `nsenter` places a byte relay on port 4000 of the sandbox's own loopback. The relay leads to a unix socket in a directory that only the worker can reach.
4. The worker accepts only `POST /v1/pi/stream` for the run's model on that socket, replaces the placeholder key with the gateway bearer, and streams the answer back. Only then does bubblewrap start OMP.

The sandbox holds no provider key, OAuth token or gateway bearer, and it cannot reach the gateway, the host or the internet directly. The gateway holds no refresh tokens either: it gets credentials from `omp auth-broker`, which keeps them in OMP's credential store.

Set up the gateway once per machine (see OMP's [auth broker and gateway](https://github.com/can1357/oh-my-pi/blob/main/docs/auth-broker-gateway.md)):

1. Sign OMP in to both models' providers: `/login anthropic` for a Claude subscription, and an OpenRouter key.
2. Run `omp auth-broker serve` (default `127.0.0.1:8765`) and `omp auth-gateway serve --bind=127.0.0.1:4010` as user services. The gateway needs `OMP_AUTH_BROKER_URL` and the broker token. Give it its own config directory (`PI_CONFIG_DIR`, relative to your home directory), so that its bearer is not shared, and an account pool file (`OMP_AUTH_BROKER_ACCOUNT_POOL_FILE`) that names only the accounts it may use.
3. Set `WORKFLOW_OMP_GATEWAY_URL=http://127.0.0.1:4010` and `WORKFLOW_OMP_GATEWAY_TOKEN_FILE` to the gateway's `auth-gateway.token` in `.env`. The file must be yours and readable by no one else.

Implementation runs count against the Claude plan's limits; planning and review runs are billed to the OpenRouter key.

## How the verifier runs

The worker mounts the changed workspace read-only in a Docker container (`packages/jobs/src/server/omp.ts#dockerVerifierArgumentsFor`). The runner in the image (`packages/jobs/verifier/runner.ts`) copies it, links the dependencies installed in the image into the copy, commits the copy to a new git repository, and runs the checks in `packages/jobs/verifier/checks.json` in order. A passing check prints only its ID; a failing check prints the last 12 KiB of its output.

The container has no network, a read-only root, no capabilities and user 65532. It gets 2 CPUs, 2 GiB of memory, 512 tasks and 300 s of CPU time per process. The task limit counts threads, and each Vite-based tool (Vitest, vinext) starts about 35. If a check fails with `EAGAIN` or `Resource temporarily unavailable`, a test started too many processes at once; limit its concurrency. `/tmp` allows executables; `/output` and `/cache` do not.

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
