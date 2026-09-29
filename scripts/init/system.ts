import { execFile, spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { withoutGitRepositoryEnvironment } from "../lib/git-env.ts";
import type { CommandResult, InitDependencies } from "./apply.ts";

// Removes directories left empty by a move or delete, stopping at the root
// or at the first non-empty directory.
const pruneEmptyParents = async (root: string, path: string): Promise<void> => {
  for (
    let directory = dirname(path);
    directory !== ".";
    directory = dirname(directory)
  ) {
    try {
      await rmdir(join(root, directory));
    } catch {
      return;
    }
  }
};

// Every command (git add/commit/ls-files, installs) targets `root`, so Git must
// locate the repository from that cwd rather than from GIT_DIR/GIT_INDEX_FILE
// inherited from an enclosing Git hook.
export const nodeInitDependencies = (root: string): InitDependencies =>
  Object.freeze({
    capture: (command, arguments_) => {
      const { promise, resolve } = Promise.withResolvers<CommandResult>();
      execFile(
        command,
        [...arguments_],
        {
          cwd: root,
          encoding: "utf8",
          env: withoutGitRepositoryEnvironment(process.env),
          maxBuffer: 256 * 1024 * 1024,
          windowsHide: true,
        },
        (error, stdout, stderr) =>
          resolve({
            exitCode: error === null ? 0 : 1,
            stdout: String(stdout),
            stderr: String(stderr),
          })
      );
      return promise;
    },
    run: (command, arguments_) => {
      const { promise, resolve } = Promise.withResolvers<number>();
      const child = spawn(command, [...arguments_], {
        cwd: root,
        env: withoutGitRepositoryEnvironment(process.env),
        stdio: "inherit",
      });
      child.once("error", () => resolve(127));
      child.once("exit", (code) => resolve(code ?? 1));
      return promise;
    },
    files: {
      read: async (path) => new Uint8Array(await readFile(join(root, path))),
      write: (path, content) => writeFile(join(root, path), content, "utf8"),
      move: async (from, to) => {
        await mkdir(dirname(join(root, to)), { recursive: true });
        await rename(join(root, from), join(root, to));
        await pruneEmptyParents(root, from);
      },
      remove: async (path) => {
        await rm(join(root, path), { force: true });
        await pruneEmptyParents(root, path);
      },
    },
    year: new Date().getFullYear(),
    log: (line) => process.stdout.write(`${line}\n`),
    error: (line) => process.stderr.write(`${line}\n`),
  });
