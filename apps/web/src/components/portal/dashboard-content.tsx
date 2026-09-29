import type { ApiClient, CapabilityProjection } from "@darkfactory/api";
import { buttonVariants, StatusBadge } from "@darkfactory/ui";
import { ArrowRight, FilePlus2 } from "lucide-react";

export type DashboardSummary = Awaited<
  ReturnType<ApiClient["dashboard"]["summary"]>
>;
export type DashboardSummaryState =
  | Readonly<{ type: "ready"; summary: DashboardSummary }>
  | Readonly<{ type: "unauthorized" }>
  | Readonly<{ type: "error" }>;

export interface DashboardContentProps {
  readonly summaryState: DashboardSummaryState;
}

const CAPABILITIES: readonly Readonly<{
  key: keyof CapabilityProjection;
  label: string;
}>[] = Object.freeze([
  { key: "ai", label: "AI integration" },
  { key: "emailDelivery", label: "Email delivery" },
  { key: "analytics", label: "Product analytics" },
  { key: "telemetryExport", label: "Telemetry export" },
  { key: "storage", label: "Object storage" },
  { key: "errorTracking", label: "Error tracking" },
]);

const itemCountLabel = (count: number): string => {
  return `${count} feature ${count === 1 ? "item" : "items"}`;
};

export const DashboardContent = ({ summaryState }: DashboardContentProps) => {
  const summary = summaryState.type === "ready" ? summaryState.summary : null;
  const session = summary?.session ?? null;
  const accessLabel =
    session === null
      ? null
      : session.role === "admin"
        ? "Administrator access"
        : "Member access";

  return (
    <div className="space-y-12">
      <section className="grid gap-8 border-border border-y py-8 md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)] md:items-end">
        <div className="min-w-0">
          {session === null ? (
            <>
              <p className="font-semibold text-primary text-sm">
                Dashboard unavailable
              </p>
              <h2 className="mt-3 min-w-0 font-heading font-semibold text-2xl text-foreground tracking-tight">
                Dashboard data unavailable
              </h2>
              <p className="mt-3 max-w-reading text-base text-muted-foreground leading-7">
                Account details are not shown when the dashboard summary cannot
                be loaded.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-primary text-sm">
                {accessLabel}
              </p>
              <h2
                className="mt-3 min-w-0 font-heading font-semibold text-2xl text-foreground tracking-tight"
                style={{ overflowWrap: "anywhere" }}
              >
                Welcome back, {session.name}
              </h2>
              <p className="mt-3 max-w-reading text-base text-muted-foreground leading-7">
                This overview reports only authoritative owner-scoped data
                returned for the current session.
              </p>
            </>
          )}
        </div>
        <div className="md:text-right">
          {summary === null ? (
            <>
              <p className="font-heading font-semibold text-foreground text-xl">
                Feature data unavailable
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                No count is shown when the summary cannot be verified.
              </p>
            </>
          ) : (
            <>
              <p className="font-heading font-semibold text-foreground text-xl">
                {itemCountLabel(summary.featureItems.total)}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Authoritative owner-scoped total
              </p>
            </>
          )}
        </div>
      </section>

      {summary === null ? null : (
        <section aria-labelledby="feature-status-counts-title">
          <h2
            className="font-heading font-semibold text-foreground text-xl tracking-tight"
            id="feature-status-counts-title"
          >
            Feature status
          </h2>
          <dl className="mt-5 grid divide-y divide-border border-border border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {(
              [
                ["Draft", summary.featureItems.draft],
                ["Active", summary.featureItems.active],
                ["Archived", summary.featureItems.archived],
              ] as const
            ).map(([label, count]) => (
              <div className="py-4 sm:px-5 sm:first:pl-0" key={label}>
                <dt className="text-muted-foreground text-sm">{label}</dt>
                <dd className="mt-1 font-heading font-semibold text-foreground text-xl">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby="dashboard-capabilities-title">
        <div className="mb-5">
          <h2
            className="font-heading font-semibold text-foreground text-xl tracking-tight"
            id="dashboard-capabilities-title"
          >
            Request and capability status
          </h2>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {summary === null
              ? "Request-scoped capability information could not be loaded."
              : "Better Auth session authority and server-projected capability availability."}
          </p>
        </div>
        <dl className="divide-y divide-border border-border border-y">
          {summary === null ? (
            <div className="py-4">
              <dt className="font-medium text-foreground">
                Capability summary
              </dt>
              <dd className="mt-1 text-muted-foreground text-sm">
                Unavailable on this request
              </dd>
            </div>
          ) : (
            <>
              <div className="py-4">
                <dt className="font-medium text-foreground">
                  Session authority
                </dt>
                <dd className="mt-1 flex items-center justify-between gap-3 text-muted-foreground text-sm">
                  <span>Verified by Better Auth</span>
                  <StatusBadge status="success">Active</StatusBadge>
                </dd>
              </div>
              {CAPABILITIES.map(({ key, label }) => {
                const available = summary.capabilities[key];
                return (
                  <div className="py-4" key={key}>
                    <dt className="font-medium text-foreground">{label}</dt>
                    <dd className="mt-1 flex items-center justify-between gap-3 text-muted-foreground text-sm">
                      <StatusBadge status={available ? "success" : "neutral"}>
                        {available ? "Available" : "Unavailable"}
                      </StatusBadge>
                    </dd>
                  </div>
                );
              })}
            </>
          )}
        </dl>
      </section>

      <section aria-labelledby="recent-feature-items-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              className="font-heading font-semibold text-foreground text-xl tracking-tight"
              id="recent-feature-items-title"
            >
              Recent feature items
            </h2>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              Up to five recent owner-scoped records from the dashboard summary.
            </p>
          </div>
          <a
            className={buttonVariants({
              variant: "secondary",
              size: "compact",
            })}
            href="/feature-items"
          >
            View all <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>

        {summary === null ? (
          <div className="mt-6 border-border border-y py-8">
            <p className="font-medium text-foreground">
              Recent items could not be loaded.
            </p>
            <p className="mt-2 text-muted-foreground text-sm">
              Open Feature Items to retry a bounded typed API request.
            </p>
          </div>
        ) : summary.featureItems.recent.length === 0 ? (
          <div className="mt-6 border-border border-y py-8">
            <p className="font-medium text-foreground">No feature items yet</p>
            <p className="mt-2 max-w-reading text-muted-foreground text-sm leading-6">
              Create the first item to exercise the complete starter vertical.
            </p>
            <a
              className={`${buttonVariants({ variant: "primary", size: "compact" })} mt-5`}
              href="/feature-items/new"
            >
              <FilePlus2 aria-hidden="true" className="size-4" />
              Create the first item
            </a>
          </div>
        ) : (
          <div className="mt-6 divide-y divide-border border-border border-y">
            {summary.featureItems.recent.map((item) => (
              <a
                className="flex min-h-16 items-center justify-between gap-4 py-4 text-foreground transition-colors duration-base ease-out hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={`/feature-items/${encodeURIComponent(item.id)}`}
                key={item.id}
              >
                <span className="min-w-0">
                  <span
                    className="block font-medium"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {item.name}
                  </span>
                  <span className="mt-1 block text-muted-foreground text-sm capitalize">
                    {item.status}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
