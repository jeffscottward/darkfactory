import { describe, expect, it } from "vitest";

import {
  createUiStore,
  MAX_UI_STATE_SNAPSHOT_LENGTH,
  parseUiStateSnapshot,
  UI_STATE_VERSION,
} from "./client.ts";

const hydratedPreferences = {
  consent: "granted" as const,
  density: "compact" as const,
  fontSize: "large" as const,
  mobileNavigationOpen: true,
  radius: "none" as const,
  sidebar: "collapsed" as const,
  theme: "nord" as const,
};

const hydratedSnapshot = {
  state: hydratedPreferences,
  version: UI_STATE_VERSION,
};

const hydratedSnapshotJson = JSON.stringify(hydratedSnapshot);

describe("createUiStore", () => {
  it("updates navigation and sidebar state", () => {
    const store = createUiStore();

    store.getState().toggleSidebar();
    store.getState().setMobileNavigationOpen(true);

    expect(store.getState().sidebar).toBe("collapsed");
    expect(store.getState().mobileNavigationOpen).toBe(true);

    store.getState().setSidebar("expanded");
    store.getState().closeMobileNavigation();

    expect(store.getState().sidebar).toBe("expanded");
    return expect(store.getState().mobileNavigationOpen).toBe(false);
  });

  it("updates appearance and consent immutably", () => {
    const store = createUiStore();
    const initialState = store.getState();

    initialState.setTheme("kanagawa");
    const themedState = store.getState();
    themedState.setFontSize("small");
    themedState.setDensity("comfortable");
    themedState.setRadius("large");
    const appearanceState = store.getState();
    appearanceState.setConsent("denied");
    const consentState = store.getState();

    expect(themedState).not.toBe(initialState);
    expect(appearanceState).not.toBe(themedState);
    expect(consentState).not.toBe(appearanceState);
    expect(consentState.theme).toBe("kanagawa");
    expect(consentState.fontSize).toBe("small");
    expect(consentState.density).toBe("comfortable");
    expect(consentState.radius).toBe("large");
    return expect(consentState.consent).toBe("denied");
  });

  it("resets every preference to a fresh deterministic default state", () => {
    const store = createUiStore();
    store.getState().hydrate(hydratedSnapshotJson);
    const hydratedState = store.getState();

    hydratedState.reset();

    expect(store.getState()).not.toBe(hydratedState);
    return expect(store.getState().dehydrate()).toEqual({
      state: {
        consent: "unknown",
        density: "default",
        fontSize: "default",
        mobileNavigationOpen: false,
        radius: "small",
        sidebar: "expanded",
        theme: "system",
      },
      version: 2,
    });
  });

  it("hydrates a valid versioned snapshot deterministically", () => {
    const store = createUiStore();

    expect(store.getState().hydrate(hydratedSnapshotJson)).toBe(true);
    expect(store.getState().dehydrate()).toEqual(hydratedSnapshot);
    expect(store.getState().dehydrate()).not.toBe(hydratedSnapshot);
    return expect(store.getState().dehydrate().state).not.toBe(
      hydratedSnapshot.state
    );
  });

  it("fails closed without changing state for malformed hydration", () => {
    const validState = hydratedSnapshot.state;
    const malformedSnapshots: readonly unknown[] = [
      null,
      [],
      {},
      "{",
      " ".repeat(MAX_UI_STATE_SNAPSHOT_LENGTH + 1),
      JSON.stringify({ state: validState, version: 1 }),
      JSON.stringify({ version: 2 }),
      JSON.stringify({ state: null, version: 2 }),
      JSON.stringify({ state: { ...validState, sidebar: "open" }, version: 2 }),
      JSON.stringify({
        state: { ...validState, mobileNavigationOpen: "true" },
        version: 2,
      }),
      JSON.stringify({
        state: { ...validState, theme: "solarized" },
        version: 2,
      }),
      JSON.stringify({
        state: { ...validState, fontSize: "huge" },
        version: 2,
      }),
      JSON.stringify({
        state: { ...validState, density: "airy" },
        version: 2,
      }),
      JSON.stringify({
        state: { ...validState, radius: "round" },
        version: 2,
      }),
      JSON.stringify({
        state: { ...validState, consent: "pending" },
        version: 2,
      }),
      JSON.stringify({
        state: { ...validState, serverRecords: [] },
        version: 2,
      }),
      JSON.stringify({ extra: true, state: validState, version: 2 }),
    ];

    for (const malformed of malformedSnapshots) {
      const store = createUiStore();
      const before = store.getState();
      const beforeSnapshot = before.dehydrate();

      expect(parseUiStateSnapshot(malformed)).toBeNull();
      expect(store.getState().hydrate(malformed)).toBe(false);
      expect(store.getState()).toBe(before);
      expect(store.getState().dehydrate()).toEqual(beforeSnapshot);
    }
  });

  it("does not execute hostile accessors or proxy traps during hydration", () => {
    let accessorReads = 0;
    const accessorSnapshot = Object.defineProperty({}, "state", {
      enumerable: true,
      get: () => {
        accessorReads += 1;
        throw new Error("hostile accessor executed");
      },
    });
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    const store = createUiStore();
    const before = store.getState();

    expect(() => store.getState().hydrate(accessorSnapshot)).not.toThrow();
    expect(() => store.getState().hydrate(revocable.proxy)).not.toThrow();
    expect(accessorReads).toBe(0);
    return expect(store.getState()).toBe(before);
  });

  it("notifies subscribers with previous state and honors unsubscribe", () => {
    const store = createUiStore();
    const initialState = store.getState();
    const updates: Array<{
      state: typeof initialState;
      previousState: typeof initialState;
    }> = [];
    const unsubscribe = store.subscribe((state, previousState) => {
      return updates.push({ previousState, state });
    });

    store.getState().setTheme("nord");

    expect(updates).toHaveLength(1);
    expect(updates[0]?.previousState).toBe(initialState);
    expect(updates[0]?.state).toBe(store.getState());
    expect(updates[0]?.state).not.toBe(initialState);

    unsubscribe();
    store.getState().setTheme("nord");
    return expect(updates).toHaveLength(1);
  });

  it("parses exactly the bounded versioned client UI preference schema", () => {
    const first = parseUiStateSnapshot(hydratedSnapshotJson);
    const second = parseUiStateSnapshot(hydratedSnapshotJson);

    expect(first).toEqual(hydratedSnapshot);
    expect(second).toEqual(hydratedSnapshot);
    expect(first).not.toBe(second);
    expect(first?.state).not.toBe(second?.state);
    return expect(UI_STATE_VERSION).toBe(2);
  });

  return it("toggles from both sidebar states and ignores invalid runtime setter input", () => {
    const store = createUiStore();
    const initialSnapshot = store.getState().dehydrate();

    store.getState().toggleSidebar();
    expect(store.getState().sidebar).toBe("collapsed");
    store.getState().toggleSidebar();
    expect(store.getState().sidebar).toBe("expanded");

    store.getState().setSidebar("open" as never);
    store.getState().setMobileNavigationOpen("true" as never);
    store.getState().setTheme("solarized" as never);
    store.getState().setFontSize("huge" as never);
    store.getState().setDensity("airy" as never);
    store.getState().setRadius("round" as never);
    store.getState().setConsent("pending" as never);

    return expect(store.getState().dehydrate()).toEqual(initialSnapshot);
  });
});
