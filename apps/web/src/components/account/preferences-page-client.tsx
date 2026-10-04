"use client";

import type {
  PreferencesOutput,
  PreferencesUpdateInput,
} from "@darkfactory/api";
import { isSameAppearance } from "@darkfactory/state";
import { Button, buttonVariants, EmptyState, Skeleton } from "@darkfactory/ui";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useUiStoreApi } from "../../lib/ui-store.tsx";
import {
  type AccountFailureKind,
  accountFailureKind,
  createBrowserAccountGateway,
  safeAccountFeedback,
} from "./account-client.ts";
import type { AccountFeedback } from "./account-feedback.tsx";
import { PreferencesForm } from "./preferences-form.tsx";

type PreferencesState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "error"; kind: AccountFailureKind }>
  | Readonly<{
      type: "ready";
      preferences: PreferencesOutput;
      version: number;
    }>;

export const PreferencesPageClient = () => {
  const [gateway] = useState(createBrowserAccountGateway);
  const store = useUiStoreApi();
  const [state, setState] = useState<PreferencesState>({ type: "loading" });
  const [feedback, setFeedback] = useState<AccountFeedback | null>(null);

  const load = useCallback(async () => {
    setFeedback(null);
    setState({ type: "loading" });
    try {
      const preferences = await gateway.getPreferences();
      return setState({ preferences, type: "ready", version: 0 });
    } catch (error) {
      return setState({ kind: accountFailureKind(error), type: "error" });
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.type === "loading") {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="space-y-5"
        role="status"
      >
        <span className="sr-only">Loading preferences</span>
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (state.type === "error") {
    const action =
      state.kind === "unauthorized" ? (
        <a
          className={buttonVariants()}
          href="/sign-in?callbackURL=%2Faccount%2Fpreferences"
        >
          Sign in
        </a>
      ) : state.kind === "forbidden" || state.kind === "not-found" ? (
        <a className={buttonVariants({ variant: "secondary" })} href="/account">
          Back to account
        </a>
      ) : (
        <Button onClick={() => void load()} variant="secondary">
          <RotateCcw aria-hidden="true" className="size-4" />
          Try again
        </Button>
      );
    return (
      <div aria-live="assertive" role="alert">
        <EmptyState
          action={action}
          description={
            state.kind === "not-found"
              ? "No saved preferences were found for this account."
              : "Your preferences could not be loaded. Existing settings remain unchanged."
          }
          icon={<RotateCcw />}
          title="Preferences unavailable"
        />
      </div>
    );
  }

  const save = async (input: PreferencesUpdateInput): Promise<void> => {
    setFeedback(null);
    try {
      const preferences = await gateway.updatePreferences(input);
      setState((current) =>
        current.type === "ready"
          ? { preferences, type: "ready", version: current.version + 1 }
          : current
      );
      setFeedback({ message: "Preferences saved.", tone: "success" });
    } catch (error) {
      if (accountFailureKind(error) === "conflict") {
        try {
          const preferences = await gateway.getPreferences();
          const appearance = {
            density: preferences.density,
            fontSize: preferences.fontSize,
            radius: preferences.radius,
            theme: preferences.theme,
          };
          if (!isSameAppearance(store.getState(), appearance))
            store.setState(appearance);
          setState((current) =>
            current.type === "ready" ? { ...current, preferences } : current
          );
        } catch {
          // The mounted form keeps its unsaved values when reconciliation is unavailable.
        }
        setFeedback({
          message:
            "Preferences changed elsewhere. Your choices are preserved; review them and save again.",
          tone: "error",
        });
      } else {
        setFeedback({ message: safeAccountFeedback(error), tone: "error" });
      }
    }
  };

  return (
    <PreferencesForm
      feedback={feedback}
      initialPreferences={state.preferences}
      key={state.version}
      onSave={save}
    />
  );
};
