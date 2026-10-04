import { describe, expect, it } from "vitest";

import {
  CONCRETE_THEME_NAMES,
  contrastRatio,
  mix,
  renderThemeCss,
  THEME_TOKEN_NAMES,
  THEME_TOKENS,
  type ThemeTokenName,
} from "./theme-tokens.ts";
import { THEME_NAMES } from "./themes.ts";

const themes = CONCRETE_THEME_NAMES.map((name) => ({
  name,
  theme: THEME_TOKENS[name],
}));

const lab = (hex: string): readonly [number, number, number] => {
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
    "surface",
    "surface-raised",
    "sidebar",
    "muted",
    "accent",
  ]),
  ...pairs("sidebar-foreground", ["sidebar"]),
  ...pairs("muted-foreground", [
    "background",
    "surface",
    "surface-raised",
    "muted",
  ]),
  ...pairs("primary-foreground", [
    "primary",
    "primary-hover",
    "primary-active",
  ]),
  ...pairs("primary", ["background", "surface"]),
  ...pairs("primary-subtle-foreground", ["primary-subtle"]),
  ...pairs("accent-foreground", ["accent"]),
  ...pairs("destructive-foreground", [
    "destructive",
    "destructive-hover",
    "destructive-active",
  ]),
  ...pairs("destructive", ["background", "surface"]),
  ...pairs("success-foreground", ["success-subtle", "surface"]),
  ...pairs("warning-foreground", ["warning-subtle", "surface"]),
  ...pairs("info-foreground", ["info-subtle", "surface"]),
];

const AA_UI: readonly Pair[] = [
  ...pairs("ring", ["background", "surface"]),
  ...pairs("border-strong", ["background", "surface"]),
  ...pairs("primary-border", ["background"]),
  ...pairs("destructive-border", ["surface"]),
  ...pairs("success-border", ["surface"]),
  ...pairs("warning-border", ["surface"]),
  ...pairs("info-border", ["surface"]),
  ...pairs("disabled-foreground", ["disabled"]),
  ...pairs("chart-1", ["surface"]),
  ...pairs("chart-2", ["surface"]),
  ...pairs("chart-3", ["surface"]),
  ...pairs("chart-4", ["surface"]),
  ...pairs("chart-5", ["surface"]),
];

describe("theme tokens", () => {
  it("covers every concrete theme name from the catalog", () => {
    expect(["system", ...CONCRETE_THEME_NAMES]).toEqual([...THEME_NAMES]);
    return expect(Object.keys(THEME_TOKENS).sort()).toEqual(
      [...CONCRETE_THEME_NAMES].sort()
    );
  });

  it("defines every token as lowercase hex, with an rgb overlay", () => {
    for (const { name, theme } of themes) {
      expect(Object.keys(theme.tokens).sort(), name).toEqual(
        [...THEME_TOKEN_NAMES].sort()
      );
      for (const token of THEME_TOKEN_NAMES) {
        const pattern =
          token === "overlay" ? /^rgb\(0 0 0 \/ 0\.\d\)$/ : /^#[0-9a-f]{6}$/;
        expect(theme.tokens[token], `${name} ${token}`).toMatch(pattern);
      }
      expect(theme.source, name).toMatch(
        /^(https:\/\/|design-system\/darkfactory\/MASTER\.md$)/
      );
    }
  });

  it("keeps Default Dark a neutral gray on #333333", () => {
    const { tokens } = THEME_TOKENS["default-dark"];
    expect(tokens.background).toBe("#333333");
    for (const token of [
      "background",
      "surface",
      "sidebar",
      "border",
    ] as const) {
      const value = tokens[token];
      expect(value.slice(1, 3), token).toBe(value.slice(3, 5));
      expect(value.slice(3, 5), token).toBe(value.slice(5, 7));
    }
    expect(contrastRatio(tokens.surface, "#333333")).toBeLessThan(1.3);
    return expect(contrastRatio(tokens.sidebar, "#000000")).toBeLessThan(
      contrastRatio(tokens.background, "#000000")
    );
  });

  it("keeps Default Light neutral and marks light and dark schemes", () => {
    const { tokens } = THEME_TOKENS["default-light"];
    for (const token of [
      "background",
      "surface",
      "sidebar",
      "border",
    ] as const) {
      const value = tokens[token];
      expect(value.slice(1, 3), token).toBe(value.slice(5, 7));
    }
    for (const { name, theme } of themes) {
      const light = contrastRatio(theme.tokens.background, "#000000") > 10;
      expect(theme.colorScheme, name).toBe(light ? "light" : "dark");
    }
    expect(THEME_TOKENS["catppuccin-latte"].colorScheme).toBe("light");
    return expect(THEME_TOKENS.nord.colorScheme).toBe("dark");
  });

  it("meets WCAG AA for text (4.5) and UI boundaries (3)", () => {
    for (const { name, theme } of themes) {
      for (const [minimum, list] of [
        [4.5, AA_TEXT],
        [3, AA_UI],
      ] as const) {
        for (const [text, background] of list) {
          expect(
            contrastRatio(theme.tokens[text], theme.tokens[background]),
            `${name}: ${text} on ${background}`
          ).toBeGreaterThanOrEqual(minimum);
        }
      }
    }
  });

  it("records each contrast adjustment as a real color change", () => {
    for (const { name, theme } of themes) {
      for (const note of theme.adjustments) {
        const match = note.match(
          /^([\w-]+): (#[0-9a-f]{6}) -> (#[0-9a-f]{6})$/
        );
        expect(match, `${name} ${note}`).not.toBeNull();
        expect(match?.[2], note).not.toBe(match?.[3]);
      }
    }
    return expect(THEME_TOKENS.nord.adjustments.length).toBeGreaterThan(0);
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

  it("computes contrast and blends with known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    return expect(mix("#123456", "#abcdef", 0)).toBe("#123456");
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
      '@media (prefers-color-scheme: dark) {\n  [data-theme="system"] {\n    color-scheme: dark;\n    --background: #333333;'
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
      '[data-theme-swatch="system"] {\n  --swatch-background: #f5f5f5;\n  --swatch-accent: #333333;\n}'
    );
  });

  it("renders the diagonal swatch circle in the components layer", () => {
    return expect(css).toMatch(
      /@layer components \{\n {2}\.theme-swatch \{\n {4}background: linear-gradient\(\n {6}135deg,\n {6}var\(--swatch-background\) 50%,\n {6}var\(--swatch-accent\) 50%\n {4}\);\n {4}border: 1px solid var\(--border-strong\);\n {4}border-radius: 9999px;\n {4}width: 1.25rem;\n {4}height: 1.25rem;\n {4}flex: none;\n {2}\}\n\}\n$/
    );
  });
});
