# ADR 0001: vinext and Alchemy deployment boundary

- Status: Accepted
- Decision date: 2026-07-23
- Scope: web deployment and ancillary Cloudflare resources
- Reviewed compatibility baseline: Alchemy 0.93.12

## Context

DarkFactory's web application is authored for Vite/vinext and Cloudflare Workers. The repository already exposes the official `@vinext/cloudflare` deployer through `bun run deploy:web:preview` and `bun run deploy:web`.

The capability manifest reserves Alchemy for ancillary Cloudflare infrastructure, but no ancillary resource is currently enabled. Adding an empty program merely to demonstrate the tool would create a destructive reconciliation surface without creating user value.

## Source review

The 0.93.12 package source establishes:

- The package is `alchemy@0.93.12` and initializes an application scope through the default `alchemy` export.
- Normal program completion calls `await app.finalize()`.
- Finalization enumerates persisted resource IDs, compares them with the resources present in the current run, and destroys absent IDs as orphans.
- An empty program run against a previously populated stage is therefore destructive reconciliation, not a preview.
- The 0.93.12 CLI does not expose a general `plan`, `preview`, or `--dry-run` command.
- Cloudflare resources are exported from `alchemy/cloudflare`; a resource such as `KVNamespace` would be a supported ancillary example only after the related capability is approved.

Primary exact-release sources:

- [Package manifest](https://unpkg.com/alchemy@0.93.12/package.json)
- [Public package entry](https://unpkg.com/alchemy@0.93.12/src/index.ts)
- [Application implementation](https://unpkg.com/alchemy@0.93.12/src/alchemy.ts)
- [Scope and finalization](https://unpkg.com/alchemy@0.93.12/src/scope.ts)
- [Cloudflare exports](https://unpkg.com/alchemy@0.93.12/src/cloudflare/index.ts)
- [KV namespace resource](https://unpkg.com/alchemy@0.93.12/src/cloudflare/kv-namespace.ts)
- [Cloudflare API boundary](https://unpkg.com/alchemy@0.93.12/src/cloudflare/api.ts)
- [CLI implementation](https://unpkg.com/alchemy@0.93.12/bin/alchemy.js)

These links pin the reviewed source. Before any future use, review the current official Alchemy release and migration notes rather than assuming that the 0.93.12 behavior or CLI remains unchanged.

## Decision

1. DarkFactory's vinext web application is deployed exclusively by official `@vinext/cloudflare`.
2. Alchemy may own only explicitly enabled, supported ancillary Cloudflare resources. It does not wrap, replace, or claim the vinext web deployment.
3. While no ancillary resource is enabled, DarkFactory has no `alchemy.run.ts`, no installed Alchemy dependency, and no Alchemy deployment command.
4. Alchemy 0.93.12 is a compatibility baseline for this decision only. It is not an active dependency, verified future pin, deployment proof, or production-readiness claim.
5. An empty `finalize()` program must never be run against a stage that may contain persisted resources.

## Consequences

- The current deployment surface stays small and truthful.
- No empty infrastructure program can accidentally reconcile/delete prior Alchemy state.
- Web preview/deployment evidence comes from `@vinext/cloudflare`, Cloudflare, and runtime probes.
- A future ancillary-resource capability must add its Alchemy dependency, program, stage/state-store policy, tests, operational documentation, Graphify relationship, and removal path in one reviewed change.
- That future change must revalidate the current release's resource support, finalization semantics, credentials, state behavior, and CLI. The 0.93.12 review cannot be treated as evergreen approval.

## Future activation gate

A proposal to add `alchemy.run.ts` is accepted only when all of the following are true:

- A real ancillary Cloudflare resource is enabled in `capabilities.yaml`.
- The resource is supported by the chosen Alchemy release without a fictional wrapper.
- The owner documents state storage, unique stage naming, isolation, credentials, deployment, destruction, rollback, and orphan-reconciliation behavior.
- Tests validate both enabled and disabled branches without touching a shared stage.
- The program contains no vinext web resource.
- An authorized preview uses a fresh isolated stage and records evidence.

Until that gate is satisfied, the correct Alchemy program is no program.

## Rejected alternatives

### Empty placeholder program

Rejected because `finalize()` can treat persisted resources absent from the empty program as orphans and delete them. Empty is not no-op.

### Generic Alchemy Vite resource for the web application

Rejected because the supported web boundary is `@vinext/cloudflare`; a generic wrapper would duplicate or misrepresent ownership.

### Treat 0.93.12 as permanently pinned infrastructure

Rejected because it is not installed and no ancillary resource currently justifies it. Compatibility must be re-reviewed when a real capability is enabled.

## Related documents

- [Capabilities and deployment](../capabilities-and-deployment.md)
- [Testing and evidence](../testing-and-evidence.md)
- [Architecture](../../ARCHITECTURE.md)
