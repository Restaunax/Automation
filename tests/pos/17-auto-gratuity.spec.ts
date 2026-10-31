/**
 * 17-auto-gratuity.spec.ts — the auto-gratuity on the floor: a big party's
 * check carries it, it follows the party size, removing it is a manager's
 * call unless the owner says otherwise, a payment freezes it, the day close
 * shows it apart from tips, and a "paid to staff" gratuity reaches the server
 * as wages (docs/COVERAGE_MAP.md G7) (TC-1066..1073).
 *
 * The owner's settings screen and its rules are TC-958..964; this is the
 * POS, played through its own API as device-in-store calls it.
 *
 * A per-run throwaway restaurant (table service, 7% tax): parties of 6 or
 * more get 18%, not taxed, kept by the house. The owner holds the drawer and
 * is the manager; Dee is a Staff-role server who rings the checks.
 *
 * A burger is $12. Six burgers: $72 + $5.04 tax + $12.96 gratuity = $90.00.
 *
 *   TC-1066 A party of 6 gets the 18% on its own; a party of 4 doesn't.
 *   TC-1067 The party of 4 becomes 6: the gratuity is added; a party of 0 is
 *           refused in words.
 *   TC-1068 Removing it: Dee needs a manager PIN; with the owner's PIN it
 *           comes off and stays off when the party grows; Dee adds it back
 *           by hand.
 *   TC-1069 The owner lets servers remove it: Dee removes it with no PIN.
 *   TC-1070 Once a payment lands the gratuity can't change, in words; the
 *           rest is paid and the check closes.
 *   TC-1071 With the rule off, adding it by hand is refused in words.
 *   TC-1072 The day close shows the gratuity on its own line, not as tips.
 *   TC-1073 "Paid to staff — the server on the check": Dee's 6-top
 *           gratuity shows on her tips report as service charges (wages),
 *           not inside her tips.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  updateRestaurantSettingsRaw,
  ensureTaxRate,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  openRegisterSessionPos,
  createTabletOrderRaw,
  settleTabCashRaw,
  setFeatureOverrideAdminRaw,
  tipsRaw,
  type LooseJson,
} from "../../utils/apiHelper";
import { AUTO_GRATUITY_HOUSE } from "../../utils/backOfficeApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_PIN = "8462";

type Rec = Record<string, LooseJson>;
const msg = (data: unknown) => String((data as Rec | undefined)?.message ?? "");
const orderOf = (data: unknown) =>
  ((data as Rec | undefined)?.order ?? {}) as Rec;

test.describe.configure({ mode: "serial" });

test.describe("POS auto-gratuity (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tablet = "";
  let ownerToken = "";
  let owner = { id: "", session: "" };
  const dee = { id: "", pin: "4826", session: "" };
  const burger = { id: "", name: "Burger", price: 12 };
  /** T1: the party of 6. T2: the party of 4 that grows. */
  let t1 = "";
  let t2 = "";

  const rule = (patch: Rec = {}) =>
    updateRestaurantSettingsRaw(ownerToken, restaurantId, {
      autoGratuity: { ...AUTO_GRATUITY_HOUSE, ...patch },
    });
  /** Dee opens a table check: `burgers` burgers for `guests` guests. */
  const openCheck = async (table: string, guests: number, burgers: number) => {
    const subtotal = burgers * 12;
    const tax = Math.round(subtotal * 7) / 100;
    const r = await createTabletOrderRaw(tablet, dee.session, {
      restaurantId,
      orderType: "DINE_IN",
      subtotal,
      tax,
      tip: 0,
      total: subtotal + tax,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: burger.id,
          menuItemName: burger.name,
          quantity: burgers,
          price: 12,
        },
      ],
      openCheck: true,
      tableName: `${table}-${runId}`,
      guestCount: guests,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    return { id: String(r.data.id), total: Number(r.data.total) };
  };
  const gratuityPath = (orderId: string, act: "apply" | "waive") =>
    `/orders/${orderId}/tab/gratuity/${act}`;
  const guestCount = (orderId: string, n: number, session: string) =>
    tabletRaw<Rec>(
      tablet,
      "PATCH",
      `/orders/${orderId}/tab/guest-count`,
      { guestCount: n },
      session
    );

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[auto-gratuity] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    const set = await rule();
    if (set.status !== 200)
      throw new Error(`[auto-gratuity] rule: ${JSON.stringify(set.data)}`);
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(ownerToken, restaurantId);

    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burger.id = (
      await createMenuItemFull(ownerToken, food.id, burger.name, burger.price)
    ).id;

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-grat-${runId}`
    );
    deviceId = device.id;
    tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(
      ownerToken,
      restaurantId,
      OWNER_PIN
    );
    owner = {
      id: ownerMember,
      session: await tabletStaffSignIn(tablet, ownerMember, OWNER_PIN),
    };
    const added = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/staff/manage",
      { firstName: "Dee", lastName: "Server", pin: dee.pin },
      owner.session
    );
    if (added.status !== 201)
      throw new Error(`[auto-gratuity] staff: ${JSON.stringify(added.data)}`);
    dee.id = String((added.data.data as Rec).id);
    dee.session = await tabletStaffSignIn(tablet, dee.id, dee.pin);
    await openRegisterSessionPos(tablet, owner.session, 100);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS auto-gratuity");
    await allure.label("severity", "critical");
  });

  test("TC-1066: a party of 6 gets the 18% on its own; a party of 4 doesn't", async () => {
    const six = await openCheck("T1", 6, 6);
    t1 = six.id;
    // $72 + $5.04 tax + $12.96 gratuity.
    expect(six.total).toBe(90);
    const four = await openCheck("T2", 4, 4);
    t2 = four.id;
    expect(four.total).toBe(51.36);
  });

  test("TC-1067: the party of 4 becomes 6 and the gratuity is added; a party of 0 is refused in words", async () => {
    const zero = await guestCount(t2, 0, dee.session);
    expect(zero.status).toBe(400);
    expect(msg(zero.data)).toMatch(
      /^Guest count must be a whole number from 1 to \d+\.$/
    );
    const six = await guestCount(t2, 6, dee.session);
    expect(six.status, JSON.stringify(six.data)).toBe(200);
    // $48 + $3.36 tax + $8.64 gratuity.
    expect(orderOf(six.data)).toMatchObject({
      guestCount: 6,
      autoGratuity: 8.64,
      autoGratuityPercent: 18,
      autoGratuityLabel: "Gratuity",
      total: 60,
    });
  });

  test("TC-1068: removing it needs a manager — it stays off when the party grows; Dee adds it back", async () => {
    const byDee = await tabletRaw<Rec>(
      tablet,
      "POST",
      gratuityPath(t1, "waive"),
      {},
      dee.session
    );
    expect(byDee.status).toBe(400);
    expect(msg(byDee.data)).toBe("A manager PIN is required.");

    const approved = await tabletRaw<Rec>(
      tablet,
      "POST",
      gratuityPath(t1, "waive"),
      {
        managerPin: OWNER_PIN,
        approverStaffMemberId: owner.id,
        reason: "Regulars, they tip more",
      },
      dee.session
    );
    expect(approved.status, JSON.stringify(approved.data)).toBe(200);
    expect(orderOf(approved.data)).toMatchObject({
      autoGratuity: 0,
      autoGratuityPercent: null,
      total: 77.04,
    });
    expect(orderOf(approved.data).autoGratuityWaivedAt).toBeTruthy();

    // A seventh guest sits down: a removed gratuity stays removed.
    const seven = await guestCount(t1, 7, dee.session);
    expect(seven.status, JSON.stringify(seven.data)).toBe(200);
    expect(orderOf(seven.data)).toMatchObject({
      guestCount: 7,
      autoGratuity: 0,
    });

    // Adding a disclosed charge needs no approval.
    const back = await tabletRaw<Rec>(
      tablet,
      "POST",
      gratuityPath(t1, "apply"),
      {},
      dee.session
    );
    expect(back.status, JSON.stringify(back.data)).toBe(200);
    expect(orderOf(back.data)).toMatchObject({
      autoGratuity: 12.96,
      total: 90,
      autoGratuityWaivedAt: null,
    });
  });

  test("TC-1069: the owner lets servers remove it — Dee removes it with no PIN", async () => {
    const allow = await rule({ staffCanWaive: true });
    expect(allow.status, JSON.stringify(allow.data)).toBe(200);
    const waived = await tabletRaw<Rec>(
      tablet,
      "POST",
      gratuityPath(t2, "waive"),
      {},
      dee.session
    );
    expect(waived.status, JSON.stringify(waived.data)).toBe(200);
    expect(orderOf(waived.data)).toMatchObject({
      autoGratuity: 0,
      total: 51.36,
    });
  });

  test("TC-1070: once a payment lands the gratuity can't change; the rest is paid and the check closes", async () => {
    const half = await settleTabCashRaw(tablet, owner.session, t1, {
      amount: 45,
      cashTendered: 45,
      idempotencyKey: `grat-${runId}-t1-half`,
    });
    expect(half.status, JSON.stringify(half.data)).toBe(200);
    expect(half.data.remaining).toBe(45);

    const frozen = await tabletRaw<Rec>(
      tablet,
      "POST",
      gratuityPath(t1, "waive"),
      {},
      dee.session
    );
    expect(frozen.status).toBe(409);
    expect(msg(frozen.data)).toBe(
      "A payment has already been taken on this check, so its gratuity can no longer change."
    );

    const rest = await settleTabCashRaw(tablet, owner.session, t1, {
      amount: 45,
      cashTendered: 50,
      idempotencyKey: `grat-${runId}-t1-rest`,
    });
    expect(rest.status, JSON.stringify(rest.data)).toBe(200);
    expect(rest.data).toMatchObject({ closed: true, remaining: 0 });
    // T2 (gratuity removed) is paid in full too.
    const t2paid = await settleTabCashRaw(tablet, owner.session, t2, {
      amount: 51.36,
      cashTendered: 60,
      idempotencyKey: `grat-${runId}-t2`,
    });
    expect(t2paid.status, JSON.stringify(t2paid.data)).toBe(200);
    expect(t2paid.data.closed).toBe(true);
  });

  test("TC-1071: with the rule off, adding it by hand is refused in words", async () => {
    const off = await rule({ enabled: false });
    expect(off.status, JSON.stringify(off.data)).toBe(200);
    const small = await openCheck("T3", 2, 1);
    const add = await tabletRaw<Rec>(
      tablet,
      "POST",
      gratuityPath(small.id, "apply"),
      {},
      dee.session
    );
    expect(add.status).toBe(400);
    expect(msg(add.data)).toBe(
      "Auto-gratuity is not turned on for this restaurant. Set it up in the dashboard first."
    );
    const cancelled = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/cancel-order/${small.id}`,
      { reason: "Test check" },
      owner.session
    );
    expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
    const on = await rule({ staffCanWaive: true });
    expect(on.status, JSON.stringify(on.data)).toBe(200);
  });

  test("TC-1072: the day close shows the gratuity on its own line, not as tips", async () => {
    const look = await tabletRaw<Rec>(
      tablet,
      "GET",
      "/day-close/preview",
      undefined,
      owner.session
    );
    expect(look.status, JSON.stringify(look.data)).toBe(200);
    const summary = ((look.data.data as Rec).summary ?? {}) as Rec;
    // T1 paid $12.96 of gratuity; T2's was removed.
    expect(summary).toMatchObject({
      autoGratuity: 12.96,
      tip: 0,
      orderCount: 2,
      grossSales: 141.36,
    });
  });

  test("TC-1073: 'paid to staff — the server on the check': Dee's gratuity is on her tips report as wages, not tips", async () => {
    const addon = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      true
    );
    expect(addon.ok, JSON.stringify(addon.data)).toBe(true);
    const staff = await rule({
      staffCanWaive: true,
      distribution: "STAFF",
      allocation: "CHECK_SERVER",
    });
    expect(staff.status, JSON.stringify(staff.data)).toBe(200);

    const check = await openCheck("T4", 6, 6);
    expect(check.total).toBe(90);
    const paid = await settleTabCashRaw(tablet, owner.session, check.id, {
      amount: 90,
      cashTendered: 90,
      idempotencyKey: `grat-${runId}-t4`,
    });
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    expect(paid.data.closed).toBe(true);

    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const report = await tipsRaw<{ data?: Rec }>(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${day(-1)}&endDate=${day(1)}`
    );
    expect(report.status, JSON.stringify(report.data)).toBe(200);
    const data = (report.data.data ?? {}) as Rec;
    const people = (data.people ?? []) as Rec[];
    const deeRow = people.find((p) => p.staffMemberId === dee.id);
    expect(deeRow, JSON.stringify(people)).toBeTruthy();
    // Wages, on their own line: never inside her tips or the tip totals.
    expect(deeRow).toMatchObject({ serviceChargeCents: 1296, netCents: 0 });
    expect((data.totals as Rec).totalTipsCents).toBe(0);
  });
});
