import { LayoutList } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../features/generated-navigation.ts", () => ({
  GENERATED_FEATURE_NAVIGATION: Object.freeze([
    { label: "Generated reports", href: "/reports" },
  ]),
  GENERATED_FEATURE_ROUTE_PATHS: Object.freeze(["/reports"]),
  GENERATED_FEATURE_ROUTE_PAGE_FILES: Object.freeze({
    "/reports": "(portal)/reports/page.tsx",
  }),
}));

import {
  ADMIN_PORTAL_ROUTE_PATHS,
  EXPOSED_ROUTE_PATHS,
  FEATURE_NAVIGATION,
  MEMBER_PORTAL_ROUTE_PATHS,
  PORTAL_SIDEBAR_GROUPS,
  ROUTE_PAGE_FILES,
} from "./navigation.ts";

describe("navigation composition", () => {
  it("projects generated destinations into the sidebar Features group and route manifests", () => {
    expect(FEATURE_NAVIGATION).toContainEqual({
      label: "Generated reports",
      href: "/reports",
      icon: LayoutList,
    });
    expect(
      PORTAL_SIDEBAR_GROUPS.find((group) => group.label === "Features")?.items
    ).toBe(FEATURE_NAVIGATION);
    expect(MEMBER_PORTAL_ROUTE_PATHS).toContain("/reports");
    expect(ADMIN_PORTAL_ROUTE_PATHS).toContain("/reports");
    expect(EXPOSED_ROUTE_PATHS).toContain("/reports");
    return expect(ROUTE_PAGE_FILES["/reports"]).toBe(
      "(portal)/reports/page.tsx"
    );
  });

  return it("keeps the local operator outside product navigation", () => {
    expect(FEATURE_NAVIGATION.some((item) => item.href === "/operator")).toBe(
      false
    );
    expect(EXPOSED_ROUTE_PATHS).not.toContain("/operator");
    return expect(ROUTE_PAGE_FILES["/operator"]).toBeUndefined();
  });
});
