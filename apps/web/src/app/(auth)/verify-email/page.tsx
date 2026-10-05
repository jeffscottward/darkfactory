import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";

import { AuthPanel } from "../../../components/auth/auth-panel.tsx";
import { EmailActionForm } from "../../../components/auth/email-action-form.tsx";
import { SessionRedirect } from "../../../components/auth/session-redirect.tsx";
import {
  type AuthSearchParams,
  firstSearchParam,
} from "../auth-search-params.ts";

export const metadata = {
  title: "Verify email",
  description: "Confirm or resend a DarkFactory email verification link.",
};

export default async function VerifyEmailPage({
  searchParams,
}: Readonly<{ searchParams: AuthSearchParams }>) {
  const params = await searchParams;
  const verificationError = firstSearchParam(params["error"]);
  const wasProcessed =
    verificationError === undefined &&
    firstSearchParam(params["verified"]) === "1";
  const isExpired = verificationError === "TOKEN_EXPIRED";

  return (
    <AuthPanel
      description={
        verificationError
          ? "Request another verification link to continue."
          : wasProcessed
            ? "Sign in to confirm the account status."
            : "Send a one-time verification link to the account email."
      }
      title={
        verificationError
          ? "Verification link needs attention."
          : wasProcessed
            ? "Verification link processed."
            : "Send a verification link."
      }
    >
      <SessionRedirect callbackURL="/dashboard">
        {wasProcessed ? (
          <div className="grid gap-6" role="status">
            <p className="grid grid-cols-[auto_1fr] gap-2 text-foreground text-sm leading-6">
              <CircleCheck
                aria-hidden="true"
                className="mt-1 text-primary"
                size={16}
              />
              The link was processed. Sign in to confirm the account status.
            </p>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="/sign-in"
            >
              Continue to sign in
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {verificationError ? (
              <p
                className="grid grid-cols-[auto_1fr] gap-2 text-destructive text-sm leading-6"
                role="alert"
              >
                <CircleAlert aria-hidden="true" className="mt-1" size={16} />
                {isExpired
                  ? "This verification link has expired. Request another below."
                  : "This verification link is invalid or has already been used. Request another below."}
              </p>
            ) : null}
            <EmailActionForm operation="email-verification" />
          </div>
        )}
      </SessionRedirect>
    </AuthPanel>
  );
}
