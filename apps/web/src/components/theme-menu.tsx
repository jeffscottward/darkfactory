"use client";

import {
  type ApiClient,
  type ApiClientOptions,
  createApiClient,
  type ThemePreferenceOutput,
  type UpdateThemePreferenceInput,
} from "@darkfactory/api";
import type { UiStore } from "@darkfactory/state/client";
import { ThemePicker } from "@darkfactory/ui/client/theme";
import { useLayoutEffect, useRef, useState } from "react";
import type { AnonymousThemePreference, ThemeAuthority } from "../lib/theme.ts";
import { fetchThemeApiRequest } from "../lib/theme-api-timeout.ts";
import {
  type ThemeUpdateSequence,
  updateTrustedThemePreference,
} from "../lib/theme-update.ts";
import { useUiStoreApi } from "../lib/ui-store.tsx";
import { useThemeAuthority } from "./theme-controller.tsx";

export type ThemePreferenceClient = Readonly<{
  get: () => Promise<ThemePreferenceOutput>;
  update: (input: UpdateThemePreferenceInput) => Promise<ThemePreferenceOutput>;
}>;

export const createThemePreferenceClient = ({
  baseUrl,
  clientFactory = createApiClient,
  fetchRequest,
}: {
  readonly baseUrl: string | URL;
  readonly clientFactory?: (options: ApiClientOptions) => ApiClient;
  readonly fetchRequest: typeof globalThis.fetch;
}): ThemePreferenceClient => {
  const client = clientFactory({
    baseUrl,
    fetch: async (request) =>
      fetchThemeApiRequest({
        fetchRequest,
        request,
      }),
  });
  return {
    get: () => client.preferences.theme.get({}),
    update: (preference) => client.preferences.theme.update(preference),
  };
};

export const selectThemeMenuPreference = async ({
  authority,
  authorityEpoch,
  createClient,
  currentAuthority,
  nextPreference,
  requestSequence,
  setError,
  setPending,
  store,
}: {
  readonly authority: ThemeAuthority;
  readonly authorityEpoch: () => number;
  readonly createClient: () => ThemePreferenceClient;
  readonly currentAuthority: () => ThemeAuthority;
  readonly nextPreference: Readonly<AnonymousThemePreference>;
  readonly requestSequence: ThemeUpdateSequence;
  readonly setError: (error: string | null) => void;
  readonly setPending: (pending: boolean) => void;
  readonly store: UiStore;
}): Promise<void> => {
  if (authority === "indeterminate") return;
  if (authority === "anonymous") {
    setError(null);
    setPending(false);
    store.setState(nextPreference);
    return;
  }

  const selectionAuthorityEpoch = authorityEpoch();
  const selectionRequestSequence = requestSequence.current + 1;
  setError(null);
  setPending(true);
  const client = createClient();
  const result = await updateTrustedThemePreference({
    authority: currentAuthority,
    authorityEpoch,
    get: client.get,
    preference: nextPreference,
    sequence: requestSequence,
    store,
    update: client.update,
  });
  if (
    currentAuthority() !== "trusted" ||
    authorityEpoch() !== selectionAuthorityEpoch ||
    requestSequence.current !== selectionRequestSequence
  )
    return;
  switch (result) {
    case "failed": {
      setError("Could not save appearance settings. Try again.");
      break;
    }
    case "reconciled": {
      setError(
        "Appearance settings were refreshed from your account. Review them before trying again."
      );
      break;
    }
    case "unconfirmed": {
      setError(
        "Could not confirm the appearance save. Reload before retrying."
      );
      break;
    }
  }
  setPending(false);
};

export interface AppearanceSelection {
  readonly disabled: boolean;
  readonly error: string | null;
  readonly select: (nextPreference: Readonly<AnonymousThemePreference>) => void;
  readonly statusMessage: string | null;
  readonly triggerLabel: string;
}

export const useAppearanceSelection = (): AppearanceSelection => {
  const store = useUiStoreApi();
  const authority = useThemeAuthority();
  const authorityRef = useRef(authority);
  const authorityEpoch = useRef(0);
  const requestSequence = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useLayoutEffect(() => {
    if (authorityRef.current === authority) return;
    authorityRef.current = authority;
    authorityEpoch.current += 1;
    requestSequence.current += 1;
    setError(null);
    setPending(false);
  }, [authority]);
  useLayoutEffect(() => {
    const invalidate = (): void => {
      authorityEpoch.current += 1;
      requestSequence.current += 1;
    };
    return invalidate;
  }, []);

  const select = (nextPreference: Readonly<AnonymousThemePreference>): void => {
    const selection = selectThemeMenuPreference({
      authority,
      authorityEpoch: () => authorityEpoch.current,
      createClient: () =>
        createThemePreferenceClient({
          baseUrl: window.location.origin,
          fetchRequest: globalThis.fetch,
        }),
      currentAuthority: () => authorityRef.current,
      nextPreference,
      requestSequence,
      setError,
      setPending,
      store,
    });
    void selection;
  };

  return {
    disabled: authority === "indeterminate" || pending,
    error,
    select,
    statusMessage:
      authority === "indeterminate"
        ? "Appearance settings are unavailable."
        : pending
          ? "Saving appearance settings."
          : null,
    triggerLabel:
      authority === "indeterminate"
        ? "Appearance settings unavailable"
        : pending
          ? "Saving appearance settings"
          : "Appearance settings",
  };
};

/** Standalone appearance menu for shells without a user menu (public and auth pages). */
export const ThemeMenu = () => {
  const selection = useAppearanceSelection();
  return (
    <ThemePicker
      disabled={selection.disabled}
      error={selection.error}
      idPrefix="application-theme"
      onPreferenceChange={selection.select}
      statusMessage={selection.statusMessage}
      triggerLabel={selection.triggerLabel}
    />
  );
};
