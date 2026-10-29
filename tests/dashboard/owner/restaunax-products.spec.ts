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
 *     HOME_FOOD tenant (createSecondOwner with businessType) and deletes it;
 *     the "no offer" check reads the add-on catalog to find a product with
 *     no active catalog row (skips when every product has one).
 *
 * SIDE EFFECT: the "ask" test creates a REAL AddonRequest on QA and notifies
 * support. If the restaurant already has a pending request the dashboard shows
 * "Request sent <date>" instead of the button; that counts as a pass. The
 * request is left open on purpose (the Available card then shows it pending).
 */
import * as allure from "allure-js-commons";
import type { Page } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, readSharedState } from "../../../utils/testData";
import { loginViaUi } from "../../../utils/auth";
import {
  apiLogin,
  apiRequestRaw,
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

// The products the server can offer, with their EN names (dashboard
// products.json `name.*`). VOICE_AI is left out: its offer comes from the
// voice setup, not only from a catalog row.
const PRODUCT_NAMES: Record<string, string> = {
  TABLE_RESERVATIONS: "RestauNax Reservations",
  SCHEDULING: "RestauNax Scheduling",
  PAYROLL: "RestauNax Payroll",
  ACCOUNTING_SYNC: "RestauNax Books & Taxes",
  MENU_TVS: "RestauNax Menu TVs",
  SOCIAL_MEDIA: "RestauNax Social",
  TIP_MANAGEMENT: "RestauNax Tips",
  TEAM_BUNDLE: "RestauNax Team",
};

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
    // Assumption: the shared-state restaurant is OWNER_EMAIL's. A 401/403/404
    // here means it is not, and every test below would be meaningless.
    const res = await getRestaurantFeaturesRaw(token, restaurantId);
    test.skip(
      !res.ok,
      `OWNER_EMAIL cannot read the shared-state restaurant (${res.status})`
    );
    const features = res.data.data?.features ?? [];
    test.skip(
      features.includes("MENU_TVS"),
      "the seed restaurant already has Menu TVs on — nothing is Available"
    );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "RestauNax Products");
    await allure.label("severity", "critical");
  });

  const manage = (page: Page, query: string) =>
    page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?${query}`,
      { waitUntil: "domcontentloaded" }
    );
  const sideItem = (page: Page, name: RegExp) =>
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
    const available = ownerPage.locator("section").filter({
      has: ownerPage.getByRole("heading", {
        name: "Available for your restaurant",
      }),
    });
    await expect(available).toBeVisible({ timeout: 20_000 });
    const card = available.locator(".MuiCard-root").filter({
      has: ownerPage.getByRole("heading", { name: MENU_TVS, exact: true }),
    });
    await expect(card).toHaveCount(1);
    // Not under "In use" (that section, if present, must not hold it).
    const inUse = ownerPage.locator("section").filter({
      has: ownerPage.getByRole("heading", { name: "In use", exact: true }),
    });
    await expect(
      inUse.getByRole("heading", { name: MENU_TVS, exact: true })
    ).toHaveCount(0);
    // No price on any Available card.
    const texts = await available.locator(".MuiCard-root").allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.join("\n")).not.toContain("$");
  });

  test("a product without an active catalog row is not shown as Available", async ({
    ownerPage,
  }) => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (reads the add-on catalog)"
    );
    const adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD))
      .accessToken;
    const catalog = await apiRequestRaw<
      { feature: string; isActive: boolean }[]
    >("GET", "/api/admin/addons/catalog", undefined, adminToken);
    expect(catalog.ok, `catalog read failed (${catalog.status})`).toBe(true);
    const offered = new Set(
      (catalog.data ?? []).filter((a) => a.isActive).map((a) => a.feature)
    );
    const ownerToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD))
      .accessToken;
    const res = await getRestaurantFeaturesRaw(ownerToken, restaurantId);
    expect(res.ok).toBe(true);
    const body = res.data.data as
      | { features?: string[]; available?: string[] }
      | undefined;
    const entitled = new Set(body?.features ?? []);
    // Neither on for the restaurant nor in the catalog: nothing to offer.
    const feature = Object.keys(PRODUCT_NAMES).find(
      (f) => !entitled.has(f) && !offered.has(f)
    );
    test.skip(
      !feature,
      "every product the seed restaurant lacks has an active catalog row"
    );
    const name = PRODUCT_NAMES[feature as string] as string;

    // The server never offers it...
    expect(body?.available ?? []).not.toContain(feature);

    // ...and the Products page does not list it under Available (an old open
    // request may still show there, marked "Request sent", to be cancelled).
    await manage(ownerPage, "tab=Billing&section=addons");
    const inUseOrAvailable = ownerPage.getByRole("heading", {
      name: /^(In use|Available for your restaurant)$/,
    });
    await expect(inUseOrAvailable.first()).toBeVisible({ timeout: 20_000 });
    const available = ownerPage.locator("section").filter({
      has: ownerPage.getByRole("heading", {
        name: "Available for your restaurant",
      }),
    });
    await expect(
      available
        .locator(".MuiCard-root")
        .filter({
          has: ownerPage.getByRole("heading", { name, exact: true }),
        })
        .filter({ hasNotText: SENT })
    ).toHaveCount(0);
  });

  test("invoice periods never read end-before-start", async ({ ownerPage }) => {
    await manage(ownerPage, "tab=Billing&section=billingHistory");
    const details = ownerPage.getByRole("button", {
      name: "Details",
      exact: true,
    });
    const none = ownerPage.getByText("No billing history available");
    await expect(details.first().or(none)).toBeVisible({ timeout: 20_000 });
    test.skip(
      await none.isVisible(),
      "the seed restaurant has no invoices, so there is no period to check"
    );
    const RANGE =
      /([A-Z][a-z]{2} \d{1,2}(?:, \d{4})?) – ([A-Z][a-z]{2} \d{1,2}, \d{4})/g;
    const count = Math.min(await details.count(), 5);
    let checked = 0;
    for (let i = 0; i < count; i++) {
      await details.nth(i).click();
      const dialog = ownerPage.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "What this invoice is for" })
      ).toBeVisible();
      // Settled: the period line, or the "not available" note, replaces the spinner.
      await expect(
        dialog
          .getByText(
            /^(.*For .+|The details of this invoice aren't available\.)/
          )
          .first()
      ).toBeVisible({ timeout: 20_000 });
      const text = await dialog.innerText();
      for (const m of text.matchAll(RANGE)) {
        const end = new Date(m[2] ?? "");
        const start = new Date(
          /\d{4}/.test(m[1] ?? "")
            ? (m[1] ?? "")
            : `${m[1]}, ${end.getFullYear()}`
        );
        expect(
          end.getTime() >= start.getTime(),
          `period "${m[0]}" ends before it starts`
        ).toBe(true);
        checked++;
      }
      await ownerPage.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
    test.skip(
      checked === 0,
      "no invoice shows a billing period (one-off charges only)"
    );
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
  let password = "";
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
    password = tenant.password ?? "";
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test("no product that a home-food seller cannot use shows up, in the sidebar or as Available", async ({
    browser,
  }) => {
    await allure.label("feature", "RestauNax Products");
    const session = await loginViaUi(browser, email, password);
    try {
      const page = session.page;
      await page.goto(
        `/restaurant/restaurantId/${restaurantId}/restaurantManagement`,
        { waitUntil: "domcontentloaded" }
      );
      const nav = page.getByRole("navigation").first();
      // Positive control: the sidebar has rendered and holds an item every
      // owner has, so the absences below are real.
      const products = nav.getByRole("button", { name: /RestauNax Products/ });
      await expect(products).toBeVisible({ timeout: 20_000 });
      for (const name of [/Reservations/i, /Scheduling/i, /Payroll/i]) {
        await expect(nav.getByRole("button", { name })).toHaveCount(0);
      }
      // ...and the Products page does not offer them either.
      await products.click();
      await expect(page).toHaveURL(/section=addons/);
      const availableHeading = page.getByRole("heading", {
        name: "Available for your restaurant",
      });
      const noSub = page.getByText("No Subscription Assigned");
      await expect(availableHeading.or(noSub)).toBeVisible({
        timeout: 20_000,
      });
      test.skip(
        await noSub.isVisible(),
        "QA precondition: the home-food tenant needs a subscription, or the Products page never renders"
      );
      const available = page
        .locator("section")
        .filter({ has: availableHeading });
      await expect(available).toBeVisible();
      await expect(available).not.toContainText(
        /RestauNax (Reservations|Scheduling|Payroll)/
      );
    } finally {
      await session.context.close().catch(() => {});
    }
  });
});
