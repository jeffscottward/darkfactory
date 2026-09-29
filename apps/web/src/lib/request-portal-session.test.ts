import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionLoader = (
  cookieHeader: string | null,
  cfConnectingIp: string | null
) => unknown;

const mocks = vi.hoisted(function () {
  const cacheEntries = new Map<string, unknown>();
  return {
    cacheEntries,
    cache: vi.fn(function (loader: SessionLoader) {
      return function (
        cookieHeader: string | null,
        cfConnectingIp: string | null
      ) {
        const key = JSON.stringify([cookieHeader, cfConnectingIp]);
        if (!cacheEntries.has(key)) {
          cacheEntries.set(key, loader(cookieHeader, cfConnectingIp));
        }
        return cacheEntries.get(key);
      };
    }),
    dispatchInternalAuthRequest: vi.fn(),
    getPortalSession: vi.fn(),
  };
});

vi.mock("react", function () {
  return { cache: mocks.cache };
});
vi.mock("./server-internal-dispatch.ts", function () {
  return {
    dispatchInternalAuthRequest: mocks.dispatchInternalAuthRequest,
  };
});
vi.mock("./server-session.ts", function () {
  return {
    getPortalSession: mocks.getPortalSession,
  };
});

import { getRequestPortalSession } from "./request-portal-session.ts";

describe("getRequestPortalSession", function () {
  beforeEach(function () {
    mocks.cacheEntries.clear();
    return mocks.getPortalSession.mockReset();
  });

  it("is wrapped once by React request cache", function () {
    expect(mocks.cache).toHaveBeenCalledOnce();
    return expect(getRequestPortalSession).toBe(
      mocks.cache.mock.results[0]?.value
    );
  });
  it("shares one in-flight resolution for identical primitive keys", function () {
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
  ])("uses primitive cookie and edge IP inputs with the fixed internal dispatcher", function (cookieHeader, cfConnectingIp) {
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
  });
});
