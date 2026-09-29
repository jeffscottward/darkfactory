import { ShieldCheck } from "lucide-react";

import { OperatorSignIn } from "../../../components/operator-sign-in.tsx";

export const metadata = {
  title: "Sign in",
  description: "Sign in with the seeded development administrator.",
};

type SignInSearchParams = Promise<
  Readonly<Record<string, string | string[] | undefined>>
>;

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: SignInSearchParams }>) {
  const params = await searchParams;
  const callbackValue = params["callbackURL"];
  const callbackURL = Array.isArray(callbackValue)
    ? callbackValue[0]
    : callbackValue;

  return (
    <main
      className="grid min-h-screen place-items-center bg-background px-4 py-12"
      id="main-content"
    >
      <section
        aria-labelledby="operator-sign-in-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8"
      >
        <div className="mb-8 flex items-center gap-3 text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-5" />
          <span className="font-semibold text-sm">DarkFactory Operator</span>
        </div>
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          Local development only
        </p>
        <h1
          className="mt-3 font-heading font-semibold text-2xl text-foreground"
          id="operator-sign-in-title"
        >
          Administrator sign in
        </h1>
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          Use the seeded development administrator stored in the existing Better
          Auth database.
        </p>
        <div className="mt-8">
          <OperatorSignIn callbackURL={callbackURL ?? null} />
        </div>
      </section>
    </main>
  );
}
