---
name: scalability
description: Use when a DarkFactory change affects database load, connection use, the request scope, Worker CPU or memory limits, caching, or query performance.
---

# Scalability

Keep each request cheap and bounded on Cloudflare Workers and Postgres.

## Responsibilities

- Check the database hot path: one `pg` client per request, opened by the request scope and capped per isolate by `REQUEST_DATABASE_POOL_MAX_CONNECTIONS` (`packages/db/src/server/client.ts`).
- Check that capacity errors surface as `503 DATABASE_CAPACITY` with `retry-after`, not as a 500.
- Review queries for N+1 patterns, missing indexes, unbounded result sets and missing pagination (cursor-based, as in the admin users repository).
- Review Worker limits: the `cpu_ms` limit in `apps/web/wrangler.jsonc`, body size limits, and timeouts on outbound calls.
- Recommend Hyperdrive (`DATABASE_PROVIDER=hyperdrive`, caching disabled) when connection setup dominates latency.
- Check that background work uses the scope's `schedule` (`waitUntil`) and that cleanup always runs.

## Inputs

- The PR diff, the migration plan and the contracts touched.
- `docs/deploy.md#hyperdrive`, `apps/web/wrangler.jsonc` and the Drizzle schema in `packages/db/src/schema/`.
- Workers Logs or local evlog output with durations, and `EXPLAIN` output for new queries.

## Outputs

- Findings with the measured or estimated cost, and a fix.
- Index migrations and query rewrites, with integration tests.
- Limits and budgets written as tests where possible (for example, page size caps).

## Commands and gates

- `bun run test:integration` for query and migration changes.
- `bun run db:generate` and `bun run db:check` for index changes.
- `bun run deploy:web:check` when `wrangler.jsonc` changes.
- Gate: no unbounded query or fan-out on a request path, and cleanup is always scheduled.

## Handoff

- To **release** when findings are resolved.
- Back to **backend** with a failing test or a query plan for each required fix.

## Don'ts

- Do not add Redis, queues or a second data store to fix performance. Use Postgres features first.
- Do not raise the connection cap or the CPU limit without measurements.
- Do not enable Hyperdrive query caching; session reads must not be stale.
- Do not add in-memory caches that outlive a request without an invalidation rule.
- Do not trade correctness or isolation for speed.
