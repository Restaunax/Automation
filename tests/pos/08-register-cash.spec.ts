/**
 * 08-register-cash.spec.ts — Register / cash-drawer (POS, API level): the
 * open/close lifecycle, the drawer-exclusive lock, cash-leg math, and the
 * capability/ownership splits that decide whose PIN moves whose money.
 * Feature: table-management-reservations-eager-teacup family (register
 * plumbing shared with the table-service tab endpoints file 03 covers).
 *
 * Own tenant: the WHOLE file runs on a per-run throwaway restaurant owned by
 * an admin-minted OWNER (`createSecondOwner`) — cash legs need a register
 * session and this file deliberately provisions a SECOND device (TC-427),
 * so mutating the shared seed restaurant would leak state. Setup chain:
 * settings PUT (tableServiceEnabled + acceptingOrders) → entitlement grant
 * (parity with the other two files in this task; register endpoints
 * themselves don't gate on it) → menu item → REGISTER device #1
 * (admin-created) → tablet login → owner POS PIN (MANAGER) → staff sign-in.
 * TC-427 mints a SECOND device and flips it to KITCHEN_DISPLAY via the owner
 * device-mode PATCH (task-3's one new apiHelper wrapper,
 * `updateDeviceModeOwnerRaw`) — the brief's ONE deliberate exception to "one
 * tabletLogin per file."
 *
 * Response envelope: register endpoints (status/open/close) wrap in
 * {success, data, message} — `unwrap()`. The tab/* settlement endpoints
 * (settle-cash) answer FLAT, same as file 03 — read directly off `.data`.
 *
 * Discrepancies from the brief, confirmed against source (server is
 * authority — see task-3-report.md):
 *   - TC-427/431: the brief's label "DEVICE_NOT_REGISTER" and
 *     "REGISTER_ALREADY_OPEN" are the internal service error codes, not the
 *     wire `errorCode` — every register-service error maps to the generic
 *     `errorCode: SYSTEM_VALIDATION_ERROR` (400) via `handleServiceError`.
 *     Assertions here key on status + message text, matching the actual
 *     `error:register.*` locale strings (confirmed against
 *     `src/locales/en/error.json`).
 *   - TC-431: the brief itself flags this — signing in a second PIN staff
 *     member while the register is open and assigned to someone else hits
 *     `enforceRegisterLock` INSIDE `signIn` itself, before settle-cash is
 *     ever reached. A plain STAFF/SHIFT_LEAD member lacks
 *     OVERRIDE_TERMINAL_LOCK, so sign-in itself is refused 403
 *     STAFF_TERMINAL_LOCKED — DRAWER_NOT_YOURS is unreachable from this
 *     angle (it guards settle-cash's own drawer check, one call deeper).
 *   - TC-433: overShort = countedCash − expectedCash (confirmed against
 *     `registerSessionService.ts`'s own header comment) — short is
 *     NEGATIVE. countedCash 5 under expected → overShort -5.
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
  updateDeviceModeOwnerRaw,
  updateRestaurantSettingsApi,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletStaffSignInRaw,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  getOrderStatisticsDetailRaw,
  getRegisterStatusPosRaw,
  createPinStaffTabletRaw,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  settleTabCashRaw,
  openRegisterSessionPosRaw,
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

/** Register endpoints wrap their success payload in {success, data,
 *  message} — pull the real payload out. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("POS — Register / Cash Drawer", () => {
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
  /** TC-427's second device (flipped to KITCHEN_DISPLAY) — the file's ONE
   *  deliberate exception to one tabletLogin per file. */
  let secondDevice: TabletDevice | undefined;
  let tabletToken = "";
  /** Currently-active MANAGER staff session on device #1. */
  let staffSession = "";
  let managerStaffMemberId = "";
  const managerPin = "8462";
  /** Every check this file opens — swept in afterAll (settle-or-cancel). */
  const openedOrderIds: string[] = [];
  /** Tracks whether a register session is currently open on device #1, so
   *  afterAll knows whether to close it. */
  let registerOpenOnDevice1 = false;

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  /** Open a table-service check and track it for the afterAll sweep. */
  const openCheck = async (tableName: string, qty: number) => {
    const res = await createTabletOrderRaw(tabletToken, staffSession, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: round2(ITEM_PRICE * qty),
      tax: 0,
      tip: 0,
      total: round2(ITEM_PRICE * qty),
      customerPhone: "",
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: qty,
          price: ITEM_PRICE,
        },
      ],
      openCheck: true,
      tableName,
      guestCount: 2,
    });
    expect(res.status, msg(res.data)).toBe(201);
    const id = res.data.id!;
    openedOrderIds.push(id);
    return { id, total: res.data.total! };
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[register-cash] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });

    // Parity with 06/07's setup (register endpoints themselves don't gate on
    // the entitlement — only harmless to have it granted anyway).
    await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );

    groupId = (
      await createMenuGroupNamed(token, `Automation Register ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Register Burger ${runId}`,
      ITEM_PRICE
    );

    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Register POS ${runId}`
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
        const cancel = await cancelTabletOrderRaw(
          tabletToken,
          staffSession,
          orderId,
          "Automation cleanup"
        );
        if (!cancel.ok && registerOpenOnDevice1) {
          // Settled legs block cancel — close it out with cash instead.
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
        console.warn(`[register-cash] cleanup failed for ${orderId}:`, err);
      }
    }
    if (registerOpenOnDevice1) {
      // Best-effort: whatever the true expected total is, an oversized
      // countedCash still closes the session so it doesn't linger against
      // the throwaway tenant.
      await closeRegisterSessionPosRaw(tabletToken, staffSession, {
        countedCash: 1_000_000,
      }).catch(() => {
        /* tenant is about to be archived regardless */
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
    // Best-effort: the throwaway restaurant these belong to is archived
    // below regardless — a stray menu item/group orphaned by a failed
    // delete here is harmless, and a teardown failure would only mask the
    // test results above.
    if (item)
      await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    if (secondDevice)
      await deactivateTabletDevice(t, restaurantId, secondDevice.id);
    // Best-effort: a failed archive orphans a harmless throwaway tenant
    // rather than masking the test results above with a teardown failure.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Register / Cash Drawer");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test("TC-426: settle-cash is refused with no open register — asserted BEFORE any register/open in this file", async () => {
    await allure.description(
      "assertDrawerOperableBy returns null when NO session is open on this " +
        "device; settle-cash then answers 400 with error:register.notOpen " +
        "('There is no open register on this device.'). This runs first in " +
        "the file, before device #1 ever opens a session."
    );
    const { id } = await openCheck(`Register Gate ${runId}`, 1);
    const attempt = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: ITEM_PRICE,
      cashTendered: ITEM_PRICE,
      idempotencyKey: `tc426-${runId}`,
    });
    expect(attempt.status, msg(attempt.data)).toBe(400);
    expect(msg(attempt.data).toLowerCase()).toContain("no open register");
  });

  test("TC-427: DEVICE_NOT_REGISTER — a KITCHEN_DISPLAY device refuses register/open", async () => {
    await allure.description(
      "A second device, flipped to KITCHEN_DISPLAY by the owner (device-mode " +
        "PATCH), signs in the SAME manager and calls register/open → 400 " +
        "with error:register.notRegisterDevice ('This device is not a " +
        "register, so it has no cash drawer.'). The ONE deliberate second " +
        "tabletLogin in this task."
    );
    secondDevice = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Register KDS ${runId}`
    );
    const modeChange = await updateDeviceModeOwnerRaw(
      token,
      restaurantId,
      secondDevice.id,
      "KITCHEN_DISPLAY"
    );
    expect(modeChange.status, msg(modeChange.data)).toBe(200);

    const secondTabletToken = await tabletLogin(
      secondDevice.name,
      secondDevice.code
    );
    const secondSession = await tabletStaffSignIn(
      secondTabletToken,
      managerStaffMemberId,
      managerPin
    );

    const attempt = await openRegisterSessionPosRaw(
      secondTabletToken,
      secondSession,
      { openingFloat: 100 }
    );
    expect(attempt.status, msg(attempt.data)).toBe(400);
    expect(msg(attempt.data).toLowerCase()).toContain("not a register");
  });

  test("TC-428: open succeeds once; a second open on the same device is refused", async () => {
    await allure.description(
      "POST register/open {openingFloat:100} → 201 on device #1 (a " +
        "REGISTER-mode device the manager self-authorizes via " +
        "OPEN_REGISTER). A second open while one is already active → 400 " +
        "error:register.alreadyOpen."
    );
    const opened = await openRegisterSessionPosRaw(tabletToken, staffSession, {
      openingFloat: 100,
    });
    expect(opened.status, msg(opened.data)).toBe(201);
    expect(unwrap(opened).sessionId).toBeTruthy();
    registerOpenOnDevice1 = true;

    const again = await openRegisterSessionPosRaw(tabletToken, staffSession, {
      openingFloat: 50,
    });
    expect(again.status, msg(again.data)).toBe(400);
    expect(msg(again.data).toLowerCase()).toContain("already open");
  });

  test("TC-429: cash math — cashTendered over the amount computes exact change; under the amount is refused", async () => {
    await allure.description(
      "settle-cash: cashTendered=15 against a $10 leg → cashChange 5. " +
        "cashTendered=5 against a $10 leg → 400 (cashTendered checked BEFORE " +
        "the drawer gate, so this fires on its own input validation)."
    );
    const { id } = await openCheck(`Cash Math ${runId}`, 1); // total 10

    const over = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: ITEM_PRICE,
      cashTendered: 15,
      idempotencyKey: `tc429-over-${runId}`,
    });
    expect(over.status, msg(over.data)).toBe(200);
    expect(over.data.cashChange).toBe(5);
    expect(over.data.closed).toBe(true);

    const { id: id2 } = await openCheck(`Cash Math Under ${runId}`, 1);
    const under = await settleTabCashRaw(tabletToken, staffSession, id2, {
      amount: ITEM_PRICE,
      cashTendered: 5,
      idempotencyKey: `tc429-under-${runId}`,
    });
    expect(under.status, msg(under.data)).toBe(400);
  });

  test("TC-430: idempotency replay — the same key twice produces exactly ONE payment row", async () => {
    await allure.description(
      "Two settle-cash calls with the SAME idempotencyKey: the first is a " +
        "genuine leg, the second replays it (replayed:true, same leg id, " +
        "remaining unchanged) — the owner statistics detail endpoint (the " +
        "one whose Prisma `include` actually selects `payments` — " +
        "getOrderFullRaw's own route does NOT) shows exactly one SUCCEEDED " +
        "payment for this order."
    );
    const { id } = await openCheck(`Idempotent ${runId}`, 2); // total 20
    const key = `tc430-${runId}`;

    const first = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: key,
    });
    expect(first.status, msg(first.data)).toBe(200);
    const legId = first.data.leg?.id;
    expect(first.data.remaining).toBe(10);

    const replay = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: key,
    });
    expect(replay.status, msg(replay.data)).toBe(200);
    expect(replay.data.replayed).toBe(true);
    expect(replay.data.leg?.id).toBe(legId);
    expect(replay.data.remaining).toBe(10);

    const full = await getOrderStatisticsDetailRaw(token, id);
    expect(full.status, msg(full.data)).toBe(200);
    const payments = (full.data.payments as any[]) ?? [];
    const succeeded = payments.filter(
      (p) => p.status === "SUCCEEDED" && p.paymentMethod === "CASH"
    );
    expect(succeeded.length).toBe(1);

    // Close it out so the drawer expectation later matches exactly.
    const close = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: `tc430-close-${runId}`,
    });
    expect(close.data.closed).toBe(true);
  });

  test("TC-431: a second PIN staff cannot even sign in while the register is open elsewhere — STAFF_TERMINAL_LOCKED fires first", async () => {
    await allure.description(
      "A minted STAFF-role member (no OVERRIDE_TERMINAL_LOCK) tries to sign " +
        "in on device #1 while its register session is open and assigned to " +
        "the manager: enforceRegisterLock refuses INSIDE sign-in itself → 403 " +
        "STAFF_TERMINAL_LOCKED. DRAWER_NOT_YOURS (settle-cash's own ownership " +
        "check) is never reached from this angle — recorded as the resolved " +
        "discrepancy the brief flagged."
    );
    const staffCreate = await createPinStaffTabletRaw(
      tabletToken,
      staffSession,
      {
        firstName: "Auto",
        lastName: `Drawer${runId}`,
        pin: "2468",
        staffRole: "STAFF",
      }
    );
    expect(staffCreate.status, msg(staffCreate.data)).toBe(201);
    const otherStaffMemberId = unwrap(staffCreate).id;

    // Confirm the precondition this whole TC rests on: device #1's register
    // is open and assigned to the manager (not the new STAFF member).
    const statusCheck = await getRegisterStatusPosRaw(
      tabletToken,
      staffSession
    );
    expect(statusCheck.status, msg(statusCheck.data)).toBe(200);
    const statusData = unwrap(statusCheck);
    expect(statusData.open).toBe(true);
    expect(statusData.session?.assignedStaffMember?.id).toBe(
      managerStaffMemberId
    );

    const attempt = await tabletStaffSignInRaw(
      tabletToken,
      otherStaffMemberId,
      "2468"
    );
    expect(attempt.status, msg(attempt.data)).toBe(403);
    expect(errorCode(attempt.data)).toBe("STAFF_TERMINAL_LOCKED");
  });

  test("TC-432: split tenders — two cash legs close a check, the first leaves it open with the correct remaining", async () => {
    await allure.description(
      "One $20 check, two $10 cash legs: the first answers closed:false " +
        "with remaining 10; the second closes it (closed:true, remaining 0)."
    );
    const { id } = await openCheck(`Split ${runId}`, 2); // total 20

    const leg1 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: `tc432-1-${runId}`,
    });
    expect(leg1.status, msg(leg1.data)).toBe(200);
    expect(leg1.data.closed).toBe(false);
    expect(leg1.data.remaining).toBe(10);

    const leg2 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: `tc432-2-${runId}`,
    });
    expect(leg2.status, msg(leg2.data)).toBe(200);
    expect(leg2.data.closed).toBe(true);
    expect(leg2.data.remaining).toBe(0);
  });

  test("TC-433: blind-count close — an exact count zeroes overShort; a 5-off recount is NEGATIVE five (short)", async () => {
    await allure.description(
      "First, close out the session TC-428 opened (carrying TC-429/430/432's " +
        "cash legs) with no assertion on its own figure — just freeing the " +
        "device for a clean pair of probes. Then TWO fresh open+close cycles " +
        "with NO sales in between, so expectedCash is exactly the opening " +
        'float: countedCash == float → overShort 0 ("the float back exactly" ' +
        "IS the exact-match case); countedCash 5 LESS than float → overShort " +
        "-5 (sign convention: countedCash - expectedCash, confirmed against " +
        "registerSessionService.ts's own header comment — short is negative)."
    );
    // Free the device — this session's own figure is incidental to what
    // this TC is testing (the sign convention), not asserted here.
    const freed = await closeRegisterSessionPosRaw(tabletToken, staffSession, {
      countedCash: 1_000_000,
    });
    expect(freed.status, msg(freed.data)).toBe(200);
    registerOpenOnDevice1 = false;

    const openedExact = await openRegisterSessionPosRaw(
      tabletToken,
      staffSession,
      { openingFloat: 100 }
    );
    expect(openedExact.status, msg(openedExact.data)).toBe(201);
    registerOpenOnDevice1 = true;

    const exact = await closeRegisterSessionPosRaw(tabletToken, staffSession, {
      countedCash: 100,
    });
    expect(exact.status, msg(exact.data)).toBe(200);
    const exactData = unwrap(exact);
    expect(exactData.expectedCash).toBe(100);
    expect(exactData.overShort).toBe(0);
    registerOpenOnDevice1 = false;

    const openedShort = await openRegisterSessionPosRaw(
      tabletToken,
      staffSession,
      { openingFloat: 100 }
    );
    expect(openedShort.status, msg(openedShort.data)).toBe(201);
    registerOpenOnDevice1 = true;

    const short = await closeRegisterSessionPosRaw(tabletToken, staffSession, {
      countedCash: 95,
    });
    expect(short.status, msg(short.data)).toBe(200);
    const shortData = unwrap(short);
    expect(shortData.expectedCash).toBe(100);
    expect(shortData.overShort).toBe(-5);
    registerOpenOnDevice1 = false;
  });
});
