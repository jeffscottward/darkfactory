// mise.toml is the toolchain source of truth; see
// scripts/ci/toolchain-invariants.test.ts for the copies CI still reads.
export type ToolchainPins = Readonly<{
  node: string;
  bun: string;
  pnpm: string;
}>;

const TOOL_NAMES = ["node", "bun", "pnpm"] as const;
const EXACT_VERSION = /^\d+\.\d+\.\d+$/u;

// Reads the exact `name = "x.y.z"` pins from the `[tools]` table.
export const parseMiseToolchain = (source: string): ToolchainPins => {
  const pins: Partial<Record<(typeof TOOL_NAMES)[number], string | undefined>> =
    {};
  let inTools = false;
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (line.startsWith("[")) {
      inTools = line === "[tools]";
      continue;
    }
    const [, key, value] = /^([a-z]+)\s*=\s*"([^"]*)"$/u.exec(line) ?? [];
    const name = TOOL_NAMES.find((tool) => tool === key);
    if (inTools && name !== undefined) pins[name] = value;
  }
  const { node, bun, pnpm } = pins;
  if (
    node === undefined ||
    bun === undefined ||
    pnpm === undefined ||
    ![node, bun, pnpm].every((version) => EXACT_VERSION.test(version))
  ) {
    throw new Error("mise.toml must pin exact node, bun, and pnpm versions");
  }
  return Object.freeze({ node, bun, pnpm });
};
