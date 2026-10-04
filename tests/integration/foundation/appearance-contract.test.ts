import { DENSITIES, FONT_SIZES, RADII, THEME_NAMES } from "@darkfactory/api";
import {
  APPEARANCE_THEMES,
  DENSITIES as DB_DENSITIES,
  FONT_SIZES as DB_FONT_SIZES,
  RADII as DB_RADII,
} from "@darkfactory/db/schema";
import {
  DEFAULT_APPEARANCE,
  DENSITIES as STATE_DENSITIES,
  FONT_SIZES as STATE_FONT_SIZES,
  RADII as STATE_RADII,
  THEMES,
} from "@darkfactory/state";
import {
  DENSITY_NAMES,
  FONT_SIZE_NAMES,
  RADIUS_NAMES,
  DEFAULT_APPEARANCE as UI_DEFAULT_APPEARANCE,
  THEME_NAMES as UI_THEME_NAMES,
} from "@darkfactory/ui/themes";
import { describe, expect, it } from "vitest";

const canonical = {
  theme: [
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
  ],
  fontSize: ["small", "default", "large"],
  density: ["compact", "default", "comfortable"],
  radius: ["none", "small", "medium", "large"],
} as const;

const defaults = {
  theme: "system",
  fontSize: "default",
  density: "default",
  radius: "small",
} as const;

describe("persisted appearance contract", () => {
  it("keeps database, API, client state, and UI values identical", () => {
    for (const themes of [
      APPEARANCE_THEMES,
      THEME_NAMES,
      THEMES,
      UI_THEME_NAMES,
    ])
      expect(themes).toEqual(canonical.theme);
    for (const sizes of [
      DB_FONT_SIZES,
      FONT_SIZES,
      STATE_FONT_SIZES,
      FONT_SIZE_NAMES,
    ])
      expect(sizes).toEqual(canonical.fontSize);
    for (const densities of [
      DB_DENSITIES,
      DENSITIES,
      STATE_DENSITIES,
      DENSITY_NAMES,
    ])
      expect(densities).toEqual(canonical.density);
    for (const radii of [DB_RADII, RADII, STATE_RADII, RADIUS_NAMES])
      expect(radii).toEqual(canonical.radius);
  });

  return it("keeps System with default size, density, and small radius as the shared default", () => {
    expect(DEFAULT_APPEARANCE).toEqual(defaults);
    return expect(UI_DEFAULT_APPEARANCE).toEqual(defaults);
  });
});
