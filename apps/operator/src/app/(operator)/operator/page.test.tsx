import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../components/operator/operator-workspace.tsx", () => ({
  OperatorWorkspace: () => (
    <section data-testid="operator-workspace">Workspace client</section>
  ),
}));

vi.mock("../../../components/operator/operator-run-detail.tsx", () => ({
  OperatorRunDetail: ({ id }: { readonly id: string }) => (
    <section data-run-id={id}>Run detail client</section>
  ),
}));

import OperatorPage, { metadata as operatorMetadata } from "./page.tsx";
import OperatorRunPage, { metadata as runMetadata } from "./runs/[id]/page.tsx";

describe("standalone operator app pages", () => {
  it("composes the authenticated operator workspace route", () => {
    const markup = renderToStaticMarkup(<OperatorPage />);
    expect(operatorMetadata).toEqual({ title: "Operator" });
    expect(markup).toContain("Plan and monitor work");
    expect(markup).not.toContain("Start with a Wayfinder plan");
    return expect(markup).toContain('data-testid="operator-workspace"');
  });

  return it("keeps a reload-stable run id in the detail route", async () => {
    const page = await OperatorRunPage({
      params: Promise.resolve({ id: "run/deep-link" }),
    });
    const markup = renderToStaticMarkup(page);
    expect(runMetadata).toEqual({ title: "Workflow run" });
    expect(markup).toContain('href="/operator"');
    expect(markup).toContain('data-run-id="run/deep-link"');
    return expect(markup).toContain("Review plan and monitor work");
  });
});
