import type { E2ELifecycleStage } from "./run-artifacts";

export type E2ELifecycleDiagnosticStage =
  | "validation"
  | "owner-lock"
  | E2ELifecycleStage;

export function formatE2ELifecycleFailure(
  kind: "cleanup" | "startup",
  stage: E2ELifecycleDiagnosticStage
): string {
  return kind === "cleanup"
    ? `Error: E2E lifecycle cleanup failed during ${stage}. Resources retained.\n`
    : `Error: E2E lifecycle startup failed during ${stage}.\n`;
}
