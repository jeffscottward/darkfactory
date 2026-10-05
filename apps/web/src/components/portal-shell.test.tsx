// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/feature-items/new" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { DEFAULT_ANONYMOUS_THEME } from "../lib/theme.ts";
import { UiStateProvider } from "../lib/ui-store.tsx";
import { PortalShell, portalPageTitle } from "./portal-shell.tsx";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let mobile = false;

beforeEach(() => {
  mobile = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      get matches() {
        return mobile;
      },
      removeEventListener: vi.fn(),
    }))
  );
});

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

const renderShell = () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <UiStateProvider initialPreference={DEFAULT_ANONYMOUS_THEME}>
        <PortalShell userName="Ada Lovelace">
          <p>Body</p>
        </PortalShell>
      </UiStateProvider>
    )
  );
};

const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe("PortalShell", () => {
  it("titles the page from the most specific navigation entry", () => {
    expect(portalPageTitle("/dashboard")).toBe("Overview");
    expect(portalPageTitle("/feature-items/abc")).toBe("Feature items");
    expect(portalPageTitle("/settings/appearance")).toBe("Appearance");
    return expect(portalPageTitle("/elsewhere")).toBe("DarkFactory");
  });

  it("collapses the desktop sidebar into icon mode through the UI store", () => {
    renderShell();
    const sidebar = () => document.querySelector('[data-slot="sidebar"]');
    expect(sidebar()?.getAttribute("data-state")).toBe("expanded");
    act(() => button("Toggle sidebar")?.click());
    expect(sidebar()?.getAttribute("data-collapsible")).toBe("icon");
    act(() => button("Toggle sidebar")?.click());
    return expect(sidebar()?.getAttribute("data-state")).toBe("expanded");
  });

  return it("renders the mobile drawer as a native popover that closes after navigation", () => {
    mobile = true;
    renderShell();
    const trigger = button("Open portal navigation");
    expect(trigger?.getAttribute("popovertarget")).toBe("portal-navigation");
    const drawer = document.getElementById("portal-navigation");
    expect(drawer?.getAttribute("popover")).toBe("auto");
    expect(drawer?.getAttribute("role")).toBe("dialog");
    expect(drawer?.textContent).toContain("Navigation");
    expect(
      drawer?.querySelector('nav[aria-label="Mobile portal navigation"]')
    ).not.toBeNull();
    expect(
      drawer
        ?.querySelector('button[aria-label="Close portal navigation"]')
        ?.getAttribute("popovertarget")
    ).toBe("portal-navigation");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const link = drawer?.querySelector<HTMLAnchorElement>(
      'a[href="/feature-items"]'
    );
    expect(link?.getAttribute("aria-current")).toBe("page");
    expect(link?.textContent).toBe("Feature items, current page");
    link?.addEventListener("click", (event) => event.preventDefault());
    const hidePopover = vi.fn();
    Object.defineProperty(drawer, "hidePopover", {
      configurable: true,
      value: hidePopover,
    });
    act(() => link?.click());
    expect(hidePopover).toHaveBeenCalledOnce();
    Object.defineProperty(drawer, "hidePopover", {
      configurable: true,
      value: undefined,
    });
    expect(() => act(() => link?.click())).not.toThrow();
    return expect(
      document
        .querySelector('[data-slot="sidebar"]')
        ?.getAttribute("data-state")
    ).toBe("expanded");
  });
});
