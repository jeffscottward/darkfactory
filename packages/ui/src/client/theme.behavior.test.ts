import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ThemePreference = Readonly<{
  theme: string;
  fontSize: string;
  density: string;
  radius: string;
}>;
type PreferenceChange = (preference: ThemePreference) => void;
type PreferenceChangeMock = ReturnType<typeof vi.fn<PreferenceChange>>;

const themeRuntime = vi.hoisted(() => {
  let open = false;
  const defaults: ThemePreference = {
    density: "default",
    fontSize: "default",
    radius: "small",
    theme: "system",
  };
  let preference: ThemePreference = defaults;
  let onPreferenceChange: PreferenceChangeMock = vi.fn<PreferenceChange>();
  const setOpen = vi.fn(
    (next: unknown) =>
      (open =
        typeof next === "function"
          ? Boolean((next as (current: boolean) => boolean)(open))
          : Boolean(next))
  );
  const configure = (
    nextPreference: ThemePreference,
    nextOnPreferenceChange: PreferenceChangeMock
  ): void => {
    preference = { ...nextPreference };
    onPreferenceChange = nextOnPreferenceChange;
  };
  const reset = (): void => {
    open = false;
    preference = defaults;
    onPreferenceChange = vi.fn<PreferenceChange>();
    setOpen.mockClear();
  };
  const useContext = () => ({ onPreferenceChange, preference });
  const useState = <Value>(
    _initial: Value | (() => Value)
  ): readonly [Value, (next: Value | ((current: Value) => Value)) => void] => [
    open as Value,
    setOpen as (next: Value | ((current: Value) => Value)) => void,
  ];

  return {
    configure,
    get open(): boolean {
      return open;
    },
    reset,
    setOpen,
    useContext,
    useState,
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useContext: themeRuntime.useContext,
    useState: themeRuntime.useState,
  };
});

import { AppearanceMenuItems, ThemePicker } from "./theme.ts";

type ElementRecord = ReactElement<Record<string, unknown>>;

const elementsIn = (root: unknown): ElementRecord[] => {
  const elements: ElementRecord[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child);
      }
      return;
    }
    if (!isValidElement(value)) {
      return;
    }

    const element = value as ElementRecord;
    elements.push(element);
    visit(element.props["children"]);
  };
  visit(root);
  return elements;
};

const requiredElement = (
  root: unknown,
  predicate: (element: ElementRecord) => boolean
): ElementRecord => {
  const element = elementsIn(root).find(predicate);
  if (element === undefined) {
    throw new Error("Expected theme element was not found");
  }
  return element;
};

const textOf = (root: unknown): string => {
  if (root === null || root === undefined || typeof root === "boolean")
    return "";
  if (typeof root === "string" || typeof root === "number") return String(root);
  if (Array.isArray(root)) return root.map(textOf).join("");
  if (!isValidElement(root)) return "";
  return textOf((root as ElementRecord).props["children"]);
};

const invokeValueChange = (element: ElementRecord, value: string): void => {
  const callback = element.props["onValueChange"];
  if (typeof callback !== "function") {
    throw new Error("Expected onValueChange callback");
  }
  (callback as (next: string) => void)(value);
};

beforeEach(() => themeRuntime.reset());

const groupFor = (tree: unknown, label: string): ElementRecord =>
  requiredElement(tree, (element) => element.props["aria-label"] === label);

const defaults = {
  density: "default",
  fontSize: "default",
  radius: "small",
  theme: "system",
} as const;

describe("AppearanceMenuItems behavior", () => {
  it("selects only canonical values for each setting through the provider callback", () => {
    const onPreferenceChange = vi.fn<PreferenceChange>();
    themeRuntime.configure(
      { ...defaults, theme: "night-owl" },
      onPreferenceChange
    );
    const tree = AppearanceMenuItems({ idPrefix: "menu" });

    invokeValueChange(groupFor(tree, "Theme"), "github-dark");
    invokeValueChange(groupFor(tree, "Font size"), "large");
    invokeValueChange(groupFor(tree, "Density"), "compact");
    invokeValueChange(groupFor(tree, "Roundness"), "none");
    for (const label of ["Theme", "Font size", "Density", "Roundness"]) {
      invokeValueChange(groupFor(tree, label), "invalid");
    }

    expect(onPreferenceChange.mock.calls).toEqual([
      [{ ...defaults, theme: "github-dark" }],
      [{ ...defaults, fontSize: "large", theme: "night-owl" }],
      [{ ...defaults, density: "compact", theme: "night-owl" }],
      [{ ...defaults, radius: "none", theme: "night-owl" }],
    ]);
    const optionValues = elementsIn(tree)
      .filter((element) => "disabled" in element.props)
      .map((element) => element.props["value"])
      .filter((value): value is string => typeof value === "string");
    expect(optionValues).toEqual([
      "system",
      "default-light",
      "default-dark",
      "graphite",
      "dracula",
      "monokai",
      "tokyo-night",
      "one-dark",
      "night-owl",
      "synthwave-84",
      "github-dark",
      "github-light",
      "small",
      "default",
      "large",
      "compact",
      "default",
      "comfortable",
      "none",
      "small",
      "medium",
      "large",
    ]);
    const text = textOf(tree);
    expect(text).toContain("ThemeNight Owl");
    expect(text).toContain("Font sizeDefault");
    expect(text).toContain("RoundnessSmall");
    const swatches = elementsIn(tree).filter(
      (element) => element.props["className"] === "theme-swatch"
    );
    expect(swatches).toHaveLength(12);
    return expect(swatches[8]?.props["data-theme-swatch"]).toBe("night-owl");
  });

  return it("honors an override and blocks disabled selection", () => {
    const providerChange = vi.fn<PreferenceChange>();
    const overrideChange = vi.fn<PreferenceChange>();
    themeRuntime.configure(defaults, providerChange);
    const enabled = AppearanceMenuItems({
      idPrefix: "override",
      onPreferenceChange: overrideChange,
    });
    invokeValueChange(groupFor(enabled, "Density"), "comfortable");
    expect(providerChange).not.toHaveBeenCalled();
    expect(overrideChange.mock.calls).toEqual([
      [{ ...defaults, density: "comfortable" }],
    ]);

    const disabled = AppearanceMenuItems({
      disabled: true,
      idPrefix: "disabled",
      onPreferenceChange: overrideChange,
    });
    invokeValueChange(groupFor(disabled, "Theme"), "night-owl");
    return expect(overrideChange).toHaveBeenCalledOnce();
  });
});

describe("ThemePicker behavior", () => {
  it("renders a non-modal menu whose trigger omits aria-controls", () => {
    themeRuntime.configure(defaults, vi.fn<PreferenceChange>());
    const tree = ThemePicker({ idPrefix: "open-theme" });
    expect((tree as ElementRecord).props["modal"]).toBe(false);
    const trigger = requiredElement(
      tree,
      (element) => element.props["id"] === "open-theme-trigger"
    );
    expect(trigger.props).toHaveProperty("aria-controls", undefined);
    return expect(
      requiredElement(
        tree,
        (element) => element.props["id"] === "open-theme-content"
      ).props["aria-labelledby"]
    ).toBe("open-theme-trigger");
  });

  return it("forwards selection props and renders status and error branches", () => {
    const overrideChange = vi.fn<PreferenceChange>();
    themeRuntime.configure(defaults, vi.fn<PreferenceChange>());
    const enabled = ThemePicker({
      disabled: true,
      error: "Could not save appearance settings.",
      idPrefix: "status-theme",
      onPreferenceChange: overrideChange,
      statusMessage: "Saving appearance settings.",
    });
    const items = requiredElement(
      enabled,
      (element) => element.type === AppearanceMenuItems
    );
    expect(items.props).toEqual({
      disabled: true,
      idPrefix: "status-theme",
      onPreferenceChange: overrideChange,
    });
    expect(textOf(enabled)).toContain("Saving appearance settings.");
    expect(textOf(enabled).match(/Could not save/g)).toHaveLength(2);

    const quiet = ThemePicker({ error: null, idPrefix: "quiet-theme" });
    return expect(textOf(quiet)).not.toContain("Could not save");
  });
});
