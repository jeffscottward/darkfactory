// Adapter registry for this capability brick. The manifest (`email.provider`)
// and env schema (`EMAIL_PROVIDER`) enums are built from it; see
// packages/config/src/capabilities.ts#capabilityManifestSchema.
export const EMAIL_ADAPTERS = ["resend"] as const;
export type EmailAdapterId = (typeof EMAIL_ADAPTERS)[number];
