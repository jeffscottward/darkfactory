import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "../themes.ts";

import {
  APPEARANCE_SETTINGS,
  ThemePicker,
  type ThemePreference,
  ThemeProvider,
  useTheme,
} from "./theme.ts";

const ThemeProbe = () => {
  const { preference } = useTheme();
  return (
    <output data-radius={preference.radius} data-theme={preference.theme}>
      {preference.theme}:{preference.fontSize}:{preference.density}:
      {preference.radius}
    </output>
  );
};

describe("semantic theme components", () => {
  it("provides the controlled semantic theme contract to descendants", () => {
    const preference = {
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    } as const;
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(ThemeProbe),
        onPreferenceChange: vi.fn(),
        preference,
      })
    );

    expect(markup).toContain('data-theme="dracula"');
    expect(markup).toContain('data-radius="none"');
    return expect(markup).toContain("dracula:large:compact:");
  });

  it("delegates preference changes without owning persistence policy", () => {
    const onPreferenceChange = vi.fn();
    let selectPreference: ((preference: ThemePreference) => void) | undefined;
    const SelectionProbe = () => {
      selectPreference = useTheme().onPreferenceChange;
      return null;
    };
    renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(SelectionProbe),
        onPreferenceChange,
        preference: DEFAULT_APPEARANCE,
      })
    );

    selectPreference?.({ ...DEFAULT_APPEARANCE, theme: "night-owl" });

    expect(onPreferenceChange).toHaveBeenCalledOnce();
    return expect(onPreferenceChange).toHaveBeenCalledWith({
      ...DEFAULT_APPEARANCE,
      theme: "night-owl",
    });
  });

  it("requires provider composition", () =>
    expect(() => renderToStaticMarkup(createElement(ThemeProbe))).toThrow(
      "ThemeProvider is required."
    ));

  it("exposes the four appearance settings with their canonical options", () => {
    expect(APPEARANCE_SETTINGS.map(({ key, label }) => [key, label])).toEqual([
      ["theme", "Theme"],
      ["fontSize", "Font size"],
      ["density", "Density"],
      ["radius", "Roundness"],
    ]);
    return expect(
      APPEARANCE_SETTINGS.map(({ options }) => options.length)
    ).toEqual([12, 3, 3, 4]);
  });

  it("keeps the picker trigger discoverable when selections are disabled", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(ThemePicker, {
          disabled: true,
          idPrefix: "disabled-theme",
          triggerLabel: "Theme settings unavailable",
        }),
        onPreferenceChange: vi.fn(),
        preference: DEFAULT_APPEARANCE,
      })
    );

    expect(markup).toContain('aria-label="Theme settings unavailable"');
    return expect(markup).not.toMatch(/<button[^>]*\sdisabled(?:=| |>)/u);
  });
  it("uses unique caller-owned trigger identifiers without closed ARIA references", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(
          "div",
          {},
          createElement(ThemePicker, { idPrefix: "application-theme" }),
          createElement(ThemePicker, { idPrefix: "secondary-theme" })
        ),
        onPreferenceChange: vi.fn(),
        preference: DEFAULT_APPEARANCE,
      })
    );

    expect(markup.match(/id="application-theme-trigger"/g)).toHaveLength(1);
    expect(markup.match(/id="secondary-theme-trigger"/g)).toHaveLength(1);
    expect(markup).not.toContain('aria-controls="application-theme-content"');
    return expect(markup).not.toContain(
      'aria-controls="secondary-theme-content"'
    );
  });

  return it("keeps async status and errors mounted while the menu is closed", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(ThemePicker, {
          error: "Could not save theme settings.",
          idPrefix: "status-theme",
          statusMessage: "Saving theme settings.",
        }),
        onPreferenceChange: vi.fn(),
        preference: { ...DEFAULT_APPEARANCE, theme: "night-owl" },
      })
    );

    expect(markup).toContain("Saving theme settings.");
    expect(markup).toContain("Could not save theme settings.");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="alert"');
    return expect(markup.match(/class="sr-only"/g)).toHaveLength(2);
  });
});
