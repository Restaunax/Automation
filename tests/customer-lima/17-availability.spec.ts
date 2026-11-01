/**
 * 17-availability.spec.ts — what a guest sees on the ordering site when the
 * restaurant isn't taking orders: paused, closed for the night, not
 * published (docs/COVERAGE_MAP.md G15) (TC-L77..L82, TC-1369/1370).
 *
 * Browser on template-lima, a per-run throwaway restaurant with its own
 * ordering slug (a pause and a day close stop ordering, so never the seed):
 * 7% tax, open every day 00:00–23:59 (not 24 hours, or a close's pause
 * would lift at once), Burger $12. One guest's cart is kept across the
 * file; the owner flips the restaurant's state through the API between
 * tests, the way the dashboard's Store status does. Each state is checked on
 * the cart (where checkout starts) and by placing an order the way the site
 * does, which the server must refuse in words.
 *
 *   TC-L77 Open: the cart offers Proceed to Checkout.
 *   TC-L78 Paused for 30 minutes: the cart says so and Checkout is off; an
 *          order is refused with when ordering reopens.
 *   TC-L79 Resumed: Proceed to Checkout is back.
 *   TC-L80 Closed for the night (Close Day): the cart says so and Checkout
 *          is off; an order is refused in words. Until RestauNax #1118 (on
 *          QA 2026-10-31) the site still offered checkout and refused only
 *          at Pay.
 *   TC-1369 W0:J4-b the owner's Resume ordering lifts the night: Proceed to
 *          Checkout is back and the storefront reports accepting orders.
 *   TC-1370 W0:J4-b a close with the pause off (pauseOrdering: false) leaves
 *          ordering open: checkout stays offered.
 *   TC-L81 Not published: browse only, in words; nothing can be added.
 *   TC-L82 A guest is refused in guest words: paused until resumed, not
 *          published (they read "closed or not accepting" and "Publish the
 *          restaurant…" until RestauNax #1118).
 */
import type { BrowserContext, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  closeDayWebRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  deleteTestRestaurant,
  setOpenAllDayHours,
  getRestaurantDetailsPublicRaw,
  ensureOrderingSlug,
  ensureTaxRate,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  updateRestaurantSettingsApi,
} from "../../utils/apiHelper";
import { expectSeenByUser } from "../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, unknown>;

const NOT_ACCEPTING =
  "This restaurant is currently not accepting online orders";

test.describe.configure({ mode: "serial" });

test.describe("Ordering site — when the restaurant isn't taking orders", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  const slug = `auto-avail-${runId}`;
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let burgerId = "";
  let context: BrowserContext | undefined;
  let guestPage: Page | undefined;

  const page = (): Page => {
    if (!guestPage) throw new Error("no guest page");
    return guestPage;
  };
  const lima = () => createLimaStorefrontPage(page());
  const openCart = async () => {
    await page().goto(`${lima().tenantRoot(slug)}/cart`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page().getByRole("button", { name: "Clear Cart" })
    ).toBeVisible({ timeout: 25_000 });
  };
  const checkoutOffered = () =>
    page().getByRole("button", { name: "Proceed to Checkout" });
  const checkoutOff = () =>
    page().getByRole("button", { name: "Ordering Unavailable" });
  /** Place the burger the way the site does; the server's answer. */
  const placeOrder = () =>
    apiRequestRaw<{ message?: string; id?: string }>(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      {
        restaurantId,
        orderType: "PICKUP",
        subtotal: 12,
        tax: 0.84,
        tip: 0,
        total: 12.84,
        customerEmail: `auto-guest-${runId}@restaunax-test.com`,
        customerPhone: "5555550123",
        firstName: "Gia",
        lastName: "Guest",
        orderItems: [
          {
            menuItemId: burgerId,
            menuItemName: "Burger",
            quantity: 1,
            price: 12,
          },
        ],
      }
    );
  const owner = (path: string, body: Record<string, unknown> = {}) =>
    apiRequestRaw(
      "POST",
      `/api/restaurantId/${restaurantId}/ordering/${path}`,
      body,
      ownerToken
    );
  /** The public storefront payload's `settings.acceptingOrders`. */
  const storefrontAccepting = async () => {
    const r = await getRestaurantDetailsPublicRaw(restaurantId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = (r.data as Rec).data as Rec | undefined;
    return (data?.settings as Rec | undefined)?.acceptingOrders;
  };
  const expectClosedCart = async () => {
    await openCart();
    await expectSeenByUser(
      page().getByRole("alert").filter({ hasText: NOT_ACCEPTING }).first(),
      "the not-accepting notice"
    );
    await expect(checkoutOff()).toBeDisabled();
    await expect(checkoutOffered()).toHaveCount(0);
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[lima-availability] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    // Not 24 hours: a close then pauses ordering until tomorrow's opening.
    await setOpenAllDayHours(ownerToken, restaurantId);
    await stripeTestOnboardingRaw(ownerToken, restaurantId);
    await ensureOrderingSlug(adminToken, "restaurant", restaurantId, slug);
    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burgerId = (await createMenuItemFull(ownerToken, food.id, "Burger", 12)).id;
    context = await browser.newContext();
    guestPage = await context.newPage();
  });

  test.afterAll(async () => {
    if (context) await context.close().catch(() => {});
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Ordering site — availability");
    await allure.label("severity", "critical");
  });

  test("TC-L77: open — the cart offers Proceed to Checkout", async () => {
    await lima().gotoMenu(slug);
    await lima().openItemModal("Burger");
    await lima().clickAddToCart();
    await openCart();
    await expect(checkoutOffered()).toBeEnabled();
    await expect(page().getByText(NOT_ACCEPTING)).toHaveCount(0);
  });

  test("TC-L78: paused for 30 minutes — the cart says so, checkout is off, and an order hears when it reopens", async () => {
    const paused = await owner("pause", { minutes: 30 });
    expect(paused.status, JSON.stringify(paused.data)).toBe(200);
    await expectClosedCart();
    const order = await placeOrder();
    expect(order.status).toBe(400);
    expect(String(order.data.message)).toMatch(
      /^This restaurant has paused online orders\. Ordering reopens at \d{1,2}:\d{2} [AP]M\.$/
    );
  });

  test("TC-L79: resumed — Proceed to Checkout is back", async () => {
    const resumed = await owner("resume");
    expect(resumed.status, JSON.stringify(resumed.data)).toBe(200);
    await openCart();
    await expect(checkoutOffered()).toBeEnabled();
  });

  test("TC-L80: closed for the night — the cart says so and checkout is off; an order is refused in words", async () => {
    const closed = await closeDayWebRaw(ownerToken, restaurantId);
    expect(closed.status, JSON.stringify(closed.data)).toBe(201);
    // W0:J4-b: nothing sent = the default, pause until the next opening.
    expect((closed.data.data as Rec | undefined)?.orderingPaused).toBe(true);
    const order = await placeOrder();
    expect(order.status).toBe(400);
    expect(String(order.data.message)).toBe(
      "This restaurant has closed for the night. Online ordering opens again in the morning."
    );
    await expectClosedCart();
  });

  test("TC-1369: W0:J4-b the owner's Resume lifts the night — checkout is back", async () => {
    const resumed = await owner("resume");
    expect(resumed.status, JSON.stringify(resumed.data)).toBe(200);
    expect(
      ((resumed.data as Rec | undefined)?.data as Rec | undefined)
        ?.closedForNight
    ).toBe(false);
    expect(await storefrontAccepting()).toBe(true);
    await openCart();
    await expect(checkoutOffered()).toBeEnabled();
    await expect(page().getByText(NOT_ACCEPTING)).toHaveCount(0);
  });

  test("TC-1370: W0:J4-b a close with the pause off leaves ordering open — checkout stays offered", async () => {
    const closed = await closeDayWebRaw(ownerToken, restaurantId, {
      depositAmount: 0,
      reclose: true,
      pauseOrdering: false,
    });
    expect(closed.status, JSON.stringify(closed.data)).toBe(201);
    expect((closed.data.data as Rec | undefined)?.orderingPaused).toBe(false);
    expect(await storefrontAccepting()).toBe(true);
    await openCart();
    await expect(checkoutOffered()).toBeEnabled();
    await expect(page().getByText(NOT_ACCEPTING)).toHaveCount(0);
  });

  test("TC-L81: not published — browse only, in words; nothing can be added", async () => {
    await setRestaurantPublishedApi(adminToken, restaurantId, false);
    await lima().gotoRoot(slug);
    await expectSeenByUser(
      page()
        .getByRole("alert")
        .filter({
          hasText:
            "This restaurant is not accepting orders at this time. You can browse the menu, but items can't be added to a cart.",
        })
        .first(),
      "the browse-only notice"
    );
    await lima().gotoMenu(slug);
    await expect(lima().menuItemCard("Burger")).toBeVisible({
      timeout: 25_000,
    });
    await lima().openItemModal("Burger");
    await expect(lima().addToCartButton()).toHaveCount(0);
  });

  test("TC-L82: a refused guest reads guest words — not published, paused until resumed", async () => {
    const unpublished = await placeOrder();
    expect(unpublished.status).toBe(400);
    expect(String(unpublished.data.message)).toBe(
      "This restaurant isn't taking online orders yet."
    );
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    const paused = await owner("pause", { minutes: null });
    expect(paused.status, JSON.stringify(paused.data)).toBe(200);
    const order = await placeOrder();
    expect(order.status).toBe(400);
    expect(String(order.data.message)).toBe(
      "This restaurant isn't taking online orders right now. Please try again later."
    );
  });
});
