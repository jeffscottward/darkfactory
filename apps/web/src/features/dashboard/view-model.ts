// Dashboard view-model: maps the raw `dashboard.summary` oRPC output into the
// plain, pre-formatted props that `components/portal/dashboard-content.tsx`
// renders. The reference example of the view-model pattern (ARCHITECTURE.md).
import type { ApiClient, CapabilityProjection } from "@darkfactory/api";

/** Raw output of the `dashboard.summary` contract, as the typed client returns it. */
export type DashboardSummary = Awaited<
  ReturnType<ApiClient["dashboard"]["summary"]>
>;

/** What the page loader resolved for this request. */
export type DashboardSummaryState =
  | Readonly<{ type: "ready"; summary: DashboardSummary }>
  | Readonly<{ type: "unauthorized" }>
  | Readonly<{ type: "error" }>;

type DashboardStatusCount = Readonly<{ label: string; count: number }>;

type DashboardCapabilityRow = Readonly<{
  key: keyof CapabilityProjection;
  label: string;
  available: boolean;
  statusLabel: "Available" | "Unavailable";
}>;

type DashboardRecentItem = Readonly<{
  id: string;
  name: string;
  statusLabel: string;
  href: `/feature-items/${string}`;
}>;

/**
 * Presentation-ready dashboard. `unavailable` carries no identity or counts,
 * so the component cannot show partial data when the summary failed.
 */
export type DashboardViewModel =
  | Readonly<{ type: "unavailable" }>
  | Readonly<{
      type: "ready";
      accessLabel: string;
      greeting: string;
      totalLabel: string;
      statusCounts: readonly DashboardStatusCount[];
      capabilities: readonly DashboardCapabilityRow[];
      recentItems: readonly DashboardRecentItem[];
    }>;

/** Display order and labels; a new capability fails typecheck until labeled. */
const CAPABILITY_LABELS: Readonly<Record<keyof CapabilityProjection, string>> =
  Object.freeze({
    ai: "AI integration",
    emailDelivery: "Email delivery",
    analytics: "Product analytics",
    telemetryExport: "Telemetry export",
  });

const STATUS_LABELS = Object.freeze({
  draft: "Draft",
  active: "Active",
  archived: "Archived",
} as const);

export const toDashboardViewModel = (
  state: DashboardSummaryState
): DashboardViewModel => {
  if (state.type !== "ready") {
    return { type: "unavailable" };
  }
  const { session, featureItems, capabilities } = state.summary;
  const total = featureItems.total;
  return {
    type: "ready",
    accessLabel:
      session.role === "admin" ? "Administrator access" : "Member access",
    greeting: `Welcome back, ${session.name}`,
    totalLabel: `${total} feature ${total === 1 ? "item" : "items"}`,
    statusCounts: (["draft", "active", "archived"] as const).map((status) => ({
      label: STATUS_LABELS[status],
      count: featureItems[status],
    })),
    capabilities: (
      Object.keys(CAPABILITY_LABELS) as (keyof CapabilityProjection)[]
    ).map((key) => ({
      key,
      label: CAPABILITY_LABELS[key],
      available: capabilities[key],
      statusLabel: capabilities[key] ? "Available" : "Unavailable",
    })),
    recentItems: featureItems.recent.map((item) => ({
      id: item.id,
      name: item.name,
      statusLabel: STATUS_LABELS[item.status],
      href: `/feature-items/${encodeURIComponent(item.id)}`,
    })),
  };
};
