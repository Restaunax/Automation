/**
 * 24-books-gating-ui.spec.ts — Books & taxes is free for every restaurant
 * (your numbers, the accountant package, the accountant login); only the
 * add-on's sections (books posting, monthly send, year end, tax calendar)
 * follow ACCOUNTING_SYNC. Without it those show as one teaser with the
 * add-on mark and Ask us, never a refused load; with it every section loads;
 * Connected apps (the free partner API) is there either way (TC-789..791).
 * A teaser's Ask us is a REQUEST (restaunax #998) and the seed owner sends
 * and cancels one from Billing → Add-ons (TC-897; skipped until #998 is on
 * QA, utils/addonRequestGate.ts).
 *
 * Browser. A per-run throwaway owner logs in through the UI (loginViaUi);
 * the "Books & Taxes" add-on (ACCOUNTING_SYNC) is switched by admin override
 * between steps. Every /api/ response is watched: a screen the owner can see
 * must never answer 401/403 while it loads (feedback: screen loads never 403).
 * W0:J6 / OB-2 (once `dailyViewsStage6` is deployed, probed per run): the
 * accountant tab is "Send to my accountant" (the month's figures + one ZIP,
 * the invite below), and Card deposits, Tax calendar and Year end show only
 * once turned on in Overview → "Show more in Books & taxes" — TC-790 turns
 * on any that are off, then opens every section.
 * Serial.
 */
import * as allure from "allure-js-commons";
import type { Page, Response as PwResponse } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { generateRunId, readSharedState } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  getRestaurantFeaturesRaw,
  adminAddonsRaw,
  ownerAddonRequestCancelRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { probeDailyViewsStage6 } from "../../../utils/releaseGate";
import {
  addonRequestsLive,
  requireAddonRequests,
} from "../../../utils/addonRequestGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const BOOKS = "Books & taxes";
const SECTIONS = [
  "Overview",
  "Books",
  "Card deposits",
  "Tax calendar",
  "Year end",
  "Your accountant",
];
/** W0:J6 / OB-2: the accountant tab's new name; the optional tabs. */
const DAILY_SECTIONS = [
  "Overview",
  "Books",
  "Card deposits",
  "Tax calendar",
  "Year end",
  "Send to my accountant",
];
const OPTIONAL_TOGGLES = ["deposits", "calendar", "yearEnd"];

test.describe.configure({ mode: "serial" });

test.describe("Owner — Books & taxes is free; its add-on sections are teasers without the add-on (UI)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant"
  );

  const runId = generateRunId();
  let adminToken = "";
  let restaurantId = "";
  let ownerToken = "";
  let session: UiLoginSession | undefined;
  const refused: string[] = [];

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const watch = (res: PwResponse) => {
    if (
      /\/api\/|\/restaurant\//.test(res.url()) &&
      [401, 403].includes(res.status())
    )
      refused.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  };
  /** The left sidebar's items are buttons (its landmark is the first nav). */
  const sideItem = (name: string) =>
    page()
      .getByRole("navigation")
      .first()
      .getByRole("button", { name, exact: true });
  const manage = (query: string) =>
    page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?${query}`,
      { waitUntil: "domcontentloaded" }
    );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[books-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    session = await loginViaUi(
      browser,
      tenant.email,
      process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`
    );
    session.page.on("response", watch);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    refused.length = 0;
    await allure.label("feature", "Books & taxes (dashboard)");
    await allure.label("severity", "critical");
  });

  test("TC-789: without the add-on Books & taxes is there with its package, the add-on's tabs carry the add-on mark; Connected apps loads", async () => {
    await manage("tab=Store%20Settings&settingsTab=connected-apps");
    await expect(
      page().getByRole("tab", { name: "Connected apps" })
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page().getByRole("button", { name: "Create API key" }).first()
    ).toBeVisible({ timeout: 20_000 });
    // Books & taxes is in the sidebar for every restaurant.
    await expect(sideItem("Store Settings")).toBeVisible();
    await expect(sideItem(BOOKS)).toBeVisible();
    await manage("tab=books-taxes&section=accountantPackage");
    await expect(page().getByTestId("accountant-package")).toBeVisible({
      timeout: 20_000,
    });
    // The add-on's sections are marked, not hidden.
    await expect(
      page()
        .getByTestId("books-tab-calendar")
        .getByTestId("add-on-mark-ACCOUNTING_SYNC")
    ).toBeVisible();
    expect(refused).toEqual([]);
  });

  test("TC-790: with the add-on, Books & taxes appears and every section opens without a refused load", async () => {
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC",
      true,
      `automation books ui ${runId}`
    );
    expect(g.ok, JSON.stringify(g.data)).toBe(true);
    await manage("tab=Store%20Settings");
    const item = sideItem(BOOKS);
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.click();
    await expect(page()).toHaveURL(/tab=books-taxes/);
    const daily = await probeDailyViewsStage6(ownerToken, restaurantId);
    if (daily) {
      // Overview → "Show more": turn on the optional tabs that are off.
      await expect(page().getByTestId("books-more-tabs")).toBeVisible({
        timeout: 20_000,
      });
      for (const key of OPTIONAL_TOGGLES) {
        const input = page()
          .getByTestId(`books-tab-toggle-${key}`)
          .locator("input");
        if (!(await input.isChecked())) {
          // The switch is controlled: it turns on once the preference is
          // saved, so click and wait (check() demands an instant change).
          await input.click();
          await expect(input).toBeChecked({ timeout: 10_000 });
        }
      }
    }
    const accountantTab = daily ? "Send to my accountant" : "Your accountant";
    for (const name of daily ? DAILY_SECTIONS : SECTIONS) {
      const tab = page().getByRole("tab", { name, exact: true });
      await expect(tab).toBeVisible({ timeout: 20_000 });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
    // The accountant section offers the invite; the year end offers the ZIP.
    await page().getByRole("tab", { name: accountantTab, exact: true }).click();
    if (daily) {
      // W0:J6: the month's figures and the one-file download sit above it.
      await expect(page().getByTestId("accountant-bundle")).toBeVisible();
      await expect(
        page().getByTestId("accountant-bundle-download")
      ).toBeVisible();
    }
    await expect(
      page()
        .getByRole("button", { name: /invite/i })
        .first()
    ).toBeVisible();
    expect(refused).toEqual([]);
  });

  test("TC-791: removing the add-on turns its sections back into teasers, and a deep link to one says where to ask; the free part stays", async () => {
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC"
    );
    await manage("tab=books-taxes&section=calendar");
    // The tax calendar is an add-on section: its teaser with the mark and
    // the ask, never the old "Not part of this restaurant's plan" lock or a
    // refused load.
    const teaser = page().getByTestId("books-addon-calendar");
    await expect(teaser).toBeVisible({ timeout: 20_000 });
    await expect(
      teaser
        .getByTestId("add-on-mark-ACCOUNTING_SYNC")
        .or(teaser.getByText("Add-on", { exact: true }))
    ).toBeVisible();
    await expect(teaser.getByRole("button", { name: /^Ask us/ })).toBeVisible();
    await expect(
      page().getByText("Not part of this restaurant's plan")
    ).toHaveCount(0);
    await expect(
      page().getByRole("button", { name: "Go to Add-ons" })
    ).toHaveCount(0);
    // The rest of the page is free: the package is one tab away.
    await expect(sideItem(BOOKS)).toBeVisible();
    await page().getByTestId("books-tab-accountantPackage").click();
    await expect(page().getByTestId("accountant-package")).toBeVisible();
    expect(refused).toEqual([]);
  });
});

// TC-897 runs on the SEED restaurant: Billing → Add-ons needs a subscription
// ("No Subscription Assigned" otherwise), and the seed is the one QA
// restaurant with one. A request turns nothing on and is cancelled here.
test.describe("Owner — requests an add-on from Billing → Add-ons (UI)", () => {
  requireEnv(["ADMIN_EMAIL", "ADMIN_PASSWORD"], "gate + cleanup use HQ");
  test.skip(
    !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
  );

  let adminToken = "";
  let seedToken = "";
  let seedId = "";
  let live = false;

  /** Cancel any open Books & Taxes request on the seed (a crashed run's). */
  const cancelOpen = async () => {
    if (!live || !seedId) return;
    const r = await adminAddonsRaw(adminToken, "GET", "/requests?status=OPEN");
    for (const x of (Array.isArray(r.data.data) ? r.data.data : []) as Array<
      Record<string, LooseJson>
    >) {
      const restaurant = x.restaurant as Record<string, LooseJson> | null;
      const addon = x.addon as Record<string, LooseJson> | null;
      // A request made by product has no catalog row (addon null).
      const feature = x.feature ?? addon?.feature;
      if (restaurant?.id === seedId && feature === "ACCOUNTING_SYNC")
        await ownerAddonRequestCancelRaw(seedToken, seedId, String(x.id));
    }
  };

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    if (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    seedToken = (
      await apiLogin(process.env.OWNER_EMAIL, process.env.OWNER_PASSWORD)
    ).accessToken;
    seedId = readSharedState().restaurantId;
    live = await addonRequestsLive(adminToken);
    await cancelOpen();
  });

  test.afterAll(async () => {
    await cancelOpen().catch(() => {});
  });

  test("TC-897: from the locked tab the owner requests Books & Taxes on Billing → Add-ons, sees it pending, and cancels it", async ({
    ownerPage,
  }) => {
    await allure.label("feature", "Add-on billing");
    await allure.label("severity", "critical");
    requireAddonRequests(live);
    const features =
      (await getRestaurantFeaturesRaw(seedToken, seedId)).data.data?.features ??
      [];
    test.skip(
      features.includes("ACCOUNTING_SYNC"),
      "the seed restaurant has Books & Taxes on — no locked tab to start from"
    );
    await ownerPage.goto(
      `/restaurant/restaurantId/${seedId}/restaurantManagement?tab=books-taxes&section=books`,
      { waitUntil: "domcontentloaded" }
    );
    // The locked section is a teaser, not a "Go to Add-ons" lock; the
    // request is made from Billing → Add-ons.
    await expect(ownerPage.getByTestId("books-addon-books")).toBeVisible({
      timeout: 20_000,
    });
    await ownerPage.goto(
      `/restaurant/restaurantId/${seedId}/restaurantManagement?tab=Billing&section=addons`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(ownerPage).toHaveURL(/tab=Billing&section=addons/);

    const card = ownerPage.locator(".MuiCard-root").filter({
      has: ownerPage.getByRole("heading", {
        name: "RestauNax Books & Taxes",
        exact: true,
      }),
    });
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    // No owner-side "Add" any more: the only action is a request.
    await expect(card.getByRole("button", { name: /^Add$/ })).toHaveCount(0);
    await card.getByRole("button", { name: "Ask us to turn it on" }).click();

    const dialog = ownerPage.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Request RestauNax Books & Taxes?" })
    ).toBeVisible();
    await dialog
      .getByLabel("Anything we should know? (optional)")
      .fill(`automation ${generateRunId()}`);
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      ownerPage.getByText(/^Request sent\. We'll contact you/)
    ).toBeVisible({ timeout: 20_000 });
    // The card's sent state (Stage 6 request flow): when it was asked.
    await expect(
      card.getByText(
        /^Requested on .+\. We usually reply within 1 business day\.$/
      )
    ).toBeVisible();
    // A request turns nothing on.
    expect(
      (await getRestaurantFeaturesRaw(seedToken, seedId)).data.data?.features
    ).not.toContain("ACCOUNTING_SYNC");

    await card.getByRole("button", { name: "Cancel request" }).click();
    await expect(ownerPage.getByText("Request cancelled.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      card.getByRole("button", { name: "Ask us to turn it on" })
    ).toBeVisible();
  });
});
