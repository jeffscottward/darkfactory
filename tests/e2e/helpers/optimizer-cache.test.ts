import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { removeE2EOptimizerCache } from "./optimizer-cache";

const temporaryRoots: string[] = [];

const createRepository = async (): Promise<{
  cache: string;
  nodeModules: string;
  root: string;
}> => {
  const createdRoot = await mkdtemp(
    join(tmpdir(), "darkfactory-optimizer-cache-")
  );
  const root = await realpath(createdRoot);
  temporaryRoots.push(root);
  const nodeModules = join(root, "apps", "web", "node_modules");
  await mkdir(nodeModules, { recursive: true });
  return { cache: join(nodeModules, ".vite"), nodeModules, root };
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("canonical E2E optimizer cache cleanup", () => {
  it("treats an absent exact cache as safe and preserves node_modules sentinels", async () => {
    const fixture = await createRepository();
    const sentinel = join(fixture.nodeModules, "keep.txt");
    await writeFile(sentinel, "keep");

    await expect(
      removeE2EOptimizerCache({ repositoryRoot: fixture.root })
    ).resolves.toBe(false);
    await expect(readFile(sentinel, "utf8")).resolves.toBe("keep");
  });

  it("removes a stale missing-runtime cache so a cold start can recreate it", async () => {
    const fixture = await createRepository();
    const depsRsc = join(fixture.cache, "deps_rsc");
    const sentinel = join(fixture.nodeModules, "keep.txt");
    await mkdir(depsRsc, { recursive: true });
    await writeFile(
      join(depsRsc, "_metadata.json"),
      JSON.stringify({ runtime: "rolldown-runtime-missing.js" })
    );
    await writeFile(sentinel, "keep");

    await expect(
      removeE2EOptimizerCache({ repositoryRoot: fixture.root })
    ).resolves.toBe(true);
    await expect(readFile(sentinel, "utf8")).resolves.toBe("keep");

    await mkdir(depsRsc, { recursive: true });
    await writeFile(join(depsRsc, "rolldown-runtime-fresh.js"), "export {};");
    await expect(
      readFile(join(depsRsc, "rolldown-runtime-fresh.js"), "utf8")
    ).resolves.toBe("export {};");
  });

  it("fails closed when deletion fails and leaves the cache intact", async () => {
    const fixture = await createRepository();
    const cacheSentinel = join(fixture.cache, "deps_rsc", "keep.js");
    await mkdir(join(fixture.cache, "deps_rsc"), { recursive: true });
    await writeFile(cacheSentinel, "keep");
    const remove = vi.fn<typeof rm>().mockRejectedValue(new Error("blocked"));

    await expect(
      removeE2EOptimizerCache({
        quarantineId: "remove-failure",
        remove,
        repositoryRoot: fixture.root,
      })
    ).rejects.toThrow("original cache restored");
    expect(remove).toHaveBeenCalledWith(
      join(fixture.nodeModules, ".vite.e2e-quarantine-remove-failure"),
      {
        force: true,
        recursive: true,
      }
    );
    await expect(readFile(cacheSentinel, "utf8")).resolves.toBe("keep");
  });

  it("rejects a colliding quarantine without moving or removing the cache", async () => {
    const fixture = await createRepository();
    const cacheSentinel = join(fixture.cache, "keep.txt");
    const quarantine = join(
      fixture.nodeModules,
      ".vite.e2e-quarantine-collision"
    );
    await mkdir(fixture.cache);
    await writeFile(cacheSentinel, "cache");
    await mkdir(quarantine);
    await writeFile(join(quarantine, "keep.txt"), "quarantine");
    const remove = vi.fn<typeof rm>();

    await expect(
      removeE2EOptimizerCache({
        quarantineId: "collision",
        remove,
        repositoryRoot: fixture.root,
      })
    ).rejects.toThrow("quarantine path already exists");
    expect(remove).not.toHaveBeenCalled();
    await expect(readFile(cacheSentinel, "utf8")).resolves.toBe("cache");
    await expect(readFile(join(quarantine, "keep.txt"), "utf8")).resolves.toBe(
      "quarantine"
    );
  });

  it("fails closed when the cache entry is swapped before quarantine", async () => {
    const fixture = await createRepository();
    const outside = await mkdtemp(join(tmpdir(), "darkfactory-cache-race-"));
    temporaryRoots.push(outside);
    const stolen = join(fixture.nodeModules, ".vite-original");
    await mkdir(fixture.cache);
    await writeFile(join(fixture.cache, "original.txt"), "original");
    await writeFile(join(outside, "external.txt"), "external");
    const remove = vi.fn<typeof rm>();

    await expect(
      removeE2EOptimizerCache({
        beforeQuarantine: async () => {
          await rename(fixture.cache, stolen);
          await rename(outside, fixture.cache);
        },
        quarantineId: "pre-cache-race",
        remove,
        repositoryRoot: fixture.root,
      })
    ).rejects.toThrow("manual quarantine inspection");
    expect(remove).not.toHaveBeenCalled();
    await expect(readFile(join(stolen, "original.txt"), "utf8")).resolves.toBe(
      "original"
    );
    await expect(
      readFile(
        join(
          fixture.nodeModules,
          ".vite.e2e-quarantine-pre-cache-race",
          "external.txt"
        ),
        "utf8"
      )
    ).resolves.toBe("external");
  });

  it("fails closed when an ancestor is swapped before quarantine", async () => {
    const fixture = await createRepository();
    const movedNodeModules = join(
      dirname(fixture.nodeModules),
      "node_modules-moved"
    );
    await mkdir(fixture.cache);
    await writeFile(join(fixture.cache, "keep.txt"), "keep");
    const remove = vi.fn<typeof rm>();

    await expect(
      removeE2EOptimizerCache({
        beforeQuarantine: async () => {
          await rename(fixture.nodeModules, movedNodeModules);
          await mkdir(fixture.nodeModules);
        },
        quarantineId: "pre-ancestor-race",
        remove,
        repositoryRoot: fixture.root,
      })
    ).rejects.toThrow("manual quarantine inspection");
    expect(remove).not.toHaveBeenCalled();
    await expect(
      readFile(join(movedNodeModules, ".vite", "keep.txt"), "utf8")
    ).resolves.toBe("keep");
  });

  it("fails closed when the quarantined entry is swapped before removal", async () => {
    const fixture = await createRepository();
    const stolen = join(fixture.nodeModules, ".vite-stolen-after-rename");
    const quarantine = join(
      fixture.nodeModules,
      ".vite.e2e-quarantine-post-race"
    );
    await mkdir(fixture.cache);
    await writeFile(join(fixture.cache, "original.txt"), "original");
    const remove = vi.fn<typeof rm>();

    await expect(
      removeE2EOptimizerCache({
        afterQuarantine: async () => {
          await rename(quarantine, stolen);
          await mkdir(quarantine);
          await writeFile(join(quarantine, "external.txt"), "external");
        },
        quarantineId: "post-race",
        remove,
        repositoryRoot: fixture.root,
      })
    ).rejects.toThrow("manual quarantine inspection");
    expect(remove).not.toHaveBeenCalled();
    await expect(readFile(join(stolen, "original.txt"), "utf8")).resolves.toBe(
      "original"
    );
    await expect(
      readFile(join(quarantine, "external.txt"), "utf8")
    ).resolves.toBe("external");
  });

  it("rejects a symlinked optimizer cache without touching its target", async () => {
    const fixture = await createRepository();
    const outside = await mkdtemp(join(tmpdir(), "darkfactory-cache-target-"));
    temporaryRoots.push(outside);
    const sentinel = join(outside, "keep.txt");
    await writeFile(sentinel, "keep");
    await symlink(outside, fixture.cache, "dir");

    await expect(
      removeE2EOptimizerCache({ repositoryRoot: fixture.root })
    ).rejects.toThrow("cache must be a real directory");
    await expect(readFile(sentinel, "utf8")).resolves.toBe("keep");
  });

  it("rejects a symlinked ancestor without traversing outside the repository", async () => {
    const createdRoot = await mkdtemp(
      join(tmpdir(), "darkfactory-optimizer-ancestor-")
    );
    const root = await realpath(createdRoot);
    const outside = await mkdtemp(join(tmpdir(), "darkfactory-web-target-"));
    temporaryRoots.push(root, outside);
    await mkdir(join(root, "apps"), { recursive: true });
    await mkdir(join(outside, "node_modules", ".vite"), { recursive: true });
    const sentinel = join(outside, "node_modules", ".vite", "keep.txt");
    await writeFile(sentinel, "keep");
    await symlink(outside, join(root, "apps", "web"), "dir");

    await expect(
      removeE2EOptimizerCache({ repositoryRoot: root })
    ).rejects.toThrow("ancestor must be a real directory");
    await expect(readFile(sentinel, "utf8")).resolves.toBe("keep");
  });
});
