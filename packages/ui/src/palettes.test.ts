import { describe, expect, it } from "vitest";

import {
  DEFAULT_PALETTE,
  PALETTE_NAMES,
  THEME_MODES,
  themeAttributes,
} from "./palettes.ts";

const expectedPalettes = [
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
];

describe("palette catalog", function () {
  it("keeps exactly the shared ordered ten-palette contract", function () {
    expect(PALETTE_NAMES).toEqual(expectedPalettes);
    expect(PALETTE_NAMES).toHaveLength(10);
    expect(new Set(PALETTE_NAMES).size).toBe(10);
    return expect(DEFAULT_PALETTE).toBe("neutral");
  });

  return it("keeps light, dark, and system as independent mode attributes", function () {
    expect(THEME_MODES).toEqual(["light", "dark", "system"]);
    expect(themeAttributes("neutral", "system")).toEqual({
      "data-palette": "neutral",
      "data-mode": "system",
    });
    return expect(themeAttributes("cyan", "dark")).toEqual({
      "data-palette": "cyan",
      "data-mode": "dark",
    });
  });
});
