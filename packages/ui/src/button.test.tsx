import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge.tsx";
import { Button, buttonVariants } from "./button.tsx";
import { CardAction } from "./card.tsx";
import { DropdownMenuShortcut } from "./client/dropdown-menu.ts";
import { IconButton } from "./icon-button.tsx";

describe("Button", () => {
  it("keeps the shadcn chrome size inside a 44px box", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toMatch(
      /^<button class="group\/button [^"]*min-h-11 min-w-11[^"]*-my-1"/
    );
    expect(html).toContain('data-slot="button-chrome"');
    expect(html).toContain("h-9 px-4 py-2");
    expect(html).toContain("bg-primary text-primary-foreground");
    return expect(html).toContain('type="button"');
  });

  it("renders a child element as the box with the chrome inside", () => {
    const html = renderToStaticMarkup(
      <Button asChild size="sm" variant="outline">
        <a className="extra" href="/settings">
          Settings
        </a>
      </Button>
    );
    expect(html).toMatch(/^<a class="[^"]*-my-1\.5[^"]*extra" /);
    expect(html).toContain('data-variant="outline"');
    expect(html).toContain(
      '<span class="inline-flex shrink-0 grow items-center'
    );
    return expect(html).toContain(">Settings</span></a>");
  });

  it("falls back to a button when asChild has no element and shows loading", () => {
    const fallback = renderToStaticMarkup(<Button asChild>Text</Button>);
    expect(fallback).toMatch(/^<button /);
    const loading = renderToStaticMarkup(
      <Button fullWidth loading loadingLabel="Saving" type="submit">
        Save
      </Button>
    );
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("disabled");
    expect(loading).toContain("flex w-full");
    expect(loading).toContain('<span class="sr-only">Saving</span>');
    return expect(loading).toContain('type="submit"');
  });

  it("exposes single-element shadcn classes for links", () => {
    expect(buttonVariants()).toContain("h-9 px-4 py-2");
    expect(buttonVariants()).toContain("min-h-11");
    return expect(
      buttonVariants({ size: "large", variant: "ghost" })
    ).toContain("h-10");
  });

  it("maps icon button variants onto shadcn variants", () => {
    const ghost = renderToStaticMarkup(
      <IconButton aria-label="Menu">i</IconButton>
    );
    const destructive = renderToStaticMarkup(
      <IconButton aria-label="Delete" variant="destructive">
        x
      </IconButton>
    );
    const styled = renderToStaticMarkup(
      <IconButton
        aria-label="Remove"
        className="extra"
        loading
        variant="destructive"
      >
        x
      </IconButton>
    );
    const labelled = renderToStaticMarkup(
      <IconButton aria-label="Sync" loading loadingLabel="Syncing">
        s
      </IconButton>
    );
    expect(ghost).toContain('aria-label="Menu"');
    expect(ghost).toContain("size-9");
    expect(destructive).toContain("text-destructive");
    expect(styled).toContain("extra");
    expect(styled).toContain('aria-label="Loading: Remove"');
    return expect(labelled).toContain('aria-label="Syncing"');
  });

  return it("renders the remaining shadcn slots", () => {
    expect(renderToStaticMarkup(<CardAction>Act</CardAction>)).toContain(
      'data-slot="card-action"'
    );
    expect(renderToStaticMarkup(<Badge>New</Badge>)).toContain(
      'data-variant="default"'
    );
    return expect(
      renderToStaticMarkup(DropdownMenuShortcut({ children: "⌘K" }))
    ).toContain("tracking-widest");
  });
});
