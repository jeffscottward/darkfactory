import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@darkfactory/ui/client/dropdown-menu";
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

import { SignOutError, SignOutMenuItem } from "./account/sign-out-action.tsx";
import { UserMenu, type UserMenuProps, userInitials } from "./user-menu.tsx";

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

const renderMenu = (props: UserMenuProps): TreeElement => {
  hookRuntime.begin();
  return UserMenu(props);
};

afterEach(() => {
  hookRuntime.reset();
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

const menuLinks = (tree: unknown) =>
  elementsOfType(tree, Link).map((link) => ({
    active: link.props["aria-current"],
    className: link.props["className"],
    href: link.props["href"],
    label: textOf(link),
    prefetch: link.props["prefetch"],
  }));

describe("user menu rendering", () => {
  it("renders the trigger and exactly two items: Settings and Sign out", () => {
    navigationRuntime.pathname = "/dashboard";

    let tree = renderMenu({ name: "Ada Lovelace" });
    let trigger = onlyElement(tree, DropdownMenuTrigger);
    expect(trigger.props["id"]).toBe("user-menu-trigger");
    expect(trigger.props["aria-controls"]).toBeUndefined();
    expect(trigger.props["data-hydration-state"]).toBe("pending");
    expect(textOf(trigger)).toBe("ALAda Lovelace");
    expect(onlyElement(tree, DropdownMenu).props["modal"]).toBe(false);

    const content = onlyElement(tree, DropdownMenuContent);
    expect(content.props).toMatchObject({
      "aria-labelledby": "user-menu-trigger",
      id: "user-menu-content",
    });
    expect(onlyElement(tree, DropdownMenuItem).props["asChild"]).toBe(true);
    expect(elementsOfType(tree, DropdownMenuSeparator)).toHaveLength(1);
    expect(menuLinks(tree)).toEqual([
      {
        active: undefined,
        className: undefined,
        href: "/settings",
        label: "Settings",
        prefetch: false,
      },
    ]);
    expect(textOf(content)).not.toMatch(/Appearance|Dashboard|Feature items/u);
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

  it("marks Settings as the current page anywhere under /settings", () => {
    for (const pathname of ["/settings", "/settings/appearance"]) {
      navigationRuntime.pathname = pathname;
      hookRuntime.reset();
      expect(menuLinks(renderMenu({ name: "Ada" }))).toEqual([
        {
          active: "page",
          className: "font-semibold",
          href: "/settings",
          label: "Settings",
          prefetch: false,
        },
      ]);
    }
    navigationRuntime.pathname = "/settings-archive";
    hookRuntime.reset();
    return expect(
      menuLinks(renderMenu({ name: "Ada" }))[0]?.active
    ).toBeUndefined();
  });

  it("drops Settings when the route is not exposed and keeps sign-out failures visible", async () => {
    navigationRuntime.pathname = null;
    const signOut = vi.fn(async () => ({
      message: "Sign out could not be confirmed.",
      ok: false as const,
    }));
    const props: UserMenuProps = {
      availableRoutes: ["/dashboard"],
      name: "Grace Hopper",
      signOutGateway: { signOut },
    };

    renderMenu(props);
    hookRuntime.commit();
    let tree = renderMenu(props);
    expect(textOf(onlyElement(tree, DropdownMenuTrigger))).toBe(
      "GHGrace Hopper"
    );
    expect(elementsOfType(tree, Link)).toEqual([]);
    expect(elementsOfType(tree, DropdownMenuItem)).toEqual([]);
    expect(elementsOfType(tree, DropdownMenuSeparator)).toEqual([]);

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

  return it("renders the Settings destination through the shared Next.js link boundary", () => {
    const [link] = elementsOfType(renderMenu({ name: "Ada" }), Link);
    expect(link?.props["href"]).toBe("/settings");
    return expect(
      renderToStaticMarkup(
        createElement(
          Link,
          { className: "font-semibold", href: "/settings" },
          "Settings"
        )
      )
    ).toBe('<a href="/settings" class="font-semibold">Settings</a>');
  });
});
