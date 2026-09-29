"use client";

import type { FeatureItemOutput, FeatureItemStatus } from "@darkfactory/api";
import { Button, Input, Label } from "@darkfactory/ui";
import { Archive, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  classifyFeatureFailure,
  createBrowserFeatureItemGateway,
  type FeatureFailure,
  type FeatureItemGateway,
  restorePortalFocus,
  withoutFeatureItem,
} from "./feature-items-client.ts";
import {
  FeatureItemsCollection,
  type FeatureItemsCollectionState,
} from "./feature-items-collection.tsx";
import { FeatureRecoveryAction } from "./feature-recovery-action.tsx";

export interface FeatureItemsWorkspaceProps {
  readonly gateway?: FeatureItemGateway;
}

export const FeatureItemsWorkspace = ({
  gateway: suppliedGateway,
}: FeatureItemsWorkspaceProps) => {
  const [gateway] = useState(
    () => suppliedGateway ?? createBrowserFeatureItemGateway()
  );
  const [state, setState] = useState<FeatureItemsCollectionState>({
    type: "loading",
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | FeatureItemStatus>("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<"" | FeatureItemStatus>(
    ""
  );
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveCandidate, setArchiveCandidate] =
    useState<FeatureItemOutput | null>(null);
  const [archiveFailure, setArchiveFailure] = useState<FeatureFailure | null>(
    null
  );
  const [failedArchiveItem, setFailedArchiveItem] =
    useState<FeatureItemOutput | null>(null);
  const [feedback, setFeedback] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const loadRevision = useRef(0);
  const isFiltered = appliedQuery.length > 0 || appliedStatus.length > 0;

  const load = useCallback(async () => {
    const revision = loadRevision.current + 1;
    loadRevision.current = revision;
    setState({ type: "loading" });
    try {
      const items = await gateway.list({
        limit: 50,
        ...(appliedQuery.length === 0 ? {} : { query: appliedQuery }),
        ...(appliedStatus.length === 0
          ? {}
          : { status: appliedStatus as FeatureItemStatus }),
      });
      if (loadRevision.current === revision)
        return setState({ type: "ready", items });
      return;
    } catch (error) {
      if (loadRevision.current === revision) {
        const failure = classifyFeatureFailure(error);
        return setState({
          type: "error",
          kind: failure.kind,
          message: failure.message,
        });
      }
      return;
    }
  }, [appliedQuery, appliedStatus, gateway]);

  useEffect(() => {
    const pendingLoad = load();
    void pendingLoad;
    return () => {
      loadRevision.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (archiveCandidate !== null) confirmButtonRef.current?.focus();
  }, [archiveCandidate]);

  const requestArchive = (
    item: FeatureItemOutput,
    trigger: HTMLButtonElement
  ) => {
    if (archivingId !== null) return;
    archiveTriggerRef.current = trigger;
    setArchiveFailure(null);
    setFailedArchiveItem(null);
    return setArchiveCandidate(item);
  };

  const cancelArchive = () => {
    setArchiveCandidate(null);
    return restorePortalFocus(archiveTriggerRef.current);
  };

  const confirmArchive = async () => {
    if (archiveCandidate === null || archivingId !== null) return;
    const item = archiveCandidate;
    setArchiveCandidate(null);
    setArchivingId(item.id);
    setArchiveFailure(null);
    setFailedArchiveItem(null);
    setFeedback("");

    try {
      await gateway.archive(item.id);
      setState((current) =>
        current.type === "ready"
          ? { type: "ready", items: withoutFeatureItem(current.items, item.id) }
          : current
      );
      void load();
      setFeedback(`${item.name} was archived.`);
      return queueMicrotask(() => feedbackRef.current?.focus());
    } catch (error) {
      const failure = classifyFeatureFailure(error);
      setArchiveFailure(failure);
      setFailedArchiveItem(item);
      setFeedback(failure.message);
      return restorePortalFocus(archiveTriggerRef.current);
    } finally {
      setArchivingId(null);
    }
  };

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (archivingId !== null) return;
    setAppliedQuery(query.trim());
    return setAppliedStatus(status);
  };

  const resetFilters = () => {
    if (archivingId !== null) return;
    setQuery("");
    setStatus("");
    setAppliedQuery("");
    return setAppliedStatus("");
  };

  return (
    <div className="space-y-6">
      <form
        className="grid gap-4 border-border border-b pb-6 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
        onSubmit={applyFilters}
        role="search"
      >
        <div className="space-y-2">
          <Label htmlFor="feature-items-query">Search feature items</Label>
          <Input
            disabled={archivingId !== null}
            id="feature-items-query"
            maxLength={200}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Example: onboarding"
            value={query}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="feature-items-status">Status</Label>
          <select
            className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 font-body text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={archivingId !== null}
            id="feature-items-status"
            onChange={(event) =>
              setStatus(event.currentTarget.value as "" | FeatureItemStatus)
            }
            value={status}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button disabled={archivingId !== null} type="submit">
            <Search aria-hidden="true" className="size-4" />
            Apply
          </Button>
          {isFiltered ? (
            <Button
              disabled={archivingId !== null}
              onClick={resetFilters}
              variant="ghost"
            >
              Reset
            </Button>
          ) : null}
        </div>
      </form>
      <p className="text-muted-foreground text-xs">
        Showing up to 50 matching owner-scoped records.
      </p>

      <div
        aria-atomic="true"
        aria-live="polite"
        className="min-h-6 text-muted-foreground text-sm outline-none"
        ref={feedbackRef}
        tabIndex={-1}
      >
        {feedback}
      </div>

      {archiveFailure === null ? null : (
        <FeatureRecoveryAction
          kind={archiveFailure.kind}
          onRetry={() => setArchiveCandidate(failedArchiveItem)}
          returnHref="/feature-items"
        />
      )}

      {archiveCandidate === null ? null : (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape handling for key events that bubble from the confirmation buttons.
        <section
          aria-describedby="archive-confirmation-description"
          aria-labelledby="archive-confirmation-title"
          className="flex flex-col gap-4 border-warning-border border-y bg-warning-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          onKeyDown={(event) => {
            if (event.key === "Escape") return cancelArchive();
            return;
          }}
          role="region"
        >
          <div className="min-w-0">
            <h2
              className="font-heading font-semibold text-base text-foreground"
              id="archive-confirmation-title"
              style={{ overflowWrap: "anywhere" }}
            >
              Archive {archiveCandidate.name}?
            </h2>
            <p
              className="mt-1 text-muted-foreground text-sm"
              id="archive-confirmation-description"
            >
              The record remains available in archived views.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={cancelArchive} size="compact" variant="ghost">
              <X aria-hidden="true" className="size-4" />
              Cancel
            </Button>
            <Button
              onClick={confirmArchive}
              ref={confirmButtonRef}
              size="compact"
              variant="destructive"
            >
              <Archive aria-hidden="true" className="size-4" />
              Archive item
            </Button>
          </div>
        </section>
      )}

      <FeatureItemsCollection
        archiveBusy={archivingId !== null}
        archivingId={archivingId}
        isFiltered={isFiltered}
        onArchive={requestArchive}
        onResetFilters={resetFilters}
        onRetry={load}
        state={state}
      />
    </div>
  );
};
