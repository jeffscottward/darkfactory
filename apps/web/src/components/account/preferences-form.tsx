"use client";

import type {
  PreferencesOutput,
  PreferencesUpdateInput,
} from "@darkfactory/api";
import { Button, Label } from "@darkfactory/ui";
import { useForm } from "@tanstack/react-form";

import {
  type AccountFeedback,
  AccountFeedbackMessage,
} from "./account-feedback.tsx";

const visibilities = ["private", "members", "public"] as const;

const labelFor = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

const preferenceToggles = [
  {
    label: "Email notifications",
    name: "emailNotifications",
  },
  {
    label: "Product updates",
    name: "productUpdates",
  },
  {
    label: "Analytics consent",
    name: "analyticsConsent",
  },
  {
    label: "Personalization consent",
    name: "personalizationConsent",
  },
] as const;

const preferencesDefaults = (preferences: PreferencesOutput) => ({
  analyticsConsent: preferences.analyticsConsent,
  emailNotifications: preferences.emailNotifications,
  personalizationConsent: preferences.personalizationConsent,
  productUpdates: preferences.productUpdates,
  profileVisibility: preferences.profileVisibility,
});

export const changedPreferencesInput = (
  initial: PreferencesOutput,
  current: ReturnType<typeof preferencesDefaults>
): PreferencesUpdateInput => {
  const patch: Record<string, unknown> = {
    expectedUpdatedAt: initial.updatedAt,
  };
  for (const field of Object.keys(current) as (keyof typeof current)[]) {
    if (current[field] !== initial[field]) patch[field] = current[field];
  }
  return patch as PreferencesUpdateInput;
};

export interface PreferencesFormProps {
  readonly feedback?: AccountFeedback | null | undefined;
  readonly initialPreferences: PreferencesOutput;
  readonly onSave: (
    input: PreferencesUpdateInput
  ) => Promise<unknown> | unknown;
}

export const PreferencesForm = ({
  feedback,
  initialPreferences,
  onSave,
}: PreferencesFormProps) => {
  const form = useForm({
    defaultValues: preferencesDefaults(initialPreferences),
    onSubmit: async ({ value }) => {
      return await onSave(changedPreferencesInput(initialPreferences, value));
    },
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        return void form.handleSubmit();
      }}
    >
      <AccountFeedbackMessage feedback={feedback} />
      <fieldset className="space-y-1">
        <legend className="mb-1 font-heading font-semibold text-base text-foreground">
          Notifications and consent
        </legend>
        {preferenceToggles.map((definition) => (
          <form.Field key={definition.name} name={definition.name}>
            {(field) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-2"
                htmlFor={definition.name}
              >
                <input
                  checked={field.state.value}
                  className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  id={definition.name}
                  name={definition.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.checked)}
                  type="checkbox"
                />
                <span className="font-medium text-foreground text-sm">
                  {definition.label}
                </span>
              </label>
            )}
          </form.Field>
        ))}
      </fieldset>

      <form.Field name="profileVisibility">
        {(field) => (
          <div className="max-w-md space-y-1 border-border border-t pt-3">
            <Label htmlFor="profileVisibility">Profile visibility</Label>
            <select
              className="min-h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              id="profileVisibility"
              name="profileVisibility"
              onBlur={field.handleBlur}
              onChange={(event) =>
                field.handleChange(
                  event.target.value as PreferencesOutput["profileVisibility"]
                )
              }
              value={field.state.value}
            >
              {visibilities.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {labelFor(visibility)}
                </option>
              ))}
            </select>
          </div>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) =>
          [state.canSubmit, state.isDirty, state.isSubmitting] as const
        }
      >
        {([canSubmit, isDirty, isSubmitting]) => (
          <Button
            disabled={!(canSubmit && isDirty) || isSubmitting}
            loading={isSubmitting}
            loadingLabel="Saving preferences"
            type="submit"
          >
            Save preferences
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};
