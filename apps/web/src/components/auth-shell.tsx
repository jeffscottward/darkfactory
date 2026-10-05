import type { ReactNode } from "react";

import { BrandLink } from "./brand-mark.tsx";
import { ThemeMenu } from "./theme-menu.tsx";

export const AuthShell = ({ children }: { readonly children: ReactNode }) => (
  <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-muted">
    <header className="border-b bg-background">
      <div className="df-container flex min-h-14 items-center justify-between gap-2">
        <BrandLink />
        <ThemeMenu />
      </div>
    </header>
    <main
      className="df-container flex w-full items-center justify-center py-6 md:py-10"
      id="main-content"
      tabIndex={-1}
    >
      <div className="w-full max-w-sm">{children}</div>
    </main>
    <footer className="border-border border-t py-3 text-center text-muted-foreground text-sm">
      Seeded development access is example evidence, not a production identity.
    </footer>
  </div>
);
