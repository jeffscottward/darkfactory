import type { AddressOutput } from "@darkfactory/api";
import { Button, buttonVariants, Skeleton, StatusBadge } from "@darkfactory/ui";
import { Plus, RotateCcw } from "lucide-react";

import { InlineNotice } from "../inline-notice.tsx";
import type { AccountFailureKind } from "./account-client.ts";
import {
  type AccountFeedback,
  AccountFeedbackMessage,
} from "./account-feedback.tsx";

export type AddressBookState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "error"; kind: AccountFailureKind; message: string }>
  | Readonly<{ type: "ready"; addresses: readonly AddressOutput[] }>;

export interface AddressBookProps {
  readonly busyId?: string | null;
  readonly confirmingRemoveId?: string | null;
  readonly feedback?: AccountFeedback | null | undefined;
  readonly onCancelRemove?: () => void;
  readonly onConfirmRemove?: (address: AddressOutput) => void;
  readonly onCreate?: () => void;
  readonly onEdit?: (address: AddressOutput) => void;
  readonly onRequestRemove?: (address: AddressOutput) => void;
  readonly onRetry?: () => void;
  readonly onSetPrimary?: (address: AddressOutput) => void;
  readonly state: AddressBookState;
}

const addressLabel = (address: AddressOutput): string =>
  `${address.type} address`;

const LoadingAddresses = () => (
  <div aria-busy="true" aria-live="polite" className="space-y-1" role="status">
    <span className="sr-only">Loading addresses</span>
    {["one", "two"].map((key) => (
      <div className="space-y-1 border-border border-b py-2" key={key}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    ))}
  </div>
);

export const AddressBook = ({
  busyId = null,
  confirmingRemoveId = null,
  feedback,
  onCancelRemove,
  onConfirmRemove,
  onCreate,
  onEdit,
  onRequestRemove,
  onRetry,
  onSetPrimary,
  state,
}: AddressBookProps) => {
  if (state.type === "loading") return <LoadingAddresses />;
  if (state.type === "error") {
    return (
      <div aria-live="assertive" role="alert">
        <InlineNotice
          action={
            state.kind === "unauthorized" ? (
              <a
                className={buttonVariants({ size: "compact" })}
                href="/sign-in?callbackURL=%2Fsettings%2Faccount%2Faddress"
              >
                Sign in
              </a>
            ) : state.kind === "forbidden" || state.kind === "not-found" ? (
              <a
                className={buttonVariants({
                  size: "compact",
                  variant: "secondary",
                })}
                href="/settings/account/profile"
              >
                Back to account
              </a>
            ) : (
              <Button onClick={onRetry} size="compact" variant="secondary">
                <RotateCcw aria-hidden="true" className="size-4" />
                Try again
              </Button>
            )
          }
          message={state.message}
          title="Addresses could not be loaded"
        />
      </div>
    );
  }
  if (state.addresses.length === 0) {
    return (
      <div aria-live="polite" className="space-y-3" role="status">
        <AccountFeedbackMessage feedback={feedback} />
        <InlineNotice
          action={
            <Button id="add-address" onClick={onCreate} size="compact">
              <Plus aria-hidden="true" className="size-4" />
              Add an address
            </Button>
          }
          title="No addresses saved"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AccountFeedbackMessage feedback={feedback} />
      <div
        aria-label="Saved addresses"
        className="divide-y divide-border border-border border-y"
        role="list"
      >
        {state.addresses.map((address) => {
          const label = addressLabel(address);
          const isThisBusy = busyId === address.id;
          const isAnyBusy = busyId !== null;
          const isConfirming = confirmingRemoveId === address.id;
          return (
            <article
              className="grid min-w-0 gap-2 py-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
              key={address.id}
              role="listitem"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading font-semibold text-base text-foreground capitalize">
                    {address.type}
                  </h3>
                  {address.isPrimary ? (
                    <StatusBadge status="success">Primary</StatusBadge>
                  ) : null}
                </div>
                <address className="break-words text-muted-foreground text-sm not-italic">
                  <span className="block">{address.line1}</span>
                  {address.line2 === null ? null : (
                    <span className="block">{address.line2}</span>
                  )}
                  <span className="block">
                    {address.city}, {address.region} {address.postalCode}
                  </span>
                  <span className="block">{address.country}</span>
                </address>
              </div>
              {isConfirming ? (
                <div
                  aria-label={`Confirm removal of ${label}`}
                  className="max-w-sm space-y-2 border-destructive border-l-2 pl-3"
                  role="alertdialog"
                >
                  <p className="font-medium text-foreground text-sm">
                    Remove this address?
                  </p>
                  <p className="text-muted-foreground text-sm">
                    This cannot be undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      aria-label={`Confirm removal of ${label}`}
                      autoFocus
                      disabled={isAnyBusy}
                      loading={isThisBusy}
                      loadingLabel="Removing address"
                      onClick={() => onConfirmRemove?.(address)}
                      size="compact"
                      variant="destructive"
                    >
                      Confirm removal
                    </Button>
                    <Button
                      disabled={isAnyBusy}
                      onClick={onCancelRemove}
                      size="compact"
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    aria-label={`Edit ${label}`}
                    disabled={isAnyBusy}
                    onClick={() => onEdit?.(address)}
                    size="compact"
                    variant="secondary"
                  >
                    Edit
                  </Button>
                  {address.isPrimary ? null : (
                    <Button
                      aria-label={`Make ${label} primary`}
                      disabled={isAnyBusy}
                      loading={isThisBusy}
                      loadingLabel="Updating primary address"
                      onClick={() => onSetPrimary?.(address)}
                      size="compact"
                      variant="ghost"
                    >
                      Make primary
                    </Button>
                  )}
                  <Button
                    aria-label={`Remove ${label}`}
                    disabled={isAnyBusy}
                    onClick={() => onRequestRemove?.(address)}
                    size="compact"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};
