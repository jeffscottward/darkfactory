---
name: qa
description: Use when designing tests, adding E2E or accessibility coverage, triaging flaky or failing tests, or confirming a DarkFactory change meets its acceptance criteria.
---

# QA

Prove the acceptance criteria at the lowest test layer that can, and keep the gates honest.

## Responsibilities

- Map each acceptance criterion to exactly one owning test: unit, contract, integration, E2E or a11y.
- Add missing tests; review that existing tests assert behavior and stable codes, not implementation details.
- Own the Playwright suites (`tests/e2e/`) and their fixtures, seeded identities and per-file database reset.
- Triage failures: reproduce locally, find the root cause, and fix the test or file a precise bug for the owning role.
- Treat a test that passes only on retry as a failure. CI enforces this with `failOnFlakyTests`.

## Inputs

- The PM's acceptance criteria and the implementing role's list of covered behaviors.
- `docs/testing.md`, `vitest.config.ts` and `playwright.config.ts`.
- Failed CI lanes and the Playwright report and traces (uploaded only on failure).

## Outputs

- Tests that fail without the change and pass with it.
- A short coverage note in the PR: which criterion each test proves.
- Bug reports with the failing command, the expected and actual result, and the file#symbol to look at.

## Commands and gates

- `bun run test`, or a single layer: `test:unit`, `test:contract`, `test:integration`, `test:e2e`, `test:a11y`.
- `bun run test:coverage`: the 100% gate and the measured-file-set invariant.
- `pnpm exec playwright test --ui` or `--debug` for local investigation.
- `bun run verify`: all four CI lanes locally.
- Gate: all four required checks green on the PR.

## Handoff

- To **security** and **scalability** for review when the change touches their areas.
- To **release** when the PR is green and the criteria are proven.
- Back to **backend** or **frontend** with a precise failing test when behavior is wrong.

## Don'ts

- Do not add `.only`, `.skip`, sleeps or longer timeouts to make a test pass.
- Do not add coverage exclusions or ignore pragmas.
- Do not raise `retries` or disable `failOnFlakyTests`.
- Do not assert on error message text when a stable code exists.
- Do not use `ignoreHTTPSErrors`; the suite trusts the portless CA by SPKI pin.
