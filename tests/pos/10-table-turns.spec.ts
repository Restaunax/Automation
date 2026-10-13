/**
 * 10-table-turns.spec.ts — "Paid is not free": the table-turn lifecycle,
 * walk-in seating before an order, check-presented, the floor's server
 * strip, the waitlist quote and the owner's turn insights (tablet + owner
 * API level). Feature: backend 2026-10-07 (`tableTurnService.ts`,
 * `walkInSeatService.ts`, `waitlistQuoteService.ts`; docs/features/
 * TABLE_RESERVATIONS.md → "Paid is not free").
 *
 * The rules under test:
 *   - Paying a table's LAST open check opens a TableTurn. What the floor
 *     shows next depends on ReservationSettings.afterPaymentPolicy:
 *     HOLD_UNTIL_CLEARED (default) → PAID until a host taps Clear (capped at
 *     240 min, `paidTurn.autoClearAt` null); MARK_DIRTY → DIRTY;
 *     AUTO_AVAILABLE → PAID with `autoClearAt = paidAt + autoClearMinutes`.
 *     The turn closes MANUAL (Clear), SEATED_OVER (a new party) or AUTO.
 *   - POST /tables/:id/seat {guestCount} seats a walk-in before any order
 *     (SEATED). Refused 409 on BLOCKED/OCCUPIED/SEATED; fine on PAID/DIRTY
 *     (that turn closes SEATED_OVER). The next check on the table consumes
 *     the seat: Order.seatedAt = seat time, guestCount from the seat.
 *   - check-presented stamps Order.checkPresentedAt once; a reprint answers
 *     the first stamp.
 *
 * Own tenant (same shape as 06/09) with an open REGISTER session for the
 * whole file — paying a check in cash is what creates a turn.
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
  setTableStateTabletRaw,
  putReservationSettingsOwnerRaw,
  getReservationSettingsOwnerRaw,
  openRegisterSessionPos,
  settleTabCashRaw,
  closeRegisterSessionPosRaw,
  markCheckPresentedTabletRaw,
  seatWalkInTabletRaw,
  unseatWalkInTabletRaw,
  getWaitlistQuoteTabletRaw,
  getTurnInsightsOwnerRaw,
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

/** Wrapped {success, data, message} routes — pull the payload out. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("POS — Table Turns, Walk-in Seating & Waitlist Quote", () => {
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
  let managerSession = "";
  let managerStaffMemberId = "";
  const managerPin = "8462";
  let staffMemberId = "";
  const staffPin = "1357";
  let registerOpened = false;
  /** Cash taken this run — the register closes against float + this. */
  let cashTaken = 0;
  const openedOrderIds: string[] = [];

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  const newTable = async (label: string, capacity = 4) =>
    unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `${label} ${runId}`,
        capacity,
      })
    ) as { id: string; name: string };

  const floor = async () => unwrap(await getFloorRaw(tabletToken));
  const floorRow = async (tableId: string) =>
    ((await floor()).tables as any[]).find((t) => t.table.id === tableId);

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
    expect(res.status, msg(res.data)).toBe(201);
    openedOrderIds.push(res.data.id!);
    return res.data.id!;
  };

  /** Settle the whole check in exact cash — closes it and opens a turn. */
  const payInFull = async (orderId: string) => {
    const leg = await settleTabCashRaw(tabletToken, managerSession, orderId, {
      amount: ITEM_PRICE,
      cashTendered: ITEM_PRICE,
      tip: 0,
      idempotencyKey: `turn-${orderId}`,
    });
    expect(leg.status, msg(leg.data)).toBe(200);
    expect(leg.data.closed).toBe(true);
    cashTaken += ITEM_PRICE;
  };

  const setPolicy = async (
    afterPaymentPolicy: "HOLD_UNTIL_CLEARED" | "MARK_DIRTY" | "AUTO_AVAILABLE",
    extra: Record<string, unknown> = {}
  ) => {
    const res = await putReservationSettingsOwnerRaw(token, restaurantId, {
      afterPaymentPolicy,
      ...extra,
    });
    expect(res.status, msg(res.data)).toBe(200);
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[table-turns] could not mint the throwaway tenant restaurant"
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
        `[table-turns] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );

    groupId = (
      await createMenuGroupNamed(token, `Automation Turns ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Turn Burger ${runId}`,
      ITEM_PRICE
    );

    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Turns POS ${runId}`
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
        lastName: `Busser${runId}`,
        pin: staffPin,
        staffRole: "STAFF",
      }
    );
    if (!staffCreate.ok)
      throw new Error(
        `[table-turns] could not mint STAFF member: ${msg(staffCreate.data)}`
      );
    staffMemberId = unwrap(staffCreate).id;

    await openRegisterSessionPos(tabletToken, managerSession, 100);
    registerOpened = true;
  });

  test.afterAll(async () => {
    if (!token) return;
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
        await cancelTabletOrderRaw(
          tabletToken,
          managerSession,
          orderId,
          "Automation cleanup"
        );
      } catch (err) {
        // Best-effort: the tenant is archived below regardless.
        console.warn(`[table-turns] cleanup failed for ${orderId}:`, err);
      }
    }
    if (registerOpened) {
      // Best-effort: close the drawer so it doesn't linger on the tenant.
      await closeRegisterSessionPosRaw(tabletToken, managerSession, {
        countedCash: 100 + cashTaken,
      }).catch(() => {});
    }
    const t = await freshOwnerToken().catch(() => token);
    // Best-effort teardown — the throwaway restaurant is archived regardless.
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
    await allure.label("feature", "POS Table Turns");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  // ── After-payment policy ────────────────────────────────────────────────

  test("TC-727: HOLD_UNTIL_CLEARED (default) — a paid table reads PAID with no auto-clear; the next party's check closes the turn and the table reads OCCUPIED", async () => {
    await allure.description(
      "Default policy: pay the last check in cash → floor PAID, " +
        "`paidTurn.paidAt` set and `paidTurn.autoClearAt` null (only a tap " +
        "or the 240-min cap ends it); `floorSettings.afterPaymentPolicy` " +
        "says HOLD_UNTIL_CLEARED. A NEW check on the same table closes the " +
        "turn SEATED_OVER — the table reads OCCUPIED with no paidTurn."
    );
    const settings = unwrap(
      await getReservationSettingsOwnerRaw(token, restaurantId)
    );
    expect(settings.afterPaymentPolicy).toBe("HOLD_UNTIL_CLEARED");

    const table = await newTable("Hold Clear");
    await payInFull(await openCheck(table.id));

    const f = await floor();
    expect(f.floorSettings?.afterPaymentPolicy).toBe("HOLD_UNTIL_CLEARED");
    const paid = (f.tables as any[]).find((t) => t.table.id === table.id);
    expect(paid?.state).toBe("PAID");
    expect(paid?.paidTurn?.paidAt).toBeTruthy();
    expect(paid?.paidTurn?.autoClearAt ?? null).toBeNull();

    await openCheck(table.id);
    const next = await floorRow(table.id);
    expect(next?.state).toBe("OCCUPIED");
    expect(next?.paidTurn).toBeFalsy();
  });

  test("TC-728: MARK_DIRTY — a paid table reads DIRTY; a STAFF host's Clear makes it AVAILABLE", async () => {
    await allure.description(
      "afterPaymentPolicy MARK_DIRTY: paying the last check → floor DIRTY " +
        "(not PAID). A STAFF-role member (HOST_MANAGE_RESERVATIONS — any " +
        "host can bus) taps Clear → AVAILABLE, turn closed MANUAL."
    );
    await setPolicy("MARK_DIRTY");
    try {
      const table = await newTable("Dirty");
      await payInFull(await openCheck(table.id));
      expect((await floorRow(table.id))?.state).toBe("DIRTY");

      const staffSession = await tabletStaffSignIn(
        tabletToken,
        staffMemberId,
        staffPin
      );
      const cleared = await setTableStateTabletRaw(
        tabletToken,
        staffSession,
        table.id,
        "CLEAR"
      );
      expect(cleared.status, msg(cleared.data)).toBe(200);
      const row = await floorRow(table.id);
      expect(row?.state).toBe("AVAILABLE");
      expect(row?.paidTurn).toBeFalsy();
    } finally {
      await setPolicy("HOLD_UNTIL_CLEARED");
    }
  });

  test("TC-729: AUTO_AVAILABLE — a paid table reads PAID with autoClearAt = paidAt + autoClearMinutes", async () => {
    await allure.description(
      "afterPaymentPolicy AUTO_AVAILABLE with autoClearMinutes 5: paying " +
        "the last check → floor PAID and `paidTurn.autoClearAt` exactly 5 " +
        "minutes after `paidTurn.paidAt` (the floor read closes the turn " +
        "AUTO at that instant — not waited for here)."
    );
    await setPolicy("AUTO_AVAILABLE", { autoClearMinutes: 5 });
    try {
      const table = await newTable("Auto Clear");
      await payInFull(await openCheck(table.id));
      const row = await floorRow(table.id);
      expect(row?.state).toBe("PAID");
      const paidAt = new Date(row.paidTurn.paidAt).getTime();
      expect(new Date(row.paidTurn.autoClearAt).getTime()).toBe(
        paidAt + 5 * MINUTE
      );
    } finally {
      await setPolicy("HOLD_UNTIL_CLEARED");
    }
  });

  test("TC-730: turn settings validation — an unknown policy and out-of-range autoClearMinutes are refused; doubleSeatWarnMinutes 0 is valid", async () => {
    await allure.description(
      "PUT reservation-settings: afterPaymentPolicy 'NEVER' → 400 " +
        "RESERVATION_SETTINGS_INVALID_RANGE; autoClearMinutes 0 and 121 " +
        "(range 1..120) → 400; doubleSeatWarnMinutes 0 (= never warn) → " +
        "200 and reads back 0; the floor echoes it in floorSettings."
    );
    for (const body of [
      { afterPaymentPolicy: "NEVER" },
      { autoClearMinutes: 0 },
      { autoClearMinutes: 121 },
    ]) {
      const res = await putReservationSettingsOwnerRaw(
        token,
        restaurantId,
        body
      );
      expect(res.status, `${JSON.stringify(body)} → ${msg(res.data)}`).toBe(
        400
      );
      expect(errorCode(res.data)).toBe("RESERVATION_SETTINGS_INVALID_RANGE");
    }

    const ok = await putReservationSettingsOwnerRaw(token, restaurantId, {
      doubleSeatWarnMinutes: 0,
    });
    expect(ok.status, msg(ok.data)).toBe(200);
    const settings = unwrap(
      await getReservationSettingsOwnerRaw(token, restaurantId)
    );
    expect(settings.doubleSeatWarnMinutes).toBe(0);
    expect(settings.afterPaymentPolicy).toBe("HOLD_UNTIL_CLEARED");
    expect((await floor()).floorSettings?.doubleSeatWarnMinutes).toBe(0);
  });

  test("TC-731: check-presented stamps once — a reprint answers the first timestamp", async () => {
    await allure.description(
      "POST /api/tablet/orders/:id/tab/check-presented → 200 with " +
        "checkPresentedAt; calling it again (a reprint) → 200 with the SAME " +
        "timestamp, never a newer one."
    );
    const table = await newTable("Presented");
    const orderId = await openCheck(table.id);

    const first = await markCheckPresentedTabletRaw(
      tabletToken,
      managerSession,
      orderId
    );
    expect(first.status, msg(first.data)).toBe(200);
    const stamp = unwrap(first).checkPresentedAt;
    expect(stamp).toBeTruthy();

    const reprint = await markCheckPresentedTabletRaw(
      tabletToken,
      managerSession,
      orderId
    );
    expect(reprint.status, msg(reprint.data)).toBe(200);
    expect(unwrap(reprint).checkPresentedAt).toBe(stamp);
  });

  // ── Walk-in seating ─────────────────────────────────────────────────────

  test("TC-732: walk-in seat → SEATED; the first check on the table inherits the seat time and guest count", async () => {
    await allure.description(
      "POST /tables/:id/seat {guestCount:3} → 200, floor SEATED with " +
        "`seatedWalkIn`. Opening a check there WITHOUT a guestCount " +
        "consumes the seat: the order carries guestCount 3 and seatedAt = " +
        "the seat time; the floor reads OCCUPIED with no walk-in left."
    );
    const table = await newTable("Walk In");
    const seated = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      table.id,
      3
    );
    expect(seated.status, msg(seated.data)).toBe(200);
    const seat = unwrap(seated);
    expect(seat.guestCount).toBe(3);
    expect(seat.seatedAt).toBeTruthy();
    const row = await floorRow(table.id);
    expect(row?.state).toBe("SEATED");
    expect(row?.seatedWalkIn).toBeTruthy();

    const orderId = await openCheck(table.id);
    const order = await getOrderFullRaw(token, orderId);
    expect(order.data.guestCount, JSON.stringify(order.data)).toBe(3);
    expect(new Date(String(order.data.seatedAt)).getTime()).toBe(
      new Date(seat.seatedAt).getTime()
    );
    const after = await floorRow(table.id);
    expect(after?.state).toBe("OCCUPIED");
    expect(after?.seatedWalkIn).toBeFalsy();
  });

  test("TC-733: walk-in refusals — bad guest count 400, unknown table 404, SEATED / OCCUPIED / BLOCKED 409; unseat frees the table and is idempotent", async () => {
    await allure.description(
      "guestCount 0 and 100 (1..99) → 400 SYSTEM_VALIDATION_ERROR; an " +
        "unknown tableId → 404 TABLE_NOT_FOUND; seating an already-SEATED " +
        "walk-in table, an OCCUPIED one and a BLOCKED one → 409 " +
        "RESERVATION_CONFLICT. POST /tables/:id/unseat frees the walk-in " +
        "(AVAILABLE); a second unseat is still 200."
    );
    const table = await newTable("Walk Refuse");
    for (const guestCount of [0, 100]) {
      const bad = await seatWalkInTabletRaw(
        tabletToken,
        managerSession,
        table.id,
        guestCount
      );
      expect(bad.status, `guestCount ${guestCount}`).toBe(400);
      expect(errorCode(bad.data)).toBe("SYSTEM_VALIDATION_ERROR");
    }
    const unknown = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      "00000000-0000-4000-8000-000000000000",
      2
    );
    expect(unknown.status, msg(unknown.data)).toBe(404);
    expect(errorCode(unknown.data)).toBe("TABLE_NOT_FOUND");

    expect(
      (await seatWalkInTabletRaw(tabletToken, managerSession, table.id, 2))
        .status
    ).toBe(200);
    const twice = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      table.id,
      2
    );
    expect(twice.status, msg(twice.data)).toBe(409);
    expect(errorCode(twice.data)).toBe("RESERVATION_CONFLICT");

    const left = await unseatWalkInTabletRaw(
      tabletToken,
      managerSession,
      table.id
    );
    expect(left.status, msg(left.data)).toBe(200);
    expect((await floorRow(table.id))?.state).toBe("AVAILABLE");
    const leftAgain = await unseatWalkInTabletRaw(
      tabletToken,
      managerSession,
      table.id
    );
    expect(leftAgain.status, msg(leftAgain.data)).toBe(200);

    const busy = await newTable("Walk Busy");
    await openCheck(busy.id);
    const occupied = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      busy.id,
      2
    );
    expect(occupied.status, msg(occupied.data)).toBe(409);
    expect(errorCode(occupied.data)).toBe("RESERVATION_CONFLICT");

    const blockedTable = await newTable("Walk Blocked");
    expect(
      (
        await setTableStateTabletRaw(
          tabletToken,
          managerSession,
          blockedTable.id,
          "BLOCKED"
        )
      ).status
    ).toBe(200);
    const blocked = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      blockedTable.id,
      2
    );
    expect(blocked.status, msg(blocked.data)).toBe(409);
    expect(errorCode(blocked.data)).toBe("RESERVATION_CONFLICT");
  });

  test("TC-734: a walk-in may sit at a PAID table — the old turn closes and the table reads SEATED", async () => {
    await allure.description(
      "Seating the next party is the host saying the table was reset: a " +
        "PAID table (default policy) accepts a walk-in seat (200), its turn " +
        "closes SEATED_OVER, and the floor reads SEATED with no paidTurn."
    );
    const table = await newTable("Paid Seat");
    await payInFull(await openCheck(table.id));
    expect((await floorRow(table.id))?.state).toBe("PAID");

    const seated = await seatWalkInTabletRaw(
      tabletToken,
      managerSession,
      table.id,
      2
    );
    expect(seated.status, msg(seated.data)).toBe(200);
    const row = await floorRow(table.id);
    expect(row?.state).toBe("SEATED");
    expect(row?.paidTurn).toBeFalsy();
  });

  // ── Floor extras, waitlist quote, insights ──────────────────────────────

  test("TC-735: the floor's server strip counts the manager's open tables and covers", async () => {
    await allure.description(
      "GET /api/tablet/floor → `servers`: one row per server with open " +
        "checks. After the MANAGER opens a check for 4 guests, their row " +
        "has openTables ≥ 1 and covers ≥ 4."
    );
    const table = await newTable("Server Strip");
    await openCheck(table.id, { guestCount: 4 });
    const servers = (await floor()).servers as any[];
    const mine = servers.find((s) => s.staffMemberId === managerStaffMemberId);
    expect(mine, JSON.stringify(servers)).toBeTruthy();
    expect(mine.openTables).toBeGreaterThanOrEqual(1);
    expect(mine.covers).toBeGreaterThanOrEqual(4);
    expect(mine.lastSatAt).toBeTruthy();
  });

  test("TC-736: waitlist quote — a party of 2 gets a LIVE quote with fitting tables; party size 0 and 100 → 400", async () => {
    await allure.description(
      "GET /api/tablet/waitlist/quote?partySize=2 on a floor with free " +
        "4-tops → 200, reason LIVE, fittingTables ≥ 1, and a low/high " +
        "range where low ≤ high. partySize 0 and 100 (1..99) → 400 " +
        "RESERVATION_PARTY_SIZE_INVALID."
    );
    await newTable("Quote Free");
    const quote = await getWaitlistQuoteTabletRaw(
      tabletToken,
      managerSession,
      2
    );
    expect(quote.status, msg(quote.data)).toBe(200);
    const q = unwrap(quote);
    expect(q.reason).toBe("LIVE");
    expect(q.fittingTables).toBeGreaterThanOrEqual(1);
    expect(typeof q.partiesAhead).toBe("number");
    if (q.lowMinutes != null && q.highMinutes != null)
      expect(q.lowMinutes).toBeLessThanOrEqual(q.highMinutes);

    for (const partySize of [0, 100]) {
      const bad = await getWaitlistQuoteTabletRaw(
        tabletToken,
        managerSession,
        partySize
      );
      expect(bad.status, `partySize ${partySize}`).toBe(400);
      expect(errorCode(bad.data)).toBe("RESERVATION_PARTY_SIZE_INVALID");
    }
  });

  test("TC-737: turn insights count this run's turns by how they cleared; an unsupported `days` falls back to 30", async () => {
    await allure.description(
      "GET /restaurant/:rid/reservation-turn-times/insights?days=7 after " +
        "the turns above: days 7, totalTurns ≥ 4, clearedManually ≥ 1 " +
        "(TC-728's Clear), clearedBySeating ≥ 2 (TC-727's next check, " +
        "TC-734's walk-in), and bookingSources zero-filled for WEB / MOBILE " +
        "/ PHONE. ?days=5 isn't an option → answered for 30 days."
    );
    const res = await getTurnInsightsOwnerRaw(token, restaurantId, 7);
    expect(res.status, msg(res.data)).toBe(200);
    const insights = unwrap(res);
    expect(insights.days).toBe(7);
    expect(insights.totalTurns).toBeGreaterThanOrEqual(4);
    expect(insights.clearedManually).toBeGreaterThanOrEqual(1);
    expect(insights.clearedBySeating).toBeGreaterThanOrEqual(2);
    for (const source of ["WEB", "MOBILE", "PHONE"])
      expect(typeof insights.bookingSources?.[source], source).toBe("number");

    const fallback = await getTurnInsightsOwnerRaw(token, restaurantId, 5);
    expect(fallback.status, msg(fallback.data)).toBe(200);
    expect(unwrap(fallback).days).toBe(30);
  });
});
