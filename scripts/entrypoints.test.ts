import { afterEach, describe, expect, it, vi } from "vitest";

const originalArguments = [...process.argv];
const originalExitCode = process.exitCode;

type CliStreams = Readonly<{
  writeOutput: (value: string) => void;
  writeError: (value: string) => void;
}>;

afterEach(() => {
  process.argv = [...originalArguments];
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.doUnmock("../packages/config/src/server/capabilities.ts");
  vi.doUnmock("./capability/cli.ts");
  vi.doUnmock("./capability/system.ts");
  vi.doUnmock("./dev/bindings.ts");
  vi.doUnmock("./dev/cli.ts");
  vi.doUnmock("./dev/system.ts");
  vi.doUnmock("./deployment/database.ts");
  vi.doUnmock("./docs/cli.ts");
  vi.doUnmock("./docs/system.ts");
  vi.doUnmock("./doctor/cli.ts");
  vi.doUnmock("./doctor/system.ts");
  vi.doUnmock("./generate-feature/cli.ts");
  vi.doUnmock("./graph/cli.ts");
  vi.doUnmock("./graph/system.ts");
  return vi.resetModules();
});

describe("root executable wrappers", () => {
  it("forwards capability input, validation, streams, and usage exit status", async () => {
    const files = Object.freeze({ kind: "capability-files" });
    const invalidManifest = new Error("invalid capability manifest");
    const loadCapabilityManifest = vi.fn((source: string): void => {
      if (source === "{malformed") throw invalidManifest;
    });
    const runCapabilityCli = vi.fn(
      async (
        arguments_: readonly string[],
        dependencies: Readonly<{
          files: unknown;
          validateManifest: (source: string) => void;
        }>,
        streams: CliStreams
      ) => {
        expect(arguments_).toEqual(["../escape"]);
        expect(dependencies.files).toBe(files);
        expect(() => dependencies.validateManifest("{malformed")).toThrow(
          invalidManifest
        );
        dependencies.validateManifest('{"capabilities":[]}');
        streams.writeOutput("capability-output\n");
        streams.writeError("capability-error\n");
        return 64;
      }
    );
    vi.doMock("../packages/config/src/server/capabilities.ts", () => ({
      loadCapabilityManifest,
    }));
    vi.doMock("./capability/cli.ts", () => ({ runCapabilityCli }));
    vi.doMock("./capability/system.ts", () => ({
      nodeCapabilityFileSystem: files,
    }));
    process.argv = ["node", "capability.ts", "../escape"];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./capability.ts");

    expect(runCapabilityCli).toHaveBeenCalledOnce();
    expect(loadCapabilityManifest.mock.calls.map(([source]) => source)).toEqual(
      ["{malformed", '{"capabilities":[]}']
    );
    expect(stdout).toHaveBeenCalledWith("capability-output\n");
    expect(stderr).toHaveBeenCalledWith("capability-error\n");
    return expect(process.exitCode).toBe(64);
  });

  it("forwards malformed development commands and preserves the CLI exit status", async () => {
    const files = Object.freeze({ kind: "development-files" });
    const processAdapter = Object.freeze({ kind: "development-process" });
    const runDevelopmentCli = vi.fn(
      async (
        arguments_: readonly string[],
        dependencies: CliStreams &
          Readonly<{
            files: unknown;
            process: unknown;
          }>
      ) => {
        expect(arguments_).toEqual(["not-a-command"]);
        expect(dependencies.files).toBe(files);
        expect(dependencies.process).toBe(processAdapter);
        dependencies.writeOutput("development-output\n");
        dependencies.writeError("development-error\n");
        return 64;
      }
    );
    vi.doMock("./dev/cli.ts", () => ({ runDevelopmentCli }));
    vi.doMock("./dev/system.ts", () => ({
      nodeLifecycleFileSystem: files,
      nodeProcessAdapter: processAdapter,
    }));
    process.argv = ["node", "dev.ts", "not-a-command"];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./dev.ts");

    expect(runDevelopmentCli).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith("development-output\n");
    expect(stderr).toHaveBeenCalledWith("development-error\n");
    return expect(process.exitCode).toBe(64);
  });

  it("forwards documentation checks and their drift exit status", async () => {
    const files = Object.freeze({ kind: "documentation-files" });
    const runDocsCli = vi.fn(
      async (
        arguments_: readonly string[],
        dependencies: Readonly<{ files: unknown }>,
        streams: CliStreams
      ) => {
        expect(arguments_).toEqual(["check"]);
        expect(dependencies.files).toBe(files);
        streams.writeOutput("documentation-output\n");
        streams.writeError("documentation-drift\n");
        return 1;
      }
    );
    vi.doMock("./docs/cli.ts", () => ({ runDocsCli }));
    vi.doMock("./docs/system.ts", () => ({ nodeDocsFileSystem: files }));
    process.argv = ["node", "docs.ts", "check"];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./docs.ts");

    expect(runDocsCli).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith("documentation-output\n");
    expect(stderr).toHaveBeenCalledWith("documentation-drift\n");
    return expect(process.exitCode).toBe(1);
  });

  it("forwards doctor dependencies, streams, and success status", async () => {
    const doctor = Object.freeze({ kind: "doctor-dependencies" });
    const nodeDoctorDependencies = vi.fn(() => doctor);
    const runDoctorCli = vi.fn(
      async (
        arguments_: readonly string[],
        dependencies: CliStreams & Readonly<{ doctor: unknown }>
      ) => {
        expect(arguments_).toEqual(["--json"]);
        expect(dependencies.doctor).toBe(doctor);
        dependencies.writeOutput("doctor-output\n");
        dependencies.writeError("doctor-warning\n");
        return 0;
      }
    );
    vi.doMock("./doctor/cli.ts", () => ({ runDoctorCli }));
    vi.doMock("./doctor/system.ts", () => ({ nodeDoctorDependencies }));
    process.argv = ["node", "doctor.ts", "--json"];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./doctor.ts");

    expect(nodeDoctorDependencies).toHaveBeenCalledOnce();
    expect(runDoctorCli).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith("doctor-output\n");
    expect(stderr).toHaveBeenCalledWith("doctor-warning\n");
    return expect(process.exitCode).toBe(0);
  });

  it("forwards malformed feature names, cwd, streams, and usage status", async () => {
    const runFeatureGeneratorCli = vi.fn(
      async (
        arguments_: readonly string[],
        dependencies: CliStreams & Readonly<{ targetRoot: string }>
      ) => {
        expect(arguments_).toEqual(["bad/name"]);
        expect(dependencies.targetRoot).toBe("/workspace");
        dependencies.writeOutput("feature-output\n");
        dependencies.writeError("feature-error\n");
        return 64;
      }
    );
    vi.doMock("./generate-feature/cli.ts", () => ({ runFeatureGeneratorCli }));
    process.argv = ["node", "generate-feature.ts", "bad/name"];
    vi.spyOn(process, "cwd").mockReturnValue("/workspace");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./generate-feature.ts");

    expect(runFeatureGeneratorCli).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith("feature-output\n");
    expect(stderr).toHaveBeenCalledWith("feature-error\n");
    return expect(process.exitCode).toBe(64);
  });

  it("forwards graph verification adapters, streams, and nonzero status", async () => {
    const files = Object.freeze({ kind: "graph-files" });
    const processAdapter = Object.freeze({ kind: "graph-process" });
    const runGraphCli = vi.fn(
      async (
        arguments_: readonly string[],
        dependencies: CliStreams &
          Readonly<{
            graph: Readonly<{ files: unknown; process: unknown }>;
          }>
      ) => {
        expect(arguments_).toEqual(["verify"]);
        expect(dependencies.graph.files).toBe(files);
        expect(dependencies.graph.process).toBe(processAdapter);
        dependencies.writeOutput("graph-output\n");
        dependencies.writeError("graph-error\n");
        return 2;
      }
    );
    vi.doMock("./graph/cli.ts", () => ({ runGraphCli }));
    vi.doMock("./graph/system.ts", () => ({
      nodeGraphFileSystem: files,
      nodeGraphProcess: processAdapter,
    }));
    process.argv = ["node", "graph.ts", "verify"];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./graph.ts");

    expect(runGraphCli).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith("graph-output\n");
    expect(stderr).toHaveBeenCalledWith("graph-error\n");
    return expect(process.exitCode).toBe(2);
  });

  it("forwards deployment database inputs, streams, and failure status", async () => {
    const runProductionWebDatabaseCheck = vi.fn(
      (
        environment: NodeJS.ProcessEnv,
        output: NodeJS.WriteStream,
        errorOutput: NodeJS.WriteStream
      ) => {
        expect(environment).toBe(process.env);
        expect(output).toBe(process.stdout);
        expect(errorOutput).toBe(process.stderr);
        return 1;
      }
    );
    vi.doMock("./deployment/database.ts", () => ({
      runProductionWebDatabaseCheck,
    }));
    process.exitCode = undefined;

    await import("./deployment.ts");

    expect(runProductionWebDatabaseCheck).toHaveBeenCalledOnce();
    return expect(process.exitCode).toBe(1);
  });

  it("surfaces root CLI exceptions without replacing the current exit status", async () => {
    const failure = new Error("graph CLI failed");
    const runGraphCli = vi.fn(async () => {
      throw failure;
    });
    vi.doMock("./graph/cli.ts", () => ({ runGraphCli }));
    vi.doMock("./graph/system.ts", () => ({
      nodeGraphFileSystem: Object.freeze({}),
      nodeGraphProcess: Object.freeze({}),
    }));
    process.argv = ["node", "graph.ts", "build"];
    process.exitCode = 17;

    await expect(import("./graph.ts")).rejects.toBe(failure);

    expect(runGraphCli).toHaveBeenCalledOnce();
    return expect(process.exitCode).toBe(17);
  });

  it("rejects unsupported binding targets before materialization", async () => {
    const materializeWorkerBindings = vi.fn(async () => undefined);
    const workerBindingsTargetPath = vi.fn(() => "unused");
    vi.doMock("./dev/bindings.ts", () => ({
      materializeWorkerBindings,
      workerBindingsTargetPath,
    }));
    process.argv = ["node", "dev-bindings.ts", "web"];
    process.exitCode = undefined;
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./dev-bindings.ts");

    expect(materializeWorkerBindings).not.toHaveBeenCalled();
    expect(workerBindingsTargetPath).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("Usage: dev-bindings [operator]\n");
    return expect(process.exitCode).toBe(2);
  });

  it("materializes validated development bindings and reports the protected target", async () => {
    const materializeWorkerBindings = vi.fn(async () => undefined);
    vi.doMock("./dev/bindings.ts", () => ({
      materializeWorkerBindings,
      workerBindingsTargetPath: () => "apps/web/.dev.vars",
    }));
    process.argv = ["node", "dev-bindings.ts"];
    process.exitCode = undefined;
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./dev-bindings.ts");

    expect(materializeWorkerBindings).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith(
      '{"action":"dev:bindings","ok":true,"target":"apps/web/.dev.vars","mode":"0600"}\n'
    );
    expect(stderr).not.toHaveBeenCalled();
    return expect(process.exitCode).toBeUndefined();
  });

  it("materializes operator bindings through the independent protected target", async () => {
    const materializeWorkerBindings = vi.fn(async () => undefined);
    vi.doMock("./dev/bindings.ts", () => ({
      materializeWorkerBindings,
      workerBindingsTargetPath: () => "apps/operator/.dev.vars",
    }));
    process.argv = ["node", "dev-bindings.ts", "operator"];
    process.exitCode = undefined;
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./dev-bindings.ts");

    expect(materializeWorkerBindings).toHaveBeenCalledWith(
      process.cwd(),
      "operator"
    );
    expect(stdout).toHaveBeenCalledWith(
      '{"action":"operator:bindings","ok":true,"target":"apps/operator/.dev.vars","mode":"0600"}\n'
    );
    expect(stderr).not.toHaveBeenCalled();
    return expect(process.exitCode).toBeUndefined();
  });

  return it("normalizes binding materialization exceptions to a safe error and exit code", async () => {
    const materializeWorkerBindings = vi.fn(async () => {
      throw new Error("private binding payload");
    });
    vi.doMock("./dev/bindings.ts", () => ({
      materializeWorkerBindings,
      workerBindingsTargetPath: () => "apps/web/.dev.vars",
    }));
    process.argv = ["node", "dev-bindings.ts"];
    process.exitCode = undefined;
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await import("./dev-bindings.ts");

    expect(materializeWorkerBindings).toHaveBeenCalledOnce();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "Unable to materialize validated Worker bindings safely.\n"
    );
    expect(stderr).not.toHaveBeenCalledWith(
      expect.stringContaining("private binding payload")
    );
    return expect(process.exitCode).toBe(1);
  });
});
