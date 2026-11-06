"use client";

import type {
  AddressCreateInput,
  AddressOutput,
  AddressUpdateInput,
} from "@darkfactory/api";
import { Button } from "@darkfactory/ui";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  accountFailureKind,
  createBrowserAccountGateway,
  createLatestRequestGuard,
  isAmbiguousAccountFailure,
  safeAccountFeedback,
} from "./account-client.ts";
import type { AccountFeedback } from "./account-feedback.tsx";
import { AddressBook, type AddressBookState } from "./address-book.tsx";
import { AddressForm } from "./address-form.tsx";

type FormTarget = "new" | AddressOutput | null;
// Public mutations exist only in ready UI; concurrent mutation refreshes also commit ready state.
type ReadyAddressBookState = Extract<
  AddressBookState,
  { readonly type: "ready" }
>;
const upsertAddress = (
  addresses: readonly AddressOutput[],
  result: AddressOutput
): AddressOutput[] => {
  const found = addresses.some((address) => address.id === result.id);
  return found
    ? addresses.map((address) => (address.id === result.id ? result : address))
    : [result, ...addresses];
};

export const addressMutationMessage = (
  input: AddressCreateInput | AddressUpdateInput
): string => ("id" in input ? "Address updated." : "Address created.");

export const AddressPageClient = () => {
  const [gateway] = useState(createBrowserAccountGateway);
  const [state, setState] = useState<AddressBookState>({ type: "loading" });
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AccountFeedback | null>(null);
  const [formFeedback, setFormFeedback] = useState<AccountFeedback | null>(
    null
  );
  const [requests] = useState(createLatestRequestGuard);
  const mutationLock = useRef(false);
  const focusOrigin = useRef<HTMLElement | null>(null);

  const commitAddresses = useCallback((addresses: readonly AddressOutput[]) => {
    setState({ addresses, type: "ready" });
    return setFormTarget((current) => {
      if (current === null || current === "new") return current;
      return addresses.find((address) => address.id === current.id) ?? current;
    });
  }, []);

  const refresh = useCallback(
    async (warnOnFailure: boolean): Promise<boolean> => {
      const request = requests.next();
      try {
        const addresses = await gateway.listAddresses();
        if (requests.isLatest(request)) commitAddresses(addresses);
        return requests.isLatest(request);
      } catch {
        if (requests.isLatest(request) && warnOnFailure) {
          setFeedback({
            message:
              "The change was saved, but the address list could not be refreshed.",
            tone: "info",
          });
        }
        return false;
      }
    },
    [commitAddresses, gateway, requests]
  );

  const load = useCallback(async () => {
    const request = requests.next();
    setFeedback(null);
    setState({ type: "loading" });
    try {
      const addresses = await gateway.listAddresses();
      if (requests.isLatest(request)) return commitAddresses(addresses);
      return;
    } catch (error) {
      if (requests.isLatest(request)) {
        return setState({
          kind: accountFailureKind(error),
          message: safeAccountFeedback(error),
          type: "error",
        });
      }
      return;
    }
  }, [commitAddresses, gateway, requests]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (
    input: AddressCreateInput | AddressUpdateInput
  ): Promise<void> => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusyId("form");
    setFormFeedback(null);
    try {
      const result =
        "id" in input
          ? await gateway.updateAddress(input)
          : await gateway.createAddress(input);
      setState((current) => ({
        addresses: upsertAddress(
          (current as ReadyAddressBookState).addresses,
          result
        ),
        type: "ready",
      }));
      setFormTarget(null);
      setFormVersion((version) => version + 1);
      setFeedback({ message: addressMutationMessage(input), tone: "success" });
      void refresh(true);
    } catch (error) {
      if (!("id" in input) && isAmbiguousAccountFailure(error)) {
        setFormTarget(null);
        setFormVersion((version) => version + 1);
        const refreshed = await refresh(false);
        if (refreshed) {
          setFeedback({
            message:
              "The address creation outcome could not be confirmed. Review the refreshed list before creating another.",
            tone: "info",
          });
        } else {
          setState({
            kind: "retryable",
            message:
              "The address creation outcome is unknown. Reload the address list before creating another.",
            type: "error",
          });
        }
      } else if (accountFailureKind(error) === "conflict") {
        await refresh(false);
        setFormFeedback({
          message:
            "This address changed elsewhere. Your entries are preserved; review them and save again.",
          tone: "error",
        });
      } else {
        setFormFeedback({ message: safeAccountFeedback(error), tone: "error" });
      }
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  };

  const setPrimary = async (address: AddressOutput): Promise<void> => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusyId(address.id);
    setFeedback(null);
    try {
      const result = await gateway.setPrimaryAddress(
        address.id,
        address.updatedAt
      );
      setState((current) => ({
        addresses: (current as ReadyAddressBookState).addresses.map(
          (entry) => ({ ...entry, isPrimary: entry.id === result.id })
        ),
        type: "ready",
      }));
      setFeedback({ message: "Primary address updated.", tone: "success" });
      void refresh(true);
    } catch (error) {
      if (accountFailureKind(error) === "conflict") await refresh(false);
      setFeedback({ message: safeAccountFeedback(error), tone: "error" });
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  };

  const remove = async (address: AddressOutput): Promise<void> => {
    if (mutationLock.current || confirmingRemoveId !== address.id) return;
    mutationLock.current = true;
    setBusyId(address.id);
    setFeedback(null);
    try {
      await gateway.removeAddress(address.id, address.updatedAt);
      setState((current) => ({
        addresses: (current as ReadyAddressBookState).addresses.filter(
          (entry) => entry.id !== address.id
        ),
        type: "ready",
      }));
      setConfirmingRemoveId(null);
      setFeedback({ message: "Address removed.", tone: "success" });
      window.setTimeout(
        () => document.getElementById("add-address")?.focus(),
        0
      );
      void refresh(true);
    } catch (error) {
      if (accountFailureKind(error) === "conflict") await refresh(false);
      setFeedback({ message: safeAccountFeedback(error), tone: "error" });
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  };

  const rememberFocus = (): void => {
    focusOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };

  const restoreFocus = (): void => {
    const target = focusOrigin.current;
    window.setTimeout(() => target?.focus(), 0);
  };

  const openCreate = () => {
    rememberFocus();
    setFormFeedback(null);
    setFormTarget("new");
    return setFormVersion((version) => version + 1);
  };

  return (
    <div className="space-y-3">
      {state.type === "ready" &&
      state.addresses.length > 0 &&
      formTarget === null ? (
        <Button
          disabled={busyId !== null}
          id="add-address"
          onClick={openCreate}
          variant="secondary"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add an address
        </Button>
      ) : null}
      {formTarget === null ? null : (
        <AddressForm
          disabled={busyId !== null}
          feedback={formFeedback}
          initialAddress={formTarget === "new" ? null : formTarget}
          key={`${formTarget === "new" ? "new" : formTarget.id}-${formVersion}`}
          onCancel={() => {
            setFormFeedback(null);
            setFormTarget(null);
            return restoreFocus();
          }}
          onSave={save}
        />
      )}
      <AddressBook
        busyId={busyId}
        confirmingRemoveId={confirmingRemoveId}
        feedback={feedback}
        onCancelRemove={() => {
          setConfirmingRemoveId(null);
          return restoreFocus();
        }}
        onConfirmRemove={(address) => void remove(address)}
        onCreate={openCreate}
        onEdit={(address) => {
          rememberFocus();
          setFormFeedback(null);
          setFormTarget(address);
          return setFormVersion((version) => version + 1);
        }}
        onRequestRemove={(address) => {
          rememberFocus();
          return setConfirmingRemoveId(address.id);
        }}
        onRetry={() => void load()}
        onSetPrimary={(address) => void setPrimary(address)}
        state={state}
      />
    </div>
  );
};
