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
    const itemClasses = DropdownMenuItem({}).props.className as string;
    const subTriggerClasses = DropdownMenuSubTrigger({}).props
      .className as string;

    expect(itemClasses).toContain("focus:ring-2");
    expect(itemClasses).toContain("data-[disabled]:opacity-100");
    expect(subTriggerClasses).toContain("focus:ring-2");
    return expect(subTriggerClasses).toContain("data-[disabled]:opacity-100");
  });
});
