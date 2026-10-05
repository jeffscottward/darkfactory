import { AuthPanel } from "../../../components/auth/auth-panel.tsx";
import { SessionRedirect } from "../../../components/auth/session-redirect.tsx";
import { SignUpForm } from "../../../components/auth/sign-up-form.tsx";

export const metadata = {
  title: "Create account",
  description: "Create and verify a DarkFactory account.",
};

export default function SignUpPage() {
  return (
    <AuthPanel
      description="Create an account, then confirm the email address before signing in."
      title="Start with a verified identity."
    >
      <SessionRedirect callbackURL="/dashboard">
        <SignUpForm />
      </SessionRedirect>
    </AuthPanel>
  );
}
