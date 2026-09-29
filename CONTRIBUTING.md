# Contributing to DarkFactory

Thank you for improving DarkFactory. Keep changes focused, tested and documented.

## Before you start

- Search [existing issues](https://github.com/jeffscottward/darkfactory/issues) and use the bug or feature form when it fits.
- Report suspected vulnerabilities privately ([SECURITY.md](SECURITY.md)), not in a public issue.
- Read [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [CONVENTIONS.md](CONVENTIONS.md). They are the repository policies, for humans and agents alike.
- For a substantial feature, architecture change or new dependency, open an issue first so scope and boundaries can be agreed.

## Set up

```sh
mise install
bun run setup
bun run dev
```

Details and troubleshooting: [docs/getting-started.md](docs/getting-started.md).

## Workflow

```text
plan → contract → failing test → implement → bun run verify:prepush → PR
```

1. **Plan.** State the goal, what is out of scope, the bricks you will touch and the acceptance test.
2. **Contract.** Change the oRPC contract, Zod schema, port or migration first.
3. **Failing test.** Write it at the lowest layer that proves the behavior ([docs/testing.md](docs/testing.md)).
4. **Implement.** Make the smallest complete change. Iterate with `bun run check` and `pnpm exec vitest run <file>`.
5. **Pre-push.** `bun run verify:prepush` runs on `git push`. Fix the cause; never bypass the hook.
6. **PR.** Fill in the template. The PR is done when all four required checks are green: `Verification (core)`, `Verification (coverage)`, `Verification (integration)` and `Verification (browser)`.

Update the docs that describe anything you change, in the same commit, and regenerate derived files instead of editing them (`openapi:generate`, `db:generate`, `docs:generate`). A new workspace package needs a `brick` role in its `package.json`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, for example `feat(api): add project archive contract` or `fix(db): scope throttle lookups to owner`. Mark breaking changes with `!`. Keep one logical change per commit, with its tests and generated artifacts.

## Pull requests

- Explain the problem and the solution, and link the issue.
- List the commands you ran and their results.
- Call out risks, migrations, generated artifacts and UI changes (with screenshots).
- Never include credentials, tokens, private keys, session data, personal data or unredacted env or provider output.

Do not lower thresholds, skip tests, widen allowlists or change repository settings to get a green result.

By submitting a contribution, you agree that it may be distributed under the [MIT License](LICENSE).
