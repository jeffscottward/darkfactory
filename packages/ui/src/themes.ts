// What: Appearance catalog: theme names and labels, font size, density and roundness options, and root data attributes.
// Used by: packages/ui/src/client/theme.ts, apps/web/src/lib/theme.ts, apps/operator/src/app/layout.tsx.
// See: packages/ui/src/theme-tokens.ts (full color tokens); packages/ui/src/themes.css; packages/state/src/index.ts.
export const THEME_NAMES = [
  "system",
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
  radius: "medium",
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
    option("default-light", "Default Light"),
    option("default-dark", "Default Dark"),
    option("graphite", "Graphite"),
    option("dracula", "Dracula"),
    option("monokai", "Monokai"),
    option("tokyo-night", "Tokyo Night"),
    option("one-dark", "One Dark"),
    option("night-owl", "Night Owl"),
    option("synthwave-84", "Synthwave '84"),
    option("github-dark", "GitHub Dark"),
    option("github-light", "GitHub Light"),
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

const LIGHT_THEMES: ReadonlySet<ThemeName> = new Set([
  "default-light",
  "github-light",
]);

/** Color scheme of a theme; "system" follows prefers-color-scheme. */
export const themeColorScheme = (
  theme: ThemeName
): "light" | "dark" | "system" => {
  if (theme === "system") return "system";
  return LIGHT_THEMES.has(theme) ? "light" : "dark";
};
