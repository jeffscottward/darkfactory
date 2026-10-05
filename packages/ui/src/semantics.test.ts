import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Avatar } from "./avatar.tsx";
import { Badge } from "./badge.tsx";
import { Button } from "./button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card.tsx";
import { DialogBody, DialogContent, DialogFooter } from "./client/dialog.ts";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "./client/dropdown-menu.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./client/tabs.ts";
import { Toaster } from "./client/toaster.ts";
import { EmptyState } from "./empty-state.tsx";
import { PageHeader, SectionHeader } from "./headings.tsx";
import { IconButton } from "./icon-button.tsx";
import { Input } from "./input.tsx";
import { Label } from "./label.tsx";
import { Separator } from "./separator.tsx";
import { Skeleton, SkeletonGroup } from "./skeleton.tsx";
import { StatCard } from "./stat-card.tsx";
import { StatusBadge } from "./status-badge.tsx";
import { Textarea } from "./textarea.tsx";

const markup = (
  component: Parameters<typeof renderToStaticMarkup>[0]
): string => {
  return renderToStaticMarkup(component);
};

const elementProps = (element: ReactElement): Record<string, unknown> => {
  return (element as ReactElement<Record<string, unknown>>).props;
};

describe("semantic server-safe primitives", () => {
  it("renders safe button defaults, stable loading states, and accessible icon labels", () => {
    const button = markup(
      createElement(Button, { disabled: true }, "Save changes")
    );
    const loadingButton = markup(
      createElement(
        Button,
        { loading: true, loadingLabel: "Saving changes" },
        "Save changes"
      )
    );
    const iconButton = markup(
      createElement(
        IconButton,
        { "aria-label": "Open navigation", loading: true },
        "menu"
      )
    );

    expect(button).toContain('type="button"');
    expect(button).toContain("disabled");
    expect(button).toContain("Save changes");
    expect(loadingButton).toContain('aria-busy="true"');
    expect(loadingButton).toContain("Saving changes");
    expect(loadingButton).toContain("invisible");
    expect(iconButton).toContain('aria-label="Loading: Open navigation"');
    expect(iconButton).toContain('aria-busy="true"');
    return expect(iconButton).toContain('type="button"');
  });

  it("preserves form relationships and invalid state", () => {
    const input = markup(
      createElement(Input, {
        "aria-describedby": "email-error",
        id: "email",
        invalid: true,
      })
    );
    const textarea = markup(
      createElement(Textarea, { id: "notes", invalid: true })
    );

    expect(input).toContain('id="email"');
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('aria-describedby="email-error"');
    return expect(textarea).toContain('aria-invalid="true"');
  });

  it("renders regions and configurable headings with explicit accessible names", () => {
    const empty = markup(
      createElement(EmptyState, {
        description: "Create an item to exercise the vertical slice.",
        headingLevel: 3,
        title: "No feature items",
      })
    );
    const portalHeader = markup(
      createElement(PageHeader, {
        actions: createElement("a", { href: "/new" }, "New"),
        title: "Feature items",
      })
    );
    const publicHeader = markup(
      createElement(PageHeader, {
        title: "Architecture",
        variant: "public",
      })
    );
    const sectionHeader = markup(
      createElement(SectionHeader, { headingLevel: 3, title: "Recent items" })
    );
    const cardTitle = markup(
      createElement(CardTitle, { headingLevel: 2 }, "Account settings")
    );

    expect(empty).toContain('role="region"');
    expect(empty).toMatch(/aria-labelledby="[^"]+"/);
    expect(empty).toContain("<h3");
    expect(portalHeader).toContain("<header");
    expect(portalHeader).toContain("<h1");
    expect(portalHeader).toContain("text-2xl");
    expect(portalHeader).toContain('data-variant="portal"');
    expect(portalHeader).not.toContain("<p");
    expect(publicHeader).toContain("text-4xl");
    expect(sectionHeader).toContain("<h3");
    return expect(cardTitle).toContain("<h2");
  });

  it("announces one loading region while keeping skeleton shapes decorative", () => {
    const status = markup(
      createElement(StatusBadge, { status: "success" }, "Ready")
    );
    const skeletons = markup(
      createElement(
        SkeletonGroup,
        { label: "Loading feature items" },
        createElement(Skeleton, {}),
        createElement(Skeleton, {})
      )
    );

    expect(status).toContain('data-status="success"');
    expect(status).toContain("Status:");
    expect(status).toContain("Ready");
    expect(skeletons.match(/role="status"/g)).toHaveLength(1);
    expect(skeletons).toContain('aria-label="Loading feature items"');
    return expect(skeletons.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it("uses semantic data markup and image alternatives", () => {
    const stat = markup(
      createElement(StatCard, { label: "Open items", value: "12" })
    );
    const avatar = markup(
      createElement(Avatar, { fallback: "AL", name: "Ada Lovelace" })
    );
    const separator = markup(createElement(Separator, {}));

    expect(stat).toContain("<dl");
    expect(stat).toContain("<dt");
    expect(stat).toContain("<dd");
    expect(avatar).toContain('role="img"');
    expect(avatar).toContain('aria-label="Ada Lovelace"');
    expect(separator).toContain('role="none"');
    return expect(separator).toContain('data-slot="separator"');
  });

  it("renders every card region and optional semantic primitive branch", () => {
    const rendered = markup(
      createElement(
        "div",
        {},
        createElement(
          Card,
          { className: "custom-card" },
          createElement(CardHeader, {}, "Header"),
          createElement(CardTitle, {}, "Default title"),
          createElement(CardDescription, {}, "Description"),
          createElement(CardContent, {}, "Content"),
          createElement(CardFooter, {}, "Footer")
        ),
        createElement(Badge, { variant: "outline" }, "Outlined"),
        createElement(Avatar, {
          fallback: "AL",
          imageProps: { loading: "lazy" },
          name: "Ada Lovelace",
          src: "https://assets.example.test/avatar.png",
        }),
        createElement(
          Label,
          { optional: true, optionalLabel: "Not required" },
          "Alias"
        ),
        createElement(Separator, {
          decorative: false,
          orientation: "vertical",
        }),
        createElement(StatCard, {
          description: "Compared with yesterday",
          label: "Open items",
          value: "12",
        })
      )
    );

    expect(rendered).toContain("custom-card");
    expect(rendered).toContain("Header");
    expect(rendered).toContain("<h3");
    expect(rendered).toContain("Description");
    expect(rendered).toContain("Content");
    expect(rendered).toContain("Footer");
    expect(rendered).toContain("Outlined");
    expect(rendered).toContain('alt="Ada Lovelace"');
    expect(rendered).toContain('loading="lazy"');
    expect(rendered).toContain("Not required");
    expect(rendered).toContain('aria-orientation="vertical"');
    return expect(rendered).toContain("Compared with yesterday");
  });

  return it("renders all optional page and section header regions", () => {
    const rendered = markup(
      createElement(
        "div",
        {},
        createElement(PageHeader, {
          actions: createElement("a", { href: "/start" }, "Start"),
          description: "Public description",
          eyebrow: "Platform",
          title: "Public architecture",
          variant: "public",
        }),
        createElement(SectionHeader, {
          actions: createElement("button", { type: "button" }, "Refresh"),
          title: "Recent activity",
        })
      )
    );

    for (const text of [
      "Platform",
      "Public architecture",
      "Public description",
      "Start",
      "Recent activity",
      "Refresh",
    ]) {
      expect(rendered).toContain(text);
    }
  });
});

describe("client primitive wrappers", () => {
  it("forwards dropdown props, defaults, indicators, and inset styling", () => {
    const defaultContent = DropdownMenuContent({ children: "Default content" });
    const customContent = DropdownMenuContent({
      children: "Custom content",
      className: "custom-content",
      sideOffset: 12,
    });
    const defaultContentChild = elementProps(defaultContent)[
      "children"
    ] as ReactElement;
    const customContentChild = elementProps(customContent)[
      "children"
    ] as ReactElement;

    expect(elementProps(defaultContentChild)["sideOffset"]).toBe(4);
    expect(elementProps(customContentChild)["sideOffset"]).toBe(12);
    expect(String(elementProps(customContentChild)["className"])).toContain(
      "custom-content"
    );

    const item = DropdownMenuItem({ children: "Item" });
    const insetItem = DropdownMenuItem({ children: "Inset item", inset: true });
    const checkbox = DropdownMenuCheckboxItem({
      checked: true,
      children: "Checked item",
    });
    const radio = DropdownMenuRadioItem({
      children: "Radio item",
      value: "one",
    });
    const label = DropdownMenuLabel({ children: "Label" });
    const insetLabel = DropdownMenuLabel({
      children: "Inset label",
      inset: true,
    });
    const separator = DropdownMenuSeparator({});
    const subTrigger = DropdownMenuSubTrigger({ children: "Submenu" });
    const insetSubTrigger = DropdownMenuSubTrigger({
      children: "Inset submenu",
      inset: true,
    });
    const subContent = DropdownMenuSubContent({ children: "Submenu content" });

    expect(elementProps(item)["data-inset"]).toBeUndefined();
    expect(elementProps(insetItem)["data-inset"]).toBe(true);
    // asChild: the link stays the menuitem box and wraps the chrome span.
    const linkItem = DropdownMenuItem({
      asChild: true,
      children: createElement("a", { href: "/settings" }, "Settings"),
    });
    expect(elementProps(linkItem)["asChild"]).toBe(true);
    const link = elementProps(linkItem)["children"] as ReactElement;
    expect(link.type).toBe("a");
    expect(elementProps(link)["href"]).toBe("/settings");
    const linkChrome = elementProps(link)["children"] as ReactElement;
    expect(elementProps(linkChrome)["data-slot"]).toBe(
      "dropdown-menu-item-chrome"
    );
    expect(elementProps(linkChrome)["children"]).toBe("Settings");
    expect(elementProps(item)["asChild"]).toBe(false);
    expect(
      (elementProps(item)["children"] as ReactElement).props
    ).toHaveProperty("data-slot", "dropdown-menu-item-chrome");
    expect(elementProps(checkbox)["children"]).toBeDefined();
    expect(elementProps(radio)["children"]).toBeDefined();
    expect(String(elementProps(label)["className"])).not.toContain("pl-8");
    expect(String(elementProps(insetLabel)["className"])).toContain("pl-8");
    expect(String(elementProps(separator)["className"])).toContain("bg-border");
    expect(elementProps(subTrigger)["data-inset"]).toBeUndefined();
    expect(elementProps(subTrigger)).toHaveProperty("aria-controls", undefined);
    expect(elementProps(insetSubTrigger)["data-inset"]).toBe(true);
    const subContentChild = elementProps(subContent)[
      "children"
    ] as ReactElement;
    return expect(String(elementProps(subContentChild)["className"])).toContain(
      "z-popover"
    );
  });

  it("builds both dialog description states and forwards body and footer props", () => {
    const described = DialogContent({
      children: "Dialog body",
      className: "custom-dialog",
      closeLabel: "Dismiss settings",
      description: "Dialog description",
      title: "Dialog title",
    });
    const undescribed = DialogContent({
      children: "Dialog body",
      title: "Dialog title",
    });
    const describedPortalChildren = elementProps(described)[
      "children"
    ] as ReactElement[];
    const undescribedPortalChildren = elementProps(undescribed)[
      "children"
    ] as ReactElement[];
    const describedContent = describedPortalChildren[1]!;
    const undescribedContent = undescribedPortalChildren[1]!;
    const describedChildren = elementProps(describedContent)[
      "children"
    ] as unknown[];
    const undescribedChildren = elementProps(undescribedContent)[
      "children"
    ] as unknown[];
    const describedHeader = describedChildren[0] as ReactElement;
    const undescribedHeader = undescribedChildren[0] as ReactElement;
    const describedHeaderChildren = elementProps(describedHeader)[
      "children"
    ] as unknown[];
    const undescribedHeaderChildren = elementProps(undescribedHeader)[
      "children"
    ] as unknown[];
    const close = describedChildren[2] as ReactElement;
    const body = DialogBody({ children: "Body", className: "custom-body" });
    const footer = DialogFooter({
      children: "Footer",
      className: "custom-footer",
    });

    expect(describedHeaderChildren[1]).not.toBeNull();
    expect(undescribedHeaderChildren[1]).toBeNull();
    expect(elementProps(close)["aria-label"]).toBe("Dismiss settings");
    expect(String(elementProps(describedContent)["className"])).toContain(
      "custom-dialog"
    );
    expect(String(elementProps(body)["className"])).toContain("custom-body");
    return expect(String(elementProps(footer)["className"])).toContain(
      "custom-footer"
    );
  });

  return it("forwards every tabs wrapper and merges toaster defaults with caller options", () => {
    const tabs = Tabs({ className: "custom-tabs", defaultValue: "one" });
    const list = TabsList({ children: "List", className: "custom-list" });
    const trigger = TabsTrigger({
      children: "One",
      className: "custom-trigger",
      value: "one",
    });
    const content = TabsContent({
      children: "Panel",
      className: "custom-tab-content",
      value: "one",
    });
    const defaults = elementProps(Toaster({}));
    const customized = elementProps(
      Toaster({
        closeButton: false,
        containerAriaLabel: "Application notices",
        position: "top-center",
        theme: "dark",
        toastOptions: {
          classNames: {
            loader: "caller-loader",
            toast: "caller-toast",
          },
          duration: 1234,
          unstyled: false,
        },
      })
    );
    const customizedOptions = customized["toastOptions"] as {
      duration: number;
      unstyled: boolean;
      classNames: Record<string, string>;
    };

    expect(String(elementProps(tabs)["className"])).toContain("custom-tabs");
    expect(String(elementProps(list)["className"])).toContain("custom-list");
    expect(String(elementProps(trigger)["className"])).toContain(
      "custom-trigger"
    );
    expect(String(elementProps(content)["className"])).toContain(
      "custom-tab-content"
    );
    expect(defaults).toMatchObject({
      closeButton: true,
      containerAriaLabel: "Notifications",
      position: "bottom-right",
      richColors: false,
      theme: "system",
    });
    expect(customized).toMatchObject({
      closeButton: false,
      containerAriaLabel: "Application notices",
      position: "top-center",
      richColors: false,
      theme: "dark",
    });
    expect(customizedOptions.duration).toBe(1234);
    expect(customizedOptions.unstyled).toBe(true);
    expect(customizedOptions.classNames["toast"]).toContain("caller-toast");
    return expect(customizedOptions.classNames["loader"]).toContain(
      "caller-loader"
    );
  });
});
