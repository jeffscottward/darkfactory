import type { UserPreferences } from "../schema/index.ts";
import type { DatabaseExecutor } from "../server/client.ts";
import {
  createUserPreferencesRepository,
  type UpsertUserPreferencesInput,
} from "../server/repositories.ts";

export const DEVELOPMENT_PREFERENCES: readonly UpsertUserPreferencesInput[] =
  Object.freeze([
    Object.freeze({
      userId: "00000000-0000-4000-8000-000000000001",
      theme: "system",
      fontSize: "default",
      density: "default",
      radius: "small",
      emailNotifications: false,
      productUpdates: false,
      analyticsConsent: false,
      personalizationConsent: false,
      profileVisibility: "private",
    }),
    Object.freeze({
      userId: "00000000-0000-4000-8000-000000000002",
      theme: "night-owl",
      fontSize: "large",
      density: "comfortable",
      radius: "medium",
      emailNotifications: true,
      productUpdates: true,
      analyticsConsent: true,
      personalizationConsent: true,
      profileVisibility: "members",
    }),
    Object.freeze({
      userId: "00000000-0000-4000-8000-000000000003",
      theme: "tokyo-night",
      fontSize: "small",
      density: "compact",
      radius: "none",
      emailNotifications: false,
      productUpdates: true,
      analyticsConsent: false,
      personalizationConsent: true,
      profileVisibility: "members",
    }),
  ]);

const matchesPreferences = (
  current: UserPreferences,
  expected: UpsertUserPreferencesInput
): boolean => {
  return (
    current.theme === expected.theme &&
    current.fontSize === expected.fontSize &&
    current.density === expected.density &&
    current.radius === expected.radius &&
    current.emailNotifications === expected.emailNotifications &&
    current.productUpdates === expected.productUpdates &&
    current.analyticsConsent === expected.analyticsConsent &&
    current.personalizationConsent === expected.personalizationConsent &&
    current.profileVisibility === expected.profileVisibility
  );
};

export const convergeDevelopmentPreferences = async (
  database: DatabaseExecutor
): Promise<void> => {
  const repository = createUserPreferencesRepository(database);
  for (const preferences of DEVELOPMENT_PREFERENCES) {
    const current = await repository.findByUserId(preferences.userId);
    if (!(current && matchesPreferences(current, preferences))) {
      await repository.upsert(preferences);
    }
  }
};
