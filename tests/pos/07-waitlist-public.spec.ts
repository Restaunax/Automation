/**
 * 07-waitlist-public.spec.ts — Waitlist (tablet host stand) + PUBLIC
 * self-service booking (API level). Feature:
 * table-management-reservations-eager-teacup, Phase A Task 7
 * (`publicReservationController.ts`) + Task 8's waitlist half
 * (`tabletReservationController.ts`'s `createReservation`/`notifyReservation`).
 *
 * Own tenant: the WHOLE file runs on a per-run throwaway restaurant owned by
 * an admin-minted OWNER (`createSecondOwner`) — the public gate is
 * entitlement (TABLE_RESERVATIONS) AND `onlineBookingEnabled`, and this file
 * flips `onlineBookingEnabled` off/on (TC-425), so it needs its own tenant.
 * Setup chain: settings PUT (tableServiceEnabled + acceptingOrders) →
 * entitlement grant → menu item (unused directly, kept for setup parity —
 * no order is ever opened here) → REGISTER device (admin-created; needed
 * only so a staff session can be minted for the tablet legs) → tablet login
 * → owner POS PIN (MANAGER) → staff sign-in. NO register session — this
 * file never settles money. Reservation config: advanceBookingDays 30,
 * minNoticeMinutes 0, ONE service period (a specific weekday, 12:00-14:00,
 * paced maxPartiesPerSlot:5 — a period needs a cap for `onlineBookingEnabled`
 * to accept at all, task-2's RESERVATION_PACING_REQUIRED finding) — then
 * `onlineBookingEnabled: true`.
 *
 * Booking times for every public-create test are pulled LIVE from
 * `getPublicAvailabilityRaw`'s own returned `scheduledAt` rather than
 * hand-computed — STRICT (public) mode validates the exact instant against
 * the restaurant's resolved LOCAL timezone/grid, and reusing a slot the
 * server itself just offered sidesteps computing that timezone by hand.
 *
 * Response envelope: every owner/tablet route wraps in {success, data,
 * message} (`unwrap()`); public routes do the SAME (confirmed against
 * `publicReservationController.ts`) — `unwrap()` covers both.
 *
 * Discrepancy from the brief, confirmed against source (server is
 * authority — see task-3-report.md): the brief describes the manage-cancel
 * repeat-DELETE and cancel-after-seated refusals as 400
 * RESERVATION_INVALID_TRANSITION, matching the owner/tablet status-transition
 * surface. `cancelPublicReservationManageHandler`'s own comment states this
 * is DELIBERATE: the public manage page calls it a 409 conflict-with-current-
 * state, not a malformed request. TC-422/423 assert the actual 409.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  setOwnerPosPin,
  tabletStaffSignIn,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  putReservationSettingsOwnerRaw,
  createReservationServicePeriodOwnerRaw,
  createReservationDateOverrideOwnerRaw,
  createTableOwnerRaw,
  createReservationTabletRaw,
  notifyReservationTabletRaw,
  reservationStatusTabletRaw,
  seatReservationTabletRaw,
  getPublicAvailabilityRaw,
  createPublicReservationRaw,
  getManagedReservationRaw,
  cancelManagedReservationRaw,
  setRestaurantPublishedApi,
  type TabletDevice,
  type ApiMenuItem,
  getPublicAvailabilityDaysRaw,
  listReservationsOwnerRaw,
  getTurnInsightsOwnerRaw,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const ITEM_PRICE = 10;

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

const errorCode = (body: unknown): string =>
  body && typeof body === "object" && "errorCode" in body
    ? String((body as { errorCode: unknown }).errorCode)
    : "";

/** Every route in this file wraps its success payload in {success, data,
 *  message} — pull the real payload out. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("POS — Waitlist & Public Reservation Booking", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  /** Throwaway tenant owner (createSecondOwner). */
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let groupId = "";
  let item: ApiMenuItem;
  let device: TabletDevice | undefined;
  let tabletToken = "";
  let staffSession = "";
  /** Publish state before beforeAll published it (restored in afterAll —
   *  matters only when OWNER2_EMAIL pins a persistent restaurant). */
  let wasPublished: boolean | null = null;

  /** availDate: a future weekday (YYYY-MM-DD) matching the ONE 12:00-14:00
   *  period created in beforeAll. closedDate: the SAME weekday exactly one
   *  week later, closed by a ReservationDateOverride (TC-420). */
  const addDaysISO = (days: number): string => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const availDate = addDaysISO(3);
  const closedDate = addDaysISO(10);
  // Mirrors the backend's own dayOfWeekFor: Date.UTC on the DATE STRING's
  // own calendar parts — timezone-independent, since a YYYY-MM-DD string's
  // weekday never depends on a clock offset.
  const dayOfWeekOf = (dateISO: string): number => {
    const parts = dateISO.split("-").map(Number);
    const y = parts[0] ?? 1970;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  };

  let phoneSeq = 1000;
  const runFrag = parseInt(runId.slice(0, 4), 16) % 1000;
  /** Unique 10-digit guest phone per call — SMS throttle 5/hr/phone + a
   *  per-phone open-reservations cap. */
  const nextGuestPhone = (): string => {
    phoneSeq += 1;
    // The exchange (digits 4-6) must not start with 0/1 — the backend's
    // normalizeGuestPhone rejects a non-NANP number as "phone required".
    return `555${200 + (runFrag % 800)}${String(phoneSeq).padStart(4, "0")}`;
  };

  /** A fresh bookable slot's exact scheduledAt for `date`, pulled from the
   *  server's own availability computation. */
  const freshSlot = async (date: string): Promise<string> => {
    const avail = await getPublicAvailabilityRaw(restaurantId, date, 2);
    expect(avail.status, msg(avail.data)).toBe(200);
    const slots = unwrap(avail).slots as {
      time: string;
      scheduledAt: string;
    }[];
    expect(slots.length, `no bookable slots on ${date}`).toBeGreaterThan(0);
    return slots[0]!.scheduledAt;
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
        "[waitlist-public] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    // Preview mode (restaunax 04d3c8d0e): an unpublished restaurant refuses
    // public bookings outright ("in preview mode and hasn't been published
    // yet"), so a fresh tenant must be published the way the dashboard's
    // Publish page does it before any public-create case can reach the
    // reservation rules these tests pin.
    wasPublished = (
      await setRestaurantPublishedApi(adminToken, restaurantId, true)
    ).previous;

    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });

    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[waitlist-public] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );

    groupId = (
      await createMenuGroupNamed(token, `Automation Wait ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Wait Burger ${runId}`,
      ITEM_PRICE
    );

    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Wait POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);

    const managerStaffMemberId = await setOwnerPosPin(
      token,
      restaurantId,
      "8462"
    );
    staffSession = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      "8462"
    );

    await putReservationSettingsOwnerRaw(token, restaurantId, {
      advanceBookingDays: 30,
      minNoticeMinutes: 0,
    });

    const period = await createReservationServicePeriodOwnerRaw(
      token,
      restaurantId,
      {
        name: `Public Window ${runId}`,
        dayOfWeek: dayOfWeekOf(availDate),
        startTime: "12:00",
        endTime: "14:00",
        slotIntervalMinutes: 15,
        maxPartiesPerSlot: 5,
        isActive: true,
      }
    );
    if (!period.ok)
      throw new Error(
        `[waitlist-public] could not create the public window period: ${msg(period.data)}`
      );

    // availDate and closedDate are exactly 7 days apart, so they share the
    // SAME dayOfWeek and both fall inside this one period.
    expect(dayOfWeekOf(availDate)).toBe(dayOfWeekOf(closedDate));

    // getAvailability's feasibility step (5) needs at least one bookable
    // table whose capacity fits partySize=2 — capacity is nullable and
    // NULL never matches its `gte` filter, so it must be set explicitly.
    // Without ANY feasible table/combination, every slot is skipped and
    // availability is unconditionally empty regardless of periods/pacing.
    // Since RestauNax 7b539a43e every active booking also HOLDS a table for
    // its whole duration, so one table is gone after the first booking —
    // seed one per pacing seat (maxPartiesPerSlot: 5) so the file's ~5
    // public bookings never run the floor dry.
    for (let i = 1; i <= 5; i++) {
      const bookable = await createTableOwnerRaw(token, restaurantId, {
        name: `Public Bookable ${i} ${runId}`,
        capacity: 4,
      });
      if (!bookable.ok)
        throw new Error(
          `[waitlist-public] could not create bookable table ${i}: ${msg(bookable.data)}`
        );
    }

    const online = await putReservationSettingsOwnerRaw(token, restaurantId, {
      onlineBookingEnabled: true,
    });
    if (!online.ok)
      throw new Error(
        `[waitlist-public] could not enable online booking: ${msg(online.data)}`
      );
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshOwnerToken().catch(() => token);
    // Best-effort: the restaurant is about to be archived regardless, so a
    // failed revoke here is not worth surfacing as a test failure.
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    // Best-effort: the throwaway restaurant these belong to is archived
    // below regardless — a stray menu item/group orphaned by a failed
    // delete here is harmless, and a teardown failure would only mask the
    // test results above.
    if (item)
      await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    if (wasPublished === false && process.env.OWNER2_EMAIL)
      await setRestaurantPublishedApi(adminToken, restaurantId, false).catch(
        () => {}
      );
    // Best-effort: a failed archive orphans a harmless throwaway tenant
    // rather than masking the test results above with a teardown failure.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Waitlist & Public Booking");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test("TC-418: waitlist add defaults to kind WAITLIST and requires a phone", async () => {
    await allure.description(
      "POST /api/tablet/reservations with no `kind` defaults to WAITLIST " +
        "(source WALK_IN); quotedWaitMinutes round-trips. Omitting guestPhone " +
        "→ 400 RESERVATION_PHONE_REQUIRED (phone is required for BOTH kinds, " +
        "enforced once inside createReservationRow)."
    );
    const added = await createReservationTabletRaw(tabletToken, staffSession, {
      partySize: 2,
      guestName: `Waitlist Add ${runId}`,
      guestPhone: nextGuestPhone(),
      quotedWaitMinutes: 15,
    });
    expect(added.status, msg(added.data)).toBe(201);
    const data = unwrap(added);
    expect(data.kind).toBe("WAITLIST");
    expect(data.quotedWaitMinutes).toBe(15);

    const noPhone = await createReservationTabletRaw(
      tabletToken,
      staffSession,
      {
        partySize: 2,
        guestName: `No Phone ${runId}`,
      }
    );
    expect(noPhone.status, msg(noPhone.data)).toBe(400);
    expect(errorCode(noPhone.data)).toBe("RESERVATION_PHONE_REQUIRED");
  });

  test("TC-419: notify flips a BOOKED waitlist entry to NOTIFIED with an expiry stamped", async () => {
    await allure.description(
      "POST .../reservations/:id/notify on a BOOKED waitlist entry → 200, " +
        "status NOTIFIED, notifyExpiresAt set (now + " +
        "waitlistNotifyTimeoutMinutes). Delivery is NOT asserted — QA SMS is " +
        "log-only by design."
    );
    const added = await createReservationTabletRaw(tabletToken, staffSession, {
      partySize: 2,
      guestName: `Notify Me ${runId}`,
      guestPhone: nextGuestPhone(),
    });
    expect(added.status, msg(added.data)).toBe(201);
    const id = unwrap(added).id;

    const notified = await notifyReservationTabletRaw(
      tabletToken,
      staffSession,
      id
    );
    expect(notified.status, msg(notified.data)).toBe(200);
    const data = unwrap(notified);
    expect(data.status).toBe("NOTIFIED");
    expect(data.notifyExpiresAt).toBeTruthy();
  });

  test("TC-420: public availability reflects config — window-clipped slots, empty+closed on an overridden date", async () => {
    await allure.description(
      "GET .../reservation-availability for a date matching the ONE " +
        "12:00-14:00 period returns slots ONLY inside that window (every " +
        'slot.time in ["12:00","14:00")). A ReservationDateOverride ' +
        "closing a date on the SAME weekday → 200 with an EMPTY slots array " +
        "and closed:true (not an error status — getAvailability's own " +
        "contract, confirmed against source)."
    );
    const avail = await getPublicAvailabilityRaw(restaurantId, availDate, 2);
    expect(avail.status, msg(avail.data)).toBe(200);
    const availData = unwrap(avail);
    expect(availData.closed).toBe(false);
    const slots = availData.slots as { time: string }[];
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.time >= "12:00" && slot.time < "14:00", slot.time).toBe(true);
    }

    const override = await createReservationDateOverrideOwnerRaw(
      token,
      restaurantId,
      { date: closedDate, closed: true, note: "TC-420 closed" }
    );
    expect(override.status, msg(override.data)).toBe(201);

    const closedAvail = await getPublicAvailabilityRaw(
      restaurantId,
      closedDate,
      2
    );
    expect(closedAvail.status, msg(closedAvail.data)).toBe(200);
    const closedData = unwrap(closedAvail);
    expect(closedData.closed).toBe(true);
    expect((closedData.slots as unknown[]).length).toBe(0);
  });

  test("TC-421: public create happy path returns a manage link; the manage view is public-safe", async () => {
    await allure.description(
      "POST .../reservations (public, no auth) → 201, confirmationCode + " +
        "manageUrl carrying the manage token. GET the manage view with that " +
        "token → 200, a public-safe projection (status/scheduledAt/" +
        "partySize/guestName/restaurantName/cancellable/confirmationCode) " +
        "with NO internalNotes field at all."
    );
    const scheduledAt = await freshSlot(availDate);
    const created = await createPublicReservationRaw(restaurantId, {
      guestName: `Public Guest ${runId}`,
      guestPhone: nextGuestPhone(),
      partySize: 2,
      scheduledAt,
    });
    expect(created.status, msg(created.data)).toBe(201);
    const createdData = unwrap(created);
    expect(createdData.confirmationCode).toBeTruthy();
    expect(createdData.manageUrl).toBeTruthy();
    const manageToken = String(createdData.manageUrl).split("/").pop()!;

    const managed = await getManagedReservationRaw(manageToken);
    expect(managed.status, msg(managed.data)).toBe(200);
    const managedData = unwrap(managed);
    expect(managedData.status).toBe("BOOKED");
    expect(managedData.confirmationCode).toBe(createdData.confirmationCode);
    expect(managedData.cancellable).toBe(true);
    expect("internalNotes" in managedData).toBe(false);
    expect("guestPhone" in managedData).toBe(false);
    expect("manageToken" in managedData).toBe(false);
  });

  test("TC-422: manage cancel — DELETE cancels once; a repeat DELETE is a 409 conflict, not a 400", async () => {
    await allure.description(
      "DELETE .../manage/:manageToken on a BOOKED reservation → 200, status " +
        "CANCELLED. A SECOND DELETE on the now-terminal reservation → 409 " +
        "RESERVATION_INVALID_TRANSITION — the manage-cancel handler uses 409 " +
        "deliberately (its own comment: a stale manage page reload is a " +
        "conflict with current state, not a malformed request), diverging " +
        "from the brief's assumed 400."
    );
    const scheduledAt = await freshSlot(availDate);
    const created = unwrap(
      await createPublicReservationRaw(restaurantId, {
        guestName: `Cancel Once ${runId}`,
        guestPhone: nextGuestPhone(),
        partySize: 2,
        scheduledAt,
      })
    );
    const manageToken = String(created.manageUrl).split("/").pop()!;

    const cancelled = await cancelManagedReservationRaw(manageToken);
    expect(cancelled.status, msg(cancelled.data)).toBe(200);
    expect(unwrap(cancelled).status).toBe("CANCELLED");

    const again = await cancelManagedReservationRaw(manageToken);
    expect(again.status, msg(again.data)).toBe(409);
    expect(errorCode(again.data)).toBe("RESERVATION_INVALID_TRANSITION");
  });

  test("TC-423: cancel-after-seated is refused — PUBLIC may only cancel from BOOKED/CONFIRMED", async () => {
    await allure.description(
      "Book publicly, then arrive + seat on the tablet (ARRIVED then " +
        "SEATED) — the manage DELETE now hits PUBLIC_ALLOWED_SOURCES' " +
        "source-scoping (CANCELLED only legal from BOOKED/CONFIRMED for " +
        "actor PUBLIC) → 409 RESERVATION_INVALID_TRANSITION, same divergence " +
        "from the brief's 400 as TC-422."
    );
    const table = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Seated Cancel ${runId}`,
      })
    );
    const scheduledAt = await freshSlot(availDate);
    const created = unwrap(
      await createPublicReservationRaw(restaurantId, {
        guestName: `Seated Cancel ${runId}`,
        guestPhone: nextGuestPhone(),
        partySize: 2,
        scheduledAt,
      })
    );
    const manageToken = String(created.manageUrl).split("/").pop()!;

    const arrived = await reservationStatusTabletRaw(
      tabletToken,
      staffSession,
      created.reservationId,
      "arrive"
    );
    expect(arrived.status, msg(arrived.data)).toBe(200);

    const seated = await seatReservationTabletRaw(
      tabletToken,
      staffSession,
      created.reservationId,
      { tableIds: [table.id] }
    );
    expect(seated.status, msg(seated.data)).toBe(201);

    const attempt = await cancelManagedReservationRaw(manageToken);
    expect(attempt.status, msg(attempt.data)).toBe(409);
    expect(errorCode(attempt.data)).toBe("RESERVATION_INVALID_TRANSITION");
  });

  test("TC-424: per-phone cap — a second future booking on the same phone is refused", async () => {
    await allure.description(
      "With maxOpenReservationsPerPhone:1, the SAME phone booking a second " +
        "future slot → 409 RESERVATION_MAX_OPEN_REACHED (the first booking " +
        "still counts as an open reservation on that phone)."
    );
    const capped = await putReservationSettingsOwnerRaw(token, restaurantId, {
      maxOpenReservationsPerPhone: 1,
    });
    expect(capped.status, msg(capped.data)).toBe(200);

    const guestPhone = nextGuestPhone();
    const first = await createPublicReservationRaw(restaurantId, {
      guestName: `Cap One ${runId}`,
      guestPhone,
      partySize: 2,
      scheduledAt: await freshSlot(availDate),
    });
    expect(first.status, msg(first.data)).toBe(201);

    const second = await createPublicReservationRaw(restaurantId, {
      guestName: `Cap Two ${runId}`,
      guestPhone,
      partySize: 2,
      scheduledAt: await freshSlot(availDate),
    });
    expect(second.status, msg(second.data)).toBe(409);
    expect(errorCode(second.data)).toBe("RESERVATION_MAX_OPEN_REACHED");
  });

  test("TC-425: the public gate — flipping onlineBookingEnabled off refuses create, restored in finally", async () => {
    await allure.description(
      "With TABLE_RESERVATIONS granted but onlineBookingEnabled:false, " +
        "public create → 403 RESERVATIONS_NOT_ENABLED (the SAME code the " +
        "entitlement-missing case uses — a satellite client hides the " +
        "booking widget on one code regardless of which half of the gate " +
        "failed). Restored ON in `finally`."
    );
    try {
      const off = await putReservationSettingsOwnerRaw(token, restaurantId, {
        onlineBookingEnabled: false,
      });
      expect(off.status, msg(off.data)).toBe(200);

      const attempt = await createPublicReservationRaw(restaurantId, {
        guestName: `Gate Off ${runId}`,
        guestPhone: nextGuestPhone(),
        partySize: 2,
        scheduledAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      });
      expect(attempt.status, msg(attempt.data)).toBe(403);
      expect(errorCode(attempt.data)).toBe("RESERVATIONS_NOT_ENABLED");
    } finally {
      await putReservationSettingsOwnerRaw(token, restaurantId, {
        onlineBookingEnabled: true,
      }).catch((err) =>
        console.warn("[TC-425] could not restore onlineBookingEnabled:", err)
      );
    }
  });
  // ── Date strip + booking source (2026-10) ───────────────────────────────

  test("TC-742: date strip — available on the booking-window weekday, closed on the override, no_service on other weekdays, passed in the past", async () => {
    await allure.description(
      "GET .../reservation-availability/days?from=availDate&to=closedDate" +
        "&partySize=2 → one entry per date in order (8 days): availDate " +
        "'available', closedDate 'closed' (TC-420's override), every other " +
        "weekday 'no_service' (the only period is availDate's weekday). " +
        "`today` and `lastBookableDate` are YYYY-MM-DD. Two and three days " +
        "ago → 'passed' (a past date is passed even with no service)."
    );
    const res = await getPublicAvailabilityDaysRaw(restaurantId, {
      from: availDate,
      to: closedDate,
      partySize: 2,
    });
    expect(res.status, msg(res.data)).toBe(200);
    const strip = unwrap(res);
    expect(strip.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(strip.lastBookableDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = strip.days as { date: string; status: string }[];
    expect(days.map((d) => d.date)).toEqual(
      Array.from({ length: 8 }, (_, i) => addDaysISO(3 + i))
    );
    for (const day of days) {
      const expected =
        day.date === availDate
          ? "available"
          : day.date === closedDate
            ? "closed"
            : "no_service";
      expect(day.status, day.date).toBe(expected);
    }

    const past = await getPublicAvailabilityDaysRaw(restaurantId, {
      from: addDaysISO(-3),
      to: addDaysISO(-2),
      partySize: 2,
    });
    expect(past.status, msg(past.data)).toBe(200);
    for (const day of unwrap(past).days as { status: string }[])
      expect(day.status).toBe("passed");
  });

  test("TC-743: date strip validation — to before from, more than 31 days, an impossible date and party size 0 are all 400", async () => {
    await allure.description(
      "Every malformed query → 400 SYSTEM_VALIDATION_ERROR: to < from, a " +
        "32-day range (max 31), 2026-02-30, and partySize 0. A 31-day range " +
        "is fine (200, 31 entries)."
    );
    const bad = [
      { from: closedDate, to: availDate, partySize: 2 },
      { from: addDaysISO(1), to: addDaysISO(32), partySize: 2 },
      { from: "2026-02-30", to: "2026-03-02", partySize: 2 },
      { from: availDate, to: closedDate, partySize: 0 },
    ];
    for (const query of bad) {
      const res = await getPublicAvailabilityDaysRaw(restaurantId, query);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(errorCode(res.data)).toBe("SYSTEM_VALIDATION_ERROR");
    }
    const max = await getPublicAvailabilityDaysRaw(restaurantId, {
      from: addDaysISO(1),
      to: addDaysISO(31),
      partySize: 2,
    });
    expect(max.status, msg(max.data)).toBe(200);
    expect((unwrap(max).days as unknown[]).length).toBe(31);
  });

  test("TC-744: booking source — the customer app's MOBILE is recorded, anything else from a public booking lands as WEB, and insights count them", async () => {
    await allure.description(
      "Public create with `source: 'MOBILE'` → the owner's list shows " +
        "source MOBILE; with `source: 'PHONE'` (staff-only, never accepted " +
        "publicly) → WEB; with no source → WEB. The owner's turn insights " +
        "`bookingSources` count MOBILE ≥ 1 and WEB ≥ 2."
    );
    const cases = [
      { label: "Mobile", source: "MOBILE", expected: "MOBILE" },
      { label: "Spoofed", source: "PHONE", expected: "WEB" },
      { label: "Website", source: undefined, expected: "WEB" },
    ];
    for (const c of cases) {
      const created = await createPublicReservationRaw(restaurantId, {
        guestName: `Source ${c.label} ${runId}`,
        guestPhone: nextGuestPhone(),
        partySize: 2,
        scheduledAt: await freshSlot(availDate),
        ...(c.source ? { source: c.source } : {}),
      });
      expect(created.status, msg(created.data)).toBe(201);
    }

    const list = await listReservationsOwnerRaw(token, restaurantId, {
      date: availDate,
    });
    expect(list.status, msg(list.data)).toBe(200);
    const rows = unwrap(list) as { guestName: string; source: string }[];
    for (const c of cases) {
      const row = rows.find(
        (r) => r.guestName === `Source ${c.label} ${runId}`
      );
      expect(row, `${c.label} booking should be listed`).toBeTruthy();
      expect(row!.source, c.label).toBe(c.expected);
    }

    const insights = await getTurnInsightsOwnerRaw(token, restaurantId, 7);
    expect(insights.status, msg(insights.data)).toBe(200);
    const sources = unwrap(insights).bookingSources;
    expect(sources.MOBILE).toBeGreaterThanOrEqual(1);
    expect(sources.WEB).toBeGreaterThanOrEqual(2);
  });
});
