import { describe, expect, it } from "vitest";

import {
  GIT_REPOSITORY_ENVIRONMENT_KEYS,
  withoutGitRepositoryEnvironment,
} from "./git-env.ts";

const REPOSITORY_KEYS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_NAMESPACE",
  "GIT_QUARANTINE_PATH",
];

describe("withoutGitRepositoryEnvironment", () => {
  it("lists exactly Git's repository-locating hook variables", () => {
    expect([...GIT_REPOSITORY_ENVIRONMENT_KEYS].sort()).toEqual(
      [...REPOSITORY_KEYS].sort()
    );
    expect(Object.isFrozen(GIT_REPOSITORY_ENVIRONMENT_KEYS)).toBe(true);
  });

  it("strips those keys, keeps every other variable and leaves the input intact", () => {
    const kept = {
      GIT_ASKPASS: "/bin/askpass",
      GIT_CONFIG_PARAMETERS: "'core.pager'='cat'",
      GIT_SSH_COMMAND: "ssh -i key",
      git_dir: "lowercase is not Git's variable",
      HOME: "/home/user",
      PATH: "/usr/bin",
    };
    const input: NodeJS.ProcessEnv = {
      ...Object.fromEntries(REPOSITORY_KEYS.map((key) => [key, `/${key}`])),
      ...kept,
    };
    const snapshot = { ...input };

    const sanitized = withoutGitRepositoryEnvironment(input);

    expect(sanitized).toEqual(kept);
    expect(sanitized).not.toBe(input);
    expect(input).toEqual(snapshot);
  });

  it("defaults to the current process environment", () => {
    const previous = process.env["GIT_INDEX_FILE"];
    process.env["GIT_INDEX_FILE"] = "/outer/.git/index";
    try {
      const sanitized = withoutGitRepositoryEnvironment();
      expect(sanitized).not.toHaveProperty("GIT_INDEX_FILE");
      expect(sanitized["PATH"]).toBe(process.env["PATH"]);
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(process.env, "GIT_INDEX_FILE");
      } else {
        process.env["GIT_INDEX_FILE"] = previous;
      }
    }
  });
});
