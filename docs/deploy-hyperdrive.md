# Deploy with Cloudflare Hyperdrive

Hyperdrive pools connections from the web Worker to your PostgreSQL origin. The Worker still opens one `pg.Client` per request, which is the pattern Cloudflare recommends with Hyperdrive, and keeps its cap of 8 request connections per isolate.

1. Create one Hyperdrive config per environment. Keep query caching off; cached reads can return stale sessions.

   ```sh
   cd apps/web
   bunx --no-install wrangler hyperdrive create darkfactory-db \
     --connection-string="$ORIGIN_DATABASE_URL" --caching-disabled
   ```

   To verify the origin certificate, upload its CA with `wrangler cert upload certificate-authority --ca-cert origin-ca.pem --name origin-ca`, then add `--sslmode=verify-full --ca-certificate-id=<uuid>` to the create command.

2. In `apps/web/wrangler.jsonc`, give each environment that uses Hyperdrive its own binding and provider. Bindings and `vars` are not inherited, and the id belongs to one Hyperdrive instance.

   ```jsonc
   "vars": { "DATABASE_PROVIDER": "hyperdrive" /* , … */ },
   "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id printed by create>" }]
   ```

3. Do not set a `DATABASE_URL` Worker secret. With `DATABASE_PROVIDER=hyperdrive`, production rejects it so nothing can bypass Hyperdrive. Run migrations against the origin with `DATABASE_PROVIDER=postgres` and a direct `DATABASE_URL`.

4. Before deploying, `DATABASE_PROVIDER=hyperdrive bun run deploy:web:check` checks that each Hyperdrive environment declares its binding.

For local Worker runs with the binding declared, export `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<local PostgreSQL URL>`. Otherwise keep the default `DATABASE_PROVIDER=postgres` locally.
