/**
 * 06-reservations-lifecycle.spec.ts — Reservation LIFECYCLE (tablet host
 * stand, API level): the arc from a phone booking through arrive/seat/link/
 * settle, plus the status-transition graph's capability splits and edge
 * cases. Feature: table-management-reservations-eager-teacup, Phase A Task 8
 * (`tabletReservationController.ts` / `reservationSeatService.ts` /
 * `reservationTransitionService.ts`).
 *
 * Own tenant: the WHOLE file runs on a per-run throwaway restaurant owned by
 * an admin-minted OWNER (`createSecondOwner`) — reservation lifecycle needs
 * the TABLE_RESERVATIONS entitlement ALONE (confirmed against
 * `tabletReservationController.ts`'s header comment: every route here gates
 * on `assertTableReservations` plus a per-action capability, never
 * `tableServiceEnabled`), and a cash settlement (TC-406) needs a register
 * session, so mutating the shared seed restaurant would leak state. Setup
 * chain: settings PUT (tableServiceEnabled + acceptingOrders) → entitlement
 * grant → menu item → REGISTER device (admin-created) → tablet login → owner
 * POS PIN (MANAGER) → a minted STAFF-role member (HOST_MANAGE_RESERVATIONS
 * only, no OVERRIDE_RESERVATION_CONFLICT) for the capability-split tests →
 * reservation settings (advanceBookingDays/minNoticeMinutes — irrelevant to
 * this file's ADVISORY/"staff" bookings, kept for parity with the shared
 * setup) → one paced service period per day-of-week (00:00-23:45,
 * maxPartiesPerSlot:1) so TC-412's overbook test has a cap to exceed while
 * every OTHER test's distinct booking slot sails through untouched.
 *
 * Response envelope: every route here wraps its payload in {success, data,
 * message} (read via `unwrap()`); `seatReservationTabletRaw`'s data is
 * {reservation, prefill} specifically. A reservation's current row is read
 * back via `patchReservationOwnerRaw(token, restaurantId, id, {})` — an
 * empty-body PATCH is a no-op write that still returns the full
 * serializeReservation() row; there is no owner "GET reservation by id"
 * route, and the tablet host-stand list is date-windowed (awkward to hit a
 * ~48h-out slot reliably against the restaurant's own timezone), so this is
 * the simplest reliable "read one reservation" primitive available.
 *
 * Discrepancies from the brief, confirmed against source (server is
 * authority — see task-3-report.md for the full writeup):
 *   - TC-407: `canOverrideConflict` (OVERRIDE_RESERVATION_CONFLICT) BYPASSES
 *     the 409 conflict check entirely for its holder — a MANAGER seating over
 *     a conflict never sees 409, it just succeeds and steals the table's
 *     assignment. The 409 is visible only from the STAFF-role side.
 *   - TC-415: cancelling a linked order only UNLINKS (Reservation.orderId =
 *     null) — the reservation's `status` never reverts on cancel (controller
 *     comment: "the reservation is the party's real state, the order is just
 *     this attempt at collecting money for it"). A SEATED reservation stays
 *     SEATED after its order is cancelled.
 *   - TC-417: RESERVED_SOON requires a `ReservationTable` row assigned to a
 *     BOOKED/CONFIRMED/ARRIVED reservation — but the ONLY write path to
 *     `ReservationTable` is `seatReservation`, which always transitions to
 *     SEATED in the same transaction. There is no API-reachable way to
 *     assign a table without seating, so RESERVED_SOON is unobservable from
 *     this surface — `test.fixme`d with the reasoning inline.
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
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  createPinStaffTabletRaw,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  createTableOwnerRaw,
  getFloorRaw,
  putReservationSettingsOwnerRaw,
  createReservationServicePeriodOwnerRaw,
  createReservationOwnerRaw,
  patchReservationOwnerRaw,
  createReservationTabletRaw,
  getHostRaw,
  reservationStatusTabletRaw,
  seatReservationTabletRaw,
  transferTabTableRaw,
  openRegisterSessionPos,
  settleTabCashRaw,
  closeRegisterSessionPosRaw,
  type TabletDevice,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const ITEM_PRICE = 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

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

test.describe("POS — Reservation Lifecycle (tablet host stand)", () => {
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
  /** Currently-active staff session on the device (manager unless a test
   *  temporarily switches to the STAFF member). */
  let staffSession = "";
  let managerStaffMemberId = "";
  const managerPin = "8462";
  let staffMemberId = "";
  const staffPin = "1357";
  /** Every check this file opens — swept in afterAll (settle-or-cancel). */
  const openedOrderIds: string[] = [];
  /** Set once TC-406 opens the drawer — afterAll closes it if still open. */
  let registerOpened = false;

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  // Unique 15-minute-grid slot per test, ~48h out — never reused, so no test
  // accidentally collides with another's pacing/seat state. TC-412
  // deliberately books the SAME slot twice on purpose.
  const GRID_MS = 15 * 60 * 1000;
  const baseSlot = (() => {
    const d = new Date(Date.now() + 48 * 3600 * 1000);
    d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 15) * 15, 0, 0);
    return d.getTime();
  })();
  let slotStep = 0;
  const nextSlot = (): string => {
    slotStep += 1;
    return new Date(baseSlot + slotStep * GRID_MS).toISOString();
  };

  let phoneSeq = 1000;
  const runFrag = parseInt(runId.slice(0, 4), 16) % 1000;
  /** Unique 10-digit guest phone per call — SMS throttle 5/hr/phone + a
   *  per-phone open-reservations cap. */
  const nextGuestPhone = (): string => {
    phoneSeq += 1;
    return `555${String(runFrag).padStart(3, "0")}${String(phoneSeq).padStart(4, "0")}`;
  };

  /** Open a table-service check and track it for the afterAll sweep. */
  const openCheckOnTable = async (
    tableId: string,
    session: string,
    extra: Record<string, unknown> = {}
  ) => {
    const res = await createTabletOrderRaw(tabletToken, session, {
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
    return res;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[reservations-lifecycle] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

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
        `[reservations-lifecycle] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );

    groupId = (
      await createMenuGroupNamed(token, `Automation Resv ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Resv Burger ${runId}`,
      ITEM_PRICE
    );

    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Resv POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);

    managerStaffMemberId = await setOwnerPosPin(
      token,
      restaurantId,
      managerPin
    );
    staffSession = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );

    const staffCreate = await createPinStaffTabletRaw(
      tabletToken,
      staffSession,
      {
        firstName: "Auto",
        lastName: `Host${runId}`,
        pin: staffPin,
        staffRole: "STAFF",
      }
    );
    if (!staffCreate.ok)
      throw new Error(
        `[reservations-lifecycle] could not mint STAFF member: ${msg(staffCreate.data)}`
      );
    staffMemberId = unwrap(staffCreate).id;

    // ADVISORY ("staff") bookings never enforce minNotice/advanceBookingDays
    // (task-2 discrepancy #5) — set for parity with the shared setup anyway.
    await putReservationSettingsOwnerRaw(token, restaurantId, {
      advanceBookingDays: 30,
      minNoticeMinutes: 0,
    });

    // One paced (maxPartiesPerSlot:1) period per day-of-week, full
    // 00:00-23:45 coverage — gives TC-412's overbook test a cap to exceed
    // regardless of which calendar day its ~48h-out slot lands on, while
    // every other test's distinct slot is entirely unaffected (each books a
    // DIFFERENT exact instant, and the cap gates per-exact-instant).
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
      if (!period.ok)
        throw new Error(
          `[reservations-lifecycle] could not create day ${dayOfWeek} period: ${msg(period.data)}`
        );
    }
  });

  test.afterAll(async () => {
    if (!token) return;
    // Sweep: settle or cancel every check this run opened. A check with a
    // settled leg can't cancel — pay off its remaining in cash (the register
    // is open for the whole back half of this file, from TC-406 onward).
    for (const orderId of openedOrderIds) {
      try {
        const read = await getOrderFullRaw(await freshOwnerToken(), orderId);
        const status = String(read.data?.status ?? "");
        const paymentStatus = String(read.data?.paymentStatus ?? "");
        if (
          !read.ok ||
          paymentStatus === "COMPLETED" ||
          status === "CANCELLED" ||
          status === "REFUNDED"
        )
          continue;
        const cancel = await cancelTabletOrderRaw(
          tabletToken,
          staffSession,
          orderId,
          "Automation cleanup"
        );
        if (!cancel.ok && registerOpened) {
          await settleTabCashRaw(tabletToken, staffSession, orderId, {
            amount: round2(Number(read.data?.total ?? 0)),
            cashTendered: 10_000,
            idempotencyKey: `cleanup-${orderId}`,
          });
        }
      } catch (err) {
        // Best-effort: the tenant is archived below regardless — a stray
        // order on a throwaway restaurant is harmless, a teardown failure
        // masking the test results above is not.
        console.warn(
          `[reservations-lifecycle] cleanup failed for ${orderId}:`,
          err
        );
      }
    }
    if (registerOpened) {
      // Best-effort: close whatever session is still open so it doesn't
      // linger against the throwaway tenant.
      await closeRegisterSessionPosRaw(tabletToken, staffSession, {
        countedCash: 100000,
      }).catch(() => {
        /* the tenant is about to be archived regardless */
      });
    }
    const t = await freshOwnerToken().catch(() => token);
    // Best-effort: the restaurant is about to be archived regardless, so a
    // failed revoke here is not worth surfacing as a test failure.
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    if (item)
      await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    // Best-effort: a failed archive orphans a harmless throwaway tenant
    // rather than masking the test results above with a teardown failure.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Reservation Lifecycle");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test("TC-406: the full arc — book, arrive, seat, link, settle in cash, and the reservation completes @smoke", async () => {
    await allure.description(
      "The pre-production ritual in one pass: an owner phone booking (201, " +
        "confirmationCode) → tablet `arrive` → `seat {tableIds}` (prefill " +
        "carries tableId/tableName/guestCount/reservationId) → floor shows " +
        "the table SEATED → create-order links the check (reservation stays " +
        "SEATED, floor flips to OCCUPIED — precedence order) → open the " +
        "register → settle in full cash → order COMPLETED, reservation " +
        "COMPLETED (maybeCloseTab's atomic reservation-complete side effect), " +
        "and the floor returns to AVAILABLE."
    );
    const table = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Smoke ${runId}`,
      })
    );

    const booked = await createReservationOwnerRaw(token, restaurantId, {
      partySize: 2,
      scheduledAt: nextSlot(),
      guestName: `Smoke Guest ${runId}`,
      guestPhone: nextGuestPhone(),
    });
    expect(booked.status, msg(booked.data)).toBe(201);
    const reservationId = unwrap(booked).id;
    expect(unwrap(booked).confirmationCode).toBeTruthy();

    const arrived = await reservationStatusTabletRaw(
      tabletToken,
      staffSession,
      reservationId,
      "arrive"
    );
    expect(arrived.status, msg(arrived.data)).toBe(200);
    expect(unwrap(arrived).status).toBe("ARRIVED");

    const seated = await seatReservationTabletRaw(
      tabletToken,
      staffSession,
      reservationId,
      { tableIds: [table.id] }
    );
    expect(seated.status, msg(seated.data)).toBe(201);
    const seatData = unwrap(seated);
    expect(seatData.prefill).toEqual({
      tableId: table.id,
      tableName: table.name,
      guestCount: 2,
      reservationId,
    });
    expect(seatData.reservation.status).toBe("SEATED");

    const floorSeated = await getFloorRaw(tabletToken);
    const rowSeated = (unwrap(floorSeated).tables as any[]).find(
      (t) => t.table.id === table.id
    );
    expect(rowSeated?.state).toBe("SEATED");

    const linked = await openCheckOnTable(table.id, staffSession, {
      reservationId,
      guestCount: 2,
    });
    expect(linked.status, msg(linked.data)).toBe(201);
    const orderId = linked.data.id!;
    openedOrderIds.push(orderId);

    const afterLink = await patchReservationOwnerRaw(
      token,
      restaurantId,
      reservationId,
      {}
    );
    expect(unwrap(afterLink).status).toBe("SEATED");

    const floorOccupied = await getFloorRaw(tabletToken);
    const rowOccupied = (unwrap(floorOccupied).tables as any[]).find(
      (t) => t.table.id === table.id
    );
    expect(rowOccupied?.state).toBe("OCCUPIED");

    await openRegisterSessionPos(tabletToken, staffSession, 100);
    registerOpened = true;

    const leg = await settleTabCashRaw(tabletToken, staffSession, orderId, {
      amount: ITEM_PRICE,
      cashTendered: 20,
      tip: 0,
      idempotencyKey: `smoke-${runId}`,
    });
    expect(leg.status, msg(leg.data)).toBe(200);
    expect(leg.data.closed).toBe(true);
    expect(leg.data.cashChange).toBe(round2(20 - ITEM_PRICE));

    const finalOrder = await getOrderFullRaw(token, orderId);
    expect(finalOrder.data.paymentStatus).toBe("COMPLETED");

    const finalReservation = await patchReservationOwnerRaw(
      token,
      restaurantId,
      reservationId,
      {}
    );
    expect(unwrap(finalReservation).status).toBe("COMPLETED");

    const floorAvailable = await getFloorRaw(tabletToken);
    const rowAvailable = (unwrap(floorAvailable).tables as any[]).find(
      (t) => t.table.id === table.id
    );
    expect(rowAvailable?.state).toBe("AVAILABLE");

    const orderTotal = Number(finalOrder.data.total);
    const closed = await closeRegisterSessionPosRaw(tabletToken, staffSession, {
      countedCash: round2(100 + orderTotal),
    });
    expect(closed.status, msg(closed.data)).toBe(200);
    // Register endpoints wrap in {success, data, message} (unlike the tab/*
    // settlement family above, which answers flat) — unwrap() here too.
    const closedData = unwrap(closed);
    expect(closedData.expectedCash).toBe(round2(100 + orderTotal));
    expect(closedData.overShort).toBe(0);
    registerOpened = false;
  });

  test("TC-407: seat conflict — STAFF sees the 409, MANAGER's OVERRIDE_RESERVATION_CONFLICT bypasses it entirely", async () => {
    await allure.description(
      "Two bookings on the same table: seating #1 succeeds; seating #2 onto " +
        "the SAME table as the STAFF-role member (HOST_MANAGE_RESERVATIONS " +
        "only, no override) → 409 RESERVATION_CONFLICT. The SAME seat call as " +
        "the MANAGER (holds OVERRIDE_RESERVATION_CONFLICT) does NOT surface " +
        "the conflict as an error at all — canOverrideConflict bypasses the " +
        "check in reservationSeatService.ts, so the call just succeeds and " +
        "re-assigns the table to reservation #2."
    );
    const table = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Conflict ${runId}`,
      })
    );
    const res1 = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Conflict One ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );
    const res2 = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Conflict Two ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );

    const seat1 = await seatReservationTabletRaw(
      tabletToken,
      staffSession,
      res1.id,
      { tableIds: [table.id] }
    );
    expect(seat1.status, msg(seat1.data)).toBe(201);

    const staffSess = await tabletStaffSignIn(
      tabletToken,
      staffMemberId,
      staffPin
    );
    const blocked = await seatReservationTabletRaw(
      tabletToken,
      staffSess,
      res2.id,
      { tableIds: [table.id] }
    );
    expect(blocked.status, msg(blocked.data)).toBe(409);
    expect(errorCode(blocked.data)).toBe("RESERVATION_CONFLICT");

    const managerSess = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );
    staffSession = managerSess;
    const overridden = await seatReservationTabletRaw(
      tabletToken,
      managerSess,
      res2.id,
      { tableIds: [table.id] }
    );
    expect(overridden.status, msg(overridden.data)).toBe(201);
    expect(unwrap(overridden).reservation.status).toBe("SEATED");
  });

  test("TC-408: double-link 409 — a second create-order against the same reservationId is refused", async () => {
    await allure.description(
      "After a create-order links a reservation to check #1, a SECOND " +
        "create-order for the same reservationId → 409 RESERVATION_CONFLICT " +
        "(Reservation.orderId is @unique)."
    );
    const table = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Double Link ${runId}`,
      })
    );
    const res = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Double Link ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );
    const seat = await seatReservationTabletRaw(
      tabletToken,
      staffSession,
      res.id,
      { tableIds: [table.id] }
    );
    expect(seat.status, msg(seat.data)).toBe(201);

    const first = await openCheckOnTable(table.id, staffSession, {
      reservationId: res.id,
    });
    expect(first.status, msg(first.data)).toBe(201);
    openedOrderIds.push(first.data.id!);

    const second = await openCheckOnTable(table.id, staffSession, {
      reservationId: res.id,
      tableName: `Double Link Two ${runId}`,
    });
    expect(second.status, msg(second.data)).toBe(409);
    expect(errorCode(second.data)).toBe("RESERVATION_CONFLICT");
  });

  test("TC-409: not-linkable 400 — a cancelled reservation refuses create-order's link", async () => {
    await allure.description(
      "CANCELLED is not in LINKABLE_RESERVATION_STATUSES (BOOKED/NOTIFIED/" +
        "ARRIVED/PARTIALLY_SEATED/SEATED) — create-order against a cancelled " +
        "reservationId → 400 RESERVATION_NOT_LINKABLE."
    );
    const res = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Not Linkable ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );
    const cancelled = await reservationStatusTabletRaw(
      tabletToken,
      staffSession,
      res.id,
      "cancel"
    );
    expect(cancelled.status, msg(cancelled.data)).toBe(200);

    const table = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Not Linkable ${runId}`,
      })
    );
    const attempt = await openCheckOnTable(table.id, staffSession, {
      reservationId: res.id,
    });
    expect(attempt.status, msg(attempt.data)).toBe(400);
    expect(errorCode(attempt.data)).toBe("RESERVATION_NOT_LINKABLE");
  });

  test("TC-410: early no-show capability split — STAFF 403s inside the grace window, MANAGER succeeds", async () => {
    await allure.description(
      "A booking scheduled ~48h out is still inside its grace window right " +
        "now (now < scheduledAt + graceMinutes is trivially true for a " +
        "future booking) — `no_show` needs OVERRIDE_RESERVATION_CONFLICT " +
        "while early. STAFF (HOST_MANAGE_RESERVATIONS only) → 403 " +
        "AUTH_FORBIDDEN; MANAGER → 200, status NO_SHOW."
    );
    const res = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Early NoShow ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );

    const staffSess = await tabletStaffSignIn(
      tabletToken,
      staffMemberId,
      staffPin
    );
    const denied = await reservationStatusTabletRaw(
      tabletToken,
      staffSess,
      res.id,
      "no_show"
    );
    expect(denied.status, msg(denied.data)).toBe(403);
    expect(errorCode(denied.data)).toBe("AUTH_FORBIDDEN");

    const managerSess = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );
    staffSession = managerSess;
    const allowed = await reservationStatusTabletRaw(
      tabletToken,
      managerSess,
      res.id,
      "no_show"
    );
    expect(allowed.status, msg(allowed.data)).toBe(200);
    expect(unwrap(allowed).status).toBe("NO_SHOW");
  });

  test("TC-411: clientRequestId replay — the same body+id twice answers the SAME reservation, second call replayed", async () => {
    await allure.description(
      "POST /api/tablet/reservations with a clientRequestId: the first call " +
        "is 201; replaying the identical clientRequestId is 200 with the " +
        "SAME reservation id (idempotency fast-path in " +
        "createReservationSlotChecked)."
    );
    const clientRequestId = `resv-replay-${runId}`;
    const body = {
      kind: "RESERVATION",
      partySize: 2,
      scheduledAt: nextSlot(),
      guestName: `Replay ${runId}`,
      guestPhone: nextGuestPhone(),
      clientRequestId,
    };
    const first = await createReservationTabletRaw(
      tabletToken,
      staffSession,
      body
    );
    expect(first.status, msg(first.data)).toBe(201);
    const firstId = unwrap(first).id;

    const replay = await createReservationTabletRaw(
      tabletToken,
      staffSession,
      body
    );
    expect(replay.status, msg(replay.data)).toBe(200);
    expect(unwrap(replay).id).toBe(firstId);
  });

  test("TC-412: advisory overbook — a second tablet booking over the paced cap succeeds anyway and flags pacingExceeded", async () => {
    await allure.description(
      "Two tablet (host-stand) bookings in the EXACT same slot, capped at " +
        "maxPartiesPerSlot:1 by the beforeAll full-week periods: the first " +
        "is a clean 201 (no pacingExceeded); the second is ALSO 201, never a " +
        "409 — ADVISORY mode only ever flags `pacingExceeded:true`, matching " +
        "the owner-portal booking's own ADVISORY behavior (task-2 TC-405)."
    );
    const scheduledAt = nextSlot();
    const first = await createReservationTabletRaw(tabletToken, staffSession, {
      kind: "RESERVATION",
      partySize: 2,
      scheduledAt,
      guestName: `Overbook One ${runId}`,
      guestPhone: nextGuestPhone(),
    });
    expect(first.status, msg(first.data)).toBe(201);
    expect(unwrap(first).pacingExceeded).toBeFalsy();

    const second = await createReservationTabletRaw(tabletToken, staffSession, {
      kind: "RESERVATION",
      partySize: 2,
      scheduledAt,
      guestName: `Overbook Two ${runId}`,
      guestPhone: nextGuestPhone(),
    });
    expect(second.status, msg(second.data)).toBe(201);
    expect(unwrap(second).pacingExceeded).toBe(true);
  });

  test("TC-413: host list shape — reservation + waitlist entries carry the fields the host stand needs", async () => {
    await allure.description(
      "GET /api/tablet/host?date=: a scheduled RESERVATION carries a derived " +
        "graceDeadline (scheduledAt + graceMinutes) and guest fields plus " +
        "internalNotes (staff surface); a WAITLIST entry (kind default) has " +
        "no scheduledAt/graceDeadline at all."
    );
    // Book at a KNOWN restaurant-local date by scheduling for right now plus
    // a small buffer, then reading /host for TODAY (its default when `date`
    // is omitted) — avoids computing the restaurant's timezone offset just
    // to pick the right query date for a ~48h-out slot.
    const soon = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const resv = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: soon,
        guestName: `Host Shape Resv ${runId}`,
        guestPhone: nextGuestPhone(),
        internalNotes: "VIP — window seat",
      })
    );
    const waitlist = await createReservationTabletRaw(
      tabletToken,
      staffSession,
      {
        partySize: 3,
        guestName: `Host Shape Wait ${runId}`,
        guestPhone: nextGuestPhone(),
        quotedWaitMinutes: 15,
      }
    );
    expect(waitlist.status, msg(waitlist.data)).toBe(201);
    const waitId = unwrap(waitlist).id;

    const host = await getHostRaw(tabletToken, staffSession);
    expect(host.status, msg(host.data)).toBe(200);
    const rows = unwrap(host) as any[];

    const resvRow = rows.find((r) => r.id === resv.id);
    expect(
      resvRow,
      "the booked reservation should appear in today's host list"
    ).toBeTruthy();
    expect(resvRow.kind).toBe("RESERVATION");
    expect(resvRow.scheduledAt).toBeTruthy();
    expect(resvRow.graceDeadline).toBeTruthy();
    expect(resvRow.guestName).toBe(`Host Shape Resv ${runId}`);
    expect(resvRow.internalNotes).toBe("VIP — window seat");

    const waitRow = rows.find((r) => r.id === waitId);
    expect(
      waitRow,
      "the waitlist entry should appear in today's host list"
    ).toBeTruthy();
    expect(waitRow.kind).toBe("WAITLIST");
    expect(waitRow.scheduledAt).toBeFalsy();
    expect(waitRow.graceDeadline).toBeFalsy();
  });

  test("TC-414: transfer on a seated check moves it to the destination table", async () => {
    await allure.description(
      "Open a check on a seated table, transfer it by name to a fresh " +
        "table (zero-config upsert-by-name, same as file 03's TC-376) — the " +
        "owner list/floor shows the check on the destination, not the source."
    );
    const from = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Transfer From ${runId}`,
      })
    );
    const toName = `Transfer To ${runId}`;
    const res = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Transfer ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );
    const seat = await seatReservationTabletRaw(
      tabletToken,
      staffSession,
      res.id,
      { tableIds: [from.id] }
    );
    expect(seat.status, msg(seat.data)).toBe(201);
    const opened = await openCheckOnTable(from.id, staffSession, {
      reservationId: res.id,
    });
    expect(opened.status, msg(opened.data)).toBe(201);
    const orderId = opened.data.id!;
    openedOrderIds.push(orderId);

    const moved = await transferTabTableRaw(
      tabletToken,
      staffSession,
      orderId,
      toName
    );
    expect(moved.status, msg(moved.data)).toBe(200);
    expect(moved.data.order?.tableNumber).toBe(toName);

    const floor = await getFloorRaw(tabletToken);
    const floorTables = unwrap(floor).tables as any[];
    const srcRow = floorTables.find((t) => t.table.id === from.id);
    const dstRow = floorTables.find((t) => t.table.name === toName);
    expect(
      srcRow?.openChecks?.some((c: any) => c.orderId === orderId) ?? false,
      "source table should no longer hold the check"
    ).toBe(false);
    expect(
      dstRow?.openChecks?.some((c: any) => c.orderId === orderId),
      "destination table should hold the check"
    ).toBe(true);
  });

  test("TC-415: cancelling the order unlinks the reservation but does NOT revert its status", async () => {
    await allure.description(
      "Seat + link an order, then CANCEL THE ORDER: the controller's own " +
        "comment states the reservation is the party's real state, so cancel " +
        "only unlinks (Reservation.orderId = null) and never touches " +
        "status — a SEATED reservation stays SEATED (re-linkable by the next " +
        "create-order, since SEATED is itself linkable). The table's floor " +
        "state follows: OCCUPIED (open check) reverts to SEATED (assigned, " +
        "no open order) rather than all the way to AVAILABLE, since the " +
        "ReservationTable assignment and SEATED status both survive the " +
        "order's cancellation."
    );
    const table = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Unlink ${runId}`,
      })
    );
    const res = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Unlink ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );
    const seat = await seatReservationTabletRaw(
      tabletToken,
      staffSession,
      res.id,
      { tableIds: [table.id] }
    );
    expect(seat.status, msg(seat.data)).toBe(201);
    const opened = await openCheckOnTable(table.id, staffSession, {
      reservationId: res.id,
    });
    expect(opened.status, msg(opened.data)).toBe(201);
    const orderId = opened.data.id!;

    const cancelled = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      orderId,
      "TC-415: unlink probe"
    );
    expect(cancelled.status, msg(cancelled.data)).toBe(200);

    const reservationAfter = await patchReservationOwnerRaw(
      token,
      restaurantId,
      res.id,
      {}
    );
    // TRUST THE SERVER: status stays SEATED, not reverted to ARRIVED — see
    // the file-header discrepancy note and cancelOrderOnly's own comment in
    // tabletOrderController.ts.
    expect(unwrap(reservationAfter).status).toBe("SEATED");

    const floor = await getFloorRaw(tabletToken);
    const row = (unwrap(floor).tables as any[]).find(
      (t) => t.table.id === table.id
    );
    // The check is gone (no longer OCCUPIED) but the table is not fully
    // AVAILABLE either — the reservation's SEATED assignment still claims
    // it, per computeTableStates' precedence order.
    expect(row?.state).toBe("SEATED");
    expect(row?.openChecks?.length ?? 0).toBe(0);
  });

  test("TC-416: status transition refusal — complete on a never-seated BOOKED reservation is illegal", async () => {
    await allure.description(
      "LEGAL_TRANSITIONS has no BOOKED -> COMPLETED edge (only PARTIALLY_" +
        "SEATED/SEATED -> COMPLETED) — attempting `complete` straight from " +
        "BOOKED → 400 RESERVATION_INVALID_TRANSITION."
    );
    const res = unwrap(
      await createReservationOwnerRaw(token, restaurantId, {
        partySize: 2,
        scheduledAt: nextSlot(),
        guestName: `Never Seated ${runId}`,
        guestPhone: nextGuestPhone(),
      })
    );
    const attempt = await reservationStatusTabletRaw(
      tabletToken,
      staffSession,
      res.id,
      "complete"
    );
    expect(attempt.status, msg(attempt.data)).toBe(400);
    expect(errorCode(attempt.data)).toBe("RESERVATION_INVALID_TRANSITION");
  });

  test.fixme("TC-417: floor RESERVED_SOON is unobservable via the API — no path assigns a table without seating", async () => {
    // PROBED against reservationSeatService.ts and tableStateService.ts:
    // RESERVED_SOON requires a ReservationTable row on a reservation whose
    // status is still BOOKED/CONFIRMED/ARRIVED (tableStateService.ts's
    // RESERVED_SOON_STATUSES). The ONLY write path to ReservationTable is
    // seatReservation, and it ALWAYS transitions the reservation to SEATED
    // in the same transaction — `partially_seat` (the other status this
    // file's brief hoped might assign a table) only flips `status`, per
    // reservationTransitionService.ts's TIMESTAMP_COLUMN comment: "no
    // dedicated timestamp column... only status and updatedAt change for
    // that move." There is no API-reachable way to have an assigned table
    // AND a non-SEATED status at the same time, so this floor state can
    // never be produced from outside the process (only a direct DB write
    // could fake it) — marking fixme rather than asserting a state the
    // server can never actually reach through its own API.
  });
});
