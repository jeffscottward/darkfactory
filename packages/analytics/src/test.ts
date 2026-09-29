import type {
  AnalyticsCapture,
  AnalyticsPort,
  AnalyticsProperties,
  AnalyticsResult,
} from "./index.ts";
import {
  consentSkipReason,
  invalidCaptureResult,
  snapshotAnalyticsCapture,
} from "./validation.ts";

export type RecordingAnalyticsPort = AnalyticsPort &
  Readonly<{
    captures: readonly AnalyticsCapture[];
    clear(): void;
  }>;

const defaultProperties: AnalyticsProperties = Object.freeze({
  action: "created",
  entityType: "feature-item",
  outcome: "success",
  source: "api",
});

const defaultCapture: AnalyticsCapture = Object.freeze({
  consent: "granted",
  distinctId: "actor-001",
  event: "feature-item.created",
  eventId: "event-001",
  properties: defaultProperties,
});

export const createAnalyticsCapture = (
  overrides: Partial<AnalyticsCapture> = {}
): AnalyticsCapture => {
  const capture = {
    ...defaultCapture,
    ...overrides,
    properties: {
      ...defaultProperties,
      ...overrides.properties,
    },
  };

  return Object.freeze({
    ...capture,
    properties: Object.freeze(capture.properties),
  });
};

export const createRecordingAnalyticsPort = (): RecordingAnalyticsPort => {
  const recorded: AnalyticsCapture[] = [];

  return {
    get captures(): readonly AnalyticsCapture[] {
      return Object.freeze([...recorded]);
    },
    clear: () => {
      recorded.length = 0;
    },
    capture: (input): Promise<AnalyticsResult> => {
      const snapshot = snapshotAnalyticsCapture(input);
      if (!snapshot) return Promise.resolve(invalidCaptureResult());

      const consentReason = consentSkipReason(snapshot);
      if (consentReason)
        return Promise.resolve({ status: "skipped", reason: consentReason });

      recorded.push(snapshot);
      return Promise.resolve({ status: "captured", eventId: snapshot.eventId });
    },
  };
};
