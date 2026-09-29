import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button.tsx";
import { cn } from "./utilities.ts";

describe("cn", () => {
  it("merges conditional classes and resolves Tailwind conflicts", () =>
    expect(cn("px-2 text-sm", false, ["px-4", "font-medium"])).toBe(
      "text-sm px-4 font-medium"
    ));

  it("lets callers extend component variants without duplicate conflicts", () => {
    const classes = cn(
      buttonVariants({ variant: "primary", size: "default" }),
      "h-12"
    );

    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-12");
    return expect(classes.split(" ")).not.toContain("h-11");
  });

  return it("provides named ghost and link action variants", () => {
    expect(buttonVariants({ variant: "ghost" })).toContain("hover:bg-accent");
    return expect(buttonVariants({ variant: "link" })).toContain(
      "underline-offset-4"
    );
  });
});
