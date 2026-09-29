import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ContactPage, { metadata } from "./page.tsx";

describe("ContactPage", function () {
  return it("provides route metadata and a single clearly described contact task", function () {
    const html = renderToStaticMarkup(<ContactPage />);

    expect(metadata).toEqual({
      title: "Contact",
      description:
        "Send DarkFactory a bounded contact request and receive a truthful delivery result.",
    });
    expect(html).toContain("Talk to the people behind the system.");
    expect(html).toContain("Delivery is reported exactly as it happens");
    expect(html).toContain('aria-labelledby="contact-expectations-title"');
    expect(html).toContain(
      '<section aria-labelledby="contact-expectations-title"'
    );
    return expect(html).toContain('id="contact-form"');
  });
});
