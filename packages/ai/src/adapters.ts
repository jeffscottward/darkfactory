// Adapter registry for this capability brick. The manifest (`ai.provider`)
// and env schema (`AI_PROVIDER`) enums are built from it; see
// packages/config/src/capabilities.ts#capabilityManifestSchema.
export const AI_ADAPTERS = ["groq"] as const;
export type AiAdapterId = (typeof AI_ADAPTERS)[number];
