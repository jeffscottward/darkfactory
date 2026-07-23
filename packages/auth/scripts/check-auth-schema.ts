import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedSchema = resolve(
  packageDirectory,
  "generated/better-auth-schema.ts"
);
const authBinary = resolve(
  packageDirectory,
  `node_modules/.bin/auth${process.platform === "win32" ? ".cmd" : ""}`
);
const writeMode = process.argv.includes("--write");

if (!existsSync(authBinary)) {
  throw new Error(
    "Standalone auth CLI is unavailable; install @darkfactory/auth devDependencies"
  );
}

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "darkfactory-auth-schema-")
);
const candidateSchema = join(temporaryDirectory, "better-auth-schema.ts");

try {
  const generated = spawnSync(
    authBinary,
    [
      "generate",
      "--config",
      resolve(packageDirectory, "auth.schema.config.ts"),
      "--output",
      candidateSchema,
      "--yes",
    ],
    {
      cwd: packageDirectory,
      encoding: "utf8",
    }
  );

  if (generated.status !== 0) {
    const diagnostic = [generated.stdout, generated.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      `Better Auth schema generation failed${diagnostic ? `:\n${diagnostic}` : ""}`
    );
  }

  const candidate = await readFile(candidateSchema, "utf8");
  if (writeMode) {
    await mkdir(dirname(generatedSchema), { recursive: true });
    writeFileSync(generatedSchema, candidate, "utf8");
    process.stdout.write("Updated generated/better-auth-schema.ts\n");
  } else {
    if (!existsSync(generatedSchema)) {
      throw new Error(
        "Generated Better Auth schema is missing; run auth:schema:generate"
      );
    }
    const committed = readFileSync(generatedSchema, "utf8");
    if (committed !== candidate) {
      throw new Error(
        "Generated Better Auth schema is stale; run auth:schema:generate"
      );
    }
    process.stdout.write("Better Auth 1.6.24 schema is current\n");
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
