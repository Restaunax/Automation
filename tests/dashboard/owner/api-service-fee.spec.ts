/**
 * api-service-fee.spec.ts — the service fee (S1) on QA, every option for its
 * effect (TC-611..617).
 *
 * No browser. A per-run throwaway restaurant (core feature: no add-on), table
 * service on, one $10.00 item, published (so the public quote answers), a
 * REGISTER device with the owner signed in and the drawer open.
 *   - off by default; 3% on a $20.00 check = $0.60, inside the total;
 *   - a counter order's claim: right → kept, short → refused, no claim at all
 *     (a POS build from before the fee) → taken without it;
 *   - minimum subtotal, order types and channels (POS vs online quote);
 *   - taxable at the restaurant rate, tracked apart;
 *   - HOUSE vs STAFF frozen on the order; never a tip;
 *   - a device can't change the rule.
 * Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  updateRestaurantSettingsRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  openRegisterSessionPos,
  createTabletOrderRaw,
  getOrderFullRaw,
  quoteOrderRaw,
  setRestaurantPublishedApi,
  tabletRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const round2 = (n: number) => Math.round(n * 100) / 100;

test.describe.configure({ mode: "serial" });

test.describe("Service fee — every option for its effect (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tabletToken = "";
  let session = "";
  let item: { id: string; name: string };
  let table = 0;

  const RULE = {
    enabled: true,
    percent: 3,
    label: "Service fee",
    taxable: false,
    distribution: "HOUSE",
    orderTypes: ["DINE_IN", "PICKUP", "DELIVERY"],
    channels: ["POS", "ONLINE", "KIOSK", "VOICE"],
    minimumSubtotal: null,
    notice: "A 3% service fee is added to every order. It is not a tip.",
  };
  const rule = async (patch: Rec) => {
    const r = await updateRestaurantSettingsRaw(ownerToken, restaurantId, {
      serviceFee: { ...RULE, ...patch },
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
  };
  /** An open check of `qty` × $10.00, priced by the server; the stored order. */
  /** `foodTax`: the device's tax claim — the POS computes food tax itself
   *  (the server logs a mismatch, never refuses); the fee's tax is the server's. */
  const check = async (qty: number, foodTax = 0) => {
    table += 1;
    const r = await createTabletOrderRaw(tabletToken, session, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: 10 * qty,
      tax: foodTax,
      tip: 0,
      total: round2(10 * qty + foodTax),
      customerPhone: "",
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: qty,
          price: 10,
        },
      ],
      openCheck: true,
      tableName: `S${table}`,
      guestCount: 2,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    const read = await getOrderFullRaw(ownerToken, String(r.data.id));
    return read.data as Rec;
  };
  /** A counter cash order of 2 × $10.00 with the given claim. */
  const counter = (claim: Rec) =>
    createTabletOrderRaw(tabletToken, session, {
      restaurantId,
      orderType: "PICKUP",
      paymentMethod: "CASH",
      subtotal: 20,
      tax: 0,
      tip: 0,
      processingFee: 0,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: 2,
          price: 10,
        },
      ],
      ...claim,
    });
  const fee = (o: Rec) => Number(o.serviceFee ?? 0);

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-service-fee] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    // tax: 0 — a rate must be set (even 0%) or the online quote refuses.
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
      tax: 0,
    });
    const groupId = (
      await createMenuGroupNamed(ownerToken, `Fee ${runId}`, { restaurantId })
    ).id;
    item = await createMenuItemFull(
      ownerToken,
      groupId,
      `Fee Burger ${runId}`,
      10
    );
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-fee-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    const owner = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    session = await tabletStaffSignIn(tabletToken, owner, "8462");
    await openRegisterSessionPos(tabletToken, session, 100);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Service fee");
    await allure.label("severity", "critical");
  });

  test("TC-611: off by default; at 3% a $20.00 check carries $0.60 inside its total", async () => {
    const before = await check(2);
    expect(fee(before)).toBe(0);
    expect(Number(before.total)).toBe(20);

    await rule({});
    const o = await check(2);
    expect(o).toMatchObject({
      serviceFeePercent: 3,
      serviceFeeLabel: "Service fee",
      serviceFeeTaxable: false,
      serviceFeeDistribution: "HOUSE",
    });
    expect(fee(o)).toBe(0.6);
    expect(Number(o.serviceFeeTax ?? 0)).toBe(0);
    expect(Number(o.total)).toBe(20.6);
    // A service charge, never a tip.
    expect(Number(o.tip ?? 0)).toBe(0);

    const settings = await tabletRaw<Rec>(tabletToken, "GET", "/settings");
    expect(JSON.stringify(settings.data)).toContain('"percent":3');
  });

  test("TC-612: a counter order's claim — right is kept, short is refused, none (old POS) is taken without it", async () => {
    const right = await counter({ serviceFee: 0.6, total: 20.6 });
    expect(right.status, JSON.stringify(right.data)).toBe(201);
    expect(
      fee(
        (await getOrderFullRaw(ownerToken, String(right.data.id))).data as Rec
      )
    ).toBe(0.6);

    const short = await counter({ serviceFee: 0.4, total: 20.4 });
    expect(short.status).toBe(400);

    const legacy = await counter({ total: 20 });
    expect(legacy.status, JSON.stringify(legacy.data)).toBe(201);
    expect(
      fee(
        (await getOrderFullRaw(ownerToken, String(legacy.data.id))).data as Rec
      )
    ).toBe(0);
  });

  test("TC-613: the minimum subtotal — none below it, the full rate at or above", async () => {
    await rule({ minimumSubtotal: 25 });
    expect(fee(await check(2))).toBe(0);
    expect(fee(await check(3))).toBe(0.9);
    await rule({});
  });

  test("TC-614: order types and channels — POS checks vs the online quote", async () => {
    // Table checks are DINE_IN.
    await rule({ orderTypes: ["DELIVERY"] });
    expect(fee(await check(2))).toBe(0);

    await rule({ channels: ["ONLINE"] });
    expect(fee(await check(2))).toBe(0);
    const online = await quoteOrderRaw(restaurantId, {
      orderItems: [{ menuItemId: item.id, quantity: 2 }],
    });
    expect(online.status, JSON.stringify(online.data)).toBe(200);
    expect(online.data.quote?.serviceFee).toBe(0.6);
    expect(online.data.quote?.serviceFeeNotice).toBe(RULE.notice);

    await rule({ channels: ["POS"] });
    const offline = await quoteOrderRaw(restaurantId, {
      orderItems: [{ menuItemId: item.id, quantity: 2 }],
    });
    expect(offline.data.quote?.serviceFee ?? 0).toBe(0);
    expect(fee(await check(2))).toBe(0.6);
    await rule({});
  });

  test("TC-615: taxable — taxed at the restaurant rate and tracked apart", async () => {
    await updateRestaurantSettingsApi(ownerToken, restaurantId, { tax: 8 });
    await rule({ taxable: true });
    const o = await check(2, 1.6);
    expect(fee(o)).toBe(0.6);
    expect(Number(o.serviceFeeTax)).toBe(round2(0.6 * 0.08)); // $0.05
    expect(round2(Number(o.tax) - Number(o.serviceFeeTax))).toBe(1.6);
    expect(Number(o.total)).toBe(round2(20 + 0.6 + Number(o.tax)));

    await rule({ taxable: false });
    const plain = await check(2, 1.6);
    expect(Number(plain.serviceFeeTax ?? 0)).toBe(0);
    expect(Number(plain.tax)).toBe(1.6);
  });

  test("TC-616: STAFF distribution is frozen on the order; changing the rule doesn't touch placed orders", async () => {
    await rule({ distribution: "STAFF", percent: 5 });
    const o = await check(2);
    expect(o).toMatchObject({
      serviceFeeDistribution: "STAFF",
      serviceFeePercent: 5,
    });
    expect(fee(o)).toBe(1);
    await rule({ distribution: "HOUSE", percent: 3 });
    const again = await getOrderFullRaw(ownerToken, String(o.id));
    expect(again.data).toMatchObject({
      serviceFeeDistribution: "STAFF",
      serviceFeePercent: 5,
    });
  });

  test("TC-617: a device can't change the rule; out-of-range values are clamped", async () => {
    const put = await tabletRaw(tabletToken, "PUT", "/settings", {
      serviceFee: { ...RULE, enabled: false },
    });
    expect(put.status).toBeLessThan(500);
    expect(fee(await check(2))).toBe(0.6);

    await rule({ percent: 80 });
    expect(fee(await check(2))).toBe(5); // clamped to 25% of $20.00
    await rule({});
  });
});
