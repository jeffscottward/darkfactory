import {
  consentSkipReason,
  invalidCaptureResult,
  snapshotAnalyticsCapture,
} from "./validation.ts";

export type AnalyticsConsent = "granted" | "denied" | "unknown";

export type AnalyticsProperties = Readonly<{
  action?: string;
  entityId?: string;
  entityType?: string;
  outcome?: "success" | "failure";
  requestId?: string;
  source?: "api" | "system" | "web" | "worker";
  traceId?: string;
}>;

export type AnalyticsCapture = Readonly<{
  consent: AnalyticsConsent;
  distinctId: string;
  event: string;
  eventId: string;
  properties: AnalyticsProperties;
  timestamp?: string;
}>;

export type CapturedAnalyticsResult = Readonly<{
  status: "captured";
  eventId: string;
}>;

export type SkippedAnalyticsResult = Readonly<{
  status: "skipped";
  reason: "consent-denied" | "consent-unknown" | "disabled" | "unconfigured";
}>;

export type FailedAnalyticsResult = Readonly<{
  status: "failed";
  category: "invalid-capture" | "network" | "provider-rejected" | "timeout";
  retryable: boolean;
  statusCode?: number;
}>;

export type AnalyticsResult =
  | CapturedAnalyticsResult
  | SkippedAnalyticsResult
  | FailedAnalyticsResult;

export interface AnalyticsPort {
  capture: (input: AnalyticsCapture) => Promise<AnalyticsResult>;
}

export const createDisabledAnalyticsPort = (): AnalyticsPort => ({
  capture: (input) => {
    const snapshot = snapshotAnalyticsCapture(input);
    if (!snapshot) return Promise.resolve(invalidCaptureResult());

    const consentReason = consentSkipReason(snapshot);
    if (consentReason)
      return Promise.resolve({ status: "skipped", reason: consentReason });

    return Promise.resolve({ status: "skipped", reason: "disabled" });
  },
});
