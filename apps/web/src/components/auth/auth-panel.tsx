// What: Auth page panel in the shadcn login block style (login-03/04): one centered card with title, description, form and a footer line.
// Used by: apps/web/src/app/(auth)/*/page.tsx.
// See: https://ui.shadcn.com/blocks/login; packages/ui/src/card.tsx.
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@darkfactory/ui";
import type { ReactNode } from "react";

export type AuthPanelProps = Readonly<{
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}>;

export const AuthPanel = ({
  title,
  description,
  children,
  footer,
}: AuthPanelProps) => (
  <section aria-labelledby="auth-title" className="flex flex-col gap-6">
    <Card>
      <CardHeader className="text-center">
        <h1 className="font-semibold text-xl leading-none" id="auth-title">
          {title}
        </h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
    {footer ? (
      <footer className="text-balance text-center text-muted-foreground text-sm">
        {footer}
      </footer>
    ) : null}
  </section>
);
