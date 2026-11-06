import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createAccountGateway } from "./account-client.ts";
import { AddressBook } from "./address-book.tsx";
import { changedAddressUpdateInput } from "./address-form.tsx";
import { addressMutationMessage } from "./address-page-client.tsx";

const address = {
  city: "Example City",
  country: "US",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  id: "address-1",
  isPrimary: true,
  line1: "100 Example Avenue",
  line2: "Suite 200",
  postalCode: "20001",
  region: "DC",
  type: "work" as const,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

type ElementRecord = Readonly<{
  props: Record<string, unknown>;
}>;

const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node !== "object" || node === null) return "";
  const props = Reflect.get(node, "props");
  if (typeof props !== "object" || props === null) return "";
  return textOf(Reflect.get(props, "children"));
};

const findElement = (
  tree: unknown,
  predicate: (element: ElementRecord) => boolean
): ElementRecord | undefined => {
  const seen = new WeakSet<object>();
  const visit = (node: unknown): ElementRecord | undefined => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = visit(child);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    if (typeof node !== "object" || node === null || seen.has(node))
      return undefined;
    seen.add(node);
    const props = Reflect.get(node, "props");
    if (typeof props !== "object" || props === null) return undefined;
    const element = node as ElementRecord;
    if (predicate(element)) return element;
    for (const value of Object.values(element.props)) {
      const found = visit(value);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(tree);
};

const controlByLabel = (tree: unknown, label: string): ElementRecord => {
  const control = findElement(
    tree,
    (element) =>
      element.props["aria-label"] === label &&
      typeof element.props["onClick"] === "function"
  );
  expect(control, `Expected control labelled ${label}`).toBeDefined();
  return control!;
};

const controlByText = (tree: unknown, label: string): ElementRecord => {
  const control = findElement(
    tree,
    (element) =>
      typeof element.props["onClick"] === "function" &&
      textOf(element).replace(/\s+/gu, " ").trim() === label
  );
  expect(control, `Expected control named ${label}`).toBeDefined();
  return control!;
};

const activate = (control: ElementRecord): void => {
  expect(control.props["onClick"]).toBeTypeOf("function");
  (control.props["onClick"] as () => void)();
};

describe("typed address gateway", () => {
  it("uses create, update, primary, and confirmed remove procedures", async () => {
    const addresses = {
      create: vi.fn(async () => address),
      list: vi.fn(async () => [address]),
      remove: vi.fn(async () => ({ removed: true as const })),
      setPrimary: vi.fn(async () => address),
      update: vi.fn(async () => ({ ...address, city: "Changed City" })),
    };
    const gateway = createAccountGateway({
      account: {
        addresses,
        profile: { get: vi.fn(), update: vi.fn() },
      },
      preferences: { get: vi.fn(), update: vi.fn() },
    } as never);

    await expect(gateway.listAddresses()).resolves.toHaveLength(1);
    await expect(
      gateway.createAddress({
        city: address.city,
        country: address.country,
        isPrimary: true,
        line1: address.line1,
        line2: address.line2,
        postalCode: address.postalCode,
        region: address.region,
        type: "work",
      })
    ).resolves.toMatchObject({ id: "address-1" });
    await expect(
      gateway.updateAddress({
        city: "Changed City",
        expectedUpdatedAt: address.updatedAt,
        id: address.id,
      })
    ).resolves.toMatchObject({ city: "Changed City" });
    await expect(
      gateway.setPrimaryAddress(address.id, address.updatedAt)
    ).resolves.toMatchObject({ isPrimary: true });
    await expect(
      gateway.removeAddress(address.id, address.updatedAt)
    ).resolves.toEqual({ removed: true });
    expect(addresses.setPrimary).toHaveBeenCalledWith({
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    return expect(addresses.remove).toHaveBeenCalledWith({
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
  });

  it("distinguishes create and update confirmations", () => {
    expect(
      addressMutationMessage({
        city: address.city,
        country: address.country,
        isPrimary: true,
        line1: address.line1,
        line2: address.line2,
        postalCode: address.postalCode,
        region: address.region,
        type: address.type,
      })
    ).toBe("Address created.");
    return expect(
      addressMutationMessage({
        city: "Changed City",
        expectedUpdatedAt: address.updatedAt,
        id: address.id,
      })
    ).toBe("Address updated.");
  });
  it("submits only dirty address fields with the loaded version", () =>
    expect(
      changedAddressUpdateInput(address, { ...address, city: "Changed City" })
    ).toEqual({
      city: "Changed City",
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    }));

  return it("normalizes every editable field while preserving identity, version, and primary status", () => {
    expect(changedAddressUpdateInput(address, address)).toEqual({
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    expect(
      changedAddressUpdateInput(address, {
        ...address,
        city: "  Changed City  ",
        country: "  CA  ",
        isPrimary: false,
        line1: "  200 Changed Road  ",
        line2: "   ",
        postalCode: "  22030  ",
        region: "  VA  ",
        type: "home",
      })
    ).toEqual({
      city: "Changed City",
      country: "CA",
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
      line1: "200 Changed Road",
      line2: null,
      postalCode: "22030",
      region: "VA",
      type: "home",
    });
    return expect(
      changedAddressUpdateInput(address, { ...address, line2: null })
    ).toEqual({
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
      line2: null,
    });
  });
});

describe("address book states and actions", () => {
  it("renders geometry-preserving loading feedback", () => {
    const html = renderToStaticMarkup(
      <AddressBook state={{ type: "loading" }} />
    );
    expect(html).toContain("Loading addresses");
    return expect(html).toContain('aria-busy="true"');
  });

  it("renders an instructive create path when no address exists", () => {
    const html = renderToStaticMarkup(
      <AddressBook state={{ addresses: [], type: "ready" }} />
    );
    expect(html).toContain("No addresses saved");
    return expect(html).toContain("Add an address");
  });

  it("renders persisted address fields and accessible edit/primary/remove actions", () => {
    const html = renderToStaticMarkup(
      <AddressBook state={{ addresses: [address], type: "ready" }} />
    );
    expect(html).toContain("100 Example Avenue");
    expect(html).toContain("Suite 200");
    expect(html).toContain("Primary");
    expect(html).toContain("Edit work address");
    expect(html).toContain("Remove work address");
    return expect(html).not.toContain("Make work address primary");
  });

  it("requires explicit removal confirmation and retains a cancel action", () => {
    const html = renderToStaticMarkup(
      <AddressBook
        confirmingRemoveId="address-1"
        state={{ addresses: [address], type: "ready" }}
      />
    );
    expect(html).toContain("Remove this address?");
    expect(html).toContain("Confirm removal");
    return expect(html).toContain("Cancel");
  });

  it("shows safe error and success feedback without replacing server state", () => {
    const failed = renderToStaticMarkup(
      <AddressBook
        feedback={{
          message: "Addresses are temporarily unavailable.",
          tone: "error",
        }}
        state={{ addresses: [address], type: "ready" }}
      />
    );
    expect(failed).toContain("Addresses are temporarily unavailable");
    expect(failed).toContain("100 Example Avenue");
    const success = renderToStaticMarkup(
      <AddressBook
        feedback={{ message: "Primary address updated.", tone: "success" }}
        state={{ addresses: [address], type: "ready" }}
      />
    );
    return expect(success).toContain("Primary address updated");
  });

  it.each([
    [
      "unauthorized",
      'href="/sign-in?callbackURL=%2Fsettings%2Faccount%2Faddress"',
      "Sign in",
    ],
    ["forbidden", 'href="/settings/account/profile"', "Back to account"],
    ["not-found", 'href="/settings/account/profile"', "Back to account"],
    ["conflict", "Try again", "Try again"],
    ["retryable", "Try again", "Try again"],
  ] as const)(
    "renders the accessible %s recovery action",
    (kind, recovery, label) => {
      const html = renderToStaticMarkup(
        <AddressBook
          state={{ kind, message: "Addresses are unavailable.", type: "error" }}
        />
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain("Addresses are unavailable");
      expect(html).toContain(recovery);
      return expect(html).toContain(label);
    }
  );

  it("forwards empty, retry, edit, primary, remove, confirm, and cancel actions with the owned address", () => {
    const secondary = {
      ...address,
      id: "address-2",
      isPrimary: false,
      line2: null,
      type: "home" as const,
    };
    const onCreate = vi.fn();
    const emptyTree = AddressBook({
      onCreate,
      state: { addresses: [], type: "ready" },
    }) as ReactElement;
    activate(controlByText(emptyTree, "Add an address"));
    expect(onCreate).toHaveBeenCalledOnce();

    const onRetry = vi.fn();
    const errorTree = AddressBook({
      onRetry,
      state: {
        kind: "retryable",
        message: "Try loading again.",
        type: "error",
      },
    }) as ReactElement;
    activate(controlByText(errorTree, "Try again"));
    expect(onRetry).toHaveBeenCalledOnce();

    const onEdit = vi.fn();
    const onSetPrimary = vi.fn();
    const onRequestRemove = vi.fn();
    const readyTree = AddressBook({
      onEdit,
      onRequestRemove,
      onSetPrimary,
      state: { addresses: [address, secondary], type: "ready" },
    }) as ReactElement;
    activate(controlByLabel(readyTree, "Edit home address"));
    activate(controlByLabel(readyTree, "Make home address primary"));
    activate(controlByLabel(readyTree, "Remove home address"));
    expect(onEdit).toHaveBeenCalledWith(secondary);
    expect(onSetPrimary).toHaveBeenCalledWith(secondary);
    expect(onRequestRemove).toHaveBeenCalledWith(secondary);

    const onConfirmRemove = vi.fn();
    const onCancelRemove = vi.fn();
    const confirmationTree = AddressBook({
      confirmingRemoveId: secondary.id,
      onCancelRemove,
      onConfirmRemove,
      state: { addresses: [address, secondary], type: "ready" },
    }) as ReactElement;
    activate(
      controlByLabel(confirmationTree, "Confirm removal of home address")
    );
    activate(controlByText(confirmationTree, "Cancel"));
    expect(onConfirmRemove).toHaveBeenCalledWith(secondary);
    return expect(onCancelRemove).toHaveBeenCalledOnce();
  });

  return it("disables every address mutation while exposing truthful per-address progress", () => {
    const secondary = {
      ...address,
      id: "address-2",
      isPrimary: false,
      line2: null,
      type: "home" as const,
    };
    const tree = AddressBook({
      busyId: secondary.id,
      state: { addresses: [address, secondary], type: "ready" },
    }) as ReactElement;
    expect(controlByLabel(tree, "Edit work address").props["disabled"]).toBe(
      true
    );
    expect(controlByLabel(tree, "Remove work address").props["disabled"]).toBe(
      true
    );
    expect(controlByLabel(tree, "Edit home address").props["disabled"]).toBe(
      true
    );
    expect(
      controlByLabel(tree, "Make home address primary").props["disabled"]
    ).toBe(true);
    expect(
      controlByLabel(tree, "Make home address primary").props["loading"]
    ).toBe(true);
    expect(controlByLabel(tree, "Remove home address").props["disabled"]).toBe(
      true
    );

    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Updating primary address");
    return expect(html).not.toContain(">null<");
  });
});
