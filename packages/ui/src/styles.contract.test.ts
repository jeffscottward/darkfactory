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

  it("defines the motion tokens and keeps new motion behind the user's motion preference", async () => {
    const css = await readFile(stylesheetUrl, "utf8");

    for (const token of [
      "--duration-exit-fast: calc(var(--duration-fast) * 0.8);",
      "--duration-exit-base: calc(var(--duration-base) * 0.8);",
      "--duration-exit-slow: calc(var(--duration-slow) * 0.8);",
      "--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);",
      "--stagger-step: 30ms;",
      "--press-scale: 0.97;",
    ]) {
      expect(css).toContain(token);
    }
    for (const name of [
      "fast",
      "base",
      "slow",
      "exit-fast",
      "exit-base",
      "exit-slow",
    ]) {
      expect(css).toMatch(
        new RegExp(
          `@utility duration-${name} \\{\\s*--tw-duration: var\\(--duration-${name}\\);\\s*transition-duration: var\\(--duration-${name}\\);`
        )
      );
    }
    for (const utility of ["stagger-children", "animate-success-pulse"]) {
      expect(css).toMatch(
        new RegExp(
          `@utility ${utility} \\{\\s*@media \\(prefers-reduced-motion: no-preference\\)`
        )
      );
    }
    // icon-swap uses transitions, which the global reduced-motion rule cuts to 0.01ms.
    expect(css).toMatch(
      /@utility icon-swap \{[^@]*transition-property: opacity, scale, filter;/
    );
    return expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*animation-duration: 0\.01ms !important;[^}]*transition-duration: 0\.01ms !important;/
    );
  });
});
