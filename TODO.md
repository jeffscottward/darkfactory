# DarkFactory post-build TODO

This file contains maintenance and hardening work that begins only after DF-118 has a green final evidence bundle for an exact SHA. It is not a place to defer v0.1 implementation, tests, documentation, deployment evidence, or unresolved CI. If the [evidence map](docs/evidence-map.md) is still draft/pending, every item below remains blocked.

## Authorized Shannon hardening

Source: [KeygraphHQ/shannon](https://github.com/KeygraphHQ/shannon)

**Owner:** Security owner. A named human system owner is the authorizer and stop authority.

**Prerequisites:**

- DF-118 is complete and green for the exact DarkFactory SHA to test.
- The current official Shannon README, configuration guide, safety guide, installation path, and release/commit have been reviewed immediately before execution.
- Written authorization covers the exact isolated source copy and target, test window, operator, allowed techniques, credentials, data mutation, rate/concurrency, cost, evidence handling, emergency contact, and stop authority.
- The target is non-production and isolated from production networks, credentials, providers, data, and third-party callbacks.
- PostgreSQL and any stateful dependency contain only synthetic disposable data and have a tested snapshot/reset path.
- Test accounts use scoped credentials for each required role and cannot authenticate to another environment.
- Network egress, DNS, target hostnames, and excluded third-party services are explicitly constrained.

**Rules of engagement:**

- Run Shannon only as authorized white-box, source-guided live exploitation. Never use it for black-box scanning or reconnaissance.
- Never target production, a shared staging environment, customer data, or a system not covered by explicit written authorization.
- Pin the source SHA, target build SHA, Shannon release/commit, configuration digest, and workspace identifier.
- Allow only enumerated hostnames, routes, methods, roles, techniques, and authentication flows.
- Set explicit rate/concurrency and spend ceilings. Exclude email/SMS delivery, third-party providers, destructive admin operations, and availability attacks unless the authorization specifically includes an isolated substitute.
- Keep secrets in the approved secret manager/runtime environment. Reports and logs must redact passwords, tokens, cookies, personal data, and provider credentials.
- A human monitors the run and retains the ability to revoke credentials, block egress, isolate the target, and terminate the process.

**Steps:**

1. Re-read the current official Shannon instructions; record the reviewed URLs and commit/release. Do not reuse a stale command from a prior run.
2. Approve a rules-of-engagement document and target inventory. Have the security owner and system owner sign it before credentials are issued.
3. Create separate isolated source and target workspaces. Verify target SHA, synthetic fixture state, snapshot restore, callback sinks, and egress restrictions.
4. Create least-privilege test credentials for anonymous, member, owner-boundary, and admin cases that are explicitly in scope.
5. Configure Shannon's source path, exact target, login flows, focus/exclusion rules, rate limits, report filters, and workspace using the current official schema.
6. Dry-review the resolved configuration with secrets redacted. Confirm it cannot resolve a production hostname or credential.
7. Execute the source-guided live run inside the isolated runner while collecting timestamps, target health, tool logs, costs, and stop-condition telemetry.
8. Stop and triage before reproducing any result manually. Separate proved findings from tool errors, environmental artifacts, and unverified hypotheses.
9. For every accepted finding, record severity, affected contract/route, sanitized proof, owner, remediation SHA, regression test, and residual risk.
10. Rebuild/redeploy the isolated target from the remediation SHA and restore known fixture state.
11. Rerun the exact affected exploit and a scoped regression set. Do not rerun unrelated destructive probes without renewed need.
12. Have the security owner close, accept, or escalate each finding and archive/delete evidence according to the approved retention rule.

**Evidence:**

- Authorization identifier, approvers, UTC window, scope, exclusions, and stop authority.
- DarkFactory source SHA, target artifact/deployment identifier, database snapshot identifier, and synthetic persona inventory.
- Shannon release/commit, official instructions reviewed, configuration digest, workspace identifier, and redacted invocation record.
- Scoped credential identifiers/roles without values; egress/hostname policy; rate, concurrency, and cost limits.
- Target health timeline, sanitized logs, proved exploit artifacts, affected routes/contracts, and explicit unproved observations.
- Finding ledger with severity, owner, remediation SHA, regression test, review decision, and residual risk.
- Rerun evidence showing the exploit no longer succeeds, or a signed risk acceptance with expiry and owner.
- Evidence retention/deletion record.

**Immediate stop conditions:**

- Authorization, source SHA, target identity, rules, credentials, or human monitor cannot be verified.
- DNS, redirects, callbacks, or credentials reach production, another tenant, or an excluded third party.
- Real/customer data appears, credentials leak, isolation fails, or evidence escapes the approved workspace.
- The target becomes unstable, availability degrades, data mutation exceeds the approved limit, or snapshot recovery fails.
- Rate/concurrency/cost ceilings are reached, monitoring is lost, Shannon behaves outside the resolved configuration, or the stop authority revokes permission.

**Completion condition:** Every proved finding is remediated and passes a scoped rerun, or has an explicit time-bounded risk acceptance by the named human owner. Evidence is retained or destroyed according to the approved rule. A stopped, partial, or inconclusive run remains pending, not green.

## Continuing Agentic Engineering and SDLC harness

Sources: [Agentic Engineering](https://www.youtube.com/watch?v=VQy50fuxI34) (inspiration) and the DarkFactory Agentic SDLC research/architecture review completed 2026-07-29. The requirements below are DarkFactory-owned synthesis, not claims attributed verbatim to the video.

**Owner:** Engineering productivity owner, with the maintainer of the affected contract as the outcome owner. Security, accessibility, database, and deployment owners approve their respective boundaries.

**Prerequisites:** DF-118 is green; the repository gates are stable; the owner has a representative task/eval set; tool permissions, escalation paths, evidence retention, and cost/time ceilings are documented.

### Harness contract

Every agent loop must satisfy these rules:

1. **Outcome first:** define the observable user/system outcome, non-goals, invariants, and objective pass/fail gates before choosing tools.
2. **Narrow inspectable tools:** expose only repository reads, focused scripts, Graphify queries, browser traces, and provider sandboxes needed for that outcome. No default production, deploy, secret, destructive database, or broad network permission.
3. **Context refresh:** at task start and every recovery boundary, reread `AGENTS.md`, relevant contracts/tests/docs, current Graphify paths, capability state, and the latest disk-backed checkpoint. Do not trust stale chat summaries.
4. **Objective gates:** use observable contract tests, schema/generated-artifact checks, real-PostgreSQL integration, browser evidence, accessibility checks, Graphify freshness, and terminal CI results. Self-report is not a gate.
5. **Checkpoints and recovery:** persist source SHA, owned files, completed gates, artifacts, next action, and stop condition after meaningful changes. Resume from the checkpoint, revalidate the worktree/context, and rerun the last affected gate rather than restarting from memory.
6. **Permissions and escalation:** require a human for secrets, deployments, destructive/reset operations outside disposable fixtures, production/shared targets, security exploitation, new infrastructure/data authority, risk acceptance, and any scope expansion.
7. **Evals and observability:** record task outcome, gate results, retries, tool calls/categories, time/cost ceiling, failure class, human interventions, and artifact links without logging secrets or sensitive data.
8. **Failure-driven iteration:** change the prompt, fixture, tool contract, recovery logic, or gate only in response to a reproduced failure. Add an eval that fails before the harness change and passes after it. Never weaken the product contract to improve agent success rate.

### Recurring loop: contract-to-runtime change

**Owner:** Affected feature maintainer. **Trigger:** Every feature, bug fix, contract change, or generator output.

**Steps:** Query Graphify; define outcome and failing observable test; inspect only the route/contract/service/repository path; implement the smallest vertical change; run focused unit/integration/browser gates; update OpenAPI/Graphify/docs; checkpoint; run the affected lifecycle and terminal CI.

**Evidence:** Outcome spec, Graphify query/path, failing-then-passing test, changed contract/artifact digests, browser/runtime observation where applicable, checkpoint, commit SHA, and CI URL.

**Stop:** Outcome and gates pass for the exact SHA, or an owned blocker with logs, next action, and explicit rerun condition is recorded. Never stop at generated scaffolding or a narrow test when the contract requires runtime proof.

### Recurring loop: compatibility baseline

**Owner:** Toolchain maintainer. **Trigger:** Monthly, before a dependency update, or when Node/Civet/vinext/Vite/React/Cloudflare behavior changes.

**Steps:** Reproduce the current baseline; inspect release notes and official compatibility sources; update one coherent toolchain boundary; run doctor fixtures, type/build/unit/integration/E2E, server/client bundle boundaries, and deployment build output; compare artifacts; update the baseline and recovery note only after evidence.

**Evidence:** Old/new versions, official sources, focused incompatibility reproduction, dependency/lock digest, doctor output, build/runtime artifacts, and CI URL.

**Stop:** All affected gates pass without a compatibility shim, or revert and record the upstream issue/version to watch. Do not broaden the update to unrelated packages.

### Recurring loop: PostgreSQL extension or external infrastructure

**Owner:** Database owner and architect. **Trigger:** A proposal for a new extension, cache, queue, search engine, or source of truth.

**Steps:** State the measured outcome; test PostgreSQL core first, then a supported extension/pattern; benchmark representative data/failure behavior; document authority, consistency, backup, credentials, monitoring, cost, deployment, and removal; require an ADR and human approval before an external system.

**Evidence:** Workload/measurement, query plans or benchmark, failure/recovery test, architecture decision, capability manifest delta, migration/removal path, and owner approval.

**Stop:** Use the simplest PostgreSQL option that meets the measured gate, or reject/defer the proposal. No speculative infrastructure or fake fallback enters the core.

### Recurring loop: security boundaries

**Owner:** Security owner. **Trigger:** Auth/input/API/provider/secret/deployment changes and scheduled post-build reviews.

**Steps:** Refresh threat boundaries; run focused authorization, owner-scope, input, redaction, seed-guard, dependency, and secure-cookie checks; inspect browser/network evidence; escalate live exploitation to the authorized Shannon process above.

**Evidence:** Threat delta, focused tests, browser/network captures with redaction, dependency findings, remediation SHA, and rerun result.

**Stop:** All new risks are remediated or explicitly accepted by a named human with expiry. Never substitute a static scan for authorized live evidence or run exploitation outside the Shannon boundary.

### Recurring loop: accessibility and responsive UI

**Owner:** UI/accessibility owner. **Trigger:** Every visible UI change and scheduled cross-route review.

**Steps:** Compare against the authoritative design system and continual references; exercise keyboard/focus/labels/contrast/44-by-44 targets/reduced motion; inspect 375, 768, 1024, and 1440 px; cover light/dark/system and affected palette states; fix the component/token source rather than route-specific symptoms.

**Evidence:** Route/state matrix, automated results, manual keyboard notes, viewport screenshots, browser/version, changed component/token, and regression result.

**Stop:** The affected matrix passes with stable layout, or the exact route/state failure remains an owned blocker. Never delete a viewport or theme from the matrix to obtain green.

### Recurring loop: seed and reset determinism

**Owner:** Database/testkit owner. **Trigger:** Migration, auth model, fixture, persona, or reset change.

**Steps:** Use a disposable PostgreSQL instance; verify production rejection and target classification; migrate empty state; seed twice; validate admin/member identities, content, relationships, deterministic IDs, and no secret leakage; reset and prove cleanup; rerun parallel integration/E2E consumers.

**Evidence:** Target classification, migration list, first/second seed outputs, row/invariant checks, production-guard failure, reset result, and downstream test artifacts.

**Stop:** Deterministic/idempotent results and production rejection pass, then destroy the fixture. Any uncertainty about the target stops the command before mutation.

### Recurring loop: capability truth and removal

**Owner:** Capability owner. **Trigger:** Capability manifest, dependency, environment, adapter, route, or availability claim changes.

**Steps:** Validate enabled/configured/available/disabled/unknown/incompatible states; test missing/partial configuration; inventory dependencies/routes/schema/services; exercise install and removal; update doctor, docs, Graphify, and deployment boundaries.

**Evidence:** Manifest diff, parser/doctor outputs, dependency and schema inventories, runtime check, unavailable behavior, removal proof, and owner.

**Stop:** Manifest, installed surface, configuration, runtime, and docs agree. Unknown/incompatible remains non-green; disabled leaves no active provider surface.

### Recurring loop: Graphify, generated contracts, and documentation

**Owner:** Change owner. **Trigger:** Feature/symbol/contract/database relationship/architecture changes and release preparation.

**Steps:** Query before broad exploration; update the code graph; run graph check/verify and route-to-database queries; check auth schema/OpenAPI/migrations; update only affected docs; lint scoped Markdown; reject stale or hand-edited generated output.

**Evidence:** Graphify version/manifest/digest/source fingerprint, representative queries, generated artifact digests, source paths, link check, and Markdown result.

**Stop:** Sources, generated artifacts, graph, and docs agree for the exact SHA, or the change remains blocked.

### Recurring loop: CI watcher and recovery

**Owner:** Pushing contributor; engineering productivity owner owns watcher reliability. **Trigger:** Every push to an open pull request or protected branch.

**Steps:** Attach the exact SHA/run; wait to terminal state; classify every failure as repository-owned, flaky, or external; reproduce repository-owned failures locally; fix and rerun; rerun flaky checks with count/evidence; checkpoint external blockers and set a bounded watcher/heartbeat.

**Evidence:** Push SHA, workflow/run/attempt URLs, terminal conclusions, artifact links, reproduction and repair commits, rerun count, blocker owner, and watcher stop condition.

**Stop:** All configured checks are green, or an exact external blocker is documented with owner and automatic/human follow-up. Cancelled, skipped, timed-out, pending, or unobserved is not green.

### Recurring loop: harness evaluation and failure-driven improvement

**Owner:** Engineering productivity owner. **Trigger:** Monthly and after any agent escape, repeated retry, false-green claim, permission violation, unrecoverable context loss, or expensive dead end.

**Steps:** Reproduce the failure in an isolated fixture; classify context/tool/prompt/gate/recovery/permission root cause; add a representative eval; change one harness control; run the prior and expanded eval sets; inspect quality, false-positive/false-negative, retry, human-intervention, time, and cost results; document rollback.

**Evidence:** Sanitized failure trace, root-cause classification, failing baseline eval, harness diff, passing result, regression set, metrics, permission review, and rollback checkpoint.

**Stop:** The reproduced failure is prevented without weakening product gates or expanding permissions, and no regression exceeds the approved threshold. Otherwise revert, retain the failing eval, and escalate the unresolved design decision to a human owner.

## OpenSSF Silver access continuity

Sources: pinned official [`access_continuity` level-1 MUST](https://github.com/ossf/best-practices-badge/blob/424f55aff728c97d55a3df53b2d04deef3bcb0d9/criteria/criteria.yml#L754-L757), its [continuity wording](https://github.com/ossf/best-practices-badge/blob/424f55aff728c97d55a3df53b2d04deef3bcb0d9/config/locales/en.yml#L2371-L2385), and Gold's [`achieve_silver` prerequisite](https://github.com/ossf/best-practices-badge/blob/424f55aff728c97d55a3df53b2d04deef3bcb0d9/criteria/criteria.yml#L1321-L1325).

**Owner:** Repository owner plus a separately named human continuity owner.

**Current blocker:** On 2026-07-25 GitHub showed one direct collaborator and one public contributor, and the repository documented no successor/co-maintainer, credential/key escrow, or legal-rights continuity arrangement. Passing is therefore the highest defensible badge; Silver `access_continuity` is Unmet and Gold is prerequisite-blocked. Do not mark this complete with a policy-only document.

**Steps:**

1. A second named human accepts the continuity role and its security, privacy, cost, and legal responsibilities.
2. Grant or securely escrow the minimum real authority needed to create/close issues, accept changes, publish a release within one week, recover required service access, and exercise any required legal rights.
3. Document revocation, rotation, death/incapacity transfer, emergency contact, and evidence-retention rules without committing secrets.
4. Run a sanitized recovery drill in which the continuity owner proves the required actions without help from the primary maintainer or access to production/customer data.
5. Record the drill, repair any gap, then assess every remaining Silver criterion. Evaluate Gold only after Silver is actually achieved.

**Completion condition:** The real arrangement and recovery drill satisfy the official one-week continuity outcome, all remaining Silver MUST criteria are independently reviewed, and the public OpenSSF assessment is updated truthfully.

**Immediate stop condition:** No separate human accepts the role; required authority cannot be granted safely; the drill would expose secrets or production data; or the arrangement exists only on paper.
