"use client";

import {
  DEFAULT_UI_PREFERENCES,
  parseAppearancePreference,
} from "@darkfactory/state";
import {
  createUiStore,
  UI_STATE_VERSION,
  type UiState,
  type UiStateSnapshot,
  type UiStore,
} from "@darkfactory/state/client";
import {
  createContext,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type AnonymousThemePreference,
  DEFAULT_ANONYMOUS_THEME,
  MAX_ANONYMOUS_THEME_SNAPSHOT_LENGTH,
} from "./theme.ts";

interface AnonymousThemeSnapshot extends AnonymousThemePreference {
  readonly version: typeof UI_STATE_VERSION;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const SNAPSHOT_KEYS = Object.freeze([
  "version",
  "theme",
  "fontSize",
  "density",
  "radius",
]);

export const parseAnonymousThemeSnapshot = (
  serializedSnapshot: unknown
): Readonly<AnonymousThemeSnapshot> | null => {
  if (
    typeof serializedSnapshot !== "string" ||
    serializedSnapshot.length === 0 ||
    serializedSnapshot.length > MAX_ANONYMOUS_THEME_SNAPSHOT_LENGTH
  )
    return null;

  try {
    const snapshot = JSON.parse(serializedSnapshot) as unknown;
    if (!isRecord(snapshot)) return null;
    const keys = Object.keys(snapshot);
    const appearance = parseAppearancePreference(snapshot);
    if (
      keys.length !== SNAPSHOT_KEYS.length ||
      !keys.every((key) => SNAPSHOT_KEYS.includes(key)) ||
      snapshot["version"] !== UI_STATE_VERSION ||
      appearance === null
    )
      return null;
    return { version: UI_STATE_VERSION, ...appearance };
  } catch {
    return null;
  }
};

export const serializeAnonymousThemePreference = (
  preference: Readonly<AnonymousThemePreference>
): string =>
  JSON.stringify({
    density: preference.density,
    fontSize: preference.fontSize,
    radius: preference.radius,
    theme: preference.theme,
    version: UI_STATE_VERSION,
  });

export const createAnonymousUiStateSnapshot = (
  preference: Readonly<AnonymousThemePreference>
): UiStateSnapshot => ({
  state: {
    ...DEFAULT_UI_PREFERENCES,
    density: preference.density,
    fontSize: preference.fontSize,
    radius: preference.radius,
    theme: preference.theme,
  },
  version: UI_STATE_VERSION,
});

const UiStoreContext = createContext<UiStore | null>(null);
const UiStoreProvider = UiStoreContext.Provider;

export const UiStateProvider = ({
  children,
  initialPreference,
}: {
  readonly children: ReactNode;
  readonly initialPreference: Readonly<AnonymousThemePreference>;
}) => {
  const [store] = useState(() => {
    const createdStore = createUiStore();
    createdStore
      .getState()
      .hydrate(
        JSON.stringify(createAnonymousUiStateSnapshot(initialPreference))
      );
    return createdStore;
  });
  return <UiStoreProvider value={store}>{children}</UiStoreProvider>;
};

export const useUiStoreApi = (): UiStore => {
  const store = useContext(UiStoreContext);
  if (store === null) throw new Error("UiStateProvider is required.");
  return store;
};

export const useUiState = <Selection,>(
  selector: (state: UiState) => Selection
): Selection => {
  const store = useUiStoreApi();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
};

export const parseAnonymousThemePreference = (
  serializedSnapshot: unknown
): Readonly<AnonymousThemePreference> => {
  const snapshot = parseAnonymousThemeSnapshot(serializedSnapshot);
  if (snapshot === null) return DEFAULT_ANONYMOUS_THEME;
  return {
    density: snapshot.density,
    fontSize: snapshot.fontSize,
    radius: snapshot.radius,
    theme: snapshot.theme,
  };
};
