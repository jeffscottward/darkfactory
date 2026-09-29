import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionLoader = (
  cookieHeader: string | null,
  cfConnectingIp: string | null
) => unknown;

const mocks = vi.hoisted(() => {
  const cacheEntries = new Map<string, unknown>();
  return {
    cacheEntries,
    cache: vi.fn(
      (loader: SessionLoader) =>
        (cookieHeader: string | null, cfConnectingIp: string | null) => {
          const key = JSON.stringify([cookieHeader, cfConnectingIp]);
          if (!cacheEntries.has(key)) {
            cacheEntries.set(key, loader(cookieHeader, cfConnectingIp));
          }
          return cacheEntries.get(key);
        }
    ),
    dispatchInternalAuthRequest: vi.fn(),
    getPortalSession: vi.fn(),
  };
});

vi.mock("react", () => ({ cache: mocks.cache }));
vi.mock("./server-internal-dispatch.ts", () => ({
  dispatchInternalAuthRequest: mocks.dispatchInternalAuthRequest,
}));
vi.mock("./server-session.ts", () => ({
  getPortalSession: mocks.getPortalSession,
}));

import { getRequestPortalSession } from "./request-portal-session.ts";

// Vitest 5 clears mock state before every test, so keep the import-time cache
// wrapping.
const importCache = {
  calls: mocks.cache.mock.calls.length,
  wrapped: mocks.cache.mock.results[0]?.value,
};

describe("getRequestPortalSession", () => {
  beforeEach(() => {
    mocks.cacheEntries.clear();
    return mocks.getPortalSession.mockReset();
  });

  it("is wrapped once by React request cache", () => {
    expect(importCache.calls).toBe(1);
    return expect(getRequestPortalSession).toBe(importCache.wrapped);
  });
  it("shares one in-flight resolution for identical primitive keys", () => {
    const pendingSession = Promise.resolve(null);
    mocks.getPortalSession.mockReturnValueOnce(pendingSession);

    expect(
      getRequestPortalSession(
        "better-auth.session_token=opaque",
        "203.0.113.42"
      )
    ).toBe(pendingSession);
    expect(
      getRequestPortalSession(
        "better-auth.session_token=opaque",
        "203.0.113.42"
      )
    ).toBe(pendingSession);
    return expect(mocks.getPortalSession).toHaveBeenCalledOnce();
  });

  return it.each([
    ["better-auth.session_token=opaque", "203.0.113.42"],
    [null, null],
    ["   ", null],
  ])(
    "uses primitive cookie and edge IP inputs with the fixed internal dispatcher",
    (cookieHeader, cfConnectingIp) => {
      const pendingSession = Promise.resolve(null);
      mocks.getPortalSession.mockReturnValueOnce(pendingSession);

      expect(getRequestPortalSession(cookieHeader, cfConnectingIp)).toBe(
        pendingSession
      );
      return expect(mocks.getPortalSession).toHaveBeenCalledWith({
        cookieHeader,
        cfConnectingIp,
        fetch: mocks.dispatchInternalAuthRequest,
      });
    }
  );
});
