/**
 * 20-split-hours.spec.ts — a guest on the ordering site in the BREAK of a
 * split day: lunch is over, dinner opens later today (Template-lima and
 * RestauNax feat/split-hours, restaunax docs/features/SPLIT_HOURS.md)
 * (TC-L87..L90). The closed-all-day case is 18-outside-hours.spec.ts.
 *
 * Browser on template-lima, a per-run throwaway restaurant with its own
 * ordering slug: Burger $12, 7% tax, and TODAY open in two windows built
 * around the restaurant's current local time (the first closed 20+ minutes
 * ago, the second opens 60+ minutes from now). A guest adds a burger.
 *
 *   TC-L87 The cart says "We're closed now. We reopen at <dinner>."; checkout
 *          for "as soon as possible" is stopped in words, and the server
 *          refuses such an order with the reopening time.
 *   TC-L88 Change time: "Closed · Opens <dinner>", today's hours list both
 *          windows, ASAP is off, Schedule for later is picked with TODAY and
 *          the dinner opening as the first time; no time falls in the break.
 *   TC-L89 Done with the dinner time: the cart shows it and checkout opens.
 *   TC-L90 The server takes the order for the dinner time and refuses one
 *          for a time in the break, naming both windows.
 *
 * Times are matched with an optional zone suffix ("5:00 PM EST"): the site
 * adds it when the browser's zone differs from the restaurant's (CI is UTC).
 * Near local midnight there is no room for two windows around now and the
 * file skips. Gated: RELEASED_ON_QA.splitHours + splitHoursLima.
 * Tag @split-hours.
 */
import type { BrowserContext, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { generateRunId } from "../../utils/testData";
import { specialHoursRaw } from "../../utils/backOfficeApi";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  deleteTestRestaurant,
  ensureOrderingSlug,
  ensureTaxRate,
  placeGuestPickupOrderRaw,
  putBusinessHoursRaw,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  updateRestaurantSettingsApi,
} from "../../utils/apiHelper";
import {
  atLocal,
  DAY_NAMES,
  formatClockEn,
  hhmm,
  NO_ROOM_FOR_SPLIT_DAY,
  normalizeSpaces,
  splitDayAroundNow,
  type SplitDayPlan,
} from "../../utils/dealSchedule";
import { activeDialog, expectSeenByUser } from "../../utils/humanQa";
import { probeSplitHours, requireRelease } from "../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const TAX_PERCENT = 7;

test.describe.configure({ mode: "serial" });

test.describe(
  "Ordering site — the break of a split day",
  { tag: "@split-hours" },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
    );

    const runId = generateRunId();
    const slug = `auto-split-${runId}`;
    let adminToken = "";
    let ownerToken = "";
    let restaurantId = "";
    let burger = { id: "", name: "Burger", price: 12 };
    let timeZone = "";
    let plan: SplitDayPlan | null = null;
    /** The site shows the break (false on a build from before split hours). */
    let siteShowsBreak = false;
    let context: BrowserContext | undefined;
    let guestPage: Page | undefined;

    const page = (): Page => {
      if (!guestPage) throw new Error("no guest page");
      return guestPage;
    };
    const lima = () => createLimaStorefrontPage(page());
    const today = (): SplitDayPlan => {
      if (!plan) throw new Error("no split day");
      return plan;
    };
    /** "5:00 PM" for a minute of the restaurant's day. */
    const clock = (minuteOfDay: number) => formatClockEn(hhmm(minuteOfDay));
    /** The same as a pattern, with the optional zone suffix: "5:00 PM EST". */
    const shown = (minuteOfDay: number) =>
      `${clock(minuteOfDay).replace(" ", "\\s")}(?:\\s[A-Z][A-Za-z0-9+:-]{1,8})?`;
    const weekday = () =>
      new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(
        new Date()
      );
    const openCart = async () => {
      await page().goto(`${lima().tenantRoot(slug)}/cart`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page().getByRole("button", { name: "Clear Cart" })
      ).toBeVisible({ timeout: 25_000 });
    };
    const order = (scheduledFor: string | null) =>
      placeGuestPickupOrderRaw(restaurantId, {
        item: burger,
        taxPercent: TAX_PERCENT,
        scheduledFor,
        customerEmail: `auto-guest-${runId}@restaunax-test.com`,
      });

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId) throw new Error("[lima-split] no tenant");
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      const hours = await specialHoursRaw(ownerToken, restaurantId, "GET");
      timeZone = String(hours.data.timeZone ?? "");
      if (!timeZone) throw new Error("[lima-split] no time zone");
      plan = splitDayAroundNow(timeZone, "break");
      // Too close to midnight: every test skips, the tenant is still deleted.
      if (!plan) return;
      await updateRestaurantSettingsApi(ownerToken, restaurantId, {
        acceptingOrders: true,
      });
      await ensureTaxRate(ownerToken, restaurantId, TAX_PERCENT);
      await setRestaurantPublishedApi(adminToken, restaurantId, true);
      await stripeTestOnboardingRaw(ownerToken, restaurantId);
      await ensureOrderingSlug(adminToken, "restaurant", restaurantId, slug);
      const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
        restaurantId,
      });
      burger = {
        ...burger,
        id: (await createMenuItemFull(ownerToken, food.id, "Burger", 12)).id,
      };
      // Today in two windows around now; every other day lunch + dinner.
      const lunchAndDinner = [
        { openingTime: "12:00:00", closingTime: "15:00:00" },
        { openingTime: "17:00:00", closingTime: "22:00:00" },
      ];
      const saved = await putBusinessHoursRaw(
        ownerToken,
        restaurantId,
        DAY_NAMES.map((day) => {
          const windows =
            day === plan!.dayName ? plan!.windows : lunchAndDinner;
          return {
            day,
            openingTime: windows[0]!.openingTime,
            closingTime: windows[1]!.closingTime,
            isClosed: false,
            is24Hours: false,
            windows,
          };
        })
      );
      if (!saved.ok)
        throw new Error(`[lima-split] hours: ${JSON.stringify(saved.data)}`);
      context = await browser.newContext();
      guestPage = await context.newPage();
      await lima().gotoMenu(slug);
      await lima().openItemModal("Burger");
      await lima().clickAddToCart();
      await openCart();
      // The closed alert has always been on the cart; its test id came with
      // split hours.
      siteShowsBreak = await page()
        .getByTestId("restaurant-closed-reason")
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        // Not there = a build from before split hours; the gate decides
        // whether that is a skip or a failure.
        .catch(() => false);
    });

    test.afterAll(async () => {
      // Best-effort cleanup: neither may mask the test result.
      if (context) await context.close().catch(() => {});
      if (adminToken && restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    });

    test.beforeEach(async () => {
      test.skip(!plan, NO_ROOM_FOR_SPLIT_DAY);
      requireRelease(
        "splitHours",
        await probeSplitHours(ownerToken, restaurantId)
      );
      requireRelease("splitHoursLima", siteShowsBreak);
      await allure.label("feature", "Ordering site — business hours");
      await allure.label("severity", "critical");
    });

    test("TC-L87: the cart says when the restaurant reopens, and ASAP checkout is stopped in words", async () => {
      const reopens = today().second.startMinute;
      await openCart();
      const reason = page().getByTestId("restaurant-closed-reason");
      await expectSeenByUser(reason, "the closed reason on the cart");
      await expect(reason).toHaveText(
        new RegExp(`^We're closed now\\. We reopen at ${shown(reopens)}\\.$`)
      );

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

      const asap = await order(null);
      expect(asap.status, JSON.stringify(asap.data)).toBe(400);
      expect(normalizeSpaces(String(asap.data.message))).toBe(
        `This restaurant is closed right now. It opens again at ${clock(reopens)}.`
      );
    });

    test("TC-L88: Change time — both windows listed, ASAP off, today's dinner opening offered first, nothing in the break", async () => {
      const { first, second } = today();
      await openCart();
      await page().getByRole("button", { name: "Change time" }).click();
      const dialog = activeDialog(page());

      await expect(
        dialog.getByTestId("restaurant-closed-reason-dialog")
      ).toHaveText(
        new RegExp(
          `^We're closed now\\. We reopen at ${shown(second.startMinute)}\\.$`
        )
      );
      const notice = dialog.getByTestId("order-time-notice");
      await expectSeenByUser(notice, "the order-time notice");
      await expect(notice).toContainText(
        new RegExp(`Closed · Opens ${shown(second.startMinute)}`)
      );
      await expect(notice).toContainText(
        new RegExp(
          `We reopen at ${shown(second.startMinute)} today\\. You can schedule your order for then\\.`
        )
      );
      // Both windows, in order, on the restaurant's clock.
      await expect(dialog.getByTestId("todays-hours")).toHaveText(
        `Today's hours: ${clock(first.startMinute)} - ${clock(first.endMinute)}, ${clock(second.startMinute)} - ${clock(second.endMinute)}`
      );

      const asap = dialog.getByRole("radio", { name: /^As soon as possible/ });
      await expect(asap).toBeDisabled();
      await expect(asap).toHaveAccessibleName(
        new RegExp(`Closed · Opens ${shown(second.startMinute)}`)
      );
      await expect(
        dialog.getByRole("radio", { name: /^Schedule for later/ })
      ).toBeChecked();
      // Today, not tomorrow: dinner is still to come.
      await expect(
        dialog.getByRole("combobox", { name: /^Select Date/ })
      ).toContainText(`Today (${weekday()}`);
      const time = dialog.getByRole("combobox", { name: /^Select Time/ });
      await expect(time).toHaveText(
        new RegExp(`^${shown(second.startMinute)}$`)
      );

      // Every time on offer is inside dinner: the first is its opening, the
      // last is before its close, none is in the break.
      await time.click();
      const offered = (await page().getByRole("option").allInnerTexts()).map(
        normalizeSpaces
      );
      await page().keyboard.press("Escape");
      expect(offered.length).toBeGreaterThan(0);
      expect(offered[0]).toMatch(new RegExp(`^${shown(second.startMinute)}$`));
      expect(offered[offered.length - 1]).toMatch(
        new RegExp(`^${shown(second.endMinute - 15)}$`)
      );
      expect(offered).toHaveLength(
        (second.endMinute - second.startMinute) / 15
      );
      await expect(dialog).toContainText(
        `Restaurant hours for today: ${clock(first.startMinute)} - ${clock(first.endMinute)}, ${clock(second.startMinute)} - ${clock(second.endMinute)}`
      );
    });

    test("TC-L89: Done with the dinner time — the cart shows it and checkout opens", async () => {
      const { second } = today();
      await openCart();
      await page().getByRole("button", { name: "Change time" }).click();
      const dialog = activeDialog(page());
      await expect(
        dialog.getByRole("combobox", { name: /^Select Time/ })
      ).toHaveText(new RegExp(`^${shown(second.startMinute)}$`));
      await dialog.getByRole("button", { name: "DONE" }).click();
      await expect(dialog).toBeHidden();

      await expect(
        page().getByRole("heading", { name: "Scheduled", exact: true })
      ).toBeVisible();
      await expect(page().getByRole("heading", { name: "ASAP" })).toHaveCount(
        0
      );
      await expectSeenByUser(
        page()
          .getByText(new RegExp(`^${shown(second.startMinute)}$`))
          .first(),
        "the dinner time on the cart"
      );
      await page().getByRole("button", { name: "Proceed to Checkout" }).click();
      await expect(
        page().getByRole("heading", { name: "Complete Your Order" })
      ).toBeVisible({ timeout: 25_000 });
      await expect(page()).toHaveURL(/\/checkout/);
    });

    test("TC-L90: the server takes the order for the dinner time, not for a time in the break", async () => {
      const { dateKey, first, second } = today();
      const dinnerAt = atLocal(timeZone, dateKey, hhmm(second.startMinute));
      const taken = await order(dinnerAt);
      expect(taken.status, JSON.stringify(taken.data)).toBe(201);
      expect(new Date(String(taken.data.scheduledFor)).toISOString()).toBe(
        dinnerAt
      );

      // 15 minutes before dinner opens: still the break, and still ahead of now.
      const refused = await order(
        atLocal(timeZone, dateKey, hhmm(second.startMinute - 15))
      );
      expect(refused.status, JSON.stringify(refused.data)).toBe(400);
      expect(refused.data.errorCode).toBe("ORDER_SCHEDULED_OUTSIDE_HOURS");
      expect(normalizeSpaces(String(refused.data.message))).toContain(
        `it's open ${clock(first.startMinute)} to ${clock(first.endMinute)} and ${clock(second.startMinute)} to ${clock(second.endMinute)} (`
      );
    });
  }
);
