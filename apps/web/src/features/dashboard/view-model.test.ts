import { describe, expect, it } from "vitest";

import { type DashboardSummary, toDashboardViewModel } from "./view-model.ts";

const summary = (
  overrides: Partial<DashboardSummary> = {}
): DashboardSummary => ({
  session: {
    userId: "user-1",
    name: "Example Member",
    role: "member",
    status: "active",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  },
  featureItems: {
    total: 0,
    draft: 0,
    active: 0,
    archived: 0,
    recent: [],
  },
  capabilities: {
    ai: false,
    emailDelivery: false,
    analytics: false,
    telemetryExport: false,
  },
  ...overrides,
});

const capability = (key: string, label: string, available: boolean) => ({
  key,
  label,
  available,
  statusLabel: available ? "Available" : "Unavailable",
});

describe("toDashboardViewModel", () => {
  it.each(["error", "unauthorized"] as const)(
    "maps a %s summary to an identity-free unavailable model",
    (type) =>
      expect(toDashboardViewModel({ type })).toEqual({ type: "unavailable" })
  );

  it("formats a member summary into presentation labels", () =>
    expect(
      toDashboardViewModel({
        type: "ready",
        summary: summary({
          featureItems: {
            total: 3,
            draft: 1,
            active: 1,
            archived: 1,
            recent: [
              {
                id: "item/1",
                name: "Example workflow",
                description: "A clearly labeled starter record.",
                status: "archived",
                metadata: {},
                ownerId: "user-1",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-02T00:00:00.000Z"),
              },
            ],
          },
          capabilities: {
            ai: true,
            emailDelivery: false,
            analytics: true,
            telemetryExport: false,
          },
        }),
      })
    ).toEqual({
      type: "ready",
      accessLabel: "Member access",
      greeting: "Welcome back, Example Member",
      totalLabel: "3 feature items",
      statusCounts: [
        { label: "Draft", count: 1 },
        { label: "Active", count: 1 },
        { label: "Archived", count: 1 },
      ],
      capabilities: [
        capability("ai", "AI integration", true),
        capability("emailDelivery", "Email delivery", false),
        capability("analytics", "Product analytics", true),
        capability("telemetryExport", "Telemetry export", false),
      ],
      recentItems: [
        {
          id: "item/1",
          name: "Example workflow",
          statusLabel: "Archived",
          href: "/feature-items/item%2F1",
        },
      ],
    }));

  return it("labels administrators and a single item without pluralizing", () =>
    expect(
      toDashboardViewModel({
        type: "ready",
        summary: summary({
          session: { ...summary().session, name: "Admin", role: "admin" },
          featureItems: { ...summary().featureItems, total: 1, draft: 1 },
        }),
      })
    ).toMatchObject({
      type: "ready",
      accessLabel: "Administrator access",
      greeting: "Welcome back, Admin",
      totalLabel: "1 feature item",
      recentItems: [],
    }));
});
