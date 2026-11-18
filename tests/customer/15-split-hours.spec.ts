/**
 * 15-split-hours.spec.ts — a guest on the restaurant website (template-wind)
 * on a split day: lunch, a break, dinner (Template-wind and RestauNax
 * feat/split-hours, restaunax docs/features/SPLIT_HOURS.md) (TC-2020..2023).
 * The ordering site (template-lima) is customer-lima/20-split-hours.spec.ts;
 * what the server stores and refuses is dashboard/owner/api-split-hours.
 *
 * Browser on template-wind (`?restaurantId=`), a per-run throwaway
 * restaurant: Burger $12, 7% tax, a landing page with the hero and the
 * contact block, and TODAY open in two windows built around the restaurant's
 * current local time.
 *
 *   TC-2020 In the break the hero says "Closed · Opens <dinner>" and the
 *           hours table lists both of today's windows.
 *   TC-2021 Checkout in the break: "Closed · Opens <dinner>", "We reopen at
 *           <dinner> today…", ASAP off, Schedule for later picked, today on
 *           offer, the dinner opening the first time, nothing in the break.
 *           The pickup note asks for a time, then says "ready for pickup
 *           today at <dinner>"; never the old fixed "15-20 minutes".
 *   TC-2022 Inside the first window (a new guest): the hero says "Open Now",
 *           ASAP is offered and picked, no closed notice; the pickup note
 *           says ready around now + the restaurant's own prep time.
 *   TC-2023 The guest stays on checkout with ASAP while the first window
 *           closes (the browser clock is moved, nothing is reloaded):
 *           checkout moves to Schedule for later by itself.
 *
 * Times are matched with an optional zone suffix ("5:00 PM EST"): the site
 * adds it when the browser's zone differs from the restaurant's (CI is UTC).
 * Near local midnight there is no room for two windows around now and the
 * cases skip. Gated: RELEASED_ON_QA.splitHours + splitHoursWind.
 * Tag @split-hours.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId, TEMPLATE_WIND_URL } from "../../utils/testData";
import { specialHoursRaw } from "../../utils/backOfficeApi";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  deleteTestRestaurant,
  ensureTaxRate,
  putBrandingAdminRaw,
  putBusinessHoursRaw,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  updateRestaurantSettingsApi,
} from "../../utils/apiHelper";
import {
  DAY_NAMES,
  formatClockEn,
  hhmm,
  localParts,
  NO_ROOM_FOR_SPLIT_DAY,
  splitDayAroundNow,
  type SplitDayPlan,
} from "../../utils/dealSchedule";
import { expectSeenByUser } from "../../utils/humanQa";
import { probeSplitHours, requireRelease } from "../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
/** The restaurant's pickup prep time (settings.pickupPrepTimeDefault). */
const PREP_MINUTES = 35;

test.describe.configure({ mode: "serial" });

test.describe(
  "Restaurant website — a split day",
  { tag: "@split-hours" },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let ownerToken = "";
    let restaurantId = "";
    let timeZone = "";
    let context: BrowserContext | undefined;
    let guestPage: Page | undefined;

    const page = (): Page => {
      if (!guestPage) throw new Error("no guest page");
      return guestPage;
    };
    const site = (path: string) =>
      `${TEMPLATE_WIND_URL}${path}?restaurantId=${restaurantId}`;
    /** "5:00 PM" for a minute of the restaurant's day. */
    const clock = (minuteOfDay: number) => formatClockEn(hhmm(minuteOfDay));
    /** The same as a pattern, with the optional zone suffix: "5:00 PM EST". */
    const shown = (minuteOfDay: number) =>
      `${clock(minuteOfDay).replace(" ", "\\s")}(?:\\s[A-Z][A-Za-z0-9+:-]{1,8})?`;
    const weekday = () =>
      new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(
        new Date()
      );
    /**
     * Save a week whose TODAY has two windows around now (the other days are
     * lunch + dinner). Skips the test when today has no room for them.
     */
    const saveToday = async (
      where: "break" | "first"
    ): Promise<SplitDayPlan> => {
      const plan = splitDayAroundNow(timeZone, where);
      test.skip(!plan, NO_ROOM_FOR_SPLIT_DAY);
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
      expect(saved.status, JSON.stringify(saved.data)).toBe(200);
      return plan!;
    };
    /** A new guest (empty browser storage) with a burger in the cart. */
    const newGuest = async (browser: Browser) => {
      // Best-effort: the previous guest's window is no longer needed.
      if (context) await context.close().catch(() => {});
      context = await browser.newContext();
      guestPage = await context.newPage();
      await page().goto(site("/menu"), { waitUntil: "domcontentloaded" });
      await page()
        .getByTestId("menu-item-card")
        .filter({ hasText: "Burger" })
        .first()
        .click();
      await page().getByTestId("add-to-cart").click();
      await expect(page().getByTestId("view-cart")).toBeVisible();
    };
    const openCheckout = async () => {
      await page().goto(site("/checkout"), { waitUntil: "domcontentloaded" });
      await expect(page().locator('input[name="firstName"]')).toBeVisible({
        timeout: 25_000,
      });
    };
    const asap = () =>
      page().getByRole("radio", { name: /^As soon as possible/ });
    const later = () =>
      page().getByRole("radio", { name: /^Schedule for later/ });
    const notice = () => page().getByTestId("order-time-notice");
    /** When the pickup order will be ready, under the pickup address. */
    const readyNote = () => page().getByTestId("pickup-ready-note");
    /** Checkout never promises the old fixed "15-20 minutes". */
    const expectNoFixedPickupTime = async () =>
      expect(page().locator("body")).not.toContainText("15-20 minutes");
    /** The date and time pickers under "Schedule for later" (no ids). */
    const dateSelect = () =>
      page()
        .locator("select")
        .filter({
          has: page().locator("option", { hasText: "Choose a date" }),
        });
    const timeSelect = () =>
      page()
        .locator("select")
        .filter({
          has: page().locator("option", { hasText: "Choose a time" }),
        });
    /** Skip (or fail, once released) on a website from before split hours. */
    const requireWind = async () =>
      requireRelease(
        "splitHoursWind",
        await notice()
          .waitFor({ timeout: 10_000 })
          .then(() => true)
          // Not there = a build from before split hours; the gate decides.
          .catch(() => false)
      );

    test.beforeAll(async () => {
      test.setTimeout(150_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId) throw new Error("[wind-split] no tenant");
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      await updateRestaurantSettingsApi(ownerToken, restaurantId, {
        acceptingOrders: true,
        // A number no default would give, so the page can only have it from
        // this restaurant.
        pickupPrepTimeDefault: PREP_MINUTES,
      });
      await ensureTaxRate(ownerToken, restaurantId, 7);
      await setRestaurantPublishedApi(adminToken, restaurantId, true);
      await stripeTestOnboardingRaw(ownerToken, restaurantId);
      const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
        restaurantId,
      });
      await createMenuItemFull(ownerToken, food.id, "Burger", 12);
      timeZone = String(
        (await specialHoursRaw(ownerToken, restaurantId, "GET")).data
          .timeZone ?? ""
      );
      if (!timeZone) throw new Error("[wind-split] no time zone");
      // A new restaurant's landing page has neither block: give it the hero
      // (open badge) and the contact block (hours table).
      const pages = await putBrandingAdminRaw(adminToken, restaurantId, {
        restaurantPages: {
          landing: {
            blocks: [
              { type: "lima_hero", data: {} },
              {
                type: "contact_info",
                data: {
                  title: "Visit us",
                  showHours: true,
                  showPhone: true,
                  showMap: false,
                  showEmail: false,
                  showContactForm: false,
                },
              },
            ],
          },
        },
      });
      if (!pages.ok)
        throw new Error(`[wind-split] pages: ${JSON.stringify(pages.data)}`);
      // One-window days in the shape every backend takes (no `windows` key),
      // so the release probe has rows to read.
      const plain = await putBusinessHoursRaw(
        ownerToken,
        restaurantId,
        DAY_NAMES.map((day) => ({
          day,
          openingTime: "08:00:00",
          closingTime: "22:00:00",
          isClosed: false,
          is24Hours: false,
        }))
      );
      if (!plain.ok)
        throw new Error(`[wind-split] hours: ${JSON.stringify(plain.data)}`);
    });

    test.afterAll(async () => {
      // Best-effort cleanup: neither may mask the test result.
      if (context) await context.close().catch(() => {});
      if (adminToken && restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    });

    test.beforeEach(async () => {
      requireRelease(
        "splitHours",
        await probeSplitHours(ownerToken, restaurantId)
      );
      await allure.label("feature", "Restaurant website — business hours");
      await allure.label("severity", "critical");
    });

    test("TC-2020: in the break the hero says when the restaurant reopens and the hours table lists both windows", async ({
      browser,
    }) => {
      const { first, second } = await saveToday("break");
      await newGuest(browser);
      await openCheckout();
      await requireWind();

      await page().goto(site("/"), { waitUntil: "domcontentloaded" });
      const badge = page().getByTestId("restaurant-open-status");
      await expectSeenByUser(badge, "the open/closed badge");
      await expect(badge).toHaveText(
        new RegExp(`^Closed · Opens ${shown(second.startMinute)}$`)
      );
      const todayRow = page().getByRole("row", {
        name: new RegExp(`^${weekday()}`),
      });
      await expectSeenByUser(todayRow, "today's hours");
      await expect(todayRow).toContainText(
        `${clock(first.startMinute)} - ${clock(first.endMinute)}, ${clock(second.startMinute)} - ${clock(second.endMinute)}`
      );
    });

    test("TC-2021: checkout in the break — ASAP off, Schedule for later picked, today's dinner opening first, nothing in the break", async ({
      browser,
    }) => {
      const { second } = await saveToday("break");
      await newGuest(browser);
      await openCheckout();
      await requireWind();

      await expectSeenByUser(notice(), "the order-time notice");
      await expect(notice()).toContainText(
        new RegExp(`Closed · Opens ${shown(second.startMinute)}`)
      );
      await expect(notice()).toContainText(
        new RegExp(
          `We reopen at ${shown(second.startMinute)} today\\. You can schedule your order for then\\.`
        )
      );
      await expect(asap()).toBeDisabled();
      await expect(asap()).toHaveAccessibleName(
        new RegExp(`Closed · Opens ${shown(second.startMinute)}`)
      );
      await expect(later()).toBeChecked();
      // Nothing is promised until a time is picked.
      await expectSeenByUser(readyNote(), "the pickup note");
      await expect(readyNote()).toHaveText(
        "Pick a time below and your order will be ready for pickup then."
      );
      // The prep time is for an order made now; in the break it would read
      // as "ready in 35 minutes" right above "Closed".
      await expect(
        page().getByText(`About ${PREP_MINUTES} minutes`, { exact: true })
      ).toHaveCount(0);
      await expectNoFixedPickupTime();

      // Today is on offer (dinner is still to come), first in the list.
      const dates = await dateSelect().locator("option").allInnerTexts();
      expect(dates[1]).toContain(`${weekday()}, `);
      await dateSelect().selectOption({ index: 1 });
      // Every time on offer is inside dinner: the first is its opening, the
      // last is before its close, none is in the break.
      await expect(timeSelect()).toBeVisible();
      const times = (
        await timeSelect().locator("option").allInnerTexts()
      ).slice(1);
      expect(times[0]).toMatch(new RegExp(`^${shown(second.startMinute)}$`));
      expect(times[times.length - 1]).toMatch(
        new RegExp(`^${shown(second.endMinute - 15)}$`)
      );
      expect(times).toHaveLength((second.endMinute - second.startMinute) / 15);

      // A date alone is still no promise; the dinner opening is.
      await expect(readyNote()).toHaveText(
        "Pick a time below and your order will be ready for pickup then."
      );
      await timeSelect().selectOption({ index: 1 });
      await expect(readyNote()).toHaveText(
        new RegExp(
          `^Your order will be ready for pickup today at ${shown(second.startMinute)}\\.$`
        )
      );
      await expectNoFixedPickupTime();
    });

    test("TC-2022: inside the first window ASAP is offered and picked, and the hero says Open Now", async ({
      browser,
    }) => {
      await saveToday("first");
      await newGuest(browser);
      await openCheckout();
      await expect(asap()).toBeEnabled();
      await expect(asap()).toBeChecked();
      await expect(later()).not.toBeChecked();
      await expect(notice()).toHaveCount(0);

      // Ready about the restaurant's prep time from now (a minute may tick
      // over between the page's reading of the clock and ours).
      const nowMinute = localParts(timeZone).minuteOfDay;
      const around = [-1, 0, 1]
        .map((d) => shown(nowMinute + PREP_MINUTES + d))
        .join("|");
      await expectSeenByUser(readyNote(), "the pickup note");
      await expect(readyNote()).toHaveText(
        new RegExp(
          `^Order now and it will be ready for pickup around (?:${around}), about ${PREP_MINUTES} minutes after you order\\.$`
        )
      );
      await expect(
        page().getByText(`About ${PREP_MINUTES} minutes`, { exact: true })
      ).toBeVisible();
      await expectNoFixedPickupTime();
      // Choosing to schedule takes the promise back until a time is picked.
      await later().check();
      await expect(readyNote()).toHaveText(
        "Pick a time below and your order will be ready for pickup then."
      );

      await page().goto(site("/"), { waitUntil: "domcontentloaded" });
      await expect(page().getByTestId("restaurant-open-status")).toHaveText(
        "Open Now"
      );
    });

    test("TC-2023: the first window closes while the guest is on checkout with ASAP — checkout moves to Schedule for later by itself", async ({
      browser,
    }) => {
      const { second } = await saveToday("first");
      await newGuest(browser);
      // The page's own clock, so the close can come without waiting for it.
      await page().clock.install({ time: new Date() });
      await openCheckout();
      await expect(asap()).toBeChecked();

      // 90 minutes on: the first window closed 15 to 30 minutes ago and the
      // second is still to open. The page re-reads the clock once a minute.
      // Nothing is reloaded.
      await page().clock.fastForward(90 * 60_000);
      await page().clock.runFor(61_000);

      await expect(later()).toBeChecked();
      await expect(asap()).toBeDisabled();
      await expect(notice()).toContainText(
        new RegExp(`Closed · Opens ${shown(second.startMinute)}`)
      );
    });
  }
);
