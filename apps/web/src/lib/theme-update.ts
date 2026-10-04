import type {
  ThemePreferenceOutput,
  UpdateThemePreferenceInput,
} from "@darkfactory/api";
import {
  isSameAppearance,
  parseAppearancePreference,
} from "@darkfactory/state";
import type { UiStore } from "@darkfactory/state/client";

import type { AnonymousThemePreference, ThemeAuthority } from "./theme.ts";

export interface ThemeUpdateSequence {
  current: number;
}

export type ThemeUpdateResult =
  | "applied"
  | "failed"
  | "reconciled"
  | "superseded"
  | "unconfirmed";

const validatedThemePreference = (
  value: unknown
): ThemePreferenceOutput | null => {
  const appearance = parseAppearancePreference(value);
  if (appearance === null) return null;
  const updatedAt = Reflect.get(value as object, "updatedAt");
  if (
    updatedAt !== null &&
    !(updatedAt instanceof Date && Number.isFinite(updatedAt.getTime()))
  )
    return null;
  return { ...appearance, updatedAt };
};

const isCurrentTrustedRequest = ({
  authority,
  authorityEpoch,
  requestAuthorityEpoch,
  requestSequence,
  sequence,
}: {
  readonly authority: () => ThemeAuthority;
  readonly authorityEpoch: () => number;
  readonly requestAuthorityEpoch: number;
  readonly requestSequence: number;
  readonly sequence: ThemeUpdateSequence;
}): boolean => {
  return (
    authority() === "trusted" &&
    authorityEpoch() === requestAuthorityEpoch &&
    sequence.current === requestSequence
  );
};

const applyThemePreference = (
  store: UiStore,
  preference: ThemePreferenceOutput
): void => {
  const appearance = {
    density: preference.density,
    fontSize: preference.fontSize,
    radius: preference.radius,
    theme: preference.theme,
  };
  if (!isSameAppearance(store.getState(), appearance)) {
    store.setState(appearance);
  }
};

export const updateTrustedThemePreference = async ({
  authority,
  authorityEpoch,
  get,
  preference,
  sequence,
  store,
  update,
}: {
  readonly authority: () => ThemeAuthority;
  readonly authorityEpoch: () => number;
  readonly get: () => Promise<ThemePreferenceOutput>;
  readonly preference: Readonly<AnonymousThemePreference>;
  readonly sequence: ThemeUpdateSequence;
  readonly store: UiStore;
  readonly update: (
    preference: UpdateThemePreferenceInput
  ) => Promise<ThemePreferenceOutput>;
}): Promise<ThemeUpdateResult> => {
  const requestAuthorityEpoch = authorityEpoch();
  const requestSequence = sequence.current + 1;
  sequence.current = requestSequence;
  const currentRequest = (): boolean =>
    isCurrentTrustedRequest({
      authority,
      authorityEpoch,
      requestAuthorityEpoch,
      requestSequence,
      sequence,
    });
  if (!currentRequest()) return "superseded";

  let current: ThemePreferenceOutput | null;
  try {
    current = validatedThemePreference(await get());
  } catch {
    return currentRequest() ? "failed" : "superseded";
  }
  if (!currentRequest()) return "superseded";
  if (current === null) return "failed";

  let saved: ThemePreferenceOutput | null = null;
  try {
    saved = validatedThemePreference(
      await update({
        density: preference.density,
        expectedUpdatedAt: current.updatedAt,
        fontSize: preference.fontSize,
        radius: preference.radius,
        theme: preference.theme,
      })
    );
  } catch (error) {
    if (typeof error !== "object" || error === null) throw error;
  }
  if (!currentRequest()) return "superseded";
  if (saved !== null) {
    applyThemePreference(store, saved);
    return "applied";
  }

  let reconciled: ThemePreferenceOutput | null;
  try {
    reconciled = validatedThemePreference(await get());
  } catch {
    return currentRequest() ? "unconfirmed" : "superseded";
  }
  if (!currentRequest()) return "superseded";
  if (reconciled === null) return "unconfirmed";
  applyThemePreference(store, reconciled);
  return "reconciled";
};
