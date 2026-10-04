import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  applicationName: "DarkFactory Operator",
  description:
    "A local-only control plane for bounded DarkFactory workflow runs.",
  title: {
    default: "Operator",
    template: "%s | DarkFactory Operator",
  },
};

export const viewport = { colorScheme: "light dark" };

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      data-density="default"
      data-font-size="default"
      data-radius="small"
      data-theme="system"
      lang="en"
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
