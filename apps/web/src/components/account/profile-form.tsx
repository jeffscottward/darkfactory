"use client";

import type { ProfileOutput, ProfileUpdateInput } from "@darkfactory/api";
import { Button, Input, Label, Textarea } from "@darkfactory/ui";
import { useForm } from "@tanstack/react-form";

import {
  type AccountFeedback,
  AccountFeedbackMessage,
} from "./account-feedback.tsx";

type ProfileFieldName =
  | "firstName"
  | "lastName"
  | "displayName"
  | "avatarUrl"
  | "phone"
  | "businessName"
  | "jobTitle"
  | "biography"
  | "timezone"
  | "locale"
  | "dateOfBirth";

interface ProfileFieldDefinition {
  readonly autoComplete?: string;
  readonly label: string;
  readonly maximum: number;
  readonly multiline?: boolean;
  readonly name: ProfileFieldName;
  readonly required?: boolean;
  readonly type?: "text" | "url" | "tel" | "date";
}

const profileFields: readonly ProfileFieldDefinition[] = [
  {
    autoComplete: "given-name",
    label: "First name",
    maximum: 200,
    name: "firstName",
  },
  {
    autoComplete: "family-name",
    label: "Last name",
    maximum: 200,
    name: "lastName",
  },
  {
    autoComplete: "nickname",
    label: "Display name",
    maximum: 200,
    name: "displayName",
  },
  {
    autoComplete: "url",
    label: "Avatar URL",
    maximum: 2048,
    name: "avatarUrl",
    type: "url",
  },
  {
    autoComplete: "tel",
    label: "Phone",
    maximum: 64,
    name: "phone",
    type: "tel",
  },
  {
    autoComplete: "organization",
    label: "Business name",
    maximum: 200,
    name: "businessName",
  },
  {
    autoComplete: "organization-title",
    label: "Job title",
    maximum: 200,
    name: "jobTitle",
  },
  { label: "Biography", maximum: 5000, multiline: true, name: "biography" },
  { label: "Timezone", maximum: 64, name: "timezone", required: true },
  {
    autoComplete: "language",
    label: "Locale",
    maximum: 64,
    name: "locale",
    required: true,
  },
  {
    autoComplete: "bday",
    label: "Date of birth",
    maximum: 10,
    name: "dateOfBirth",
    type: "date",
  },
];

const nullableText = (value: string): string | null => {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

const defaultsFor = (profile: ProfileOutput) => ({
  avatarUrl: profile.avatarUrl ?? "",
  biography: profile.biography ?? "",
  businessName: profile.businessName ?? "",
  dateOfBirth: profile.dateOfBirth ?? "",
  displayName: profile.displayName ?? "",
  firstName: profile.firstName ?? "",
  jobTitle: profile.jobTitle ?? "",
  lastName: profile.lastName ?? "",
  locale: profile.locale,
  phone: profile.phone ?? "",
  timezone: profile.timezone,
});

export const changedProfileInput = (
  initial: ProfileOutput,
  current: Omit<ProfileOutput, "updatedAt">
): ProfileUpdateInput => {
  const patch: Record<string, unknown> = {
    expectedUpdatedAt: initial.updatedAt,
  };
  const fields = [
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
  ] as const;
  for (const field of fields) {
    const value =
      field === "timezone" || field === "locale"
        ? current[field].trim()
        : nullableText(current[field] ?? "");
    if (value !== initial[field]) patch[field] = value;
  }
  return patch as ProfileUpdateInput;
};

const fieldError = (
  value: string,
  definition: ProfileFieldDefinition
): string | undefined => {
  if (definition.required === true && value.trim().length === 0) {
    return `${definition.label} is required.`;
  }
  if (value.length > definition.maximum) {
    return `${definition.label} must be ${definition.maximum} characters or fewer.`;
  }
  if (definition.name === "avatarUrl" && value.trim().length > 0) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return "Avatar URL must use HTTPS.";
    } catch {
      return "Enter a valid avatar URL.";
    }
  }
  return undefined;
};

export interface ProfileFormProps {
  readonly feedback?: AccountFeedback | null | undefined;
  readonly initialProfile: ProfileOutput;
  readonly onSave: (input: ProfileUpdateInput) => Promise<unknown> | unknown;
}

export const ProfileForm = ({
  feedback,
  initialProfile,
  onSave,
}: ProfileFormProps) => {
  const form = useForm({
    defaultValues: defaultsFor(initialProfile),
    onSubmit: async ({ value }) => {
      return await onSave(changedProfileInput(initialProfile, value));
    },
  });

  return (
    <form
      className="space-y-4"
      id="profile-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        return void form.handleSubmit().then(() => {
          return document
            .querySelector<HTMLElement>('#profile-form [aria-invalid="true"]')
            ?.focus();
        });
      }}
    >
      <AccountFeedbackMessage feedback={feedback} />
      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
        {profileFields.map((definition) => (
          <form.Field
            key={definition.name}
            name={definition.name}
            validators={{
              onBlur: ({ value }) => fieldError(value, definition),
              onSubmit: ({ value }) => fieldError(value, definition),
            }}
          >
            {(field) => {
              const error = field.state.meta.errors[0];
              const describedBy =
                error === undefined ? undefined : `${field.name}-error`;
              return (
                <div
                  className={
                    definition.multiline === true
                      ? "space-y-1 md:col-span-2"
                      : "space-y-1"
                  }
                >
                  <Label htmlFor={field.name}>
                    {definition.label}{" "}
                    {definition.required === true ? "(required)" : "(optional)"}
                  </Label>
                  {definition.multiline === true ? (
                    <Textarea
                      aria-describedby={describedBy}
                      aria-invalid={error !== undefined}
                      aria-required={definition.required === true}
                      autoComplete={definition.autoComplete}
                      id={field.name}
                      maxLength={definition.maximum}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      rows={5}
                      value={field.state.value}
                    />
                  ) : (
                    <Input
                      aria-describedby={describedBy}
                      aria-invalid={error !== undefined}
                      aria-required={definition.required === true}
                      autoComplete={definition.autoComplete}
                      id={field.name}
                      maxLength={definition.maximum}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      required={definition.required === true}
                      type={definition.type ?? "text"}
                      value={field.state.value}
                    />
                  )}
                  {error === undefined ? null : (
                    <p
                      aria-live="assertive"
                      className="text-destructive text-sm"
                      id={describedBy}
                      role="alert"
                    >
                      {String(error)}
                    </p>
                  )}
                </div>
              );
            }}
          </form.Field>
        ))}
      </div>
      <form.Subscribe
        selector={(state) =>
          [state.canSubmit, state.isDirty, state.isSubmitting] as const
        }
      >
        {([canSubmit, isDirty, isSubmitting]) => (
          <Button
            disabled={!(canSubmit && isDirty) || isSubmitting}
            loading={isSubmitting}
            loadingLabel="Saving profile"
            type="submit"
          >
            Save profile
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};
