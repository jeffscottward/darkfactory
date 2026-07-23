# DF evidence map

> **Draft — verified local evidence is recorded below; the final commit, remote CI, full manual browser matrix, and live deployment/security evidence remain pending.** This is not a final green report. Candidate file paths identify evidence sources only and do not prove a requirement passed.

The normative requirement text and acceptance criteria remain in [`docs/specs/DARKFACTORY_SPEC.md`](specs/DARKFACTORY_SPEC.md). Do not duplicate or silently reinterpret them here.

## Final evidence envelope

| Field | Required final value | Current value |
| --- | --- | --- |
| Final commit | Full SHA and branch/ref | Checkpoint `ba3814c` was pushed on `main`; the post-push repair candidate is not yet committed/pushed, so the final publication SHA is `PENDING` |
| Repository tree | Clean/status evidence and submodule state if applicable | Pushed checkpoint `ba3814c` plus uncommitted worker/Vite/E2E repair; final clean-tree proof is `PENDING` |
| Dependency inventory | pnpm/Node versions, lockfile digest, relevant package inventory | Locked workspace lifecycle passed; final repair leaves no Vinext, `.dev.vars`, suite-lock, dev-lock, or lock residue. Final version inventory and lockfile digest attachment are `PENDING` |
| CI | Workflow URL, run ID, attempt, exact SHA, terminal conclusion, artifacts | Remote workflow `30039191364` for pushed checkpoint `ba3814c` failed solely because Worker integration leaked an owned vinext descendant and blocked Playwright `webServer`. The absolute-final repaired local canonical lifecycle is green; repair commit/push and replacement remote CI are `PENDING` |
| PostgreSQL | Image/version, isolated target, migrations/digests, schema check | Loopback real PostgreSQL on port 55432; absolute-final integration 13 files/95 tests passed locally. Final migration/digest attachment is `PENDING` |
| Seeds | Target classification, first/second seed result, identities/content, reset evidence | Focused real-PostgreSQL seed/reset gates were approved; final per-command transcript/digest mapping is `PENDING` |
| Auth/OpenAPI | Auth schema check; OpenAPI path/version/digest/check | Auth schema and generated OpenAPI drift checks passed in the local lifecycle; final SHA/digests are `PENDING` |
| Graphify | Version, config/graph/manifest digests, source fingerprint/count, check/verify, representative queries | Repaired Graphify 0.9.2 secure Civet-aware build/check/verify passed fresh for 437 sources; manifest digests and five verified multi-hop queries are recorded below |
| Local HTTPS | canonical URL, `portless get`, PM2 identity/status, trust/browser observation | Automated Playwright passed through portless with the CI port override; canonical no-port PM2/trust observation is `PENDING` |
| Browser | Browser/version, routes/personas/themes/viewports, screenshots/traces/network/cookie evidence | Chromium E2E 8/8 passed locally for public/contact journeys; the complete persona/theme/manual screenshot matrix is `PENDING` |
| Accessibility | Automated report plus manual keyboard/focus/target/contrast/reduced-motion observations | Automated public/contact focus, responsive, target-size, overflow, and reduced-motion assertions passed; cross-route automated/manual evidence is `PENDING` |
| Events/observability | Correlated redacted event/log/trace evidence and failure behavior | Focused implementation/review gates were approved; final correlated runtime artifact is `PENDING` |
| Deployment | Authorized target, exact SHA, deployer/version, preview/deploy record, runtime probe, rollback | `pnpm deploy:web:check` exit 0 and explicitly performed no build/deploy. Preview/production deployment, runtime probe, and rollback were `NOT EXECUTED` and are not claimed |
| Security | Focused assertions and authorized assessment status; no unsupported certification | Focused security reviews were approved. Shannon was not executed; no penetration-test or certification claim. Final evidence mapping is `PENDING` |
| Review | Reviewer, UTC timestamp, exceptions/blockers, risk acceptances and expiry | Focused agent reviews approved their owned work; final integrator review and exact-SHA sign-off are `PENDING` |

## Current local evidence ledger

| UTC date | Scope | Observed result | Limitation |
| --- | --- | --- | --- |
| 2026-07-23 | Absolute-final local candidate `APP_ENV=test DATABASE_URL=<redacted loopback PostgreSQL URL on port 55432> PORTLESS_PORT=1355 CI=1 corepack pnpm run ci` | Exit 0: format, lint, Markdown, auth schema, OpenAPI, type exports, 15-package typechecks, vinext build, 13-package unit suites, integration 13 files/95 tests, and Chromium E2E 8 tests passed | Repair commit/push and replacement remote CI are pending. No Vinext, `.dev.vars`, suite-lock, dev-lock, or lock residue remained |
| 2026-07-23 | `pnpm deploy:web:check` after final refreeze | Exit 0; official adapter dry-run reported no build and no deployment | Not preview, production, runtime, or rollback evidence |
| 2026-07-23 | Final-refreeze secure Graphify build/check/verify | PASS fresh with Graphify 0.9.2, a Civet-aware local compiler, exact workspace-alias rewriting, 437 source files, `queriesVerified=5`, config digest `64fdc615ac01f6591f781106c26b9ca7eaa54e983342bc7d2057b88fadf0e341`, graph digest `0981e29b2cb33d7bfa149f055bfeea54e8f9e9f9e7fe72df2d7f43de141e8b49`, and source fingerprint `662f6ee0d706ef473e0e366aa31c90990e283af07c95e74b3167d05fc4ed3404` | Provider/application environment is never forwarded; code, security, and database reviews are terminal APPROVE; final repair SHA remains pending |
| 2026-07-23 | Focused real-PostgreSQL, contact, auth, account, theme, generator, local-DX, code, security, database, and design reviews | Focused gates/reviews reported approved in final agent handoffs | Per-DF artifact links and final integrator sign-off remain pending |
| 2026-07-23 | High-confidence custom publish secret scan | 462 files scanned, 0 findings | Varlock scan output is noisy with a false positive and is not claimed as a green result |
| 2026-07-23 | Earlier GitHub Actions run `30019480805` | Cancelled after stale scope | Not evidence for the current working state |
| 2026-07-23 | Pushed checkpoint `ba3814c`, GitHub Actions run `30039191364` | FAILED solely because Worker integration leaked its owned vinext descendant, which blocked Playwright `webServer` startup | Repository-owned failure reproduced and repaired locally; repair commit/push and replacement remote CI remain pending |
| 2026-07-23 | Final-refreeze post-push repair | Cold `.civet` dependency optimization preincludes `@tanstack/react-form` and excludes `lucide-react`; contact E2E fails closed on console/page errors; Worker process ownership is branded and memoized, Windows cleanup is bounded, and cleanup succeeds only after proven death/absence. Process-helper regression fixtures pass 6/6 | Absolute-final local lifecycle is green and code/security/database reviews are terminal APPROVE; remote confirmation is pending |

## Per-item evidence record

For each DF row, replace `PENDING` with an inspectable record or `NOT APPLICABLE` plus a requirement-grounded reason:

```text
Implementation: repository-relative file(s), symbols, generated artifacts
Focused verification: exact command/test and observed result
Runtime/manual: target, steps, browser/tool version, artifact path/URL
Revision: exact SHA
CI: run/attempt URL and terminal conclusion
Graphify: query/path and graph digest when relationships are relevant
Limitations/blocker: owner, next action, rerun trigger, stop condition
Reviewer and UTC time:
Status: PASS / FAIL / BLOCKED / NOT APPLICABLE
```

Only `PASS` means all acceptance evidence for that item was observed at the final SHA. `FAIL`, `BLOCKED`, skipped, cancelled, timed out, pending, and unobserved are not green.

## DF-001 through DF-010

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-001 | `PENDING` | `PENDING` | `PENDING` |
| DF-002 | `PENDING` | `PENDING` | `PENDING` |
| DF-003 | `PENDING` | `PENDING` | `PENDING` |
| DF-004 | `PENDING` | `PENDING` | `PENDING` |
| DF-005 | `PENDING` | `PENDING` | `PENDING` |
| DF-006 | `PENDING` | `PENDING` | `PENDING` |
| DF-007 | `PENDING` | `PENDING` | `PENDING` |
| DF-008 | `PENDING` | `PENDING` | `PENDING` |
| DF-009 | `PENDING` | `PENDING` | `PENDING` |
| DF-010 | `PENDING` | `PENDING` | `PENDING` |

## DF-011 through DF-020

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-011 | `PENDING` | `PENDING` | `PENDING` |
| DF-012 | `PENDING` | `PENDING` | `PENDING` |
| DF-013 | `PENDING` | `PENDING` | `PENDING` |
| DF-014 | `PENDING` | `PENDING` | `PENDING` |
| DF-015 | `PENDING` | `PENDING` | `PENDING` |
| DF-016 | `PENDING` | `PENDING` | `PENDING` |
| DF-017 | `PENDING` | `PENDING` | `PENDING` |
| DF-018 | `PENDING` | `PENDING` | `PENDING` |
| DF-019 | `PENDING` | `PENDING` | `PENDING` |
| DF-020 | `PENDING` | `PENDING` | `PENDING` |

## DF-021 through DF-030

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-021 | `PENDING` | `PENDING` | `PENDING` |
| DF-022 | `PENDING` | `PENDING` | `PENDING` |
| DF-023 | `PENDING` | `PENDING` | `PENDING` |
| DF-024 | `PENDING` | `PENDING` | `PENDING` |
| DF-025 | `PENDING` | `PENDING` | `PENDING` |
| DF-026 | `PENDING` | `PENDING` | `PENDING` |
| DF-027 | `PENDING` | `PENDING` | `PENDING` |
| DF-028 | `PENDING` | `PENDING` | `PENDING` |
| DF-029 | `PENDING` | `PENDING` | `PENDING` |
| DF-030 | `PENDING` | `PENDING` | `PENDING` |

## DF-031 through DF-040

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-031 | `PENDING` | `PENDING` | `PENDING` |
| DF-032 | `PENDING` | `PENDING` | `PENDING` |
| DF-033 | `PENDING` | `PENDING` | `PENDING` |
| DF-034 | `PENDING` | `PENDING` | `PENDING` |
| DF-035 | `PENDING` | `PENDING` | `PENDING` |
| DF-036 | `PENDING` | `PENDING` | `PENDING` |
| DF-037 | `PENDING` | `PENDING` | `PENDING` |
| DF-038 | `PENDING` | `PENDING` | `PENDING` |
| DF-039 | `PENDING` | `PENDING` | `PENDING` |
| DF-040 | `PENDING` | `PENDING` | `PENDING` |

## DF-041 through DF-050

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-041 | `PENDING` | `PENDING` | `PENDING` |
| DF-042 | `PENDING` | `PENDING` | `PENDING` |
| DF-043 | `PENDING` | `PENDING` | `PENDING` |
| DF-044 | `PENDING` | `PENDING` | `PENDING` |
| DF-045 | `PENDING` | `PENDING` | `PENDING` |
| DF-046 | `PENDING` | `PENDING` | `PENDING` |
| DF-047 | `PENDING` | `PENDING` | `PENDING` |
| DF-048 | `PENDING` | `PENDING` | `PENDING` |
| DF-049 | `PENDING` | `PENDING` | `PENDING` |
| DF-050 | `PENDING` | `PENDING` | `PENDING` |

## DF-051 through DF-060

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-051 | `PENDING` | `PENDING` | `PENDING` |
| DF-052 | `PENDING` | `PENDING` | `PENDING` |
| DF-053 | `PENDING` | `PENDING` | `PENDING` |
| DF-054 | `PENDING` | `PENDING` | `PENDING` |
| DF-055 | `PENDING` | `PENDING` | `PENDING` |
| DF-056 | `PENDING` | `PENDING` | `PENDING` |
| DF-057 | `PENDING` | `PENDING` | `PENDING` |
| DF-058 | `PENDING` | `PENDING` | `PENDING` |
| DF-059 | `PENDING` | `PENDING` | `PENDING` |
| DF-060 | `PENDING` | `PENDING` | `PENDING` |

## DF-061 through DF-070

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-061 | `PENDING` | `PENDING` | `PENDING` |
| DF-062 | `PENDING` | `PENDING` | `PENDING` |
| DF-063 | `PENDING` | `PENDING` | `PENDING` |
| DF-064 | `PENDING` | `PENDING` | `PENDING` |
| DF-065 | `PENDING` | `PENDING` | `PENDING` |
| DF-066 | `PENDING` | `PENDING` | `PENDING` |
| DF-067 | `PENDING` | `PENDING` | `PENDING` |
| DF-068 | `PENDING` | `PENDING` | `PENDING` |
| DF-069 | `PENDING` | `PENDING` | `PENDING` |
| DF-070 | `PENDING` | `PENDING` | `PENDING` |

## DF-071 through DF-080

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-071 | `PENDING` | `PENDING` | `PENDING` |
| DF-072 | `PENDING` | `PENDING` | `PENDING` |
| DF-073 | `PENDING` | `PENDING` | `PENDING` |
| DF-074 | `PENDING` | `PENDING` | `PENDING` |
| DF-075 | `PENDING` | `PENDING` | `PENDING` |
| DF-076 | `PENDING` | `PENDING` | `PENDING` |
| DF-077 | `PENDING` | `PENDING` | `PENDING` |
| DF-078 | `PENDING` | `PENDING` | `PENDING` |
| DF-079 | `PENDING` | `PENDING` | `PENDING` |
| DF-080 | `PENDING` | `PENDING` | `PENDING` |

## DF-081 through DF-090

| DF | Implementation and focused verification | Runtime, CI, Graphify, reviewer | Status |
| --- | --- | --- | --- |
| DF-081 | `PENDING` | `PENDING` | `PENDING` |
| DF-082 | `PENDING` | `PENDING` | `PENDING` |
| DF-083 | `PENDING` | `PENDING` | `PENDING` |
| DF-084 | `PENDING` | `PENDING` | `PENDING` |
| DF-085 | `PENDING` | `PENDING` | `PENDING` |
| DF-086 | `PENDING` | `PENDING` | `PENDING` |
| DF-087 | `PENDING` | `PENDING` | `PENDING` |
| DF-088 | `PENDING` | `PENDING` | `PENDING` |
| DF-089 | `PENDING` | `PENDING` | `PENDING` |
| DF-090 | `PENDING` | `PENDING` | `PENDING` |

## DF-091 through DF-100 audit starters

These paths and local results were observed during the documentation audit. Terminal status remains pending until exact-SHA and acceptance-specific external evidence is attached.

| DF | Candidate and observed local evidence | Required final evidence | Status |
| --- | --- | --- | --- |
| DF-091 | `.env.schema`; `.env.example`; `packages/config/`; config/unit/static gates included in local CI PASS; custom publish secret scan covered 462 files with 0 findings | Final-SHA config/docs mapping; Varlock's noisy false-positive result is not green evidence | `PENDING` |
| DF-092 | `packages/config/src/client.civet`; server/client boundary tests; package type/unit gates PASS locally | Explicit client-bundle allowlist inspection and production-config rejection artifact | `PENDING` |
| DF-093 | `scripts/dev/lifecycle.civet`; Playwright passed through portless with CI port override | Canonical no-port browser URL, `portless get darkfactory`, fixed-URL audit | `PENDING` |
| DF-094 | Root `dev:*` scripts; focused local-DX gates/review approved | Actual repeated-start PM2 identity/status/logs/stop and route health | `PENDING` |
| DF-095 | Root cert scripts; `scripts/dev/lifecycle.civet`; `.gitignore`; automated HTTPS route passed | Trusted canonical browser observation and fallback/key-ignore audit | `PENDING` |
| DF-096 | `packages/auth/`; web auth routes; focused auth/real-PostgreSQL gates approved | Final origins/callbacks/network/cookie/auth-browser evidence | `PENDING` |
| DF-097 | Root `doctor`; `scripts/doctor/`; focused DX fixtures/review approved | Actual healthy and missing-prerequisite outputs plus redaction audit | `PENDING` |
| DF-098 | vinext build PASS; `pnpm deploy:web:check` exit 0 with no build/deploy | Authorized preview artifact/runtime probe or explicit accepted blocker | `PENDING` |
| DF-099 | ADR 0001; dependency/config audit confirms no current Alchemy program/dependency | Final-SHA audit; future resource evidence only if enabled | `PENDING` |
| DF-100 | `capabilities.yaml`; manifest/config unit gates PASS; focused reviews approved | Final dependency/runtime availability inventory | `PENDING` |

## DF-101 through DF-110 audit starters

| DF | Candidate source evidence | Required final evidence | Status |
| --- | --- | --- | --- |
| DF-101 | Root `package.json`; local CI exercised canonical lifecycle and focused operation/generator/DX gates were approved | Final script inventory and remaining focused transcripts | `PENDING` |
| DF-102 | Repaired local canonical `pnpm run ci` exit 0; workflow `30039191364` exposed one repository-owned Worker cleanup failure | Commit/push repair and follow replacement exact-SHA remote CI to terminal state | `PENDING` |
| DF-103 | `.husky/pre-commit`; `.husky/pre-push`; checkpoint `ba3814c` was pushed after the environment-provisioned lifecycle | Rerun unchanged hook for repair commit and attach successful output | `PENDING` |
| DF-104 | `AGENTS.md`; `CONVENTIONS.md`; scoped Markdown lint PASS | Final policy checklist and review history showing no bypass | `PENDING` |
| DF-105 | Absolute-final local isolated real-PostgreSQL lifecycle PASS (13 files/95 tests) | Replacement exact-SHA remote isolated CI, migration/seed attachments | `PENDING` |
| DF-106 | Repaired local format/lint/auth/OpenAPI/types/build/unit/integration/E2E all PASS; remote `30039191364` failed only before Playwright due owned descendant leak | Replacement remote logs and failure-artifact behavior | `PENDING` |
| DF-107 | Pushed checkpoint `ba3814c`; post-push repair has green local gates and approved reviews | Create/push focused repair commit and map final tree | `PENDING` |
| DF-108 | Workflow `30039191364` failed on an owned vinext descendant; final local fix brands/memoizes ownership, bounds Windows termination, and gates cleanup on proven death/absence with helper fixtures 6/6 | Push repair and follow replacement GitHub Actions to terminal state | `PENDING` |
| DF-109 | Deploy adapter dry-run PASS without deployment; current CI has no deploy job | Protected authorized preview/deploy permissions/dependency evidence, or exact accepted blocker | `PENDING` |
| DF-110 | Cancelled stale run and remaining final-evidence gaps are recorded with next actions | Final URL/log/rerun/owner/stop record or explicit none | `PENDING` |

## DF-111 through DF-120 audit starters

| DF | Candidate source evidence | Required final evidence | Status |
| --- | --- | --- | --- |
| DF-111 | Local 13-package unit suites PASS | Exact-SHA deterministic suite and behavior/requirement mapping | `PENDING` |
| DF-112 | Absolute-final local real-PostgreSQL integration PASS: 13 files/95 tests, including process-helper regression fixtures 6/6 | Exact-SHA isolated target/migration/seed artifact mapping | `PENDING` |
| DF-113 | Local Chromium E2E PASS: 8 tests; contact E2E fails closed on console/page errors | Remaining auth/portal/account/admin/theme journeys, report/traces at final SHA | `PENDING` |
| DF-114 | vinext build and dependency-optimizer repair PASS; no Vinext/`.dev.vars`/suite-lock/dev-lock/lock residue; generator and automated public/contact responsive assertions PASS | Complete a11y/manual/browser/security/runtime/generator matrices and artifacts | `PENDING` |
| DF-115 | Final-refreeze secure Graphify 0.9.2 build/check/verify PASS fresh for 437 sources; manifest digests recorded; five queries verified `handleOrpcRequest` → `appContract` → `createFeatureItemService` → `FeatureItemRepository` → `featureItems` → `createFeatureItemRepository` | Attach the same graph evidence to the final repair SHA | `PENDING` |
| DF-116 | Constitution and deployment-boundary docs updated; scoped Markdown lint PASS | Final policy checklist against exact-SHA sources | `PENDING` |
| DF-117 | `capabilities.yaml` documents Memori disabled; providers remain disabled/preview as documented | Final dependency/schema audit proving no core Memori dependency/table | `PENDING` |
| DF-118 | Local ledger now records complete lifecycle and Graphify evidence honestly | Final SHA/tree/dependencies/migrations/seeds/browser/remote CI/deploy/events and every DF row | `PENDING` |
| DF-119 | `TODO.md` and `docs/security.md` contain authorized isolated Shannon workflow; current official sources were consulted | Final document review after DF-118; Shannon itself remains post-build and unexecuted | `PENDING` |
| DF-120 | `TODO.md` contains owned Agentic Engineering/SDLC harness loops and source | Final document review after DF-118; loops remain post-build work | `PENDING` |

## Browser matrix to finalize

| Surface | Personas/states | Required viewport/theme evidence | Artifact/result |
| --- | --- | --- | --- |
| Public navigation and error/not-found states | Anonymous | Local home/foundation journey plus navigation/focus/overflow at 375 and 1440 passed; error/not-found, 768/1024, themes, screenshots pending | `PARTIAL — local automated PASS` |
| Contact | Anonymous | Local validation/focus/duplicate prevention/outcomes/429/503/retry/loading passed; 375/768/1024/1440 overflow, 44×44 target, reduced-motion assertions passed | `PARTIAL — local automated PASS; live delivery/manual artifacts pending` |
| Sign-up/sign-in/logout/protection | Anonymous/member | Redirects, network, secure cookies, keyboard | `PENDING` |
| Forgot/reset/verify email | Anonymous/test identity | Preview transport, expiry/error/recovery | `PENDING` |
| Dashboard and feature items | Member/other owner/admin | Empty/loading/error/create/read/update/status/archive/scoping | `PENDING` |
| Account profile/address/preferences/security | Member | Persistence, validation, optimistic recovery, theme reconciliation | `PENDING` |
| Admin/users | Member/admin | Server denial/acceptance, search/pagination | `PENDING` |
| Theme system | Anonymous/member | 3 modes by 10 palettes; no flash/hydration mismatch | `PENDING` |
| Accessibility/responsive | All representative surfaces | Public/contact automated focus/layout/targets/reduced-motion partial PASS; axe/manual keyboard/contrast/cross-route matrix pending | `PARTIAL` |

## Representative Graphify queries to finalize

Record exact query output, graph digest, and source locations for at least:

- Public or portal route to framework entry and shared UI.
- `featureItems.create` route/procedure to contract, service, repository, schema, and adapter.
- Better Auth route to auth configuration, Drizzle adapter, and user/session schema.
- Theme preference route to contract, persistence, SSR cookie, client reconciliation, and UI tokens.
- Semantic mutation event to evlog, analytics port/PostHog adapter, and OpenTelemetry context.
- Capability manifest to doctor classification and enabled/disabled adapter/dependency surface.

Graphify 0.9.2 secure build/check/verify passed fresh on the absolute-final local tree at graph digest `0981e29b2cb33d7bfa149f055bfeea54e8f9e9f9e7fe72df2d7f43de141e8b49`. Five verified queries trace the meaningful multi-hop route-to-adapter chain `handleOrpcRequest` → `appContract` → `createFeatureItemService` → `FeatureItemRepository` → `featureItems` → `createFeatureItemRepository`. The provider/application environment was not forwarded to Graphify. The broader representative paths above and exact final repair SHA remain `PENDING`.

## Finalization checklist

- [ ] Every DF-001 through DF-120 row has one explicit terminal status.
- [ ] Every `PASS` links implementation plus acceptance-specific verification.
- [ ] Final SHA matches local evidence, generated artifacts, graph, and CI.
- [ ] Browser/manual evidence identifies route, state, persona, viewport, tool version, and artifact.
- [ ] CI URLs identify run attempt and terminal conclusion; no pending/skipped result is green.
- [ ] Deployment is proved by authorized runtime evidence or explicitly marked not executed/pending.
- [ ] Security language reports only observed evidence and never claims certification.
- [ ] Blockers include logs/URL, owner, next action, rerun trigger, and stop condition.
- [ ] A final reviewer signs and timestamps the bundle.
