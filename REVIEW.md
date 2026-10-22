# Review instructions

These rules apply to every pull request review in this repository: the Claude Code review service, a local fresh-context reviewer subagent, and the operator's own review step. Project rules live in [AGENTS.md](AGENTS.md); this file only changes what a review reports.

## What Important means here

Report a finding as Important only when the change can do one of these:

- Break a contract: an oRPC contract, a Zod schema, a port interface or a migration that is not backward compatible.
- Leak data: secrets, tokens, `.env` values or personal data in code, logs, errors, fixtures or test output.
- Weaken a gate: a lowered threshold, a coverage exclusion, `.only`, `.skip`, a widened allowlist or a disabled hook.
- Let the operator run OMP outside an approved plan, or widen a sandbox, grant or tool allowlist.
- Make the docs, `capabilities.yaml` or a generated file disagree with the code.

Style, naming and refactoring suggestions are Nit at most.

## Cap the nits

Report at most five Nits per review.

## Do not report

- Anything CI already enforces: formatting, lint, type errors, Markdown lint and the coverage number.
- Generated files: `packages/api/openapi.json`, generated auth schema, Drizzle migration snapshots, `docs/generated/` and `pnpm-lock.yaml`.
- Archived history documents (the docs archive folder). They are history, not instructions.

## Evidence

- Every behavior claim needs a `file:line` citation in the source. Do not infer behavior from a name.
- Mark a finding Pre-existing when the pull request did not introduce it.
- On a bug fix, name the root cause and say whether the fix addresses it.

## Converge

- Flag the class of a bug once and list every instance, so the author fixes all of them in one round.
- Do not repeat a finding that an earlier round already posted.
- After the first two rounds, review only the new diff.
- After three rounds, stop and ask the author to reconsider the approach.

## Summary

Start the summary with the count of findings by severity. When there is nothing to fix, say so in one line.
