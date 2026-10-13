/**
 * 09-table-hold.spec.ts — Manual table HOLD for a booking + editing a booking
 * from the host stand (tablet API level). Feature: backend 2026-10-12
 * (`reservationHold.ts`, `reservationTableAssignService.ts`,
 * `tableHeldResponse.ts`, `updateTabletReservationHandler`).
 *
 * The rules under test (docs/features/TABLE_RESERVATIONS.md → "Manual table
 * hold"):
 *   - A booking never blocks a table on its own. From its arrival alert
 *     (scheduledAt − reservedSoonLeadMinutes, default 30) a host may HOLD a
 *     table for it: POST /api/tablet/reservations/:id/tables {tableIds}.
 *     Earlier → 409 RESERVATION_HOLD_TOO_EARLY; `tableIds: []` releases.
 *   - A held table is refused with 409 TABLE_HELD — no override — by:
 *     walk-in seat, seating another booking or a joined party, create-order
 *     on a table nobody is at, and moving a check onto it. The party still
 *     sitting at a held table may open its own check; the held booking's own
 *     create-order is let through. Join suggestions skip held tables.
 *   - Two bookings can't hold the same table over overlapping times (409
 *     RESERVATION_CONFLICT); a table too small for the party → 409
 *     RESERVATION_TABLES_TOO_SMALL unless the staff member holds
 *     OVERRIDE_RESERVATION_CONFLICT; only an upcoming RESERVATION can hold
 *     (400 RESERVATION_NOT_ASSIGNABLE otherwise).
 *   - `keep` stamps Reservation.tableHoldKeptAt (409 RESERVATION_NOT_HOLDING
 *     when nothing is held); changing the held tables clears it.
 *   - PATCH /api/tablet/reservations/:id edits a BOOKED/CONFIRMED booking;
 *     a move into the past is refused; moving the time releases the hold.
 *
 * Own tenant, same shape as 06-reservations-lifecycle: an admin-minted
 * throwaway OWNER (`createSecondOwner`) + TABLE_RESERVATIONS entitlement +
 * tableServiceEnabled, a REGISTER device, the owner's MANAGER PIN session and
 * a minted STAFF-role member (HOST_MANAGE_RESERVATIONS only, no
 * OVERRIDE_RESERVATION_CONFLICT). No register session — every check opened
 * here is cancelled, never settled.
 *
 * Time: every hold-able booking is "now + 20 min" (inside the default
 * 30-minute window); a "too early" one is "now + 3 h". Owner phone bookings
 * are ADVISORY, so arbitrary instants are fine (06's TC-413 does the same).
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId, generateGuestPhone } from "../../utils/testData";
import { localDateKey } from "../../utils/dealSchedule";
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
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  createPinStaffTabletRaw,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  createTableOwnerRaw,
  createTableCombinationOwnerRaw,
  getFloorRaw,
  putReservationSettingsOwnerRaw,
  createReservationServicePeriodOwnerRaw,
  createReservationOwnerRaw,
  patchReservationOwnerRaw,
  createReservationTabletRaw,
  getHostRaw,
  reservationStatusTabletRaw,
  seatReservationTabletRaw,
  holdReservationTablesTabletRaw,
  keepReservationHoldTabletRaw,
  updateReservationTabletRaw,
  seatWalkInTabletRaw,
  seatPartyTabletRaw,
  getJoinSuggestionsTabletRaw,
  transferTabTableRaw,
  getRestaurantTimeZonePublic,
  putOwnerPushTokenRaw,
  deleteOwnerPushTokenRaw,
  type TabletDevice,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const ITEM_PRICE = 10;
const MINUTE = 60 * 1000;

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

const errorCode = (body: unknown): string =>
  body && typeof body === "object" && "errorCode" in body
    ? String((body as { errorCode: unknown }).errorCode)
    : "";

/** Every route here wraps its success payload in {success, data, message}. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("POS — Manual Table Hold & Host-Stand Booking Edit", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let groupId = "";
  let item: ApiMenuItem;
  let device: TabletDevice | undefined;
  let tabletToken = "";
  /** The MANAGER (owner PIN) session — holds OVERRIDE_RESERVATION_CONFLICT. */
  let managerSession = "";
  let managerStaffMemberId = "";
  const managerPin = "8462";
  let staffMemberId = "";
  const staffPin = "1357";
  /** Every check this file opens — cancelled in afterAll if still open. */
  const openedOrderIds: string[] = [];
  /** Every booking this file makes — cancelled in afterAll (frees holds and
   *  the per-phone open-booking cap). */
  const bookingIds: string[] = [];

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  let phoneSeq = 2000;
  const nextGuestPhone = (): string => {
    phoneSeq += 1;
    return generateGuestPhone(runId, phoneSeq);
  };

  const at = (minutesFromNow: number) =>
    new Date(Date.now() + minutesFromNow * MINUTE).toISOString();

  /** Owner phone booking (ADVISORY) — tracked for afterAll cleanup. */
  const book = async (
    label: string,
    minutesFromNow: number,
    partySize = 2
  ): Promise<{ id: string; scheduledAt: string }> => {
    const res = await createReservationOwnerRaw(token, restaurantId, {
      partySize,
      scheduledAt: at(minutesFromNow),
      guestName: `${label} ${runId}`,
      guestPhone: nextGuestPhone(),
    });
    expect(res.status, msg(res.data)).toBe(201);
    const row = unwrap(res);
    bookingIds.push(row.id);
    return row;
  };

  const newTable = async (label: string, capacity = 4) =>
    unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `${label} ${runId}`,
        capacity,
      })
    ) as { id: string; name: string };

  const hold = (reservationId: string, tableIds: string[], session = "") =>
    holdReservationTablesTabletRaw(
      tabletToken,
      session || managerSession,
      reservationId,
      tableIds
    );

  const floorRow = async (tableId: string) =>
    (unwrap(await getFloorRaw(tabletToken)).tables as any[]).find(
      (t) => t.table.id === tableId
    );

  /** The restaurant's own timezone (resolved in beforeAll; the backend's
   *  America/New_York default when the tenant has none). */
  let timeZone = "America/New_York";
  /** GET /host is per restaurant-LOCAL day — ask for the booking's own day,
   *  never "today", so an evening run whose "now + N min" crosses local
   *  midnight still finds it. */
  const hostDate = (scheduledAt: string) =>
    localDateKey(timeZone, 0, new Date(scheduledAt));
  const hostList = async (scheduledAt: string, session = ""): Promise<any[]> =>
    unwrap(
      await getHostRaw(
        tabletToken,
        session || managerSession,
        hostDate(scheduledAt)
      )
    ) as any[];
  const hostRow = async (booking: { id: string; scheduledAt: string }) =>
    (await hostList(booking.scheduledAt)).find((r) => r.id === booking.id);

  /** Open a table-service check on `tableId` (tracked for cleanup). */
  const openCheck = async (
    tableId: string,
    extra: Record<string, unknown> = {}
  ) => {
    const res = await createTabletOrderRaw(tabletToken, managerSession, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: ITEM_PRICE,
      tax: 0,
      tip: 0,
      total: ITEM_PRICE,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: 1,
          price: ITEM_PRICE,
        },
      ],
      openCheck: true,
      tableId,
      ...extra,
    });
    if (res.ok && res.data.id) openedOrderIds.push(res.data.id);
    return res;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[table-hold] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;
    timeZone = (await getRestaurantTimeZonePublic(restaurantId)) || timeZone;

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
        `[table-hold] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );

    groupId = (
      await createMenuGroupNamed(token, `Automation Hold ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Hold Burger ${runId}`,
      ITEM_PRICE
    );

    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Hold POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);
    managerStaffMemberId = await setOwnerPosPin(
      token,
      restaurantId,
      managerPin
    );
    managerSession = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );

    const staffCreate = await createPinStaffTabletRaw(
      tabletToken,
      managerSession,
      {
        firstName: "Auto",
        lastName: `Holder${runId}`,
        pin: staffPin,
        staffRole: "STAFF",
      }
    );
    if (!staffCreate.ok)
      throw new Error(
        `[table-hold] could not mint STAFF member: ${msg(staffCreate.data)}`
      );
    staffMemberId = unwrap(staffCreate).id;

    // Default reservedSoonLeadMinutes (30) is what the "now + 20 min" /
    // "now + 3 h" split relies on — pinned explicitly so a changed default
    // can't silently move the window.
    const settings = await putReservationSettingsOwnerRaw(token, restaurantId, {
      advanceBookingDays: 30,
      minNoticeMinutes: 0,
      reservedSoonLeadMinutes: 30,
    });
    if (!settings.ok)
      throw new Error(
        `[table-hold] could not save reservation settings: ${msg(settings.data)}`
      );

    // Full-day booking hours on every weekday (no pacing caps) — parity with
    // 06's setup so "now + N min" always lands inside a period.
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
          isActive: true,
        }
      );
      if (!period.ok)
        throw new Error(
          `[table-hold] could not create day ${dayOfWeek} period: ${msg(period.data)}`
        );
    }
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const orderId of openedOrderIds) {
      try {
        const read = await getOrderFullRaw(await freshOwnerToken(), orderId);
        const status = String(read.data?.status ?? "");
        if (!read.ok || status === "CANCELLED" || status === "REFUNDED")
          continue;
        await cancelTabletOrderRaw(
          tabletToken,
          managerSession,
          orderId,
          "Automation cleanup"
        );
      } catch (err) {
        // Best-effort: the tenant is archived below regardless.
        console.warn(`[table-hold] cleanup failed for ${orderId}:`, err);
      }
    }
    for (const id of bookingIds) {
      // Best-effort: terminal bookings refuse cancel, which is fine.
      await reservationStatusTabletRaw(
        tabletToken,
        managerSession,
        id,
        "cancel"
      ).catch(() => {});
    }
    const t = await freshOwnerToken().catch(() => token);
    // Best-effort teardown — the throwaway restaurant is archived regardless,
    // and a teardown failure must not mask the results above.
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    if (item)
      await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Table Hold");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  // ── The hold itself ─────────────────────────────────────────────────────

  test("TC-713: host list carries the hold — tableIds, holdOpensAt = scheduledAt − 30 min, holdLateAt = scheduledAt + 10 min, arrivalAlertMinutes", async () => {
    await allure.description(
      "GET /api/tablet/host rows carry the hold fields the host board " +
        "needs: `tableIds` (empty before, the held table after), " +
        "`holdOpensAt` (scheduledAt − reservedSoonLeadMinutes), `holdLateAt` " +
        "(scheduledAt + 10 min) and `tableHoldKeptAt` (null until a keep). " +
        "The response's `arrivalAlertMinutes` echoes the lead (30). A hold " +
        "for a booking ~3 h out is refused 409 RESERVATION_HOLD_TOO_EARLY " +
        "with no table assigned."
    );
    const table = await newTable("Host Hold");
    const soon = await book("Host Soon", 20);
    const later = await book("Host Later", 180);

    const before = await hostRow(soon);
    expect(before, "booking should be on today's host list").toBeTruthy();
    expect(before.tableIds).toEqual([]);

    const tooEarly = await hold(later.id, [table.id]);
    expect(tooEarly.status, msg(tooEarly.data)).toBe(409);
    expect(errorCode(tooEarly.data)).toBe("RESERVATION_HOLD_TOO_EARLY");

    const held = await hold(soon.id, [table.id]);
    expect(held.status, msg(held.data)).toBe(200);

    const host = await getHostRaw(
      tabletToken,
      managerSession,
      hostDate(soon.scheduledAt)
    );
    expect(host.status, msg(host.data)).toBe(200);
    expect((host.data as any).arrivalAlertMinutes).toBe(30);
    const row = (unwrap(host) as any[]).find((r) => r.id === soon.id);
    expect(row.tableIds).toEqual([table.id]);
    const scheduled = new Date(soon.scheduledAt).getTime();
    expect(new Date(row.holdOpensAt).getTime()).toBe(scheduled - 30 * MINUTE);
    expect(new Date(row.holdLateAt).getTime()).toBe(scheduled + 10 * MINUTE);
    expect(row.tableHoldKeptAt ?? null).toBeNull();

    expect((await hostRow(later)).tableIds).toEqual([]);
  });

  test("TC-714: a held table refuses a walk-in seat with 409 TABLE_HELD, even for a MANAGER; released, the same seat succeeds", async () => {
    await allure.description(
      "POST /api/tablet/tables/:id/seat {guestCount} on a table held for a " +
        "booking → 409 TABLE_HELD (not overridable — the MANAGER session is " +
        "used on purpose). The table stays AVAILABLE with its `reservedSoon` " +
        "annotation. After the host releases the hold (`tableIds: []`) the " +
        "walk-in seats and the table reads SEATED."
    );
    const table = await newTable("Walk Held");
    const soon = await book("Walk Soon", 20);
    expect((await hold(soon.id, [table.id])).status).toBe(200);

    const refused = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      table.id,
      2
    );
    expect(refused.status, msg(refused.data)).toBe(409);
    expect(errorCode(refused.data)).toBe("TABLE_HELD");
    const row = await floorRow(table.id);
    expect(row?.state).toBe("AVAILABLE");
    expect(row?.reservedSoon?.id).toBe(soon.id);

    expect((await hold(soon.id, [])).status).toBe(200);
    const seated = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      table.id,
      2
    );
    expect(seated.status, msg(seated.data)).toBe(200);
    expect(unwrap(seated).guestCount).toBe(2);
    expect((await floorRow(table.id))?.state).toBe("SEATED");
  });

  test("TC-715: seating a joined party across a held table → 409 TABLE_HELD; nothing is seated", async () => {
    await allure.description(
      "POST /api/tablet/tables/seat-party {tableIds:[held, free], " +
        "guestCount} → 409 TABLE_HELD. Neither table changes state — the " +
        "free one stays AVAILABLE (the refusal is all-or-nothing)."
    );
    const heldTable = await newTable("Party Held");
    const freeTable = await newTable("Party Free");
    const soon = await book("Party Soon", 20);
    expect((await hold(soon.id, [heldTable.id])).status).toBe(200);

    const refused = await seatPartyTabletRaw(tabletToken, managerSession, {
      tableIds: [heldTable.id, freeTable.id],
      guestCount: 6,
    });
    expect(refused.status, msg(refused.data)).toBe(409);
    expect(errorCode(refused.data)).toBe("TABLE_HELD");
    expect((await floorRow(freeTable.id))?.state).toBe("AVAILABLE");
    expect((await floorRow(heldTable.id))?.state).toBe("AVAILABLE");
  });

  test("TC-716: seating a DIFFERENT booking on a held table → 409 TABLE_HELD; the held booking's own seat succeeds", async () => {
    await allure.description(
      "POST /api/tablet/reservations/:other/seat onto the held table → 409 " +
        "TABLE_HELD (checked before the MANAGER's conflict override). The " +
        "booking the table is held for seats onto it normally (201, SEATED) " +
        "and the hold annotation is gone once the party sits."
    );
    const table = await newTable("Seat Held");
    const holder = await book("Seat Holder", 20);
    const other = await book("Seat Other", 25);
    expect((await hold(holder.id, [table.id])).status).toBe(200);

    const refused = await seatReservationTabletRaw(
      tabletToken,
      managerSession,
      other.id,
      { tableIds: [table.id] }
    );
    expect(refused.status, msg(refused.data)).toBe(409);
    expect(errorCode(refused.data)).toBe("TABLE_HELD");

    const own = await seatReservationTabletRaw(
      tabletToken,
      managerSession,
      holder.id,
      { tableIds: [table.id] }
    );
    expect(own.status, msg(own.data)).toBe(201);
    expect(unwrap(own).reservation.status).toBe("SEATED");
    const row = await floorRow(table.id);
    expect(row?.state).toBe("SEATED");
    expect(row?.reservedSoon).toBeFalsy();
  });

  test("TC-717: create-order on an EMPTY held table → 409 TABLE_HELD; the held booking's own check (its reservationId) is let through", async () => {
    await allure.description(
      "Opening a check on a held table nobody is sitting at → 409 " +
        "TABLE_HELD. The same create-order carrying the HELD booking's " +
        "reservationId is the seat flow's prefill — it is let through (201) " +
        "and links the booking (now SEATED)."
    );
    const table = await newTable("Order Held");
    const soon = await book("Order Soon", 20);
    expect((await hold(soon.id, [table.id])).status).toBe(200);

    const refused = await openCheck(table.id);
    expect(refused.status, msg(refused.data)).toBe(409);
    expect(errorCode(refused.data)).toBe("TABLE_HELD");

    const own = await openCheck(table.id, { reservationId: soon.id });
    expect(own.status, msg(own.data)).toBe(201);
    const reservation = unwrap(
      await patchReservationOwnerRaw(token, restaurantId, soon.id, {})
    );
    expect(reservation.status).toBe("SEATED");
    const row = await floorRow(table.id);
    expect(row?.state).toBe("OCCUPIED");
    expect(
      row?.openChecks?.some((c: any) => c.orderId === own.data.id),
      "the held booking's check should be open on the table"
    ).toBe(true);
  });

  test("TC-718: the party already sitting at a held table can still open its own (second) check", async () => {
    await allure.description(
      "A host may hold a BUSY table for when it frees: a check is open on " +
        "it (OCCUPIED), the host holds it for an upcoming booking, and the " +
        "seated party opens a second check — 201, because only a table " +
        "nobody is at refuses. The floor keeps OCCUPIED with the hold " +
        "annotation."
    );
    const table = await newTable("Busy Held");
    const first = await openCheck(table.id);
    expect(first.status, msg(first.data)).toBe(201);

    const soon = await book("Busy Soon", 20);
    expect((await hold(soon.id, [table.id])).status).toBe(200);

    const second = await openCheck(table.id);
    expect(second.status, msg(second.data)).toBe(201);
    const row = await floorRow(table.id);
    expect(row?.state).toBe("OCCUPIED");
    expect(row?.reservedSoon?.id).toBe(soon.id);
  });

  test("TC-719: moving a check onto a held table → 409 TABLE_HELD; the check stays where it was", async () => {
    await allure.description(
      "PATCH /api/tablet/orders/:id/tab/table {tableName: <held table>} — " +
        "moving a party there is seating them there, so it is refused 409 " +
        "TABLE_HELD and the order keeps its original table."
    );
    const from = await newTable("Move From");
    const to = await newTable("Move To");
    const soon = await book("Move Soon", 20);
    expect((await hold(soon.id, [to.id])).status).toBe(200);

    const opened = await openCheck(from.id);
    expect(opened.status, msg(opened.data)).toBe(201);
    const moved = await transferTabTableRaw(
      tabletToken,
      managerSession,
      opened.data.id!,
      to.name
    );
    expect(moved.status, msg(moved.data)).toBe(409);
    expect(errorCode(moved.data)).toBe("TABLE_HELD");
    const order = await getOrderFullRaw(token, opened.data.id!);
    expect(order.data.tableId).toBe(from.id);
  });

  test("TC-720: join suggestions skip a held table — a saved combination with it disappears while held, returns once released", async () => {
    await allure.description(
      "GET /api/tablet/tables/join-suggestions?partySize=6&tableId=<A> with " +
        "a saved combination A+B (capacity 8): before the hold it is " +
        "suggested (source SAVED); while A is held for a booking no " +
        "suggestion contains A; after release it is back."
    );
    const a = await newTable("Join A");
    const b = await newTable("Join B");
    const combo = await createTableCombinationOwnerRaw(token, restaurantId, {
      name: `Join Combo ${runId}`,
      capacity: 8,
      tableIds: [a.id, b.id],
    });
    expect(combo.status, msg(combo.data)).toBe(201);

    const suggestions = async () => {
      const res = await getJoinSuggestionsTabletRaw(
        tabletToken,
        managerSession,
        { partySize: 6, tableId: a.id }
      );
      expect(res.status, msg(res.data)).toBe(200);
      return unwrap(res).suggestions as {
        tableIds: string[];
        source: string;
      }[];
    };
    const hasCombo = (list: { tableIds: string[] }[]) =>
      list.some((s) => s.tableIds.includes(a.id) && s.tableIds.includes(b.id));

    const before = await suggestions();
    expect(hasCombo(before), JSON.stringify(before)).toBe(true);
    expect(before.find((s) => s.tableIds.includes(a.id))?.source).toBe("SAVED");

    const soon = await book("Join Soon", 20);
    expect((await hold(soon.id, [a.id])).status).toBe(200);
    const during = await suggestions();
    expect(
      during.some((s) => s.tableIds.includes(a.id)),
      JSON.stringify(during)
    ).toBe(false);

    expect((await hold(soon.id, [])).status).toBe(200);
    expect(hasCombo(await suggestions())).toBe(true);
  });

  // ── Assignment rules ────────────────────────────────────────────────────

  test("TC-721: hold refusals — overlapping booking on the same table 409, waitlist entry 400, undersized table 409 for STAFF but allowed for a MANAGER", async () => {
    await allure.description(
      "Booking #1 (now+20) holds table T; booking #2 (now+25, overlapping " +
        "the default 90-min duration) holding T → 409 RESERVATION_CONFLICT. " +
        "A WAITLIST entry can't hold anything → 400 " +
        "RESERVATION_NOT_ASSIGNABLE. A party of 4 on a 2-top → 409 " +
        "RESERVATION_TABLES_TOO_SMALL from the STAFF session (no " +
        "OVERRIDE_RESERVATION_CONFLICT); the MANAGER's same hold → 200."
    );
    const shared = await newTable("Overlap");
    const first = await book("Overlap One", 20);
    const second = await book("Overlap Two", 25);
    expect((await hold(first.id, [shared.id])).status).toBe(200);
    const overlap = await hold(second.id, [shared.id]);
    expect(overlap.status, msg(overlap.data)).toBe(409);
    expect(errorCode(overlap.data)).toBe("RESERVATION_CONFLICT");

    const wait = await createReservationTabletRaw(tabletToken, managerSession, {
      partySize: 2,
      guestName: `Hold Wait ${runId}`,
      guestPhone: nextGuestPhone(),
      quotedWaitMinutes: 10,
    });
    expect(wait.status, msg(wait.data)).toBe(201);
    bookingIds.push(unwrap(wait).id);
    const waitHold = await hold(unwrap(wait).id, [shared.id]);
    expect(waitHold.status, msg(waitHold.data)).toBe(400);
    expect(errorCode(waitHold.data)).toBe("RESERVATION_NOT_ASSIGNABLE");

    const twoTop = await newTable("Two Top", 2);
    const party4 = await book("Party Four", 20, 4);
    const staffSession = await tabletStaffSignIn(
      tabletToken,
      staffMemberId,
      staffPin
    );
    const tooSmall = await hold(party4.id, [twoTop.id], staffSession);
    expect(tooSmall.status, msg(tooSmall.data)).toBe(409);
    expect(errorCode(tooSmall.data)).toBe("RESERVATION_TABLES_TOO_SMALL");
    const overridden = await hold(party4.id, [twoTop.id], managerSession);
    expect(overridden.status, msg(overridden.data)).toBe(200);
  });

  test("TC-722: keep — 409 when nothing is held; stamps tableHoldKeptAt; moving the hold to another table clears it", async () => {
    await allure.description(
      "POST /reservations/:id/tables/keep on a booking holding nothing → " +
        "409 RESERVATION_NOT_HOLDING. Once it holds table A, keep → 200 with " +
        "tableHoldKeptAt (host row + floor `reservedSoon.holdKeptAt` agree). " +
        "Re-holding to table B clears the stamp — a moved hold is asked " +
        "about afresh."
    );
    const a = await newTable("Keep A");
    const b = await newTable("Keep B");
    const soon = await book("Keep Soon", 20);

    const nothing = await keepReservationHoldTabletRaw(
      tabletToken,
      managerSession,
      soon.id
    );
    expect(nothing.status, msg(nothing.data)).toBe(409);
    expect(errorCode(nothing.data)).toBe("RESERVATION_NOT_HOLDING");

    expect((await hold(soon.id, [a.id])).status).toBe(200);
    const kept = await keepReservationHoldTabletRaw(
      tabletToken,
      managerSession,
      soon.id
    );
    expect(kept.status, msg(kept.data)).toBe(200);
    const stamp = unwrap(kept).tableHoldKeptAt;
    expect(stamp).toBeTruthy();
    expect((await hostRow(soon)).tableHoldKeptAt).toBe(stamp);
    expect((await floorRow(a.id))?.reservedSoon?.holdKeptAt).toBe(stamp);

    const moved = await hold(soon.id, [b.id]);
    expect(moved.status, msg(moved.data)).toBe(200);
    const row = await hostRow(soon);
    expect(row.tableIds).toEqual([b.id]);
    expect(row.tableHoldKeptAt ?? null).toBeNull();
    expect((await floorRow(a.id))?.reservedSoon).toBeFalsy();
    expect((await floorRow(b.id))?.reservedSoon?.id).toBe(soon.id);
  });

  // ── Editing a booking from the host stand ───────────────────────────────

  test("TC-723: PATCH from the POS edits name, phone, party size and notes; the owner's read agrees", async () => {
    await allure.description(
      "PATCH /api/tablet/reservations/:id {guestName, guestPhone, " +
        "partySize, guestNotes, internalNotes} on a BOOKED reservation → " +
        "200 with the updated row; the owner dashboard's read of the same " +
        "booking shows the same values."
    );
    const booking = await book("Edit Me", 120);
    const newPhone = nextGuestPhone();
    const edited = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      {
        guestName: `Edited ${runId}`,
        guestPhone: newPhone,
        partySize: 5,
        guestNotes: "High chair",
        internalNotes: "Regular — booth if possible",
      }
    );
    expect(edited.status, msg(edited.data)).toBe(200);
    const row = unwrap(edited);
    expect(row.guestName).toBe(`Edited ${runId}`);
    expect(row.partySize).toBe(5);
    expect(row.guestNotes).toBe("High chair");
    expect(row.internalNotes).toBe("Regular — booth if possible");

    const owner = unwrap(
      await patchReservationOwnerRaw(token, restaurantId, booking.id, {})
    );
    expect(owner.guestName).toBe(`Edited ${runId}`);
    expect(owner.partySize).toBe(5);
    expect(owner.guestPhone).toBe(newPhone);
  });

  test("TC-724: moving a booking into the past from the POS → 400 RESERVATION_IN_PAST; the time is unchanged", async () => {
    await allure.description(
      "The host stand's edit sets refusePast: a scheduledAt earlier than " +
        "now → 400 RESERVATION_IN_PAST and nothing is written; a move to a " +
        "later future time succeeds."
    );
    const booking = await book("Past Move", 120);
    const past = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      { scheduledAt: at(-60) }
    );
    expect(past.status, msg(past.data)).toBe(400);
    expect(errorCode(past.data)).toBe("RESERVATION_IN_PAST");
    const unchanged = unwrap(
      await patchReservationOwnerRaw(token, restaurantId, booking.id, {})
    );
    expect(new Date(unchanged.scheduledAt).getTime()).toBe(
      new Date(booking.scheduledAt).getTime()
    );

    const later = at(150);
    const moved = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      { scheduledAt: later }
    );
    expect(moved.status, msg(moved.data)).toBe(200);
    expect(new Date(unwrap(moved).scheduledAt).getTime()).toBe(
      new Date(later).getTime()
    );
  });

  test("TC-725: moving a held booking's time releases its table; editing only the name keeps the hold", async () => {
    await allure.description(
      "A hold is for a party due now. Editing only the guest name keeps " +
        "the held table; moving scheduledAt (here +2 h) releases it — the " +
        "host row's tableIds go empty and the floor annotation disappears."
    );
    const table = await newTable("Edit Hold");
    const soon = await book("Edit Hold", 20);
    expect((await hold(soon.id, [table.id])).status).toBe(200);

    const renamed = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      soon.id,
      { guestName: `Edit Hold Renamed ${runId}` }
    );
    expect(renamed.status, msg(renamed.data)).toBe(200);
    expect((await hostRow(soon)).tableIds).toEqual([table.id]);

    const moved = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      soon.id,
      { scheduledAt: at(140) }
    );
    expect(moved.status, msg(moved.data)).toBe(200);
    const row = await floorRow(table.id);
    expect(row?.reservedSoon).toBeFalsy();
    // Look the booking up on its NEW local day.
    const host = await hostRow(unwrap(moved));
    expect(host, "moved booking should be on its new day's list").toBeTruthy();
    expect(host.tableIds).toEqual([]);
  });

  test("TC-726: only an upcoming BOOKED/CONFIRMED booking is editable — ARRIVED and a waitlist entry → 409 RESERVATION_NOT_EDITABLE", async () => {
    await allure.description(
      "PATCH /api/tablet/reservations/:id on an ARRIVED reservation (the " +
        "party is at the door) → 409 RESERVATION_NOT_EDITABLE; the same on " +
        "a WAITLIST entry (no time to move) → 409 as well."
    );
    const booking = await book("Arrived Edit", 20);
    const arrived = await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      "arrive"
    );
    expect(arrived.status, msg(arrived.data)).toBe(200);
    const refused = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      { guestName: `Too Late ${runId}` }
    );
    expect(refused.status, msg(refused.data)).toBe(409);
    expect(errorCode(refused.data)).toBe("RESERVATION_NOT_EDITABLE");

    const wait = await createReservationTabletRaw(tabletToken, managerSession, {
      partySize: 2,
      guestName: `Wait Edit ${runId}`,
      guestPhone: nextGuestPhone(),
      quotedWaitMinutes: 10,
    });
    expect(wait.status, msg(wait.data)).toBe(201);
    bookingIds.push(unwrap(wait).id);
    const waitEdit = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      unwrap(wait).id,
      { guestName: `Wait Edited ${runId}` }
    );
    expect(waitEdit.status, msg(waitEdit.data)).toBe(409);
    expect(errorCode(waitEdit.data)).toBe("RESERVATION_NOT_EDITABLE");
  });

  // ── Host list access ────────────────────────────────────────────────────

  test("TC-738: host list loads for every staff member, but only hosts get guest phone/email; a non-host can't hold a table", async () => {
    await allure.description(
      "GET /api/tablet/host (2026-10-06, option A): a STAFF member with " +
        "HOST_MANAGE_RESERVATIONS revoked still gets 200 and the day's " +
        "rows, with `canManage: false` and NO guestPhone/guestEmail keys. " +
        "The host (STAFF role default) gets `canManage: true` and the " +
        "guest's phone. Every write still needs the permission: the " +
        "non-host's hold → 403 AUTH_FORBIDDEN."
    );
    const nonHostPin = "2468";
    const minted = await createPinStaffTabletRaw(tabletToken, managerSession, {
      firstName: "Auto",
      lastName: `NoHost${runId}`,
      pin: nonHostPin,
      staffRole: "STAFF",
      capabilityRevokes: ["HOST_MANAGE_RESERVATIONS"],
    });
    expect(minted.status, msg(minted.data)).toBe(201);
    const nonHostSession = await tabletStaffSignIn(
      tabletToken,
      unwrap(minted).id,
      nonHostPin
    );
    const booking = await book("Contact", 20);

    const limited = await getHostRaw(
      tabletToken,
      nonHostSession,
      hostDate(booking.scheduledAt)
    );
    expect(limited.status, msg(limited.data)).toBe(200);
    expect((limited.data as any).canManage).toBe(false);
    const limitedRow = (unwrap(limited) as any[]).find(
      (r) => r.id === booking.id
    );
    expect(limitedRow, "non-host should still see the booking").toBeTruthy();
    expect("guestPhone" in limitedRow).toBe(false);
    expect("guestEmail" in limitedRow).toBe(false);

    const hostSession = await tabletStaffSignIn(
      tabletToken,
      staffMemberId,
      staffPin
    );
    const full = await getHostRaw(
      tabletToken,
      hostSession,
      hostDate(booking.scheduledAt)
    );
    expect(full.status, msg(full.data)).toBe(200);
    expect((full.data as any).canManage).toBe(true);
    const fullRow = (unwrap(full) as any[]).find((r) => r.id === booking.id);
    expect(fullRow.guestPhone).toBeTruthy();

    const table = await newTable("No Host");
    const denied = await hold(booking.id, [table.id], nonHostSession);
    expect(denied.status, msg(denied.data)).toBe(403);
    expect(errorCode(denied.data)).toBe("AUTH_FORBIDDEN");
  });

  // ── Owner-app arrival alerts: device registration ───────────────────────

  test("TC-745: Owner-app push token — register needs a token and a sign-in; registering twice and signing out (twice) all succeed", async () => {
    await allure.description(
      "PUT /api/owner-app/me/push-token is how the Owner app receives the " +
        "arrival alert push. Run as this file's THROWAWAY owner (never a " +
        "real account — a registered token would get real pushes). No token " +
        "→ 400 OWNER_APP_FAILED; no sign-in → 401; {token, platform, " +
        "locale} → 200, and again → 200 (upsert by token). DELETE → 200, " +
        "and a repeat DELETE is still 200."
    );
    const pushToken = `ExponentPushToken[automation-${runId}]`;
    const missing = await putOwnerPushTokenRaw(token, { platform: "ios" });
    expect(missing.status, msg(missing.data)).toBe(400);
    expect(errorCode(missing.data)).toBe("OWNER_APP_FAILED");

    const anonymous = await putOwnerPushTokenRaw(null, { token: pushToken });
    expect(anonymous.status, msg(anonymous.data)).toBe(401);

    try {
      for (let i = 0; i < 2; i++) {
        const put = await putOwnerPushTokenRaw(token, {
          token: pushToken,
          platform: "ios",
          locale: "en",
        });
        expect(put.status, msg(put.data)).toBe(200);
      }
    } finally {
      for (let i = 0; i < 2; i++) {
        const del = await deleteOwnerPushTokenRaw(token, pushToken);
        expect(del.status, msg(del.data)).toBe(200);
      }
    }
  });
});
