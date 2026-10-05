"use client";

import { Button, Input, Label } from "@darkfactory/ui";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type AuthFlowClient,
  type AuthFlowResult,
  browserAuthClient,
  submitSignIn,
  validateEmail,
  validatePasswordPresent,
} from "./auth-flow.ts";
import { FormStatus } from "./form-status.tsx";
import { PasswordField } from "./password-field.tsx";
import { createRequestGuard, runGuardedRequest } from "./request-guard.ts";

export const signInRequestController = runGuardedRequest;

type ReplaceLocation = (destination: string) => void;

const replaceBrowserLocation: ReplaceLocation = (destination) => {
  return window.location.replace(destination);
};

export const completeSuccessfulSignInNavigation = (
  result: AuthFlowResult,
  replace: ReplaceLocation
): void => {
  if (result.status === "success" && "destination" in result) {
    replace(result.destination);
  }
};

const firstError = (errors: readonly unknown[]): string | undefined => {
  return errors.find((error): error is string => typeof error === "string");
};

export const SignInForm = ({
  callbackURL,
  auth = browserAuthClient,
  replace = replaceBrowserLocation,
}: Readonly<{
  callbackURL: unknown;
  auth?: AuthFlowClient;
  replace?: ReplaceLocation;
}>) => {
  const [result, setResult] = useState<AuthFlowResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [requestGuard] = useState(createRequestGuard);
  useEffect(() => requestGuard.dispose, [requestGuard]);
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setResult(null);
      setIsPending(true);
      return await signInRequestController({
        guard: requestGuard,
        request: () => {
          return submitSignIn(auth, {
            email: value.email,
            password: value.password,
            callbackURL,
          });
        },
        commit: (nextResult) => {
          setResult(nextResult);
          return completeSuccessfulSignInNavigation(nextResult, replace);
        },
        settle: () => setIsPending(false),
      });
    },
  });

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
        name="email"
        validators={{
          onChange: ({ value }) => validateEmail(value),
          onSubmit: ({ value }) => validateEmail(value),
        }}
      >
        {(field) => {
          const error = field.state.meta.isTouched
            ? firstError(field.state.meta.errors)
            : undefined;
          const errorId = error ? "sign-in-email-error" : undefined;
          return (
            <div className="grid gap-2">
              <Label htmlFor="sign-in-email">Email address</Label>
              <Input
                aria-describedby={errorId}
                aria-invalid={error ? true : undefined}
                aria-required="true"
                autoComplete="email"
                className="min-h-11"
                disabled={isPending}
                id="sign-in-email"
                inputMode="email"
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  setResult(null);
                  return field.handleChange(event.target.value);
                }}
                required
                type="email"
                value={field.state.value}
              />
              {error ? (
                <p
                  className="font-medium text-destructive text-sm"
                  id={errorId}
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
          );
        }}
      </form.Field>

      <form.Field
        name="password"
        validators={{
          onBlur: ({ value }) => validatePasswordPresent(value),
          onSubmit: ({ value }) => validatePasswordPresent(value),
        }}
      >
        {(field) => (
          <PasswordField
            disabled={isPending}
            error={
              field.state.meta.isTouched
                ? firstError(field.state.meta.errors)
                : undefined
            }
            id="sign-in-password"
            label="Password"
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          href="/forgot-password"
        >
          Forgot your password?
        </Link>
        <Link
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          href="/sign-up"
        >
          Create an account
        </Link>
      </div>

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
            {isSubmitting || isPending ? "Signing in…" : "Sign in"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};
