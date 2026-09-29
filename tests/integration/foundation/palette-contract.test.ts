import { COLOR_SCHEMES } from "@darkfactory/db/schema";
import { DEFAULT_UI_PREFERENCES, PALETTES } from "@darkfactory/state";
import { DEFAULT_PALETTE, PALETTE_NAMES } from "@darkfactory/ui/palettes";
import { describe, expect, it } from "vitest";

const canonicalPalettes = [
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
] as const;

describe("persisted palette contract", function () {
  it("keeps database, client state, and UI identifiers identical", function () {
    expect(COLOR_SCHEMES).toEqual(canonicalPalettes);
    expect(PALETTES).toEqual(canonicalPalettes);
    return expect(PALETTE_NAMES).toEqual(canonicalPalettes);
  });

  return it("keeps neutral as the shared default", function () {
    expect(DEFAULT_UI_PREFERENCES.palette).toBe("neutral");
    return expect(DEFAULT_PALETTE).toBe("neutral");
  });
});
