// What: Canonical appearance values and schemas shared by theme and account contracts.
// Used by: packages/api/src/contract.ts; packages/api/src/contracts/account.ts.
// See: packages/db/src/schema/index.ts#APPEARANCE_THEMES; packages/state/src/index.ts#THEMES.
import { z } from "zod";

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
export const FONT_SIZES = ["small", "default", "large"] as const;
export const DENSITIES = ["compact", "default", "comfortable"] as const;
export const RADII = ["none", "small", "medium", "large"] as const;

export const ThemeNameSchema = z.enum(THEME_NAMES);
export const FontSizeSchema = z.enum(FONT_SIZES);
export const DensitySchema = z.enum(DENSITIES);
export const RadiusSchema = z.enum(RADII);

export const AppearanceFieldsSchema = z.object({
  theme: ThemeNameSchema,
  fontSize: FontSizeSchema,
  density: DensitySchema,
  radius: RadiusSchema,
});

export type ThemeName = z.infer<typeof ThemeNameSchema>;
export type FontSize = z.infer<typeof FontSizeSchema>;
export type Density = z.infer<typeof DensitySchema>;
export type Radius = z.infer<typeof RadiusSchema>;
