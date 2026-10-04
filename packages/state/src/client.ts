"use client";

import { createStore, type StoreApi } from "zustand/vanilla";

import {
  type ConsentState,
  DEFAULT_UI_PREFERENCES,
  type Density,
  type FontSize,
  isConsentState,
  isDensity,
  isFontSize,
  isRadius,
  isTheme,
  type Radius,
  type SidebarState,
  type Theme,
  type UiPreferences,
} from "./index.ts";

export const UI_STATE_VERSION = 2 as const;

export interface UiStateSnapshot {
  readonly state: Readonly<UiPreferences>;
  readonly version: typeof UI_STATE_VERSION;
}

export interface UiState extends UiPreferences {
  readonly closeMobileNavigation: () => void;
  readonly dehydrate: () => UiStateSnapshot;
  readonly hydrate: (snapshot: unknown) => boolean;
  readonly reset: () => void;
  readonly setConsent: (consent: ConsentState) => void;
  readonly setDensity: (density: Density) => void;
  readonly setFontSize: (fontSize: FontSize) => void;
  readonly setMobileNavigationOpen: (isOpen: boolean) => void;
  readonly setRadius: (radius: Radius) => void;
  readonly setSidebar: (sidebar: SidebarState) => void;
  readonly setTheme: (theme: Theme) => void;
  readonly toggleSidebar: () => void;
}

export type UiStore = StoreApi<UiState>;

export const MAX_UI_STATE_SNAPSHOT_LENGTH = 512 as const;

const snapshotKeys = Object.freeze(["version", "state"] as const);
const preferenceKeys = Object.freeze([
  "sidebar",
  "mobileNavigationOpen",
  "theme",
  "fontSize",
  "density",
  "radius",
  "consent",
] as const);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean => {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
};

const isSidebarState = (value: unknown): value is SidebarState => {
  return value === "expanded" || value === "collapsed";
};

const parseJsonSnapshot = (value: unknown): UiStateSnapshot | null => {
  let snapshotValue: Record<string, unknown>;
  if (isRecord(value) && hasExactKeys(value, snapshotKeys)) {
    snapshotValue = value;
  } else {
    return null;
  }
  const version = snapshotValue["version"];
  const state = snapshotValue["state"];
  if (version !== UI_STATE_VERSION) return null;
  if (!isRecord(state)) return null;
  if (!hasExactKeys(state, preferenceKeys)) return null;

  const sidebar = state["sidebar"];
  const mobileNavigationOpen = state["mobileNavigationOpen"];
  const theme = state["theme"];
  const fontSize = state["fontSize"];
  const density = state["density"];
  const radius = state["radius"];
  const consent = state["consent"];

  if (
    !isSidebarState(sidebar) ||
    typeof mobileNavigationOpen !== "boolean" ||
    !isTheme(theme) ||
    !isFontSize(fontSize) ||
    !isDensity(density) ||
    !isRadius(radius) ||
    !isConsentState(consent)
  )
    return null;

  return {
    state: {
      consent,
      density,
      fontSize,
      mobileNavigationOpen,
      radius,
      sidebar,
      theme,
    },
    version: UI_STATE_VERSION,
  };
};

export const parseUiStateSnapshot = (
  serializedSnapshot: unknown
): UiStateSnapshot | null => {
  if (typeof serializedSnapshot !== "string") return null;
  if (serializedSnapshot.length > MAX_UI_STATE_SNAPSHOT_LENGTH) return null;

  try {
    return parseJsonSnapshot(JSON.parse(serializedSnapshot) as unknown);
  } catch {
    return null;
  }
};

const copyPreferences = (
  preferences: Readonly<UiPreferences>
): UiPreferences => ({
  consent: preferences.consent,
  density: preferences.density,
  fontSize: preferences.fontSize,
  mobileNavigationOpen: preferences.mobileNavigationOpen,
  radius: preferences.radius,
  sidebar: preferences.sidebar,
  theme: preferences.theme,
});

export const createUiStore = (): UiStore =>
  createStore<UiState>()((set, get) => ({
    ...copyPreferences(DEFAULT_UI_PREFERENCES),
    closeMobileNavigation: () => set({ mobileNavigationOpen: false }),
    dehydrate: () => ({
      state: copyPreferences(get()),
      version: UI_STATE_VERSION,
    }),
    hydrate: (serializedSnapshot) => {
      const snapshot = parseUiStateSnapshot(serializedSnapshot);
      if (snapshot === null) {
        return false;
      }
      set(copyPreferences(snapshot.state));
      return true;
    },
    reset: () => set(copyPreferences(DEFAULT_UI_PREFERENCES)),
    setConsent: (consent) => {
      if (isConsentState(consent)) return set({ consent });
      return;
    },
    setDensity: (density) => {
      if (isDensity(density)) return set({ density });
      return;
    },
    setFontSize: (fontSize) => {
      if (isFontSize(fontSize)) return set({ fontSize });
      return;
    },
    setMobileNavigationOpen: (mobileNavigationOpen) => {
      if (typeof mobileNavigationOpen === "boolean") {
        return set({ mobileNavigationOpen });
      }
      return;
    },
    setRadius: (radius) => {
      if (isRadius(radius)) return set({ radius });
      return;
    },
    setSidebar: (sidebar) => {
      if (isSidebarState(sidebar)) return set({ sidebar });
      return;
    },
    setTheme: (theme) => {
      if (isTheme(theme)) return set({ theme });
      return;
    },
    toggleSidebar: () =>
      set((state) => ({
        sidebar: state.sidebar === "expanded" ? "collapsed" : "expanded",
      })),
  }));
