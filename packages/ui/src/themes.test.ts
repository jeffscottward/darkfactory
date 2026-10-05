import { describe, expect, it } from "vitest";

import { CONCRETE_THEME_NAMES, THEME_TOKENS } from "./theme-tokens.ts";
import {
  appearanceAttributes,
  DEFAULT_APPEARANCE,
  DENSITY_NAMES,
  DENSITY_OPTIONS,
  FONT_SIZE_NAMES,
  FONT_SIZE_OPTIONS,
  optionLabel,
  RADIUS_NAMES,
  RADIUS_OPTIONS,
  THEME_NAMES,
  THEME_OPTIONS,
  themeColorScheme,
} from "./themes.ts";

describe("appearance catalog", () => {
  it("keeps option lists aligned with the canonical names", () => {
    expect(THEME_OPTIONS.map(({ value }) => value)).toEqual(THEME_NAMES);
    expect(FONT_SIZE_OPTIONS.map(({ value }) => value)).toEqual(
      FONT_SIZE_NAMES
    );
    expect(DENSITY_OPTIONS.map(({ value }) => value)).toEqual(DENSITY_NAMES);
    expect(RADIUS_OPTIONS.map(({ value }) => value)).toEqual(RADIUS_NAMES);
    expect(THEME_OPTIONS.map(({ label }) => label)).toEqual([
      "System",
      ...CONCRETE_THEME_NAMES.map((name) => THEME_TOKENS[name].label),
    ]);
    return expect(DEFAULT_APPEARANCE).toEqual({
      density: "default",
      fontSize: "default",
      radius: "medium",
      theme: "system",
    });
  });

  it("labels known values and falls back to the raw value", () => {
    expect(optionLabel(THEME_OPTIONS, "synthwave-84")).toBe("Synthwave '84");
    return expect(optionLabel(RADIUS_OPTIONS, "huge" as never)).toBe("huge");
  });

  it("maps appearance to root data attributes", () =>
    expect(
      appearanceAttributes({
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      })
    ).toEqual({
      "data-density": "compact",
      "data-font-size": "large",
      "data-radius": "none",
      "data-theme": "dracula",
    }));

  return it("reports each theme color scheme", () => {
    expect(themeColorScheme("system")).toBe("system");
    expect(themeColorScheme("default-light")).toBe("light");
    expect(themeColorScheme("github-light")).toBe("light");
    for (const theme of [
      "default-dark",
      "graphite",
      "dracula",
      "monokai",
      "tokyo-night",
      "one-dark",
      "night-owl",
      "synthwave-84",
      "github-dark",
    ] as const) {
      expect(themeColorScheme(theme)).toBe("dark");
    }
    for (const theme of CONCRETE_THEME_NAMES) {
      expect(themeColorScheme(theme)).toBe(THEME_TOKENS[theme].colorScheme);
    }
    return expect(["system", ...CONCRETE_THEME_NAMES]).toEqual(THEME_NAMES);
  });
});
