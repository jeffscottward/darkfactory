import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../components/operator-sign-in.tsx", () => ({
  OperatorSignIn: ({
    callbackURL,
  }: {
    readonly callbackURL: string | null;
  }) => {
    return <div data-callback-url={callbackURL ?? "none"}>Sign-in form</div>;
  },
}));

import SignInPage, { metadata } from "./page.tsx";

describe("operator sign-in route", () => {
  it("publishes sign-in metadata and renders without a callback", async () => {
    const markup = renderToStaticMarkup(
      await SignInPage({
        searchParams: Promise.resolve({}),
      })
    );
    expect(metadata.title).toBe("Sign in");
    expect(markup).toContain("Administrator sign in");
    return expect(markup).toContain('data-callback-url="none"');
  });

  it("passes a scalar callback to the sign-in form", async () => {
    const markup = renderToStaticMarkup(
      await SignInPage({
        searchParams: Promise.resolve({ callbackURL: "/operator/runs/run-1" }),
      })
    );
    return expect(markup).toContain('data-callback-url="/operator/runs/run-1"');
  });

  return it("uses the first callback when the query parameter repeats", async () => {
    const markup = renderToStaticMarkup(
      await SignInPage({
        searchParams: Promise.resolve({
          callbackURL: ["/operator/runs/run-1", "/operator/runs/run-2"],
        }),
      })
    );
    return expect(markup).toContain('data-callback-url="/operator/runs/run-1"');
  });
});
