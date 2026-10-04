import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@darkfactory/ui/client/dropdown-menu";
import { AppearanceMenuItems } from "@darkfactory/ui/client/theme";
import Link from "next/link";
import type * as ReactModule from "react";
import {
  createElement,
  type EffectCallback,
  isValidElement,
  type ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppearanceSelection } from "./theme-menu.tsx";

const hookRuntime = vi.hoisted(() => {
  const stateSlots: Array<{ value: unknown }> = [];
  const effectDependencies: Array<readonly unknown[] | undefined> = [];
  const pendingEffects: EffectCallback[] = [];
  let stateCursor = 0;
  let effectCursor = 0;

  return {
    begin: (): void => {
      stateCursor = 0;
      effectCursor = 0;
      pendingEffects.length = 0;
    },
    commit: (): void => {
      for (const effect of pendingEffects.splice(0)) effect();
    },
    reset: (): void => {
      stateSlots.length = 0;
      effectDependencies.length = 0;
      pendingEffects.length = 0;
      stateCursor = 0;
      effectCursor = 0;
    },
    useEffect: (effect: EffectCallback, deps?: readonly unknown[]): void => {
      const index = effectCursor++;
      const previous = effectDependencies[index];
      if (
        previous !== undefined &&
        deps !== undefined &&
        previous.length === deps.length &&
        previous.every((value, position) => Object.is(value, deps[position]))
      )
        return;
      effectDependencies[index] = deps;
      pendingEffects.push(effect);
    },
    useState: <Value,>(
      initializer: Value | (() => Value)
    ): readonly [
      Value,
      (next: Value | ((current: Value) => Value)) => void,
    ] => {
      const index = stateCursor++;
      const slot = (stateSlots[index] ??= {
        value:
          typeof initializer === "function"
            ? (initializer as () => Value)()
            : initializer,
      });
      return [
        slot.value as Value,
        (next) => {
          slot.value =
            typeof next === "function"
              ? (next as (current: Value) => Value)(slot.value as Value)
              : next;
        },
      ];
    },
  };
});

const navigationRuntime = vi.hoisted(() => ({
  pathname: "" as string | null,
}));

const appearanceRuntime = vi.hoisted(() => ({
  current: undefined as AppearanceSelection | undefined,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return {
    ...actual,
    useEffect: hookRuntime.useEffect,
    useState: hookRuntime.useState,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => navigationRuntime.pathname,
}));

vi.mock("./theme-menu.tsx", () => ({
  useAppearanceSelection: () => {
    if (appearanceRuntime.current === undefined)
      throw new Error("Configure the appearance selection before rendering.");
    return appearanceRuntime.current;
  },
}));

import { SignOutError, SignOutMenuItem } from "./account/sign-out-action.tsx";
import {
  UserMenu,
  type UserMenuProps,
  type UserMenuSection,
  userInitials,
  userMenuSections,
} from "./user-menu.tsx";

type TreeElement = ReactElement<Record<string, unknown>>;

const elementsOf = (node: unknown): TreeElement[] => {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elementsOf(node.props["children"])];
};

const elementsOfType = (tree: unknown, type: unknown): TreeElement[] =>
  elementsOf(tree).filter((element) => element.type === type);

const onlyElement = (tree: unknown, type: unknown): TreeElement => {
  const [element, ...extra] = elementsOfType(tree, type);
  expect(extra).toHaveLength(0);
  if (element === undefined) throw new Error("Expected one matching element.");
  return element;
};

const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (!isValidElement<Record<string, unknown>>(node)) return "";
  return textOf(node.props["children"]);
};

const appearance = (
  overrides: Partial<AppearanceSelection> = {}
): AppearanceSelection => ({
  disabled: false,
  error: null,
  select: vi.fn(),
  statusMessage: null,
  triggerLabel: "Appearance settings",
  ...overrides,
});

const renderMenu = (props: UserMenuProps): TreeElement => {
  hookRuntime.begin();
  return UserMenu(props);
};

afterEach(() => {
  hookRuntime.reset();
  appearanceRuntime.current = undefined;
  navigationRuntime.pathname = "";
  return vi.unstubAllGlobals();
});

describe("user menu identity", () =>
  it("derives up to two uppercase initials and falls back for blank names", () => {
    expect(userInitials("Ada Lovelace")).toBe("AL");
    expect(userInitials("  grace   brewster murray hopper ")).toBe("GB");
    expect(userInitials("cher")).toBe("C");
    expect(userInitials("émile zola")).toBe("ÉZ");
    expect(userInitials("")).toBe("?");
    return expect(userInitials(" \t\n ")).toBe("?");
  }));

describe("user menu sections", () => {
  const hrefs = (sections: readonly UserMenuSection[]) =>
    sections.map((section) => [
      section.label,
      section.items.map((item) => item.href),
    ]);

  it("lists features and account destinations for members by default", () =>
    expect(hrefs(userMenuSections({}))).toEqual([
      ["Features", ["/feature-items"]],
      [
        "Account",
        [
          "/account/profile",
          "/account/address",
          "/account/preferences",
          "/account/security",
        ],
      ],
    ]));

  it("adds administration only for administrators", () =>
    expect(hrefs(userMenuSections({ isAdmin: true }))).toEqual([
      ["Features", ["/feature-items"]],
      [
        "Account",
        [
          "/account/profile",
          "/account/address",
          "/account/preferences",
          "/account/security",
        ],
      ],
      ["Administration", ["/admin/users"]],
    ]));

  return it("keeps only exposed routes and drops empty sections", () => {
    const availableRoutes = ["/account/security", "/dashboard"];
    expect(hrefs(userMenuSections({ availableRoutes, isAdmin: true }))).toEqual(
      [["Account", ["/account/security"]]]
    );
    expect(
      hrefs(
        userMenuSections({
          availableRoutes: ["/admin/users", "/feature-items"],
          isAdmin: false,
        })
      )
    ).toEqual([["Features", ["/feature-items"]]]);
    return expect(
      userMenuSections({ availableRoutes: [], isAdmin: true })
    ).toEqual([]);
  });
});

describe("user menu rendering", () => {
  it("renders the trigger, member destinations, appearance controls, and sign-out", () => {
    const selection = appearance({
      statusMessage: "Saving appearance settings.",
    });
    appearanceRuntime.current = selection;
    navigationRuntime.pathname = "/account/preferences";

    let tree = renderMenu({ name: "Ada Lovelace" });
    let trigger = onlyElement(tree, DropdownMenuTrigger);
    expect(trigger.props["id"]).toBe("user-menu-trigger");
    expect(trigger.props["aria-controls"]).toBeUndefined();
    expect(trigger.props["data-hydration-state"]).toBe("pending");
    expect(textOf(trigger)).toBe("ALAda Lovelace");
    expect(textOf(tree)).toContain("Saving appearance settings.");
    expect(onlyElement(tree, DropdownMenu).props["modal"]).toBe(false);

    const content = onlyElement(tree, DropdownMenuContent);
    expect(content.props).toMatchObject({
      "aria-labelledby": "user-menu-trigger",
      id: "user-menu-content",
    });
    expect(
      elementsOfType(tree, DropdownMenuGroup).map(
        (group) => group.props["aria-label"]
      )
    ).toEqual(["Features", "Account"]);
    expect(
      elementsOfType(tree, DropdownMenuLabel).map((label) => textOf(label))
    ).toEqual(["Features", "Account"]);
    expect(
      elementsOfType(tree, DropdownMenuItem).every(
        (item) => item.props["asChild"] === true
      )
    ).toBe(true);
    expect(
      elementsOfType(tree, Link).map((link) => ({
        active: link.props["aria-current"],
        className: link.props["className"],
        href: link.props["href"],
        label: textOf(link),
        prefetch: link.props["prefetch"],
      }))
    ).toEqual([
      {
        active: undefined,
        className: undefined,
        href: "/feature-items",
        label: "Feature items",
        prefetch: false,
      },
      {
        active: undefined,
        className: undefined,
        href: "/account/profile",
        label: "Profile",
        prefetch: false,
      },
      {
        active: undefined,
        className: undefined,
        href: "/account/address",
        label: "Address",
        prefetch: false,
      },
      {
        active: "page",
        className: "font-semibold",
        href: "/account/preferences",
        label: "Preferences",
        prefetch: false,
      },
      {
        active: undefined,
        className: undefined,
        href: "/account/security",
        label: "Security",
        prefetch: false,
      },
    ]);
    expect(
      elementsOf(tree).some((element) => element.props["role"] === "alert")
    ).toBe(false);
    expect(onlyElement(tree, AppearanceMenuItems).props).toEqual({
      disabled: false,
      idPrefix: "user-menu",
      onPreferenceChange: selection.select,
    });
    expect(onlyElement(tree, SignOutMenuItem).props).toMatchObject({
      isHydrated: false,
      state: { type: "idle" },
    });
    expect(onlyElement(tree, SignOutError).props).toEqual({
      state: { type: "idle" },
    });

    hookRuntime.commit();
    tree = renderMenu({ name: "Ada Lovelace" });
    trigger = onlyElement(tree, DropdownMenuTrigger);
    expect(trigger.props["aria-controls"]).toBeUndefined();
    expect(trigger.props["data-hydration-state"]).toBe("ready");
    return expect(onlyElement(tree, SignOutMenuItem).props).toMatchObject({
      isHydrated: true,
    });
  });

  it("renders administration, appearance failures, and the injected sign-out gateway", async () => {
    appearanceRuntime.current = appearance({
      disabled: true,
      error: "Could not save appearance settings. Try again.",
    });
    navigationRuntime.pathname = null;
    const signOut = vi.fn(async () => ({
      message: "Sign out could not be confirmed.",
      ok: false as const,
    }));
    const props: UserMenuProps = {
      availableRoutes: ["/account/profile", "/admin/users"],
      isAdmin: true,
      name: "Grace Hopper",
      signOutGateway: { signOut },
    };

    renderMenu(props);
    hookRuntime.commit();
    let tree = renderMenu(props);
    expect(textOf(onlyElement(tree, DropdownMenuTrigger))).toBe(
      "GHGrace Hopper"
    );
    expect(
      elementsOfType(tree, DropdownMenuGroup).map(
        (group) => group.props["aria-label"]
      )
    ).toEqual(["Account", "Administration"]);
    expect(
      elementsOfType(tree, Link).map((link) => [
        link.props["href"],
        link.props["aria-current"],
      ])
    ).toEqual([
      ["/account/profile", undefined],
      ["/admin/users", undefined],
    ]);
    const alert = elementsOf(tree).find(
      (element) => element.props["role"] === "alert"
    );
    expect(textOf(alert)).toBe(
      "Could not save appearance settings. Try again."
    );
    expect(onlyElement(tree, AppearanceMenuItems).props["disabled"]).toBe(true);

    const onSignOut = onlyElement(tree, SignOutMenuItem).props["onSignOut"];
    if (typeof onSignOut !== "function")
      throw new Error("Expected the sign-out menu action.");
    onSignOut();
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    await Promise.resolve();
    tree = renderMenu(props);
    const failure = {
      message: "Sign out could not be confirmed.",
      type: "error",
    };
    expect(onlyElement(tree, SignOutMenuItem).props["state"]).toEqual(failure);
    return expect(onlyElement(tree, SignOutError).props["state"]).toEqual(
      failure
    );
  });

  return it("renders menu destinations through the shared Next.js link boundary", () => {
    appearanceRuntime.current = appearance();
    const [link] = elementsOfType(
      renderMenu({ availableRoutes: ["/feature-items"], name: "Ada" }),
      Link
    );
    expect(link?.props["href"]).toBe("/feature-items");
    return expect(
      renderToStaticMarkup(
        createElement(
          Link,
          { className: "font-semibold", href: "/feature-items" },
          "Feature items"
        )
      )
    ).toBe('<a href="/feature-items" class="font-semibold">Feature items</a>');
  });
});
