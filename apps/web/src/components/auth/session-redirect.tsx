"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import {
  type AuthError,
  type AuthFlowClient,
  browserAuthClient,
  normalizeAuthDestination,
} from "./auth-flow.ts";

export const destinationForSession = (
  response: Readonly<{ data: unknown; error: AuthError }>,
  callbackURL: unknown
): string | null => {
  if (
    response.error ||
    typeof response.data !== "object" ||
    response.data === null
  ) {
    return null;
  }
  const session = (response.data as { session?: unknown }).session;
  if (typeof session !== "object" || session === null) return null;
  return normalizeAuthDestination(callbackURL);
};

export const SessionRedirect = ({
  callbackURL,
  children,
  auth = browserAuthClient,
}: Readonly<{
  callbackURL: unknown;
  children?: ReactNode;
  auth?: AuthFlowClient;
}>) => {
  const [isChecking, setIsChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let isActive = true;
    void auth
      .getSession()
      .then((response) => {
        if (!isActive) return;
        const destination = destinationForSession(response, callbackURL);
        if (destination) {
          router.replace(destination);
          return;
        }
        return setIsChecking(false);
      })
      .catch(() => void (isActive && setIsChecking(false)));
    return () => {
      isActive = false;
      return undefined;
    };
  }, [auth, callbackURL, router]);

  if (isChecking) {
    return (
      <div
        aria-live="polite"
        className="flex min-h-11 items-center text-muted-foreground text-sm"
        role="status"
      >
        Checking your session…
      </div>
    );
  }
  return children ?? null;
};
