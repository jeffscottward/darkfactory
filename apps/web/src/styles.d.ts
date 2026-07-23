import "vinext/types";

declare module "*.css";

declare global {
  interface Window {
    __DARKFACTORY_THEME__?: Readonly<{
      palette:
        | "neutral"
        | "slate"
        | "blue"
        | "cyan"
        | "green"
        | "amber"
        | "orange"
        | "red"
        | "rose"
        | "violet";
      source: "cookie" | "localStorage" | "server";
      themeMode: "light" | "dark" | "system";
    }>;
  }
}
