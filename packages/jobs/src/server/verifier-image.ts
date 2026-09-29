import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Bun runtime globals used by this script. bun-types is not installed, so declare
// only the minimal surface this Bun-executed script relies on.
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
  "d2799b335dd76e228f22ef6fd168364ad9c1c37f26ed8b07ce1eb4d06b2a5c8e";
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
// Docker builds from the repository root because the image installs the whole
// workspace; the verifier assets live beside the jobs package that runs them.
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const configBytes = await readFile(
  new URL("../../verifier/checks.json", import.meta.url)
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
  // Optional override; the Dockerfile's default base is already digest-pinned.
  const baseImage =
    process.env["DARKFACTORY_VERIFIER_BASE_IMAGE"]?.trim() ?? "";
  if (baseImage !== "" && !PINNED_IMAGE_PATTERN.test(baseImage)) {
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
    "packages/jobs/verifier/Dockerfile",
    "--tag",
    imageName,
    ...(baseImage === "" ? [] : ["--build-arg", `BUN_BASE_IMAGE=${baseImage}`]),
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
