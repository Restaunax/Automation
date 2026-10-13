/**
 * 21-reservations-booking-hours.spec.ts — Owner → Reservations, the
 * 2026-10 additions (TC-746..749): booking hours created from business hours,
 * the out-of-hours warning and row chip, the "After a check is paid" policy,
 * and the Insights tab with its "Bookings by source" block. Real-browser
 * clicks; API wrappers do setup and assertions (same split as 19).
 *
 * Own tenant, separate from 19 on purpose: "Use my business hours" only
 * renders while a restaurant has ZERO booking windows, and 19's TC-442 adds
 * one. The tenant gets TABLE_RESERVATIONS before first navigation and a fixed
 * business-hours week (set via the API, never restored — the tenant is
 * archived in afterAll):
 *   Mon 11:00–22:00, Tue 11:00–12:00 (shorter than a 90-min booking),
 *   Wed closed, Thu open 24 hours, Fri 17:00–01:00; Sat/Sun no row (closed).
 *
 * Test order is load-bearing: TC-746 needs the empty windows list; TC-747
 * adds a window on a closed day after it.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerReservationsPage,
  type OwnerReservationsPage,
} from "../../../pages/dashboard/owner/OwnerReservationsPage";
import { generateRunId, generateGuestPhone } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  setBusinessHoursApi,
  getReservationSettingsOwnerRaw,
  listReservationServicePeriodsOwnerRaw,
  createReservationOwnerRaw,
  type BusinessHoursRow,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

/** Every owner success body wraps its payload in {success, data, message}. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

const WEEK_HOURS: BusinessHoursRow[] = [
  {
    day: "MONDAY",
    openingTime: "11:00:00",
    closingTime: "22:00:00",
    isClosed: false,
    is24Hours: false,
  },
  {
    day: "TUESDAY",
    openingTime: "11:00:00",
    closingTime: "12:00:00",
    isClosed: false,
    is24Hours: false,
  },
  {
    day: "WEDNESDAY",
    openingTime: null,
    closingTime: null,
    isClosed: true,
    is24Hours: false,
  },
  {
    day: "THURSDAY",
    openingTime: null,
    closingTime: null,
    isClosed: false,
    is24Hours: true,
  },
  {
    day: "FRIDAY",
    openingTime: "17:00:00",
    closingTime: "01:00:00",
    isClosed: false,
    is24Hours: false,
  },
];

test.describe("Owner — Reservations: booking hours, after-payment policy, insights", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession;
  let reservationsPage: OwnerReservationsPage;

  let phoneSeq = 3000;
  const nextGuestPhone = (): string => {
    phoneSeq += 1;
    return generateGuestPhone(runId, phoneSeq);
  };

  const listPeriods = async () =>
    unwrap(
      await listReservationServicePeriodsOwnerRaw(ownerToken, restaurantId)
    ) as {
      name: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      maxPartiesPerSlot: number | null;
      hoursConflict: string | null;
    }[];

  test.beforeAll(async ({ browser }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[booking-hours] could not mint the throwaway tenant restaurant"
      );
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    const ownerPassword =
      process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[booking-hours] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );
    await setBusinessHoursApi(ownerToken, restaurantId, WEEK_HOURS);

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
    reservationsPage = createOwnerReservationsPage(session.page);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    // Best-effort teardown — the throwaway restaurant is archived regardless.
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Reservations");
    await allure.label("severity", "normal");
  });

  test("TC-746: 'Use my business hours' — the dialog lists a window per open day and why the others are skipped; Create 2 windows saves them in one bulk call", async () => {
    await allure.description(
      "With no booking windows yet, the Booking hours panel offers 'Use my " +
        "business hours'. The dialog shows Monday 11:00–22:00 and Friday " +
        "17:00–23:59 (overnight close capped), Tuesday 'Too short', " +
        "Wednesday 'Closed', Thursday 'Open 24 hours'. With a name and a " +
        "pacing limit of 4, 'Create 2 windows' sends one POST .../bulk " +
        "(201); the API lists exactly those two windows, paced at 4."
    );
    await reservationsPage.gotoSettingsSubTab(restaurantId);
    await reservationsPage.useBusinessHoursButton().click();
    await expect(reservationsPage.suggestionTable()).toBeVisible({
      timeout: 10_000,
    });

    await expect(reservationsPage.suggestionRow("Monday")).toContainText(
      "11:00–22:00"
    );
    await expect(reservationsPage.suggestionRow("Friday")).toContainText(
      "17:00–23:59"
    );
    await expect(reservationsPage.suggestionRow("Tuesday")).toContainText(
      "Too short"
    );
    await expect(reservationsPage.suggestionRow("Wednesday")).toContainText(
      "Closed"
    );
    await expect(reservationsPage.suggestionRow("Thursday")).toContainText(
      "Open 24 hours"
    );

    const name = `Regular ${runId}`;
    await reservationsPage.suggestNameInput().fill(name);
    await reservationsPage.suggestMaxPartiesInput().fill("4");
    await expect(reservationsPage.suggestSaveButton()).toHaveText(
      "Create 2 windows"
    );
    const [res] = await Promise.all([
      session.page.waitForResponse(
        (r) =>
          /\/reservation-service-periods\/bulk$/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      reservationsPage.suggestSaveButton().click(),
    ]);
    expect(res.status()).toBe(201);
    await expect(reservationsPage.periodRow(name).first()).toBeVisible({
      timeout: 10_000,
    });

    const periods = (await listPeriods()).filter((p) => p.name === name);
    expect(
      periods.map((p) => `${p.dayOfWeek} ${p.startTime}-${p.endTime}`).sort()
    ).toEqual(["1 11:00-22:00", "5 17:00-23:59"]);
    for (const p of periods) expect(p.maxPartiesPerSlot).toBe(4);
  });

  test("TC-747: a window on a closed day warns in the form, still saves, and its row is marked 'Closed this day'", async () => {
    await allure.description(
      "Add Window → Wednesday (closed in business hours) 18:00–20:00: the " +
        "form shows the advisory 'closed on Wednesday' alert before saving; " +
        "Save still creates it (201 — a warning, never a blocker); the row " +
        "shows the 'Closed this day' chip and the API row carries " +
        "hoursConflict CLOSED_DAY."
    );
    await reservationsPage.gotoSettingsSubTab(restaurantId);
    const name = `Wed Event ${runId}`;
    await reservationsPage.openCreatePeriod();
    await reservationsPage.periodNameInput().fill(name);
    await reservationsPage.periodDayChip("Wednesday").click();
    await reservationsPage.periodStartTimeInput().fill("18:00");
    await reservationsPage.periodEndTimeInput().fill("20:00");

    await expect(reservationsPage.periodHoursWarning()).toBeVisible({
      timeout: 5_000,
    });
    await expect(reservationsPage.periodHoursWarning()).toContainText(
      "Wednesday"
    );

    const res = await reservationsPage.savePeriodForm();
    expect(res.status()).toBe(201);
    await expect(reservationsPage.periodRow(name)).toContainText(
      "Closed this day",
      { timeout: 10_000 }
    );

    const row = (await listPeriods()).find((p) => p.name === name);
    expect(row?.hoursConflict).toBe("CLOSED_DAY");
  });

  test("TC-748: 'After a check is paid' — choosing auto-free reveals the minutes field; the policy and minutes save and survive a reload", async () => {
    await allure.description(
      "Settings → After a check is paid: the default radio is 'Show as " +
        "Paid until someone taps Cleared'. Picking 'Show as Paid, then free " +
        "it automatically' reveals 'Minutes before a paid table reads " +
        "free'; set 7 and save (200). The API reads AUTO_AVAILABLE / 7, and " +
        "after a reload the auto-free radio is still checked."
    );
    await reservationsPage.gotoSettingsSubTab(restaurantId);
    await expect(
      reservationsPage.afterPaymentRadio("Show as Paid until someone taps")
    ).toBeChecked();
    await expect(
      reservationsPage.numericSettingInput("autoClearMinutes")
    ).toHaveCount(0);

    await reservationsPage
      .afterPaymentRadio("Show as Paid, then free it automatically")
      .check();
    const autoClear = reservationsPage.numericSettingInput("autoClearMinutes");
    await expect(autoClear).toBeVisible({ timeout: 5_000 });
    await autoClear.fill("7");

    const res = await reservationsPage.saveReservationSettings();
    expect(res.status()).toBe(200);
    const settings = unwrap(
      await getReservationSettingsOwnerRaw(ownerToken, restaurantId)
    );
    expect(settings.afterPaymentPolicy).toBe("AUTO_AVAILABLE");
    expect(settings.autoClearMinutes).toBe(7);

    await reservationsPage.gotoSettingsSubTab(restaurantId);
    await expect(
      reservationsPage.afterPaymentRadio(
        "Show as Paid, then free it automatically"
      )
    ).toBeChecked();
    await expect(autoClear).toHaveValue("7");
  });

  test("TC-749: Insights tab — no turns yet shows the empty message; two phone bookings show under 'Bookings by source'; the range toggle switches", async () => {
    await allure.description(
      "Two owner phone bookings (source PHONE) seeded via the API. " +
        "Reservations → Insights: 'How your tables turn' with the no-turns " +
        "message (no POS shift on this tenant), and the 'Bookings by " +
        "source' block with the Phone tile at 2 (100%). Clicking 'Last 7 " +
        "days' presses that range button."
    );
    for (let i = 0; i < 2; i++) {
      const res = await createReservationOwnerRaw(ownerToken, restaurantId, {
        partySize: 2,
        scheduledAt: new Date(
          Date.now() + (48 + i) * 3600 * 1000
        ).toISOString(),
        guestName: `Insight Guest ${i} ${runId}`,
        guestPhone: nextGuestPhone(),
      });
      expect(res.status, msg(res.data)).toBe(201);
    }

    await reservationsPage.gotoInsightsSubTab(restaurantId);
    await expect(
      session.page.getByText("No turns recorded yet", { exact: false })
    ).toBeVisible({ timeout: 10_000 });

    const sources = reservationsPage.bookingSourcesBlock();
    await expect(sources).toBeVisible({ timeout: 10_000 });
    await expect(sources).toContainText("Bookings by source");
    await expect(sources).toContainText("Phone");
    await expect(sources).toContainText("100% of bookings");

    await reservationsPage.insightsRangeButton(7).click();
    await expect(reservationsPage.insightsRangeButton(7)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(sources).toContainText("Phone");
  });
});
