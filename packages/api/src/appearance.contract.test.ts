import { describe, expect, it } from "vitest";
import {
  DENSITIES,
  FONT_SIZES,
  PreferenceFieldsSchema,
  RADII,
  THEME_NAMES,
  ThemePreferenceSchema,
  UpdateThemePreferenceSchema,
} from "./index.ts";

const appearance = {
  density: "compact",
  fontSize: "large",
  radius: "none",
  theme: "tokyo-night",
} as const;

describe("appearance preference contract", () => {
  it("publishes the canonical ordered appearance values", () => {
    expect(THEME_NAMES).toEqual([
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
    ]);
    expect(FONT_SIZES).toEqual(["small", "default", "large"]);
    expect(DENSITIES).toEqual(["compact", "default", "comfortable"]);
    return expect(RADII).toEqual(["none", "small", "medium", "large"]);
  });

  it("reads and writes the four appearance fields with a version", () => {
    expect(
      ThemePreferenceSchema.parse({ ...appearance, updatedAt: null })
    ).toEqual({ ...appearance, updatedAt: null });
    return expect(
      UpdateThemePreferenceSchema.parse({
        ...appearance,
        expectedUpdatedAt: null,
      })
    ).toEqual({ ...appearance, expectedUpdatedAt: null });
  });

  it("rejects old fields, unknown values and missing fields", () => {
    const update = { ...appearance, expectedUpdatedAt: null };
    const invalid = [
      { ...update, themeMode: "dark" },
      { ...update, palette: "violet" },
      { ...update, theme: "dark" },
      { ...update, fontSize: "huge" },
      { ...update, density: "dense" },
      { ...update, radius: "round" },
      { density: "default", fontSize: "default", radius: "small" },
    ];
    for (const input of invalid) {
      expect(() => UpdateThemePreferenceSchema.parse(input)).toThrow();
    }
    return expect(Object.keys(PreferenceFieldsSchema.shape)).toEqual(
      expect.arrayContaining(["theme", "fontSize", "density", "radius"])
    );
  });
});
