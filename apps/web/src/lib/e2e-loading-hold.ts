// Test-controlled hold for the guarded loading fixture. A Playwright test
// opens /loading-smoke?hold=<id>, audits the loading boundary, and then sends
// /loading-smoke?release=<id>. The waiting request polls a module-level set and
// never awaits a promise from another request, because workerd does not allow
// one request to resume another request's work. The fixture route checks
// isE2eFixtureEnabled() before it calls this module.

const loadingHoldIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const releasedHolds = new Set<string>();

// The cap is far above the 60 s test budget. It only stops a forgotten hold.
export const loadingHoldCapMilliseconds = 120_000;
const loadingHoldPollMilliseconds = 50;

export const parseLoadingHoldId = (
  value: string | readonly string[] | undefined
): string | undefined =>
  typeof value === "string" && loadingHoldIdPattern.test(value)
    ? value
    : undefined;

export const releaseLoadingHold = (holdId: string): void => {
  releasedHolds.add(holdId);
};

export type LoadingHoldOutcome = "capped" | "released";

export const waitForLoadingHold = async (
  holdId: string,
  capMilliseconds: number = loadingHoldCapMilliseconds,
  pollMilliseconds: number = loadingHoldPollMilliseconds
): Promise<LoadingHoldOutcome> => {
  for (let waited = 0; waited < capMilliseconds; waited += pollMilliseconds) {
    if (releasedHolds.delete(holdId)) return "released";
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  }
  return releasedHolds.delete(holdId) ? "released" : "capped";
};
