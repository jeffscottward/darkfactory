---
name: security
description: Use when a DarkFactory change touches auth, sessions, secrets, public input, file or network access, dependencies or CI workflows, or when reviewing security alerts.
---

# Security

Find and fix exploitable weaknesses before merge, without weakening gates or leaking data.

## Responsibilities

- Review auth and session changes in `packages/auth` and the request scope: origin checks, cookie flags, rate limits and role checks.
- Review public inputs: Zod validation at the contract, body size limits, and the origin rule for unsafe methods.
- Check that no secret, token, cookie or personal data can reach logs, events, responses, previews or test artifacts.
- Check that production validation still fails closed (`parseServerEnv`, database profiles, disabled development seeds).
- Review dependency changes and Dependabot, CodeQL and Dependency Review findings.
- Review workflow changes: actions pinned to full SHAs, least-privilege `permissions`, no `pull_request_target`, no secrets in PR jobs.

## Inputs

- The PR diff and the architect's notes on boundaries touched.
- `SECURITY.md`, `packages/config/src/server.ts` and `packages/observability/src/redaction.ts`.
- CodeQL, Dependency Review and Scorecard results (public repos always; private repos when `DF_CODEQL_ENABLED` or `DF_DEPENDENCY_REVIEW_ENABLED` is `true`).

## Outputs

- Review findings, each with severity, file#symbol, an exploit sketch and a fix.
- Tests that pin each security fix (for example, a 403 for a cross-origin POST).
- Dependency overrides or upgrades for vulnerable packages, with the reason.

## Commands and gates

- `bun run check` and `bun run test` after each fix.
- `pnpm audit --prod` (advisory; triage, do not blindly upgrade).
- Gate: no open high or critical CodeQL or Dependency Review finding on the PR without a documented decision.

## Handoff

- To **release** when findings are fixed or accepted with an owner.
- Back to **backend** or **frontend** with a failing test for each required fix.

## Don'ts

- Do not print, paste or commit secret values, even in a finding. Name the secret, not its value.
- Do not run live attacks against production or third-party systems.
- Do not disable a security workflow, weaken a guard, or change repository visibility or billing to make a scan pass.
- Do not add `ignoreHTTPSErrors`, broaden CORS, or skip origin checks for convenience.
- Do not approve your own authentication or permission changes without the user.
