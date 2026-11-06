"use client";

import {
  type AccountProfileOutput,
  type AddressCreateInput,
  type AddressOutput,
  type AddressUpdateInput,
  type ApiClient,
  type ApiClientOptions,
  createApiClient,
  type PreferencesOutput,
  type PreferencesUpdateInput,
  type ProfileUpdateInput,
} from "@darkfactory/api";

export interface AccountGateway {
  readonly createAddress: (input: AddressCreateInput) => Promise<AddressOutput>;
  readonly getPreferences: () => Promise<PreferencesOutput>;
  readonly getProfile: () => Promise<AccountProfileOutput>;
  readonly listAddresses: () => Promise<AddressOutput[]>;
  readonly removeAddress: (
    id: string,
    expectedUpdatedAt: Date
  ) => Promise<Readonly<{ removed: true }>>;
  readonly setPrimaryAddress: (
    id: string,
    expectedUpdatedAt: Date
  ) => Promise<AddressOutput>;
  readonly updateAddress: (input: AddressUpdateInput) => Promise<AddressOutput>;
  readonly updatePreferences: (
    input: PreferencesUpdateInput
  ) => Promise<PreferencesOutput>;
  readonly updateProfile: (
    input: ProfileUpdateInput
  ) => Promise<AccountProfileOutput>;
}

export const createAccountGateway = (client: ApiClient): AccountGateway => ({
  createAddress: (input) => client.account.addresses.create(input),
  getPreferences: () => client.preferences.get({}),
  getProfile: () => client.account.profile.get({}),
  listAddresses: () => client.account.addresses.list({}),
  removeAddress: (id, expectedUpdatedAt) =>
    client.account.addresses.remove({ expectedUpdatedAt, id }),
  setPrimaryAddress: (id, expectedUpdatedAt) =>
    client.account.addresses.setPrimary({ expectedUpdatedAt, id }),
  updateAddress: (input) => client.account.addresses.update(input),
  updatePreferences: (input) => client.preferences.update(input),
  updateProfile: (input) => client.account.profile.update(input),
});

type BrowserAccountGatewayOptions = Readonly<{
  createClient?: (options: ApiClientOptions) => ApiClient;
  resolveOrigin?: () => string;
}>;

export const createBrowserAccountGateway = (
  options: BrowserAccountGatewayOptions = {}
): AccountGateway => {
  const createClient = options.createClient ?? createApiClient;
  const resolveOrigin = options.resolveOrigin ?? (() => window.location.origin);
  let gateway: AccountGateway | undefined;
  const getGateway = (): AccountGateway => {
    if (gateway === undefined) {
      gateway = createAccountGateway(
        createClient({ baseUrl: resolveOrigin() })
      );
    }
    return gateway;
  };

  return {
    createAddress: (input) => getGateway().createAddress(input),
    getPreferences: () => getGateway().getPreferences(),
    getProfile: () => getGateway().getProfile(),
    listAddresses: () => getGateway().listAddresses(),
    removeAddress: (id, expectedUpdatedAt) =>
      getGateway().removeAddress(id, expectedUpdatedAt),
    setPrimaryAddress: (id, expectedUpdatedAt) =>
      getGateway().setPrimaryAddress(id, expectedUpdatedAt),
    updateAddress: (input) => getGateway().updateAddress(input),
    updatePreferences: (input) => getGateway().updatePreferences(input),
    updateProfile: (input) => getGateway().updateProfile(input),
  };
};

const errorCode = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null) return null;
  const code = Reflect.get(error, "code");
  if (typeof code === "string") return code;
  const data = Reflect.get(error, "data");
  if (typeof data !== "object" || data === null) return null;
  const nestedCode = Reflect.get(data, "code");
  return typeof nestedCode === "string" ? nestedCode : null;
};

export const isAmbiguousAccountFailure = (error: unknown): boolean => {
  return errorCode(error) === null;
};

export interface LatestRequestGuard {
  readonly isLatest: (generation: number) => boolean;
  readonly next: () => number;
}

export const createLatestRequestGuard = (): LatestRequestGuard => {
  let generation = 0;
  return {
    isLatest: (candidate) => candidate === generation,
    next: () => ++generation,
  };
};

export type AccountFailureKind =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "retryable";

export const accountFailureKind = (error: unknown): AccountFailureKind => {
  switch (errorCode(error)) {
    case "UNAUTHORIZED":
      return "unauthorized";
    case "FORBIDDEN":
      return "forbidden";
    case "NOT_FOUND":
      return "not-found";
    case "CONFLICT":
      return "conflict";
    default:
      return "retryable";
  }
};

export const safeAccountFeedback = (error: unknown): string => {
  switch (errorCode(error)) {
    case "UNAUTHORIZED":
      return "Your session ended. Sign in again to continue.";
    case "FORBIDDEN":
      return "You do not have permission to change this account.";
    case "VALIDATION_ERROR":
    case "BAD_REQUEST":
      return "Check the highlighted fields and try again.";
    case "NOT_FOUND":
      return "That account record is no longer available. Reload and try again.";
    case "CONFLICT":
      return "This account changed elsewhere. Reload before trying again.";
    case "STORAGE_ERROR":
      return "Account storage is temporarily unavailable. Try again.";
    default:
      return "The request could not be completed. Try again.";
  }
};
