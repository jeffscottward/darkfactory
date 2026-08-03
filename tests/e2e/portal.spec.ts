import { EventEmitter, once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  APIResponse,
  Page,
  Response as PlaywrightResponse,
  TestInfo,
} from "@playwright/test";

import { E2E_IDENTITIES, expect, signInAs, test } from "./fixtures";

const ALICE_SEED_ITEM = "Alice example item";
const BOB_SEED_ITEM = "Bob example item";
const ADMIN_SEED_ITEM = "Admin example item";
const BOB_SEED_ITEM_ID = "30000000-0000-4000-8000-000000000003";
const MOBILE_VIEWPORT = { height: 812, width: 375 } as const;
const PORTAL_CLIENT_MODULE_PATH_PATTERN =
  /(?:\/src\/components\/portal-shell\.civet(?:\.jsx)?|\/_next\/static\/chunks\/portal-shell\.civet-[^/?]+\.js)(?:\?.*)?$/u;
const FEATURE_LIST_PATH = "/api/orpc/featureItems/list";
const FEATURE_GET_PATH = "/api/orpc/featureItems/get";
const FEATURE_ITEM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FEATURE_ITEMS_URL_PATTERN = /\/feature-items$/u;
const OVERVIEW_CURRENT_PAGE_NAME_PATTERN = /^Overview\s*, current page$/u;

interface CreatedItemEvidence {
  id: string;
  name: string;
  updatedName: string;
}

interface OrpcEnvelope {
  json?: unknown;
}

type FeatureItemStatus = "active" | "archived" | "draft";

interface OwnerFeatureItem {
  id: string;
  name: string;
  ownerId: string;
  status: FeatureItemStatus;
}

interface PolicyResult {
  code: string;
  message: string;
  status: number;
}

interface DirectPolicyEvidence {
  adminCanListAlice?: Readonly<{
    matchCount: number;
    status: 200;
  }>;
  aliceCannotGetBob?: PolicyResult;
  aliceCannotUseAdminOwnerList?: PolicyResult;
  anonymousFeatureItems?: PolicyResult;
}

let createdItem: CreatedItemEvidence | null = null;
const directPolicyEvidence: DirectPolicyEvidence = {};

const requireBaseURL = (baseURL: string | undefined): string => {
  if (baseURL === undefined) {
    throw new Error("Playwright baseURL is required for portal evidence.");
  }
  return baseURL;
};

const requireCreatedItem = (): CreatedItemEvidence => {
  if (createdItem === null) {
    throw new Error("The serial Alice lifecycle must create an item first.");
  }
  return createdItem;
};

const postOrpc = (
  page: Page,
  baseURL: string,
  procedure: string,
  input: Record<string, unknown>
): Promise<APIResponse> => {
  const origin = new URL(baseURL).origin;
  return page
    .context()
    .request.post(new URL(`/api/orpc/${procedure}`, origin).href, {
      data: { json: input },
      headers: {
        origin,
        "sec-fetch-site": "same-origin",
      },
    });
};

const waitForProcedureResponse = (
  page: Page,
  procedure: string
): Promise<PlaywrightResponse> =>
  page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname === `/api/orpc/${procedure}`
    );
  });

const responseEnvelope = async (response: APIResponse): Promise<OrpcEnvelope> =>
  (await response.json()) as OrpcEnvelope;

const expectOrpcError = async (
  response: APIResponse,
  expected: PolicyResult
): Promise<PolicyResult> => {
  expect(response.status()).toBe(expected.status);
  const envelope = await responseEnvelope(response);
  expect(envelope.json).toEqual({
    code: expected.code,
    defined: true,
    message: expected.message,
    status: expected.status,
  });
  return expected;
};

const listOwnerItems = async (
  page: Page,
  baseURL: string
): Promise<OwnerFeatureItem[]> => {
  const response = await postOrpc(page, baseURL, "featureItems/list", {
    limit: 50,
  });
  expect(response.status()).toBe(200);
  const { json } = await responseEnvelope(response);
  if (!Array.isArray(json)) {
    throw new TypeError("Owner feature item list must return an array.");
  }
  return json as OwnerFeatureItem[];
};

const countsFromItems = (
  items: readonly OwnerFeatureItem[]
): Readonly<{
  active: number;
  archived: number;
  draft: number;
  total: number;
}> => ({
  active: items.filter((item) => item.status === "active").length,
  archived: items.filter((item) => item.status === "archived").length,
  draft: items.filter((item) => item.status === "draft").length,
  total: items.length,
});

const expectDashboardCounts = async (
  page: Page,
  counts: Readonly<{
    active: number;
    archived: number;
    draft: number;
    total: number;
  }>
): Promise<void> => {
  await expect(
    page.getByRole("heading", { level: 1, name: "Dashboard" })
  ).toBeVisible();
  await expect(
    page.getByText(
      `${counts.total} feature ${counts.total === 1 ? "item" : "items"}`,
      { exact: true }
    )
  ).toBeVisible();

  const section = page.locator(
    'section[aria-labelledby="feature-status-counts-title"]'
  );
  for (const [label, count] of [
    ["Draft", counts.draft],
    ["Active", counts.active],
    ["Archived", counts.archived],
  ] as const) {
    const definition = section
      .getByText(label, { exact: true })
      .locator("xpath=..")
      .locator("dd");
    await expect(definition).toHaveText(String(count));
  }
};

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1
  );
};

const safeProjectName = (name: string): string =>
  name.replaceAll(/[^a-zA-Z0-9._-]+/gu, "-").toLowerCase();

const writePolicyEvidence = async (testInfo: TestInfo): Promise<void> => {
  const path = testInfo.outputPath("portal-direct-policy.json");
  const evidence = {
    assertions: {
      adminCanListAlice: directPolicyEvidence.adminCanListAlice?.status === 200,
      adminCrossOwnerMatchCount:
        directPolicyEvidence.adminCanListAlice?.matchCount ?? 0,
      aliceCannotGetBob: directPolicyEvidence.aliceCannotGetBob?.status === 404,
      aliceCannotUseAdminOwnerList:
        directPolicyEvidence.aliceCannotUseAdminOwnerList?.status === 403,
      anonymousFeatureItemsDenied:
        directPolicyEvidence.anonymousFeatureItems?.status === 401,
    },
    viewport: MOBILE_VIEWPORT,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
};

test.describe
  .serial("DF-113/114 portal owner and admin journeys", () => {
    test("anonymous portal access redirects and raw oRPC returns 401", async ({
      baseURL,
      page,
    }) => {
      const appURL = requireBaseURL(baseURL);

      await page.goto("/dashboard");
      await expect(page).toHaveURL(
        new URL("/sign-in?callbackURL=%2Fdashboard", appURL).href
      );

      directPolicyEvidence.anonymousFeatureItems = await expectOrpcError(
        await postOrpc(page, appURL, "featureItems/list", { limit: 50 }),
        {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          status: 401,
        }
      );
    });

    test("Alice recovers the list and completes the full mobile lifecycle", async ({
      baseURL,
      browserErrors,
      page,
    }, testInfo) => {
      const appURL = requireBaseURL(baseURL);
      const runKey = [
        safeProjectName(testInfo.project.name),
        testInfo.parallelIndex,
        testInfo.repeatEachIndex,
        testInfo.retry,
      ].join("-");
      const name = `DF-113 portal lifecycle ${runKey}`;
      const updatedName = `${name} reviewed`;
      const description =
        "Created through the real mobile portal and persisted by oRPC.";
      const updatedDescription =
        "Edited through the owner-scoped detail UI before archival.";

      await page.setViewportSize(MOBILE_VIEWPORT);
      await signInAs(page, E2E_IDENTITIES.alice);
      const portalModuleGate = new EventEmitter();
      const portalModuleRequested = once(portalModuleGate, "route-ready", {
        signal: AbortSignal.timeout(15_000),
      });
      await page.route(
        PORTAL_CLIENT_MODULE_PATH_PATTERN,
        async (route) => {
          portalModuleGate.emit("route-ready");
          await once(portalModuleGate, "release");
          await route.continue();
        },
        { times: 1 }
      );
      const coldDashboardNavigation = page.goto("/dashboard", {
        waitUntil: "domcontentloaded",
      });
      const navigationTrigger = page.getByRole("button", {
        name: "Open portal navigation",
        exact: true,
      });
      const navigationTriggerElement = page.locator(
        'button[aria-label="Open portal navigation"]'
      );
      const mobileNavigation = page.getByRole("navigation", {
        name: "Mobile portal navigation",
      });
      const overviewLink = mobileNavigation.locator('a[href="/dashboard"]');
      const featureItemsLink = mobileNavigation.getByRole("link", {
        name: "Feature items",
        exact: true,
      });
      const closeNavigation = page.getByRole("button", {
        name: "Close portal navigation",
      });

      try {
        await Promise.all([coldDashboardNavigation, portalModuleRequested]);
        await expect(page).toHaveURL(new URL("/dashboard", appURL).href);
        expect(
          await page
            .getByRole("button", { name: "Sign out", exact: true })
            .getAttribute("data-hydration-state")
        ).toBe("pending");
        const initialAliceItems = await listOwnerItems(page, appURL);
        expect(initialAliceItems).toContainEqual(
          expect.objectContaining({
            name: ALICE_SEED_ITEM,
            ownerId: E2E_IDENTITIES.alice.id,
            status: "draft",
          })
        );
        expect(
          initialAliceItems.every(
            (item) => item.ownerId === E2E_IDENTITIES.alice.id
          )
        ).toBe(true);
        await expectDashboardCounts(page, countsFromItems(initialAliceItems));
        await expect(
          page.getByRole("heading", {
            level: 2,
            name: "Welcome back, Alice Adams",
          })
        ).toBeVisible();
        await expect(
          page.getByText(ALICE_SEED_ITEM, { exact: true })
        ).toBeVisible();
        await expect(
          page.getByText(BOB_SEED_ITEM, { exact: true })
        ).toHaveCount(0);
        await expectNoHorizontalOverflow(page);

        browserErrors.allowHttpError({
          method: "POST",
          pathname: FEATURE_LIST_PATH,
          status: 503,
        });
        await page.route(
          `**${FEATURE_LIST_PATH}`,
          (route) =>
            route.fulfill({
              body: JSON.stringify({
                json: {
                  code: "STORAGE_ERROR",
                  defined: true,
                  message: "Feature item storage unavailable",
                  status: 503,
                },
              }),
              contentType: "application/json",
              status: 503,
            }),
          { times: 1 }
        );

        await expect(navigationTriggerElement).toHaveCount(1);
        await expect(navigationTrigger).toBeVisible();
        await expect(navigationTrigger).toBeEnabled();
        await expect(navigationTrigger).toHaveAttribute(
          "popovertarget",
          "portal-navigation"
        );
        await navigationTrigger.focus();
        await navigationTrigger.press("Enter");
        await expect(mobileNavigation).toBeVisible();
        await expect(overviewLink).toHaveAccessibleName(
          OVERVIEW_CURRENT_PAGE_NAME_PATTERN
        );
        await expect(overviewLink).toHaveAttribute("aria-current", "page");
        await expect(closeNavigation).toBeFocused();
        await expectNoHorizontalOverflow(page);
        await page.keyboard.press("Tab");
        await expect(overviewLink).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(closeNavigation).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(mobileNavigation).toBeHidden();
        await expect(navigationTrigger).toBeVisible();
        await expect(navigationTrigger).toBeFocused();

        await navigationTrigger.press("Enter");
        await expect(closeNavigation).toBeFocused();
      } finally {
        portalModuleGate.emit("release");
      }

      const signOutAction = page.getByRole("button", {
        name: "Sign out",
        exact: true,
      });
      await expect(signOutAction).toHaveAttribute(
        "data-hydration-state",
        "ready",
        { timeout: 15_000 }
      );
      await expect(mobileNavigation).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(overviewLink).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(featureItemsLink).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(mobileNavigation).toBeHidden();

      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Feature items could not be loaded",
        })
      ).toBeVisible();
      await expect(
        page.getByText(
          "Feature item storage is temporarily unavailable. Try again.",
          { exact: true }
        )
      ).toBeVisible();
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(
        page.getByText(ALICE_SEED_ITEM, { exact: true })
      ).toBeVisible();
      await expect(page.getByText(BOB_SEED_ITEM, { exact: true })).toHaveCount(
        0
      );
      await expectNoHorizontalOverflow(page);

      await page.locator("#feature-items-query").fill(`no-match-${runKey}`);
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "No matching feature items",
        })
      ).toBeVisible();
      await page.getByRole("button", { name: "Reset filters" }).click();
      await expect(
        page.getByText(ALICE_SEED_ITEM, { exact: true })
      ).toBeVisible();

      directPolicyEvidence.aliceCannotGetBob = await expectOrpcError(
        await postOrpc(page, appURL, "featureItems/get", {
          id: BOB_SEED_ITEM_ID,
        }),
        {
          code: "NOT_FOUND",
          message: "Feature item not found",
          status: 404,
        }
      );
      directPolicyEvidence.aliceCannotUseAdminOwnerList = await expectOrpcError(
        await postOrpc(page, appURL, "admin/featureItems/list", {
          limit: 50,
          ownerId: E2E_IDENTITIES.bob.id,
        }),
        {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        }
      );

      browserErrors.allowHttpError({
        method: "POST",
        pathname: FEATURE_GET_PATH,
        status: 404,
      });
      const bobDetailPath = `/feature-items/${BOB_SEED_ITEM_ID}`;
      for (const message of [
        "Failed to load resource: the server responded with a status of 404 ()",
        "Failed to load resource: the server responded with a status of 404 (Not Found)",
      ]) {
        browserErrors.allowConsoleError({ message, pathname: bobDetailPath });
      }
      await page.goto(bobDetailPath);
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Feature item unavailable",
        })
      ).toBeVisible();
      await expect(
        page.getByText("That feature item is no longer available.", {
          exact: true,
        })
      ).toBeVisible();
      await expect(page.locator("#edit-feature-name")).toHaveCount(0);
      await page.goto("/feature-items");
      await expect(
        page.getByText(ALICE_SEED_ITEM, { exact: true })
      ).toBeVisible();

      const createLink = page.getByRole("link", {
        name: "Create feature item",
      });
      await expect(createLink).toHaveAttribute("href", "/feature-items/new");
      const createURL = new URL("/feature-items/new", appURL).href;
      await Promise.all([page.waitForURL(createURL), createLink.click()]);
      await expect(page).toHaveURL(createURL);
      await expect(
        page.getByRole("heading", { level: 1, name: "Create feature item" })
      ).toBeVisible();
      const createName = page.locator("#feature-name");
      await expectNoHorizontalOverflow(page);
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(
        page.getByText("Enter a name before continuing.")
      ).toBeVisible();
      await expect(createName).toBeFocused();

      await createName.fill(name);
      await page.locator("#feature-description").fill(description);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.locator("#feature-status").selectOption("active");
      await page.getByRole("button", { name: "Review" }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByText("active", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const createGate = new EventEmitter();
      const routeReadyPromise = once(createGate, "route-ready");
      await page.route(
        "**/api/orpc/featureItems/create",
        async (route) => {
          createGate.emit("route-ready");
          await once(createGate, "release");
          await route.continue();
        },
        { times: 1 }
      );
      const createResponsePromise = waitForProcedureResponse(
        page,
        "featureItems/create"
      );
      const initialActivationResponsePromise = waitForProcedureResponse(
        page,
        "featureItems/changeStatus"
      );
      await page.getByRole("button", { name: "Create feature item" }).click();
      await routeReadyPromise;
      try {
        await expect(
          page.getByRole("button", { name: "Creating feature item" })
        ).toBeDisabled();
      } finally {
        createGate.emit("release");
      }
      const [createResponse, initialActivationResponse] = await Promise.all([
        createResponsePromise,
        initialActivationResponsePromise,
      ]);
      expect(createResponse.status()).toBe(200);
      expect(initialActivationResponse.status()).toBe(200);

      const viewCreated = page.getByRole("link", { name: `View ${name}` });
      await expect(viewCreated).toBeVisible();
      const createdHref = await viewCreated.getAttribute("href");
      if (createdHref === null) {
        throw new Error(
          "Created feature item link must expose its persisted id."
        );
      }
      const createdId = decodeURIComponent(
        new URL(createdHref, appURL).pathname.split("/").at(-1) ?? ""
      );
      expect(createdId).toMatch(FEATURE_ITEM_ID_PATTERN);
      createdItem = { id: createdId, name, updatedName };

      await viewCreated.click();
      await expect(page).toHaveURL(
        new URL(`/feature-items/${encodeURIComponent(createdId)}`, appURL).href
      );
      const editName = page.locator("#edit-feature-name");
      await expect(editName).toHaveValue(name);
      await expect(page.locator("#edit-feature-status")).toHaveValue("active");
      await expectNoHorizontalOverflow(page);

      await editName.fill("   ");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.locator("#edit-feature-name-error")).toHaveText(
        "Enter a name before saving."
      );
      await expect(editName).toBeFocused();

      await editName.fill(updatedName);
      await page.locator("#edit-feature-description").fill(updatedDescription);
      const updateResponsePromise = waitForProcedureResponse(
        page,
        "featureItems/update"
      );
      await page.getByRole("button", { name: "Save changes" }).click();
      expect((await updateResponsePromise).status()).toBe(200);
      await expect(
        page.getByText("Changes saved.", { exact: true })
      ).toBeVisible();
      await expect(editName).toHaveValue(updatedName);

      const draftResponsePromise = waitForProcedureResponse(
        page,
        "featureItems/changeStatus"
      );
      await page.locator("#edit-feature-status").selectOption("draft");
      expect((await draftResponsePromise).status()).toBe(200);
      await expect(
        page.getByText("Status changed to draft.", { exact: true })
      ).toBeVisible();
      const activeResponsePromise = waitForProcedureResponse(
        page,
        "featureItems/changeStatus"
      );
      await page.locator("#edit-feature-status").selectOption("active");
      expect((await activeResponsePromise).status()).toBe(200);
      await expect(
        page.getByText("Status changed to active.", { exact: true })
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const archiveTrigger = page.getByRole("button", {
        name: "Archive feature item",
      });
      await archiveTrigger.focus();
      await archiveTrigger.press("Enter");
      const archiveRegion = page.getByRole("region", {
        name: "Archive this item?",
      });
      const cancelArchive = archiveRegion.getByRole("button", {
        name: "Cancel",
      });
      const confirmArchive = archiveRegion.getByRole("button", {
        name: "Archive",
        exact: true,
      });
      await expect(archiveRegion).toBeVisible();
      await expect(cancelArchive).toBeFocused();
      await expect(
        archiveRegion.getByText(
          "The record remains available in archived views.",
          { exact: true }
        )
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Tab");
      await expect(confirmArchive).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(cancelArchive).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(archiveRegion).toBeHidden();
      await expect(archiveTrigger).toBeFocused();

      await archiveTrigger.press("Enter");
      await expect(cancelArchive).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(confirmArchive).toBeFocused();
      const archiveResponsePromise = waitForProcedureResponse(
        page,
        "featureItems/archive"
      );
      await Promise.all([
        page.waitForURL(FEATURE_ITEMS_URL_PATTERN),
        confirmArchive.press("Enter"),
      ]);
      expect((await archiveResponsePromise).status()).toBe(200);

      await page.goto(`/feature-items/${encodeURIComponent(createdId)}`);
      await expect(
        page.getByText("Archived records cannot be edited.", { exact: true })
      ).toBeVisible();
      await expect(page.getByText(updatedName, { exact: true })).toBeVisible();
      await expect(page.locator("#edit-feature-name")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Archive feature item" })
      ).toHaveCount(0);
      await expectNoHorizontalOverflow(page);

      const archivedResponse = await postOrpc(
        page,
        appURL,
        "featureItems/get",
        { id: createdId }
      );
      expect(archivedResponse.status()).toBe(200);
      expect((await responseEnvelope(archivedResponse)).json).toMatchObject({
        id: createdId,
        name: updatedName,
        ownerId: E2E_IDENTITIES.alice.id,
        status: "archived",
      });

      await page.goto("/dashboard");
      const finalAliceItems = await listOwnerItems(page, appURL);
      expect(finalAliceItems).toContainEqual(
        expect.objectContaining({
          id: createdId,
          name: updatedName,
          ownerId: E2E_IDENTITIES.alice.id,
          status: "archived",
        })
      );
      await expectDashboardCounts(page, countsFromItems(finalAliceItems));
    });

    test("Bob filters his archived seed and gets a read-only owner view", async ({
      baseURL,
      page,
    }) => {
      const appURL = requireBaseURL(baseURL);
      const aliceItem = requireCreatedItem();
      await signInAs(page, E2E_IDENTITIES.bob);
      const bobItems = await listOwnerItems(page, appURL);
      expect(bobItems).toEqual([
        expect.objectContaining({
          name: BOB_SEED_ITEM,
          ownerId: E2E_IDENTITIES.bob.id,
          status: "archived",
        }),
      ]);
      await expectDashboardCounts(page, countsFromItems(bobItems));
      await expect(
        page.getByRole("heading", { level: 2, name: "Welcome back, Bob Baker" })
      ).toBeVisible();
      await expect(
        page.getByText(BOB_SEED_ITEM, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(aliceItem.updatedName, { exact: true })
      ).toHaveCount(0);

      await page.goto("/feature-items");
      await page.locator("#feature-items-status").selectOption("archived");
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(
        page.getByText(BOB_SEED_ITEM, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(ALICE_SEED_ITEM, { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(aliceItem.updatedName, { exact: true })
      ).toHaveCount(0);

      await page.getByRole("link", { name: `View ${BOB_SEED_ITEM}` }).click();
      await expect(
        page.getByText("Archived records cannot be edited.", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(BOB_SEED_ITEM, { exact: true })
      ).toBeVisible();
      await expect(page.locator("#edit-feature-name")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Save changes" })
      ).toHaveCount(0);
    });

    test("admin keeps an owner-only dashboard and can use the cross-owner procedure", async ({
      baseURL,
      page,
    }, testInfo) => {
      const appURL = requireBaseURL(baseURL);
      const aliceItem = requireCreatedItem();
      await signInAs(page, E2E_IDENTITIES.admin);
      const adminItems = await listOwnerItems(page, appURL);
      expect(adminItems).toEqual([
        expect.objectContaining({
          name: ADMIN_SEED_ITEM,
          ownerId: E2E_IDENTITIES.admin.id,
          status: "active",
        }),
      ]);
      await expectDashboardCounts(page, countsFromItems(adminItems));
      await expect(
        page.getByText("Administrator access", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(ADMIN_SEED_ITEM, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(ALICE_SEED_ITEM, { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(aliceItem.updatedName, { exact: true })
      ).toHaveCount(0);

      const crossOwnerResponse = await postOrpc(
        page,
        appURL,
        "admin/featureItems/list",
        {
          limit: 50,
          ownerId: E2E_IDENTITIES.alice.id,
          query: aliceItem.updatedName,
          status: "archived",
        }
      );
      expect(crossOwnerResponse.status()).toBe(200);
      const envelope = await responseEnvelope(crossOwnerResponse);
      expect(Array.isArray(envelope.json)).toBe(true);
      const items = envelope.json as OwnerFeatureItem[];
      expect(items).toContainEqual(
        expect.objectContaining({
          id: aliceItem.id,
          name: aliceItem.updatedName,
          ownerId: E2E_IDENTITIES.alice.id,
          status: "archived",
        })
      );
      directPolicyEvidence.adminCanListAlice = {
        matchCount: items.filter(
          (item) =>
            item.id === aliceItem.id && item.ownerId === E2E_IDENTITIES.alice.id
        ).length,
        status: 200,
      };

      await writePolicyEvidence(testInfo);
    });
  });
