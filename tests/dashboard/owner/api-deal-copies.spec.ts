/**
 * api-deal-copies.spec.ts — several copies of a deal, the limit per order
 * and "Your cart qualifies for …" (API level).
 *
 * Spec: restaunax docs/features/DEAL_COPIES_AND_LATE_PROMOTIONS.md (Parts 1,
 * 2 and 4; exact wire in "Backend contract (as built)"). The POS half (apply
 * a deal or a coupon to a placed order) is pos/26-late-promotions.spec.ts.
 *
 * Gated by RELEASED_ON_QA.dealCopies (utils/releaseGate.ts, tag
 * @deal-copies): until RestauNax feat/deal-copies-late-promotions is on QA
 * every test skips with the reason; flip the flag once it is.
 *
 * Own tenant: a per-run throwaway restaurant (createSecondOwner, alwaysFresh),
 * tax 0 so every amount is a clean sum. Menu: Pizza A $12, Pizza B $14,
 * Soda $3. One deal, "buy a pizza, get the 2nd for $1.99"
 * (BOGO_FIXED_PRICE, AUTOMATIC, both slots "Pizza A or Pizza B"), so two
 * copies can carry different picks. Every money expectation is the server's
 * own number (/quote), never a hand sum.
 *
 *   TC-2100 two copies of the deal with different picks: the quote prices
 *           two deal lines, and the placed order stores two OrderDeal rows,
 *           each with its own picks.
 *   TC-2101 the owner sets "limit per order" to 1: read back on the owner
 *           and public deal; a cart with 2 copies is refused at /quote
 *           (deal_max_per_order, resolved sentence) and at place order; 1
 *           copy is fine; 0 and 1.5 are refused on save.
 *   TC-2102 limit cleared (null): 2 copies price again.
 *   TC-2103 the quote suggests the deal when the cart's à-la-carte pizzas
 *           fill it (picks point at the request's orderItems; savings =
 *           what the deal takes off), and not for one pizza.
 *   TC-2104 no suggestion while a food coupon applies.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "@playwright/test";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  deleteTestRestaurant,
  getActiveDealsPublic,
  getDealApi,
  getOrderFullRaw,
  placeOrderRaw,
  setRestaurantPublishedApi,
  updateDealRaw,
  updateRestaurantSettingsApi,
  type ApiDeal,
} from "../../../utils/apiHelper";
import {
  createCouponPromotion,
  setPromotionStatus,
} from "../../../utils/promotionsApi";
import { createPromotionDeal, slotId } from "../../../utils/promotionFixtures";
import {
  issueReason,
  quoteCheckoutRaw,
  type CheckoutDealLine,
  type QuoteWithSuggestions,
} from "../../../utils/dealCopiesApi";
import { probeDealCopies, requireRelease } from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const PIZZA_A = 12;
const PIZZA_B = 14;
const SODA = 3;
const MAX_PER_ORDER_SENTENCE =
  "This order has more of this deal than it allows. Remove a copy to continue.";
const LIMIT_INVALID_SENTENCE =
  "Limits must be whole numbers of 1 or more, and a minimum order can't be negative.";

type Item = { id: string; name: string; price: number };

test.describe("Deal copies, limit per order and deal suggestions (API) @deal-copies", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let token = "";
  let restaurantId = "";
  let released = false;
  const pizzaA: Item = { id: "", name: `Pizza A ${runId}`, price: PIZZA_A };
  const pizzaB: Item = { id: "", name: `Pizza B ${runId}`, price: PIZZA_B };
  const soda: Item = { id: "", name: `Soda ${runId}`, price: SODA };
  let deal: ApiDeal;
  let buySlot = "";
  let getSlot = "";

  /** One copy of the deal: `buy` in the BUY slot, `get` in the GET slot. */
  const copy = (buy: Item, get: Item): CheckoutDealLine => ({
    dealId: deal.id,
    dealName: deal.name,
    quantity: 1,
    items: [
      {
        dealItemId: buySlot,
        menuItemId: buy.id,
        menuItemName: buy.name,
        quantity: 1,
      },
      {
        dealItemId: getSlot,
        menuItemId: get.id,
        menuItemName: get.name,
        quantity: 1,
      },
    ],
  });
  const line = (item: Item, quantity = 1) => ({
    menuItemId: item.id,
    menuItemName: item.name,
    quantity,
    price: item.price,
  });
  const quoteOk = async (
    body: Parameters<typeof quoteCheckoutRaw>[1]
  ): Promise<QuoteWithSuggestions> => {
    const res = await quoteCheckoutRaw(restaurantId, body);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data;
  };
  const maxPerOrderIssue = (q: QuoteWithSuggestions) =>
    (q.issues ?? []).find(
      (i) =>
        i.code === "deal_not_eligible" &&
        issueReason(i) === "deal_max_per_order"
    );
  /** A guest pickup order for these deal lines, at the quote's own amounts. */
  const placeBody = (
    q: QuoteWithSuggestions,
    orderDeals: CheckoutDealLine[]
  ) => ({
    orderType: "PICKUP",
    subtotal: q.quote?.subtotal ?? 0,
    tax: q.quote?.tax ?? 0,
    tip: 0,
    deliveryFee: 0,
    total: q.quote?.amountToCharge ?? 0,
    customerEmail: `deal-copies-${runId}@restaunax-test.com`,
    firstName: "Deal",
    lastName: "Copies",
    orderItems: [],
    orderDeals,
  });

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId)
      throw new Error("[deal-copies] could not mint the throwaway tenant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    // Tax 0 keeps the money readable; published + accepting orders or the
    // place-order checks are refused before pricing.
    await updateRestaurantSettingsApi(token, restaurantId, {
      acceptingOrders: true,
      tax: 0,
    });
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    const groupId = (
      await createMenuGroupNamed(token, `AUTO Deal Copies ${runId}`, {
        restaurantId,
      })
    ).id;
    for (const item of [pizzaA, pizzaB, soda]) {
      item.id = (
        await createMenuItemFull(token, groupId, item.name, item.price)
      ).id;
    }
    const option = (role: "BUY" | "GET", sortOrder: number) => ({
      optionMenuItemIds: [pizzaA.id, pizzaB.id],
      quantity: 1,
      role,
      isRequired: true,
      itemName: "",
      itemPrice: 0,
      sortOrder,
    });
    deal = await createPromotionDeal(token, restaurantId, {
      name: `AUTO Pizza 2nd for $1.99 ${runId}`,
      dealType: "BOGO_FIXED_PRICE",
      getPrice: 1.99,
      applyMode: "AUTOMATIC",
      items: [option("BUY", 0), option("GET", 1)],
    });
    buySlot = slotId(deal, 0);
    getSlot = slotId(deal, 1);
    released = await probeDealCopies(token, deal.id);
  });

  test.afterAll(async () => {
    // Best-effort: the admin DELETE archives the throwaway restaurant (and
    // with it the deal, coupon and menu); a failure leaves an inert store.
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    requireRelease("dealCopies", released);
    await allure.label("feature", "Deal copies");
    await allure.label("severity", "critical");
  });

  test("TC-2100: two copies of a deal with different picks are priced as two deal lines and stored as two OrderDeal rows", async () => {
    const copies = [copy(pizzaA, pizzaA), copy(pizzaB, pizzaB)];
    const q = await allure.step("quote both copies", () =>
      quoteOk({ orderDeals: copies })
    );
    const lines = (q.quote?.deals ?? []).filter((d) => d.dealId === deal.id);
    expect(lines, JSON.stringify(q)).toHaveLength(2);
    expect(q.issues?.filter((i) => i.severity === "ERROR") ?? []).toEqual([]);
    // Each copy is priced on its own picks: the two lines differ, and the
    // quote's subtotal is exactly their sum (no à-la-carte lines).
    const sum = lines.reduce((s, l) => s + l.lineTotal, 0);
    expect(q.quote?.subtotal).toBeCloseTo(sum, 2);
    expect(lines[0]!.lineTotal).not.toBeCloseTo(lines[1]!.lineTotal, 2);

    const placed = await allure.step("place the order", () =>
      placeOrderRaw(restaurantId, placeBody(q, copies))
    );
    expect(placed.status, JSON.stringify(placed.data)).toBe(201);
    const orderId = String(placed.data.id ?? placed.data.order?.id);
    const stored = await getOrderFullRaw(token, orderId);
    expect(stored.status, JSON.stringify(stored.data)).toBe(200);
    expect(Number(stored.data.total)).toBeCloseTo(
      q.quote?.amountToCharge ?? NaN,
      2
    );
    const rows = (stored.data.orderDeals ?? []) as {
      dealId: string;
      quantity: number;
      orderDealItems?: { menuItemId: string }[];
    }[];
    expect(rows, JSON.stringify(stored.data.orderDeals)).toHaveLength(2);
    const picksOf = (r: (typeof rows)[number]) =>
      (r.orderDealItems ?? []).map((i) => i.menuItemId).sort();
    expect(rows.every((r) => r.dealId === deal.id && r.quantity === 1)).toBe(
      true
    );
    expect(rows.map(picksOf).sort()).toEqual(
      [
        [pizzaA.id, pizzaA.id],
        [pizzaB.id, pizzaB.id],
      ].sort()
    );
  });

  test("TC-2101: limit per order 1 — saved and published; 2 copies are refused at /quote and place order with deal_max_per_order, 1 copy prices; 0 and 1.5 are refused", async () => {
    await allure.step("invalid limits are refused in words", async () => {
      for (const bad of [0, 1.5]) {
        const res = await updateDealRaw(token, deal.id, { maxPerOrder: bad });
        expect(res.status, `maxPerOrder ${bad}`).toBe(400);
        expect(JSON.stringify(res.data)).toContain(LIMIT_INVALID_SENTENCE);
      }
    });
    const saved = await updateDealRaw(token, deal.id, { maxPerOrder: 1 });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const owner = (await getDealApi(token, deal.id)) as ApiDeal & {
      maxPerOrder?: number | null;
    };
    expect(owner.maxPerOrder).toBe(1);
    const pub = await getActiveDealsPublic(restaurantId, { v2: true });
    expect(pub.status).toBe(200);
    const listed = (pub.data.deals ?? []).find((d) => d.id === deal.id) as
      | (ApiDeal & { maxPerOrder?: number | null })
      | undefined;
    expect(listed?.maxPerOrder, JSON.stringify(listed)).toBe(1);

    const two = [copy(pizzaA, pizzaA), copy(pizzaB, pizzaB)];
    const refused = await quoteOk({ orderDeals: two });
    const issue = maxPerOrderIssue(refused);
    expect(issue, JSON.stringify(refused.issues)).toBeTruthy();
    expect(issue?.severity).toBe("ERROR");
    expect(issue?.message).toBe(MAX_PER_ORDER_SENTENCE);

    const one = await quoteOk({ orderDeals: [copy(pizzaA, pizzaB)] });
    expect(maxPerOrderIssue(one)).toBeUndefined();
    expect(
      (one.quote?.deals ?? []).filter((d) => d.dealId === deal.id)
    ).toHaveLength(1);

    // At the refused quote's own amounts: only the limit can refuse it.
    const placed = await placeOrderRaw(restaurantId, placeBody(refused, two));
    expect(placed.status, JSON.stringify(placed.data)).toBe(400);
    expect(placed.data.message).toBe(MAX_PER_ORDER_SENTENCE);
  });

  test("TC-2102: limit per order cleared (null) — 2 copies price again", async () => {
    const cleared = await updateDealRaw(token, deal.id, { maxPerOrder: null });
    expect(cleared.status, JSON.stringify(cleared.data)).toBe(200);
    const owner = (await getDealApi(token, deal.id)) as ApiDeal & {
      maxPerOrder?: number | null;
    };
    expect(owner.maxPerOrder).toBeNull();
    const q = await quoteOk({
      orderDeals: [copy(pizzaA, pizzaA), copy(pizzaA, pizzaB)],
    });
    expect(maxPerOrderIssue(q)).toBeUndefined();
    expect(
      (q.quote?.deals ?? []).filter((d) => d.dealId === deal.id)
    ).toHaveLength(2);
  });

  test("TC-2103: the quote suggests the deal the cart's à-la-carte pizzas already fill — picks point at the request's lines, savings are what the deal takes off; one pizza gets no suggestion", async () => {
    // Soda first, so a lineIndex that ignored the request's order would show.
    const orderItems = [line(soda), line(pizzaA), line(pizzaB)];
    const q = await quoteOk({ orderItems });
    const suggestions = q.quote?.dealSuggestions;
    expect(Array.isArray(suggestions), JSON.stringify(q.quote)).toBe(true);
    const mine = suggestions!.find((s) => s.dealId === deal.id);
    expect(mine, JSON.stringify(suggestions)).toBeTruthy();
    expect(mine!.title).toBe(deal.name);
    expect(mine!.picks.map((p) => p.lineIndex).sort()).toEqual([1, 2]);
    expect(mine!.picks.map((p) => p.dealItemId).sort()).toEqual(
      [buySlot, getSlot].sort()
    );
    // The server's own price for those picks as a deal: savings = the two
    // pizzas à la carte minus the deal line.
    const picked = mine!.picks.map((p) => ({
      dealItemId: p.dealItemId,
      item: orderItems[p.lineIndex]!,
    }));
    const asDeal = await quoteOk({
      orderItems: [line(soda)],
      orderDeals: [
        {
          dealId: deal.id,
          quantity: 1,
          items: picked.map(({ dealItemId, item }) => ({
            dealItemId,
            menuItemId: item.menuItemId,
            quantity: 1,
          })),
        },
      ],
    });
    expect(mine!.savings).toBeGreaterThan(0);
    expect(mine!.savings).toBeCloseTo(
      (q.quote?.subtotal ?? NaN) - (asDeal.quote?.subtotal ?? NaN),
      2
    );
    // The deal is already in that cart: nothing left to suggest for it.
    expect(
      (asDeal.quote?.dealSuggestions ?? []).some((s) => s.dealId === deal.id)
    ).toBe(false);

    const single = await quoteOk({ orderItems: [line(pizzaA), line(soda)] });
    expect(
      (single.quote?.dealSuggestions ?? []).some((s) => s.dealId === deal.id)
    ).toBe(false);
  });

  test("TC-2104: no deal suggestion while a food coupon applies", async () => {
    const coupon = await createCouponPromotion(token, restaurantId, {
      name: `AUTO 10% everything ${runId}`,
      type: "PERCENTAGE",
      value: 10,
      applyMode: "AUTOMATIC",
    });
    try {
      const q = await quoteOk({ orderItems: [line(pizzaA), line(pizzaB)] });
      expect(
        q.quote?.couponDiscount ?? 0,
        JSON.stringify(q.quote)
      ).toBeGreaterThan(0);
      expect(q.quote?.dealSuggestions).toEqual([]);
    } finally {
      await setPromotionStatus(token, "COUPON", coupon.id, "INACTIVE");
    }
  });
});
