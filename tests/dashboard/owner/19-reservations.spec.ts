/**
 * 19-reservations.spec.ts — Owner → Store Operations → "Reservations"
 * (TC-440..445). Real-browser Playwright clicks against QA's owner portal;
 * API wrappers (task-1's apiHelper.ts additions) do SETUP and ASSERTIONS —
 * the browser only does the clicking, per the brief.
 *
 * Own tenant + login: same shape as 18-tables-floor.spec.ts — a throwaway
 * restaurant minted via `createSecondOwner`, TABLE_RESERVATIONS granted
 * BEFORE first navigation (the Reservations tab is a pure entitlement gate,
 * unlike Tables & Floor's OR-gate), and a manual UI login (`loginViaUi`) in
 * this file's own browser context, opened once in beforeAll and reused
 * (serially — fullyParallel:false) across every test.
 *
 * Test ordering is load-bearing: TC-440/441 both need the fresh tenant's
 * ZERO service periods (441 specifically proves the pacing-guard refusal
 * with none configured); TC-442 is the one test that adds a capped period,
 * after which online booking can succeed. One turn-time band is seeded via
 * the API in beforeAll so TC-443 has something to collide with.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerReservationsPage,
  type OwnerReservationsPage,
} from "../../../pages/dashboard/owner/OwnerReservationsPage";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  getReservationSettingsOwnerRaw,
  createReservationTurnTimeOwnerRaw,
  listReservationDateOverridesOwnerRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

/** Every owner success body wraps its payload in {success, data, message}. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

// MM/DD/YYYY digits for the DatePicker's sectioned keyboard input — same
// convention as OwnerCouponPage's setStartDate/setEndDate (07-coupons.spec.ts).
const formatMMDDYYYY = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}${date.getFullYear()}`;

// Mirrors DateOverridesPanel's own `moment.utc(date).format("MMM D, YYYY")`
// display — a date-only value round-trips through UTC midnight with no zone
// shift, so the LOCAL calendar day picked in the form is exactly what's shown.
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const formatOverrideDisplay = (date: Date) =>
  `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

test.describe("Owner — Reservations", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  /** Throwaway tenant owner's API token (createSecondOwner) — setup/assertions only. */
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession;
  let reservationsPage: OwnerReservationsPage;

  test.beforeAll(async ({ browser }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[reservations] could not mint the throwaway tenant restaurant"
      );
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    const ownerPassword =
      process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    // Grant BEFORE first navigation — the tab gates client-side at mount.
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[reservations] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );

    // Seed one turn-time band (via API — setup, not the UI under test) for
    // TC-443's overlap collision.
    const seedTurnTime = await createReservationTurnTimeOwnerRaw(
      ownerToken,
      restaurantId,
      { minPartySize: 1, maxPartySize: 4, durationMinutes: 60 }
    );
    if (!seedTurnTime.ok)
      throw new Error(
        `[reservations] could not seed the turn-time band: ${msg(seedTurnTime.data)}`
      );

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
    reservationsPage = createOwnerReservationsPage(session.page);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    if (session) await session.context.close();
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    // Best-effort — the whole throwaway restaurant is archived regardless.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Reservations");
    await allure.label("severity", "critical");
  });

  test("TC-440: settings form — change grace + default duration through ONE save button; saved values survive reload", async () => {
    await reservationsPage.gotoSettingsSubTab(restaurantId);

    await reservationsPage.numericSettingInput("graceMinutes").fill("45");
    await reservationsPage
      .numericSettingInput("defaultDurationMinutes")
      .fill("120");

    const res = await reservationsPage.saveReservationSettings();
    expect(res.status()).toBe(200);
    await expect(
      reservationsPage.snackbar("Reservation settings saved.")
    ).toBeVisible({ timeout: 5_000 });

    await session.page.reload({ waitUntil: "domcontentloaded" });
    await reservationsPage.settingsSubTab().click();
    await expect(
      reservationsPage.numericSettingInput("graceMinutes")
    ).toHaveValue("45", { timeout: 10_000 });
    await expect(
      reservationsPage.numericSettingInput("defaultDurationMinutes")
    ).toHaveValue("120");

    const settings = unwrap(
      await getReservationSettingsOwnerRaw(ownerToken, restaurantId)
    );
    expect(settings.graceMinutes).toBe(45);
    expect(settings.defaultDurationMinutes).toBe(120);
  });

  test("TC-441: pacing-guard UX — with no capped periods, toggling online booking ON renders the server's error inline and booking stays OFF", async () => {
    await allure.description(
      "PUT .../reservation-settings refuses onlineBookingEnabled:true (400 " +
        "RESERVATION_PACING_REQUIRED) until at least one active service " +
        "period has a pacing cap — this fresh tenant has zero periods. The " +
        "resolved English message renders inline next to the toggle with a " +
        '"Go to Service periods" link; the server value stays false.'
    );
    await reservationsPage.gotoSettingsSubTab(restaurantId);
    await reservationsPage.onlineBookingToggle().check();

    const [res] = await Promise.all([
      session.page.waitForResponse(
        (r) =>
          /\/reservation-settings$/.test(r.url()) &&
          r.request().method() === "PUT",
        { timeout: 15_000 }
      ),
      reservationsPage.saveSettingsButton().click(),
    ]);
    expect(res.status()).toBe(400);
    await expect(reservationsPage.pacingErrorAlert()).toBeVisible({
      timeout: 5_000,
    });
    await expect(reservationsPage.pacingRequiredLink()).toBeVisible();

    const settings = unwrap(
      await getReservationSettingsOwnerRaw(ownerToken, restaurantId)
    );
    expect(settings.onlineBookingEnabled).toBe(false);
  });

  test("TC-442: create a service period with caps through the form; the online toggle then succeeds", async () => {
    await reservationsPage.gotoSettingsSubTab(restaurantId);

    const periodName = `Lunch ${runId}`;
    await reservationsPage.openCreatePeriod();
    await reservationsPage.periodNameInput().fill(periodName);
    await reservationsPage.selectMuiOption(
      reservationsPage.periodDaySelect(),
      "Monday"
    );
    await reservationsPage.periodStartTimeInput().fill("11:00");
    await reservationsPage.periodEndTimeInput().fill("14:00");
    await reservationsPage.periodMaxPartiesInput().fill("5");
    const periodRes = await reservationsPage.savePeriodForm();
    expect(periodRes.status()).toBe(201);
    await expect(reservationsPage.periodRow(periodName)).toBeVisible({
      timeout: 10_000,
    });

    // The pacing guard is now satisfied — the toggle succeeds this time.
    await reservationsPage.onlineBookingToggle().check();
    const saveRes = await reservationsPage.saveReservationSettings();
    expect(saveRes.status()).toBe(200);
    await expect(
      reservationsPage.snackbar("Reservation settings saved.")
    ).toBeVisible({ timeout: 5_000 });

    const settings = unwrap(
      await getReservationSettingsOwnerRaw(ownerToken, restaurantId)
    );
    expect(settings.onlineBookingEnabled).toBe(true);
  });

  test("TC-443: turn-time band form + overlap attempt — a new band saves, a colliding one is refused with the server's 409 message verbatim", async () => {
    await reservationsPage.gotoSettingsSubTab(restaurantId);

    // Happy path: a band that doesn't collide with the seeded 1–4 band.
    await reservationsPage.openCreateTurnTime();
    const okRes = await reservationsPage.saveTurnTimeForm({
      minPartySize: 5,
      maxPartySize: 8,
      durationMinutes: 90,
    });
    expect(okRes.status()).toBe(201);
    await expect(reservationsPage.turnTimeRow("5–8")).toBeVisible({
      timeout: 10_000,
    });

    // Overlap attempt: 3–6 collides with the seeded 1–4 band.
    await reservationsPage.openCreateTurnTime();
    const overlapRes = await reservationsPage.saveTurnTimeForm({
      minPartySize: 3,
      maxPartySize: 6,
      durationMinutes: 75,
    });
    expect(overlapRes.status()).toBe(409);
    await expect(reservationsPage.turnTimeOverlapSnackbar()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("TC-444: date override — close a date via the picker; appears in the upcoming list; delete it", async () => {
    await reservationsPage.gotoSettingsSubTab(restaurantId);

    const target = new Date();
    target.setDate(target.getDate() + 5);
    const displayText = formatOverrideDisplay(target);

    await reservationsPage.openAddDateOverride();
    await reservationsPage.setDateOverrideDate(formatMMDDYYYY(target));
    // "Closed all day" defaults ON — leave it, this IS "close a date".
    const res = await reservationsPage.saveDateOverride();
    expect(res.status()).toBe(201);
    await expect(reservationsPage.snackbar("Date override saved.")).toBeVisible(
      { timeout: 5_000 }
    );

    const row = reservationsPage.dateOverrideRow(displayText);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.locator(".MuiChip-label")).toHaveText("Closed");

    const list = unwrap(
      await listReservationDateOverridesOwnerRaw(ownerToken, restaurantId)
    ) as Record<string, unknown>[];
    expect(list.length).toBe(1);
    expect(list[0]?.closed).toBe(true);

    await reservationsPage.rowDeleteButton(row, "Delete").click();
    await reservationsPage
      .confirmDialog("Delete this date override?")
      .waitFor({ state: "visible", timeout: 5_000 });
    const [delRes] = await Promise.all([
      session.page.waitForResponse(
        (r) =>
          /\/reservation-date-overrides\/[^/]+$/.test(r.url()) &&
          r.request().method() === "DELETE",
        { timeout: 15_000 }
      ),
      reservationsPage
        .confirmDialogButton("Delete this date override?", "Delete")
        .click(),
    ]);
    expect(delRes.status()).toBe(200);
    await expect(row).toHaveCount(0);

    const listAfter = unwrap(
      await listReservationDateOverridesOwnerRaw(ownerToken, restaurantId)
    ) as Record<string, unknown>[];
    expect(listAfter.length).toBe(0);
  });

  test("TC-445: phone-booking dialog — fill party/date+time/name/phone → confirmation code; appears in the day view with the right status chip; cancel updates it", async () => {
    await allure.description(
      "Owner phone bookings are always ADVISORY (mode:'staff') — no min-" +
        "notice/advance-window enforcement, so any date/time works. Submitting " +
        "returns a confirmationCode and refreshes the day list (shared " +
        "refresh), so the row is visible without a manual reload; cancelling " +
        "via the row's kebab menu PATCHes status to CANCELLED."
    );
    await reservationsPage.gotoBookingsSubTab(restaurantId);
    await reservationsPage.addBookingButton().click();
    await expect(reservationsPage.phoneBookingDialog()).toBeVisible({
      timeout: 10_000,
    });

    const guestName = `Auto Guest ${runId}`;
    await reservationsPage.phoneBookingTimeInput().fill("18:00");
    await reservationsPage.phoneBookingNameInput().fill(guestName);
    await reservationsPage.phoneBookingPhoneInput().fill("3055550100");

    const res = await reservationsPage.submitPhoneBooking();
    expect(res.status()).toBe(201);
    await expect(reservationsPage.phoneBookingConfirmationCode()).toBeVisible({
      timeout: 10_000,
    });
    const code = (
      await reservationsPage.phoneBookingConfirmationCode().textContent()
    )?.trim();
    expect(code && code.length > 0).toBe(true);

    await reservationsPage.phoneBookingDoneButton().click();
    await expect(reservationsPage.phoneBookingDialog()).toBeHidden();

    const row = reservationsPage.bookingRow(guestName);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(reservationsPage.bookingRowStatusChip(guestName)).toHaveText(
      "Booked"
    );

    const cancelRes = await reservationsPage.cancelBookingViaMenu(guestName);
    expect(cancelRes.status()).toBe(200);
    await expect(reservationsPage.snackbar("Booking cancelled.")).toBeVisible({
      timeout: 5_000,
    });
    await expect(reservationsPage.bookingRowStatusChip(guestName)).toHaveText(
      "Cancelled"
    );
  });
});
