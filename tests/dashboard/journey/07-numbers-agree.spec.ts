/**
 * 07-numbers-agree.spec.ts — "a week in a restaurant", part 7: one closed
 * day reads the same everywhere (TC-1034..1039). docs/COVERAGE_MAP.md §3,
 * phase 8.
 *
 * One throwaway restaurant at about 16:00 local, 7% tax, a Stripe TEST
 * account and a REGISTER device whose drawer the owner holds. The day:
 *   online   Burger + Fries $16.00 + $1.12 tax + $3.00 tip, test card  $20.12
 *   counter  Burger + Fries, cash                                       $17.12
 *   table T1 2 × Burger $24.00 + $1.68 tax, cash, $5.00 tip             $30.68
 *   refund   $4.28 back on the online order ("the fries were cold"), the
 *            way the Owner app and the POS refund (the dashboard has no
 *            partial refund — see TEST_CASES.md)
 * The drawer is counted ($100 + $47.80) and the owner closes the day. Then
 * every place that reports the day is read and compared:
 *
 *   TC-1034 The day close (sales definitions 2, W2:E2): 3 orders, $56.00
 *           gross (item sales, no tax or tips), $51.96 net (gross − the
 *           refund's $4.04 of sales), $67.92 collected, $3.92 tax, $8.00
 *           tips, 1 refund $4.28, cash $47.80 and card $20.12, drawer even.
 *   TC-1035 The owner's Daily Report shows those figures on the closed day.
 *   TC-1036 The sales tax report: $3.92 collected, $0.24 given back with
 *           the refund, $3.68 net — per rate the same.
 *   TC-1037 The sales-by-day CSV: 3 orders, $56.00 (order net sales, before
 *           refunds — the close's net plus the refund's sales part).
 *   TC-1038 The books entry: balanced; sales = the report's net sales, tax =
 *           its net tax, tips = the close's, the refund split into its tax
 *           and the rest, each tender = the money taken less the refund.
 *   TC-1039 The partner API's day: closed, version 1, the same sales, tax,
 *           tips, refunds and tenders — and the books entry's lines.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  restaurantBasicInfoRaw,
  zoneAtMidday,
  updateRestaurantSettingsApi,
  ensureTaxRate,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  openRegisterSessionPos,
  closeRegisterSessionPosRaw,
  createTabletOrderRaw,
  settleTabCashRaw,
  refundOrderRaw,
  closeDayWebRaw,
  taxRaw,
  reportsRaw,
  accountingRaw,
  partnerAccessRaw,
  partnerApiRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { placePaidOnlineOrder } from "../../../utils/comboFoodSurfaces";
import { DESKTOP, expectHumanText } from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const cents = (dollars: unknown) => Math.round(Number(dollars) * 100);

test.describe.configure({ mode: "serial" });

test.describe("Journey 7 — one closed day reads the same everywhere", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  /** The closed business day, "YYYY-MM-DD". */
  let day = "";
  let close: Rec = {};
  let journal: Rec = {};
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  /** The journal's lines by kind, signed: credit +, debit −. */
  const journalSum = (prefix: string) =>
    list(journal.lines)
      .filter((l) => String(l.key).startsWith(prefix))
      .reduce(
        (s, l) => s + (l.side === "CREDIT" ? 1 : -1) * Number(l.cents),
        0
      );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[journey-7] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    ownerToken = tenant.accessToken;
    const owner = ownerToken;

    const zone = await restaurantBasicInfoRaw(adminToken, restaurantId, {
      timezone: zoneAtMidday(new Date(), 16),
    });
    if (zone.status !== 200)
      throw new Error(`[journey-7] zone: ${JSON.stringify(zone.data)}`);
    // The books entry needs Books & Taxes; nothing is connected or posted.
    const books = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC",
      true
    );
    if (!books.ok)
      throw new Error(`[journey-7] books: ${JSON.stringify(books.data)}`);
    await updateRestaurantSettingsApi(owner, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    await ensureTaxRate(owner, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(owner, restaurantId);
    const onboard = await stripeTestOnboardingRaw(owner, restaurantId);
    if (onboard.status !== 200)
      throw new Error(`[journey-7] stripe: ${JSON.stringify(onboard.data)}`);
    const pk = String(
      (await stripeConfigRaw()).data.data?.publishableKey ?? ""
    );
    if (!pk.startsWith("pk_test_"))
      throw new Error("[journey-7] QA must publish a Stripe TEST key");

    const food = await createMenuGroupNamed(owner, `Food ${runId}`, {
      restaurantId,
    });
    const burger = await createMenuItemFull(owner, food.id, "Burger", 12);
    const fries = await createMenuItemFull(owner, food.id, "Fries", 4);
    const line = (
      item: { id: string; name: string },
      quantity: number,
      price: number
    ) => ({
      menuItemId: item.id,
      menuItemName: item.name,
      quantity,
      price,
    });

    const web = await placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal: 16,
      tax: 1.12,
      tip: 3,
      deliveryFee: 0,
      total: 20.12,
      customerEmail: `auto-guest-${runId}@restaunax-test.com`,
      customerPhone: "5555550123",
      firstName: "Gia",
      lastName: "Guest",
      orderItems: [line(burger, 1, 12), line(fries, 1, 4)],
    });

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-agree-${runId}`
    );
    deviceId = device.id;
    const tablet = await tabletLogin(device.name, device.code);
    const member = await setOwnerPosPin(owner, restaurantId, "8462");
    const pos = await tabletStaffSignIn(tablet, member, "8462");
    await openRegisterSessionPos(tablet, pos, 100);

    const counter = await createTabletOrderRaw(tablet, pos, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: 16,
      tax: 1.12,
      tip: 0,
      total: 17.12,
      customerPhone: "",
      paymentMethod: "CASH",
      orderItems: [line(burger, 1, 12), line(fries, 1, 4)],
    });
    if (counter.status !== 201)
      throw new Error(`[journey-7] counter: ${JSON.stringify(counter.data)}`);
    const paid = await tabletRaw(
      tablet,
      "POST",
      `/orders/${counter.data.id}/mark-paid`,
      { cashTendered: 20, cashChange: 2.88 },
      pos
    );
    if (paid.status !== 200)
      throw new Error(`[journey-7] mark-paid: ${JSON.stringify(paid.data)}`);

    const t1 = await createTabletOrderRaw(tablet, pos, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: 24,
      tax: 1.68,
      tip: 0,
      total: 25.68,
      customerPhone: "",
      orderItems: [line(burger, 2, 12)],
      openCheck: true,
      tableName: "T1",
      guestCount: 2,
    });
    if (t1.status !== 201)
      throw new Error(`[journey-7] T1: ${JSON.stringify(t1.data)}`);
    const settled = await settleTabCashRaw(tablet, pos, String(t1.data.id), {
      amount: 25.68,
      cashTendered: 30.68,
      tip: 5,
      idempotencyKey: `j7-${runId}-t1`,
    });
    if (!settled.ok)
      throw new Error(`[journey-7] T1 cash: ${JSON.stringify(settled.data)}`);

    const refund = await refundOrderRaw(owner, web.id, {
      amount: 4.28,
      reason: "The fries were cold",
    });
    if (refund.status !== 200)
      throw new Error(`[journey-7] refund: ${JSON.stringify(refund.data)}`);

    const counted = await closeRegisterSessionPosRaw(tablet, pos, {
      countedCash: 147.8,
    });
    if (counted.status !== 200)
      throw new Error(`[journey-7] drawer: ${JSON.stringify(counted.data)}`);
    const closed = await closeDayWebRaw(owner, restaurantId, {
      depositAmount: 47.8,
      note: "Journey day 7",
    });
    if (closed.status !== 201)
      throw new Error(`[journey-7] close: ${JSON.stringify(closed.data)}`);
    close = closed.data.data as Rec;
    day = String(close.businessDate).slice(0, 10);

    const entry = await accountingRaw(
      owner,
      restaurantId,
      "GET",
      `/days/${day}?rebuild=1`
    );
    if (entry.status !== 200)
      throw new Error(`[journey-7] entry: ${JSON.stringify(entry.data)}`);
    journal = (entry.data.data as Rec).entry as Rec;

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Journey — numbers agree");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1034: the day close — 3 orders, $56.00 gross, $51.96 net, $67.92 collected, $3.92 tax, $8.00 tips, a $4.28 refund, the drawer even", async () => {
    expect(close).toMatchObject({
      orderCount: 3,
      // Sales definitions 2 (W2:E2): gross = item sales before discounts,
      // no tax or tips; net = gross − discounts − comps − the refund's
      // sales part ($4.28 − $0.24 tax = $4.04).
      grossSales: 56,
      netSales: 51.96,
      salesDefinitionVersion: 2,
      // Food + tax + tips: what gross meant before.
      totalCollected: 67.92,
      tax: 3.92,
      tip: 8,
      depositAmount: 47.8,
      overShortTotal: 0,
    });
    const summary = close.summary as Rec;
    expect(summary).toMatchObject({
      definitionVersion: 2,
      refundCount: 1,
      refundTotal: 4.28,
      refundSalesTotal: 4.04,
      discountTotal: 0,
      totalCollected: 67.92,
    });
    const by = new Map(list(summary.byMethod).map((m) => [m.method, m]));
    expect(by.get("CASH")).toMatchObject({ count: 2, amount: 47.8 });
    expect(by.get("CARD")).toMatchObject({ count: 1, amount: 20.12 });
    expect(summary.cash).toMatchObject({
      openingFloatTotal: 100,
      expectedCashTotal: 147.8,
      countedCashTotal: 147.8,
      overShortTotal: 0,
    });
  });

  test("TC-1035: the owner's Daily Report shows the closed day's figures", async () => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=store-daily-close`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page().getByText(
        /^Day closed by .+ · Deposit \$47\.80 · "Journey day 7"$/
      )
    ).toBeVisible({ timeout: 25_000 });
    const stat = (label: string) =>
      page()
        .locator(".MuiCard-root")
        .filter({ has: page().getByText(label, { exact: true }) })
        .first();
    await expect(stat("Gross sales (before discounts)")).toContainText(
      "$56.00"
    );
    await expect(stat("Net sales")).toContainText("$51.96");
    await expect(stat("Total collected")).toContainText("$67.92");
    await expect(stat("Tax")).toContainText("$3.92");
    await expect(stat("Tips")).toContainText("$8.00");
    await expect(stat("Refunds (1)")).toContainText("$4.28");
    const methods = page()
      .getByRole("table")
      .filter({ has: page().getByRole("columnheader", { name: "Method" }) });
    await expect(
      methods.getByRole("row", { name: "Cash 2 $47.80" })
    ).toBeVisible();
    await expect(
      methods.getByRole("row", { name: "Card 1 $20.12" })
    ).toBeVisible();
    await expectHumanText(page().getByRole("main"), "the daily report");
  });

  test("TC-1036: the sales tax report — $3.92 collected, $0.24 given back, $3.68 net", async () => {
    const r = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${day}&endDate=${day}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const report = r.data.data as Rec;
    // The refund gives back tax in the order's proportion of tax to total:
    // $4.28 × $1.12 / $20.12 = $0.24 (SALES_TAX.md → "Refunds").
    expect(report.totals).toMatchObject({
      orders: 3,
      netSales: 56,
      taxableSales: 56,
      taxCollected: 3.92,
      refunds: 4.28,
      refundedTax: 0.24,
      netTaxCollected: 3.68,
    });
    expect(list(report.byRate)).toEqual([
      expect.objectContaining({
        percent: 7,
        taxableBase: 56,
        tax: 3.92,
        refundedTax: 0.24,
        netTax: 3.68,
      }),
    ]);
    // The day close's tax is what was collected.
    expect(cents((report.totals as Rec).taxCollected)).toBe(cents(close.tax));
  });

  test("TC-1037: the sales-by-day CSV has the same orders and net sales", async () => {
    const r = await reportsRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/sales-by-day.csv?startDate=${day}&endDate=${day}`
    );
    expect(r.status).toBe(200);
    const [header, row] = String(r.data)
      .replace(/^\uFEFF/, "")
      .split("\n")
      .filter(Boolean);
    expect(header).toMatch(/^Business date,Day,Orders,Net sales,/);
    const cells = String(row).split(",");
    expect(cells[0]).toBe(day);
    expect(Number(cells[2])).toBe(Number(close.orderCount));
    // Order net sales, before refunds (refunds land on the day they happen).
    const summary = close.summary as Rec;
    expect(cents(cells[3])).toBe(
      cents(close.netSales) + cents(summary.refundSalesTotal)
    );
  });

  test("TC-1038: the books entry — balanced, the report's sales and net tax, the refund split into sales, tax, tip and fees, the drawer", async () => {
    expect(journal).toMatchObject({ balanced: true, orderCount: 3 });
    expect(journal.debitCents).toBe(journal.creditCents);
    // The books credit sales at menu price (no comps or discounts on this
    // day) and debit the refund's sales part on its own line: sales −
    // refunds = the close's net sales.
    expect(journalSum("sales:")).toBe(cents(close.grossSales));
    expect(journalSum("sales:") - (428 - 24)).toBe(cents(close.netSales));
    // Net tax: collected less what the refund gave back (RestauNax #1104).
    expect(journalSum("tax:")).toBe(368);
    expect(journalSum("tips")).toBe(cents(close.tip));
    // The refund's other $4.04, then the money: cash as taken, card less
    // the refund.
    expect(-journalSum("refunds")).toBe(428 - 24);
    expect(-journalSum("tender:cash")).toBe(4780);
    expect(-journalSum("tender:card")).toBe(2012 - 428);
    // W2:A13: an item refund is sales and tax only — the tip stays the
    // staff's and no fee comes back.
    expect(journal.refundSplit).toEqual({
      salesCents: 428 - 24,
      taxCents: 24,
      tipCents: 0,
      feeCents: 0,
    });
    // W2:A1: no paid-outs, paid-ins or tip-outs this day: the drawer adds
    // nothing, and cash is exactly what was taken.
    expect(journal.drawer).toEqual({
      paidInCents: 0,
      paidOutCents: 0,
      tipsPaidCashCents: 0,
      giftCardCashRefundCents: 0,
    });
  });

  test("TC-1039: the partner API's day is closed and says the same, line for line", async () => {
    const key = await partnerAccessRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/api-keys",
      { name: `Numbers ${runId}`, scopes: ["sales.daily:read"] }
    );
    expect(key.status, JSON.stringify(key.data)).toBe(201);
    const r = await partnerApiRaw(
      String((key.data.data as Rec).key),
      "GET",
      `/locations/${restaurantId}/days/${day}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const doc = r.data.data as Rec;
    expect(doc).toMatchObject({
      businessDate: day,
      status: "CLOSED",
      version: 1,
      currency: "USD",
      orderCount: 3,
      tips: 800,
      refunds: 404,
      cashOverShort: 0,
    });
    // The partner document keeps refunds as their own figure: its net sales
    // are before refunds (gross − discounts), so close net + refund sales.
    expect((doc.sales as Rec).grossSales).toBe(cents(close.grossSales));
    expect((doc.sales as Rec).netSales).toBe(cents(close.netSales) + 404);
    expect((doc.tax as Rec).total).toBe(journalSum("tax:"));
    expect(new Map(list(doc.tenders).map((t) => [t.type, t.amount]))).toEqual(
      new Map([
        ["CASH", 4780],
        ["CARD", 1584],
      ])
    );
    // The same lines as the books entry.
    const docJournal = doc.journal as Rec;
    expect(docJournal.balanced).toBe(true);
    const asPairs = (lines: Rec[], amount: string) =>
      lines.map((l) => `${l.key} ${l.side} ${l[amount]}`).sort();
    expect(asPairs(list(docJournal.lines), "amount")).toEqual(
      asPairs(list(journal.lines), "cents")
    );
  });
});
