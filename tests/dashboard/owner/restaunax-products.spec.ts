/**
 * restaunax-products.spec.ts — RestauNax Products (restaunax branch
 * feat/restaunax-products): an owner sees every add-on product the restaurant
 * does not have, as a preview with sample data plus "Ask us to turn it on",
 * and never a price.
 *
 * Written before the feature reaches QA (not runnable there yet — run it after
 * the backend + dashboard deploy). Copy comes from the dashboard's EN
 * `products.json`; there are no data-testids to lean on.
 *
 * QA data this file needs (it skips, never fails, when unset):
 *   - OWNER_EMAIL / OWNER_PASSWORD: the seed owner, whose restaurant has an
 *     ACTIVE Menu TVs catalog row and NO MENU_TVS entitlement (skips if the
 *     restaurant already has Menu TVs on), and a subscription (Billing →
 *     Add-ons needs one).
 *   - ADMIN_EMAIL / ADMIN_PASSWORD: the home-food scenario mints a throwaway
 *     HOME_FOOD tenant (createSecondOwner with businessType) and deletes it.
 *
 * SIDE EFFECT: the "ask" test creates a REAL AddonRequest on QA and notifies
 * support. If the restaurant already has a pending request the dashboard shows
 * "Request sent <date>" instead of the button; that counts as a pass. The
 * request is left open on purpose (the Available card then shows it pending).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, readSharedState } from "../../../utils/testData";
import { loginViaUi } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  getRestaurantFeaturesRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const MENU_TVS = "RestauNax Menu TVs";
const SAMPLE_NOTE = "Sample — this is what it looks like with your own data";
const ASK = "Ask us to turn it on";
const SENT = /Request sent .+\. We'll contact you\./;

test.describe.configure({ mode: "serial" });

test.describe("Owner — RestauNax Products: Available previews, no prices", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
  );

  let restaurantId = "";

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readSharedState().restaurantId;
    const token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const features =
      (await getRestaurantFeaturesRaw(token, restaurantId)).data.data
        ?.features ?? [];
    test.skip(
      features.includes("MENU_TVS"),
      "the seed restaurant already has Menu TVs on — nothing is Available"
    );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "RestauNax Products");
    await allure.label("severity", "critical");
  });

  const manage = (page: import("@playwright/test").Page, query: string) =>
    page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?${query}`,
      { waitUntil: "domcontentloaded" }
    );
  const sideItem = (page: import("@playwright/test").Page, name: RegExp) =>
    page.getByRole("navigation").first().getByRole("button", { name });

  test("the Menu TVs sidebar item is marked Available and opens a preview with the Sample note and no price", async ({
    ownerPage,
  }) => {
    await manage(ownerPage, "tab=Store%20Settings");
    const item = sideItem(ownerPage, /^Menu TVs/);
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(item.getByText("Available", { exact: true })).toBeVisible();

    await item.click();
    await expect(ownerPage).toHaveURL(/tab=menu-tvs/);
    await expect(
      ownerPage.getByRole("heading", { name: MENU_TVS })
    ).toBeVisible({ timeout: 20_000 });
    await expect(ownerPage.getByText(SAMPLE_NOTE)).toBeVisible();
    await expect(
      ownerPage.getByText("Turn any TV into a menu board that updates itself.")
    ).toBeVisible();
    // The sample is inert, and nothing in the main area carries a price.
    await expect(ownerPage.getByRole("main")).not.toContainText("$");
  });

  test("asking sends a request: 'Request sent' (or the already-requested state)", async ({
    ownerPage,
  }) => {
    // Creates a REAL AddonRequest on QA and notifies support (see header).
    await manage(ownerPage, "tab=menu-tvs");
    await expect(
      ownerPage.getByRole("heading", { name: MENU_TVS })
    ).toBeVisible({ timeout: 20_000 });
    const ask = ownerPage.getByRole("button", { name: ASK });
    const sent = ownerPage.getByText(SENT);
    await expect(ask.or(sent)).toBeVisible({ timeout: 20_000 });
    if (await ask.isVisible()) await ask.click();
    await expect(sent).toBeVisible({ timeout: 20_000 });
    await expect(ask).toHaveCount(0);
  });

  test("Billing → Products lists Menu TVs under Available, without a price", async ({
    ownerPage,
  }) => {
    await manage(ownerPage, "tab=Billing&section=addons");
    await expect(
      ownerPage.getByText("Available for your restaurant")
    ).toBeVisible({ timeout: 20_000 });
    const card = ownerPage.locator(".MuiCard-root").filter({
      has: ownerPage.getByRole("heading", { name: MENU_TVS, exact: true }),
    });
    await expect(card).toHaveCount(1);
    await expect(card).not.toContainText("$");
    // Whole catalog: no dollar sign under the Available heading either.
    await expect(
      ownerPage.locator(".MuiCard-root").filter({
        hasText: /RestauNax/,
      })
    ).not.toContainText("$");
  });

  test("invoice periods never read end-before-start", async ({ ownerPage }) => {
    await manage(ownerPage, "tab=Billing");
    const RANGE =
      /([A-Z][a-z]{2} \d{1,2}(?:, \d{4})?) – ([A-Z][a-z]{2} \d{1,2}, \d{4})/g;
    const body = ownerPage.locator("body");
    await expect(body).toContainText("Billing", { timeout: 20_000 });
    const text = await body.innerText();
    const ranges = [...text.matchAll(RANGE)];
    test.skip(
      ranges.length === 0,
      "no invoice period is shown for this tenant"
    );
    for (const m of ranges) {
      const whole = m[0];
      const start = m[1] ?? "";
      const end = m[2] ?? "";
      const endDate = new Date(end);
      const year = endDate.getFullYear();
      const startDate = new Date(
        /\d{4}/.test(start) ? start : `${start}, ${year}`
      );
      expect(
        endDate.getTime() >= startDate.getTime(),
        `period "${whole}" ends before it starts`
      ).toBe(true);
    }
  });
});

test.describe("Owner — a home-food restaurant is never offered Reservations, Scheduling or Payroll", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (mints a HOME_FOOD tenant)"
  );

  let adminToken = "";
  let restaurantId = "";
  let email = "";
  const runId = generateRunId();

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      restaurant: { businessType: "HOME_FOOD" },
    });
    if (!tenant.restaurantId) throw new Error("[products] no HOME_FOOD tenant");
    restaurantId = tenant.restaurantId;
    email = tenant.email ?? "";
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test("no product that a home-food seller cannot use shows up, in the sidebar or as Available", async ({
    browser,
  }) => {
    await allure.label("feature", "RestauNax Products");
    const session = await loginViaUi(
      browser,
      email,
      process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`
    );
    try {
      const page = session.page;
      await page.goto(
        `/restaurant/restaurantId/${restaurantId}/restaurantManagement`,
        { waitUntil: "domcontentloaded" }
      );
      const nav = page.getByRole("navigation").first();
      await expect(nav).toBeVisible({ timeout: 20_000 });
      for (const name of [/Reservations/i, /Scheduling/i, /Payroll/i]) {
        await expect(nav.getByRole("button", { name })).toHaveCount(0);
      }
    } finally {
      await session.context.close().catch(() => {});
    }
  });
});
