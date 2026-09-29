import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Bun runtime globals used by this script. bun-types is not installed, so declare
// only the minimal surface this Bun-executed script relies on.
declare global {
  interface ImportMeta {
    readonly dir: string;
  }
}
declare const Bun: Readonly<{
  which: (command: string) => string | null;
  spawn: (
    command: readonly string[],
    options: Readonly<{
      cwd: string;
      env: Readonly<Record<string, string>>;
      stdin: "ignore";
      stdout: "inherit" | "pipe";
      stderr: "inherit" | "pipe";
    }>
  ) => Readonly<{
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    exited: Promise<number>;
  }>;
}>;

const CONFIG_DIGEST =
  "2bf863dec20f96b200995f953a7f7b055e5738f6f3bbc830185cff03e0f8500d";
const ARGV_DIGEST =
  "0970fa90d3ab277f28b29a75762d2e81be2a9b60fc280d4122a663ac57ff2eff";
const VERIFIER_ARGUMENTS = Object.freeze([
  "/usr/local/bin/bun",
  "/opt/darkfactory-verifier/runner.ts",
  "--config",
  "/opt/darkfactory-verifier/checks.json",
  "--workspace",
  "/workspace",
  "--output",
  "/output/result.json",
] as const);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PINNED_IMAGE_PATTERN =
  /^[a-z0-9][a-z0-9._/-]{0,255}@sha256:[a-f0-9]{64}$/u;
const IMAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,255}$/u;

const fail = (message: string): never => {
  throw new Error(message);
};
const repositoryRoot = resolve(import.meta.dir, "..");
const configBytes = await readFile(
  resolve(repositoryRoot, "infra/docker/verifier/checks.json")
);
if (createHash("sha256").update(configBytes).digest("hex") !== CONFIG_DIGEST) {
  fail("Verifier config digest changed");
}
if (
  createHash("sha256")
    .update(JSON.stringify(VERIFIER_ARGUMENTS))
    .digest("hex") !== ARGV_DIGEST
) {
  fail("Verifier argv digest changed");
}

const docker = Bun.which("docker") ?? fail("Docker is unavailable");
const dockerEnvironment: Record<string, string> = {
  HOME: process.env["HOME"] ?? "/tmp",
  PATH: process.env["PATH"] ?? "/usr/local/bin:/usr/bin:/bin",
};
for (const name of [
  "DOCKER_CONFIG",
  "DOCKER_CONTEXT",
  "DOCKER_HOST",
  "TMPDIR",
  "XDG_RUNTIME_DIR",
]) {
  const value = process.env[name];
  if (value !== undefined) dockerEnvironment[name] = value;
}

const run = async (
  arguments_: readonly string[],
  output: "inherit" | "capture" = "inherit"
): Promise<string> => {
  const child = Bun.spawn([docker, ...arguments_], {
    cwd: repositoryRoot,
    env: dockerEnvironment,
    stdin: "ignore",
    stdout: output === "inherit" ? "inherit" : "pipe",
    stderr: output === "inherit" ? "inherit" : "pipe",
  });
  const stdout =
    output === "capture" ? await new Response(child.stdout).text() : "";
  const stderr =
    output === "capture" ? await new Response(child.stderr).text() : "";
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    fail(
      output === "capture"
        ? stderr.trim() || "Docker command failed"
        : "Docker command failed"
    );
  }
  return stdout.trim();
};

const inspect = async (digest: string): Promise<void> => {
  if (!DIGEST_PATTERN.test(digest)) fail("Verifier image digest is invalid");
  const output = await run(
    [
      "image",
      "inspect",
      `--format={{.Id}}|{{index .Config.Labels "org.darkfactory.verifier.config-digest"}}|{{index .Config.Labels "org.darkfactory.verifier.argv-digest"}}`,
      digest,
    ],
    "capture"
  );
  if (output !== `${digest}|${CONFIG_DIGEST}|${ARGV_DIGEST}`) {
    fail("Verifier image identity does not match immutable config");
  }
};

const command = process.argv[2];
if (command === "setup") {
  const baseImage =
    process.env["DARKFACTORY_VERIFIER_BASE_IMAGE"]?.trim() ?? "";
  if (!PINNED_IMAGE_PATTERN.test(baseImage)) {
    fail("DARKFACTORY_VERIFIER_BASE_IMAGE must be pinned by sha256 digest");
  }
  const imageName =
    process.env["DARKFACTORY_VERIFIER_IMAGE_NAME"]?.trim() ??
    "darkfactory-verifier";
  if (!IMAGE_NAME_PATTERN.test(imageName)) {
    fail("DARKFACTORY_VERIFIER_IMAGE_NAME is invalid");
  }
  await run([
    "build",
    "--pull",
    "--file",
    "infra/docker/verifier/Dockerfile",
    "--tag",
    imageName,
    "--build-arg",
    `BUN_BASE_IMAGE=${baseImage}`,
    "--build-arg",
    `VERIFIER_CONFIG_DIGEST=${CONFIG_DIGEST}`,
    "--build-arg",
    `VERIFIER_ARGV_DIGEST=${ARGV_DIGEST}`,
    ".",
  ]);
  const digest = await run(
    ["image", "inspect", "--format={{.Id}}", imageName],
    "capture"
  );
  await inspect(digest);
  process.stdout.write(`WORKFLOW_VERIFIER_IMAGE_DIGEST=${digest}\n`);
} else if (command === "check") {
  const digest = process.env["WORKFLOW_VERIFIER_IMAGE_DIGEST"]?.trim() ?? "";
  await inspect(digest);
  process.stdout.write(`verified ${digest}\n`);
} else {
  fail("Usage: verifier-image.ts setup|check");
}
