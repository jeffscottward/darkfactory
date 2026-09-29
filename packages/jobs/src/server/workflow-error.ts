/**
 * Stable identity for workflow errors.
 *
 * Why: a bundler can load one source file as two module instances (package
 * export vs. relative import), so `instanceof` silently misclassifies errors
 * thrown by the "other" copy. Classify by this literal code instead of class
 * identity.
 */
export type WorkflowErrorCode =
  | "CONCURRENCY"
  | "MESSAGE_CAPACITY"
  | "PERSISTENCE_INPUT"
  | "PLAN_EVIDENCE"
  | "PROJECTION_INTEGRITY"
  | "PROJECTION_VERIFICATION"
  | "RUN_CAPACITY"
  | "RUN_NOT_FOUND"
  | "RUN_SUBMISSION_RATE"
  | "RUN_TERMINAL"
  | "STALE_APPROVAL";

export type WorkflowError<Code extends WorkflowErrorCode = WorkflowErrorCode> =
  Error & { readonly workflowErrorCode: Code };

export const isWorkflowError = <Code extends WorkflowErrorCode>(
  error: unknown,
  code: Code
): error is WorkflowError<Code> => {
  return (
    error instanceof Error &&
    (error as { workflowErrorCode?: unknown }).workflowErrorCode === code
  );
};

export const isStaleWorkflowApprovalError = (
  error: unknown
): error is WorkflowError<"STALE_APPROVAL"> => {
  return isWorkflowError(error, "STALE_APPROVAL");
};
