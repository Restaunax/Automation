/**
 * 36-reservations-day-view-ui.spec.ts — the dashboard side of the
 * reservations audit fixes (RestauNax fix/reservations-audit): Owner →
 * Store Operations → Reservations. Real-browser clicks; the owner API seeds
 * bookings and confirms outcomes.
 *
 * Covers (TC-1143 → TC-1149, TC-1119):
 *   - the online-booking switch refused for having no table with a seat
 *     count shows the server's message with a "Go to Tables" link;
 *   - Settings: Basics up front, a collapsed "Advanced" section with the
 *     renamed fields; a bad value inside it opens it with the error;
 *   - Bookings day view: the date picker, the red Allergy chip and the
 *     visible guest / staff notes, the summary strip, search, and the
 *     "Guest confirmed" / "Mark arrived" row actions;
 *   - the phone-booking dialog: inline field errors (no request sent) and the
 *     "Allergies or special requests" field saved as GUEST notes.
 *
 * Own tenant (createSecondOwner, alwaysFresh) + TABLE_RESERVATIONS granted
 * before the first navigation, one manual UI login reused serially. Order is
 * load-bearing: TC-1143 needs the tenant to have NO table yet; it adds one
 * through the API afterwards.
 *
 * Deploy gate: skips until the change is on the stack under test
 * (probeReservationsAudit) — flip RELEASED_ON_QA.reservationsAudit once it
 * is on QA.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerReservationsPage,
  type OwnerReservationsPage,
} from "../../../pages/dashboard/owner/OwnerReservationsPage";
import { generateRunId, generateGuestPhone } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { atLocal, localDateKey } from "../../../utils/dealSchedule";
import {
  probeReservationsAudit,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  getReservationSettingsOwnerRaw,
  createReservationServicePeriodOwnerRaw,
  createReservationOwnerRaw,
  listReservationsOwnerRaw,
  createTableOwnerRaw,
  getRestaurantTimeZonePublic,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("Owner — Reservations day view + settings (audit fixes)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let timeZone = "America/New_York";
  let session: UiLoginSession;
  let rp: OwnerReservationsPage;
  let auditOnStack = false;

  let phoneSeq = 5000;
  const nextGuestPhone = () => {
    phoneSeq += 1;
    return generateGuestPhone(runId, phoneSeq);
  };

  /** The seeded day (restaurant-local, 3 days out) and its bookings. */
  const dayKey = () => localDateKey(timeZone, 3);
  const guests = {
    allergy: `Ana Allergy ${runId}`,
    plain: `Ben Plain ${runId}`,
    third: `Cy Third ${runId}`,
  };
  let plainPhone = "";

  /** The restaurant-local date key as a browser-local Date (the dashboard's
   *  calendar works in plain calendar dates). */
  const keyAsDate = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  };

  const seedBooking = async (body: Record<string, unknown>) => {
    const res = await createReservationOwnerRaw(ownerToken, restaurantId, {
      partySize: 2,
      guestPhone: nextGuestPhone(),
      ...body,
    });
    expect(res.status, msg(res.data)).toBe(201);
    return unwrap(res);
  };

  const dayRows = async (key: string): Promise<Record<string, unknown>[]> => {
    const res = await listReservationsOwnerRaw(ownerToken, restaurantId, {
      date: key,
    });
    const data = unwrap(res);
    return (Array.isArray(data) ? data : data?.reservations) ?? [];
  };

  /** Bookings tab, on the seeded day via the date picker. */
  const openSeededDay = async () => {
    await rp.gotoBookingsSubTab(restaurantId);
    await rp.pickDayInCalendar(keyAsDate(dayKey()));
    await expect(rp.bookingRow(guests.allergy)).toBeVisible({
      timeout: 10_000,
    });
  };

  test.beforeAll(async ({ browser }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId)
      throw new Error("[resv-day-view] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    timeZone = (await getRestaurantTimeZonePublic(restaurantId)) || timeZone;

    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[resv-day-view] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );
    auditOnStack = await probeReservationsAudit(ownerToken, restaurantId);

    // One paced window every day, so only the missing table blocks the
    // online switch in TC-1143.
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const period = await createReservationServicePeriodOwnerRaw(
        ownerToken,
        restaurantId,
        {
          name: `Dinner ${dayOfWeek} ${runId}`,
          dayOfWeek,
          startTime: "17:00",
          endTime: "22:00",
          maxPartiesPerSlot: 4,
          isActive: true,
        }
      );
      if (!period.ok)
        throw new Error(
          `[resv-day-view] could not create a booking window: ${msg(period.data)}`
        );
    }

    // The seeded day: an allergy booking with a staff note, a plain one and
    // a third, two of them at 7:00 PM (the busiest time).
    const key = dayKey();
    await seedBooking({
      guestName: guests.allergy,
      partySize: 2,
      scheduledAt: atLocal(timeZone, key, "19:00"),
      guestNotes: "Peanut allergy",
      internalNotes: "Regular, likes the window",
    });
    plainPhone = nextGuestPhone();
    await seedBooking({
      guestName: guests.plain,
      partySize: 4,
      guestPhone: plainPhone,
      scheduledAt: atLocal(timeZone, key, "19:00"),
      guestNotes: "Birthday",
    });
    await seedBooking({
      guestName: guests.third,
      partySize: 3,
      scheduledAt: atLocal(timeZone, key, "20:30"),
    });

    session = await loginViaUi(
      browser,
      tenant.email,
      "Automation!Owner2-" + runId
    );
    rp = createOwnerReservationsPage(session.page);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    if (restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Reservations");
    await allure.label("severity", "critical");
    requireRelease("reservationsAudit", auditOnStack);
  });

  test("TC-1143: online booking with no table that has a seat count — the server's refusal shows inline with a 'Go to Tables' link; booking stays off @reservations-audit", async () => {
    await allure.description(
      "The tenant has paced booking windows but no tables. Switching " +
        "'Accept bookings online' on and saving → PUT 400 " +
        "RESERVATION_TABLES_REQUIRED; the message renders under the switch " +
        "with a 'Go to Tables' link, and the server value stays false."
    );
    await rp.gotoSettingsSubTab(restaurantId);
    await rp.onlineBookingToggle().check();
    const res = await rp.saveReservationSettings();
    expect(res.status()).toBe(400);
    await expect(rp.bookingSetupError()).toContainText(
      "at least one active, bookable table has a seat count"
    );
    await expect(rp.tablesRequiredLink()).toBeVisible();
    expect(
      unwrap(await getReservationSettingsOwnerRaw(ownerToken, restaurantId))
        .onlineBookingEnabled
    ).toBe(false);

    // The rest of the file needs a table.
    const table = await createTableOwnerRaw(ownerToken, restaurantId, {
      name: `Four Top ${runId}`,
      capacity: 4,
    });
    expect(table.status, msg(table.data)).toBe(201);
  });

  test("TC-1144: Settings — Basics up front, Advanced collapsed; a bad value inside Advanced opens it with the error and nothing is saved @reservations-audit", async () => {
    await allure.description(
      "'How far ahead guests can book (days)' is visible in Basics; " +
        "'Mark as no-show after this many minutes late' (grace) is hidden " +
        "until Advanced opens. With Advanced collapsed again, a Basics edit " +
        "plus an out-of-range grace typed earlier makes Save open Advanced " +
        "and show 'Enter a whole number from 0 to 120.' — no PUT is sent."
    );
    await rp.gotoSettingsSubTab(restaurantId);
    const page = session.page;
    await expect(page.getByText("Basics", { exact: true })).toBeVisible();
    await expect(
      page.getByText("How far ahead guests can book (days)", { exact: true })
    ).toBeVisible();
    await expect(rp.numericSettingInput("advanceBookingDays")).toBeVisible();
    await expect(rp.advancedSummary()).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await expect(rp.numericSettingInput("graceMinutes")).toBeHidden();

    await rp.ensureAdvancedOpen();
    await expect(
      page.getByText("Mark as no-show after this many minutes late", {
        exact: true,
      })
    ).toBeVisible();
    await rp.numericSettingInput("graceMinutes").fill("500");
    await rp.advancedSummary().click();
    await expect(rp.advancedSummary()).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    let putSent = false;
    const onRequest = (r: { url(): string; method(): string }) => {
      if (/\/reservation-settings$/.test(r.url()) && r.method() === "PUT")
        putSent = true;
    };
    page.on("request", onRequest);
    await rp.saveSettingsButton().click();
    await expect(rp.advancedSummary()).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByText("Enter a whole number from 0 to 120.", { exact: true })
    ).toBeVisible();
    page.off("request", onRequest);
    expect(putSent).toBe(false);
    expect(
      unwrap(await getReservationSettingsOwnerRaw(ownerToken, restaurantId))
        .graceMinutes
    ).not.toBe(500);
  });

  test("TC-1145: the date picker opens a chosen day; its rows show the red Allergy chip only on the allergy booking, with guest and staff notes visible @reservations-audit", async () => {
    await allure.description(
      "Pick the seeded day (3 days out) from the day navigator's calendar. " +
        "The 'Peanut allergy' booking carries the red Allergy chip, " +
        "'Guest: Peanut allergy' and 'Staff: Regular, likes the window'; " +
        "the 'Birthday' booking shows 'Guest: Birthday' and no chip."
    );
    await openSeededDay();
    await expect(rp.bookingRowAllergyChip(guests.allergy)).toHaveText(
      "Allergy"
    );
    await expect(rp.bookingRowGuestNotes(guests.allergy)).toHaveText(
      "Guest: Peanut allergy"
    );
    await expect(rp.bookingRowStaffNotes(guests.allergy)).toHaveText(
      "Staff: Regular, likes the window"
    );
    await expect(rp.bookingRowAllergyChip(guests.plain)).toHaveCount(0);
    await expect(rp.bookingRowGuestNotes(guests.plain)).toHaveText(
      "Guest: Birthday"
    );
  });

  test("TC-1146: the summary strip adds the day up — parties and guests, waiting, allergies, busiest time @reservations-audit", async () => {
    await allure.description(
      "Seeded day: parties of 2 + 4 at 7:00 PM and 3 at 8:30 PM, one " +
        "allergy, no waitlist → '3 parties · 9 guests', Waiting 0, " +
        "Allergies 1, Busiest time '… (2 parties)'."
    );
    await openSeededDay();
    await expect(rp.summaryValue("reservations")).toContainText(
      "3 parties · 9 guests"
    );
    await expect(rp.summaryValue("waitlist")).toContainText("0");
    await expect(rp.summaryValue("allergies")).toContainText("1");
    await expect(rp.summaryValue("busiest")).toContainText("(2 parties)");
  });

  test("TC-1147: search filters the loaded day by name or phone; no match says so @reservations-audit", async () => {
    await allure.description(
      "Typing part of a guest's name leaves only that row; typing the " +
        "plain booking's phone digits leaves only it; a string matching " +
        "nobody shows 'No bookings on this day match your search.'"
    );
    await openSeededDay();
    await rp.searchInput().fill("Ana Allergy");
    await expect(rp.bookingRow(guests.allergy)).toBeVisible();
    await expect(rp.bookingRow(guests.plain)).toHaveCount(0);
    await expect(rp.bookingRow(guests.third)).toHaveCount(0);

    await rp.searchInput().fill(plainPhone.slice(-7));
    await expect(rp.bookingRow(guests.plain)).toBeVisible();
    await expect(rp.bookingRow(guests.allergy)).toHaveCount(0);

    await rp.searchInput().fill(`nobody-${runId}`);
    await expect(rp.emptySearchMessage()).toBeVisible();
  });

  test("TC-1148: row actions — 'Guest confirmed' then 'Mark arrived' move the booking and its chip @reservations-audit", async () => {
    await allure.description(
      "The third booking's row menu offers 'Guest confirmed' while it is " +
        "Booked: PATCH 200, chip 'Confirmed', API CONFIRMED. Then 'Mark " +
        "arrived': chip 'Arrived', API ARRIVED — and 'Guest confirmed' is " +
        "no longer offered."
    );
    await openSeededDay();
    const confirmed = await rp.rowStatusAction(guests.third, "Guest confirmed");
    expect(confirmed.status()).toBe(200);
    await expect(rp.bookingRowStatusChip(guests.third)).toHaveText("Confirmed");

    const arrived = await rp.rowStatusAction(guests.third, "Mark arrived");
    expect(arrived.status()).toBe(200);
    await expect(rp.bookingRowStatusChip(guests.third)).toHaveText("Arrived");
    const row = (await dayRows(dayKey())).find(
      (r) => r.guestName === guests.third
    );
    expect(row?.status).toBe("ARRIVED");

    await rp.openBookingRowMenu(guests.third);
    await expect(rp.confirmedMenuItem()).toHaveCount(0);
    await session.page.keyboard.press("Escape");
  });

  test("TC-1149: phone booking — empty required fields are flagged under each field and nothing is sent @reservations-audit", async () => {
    await allure.description(
      "Open 'Add a phone booking' and press Create booking with no name, " +
        "phone or time: 'Enter the guest's name.', 'Enter the guest's phone " +
        "number.' and 'Choose a time.' appear under their fields and no POST " +
        "goes out. Typing a name clears its message."
    );
    await openSeededDay();
    await rp.addBookingButton().click();
    await expect(rp.phoneBookingDialog()).toBeVisible({ timeout: 10_000 });
    const dialog = rp.phoneBookingDialog();

    let postSent = false;
    const onRequest = (r: { url(): string; method(): string }) => {
      if (/\/reservations$/.test(r.url()) && r.method() === "POST")
        postSent = true;
    };
    session.page.on("request", onRequest);
    await rp.phoneBookingSubmitButton().click();
    await expect(dialog.getByText("Enter the guest's name.")).toBeVisible();
    await expect(
      dialog.getByText("Enter the guest's phone number.")
    ).toBeVisible();
    await expect(dialog.getByText("Choose a time.")).toBeVisible();
    expect(postSent).toBe(false);

    await rp.phoneBookingNameInput().fill(`Typed ${runId}`);
    await expect(dialog.getByText("Enter the guest's name.")).toHaveCount(0);
    session.page.off("request", onRequest);
    await session.page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("TC-1119: phone booking — 'Allergies or special requests' is saved as the guest's note and flags the row @reservations-audit", async () => {
    await allure.description(
      "The notes field is now the caller's own request, sent as guestNotes " +
        "(it used to be a staff-only internal note). Book 'Shellfish " +
        "allergy' at 6:00 PM on the seeded day: 201, the row shows the red " +
        "Allergy chip and 'Guest: Shellfish allergy', and the API row has " +
        "guestNotes set and no internalNotes."
    );
    await openSeededDay();
    await rp.addBookingButton().click();
    await expect(rp.phoneBookingDialog()).toBeVisible({ timeout: 10_000 });
    const name = `Dee Shellfish ${runId}`;
    await expect(
      rp.phoneBookingDialog().getByText("Allergies or special requests")
    ).toBeVisible();
    await rp.phoneBookingTimeInput().fill("18:00");
    await rp.phoneBookingNameInput().fill(name);
    await rp.phoneBookingPhoneInput().fill(nextGuestPhone());
    await rp.phoneBookingNotesInput().fill("Shellfish allergy");
    const res = await rp.submitPhoneBooking();
    expect(res.status()).toBe(201);
    await rp.phoneBookingDoneButton().click();
    await expect(rp.phoneBookingDialog()).toBeHidden();

    await expect(rp.bookingRowAllergyChip(name)).toBeVisible({
      timeout: 10_000,
    });
    await expect(rp.bookingRowGuestNotes(name)).toHaveText(
      "Guest: Shellfish allergy"
    );
    const row = (await dayRows(dayKey())).find((r) => r.guestName === name);
    expect(row?.guestNotes).toBe("Shellfish allergy");
    expect(row?.internalNotes ?? null).toBeNull();
    expect(row?.allergyAlert).toBe(true);
  });
});
