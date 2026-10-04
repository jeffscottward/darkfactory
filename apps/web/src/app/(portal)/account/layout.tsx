import type { ReactNode } from "react";

export default function AccountLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-portal space-y-4">{children}</div>
  );
}
