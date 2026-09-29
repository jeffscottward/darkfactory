import type { ReactNode } from "react";

import { BrandLink } from "./brand-mark.tsx";
import { ThemeMenu } from "./theme-menu.tsx";

export const AuthShell = ({ children }: { readonly children: ReactNode }) => (
  <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-background">
    <header className="border-border border-b">
      <div className="df-container flex min-h-18 items-center justify-between gap-4">
        <BrandLink />
        <ThemeMenu />
      </div>
    </header>
    <main
      className="df-container flex w-full items-center justify-center py-12 md:py-16"
      id="main-content"
      tabIndex={-1}
    >
      <div className="w-full max-w-md">{children}</div>
    </main>
    <footer className="border-border border-t py-6 text-center text-muted-foreground text-sm">
      Seeded development access is example evidence, not a production identity.
    </footer>
  </div>
);
