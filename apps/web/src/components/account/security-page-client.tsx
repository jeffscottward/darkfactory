"use client";

import { SectionHeader } from "@darkfactory/ui";
import { useCallback, useEffect, useState } from "react";

import type { AccountFeedback } from "./account-feedback.tsx";
import {
  type ChangePasswordInput,
  createBrowserSecurityGateway,
  safeSecurityFeedback,
  securityFailureKind,
} from "./security-client.ts";
import {
  PasswordForm,
  SecurityPanel,
  type SecurityPanelState,
} from "./security-panel.tsx";

export const SecurityPageClient = () => {
  const [gateway] = useState(createBrowserSecurityGateway);
  const [state, setState] = useState<SecurityPanelState>({ type: "loading" });
  const [sessionFeedback, setSessionFeedback] =
    useState<AccountFeedback | null>(null);
  const [passwordFeedback, setPasswordFeedback] =
    useState<AccountFeedback | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [passwordVersion, setPasswordVersion] = useState(0);

  const load = useCallback(async () => {
    setSessionFeedback(null);
    setState({ type: "loading" });
    try {
      const result = await gateway.listSessions();
      return setState({ sessions: result.sessions, type: "ready" });
    } catch (error) {
      return setState({
        kind: securityFailureKind(error),
        message: safeSecurityFeedback(error),
        type: "error",
      });
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeOthers = async (): Promise<void> => {
    if (isRevoking) return;
    setIsRevoking(true);
    setSessionFeedback(null);
    try {
      await gateway.revokeOtherSessions();
      setSessionFeedback({
        message: "Other sessions signed out.",
        tone: "success",
      });
      try {
        const result = await gateway.listSessions();
        setState({ sessions: result.sessions, type: "ready" });
      } catch {
        setSessionFeedback({
          message:
            "Other sessions were signed out, but the session list could not be refreshed.",
          tone: "info",
        });
      }
    } catch (error) {
      setSessionFeedback({
        message: safeSecurityFeedback(error),
        tone: "error",
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const changePassword = async (input: ChangePasswordInput): Promise<void> => {
    setPasswordFeedback(null);
    try {
      await gateway.changePassword(input);
      setPasswordVersion((version) => version + 1);
      setPasswordFeedback({ message: "Password changed.", tone: "success" });
      try {
        const result = await gateway.listSessions();
        setState({ sessions: result.sessions, type: "ready" });
      } catch {
        setSessionFeedback({
          message:
            "Password changed, but the session list could not be refreshed.",
          tone: "info",
        });
      }
    } catch (error) {
      setPasswordFeedback({
        message: safeSecurityFeedback(error),
        tone: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="active-sessions" className="space-y-3">
        <SectionHeader
          headingLevel={3}
          id="active-sessions"
          title="Active sessions"
        />
        <SecurityPanel
          feedback={sessionFeedback}
          isRevoking={isRevoking}
          onRetry={() => void load()}
          onRevokeOthers={() => void revokeOthers()}
          state={state}
        />
      </section>
      <section aria-labelledby="change-password" className="space-y-3">
        <SectionHeader
          headingLevel={3}
          id="change-password"
          title="Change password"
        />
        <PasswordForm
          feedback={passwordFeedback}
          key={passwordVersion}
          onSave={changePassword}
        />
      </section>
    </div>
  );
};
