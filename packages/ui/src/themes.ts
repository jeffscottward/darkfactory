// What: Appearance catalog: theme names and labels, font size, density and roundness options, and root data attributes.
// Used by: packages/ui/src/client/theme.ts, apps/web/src/lib/theme.ts, apps/operator/src/app/layout.tsx.
// See: packages/ui/src/theme-tokens.ts (full color tokens); packages/ui/src/themes.css; packages/state/src/index.ts.
export const THEME_NAMES = [
  "system",
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

export const FONT_SIZE_NAMES = ["small", "default", "large"] as const;
export const DENSITY_NAMES = ["compact", "default", "comfortable"] as const;
export const RADIUS_NAMES = ["none", "small", "medium", "large"] as const;

export type ThemeName = (typeof THEME_NAMES)[number];
export type FontSizeName = (typeof FONT_SIZE_NAMES)[number];
export type DensityName = (typeof DENSITY_NAMES)[number];
export type RadiusName = (typeof RADIUS_NAMES)[number];

export interface Appearance {
  readonly density: DensityName;
  readonly fontSize: FontSizeName;
  readonly radius: RadiusName;
  readonly theme: ThemeName;
}

export const DEFAULT_THEME: ThemeName = "system";

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  density: "default",
  fontSize: "default",
  radius: "small",
  theme: DEFAULT_THEME,
});

export interface AppearanceOption<Value extends string> {
  readonly label: string;
  readonly value: Value;
}

const option = <Value extends string>(
  value: Value,
  label: string
): AppearanceOption<Value> => Object.freeze({ label, value });

export const THEME_OPTIONS: readonly AppearanceOption<ThemeName>[] =
  Object.freeze([
    option("system", "System"),
    option("default-dark", "Default Dark"),
    option("default-light", "Default Light"),
    option("tokyo-night", "Tokyo Night"),
    option("catppuccin-mocha", "Catppuccin Mocha"),
    option("catppuccin-latte", "Catppuccin Latte"),
    option("gruvbox-dark", "Gruvbox Dark"),
    option("nord", "Nord"),
    option("everforest", "Everforest"),
    option("rose-pine", "Rosé Pine"),
    option("kanagawa", "Kanagawa"),
  ]);

export const FONT_SIZE_OPTIONS: readonly AppearanceOption<FontSizeName>[] =
  Object.freeze([
    option("small", "Small"),
    option("default", "Default"),
    option("large", "Large"),
  ]);

export const DENSITY_OPTIONS: readonly AppearanceOption<DensityName>[] =
  Object.freeze([
    option("compact", "Compact"),
    option("default", "Default"),
    option("comfortable", "Comfortable"),
  ]);

export const RADIUS_OPTIONS: readonly AppearanceOption<RadiusName>[] =
  Object.freeze([
    option("none", "None"),
    option("small", "Small"),
    option("medium", "Medium"),
    option("large", "Large"),
  ]);

export const optionLabel = <Value extends string>(
  options: readonly AppearanceOption<Value>[],
  value: Value
): string => options.find((entry) => entry.value === value)?.label ?? value;

export type AppearanceAttributes = Readonly<{
  "data-theme": ThemeName;
  "data-font-size": FontSizeName;
  "data-density": DensityName;
  "data-radius": RadiusName;
}>;

export const appearanceAttributes = (
  appearance: Readonly<Appearance>
): AppearanceAttributes => ({
  "data-density": appearance.density,
  "data-font-size": appearance.fontSize,
  "data-radius": appearance.radius,
  "data-theme": appearance.theme,
});

const DARK_THEMES: ReadonlySet<ThemeName> = new Set([
  "default-dark",
  "tokyo-night",
  "catppuccin-mocha",
  "gruvbox-dark",
  "nord",
  "everforest",
  "rose-pine",
  "kanagawa",
]);

/** Color scheme of a theme; "system" follows prefers-color-scheme. */
export const themeColorScheme = (
  theme: ThemeName
): "light" | "dark" | "system" => {
  if (theme === "system") return "system";
  return DARK_THEMES.has(theme) ? "dark" : "light";
};
