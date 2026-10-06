/**
 * api-sales-tax-reports.spec.ts — sales tax with several rates and tax-free
 * items (R2), and the reports that must agree with the orders (R1, A1)
 * (TC-619..624).
 *
 * No browser. A per-run throwaway restaurant (core features; ACCOUNTING_SYNC
 * granted only for the accounting check), published and taking orders, with:
 *   Burger $10.00 — default rate "State" 6%
 *   Beer    $8.00 — rate "Alcohol" 9% (by tax code)
 *   Water   $2.00 — tax-free
 * Three online orders (placed through the public pricing engine, then
 * confirmed): 2 × Burger, 1 × Beer, 1 × Water → $30.00 food, tax
 * $1.20 + $0.72 = $1.92. Every report is read for [yesterday, today] in the
 * restaurant's zone so a run just after midnight still sees its own orders.
 * Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  updateRestaurantSettingsApi,
  createMenuGroupNamed,
  createMenuItemFull,
  setRestaurantPublishedApi,
  quoteOrderRaw,
  createSeededOrder,
  taxRaw,
  reportsRaw,
  accountingRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const TZ = "America/New_York";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const localDay = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(Date.now() + offsetDays * 86_400_000)
  );
const lines = (body: unknown) =>
  String(body)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);

test.describe.configure({ mode: "serial" });

test.describe("Sales tax and reports agree with the orders (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  type Item = { id: string; name: string; price: number };
  const blank = (): Item => ({ id: "", name: "", price: 0 });
  const seed = (i: Item) => ({
    menuItemId: i.id,
    name: i.name,
    price: i.price,
  });
  const items = { Burger: blank(), Beer: blank(), Water: blank() };
  const rates: { State: Rec; Alcohol: Rec } = { State: {}, Alcohol: {} };
  const from = localDay(-1);
  const to = localDay(0);

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-sales-tax] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    const groupId = (
      await createMenuGroupNamed(ownerToken, `Tax ${runId}`, { restaurantId })
    ).id;
    for (const [key, price] of [
      ["Burger", 10],
      ["Beer", 8],
      ["Water", 2],
    ] as const) {
      const item = await createMenuItemFull(
        ownerToken,
        groupId,
        `${key} ${runId}`,
        price
      );
      items[key] = { id: item.id, name: item.name, price };
    }
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Sales tax & reports");
    await allure.label("severity", "critical");
  });

  test("TC-619: several rates — a default, a coded rate, a tax-free item; bad percents refused", async () => {
    const state = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "State",
      percent: 6,
      isDefault: true,
    });
    expect(state.status, JSON.stringify(state.data)).toBe(201);
    rates.State = state.data.data as Rec;
    const alcohol = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "Alcohol",
      percent: 9,
    });
    expect(alcohol.status, JSON.stringify(alcohol.data)).toBe(201);
    rates.Alcohol = alcohol.data.data as Rec;
    expect(rates.State.isDefault).toBe(true);
    expect(rates.Alcohol.isDefault).toBe(false);

    const bad = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "Silly",
      percent: 150,
    });
    expect(bad.status).toBe(400);

    const assign = await taxRaw(ownerToken, restaurantId, "PUT", "/menu", {
      items: [
        { id: items.Beer.id, taxCode: rates.Alcohol.code },
        { id: items.Water.id, taxExempt: true },
      ],
    });
    expect(assign.status, JSON.stringify(assign.data)).toBe(200);
    const menu = await taxRaw(ownerToken, restaurantId, "GET", "/menu");
    const flat = list(menu.data.data).flatMap((m) =>
      list(m.groups).flatMap((g) => list(g.items))
    );
    const rateOf = (id: string) => flat.find((i) => i.id === id)?.effectiveRate;
    expect(rateOf(items.Burger.id)).toBe("State");
    expect(rateOf(items.Beer.id)).toBe("Alcohol");
    expect(rateOf(items.Water.id)).toBeNull();
  });

  test("TC-620: the checkout quote taxes each line at its own rate — $1.92 on $30.00", async () => {
    const q = await quoteOrderRaw(restaurantId, {
      orderItems: [
        { menuItemId: items.Burger.id, quantity: 2 },
        { menuItemId: items.Beer.id, quantity: 1 },
        { menuItemId: items.Water.id, quantity: 1 },
      ],
    });
    expect(q.status, JSON.stringify(q.data)).toBe(200);
    expect(q.data.quote?.subtotal).toBe(30);
    expect(q.data.quote?.tax).toBe(1.92);
  });

  test("TC-621: the sales tax report — per rate, tax-free sales apart, totals = the orders", async () => {
    const placed = [
      await createSeededOrder(ownerToken, restaurantId, seed(items.Burger), {
        quantity: 2,
        guest: true,
      }),
      await createSeededOrder(ownerToken, restaurantId, seed(items.Beer), {
        guest: true,
      }),
      await createSeededOrder(ownerToken, restaurantId, seed(items.Water), {
        guest: true,
      }),
    ];
    expect(placed.map((o) => o.tax)).toEqual([1.2, 0.72, 0]);

    const r = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${from}&endDate=${to}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const report = r.data.data as Rec;
    expect(report.totals).toMatchObject({
      orders: 3,
      grossSales: 30,
      netSales: 30,
      taxableSales: 28,
      nonTaxableSales: 2,
      exemptSales: 0,
      taxCollected: 1.92,
    });
    const byName = new Map(list(report.byRate).map((l) => [l.name, l]));
    expect(byName.get("State")).toMatchObject({
      percent: 6,
      taxableBase: 20,
      tax: 1.2,
    });
    expect(byName.get("Alcohol")).toMatchObject({
      percent: 9,
      taxableBase: 8,
      tax: 0.72,
    });
    expect(report.unallocatedTax).toBe(0);

    const csv = await taxRaw<string>(
      ownerToken,
      restaurantId,
      "GET",
      `/report.csv?startDate=${from}&endDate=${to}`
    );
    expect(csv.status).toBe(200);
    const rows = lines(csv.data);
    expect(rows.some((l) => /^State,6,20\.00,1\.20$/.test(l))).toBe(true);
    expect(rows.some((l) => /^Alcohol,9,8\.00,0\.72$/.test(l))).toBe(true);
  });

  test("TC-622: changing a rate later never changes what past orders owe", async () => {
    const changed = await taxRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/rates/${rates.Alcohol.id}`,
      { percent: 10 }
    );
    expect(changed.status, JSON.stringify(changed.data)).toBe(200);
    const r = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${from}&endDate=${to}`
    );
    expect(r.data.data.totals.taxCollected).toBe(1.92);
    const alcohol = list(r.data.data.byRate).find((l) => l.name === "Alcohol");
    expect(alcohol).toMatchObject({ percent: 9, tax: 0.72 });
    // New orders use the new rate.
    const q = await quoteOrderRaw(restaurantId, {
      orderItems: [{ menuItemId: items.Beer.id, quantity: 1 }],
    });
    expect(q.data.quote?.tax).toBe(0.8);
  });

  test("TC-623: the sales-by-day CSV (R1) shows the same orders and net sales", async () => {
    const r = await reportsRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/sales-by-day.csv?startDate=${from}&endDate=${to}`
    );
    expect(r.status).toBe(200);
    const rows = lines(r.data).slice(1);
    const orders = rows.reduce((s, l) => s + Number(l.split(",")[2] || 0), 0);
    const net = rows.reduce((s, l) => s + Number(l.split(",")[3] || 0), 0);
    expect(orders).toBe(3);
    expect(Math.round(net * 100)).toBe(3000);
  });

  test("TC-624: the accounting day entry (A1) books the same sales and tax", async () => {
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC",
      true
    );
    expect(g.ok, JSON.stringify(g.data)).toBe(true);
    const total = { sales: 0, tax: 0, perRate: new Map<string, number>() };
    for (const date of [from, to]) {
      const r = await accountingRaw(
        ownerToken,
        restaurantId,
        "GET",
        `/days/${date}?rebuild=1`
      );
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      for (const line of list(r.data.data?.entry?.lines)) {
        if (line.side !== "CREDIT") continue;
        const key = String(line.key);
        const cents = Number(line.cents);
        if (key.startsWith("sales:")) total.sales += cents;
        if (key.startsWith("tax:")) {
          total.tax += cents;
          total.perRate.set(key, (total.perRate.get(key) ?? 0) + cents);
        }
      }
    }
    expect(total.perRate.get(`tax:${rates.State.id}`)).toBe(120);
    expect(total.perRate.get(`tax:${rates.Alcohol.id}`)).toBe(72);
    expect({ sales: total.sales, tax: total.tax }).toEqual({
      sales: 3000,
      tax: 192,
    });
  });
});
