import "vinext/types";

import type { AppearancePreference } from "@darkfactory/state";

declare module "*.css";

declare global {
  interface Window {
    __DARKFACTORY_THEME__?: Readonly<
      AppearancePreference & {
        source: "cookie" | "localStorage" | "server";
      }
    >;
  }
}
