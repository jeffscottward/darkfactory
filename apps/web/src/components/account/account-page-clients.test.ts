import type { AddressOutput } from "@darkfactory/api";
import type { AppearancePreference } from "@darkfactory/state";
import { createElement, type EffectCallback, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const hookRuntime = vi.hoisted(() => {
  type Effect = EffectCallback;
  type DependencySlot<Value> = Readonly<{
    deps: readonly unknown[] | undefined;
    value: Value;
  }>;
  type PendingEffect = Readonly<{
    deps: readonly unknown[] | undefined;
    effect: Effect;
    index: number;
  }>;

  const stateSlots: Array<{ value: unknown }> = [];
  const refSlots: Array<{ current: unknown }> = [];
  const callbackSlots: DependencySlot<unknown>[] = [];
  const effectSlots: DependencySlot<(() => void) | undefined>[] = [];
  const pendingEffects: PendingEffect[] = [];
  let stateCursor = 0;
  let refCursor = 0;
  let callbackCursor = 0;
  let effectCursor = 0;

  const dependenciesChanged = (
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined
  ): boolean =>
    previous === undefined ||
    next === undefined ||
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]));

  return {
    begin: (): void => {
      stateCursor = 0;
      refCursor = 0;
      callbackCursor = 0;
      effectCursor = 0;
      pendingEffects.length = 0;
    },
    commit: (): void => {
      for (const pending of pendingEffects.splice(0)) {
        effectSlots[pending.index]?.value?.();
        const cleanup = pending.effect();
        effectSlots[pending.index] = {
          deps: pending.deps,
          value: typeof cleanup === "function" ? cleanup : undefined,
        };
      }
    },
    reset: (): void => {
      for (const slot of effectSlots) slot.value?.();
      stateSlots.length = 0;
      refSlots.length = 0;
      callbackSlots.length = 0;
      effectSlots.length = 0;
      pendingEffects.length = 0;
      stateCursor = 0;
      refCursor = 0;
      callbackCursor = 0;
      effectCursor = 0;
    },
    useCallback: <Callback>(
      callback: Callback,
      deps?: readonly unknown[]
    ): Callback => {
      const index = callbackCursor++;
      const previous = callbackSlots[index];
      if (previous !== undefined && !dependenciesChanged(previous.deps, deps)) {
        return previous.value as Callback;
      }
      callbackSlots[index] = { deps, value: callback };
      return callback;
    },
    useEffect: (effect: Effect, deps?: readonly unknown[]): void => {
      const index = effectCursor++;
      const previous = effectSlots[index];
      if (previous === undefined || dependenciesChanged(previous.deps, deps)) {
        pendingEffects.push({ deps, effect, index });
      }
    },
    useRef: <Value>(initialValue: Value): { current: Value } => {
      const index = refCursor++;
      refSlots[index] ??= { current: initialValue };
      return refSlots[index] as { current: Value };
    },
    useState: <Value>(
      initializer: Value | (() => Value)
    ): readonly [
      Value,
      (next: Value | ((current: Value) => Value)) => void,
    ] => {
      const index = stateCursor++;
      stateSlots[index] ??= {
        value:
          typeof initializer === "function"
            ? (initializer as () => Value)()
            : initializer,
      };
      const slot = stateSlots[index]!;
      return [
        slot.value as Value,
        (next) => {
          return (slot.value =
            typeof next === "function"
              ? (next as (current: Value) => Value)(slot.value as Value)
              : next);
        },
      ];
    },
  };
});

const gatewayRuntime = vi.hoisted(() => ({ current: null as unknown }));
const securityGatewayRuntime = vi.hoisted(() => ({ current: null as unknown }));
const storeRuntime = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: hookRuntime.useCallback,
    useEffect: hookRuntime.useEffect,
    useRef: hookRuntime.useRef,
    useState: hookRuntime.useState,
  };
});

vi.mock("./account-client.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./account-client.ts")>();
  return {
    ...actual,
    createBrowserAccountGateway: () => {
      if (gatewayRuntime.current === null)
        throw new Error("Configure the account gateway before rendering.");
      return gatewayRuntime.current as never;
    },
  };
});

vi.mock("./security-client.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./security-client.ts")>();
  return {
    ...actual,
    createBrowserSecurityGateway: () => {
      if (securityGatewayRuntime.current === null)
        throw new Error("Configure the security gateway before rendering.");
      return securityGatewayRuntime.current as never;
    },
  };
});

vi.mock("../../lib/ui-store.tsx", () => ({
  useUiStoreApi: () => {
    if (storeRuntime.current === null)
      throw new Error("Configure the UI store before rendering.");
    return storeRuntime.current as never;
  },
}));

import { AddressBook } from "./address-book.tsx";
import { AddressForm } from "./address-form.tsx";
import { AddressPageClient } from "./address-page-client.tsx";
import { PreferencesForm } from "./preferences-form.tsx";
import { PreferencesPageClient } from "./preferences-page-client.tsx";
import { ProfileForm } from "./profile-form.tsx";
import { ProfilePageClient } from "./profile-page-client.tsx";
import { SecurityPageClient } from "./security-page-client.tsx";
import { PasswordForm, SecurityPanel } from "./security-panel.tsx";
import { SignOutMenuItem, useSignOutAction } from "./sign-out-action.tsx";

interface ElementRecord {
  readonly key: null | string;
  readonly props: Record<string, unknown>;
  readonly type: unknown;
}

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

const component = (tree: unknown, type: unknown): ElementRecord => {
  const element = findElement(tree, (candidate) => candidate.type === type);
  expect(element, "Expected rendered component").toBeDefined();
  return element!;
};

const controlByText = (tree: unknown, label: string): ElementRecord => {
  const control = findElement(
    tree,
    (candidate) =>
      typeof candidate.props["onClick"] === "function" &&
      textOf(candidate).replace(/\s+/gu, " ").trim() === label
  );
  expect(control, `Expected control named ${label}`).toBeDefined();
  return control!;
};

const mount = (renderComponent: () => ReactElement) => ({
  render: (): ReactElement => {
    hookRuntime.begin();
    const tree = renderComponent();
    hookRuntime.commit();
    return tree;
  },
});

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const deferred = <Value>() => {
  let resolvePromise = (_value: Value): void => {
    throw new Error("Deferred promise was not initialized.");
  };
  let rejectPromise = (_reason: unknown): void => {
    throw new Error("Deferred promise was not initialized.");
  };
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    return (rejectPromise = reject);
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
};

const updatedAt = new Date("2026-01-02T00:00:00.000Z");
const profile = {
  avatarUrl: "https://placehold.co/96x96",
  biography: "Maintains an owner-visible example profile.",
  businessName: "Alice & Co.",
  dateOfBirth: "1990-01-02",
  displayName: "Alice A.",
  firstName: "Alice",
  jobTitle: "Builder",
  lastName: "Adams",
  locale: "en-US",
  phone: "+1 202-555-0100",
  timezone: "America/New_York",
  updatedAt,
};
const account = {
  identity: { email: "alice@domain.test", emailVerified: true },
  profile,
};
const preferences = {
  analyticsConsent: false,
  density: "default" as const,
  emailNotifications: true,
  fontSize: "default" as const,
  personalizationConsent: true,
  productUpdates: false,
  profileVisibility: "private" as const,
  radius: "small" as const,
  theme: "system" as const,
  updatedAt,
};
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
  updatedAt,
};
const secondAddress = {
  ...address,
  id: "address-2",
  isPrimary: false,
  line1: "200 Example Street",
  line2: null,
  type: "home" as const,
};

const gatewayWith = (overrides: Record<string, unknown> = {}) => ({
  createAddress: vi.fn(async () => address),
  getPreferences: vi.fn(async () => preferences),
  getProfile: vi.fn(async () => account),
  listAddresses: vi.fn(async () => [address]),
  removeAddress: vi.fn(async () => ({ removed: true as const })),
  setPrimaryAddress: vi.fn(async () => address),
  updateAddress: vi.fn(async () => address),
  updatePreferences: vi.fn(async () => preferences),
  updateProfile: vi.fn(async () => account),
  ...overrides,
});

const ROSE_PINE_APPEARANCE: Readonly<AppearancePreference> = {
  density: "compact",
  fontSize: "large",
  radius: "none",
  theme: "rose-pine",
};

const uiStore = (
  appearance: Readonly<AppearancePreference> = ROSE_PINE_APPEARANCE
) => {
  const setState = vi.fn();
  return { getState: () => appearance, setState };
};

const invoke = <Result>(
  element: ElementRecord,
  name: string,
  value?: unknown
): Result => {
  const callback = element.props[name];
  if (typeof callback !== "function")
    throw new Error(`Expected ${name} callback.`);
  return (callback as (argument?: unknown) => Result)(value);
};

class FocusTarget {
  readonly focus = vi.fn();
}

const stubFocusEnvironment = ({
  activeElement = null,
  addAddress = null,
}: {
  readonly activeElement?: FocusTarget | null;
  readonly addAddress?: FocusTarget | null;
} = {}): void => {
  vi.stubGlobal("HTMLElement", FocusTarget);
  vi.stubGlobal("document", {
    activeElement,
    getElementById: vi.fn(() => addAddress),
  });
  vi.stubGlobal("window", {
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    },
  });
};

afterEach(() => {
  hookRuntime.reset();
  gatewayRuntime.current = null;
  storeRuntime.current = null;
  securityGatewayRuntime.current = null;
  return vi.unstubAllGlobals();
});

describe("profile page client", () => {
  it("moves from accessible loading to owner data and publishes a successful versioned save", async () => {
    const updatedAccount = {
      ...account,
      profile: {
        ...profile,
        jobTitle: "Maintainer",
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    };
    const updateProfile = vi.fn(async () => updatedAccount);
    gatewayRuntime.current = gatewayWith({ updateProfile });
    const mounted = mount(() => ProfilePageClient());

    let tree = mounted.render();
    expect(textOf(tree)).toContain("Loading profile");
    expect(
      findElement(tree, (element) => element.props["role"] === "status")?.props[
        "aria-busy"
      ]
    ).toBe("true");

    await flushMicrotasks();
    tree = mounted.render();
    let form = component(tree, ProfileForm);
    expect(form.props["initialProfile"]).toBe(profile);
    expect(form.props["feedback"]).toBeNull();

    const input = {
      expectedUpdatedAt: profile.updatedAt,
      jobTitle: "Maintainer",
    };
    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, ProfileForm);
    expect(updateProfile).toHaveBeenCalledWith(input);
    expect(form.props["initialProfile"]).toBe(updatedAccount.profile);
    expect(form.props["feedback"]).toEqual({
      message: "Profile saved.",
      tone: "success",
    });
    return expect(form.key).toBe("1");
  });

  it.each([
    [
      "unauthorized",
      "/sign-in?callbackURL=%2Faccount%2Fprofile",
      "Sign in again to load your profile.",
    ],
    ["forbidden", "/dashboard", "This account cannot open that profile."],
    ["not-found", "/account", "The profile is no longer available."],
  ] as const)(
    "renders the owner-safe %s load recovery",
    async (code, href, description) => {
      gatewayRuntime.current = gatewayWith({
        getProfile: vi.fn(async () =>
          Promise.reject({
            code: code === "not-found" ? "NOT_FOUND" : code.toUpperCase(),
          })
        ),
      });
      const mounted = mount(() => ProfilePageClient());
      mounted.render();
      await flushMicrotasks();
      const tree = mounted.render();
      const emptyState = findElement(
        tree,
        (element) => element.props["title"] === "Profile unavailable"
      );
      expect(emptyState?.props["message"]).toBe(description);
      return expect(
        findElement(tree, (element) => element.props["href"] === href)
      ).toBeDefined();
    }
  );

  it("retries transient profile loads without mutating any field", async () => {
    const getProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(account);
    gatewayRuntime.current = gatewayWith({ getProfile });
    const mounted = mount(() => ProfilePageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    expect(
      findElement(
        tree,
        (element) =>
          element.props["message"] ===
          "Your profile could not be loaded. No fields were changed."
      )
    ).toBeDefined();

    invoke(controlByText(tree, "Try again"), "onClick");
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, ProfileForm).props["initialProfile"]).toBe(profile);
    return expect(getProfile).toHaveBeenCalledTimes(2);
  });

  it("reconciles authoritative owner data after a version conflict without remounting unsaved inputs", async () => {
    const refreshed = {
      ...account,
      profile: { ...profile, displayName: "Alice Authoritative" },
    };
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(refreshed);
    const updateProfile = vi.fn(async () =>
      Promise.reject({ code: "CONFLICT" })
    );
    gatewayRuntime.current = gatewayWith({ getProfile, updateProfile });
    const mounted = mount(() => ProfilePageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const originalForm = component(tree, ProfileForm);

    await invoke<Promise<void>>(originalForm, "onSave", {
      displayName: "Unsaved owner choice",
      expectedUpdatedAt: profile.updatedAt,
    });
    tree = mounted.render();
    const reconciledForm = component(tree, ProfileForm);
    expect(reconciledForm.props["initialProfile"]).toBe(refreshed.profile);
    expect(reconciledForm.key).toBe(originalForm.key);
    return expect(reconciledForm.props["feedback"]).toEqual({
      message:
        "This profile changed elsewhere. Your entries are preserved; review them and save again.",
      tone: "error",
    });
  });

  it("preserves loaded profile data when conflict reconciliation is unavailable and sanitizes ordinary failures", async () => {
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce(account)
      .mockRejectedValueOnce(new Error("refresh failed"));
    const updateProfile = vi
      .fn()
      .mockRejectedValueOnce({ code: "CONFLICT" })
      .mockRejectedValueOnce(new Error("postgres://secret"));
    gatewayRuntime.current = gatewayWith({ getProfile, updateProfile });
    const mounted = mount(() => ProfilePageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let form = component(tree, ProfileForm);

    await invoke<Promise<void>>(form, "onSave", {
      expectedUpdatedAt: profile.updatedAt,
      jobTitle: "One",
    });
    tree = mounted.render();
    form = component(tree, ProfileForm);
    expect(form.props["initialProfile"]).toBe(profile);
    expect((form.props["feedback"] as { message: string }).message).toContain(
      "changed elsewhere"
    );

    await invoke<Promise<void>>(form, "onSave", {
      expectedUpdatedAt: profile.updatedAt,
      jobTitle: "Two",
    });
    tree = mounted.render();
    form = component(tree, ProfileForm);
    return expect(form.props["feedback"]).toEqual({
      message: "The request could not be completed. Try again.",
      tone: "error",
    });
  });

  it("preserves the profile form and reports the conflict after a primitive reconciliation failure", async () => {
    const reconciliationFailure = "profile reconciliation failed";
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce(account)
      .mockRejectedValueOnce(reconciliationFailure);
    gatewayRuntime.current = gatewayWith({
      getProfile,
      updateProfile: vi.fn(async () => Promise.reject({ code: "CONFLICT" })),
    });
    const mounted = mount(() => ProfilePageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const form = component(tree, ProfileForm);

    await invoke<Promise<void>>(form, "onSave", {
      expectedUpdatedAt: profile.updatedAt,
      jobTitle: "Owner draft",
    });

    tree = mounted.render();
    const preservedForm = component(tree, ProfileForm);
    expect(preservedForm.props["initialProfile"]).toBe(profile);
    return expect(preservedForm.props["feedback"]).toEqual({
      message:
        "This profile changed elsewhere. Your entries are preserved; review them and save again.",
      tone: "error",
    });
  });

  it("keeps an overlapping profile load failure authoritative when a save finishes later", async () => {
    const earlierRetry = deferred<typeof account>();
    const laterRetry = deferred<typeof account>();
    const update = deferred<typeof account>();
    const getProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockImplementationOnce(() => earlierRetry.promise)
      .mockImplementationOnce(() => laterRetry.promise);
    gatewayRuntime.current = gatewayWith({
      getProfile,
      updateProfile: vi.fn(() => update.promise),
    });
    const mounted = mount(() => ProfilePageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const retry = controlByText(tree, "Try again");

    invoke(retry, "onClick");
    invoke(retry, "onClick");
    earlierRetry.resolve(account);
    await flushMicrotasks();
    tree = mounted.render();
    const submission = invoke<Promise<void>>(
      component(tree, ProfileForm),
      "onSave",
      {
        displayName: "Saved owner",
        expectedUpdatedAt: profile.updatedAt,
      }
    );

    laterRetry.reject(new Error("later retry failed"));
    await flushMicrotasks();
    update.resolve(account);
    await submission;
    tree = mounted.render();
    expect(
      findElement(
        tree,
        (element) => element.props["title"] === "Profile unavailable"
      )
    ).toBeDefined();
    return expect(
      findElement(tree, (element) => element.type === ProfileForm)
    ).toBeUndefined();
  });

  return it("keeps an overlapping profile load failure authoritative when conflict reconciliation finishes later", async () => {
    const earlierRetry = deferred<typeof account>();
    const laterRetry = deferred<typeof account>();
    const reconciliation = deferred<typeof account>();
    const getProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockImplementationOnce(() => earlierRetry.promise)
      .mockImplementationOnce(() => laterRetry.promise)
      .mockImplementationOnce(() => reconciliation.promise);
    gatewayRuntime.current = gatewayWith({
      getProfile,
      updateProfile: vi.fn(async () => Promise.reject({ code: "CONFLICT" })),
    });
    const mounted = mount(() => ProfilePageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const retry = controlByText(tree, "Try again");

    invoke(retry, "onClick");
    invoke(retry, "onClick");
    earlierRetry.resolve(account);
    await flushMicrotasks();
    tree = mounted.render();
    const submission = invoke<Promise<void>>(
      component(tree, ProfileForm),
      "onSave",
      {
        displayName: "Owner draft",
        expectedUpdatedAt: profile.updatedAt,
      }
    );
    await flushMicrotasks();
    expect(getProfile).toHaveBeenCalledTimes(4);

    laterRetry.reject(new Error("later retry failed"));
    await flushMicrotasks();
    reconciliation.resolve({
      ...account,
      profile: { ...profile, displayName: "Authoritative owner" },
    });
    await submission;
    tree = mounted.render();
    expect(
      findElement(
        tree,
        (element) => element.props["title"] === "Profile unavailable"
      )
    ).toBeDefined();
    return expect(
      findElement(tree, (element) => element.type === ProfileForm)
    ).toBeUndefined();
  });
});

describe("preferences page client", () => {
  it("loads owner preferences and replaces the form version only after a successful save", async () => {
    const saved = {
      ...preferences,
      productUpdates: true,
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    };
    const updatePreferences = vi.fn(async () => saved);
    gatewayRuntime.current = gatewayWith({ updatePreferences });
    storeRuntime.current = uiStore();
    const mounted = mount(() => PreferencesPageClient());

    let tree = mounted.render();
    expect(textOf(tree)).toContain("Loading preferences");
    await flushMicrotasks();
    tree = mounted.render();
    let form = component(tree, PreferencesForm);
    expect(form.props["initialPreferences"]).toBe(preferences);
    expect(form.key).toBe("0");

    const input = {
      expectedUpdatedAt: preferences.updatedAt,
      productUpdates: true,
    };
    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, PreferencesForm);
    expect(updatePreferences).toHaveBeenCalledWith(input);
    expect(form.props["initialPreferences"]).toBe(saved);
    expect(form.key).toBe("1");
    return expect(form.props["feedback"]).toEqual({
      message: "Preferences saved.",
      tone: "success",
    });
  });

  it.each([
    [
      "UNAUTHORIZED",
      "/sign-in?callbackURL=%2Faccount%2Fpreferences",
      "Your preferences could not be loaded. Existing settings remain unchanged.",
    ],
    [
      "FORBIDDEN",
      "/account",
      "Your preferences could not be loaded. Existing settings remain unchanged.",
    ],
    [
      "NOT_FOUND",
      "/account",
      "No saved preferences were found for this account.",
    ],
  ] as const)(
    "renders the accessible %s preferences recovery",
    async (code, href, description) => {
      gatewayRuntime.current = gatewayWith({
        getPreferences: vi.fn(async () => Promise.reject({ code })),
      });
      storeRuntime.current = uiStore();
      const mounted = mount(() => PreferencesPageClient());
      mounted.render();
      await flushMicrotasks();
      const tree = mounted.render();
      const emptyState = findElement(
        tree,
        (element) => element.props["title"] === "Preferences unavailable"
      );
      expect(emptyState?.props["description"]).toBe(description);
      return expect(
        findElement(tree, (element) => element.props["href"] === href)
      ).toBeDefined();
    }
  );

  it("retries a transient preferences load and restores the owner form", async () => {
    const getPreferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(preferences);
    gatewayRuntime.current = gatewayWith({ getPreferences });
    storeRuntime.current = uiStore();
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(controlByText(tree, "Try again"), "onClick");
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, PreferencesForm).props["initialPreferences"]).toBe(
      preferences
    );
    return expect(getPreferences).toHaveBeenCalledTimes(2);
  });

  it("reconciles conflicting theme authority without remounting preserved choices", async () => {
    const refreshed = {
      ...preferences,
      density: "compact" as const,
      fontSize: "default" as const,
      radius: "medium" as const,
      theme: "gruvbox-dark" as const,
    };
    const getPreferences = vi
      .fn()
      .mockResolvedValueOnce(preferences)
      .mockResolvedValueOnce(refreshed);
    const updatePreferences = vi.fn(async () =>
      Promise.reject({ code: "CONFLICT" })
    );
    const store = uiStore(ROSE_PINE_APPEARANCE);
    gatewayRuntime.current = gatewayWith({ getPreferences, updatePreferences });
    storeRuntime.current = store;
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const originalForm = component(tree, PreferencesForm);

    await invoke<Promise<void>>(originalForm, "onSave", {
      expectedUpdatedAt: preferences.updatedAt,
      productUpdates: true,
    });
    tree = mounted.render();
    const reconciledForm = component(tree, PreferencesForm);
    expect(store.setState).toHaveBeenCalledOnce();
    expect(store.setState).toHaveBeenCalledWith({
      density: "compact",
      fontSize: "default",
      radius: "medium",
      theme: "gruvbox-dark",
    });
    expect(reconciledForm.props["initialPreferences"]).toBe(refreshed);
    expect(reconciledForm.key).toBe(originalForm.key);
    return expect(
      (reconciledForm.props["feedback"] as { message: string }).message
    ).toContain("choices are preserved");
  });

  it("keeps loaded preferences when reconciliation fails and provides safe ordinary failure feedback", async () => {
    const getPreferences = vi
      .fn()
      .mockResolvedValueOnce(preferences)
      .mockRejectedValueOnce(new Error("refresh failed"));
    const updatePreferences = vi
      .fn()
      .mockRejectedValueOnce({ code: "CONFLICT" })
      .mockRejectedValueOnce(new Error("private database detail"));
    gatewayRuntime.current = gatewayWith({ getPreferences, updatePreferences });
    storeRuntime.current = uiStore();
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let form = component(tree, PreferencesForm);

    await invoke<Promise<void>>(form, "onSave", {
      expectedUpdatedAt: preferences.updatedAt,
      productUpdates: true,
    });
    tree = mounted.render();
    form = component(tree, PreferencesForm);
    expect(form.props["initialPreferences"]).toBe(preferences);
    expect((form.props["feedback"] as { message: string }).message).toContain(
      "changed elsewhere"
    );

    await invoke<Promise<void>>(form, "onSave", {
      expectedUpdatedAt: preferences.updatedAt,
      productUpdates: true,
    });
    tree = mounted.render();
    form = component(tree, PreferencesForm);
    return expect(form.props["feedback"]).toEqual({
      message: "The request could not be completed. Try again.",
      tone: "error",
    });
  });

  it("preserves the preferences form and reports the conflict after a primitive reconciliation failure", async () => {
    const reconciliationFailure = "preferences reconciliation failed";
    const getPreferences = vi
      .fn()
      .mockResolvedValueOnce(preferences)
      .mockRejectedValueOnce(reconciliationFailure);
    gatewayRuntime.current = gatewayWith({
      getPreferences,
      updatePreferences: vi.fn(async () =>
        Promise.reject({ code: "CONFLICT" })
      ),
    });
    storeRuntime.current = uiStore();
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const form = component(tree, PreferencesForm);

    await invoke<Promise<void>>(form, "onSave", {
      expectedUpdatedAt: preferences.updatedAt,
      productUpdates: true,
    });

    tree = mounted.render();
    const preservedForm = component(tree, PreferencesForm);
    expect(preservedForm.props["initialPreferences"]).toBe(preferences);
    return expect(preservedForm.props["feedback"]).toEqual({
      message:
        "Preferences changed elsewhere. Your choices are preserved; review them and save again.",
      tone: "error",
    });
  });

  it("keeps an overlapping preferences load failure authoritative when a save finishes later", async () => {
    const earlierRetry = deferred<typeof preferences>();
    const laterRetry = deferred<typeof preferences>();
    const update = deferred<typeof preferences>();
    const getPreferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockImplementationOnce(() => earlierRetry.promise)
      .mockImplementationOnce(() => laterRetry.promise);
    gatewayRuntime.current = gatewayWith({
      getPreferences,
      updatePreferences: vi.fn(() => update.promise),
    });
    storeRuntime.current = uiStore();
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const retry = controlByText(tree, "Try again");

    invoke(retry, "onClick");
    invoke(retry, "onClick");
    earlierRetry.resolve(preferences);
    await flushMicrotasks();
    tree = mounted.render();
    const submission = invoke<Promise<void>>(
      component(tree, PreferencesForm),
      "onSave",
      {
        expectedUpdatedAt: preferences.updatedAt,
        productUpdates: true,
      }
    );

    laterRetry.reject(new Error("later retry failed"));
    await flushMicrotasks();
    update.resolve(preferences);
    await submission;
    tree = mounted.render();
    expect(
      findElement(
        tree,
        (element) => element.props["title"] === "Preferences unavailable"
      )
    ).toBeDefined();
    return expect(
      findElement(tree, (element) => element.type === PreferencesForm)
    ).toBeUndefined();
  });

  return it("keeps an overlapping preferences load failure authoritative when conflict reconciliation finishes later", async () => {
    const earlierRetry = deferred<typeof preferences>();
    const laterRetry = deferred<typeof preferences>();
    const reconciliation = deferred<typeof preferences>();
    const getPreferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockImplementationOnce(() => earlierRetry.promise)
      .mockImplementationOnce(() => laterRetry.promise)
      .mockImplementationOnce(() => reconciliation.promise);
    gatewayRuntime.current = gatewayWith({
      getPreferences,
      updatePreferences: vi.fn(async () =>
        Promise.reject({ code: "CONFLICT" })
      ),
    });
    storeRuntime.current = uiStore();
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const retry = controlByText(tree, "Try again");

    invoke(retry, "onClick");
    invoke(retry, "onClick");
    earlierRetry.resolve(preferences);
    await flushMicrotasks();
    tree = mounted.render();
    const submission = invoke<Promise<void>>(
      component(tree, PreferencesForm),
      "onSave",
      {
        expectedUpdatedAt: preferences.updatedAt,
        productUpdates: true,
      }
    );
    await flushMicrotasks();
    expect(getPreferences).toHaveBeenCalledTimes(4);

    laterRetry.reject(new Error("later retry failed"));
    await flushMicrotasks();
    reconciliation.resolve({ ...preferences, productUpdates: true });
    await submission;
    tree = mounted.render();
    expect(
      findElement(
        tree,
        (element) => element.props["title"] === "Preferences unavailable"
      )
    ).toBeDefined();
    return expect(
      findElement(tree, (element) => element.type === PreferencesForm)
    ).toBeUndefined();
  });
});

describe("address page client", () => {
  it("locks duplicate creates, publishes an optimistic address, and then accepts authoritative refresh", async () => {
    stubFocusEnvironment();
    const create = deferred<typeof address>();
    const refresh = deferred<readonly (typeof address)[]>();
    const authoritative = { ...address, city: "Authoritative City" };
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => refresh.promise);
    const createAddress = vi.fn(() => create.promise);
    gatewayRuntime.current = gatewayWith({ createAddress, listAddresses });
    const mounted = mount(() => AddressPageClient());

    let tree = mounted.render();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      type: "loading",
    });
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [],
      type: "ready",
    });

    invoke(component(tree, AddressBook), "onCreate");
    tree = mounted.render();
    const form = component(tree, AddressForm);
    const input = {
      city: address.city,
      country: address.country,
      isPrimary: address.isPrimary,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
      region: address.region,
      type: address.type,
    };
    const firstSave = invoke<Promise<void>>(form, "onSave", input);
    const duplicateSave = invoke<Promise<void>>(form, "onSave", input);
    await duplicateSave;
    expect(createAddress).toHaveBeenCalledOnce();
    create.resolve(address);
    await firstSave;

    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.type === AddressForm)
    ).toBeUndefined();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [address],
      type: "ready",
    });
    expect(component(tree, AddressBook).props["feedback"]).toEqual({
      message: "Address created.",
      tone: "success",
    });

    refresh.resolve([authoritative]);
    await flushMicrotasks();
    tree = mounted.render();
    return expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [authoritative],
      type: "ready",
    });
  });

  it("refreshes a conflicting edit in place while preserving the mounted form version", async () => {
    stubFocusEnvironment();
    const authoritative = {
      ...address,
      city: "Changed elsewhere",
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    };
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address])
      .mockResolvedValueOnce([authoritative]);
    const updateAddress = vi.fn(async () =>
      Promise.reject({ code: "CONFLICT" })
    );
    gatewayRuntime.current = gatewayWith({ listAddresses, updateAddress });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onEdit", address);
    tree = mounted.render();
    const originalForm = component(tree, AddressForm);

    await invoke<Promise<void>>(originalForm, "onSave", {
      city: "Unsaved owner city",
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    tree = mounted.render();
    const reconciledForm = component(tree, AddressForm);
    expect(reconciledForm.props["initialAddress"]).toBe(authoritative);
    expect(reconciledForm.key).toBe(originalForm.key);
    return expect(reconciledForm.props["feedback"]).toEqual({
      message:
        "This address changed elsewhere. Your entries are preserved; review them and save again.",
      tone: "error",
    });
  });

  it("closes an ambiguous create only after a successful list reconciliation", async () => {
    stubFocusEnvironment();
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([address]);
    const createAddress = vi.fn(async () =>
      Promise.reject(new Error("connection ended"))
    );
    gatewayRuntime.current = gatewayWith({ createAddress, listAddresses });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onCreate");
    tree = mounted.render();

    await invoke<Promise<void>>(component(tree, AddressForm), "onSave", {
      city: address.city,
      country: address.country,
      isPrimary: true,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
      region: address.region,
      type: address.type,
    });
    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.type === AddressForm)
    ).toBeUndefined();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [address],
      type: "ready",
    });
    return expect(component(tree, AddressBook).props["feedback"]).toEqual({
      message:
        "The address creation outcome could not be confirmed. Review the refreshed list before creating another.",
      tone: "info",
    });
  });

  it("requires confirmation before removal, restores focus, and removes optimistically", async () => {
    const origin = new FocusTarget();
    const addAddress = new FocusTarget();
    stubFocusEnvironment({ activeElement: origin, addAddress });
    const refresh = deferred<readonly (typeof address)[]>();
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address])
      .mockImplementationOnce(() => refresh.promise);
    const removeAddress = vi.fn(async () => ({ removed: true as const }));
    gatewayRuntime.current = gatewayWith({ listAddresses, removeAddress });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let book = component(tree, AddressBook);

    invoke(book, "onConfirmRemove", address);
    await flushMicrotasks();
    expect(removeAddress).not.toHaveBeenCalled();

    invoke(book, "onRequestRemove", address);
    tree = mounted.render();
    book = component(tree, AddressBook);
    expect(book.props["confirmingRemoveId"]).toBe(address.id);
    invoke(book, "onCancelRemove");
    expect(origin.focus).toHaveBeenCalledOnce();

    tree = mounted.render();
    book = component(tree, AddressBook);
    invoke(book, "onRequestRemove", address);
    tree = mounted.render();
    invoke(component(tree, AddressBook), "onConfirmRemove", address);
    await flushMicrotasks();
    tree = mounted.render();
    book = component(tree, AddressBook);
    expect(removeAddress).toHaveBeenCalledWith(address.id, address.updatedAt);
    expect(book.props["state"]).toEqual({ addresses: [], type: "ready" });
    expect(book.props["feedback"]).toEqual({
      message: "Address removed.",
      tone: "success",
    });
    expect(addAddress.focus).toHaveBeenCalledOnce();
    refresh.resolve([]);
    return await flushMicrotasks();
  });

  return it("updates primary ownership optimistically and retries a failed initial load", async () => {
    const refresh =
      deferred<readonly (typeof address | typeof secondAddress)[]>();
    const listAddresses = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([address, secondAddress])
      .mockImplementationOnce(() => refresh.promise);
    const primaryResult = { ...secondAddress, isPrimary: true };
    const setPrimaryAddress = vi.fn(async () => primaryResult);
    gatewayRuntime.current = gatewayWith({ listAddresses, setPrimaryAddress });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let book = component(tree, AddressBook);
    expect((book.props["state"] as { type: string }).type).toBe("error");

    invoke(book, "onRetry");
    await flushMicrotasks();
    tree = mounted.render();
    book = component(tree, AddressBook);
    invoke(book, "onSetPrimary", secondAddress);
    await flushMicrotasks();
    tree = mounted.render();
    book = component(tree, AddressBook);
    const ready = book.props["state"] as {
      addresses: readonly (typeof address)[];
      type: "ready";
    };
    expect(ready.addresses.map((entry) => [entry.id, entry.isPrimary])).toEqual(
      [
        [address.id, false],
        [secondAddress.id, true],
      ]
    );
    expect(book.props["feedback"]).toEqual({
      message: "Primary address updated.",
      tone: "success",
    });
    refresh.resolve([{ ...address, isPrimary: false }, primaryResult]);
    return await flushMicrotasks();
  });
});

describe("security panel interaction", () => {
  it("confirms revocation, blocks dismissal while pending, and restores trigger focus on completion", () => {
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });
    const trigger = { focus: vi.fn() };
    const onRevokeOthers = vi.fn();
    let isRevoking = false;
    const sessions = [
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        id: "session-current",
        isCurrent: true,
        updatedAt,
        userAgent: "Current Browser",
      },
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        id: "session-other",
        isCurrent: false,
        updatedAt,
        userAgent: "Other Browser",
      },
    ];
    const mounted = mount(() =>
      SecurityPanel({
        isRevoking,
        onRevokeOthers,
        state: { sessions, type: "ready" },
      })
    );

    let tree = mounted.render();
    invoke(controlByText(tree, "Sign out other sessions"), "onClick", {
      currentTarget: trigger,
    });
    tree = mounted.render();
    let dialog = findElement(
      tree,
      (element) => element.props["role"] === "alertdialog"
    )!;
    expect(dialog.props["aria-label"]).toBe(
      "Confirm signing out other sessions"
    );
    invoke(controlByText(tree, "Confirm sign out"), "onClick");
    expect(onRevokeOthers).toHaveBeenCalledOnce();

    isRevoking = true;
    tree = mounted.render();
    dialog = findElement(
      tree,
      (element) => element.props["role"] === "alertdialog"
    )!;
    expect(dialog.props["aria-busy"]).toBe(true);
    expect(controlByText(tree, "Confirm sign out").props["loading"]).toBe(true);
    expect(controlByText(tree, "Cancel").props["disabled"]).toBe(true);
    invoke<void>(dialog, "onKeyDown", { key: "Escape" });
    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.props["role"] === "alertdialog")
    ).toBeDefined();

    isRevoking = false;
    mounted.render();
    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.props["role"] === "alertdialog")
    ).toBeUndefined();
    return expect(trigger.focus).toHaveBeenCalledOnce();
  });

  return it("supports Escape and explicit cancel when no revocation is running", () => {
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });
    const trigger = { focus: vi.fn() };
    const sessions = [
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        id: "session-current",
        isCurrent: true,
        updatedAt,
        userAgent: "Current Browser",
      },
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        id: "session-other",
        isCurrent: false,
        updatedAt,
        userAgent: "Other Browser",
      },
    ];
    const mounted = mount(() =>
      SecurityPanel({ state: { sessions, type: "ready" } })
    );
    let tree = mounted.render();
    invoke(controlByText(tree, "Sign out other sessions"), "onClick", {
      currentTarget: trigger,
    });
    tree = mounted.render();
    invoke<void>(
      findElement(tree, (element) => element.props["role"] === "alertdialog")!,
      "onKeyDown",
      { key: "Escape" }
    );
    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.props["role"] === "alertdialog")
    ).toBeUndefined();

    invoke(controlByText(tree, "Sign out other sessions"), "onClick", {
      currentTarget: trigger,
    });
    tree = mounted.render();
    invoke(controlByText(tree, "Cancel"), "onClick");
    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.props["role"] === "alertdialog")
    ).toBeUndefined();
    return expect(trigger.focus).toHaveBeenCalledTimes(2);
  });
});

const securitySessions = [
  {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    id: "session-current",
    isCurrent: true,
    updatedAt,
    userAgent: "Current Browser",
  },
  {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    id: "session-other",
    isCurrent: false,
    updatedAt,
    userAgent: "Other Browser",
  },
] as const;

const securityGatewayWith = (overrides: Record<string, unknown> = {}) => ({
  changePassword: vi.fn(async () => undefined),
  listSessions: vi.fn(async () => ({ sessions: securitySessions })),
  revokeOtherSessions: vi.fn(async () => undefined),
  ...overrides,
});

describe("security page client", () => {
  it("moves from accessible loading through safe failure recovery to the session list", async () => {
    const listSessions = vi
      .fn()
      .mockRejectedValueOnce({ code: "UNAUTHORIZED" })
      .mockResolvedValueOnce({ sessions: securitySessions });
    securityGatewayRuntime.current = securityGatewayWith({ listSessions });
    const mounted = mount(() => SecurityPageClient());

    let tree = mounted.render();
    expect(component(tree, SecurityPanel).props["state"]).toEqual({
      type: "loading",
    });
    await flushMicrotasks();
    tree = mounted.render();
    let panel = component(tree, SecurityPanel);
    expect(panel.props["state"]).toEqual({
      kind: "unauthorized",
      message: "Your session ended. Sign in again to continue.",
      type: "error",
    });

    invoke(panel, "onRetry");
    tree = mounted.render();
    expect(component(tree, SecurityPanel).props["state"]).toEqual({
      type: "loading",
    });
    await flushMicrotasks();
    tree = mounted.render();
    panel = component(tree, SecurityPanel);
    expect(panel.props["state"]).toEqual({
      sessions: securitySessions,
      type: "ready",
    });
    return expect(listSessions).toHaveBeenCalledTimes(2);
  });

  it("locks repeated session revocation and publishes the refreshed success state", async () => {
    const revoke = deferred<void>();
    const currentOnly = [securitySessions[0]];
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({ sessions: securitySessions })
      .mockResolvedValueOnce({ sessions: currentOnly });
    const revokeOtherSessions = vi.fn(() => revoke.promise);
    securityGatewayRuntime.current = securityGatewayWith({
      listSessions,
      revokeOtherSessions,
    });
    const mounted = mount(() => SecurityPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();

    invoke(component(tree, SecurityPanel), "onRevokeOthers");
    tree = mounted.render();
    let panel = component(tree, SecurityPanel);
    expect(panel.props["isRevoking"]).toBe(true);
    invoke(panel, "onRevokeOthers");
    expect(revokeOtherSessions).toHaveBeenCalledOnce();

    revoke.resolve();
    await flushMicrotasks();
    tree = mounted.render();
    panel = component(tree, SecurityPanel);
    expect(panel.props["isRevoking"]).toBe(false);
    expect(panel.props["state"]).toEqual({
      sessions: currentOnly,
      type: "ready",
    });
    return expect(panel.props["feedback"]).toEqual({
      message: "Other sessions signed out.",
      tone: "success",
    });
  });

  it("distinguishes a saved revocation with a failed refresh from a rejected revocation", async () => {
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({ sessions: securitySessions })
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    const revokeOtherSessions = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: "FORBIDDEN" });
    securityGatewayRuntime.current = securityGatewayWith({
      listSessions,
      revokeOtherSessions,
    });
    const mounted = mount(() => SecurityPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();

    invoke(component(tree, SecurityPanel), "onRevokeOthers");
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, SecurityPanel).props["feedback"]).toEqual({
      message:
        "Other sessions were signed out, but the session list could not be refreshed.",
      tone: "info",
    });

    invoke(component(tree, SecurityPanel), "onRevokeOthers");
    await flushMicrotasks();
    tree = mounted.render();
    return expect(component(tree, SecurityPanel).props["feedback"]).toEqual({
      message: "This security action is not permitted for the current account.",
      tone: "error",
    });
  });

  return it("resets the password form after saves and preserves safe feedback across refresh and save failures", async () => {
    const currentOnly = [securitySessions[0]];
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({ sessions: securitySessions })
      .mockResolvedValueOnce({ sessions: currentOnly })
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    const changePassword = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ code: "VALIDATION_ERROR" });
    securityGatewayRuntime.current = securityGatewayWith({
      changePassword,
      listSessions,
    });
    const mounted = mount(() => SecurityPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let form = component(tree, PasswordForm);
    const input = {
      currentPassword: "current-password",
      newPassword: "new-password-long-enough",
      revokeOtherSessions: true,
    };

    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, PasswordForm);
    expect(changePassword).toHaveBeenCalledWith(input);
    expect(form.key).toBe("1");
    expect(form.props["feedback"]).toEqual({
      message: "Password changed.",
      tone: "success",
    });
    expect(component(tree, SecurityPanel).props["state"]).toEqual({
      sessions: currentOnly,
      type: "ready",
    });

    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, PasswordForm);
    expect(form.key).toBe("2");
    expect(component(tree, SecurityPanel).props["feedback"]).toEqual({
      message: "Password changed, but the session list could not be refreshed.",
      tone: "info",
    });

    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, PasswordForm);
    expect(form.key).toBe("2");
    return expect(form.props["feedback"]).toEqual({
      message: "The security request could not be completed. Try again.",
      tone: "error",
    });
  });
});

describe("mounted sign-out action", () => {
  it("hydrates, locks repeat activation, and uses browser history replacement after confirmation", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    const result = deferred<{ readonly ok: true }>();
    const signOut = vi.fn(() => result.promise);
    const mounted = mount(() =>
      createElement(SignOutMenuItem, useSignOutAction({ gateway: { signOut } }))
    );

    let tree = mounted.render();
    expect(component(tree, SignOutMenuItem).props["isHydrated"]).toBe(false);
    tree = mounted.render();
    let item = component(tree, SignOutMenuItem);
    expect(item.props["isHydrated"]).toBe(true);
    expect(item.props["state"]).toEqual({ type: "idle" });

    invoke(item, "onSignOut");
    tree = mounted.render();
    item = component(tree, SignOutMenuItem);
    expect(item.props["state"]).toEqual({ type: "pending" });
    invoke(item, "onSignOut");
    expect(signOut).toHaveBeenCalledOnce();

    result.resolve({ ok: true });
    await flushMicrotasks();
    return expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  return it("commits an accessible retry state when current-session revocation is uncertain", async () => {
    const replace = vi.fn();
    const signOut = vi.fn(async () => ({
      message: "Sign out could not be confirmed.",
      ok: false as const,
    }));
    const mounted = mount(() =>
      createElement(
        SignOutMenuItem,
        useSignOutAction({ gateway: { signOut }, replace })
      )
    );
    mounted.render();
    let tree = mounted.render();
    invoke(component(tree, SignOutMenuItem), "onSignOut");
    await flushMicrotasks();
    tree = mounted.render();
    const item = component(tree, SignOutMenuItem);
    expect(item.props["state"]).toEqual({
      message: "Sign out could not be confirmed.",
      type: "error",
    });
    expect(item.props["isHydrated"]).toBe(true);

    invoke(item, "onSignOut");
    await flushMicrotasks();
    expect(signOut).toHaveBeenCalledTimes(2);
    return expect(replace).not.toHaveBeenCalled();
  });
});

describe("security panel exceptional dismissal", () =>
  it("ignores unrelated dialog keys and safely restores when no trigger target exists", () => {
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });
    const mounted = mount(() =>
      SecurityPanel({
        feedback: { message: "Review active sessions.", tone: "info" },
        state: { sessions: securitySessions, type: "ready" },
      })
    );
    let tree = mounted.render();
    invoke(controlByText(tree, "Sign out other sessions"), "onClick", {
      currentTarget: null,
    });
    tree = mounted.render();
    const dialog = findElement(
      tree,
      (element) => element.props["role"] === "alertdialog"
    )!;
    invoke<void>(dialog, "onKeyDown", { key: "Enter" });
    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.props["role"] === "alertdialog")
    ).toBeDefined();
    invoke(controlByText(tree, "Cancel"), "onClick");
    tree = mounted.render();
    return expect(
      findElement(tree, (element) => element.props["role"] === "alertdialog")
    ).toBeUndefined();
  }));

describe("address page exceptional mutations", () => {
  it("restores form focus, updates an existing address, and warns when the saved list cannot refresh", async () => {
    const origin = new FocusTarget();
    stubFocusEnvironment({ activeElement: origin });
    const updatedAddress = {
      ...address,
      city: "Updated City",
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
    };
    const refresh = deferred<readonly (typeof address)[]>();
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address])
      .mockImplementationOnce(() => refresh.promise);
    const updateAddress = vi.fn(async () => updatedAddress);
    gatewayRuntime.current = gatewayWith({ listAddresses, updateAddress });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let book = component(tree, AddressBook);

    invoke(book, "onEdit", address);
    tree = mounted.render();
    invoke(component(tree, AddressForm), "onCancel");
    expect(origin.focus).toHaveBeenCalledOnce();
    tree = mounted.render();
    invoke(controlByText(tree, "Add an address"), "onClick");
    tree = mounted.render();
    expect(component(tree, AddressForm).props["initialAddress"]).toBeNull();
    invoke(component(tree, AddressForm), "onCancel");

    tree = mounted.render();
    invoke(component(tree, AddressBook), "onEdit", address);
    tree = mounted.render();
    await invoke<Promise<void>>(component(tree, AddressForm), "onSave", {
      city: updatedAddress.city,
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    tree = mounted.render();
    book = component(tree, AddressBook);
    expect(book.props["state"]).toEqual({
      addresses: [updatedAddress],
      type: "ready",
    });
    expect(book.props["feedback"]).toEqual({
      message: "Address updated.",
      tone: "success",
    });

    refresh.reject(new Error("refresh unavailable"));
    await flushMicrotasks();
    tree = mounted.render();
    return expect(component(tree, AddressBook).props["feedback"]).toEqual({
      message:
        "The change was saved, but the address list could not be refreshed.",
      tone: "info",
    });
  });

  it("blocks another create after an ambiguous result when reconciliation also fails", async () => {
    stubFocusEnvironment();
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("list unavailable"));
    gatewayRuntime.current = gatewayWith({
      createAddress: vi.fn(async () =>
        Promise.reject(new Error("connection ended"))
      ),
      listAddresses,
    });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onCreate");
    tree = mounted.render();

    await invoke<Promise<void>>(component(tree, AddressForm), "onSave", {
      city: address.city,
      country: address.country,
      isPrimary: false,
      line1: address.line1,
      line2: address.line2,
      postalCode: address.postalCode,
      region: address.region,
      type: address.type,
    });
    tree = mounted.render();
    expect(
      findElement(tree, (element) => element.type === AddressForm)
    ).toBeUndefined();
    return expect(component(tree, AddressBook).props["state"]).toEqual({
      kind: "retryable",
      message:
        "The address creation outcome is unknown. Reload the address list before creating another.",
      type: "error",
    });
  });

  it("preserves an edit and sanitizes a non-ambiguous save rejection", async () => {
    stubFocusEnvironment();
    gatewayRuntime.current = gatewayWith({
      listAddresses: vi.fn(async () => [address]),
      updateAddress: vi.fn(async () =>
        Promise.reject({ code: "VALIDATION_ERROR" })
      ),
    });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onEdit", address);
    tree = mounted.render();
    const originalForm = component(tree, AddressForm);

    await invoke<Promise<void>>(originalForm, "onSave", {
      city: "Rejected City",
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    tree = mounted.render();
    const preservedForm = component(tree, AddressForm);
    expect(preservedForm.key).toBe(originalForm.key);
    expect(preservedForm.props["initialAddress"]).toBe(address);
    return expect(preservedForm.props["feedback"]).toEqual({
      message: "Check the highlighted fields and try again.",
      tone: "error",
    });
  });

  it("locks primary mutation, reconciles a conflict, and handles an ordinary retry safely", async () => {
    const primary = deferred<typeof address>();
    const authoritative = [
      { ...address, isPrimary: false },
      { ...secondAddress, isPrimary: true },
    ];
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address, secondAddress])
      .mockResolvedValueOnce(authoritative);
    const setPrimaryAddress = vi
      .fn()
      .mockImplementationOnce(() => primary.promise)
      .mockRejectedValueOnce({ code: "VALIDATION_ERROR" });
    gatewayRuntime.current = gatewayWith({ listAddresses, setPrimaryAddress });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();

    invoke(component(tree, AddressBook), "onSetPrimary", secondAddress);
    tree = mounted.render();
    invoke(component(tree, AddressBook), "onSetPrimary", secondAddress);
    expect(setPrimaryAddress).toHaveBeenCalledOnce();
    primary.reject({ code: "CONFLICT" });
    await flushMicrotasks();
    tree = mounted.render();
    let book = component(tree, AddressBook);
    expect(book.props["state"]).toEqual({
      addresses: authoritative,
      type: "ready",
    });
    expect((book.props["feedback"] as { message: string }).message).toContain(
      "changed elsewhere"
    );

    invoke(book, "onSetPrimary", address);
    await flushMicrotasks();
    tree = mounted.render();
    book = component(tree, AddressBook);
    expect(setPrimaryAddress).toHaveBeenCalledTimes(2);
    return expect(book.props["feedback"]).toEqual({
      message: "Check the highlighted fields and try again.",
      tone: "error",
    });
  });

  it("locks confirmed removal and preserves the address across conflict and ordinary failures", async () => {
    stubFocusEnvironment();
    const removal = deferred<Readonly<{ removed: true }>>();
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address])
      .mockResolvedValueOnce([address]);
    const removeAddress = vi
      .fn()
      .mockImplementationOnce(() => removal.promise)
      .mockRejectedValueOnce({ code: "VALIDATION_ERROR" });
    gatewayRuntime.current = gatewayWith({ listAddresses, removeAddress });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onRequestRemove", address);
    tree = mounted.render();

    invoke(component(tree, AddressBook), "onConfirmRemove", address);
    tree = mounted.render();
    invoke(component(tree, AddressBook), "onConfirmRemove", address);
    expect(removeAddress).toHaveBeenCalledOnce();
    removal.reject({ code: "CONFLICT" });
    await flushMicrotasks();
    tree = mounted.render();
    let book = component(tree, AddressBook);
    expect(book.props["state"]).toEqual({
      addresses: [address],
      type: "ready",
    });
    expect((book.props["feedback"] as { message: string }).message).toContain(
      "changed elsewhere"
    );

    invoke(book, "onConfirmRemove", address);
    await flushMicrotasks();
    tree = mounted.render();
    book = component(tree, AddressBook);
    expect(removeAddress).toHaveBeenCalledTimes(2);
    return expect(book.props["feedback"]).toEqual({
      message: "Check the highlighted fields and try again.",
      tone: "error",
    });
  });

  return it("ignores a late refresh after a newer mutation has already committed authority", async () => {
    stubFocusEnvironment();
    const firstRefresh =
      deferred<readonly (typeof address | typeof secondAddress)[]>();
    const secondRefresh =
      deferred<readonly (typeof address | typeof secondAddress)[]>();
    const edited = { ...address, city: "Optimistic City" };
    const primary = { ...secondAddress, isPrimary: true };
    const authoritative = [{ ...edited, isPrimary: false }, primary];
    const stale = [address, secondAddress];
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address, secondAddress])
      .mockImplementationOnce(() => firstRefresh.promise)
      .mockImplementationOnce(() => secondRefresh.promise);
    gatewayRuntime.current = gatewayWith({
      listAddresses,
      setPrimaryAddress: vi.fn(async () => primary),
      updateAddress: vi.fn(async () => edited),
    });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onEdit", address);
    tree = mounted.render();
    await invoke<Promise<void>>(component(tree, AddressForm), "onSave", {
      city: edited.city,
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    tree = mounted.render();
    invoke(component(tree, AddressBook), "onSetPrimary", secondAddress);
    await flushMicrotasks();

    secondRefresh.resolve(authoritative);
    await flushMicrotasks();
    firstRefresh.resolve(stale);
    await flushMicrotasks();
    tree = mounted.render();
    return expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: authoritative,
      type: "ready",
    });
  });
});

describe("preferences appearance reconciliation", () =>
  it("leaves an already-authoritative appearance untouched while refreshing the form", async () => {
    const refreshed = {
      ...preferences,
      density: "compact" as const,
      fontSize: "default" as const,
      radius: "medium" as const,
      theme: "gruvbox-dark" as const,
    };
    const getPreferences = vi
      .fn()
      .mockResolvedValueOnce(preferences)
      .mockResolvedValueOnce(refreshed);
    const store = uiStore({
      density: "compact",
      fontSize: "default",
      radius: "medium",
      theme: "gruvbox-dark",
    });
    gatewayRuntime.current = gatewayWith({
      getPreferences,
      updatePreferences: vi.fn(async () =>
        Promise.reject({ code: "CONFLICT" })
      ),
    });
    storeRuntime.current = store;
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();

    await invoke<Promise<void>>(component(tree, PreferencesForm), "onSave", {
      expectedUpdatedAt: preferences.updatedAt,
      profileVisibility: "public",
    });
    tree = mounted.render();
    expect(store.setState).not.toHaveBeenCalled();
    return expect(
      component(tree, PreferencesForm).props["initialPreferences"]
    ).toBe(refreshed);
  }));

describe("address request ordering", () => {
  it("ignores an older retry rejection after a newer retry has restored the list", async () => {
    const olderRetry = deferred<readonly AddressOutput[]>();
    const newerRetry = deferred<readonly AddressOutput[]>();
    const listAddresses = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockImplementationOnce(() => olderRetry.promise)
      .mockImplementationOnce(() => newerRetry.promise);
    gatewayRuntime.current = gatewayWith({ listAddresses });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const failedBook = component(tree, AddressBook);
    expect((failedBook.props["state"] as { type: string }).type).toBe("error");

    invoke(failedBook, "onRetry");
    invoke(failedBook, "onRetry");
    newerRetry.resolve([secondAddress]);
    await flushMicrotasks();
    olderRetry.reject(new Error("superseded retry failed"));
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [secondAddress],
      type: "ready",
    });
    return expect(listAddresses).toHaveBeenCalledTimes(3);
  });

  it("keeps a newer retry result when an older retry resolves later", async () => {
    const olderRetry = deferred<readonly AddressOutput[]>();
    const newerRetry = deferred<readonly AddressOutput[]>();
    const listAddresses = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockImplementationOnce(() => olderRetry.promise)
      .mockImplementationOnce(() => newerRetry.promise);
    gatewayRuntime.current = gatewayWith({ listAddresses });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    const failedBook = component(tree, AddressBook);

    invoke(failedBook, "onRetry");
    invoke(failedBook, "onRetry");
    newerRetry.resolve([secondAddress]);
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [secondAddress],
      type: "ready",
    });

    olderRetry.resolve([address]);
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [secondAddress],
      type: "ready",
    });
    return expect(listAddresses).toHaveBeenCalledTimes(3);
  });

  it("keeps the owner edit mounted when conflict reconciliation no longer contains that address", async () => {
    stubFocusEnvironment();
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address])
      .mockResolvedValueOnce([]);
    gatewayRuntime.current = gatewayWith({
      listAddresses,
      updateAddress: vi.fn(async () => Promise.reject({ code: "CONFLICT" })),
    });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onEdit", address);
    tree = mounted.render();
    const originalForm = component(tree, AddressForm);

    await invoke<Promise<void>>(originalForm, "onSave", {
      city: "Owner draft",
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    tree = mounted.render();
    const preservedForm = component(tree, AddressForm);
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [],
      type: "ready",
    });
    expect(preservedForm.props["initialAddress"]).toBe(address);
    return expect(preservedForm.key).toBe(originalForm.key);
  });

  return it("keeps a newly opened form mounted while an earlier mutation refresh commits", async () => {
    stubFocusEnvironment();
    const refreshedAddress = { ...address, city: "Authoritative City" };
    const refresh = deferred<readonly (typeof address)[]>();
    const listAddresses = vi
      .fn()
      .mockResolvedValueOnce([address])
      .mockImplementationOnce(() => refresh.promise);
    gatewayRuntime.current = gatewayWith({
      listAddresses,
      updateAddress: vi.fn(async () => refreshedAddress),
    });
    const mounted = mount(() => AddressPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    invoke(component(tree, AddressBook), "onEdit", address);
    tree = mounted.render();
    await invoke<Promise<void>>(component(tree, AddressForm), "onSave", {
      city: refreshedAddress.city,
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
    });
    tree = mounted.render();
    invoke(controlByText(tree, "Add an address"), "onClick");
    tree = mounted.render();
    expect(component(tree, AddressForm).props["initialAddress"]).toBeNull();

    refresh.resolve([refreshedAddress]);
    await flushMicrotasks();
    tree = mounted.render();
    expect(component(tree, AddressForm).props["initialAddress"]).toBeNull();
    expect(component(tree, AddressBook).props["state"]).toEqual({
      addresses: [refreshedAddress],
      type: "ready",
    });
    return invoke(component(tree, AddressForm), "onCancel");
  });
});

describe("account page mutation recovery", () => {
  it("clears a profile server error before a successful owner retry resets the form", async () => {
    const saved = {
      ...account,
      profile: {
        ...profile,
        displayName: "Recovered profile",
        updatedAt: new Date("2026-01-06T00:00:00.000Z"),
      },
    };
    const updateProfile = vi
      .fn()
      .mockRejectedValueOnce({ code: "VALIDATION_ERROR" })
      .mockResolvedValueOnce(saved);
    gatewayRuntime.current = gatewayWith({ updateProfile });
    const mounted = mount(() => ProfilePageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let form = component(tree, ProfileForm);
    const input = {
      displayName: "Recovered profile",
      expectedUpdatedAt: profile.updatedAt,
    };

    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, ProfileForm);
    expect(form.props["feedback"]).toEqual({
      message: "Check the highlighted fields and try again.",
      tone: "error",
    });

    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, ProfileForm);
    expect(form.props["initialProfile"]).toBe(saved.profile);
    expect(form.props["feedback"]).toEqual({
      message: "Profile saved.",
      tone: "success",
    });
    return expect(form.key).toBe("1");
  });

  return it("clears a preferences storage error before a successful retry resets the form", async () => {
    const saved = {
      ...preferences,
      profileVisibility: "members" as const,
      updatedAt: new Date("2026-01-06T00:00:00.000Z"),
    };
    const updatePreferences = vi
      .fn()
      .mockRejectedValueOnce({ code: "STORAGE_ERROR" })
      .mockResolvedValueOnce(saved);
    gatewayRuntime.current = gatewayWith({ updatePreferences });
    storeRuntime.current = uiStore();
    const mounted = mount(() => PreferencesPageClient());
    mounted.render();
    await flushMicrotasks();
    let tree = mounted.render();
    let form = component(tree, PreferencesForm);
    const input = {
      expectedUpdatedAt: preferences.updatedAt,
      profileVisibility: "members" as const,
    };

    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, PreferencesForm);
    expect(form.props["feedback"]).toEqual({
      message: "Account storage is temporarily unavailable. Try again.",
      tone: "error",
    });

    await invoke<Promise<void>>(form, "onSave", input);
    tree = mounted.render();
    form = component(tree, PreferencesForm);
    expect(form.props["initialPreferences"]).toBe(saved);
    expect(form.props["feedback"]).toEqual({
      message: "Preferences saved.",
      tone: "success",
    });
    return expect(form.key).toBe("1");
  });
});
