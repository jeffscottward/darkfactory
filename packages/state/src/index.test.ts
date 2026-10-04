import { describe, expect, expectTypeOf, it } from "vitest";

import {
  APPEARANCE_KEYS,
  CONSENT_STATES,
  type ConsentState,
  DEFAULT_APPEARANCE,
  DEFAULT_UI_PREFERENCES,
  DENSITIES,
  FONT_SIZES,
  isConsentState,
  isDensity,
  isFontSize,
  isRadius,
  isSameAppearance,
  isTheme,
  parseAppearancePreference,
  RADII,
  THEMES,
  type Theme,
} from "./index.ts";

describe("appearance contracts", () => {
  it("exposes the canonical ordered theme list", () => {
    expect(THEMES).toEqual([
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
    expect(Object.isFrozen(THEMES)).toBe(true);
    return expectTypeOf<Theme>().toEqualTypeOf<(typeof THEMES)[number]>();
  });

  it("exposes font size, density, and roundness scales", () => {
    expect(FONT_SIZES).toEqual(["small", "default", "large"]);
    expect(DENSITIES).toEqual(["compact", "default", "comfortable"]);
    expect(RADII).toEqual(["none", "small", "medium", "large"]);
    expect(APPEARANCE_KEYS).toEqual(["theme", "fontSize", "density", "radius"]);
    for (const list of [FONT_SIZES, DENSITIES, RADII, APPEARANCE_KEYS]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });

  it("validates only canonical values", () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
    for (const size of FONT_SIZES) expect(isFontSize(size)).toBe(true);
    for (const density of DENSITIES) expect(isDensity(density)).toBe(true);
    for (const radius of RADII) expect(isRadius(radius)).toBe(true);

    for (const value of [
      "neutral",
      "dark",
      "Nord",
      "",
      null,
      undefined,
      1,
      {},
    ]) {
      expect(isTheme(value)).toBe(false);
      expect(isFontSize(value)).toBe(false);
      expect(isDensity(value)).toBe(false);
      expect(isRadius(value)).toBe(false);
    }
  });

  it("parses an appearance record and drops unknown fields", () => {
    expect(
      parseAppearancePreference({
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "nord",
        updatedAt: null,
      })
    ).toEqual({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "nord",
    });
    for (const value of [
      null,
      "nord",
      { ...DEFAULT_APPEARANCE, theme: "neutral" },
      { ...DEFAULT_APPEARANCE, fontSize: "huge" },
      { ...DEFAULT_APPEARANCE, density: "airy" },
      { ...DEFAULT_APPEARANCE, radius: "round" },
      { palette: "blue", themeMode: "dark" },
    ]) {
      expect(parseAppearancePreference(value)).toBeNull();
    }
  });

  it("compares appearance records field by field", () => {
    expect(
      isSameAppearance(DEFAULT_APPEARANCE, { ...DEFAULT_APPEARANCE })
    ).toBe(true);
    for (const key of APPEARANCE_KEYS) {
      const changed = { ...DEFAULT_APPEARANCE, [key]: "changed" };
      expect(isSameAppearance(DEFAULT_APPEARANCE, changed as never)).toBe(
        false
      );
    }
  });

  it("validates only granted, denied, and unknown consent states", () => {
    expect(CONSENT_STATES).toEqual(["granted", "denied", "unknown"]);
    expect(Object.isFrozen(CONSENT_STATES)).toBe(true);

    for (const consent of CONSENT_STATES) {
      expect(isConsentState(consent)).toBe(true);
    }

    for (const value of ["pending", "Granted", "", null, undefined, true]) {
      expect(isConsentState(value)).toBe(false);
    }

    return expectTypeOf<ConsentState>().toEqualTypeOf<
      (typeof CONSENT_STATES)[number]
    >();
  });

  return it("uses safe deterministic defaults", () => {
    expect(DEFAULT_APPEARANCE).toEqual({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
    expect(DEFAULT_UI_PREFERENCES).toEqual({
      consent: "unknown",
      density: "default",
      fontSize: "default",
      mobileNavigationOpen: false,
      radius: "small",
      sidebar: "expanded",
      theme: "system",
    });
    expect(Object.isFrozen(DEFAULT_APPEARANCE)).toBe(true);
    return expect(Object.isFrozen(DEFAULT_UI_PREFERENCES)).toBe(true);
  });
});
