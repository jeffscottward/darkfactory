import {
  type CapabilityManifest,
  loadCapabilityManifest,
} from "@darkfactory/config/server/capabilities";
import { type ParseError, parse as parseJsonc } from "jsonc-parser";
import { inspectBunRuntime } from "../ci/bun-runtime.ts";
import { DEVELOPMENT_TARGETS, isCanonicalRouteOutput } from "../dev/targets.ts";

const { routeName: ROUTE_NAME, canonicalUrl: CANONICAL_URL } =
  DEVELOPMENT_TARGETS.web;

const MAX_OUTPUT_BYTES = 1_048_576;
const COMMAND_OPTIONS = Object.freeze({
  timeoutMs: 10_000,
  maxOutputBytes: MAX_OUTPUT_BYTES,
});

export type DoctorCommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type DoctorCommandOptions = Readonly<{
  timeoutMs?: number;
  maxOutputBytes?: number;
  environment?: Readonly<Record<string, string>>;
}>;

export type DoctorProcess = Readonly<{
  run: (
    command: string,
    arguments_: readonly string[],
    options?: DoctorCommandOptions
  ) => Promise<DoctorCommandResult>;
}>;

export type DoctorFileSystem = Readonly<{
  exists: (path: string) => Promise<boolean>;
  readText: (path: string, maximumBytes?: number) => Promise<string>;
}>;

export type HttpsProbeResult = Readonly<{
  ok: boolean;
  status?: number;
  error?: string;
}>;

export type DoctorDependencies = Readonly<{
  bunVersion: string;
  workingDirectory: string;
  environmentHas: (name: string) => boolean;
  process: DoctorProcess;
  files: DoctorFileSystem;
  probeHttps: (url: string) => Promise<HttpsProbeResult>;
}>;

export type DoctorCheckStatus = "pass" | "fail" | "optional" | "disabled";

export type DoctorCheck = Readonly<{
  name: string;
  status: DoctorCheckStatus;
  detail: string;
}>;

export type DoctorReport = Readonly<{
  ok: boolean;
  checks: readonly DoctorCheck[];
  capabilities: Readonly<{
    required: readonly string[];
    optional: readonly string[];
    disabled: readonly string[];
  }>;
}>;

export type DoctorOptions = Readonly<{
  certificateFallback?: boolean;
}>;

export type DoctorProbe =
  | "bun"
  | "docker"
  | "postgres"
  | "portless"
  | "graphify";

type ManifestProbes<Choice extends string> = Readonly<
  Record<Choice, readonly DoctorProbe[]>
>;

// Each manifest choice maps to the local prerequisites it needs. The Record
// types make a new enum value in packages/config/src/capabilities.ts fail
// typecheck here until the doctor knows how to probe it.
const SCRIPT_RUNTIME_PROBES: ManifestProbes<
  CapabilityManifest["workspace"]["script_runtime"]
> = { bun: ["bun"] };
const DATABASE_ENGINE_PROBES: ManifestProbes<
  CapabilityManifest["database"]["engine"]
> = { postgres: ["docker", "postgres"] };
const HTTPS_PROBES: ManifestProbes<
  CapabilityManifest["development"]["https"]["provider"]
> = { portless: ["portless"] };

export const probesFor = (
  manifest: CapabilityManifest
): ReadonlySet<DoctorProbe> => {
  const { code_graph: codeGraph } = manifest.developer_context;
  const { https } = manifest.development;
  return new Set<DoctorProbe>([
    ...SCRIPT_RUNTIME_PROBES[manifest.workspace.script_runtime],
    ...DATABASE_ENGINE_PROBES[manifest.database.engine],
    ...(https.enabled ? HTTPS_PROBES[https.provider] : []),
    ...(codeGraph.enabled ? (["graphify"] as const) : []),
  ]);
};

type CapabilityClassification = DoctorReport["capabilities"];

const disabledCapabilities = (node: unknown, path: string): string[] => {
  if (typeof node !== "object" || node === null) return [];
  const entries = Object.entries(node);
  if (entries.some(([key, value]) => key === "enabled" && value === false)) {
    return [path];
  }
  return entries.flatMap(([key, value]) =>
    disabledCapabilities(value, path ? `${path}.${key}` : key)
  );
};

const classifyCapabilities = (
  manifest: CapabilityManifest
): CapabilityClassification => {
  const { code_graph: codeGraph } = manifest.developer_context;
  const { https } = manifest.development;
  return Object.freeze({
    required: Object.freeze([
      manifest.database.engine,
      manifest.deployment.web.provider,
      ...(codeGraph.enabled ? [codeGraph.provider] : []),
      ...(https.enabled ? [https.provider] : []),
    ]),
    optional: Object.freeze(
      Object.entries(manifest.developer_tools)
        .filter(([, tool]) => tool.enabled === "development")
        .map(([name]) => name)
        .sort()
    ),
    disabled: Object.freeze(
      disabledCapabilities(manifest.capabilities, "").sort()
    ),
  });
};

const check = (
  name: string,
  status: DoctorCheckStatus,
  detail: string
): DoctorCheck => {
  return Object.freeze({ name, status, detail });
};

const safeRun = async (
  dependencies: DoctorDependencies,
  command: string,
  arguments_: readonly string[]
): Promise<DoctorCommandResult> => {
  try {
    const result = await dependencies.process.run(
      command,
      arguments_,
      COMMAND_OPTIONS
    );
    if (
      Buffer.byteLength(result.stdout, "utf8") > MAX_OUTPUT_BYTES ||
      Buffer.byteLength(result.stderr, "utf8") > MAX_OUTPUT_BYTES
    )
      return Object.freeze({ exitCode: 1, stdout: "", stderr: "" });
    return result;
  } catch {
    return Object.freeze({ exitCode: 1, stdout: "", stderr: "" });
  }
};

const toolCheck = async (
  dependencies: DoctorDependencies,
  name: string,
  command: string,
  arguments_: readonly string[],
  expected?: (stdout: string) => boolean
): Promise<DoctorCheck> => {
  const result = await safeRun(dependencies, command, arguments_);
  const valid =
    result.exitCode === 0 &&
    (expected?.(result.stdout.trim()) ?? result.stdout.trim().length > 0);
  return check(
    name,
    valid ? "pass" : "fail",
    valid ? `${name} is available` : `${name} is unavailable or incompatible`
  );
};

const supportedNode = (version: string): boolean => {
  const components = version.split(".");
  const major = Number(components[0]);
  const minor = Number(components[1]);
  return major > 24 || (major === 24 && minor >= 21);
};

const parsedVersion = (value: string): string | undefined => {
  return value.match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:[-+]\S*)?(?:\s|$)/u)?.[1];
};

const exactVersion =
  (expected: string) =>
  (value: string): boolean => {
    return parsedVersion(value) === expected;
  };

const inspectBun = async (
  dependencies: DoctorDependencies
): Promise<DoctorCheck> => {
  try {
    const pinSource = await dependencies.files.readText(".bun-version", 64);
    const pathResolved = await safeRun(dependencies, "bun", ["--version"]);
    const inspection = inspectBunRuntime(
      pinSource,
      dependencies.bunVersion,
      pathResolved
    );
    return check("Bun", inspection.ok ? "pass" : "fail", inspection.detail);
  } catch {
    return check("Bun", "fail", ".bun-version is missing or malformed");
  }
};

const inspectManifest = async (
  dependencies: DoctorDependencies
): Promise<
  Readonly<{ manifest?: CapabilityManifest; result: DoctorCheck }>
> => {
  try {
    const source = await dependencies.files.readText("capabilities.yaml");
    const manifest = loadCapabilityManifest(source);
    return Object.freeze({
      manifest,
      result: check(
        "Capabilities manifest",
        "pass",
        "Required, optional, and disabled capabilities are classified"
      ),
    });
  } catch {
    return Object.freeze({
      result: check(
        "Capabilities manifest",
        "fail",
        "capabilities.yaml is missing or malformed"
      ),
    });
  }
};

const inspectDocker = async (
  dependencies: DoctorDependencies
): Promise<DoctorCheck> => {
  const version = await safeRun(dependencies, "docker", ["--version"]);
  const daemon =
    version.exitCode === 0
      ? await safeRun(dependencies, "docker", [
          "info",
          "--format",
          "{{.ServerVersion}}",
        ])
      : { exitCode: 1, stdout: "", stderr: "" };
  const healthy =
    version.exitCode === 0 &&
    daemon.exitCode === 0 &&
    daemon.stdout.trim().length > 0;
  return check(
    "Docker",
    healthy ? "pass" : "fail",
    healthy
      ? "Docker CLI and daemon are available"
      : "Docker CLI or daemon is unavailable"
  );
};

const parseComposeProcesses = (
  source: string
): readonly Record<string, unknown>[] => {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed))
    return parsed.filter(
      (value) => typeof value === "object" && value !== null
    ) as Record<string, unknown>[];
  if (typeof parsed === "object" && parsed !== null)
    return [parsed as Record<string, unknown>];
  throw new Error("invalid compose output");
};

const inspectPostgres = async (
  dependencies: DoctorDependencies
): Promise<DoctorCheck> => {
  const baseArguments = ["compose", "-f", "infra/docker/postgres.compose.yml"];
  const config = await safeRun(dependencies, "docker", [
    ...baseArguments,
    "config",
    "--quiet",
  ]);
  if (config.exitCode !== 0)
    return check(
      "Postgres",
      "fail",
      "Postgres Compose configuration is invalid or unavailable"
    );
  const processes = await safeRun(dependencies, "docker", [
    ...baseArguments,
    "ps",
    "--format",
    "json",
  ]);
  if (processes.exitCode !== 0)
    return check("Postgres", "fail", "Postgres status inspection failed");
  try {
    const postgres = parseComposeProcesses(processes.stdout).find((entry) => {
      return entry["Service"] === "postgres" || entry["Name"] === "postgres";
    });
    const state = String(postgres?.["State"] ?? "").toLowerCase();
    const healthy = state === "running" || state === "healthy";
    return check(
      "Postgres",
      healthy ? "pass" : "fail",
      healthy
        ? "Postgres service is running"
        : "Postgres service is not running"
    );
  } catch {
    return check("Postgres", "fail", "Postgres status output is malformed");
  }
};

const inspectCloudflareConfig = async (
  dependencies: DoctorDependencies
): Promise<DoctorCheck> => {
  try {
    if (!(await dependencies.files.exists("apps/web/wrangler.jsonc")))
      throw new Error("missing");
    const source = await dependencies.files.readText("apps/web/wrangler.jsonc");
    if (Buffer.byteLength(source, "utf8") > 262_144) throw new Error("large");
    // wrangler.jsonc may carry comments, so parse it as JSONC, not JSON;
    // jsonc-parser keeps this runtime script off the TypeScript compiler API.
    const errors: ParseError[] = [];
    const config: unknown = parseJsonc(source, errors, {
      allowTrailingComma: true,
    });
    if (errors.length > 0) throw new Error("malformed");
    const parsed = config as Record<string, unknown>;
    const valid =
      parsed["name"] === "darkfactory-web" &&
      parsed["main"] === "vinext/server/fetch-handler";
    return check(
      "Cloudflare config",
      valid ? "pass" : "fail",
      valid
        ? "Cloudflare web configuration is valid"
        : "Cloudflare web configuration is malformed"
    );
  } catch {
    return check(
      "Cloudflare config",
      "fail",
      "Cloudflare web configuration is missing or malformed"
    );
  }
};

const inspectPortlessRoute = async (
  dependencies: DoctorDependencies
): Promise<DoctorCheck> => {
  const routes = await safeRun(dependencies, "portless", ["list"]);
  const route = await safeRun(dependencies, "portless", ["get", ROUTE_NAME]);
  const healthy =
    isCanonicalRouteOutput(routes) && isCanonicalRouteOutput(route);
  return check(
    "portless route",
    healthy ? "pass" : "fail",
    healthy
      ? `${ROUTE_NAME} route is registered at the canonical URL`
      : `${ROUTE_NAME} canonical route is missing or unhealthy`
  );
};

const inspectTrust = async (
  dependencies: DoctorDependencies
): Promise<DoctorCheck> => {
  try {
    const probe = await dependencies.probeHttps(CANONICAL_URL);
    return check(
      "portless trust",
      probe.ok ? "pass" : "fail",
      probe.ok
        ? "Canonical HTTPS route is trusted"
        : "Canonical HTTPS route is unavailable or untrusted"
    );
  } catch {
    return check(
      "portless trust",
      "fail",
      "Canonical HTTPS route is unavailable or untrusted"
    );
  }
};

// Checks run for each probe that probesFor(manifest) selects.
const PROBE_CHECKS: Readonly<
  Record<
    DoctorProbe,
    (dependencies: DoctorDependencies) => Promise<readonly DoctorCheck[]>
  >
> = {
  bun: async (dependencies) => [await inspectBun(dependencies)],
  docker: async (dependencies) => [await inspectDocker(dependencies)],
  postgres: async (dependencies) => [await inspectPostgres(dependencies)],
  portless: async (dependencies) => [
    await toolCheck(
      dependencies,
      "portless",
      "bunx",
      ["--bun", "--no-install", "portless", "--version"],
      exactVersion("0.15.6")
    ),
    await inspectPortlessRoute(dependencies),
    // Route and trust pass only while `bun run dev` is serving; see
    // scripts/dev/serve.ts#runDevServer.
    await inspectTrust(dependencies),
  ],
  graphify: async (dependencies) => [
    await toolCheck(
      dependencies,
      "Graphify",
      "graphify",
      ["--version"],
      exactVersion("0.9.2")
    ),
  ],
};

// An unreadable manifest probes everything so the report stays complete.
const ALL_PROBES: ReadonlySet<DoctorProbe> = new Set(
  Object.keys(PROBE_CHECKS) as DoctorProbe[]
);

const environmentChecks = (
  dependencies: DoctorDependencies
): readonly DoctorCheck[] => {
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET"];
  const checks = required.map((name) =>
    check(
      name,
      dependencies.environmentHas(name) ? "pass" : "fail",
      dependencies.environmentHas(name)
        ? `${name} is configured`
        : `${name} is missing`
    )
  );

  const providerGroups: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["AI provider", ["GROQ_API_KEY", "GROQ_MODEL"]],
    ["Email provider", ["RESEND_API_KEY"]],
    ["Analytics provider", ["POSTHOG_KEY", "POSTHOG_HOST"]],
    ["Telemetry exporter", ["OTEL_EXPORTER_OTLP_ENDPOINT"]],
  ];
  for (const [name, variables] of providerGroups) {
    const configured = variables.every((variable) =>
      dependencies.environmentHas(variable)
    );
    checks.push(
      check(
        name,
        configured ? "pass" : "optional",
        configured
          ? `${variables.join(", ")} configured`
          : `${variables.join(", ")} not fully configured`
      )
    );
  }
  return Object.freeze(checks);
};

const PINNED_TOOL_MANIFESTS: ReadonlyArray<readonly [string, string]> = [
  ["node_modules/typescript/package.json", "6.0.2"],
  ["node_modules/turbo/package.json", "2.11.5"],
  ["node_modules/vitest/package.json", "5.0.2"],
  ["node_modules/@playwright/test/package.json", "1.63.0"],
  ["apps/web/node_modules/vinext/package.json", "1.0.0-beta.3"],
  ["apps/web/node_modules/@vinext/cloudflare/package.json", "1.0.0-beta.3"],
  ["apps/web/node_modules/vite/package.json", "8.3.1"],
];

const inspectPinnedToolchain = async (
  dependencies: DoctorDependencies
): Promise<DoctorCheck> => {
  try {
    for (const [path, expected] of PINNED_TOOL_MANIFESTS) {
      const source = await dependencies.files.readText(path);
      if (Buffer.byteLength(source, "utf8") > 262_144) throw new Error("large");
      const actual = (JSON.parse(source) as Record<string, unknown>)["version"];
      if (actual !== expected) throw new Error("drift");
    }
    return check(
      "Pinned toolchain",
      "pass",
      "Reviewed TypeScript, Turbo, Vitest, Playwright, Vinext, Cloudflare, and Vite versions match"
    );
  } catch {
    return check(
      "Pinned toolchain",
      "fail",
      "Reviewed toolchain versions are missing or incompatible"
    );
  }
};

export const runDoctor = async (
  dependencies: DoctorDependencies,
  options: DoctorOptions = {}
): Promise<DoctorReport> => {
  const checks: DoctorCheck[] = [];
  const manifest = await inspectManifest(dependencies);
  checks.push(manifest.result);
  const probes = manifest.manifest ? probesFor(manifest.manifest) : ALL_PROBES;
  checks.push(
    await toolCheck(dependencies, "Node", "node", ["--version"], (value) => {
      const version = parsedVersion(value);
      return version !== undefined && supportedNode(version);
    })
  );
  checks.push(
    await toolCheck(
      dependencies,
      "pnpm",
      "pnpm",
      ["--version"],
      exactVersion("11.16.0")
    )
  );
  checks.push(await inspectPinnedToolchain(dependencies));
  checks.push(
    await toolCheck(
      dependencies,
      "Vinext configuration",
      "pnpm",
      [
        "--filter",
        "@darkfactory/web",
        "exec",
        "bunx",
        "--bun",
        "--no-install",
        "vinext",
        "check",
      ],
      () => true
    )
  );
  checks.push(
    await toolCheck(dependencies, "Cloudflare tooling", "pnpm", [
      "--filter",
      "@darkfactory/web",
      "exec",
      "bunx",
      "--bun",
      "--no-install",
      "wrangler",
      "--version",
    ])
  );
  checks.push(await inspectCloudflareConfig(dependencies));
  checks.push(...environmentChecks(dependencies));
  for (const probe of probes) {
    checks.push(...(await PROBE_CHECKS[probe](dependencies)));
  }
  checks.push(
    await toolCheck(
      dependencies,
      "uv",
      "uv",
      ["--version"],
      exactVersion("0.11.32")
    )
  );

  const enabledTools: ReadonlyArray<readonly [string, string]> = [
    ["TypeScript", "tsc"],
    ["Turbo", "turbo"],
    ["Vitest", "vitest"],
    ["Playwright", "playwright"],
  ];
  for (const [name, executable] of enabledTools) {
    checks.push(
      await toolCheck(dependencies, name, "bunx", [
        "--bun",
        "--no-install",
        executable,
        "--version",
      ])
    );
  }

  if (options.certificateFallback) {
    checks.push(
      await toolCheck(dependencies, "mkcert fallback", "mkcert", ["-version"])
    );
  } else {
    checks.push(
      check(
        "mkcert fallback",
        "optional",
        "Not selected; portless trust is primary"
      )
    );
  }

  const classification = manifest.manifest
    ? classifyCapabilities(manifest.manifest)
    : { required: [], optional: [], disabled: [] };
  for (const capability of classification.optional) {
    checks.push(
      check(
        `Capability ${capability}`,
        "optional",
        `${capability} is development-scoped`
      )
    );
  }
  for (const capability of classification.disabled) {
    checks.push(
      check(`Capability ${capability}`, "disabled", `${capability} is disabled`)
    );
  }

  return Object.freeze({
    ok: checks.every(({ status }) => status !== "fail"),
    checks: Object.freeze(checks),
    capabilities: Object.freeze({
      required: classification.required,
      optional: classification.optional,
      disabled: classification.disabled,
    }),
  });
};
