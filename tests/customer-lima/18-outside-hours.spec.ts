/**
 * 18-outside-hours.spec.ts — a guest on the ordering site while the
 * restaurant is closed by its hours: today is a holiday ("Family day")
 * (docs/COVERAGE_MAP.md G15, "Schedule for later") (TC-L83..L86).
 *
 * Browser on template-lima, a per-run throwaway restaurant with its own
 * ordering slug: open 24 hours every day, Burger $12, 7% tax, and today
 * closed through Holiday & special hours. A guest adds a burger.
 *
 *   TC-L83 Checkout for "as soon as possible" is stopped in words before
 *          it starts, and the server refuses such an order, naming the day.
 *   TC-L84 Change time: ASAP is off ("Restaurant is currently closed",
 *          today's hours "Closed"), Schedule for later is picked with
 *          tomorrow; Done; checkout opens.
 *   TC-L85 The server takes the order for tomorrow (and refuses one for
 *          today, in words).
 *   TC-L86 The cart says "We're closed today." and the picker names
 *          tomorrow with a capital ("Restaurant hours for Saturday"). Until
 *          Template-lima #135 (on QA 2026-10-31) it said "We're closed on
 *          friday", as if the restaurant shut every Friday.
 */
import type { BrowserContext, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { generateRunId } from "../../utils/testData";
import { specialHoursRaw } from "../../utils/backOfficeApi";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  deleteTestRestaurant,
  ensureBusinessHours,
  ensureOrderingSlug,
  ensureTaxRate,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  updateRestaurantSettingsApi,
} from "../../utils/apiHelper";
import { activeDialog, expectSeenByUser } from "../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

test.describe("Ordering site — outside business hours", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  const slug = `auto-hours-${runId}`;
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let burgerId = "";
  let timeZone = "";
  let context: BrowserContext | undefined;
  let guestPage: Page | undefined;

  const page = (): Page => {
    if (!guestPage) throw new Error("no guest page");
    return guestPage;
  };
  const lima = () => createLimaStorefrontPage(page());
  const localDate = (offsetDays: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(
      new Date(Date.now() + offsetDays * 86_400_000)
    );
  const weekday = (offsetDays: number) =>
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(
      new Date(Date.now() + offsetDays * 86_400_000)
    );
  const openCart = async () => {
    await page().goto(`${lima().tenantRoot(slug)}/cart`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page().getByRole("button", { name: "Clear Cart" })
    ).toBeVisible({ timeout: 25_000 });
  };
  const placeOrder = (scheduledFor: string | null) =>
    apiRequestRaw<{ message?: string; id?: string; scheduledFor?: string }>(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      {
        restaurantId,
        orderType: "PICKUP",
        orderSource: "WEB",
        scheduledFor,
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

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[lima-hours] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(ownerToken, restaurantId);
    await stripeTestOnboardingRaw(ownerToken, restaurantId);
    await ensureOrderingSlug(adminToken, "restaurant", restaurantId, slug);
    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burgerId = (await createMenuItemFull(ownerToken, food.id, "Burger", 12)).id;
    const hours = await specialHoursRaw(ownerToken, restaurantId, "GET");
    timeZone = String(hours.data.timeZone ?? "");
    if (!timeZone) throw new Error("[lima-hours] no time zone");
    const holiday = await specialHoursRaw(
      ownerToken,
      restaurantId,
      "POST",
      undefined,
      { date: localDate(0), isClosed: true, note: "Family day" }
    );
    if (holiday.status !== 201)
      throw new Error(`[lima-hours] holiday: ${JSON.stringify(holiday.data)}`);
    context = await browser.newContext();
    guestPage = await context.newPage();
    await lima().gotoMenu(slug);
    await lima().openItemModal("Burger");
    await lima().clickAddToCart();
  });

  test.afterAll(async () => {
    if (context) await context.close().catch(() => {});
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Ordering site — business hours");
    await allure.label("severity", "critical");
  });

  test("TC-L83: checkout for ASAP is stopped in words, and the server names the closed day", async () => {
    await openCart();
    await page().getByRole("button", { name: "Proceed to Checkout" }).click();
    await expectSeenByUser(
      page()
        .getByText(
          "Restaurant is currently closed. Please schedule your order for later or try again when we're open."
        )
        .first(),
      "the closed-now message"
    );
    await expect(page()).toHaveURL(/\/cart/);
    const asap = await placeOrder(null);
    expect(asap.status).toBe(400);
    expect(String(asap.data.message)).toBe(
      "This restaurant is closed today (Family day). Check their hours and order another day."
    );
  });

  test("TC-L84: Change time — ASAP is off, Schedule for later picks tomorrow, and checkout opens", async () => {
    await openCart();
    await page().getByRole("button", { name: "Change time" }).click();
    const dialog = activeDialog(page());
    await expect(
      dialog.getByRole("radio", { name: /^As soon as possible/ })
    ).toBeDisabled();
    await expect(dialog).toContainText("Restaurant is currently closed");
    await expect(dialog).toContainText("Today's hours: Closed");
    await expect(
      dialog.getByRole("radio", { name: /^Schedule for later/ })
    ).toBeChecked();
    await expect(
      dialog.getByRole("combobox", { name: /^Select Date/ })
    ).toContainText(`Tomorrow (${weekday(1)}`);
    await dialog.getByRole("button", { name: "DONE" }).click();
    await expect(dialog).toBeHidden();
    await expect(page().getByRole("heading", { name: "ASAP" })).toHaveCount(0);
    await page().getByRole("button", { name: "Proceed to Checkout" }).click();
    await expect(
      page().getByRole("heading", { name: "Complete Your Order" })
    ).toBeVisible({ timeout: 25_000 });
  });

  test("TC-L85: the server takes the order for tomorrow, not for today", async () => {
    /** A wall-clock time on the restaurant's clock, as an ISO instant. */
    const at = (offsetDays: number, hh: number, mm: number) => {
      const [y, m, d] = localDate(offsetDays).split("-").map(Number);
      const guess = Date.UTC(y!, m! - 1, d!, hh, mm);
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone,
          hourCycle: "h23",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
          .formatToParts(new Date(guess))
          .map((p) => [p.type, p.value])
      );
      const shown = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute)
      );
      return new Date(guess - (shown - guess)).toISOString();
    };
    // Late tonight is still the holiday.
    const tonight = await placeOrder(at(0, 23, 45));
    expect(tonight.status).toBe(400);
    expect(String(tonight.data.message)).toMatch(/closed/i);
    const tomorrow = await placeOrder(at(1, 12, 0));
    expect(tomorrow.status, JSON.stringify(tomorrow.data)).toBe(201);
    expect(new Date(String(tomorrow.data.scheduledFor)).toISOString()).toBe(
      at(1, 12, 0)
    );
  });

  test("TC-L86: the cart says 'We're closed today.' and tomorrow is named with a capital", async () => {
    await openCart();
    await page().getByRole("button", { name: "Change time" }).click();
    const dialog = activeDialog(page());
    await expect(dialog.getByRole("alert").first()).toHaveText(
      "We're closed today."
    );
    await expect(dialog).toContainText(`Restaurant hours for ${weekday(1)}:`);
  });
});
