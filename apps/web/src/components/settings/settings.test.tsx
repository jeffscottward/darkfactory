import type * as ThemeModule from "@darkfactory/ui/client/theme";
import { APPEARANCE_SETTINGS } from "@darkfactory/ui/client/theme";
import Link from "next/link";
import { isValidElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MEMBER_PORTAL_ROUTE_PATHS,
  SETTINGS_NAVIGATION,
} from "../../lib/navigation.ts";
import type { AppearanceSelection } from "../theme-menu.tsx";

const runtime = vi.hoisted(() => ({
  pathname: "" as string | null,
  preference: {
    density: "default",
    fontSize: "default",
    radius: "small",
    theme: "system",
  } as Record<string, string>,
  selection: undefined as AppearanceSelection | undefined,
  // useState stub: AppearanceSettings is called as a plain function in these tests.
  chosen: null as Record<string, string> | null,
  setChosen: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => [runtime.chosen, runtime.setChosen],
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => runtime.pathname,
}));

vi.mock("@darkfactory/ui/client/theme", async (importOriginal) => {
  const actual = await importOriginal<typeof ThemeModule>();
  return {
    ...actual,
    useTheme: () => ({
      onPreferenceChange: vi.fn(),
      preference: runtime.preference,
    }),
  };
});

vi.mock("../theme-menu.tsx", () => ({
  useAppearanceSelection: () => {
    if (runtime.selection === undefined)
      throw new Error("Configure the appearance selection before rendering.");
    return runtime.selection;
  },
}));

import { AppearanceSettings } from "./appearance-settings.tsx";
import { SettingsNavigation } from "./settings-navigation.tsx";

type TreeElement = ReactElement<Record<string, unknown>>;

const elementsOf = (node: unknown): TreeElement[] => {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elementsOf(node.props["children"])];
};

const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (!isValidElement<Record<string, unknown>>(node)) return "";
  return textOf(node.props["children"]);
};

const links = (tree: unknown) =>
  elementsOf(tree)
    .filter((element) => element.type === Link)
    .map((link) => ({
      active: link.props["aria-current"],
      href: link.props["href"],
      label: textOf(link),
      prefetch: link.props["prefetch"],
    }));

const selection = (
  overrides: Partial<AppearanceSelection> = {}
): AppearanceSelection => ({
  disabled: false,
  error: null,
  select: vi.fn(),
  statusMessage: null,
  triggerLabel: "Appearance settings",
  ...overrides,
});

afterEach(() => {
  runtime.pathname = "";
  runtime.selection = undefined;
  runtime.preference = {
    density: "default",
    fontSize: "default",
    radius: "small",
    theme: "system",
  };
});

describe("settings navigation", () => {
  it("renders linkable tabs and hides Administration from members", () => {
    runtime.pathname = "/settings/account/security";
    const tree = SettingsNavigation({
      availableRoutes: MEMBER_PORTAL_ROUTE_PATHS,
      menu: "settings",
    });
    expect(tree?.type).toBe("nav");
    expect(tree?.props["aria-label"]).toBe("Settings");
    expect(links(tree)).toEqual([
      {
        active: "page",
        href: "/settings/account",
        label: "Account",
        prefetch: false,
      },
      {
        active: undefined,
        href: "/settings/appearance",
        label: "Appearance",
        prefetch: false,
      },
    ]);
    const [active, inactive] = elementsOf(tree).filter(
      (element) => element.type === Link
    );
    expect(active?.props["className"]).toContain("bg-background");
    expect(inactive?.props["className"]).toContain("hover:text-foreground");
    return expect(inactive?.props["className"]).toContain("min-h-11");
  });

  it("shows every tab by default and lists account sections with an explicit path", () => {
    runtime.pathname = null;
    expect(links(SettingsNavigation({ menu: "settings" }))).toEqual(
      SETTINGS_NAVIGATION.map((item) => ({
        active: undefined,
        href: item.href,
        label: item.label,
        prefetch: false,
      }))
    );

    const sections = SettingsNavigation({
      currentPath: "/settings/account/address",
      menu: "account",
    });
    expect(sections?.props["aria-label"]).toBe("Account sections");
    expect(links(sections).map((link) => [link.href, link.active])).toEqual([
      ["/settings/account/profile", undefined],
      ["/settings/account/address", "page"],
      ["/settings/account/preferences", undefined],
      ["/settings/account/security", undefined],
    ]);
    const [inactive, active] = elementsOf(sections).filter(
      (element) => element.type === Link
    );
    expect(active?.props["className"]).toContain("bg-accent");
    return expect(inactive?.props["className"]).toContain(
      "text-muted-foreground"
    );
  });

  return it("renders nothing when no destination is exposed", () =>
    expect(
      SettingsNavigation({ availableRoutes: [], menu: "settings" })
    ).toBeNull());
});

const FIRST_THEME =
  APPEARANCE_SETTINGS.find((setting) => setting.key === "theme")?.options[0]
    ?.value ?? "missing";

const radios = (tree: unknown) =>
  elementsOf(tree).filter(
    (element) => element.type === "input" && element.props["type"] === "radio"
  );

describe("appearance settings form", () => {
  it("renders one labelled radio group per appearance setting with the current values checked", () => {
    const current = selection();
    runtime.selection = current;
    runtime.preference = {
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: FIRST_THEME,
    };
    const tree = AppearanceSettings();
    const fieldsets = elementsOf(tree).filter(
      (element) => element.type === "fieldset"
    );
    expect(
      fieldsets.map((fieldset) =>
        textOf(
          elementsOf(fieldset).find((element) => element.type === "legend")
        )
      )
    ).toEqual(APPEARANCE_SETTINGS.map((setting) => setting.label));
    expect(
      fieldsets.every((fieldset) => fieldset.props["disabled"] === false)
    ).toBe(true);

    const inputs = radios(tree);
    expect(inputs).toHaveLength(
      APPEARANCE_SETTINGS.reduce(
        (total, setting) => total + setting.options.length,
        0
      )
    );
    expect(
      inputs
        .filter((input) => input.props["checked"] === true)
        .map((input) => input.props["id"])
    ).toEqual([
      `appearance-theme-${FIRST_THEME}`,
      "appearance-fontSize-large",
      "appearance-density-compact",
      "appearance-radius-none",
    ]);
    const labels = elementsOf(tree).filter(
      (element) => element.type === "label"
    );
    expect(labels.map((label) => label.props["htmlFor"])).toEqual(
      inputs.map((input) => input.props["id"])
    );
    expect(
      elementsOf(tree).filter(
        (element) => element.props["data-theme-swatch"] !== undefined
      )
    ).toHaveLength(APPEARANCE_SETTINGS[0]?.options.length ?? -1);
    expect(
      elementsOf(tree).some((element) => element.props["role"] === "alert")
    ).toBe(false);

    const largeRadius = inputs.find(
      (input) => input.props["id"] === "appearance-radius-large"
    );
    const onChange = largeRadius?.props["onChange"];
    if (typeof onChange !== "function")
      throw new Error("Expected the radio change handler.");
    onChange();
    const chosen = {
      density: "compact",
      fontSize: "large",
      radius: "large",
      theme: FIRST_THEME,
    };
    expect(runtime.setChosen).toHaveBeenCalledWith(chosen);
    return expect(current.select).toHaveBeenCalledWith(chosen);
  });

  return it("disables every group while saving and shows status and errors", () => {
    runtime.selection = selection({
      disabled: true,
      error: "Could not save appearance settings. Try again.",
      statusMessage: "Saving appearance settings.",
    });
    runtime.chosen = { ...runtime.preference, radius: "large" };
    const tree = AppearanceSettings();
    runtime.chosen = null;
    // While the save is in flight the chosen option shows as checked.
    expect(
      radios(tree).find(
        (input) => input.props["id"] === "appearance-radius-large"
      )?.props["checked"]
    ).toBe(true);
    expect(
      elementsOf(tree)
        .filter((element) => element.type === "fieldset")
        .every((fieldset) => fieldset.props["disabled"] === true)
    ).toBe(true);
    const live = elementsOf(tree).find(
      (element) => element.props["aria-live"] === "polite"
    );
    expect(textOf(live)).toBe("Saving appearance settings.");
    const alert = elementsOf(tree).find(
      (element) => element.props["role"] === "alert"
    );
    return expect(textOf(alert)).toBe(
      "Could not save appearance settings. Try again."
    );
  });
});
