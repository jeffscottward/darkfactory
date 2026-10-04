"use client";

import type { FeatureItemOutput, FeatureItemStatus } from "@darkfactory/api";
import {
  Button,
  Input,
  Label,
  Skeleton,
  StatusBadge,
  Textarea,
} from "@darkfactory/ui";
import { Archive, Save, X } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  classifyFeatureFailure,
  createBrowserFeatureItemGateway,
  type FeatureFailure,
  type FeatureItemGateway,
} from "./feature-items-client.ts";
import { FeatureRecoveryAction } from "./feature-recovery-action.tsx";
import { InlineNotice } from "../inline-notice.tsx";

type EditorState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "error"; failure: FeatureFailure }>
  | Readonly<{ type: "ready"; item: FeatureItemOutput }>;

export const isEditorMutationLocked = ({
  archiving,
  changingStatus,
  saving,
}: Readonly<{
  archiving: boolean;
  changingStatus: boolean;
  saving: boolean;
}>): boolean => archiving || changingStatus || saving;

export interface EditorMutationGuard {
  readonly acquire: () => boolean;
  readonly isLocked: () => boolean;
  readonly release: () => void;
}

export const createEditorMutationGuard = (): EditorMutationGuard => {
  let locked = false;
  return {
    acquire: () => {
      if (locked) return false;
      locked = true;
      return true;
    },
    isLocked: () => locked,
    release: () => {
      locked = false;
    },
  };
};
export const ArchivedFeatureItemNotice = () => (
  <p
    className="border-border border-y py-2 font-medium text-foreground text-sm"
    role="note"
  >
    Archived records cannot be edited.
  </p>
);
export const ArchivedFeatureItemDetails = ({
  item,
}: Readonly<{ item: FeatureItemOutput }>) => (
  <div className="max-w-reading space-y-3">
    <ArchivedFeatureItemNotice />
    <dl className="grid divide-y divide-border border-border border-y text-sm sm:grid-cols-2">
      <div className="py-2 sm:col-span-2">
        <dt className="font-medium text-muted-foreground text-xs">Name</dt>
        <dd className="text-foreground" style={{ overflowWrap: "anywhere" }}>
          {item.name}
        </dd>
      </div>
      <div className="py-2 sm:col-span-2">
        <dt className="font-medium text-muted-foreground text-xs">
          Description
        </dt>
        <dd
          className="whitespace-pre-wrap text-foreground"
          style={{ overflowWrap: "anywhere" }}
        >
          {item.description.length > 0
            ? item.description
            : "No description provided."}
        </dd>
      </div>
      <div className="py-2">
        <dt className="font-medium text-muted-foreground text-xs">Status</dt>
        <dd>
          <StatusBadge status="warning">Archived</StatusBadge>
        </dd>
      </div>
      <div className="py-2 sm:text-right">
        <dt className="font-medium text-muted-foreground text-xs">
          Last updated
        </dt>
        <dd className="text-foreground">
          {item.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
        </dd>
      </div>
    </dl>
  </div>
);

export interface EditorNameFieldProps {
  readonly disabled: boolean;
  readonly error: string | null;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly onChange?: (value: string) => void;
  readonly value: string;
}

export const EditorNameField = ({
  disabled,
  error,
  inputRef,
  onChange,
  value,
}: EditorNameFieldProps) => (
  <div className="space-y-1">
    <Label htmlFor="edit-feature-name">
      Name <span className="text-muted-foreground">(required)</span>
    </Label>
    <Input
      aria-describedby={error === null ? undefined : "edit-feature-name-error"}
      aria-errormessage={error === null ? undefined : "edit-feature-name-error"}
      aria-invalid={error === null ? undefined : true}
      disabled={disabled}
      id="edit-feature-name"
      maxLength={200}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      ref={inputRef}
      value={value}
    />
    {error === null ? null : (
      <p
        className="text-destructive text-sm"
        id="edit-feature-name-error"
        role="alert"
      >
        {error}
      </p>
    )}
  </div>
);

export interface FeatureItemEditorProps {
  readonly id: string;
  readonly gateway?: FeatureItemGateway;
}

const statusTone = (status: FeatureItemStatus): "neutral" | "success" => {
  if (status === "active") return "success";
  return "neutral";
};

export const FeatureItemEditor = ({
  gateway: suppliedGateway,
  id,
}: FeatureItemEditorProps) => {
  const [gateway] = useState(
    () => suppliedGateway ?? createBrowserFeatureItemGateway()
  );
  const [state, setState] = useState<EditorState>({ type: "loading" });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [mutationFailure, setMutationFailure] = useState<FeatureFailure | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [mutationGuard] = useState(() => createEditorMutationGuard());
  const feedbackRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cancelArchiveRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreArchiveTriggerRef = useRef(false);
  const isMutating = isEditorMutationLocked({
    archiving,
    changingStatus,
    saving,
  });

  const load = useCallback(async () => {
    setState({ type: "loading" });
    try {
      const item = await gateway.get(id);
      setState({ type: "ready", item });
      setName(item.name);
      return setDescription(item.description);
    } catch (error) {
      return setState({
        type: "error",
        failure: classifyFeatureFailure(error),
      });
    }
  }, [gateway, id]);

  useEffect(() => {
    let isActive = true;
    gateway.get(id).then(
      (item) => {
        const shouldUpdate = isActive;
        if (!shouldUpdate) return;
        setState({ type: "ready", item });
        setName(item.name);
        return setDescription(item.description);
      },
      (error) => {
        const shouldUpdate = isActive;
        if (shouldUpdate)
          return setState({
            type: "error",
            failure: classifyFeatureFailure(error),
          });
        return;
      }
    );
    return () => {
      isActive = false;
    };
  }, [gateway, id]);

  useEffect(() => {
    if (confirmArchive) {
      cancelArchiveRef.current?.focus();
    } else if (restoreArchiveTriggerRef.current) {
      restoreArchiveTriggerRef.current = false;
      archiveTriggerRef.current?.focus();
    }
  }, [confirmArchive]);

  const setSafeFeedbackFocus = () =>
    queueMicrotask(() => feedbackRef.current?.focus());

  const saveDetails = async () => {
    if (state.type !== "ready" || isMutating) return;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      const message = "Enter a name before saving.";
      setNameError(message);
      setFeedback(message);
      queueMicrotask(() => nameInputRef.current?.focus());
      return;
    }
    if (!mutationGuard.acquire()) return;

    const previous = state.item;
    setSaving(true);
    setMutationFailure(null);
    setFeedback("");
    setState({
      type: "ready",
      item: { ...previous, name: trimmedName, description },
    });
    try {
      const saved = await gateway.update(id, {
        name: trimmedName,
        description,
      });
      setState({ type: "ready", item: saved });
      setName(saved.name);
      setDescription(saved.description);
      return setFeedback("Changes saved.");
    } catch (error) {
      const failure = classifyFeatureFailure(error);
      setState({ type: "ready", item: previous });
      setMutationFailure(failure);
      return setFeedback(failure.message);
    } finally {
      setSaving(false);
      mutationGuard.release();
      setSafeFeedbackFocus();
    }
  };

  const changeStatus = async (status: "draft" | "active") => {
    if (
      state.type !== "ready" ||
      isMutating ||
      state.item.status === status ||
      !mutationGuard.acquire()
    )
      return;
    const previous = state.item;
    setChangingStatus(true);
    setMutationFailure(null);
    setFeedback("");
    setState({ type: "ready", item: { ...previous, status } });
    try {
      const saved = await gateway.changeStatus(id, status);
      setState({ type: "ready", item: saved });
      return setFeedback(`Status changed to ${status}.`);
    } catch (error) {
      const failure = classifyFeatureFailure(error);
      setState({ type: "ready", item: previous });
      setMutationFailure(failure);
      return setFeedback(failure.message);
    } finally {
      setChangingStatus(false);
      mutationGuard.release();
      setSafeFeedbackFocus();
    }
  };

  const closeArchiveConfirmation = () => {
    restoreArchiveTriggerRef.current = true;
    return setConfirmArchive(false);
  };

  const archive = async () => {
    if (state.type !== "ready" || isMutating || !mutationGuard.acquire())
      return;
    setArchiving(true);
    setMutationFailure(null);
    setFeedback("");
    try {
      await gateway.archive(id);
      return window.location.assign("/feature-items");
    } catch (error) {
      const failure = classifyFeatureFailure(error);
      setMutationFailure(failure);
      setFeedback(failure.message);
      return closeArchiveConfirmation();
    } finally {
      setArchiving(false);
      mutationGuard.release();
    }
  };

  if (state.type === "loading") {
    return (
      <div aria-busy="true" className="max-w-reading space-y-3" role="status">
        <span className="sr-only">Loading feature item</span>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-11 w-40" />
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <InlineNotice
        action={
          <FeatureRecoveryAction
            kind={state.failure.kind}
            onRetry={load}
            returnHref="/feature-items"
          />
        }
        message={state.failure.message}
        title="Feature item unavailable"
      />
    );
  }

  if (state.item.status === "archived")
    return <ArchivedFeatureItemDetails item={state.item} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,42rem)_minmax(14rem,1fr)]">
      <div className="min-w-0 space-y-3">
        <div
          aria-live="polite"
          className="text-muted-foreground text-sm outline-none"
          ref={feedbackRef}
          tabIndex={-1}
        >
          {feedback}
        </div>
        {mutationFailure === null ||
        !["unauthorized", "forbidden", "not-found"].includes(
          mutationFailure.kind
        ) ? null : (
          <FeatureRecoveryAction
            kind={mutationFailure.kind}
            returnHref="/feature-items"
          />
        )}
        <EditorNameField
          disabled={isMutating}
          error={nameError}
          inputRef={nameInputRef}
          onChange={(value) => {
            setName(value);
            if (value.trim().length > 0) return setNameError(null);
            return;
          }}
          value={name}
        />
        <div className="space-y-1">
          <Label htmlFor="edit-feature-description">Description</Label>
          <Textarea
            disabled={isMutating}
            id="edit-feature-description"
            maxLength={10_000}
            onChange={(event) => setDescription(event.currentTarget.value)}
            value={description}
          />
        </div>
        <Button
          disabled={isMutating}
          loading={saving}
          loadingLabel="Saving changes"
          onClick={saveDetails}
        >
          <Save aria-hidden="true" className="size-4" />
          Save changes
        </Button>
      </div>

      <aside
        aria-label="Feature item status and archive actions"
        className="min-w-0 space-y-3 border-border border-t pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-heading font-semibold text-base text-foreground">
              Status
            </h2>
            <StatusBadge status={statusTone(state.item.status)}>
              {state.item.status}
            </StatusBadge>
          </div>
          <Label htmlFor="edit-feature-status">Change status</Label>
          <select
            className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 font-body text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={isMutating}
            id="edit-feature-status"
            onChange={(event) =>
              changeStatus(event.currentTarget.value as "draft" | "active")
            }
            value={state.item.status}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </div>

        <div className="border-border border-t pt-3">
          {confirmArchive ? (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape handling for key events that bubble from the confirmation buttons.
            <section
              aria-describedby="editor-archive-description"
              aria-labelledby="editor-archive-title"
              onKeyDown={(event) => {
                if (event.key === "Escape") return closeArchiveConfirmation();
                return;
              }}
              role="region"
            >
              <h2
                className="font-heading font-semibold text-base text-foreground"
                id="editor-archive-title"
              >
                Archive this item?
              </h2>
              <p
                className="mt-1 text-muted-foreground text-sm"
                id="editor-archive-description"
              >
                The record remains available in archived views.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  disabled={isMutating}
                  onClick={closeArchiveConfirmation}
                  ref={cancelArchiveRef}
                  size="compact"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-4" />
                  Cancel
                </Button>
                <Button
                  disabled={isMutating}
                  loading={archiving}
                  loadingLabel="Archiving feature item"
                  onClick={archive}
                  size="compact"
                  variant="destructive"
                >
                  <Archive aria-hidden="true" className="size-4" />
                  Archive
                </Button>
              </div>
            </section>
          ) : (
            <Button
              disabled={isMutating}
              onClick={() => setConfirmArchive(true)}
              ref={archiveTriggerRef}
              variant="ghost"
            >
              <Archive aria-hidden="true" className="size-4" />
              Archive feature item
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
};
