"use client";

import { DropdownMenuItem } from "@darkfactory/ui/client/dropdown-menu";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import {
  browserCurrentSessionGateway,
  type CurrentSessionGateway,
  type CurrentSessionSignOutResult,
} from "./sign-out-client.ts";

export const SIGNED_OUT_DESTINATION = "/sign-in" as const;

export type SignOutActionState =
  | Readonly<{ type: "idle" }>
  | Readonly<{ type: "pending" }>
  | Readonly<{ type: "error"; message: string }>;

type ReplaceLocation = (destination: typeof SIGNED_OUT_DESTINATION) => void;

const replaceBrowserLocation: ReplaceLocation = (destination) => {
  return window.location.replace(destination);
};

export const completeCurrentSessionSignOut = async (
  gateway: CurrentSessionGateway,
  replace: ReplaceLocation
): Promise<CurrentSessionSignOutResult> => {
  const result = await gateway.signOut();
  if (result.ok) replace(SIGNED_OUT_DESTINATION);
  return result;
};

export interface SignOutActionController {
  readonly activate: (
    setState: (state: SignOutActionState) => void
  ) => Promise<void>;
}

export const createSignOutActionController = (
  gateway: CurrentSessionGateway,
  replace: ReplaceLocation
): SignOutActionController => {
  let inFlight = false;

  return {
    activate: async (setState) => {
      if (inFlight) return;
      inFlight = true;
      setState({ type: "pending" });

      const result = await completeCurrentSessionSignOut(gateway, replace);
      if (!result.ok) {
        inFlight = false;
        return setState({ message: result.message, type: "error" });
      }
      return;
    },
  };
};

export interface SignOutActionBinding {
  readonly isHydrated: boolean;
  readonly onSignOut: () => void;
  readonly state: SignOutActionState;
}

/** Sign-out state for the user menu: inert until hydration, single flight, retry on failure. */
export const useSignOutAction = ({
  gateway = browserCurrentSessionGateway,
  replace = replaceBrowserLocation,
}: Readonly<{
  gateway?: CurrentSessionGateway;
  replace?: ReplaceLocation;
}> = {}): SignOutActionBinding => {
  const [isHydrated, setIsHydrated] = useState(false);
  const [controller] = useState(() => {
    return createSignOutActionController(gateway, replace);
  });
  const [state, setState] = useState<SignOutActionState>({ type: "idle" });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return {
    isHydrated,
    onSignOut: () => void controller.activate(setState),
    state,
  };
};

export const SIGN_OUT_ERROR_ID = "portal-sign-out-error" as const;

export const SignOutMenuItem = ({
  isHydrated,
  onSignOut,
  state,
}: SignOutActionBinding) => {
  const isPending = state.type === "pending";
  return (
    <DropdownMenuItem
      aria-busy={isPending ? "true" : undefined}
      aria-describedby={state.type === "error" ? SIGN_OUT_ERROR_ID : undefined}
      data-hydration-state={isHydrated ? "ready" : "pending"}
      disabled={!isHydrated || isPending}
      onSelect={onSignOut}
    >
      <LogOut aria-hidden="true" />
      <span>{isPending ? "Signing out" : "Sign out"}</span>
    </DropdownMenuItem>
  );
};

export const SignOutError = ({
  state,
}: Readonly<{ state: SignOutActionState }>) =>
  state.type === "error" ? (
    <p
      aria-atomic="true"
      aria-live="assertive"
      className="absolute top-full right-0 z-overlay mt-1 w-64 rounded-md border border-destructive bg-surface p-2 text-destructive text-sm shadow-lg"
      id={SIGN_OUT_ERROR_ID}
      role="alert"
    >
      {state.message}
    </p>
  ) : null;
