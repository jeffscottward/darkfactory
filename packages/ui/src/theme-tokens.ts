// What: Full color tokens for every concrete theme, WCAG contrast helpers, and the renderer that generates themes.css.
// Used by: packages/ui/src/themes.css (generated), packages/ui/src/theme-tokens.test.ts.
// See: packages/ui/src/themes.ts (theme names and labels); design-system/darkfactory/MASTER.md section 3.2.
// Regenerate themes.css after any change:
//   mise exec -- bun -e 'import { renderThemeCss } from "./packages/ui/src/theme-tokens.ts"; await Bun.write("packages/ui/src/themes.css", renderThemeCss());'

export const THEME_TOKEN_NAMES = [
  "background",
  "foreground",
  "surface",
  "surface-raised",
  "sidebar",
  "sidebar-foreground",
  "muted",
  "muted-foreground",
  "border",
  "border-strong",
  "accent",
  "accent-foreground",
  "primary",
  "primary-hover",
  "primary-active",
  "primary-foreground",
  "primary-subtle",
  "primary-subtle-foreground",
  "primary-border",
  "destructive",
  "destructive-hover",
  "destructive-active",
  "destructive-foreground",
  "destructive-subtle",
  "destructive-border",
  "success",
  "success-subtle",
  "success-foreground",
  "success-border",
  "warning",
  "warning-subtle",
  "warning-foreground",
  "warning-border",
  "info",
  "info-subtle",
  "info-foreground",
  "info-border",
  "disabled",
  "disabled-foreground",
  "disabled-border",
  "ring",
  "overlay",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

export const CONCRETE_THEME_NAMES = [
  "default-dark",
  "default-light",
  "tokyo-night",
  "catppuccin-mocha",
  "catppuccin-latte",
  "gruvbox-dark",
  "nord",
  "everforest",
  "rose-pine",
  "kanagawa",
] as const;

export type ConcreteThemeName = (typeof CONCRETE_THEME_NAMES)[number];
export type ColorScheme = "light" | "dark";

export interface ThemeTokenSet {
  /** Every published color that was shifted to pass WCAG AA, as "token: from -> to". */
  readonly adjustments: readonly string[];
  readonly colorScheme: ColorScheme;
  /** Where the published palette lives. Default themes are owned by DarkFactory. */
  readonly source: string;
  readonly tokens: Readonly<Record<ThemeTokenName, string>>;
}

type Rgb = readonly [number, number, number];

const toRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/** Blends `from` toward `to` by `amount` (0..1) in sRGB. */
export const mix = (from: string, to: string, amount: number): string => {
  const first = toRgb(from);
  const second = toRgb(to);
  return toHex([
    first[0] + (second[0] - first[0]) * amount,
    first[1] + (second[1] - first[1]) * amount,
    first[2] + (second[2] - first[2]) * amount,
  ]);
};

const linear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex: string): number => {
  const [red, green, blue] = toRgb(hex).map(linear) as unknown as Rgb;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
export const contrastRatio = (first: string, second: string): number => {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

interface ThemeInput {
  readonly accent: string;
  readonly background: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly charts: readonly [string, string, string, string, string];
  readonly colorScheme: ColorScheme;
  readonly destructive: string;
  readonly foreground: string;
  readonly info: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly sidebar: string;
  readonly source: string;
  readonly success: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly warning: string;
}

const buildTheme = (input: ThemeInput): ThemeTokenSet => {
  const adjustments: string[] = [];
  const dark = input.colorScheme === "dark";
  /** Moves a color away from `against` in 1% steps until every pair reaches `minimum`. */
  const fit = (
    token: string,
    color: string,
    against: readonly [string, ...string[]],
    minimum: number
  ): string => {
    const target =
      relativeLuminance(color) > relativeLuminance(against[0])
        ? "#ffffff"
        : "#000000";
    let step = 0;
    let candidate = color;
    while (
      step < 100 &&
      against.some((other) => contrastRatio(candidate, other) < minimum)
    ) {
      step += 1;
      candidate = mix(color, target, step / 100);
    }
    if (candidate !== color)
      adjustments.push(`${token}: ${color} -> ${candidate}`);
    return candidate;
  };
  const shift = (color: string, amount: number): string =>
    mix(color, dark ? "#ffffff" : "#000000", amount);

  const { background, surface, surfaceRaised, sidebar, muted, accent } = input;
  const foreground = fit(
    "foreground",
    input.foreground,
    [background, surface, surfaceRaised, sidebar, muted, accent],
    4.5
  );
  const mutedForeground = fit(
    "muted-foreground",
    input.mutedForeground,
    [background, surface, surfaceRaised, muted],
    4.5
  );
  const borderStrong = fit(
    "border-strong",
    input.borderStrong,
    [background, surface],
    3
  );
  const primary = fit("primary", input.primary, [background, surface], 4.5);
  const primaryHover = shift(primary, 0.12);
  const primaryActive = shift(primary, 0.22);
  const primaryForeground = fit(
    "primary-foreground",
    input.primaryForeground,
    [primary, primaryHover, primaryActive],
    4.5
  );
  const primarySubtle = mix(surface, primary, 0.16);
  const destructive = fit(
    "destructive",
    input.destructive,
    [background, surface],
    4.5
  );
  const destructiveHover = shift(destructive, 0.12);
  const destructiveActive = shift(destructive, 0.22);
  const destructiveSubtle = mix(surface, destructive, 0.14);
  const status = (name: "success" | "warning" | "info", color: string) => {
    const subtle = mix(surface, color, 0.14);
    return {
      [name]: color,
      [`${name}-subtle`]: subtle,
      [`${name}-foreground`]: fit(
        `${name}-foreground`,
        color,
        [subtle, surface],
        4.5
      ),
      [`${name}-border`]: fit(`${name}-border`, color, [surface, subtle], 3),
    };
  };
  const charts = input.charts.map((color, index) =>
    fit(`chart-${index + 1}`, color, [surface], 3)
  );

  const tokens = {
    accent,
    "accent-foreground": foreground,
    background,
    border: input.border,
    "border-strong": borderStrong,
    destructive,
    "destructive-active": destructiveActive,
    "destructive-border": fit(
      "destructive-border",
      destructive,
      [surface, destructiveSubtle],
      3
    ),
    "destructive-foreground": fit(
      "destructive-foreground",
      input.primaryForeground,
      [destructive, destructiveHover, destructiveActive],
      4.5
    ),
    "destructive-hover": destructiveHover,
    "destructive-subtle": destructiveSubtle,
    foreground,
    muted,
    "muted-foreground": mutedForeground,
    primary,
    "primary-active": primaryActive,
    "primary-border": fit("primary-border", primary, [background, surface], 3),
    "primary-foreground": primaryForeground,
    "primary-hover": primaryHover,
    "primary-subtle": primarySubtle,
    "primary-subtle-foreground": fit(
      "primary-subtle-foreground",
      primary,
      [primarySubtle],
      4.5
    ),
    sidebar,
    "sidebar-foreground": foreground,
    surface,
    "surface-raised": surfaceRaised,
    ...status("success", input.success),
    ...status("warning", input.warning),
    ...status("info", input.info),
    "chart-1": charts[0],
    "chart-2": charts[1],
    "chart-3": charts[2],
    "chart-4": charts[3],
    "chart-5": charts[4],
    disabled: muted,
    "disabled-border": input.border,
    "disabled-foreground": fit(
      "disabled-foreground",
      mix(muted, mutedForeground, 0.6),
      [muted],
      3
    ),
    overlay: dark ? "rgb(0 0 0 / 0.6)" : "rgb(0 0 0 / 0.4)",
    ring: fit("ring", primary, [background, surface], 3),
  } as Record<ThemeTokenName, string>;

  return Object.freeze({
    adjustments: Object.freeze(adjustments),
    colorScheme: input.colorScheme,
    source: input.source,
    tokens: Object.freeze(tokens),
  });
};

const DARKFACTORY_SOURCE = "design-system/darkfactory/MASTER.md";

export const THEME_TOKENS: Readonly<Record<ConcreteThemeName, ThemeTokenSet>> =
  Object.freeze({
    "catppuccin-latte": buildTheme({
      accent: "#ccd0da",
      background: "#e6e9ef",
      border: "#ccd0da",
      borderStrong: "#7c7f93",
      charts: ["#8839ef", "#1e66f5", "#40a02b", "#fe640b", "#d20f39"],
      colorScheme: "light",
      destructive: "#d20f39",
      foreground: "#4c4f69",
      info: "#209fb5",
      muted: "#dce0e8",
      mutedForeground: "#5c5f77",
      primary: "#8839ef",
      primaryForeground: "#eff1f5",
      sidebar: "#dce0e8",
      source: "https://github.com/catppuccin/palette/blob/main/palette.json",
      success: "#40a02b",
      surface: "#eff1f5",
      surfaceRaised: "#eff1f5",
      warning: "#df8e1d",
    }),
    "catppuccin-mocha": buildTheme({
      accent: "#45475a",
      background: "#1e1e2e",
      border: "#313244",
      borderStrong: "#7f849c",
      charts: ["#cba6f7", "#a6e3a1", "#fab387", "#89b4fa", "#f38ba8"],
      colorScheme: "dark",
      destructive: "#f38ba8",
      foreground: "#cdd6f4",
      info: "#74c7ec",
      muted: "#313244",
      mutedForeground: "#a6adc8",
      primary: "#cba6f7",
      primaryForeground: "#11111b",
      sidebar: "#11111b",
      source: "https://github.com/catppuccin/palette/blob/main/palette.json",
      success: "#a6e3a1",
      surface: "#181825",
      surfaceRaised: "#313244",
      warning: "#f9e2af",
    }),
    "default-dark": buildTheme({
      accent: "#4a4a4a",
      background: "#333333",
      border: "#4d4d4d",
      borderStrong: "#8c8c8c",
      charts: ["#7ab0ff", "#7ed69a", "#f2c46d", "#ff8a80", "#c3a6ff"],
      colorScheme: "dark",
      destructive: "#ff8a80",
      foreground: "#ededed",
      info: "#7cc7f2",
      muted: "#474747",
      mutedForeground: "#bdbdbd",
      primary: "#7ab0ff",
      primaryForeground: "#1a1a1a",
      sidebar: "#2b2b2b",
      source: DARKFACTORY_SOURCE,
      success: "#7ed69a",
      surface: "#3a3a3a",
      surfaceRaised: "#424242",
      warning: "#f2c46d",
    }),
    "default-light": buildTheme({
      accent: "#e0e0e0",
      background: "#f5f5f5",
      border: "#d4d4d4",
      borderStrong: "#8a8a8a",
      charts: ["#1d4ed8", "#18733c", "#b45309", "#b42318", "#6d28d9"],
      colorScheme: "light",
      destructive: "#b42318",
      foreground: "#1f1f1f",
      info: "#0e7490",
      muted: "#e8e8e8",
      mutedForeground: "#595959",
      primary: "#1d4ed8",
      primaryForeground: "#ffffff",
      sidebar: "#ebebeb",
      source: DARKFACTORY_SOURCE,
      success: "#18733c",
      surface: "#fafafa",
      surfaceRaised: "#ffffff",
      warning: "#8a5a00",
    }),
    everforest: buildTheme({
      accent: "#475258",
      background: "#2d353b",
      border: "#475258",
      borderStrong: "#7a8478",
      charts: ["#a7c080", "#7fbbb3", "#dbbc7f", "#e69875", "#d699b6"],
      colorScheme: "dark",
      destructive: "#e67e80",
      foreground: "#d3c6aa",
      info: "#7fbbb3",
      muted: "#3d484d",
      mutedForeground: "#9da9a0",
      primary: "#a7c080",
      primaryForeground: "#2d353b",
      sidebar: "#232a2e",
      source: "https://github.com/sainnhe/everforest/blob/master/palette.md",
      success: "#83c092",
      surface: "#343f44",
      surfaceRaised: "#3d484d",
      warning: "#dbbc7f",
    }),
    "gruvbox-dark": buildTheme({
      accent: "#504945",
      background: "#282828",
      border: "#504945",
      borderStrong: "#7c6f64",
      charts: ["#fe8019", "#8ec07c", "#fabd2f", "#83a598", "#d3869b"],
      colorScheme: "dark",
      destructive: "#fb4934",
      foreground: "#ebdbb2",
      info: "#83a598",
      muted: "#3c3836",
      mutedForeground: "#bdae93",
      primary: "#fe8019",
      primaryForeground: "#282828",
      sidebar: "#1d2021",
      source: "https://github.com/morhetz/gruvbox#palette",
      success: "#b8bb26",
      surface: "#32302f",
      surfaceRaised: "#3c3836",
      warning: "#fabd2f",
    }),
    kanagawa: buildTheme({
      accent: "#223249",
      background: "#1f1f28",
      border: "#363646",
      borderStrong: "#54546d",
      charts: ["#7e9cd8", "#98bb6c", "#ffa066", "#d27e99", "#957fb8"],
      colorScheme: "dark",
      destructive: "#e46876",
      foreground: "#dcd7ba",
      info: "#7fb4ca",
      muted: "#2a2a37",
      mutedForeground: "#c8c093",
      primary: "#7e9cd8",
      primaryForeground: "#1f1f28",
      sidebar: "#16161d",
      source:
        "https://github.com/rebelot/kanagawa.nvim/blob/master/lua/kanagawa/colors.lua",
      success: "#98bb6c",
      surface: "#2a2a37",
      surfaceRaised: "#363646",
      warning: "#e6c384",
    }),
    nord: buildTheme({
      accent: "#4c566a",
      background: "#2e3440",
      border: "#434c5e",
      borderStrong: "#4c566a",
      charts: ["#88c0d0", "#a3be8c", "#ebcb8b", "#d08770", "#b48ead"],
      colorScheme: "dark",
      destructive: "#bf616a",
      foreground: "#eceff4",
      info: "#81a1c1",
      muted: "#434c5e",
      mutedForeground: "#d8dee9",
      primary: "#88c0d0",
      primaryForeground: "#2e3440",
      sidebar: "#2e3440",
      source: "https://www.nordtheme.com/docs/colors-and-palettes",
      success: "#a3be8c",
      surface: "#3b4252",
      surfaceRaised: "#434c5e",
      warning: "#ebcb8b",
    }),
    "rose-pine": buildTheme({
      accent: "#403d52",
      background: "#191724",
      border: "#403d52",
      borderStrong: "#6e6a86",
      charts: ["#ebbcba", "#9ccfd8", "#f6c177", "#c4a7e7", "#eb6f92"],
      colorScheme: "dark",
      destructive: "#eb6f92",
      foreground: "#e0def4",
      info: "#c4a7e7",
      muted: "#26233a",
      mutedForeground: "#908caa",
      primary: "#ebbcba",
      primaryForeground: "#191724",
      sidebar: "#191724",
      source: "https://rosepinetheme.com/palette/ingredients/",
      success: "#9ccfd8",
      surface: "#1f1d2e",
      surfaceRaised: "#26233a",
      warning: "#f6c177",
    }),
    "tokyo-night": buildTheme({
      accent: "#3b4261",
      background: "#1a1b26",
      border: "#292e42",
      borderStrong: "#565f89",
      charts: ["#7aa2f7", "#9ece6a", "#e0af68", "#f7768e", "#bb9af7"],
      colorScheme: "dark",
      destructive: "#f7768e",
      foreground: "#c0caf5",
      info: "#7dcfff",
      muted: "#292e42",
      mutedForeground: "#a9b1d6",
      primary: "#7aa2f7",
      primaryForeground: "#16161e",
      sidebar: "#16161e",
      source:
        "https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/night.lua",
      success: "#9ece6a",
      surface: "#1f2335",
      surfaceRaised: "#292e42",
      warning: "#e0af68",
    }),
  });

const declarations = (theme: ThemeTokenSet, indent: string): string =>
  [
    `${indent}color-scheme: ${theme.colorScheme};`,
    ...THEME_TOKEN_NAMES.map(
      (name) => `${indent}--${name}: ${theme.tokens[name]};`
    ),
  ].join("\n");

const swatch = (name: string, background: string, accent: string): string =>
  `[data-theme-swatch="${name}"] {\n  --swatch-background: ${background};\n  --swatch-accent: ${accent};\n}`;

/** Renders packages/ui/src/themes.css. The file must equal this output exactly. */
export const renderThemeCss = (): string => {
  const light = THEME_TOKENS["default-light"];
  const dark = THEME_TOKENS["default-dark"];
  const blocks = [
    "/* Generated by renderThemeCss() in packages/ui/src/theme-tokens.ts. Do not edit by hand. */",
    `:root,\n[data-theme="default-light"] {\n${declarations(light, "  ")}\n}`,
    `[data-theme="system"] {\n${declarations(light, "  ")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  [data-theme="system"] {\n${declarations(dark, "    ")}\n  }\n}`,
    ...CONCRETE_THEME_NAMES.filter((name) => name !== "default-light").map(
      (name) =>
        `[data-theme="${name}"] {\n${declarations(THEME_TOKENS[name], "  ")}\n}`
    ),
    swatch("system", light.tokens.background, dark.tokens.background),
    ...CONCRETE_THEME_NAMES.map((name) =>
      swatch(
        name,
        THEME_TOKENS[name].tokens.background,
        THEME_TOKENS[name].tokens.primary
      )
    ),
    [
      "@layer components {",
      "  .theme-swatch {",
      "    background: linear-gradient(",
      "      135deg,",
      "      var(--swatch-background) 50%,",
      "      var(--swatch-accent) 50%",
      "    );",
      "    border: 1px solid var(--border-strong);",
      "    border-radius: 9999px;",
      "    width: 1.25rem;",
      "    height: 1.25rem;",
      "    flex: none;",
      "  }",
      "}",
    ].join("\n"),
  ];
  return `${blocks.join("\n\n")}\n`;
};
