# Contributing to DarkFactory

Thank you for improving DarkFactory. Keep changes focused, reviewable, and supported by evidence appropriate to the behavior they change.

## Before you start

- Search [existing issues](https://github.com/jeffscottward/darkfactory/issues) before opening a new one.
- Use the bug or feature issue form when it fits the work.
- Report suspected vulnerabilities through the private process in [SECURITY.md](SECURITY.md), not in a public issue.
- Read [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [CONVENTIONS.md](CONVENTIONS.md). They are the canonical repository policies.

Small fixes can go directly to a pull request. For a substantial feature, architecture change, or new dependency, open an issue first so scope and boundaries can be reviewed before implementation.

## Local setup

DarkFactory uses Bun 1.3.14 for scripts and TypeScript, pnpm 11.16.0 through Corepack 0.34.7 for packages/workspaces, and Node.js >=22.13 for compatibility paths. Docker Compose, PM2 7.0.3, Portless 0.13.0, Graphify 0.9.2, Varlock 1.13.0, uv 0.11.32, and Playwright/Chromium 1.61.1 support particular development and verification paths.

```bash
sh scripts/install-prerequisites.sh
cp .env.example .env
```

The copied environment file is only a starting point. Keep real secrets in ignored environment files or an approved secret store. Follow [Local development](docs/local-development.md) for PostgreSQL, Varlock, trusted HTTPS, and the canonical `https://darkfactory.localhost` workflow.

## Make a change

1. Create a focused branch from the current default branch.
2. Add or update tests when the change creates or modifies observable behavior.
3. Follow existing package boundaries and naming, error, data, and security conventions.
4. Update documentation when commands, contracts, setup, or user-visible behavior change.
5. Keep generated artifacts in sync with their sources; do not hand-edit generated output.
6. Remove only code made obsolete by your change.

Useful source-to-artifact checks include:

```bash
bun run auth:schema:check
bun run api:openapi:check
bun run db:check
bun run docs:check
```

Run only the checks applicable to the change while iterating. The repository's [Testing and evidence guide](docs/testing-and-evidence.md) maps change types to focused and follow-through gates.

## Verify the change

Start with the narrowest meaningful test or contract. Common repository gates are:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test:unit
bun run test:contract
bun run test:integration
bun run verify:graph
```

Commands that need environment values should run through Varlock, for example:

```bash
varlock run -- bun run test:integration
```

Documentation-only changes need scoped link and path review plus Markdown lint; they do not need artificial application tests. Database, browser, provider, and deployment checks have additional prerequisites and safety boundaries documented in [Testing and evidence](docs/testing-and-evidence.md). Do not run credentialed deployment commands merely to validate a contribution.

Before requesting review, run the complete applicable gate and record the exact command and result. `bun run verify:core` is the broad deterministic pre-push lifecycle. Environment-heavy verification remains explicit; use `bun run verify` only after its documented prerequisites are ready. The coverage lane is the measured exception: it invokes Vitest under Node through `corepack pnpm exec` because Bun 1.3.14 lacks the V8 `node:inspector` coverage APIs.

## Open a pull request

Complete the pull request template with:

- a concise explanation of the problem and solution;
- a linked issue when one exists;
- exact verification commands and observed results;
- screenshots, traces, or migration details when applicable;
- risks, limitations, and follow-up work that affect review; and
- documentation or generated-artifact updates required by the change.

Do not include credentials, tokens, private keys, session data, personal data, or unredacted environment and provider output in commits, issues, logs, or pull request artifacts.

By submitting a contribution, you agree that it may be distributed under the repository's [MIT License](LICENSE).
