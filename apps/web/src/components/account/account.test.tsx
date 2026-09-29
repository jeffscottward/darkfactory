import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  AddressCreateInput,
  AddressUpdateInput,
  PreferencesUpdateInput,
  ProfileUpdateInput,
} from "@darkfactory/api";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/security",
}));

import { AccountNavigation } from "./account-navigation.tsx";
import { AccountNavigationClient } from "./account-navigation-client.tsx";
import { AccountFeedbackMessage } from "./account-feedback.tsx";
import {
  accountFailureKind,
  createAccountGateway,
  createBrowserAccountGateway,
  createLatestRequestGuard,
  isAmbiguousAccountFailure,
  safeAccountFeedback,
} from "./account-client.ts";
import { ProfilePageClient } from "./profile-page-client.tsx";
import { changedProfileInput, ProfileForm } from "./profile-form.tsx";
import {
  changedPreferencesInput,
  PreferencesForm,
} from "./preferences-form.tsx";

const profile = {
  firstName: "Alice",
  lastName: "Adams",
  displayName: "Alice A.",
  avatarUrl: "https://placehold.co/96x96",
  phone: "+1 202-555-0100",
  businessName: "Alice & Co.",
  jobTitle: "Builder",
  biography: "Maintains a domain-neutral example profile.",
  timezone: "America/New_York",
  locale: "en-US",
  dateOfBirth: "1990-01-02",
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const preferences = {
  themeMode: "system" as const,
  palette: "neutral" as const,
  emailNotifications: true,
  productUpdates: false,
  analyticsConsent: false,
  personalizationConsent: true,
  profileVisibility: "private" as const,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const address = {
  id: "address-1",
  type: "work" as const,
  line1: "100 Example Avenue",
  line2: "Suite 200",
  city: "Example City",
  region: "DC",
  postalCode: "20001",
  country: "US",
  isPrimary: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("account navigation", function () {
  it("links the summary to every distinct account task", function () {
    const html = renderToStaticMarkup(
      <AccountNavigation currentPath="/account" />
    );
    for (const href of [
      "/account/profile",
      "/account/address",
      "/account/preferences",
      "/account/security",
    ])
      expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Profile");
    expect(html).toContain("Addresses");
    expect(html).toContain("Preferences");
    return expect(html).toContain("Security");
  });

  it("keeps every touch-sized destination visible and exposes the active destination without relying on color", function () {
    const html = renderToStaticMarkup(
      <AccountNavigation currentPath="/account/profile" />
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("flex-wrap");
    expect(html).not.toContain("overflow-x-auto");
    return expect(html).not.toContain("min-w-max");
  });

  return it("binds the client navigation to the current pathname accessibly", function () {
    const html = renderToStaticMarkup(<AccountNavigationClient />);
    expect(html).toContain('href="/account/security"');
    return expect(html).toContain('aria-current="page"');
  });
});

describe("typed account gateway", function () {
  it("constructs and server-renders loading state without a browser window", function () {
    expect("window" in globalThis).toBe(false);
    expect(() => createBrowserAccountGateway()).not.toThrow();
    return expect(renderToStaticMarkup(<ProfilePageClient />)).toContain(
      "Loading profile"
    );
  });

  it("lazily creates and caches one client while forwarding every method", async function () {
    const accountProfile = {
      identity: { email: "alice@domain.test", emailVerified: true },
      profile,
    };
    const updatedAccountProfile = {
      ...accountProfile,
      profile: { ...profile, jobTitle: "Maintainer" },
    };
    const createdAddress = { ...address, id: "address-2" };
    const updatedAddress = { ...address, city: "Changed City" };
    const primaryAddress = { ...address, isPrimary: true };
    const removed = { removed: true as const };
    const updatedPreferences = { ...preferences, productUpdates: true };
    const listedAddresses = [address];
    const account = {
      profile: {
        get: vi.fn(async function () {
          return accountProfile;
        }),
        update: vi.fn(async function () {
          return updatedAccountProfile;
        }),
      },
      addresses: {
        list: vi.fn(async function () {
          return listedAddresses;
        }),
        create: vi.fn(async function () {
          return createdAddress;
        }),
        update: vi.fn(async function () {
          return updatedAddress;
        }),
        remove: vi.fn(async function () {
          return removed;
        }),
        setPrimary: vi.fn(async function () {
          return primaryAddress;
        }),
      },
    };
    const apiPreferences = {
      get: vi.fn(async function () {
        return preferences;
      }),
      update: vi.fn(async function () {
        return updatedPreferences;
      }),
    };
    const createClient = vi.fn(
      () =>
        ({
          account,
          preferences: apiPreferences,
        }) as never
    );
    const resolveOrigin = vi.fn(() => "https://account.example.test");
    const gateway = createBrowserAccountGateway({
      createClient,
      resolveOrigin,
    });
    const profileInput: ProfileUpdateInput = {
      expectedUpdatedAt: profile.updatedAt,
      jobTitle: "Maintainer",
    };
    const addressCreateInput: AddressCreateInput = {
      type: address.type,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      isPrimary: false,
    };
    const addressUpdateInput: AddressUpdateInput = {
      id: address.id,
      expectedUpdatedAt: address.updatedAt,
      city: updatedAddress.city,
    };
    const preferencesInput: PreferencesUpdateInput = {
      expectedUpdatedAt: preferences.updatedAt,
      productUpdates: true,
    };

    expect(createClient).not.toHaveBeenCalled();
    expect(resolveOrigin).not.toHaveBeenCalled();

    expect(await gateway.getProfile()).toBe(accountProfile);
    expect(await gateway.updateProfile(profileInput)).toBe(
      updatedAccountProfile
    );
    expect(await gateway.listAddresses()).toBe(listedAddresses);
    expect(await gateway.createAddress(addressCreateInput)).toBe(
      createdAddress
    );
    expect(await gateway.updateAddress(addressUpdateInput)).toBe(
      updatedAddress
    );
    expect(await gateway.removeAddress(address.id, address.updatedAt)).toBe(
      removed
    );
    expect(await gateway.setPrimaryAddress(address.id, address.updatedAt)).toBe(
      primaryAddress
    );
    expect(await gateway.getPreferences()).toBe(preferences);
    expect(await gateway.updatePreferences(preferencesInput)).toBe(
      updatedPreferences
    );

    expect(resolveOrigin).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith({
      baseUrl: "https://account.example.test",
    });
    expect(account.profile.get).toHaveBeenCalledWith({});
    expect(account.profile.update).toHaveBeenCalledWith(profileInput);
    expect(account.addresses.list).toHaveBeenCalledWith({});
    expect(account.addresses.create).toHaveBeenCalledWith(addressCreateInput);
    expect(account.addresses.update).toHaveBeenCalledWith(addressUpdateInput);
    expect(account.addresses.remove).toHaveBeenCalledWith({
      id: address.id,
      expectedUpdatedAt: address.updatedAt,
    });
    expect(account.addresses.setPrimary).toHaveBeenCalledWith({
      id: address.id,
      expectedUpdatedAt: address.updatedAt,
    });
    expect(apiPreferences.get).toHaveBeenCalledWith({});
    return expect(apiPreferences.update).toHaveBeenCalledWith(preferencesInput);
  });

  it("uses the browser origin resolver when only a client factory is injected", async function () {
    vi.stubGlobal("window", {
      location: { origin: "https://owner.example.test" },
    });
    try {
      const accountProfile = {
        identity: { email: "alice@domain.test", emailVerified: true },
        profile,
      };
      const get = vi.fn(async () => accountProfile);
      const createClient = vi.fn(
        () =>
          ({
            account: { profile: { get } },
          }) as never
      );
      const gateway = createBrowserAccountGateway({ createClient });

      await expect(gateway.getProfile()).resolves.toBe(accountProfile);
      expect(createClient).toHaveBeenCalledWith({
        baseUrl: "https://owner.example.test",
      });
      return expect(get).toHaveBeenCalledWith({});
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("uses the real profile and full-preference procedures", async function () {
    const accountProfile = {
      identity: { email: "alice@domain.test", emailVerified: true },
      profile,
    };
    const account = {
      profile: {
        get: vi.fn(async function () {
          return accountProfile;
        }),
        update: vi.fn(async function () {
          return accountProfile;
        }),
      },
      addresses: {
        list: vi.fn(async function () {
          return [];
        }),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        setPrimary: vi.fn(),
      },
    };
    const apiPreferences = {
      get: vi.fn(async function () {
        return preferences;
      }),
      update: vi.fn(async function () {
        return preferences;
      }),
    };
    const gateway = createAccountGateway({
      account,
      preferences: apiPreferences,
    } as never);

    await expect(gateway.getProfile()).resolves.toMatchObject({
      profile: { displayName: "Alice A." },
    });
    await expect(
      gateway.updateProfile({
        expectedUpdatedAt: profile.updatedAt,
        jobTitle: profile.jobTitle,
      })
    ).resolves.toMatchObject({ profile: { businessName: "Alice & Co." } });
    await expect(gateway.getPreferences()).resolves.toMatchObject({
      themeMode: "system",
    });
    await expect(
      gateway.updatePreferences({
        expectedUpdatedAt: preferences.updatedAt,
        productUpdates: true,
      })
    ).resolves.toMatchObject({ profileVisibility: "private" });
    expect(account.profile.get).toHaveBeenCalledWith({});
    return expect(apiPreferences.get).toHaveBeenCalledWith({});
  });

  it.each([
    ["UNAUTHORIZED", "session ended"],
    ["FORBIDDEN", "permission"],
    ["VALIDATION_ERROR", "highlighted fields"],
    ["STORAGE_ERROR", "temporarily unavailable"],
  ])("maps %s to safe feedback", function (code, expected) {
    return expect(safeAccountFeedback({ code })).toContain(expected);
  });

  it("never exposes raw failures", function () {
    expect(
      safeAccountFeedback(
        new Error("postgres://user:secret@db.internal/private")
      )
    ).not.toContain("postgres");
    return expect(
      safeAccountFeedback(
        new Error("postgres://user:secret@db.internal/private")
      )
    ).not.toContain("secret");
  });

  it("classifies direct and nested account failures without treating coded failures as ambiguous", function () {
    expect(accountFailureKind({ code: "UNAUTHORIZED" })).toBe("unauthorized");
    expect(accountFailureKind({ data: { code: "FORBIDDEN" } })).toBe(
      "forbidden"
    );
    expect(accountFailureKind({ code: "NOT_FOUND" })).toBe("not-found");
    expect(accountFailureKind({ data: { code: "CONFLICT" } })).toBe("conflict");
    expect(accountFailureKind({ code: "UNKNOWN" })).toBe("retryable");
    expect(accountFailureKind(null)).toBe("retryable");
    expect(isAmbiguousAccountFailure({ code: "UNKNOWN" })).toBe(false);
    expect(isAmbiguousAccountFailure({ data: { code: "BAD_REQUEST" } })).toBe(
      false
    );
    expect(isAmbiguousAccountFailure({ data: null })).toBe(true);
    return expect(isAmbiguousAccountFailure("network failure")).toBe(true);
  });

  it("covers every owner-safe account feedback category and ignores malformed codes", function () {
    expect(safeAccountFeedback({ code: "BAD_REQUEST" })).toContain(
      "highlighted fields"
    );
    expect(safeAccountFeedback({ data: { code: "NOT_FOUND" } })).toContain(
      "no longer available"
    );
    expect(safeAccountFeedback({ code: "CONFLICT" })).toContain(
      "changed elsewhere"
    );
    return expect(safeAccountFeedback({ code: 409, data: { code: 409 } })).toBe(
      "The request could not be completed. Try again."
    );
  });

  return it("suppresses responses from superseded request generations", function () {
    const requests = createLatestRequestGuard();
    const first = requests.next();
    const second = requests.next();
    expect(requests.isLatest(first)).toBe(false);
    return expect(requests.isLatest(second)).toBe(true);
  });
});

describe("persisted account forms", function () {
  it("initializes every profile field from authoritative state", function () {
    const html = renderToStaticMarkup(
      <ProfileForm initialProfile={profile} onSave={vi.fn()} />
    );
    for (const field of [
      "firstName",
      "lastName",
      "displayName",
      "avatarUrl",
      "phone",
      "businessName",
      "jobTitle",
      "biography",
      "timezone",
      "locale",
      "dateOfBirth",
    ])
      expect(html).toContain(`name="${field}"`);
    expect(html).toContain("Alice &amp; Co.");
    expect(html).toContain("1990-01-02");
    return expect(html).toContain("Save profile");
  });

  it("submits only changed profile fields to avoid stale-tab clobbering", function () {
    return expect(
      changedProfileInput(profile, { ...profile, jobTitle: "Maintainer" })
    ).toEqual({
      expectedUpdatedAt: profile.updatedAt,
      jobTitle: "Maintainer",
    });
  });

  it("normalizes nullable profile fields, trims durable locale fields, and keeps unchanged data out of the patch", function () {
    expect(changedProfileInput(profile, profile)).toEqual({
      expectedUpdatedAt: profile.updatedAt,
    });
    expect(
      changedProfileInput(profile, {
        ...profile,
        firstName: "   ",
        lastName: "  Adams  ",
        avatarUrl: "",
        biography: "  Updated owner biography.  ",
        timezone: "  UTC  ",
        locale: "  en-GB  ",
        dateOfBirth: "",
      })
    ).toEqual({
      expectedUpdatedAt: profile.updatedAt,
      firstName: null,
      avatarUrl: null,
      biography: "Updated owner biography.",
      timezone: "UTC",
      locale: "en-GB",
      dateOfBirth: null,
    });
    return expect(
      changedProfileInput(profile, {
        ...profile,
        firstName: null,
      })
    ).toEqual({
      expectedUpdatedAt: profile.updatedAt,
      firstName: null,
    });
  });

  return it("renders complete durable preferences without a reduced-motion setting", function () {
    const html = renderToStaticMarkup(
      <PreferencesForm initialPreferences={preferences} onSave={vi.fn()} />
    );
    for (const field of [
      "emailNotifications",
      "productUpdates",
      "analyticsConsent",
      "personalizationConsent",
      "profileVisibility",
    ])
      expect(html).toContain(`name="${field}"`);
    expect(html).not.toContain('name="themeMode"');
    expect(html).not.toContain('name="palette"');
    expect(html).toContain("Use Theme settings in the top bar");
    expect(html).not.toContain("reducedMotion");
    expect(html).not.toContain("Reduced motion");
    expect(html).toContain("Save preferences");
    return expect(
      changedPreferencesInput(preferences, {
        ...preferences,
        productUpdates: true,
      })
    ).toEqual({
      expectedUpdatedAt: preferences.updatedAt,
      productUpdates: true,
    });
  });
});

describe("account feedback accessibility", function () {
  return it("renders nothing for explicit absence and maps every tone to stable live semantics", function () {
    expect(
      renderToStaticMarkup(<AccountFeedbackMessage feedback={null} />)
    ).toBe("");

    const error = renderToStaticMarkup(
      <AccountFeedbackMessage
        feedback={{ tone: "error", message: "Save failed." }}
      />
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("border-destructive");

    const success = renderToStaticMarkup(
      <AccountFeedbackMessage
        feedback={{ tone: "success", message: "Saved." }}
      />
    );
    expect(success).toContain('role="status"');
    expect(success).toContain("border-primary");

    const info = renderToStaticMarkup(
      <AccountFeedbackMessage
        feedback={{ tone: "info", message: "Review this change." }}
      />
    );
    expect(info).toContain('role="status"');
    expect(info).toContain("border-border-strong");
    return expect(info).toContain('aria-live="polite"');
  });
});
