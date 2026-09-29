import type { ReactNode } from "react";

export type AuthPanelProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}>;

export const AuthPanel = ({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthPanelProps) => (
  <section
    aria-labelledby="auth-title"
    className="border-border border-y py-8 sm:py-10"
  >
    <header className="mb-8 grid gap-3">
      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {eyebrow}
      </p>
      <h1
        className="font-heading font-semibold text-3xl text-foreground leading-tight tracking-tight sm:text-4xl"
        id="auth-title"
      >
        {title}
      </h1>
      <p className="max-w-prose text-base text-muted-foreground leading-7">
        {description}
      </p>
    </header>
    {children}
    {footer ? (
      <footer className="mt-8 border-border border-t pt-6 text-muted-foreground text-sm leading-6">
        {footer}
      </footer>
    ) : null}
  </section>
);
