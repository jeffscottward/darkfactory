import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOperatorAdministrator: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ cookie: "better-auth.session_token=opaque" })
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirect(path);
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("../../server/operator-session.ts", () => ({
  getOperatorAdministrator: mocks.getOperatorAdministrator,
}));
vi.mock("../../components/operator-shell.tsx", () => ({
  OperatorShell: ({
    children,
    name,
  }: {
    readonly children: React.ReactNode;
    readonly name: string;
  }) => <main data-operator-name={name}>{children}</main>,
}));

import OperatorLayout from "./layout.tsx";

describe("operator administrator boundary", () => {
  beforeEach(() => {
    mocks.getOperatorAdministrator.mockReset();
    return mocks.redirect.mockClear();
  });

  it("redirects an anonymous or non-administrator request", async () => {
    mocks.getOperatorAdministrator.mockResolvedValueOnce(null);
    return await expect(
      OperatorLayout({ children: "protected" })
    ).rejects.toThrow("REDIRECT:/sign-in?callbackURL=%2Foperator");
  });

  return it("renders the standalone shell for the seeded administrator", async () => {
    mocks.getOperatorAdministrator.mockResolvedValueOnce({
      userId: "admin-1",
      name: "Development Administrator",
    });
    const markup = renderToStaticMarkup(
      await OperatorLayout({ children: "protected" })
    );
    expect(markup).toContain('data-operator-name="Development Administrator"');
    return expect(markup).toContain("protected");
  });
});
