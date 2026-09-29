import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
);

vi.mock("next/navigation", () => ({ redirect }));

import OperatorLandingPage from "./page.ts";

describe("standalone operator landing", function () {
  return it("routes the dedicated origin to the authenticated workspace", function () {
    expect(() => OperatorLandingPage()).toThrow("REDIRECT:/operator");
    return expect(redirect).toHaveBeenCalledWith("/operator");
  });
});
