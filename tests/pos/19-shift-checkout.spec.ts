/**
 * 19-shift-checkout.spec.ts — shift checkout at clock-out (W0:MF-1) on QA
 * (TC-1500..1506).
 *
 * No browser. A per-run throwaway restaurant with TIP_MANAGEMENT and a POS
 * device. The owner (their own staff row, "Clocks in" on) clocks in and out on
 * the time clock, declaring $5 in cash tips. The clock-out answer carries a
 * 15-minute checkout token for that shift on that device; the checkout reads
 * back sales, tips, tip-outs, net tips and cash owed to the house, labelled in
 * the request language, with the "estimate until approved" note. The same
 * figures reach Restaunax Staff ("My shift").
 *
 * What an older POS sees: clock-out answers exactly the fields it always did
 * (the token is one extra field it ignores), and nothing calls the checkout.
 *
 * Gating: needs admin credentials to mint the tenant — FAILS (never skips)
 * without them, per the back-office testing policy.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  createTabletDevice,
  deactivateTabletDevice,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  setOwnerPosPin,
  staffAppRaw,
  tabletLogin,
  tabletRaw,
  tabletStaffSignIn,
  type LooseJson,
} from "../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const lines = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const keys = (c: Rec) => lines(c.lines).map((l) => String(l.key));
const PIN = "6284";

test.describe.configure({ mode: "serial" });

test.describe("Shift checkout at clock-out (POS API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let tabletToken = "";
  let otherTabletToken = "";
  const deviceIds: string[] = [];
  let ownerStaffId = "";
  let shiftId = "";
  let checkoutToken = "";
  let clockOut: Rec = {};

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "[19-shift-checkout] ADMIN_EMAIL / ADMIN_PASSWORD must be set: this file mints its own tenant"
      );
    }
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[19-shift-checkout] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      true
    );
    if (!g.ok)
      throw new Error(`[19-shift-checkout] grant: ${JSON.stringify(g.data)}`);

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-checkout-${runId}`
    );
    deviceIds.push(device.id);
    tabletToken = await tabletLogin(device.name, device.code);
    const other = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-checkout-2-${runId}`
    );
    deviceIds.push(other.id);
    otherTabletToken = await tabletLogin(other.name, other.code);

    ownerStaffId = await setOwnerPosPin(ownerToken, restaurantId, PIN, {
      clocksIn: true,
    });
    const inRes = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
      staffMemberId: ownerStaffId,
      pin: PIN,
    });
    if (!inRes.ok)
      throw new Error(
        `[19-shift-checkout] clock-in: ${JSON.stringify(inRes.data)}`
      );
    const outRes = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/clock-out",
      { staffMemberId: ownerStaffId, pin: PIN, cashTipsCents: 500 }
    );
    if (!outRes.ok)
      throw new Error(
        `[19-shift-checkout] clock-out: ${JSON.stringify(outRes.data)}`
      );
    clockOut = outRes.data.data as Rec;
    shiftId = String(clockOut.shift?.id ?? "");
    checkoutToken = String(clockOut.checkoutToken ?? "");
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      for (const id of deviceIds)
        await deactivateTabletDevice(adminToken, restaurantId, id);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Shift checkout");
    await allure.label("severity", "critical");
  });

  const get = (
    token: string,
    headers: Record<string, string>,
    device = tabletToken
  ) =>
    tabletRaw<Rec>(
      device,
      "GET",
      "/staff/shift-checkout",
      undefined,
      undefined,
      token ? { "x-shift-checkout": token, ...headers } : headers
    );

  test("TC-1500: clock-out still answers what an older POS reads, plus a checkout token", async () => {
    expect(clockOut.staffMember?.id).toBe(ownerStaffId);
    expect(shiftId).not.toBe("");
    expect(clockOut.cashTipsDeclared).toBe(true);
    expect(checkoutToken.split(".")).toHaveLength(3);
  });

  test("TC-1501: the checkout reads back the shift with resolved labels and the estimate note", async () => {
    const res = await get(checkoutToken, { "accept-language": "en" });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const c = res.data.data as Rec;
    expect(c.shift.id).toBe(shiftId);
    expect(c.staffMember.id).toBe(ownerStaffId);
    expect(c.title).toBe("Shift checkout");
    expect(c.estimate).toBe(true);
    expect(String(c.note)).toMatch(/^Estimate:/);
    // TIP_MANAGEMENT: the tip-share lines are there.
    for (const k of [
      "orders",
      "sales",
      "cardTips",
      "cashTips",
      "declaredCash",
      "tipOutGiven",
      "tipOutReceived",
      "poolShare",
      "netTips",
      "cashCollected",
      "cashOwedToHouse",
    ])
      expect(keys(c), k).toContain(k);
    for (const l of lines(c.lines)) {
      expect(String(l.label)).not.toMatch(/^api:|shiftCheckout\./);
      expect(Number.isInteger(l.value)).toBe(true);
    }
    // The $5 declared is theirs: in net tips, never owed to the house.
    expect(c.figures.declaredCashCents).toBe(500);
    expect(c.figures.netTipsCents).toBeGreaterThanOrEqual(500);
    expect(c.figures.cashOwedToHouseCents).toBe(
      c.figures.cashCollectedCents - c.figures.cashTipsKeptCents
    );
  });

  test("TC-1502: labels follow the request language", async () => {
    const res = await get(checkoutToken, { "accept-language": "es" });
    expect(res.status).toBe(200);
    const c = res.data.data as Rec;
    expect(c.title).toBe("Cierre de turno");
    expect(lines(c.lines).find((l) => l.key === "cashOwedToHouse")?.label).toBe(
      "Efectivo que debes a la casa"
    );
  });

  test("TC-1503: no token, a forged token, or another device's token is refused", async () => {
    expect((await get("", {})).status).toBe(401);
    expect((await get("not.a.token", {})).status).toBe(401);
    expect((await get(checkoutToken, {}, otherTabletToken)).status).toBe(401);
  });

  test("TC-1504: a signed-in terminal session reads that person's latest shift", async () => {
    const session = await tabletStaffSignIn(tabletToken, ownerStaffId, PIN);
    const res = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/staff/shift-checkout",
      undefined,
      session
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.data.shift.id).toBe(shiftId);
  });

  test('TC-1505: Restaunax Staff shows the same checkout as "My shift"', async () => {
    const pos = (await get(checkoutToken, {})).data.data as Rec;
    const res = await staffAppRaw<{ data: Rec }>(
      ownerToken,
      "GET",
      `/restaurants/${restaurantId}/shift-checkout`
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.data.shift.id).toBe(shiftId);
    expect(res.data.data.figures).toEqual(pos.figures);
  });

  test("TC-1506: Restaunax Staff refuses a restaurant I don't work at", async () => {
    const res = await staffAppRaw(
      ownerToken,
      "GET",
      `/restaurants/00000000-0000-0000-0000-000000000000/shift-checkout`
    );
    expect(res.status).toBe(404);
  });
});
