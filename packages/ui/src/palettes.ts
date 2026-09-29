export const PALETTE_NAMES = [
  "neutral",
  "slate",
  "blue",
  "cyan",
  "green",
  "amber",
  "orange",
  "red",
  "rose",
  "violet",
] as const

export const THEME_MODES = ["light", "dark", "system"] as const

export type PaletteName = (typeof PALETTE_NAMES)[number]
export type ThemeMode = (typeof THEME_MODES)[number]

export const DEFAULT_PALETTE: PaletteName = "neutral"

export type ThemeAttributes = Readonly<{
  "data-palette": PaletteName
  "data-mode": ThemeMode
}>

export const themeAttributes = (
  palette: PaletteName,
  mode: ThemeMode,
): ThemeAttributes => ({
  "data-palette": palette,
  "data-mode": mode,
})
