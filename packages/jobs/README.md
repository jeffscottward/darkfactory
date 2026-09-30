# @darkfactory/jobs

Background jobs for DarkFactory, plus the operator plane's workflow persistence.
The product `@darkfactory/db` package holds no workflow code. This package owns
it:

- `./schema/workflow` holds the seven `workflow_*` Drizzle tables. They
  reference `users` from `@darkfactory/db/schema`.
- `./server/workflow-repository` is the durable workflow repository.
- `./server/workflow-error` classifies workflow errors by a stable
  `workflowErrorCode`. Use `isWorkflowError(error, code)` or
  `isStaleWorkflowApprovalError(error)`, not `instanceof`. Why: one file can
  load as two module instances, and `instanceof` then fails.

## Operator plane: opt-in and sandboxed

- The operator app, the pilot worker and the OMP adapter are opt-in. The
  product app never builds or queries them.
- OMP and git run in a filesystem sandbox: `sandbox-exec` on macOS, and
  bubblewrap on Linux (`src/server/bubblewrap.ts`). Other platforms fail closed
  with `OmpConfigurationError`. See `requireSandboxBackend` in
  `src/server/omp.ts`.
- On Linux the agent has no network and no credentials: each run reaches one
  model through a relay to a local `omp auth-gateway`
  (`src/server/model-relay.ts`, and
  [Models and credentials](../../docs/operator.md#models-and-credentials)).

## Migrations

- Migrations `0005`–`0007` in `packages/db/migrations` create the operator-plane
  `workflow_*` tables. They stay in the product chain so existing databases
  never lose data. The tables are inert when the operator is unused.
- `packages/db/drizzle.config.ts` points at the product schema only. It is
  still based on the `0004` snapshot, so `db:check` reports no pending diff.
- Put new operator DDL in `packages/jobs/migrations`. Apply it with a separate
  journal:
  `migrate(db, { migrationsFolder, migrationsTable: "__operator_migrations" })`.
  Never add workflow DDL to the product chain.
- `resetDevelopment` truncates the product tables with `CASCADE`. That also
  empties every `workflow_*` table that references them.

## Verifier image

`verifier/` holds the Docker verifier: its Dockerfile, the pinned `checks.json`
and the in-image `runner.ts`. Only the operator OMP pilot uses it. Build it, or
check a built image, from the repository root:

```sh
pnpm --filter @darkfactory/jobs verifier:image:setup
pnpm --filter @darkfactory/jobs verifier:image:check
```

`src/server/verifier-image.ts` refuses to run if `checks.json` or the argv
drift from their pinned digests. If you edit `checks.json`, re-pin
`OMP_VERIFIER_CONFIG_DIGEST` and the matching constants in `verifier-image.ts`
and `verifier/runner.ts`.

The image installs only dependencies. `verifier/Dockerfile.dockerignore` is an
allowlist of files (manifests, lockfile, `checks.json`, `runner.ts`); never
re-include a directory, or its whole subtree is sent, including `.dev.vars`,
`.env` and host `node_modules`. Bases are pinned by digest and pnpm by tarball
checksum; `scripts/ci/toolchain-invariants.test.ts` enforces all three rules.
After a rebuild, pin the new digest in `.env`; see
[Rebuild the verifier image](../../docs/operator.md#rebuild-the-verifier-image).
