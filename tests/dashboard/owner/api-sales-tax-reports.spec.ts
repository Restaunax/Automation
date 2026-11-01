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
 * $1.20 + $0.72 = $1.92. The report's gross receipts / tax due shape is the
 * RestauNax audit fix W4:C1a + H6 + L1 (fees and marketplace in gross, tax
 * due next to tax collected); the fee line itself is TC-1079 (a real order
 * with a service fee). Every report is read for [yesterday, today] in the
 * restaurant's zone so a run just after midnight still sees its own orders.
 *
 * RestauNax audit Stage 3 (TC-1254..1256): the delivery fee asks the owner
 * while the state's rule is only suggested; a refund that names the beer
 * gives back alcohol-rate tax only and the books agree with the report per
 * rate (W4:M7); POS tax refusal is per restaurant (readiness + opt-in + the
 * admin kill switch, replacing POS_TAX_REFUSAL_ENABLED). A sale whose card
 * capture FAILED (W4:M6) can't be staged on QA without Stripe's secret key
 * (the hold must be cancelled and the day closed): the backend integration
 * test salesTax.int proves the report leaves it out.
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
  apiRequestRaw,
  ensureBusinessHours,
  getOrderFullRaw,
  refundOrderRaw,
  stripeConfigRaw,
  stripeTestOnboardingRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { placePaidOnlineOrder } from "../../../utils/comboFoodSurfaces";

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
      // Gross receipts = food + service fees + auto-gratuity + delivery fees
      // + marketplace sales (RestauNax audit W4:C1a / L1); none here.
      foodSales: 30,
      serviceFees: 0,
      autoGratuities: 0,
      deliveryFees: 0,
      marketplaceSales: 0,
      grossSales: 30,
      netSales: 30,
      taxableSales: 28,
      nonTaxableSales: 2,
      exemptSales: 0,
      taxCollected: 1.92,
      // Tax due = taxable base × rate, next to what was collected (W4:H6).
      taxDue: 1.92,
      taxDifference: 0,
    });
    const t = report.totals as unknown as {
      netSales: number;
      marketplaceSales: number;
      nonTaxableSales: number;
      exemptSales: number;
      taxableSales: number;
    };
    // net − marketplace − non-taxable − exempt = taxable, to the cent.
    expect(
      Math.round(
        (t.netSales - t.marketplaceSales - t.nonTaxableSales - t.exemptSales) *
          100
      )
    ).toBe(Math.round(t.taxableSales * 100));
    expect(t.taxableSales).toBeLessThanOrEqual(t.netSales);
    const byName = new Map(list(report.byRate).map((l) => [l.name, l]));
    expect(byName.get("State")).toMatchObject({
      percent: 6,
      taxableBase: 20,
      tax: 1.2,
      taxDue: 1.2,
      difference: 0,
    });
    expect(byName.get("Alcohol")).toMatchObject({
      percent: 9,
      taxableBase: 8,
      tax: 0.72,
      taxDue: 0.72,
      difference: 0,
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
    // rate, percent, taxable base, tax, refunded tax, net tax, tax due,
    // difference — the refund columns joined in RestauNax aab02ca41, tax due
    // and the difference in the audit fix W4:H6; nothing is refunded here.
    expect(
      rows.some((l) => /^State,6,20\.00,1\.20,0\.00,1\.20,1\.20,0\.00$/.test(l))
    ).toBe(true);
    expect(
      rows.some((l) =>
        /^Alcohol,9,8\.00,0\.72,0\.00,0\.72,0\.72,0\.00$/.test(l)
      )
    ).toBe(true);
    // The summary: gross receipts lines, then tax due vs collected; never
    // "owed by the restaurant" on the collected line.
    expect(rows).toContain("Gross receipts,30.00");
    expect(rows).toContain("Tax due (taxable amount × rate),1.92");
    expect(rows).toContain("Tax collected,1.92");
    expect(rows).toContain("Difference (collected minus due),0.00");
    expect(rows.some((l) => /owed by the restaurant/.test(l))).toBe(false);
    expect(
      rows.some((l) => /^"?Figures to help prepare your return/.test(l))
    ).toBe(true);
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

  test("TC-1254: the delivery fee asks the owner while the state's rule is only a suggestion", async () => {
    const r = await taxRaw<{ data?: Rec }>(
      ownerToken,
      restaurantId,
      "GET",
      "/delivery-fee"
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const d = r.data.data as Rec;
    // No CONFIRMED rule on QA: today's behaviour, and the owner is asked.
    expect(d.rules).toBe("LEGACY");
    expect(d.needsOwnerAnswer).toBe(true);
    expect(["DRAFT", "MISSING"]).toContain(
      String((d.stateRule as Rec | null)?.status)
    );
    expect(String(d.explanation)).toMatch(/confirmed/);
  });

  test("TC-1255: refunding only the beer gives back alcohol-rate tax only; the books agree with the report per rate", async () => {
    test.setTimeout(120_000);
    await ensureBusinessHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    expect(onboard.status, JSON.stringify(onboard.data)).toBe(200);
    const pk = String(
      (await stripeConfigRaw()).data.data?.publishableKey ?? ""
    );
    expect(pk, "QA publishes a Stripe TEST key").toMatch(/^pk_test_/);
    // Burger $10.00 at State 6% = $0.60; Beer $8.00 at Alcohol 10% (TC-622)
    // = $0.80; a $2.00 tip.
    const web = await placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal: 18,
      tax: 1.4,
      tip: 2,
      deliveryFee: 0,
      total: 21.4,
      customerEmail: `auto-refund-${runId}@restaunax-test.com`,
      customerPhone: "5555550199",
      firstName: "Rita",
      lastName: "Refund",
      orderItems: [
        {
          menuItemId: items.Burger.id,
          menuItemName: items.Burger.name,
          quantity: 1,
          price: 10,
        },
        {
          menuItemId: items.Beer.id,
          menuItemName: items.Beer.name,
          quantity: 1,
          price: 8,
        },
      ],
    });
    const full = await getOrderFullRaw(ownerToken, web.id);
    const beer = list((full.data as Rec).orderItems).find(
      (l) => l.menuItemId === items.Beer.id
    );
    expect(beer, "the order has the beer line").toBeTruthy();

    const refund = await refundOrderRaw(ownerToken, web.id, {
      amount: 8.8,
      reason: "Wrong beer",
      items: [{ orderItemId: String(beer!.id), quantity: 1 }],
    });
    expect(refund.status, JSON.stringify(refund.data)).toBe(200);

    const r = await taxRaw<{ data?: Rec }>(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${from}&endDate=${to}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const report = r.data.data as Rec;
    const byRate = list(report.byRate);
    const state = byRate.filter((l) => l.taxRateId === rates.State.id);
    const alcohol10 = byRate.find(
      (l) => l.taxRateId === rates.Alcohol.id && l.percent === 10
    );
    // Only alcohol-rate tax came back (was: a share of every rate, tip
    // included).
    expect(alcohol10).toMatchObject({ tax: 0.8, refundedTax: 0.8, netTax: 0 });
    expect(state.reduce((s, l) => s + Number(l.refundedTax), 0)).toBe(0);
    expect((report.totals as Rec).refundedTax).toBe(0.8);

    // The books post the same tax per rate, net of the refund.
    const books = new Map<string, number>();
    for (const date of [from, to]) {
      const day = await accountingRaw(
        ownerToken,
        restaurantId,
        "GET",
        `/days/${date}?rebuild=1`
      );
      expect(day.status, JSON.stringify(day.data)).toBe(200);
      for (const line of list(day.data.data?.entry?.lines)) {
        const key = String(line.key);
        if (!key.startsWith("tax:")) continue;
        const cents = (line.side === "CREDIT" ? 1 : -1) * Number(line.cents);
        books.set(key, (books.get(key) ?? 0) + cents);
      }
    }
    for (const rate of [rates.State, rates.Alcohol]) {
      const netCents = Math.round(
        byRate
          .filter((l) => l.taxRateId === rate.id)
          .reduce((s, l) => s + Number(l.netTax), 0) * 100
      );
      expect(books.get(`tax:${rate.id}`) ?? 0, String(rate.name)).toBe(
        netCents
      );
    }
  });

  test("TC-1256: POS tax refusal is per restaurant — off until ready and opted in; the admin kill switch is a platform setting", async () => {
    const get = await taxRaw<{ data?: Rec }>(
      ownerToken,
      restaurantId,
      "GET",
      "/pos-refusal"
    );
    expect(get.status, JSON.stringify(get.data)).toBe(200);
    expect(get.data.data).toMatchObject({ refusalOn: false, optedIn: false });
    expect(get.data.data?.blockers).toContain("NOT_OPTED_IN");

    const bad = await taxRaw(ownerToken, restaurantId, "PUT", "/pos-refusal", {
      optIn: "yes",
    });
    expect(bad.status).toBe(400);

    try {
      const on = await taxRaw<{ data?: Rec }>(
        ownerToken,
        restaurantId,
        "PUT",
        "/pos-refusal",
        { optIn: true }
      );
      expect(on.status, JSON.stringify(on.data)).toBe(200);
      // Opted in, but no register has sold here: still accepted and recorded.
      expect(on.data.data).toMatchObject({ optedIn: true, refusalOn: false });
      expect(on.data.data?.blockers).not.toContain("NOT_OPTED_IN");
      expect(on.data.data?.blockers).toContain("NO_ACTIVE_DEVICES");
    } finally {
      await taxRaw(ownerToken, restaurantId, "PUT", "/pos-refusal", {
        optIn: false,
      });
    }

    // The global kill switch: admins only, and validated. Never flipped here
    // (it pauses refusal for every restaurant on QA).
    const admin = await apiRequestRaw<{ data?: Rec }>(
      "GET",
      "/api/admin/pos-tax-refusal",
      undefined,
      adminToken
    );
    expect(admin.status, JSON.stringify(admin.data)).toBe(200);
    expect(typeof admin.data.data?.killSwitch).toBe("boolean");
    const owner = await apiRequestRaw(
      "GET",
      "/api/admin/pos-tax-refusal",
      undefined,
      ownerToken
    );
    expect(owner.status).toBe(403);
    const invalid = await apiRequestRaw(
      "PUT",
      "/api/admin/pos-tax-refusal",
      { quietDays: 0 },
      adminToken
    );
    expect(invalid.status).toBe(400);
  });
});
