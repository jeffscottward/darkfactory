// What: Theme data. A theme is a shadcn/ui CSS-variable set (the exact shadcn token names), plus derived extension tokens, WCAG helpers and the renderer that generates themes.css.
// Used by: packages/ui/src/themes.css (generated), packages/ui/src/theme-tokens.test.ts, packages/ui/src/themes.ts.
// See: design-system/darkfactory/MASTER.md section 3 ("Add a theme"); https://ui.shadcn.com/docs/theming.
// Regenerate themes.css after any change:
//   mise exec -- bun -e 'import { renderThemeCss } from "./packages/ui/src/theme-tokens.ts"; await Bun.write("packages/ui/src/themes.css", renderThemeCss());'

/** The shadcn/ui color variables, in shadcn order. A pasted shadcn or tweakcn theme fills exactly these. */
export const SHADCN_TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

/** DarkFactory extension: status colors. Each theme sets them. success/warning/info are text-safe on background and card; destructive-foreground is text on a solid destructive button or badge. */
export const STATUS_TOKEN_NAMES = [
  "destructive-foreground",
  "success",
  "warning",
  "info",
] as const;

/** Derived from the tokens above by deriveTokens(). Never set by hand. Kept for app code written before the shadcn contract. */
export const DERIVED_TOKEN_NAMES = [
  "surface",
  "surface-raised",
  "border-strong",
  "primary-hover",
  "primary-active",
  "primary-subtle",
  "primary-subtle-foreground",
  "primary-border",
  "destructive-hover",
  "destructive-active",
  "destructive-subtle",
  "destructive-border",
  "success-subtle",
  "success-foreground",
  "success-border",
  "warning-subtle",
  "warning-foreground",
  "warning-border",
  "info-subtle",
  "info-foreground",
  "info-border",
  "disabled",
  "disabled-foreground",
  "disabled-border",
  "overlay",
] as const;

export type ShadcnTokenName = (typeof SHADCN_TOKEN_NAMES)[number];
export type StatusTokenName = (typeof STATUS_TOKEN_NAMES)[number];
export type DerivedTokenName = (typeof DERIVED_TOKEN_NAMES)[number];
export type ThemeTokenName =
  | ShadcnTokenName
  | StatusTokenName
  | DerivedTokenName;

export const THEME_TOKEN_NAMES: readonly ThemeTokenName[] = Object.freeze([
  ...SHADCN_TOKEN_NAMES,
  ...STATUS_TOKEN_NAMES,
  ...DERIVED_TOKEN_NAMES,
]);

export const CONCRETE_THEME_NAMES = [
  "default-light",
  "default-dark",
  "graphite",
  "dracula",
  "monokai",
  "tokyo-night",
  "one-dark",
  "night-owl",
  "synthwave-84",
  "github-dark",
  "github-light",
] as const;

export type ConcreteThemeName = (typeof CONCRETE_THEME_NAMES)[number];
export type ColorScheme = "light" | "dark";

/** What a theme author writes: shadcn variables (any CSS color shadcn/tweakcn emits: oklch, hex, rgb) plus the status extension. */
export interface ThemeDefinition {
  /** Contrast fixes against the published palette, as "token: from -> to (reason)". */
  readonly adjustments: readonly string[];
  readonly colorScheme: ColorScheme;
  readonly label: string;
  /** Where the published palette lives. */
  readonly source: string;
  readonly tokens: Readonly<Record<ShadcnTokenName | StatusTokenName, string>>;
}

export interface ThemeTokenSet extends ThemeDefinition {
  readonly tokens: Readonly<Record<ThemeTokenName, string>>;
}

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly alpha: number;
  readonly rgb: Rgb;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const amount = (raw: string): number =>
  raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);

const encode = (channel: number): number => {
  const value = clamp(channel);
  return value <= 0.003_130_8
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
};

const oklchToRgb = (l: number, c: number, h: number): Rgb => {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lp = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const mp = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const sp = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    encode(4.076_741_662_1 * lp - 3.307_711_591_3 * mp + 0.230_969_929_2 * sp),
    encode(-1.268_438_004_6 * lp + 2.609_757_401_1 * mp - 0.341_319_396_5 * sp),
    encode(-0.004_196_086_3 * lp - 0.703_418_614_7 * mp + 1.707_614_701 * sp),
  ];
};

const COLOR_PATTERN = /^(oklch|rgb)\(\s*([^)]*?)\s*\)$/;

/** Parses #rrggbb, oklch(L C H [/ A]) and rgb(R G B [/ A]) into sRGB 0..1 with alpha. */
export const parseColor = (color: string): Rgba => {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return {
      alpha: 1,
      rgb: [1, 3, 5].map(
        (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255
      ) as unknown as Rgb,
    };
  }
  const match = COLOR_PATTERN.exec(color);
  if (match === null) throw new TypeError(`Unsupported color: ${color}`);
  const [channels, alphaPart] = (match[2] as string).split("/") as [
    string,
    string?,
  ];
  const parts = channels.trim().split(/\s+/);
  const alpha = alphaPart === undefined ? 1 : amount(alphaPart.trim());
  if (match[1] === "oklch") {
    const [l, c, h] = parts as [string, string, string];
    return { alpha, rgb: oklchToRgb(amount(l), Number(c), Number(h)) };
  }
  return {
    alpha,
    rgb: parts.map((part) => Number(part) / 255) as unknown as Rgb,
  };
};

/** Resolves a color to opaque #rrggbb, compositing any alpha over `backdrop`. */
export const toHex = (color: string, backdrop = "#000000"): string => {
  const { alpha, rgb } = parseColor(color);
  const base = alpha < 1 ? parseColor(backdrop).rgb : rgb;
  return `#${rgb
    .map((channel, index) =>
      Math.round(
        clamp(channel * alpha + (base[index] as number) * (1 - alpha)) * 255
      )
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

/** Blends `from` toward `to` by `weight` (0..1) in sRGB. */
export const mix = (from: string, to: string, weight: number): string => {
  const first = parseColor(toHex(from)).rgb;
  const second = parseColor(toHex(to)).rgb;
  return toHex(
    `rgb(${first.map((channel, index) => (channel + ((second[index] as number) - channel) * weight) * 255).join(" ")})`
  );
};

const linear = (channel: number): number =>
  channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const relativeLuminance = (hex: string): number => {
  const [red, green, blue] = parseColor(hex).rgb.map(linear) as unknown as Rgb;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** WCAG 2.x contrast ratio. Translucent colors are composited over `backdrop`. */
export const contrastRatio = (
  first: string,
  second: string,
  backdrop = "#000000"
): number => {
  const b = toHex(second, backdrop);
  const a = relativeLuminance(toHex(first, b));
  const c = relativeLuminance(b);
  return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
};

/** Moves `color` away from `against` in 1% steps until it reaches `minimum`. Used only for derived tokens. */
const fitHex = (
  color: string,
  against: readonly [string, ...string[]],
  minimum: number
) => {
  const start = toHex(color);
  const target =
    relativeLuminance(start) > relativeLuminance(toHex(against[0]))
      ? "#ffffff"
      : "#000000";
  let candidate = start;
  for (
    let step = 1;
    step <= 100 &&
    against.some((other) => contrastRatio(candidate, other) < minimum);
    step += 1
  ) {
    candidate = mix(start, target, step / 100);
  }
  return candidate;
};

/** Builds every derived token from a theme definition. */
const deriveTokens = (
  definition: ThemeDefinition
): Readonly<Record<DerivedTokenName, string>> => {
  const t = definition.tokens;
  const dark = definition.colorScheme === "dark";
  const background = toHex(t.background);
  const card = toHex(t.card);
  const shift = (color: string, weight: number) =>
    mix(color, dark ? "#ffffff" : "#000000", weight);
  const subtle = (color: string) => mix(card, color, 0.14);
  const statusDerived = (name: "success" | "warning" | "info") => ({
    [`${name}-subtle`]: subtle(t[name]),
    [`${name}-foreground`]: fitHex(t[name], [card, subtle(t[name])], 4.5),
    [`${name}-border`]: fitHex(t[name], [card, subtle(t[name])], 3),
  });
  const primarySubtle = subtle(t.primary);
  const disabled = toHex(t.muted, background);
  return Object.freeze({
    "border-strong": fitHex(
      mix(toHex(t.border, background), toHex(t.foreground), 0.35),
      [background, card],
      3
    ),
    "destructive-active": shift(t.destructive, 0.22),
    "destructive-border": fitHex(
      t.destructive,
      [card, subtle(t.destructive)],
      3
    ),
    "destructive-hover": shift(t.destructive, 0.12),
    "destructive-subtle": subtle(t.destructive),
    disabled,
    "disabled-border": toHex(t.border, background),
    "disabled-foreground": fitHex(
      mix(disabled, toHex(t["muted-foreground"], background), 0.6),
      [disabled],
      3
    ),
    overlay: dark ? "rgb(0 0 0 / 0.6)" : "rgb(0 0 0 / 0.4)",
    "primary-active": shift(t.primary, 0.22),
    "primary-border": fitHex(t.primary, [background, card], 3),
    "primary-hover": shift(t.primary, 0.12),
    "primary-subtle": primarySubtle,
    "primary-subtle-foreground": fitHex(t.primary, [primarySubtle], 4.5),
    surface: card,
    "surface-raised": toHex(t.popover),
    ...statusDerived("success"),
    ...statusDerived("warning"),
    ...statusDerived("info"),
  } as Record<DerivedTokenName, string>);
};

const SHADCN_THEMING = "https://ui.shadcn.com/docs/theming";

/** Light dark sides of the shadcn status extension, from the Tailwind palette shadcn uses. */
const TAILWIND_STATUS_LIGHT = {
  "destructive-foreground": "oklch(1 0 0)",
  info: "oklch(0.5 0.134 242.749)",
  success: "oklch(0.527 0.154 150.069)",
  warning: "oklch(0.555 0.163 48.998)",
} as const;

const TAILWIND_STATUS_DARK = {
  "destructive-foreground": "oklch(0.145 0 0)",
  info: "oklch(0.746 0.16 232.661)",
  success: "oklch(0.792 0.209 151.711)",
  warning: "oklch(0.828 0.189 84.429)",
} as const;

interface PaletteInput {
  readonly accent: string;
  readonly background: string;
  readonly border: string;
  readonly card: string;
  readonly charts: readonly [string, string, string, string, string];
  readonly destructive: string;
  readonly foreground: string;
  readonly info: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly onAccent: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly secondary: string;
  readonly sidebar: string;
  /** Sidebar text when `foreground` at shadcn's 70% (group labels) fails AA on `sidebar`. */
  readonly sidebarForeground?: string;
  readonly success: string;
  readonly warning: string;
}

/** Maps an editor palette onto the shadcn variables the way shadcn's own dark themes are built. */
const fromPalette = (
  meta: Pick<
    ThemeDefinition,
    "adjustments" | "colorScheme" | "label" | "source"
  >,
  p: PaletteInput
): ThemeDefinition => ({
  ...meta,
  tokens: {
    accent: p.accent,
    "accent-foreground": p.foreground,
    background: p.background,
    border: p.border,
    card: p.card,
    "card-foreground": p.foreground,
    "chart-1": p.charts[0],
    "chart-2": p.charts[1],
    "chart-3": p.charts[2],
    "chart-4": p.charts[3],
    "chart-5": p.charts[4],
    destructive: p.destructive,
    // Dark themes have bright reds: dark text on a solid red passes AA, white does not.
    "destructive-foreground":
      meta.colorScheme === "dark" ? p.background : "#ffffff",
    foreground: p.foreground,
    info: p.info,
    input: p.border,
    muted: p.muted,
    "muted-foreground": p.mutedForeground,
    popover: p.card,
    "popover-foreground": p.foreground,
    primary: p.primary,
    "primary-foreground": p.primaryForeground,
    ring: p.primary,
    secondary: p.secondary,
    "secondary-foreground": p.foreground,
    sidebar: p.sidebar,
    "sidebar-accent": p.accent,
    // Active sidebar item text uses the theme accent when it passes AA on the row.
    "sidebar-accent-foreground":
      contrastRatio(p.primary, p.accent) >= 4.5 ? p.primary : p.foreground,
    "sidebar-border": p.border,
    "sidebar-foreground": p.sidebarForeground ?? p.foreground,
    "sidebar-primary": p.primary,
    "sidebar-primary-foreground": p.primaryForeground,
    "sidebar-ring": p.primary,
    success: p.success,
    warning: p.warning,
  },
});

/** Theme sources. Add a theme here (see MASTER.md "Add a theme"). */
const THEME_DEFINITIONS: Readonly<Record<ConcreteThemeName, ThemeDefinition>> =
  Object.freeze({
    "default-light": {
      adjustments: [
        "ring: oklch(0.708 0 0) -> oklch(0.556 0 0) (focus ring 3:1, WCAG 1.4.11)",
        "sidebar-ring: oklch(0.708 0 0) -> oklch(0.556 0 0) (focus ring 3:1)",
        "chart-4: oklch(0.828 0.189 84.429) -> oklch(0.666 0.179 58.318) (3:1 on card; Tailwind amber-600)",
        "chart-5: oklch(0.769 0.188 70.08) -> oklch(0.555 0.163 48.998) (3:1 on card; Tailwind amber-700)",
        "muted-foreground: oklch(0.556 0 0) -> oklch(0.545 0 0) (4.5:1 on muted)",
      ],
      colorScheme: "light",
      label: "Default Light",
      source: SHADCN_THEMING,
      tokens: {
        ...TAILWIND_STATUS_LIGHT,
        accent: "oklch(0.97 0 0)",
        "accent-foreground": "oklch(0.205 0 0)",
        background: "oklch(1 0 0)",
        border: "oklch(0.922 0 0)",
        card: "oklch(1 0 0)",
        "card-foreground": "oklch(0.145 0 0)",
        "chart-1": "oklch(0.646 0.222 41.116)",
        "chart-2": "oklch(0.6 0.118 184.704)",
        "chart-3": "oklch(0.398 0.07 227.392)",
        "chart-4": "oklch(0.666 0.179 58.318)",
        "chart-5": "oklch(0.555 0.163 48.998)",
        destructive: "oklch(0.577 0.245 27.325)",
        foreground: "oklch(0.145 0 0)",
        input: "oklch(0.922 0 0)",
        muted: "oklch(0.97 0 0)",
        "muted-foreground": "oklch(0.545 0 0)",
        popover: "oklch(1 0 0)",
        "popover-foreground": "oklch(0.145 0 0)",
        primary: "oklch(0.205 0 0)",
        "primary-foreground": "oklch(0.985 0 0)",
        ring: "oklch(0.556 0 0)",
        secondary: "oklch(0.97 0 0)",
        "secondary-foreground": "oklch(0.205 0 0)",
        sidebar: "oklch(0.985 0 0)",
        "sidebar-accent": "oklch(0.97 0 0)",
        "sidebar-accent-foreground": "oklch(0.205 0 0)",
        "sidebar-border": "oklch(0.922 0 0)",
        "sidebar-foreground": "oklch(0.145 0 0)",
        "sidebar-primary": "oklch(0.205 0 0)",
        "sidebar-primary-foreground": "oklch(0.985 0 0)",
        "sidebar-ring": "oklch(0.556 0 0)",
      },
    },
    "default-dark": {
      adjustments: [
        "chart-1: oklch(0.488 0.243 264.376) -> oklch(0.623 0.214 259.815) (3:1 on card; Tailwind blue-500)",
      ],
      colorScheme: "dark",
      label: "Default Dark",
      source: SHADCN_THEMING,
      tokens: {
        ...TAILWIND_STATUS_DARK,
        accent: "oklch(0.269 0 0)",
        "accent-foreground": "oklch(0.985 0 0)",
        background: "oklch(0.145 0 0)",
        border: "oklch(1 0 0 / 10%)",
        card: "oklch(0.205 0 0)",
        "card-foreground": "oklch(0.985 0 0)",
        "chart-1": "oklch(0.623 0.214 259.815)",
        "chart-2": "oklch(0.696 0.17 162.48)",
        "chart-3": "oklch(0.769 0.188 70.08)",
        "chart-4": "oklch(0.627 0.265 303.9)",
        "chart-5": "oklch(0.645 0.246 16.439)",
        destructive: "oklch(0.704 0.191 22.216)",
        foreground: "oklch(0.985 0 0)",
        input: "oklch(1 0 0 / 15%)",
        muted: "oklch(0.269 0 0)",
        "muted-foreground": "oklch(0.708 0 0)",
        popover: "oklch(0.205 0 0)",
        "popover-foreground": "oklch(0.985 0 0)",
        primary: "oklch(0.922 0 0)",
        "primary-foreground": "oklch(0.205 0 0)",
        ring: "oklch(0.556 0 0)",
        secondary: "oklch(0.269 0 0)",
        "secondary-foreground": "oklch(0.985 0 0)",
        sidebar: "oklch(0.205 0 0)",
        "sidebar-accent": "oklch(0.269 0 0)",
        "sidebar-accent-foreground": "oklch(0.985 0 0)",
        "sidebar-border": "oklch(1 0 0 / 10%)",
        "sidebar-foreground": "oklch(0.985 0 0)",
        "sidebar-primary": "oklch(0.488 0.243 264.376)",
        "sidebar-primary-foreground": "oklch(0.985 0 0)",
        "sidebar-ring": "oklch(0.556 0 0)",
      },
    },
    graphite: fromPalette(
      {
        adjustments: [],
        colorScheme: "dark",
        label: "Graphite",
        source: "design-system/darkfactory/MASTER.md",
      },
      {
        accent: "#4a4a4a",
        background: "#333333",
        border: "#4d4d4d",
        card: "#3b3b3b",
        charts: ["#7ab0ff", "#7ed69a", "#f2c46d", "#ff8078", "#c3a6ff"],
        destructive: "#ff8078",
        foreground: "#ededed",
        info: "#7cc7f2",
        muted: "#424242",
        mutedForeground: "#bdbdbd",
        onAccent: "#1f1f1f",
        primary: "#ededed",
        primaryForeground: "#262626",
        secondary: "#424242",
        sidebar: "#2b2b2b",
        success: "#7ed69a",
        warning: "#f2c46d",
      }
    ),
    dracula: fromPalette(
      {
        adjustments: [
          "muted-foreground: comment #6272a4 -> #abb5da (4.5:1 on Current Line #44475a)",
        ],
        colorScheme: "dark",
        label: "Dracula",
        source: "https://draculatheme.com/spec",
      },
      {
        accent: "#44475a",
        background: "#282a36",
        border: "#44475a",
        card: "#21222c",
        charts: ["#bd93f9", "#ff79c6", "#8be9fd", "#50fa7b", "#ffb86c"],
        destructive: "#ff5555",
        foreground: "#f8f8f2",
        info: "#8be9fd",
        muted: "#44475a",
        mutedForeground: "#abb5da",
        onAccent: "#282a36",
        primary: "#bd93f9",
        primaryForeground: "#282a36",
        secondary: "#44475a",
        sidebar: "#21222c",
        success: "#50fa7b",
        warning: "#f1fa8c",
      }
    ),
    monokai: fromPalette(
      {
        adjustments: [
          "muted-foreground: comment #75715e -> #aca78f (4.5:1 on #3e3d32)",
          "destructive: #f92672 -> #fa4989 (4.5:1 on background)",
        ],
        colorScheme: "dark",
        label: "Monokai",
        source:
          "https://github.com/monokai/monokai-pro-sublime-text/blob/master/Monokai%20Classic.sublime-color-scheme",
      },
      {
        accent: "#3e3d32",
        background: "#272822",
        border: "#49483e",
        card: "#1e1f1c",
        charts: ["#f92672", "#a6e22e", "#66d9ef", "#fd971f", "#ae81ff"],
        destructive: "#fa4989",
        foreground: "#f8f8f2",
        info: "#66d9ef",
        muted: "#3e3d32",
        mutedForeground: "#aca78f",
        onAccent: "#272822",
        primary: "#a6e22e",
        primaryForeground: "#272822",
        secondary: "#3e3d32",
        sidebar: "#1e1f1c",
        success: "#a6e22e",
        warning: "#e6db74",
      }
    ),
    "tokyo-night": fromPalette(
      {
        adjustments: [],
        colorScheme: "dark",
        label: "Tokyo Night",
        source:
          "https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/night.lua",
      },
      {
        accent: "#292e42",
        background: "#1a1b26",
        border: "#292e42",
        card: "#16161e",
        charts: ["#7aa2f7", "#bb9af7", "#7dcfff", "#9ece6a", "#ff9e64"],
        destructive: "#f7768e",
        foreground: "#c0caf5",
        info: "#7dcfff",
        muted: "#292e42",
        mutedForeground: "#a9b1d6",
        onAccent: "#16161e",
        primary: "#7aa2f7",
        primaryForeground: "#16161e",
        secondary: "#292e42",
        sidebar: "#16161e",
        success: "#9ece6a",
        warning: "#e0af68",
      }
    ),
    "one-dark": fromPalette(
      {
        adjustments: [
          "muted-foreground: comment #5c6370 -> #9da5b4 (4.5:1; One Dark UI foreground)",
          "sidebar-foreground: #abb2bf -> #d7dae0 (group labels at 70% reach 4.5:1; One Dark highlight text)",
          "destructive: #e06c75 -> #e17079 (4.5:1 on background)",
        ],
        colorScheme: "dark",
        label: "One Dark",
        source:
          "https://github.com/atom/atom/tree/master/packages/one-dark-syntax/styles/colors.less",
      },
      {
        accent: "#2c313a",
        background: "#282c34",
        border: "#3e4451",
        card: "#21252b",
        charts: ["#61afef", "#c678dd", "#98c379", "#e5c07b", "#e06c75"],
        destructive: "#e17079",
        foreground: "#abb2bf",
        info: "#56b6c2",
        muted: "#2c313a",
        mutedForeground: "#9da5b4",
        onAccent: "#21252b",
        primary: "#61afef",
        primaryForeground: "#21252b",
        secondary: "#3e4451",
        sidebar: "#21252b",
        sidebarForeground: "#d7dae0",
        success: "#98c379",
        warning: "#e5c07b",
      }
    ),
    "night-owl": fromPalette(
      {
        adjustments: [
          "muted-foreground: comment #637777 -> #8badc1 (4.5:1; Night Owl line-number foreground)",
          "destructive: #ef5350 -> #f05c59 (4.5:1 on card)",
        ],
        colorScheme: "dark",
        label: "Night Owl",
        source: "https://github.com/sdras/night-owl-vscode-theme",
      },
      {
        accent: "#1d3b53",
        background: "#011627",
        border: "#122d42",
        card: "#0b2942",
        charts: ["#c792ea", "#82aaff", "#7fdbca", "#addb67", "#f78c6c"],
        destructive: "#f05c59",
        foreground: "#d6deeb",
        info: "#7fdbca",
        muted: "#0b2942",
        mutedForeground: "#8badc1",
        onAccent: "#011627",
        primary: "#c792ea",
        primaryForeground: "#011627",
        secondary: "#1d3b53",
        sidebar: "#010e1a",
        success: "#addb67",
        warning: "#ffcb8b",
      }
    ),
    "synthwave-84": fromPalette(
      {
        adjustments: [
          "muted-foreground: comment #848bbd -> #b6b1d6 (4.5:1 on #34294f)",
          "destructive: #fe4450 -> #fe4652 (4.5:1 on background)",
        ],
        colorScheme: "dark",
        label: "Synthwave '84",
        source: "https://github.com/robb0wen/synthwave-vscode",
      },
      {
        accent: "#34294f",
        background: "#262335",
        border: "#34294f",
        card: "#241b2f",
        charts: ["#ff7edb", "#36f9f6", "#fede5d", "#72f1b8", "#f97e72"],
        destructive: "#fe4652",
        foreground: "#ffffff",
        info: "#36f9f6",
        muted: "#34294f",
        mutedForeground: "#b6b1d6",
        onAccent: "#241b2f",
        primary: "#ff7edb",
        primaryForeground: "#241b2f",
        secondary: "#34294f",
        sidebar: "#171520",
        success: "#72f1b8",
        warning: "#fede5d",
      }
    ),
    "github-dark": fromPalette(
      {
        adjustments: [],
        colorScheme: "dark",
        label: "GitHub Dark",
        source: "https://primer.style/foundations/primitives/color",
      },
      {
        accent: "#21262d",
        background: "#0d1117",
        border: "#30363d",
        card: "#161b22",
        charts: ["#4493f8", "#3fb950", "#d29922", "#ab7df8", "#f85149"],
        destructive: "#f85149",
        foreground: "#e6edf3",
        info: "#4493f8",
        muted: "#21262d",
        mutedForeground: "#9198a1",
        onAccent: "#0d1117",
        primary: "#4493f8",
        primaryForeground: "#0d1117",
        secondary: "#21262d",
        sidebar: "#010409",
        success: "#3fb950",
        warning: "#d29922",
      }
    ),
    "github-light": fromPalette(
      {
        adjustments: [],
        colorScheme: "light",
        label: "GitHub Light",
        source: "https://primer.style/foundations/primitives/color",
      },
      {
        accent: "#eff2f5",
        background: "#ffffff",
        border: "#d1d9e0",
        card: "#ffffff",
        charts: ["#0969da", "#1a7f37", "#9a6700", "#8250df", "#cf222e"],
        destructive: "#cf222e",
        foreground: "#1f2328",
        info: "#0969da",
        muted: "#f6f8fa",
        mutedForeground: "#59636e",
        onAccent: "#ffffff",
        primary: "#1f883d",
        primaryForeground: "#ffffff",
        secondary: "#f6f8fa",
        sidebar: "#f6f8fa",
        success: "#1a7f37",
        warning: "#9a6700",
      }
    ),
  });

export const THEME_TOKENS: Readonly<Record<ConcreteThemeName, ThemeTokenSet>> =
  Object.freeze(
    Object.fromEntries(
      CONCRETE_THEME_NAMES.map((name) => {
        const definition = THEME_DEFINITIONS[name];
        return [
          name,
          Object.freeze({
            ...definition,
            tokens: Object.freeze({
              ...definition.tokens,
              ...deriveTokens(definition),
            }),
          }),
        ];
      })
    ) as Record<ConcreteThemeName, ThemeTokenSet>
  );

const declarations = (theme: ThemeTokenSet, indent: string): string =>
  [
    `${indent}color-scheme: ${theme.colorScheme};`,
    ...THEME_TOKEN_NAMES.map(
      (name) => `${indent}--${name}: ${theme.tokens[name]};`
    ),
  ].join("\n");

const swatch = (name: string, background: string, accent: string): string =>
  `[data-theme-swatch="${name}"] {\n  --swatch-background: ${background};\n  --swatch-accent: ${accent};\n}`;

const DARK_THEME_NAMES = CONCRETE_THEME_NAMES.filter(
  (name) => THEME_DEFINITIONS[name].colorScheme === "dark"
);

/** Renders packages/ui/src/themes.css. The file must equal this output exactly. */
export const renderThemeCss = (): string => {
  const light = THEME_TOKENS["default-light"];
  const dark = THEME_TOKENS["default-dark"];
  const blocks = [
    "/* Generated by renderThemeCss() in packages/ui/src/theme-tokens.ts. Do not edit by hand. */",
    [
      "/* shadcn dark: variant. Dark themes, and System when the OS prefers dark. */",
      "@custom-variant dark {",
      ...DARK_THEME_NAMES.map(
        (name) => `  &:where([data-theme="${name}"] *) {\n    @slot;\n  }`
      ),
      "  @media (prefers-color-scheme: dark) {",
      '    &:where([data-theme="system"] *) {',
      "      @slot;",
      "    }",
      "  }",
      "}",
    ].join("\n"),
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
