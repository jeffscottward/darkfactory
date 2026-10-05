import { describe, expect, it } from "vitest";

import {
  CONCRETE_THEME_NAMES,
  contrastRatio,
  DERIVED_TOKEN_NAMES,
  mix,
  parseColor,
  renderThemeCss,
  SHADCN_TOKEN_NAMES,
  STATUS_TOKEN_NAMES,
  THEME_TOKEN_NAMES,
  THEME_TOKENS,
  type ThemeTokenName,
  toHex,
} from "./theme-tokens.ts";
import { THEME_NAMES } from "./themes.ts";

const themes = CONCRETE_THEME_NAMES.map((name) => ({
  name,
  theme: THEME_TOKENS[name],
}));

const lab = (color: string): readonly [number, number, number] => {
  const hex = toHex(color);
  const linear = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.040_45
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const x =
    (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.950_47;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z =
    (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.088_83;
  const f = (value: number): number =>
    value > 0.008_856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

const deltaE = (first: string, second: string): number => {
  const a = lab(first);
  const b = lab(second);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

type Pair = readonly [ThemeTokenName, ThemeTokenName];

const pairs = (
  text: ThemeTokenName,
  backgrounds: readonly ThemeTokenName[]
): Pair[] => backgrounds.map((background) => [text, background] as const);

const AA_TEXT: readonly Pair[] = [
  ...pairs("foreground", [
    "background",
    "card",
    "popover",
    "muted",
    "accent",
    "secondary",
    "sidebar",
  ]),
  ...pairs("card-foreground", ["card"]),
  ...pairs("popover-foreground", ["popover"]),
  ...pairs("primary-foreground", ["primary"]),
  ...pairs("secondary-foreground", ["secondary"]),
  ...pairs("muted-foreground", ["background", "card", "muted"]),
  ...pairs("accent-foreground", ["accent"]),
  ...pairs("sidebar-foreground", ["sidebar", "sidebar-accent"]),
  ...pairs("sidebar-primary-foreground", ["sidebar-primary"]),
  ...pairs("sidebar-accent-foreground", ["sidebar-accent"]),
  ...pairs("destructive", ["background", "card"]),
  ...pairs("primary", ["background", "card"]),
  ...pairs("primary-subtle-foreground", ["primary-subtle"]),
  ...pairs("success-foreground", ["success-subtle", "card"]),
  ...pairs("warning-foreground", ["warning-subtle", "card"]),
  ...pairs("info-foreground", ["info-subtle", "card"]),
];

const AA_UI: readonly Pair[] = [
  ...pairs("ring", ["background", "card"]),
  ...pairs("border-strong", ["background", "card"]),
  ...pairs("primary-border", ["background"]),
  ...pairs("destructive-border", ["card"]),
  ...pairs("success-border", ["card"]),
  ...pairs("warning-border", ["card"]),
  ...pairs("info-border", ["card"]),
  ...pairs("disabled-foreground", ["disabled"]),
  ...pairs("chart-1", ["card"]),
  ...pairs("chart-2", ["card"]),
  ...pairs("chart-3", ["card"]),
  ...pairs("chart-4", ["card"]),
  ...pairs("chart-5", ["card"]),
];

const COLOR = /^(#[0-9a-f]{6}|oklch\([^)]*\)|rgb\([^)]*\))$/;

describe("theme tokens", () => {
  it("covers every concrete theme name from the catalog", () => {
    expect(["system", ...CONCRETE_THEME_NAMES]).toEqual([...THEME_NAMES]);
    return expect(Object.keys(THEME_TOKENS).sort()).toEqual(
      [...CONCRETE_THEME_NAMES].sort()
    );
  });

  it("defines the full shadcn contract plus the extension as CSS colors", () => {
    expect(THEME_TOKEN_NAMES).toEqual([
      ...SHADCN_TOKEN_NAMES,
      ...STATUS_TOKEN_NAMES,
      ...DERIVED_TOKEN_NAMES,
    ]);
    expect(SHADCN_TOKEN_NAMES).toHaveLength(31);
    for (const { name, theme } of themes) {
      expect(Object.keys(theme.tokens).sort(), name).toEqual(
        [...THEME_TOKEN_NAMES].sort()
      );
      for (const token of THEME_TOKEN_NAMES) {
        expect(theme.tokens[token], `${name} ${token}`).toMatch(COLOR);
      }
      expect(theme.source, name).toMatch(
        /^(https:\/\/|design-system\/darkfactory\/MASTER\.md$)/
      );
      expect(theme.label.length, name).toBeGreaterThan(0);
    }
  });

  it("ships shadcn Neutral verbatim as Default, except recorded AA fixes", () => {
    const light = THEME_TOKENS["default-light"].tokens;
    const dark = THEME_TOKENS["default-dark"].tokens;
    expect(light.background).toBe("oklch(1 0 0)");
    expect(light.primary).toBe("oklch(0.205 0 0)");
    expect(light.border).toBe("oklch(0.922 0 0)");
    expect(dark.background).toBe("oklch(0.145 0 0)");
    expect(dark.card).toBe("oklch(0.205 0 0)");
    expect(dark.border).toBe("oklch(1 0 0 / 10%)");
    expect(dark["sidebar-primary"]).toBe("oklch(0.488 0.243 264.376)");
    expect(THEME_TOKENS.graphite.tokens.background).toBe("#333333");
    for (const { name, theme } of themes) {
      for (const note of theme.adjustments) {
        expect(note, name).toMatch(/^[\w-]+: .+ -> .+ \(.+\)$/);
      }
    }
    return expect(THEME_TOKENS.dracula.adjustments.length).toBeGreaterThan(0);
  });

  it("marks light and dark schemes by background luminance", () => {
    for (const { name, theme } of themes) {
      const light = contrastRatio(theme.tokens.background, "#000000") > 10;
      expect(theme.colorScheme, name).toBe(light ? "light" : "dark");
    }
  });

  it("meets WCAG AA for text (4.5) and UI boundaries (3)", () => {
    for (const { name, theme } of themes) {
      const { tokens } = theme;
      for (const [minimum, list] of [
        [4.5, AA_TEXT],
        [3, AA_UI],
      ] as const) {
        for (const [text, background] of list) {
          expect(
            contrastRatio(tokens[text], tokens[background], tokens.background),
            `${name}: ${text} on ${background}`
          ).toBeGreaterThanOrEqual(minimum);
        }
      }
      // shadcn group labels use text-sidebar-foreground/70.
      const sidebar = toHex(tokens.sidebar, toHex(tokens.background));
      const label = toHex(
        `rgb(${parseColor(toHex(tokens["sidebar-foreground"], sidebar))
          .rgb.map((channel) => channel * 255)
          .join(" ")} / 70%)`,
        sidebar
      );
      expect(
        contrastRatio(label, sidebar),
        `${name}: sidebar group label (70%) on sidebar`
      ).toBeGreaterThanOrEqual(4.5);
      // Destructive buttons and badges stay solid in every theme (no dark:bg-destructive/60).
      expect(
        contrastRatio(tokens["destructive-foreground"], tokens.destructive),
        `${name}: destructive-foreground on destructive button`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every theme perceptually distinct", () => {
    for (let index = 0; index < themes.length; index += 1) {
      for (let other = index + 1; other < themes.length; other += 1) {
        const a = themes[index]!;
        const b = themes[other]!;
        const distance = Math.hypot(
          deltaE(a.theme.tokens.background, b.theme.tokens.background),
          deltaE(a.theme.tokens.primary, b.theme.tokens.primary)
        );
        expect(distance, `${a.name} vs ${b.name}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("parses, blends and measures colors with known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#123456", "#abcdef", 0)).toBe("#123456");
    expect(toHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(toHex("oklch(0% 0 0)")).toBe("#000000");
    expect(toHex("oklch(0.145 0 0)")).toBe("#0a0a0a");
    expect(toHex("oklch(0.577 0.245 27.325)")).toBe("#e7000b");
    expect(toHex("oklch(1 0 0 / 10%)", "#000000")).toBe("#191919");
    expect(toHex("rgb(255 0 0 / 0.5)", "#ffffff")).toBe("#ff8080");
    expect(parseColor("rgb(0 0 0)").alpha).toBe(1);
    return expect(() => parseColor("hsl(0 0% 0%)")).toThrow(
      "Unsupported color: hsl(0 0% 0%)"
    );
  });
});

describe("renderThemeCss", () => {
  const css = renderThemeCss();

  it("applies light defaults, system light and dark, and every theme", () => {
    expect(css).toContain(
      ':root,\n[data-theme="default-light"] {\n  color-scheme: light;'
    );
    expect(css).toContain('[data-theme="system"] {\n  color-scheme: light;');
    expect(css).toContain(
      '@media (prefers-color-scheme: dark) {\n  [data-theme="system"] {\n    color-scheme: dark;\n    --background: oklch(0.145 0 0);'
    );
    for (const { name, theme } of themes) {
      expect(css, name).toContain(`[data-theme="${name}"]`);
      for (const token of THEME_TOKEN_NAMES) {
        expect(css, `${name} ${token}`).toContain(
          `--${token}: ${theme.tokens[token]};`
        );
      }
      expect(css).toContain(
        `[data-theme-swatch="${name}"] {\n  --swatch-background: ${theme.tokens.background};\n  --swatch-accent: ${theme.tokens.primary};\n}`
      );
    }
    return expect(css).toContain(
      '[data-theme-swatch="system"] {\n  --swatch-background: oklch(1 0 0);\n  --swatch-accent: oklch(0.145 0 0);\n}'
    );
  });

  it("defines the shadcn dark: variant for dark themes and dark System", () => {
    expect(css).toContain("@custom-variant dark {");
    expect(css).toContain(
      '  &:where([data-theme="dracula"] *) {\n    @slot;\n  }'
    );
    expect(css).not.toContain('&:where([data-theme="default-light"] *)');
    return expect(css).toContain(
      '  @media (prefers-color-scheme: dark) {\n    &:where([data-theme="system"] *) {\n      @slot;'
    );
  });

  it("renders the diagonal swatch circle in the components layer", () => {
    return expect(css).toMatch(
      /@layer components \{\n {2}\.theme-swatch \{\n {4}background: linear-gradient\(\n {6}135deg,\n {6}var\(--swatch-background\) 50%,\n {6}var\(--swatch-accent\) 50%\n {4}\);\n {4}border: 1px solid var\(--border-strong\);\n {4}border-radius: 9999px;\n {4}width: 1.25rem;\n {4}height: 1.25rem;\n {4}flex: none;\n {2}\}\n\}\n$/
    );
  });
});
