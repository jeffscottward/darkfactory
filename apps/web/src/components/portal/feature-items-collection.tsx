import type { FeatureItemOutput, FeatureItemStatus } from "@darkfactory/api";
import {
  Button,
  buttonVariants,
  cn,
  Skeleton,
  StatusBadge,
} from "@darkfactory/ui";
import { Archive } from "lucide-react";
import type { FeatureFailureKind } from "./feature-items-client.ts";
import { FeatureRecoveryAction } from "./feature-recovery-action.tsx";
import { InlineNotice } from "../inline-notice.tsx";

export type FeatureItemsCollectionState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "error"; kind: FeatureFailureKind; message: string }>
  | Readonly<{ type: "ready"; items: readonly FeatureItemOutput[] }>;

export interface FeatureItemsCollectionProps {
  readonly state: FeatureItemsCollectionState;
  readonly archiveBusy?: boolean;
  readonly archivingId?: string | null;
  readonly isFiltered?: boolean;
  readonly onArchive?: (
    item: FeatureItemOutput,
    trigger: HTMLButtonElement
  ) => void;
  readonly onResetFilters?: () => void;
  readonly onRetry?: () => void;
}

const statusTone = (
  status: FeatureItemStatus
): "neutral" | "success" | "warning" => {
  if (status === "active") return "success";
  if (status === "archived") return "warning";
  return "neutral";
};

const statusLabel = (status: FeatureItemStatus): string => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const LoadingCollection = () => (
  <div aria-busy="true" aria-live="polite" className="space-y-1" role="status">
    <span className="sr-only">Loading feature items</span>
    {["one", "two", "three"].map((key) => (
      <div
        className="flex items-center justify-between gap-3 border-border border-b py-2"
        key={key}
      >
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-6 w-20" />
      </div>
    ))}
  </div>
);

export const FeatureItemsCollection = ({
  archiveBusy = false,
  archivingId = null,
  isFiltered = false,
  onArchive,
  onResetFilters,
  onRetry,
  state,
}: FeatureItemsCollectionProps) => {
  if (state.type === "loading") return <LoadingCollection />;

  if (state.type === "error") {
    return (
      <InlineNotice
        action={
          <FeatureRecoveryAction
            kind={state.kind}
            onRetry={onRetry}
            returnHref="/feature-items"
          />
        }
        message={state.message}
        title="Feature items could not be loaded"
      />
    );
  }

  if (state.items.length === 0 && isFiltered) {
    return (
      <InlineNotice
        action={
          <Button onClick={onResetFilters} size="compact" variant="secondary">
            Reset filters
          </Button>
        }
        title="No matching feature items"
      />
    );
  }

  if (state.items.length === 0) {
    return <InlineNotice title="No feature items" />;
  }

  return (
    <div className="divide-y divide-border border-border border-y" role="list">
      {state.items.map((item) => {
        const isArchiving = archivingId === item.id;
        return (
          <article
            className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={item.id}
            role="listitem"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className="min-w-0 font-heading font-semibold text-base text-foreground tracking-tight"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {item.name}
                </h2>
                <StatusBadge status={statusTone(item.status)}>
                  {statusLabel(item.status)}
                </StatusBadge>
                <span className="text-muted-foreground text-xs">
                  Updated{" "}
                  {item.updatedAt.toLocaleDateString("en-US", {
                    dateStyle: "medium",
                  })}
                </span>
              </div>
              {item.description.length > 0 ? (
                <p
                  className="max-w-reading text-muted-foreground text-sm"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {item.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <a
                aria-label={`${item.status === "archived" ? "View" : "Edit"} ${item.name}`}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "compact" })
                )}
                href={`/feature-items/${encodeURIComponent(item.id)}`}
              >
                {item.status === "archived" ? "View" : "Edit"}
              </a>
              {item.status === "archived" ? null : (
                <Button
                  aria-label={`Archive ${item.name}`}
                  disabled={archiveBusy}
                  loading={isArchiving}
                  loadingLabel={`Archiving ${item.name}`}
                  onClick={(event) => onArchive?.(item, event.currentTarget)}
                  size="compact"
                  variant="ghost"
                >
                  <Archive aria-hidden="true" className="size-4" />
                  Archive
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
