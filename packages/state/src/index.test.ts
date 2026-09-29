import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CONSENT_STATES,
  type ConsentState,
  DEFAULT_UI_PREFERENCES,
  isConsentState,
  isPalette,
  isThemeMode,
  PALETTES,
  type Palette,
  THEME_MODES,
  type ThemeMode,
} from "./index.ts";

describe("theme contracts", () => {
  it("exposes the canonical ordered persisted ten-palette contract", () => {
    expect(PALETTES).toEqual([
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
    ]);
    expect(PALETTES).toHaveLength(10);
    expect(new Set(PALETTES).size).toBe(10);
    expect(Object.isFrozen(PALETTES)).toBe(true);
    return expectTypeOf<Palette>().toEqualTypeOf<(typeof PALETTES)[number]>();
  });

  it("validates only the ten palette names", () => {
    for (const palette of PALETTES) {
      expect(isPalette(palette)).toBe(true);
    }

    const results = [];
    for (const value of [
      "studio",
      "Neutral",
      "cobalt",
      "plum",
      "ocean",
      "",
      null,
      undefined,
      10,
      {},
    ]) {
      results.push(expect(isPalette(value)).toBe(false));
    }
    return results;
  });

  it("validates only light, dark, and system theme modes", () => {
    expect(THEME_MODES).toEqual(["light", "dark", "system"]);
    expect(Object.isFrozen(THEME_MODES)).toBe(true);

    for (const mode of THEME_MODES) {
      expect(isThemeMode(mode)).toBe(true);
    }

    for (const value of ["auto", "Light", "", null, undefined, false]) {
      expect(isThemeMode(value)).toBe(false);
    }

    return expectTypeOf<ThemeMode>().toEqualTypeOf<
      (typeof THEME_MODES)[number]
    >();
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
    expect(DEFAULT_UI_PREFERENCES).toEqual({
      sidebar: "expanded",
      mobileNavigationOpen: false,
      themeMode: "system",
      palette: "neutral",
      consent: "unknown",
    });
    return expect(Object.isFrozen(DEFAULT_UI_PREFERENCES)).toBe(true);
  });
});
