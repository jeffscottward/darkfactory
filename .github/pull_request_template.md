# Pull request

## Summary

<!-- The problem and the focused solution. Use a Conventional Commits title. -->

## Related issue

<!-- Link the issue, or write "None". -->

## Plan and acceptance

<!-- Goal, bricks touched, and the test that proves each acceptance criterion. -->

## Verification

| Command or observation | Result |
| --- | --- |
| `bun run verify:prepush` | <!-- pass/fail --> |

## Review notes

<!-- Risks, breaking changes, migrations, generated artifacts, UI screenshots. Write "None" when not applicable. -->

## Checklist

- [ ] I followed `AGENTS.md`, `ARCHITECTURE.md` and `CONVENTIONS.md`.
- [ ] The contract or schema changed before the implementation, and a test failed before the change and passes after it.
- [ ] `bun run verify:prepush` passes locally.
- [ ] I updated the docs that describe what I changed, and regenerated derived files (`openapi:generate`, `db:generate`, `docs:generate`) instead of editing them.
- [ ] I did not add secrets, credentials, session data, personal data or unredacted sensitive output.
- [ ] Vulnerability details, if any, went through `SECURITY.md`, not this PR.

Done means all four required checks are green: core, coverage, integration and browser.
