import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperatorShell } from "./operator-shell.tsx";

describe("operator shell", () =>
  it("renders the local-development identity and protected content", () => {
    const markup = renderToStaticMarkup(
      <OperatorShell name="Development Administrator">
        <section>Protected workspace</section>
      </OperatorShell>
    );
    expect(markup).toContain('href="/operator"');
    expect(markup).toContain("Local development");
    expect(markup).toContain("Signed in as Development Administrator");
    expect(markup).toContain('<main class="mx-auto w-full');
    return expect(markup).toContain("Protected workspace");
  }));
