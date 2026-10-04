"use client";

import {
  isSameAppearance,
  parseAppearancePreference,
} from "@darkfactory/state";
import type { UiStore } from "@darkfactory/state/client";
import { ThemeProvider } from "@darkfactory/ui/client/theme";
import { themeColorScheme } from "@darkfactory/ui/themes";
import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type AnonymousThemePreference,
  serializeThemeCookie,
  THEME_STORAGE_KEY,
  type ThemeAuthority,
  themeDomAttributes,
} from "../lib/theme.ts";
import {
  serializeAnonymousThemePreference,
  UiStateProvider,
  useUiState,
  useUiStoreApi,
} from "../lib/ui-store.tsx";

// Sonner and its styles load after hydration so public pages do not pay for an unused toaster.
const LazyToaster = lazy(async () => {
  const module = await import("@darkfactory/ui/client/toaster");
  return { default: module.Toaster };
});

const appearanceOf = (store: UiStore): AnonymousThemePreference => {
  const { density, fontSize, radius, theme } = store.getState();
  return { density, fontSize, radius, theme };
};

const applyTheme = (store: UiStore): void => {
  const attributes = themeDomAttributes(appearanceOf(store));
  const root = document.documentElement;
  root.dataset["theme"] = attributes["data-theme"];
  root.dataset["fontSize"] = attributes["data-font-size"];
  root.dataset["density"] = attributes["data-density"];
  root.dataset["radius"] = attributes["data-radius"];
};

const persistThemeState = (store: UiStore, authority: ThemeAuthority): void => {
  if (authority === "indeterminate") return;
  const preference = appearanceOf(store);
  if (authority === "anonymous") {
    try {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        serializeAnonymousThemePreference(preference)
      );
    } catch (error) {
      if (typeof error !== "object" || error === null) throw error;
      // Storage can be unavailable in privacy modes; the in-memory preference remains valid.
    }
  }
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is unavailable in supported Firefox/Safari versions; this mirror is best effort.
    document.cookie = serializeThemeCookie(preference);
  } catch (error) {
    if (typeof error !== "object" || error === null) throw error;
    // Cookie mirroring is best effort when the browser blocks persistence.
  }
};

export interface ThemeBootstrapConsumption {
  consumed: boolean;
}

export const consumeInitialThemeBootstrap = (
  authority: ThemeAuthority,
  consumption: ThemeBootstrapConsumption,
  bootstrapPreference: unknown
): unknown => {
  if (consumption.consumed) return undefined;
  consumption.consumed = true;
  return authority === "anonymous" ? bootstrapPreference : undefined;
};

export const reconcileThemeAuthorityTransition = ({
  authority,
  bootstrapPreference,
  initialPreference,
  onAuthorityChange,
  previousAuthority,
  store,
  unsubscribe,
}: {
  readonly authority: ThemeAuthority;
  readonly bootstrapPreference?: unknown;
  readonly initialPreference: Readonly<AnonymousThemePreference>;
  readonly onAuthorityChange: (authority: ThemeAuthority) => void;
  readonly previousAuthority?: ThemeAuthority | undefined;
  readonly store: UiStore;
  readonly unsubscribe?: (() => void) | undefined;
}): void => {
  onAuthorityChange(authority);
  unsubscribe?.();
  const bootstrap = authority === "anonymous" ? bootstrapPreference : undefined;
  const validatedBootstrap = parseAppearancePreference(bootstrap) ?? undefined;
  if (
    authority === "anonymous" &&
    previousAuthority === "anonymous" &&
    validatedBootstrap === undefined
  )
    return;
  const preference = validatedBootstrap ?? initialPreference;
  if (!isSameAppearance(store.getState(), preference))
    store.setState({
      density: preference.density,
      fontSize: preference.fontSize,
      radius: preference.radius,
      theme: preference.theme,
    });
};

const ThemeEffects = ({
  initialPreference,
  themeAuthority,
}: {
  readonly initialPreference: Readonly<AnonymousThemePreference>;
  readonly themeAuthority: ThemeAuthority;
}) => {
  const store = useUiStoreApi();
  const theme = useUiState((state) => state.theme);
  const [reconciliationVersion, setReconciliationVersion] = useState(0);
  const authorityRef = useRef(themeAuthority);
  const reconciledAuthorityRef = useRef<ThemeAuthority | undefined>(undefined);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const bootstrapConsumption = useRef<ThemeBootstrapConsumption>({
    consumed: false,
  });

  useLayoutEffect(() => {
    const bootstrapPreference = consumeInitialThemeBootstrap(
      themeAuthority,
      bootstrapConsumption.current,
      window.__DARKFACTORY_THEME__
    );
    Reflect.deleteProperty(window, "__DARKFACTORY_THEME__");
    const previousAuthority = reconciledAuthorityRef.current;
    reconcileThemeAuthorityTransition({
      authority: themeAuthority,
      bootstrapPreference,
      initialPreference,
      onAuthorityChange: (authority) => {
        authorityRef.current = authority;
        reconciledAuthorityRef.current = authority;
      },
      previousAuthority,
      store,
      unsubscribe: unsubscribeRef.current,
    });
    unsubscribeRef.current = undefined;
    applyTheme(store);
    setReconciliationVersion((version) => version + 1);
  }, [initialPreference, store, themeAuthority]);

  useEffect(() => {
    if (reconciliationVersion === 0) return;
    const synchronizeTheme = () => {
      const currentAuthority = authorityRef.current;
      applyTheme(store);
      return persistThemeState(store, currentAuthority);
    };
    synchronizeTheme();
    const unsubscribe = store.subscribe(synchronizeTheme);
    unsubscribeRef.current = unsubscribe;
    return () => {
      if (unsubscribeRef.current === unsubscribe)
        unsubscribeRef.current = undefined;
      return unsubscribe();
    };
  }, [reconciliationVersion, store]);

  if (reconciliationVersion === 0) return null;
  return (
    <Suspense fallback={null}>
      <LazyToaster theme={themeColorScheme(theme)} />
    </Suspense>
  );
};

const SemanticThemeProvider = ({
  children,
  themeAuthority,
}: {
  readonly children: ReactNode;
  readonly themeAuthority: ThemeAuthority;
}) => {
  const store = useUiStoreApi();
  const theme = useUiState((state) => state.theme);
  const fontSize = useUiState((state) => state.fontSize);
  const density = useUiState((state) => state.density);
  const radius = useUiState((state) => state.radius);
  const onPreferenceChange = useCallback(
    (preference: AnonymousThemePreference) => {
      if (themeAuthority !== "anonymous") return;
      return store.setState(preference);
    },
    [store, themeAuthority]
  );

  return (
    <ThemeProvider
      onPreferenceChange={onPreferenceChange}
      preference={{ density, fontSize, radius, theme }}
    >
      {children}
    </ThemeProvider>
  );
};

const ThemeAuthorityContext = createContext<ThemeAuthority>("indeterminate");
const ThemeAuthorityProvider = ThemeAuthorityContext.Provider;

export const useThemeAuthority = (): ThemeAuthority =>
  useContext(ThemeAuthorityContext);

export interface ThemeControllerProps {
  readonly children: ReactNode;
  readonly initialPreference: Readonly<AnonymousThemePreference>;
  readonly themeAuthority?: ThemeAuthority;
}

export const ThemeController = ({
  children,
  initialPreference,
  themeAuthority = "anonymous",
}: ThemeControllerProps) => (
  <ThemeAuthorityProvider value={themeAuthority}>
    <UiStateProvider initialPreference={initialPreference}>
      <SemanticThemeProvider themeAuthority={themeAuthority}>
        {children}
        <ThemeEffects
          initialPreference={initialPreference}
          themeAuthority={themeAuthority}
        />
      </SemanticThemeProvider>
    </UiStateProvider>
  </ThemeAuthorityProvider>
);
