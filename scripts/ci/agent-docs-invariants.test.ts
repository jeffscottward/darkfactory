import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// AGENTS.md is the one agent index. Claude Code reads CLAUDE.md and
// .claude/skills, so both are symlinks into the harness-agnostic sources.
const root = new URL("../../", import.meta.url);
const at = (path: string): URL => new URL(path, root);

const SKILL_ROLES = [
  "architect",
  "backend",
  "frontend",
  "pm",
  "qa",
  "release",
  "scalability",
  "security",
];

describe("agent entry points", () => {
  it("links CLAUDE.md to AGENTS.md instead of copying it", async () => {
    expect((await lstat(at("CLAUDE.md"))).isSymbolicLink()).toBe(true);
    return expect(await readlink(at("CLAUDE.md"))).toBe("AGENTS.md");
  });

  it("links .claude/skills to the shared .agents/skills directory", async () => {
    expect((await lstat(at(".claude/skills"))).isSymbolicLink()).toBe(true);
    return expect(await readlink(at(".claude/skills"))).toBe(
      "../.agents/skills"
    );
  });

  return it("gives every role skill matching name and description frontmatter", async () => {
    const roles = (await readdir(at(".agents/skills"))).sort();
    expect(roles).toEqual(SKILL_ROLES);
    for (const role of roles) {
      const skill = await readFile(
        at(`.agents/skills/${role}/SKILL.md`),
        "utf8"
      );
      const frontmatter = /^---\nname: (.+)\ndescription: (.+)\n---\n/u.exec(
        skill
      );
      expect(frontmatter?.[1], role).toBe(role);
      expect(frontmatter?.[2]?.length ?? 0, role).toBeGreaterThan(20);
    }
  });
});
