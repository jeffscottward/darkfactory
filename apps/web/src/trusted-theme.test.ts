import type {
  ApiClient,
  ApiClientOptions,
  ThemePreferenceOutput,
} from "@darkfactory/api";
import type { AppearancePreference } from "@darkfactory/state";
import { createUiStore, type UiStore } from "@darkfactory/state/client";
import { useTheme } from "@darkfactory/ui/client/theme";
import { createElement, type EffectCallback, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const themeHookRuntime = vi.hoisted(() => {
  type Effect = EffectCallback;
  interface EffectSlot {
    cleanup: (() => void) | undefined;
    deps: readonly unknown[] | undefined;
  }
  type PendingEffect = Readonly<{
    deps: readonly unknown[] | undefined;
    effect: Effect;
    index: number;
  }>;
  type DependencySlot<Value> = Readonly<{
    deps: readonly unknown[] | undefined;
    value: Value;
  }>;

  const stateSlots: Array<{ value: unknown }> = [];
  const refSlots: Array<{ current: unknown }> = [];
  const callbackSlots: DependencySlot<unknown>[] = [];
  const layoutSlots: EffectSlot[] = [];
  const passiveSlots: EffectSlot[] = [];
  const pendingLayouts: PendingEffect[] = [];
  const pendingPassives: PendingEffect[] = [];
  let stateCursor = 0;
  let refCursor = 0;
  let callbackCursor = 0;
  let layoutCursor = 0;
  let passiveCursor = 0;
  let clientSnapshot: (() => unknown) | undefined;

  const dependenciesChanged = (
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined
  ): boolean =>
    previous === undefined ||
    next === undefined ||
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]));

  const commit = (
    pendingEffects: PendingEffect[],
    slots: EffectSlot[]
  ): void => {
    for (const pending of pendingEffects.splice(0)) {
      slots[pending.index]?.cleanup?.();
      const cleanup = pending.effect();
      slots[pending.index] = {
        cleanup: typeof cleanup === "function" ? cleanup : undefined,
        deps: pending.deps,
      };
    }
  };

  const schedule = (
    effect: Effect,
    deps: readonly unknown[] | undefined,
    slots: EffectSlot[],
    pendingEffects: PendingEffect[],
    index: number
  ): void => {
    const previous = slots[index];
    if (previous === undefined || dependenciesChanged(previous.deps, deps)) {
      pendingEffects.push({ deps, effect, index });
    }
  };

  return {
    begin: (): void => {
      stateCursor = 0;
      refCursor = 0;
      callbackCursor = 0;
      layoutCursor = 0;
      passiveCursor = 0;
      pendingLayouts.length = 0;
      pendingPassives.length = 0;
    },
    captureClientSnapshot: (snapshot: () => unknown): void => {
      clientSnapshot = snapshot;
    },
    clientSnapshot: (): unknown => {
      if (clientSnapshot === undefined) {
        throw new Error("Expected a client external-store snapshot.");
      }
      return clientSnapshot();
    },
    commitEffects: (): void => {
      commit(pendingPassives, passiveSlots);
    },
    commitLayouts: (): void => {
      commit(pendingLayouts, layoutSlots);
    },
    ref: (index: number): { current: unknown } => {
      const ref = refSlots[index];
      if (ref === undefined) throw new Error(`Expected hook ref ${index}.`);
      return ref;
    },
    reset: (): void => {
      for (const slot of [...layoutSlots, ...passiveSlots]) slot.cleanup?.();
      stateSlots.length = 0;
      refSlots.length = 0;
      callbackSlots.length = 0;
      layoutSlots.length = 0;
      passiveSlots.length = 0;
      pendingLayouts.length = 0;
      pendingPassives.length = 0;
      clientSnapshot = undefined;
      stateCursor = 0;
      refCursor = 0;
      callbackCursor = 0;
      layoutCursor = 0;
      passiveCursor = 0;
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
      const index = passiveCursor++;
      schedule(effect, deps, passiveSlots, pendingPassives, index);
    },
    useLayoutEffect: (effect: Effect, deps?: readonly unknown[]): void => {
      const index = layoutCursor++;
      schedule(effect, deps, layoutSlots, pendingLayouts, index);
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
          return void (slot.value =
            typeof next === "function"
              ? (next as (current: Value) => Value)(slot.value as Value)
              : next);
        },
      ];
    },
  };
});

const themeComponentRuntime = vi.hoisted(() => {
  let dialogs: Record<string, unknown>[] = [];
  let navigationLinks: Record<string, unknown>[] = [];
  let picker: Record<string, unknown> | undefined;
  let toaster: Record<string, unknown> | undefined;
  return {
    captureDialog: (props: Record<string, unknown>): void => {
      dialogs.push(props);
    },
    captureNavigationLinks: (props: Record<string, unknown>): void => {
      navigationLinks.push(props);
    },
    capturePicker: (props: Record<string, unknown>): void => {
      picker = props;
    },
    captureToaster: (props: Record<string, unknown>): void => {
      toaster = props;
    },
    dialogs: (): readonly Record<string, unknown>[] => dialogs,
    navigationLinks: (): readonly Record<string, unknown>[] => navigationLinks,
    picker: (): Record<string, unknown> => {
      if (picker === undefined)
        throw new Error("Expected ThemePicker to render.");
      return picker;
    },
    reset: (): void => {
      dialogs = [];
      navigationLinks = [];
      picker = undefined;
      toaster = undefined;
    },
    toaster: (): Record<string, unknown> => {
      if (toaster === undefined) throw new Error("Expected Toaster to render.");
      return toaster;
    },
  };
});

const themeApiRuntime = vi.hoisted(() => {
  type Factory = (options: ApiClientOptions) => ApiClient;
  let factory: Factory | undefined;
  let options: ApiClientOptions[] = [];
  return {
    configure: (nextFactory: Factory): void => {
      factory = nextFactory;
    },
    create: (fallback: Factory, nextOptions: ApiClientOptions): ApiClient => {
      options.push(nextOptions);
      return (factory ?? fallback)(nextOptions);
    },
    options: (): readonly ApiClientOptions[] => options,
    reset: (): void => {
      factory = undefined;
      options = [];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: themeHookRuntime.useCallback,
    useEffect: themeHookRuntime.useEffect,
    useLayoutEffect: themeHookRuntime.useLayoutEffect,
    useRef: themeHookRuntime.useRef,
    useState: themeHookRuntime.useState,
    useSyncExternalStore: <Snapshot>(
      subscribe: (onStoreChange: () => void) => () => void,
      getSnapshot: () => Snapshot,
      getServerSnapshot?: () => Snapshot
    ): Snapshot => {
      themeHookRuntime.captureClientSnapshot(getSnapshot);
      return actual.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    },
  };
});

vi.mock("@darkfactory/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@darkfactory/api")>();
  return {
    ...actual,
    createApiClient: (options: ApiClientOptions) =>
      themeApiRuntime.create(actual.createApiClient, options),
  };
});

vi.mock("@darkfactory/ui/client/theme", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@darkfactory/ui/client/theme")>();
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    ThemePicker: (props: Record<string, unknown>) => {
      themeComponentRuntime.capturePicker(props);
      return react.createElement(
        "button",
        {
          "aria-label":
            typeof props["triggerLabel"] === "string"
              ? props["triggerLabel"]
              : "Theme settings",
        },
        props["statusMessage"] as ReactNode,
        props["error"] as ReactNode
      );
    },
  };
});

vi.mock("@darkfactory/ui/client/toaster", () => ({
  Toaster: (props: Record<string, unknown>) => {
    themeComponentRuntime.captureToaster(props);
    return null;
  },
}));

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ usePathname: () => "" }));

vi.mock("@darkfactory/ui/client/dialog", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    Dialog: (props: Record<string, unknown>) => {
      themeComponentRuntime.captureDialog(props);
      return react.createElement("div", {}, props["children"] as ReactNode);
    },
    DialogContent: (props: Record<string, unknown>) =>
      react.createElement(
        "section",
        {},
        react.createElement("h2", {}, props["title"] as ReactNode),
        props["description"] as ReactNode,
        props["children"] as ReactNode
      ),
    DialogTrigger: (props: Record<string, unknown>) =>
      props["children"] as ReactNode,
  };
});

vi.mock("./components/navigation-links.tsx", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./components/navigation-links.tsx")>();
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    NavigationLinks: (props: Record<string, unknown>) => {
      themeComponentRuntime.captureNavigationLinks(props);
      return react.createElement(actual.NavigationLinks, props as never);
    },
  };
});

import {
  PublicFooter,
  PublicHeader,
  PublicShell,
} from "./components/public-shell.tsx";
import {
  consumeInitialThemeBootstrap,
  reconcileThemeAuthorityTransition,
  ThemeController,
  useThemeAuthority,
} from "./components/theme-controller.tsx";
import {
  createThemePreferenceClient,
  selectThemeMenuPreference,
  ThemeMenu,
} from "./components/theme-menu.tsx";
import {
  DEFAULT_ANONYMOUS_THEME,
  serializeThemeCookie,
  THEME_STORAGE_KEY,
} from "./lib/theme.ts";
import {
  serializeAnonymousThemePreference,
  UiStateProvider,
  useUiState,
  useUiStoreApi,
} from "./lib/ui-store.tsx";

const deferred = <Value>() => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle, fail) => {
    reject = fail;
    return void (resolve = settle);
  });
  return { promise, reject, resolve };
};

const ThemeProbe = () => {
  const { preference } = useTheme();
  return createElement("output", {
    "data-density": preference.density,
    "data-font-size": preference.fontSize,
    "data-radius": preference.radius,
    "data-theme": preference.theme,
  });
};

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const installThemeBrowser = (
  options: {
    readonly bootstrap?: unknown;
    readonly cookieThrows?: boolean;
    readonly cookieFailure?: unknown;
    readonly storageThrows?: boolean;
    readonly storageFailure?: unknown;
  } = {}
) => {
  const bootstrap = options.bootstrap;
  const cookieFailure = options.cookieFailure;
  const cookieThrows: boolean = options.cookieThrows ?? false;
  const storageThrows: boolean = options.storageThrows ?? false;
  const storageFailure = options.storageFailure;
  const cookieWrites: string[] = [];
  const storageWrites: Array<readonly [string, string]> = [];
  const documentElement = {
    dataset: {} as Record<string, string>,
  };
  const documentStub: Record<string, unknown> = { documentElement };
  Object.defineProperty(documentStub, "cookie", {
    configurable: true,
    get: () => cookieWrites.at(-1) ?? "",
    set(value: string) {
      if (cookieFailure !== undefined) throw cookieFailure;
      if (cookieThrows) {
        throw new Error("cookie unavailable");
      }
      return cookieWrites.push(value);
    },
  });
  const setItem = vi.fn((key: string, value: string) => {
    if (storageFailure !== undefined) throw storageFailure;
    if (storageThrows) {
      throw new Error("storage unavailable");
    }
    return storageWrites.push([key, value]);
  });
  const windowStub: Record<string, unknown> = {
    location: { origin: "https://darkfactory.example" },
  };
  if (bootstrap !== undefined) windowStub["__DARKFACTORY_THEME__"] = bootstrap;
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("localStorage", { setItem });
  vi.stubGlobal("window", windowStub);
  return {
    cookieWrites,
    documentElement,
    setItem,
    storageWrites,
    windowStub,
  };
};

let capturedThemeStore: ReturnType<typeof useUiStoreApi> | undefined;

const ThemeStoreProbe = () => {
  capturedThemeStore = useUiStoreApi();
  return null;
};

const UiStateSelectionProbe = () =>
  createElement(
    "output",
    {},
    useUiState((state) => `${state.theme}:${state.density}`)
  );

const AuthorityProbe = () =>
  createElement("output", {
    "data-authority": useThemeAuthority(),
  });

const renderThemeRuntime = ({
  authority,
  child = null,
  initialPreference,
}: {
  readonly authority?: Parameters<typeof ThemeController>[0]["themeAuthority"];
  readonly child?: ReactNode;
  readonly initialPreference: Parameters<
    typeof ThemeController
  >[0]["initialPreference"];
}): string => {
  themeHookRuntime.begin();
  const children = createElement(
    "div",
    {},
    createElement(ThemeStoreProbe),
    child
  );
  return renderToStaticMarkup(
    authority === undefined
      ? createElement(ThemeController, { children, initialPreference })
      : createElement(ThemeController, {
          children,
          initialPreference,
          themeAuthority: authority,
        })
  );
};

afterEach(() => {
  themeHookRuntime.reset();
  themeComponentRuntime.reset();
  themeApiRuntime.reset();
  capturedThemeStore = undefined;
  vi.unstubAllGlobals();
  return void vi.restoreAllMocks();
});

describe("trusted theme controls", () => {
  it("keeps trusted and indeterminate ownership controls discoverable", () => {
    const trusted = renderToStaticMarkup(
      createElement(ThemeController, {
        children: createElement(ThemeMenu),
        initialPreference: {
          density: "compact",
          fontSize: "large",
          radius: "none",
          theme: "dracula",
        },
        themeAuthority: "trusted",
      })
    );
    const indeterminate = renderToStaticMarkup(
      createElement(ThemeController, {
        children: createElement(ThemeMenu),
        initialPreference: {
          density: "default",
          fontSize: "default",
          radius: "small",
          theme: "system",
        },
        themeAuthority: "indeterminate",
      })
    );
    expect(trusted).toContain('aria-label="Appearance settings"');
    expect(indeterminate).toContain(
      'aria-label="Appearance settings unavailable"'
    );
    expect(trusted).not.toMatch(/<button[^>]*\sdisabled(?:=| |>)/u);
    return expect(indeterminate).not.toMatch(
      /<button[^>]*\sdisabled(?:=| |>)/u
    );
  });

  it("composes the app store through the public semantic theme provider", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeController, {
        children: createElement(ThemeProbe),
        initialPreference: {
          density: "comfortable",
          fontSize: "default",
          radius: "none",
          theme: "github-dark",
        },
        themeAuthority: "anonymous",
      })
    );

    expect(markup).toContain('data-theme="github-dark"');
    expect(markup).toContain('data-font-size="default"');
    expect(markup).toContain('data-radius="none"');
    return expect(markup).toContain('data-density="comfortable"');
  });

  it("projects the same selected state through the client external-store snapshot", () => {
    const markup = renderToStaticMarkup(
      createElement(UiStateProvider, {
        children: createElement(UiStateSelectionProbe),
        initialPreference: {
          density: "comfortable",
          fontSize: "default",
          radius: "none",
          theme: "github-dark",
        },
      })
    );

    expect(markup).toContain("github-dark:comfortable");
    return expect(themeHookRuntime.clientSnapshot()).toBe(
      "github-dark:comfortable"
    );
  });

  it("fails closed when the semantic callback lacks anonymous authority", () => {
    for (const authority of ["trusted", "indeterminate"] as const) {
      let store: ReturnType<typeof useUiStoreApi> | undefined;
      let selectPreference:
        | ReturnType<typeof useTheme>["onPreferenceChange"]
        | undefined;
      const CaptureTheme = () => {
        store = useUiStoreApi();
        selectPreference = useTheme().onPreferenceChange;
        return null;
      };
      renderToStaticMarkup(
        createElement(ThemeController, {
          children: createElement(CaptureTheme),
          initialPreference: {
            density: "compact",
            fontSize: "large",
            radius: "none",
            theme: "dracula",
          },
          themeAuthority: authority,
        })
      );

      selectPreference?.({
        density: "comfortable",
        fontSize: "large",
        radius: "medium",
        theme: "github-light",
      });

      expect(store?.getState()).toMatchObject({
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      });
    }
  });

  it("keeps anonymous selection local and clears stale account feedback without a client", async () => {
    const store = createUiStore();
    const createClient = vi.fn();
    const errors: Array<string | null> = ["stale trusted error"];
    const pending: boolean[] = [true];

    await selectThemeMenuPreference({
      authority: "anonymous",
      authorityEpoch: () => 1,
      createClient,
      currentAuthority: () => "anonymous",
      nextPreference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      },
      requestSequence: { current: 1 },
      setError: (message) => errors.push(message),
      setPending: (value) => pending.push(value),
      store,
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(errors.at(-1)).toBeNull();
    expect(pending.at(-1)).toBe(false);
    return expect(store.getState()).toMatchObject({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
  });

  it("binds trusted GET then PATCH to the bounded same-origin transport", async () => {
    const store = createUiStore();
    const requests: Request[] = [];
    const fetchRequest: typeof globalThis.fetch = async (input, init) => {
      requests.push(
        input instanceof Request ? input : new Request(input, init)
      );
      return new Response(null, { status: 204 });
    };
    const clientFactory = (options: ApiClientOptions): ApiClient =>
      ({
        preferences: {
          theme: {
            get: async () => {
              await options.fetch!(
                new Request(new URL("/api/orpc", options.baseUrl).toString(), {
                  method: "GET",
                })
              );
              return {
                density: "default",
                fontSize: "default",
                radius: "small",
                theme: "system",
                updatedAt: new Date("2026-07-23T10:00:00.000Z"),
              };
            },
            update: async () => {
              await options.fetch!(
                new Request(new URL("/api/orpc", options.baseUrl).toString(), {
                  method: "PATCH",
                })
              );
              return {
                density: "compact",
                fontSize: "large",
                radius: "none",
                theme: "dracula",
                updatedAt: new Date("2026-07-23T10:00:00.001Z"),
              };
            },
          },
        },
      }) as unknown as ApiClient;
    const client = createThemePreferenceClient({
      baseUrl: "https://darkfactory.example/account",
      clientFactory,
      fetchRequest,
    });

    await selectThemeMenuPreference({
      authority: "trusted",
      authorityEpoch: () => 0,
      createClient: () => client,
      currentAuthority: () => "trusted",
      nextPreference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      },
      requestSequence: { current: 0 },
      setError: vi.fn(),
      setPending: vi.fn(),
      store,
    });

    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["GET", "https://darkfactory.example/api/orpc"],
      ["PATCH", "https://darkfactory.example/api/orpc"],
    ]);
    return expect(store.getState()).toMatchObject({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
  });

  it("clears trusted failure state before a later anonymous selection", async () => {
    const store = createUiStore();
    const errors: Array<string | null> = [];
    const pending: boolean[] = [];
    let getCount = 0;
    await selectThemeMenuPreference({
      authority: "trusted",
      authorityEpoch: () => 0,
      createClient: () => ({
        get: async () => {
          getCount += 1;
          if (getCount === 1) {
            return {
              density: "default",
              fontSize: "default",
              radius: "small",
              theme: "system",
              updatedAt: new Date("2026-07-23T10:00:00.000Z"),
            };
          }
          throw new Error("reconciliation unavailable");
        },
        async update() {
          throw new Error("response lost");
        },
      }),
      currentAuthority: () => "trusted",
      nextPreference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      },
      requestSequence: { current: 0 },
      setError: (message) => errors.push(message),
      setPending: (value) => pending.push(value),
      store,
    });
    expect(errors.at(-1)).toBe(
      "Could not confirm the appearance save. Reload before retrying."
    );

    const createClient = vi.fn();
    await selectThemeMenuPreference({
      authority: "anonymous",
      authorityEpoch: () => 1,
      createClient,
      currentAuthority: () => "anonymous",
      nextPreference: {
        density: "comfortable",
        fontSize: "large",
        radius: "medium",
        theme: "github-light",
      },
      requestSequence: { current: 1 },
      setError: (message) => errors.push(message),
      setPending: (value) => pending.push(value),
      store,
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(errors.at(-1)).toBeNull();
    expect(pending.at(-1)).toBe(false);
    return expect(store.getState()).toMatchObject({
      density: "comfortable",
      fontSize: "large",
      radius: "medium",
      theme: "github-light",
    });
  });

  it("keeps pending owned by the newest overlapping trusted selection", async () => {
    const store = createUiStore();
    const requestSequence = { current: 0 };
    const pending: boolean[] = [];
    const firstGet = deferred<ThemePreferenceOutput>();
    const secondGet = deferred<ThemePreferenceOutput>();
    const selection = (
      get: () => Promise<ThemePreferenceOutput>,
      preference: Readonly<AppearancePreference>
    ) =>
      selectThemeMenuPreference({
        authority: "trusted",
        authorityEpoch: () => 0,
        createClient: () => ({
          get,
          update: async () => ({
            ...preference,
            updatedAt: new Date("2026-07-23T10:00:00.001Z"),
          }),
        }),
        currentAuthority: () => "trusted",
        nextPreference: preference,
        requestSequence,
        setError: vi.fn(),
        setPending: (value) => pending.push(value),
        store,
      });

    const first = selection(async () => firstGet.promise, {
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
    const second = selection(async () => secondGet.promise, {
      density: "comfortable",
      fontSize: "large",
      radius: "medium",
      theme: "github-light",
    });
    firstGet.resolve({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: new Date("2026-07-23T10:00:00.000Z"),
    });

    await first;
    expect(pending.at(-1)).toBe(true);

    secondGet.resolve({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: new Date("2026-07-23T10:00:00.000Z"),
    });
    await second;
    return expect(pending.at(-1)).toBe(false);
  });

  it("neutralizes anonymous subscriptions before a soft transition applies trusted state", () => {
    const store = createUiStore();
    const writes: string[] = [];
    const unsubscribe = store.subscribe(() =>
      writes.push("anonymous persistence")
    );
    const authorityChanges: string[] = [];

    reconcileThemeAuthorityTransition({
      authority: "trusted",
      bootstrapPreference: {
        density: "default",
        fontSize: "large",
        radius: "small",
        theme: "synthwave-84",
      },
      initialPreference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      },
      onAuthorityChange: (authority) => authorityChanges.push(authority),
      store,
      unsubscribe,
    });

    expect(authorityChanges).toEqual(["trusted"]);
    expect(writes).toEqual([]);
    return expect(store.getState()).toMatchObject({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
  });

  it("consumes pre-hydration bootstrap once and never reverts a soft refresh", () => {
    const store = createUiStore();
    const consumption = { consumed: false };
    const bootstrapA = {
      density: "compact",
      fontSize: "small",
      radius: "medium",
      theme: "night-owl",
    } as const;
    const preferenceB = {
      density: "compact",
      fontSize: "default",
      radius: "medium",
      theme: "one-dark",
    } as const;
    let previousAuthority: "anonymous" | "trusted" | undefined;
    const apply = (
      authority: "anonymous" | "trusted",
      initialPreference: typeof preferenceB | typeof bootstrapA
    ) => {
      const priorAuthority = previousAuthority;
      return void reconcileThemeAuthorityTransition({
        authority,
        bootstrapPreference: consumeInitialThemeBootstrap(
          authority,
          consumption,
          bootstrapA
        ),
        initialPreference,
        onAuthorityChange: (nextAuthority) => {
          return void (previousAuthority = nextAuthority as
            | "anonymous"
            | "trusted");
        },
        previousAuthority: priorAuthority,
        store,
      });
    };

    apply("anonymous", preferenceB);
    expect(store.getState()).toMatchObject(bootstrapA);
    store.setState(preferenceB);
    apply("anonymous", bootstrapA);
    expect(store.getState()).toMatchObject(preferenceB);
    apply("trusted", preferenceB);
    apply("anonymous", preferenceB);
    expect(consumption.consumed).toBe(true);
    return expect(store.getState()).toMatchObject(preferenceB);
  });

  it("consumes non-anonymous bootstrap authority once without exposing the payload", () => {
    for (const authority of ["trusted", "indeterminate"] as const) {
      const consumption = { consumed: false };
      expect(
        consumeInitialThemeBootstrap(authority, consumption, {
          density: "compact",
          fontSize: "large",
          radius: "none",
          theme: "dracula",
        })
      ).toBeUndefined();
      expect(consumption.consumed).toBe(true);
      expect(
        consumeInitialThemeBootstrap(authority, consumption, {
          density: "comfortable",
          fontSize: "large",
          radius: "medium",
          theme: "github-light",
        })
      ).toBeUndefined();
    }
  });

  it("rejects every malformed bootstrap shape and avoids redundant store writes", () => {
    const initialPreference = {
      density: "default",
      fontSize: "default",
      radius: "medium",
      theme: "system",
    } as const;
    for (const bootstrapPreference of [
      undefined,
      null,
      false,
      "dark:rose",
      [],
      {},
      {
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "invalid",
      },
      {
        density: "default",
        fontSize: "huge",
        radius: "small",
        theme: "dracula",
      },
      {
        density: "dense",
        fontSize: "large",
        radius: "small",
        theme: "dracula",
      },
      {
        density: "compact",
        fontSize: "large",
        radius: "round",
        theme: "dracula",
      },
    ]) {
      const store = createUiStore();
      const setState = vi.spyOn(store, "setState");
      reconcileThemeAuthorityTransition({
        authority: "anonymous",
        bootstrapPreference,
        initialPreference,
        onAuthorityChange: vi.fn(),
        previousAuthority: "trusted",
        store,
      });
      expect(store.getState()).toMatchObject(initialPreference);
      expect(setState).not.toHaveBeenCalled();
    }

    const store = createUiStore();
    reconcileThemeAuthorityTransition({
      authority: "trusted",
      bootstrapPreference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      },
      initialPreference: {
        density: "comfortable",
        fontSize: "large",
        radius: "medium",
        theme: "github-light",
      },
      onAuthorityChange: vi.fn(),
      store,
    });
    expect(store.getState()).toMatchObject({
      density: "comfortable",
      fontSize: "large",
      radius: "medium",
      theme: "github-light",
    });

    const refreshedStore = createUiStore();
    reconcileThemeAuthorityTransition({
      authority: "anonymous",
      bootstrapPreference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      },
      initialPreference,
      onAuthorityChange: vi.fn(),
      previousAuthority: "anonymous",
      store: refreshedStore,
    });
    return expect(refreshedStore.getState()).toMatchObject({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
  });

  it("defaults to anonymous authority and applies semantic theme selections locally", () => {
    let store: ReturnType<typeof useUiStoreApi> | undefined;
    let selectPreference:
      | ReturnType<typeof useTheme>["onPreferenceChange"]
      | undefined;
    const CaptureTheme = () => {
      store = useUiStoreApi();
      selectPreference = useTheme().onPreferenceChange;
      return createElement(AuthorityProbe);
    };
    const html = renderToStaticMarkup(
      createElement(ThemeController, {
        children: createElement(CaptureTheme),
        initialPreference: {
          density: "default",
          fontSize: "default",
          radius: "small",
          theme: "system",
        },
      })
    );

    expect(html).toContain('data-authority="anonymous"');
    selectPreference?.({
      density: "comfortable",
      fontSize: "small",
      radius: "large",
      theme: "tokyo-night",
    });
    return expect(store?.getState()).toMatchObject({
      density: "comfortable",
      fontSize: "small",
      radius: "large",
      theme: "tokyo-night",
    });
  });

  it("ignores menu selection while theme authority is indeterminate", async () => {
    const store = createUiStore();
    const createClient = vi.fn();
    const setError = vi.fn();
    const setPending = vi.fn();

    await selectThemeMenuPreference({
      authority: "indeterminate",
      authorityEpoch: () => 0,
      createClient,
      currentAuthority: () => "indeterminate",
      nextPreference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "dracula",
      },
      requestSequence: { current: 0 },
      setError,
      setPending,
      store,
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
    expect(setPending).not.toHaveBeenCalled();
    return expect(store.getState()).toMatchObject(DEFAULT_ANONYMOUS_THEME);
  });

  it("surfaces failed and reconciled trusted selections with deterministic feedback", async () => {
    const cases = [
      {
        expected: "Could not save appearance settings. Try again.",
        get: vi.fn(async () => {
          throw new Error("account unavailable");
        }),
        update: vi.fn(async () => {
          throw new Error("update must not run after a failed read");
        }),
      },
      {
        expected:
          "Appearance settings were refreshed from your account. Review them before trying again.",
        get: vi
          .fn()
          .mockResolvedValueOnce({
            density: "default",
            fontSize: "default",
            radius: "small",
            theme: "system",
            updatedAt: new Date("2026-07-23T10:00:00.000Z"),
          })
          .mockResolvedValueOnce({
            density: "comfortable",
            fontSize: "large",
            radius: "medium",
            theme: "github-light",
            updatedAt: new Date("2026-07-23T10:00:00.001Z"),
          }),
        update: vi.fn(async () => {
          throw new Error("write response unavailable");
        }),
      },
    ] as const;

    for (const testCase of cases) {
      const store = createUiStore();
      const errors: Array<string | null> = [];
      const pending: boolean[] = [];
      await selectThemeMenuPreference({
        authority: "trusted",
        authorityEpoch: () => 0,
        createClient: () => ({
          get: testCase.get,
          update: testCase.update,
        }),
        currentAuthority: () => "trusted",
        nextPreference: {
          density: "compact",
          fontSize: "large",
          radius: "none",
          theme: "dracula",
        },
        requestSequence: { current: 0 },
        setError: (value) => errors.push(value),
        setPending: (value) => pending.push(value),
        store,
      });
      expect(errors).toEqual([null, testCase.expected]);
      expect(pending).toEqual([true, false]);
    }
  });

  it("leaves stale trusted requests pending for their replacement owner", async () => {
    for (const staleBoundary of ["authority", "epoch", "sequence"] as const) {
      const store = createUiStore();
      const gate = deferred<ThemePreferenceOutput>();
      const requestSequence = { current: 0 };
      const errors: Array<string | null> = [];
      const pending: boolean[] = [];
      let currentAuthority: "anonymous" | "trusted" = "trusted";
      let currentEpoch = 0;
      const update = vi.fn(async () => ({
        density: "compact" as const,
        fontSize: "large" as const,
        radius: "none" as const,
        theme: "dracula" as const,
        updatedAt: new Date("2026-07-23T10:00:00.001Z"),
      }));
      const selection = selectThemeMenuPreference({
        authority: "trusted",
        authorityEpoch: () => currentEpoch,
        createClient: () => ({
          get: async () => gate.promise,
          update,
        }),
        currentAuthority: () => currentAuthority,
        nextPreference: {
          density: "compact",
          fontSize: "large",
          radius: "none",
          theme: "dracula",
        },
        requestSequence,
        setError: (value) => errors.push(value),
        setPending: (value) => pending.push(value),
        store,
      });
      await flushMicrotasks();
      switch (staleBoundary) {
        case "authority": {
          currentAuthority = "anonymous";
          break;
        }
        case "epoch": {
          currentEpoch = 1;
          break;
        }
        case "sequence": {
          requestSequence.current += 1;
          break;
        }
        default: {
          throw new Error(`Unhandled stale boundary: ${String(staleBoundary)}`);
        }
      }
      gate.resolve({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: new Date("2026-07-23T10:00:00.000Z"),
      });
      await selection;

      expect(update).not.toHaveBeenCalled();
      expect(errors).toEqual([null]);
      expect(pending).toEqual([true]);
    }
  });

  it("hydrates anonymous browser state, synchronizes mutations, and cleans stale subscriptions", async () => {
    const initialPreference = {
      density: "compact",
      fontSize: "default",
      radius: "medium",
      theme: "one-dark",
    } as const;
    const bootstrap = {
      density: "compact",
      fontSize: "small",
      radius: "medium",
      theme: "night-owl",
    } as const;
    const browser = installThemeBrowser({ bootstrap });
    const render = (authority: "anonymous" | "trusted") =>
      renderThemeRuntime({
        authority,
        initialPreference,
      });

    render("anonymous");
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    expect(browser.windowStub).not.toHaveProperty("__DARKFACTORY_THEME__");
    expect(capturedThemeStore?.getState()).toMatchObject(bootstrap);
    expect(browser.documentElement.dataset).toEqual(bootstrap);

    const store = capturedThemeStore;
    if (store === undefined)
      throw new Error("Expected the theme store to render.");
    const originalSubscribe = store.subscribe.bind(store);
    const unsubscribe = vi.fn();
    vi.spyOn(store, "subscribe").mockImplementation((listener) => {
      const stop = originalSubscribe(listener);
      return () => {
        unsubscribe();
        return void stop();
      };
    });

    render("anonymous");
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    expect(browser.storageWrites.at(-1)).toEqual([
      THEME_STORAGE_KEY,
      serializeAnonymousThemePreference(bootstrap),
    ]);
    expect(browser.cookieWrites.at(-1)).toBe(serializeThemeCookie(bootstrap));
    await vi.dynamicImportSettled();
    await flushMicrotasks();
    render("anonymous");
    expect(themeComponentRuntime.toaster()["theme"]).toBe("dark");

    store.setState({
      density: "default",
      fontSize: "small",
      radius: "large",
      theme: "default-light",
    });
    expect(browser.documentElement.dataset).toEqual({
      density: "default",
      fontSize: "small",
      radius: "large",
      theme: "default-light",
    });
    expect(browser.storageWrites.at(-1)?.[1]).toBe(
      serializeAnonymousThemePreference({
        density: "default",
        fontSize: "small",
        radius: "large",
        theme: "default-light",
      })
    );
    expect(browser.cookieWrites.at(-1)).toBe(
      serializeThemeCookie({
        density: "default",
        fontSize: "small",
        radius: "large",
        theme: "default-light",
      })
    );

    render("trusted");
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    themeHookRuntime.reset();
    return expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("keeps browser persistence best-effort for blocked and non-anonymous authorities", () => {
    const initialPreference = {
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    } as const;
    const cases = [
      {
        authority: "anonymous" as const,
        cookieThrows: false,
        expectedCookies: 1,
        expectedStorage: 1,
        storageThrows: true,
      },
      {
        authority: "anonymous" as const,
        cookieThrows: true,
        expectedCookies: 0,
        expectedStorage: 1,
        storageThrows: false,
      },
      {
        authority: "trusted" as const,
        cookieThrows: false,
        expectedCookies: 1,
        expectedStorage: 0,
        storageThrows: false,
      },
      {
        authority: "indeterminate" as const,
        cookieThrows: false,
        expectedCookies: 0,
        expectedStorage: 0,
        storageThrows: false,
      },
    ];

    for (const testCase of cases) {
      themeHookRuntime.reset();
      themeComponentRuntime.reset();
      capturedThemeStore = undefined;
      vi.unstubAllGlobals();
      const browser = installThemeBrowser({
        cookieThrows: testCase.cookieThrows,
        storageThrows: testCase.storageThrows,
      });
      const render = () =>
        renderThemeRuntime({
          authority: testCase.authority,
          initialPreference,
        });
      render();
      themeHookRuntime.commitLayouts();
      themeHookRuntime.commitEffects();
      render();
      themeHookRuntime.commitLayouts();
      themeHookRuntime.commitEffects();

      expect(browser.setItem).toHaveBeenCalledTimes(testCase.expectedStorage);
      expect(browser.cookieWrites).toHaveLength(testCase.expectedCookies);
      expect(browser.documentElement.dataset).toEqual(initialPreference);
    }
  });

  it("propagates non-object browser persistence failures", () => {
    const initialPreference = {
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    } as const;
    const observeFailure = (
      options: Readonly<{
        cookieFailure?: unknown;
        storageFailure?: unknown;
      }>
    ) => {
      themeHookRuntime.reset();
      themeComponentRuntime.reset();
      capturedThemeStore = undefined;
      vi.unstubAllGlobals();
      const browser = installThemeBrowser(options);
      const render = () =>
        renderThemeRuntime({
          authority: "anonymous",
          initialPreference,
        });
      render();
      themeHookRuntime.commitLayouts();
      themeHookRuntime.commitEffects();
      render();
      themeHookRuntime.commitLayouts();
      let thrown: unknown;
      try {
        themeHookRuntime.commitEffects();
      } catch (error) {
        thrown = error;
      }
      return { browser, thrown };
    };

    const storage = observeFailure({
      storageFailure: "primitive storage failure",
    });
    expect(storage.thrown).toBe("primitive storage failure");
    expect(storage.browser.documentElement.dataset).toEqual(initialPreference);

    const cookie = observeFailure({
      cookieFailure: "primitive cookie failure",
    });
    expect(cookie.thrown).toBe("primitive cookie failure");
    return expect(cookie.browser.documentElement.dataset).toEqual(
      initialPreference
    );
  });

  it("renders trusted save, failure, and retry states through the menu controller", async () => {
    installThemeBrowser();
    const firstGet = deferred<ThemePreferenceOutput>();
    let getCount = 0;
    const get = vi.fn((): Promise<ThemePreferenceOutput> => {
      getCount += 1;
      if (getCount === 1) return firstGet.promise;
      return Promise.resolve({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: new Date("2026-07-23T10:00:00.000Z"),
      });
    });
    const update = vi.fn(async () => ({
      density: "compact" as const,
      fontSize: "large" as const,
      radius: "none" as const,
      theme: "dracula" as const,
      updatedAt: new Date("2026-07-23T10:00:00.001Z"),
    }));
    themeApiRuntime.configure(
      () =>
        ({
          preferences: { theme: { get, update } },
        }) as unknown as ApiClient
    );
    const initialPreference = {
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    } as const;
    const render = () =>
      renderThemeRuntime({
        authority: "trusted",
        child: createElement(ThemeMenu),
        initialPreference,
      });

    render();
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: false,
      error: null,
      statusMessage: null,
      triggerLabel: "Appearance settings",
    });
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    render();
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();

    const select = themeComponentRuntime.picker()["onPreferenceChange"];
    if (typeof select !== "function")
      throw new Error("Expected a theme selection callback.");
    select({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
    render();
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: true,
      error: null,
      statusMessage: "Saving appearance settings.",
      triggerLabel: "Saving appearance settings",
    });
    expect(themeApiRuntime.options()).toHaveLength(1);
    expect(themeApiRuntime.options()[0]?.baseUrl).toBe(
      "https://darkfactory.example"
    );
    expect(themeApiRuntime.options()[0]?.fetch).toEqual(expect.any(Function));

    firstGet.reject(new Error("account unavailable"));
    await flushMicrotasks();
    render();
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: false,
      error: "Could not save appearance settings. Try again.",
      statusMessage: null,
      triggerLabel: "Appearance settings",
    });

    const retry = themeComponentRuntime.picker()["onPreferenceChange"];
    if (typeof retry !== "function")
      throw new Error("Expected a theme retry callback.");
    retry({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
    render();
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: true,
      error: null,
      triggerLabel: "Saving appearance settings",
    });
    await flushMicrotasks();
    render();
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: false,
      error: null,
      triggerLabel: "Appearance settings",
    });
    expect(update).toHaveBeenCalledTimes(1);
    return expect(capturedThemeStore?.getState()).toMatchObject({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
  });

  it("invalidates an in-flight trusted menu request when authority changes or unmounts", async () => {
    installThemeBrowser();
    const getGate = deferred<ThemePreferenceOutput>();
    const update = vi.fn(async () => ({
      density: "compact" as const,
      fontSize: "large" as const,
      radius: "none" as const,
      theme: "dracula" as const,
      updatedAt: new Date("2026-07-23T10:00:00.001Z"),
    }));
    themeApiRuntime.configure(
      () =>
        ({
          preferences: {
            theme: {
              get: async () => getGate.promise,
              update,
            },
          },
        }) as unknown as ApiClient
    );
    const initialPreference = {
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    } as const;
    const render = (authority: "anonymous" | "indeterminate" | "trusted") =>
      renderThemeRuntime({
        authority,
        child: createElement(ThemeMenu),
        initialPreference,
      });

    render("trusted");
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    const select = themeComponentRuntime.picker()["onPreferenceChange"];
    if (typeof select !== "function")
      throw new Error("Expected a theme selection callback.");
    select({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "dracula",
    });
    render("trusted");
    expect(themeComponentRuntime.picker()["triggerLabel"]).toBe(
      "Saving appearance settings"
    );

    render("anonymous");
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: true,
      statusMessage: "Saving appearance settings.",
      triggerLabel: "Saving appearance settings",
    });
    themeHookRuntime.commitLayouts();
    render("anonymous");
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: false,
      error: null,
      statusMessage: null,
      triggerLabel: "Appearance settings",
    });

    getGate.resolve({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: new Date("2026-07-23T10:00:00.000Z"),
    });
    await flushMicrotasks();
    render("anonymous");
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: false,
      error: null,
      triggerLabel: "Appearance settings",
    });
    expect(update).not.toHaveBeenCalled();

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    capturedThemeStore = undefined;
    render("indeterminate");
    expect(themeComponentRuntime.picker()).toMatchObject({
      disabled: true,
      error: null,
      statusMessage: "Appearance settings are unavailable.",
      triggerLabel: "Appearance settings unavailable",
    });
    themeHookRuntime.commitLayouts();
    return themeHookRuntime.reset();
  });

  it("makes only the public shell inert while mobile navigation is open and restores it on cleanup", () => {
    let publicStore: UiStore | undefined;
    const requiredPublicStore = (store: UiStore | undefined): UiStore => {
      if (store === undefined)
        throw new Error("Expected the public UI store to render.");
      return store;
    };
    const renderPublic = (open: boolean): string => {
      const PreparePublicShell = () => {
        publicStore = useUiStoreApi();
        publicStore.getState().setMobileNavigationOpen(open);
        return createElement(PublicShell, {
          children: createElement("h1", {}, "Public content"),
        });
      };
      themeHookRuntime.begin();
      return renderToStaticMarkup(
        createElement(UiStateProvider, {
          children: createElement(PreparePublicShell),
          initialPreference: DEFAULT_ANONYMOUS_THEME,
        })
      );
    };

    renderPublic(false);
    const closedShell = { inert: false };
    themeHookRuntime.ref(0).current = { parentElement: closedShell };
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    expect(closedShell.inert).toBe(false);

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    publicStore = undefined;
    renderPublic(true);
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    expect(
      requiredPublicStore(publicStore).getState().mobileNavigationOpen
    ).toBe(true);

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    publicStore = undefined;
    renderPublic(true);
    themeHookRuntime.ref(0).current = { parentElement: null };
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    expect(
      requiredPublicStore(publicStore).getState().mobileNavigationOpen
    ).toBe(true);

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    publicStore = undefined;
    renderPublic(true);
    const openShell = { inert: false };
    themeHookRuntime.ref(0).current = { parentElement: openShell };
    themeHookRuntime.commitLayouts();
    themeHookRuntime.commitEffects();
    expect(openShell.inert).toBe(true);

    const dialog = themeComponentRuntime.dialogs().at(-1);
    const onOpenChange = dialog?.["onOpenChange"];
    if (typeof onOpenChange !== "function")
      throw new Error("Expected public navigation dialog state.");
    onOpenChange(false);
    expect(
      requiredPublicStore(publicStore).getState().mobileNavigationOpen
    ).toBe(false);
    onOpenChange(true);
    expect(
      requiredPublicStore(publicStore).getState().mobileNavigationOpen
    ).toBe(true);

    const mobileNavigation = themeComponentRuntime
      .navigationLinks()
      .find((props) => props["orientation"] === "vertical");
    const onNavigate = mobileNavigation?.["onNavigate"];
    if (typeof onNavigate !== "function")
      throw new Error("Expected mobile navigation cleanup.");
    onNavigate();
    expect(
      requiredPublicStore(publicStore).getState().mobileNavigationOpen
    ).toBe(false);

    themeHookRuntime.reset();
    return expect(openShell.inert).toBe(false);
  });

  return it("renders public header, footer, sign-in, and navigation suppression branches", () => {
    const renderRoutes = (availableRoutes?: readonly string[]): string => {
      themeHookRuntime.begin();
      const shell =
        availableRoutes === undefined
          ? createElement(PublicShell, {
              children: createElement("h1", {}, "Default public content"),
            })
          : createElement(PublicShell, {
              availableRoutes,
              children: createElement("h1", {}, "Scoped public content"),
            });
      return renderToStaticMarkup(
        createElement(UiStateProvider, {
          children: shell,
          initialPreference: DEFAULT_ANONYMOUS_THEME,
        })
      );
    };

    const defaultHtml = renderRoutes();
    expect(defaultHtml).toContain("Default public content");
    expect(defaultHtml).toContain('aria-label="Primary navigation"');
    expect(defaultHtml).toContain('aria-label="Footer navigation"');

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    const suppressed = renderRoutes(["/"]);
    expect(suppressed).toContain("Scoped public content");
    expect(suppressed).not.toContain('aria-label="Primary navigation"');
    expect(suppressed).not.toContain('aria-label="Footer navigation"');
    expect(suppressed).not.toContain('aria-label="Open navigation"');

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    const withoutSignIn = renderRoutes(["/", "/contact"]);
    expect(withoutSignIn).toContain('aria-label="Primary navigation"');
    expect(withoutSignIn).toContain('aria-label="Footer navigation"');
    expect(withoutSignIn).toContain('href="/contact"');
    expect(withoutSignIn).not.toContain('href="/sign-in"');

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    const withSignIn = renderRoutes(["/", "/sign-in"]);
    expect(withSignIn.match(/href="\/sign-in"/gu)).toHaveLength(2);
    expect(withSignIn).not.toContain('href="/contact"');

    themeHookRuntime.reset();
    themeComponentRuntime.reset();
    themeHookRuntime.begin();
    const defaults = renderToStaticMarkup(
      createElement(UiStateProvider, {
        children: createElement(
          "div",
          {},
          createElement(PublicHeader),
          createElement(PublicFooter)
        ),
        initialPreference: DEFAULT_ANONYMOUS_THEME,
      })
    );
    expect(defaults).toContain('aria-label="Primary navigation"');
    return expect(defaults).toContain('aria-label="Footer navigation"');
  });
});
