/**
 * 05-reservations-config.spec.ts — Reservation CONFIGURATION (owner portal,
 * API level): ReservationSettings, ReservationServicePeriod,
 * ReservationTurnTime, ReservationDateOverride, and the owner/host-stand
 * phone-booking create path. Everything here is pure owner-JWT REST — no
 * tablet/device is needed for any of TC-396..405, so this file (unlike 03/04)
 * never pairs a device and has no device-rate-limit concern.
 *
 * Own tenant: the file's MAIN throwaway restaurant (`createSecondOwner`)
 * gets the `TABLE_RESERVATIONS` entitlement in `beforeAll` — every one of
 * these endpoints is gated on that entitlement ALONE (never
 * `tableServiceEnabled`, unlike file 04's table/section family). TC-396 mints
 * a SECOND, throwaway restaurant inline that never receives the grant, to
 * prove the pre-entitlement 403 without disturbing the main tenant's state.
 *
 * ADVISORY vs STRICT (confirmed against `availabilityService.ts`): the owner
 * phone-booking create (`POST .../reservations`) always runs in "staff"
 * ADVISORY mode, which — contrary to the brief's general "book ~48h out,
 * respect min-notice/advance-window" caution — skips minNoticeMinutes,
 * advanceBookingDays, and date-override/grid checks ENTIRELY (those are
 * STRICT/"public"-mode only, for the not-yet-built customer-facing booking
 * widget). ADVISORY mode only ever *advises* on pacing (`pacingExceeded`),
 * never refuses. TC-405 still books comfortably in the future for realism,
 * but the min-notice ceremony the brief describes turned out to be
 * unnecessary for this owner-only path — recorded as a discrepancy in the
 * task report.
 *
 * Response envelope (verified against the controller source): every one of
 * these owner endpoints wraps its success payload in {success, data,
 * message} — list endpoints' `data` is the bare array (NOT `{periods:...}`
 * etc., despite the apiHelper JSDoc's guessed shape) — read via `unwrap()`.
 * Error bodies stay FLAT ({success:false, message, errorCode}).
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  getReservationSettingsOwnerRaw,
  putReservationSettingsOwnerRaw,
  listReservationServicePeriodsOwnerRaw,
  createReservationServicePeriodOwnerRaw,
  updateReservationServicePeriodOwnerRaw,
  listReservationTurnTimesOwnerRaw,
  createReservationTurnTimeOwnerRaw,
  listReservationDateOverridesOwnerRaw,
  createReservationDateOverrideOwnerRaw,
  deleteReservationDateOverrideOwnerRaw,
  createReservationOwnerRaw,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

const errorCode = (body: unknown): string =>
  body && typeof body === "object" && "errorCode" in body
    ? String((body as { errorCode: unknown }).errorCode)
    : "";

/** Every owner reservation-config success body wraps its payload in
 *  {success, data, message} — pull the real payload out. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

/** RESERVATION_SETTINGS_DEFAULTS, mirrored from
 *  reservationSettingsService.ts — a virgin throwaway restaurant reads
 *  exactly these until something writes a row. */
const SETTINGS_DEFAULTS = {
  onlineBookingEnabled: false,
  graceMinutes: 15,
  waitlistNotifyTimeoutMinutes: 15,
  reservedSoonLeadMinutes: 60,
  dirtyDecayMinutes: 20,
  defaultDurationMinutes: 90,
  minNoticeMinutes: 60,
  advanceBookingDays: 30,
  maxOpenReservationsPerPhone: 3,
  reminderLeadMinutes: 120,
};

test.describe("POS — Reservation Configuration (settings, periods, turn times, overrides, phone booking)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  /** Main throwaway tenant (gets the entitlement in beforeAll). */
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  /** Every extra throwaway restaurant this file mints (TC-396's ungated
   *  tenant) — swept in afterAll. */
  const extraRestaurantIds: string[] = [];

  let phoneSeq = 1000;
  /** Unique 10-digit guest phone per call — never reused across
   *  reservations (SMS throttle 5/hr/phone + a per-phone open-reservations
   *  cap). */
  const nextGuestPhone = (): string => {
    phoneSeq += 1;
    const runFrag = parseInt(runId.slice(0, 4), 16) % 1000;
    return `555${String(runFrag).padStart(3, "0")}${String(phoneSeq).padStart(4, "0")}`;
  };

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[reservations-config] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[reservations-config] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );
  });

  test.afterAll(async () => {
    if (!token) return;
    // Best-effort: the main tenant is about to be archived below regardless,
    // so a failed revoke here (e.g. already gone, or a transient QA blip)
    // is not worth surfacing as a test failure.
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    // Best-effort: every extra throwaway restaurant this file minted
    // (TC-396's ungated tenant) is disposable — a failed archive here
    // orphans a harmless tenant rather than breaking the run.
    for (const id of extraRestaurantIds) {
      await deleteTestRestaurant(adminToken, id).catch(() => {});
    }
    // Best-effort: same reasoning as file 04's afterAll — a failed archive
    // of the main throwaway restaurant orphans it harmlessly rather than
    // masking the test results with a teardown failure.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Reservation Configuration");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test("TC-396: everything 403 before the entitlement — settings GET and service-period POST both refuse", async () => {
    await allure.description(
      "A SECOND throwaway restaurant that never receives TABLE_RESERVATIONS: " +
        "GET reservation-settings and POST a service period both → 403 " +
        "RESERVATIONS_NOT_ENABLED. The file's main tenant (granted in " +
        "beforeAll) is left untouched by this test."
    );
    const ungated = await createSecondOwner(adminToken, `${runId}-ungated`);
    if (!ungated.restaurantId)
      throw new Error("[TC-396] could not mint the ungated restaurant");
    extraRestaurantIds.push(ungated.restaurantId);

    const settings = await getReservationSettingsOwnerRaw(
      ungated.accessToken,
      ungated.restaurantId
    );
    expect(settings.status, msg(settings.data)).toBe(403);
    expect(errorCode(settings.data)).toBe("RESERVATIONS_NOT_ENABLED");

    const period = await createReservationServicePeriodOwnerRaw(
      ungated.accessToken,
      ungated.restaurantId,
      {
        name: `Ungated ${runId}`,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
      }
    );
    expect(period.status, msg(period.data)).toBe(403);
    expect(errorCode(period.data)).toBe("RESERVATIONS_NOT_ENABLED");
  });

  test("TC-397: settings round-trip — a partial PUT updates only the fields sent", async () => {
    await allure.description(
      "PUT a partial patch (graceMinutes, defaultDurationMinutes); GET " +
        "reflects the new values while every untouched field keeps its " +
        "schema default (this is the first write to ReservationSettings for " +
        "this restaurant — the PUT lazy-creates the row)."
    );
    const put = await putReservationSettingsOwnerRaw(token, restaurantId, {
      graceMinutes: 30,
      defaultDurationMinutes: 120,
    });
    expect(put.status, msg(put.data)).toBe(200);

    const get = await getReservationSettingsOwnerRaw(token, restaurantId);
    expect(get.status, msg(get.data)).toBe(200);
    const settings = unwrap(get);
    expect(settings.graceMinutes).toBe(30);
    expect(settings.defaultDurationMinutes).toBe(120);
    expect(settings.onlineBookingEnabled).toBe(
      SETTINGS_DEFAULTS.onlineBookingEnabled
    );
    expect(settings.waitlistNotifyTimeoutMinutes).toBe(
      SETTINGS_DEFAULTS.waitlistNotifyTimeoutMinutes
    );
    expect(settings.reservedSoonLeadMinutes).toBe(
      SETTINGS_DEFAULTS.reservedSoonLeadMinutes
    );
    expect(settings.dirtyDecayMinutes).toBe(
      SETTINGS_DEFAULTS.dirtyDecayMinutes
    );
    expect(settings.minNoticeMinutes).toBe(SETTINGS_DEFAULTS.minNoticeMinutes);
    expect(settings.advanceBookingDays).toBe(
      SETTINGS_DEFAULTS.advanceBookingDays
    );
    expect(settings.maxOpenReservationsPerPhone).toBe(
      SETTINGS_DEFAULTS.maxOpenReservationsPerPhone
    );
    expect(settings.reminderLeadMinutes).toBe(
      SETTINGS_DEFAULTS.reminderLeadMinutes
    );
  });

  test("TC-398: settings validation — an out-of-range value is refused, not clamped", async () => {
    await allure.description(
      "A negative graceMinutes (outside its [0,120] clamp) → 400 " +
        "RESERVATION_SETTINGS_INVALID_RANGE — every field is refused outside " +
        "its range, never silently clamped."
    );
    const bad = await putReservationSettingsOwnerRaw(token, restaurantId, {
      graceMinutes: -5,
    });
    expect(bad.status, msg(bad.data)).toBe(400);
    expect(errorCode(bad.data)).toBe("RESERVATION_SETTINGS_INVALID_RANGE");
  });

  test("TC-399: reminderLeadMinutes bounds — 0 disabled, 15..2880 valid, everything else refused", async () => {
    await allure.description(
      "reminderLeadMinutes is special-cased: 0 (disabled) is always valid; " +
        "any nonzero value must be >= 15 and <= 2880 (48h) — 10 and 2881 are " +
        "both refused, 15 and 2880 (the exact boundaries) are both valid."
    );
    const cases: Array<[number, number]> = [
      [0, 200],
      [10, 400],
      [15, 200],
      [2880, 200],
      [2881, 400],
    ];
    for (const [value, expectedStatus] of cases) {
      const res = await putReservationSettingsOwnerRaw(token, restaurantId, {
        reminderLeadMinutes: value,
      });
      expect(
        res.status,
        `reminderLeadMinutes=${value} → ${msg(res.data)}`
      ).toBe(expectedStatus);
      if (expectedStatus === 400) {
        expect(errorCode(res.data)).toBe("RESERVATION_SETTINGS_INVALID_RANGE");
      }
    }
  });

  test("TC-400: pacing guard — onlineBookingEnabled refuses with zero paced periods, succeeds once one exists", async () => {
    await allure.description(
      "With no ReservationServicePeriod configured yet, PUT " +
        "{onlineBookingEnabled:true} → 400 RESERVATION_PACING_REQUIRED. " +
        "Creating an active, paced (maxPartiesPerSlot set) period for every " +
        "day of the week — full 00:00-23:45 coverage, which also gives " +
        "TC-405's booking somewhere to land regardless of which day it falls " +
        "on — then lets the same PUT through."
    );
    const zeroPacing = await putReservationSettingsOwnerRaw(
      token,
      restaurantId,
      { onlineBookingEnabled: true }
    );
    expect(zeroPacing.status, msg(zeroPacing.data)).toBe(400);
    expect(errorCode(zeroPacing.data)).toBe("RESERVATION_PACING_REQUIRED");

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const period = await createReservationServicePeriodOwnerRaw(
        token,
        restaurantId,
        {
          name: `Full Day ${dayOfWeek} ${runId}`,
          dayOfWeek,
          startTime: "00:00",
          endTime: "23:45",
          slotIntervalMinutes: 15,
          maxPartiesPerSlot: 1,
          isActive: true,
        }
      );
      expect(period.status, msg(period.data)).toBe(201);
    }

    const retry = await putReservationSettingsOwnerRaw(token, restaurantId, {
      onlineBookingEnabled: true,
    });
    expect(retry.status, msg(retry.data)).toBe(200);
    const get = await getReservationSettingsOwnerRaw(token, restaurantId);
    expect(unwrap(get).onlineBookingEnabled).toBe(true);
  });

  test("TC-401: service periods CRUD — create, patch, list; invalid dayOfWeek and start>=end both 400", async () => {
    await allure.description(
      "POST creates a period on a window distinct from TC-400's full-day " +
        "coverage (no exact-duplicate collision); PATCH edits its times; " +
        "GET lists it alongside the full-week periods. dayOfWeek=7 (out of " +
        "0-6) and start>=end are both refused with 400."
    );
    const created = await createReservationServicePeriodOwnerRaw(
      token,
      restaurantId,
      {
        name: `Lunch ${runId}`,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "14:00",
      }
    );
    expect(created.status, msg(created.data)).toBe(201);
    const periodId = unwrap(created).id;

    const patched = await updateReservationServicePeriodOwnerRaw(
      token,
      restaurantId,
      periodId,
      { startTime: "11:00", endTime: "15:00" }
    );
    expect(patched.status, msg(patched.data)).toBe(200);
    expect(unwrap(patched).startTime).toBe("11:00");
    expect(unwrap(patched).endTime).toBe("15:00");

    const list = await listReservationServicePeriodsOwnerRaw(
      token,
      restaurantId
    );
    expect(list.status, msg(list.data)).toBe(200);
    const periods = unwrap(list) as Record<string, unknown>[];
    expect(periods.some((p) => p.id === periodId)).toBe(true);
    expect(periods.length).toBeGreaterThanOrEqual(8); // 7 full-day + this one

    const badDay = await createReservationServicePeriodOwnerRaw(
      token,
      restaurantId,
      {
        name: `Bad Day ${runId}`,
        dayOfWeek: 7,
        startTime: "09:00",
        endTime: "10:00",
      }
    );
    expect(badDay.status, msg(badDay.data)).toBe(400);

    const badTime = await createReservationServicePeriodOwnerRaw(
      token,
      restaurantId,
      {
        name: `Bad Time ${runId}`,
        dayOfWeek: 2,
        startTime: "14:00",
        endTime: "10:00",
      }
    );
    expect(badTime.status, msg(badTime.data)).toBe(400);
  });

  test("TC-402: duplicate period — the exact same day+start+end refuses with 409", async () => {
    await allure.description(
      "Re-creating a period with the SAME dayOfWeek+startTime+endTime as an " +
        "existing one (one of TC-400's full-day periods) → 409 " +
        "RESERVATION_PERIOD_DUPLICATE. A different window on the same day " +
        "would be fine — only the exact duplicate is refused."
    );
    const dup = await createReservationServicePeriodOwnerRaw(
      token,
      restaurantId,
      {
        name: `Dup Full Day ${runId}`,
        dayOfWeek: 0,
        startTime: "00:00",
        endTime: "23:45",
      }
    );
    expect(dup.status, msg(dup.data)).toBe(409);
    expect(errorCode(dup.data)).toBe("RESERVATION_PERIOD_DUPLICATE");
  });

  test("TC-403: turn-time bands — two non-overlapping bands create; an overlap and an inverted range both refuse", async () => {
    await allure.description(
      "1-2 parties → 60min and 3-6 parties → 90min both create (201). A " +
        "2-4 band overlaps the first (2) and the second (3,4) → 409 " +
        "RESERVATION_TURN_TIME_OVERLAP. minPartySize > maxPartySize → 400 " +
        "RESERVATION_TURN_TIME_RANGE_INVALID."
    );
    const band1 = await createReservationTurnTimeOwnerRaw(token, restaurantId, {
      minPartySize: 1,
      maxPartySize: 2,
      durationMinutes: 60,
    });
    expect(band1.status, msg(band1.data)).toBe(201);

    const band2 = await createReservationTurnTimeOwnerRaw(token, restaurantId, {
      minPartySize: 3,
      maxPartySize: 6,
      durationMinutes: 90,
    });
    expect(band2.status, msg(band2.data)).toBe(201);

    const overlap = await createReservationTurnTimeOwnerRaw(
      token,
      restaurantId,
      {
        minPartySize: 2,
        maxPartySize: 4,
        durationMinutes: 60,
      }
    );
    expect(overlap.status, msg(overlap.data)).toBe(409);
    expect(errorCode(overlap.data)).toBe("RESERVATION_TURN_TIME_OVERLAP");

    const invalidRange = await createReservationTurnTimeOwnerRaw(
      token,
      restaurantId,
      { minPartySize: 5, maxPartySize: 2, durationMinutes: 60 }
    );
    expect(invalidRange.status, msg(invalidRange.data)).toBe(400);
    expect(errorCode(invalidRange.data)).toBe(
      "RESERVATION_TURN_TIME_RANGE_INVALID"
    );

    const list = await listReservationTurnTimesOwnerRaw(token, restaurantId);
    expect(list.status, msg(list.data)).toBe(200);
    const bands = unwrap(list) as Record<string, unknown>[];
    expect(bands.length).toBeGreaterThanOrEqual(2);
  });

  test("TC-404: date overrides — POST upserts by date (no 409 on repeat), list shows it, DELETE removes it", async () => {
    await allure.description(
      "POST closes a date; re-POSTing the SAME date updates the existing " +
        "row (closed/note) instead of erroring — confirmed against the " +
        "service's upsert-by-(restaurantId,date) contract, both calls answer " +
        "201. DELETE removes it and the list forgets it."
    );
    const date = "2027-01-15";
    const first = await createReservationDateOverrideOwnerRaw(
      token,
      restaurantId,
      { date, closed: true, note: "Holiday" }
    );
    expect(first.status, msg(first.data)).toBe(201);
    const overrideId = unwrap(first).id;

    const listed = await listReservationDateOverridesOwnerRaw(
      token,
      restaurantId
    );
    expect(
      (unwrap(listed) as Record<string, unknown>[]).some(
        (o) => o.id === overrideId
      )
    ).toBe(true);

    const second = await createReservationDateOverrideOwnerRaw(
      token,
      restaurantId,
      { date, closed: true, note: "Holiday Updated" }
    );
    expect(second.status, msg(second.data)).toBe(201);
    expect(unwrap(second).id).toBe(overrideId);
    expect(unwrap(second).note).toBe("Holiday Updated");

    const del = await deleteReservationDateOverrideOwnerRaw(
      token,
      restaurantId,
      overrideId
    );
    expect(del.status, msg(del.data)).toBe(200);

    const listedAfter = await listReservationDateOverridesOwnerRaw(
      token,
      restaurantId
    );
    expect(
      (unwrap(listedAfter) as Record<string, unknown>[]).some(
        (o) => o.id === overrideId
      )
    ).toBe(false);
  });

  test("TC-405: owner phone booking is ADVISORY — a second booking over the cap creates anyway and flags pacingExceeded", async () => {
    await allure.description(
      "Two owner (phone) bookings in the exact same slot, capped at " +
        "maxPartiesPerSlot:1 by TC-400's full-day periods: the first is a " +
        "clean 201; the second is ALSO 201 (never a 409) but carries " +
        "data.pacingExceeded:true — a host taking a call may deliberately " +
        "overbook, unlike the (not yet built) STRICT public booking widget."
    );
    const bookingAt = new Date(Date.now() + 48 * 3600 * 1000);
    bookingAt.setUTCHours(15, 0, 0, 0);
    const scheduledAt = bookingAt.toISOString();

    const first = await createReservationOwnerRaw(token, restaurantId, {
      partySize: 2,
      scheduledAt,
      guestName: `Guest One ${runId}`,
      guestPhone: nextGuestPhone(),
    });
    expect(first.status, msg(first.data)).toBe(201);
    expect(unwrap(first).pacingExceeded).toBeFalsy();

    const second = await createReservationOwnerRaw(token, restaurantId, {
      partySize: 2,
      scheduledAt,
      guestName: `Guest Two ${runId}`,
      guestPhone: nextGuestPhone(),
    });
    expect(second.status, msg(second.data)).toBe(201);
    expect(unwrap(second).pacingExceeded).toBe(true);
  });
});
