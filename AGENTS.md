# AGENTS.md

The index for every agent and contributor. `CLAUDE.md` is a symlink to this file. It takes precedence over every other Markdown file; [ARCHITECTURE.md](ARCHITECTURE.md) (boundaries) and [CONVENTIONS.md](CONVENTIONS.md) (code rules) add detail. `docs/archive/` is history, not instructions.

## Mission

Keep DarkFactory a small, truthful, swappable product template. Build features as bricks behind contracts, prove them with tests, and leave the docs matching the code.

## Repo map

| Path | What lives there |
| --- | --- |
| `apps/web` | Product app: pages, route handlers, request scope (`src/server/request-scope.ts`) |
| `apps/operator` | Opt-in agent-SDLC app ([docs/operator.md](docs/operator.md)) |
| `packages/api` | oRPC contracts (`src/contracts/`), services (`src/server/`), `openapi.json` |
| `packages/db` | Drizzle schema, migrations, repositories, seeds, request database scope |
| `packages/auth` | Better Auth server and client, generated auth schema |
| `packages/config` | Zod env schema (`src/server.ts`), database profiles, `capabilities.yaml` loader |
| `packages/observability` | Event and telemetry ports, evlog and OTel adapters, redaction |
| `packages/ui`, `packages/state` | Presentational components; XState machines and Zustand stores |
| `packages/email`, `analytics`, `ai` | Capability bricks: a port, adapters, an adapter registry (`./adapters`) and `./test` fakes |
| `packages/jobs`, `packages/operator` | Agent-SDLC workflow runtime, schema and API |
| `packages/testkit` | Isolated Postgres test databases |
| `scripts/` | Bun scripts behind every root `bun run` command |
| `tests/` | Integration, generator and Playwright E2E suites |
| `.agents/skills/<role>/SKILL.md` | Role playbooks (see below); `.claude/skills` links here |
| `capabilities.yaml` | What is enabled, and which adapter provides it |
| [`docs/generated/package-graph.md`](docs/generated/package-graph.md) | Live package graph, generated from each `package.json` `brick` role |

## Golden rules

1. **Contracts first.** Change the oRPC contract or Zod schema and its failing test before the implementation.
2. **Ports and adapters.** Vendor SDKs are imported only in adapter files. Features and services depend on ports.
3. **TypeScript strict.** No `any`, no `@ts-ignore`, no non-null assertions on untrusted data. Validate input with Zod at boundaries.
4. **Tests and the 100% gate.** Every source file is measured. Cover new code with tests, not with coverage exclusions.
5. **No secrets.** Never commit, log or print secrets, `.env` values, tokens or personal data. Seeded accounts are dev-only.
6. **Drizzle only.** All Postgres access goes through `packages/db` repositories and generated migrations.
7. **oRPC only.** No ad hoc REST routes, server actions or direct database calls from pages.
8. **Small, focused commits.** One change per commit, with its tests, generated artifacts and docs. Use Conventional Commits.
9. **Never weaken a gate.** Do not lower thresholds, skip tests, add `.only`, widen allowlists or disable hooks to go green.
10. **Keep docs live.** If you change a command, contract, port or boundary, update the doc that describes it in the same commit. A new package needs a `brick` role; run `bun run docs:generate`.
11. **Keep the manifest truthful.** `capabilities.yaml` lists only what is installed and wired.
12. **No speculative infrastructure.** Postgres first. Add a service, dependency or abstraction only for a current requirement.

## Workflow

```text
plan → contract → failing test → implement → bun run verify:prepush → PR (4 lanes green = done)
```

- **Plan:** state the goal, the bricks touched and the acceptance test. The `pm` and `architect` skills own this.
- **Contract:** oRPC contract, Zod schema, port interface or migration.
- **Failing test:** at the lowest level that proves the behavior (unit, contract, integration or E2E).
- **Implement:** the smallest complete vertical change. Iterate with `bun run check` and focused `pnpm exec vitest run <file>` runs.
- **Pre-push:** `bun run verify:prepush` runs automatically on `git push`. Fix the cause instead of bypassing the hook.
- **PR:** done when the four required checks pass: `Verification (core)`, `Verification (coverage)`, `Verification (integration)` and `Verification (browser)`.
- **Exact-SHA evidence** is required only for a release or deploy. Dispatch `ci.yml` on the exact commit and confirm the run's `head_sha` before deploying ([docs/deploy.md](docs/deploy.md#release-checklist)).

Graphify is optional: `bun run graph:build` builds a local graph for navigation. It is never committed or required.

## Agent roles

Each role is a harness-agnostic Agent Skill in `.agents/skills/` (Claude Code finds the same files through `.claude/skills`). Load the one that matches the task.

| Role | Use it for | Skill |
| --- | --- | --- |
| PM | Turn a request into a scoped plan with acceptance tests | [pm](.agents/skills/pm/SKILL.md) |
| Architect | Brick boundaries, contracts, ports, ADRs | [architect](.agents/skills/architect/SKILL.md) |
| Backend | Services, repositories, migrations, adapters | [backend](.agents/skills/backend/SKILL.md) |
| Frontend | Pages, components, view-models, accessibility | [frontend](.agents/skills/frontend/SKILL.md) |
| QA | Test design, E2E and a11y, flake triage, gates | [qa](.agents/skills/qa/SKILL.md) |
| Security | Threat review, secrets, auth, dependency alerts | [security](.agents/skills/security/SKILL.md) |
| Scalability | Database load, request scope, Worker limits | [scalability](.agents/skills/scalability/SKILL.md) |
| Release | Versioning, changelog, exact-SHA CI, deploy | [release](.agents/skills/release/SKILL.md) |

The hand-offs between roles are drawn in [ARCHITECTURE.md](ARCHITECTURE.md#sdlc-agent-graph).

## Deeper docs

- [ARCHITECTURE.md](ARCHITECTURE.md): brick map, request flow, SDLC graph, CI lanes, decisions log
- [CONVENTIONS.md](CONVENTIONS.md): modules, naming, errors, logging, tests, feature slices
- [docs/getting-started.md](docs/getting-started.md), [docs/testing.md](docs/testing.md), [docs/capabilities.md](docs/capabilities.md), [docs/deploy.md](docs/deploy.md), [docs/debugging.md](docs/debugging.md), [docs/operator.md](docs/operator.md), [docs/security.md](docs/security.md)
- [design-system/darkfactory/MASTER.md](design-system/darkfactory/MASTER.md): UI specification
- [SECURITY.md](SECURITY.md): reporting vulnerabilities
