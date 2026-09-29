-- Intentionally empty: no database change.
-- 0005-0007 were hand-written SQL without snapshots, so drizzle-kit diffed the
-- schema against the stale 0004 snapshot and kept regenerating outbox columns
-- that already exist. This custom migration only carries meta/0008_snapshot.json,
-- which records the current product schema (packages/db/src/schema/index.ts)
-- so `drizzle-kit generate` is clean again.
SELECT 1;
