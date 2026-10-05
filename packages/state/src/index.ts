// What: Canonical appearance identifiers (theme, font size, density, roundness) and UI preference defaults.
// Used by: packages/state/src/client.ts, apps/web/src/lib/theme.ts.
// See: packages/ui/src/themes.ts; packages/db/src/schema/index.ts#APPEARANCE_THEMES.
export const THEMES = Object.freeze([
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
] as const);

export const FONT_SIZES = Object.freeze(["small", "default", "large"] as const);

export const DENSITIES = Object.freeze([
  "compact",
  "default",
  "comfortable",
] as const);

export const RADII = Object.freeze([
  "none",
  "small",
  "medium",
  "large",
] as const);

export const CONSENT_STATES = Object.freeze([
  "granted",
  "denied",
  "unknown",
] as const);

export type Theme = (typeof THEMES)[number];
export type FontSize = (typeof FONT_SIZES)[number];
export type Density = (typeof DENSITIES)[number];
export type Radius = (typeof RADII)[number];
export type ConsentState = (typeof CONSENT_STATES)[number];
export type SidebarState = "expanded" | "collapsed";

export interface AppearancePreference {
  readonly density: Density;
  readonly fontSize: FontSize;
  readonly radius: Radius;
  readonly theme: Theme;
}

export interface UiPreferences extends AppearancePreference {
  readonly consent: ConsentState;
  readonly mobileNavigationOpen: boolean;
  readonly sidebar: SidebarState;
}

const isMember =
  <Value extends string>(values: readonly Value[]) =>
  (value: unknown): value is Value =>
    typeof value === "string" && (values as readonly string[]).includes(value);

export const isTheme = isMember(THEMES);
export const isFontSize = isMember(FONT_SIZES);
export const isDensity = isMember(DENSITIES);
export const isRadius = isMember(RADII);
export const isConsentState = isMember(CONSENT_STATES);

export const APPEARANCE_KEYS = Object.freeze([
  "theme",
  "fontSize",
  "density",
  "radius",
] as const);

/** Theme names from before the shadcn theme set (migration 0010). A stored retired name falls back to "system". */
export const RETIRED_THEMES = Object.freeze([
  "catppuccin-mocha",
  "catppuccin-latte",
  "gruvbox-dark",
  "nord",
  "everforest",
  "rose-pine",
  "kanagawa",
] as const);

const isRetiredTheme = isMember(RETIRED_THEMES);

/** Returns a copy with only the four appearance fields, or null when any field is not canonical. Retired theme names become "system". */
export const parseAppearancePreference = (
  value: unknown
): AppearancePreference | null => {
  if (typeof value !== "object" || value === null) return null;
  const storedTheme = Reflect.get(value, "theme");
  const theme = isRetiredTheme(storedTheme) ? "system" : storedTheme;
  const fontSize = Reflect.get(value, "fontSize");
  const density = Reflect.get(value, "density");
  const radius = Reflect.get(value, "radius");
  if (
    !(
      isTheme(theme) &&
      isFontSize(fontSize) &&
      isDensity(density) &&
      isRadius(radius)
    )
  )
    return null;
  return { density, fontSize, radius, theme };
};

export const isSameAppearance = (
  left: Readonly<AppearancePreference>,
  right: Readonly<AppearancePreference>
): boolean => APPEARANCE_KEYS.every((key) => left[key] === right[key]);

export const DEFAULT_APPEARANCE: Readonly<AppearancePreference> = Object.freeze(
  {
    density: "default",
    fontSize: "default",
    radius: "medium",
    theme: "system",
  }
);

export const DEFAULT_UI_PREFERENCES: Readonly<UiPreferences> = Object.freeze({
  mobileNavigationOpen: false,
  sidebar: "expanded",
  ...DEFAULT_APPEARANCE,
  consent: "unknown",
});
