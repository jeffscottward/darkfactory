// Adapter registry for this capability brick. The manifest
// (`analytics.provider`) and env schema (`ANALYTICS_PROVIDER`) enums are built
// from it; see packages/config/src/capabilities.ts#capabilityManifestSchema.
export const ANALYTICS_ADAPTERS = ["posthog"] as const;
export type AnalyticsAdapterId = (typeof ANALYTICS_ADAPTERS)[number];
