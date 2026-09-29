import { describe, expect, it, vi } from "vitest";

import {
  isStaleWorkflowApprovalError,
  isWorkflowError,
} from "./workflow-error.ts";
import { StaleWorkflowApprovalError } from "./workflow-repository.ts";

describe("workflow error identity", () => {
  it("classifies an error built by a separate module instance", async () => {
    vi.resetModules();
    const other = await import("./workflow-repository.ts");
    const stale = new other.StaleWorkflowApprovalError();

    expect(other.StaleWorkflowApprovalError).not.toBe(
      StaleWorkflowApprovalError
    );
    expect(stale).not.toBeInstanceOf(StaleWorkflowApprovalError);
    expect(isStaleWorkflowApprovalError(stale)).toBe(true);
    expect(isWorkflowError(stale, "STALE_APPROVAL")).toBe(true);
    return expect(isWorkflowError(stale, "CONCURRENCY")).toBe(false);
  });

  return it("rejects look-alikes that are not errors or carry another code", () => {
    expect(
      isStaleWorkflowApprovalError({ workflowErrorCode: "STALE_APPROVAL" })
    ).toBe(false);
    expect(isStaleWorkflowApprovalError(new Error("stale"))).toBe(false);
    expect(isStaleWorkflowApprovalError(null)).toBe(false);
    return expect(
      isStaleWorkflowApprovalError(new StaleWorkflowApprovalError())
    ).toBe(true);
  });
});
