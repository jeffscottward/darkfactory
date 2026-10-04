import { buttonVariants, StatusBadge } from "@darkfactory/ui";
import { ArrowRight } from "lucide-react";

import type { DashboardViewModel } from "../../features/dashboard/view-model.ts";

export interface DashboardContentProps {
  readonly model: DashboardViewModel;
}

const SECTION_TITLE_CLASS =
  "font-heading font-semibold text-base text-foreground tracking-tight";

export const DashboardContent = ({ model }: DashboardContentProps) => {
  const ready = model.type === "ready" ? model : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-border border-b pb-3">
        {ready === null ? (
          <>
            <div className="min-w-0">
              <h2 className="font-heading font-semibold text-foreground text-lg tracking-tight">
                Dashboard data unavailable
              </h2>
              <p className="text-muted-foreground text-sm">
                Account details are not shown when the dashboard summary cannot
                be loaded.
              </p>
            </div>
            <p className="font-medium text-foreground text-sm">
              Feature data unavailable
            </p>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <h2
                className="min-w-0 font-heading font-semibold text-foreground text-lg tracking-tight"
                style={{ overflowWrap: "anywhere" }}
              >
                {ready.greeting}
              </h2>
              <p className="text-muted-foreground text-sm">
                {ready.accessLabel}
              </p>
            </div>
            <p className="font-medium text-foreground text-sm">
              {ready.totalLabel}
            </p>
          </>
        )}
      </section>

      {ready === null ? null : (
        <section aria-labelledby="feature-status-counts-title">
          <h2 className={SECTION_TITLE_CLASS} id="feature-status-counts-title">
            Feature status
          </h2>
          <dl className="mt-2 grid grid-cols-3 divide-x divide-border border-border border-y">
            {ready.statusCounts.map(({ label, count }) => (
              <div className="px-3 py-2 first:pl-0" key={label}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="font-heading font-semibold text-foreground text-lg">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-labelledby="dashboard-capabilities-title">
        <h2 className={SECTION_TITLE_CLASS} id="dashboard-capabilities-title">
          Capabilities
        </h2>
        <dl className="mt-2 divide-y divide-border border-border border-y text-sm">
          {ready === null ? (
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="font-medium text-foreground">
                Capability summary
              </dt>
              <dd className="text-muted-foreground">
                Unavailable on this request
              </dd>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="font-medium text-foreground">
                  Session authority
                </dt>
                <dd className="flex items-center gap-3 text-muted-foreground">
                  <span>Verified by Better Auth</span>
                  <StatusBadge status="success">Active</StatusBadge>
                </dd>
              </div>
              {ready.capabilities.map(
                ({ key, label, available, statusLabel }) => (
                  <div
                    className="flex items-center justify-between gap-3 py-2"
                    key={key}
                  >
                    <dt className="font-medium text-foreground">{label}</dt>
                    <dd>
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
        <div className="flex items-center justify-between gap-3">
          <h2 className={SECTION_TITLE_CLASS} id="recent-feature-items-title">
            Recent feature items
          </h2>
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
          <p className="mt-2 border-border border-y py-2 text-foreground text-sm">
            Recent items could not be loaded.
          </p>
        ) : ready.recentItems.length === 0 ? null : (
          <div className="mt-2 divide-y divide-border border-border border-y">
            {ready.recentItems.map((item) => (
              <a
                className="flex min-h-11 items-center justify-between gap-3 py-2 text-foreground text-sm transition-colors duration-base ease-out hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={item.href}
                key={item.id}
              >
                <span
                  className="min-w-0 font-medium"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {item.name}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {item.statusLabel}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
