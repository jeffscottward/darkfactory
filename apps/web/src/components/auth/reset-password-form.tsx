"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { Button } from "@darkfactory/ui";

import {
  browserAuthClient,
  submitResetPassword,
  validatePassword,
  validatePasswordConfirmation,
  type AuthFlowClient,
  type AuthFlowResult,
} from "./auth-flow.ts";
import { FormStatus } from "./form-status.tsx";
import { PasswordField } from "./password-field.tsx";
import { createRequestGuard, runGuardedRequest } from "./request-guard.ts";

export const resetPasswordRequestController = runGuardedRequest;

const firstError = (errors: readonly unknown[]): string | undefined => {
  return errors.find((error): error is string => typeof error === "string");
};

export const ResetPasswordForm = ({
  token,
  auth = browserAuthClient,
}: Readonly<{ token: string | undefined; auth?: AuthFlowClient }>) => {
  const router = useRouter();
  const [result, setResult] = useState<AuthFlowResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [requestGuard] = useState(createRequestGuard);
  useEffect(() => requestGuard.dispose, [requestGuard]);
  const form = useForm({
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      setResult(null);
      setIsPending(true);
      return await resetPasswordRequestController({
        guard: requestGuard,
        request: () => {
          return submitResetPassword(auth, {
            token,
            newPassword: value.newPassword,
          });
        },
        commit: (nextResult) => {
          setResult(nextResult);
          if (nextResult.status === "success" && "destination" in nextResult) {
            return router.replace(nextResult.destination);
          }
          return;
        },
        settle: () => setIsPending(false),
      });
    },
  });

  if (!token) {
    return (
      <div className="grid gap-5" role="alert">
        <p className="text-sm leading-6 text-destructive">
          This password reset link is invalid or has expired.
        </p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong px-4 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/forgot-password"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        return void form.handleSubmit().then(() => {
          if (!form.state.isValid) {
            return formElement
              .querySelector<HTMLElement>('[aria-invalid="true"]')
              ?.focus();
          }
          return;
        });
      }}
    >
      <form.Field
        name="newPassword"
        validators={{
          onChange: ({ value }) => validatePassword(value),
          onBlur: ({ value }) => validatePassword(value),
          onSubmit: ({ value }) => validatePassword(value),
        }}
      >
        {(field) => (
          <PasswordField
            disabled={isPending}
            autoComplete="new-password"
            description="Use 12 to 128 characters."
            error={
              field.state.meta.isTouched
                ? firstError(field.state.meta.errors)
                : undefined
            }
            id="reset-new-password"
            label="New password"
            name={field.name}
            onBlur={field.handleBlur}
            onChange={(event) => {
              setResult(null);
              return field.handleChange(event.target.value);
            }}
            value={field.state.value}
          />
        )}
      </form.Field>

      <form.Field
        name="confirmPassword"
        validators={{
          onChange: ({ value }) => {
            return validatePasswordConfirmation(
              value,
              form.state.values.newPassword
            );
          },
          onBlur: ({ value }) => {
            return validatePasswordConfirmation(
              value,
              form.state.values.newPassword
            );
          },
          onSubmit: ({ value }) => {
            return validatePasswordConfirmation(
              value,
              form.state.values.newPassword
            );
          },
        }}
      >
        {(field) => (
          <PasswordField
            disabled={isPending}
            autoComplete="new-password"
            error={
              field.state.meta.isTouched
                ? firstError(field.state.meta.errors)
                : undefined
            }
            id="reset-confirm-password"
            label="Confirm new password"
            name={field.name}
            onBlur={field.handleBlur}
            onChange={(event) => {
              setResult(null);
              return field.handleChange(event.target.value);
            }}
            value={field.state.value}
          />
        )}
      </form.Field>

      <FormStatus result={result} />

      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting] as const}
      >
        {([canSubmit, isSubmitting]) => (
          <Button
            className="min-h-11 w-full"
            disabled={!canSubmit || isSubmitting || isPending}
            type="submit"
          >
            {isSubmitting || isPending
              ? "Updating password…"
              : "Update password"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};
