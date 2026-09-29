import { rm } from "node:fs/promises";
import { createNodeDatabase } from "@darkfactory/db/server";
import { migrate } from "@darkfactory/db/server/migration";
import {
  createPostgresTestDatabase,
  dropPostgresTestDatabase,
} from "@darkfactory/testkit/postgres";
import { e2eEnvironment } from "./env.ts";
import { resetDatabase } from "./helpers/database.ts";
import { startPreviewCaptureServer } from "./helpers/preview-capture.ts";

// Runs once per invocation, after the webServers are up. The app only opens the
// database per request, and its readiness probe (/robots.txt) needs none.
export default async function globalSetup(): Promise<() => Promise<void>> {
  const env = e2eEnvironment();
  const database = await createPostgresTestDatabase({
    runId: `e2e_${env.runId}`,
  });
  const cleanup: (() => Promise<void>)[] = [
    () => rm(env.runPaths.root, { force: true, recursive: true }),
    () => dropPostgresTestDatabase(database),
  ];
  const teardown = async (): Promise<void> => {
    const results = await Promise.allSettled(
      cleanup.toReversed().map((step) => step())
    );
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, "E2E teardown failed");
    }
  };
  try {
    if (database.databaseUrl !== env.databaseUrl) {
      throw new Error("E2E database differs from the one the app was given");
    }
    const resource = createNodeDatabase({
      connectionString: env.databaseUrl,
      maxConnections: 1,
    });
    try {
      await migrate(resource.db);
    } finally {
      await resource.close();
    }
    await resetDatabase(env);
    const capture = await startPreviewCaptureServer({
      appOrigin: env.appUrl,
      authDirectory: env.runPaths.authPreviews,
      binding: { hmacKey: env.previewHmacKey, runId: env.runId },
      contactDirectory: env.runPaths.contactPreviews,
      port: env.capturePort,
    });
    cleanup.push(() => capture.close());
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
