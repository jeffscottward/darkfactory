// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./sidebar.tsx";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let mobile = false;
const listeners = new Set<() => void>();

const setViewport = (isMobile: boolean) => {
  mobile = isMobile;
  for (const listener of listeners) listener();
};

beforeEach(() => {
  mobile = false;
  listeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      get matches() {
        return mobile;
      },
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    }))
  );
});

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
};

const StateProbe = () => {
  const { state, openMobile } = useSidebar();
  return <output data-mobile-open={openMobile} data-state={state} />;
};

const Shell = ({
  collapsible,
  onOpenChange,
  open,
}: {
  collapsible?: "offcanvas" | "icon" | "none";
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) => (
  <SidebarProvider
    {...(onOpenChange === undefined ? {} : { onOpenChange })}
    {...(open === undefined ? {} : { open })}
  >
    <Sidebar
      {...(collapsible === undefined ? {} : { collapsible })}
      mobileCloseLabel="Close navigation"
      mobileTitle="Navigation"
      variant="inset"
    >
      <SidebarHeader>Brand</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Features</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive tooltip="Overview">
                  <a className="custom-link" href="/dashboard">
                    Overview
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" variant="outline">
                  Large
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
      </SidebarContent>
      <SidebarFooter>Footer</SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset id="main">
      <SidebarTrigger onClick={() => undefined} />
      <SidebarTrigger label="Plain" />
      <StateProbe />
    </SidebarInset>
  </SidebarProvider>
);

const probe = () =>
  document.querySelector("output") as HTMLOutputElement | null;

describe("Sidebar", () => {
  it("renders shadcn anatomy with 44px boxes around shadcn-sized rows", () => {
    const html = renderToStaticMarkup(<Shell collapsible="icon" />);
    expect(html).toContain('data-slot="sidebar-wrapper"');
    expect(html).toContain("--sidebar-width:16rem");
    expect(html).toContain("--sidebar-width-icon:3rem");
    expect(html).toContain('data-variant="inset"');
    expect(html).toContain('data-slot="sidebar-inset"');
    expect(html).toMatch(
      /<a class="group\/menu-button[^"]*min-h-11[^"]*custom-link" href="\/dashboard" data-active="true"/
    );
    expect(html).toContain('data-slot="sidebar-menu-button-chrome"');
    expect(html).toContain("h-8 text-sm");
    expect(html).toContain("h-12 text-sm");
    return expect(html).toContain('aria-label="Toggle Sidebar"');
  });

  it("toggles expanded and collapsed state by trigger, rail and keyboard", () => {
    render(<Shell collapsible="icon" />);
    const triggers = document.querySelectorAll<HTMLButtonElement>(
      '[data-sidebar="trigger"]'
    );
    expect(probe()?.dataset["state"]).toBe("expanded");
    act(() => triggers[0]?.click());
    expect(probe()?.dataset["state"]).toBe("collapsed");
    expect(
      document
        .querySelector('[data-slot="sidebar"]')
        ?.getAttribute("data-collapsible")
    ).toBe("icon");
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-sidebar="rail"]')
        ?.click()
    );
    expect(probe()?.dataset["state"]).toBe("expanded");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { ctrlKey: true, key: "b" })
      );
    });
    expect(probe()?.dataset["state"]).toBe("collapsed");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", metaKey: true })
      );
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
      window.dispatchEvent(
        new KeyboardEvent("keydown", { ctrlKey: true, key: "x" })
      );
    });
    return expect(probe()?.dataset["state"]).toBe("expanded");
  });

  it("delegates open state when controlled", () => {
    const onOpenChange = vi.fn();
    render(<Shell onOpenChange={onOpenChange} open={false} />);
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')
        ?.click()
    );
    expect(onOpenChange).toHaveBeenCalledWith(true);
    return expect(probe()?.dataset["state"]).toBe("collapsed");
  });

  it("opens a sheet on mobile and closes it from its close button", () => {
    render(<Shell />);
    act(() => setViewport(true));
    expect(document.querySelector('[data-mobile="true"]')).toBeNull();
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')
        ?.click()
    );
    const sheet = document.querySelector('[data-mobile="true"]');
    expect(sheet?.getAttribute("role")).toBe("dialog");
    expect(sheet?.textContent).toContain("Navigation");
    const close = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close navigation"]'
    );
    expect(close).not.toBeNull();
    act(() => close?.click());
    expect(probe()?.dataset["mobileOpen"]).toBe("false");
    return expect(probe()?.dataset["state"]).toBe("expanded");
  });

  it("renders a static sidebar without collapsing and the default sheet labels", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <Sidebar className="static" collapsible="none" side="right">
          Static
        </Sidebar>
        <Sidebar side="right" variant="floating">
          Floating
        </Sidebar>
        <Sidebar side="right">Plain</Sidebar>
      </SidebarProvider>
    );
    expect(html).toContain("static");
    expect(html).toContain("right-0");
    expect(html).toContain(
      "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
    );
    render(
      <SidebarProvider>
        <Sidebar side="right">
          <SidebarTrigger />
        </Sidebar>
        <StateProbe />
        <SidebarTrigger />
      </SidebarProvider>
    );
    act(() => setViewport(true));
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')
        ?.click()
    );
    expect(
      document.querySelector('button[aria-label="Close sidebar"]')
    ).not.toBeNull();
    return expect(document.body.textContent).toContain("Sidebar");
  });

  return it("requires a provider", () => {
    const Orphan = () => {
      useSidebar();
      return null;
    };
    return expect(() => renderToStaticMarkup(<Orphan />)).toThrow(
      "useSidebar must be used within a SidebarProvider."
    );
  });
});
