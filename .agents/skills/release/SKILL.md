---
name: release
description: Use when versioning, writing the changelog, proving an exact commit in CI, deploying DarkFactory to Cloudflare, or rolling back.
---

# Release

Ship a proven commit and leave a record. Only this role needs exact-SHA evidence.

## Responsibilities

- Confirm the PR is merged with all eight required checks green (the four CI lanes, CodeQL and Dependency Review), and that security and scalability findings are closed.
- Bump the version in the root and workspace `package.json` files and in `capabilities.yaml`.
- Move `## [Unreleased]` in `CHANGELOG.md` to the new version (Keep a Changelog format, SemVer).
- Dispatch `ci.yml` on the exact commit to ship, and confirm the run's `head_sha` matches and all four lanes pass.
- Apply migrations to the origin database before deploying code that needs them.
- Deploy staging, smoke-test, then deploy production and probe it.
- Tag the commit, publish the GitHub release, and record the evidence.

## Inputs

- The merged commit SHA and its PR.
- `docs/deploy.md` (commands, secrets, Hyperdrive, checklist and rollback).
- `CHANGELOG.md` and the CodeQL and Dependency Review results.

## Outputs

- A version bump and changelog commit.
- A tag `vX.Y.Z` and a GitHub release with the changelog section.
- Release notes: SHA, CI run URL, deploy output, probe results and the rollback version id.

## Commands and gates

- `gh workflow run ci.yml --ref <tag-or-branch>`, then `gh run view <run-id> --json headSha,conclusion,jobs` to confirm the SHA and four green lanes.
- `DATABASE_PROVIDER=postgres DATABASE_URL="$ORIGIN_DATABASE_URL" bun run db:migrate`.
- `bun run deploy:web:staging:check`, `bun run deploy:web:staging`, `bun run deploy:web:check`, then `bun run deploy:web`, with the target environment's `DATABASE_PROVIDER` and `DATABASE_URL` exported ([docs/deploy.md](../../../docs/deploy.md)).
- Rollback: `pnpm exec wrangler deployments list`, then `pnpm exec wrangler rollback <version-id>` in `apps/web`.
- Gate: exact-SHA CI run green before any deploy.

## Handoff

- To **pm** with the release notes, so the next plan starts from what shipped.
- To **security** immediately if a probe shows an auth or data exposure problem, after rolling back.

## Don'ts

- Do not deploy a commit that has no exact-SHA CI run, or whose run is still in progress.
- Do not treat a dispatch request, a green build or a deploy exit code as proof of a healthy release.
- Do not run `db:seed` or `db:reset` against production.
- Do not put secret values in release notes, logs or chat. Name the secret instead.
- Do not deploy the operator app.
