import { buttonVariants, StatusBadge } from "@darkfactory/ui";
import { ArrowRight, FilePlus2 } from "lucide-react";

import type { DashboardViewModel } from "../../features/dashboard/view-model.ts";

export interface DashboardContentProps {
  readonly model: DashboardViewModel;
}

export const DashboardContent = ({ model }: DashboardContentProps) => {
  const ready = model.type === "ready" ? model : null;

  return (
    <div className="space-y-12">
      <section className="grid gap-8 border-border border-y py-8 md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)] md:items-end">
        <div className="min-w-0">
          {ready === null ? (
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
                {ready.accessLabel}
              </p>
              <h2
                className="mt-3 min-w-0 font-heading font-semibold text-2xl text-foreground tracking-tight"
                style={{ overflowWrap: "anywhere" }}
              >
                {ready.greeting}
              </h2>
              <p className="mt-3 max-w-reading text-base text-muted-foreground leading-7">
                This overview reports only authoritative owner-scoped data
                returned for the current session.
              </p>
            </>
          )}
        </div>
        <div className="md:text-right">
          {ready === null ? (
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
                {ready.totalLabel}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Authoritative owner-scoped total
              </p>
            </>
          )}
        </div>
      </section>

      {ready === null ? null : (
        <section aria-labelledby="feature-status-counts-title">
          <h2
            className="font-heading font-semibold text-foreground text-xl tracking-tight"
            id="feature-status-counts-title"
          >
            Feature status
          </h2>
          <dl className="mt-5 grid divide-y divide-border border-border border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {ready.statusCounts.map(({ label, count }) => (
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
            {ready === null
              ? "Request-scoped capability information could not be loaded."
              : "Better Auth session authority and server-projected capability availability."}
          </p>
        </div>
        <dl className="divide-y divide-border border-border border-y">
          {ready === null ? (
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
              {ready.capabilities.map(
                ({ key, label, available, statusLabel }) => (
                  <div className="py-4" key={key}>
                    <dt className="font-medium text-foreground">{label}</dt>
                    <dd className="mt-1 flex items-center justify-between gap-3 text-muted-foreground text-sm">
                      <StatusBadge status={available ? "success" : "neutral"}>
                        {statusLabel}
                      </StatusBadge>
                    </dd>
                  </div>
                )
              )}
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

        {ready === null ? (
          <div className="mt-6 border-border border-y py-8">
            <p className="font-medium text-foreground">
              Recent items could not be loaded.
            </p>
            <p className="mt-2 text-muted-foreground text-sm">
              Open Feature Items to retry a bounded typed API request.
            </p>
          </div>
        ) : ready.recentItems.length === 0 ? (
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
            {ready.recentItems.map((item) => (
              <a
                className="flex min-h-16 items-center justify-between gap-4 py-4 text-foreground transition-colors duration-base ease-out hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={item.href}
                key={item.id}
              >
                <span className="min-w-0">
                  <span
                    className="block font-medium"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {item.name}
                  </span>
                  <span className="mt-1 block text-muted-foreground text-sm">
                    {item.statusLabel}
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
