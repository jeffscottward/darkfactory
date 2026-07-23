# Capabilities and deployment

[`capabilities.yaml`](../capabilities.yaml) records architectural selections and capability intent. Runtime availability still depends on installed code, complete configuration, and a successful focused check. Do not infer availability from a provider name alone.

## Capability truth model

Use these terms consistently:

- **Enabled**: intentionally active for the current environment and backed by its required adapter/configuration.
- **Configured**: all required values are present, but runtime availability still needs verification.
- **Available**: an enabled/configured capability passed its focused runtime check.
- **Disabled**: deliberately inactive and not part of the core runtime.
- **Unknown**: the manifest, environment, dependency, or runtime result cannot establish state.
- **Incompatible**: the installed/versioned implementation fails its declared compatibility check.

Unknown and incompatible are never aliases for disabled or available.

## Current manifest boundary

The manifest currently declares these core selections:

- Vite/vinext on Cloudflare Workers for the web runtime.
- PostgreSQL through Drizzle, with PlanetScale named as the selected portable provider.
- Contract-first oRPC and generated OpenAPI.
- Better Auth.
- Tailwind and shadcn composition.
- evlog and OpenTelemetry, with product analytics behind a PostHog adapter.
- Graphify for developer context.
- portless and PM2 for local HTTPS.
- XState for explicit workflows and Zustand for ephemeral client-local state.

Configuration-sensitive adapters include Groq, Resend, PostHog, and remote OpenTelemetry export. Email preview is the safe local transport; a missing optional provider configuration must disable that provider or select the explicit local adapter, never create a fake production fallback.

The manifest explicitly disables:

- Mintlify documentation and public docs.
- Celery jobs and Flower.
- Uptime Kuma.
- GlitchTip error tracking.
- R2 storage.
- PostgreSQL-backed Memori context graphs.
- pgvector, PostGIS, TimescaleDB, pg_trgm, and pg_cron.

Disabled capabilities must remain removable and must not leave provider dependencies, schema objects, background services, credentials, or user-facing claims in the core. Memori in particular remains a disabled PostgreSQL-backed capability with no core memory tables or authority over application truth.

Run the manifest and prerequisite inspection with:

```bash
varlock load -- pnpm doctor
```

The doctor reports required, development-scoped optional, and disabled classifications. Provider groups are reported as optional until their complete environment group exists.

## Enabling a capability

A capability change is a complete vertical change, not a manifest toggle. Before enabling one:

1. Define its user outcome, owner, data authority, provenance, retention, and failure behavior.
2. Prefer a PostgreSQL core feature, then a proven PostgreSQL extension/pattern, before introducing an external system.
3. Define a small provider-neutral port and typed errors at the real external boundary.
4. Add the adapter and only the dependencies required by the enabled capability.
5. Add server-only environment schema/example entries and an explicit client allowlist decision.
6. Add installation, migration, removal, rollback, and secret-rotation instructions.
7. Add deterministic contract/integration tests and an unavailable/misconfigured test.
8. Update `capabilities.yaml`, Graphify, relevant architecture/docs, and generated artifacts together.
9. Run the focused gate and full affected lifecycle; record evidence rather than declaring availability from configuration.

If safe removal would require rewriting the domain, the boundary is wrong or the feature is Core rather than a Capability.

## Web deployment

The authored web application has one deployer: official `@vinext/cloudflare`.

```bash
pnpm build
pnpm deploy:web:check
pnpm deploy:web:preview
pnpm deploy:web
```

`pnpm build` is local compilation. `pnpm deploy:web:check` performs the adapter's non-deploying dry-run setup validation. The preview and production deploy commands are explicit, credentialed Cloudflare operations. Run a deploy only with an authorized account, reviewed target, protected environment, correct secrets, a green required CI run for the same SHA, and a rollback owner.

The repository's current GitHub Actions workflow verifies code and uploads Playwright failure artifacts; it does not contain an automatic deployment job. Therefore this repository does not claim that preview or production deployment has occurred. Deployment evidence remains pending until an operator records the target, SHA, command/run URL, output, runtime probe, and rollback result in [the evidence map](evidence-map.md).

Untrusted pull requests must never receive deployment credentials. A future deployment workflow must use least-privilege permissions, an environment approval boundary, exact SHA promotion, and a dependency on the successful verification workflow.

## Alchemy ancillary-resource decision

DarkFactory does not currently enable an ancillary Cloudflare resource. Consequently:

- There is intentionally no `alchemy.run.ts`.
- No Alchemy package or command participates in the current build/deploy path.
- Alchemy 0.93.12 is a source-reviewed compatibility baseline only, not an installed capability or deployment claim.
- The vinext web application is deployed exclusively by `@vinext/cloudflare`.

This absence is a safety property. In Alchemy 0.93.12, `finalize()` reconciles persisted resource IDs and destroys previously persisted resources that are absent from the current program. An otherwise empty program can therefore delete resources from a reused stage; it is not a harmless preview. The 0.93.12 CLI exposes no general `plan`, `preview`, or `--dry-run` operation that would make an empty program safe.

When a real supported ancillary resource is approved, create an Alchemy program only as part of that capability's complete change. Pin and re-review the then-current release, use an isolated stage/state store, declare only the enabled ancillary resources, and keep the vinext web deployment outside the Alchemy program. Deployment and destruction must use the exact same reviewed stage; never test reconciliation against an existing shared stage.

The full source record and consequences are in [ADR 0001](adr/0001-vinext-alchemy-boundary.md).

## Deployment evidence checklist

Do not mark a deployment complete until all applicable fields are observed:

- Exact source SHA and clean generated-artifact checks.
- Terminal CI run URL for that SHA.
- Authorized operator and approved Cloudflare account/environment.
- Deployer and exact version.
- Redacted command/run record and target identifier.
- Build/deployment output artifact.
- Runtime HTTPS probe and representative authenticated/unauthenticated flow.
- Database migration state and rollback compatibility.
- Secret names and rotation owner without secret values.
- Structured event/trace correlation with sensitive data redacted.
- Rollback command/owner and observed result or explicitly unexercised status.

A preview URL is not production evidence. A successful build is not deployment evidence. A deployment command exit code is not a runtime-health or rollback proof.

## Related documents

- [ADR 0001: vinext and Alchemy deployment boundary](adr/0001-vinext-alchemy-boundary.md)
- [Local development](local-development.md)
- [Testing and evidence](testing-and-evidence.md)
- [Security](security.md)
