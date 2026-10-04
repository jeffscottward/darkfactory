import {
  type AppearancePreference,
  DEFAULT_APPEARANCE,
  DENSITIES,
  FONT_SIZES,
  parseAppearancePreference,
  RADII,
  THEMES,
} from "@darkfactory/state";

export type AnonymousThemePreference = AppearancePreference;
export type ThemeAuthority = "indeterminate" | "anonymous" | "trusted";

export const shouldPersistAnonymousLocalState = (
  authority: ThemeAuthority
): boolean => authority === "anonymous";

export const DEFAULT_ANONYMOUS_THEME: Readonly<AnonymousThemePreference> =
  DEFAULT_APPEARANCE;

export const THEME_STORAGE_KEY = "darkfactory.anonymous-ui.v2" as const;
export const MAX_ANONYMOUS_THEME_SNAPSHOT_LENGTH = 128 as const;
const THEME_COOKIE_NAME = "darkfactory-theme" as const;
export const MAX_COOKIE_HEADER_LENGTH = 32_768 as const;
export const MAX_THEME_COOKIE_VALUE_LENGTH = 96 as const;

export type ThemeCookieParseResult =
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{
      status: "valid";
      preference: Readonly<AnonymousThemePreference>;
    }>;
export type ThemeCookieStatus = ThemeCookieParseResult["status"];

export const parseThemeCookieHeader = (
  cookieHeader: unknown
): ThemeCookieParseResult => {
  if (
    cookieHeader === undefined ||
    cookieHeader === null ||
    cookieHeader === ""
  ) {
    return { status: "missing" };
  }
  if (
    typeof cookieHeader !== "string" ||
    cookieHeader.length > MAX_COOKIE_HEADER_LENGTH
  ) {
    return { status: "invalid" };
  }

  const values = cookieHeader
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => {
      const separatorIndex = segment.indexOf("=");
      const name =
        separatorIndex === -1
          ? segment
          : segment.slice(0, separatorIndex).trim();
      return name === THEME_COOKIE_NAME;
    });

  const [cookie, ...duplicateCookies] = values;
  if (cookie === undefined) return { status: "missing" };
  if (duplicateCookies.length > 0) return { status: "invalid" };
  const separatorIndex = cookie.indexOf("=");
  if (separatorIndex === -1) return { status: "invalid" };
  const encodedValue = cookie.slice(separatorIndex + 1);
  if (
    encodedValue.length === 0 ||
    encodedValue.length > MAX_THEME_COOKIE_VALUE_LENGTH
  )
    return { status: "invalid" };

  try {
    const [theme, fontSize, density, radius, extra] =
      decodeURIComponent(encodedValue).split(":");
    const preference = parseAppearancePreference({
      density,
      fontSize,
      radius,
      theme,
    });
    if (extra !== undefined || preference === null)
      return { status: "invalid" };
    return { preference, status: "valid" };
  } catch {
    return { status: "invalid" };
  }
};

export const themeDomAttributes = (
  preference: Readonly<AnonymousThemePreference>
) =>
  ({
    "data-density": preference.density,
    "data-font-size": preference.fontSize,
    "data-radius": preference.radius,
    "data-theme": preference.theme,
  }) as const;

export const serializeThemeCookie = (
  preference: Readonly<AnonymousThemePreference>
): string =>
  `${THEME_COOKIE_NAME}=${encodeURIComponent(`${preference.theme}:${preference.fontSize}:${preference.density}:${preference.radius}`)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;

export const THEME_BOOTSTRAP_PATH = "/theme-bootstrap.js" as const;

const json = (value: unknown): string => JSON.stringify(value);

export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const root = document.documentElement;
  const authority = root.dataset.themeAuthority;
  const lists = { theme: ${json(THEMES)}, fontSize: ${json(FONT_SIZES)}, density: ${json(DENSITIES)}, radius: ${json(RADII)} };
  const defaults = ${json(DEFAULT_APPEARANCE)};
  const fallback = {};
  for (const key of Object.keys(lists)) {
    const value = root.dataset[key];
    fallback[key] = lists[key].includes(value) ? value : defaults[key];
  }
  let preference = fallback;
  const cookieStatus = root.dataset.themeCookieStatus;
  let source = authority === "anonymous" && cookieStatus === "valid" ? "cookie" : "server";
  if (authority === "anonymous" && cookieStatus === "missing") {
    try {
      const serialized = localStorage.getItem("${THEME_STORAGE_KEY}");
      if (serialized && serialized.length <= ${MAX_ANONYMOUS_THEME_SNAPSHOT_LENGTH}) {
        const snapshot = JSON.parse(serialized);
        if (
          snapshot
          && Object.keys(snapshot).length === 5
          && snapshot.version === 2
          && Object.keys(lists).every((key) => lists[key].includes(snapshot[key]))
        ) {
          preference = { theme: snapshot.theme, fontSize: snapshot.fontSize, density: snapshot.density, radius: snapshot.radius };
          source = "localStorage";
        }
      }
    } catch {}
  }
  for (const key of Object.keys(lists)) root.dataset[key] = preference[key];
  window.__DARKFACTORY_THEME__ = Object.freeze({ ...preference, source });
})();`;
