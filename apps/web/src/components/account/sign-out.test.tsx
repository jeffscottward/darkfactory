import { DropdownMenuItem } from "@darkfactory/ui/client/dropdown-menu";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  completeCurrentSessionSignOut,
  createSignOutActionController,
  SIGN_OUT_ERROR_ID,
  SIGNED_OUT_DESTINATION,
  type SignOutActionBinding,
  SignOutError,
  SignOutMenuItem,
} from "./sign-out-action.tsx";
import {
  browserCurrentSessionGateway,
  type CurrentSessionSignOutResult,
  createCurrentSessionGateway,
  SIGN_OUT_FAILED_MESSAGE,
  STRICT_SIGN_OUT_ENDPOINT,
} from "./sign-out-client.ts";

const deferred = <Value,>() => {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((complete) => {
    return (resolve = complete);
  });
  return { promise, resolve };
};

describe("current-session sign-out client boundary", () => {
  it("uses the same-origin strict POST boundary and accepts only confirmed revocation", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
      })
    );

    await expect(createCurrentSessionGateway(fetch).signOut()).resolves.toEqual(
      {
        ok: true,
      }
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(STRICT_SIGN_OUT_ENDPOINT, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      method: "POST",
    });
    return expect(STRICT_SIGN_OUT_ENDPOINT).toBe("/api/auth/strict-sign-out");
  });

  it("delegates the browser singleton through global fetch", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(browserCurrentSessionGateway.signOut()).resolves.toEqual({
        ok: true,
      });
      return expect(fetch).toHaveBeenCalledWith(STRICT_SIGN_OUT_ENDPOINT, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        method: "POST",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    [Response.json({ success: false }, { status: 503 })],
    [Response.json({ success: true }, { status: 503 })],
    [Response.json({ success: false })],
    [new Response(undefined, { status: 200 })],
  ])("does not claim success for an unconfirmed response", async (response) => {
    const gateway = createCurrentSessionGateway(
      vi.fn().mockResolvedValue(response)
    );

    return await expect(gateway.signOut()).resolves.toEqual({
      message: SIGN_OUT_FAILED_MESSAGE,
      ok: false,
    });
  });

  return it("uses uncertainty-safe copy when the response is lost after revocation", async () => {
    const gateway = createCurrentSessionGateway(
      vi.fn().mockRejectedValue(new Error("network unavailable"))
    );

    await expect(gateway.signOut()).resolves.toEqual({
      message: SIGN_OUT_FAILED_MESSAGE,
      ok: false,
    });
    return expect(SIGN_OUT_FAILED_MESSAGE).toBe(
      "Sign out could not be confirmed. Your session may still be active. Try again."
    );
  });
});

describe("current-session sign-out workflow", () => {
  it("replaces history with the fixed sign-in route after confirmed sign-out", async () => {
    const replace = vi.fn();
    const result = await completeCurrentSessionSignOut(
      { signOut: vi.fn().mockResolvedValue({ ok: true }) },
      replace
    );

    expect(result).toEqual({ ok: true });
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(SIGNED_OUT_DESTINATION);
    return expect(SIGNED_OUT_DESTINATION).toBe("/sign-in");
  });

  it("keeps the user in place when revocation was not confirmed", async () => {
    const replace = vi.fn();
    const failure = { message: SIGN_OUT_FAILED_MESSAGE, ok: false as const };
    const result = await completeCurrentSessionSignOut(
      { signOut: vi.fn().mockResolvedValue(failure) },
      replace
    );

    expect(result).toEqual(failure);
    return expect(replace).not.toHaveBeenCalled();
  });

  it("announces pending, ignores rapid repeats, and permits retry after failure", async () => {
    const first = deferred<CurrentSessionSignOutResult>();
    const signOut = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ok: true });
    const replace = vi.fn();
    const setState = vi.fn();
    const controller = createSignOutActionController({ signOut }, replace);

    const request = controller.activate(setState);
    await controller.activate(setState);

    expect(signOut).toHaveBeenCalledOnce();
    expect(setState).toHaveBeenCalledOnce();
    expect(setState).toHaveBeenLastCalledWith({ type: "pending" });

    first.resolve({ message: SIGN_OUT_FAILED_MESSAGE, ok: false });
    await request;

    expect(setState).toHaveBeenLastCalledWith({
      message: SIGN_OUT_FAILED_MESSAGE,
      type: "error",
    });

    await controller.activate(setState);

    expect(signOut).toHaveBeenCalledTimes(2);
    return expect(replace).toHaveBeenCalledWith(SIGNED_OUT_DESTINATION);
  });
});

type SignOutMenuItemElement = ReactElement<{
  readonly "aria-busy"?: string;
  readonly "aria-describedby"?: string;
  readonly children?: ReactNode;
  readonly "data-hydration-state"?: string;
  readonly disabled?: boolean;
  readonly onSelect?: (event: Event) => void;
}>;

const signOutMenuItem = (
  binding: SignOutActionBinding
): SignOutMenuItemElement => {
  const element: SignOutMenuItemElement = SignOutMenuItem(binding);
  expect(element.type).toBe(DropdownMenuItem);
  return element;
};

const menuItemLabel = (element: SignOutMenuItemElement): string =>
  renderToStaticMarkup(element.props.children);

describe("portal sign-out menu item", () => {
  it("keeps the server-rendered menu item inert until React hydration", () => {
    const onSignOut = vi.fn();
    const item = signOutMenuItem({
      isHydrated: false,
      onSignOut,
      state: { type: "idle" },
    });

    expect(item.props.disabled).toBe(true);
    expect(item.props["data-hydration-state"]).toBe("pending");
    expect(item.props["aria-busy"]).toBeUndefined();
    expect(item.props["aria-describedby"]).toBeUndefined();
    expect(menuItemLabel(item)).toContain("<span>Sign out</span>");
    return expect(onSignOut).not.toHaveBeenCalled();
  });

  it("wires the hydrated menu selection to the sign-out action", () => {
    const onSignOut = vi.fn();
    const item = signOutMenuItem({
      isHydrated: true,
      onSignOut,
      state: { type: "idle" },
    });

    expect(item.props.disabled).toBe(false);
    expect(item.props["data-hydration-state"]).toBe("ready");
    expect(item.props.onSelect).toBe(onSignOut);
    item.props.onSelect?.(new Event("select"));
    expect(onSignOut).toHaveBeenCalledOnce();
    const label = menuItemLabel(item);
    expect(label).toContain('aria-hidden="true"');
    expect(label).not.toContain("href=");
    return expect(label).toContain("<span>Sign out</span>");
  });

  it("disables repeat activation and announces pending work", () => {
    const item = signOutMenuItem({
      isHydrated: true,
      onSignOut: vi.fn(),
      state: { type: "pending" },
    });

    expect(item.props.disabled).toBe(true);
    expect(item.props["aria-busy"]).toBe("true");
    expect(item.props["aria-describedby"]).toBeUndefined();
    return expect(menuItemLabel(item)).toContain("<span>Signing out</span>");
  });

  return it("keeps the retry action enabled and points it at the failure feedback", () => {
    const item = signOutMenuItem({
      isHydrated: true,
      onSignOut: vi.fn(),
      state: { message: SIGN_OUT_FAILED_MESSAGE, type: "error" },
    });

    expect(item.props.disabled).toBe(false);
    expect(item.props["aria-busy"]).toBeUndefined();
    expect(item.props["aria-describedby"]).toBe(SIGN_OUT_ERROR_ID);
    expect(item.props["data-hydration-state"]).toBe("ready");
    return expect(menuItemLabel(item)).toContain("<span>Sign out</span>");
  });
});

describe("portal sign-out failure feedback", () => {
  it("renders nothing while sign-out is idle or pending", () => {
    expect(
      renderToStaticMarkup(<SignOutError state={{ type: "idle" }} />)
    ).toBe("");
    return expect(
      renderToStaticMarkup(<SignOutError state={{ type: "pending" }} />)
    ).toBe("");
  });

  return it("announces only the truthful failure message as an alert", () => {
    const html = renderToStaticMarkup(
      <SignOutError
        state={{ message: SIGN_OUT_FAILED_MESSAGE, type: "error" }}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain(`id="${SIGN_OUT_ERROR_ID}"`);
    expect(html).toContain(SIGN_OUT_FAILED_MESSAGE);
    return expect(html.endsWith(`>${SIGN_OUT_FAILED_MESSAGE}</p>`)).toBe(true);
  });
});
