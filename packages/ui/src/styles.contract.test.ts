import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { renderThemeCss } from "./theme-tokens.ts";

const stylesheetUrl = new URL("./styles.css", import.meta.url);
const themesUrl = new URL("./themes.css", import.meta.url);

describe("CSS theme contract", () => {
  it("imports the generated theme stylesheet", async () => {
    const css = await readFile(stylesheetUrl, "utf8");

    return expect(css).toMatch(/^@import "\.\/themes\.css";$/m);
  });

  it("keeps themes.css equal to renderThemeCss()", async () => {
    const css = await readFile(themesUrl, "utf8");

    return expect(
      css,
      'themes.css is stale. Regenerate it: mise exec -- bun -e \'import { renderThemeCss } from "./packages/ui/src/theme-tokens.ts"; await Bun.write("packages/ui/src/themes.css", renderThemeCss());\''
    ).toBe(renderThemeCss());
  });

  it("drops the old mode and palette selectors", async () => {
    const css = await readFile(stylesheetUrl, "utf8");

    expect(css).not.toMatch(/data-mode|data-palette|\.palette-|--palette-/);
    return expect(css).not.toMatch(/^\s*--background: #/m);
  });
});
