import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { DialogBody } from "./client/dialog.ts";
import {
  DropdownMenuItem,
  DropdownMenuSubTrigger,
} from "./client/dropdown-menu.ts";
import { TabsTrigger } from "./client/tabs.ts";
import { Input } from "./input.tsx";

describe("React 19 focus refs", () => {
  it("propagates native and client-wrapper refs to the focus-owning element", () => {
    const inputRef = createRef<HTMLInputElement>();
    const dialogBodyRef = createRef<HTMLDivElement>();
    const itemRef = createRef<HTMLDivElement>();
    const subTriggerRef = createRef<HTMLDivElement>();
    const tabRef = createRef<HTMLButtonElement>();

    expect(Input({ ref: inputRef }).props.ref).toBe(inputRef);
    expect(DialogBody({ ref: dialogBodyRef }).props.ref).toBe(dialogBodyRef);
    expect(DropdownMenuItem({ ref: itemRef }).props.ref).toBe(itemRef);
    expect(DropdownMenuSubTrigger({ ref: subTriggerRef }).props.ref).toBe(
      subTriggerRef
    );
    return expect(
      TabsTrigger({ ref: tabRef, value: "overview" }).props.ref
    ).toBe(tabRef);
  });

  return it("keeps menu focus and disabled states visually explicit", () => {
    const chromeClasses = (element: {
      props: { children?: unknown };
    }): string =>
      String(
        (element.props.children as { props: { className: string } }).props
          .className
      );
    const item = DropdownMenuItem({});
    const subTrigger = DropdownMenuSubTrigger({});

    expect(String(item.props.className)).toContain("min-h-11");
    expect(chromeClasses(item)).toContain("group-focus/item:bg-accent");
    expect(chromeClasses(item)).toContain(
      "group-data-[disabled]/item:opacity-50"
    );
    expect(chromeClasses(subTrigger)).toContain("group-focus/item:bg-accent");
    return expect(chromeClasses(subTrigger)).toContain(
      "group-data-[state=open]/item:bg-accent"
    );
  });
});
