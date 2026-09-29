// Local development targets. Portless owns each route and its hidden port; the
// canonical HTTPS origin keeps secure cookies identical to production.
export type DevelopmentTarget = "web" | "operator";

export type DevelopmentTargetProfile = Readonly<{
  packageName: string;
  routeName: string;
  canonicalUrl: string;
}>;

export const DEVELOPMENT_TARGETS: Readonly<
  Record<DevelopmentTarget, DevelopmentTargetProfile>
> = Object.freeze({
  web: Object.freeze({
    packageName: "@darkfactory/web",
    routeName: "darkfactory",
    canonicalUrl: "https://darkfactory.localhost",
  }),
  operator: Object.freeze({
    packageName: "@darkfactory/operator-app",
    routeName: "operator.darkfactory",
    canonicalUrl: "https://operator.darkfactory.localhost",
  }),
});

export const isDevelopmentTarget = (
  value: string | undefined
): value is DevelopmentTarget => value === "web" || value === "operator";

const containsExactCanonicalUrl = (
  source: string,
  profile: DevelopmentTargetProfile
): boolean => {
  return source.split(/\s+/).some((value) => {
    try {
      const route = new URL(value);
      return (
        route.protocol === "https:" &&
        route.hostname === `${profile.routeName}.localhost` &&
        route.port === "" &&
        route.pathname === "/" &&
        route.search === "" &&
        route.hash === "" &&
        route.username === "" &&
        route.password === ""
      );
    } catch {
      return false;
    }
  });
};

// True when `portless list`/`portless get` output names the exact canonical
// origin (no port, path, or credentials).
export const isCanonicalRouteOutput = (
  result: Readonly<{ exitCode: number; stdout: string }>,
  profile: DevelopmentTargetProfile = DEVELOPMENT_TARGETS.web
): boolean => {
  return (
    result.exitCode === 0 && containsExactCanonicalUrl(result.stdout, profile)
  );
};
