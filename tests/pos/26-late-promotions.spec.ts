/**
 * 26-late-promotions.spec.ts — "I saw your deal after I ordered": applying a
 * deal or a coupon to a PLACED order from the POS, same business day (API).
 *
 * Spec: restaunax docs/features/DEAL_COPIES_AND_LATE_PROMOTIONS.md, Part 3;
 * the exact wire is "Backend contract (as built)":
 *   GET  /api/tablet/orders/:id/applicable-deals
 *   POST /api/tablet/orders/:id/apply-deal   {dealId, picks, replaceCoupon?}
 *   POST /api/tablet/orders/:id/apply-coupon {code}  (window now = the day)
 * The window: any live sale (not INITIALIZED / CANCELLED / REFUNDED) of the
 * restaurant's CURRENT business day, while that day has no DailyClose.
 *
 * Gated by RELEASED_ON_QA.dealCopies (utils/releaseGate.ts, tag
 * @deal-copies): until RestauNax feat/deal-copies-late-promotions is on QA
 * every test skips with the reason; flip the flag once it is.
 *
 * Own tenant: a per-run throwaway restaurant (createSecondOwner, alwaysFresh)
 * — TC-2113 CLOSES its business day, which pauses ordering for the night, so
 * never a shared restaurant. Tax 0, open every day 00:00–23:59, a Stripe TEST
 * account (TC-2107's online card order), a REGISTER device with the owner
 * holding the drawer (the owner self-authorizes every approval). Menu: Burger
 * $10, Fries $6.50, Soda $3; "Combo" = burger + fries for $14 (saves $2.50),
 * offered everywhere; a second, identical "Limited combo" for TC-2112.
 * Coupons (codes): $1 off and 50% off.
 *
 * Serial, in this order (the last one closes the day):
 *   TC-2105 applicable-deals: today's order → window open, the combo offered,
 *           no coupon; a cancelled order → window closed (STATUS), no deals.
 *   TC-2106 apply-deal on a READY cash-paid order: total -$2.50, cash refund
 *           due $2.50 (nothing to the card), the units move into the deal;
 *           the drawer hands the cash back.
 *   TC-2107 apply-deal on a PICKED_UP online order paid by card: the card is
 *           refunded $2.50 automatically.
 *   TC-2108 with a coupon on the order: refused (ORDER_HAS_COUPON) unless
 *           replaceCoupon — then the coupon goes and the deal comes in one
 *           step; the total drops by the net change only.
 *   TC-2109 NO_SAVINGS: swapping a 50% coupon for the combo would raise the
 *           total — refused, nothing changes.
 *   TC-2110 DEAL_PICKS_INVALID: picks that point at food already inside a
 *           deal (or no picks at all) are refused.
 *   TC-2111 apply-coupon is now accepted on a READY paid order (cash back).
 *   TC-2112 limit per order: a deal whose limit is used up on the order is
 *           not offered and is refused (DEAL_MAX_PER_ORDER).
 *   TC-2113 after the day is closed: apply-coupon and apply-deal on that
 *           day's order answer LATE_PROMOTION_DAY_CLOSED with guidance, and
 *           applicable-deals reports the window closed (DAY_CLOSED).
 *
 * Not automated: LATE_PROMOTION_NOT_TODAY (an order from an EARLIER business
 * day still open) — the suite can't create an order in the past or move the
 * clock; it is unit-covered (latePromotionWindow.test.ts). Kitchen silence
 * (no reprint) is a socket payload, covered by the backend's unit tests.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import {
  generateCouponCode,
  generateRunId,
  generateSeedPhone,
} from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  ensureTaxRate,
  setOpenAllDayHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createDealApi,
  updateDealRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  openRegisterSessionPos,
  closeRegisterSessionPosRaw,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  updateOrderStatusRaw,
  type ApiDeal,
  type LooseJson,
} from "../../utils/apiHelper";
import { createCouponPromotion } from "../../utils/promotionsApi";
import { slotId } from "../../utils/promotionFixtures";
import { placePaidOnlineOrder } from "../../utils/comboFoodSurfaces";
import {
  applicableDealsRaw,
  applyCouponRaw,
  applyDealRaw,
} from "../../utils/dealCopiesApi";
import { probeDealCopies, requireRelease } from "../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = LooseJson;

const BURGER = 10;
const FRIES = 6.5;
const SODA = 3;
const COMBO = 14;
const COMBO_SAVES = BURGER + FRIES - COMBO; // 2.50
const DAY_CLOSED_SENTENCE =
  "This order's day is closed. A manager can refund from the dashboard, or send the customer a coupon for next time.";
const round2 = (n: number) => Math.round(n * 100) / 100;
const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("POS — late promotions: apply a deal or coupon to a placed order (API) @deal-copies", () => {
  test.describe.configure({ mode: "serial" });
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
  let tablet = "";
  let session = "";
  let pk = "";
  let released = false;
  const burger = { id: "", name: `Burger ${runId}`, price: BURGER };
  const fries = { id: "", name: `Fries ${runId}`, price: FRIES };
  const soda = { id: "", name: `Soda ${runId}`, price: SODA };
  let combo: ApiDeal;
  let limited: ApiDeal;
  const oneOff = { code: "", id: "" };
  const halfOff = { code: "", id: "" };
  /** Unpaid tickets, cancelled before the day closes (TC-2113). */
  const unpaid: string[] = [];
  /** Paid orders of today, for TC-2113's refusals. */
  const paidToday: string[] = [];

  type Item = typeof burger;

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : ownerToken;

  /** A counter ticket of à-la-carte lines (tax 0: total = subtotal). */
  const ticket = (lines: { item: Item; qty?: number }[], extra: Rec = {}) => {
    const subtotal = round2(
      lines.reduce((s, l) => s + l.item.price * (l.qty ?? 1), 0)
    );
    return {
      restaurantId,
      orderType: "PICKUP",
      subtotal,
      tax: 0,
      tip: 0,
      total: subtotal,
      customerPhone: "",
      orderItems: lines.map(({ item, qty }) => ({
        menuItemId: item.id,
        menuItemName: item.name,
        quantity: qty ?? 1,
        price: item.price,
      })),
      ...extra,
    };
  };

  /** Ring an unpaid ticket. */
  const ringUnpaid = async (lines: { item: Item; qty?: number }[]) => {
    const res = await createTabletOrderRaw(tablet, session, ticket(lines));
    expect(res.status, msg(res.data)).toBe(201);
    unpaid.push(String(res.data.id));
    return String(res.data.id);
  };

  /** Ring a cash ticket and take the cash (exact change). */
  const ringCashPaid = async (lines: { item: Item; qty?: number }[]) => {
    const body = ticket(lines, { paymentMethod: "CASH" });
    const res = await createTabletOrderRaw(tablet, session, body);
    expect(res.status, msg(res.data)).toBe(201);
    const id = String(res.data.id);
    const paid = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${id}/mark-paid`,
      { cashTendered: body.total, cashChange: 0 },
      session
    );
    expect(paid.status, msg(paid.data)).toBe(200);
    paidToday.push(id);
    return id;
  };

  /** Walk an order forward to `target` through the kitchen statuses. */
  const advanceTo = async (orderId: string, target: "READY" | "PICKED_UP") => {
    const path = ["CONFIRMED", "PREPARING", "READY", "PICKED_UP"];
    const token = await freshOwnerToken();
    for (const status of path.slice(0, path.indexOf(target) + 1)) {
      const res = await updateOrderStatusRaw(token, orderId, status);
      expect(res.status, `${status}: ${JSON.stringify(res.data)}`).toBe(200);
    }
  };

  const readOrder = async (orderId: string): Promise<Rec> => {
    const r = await getOrderFullRaw(await freshOwnerToken(), orderId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data as Rec;
  };

  /** The order's à-la-carte line for `item`. */
  const lineOf = (order: Rec, item: Item): { id: string; quantity: number } => {
    const found = ((order.orderItems ?? []) as Rec[]).find(
      (i) => i.menuItemId === item.id
    );
    if (!found)
      throw new Error(`no ${item.name} line: ${JSON.stringify(order)}`);
    return { id: String(found.id), quantity: Number(found.quantity) };
  };

  /** One pick per combo slot: the burger and the fries lines of the order. */
  const comboPicks = (order: Rec, deal: ApiDeal) => [
    { orderItemId: lineOf(order, burger).id, dealItemId: slotId(deal, 0) },
    { orderItemId: lineOf(order, fries).id, dealItemId: slotId(deal, 1) },
  ];

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[late-promotions] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 0);
    // Published, open all day (not 24 h: the close then pauses until
    // tomorrow, as in 15-day-close) and a Stripe TEST account for TC-2107.
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await setOpenAllDayHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    if (onboard.status !== 200)
      throw new Error(
        `[late-promotions] stripe: ${JSON.stringify(onboard.data)}`
      );
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    if (!pk.startsWith("pk_test_"))
      throw new Error("[late-promotions] no Stripe TEST key");

    const groupId = (
      await createMenuGroupNamed(ownerToken, `AUTO Late Promos ${runId}`, {
        restaurantId,
      })
    ).id;
    for (const item of [burger, fries, soda]) {
      item.id = (
        await createMenuItemFull(ownerToken, groupId, item.name, item.price)
      ).id;
    }
    combo = await createDealApi(
      ownerToken,
      restaurantId,
      `AUTO Combo ${runId}`,
      COMBO,
      [burger, fries]
    );
    limited = await createDealApi(
      ownerToken,
      restaurantId,
      `AUTO Limited combo ${runId}`,
      COMBO,
      [burger, fries]
    );
    const codeCoupon = async (
      target: { code: string; id: string },
      label: string,
      body: { type: "FIXED_AMOUNT" | "PERCENTAGE"; value: number }
    ) => {
      const code = generateCouponCode();
      const created = await createCouponPromotion(ownerToken, restaurantId, {
        name: `AUTO late ${label} ${runId}`,
        code,
        applyMode: "CODE",
        ...body,
      });
      target.id = created.id;
      target.code = created.code ?? code;
    };
    await codeCoupon(oneOff, "$1 off", { type: "FIXED_AMOUNT", value: 1 });
    await codeCoupon(halfOff, "50% off", { type: "PERCENTAGE", value: 50 });

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-late-promos-${runId}`
    );
    deviceId = device.id;
    tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    session = await tabletStaffSignIn(tablet, ownerMember, "8462");
    await openRegisterSessionPos(tablet, session, 100);
    released = await probeDealCopies(ownerToken, combo.id);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      // Best-effort: the device goes with the archived restaurant anyway.
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      // Admin DELETE archives the throwaway restaurant; a failure leaves an inert store.
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    requireRelease("dealCopies", released);
    await allure.label("feature", "POS late promotions");
    await allure.label("severity", "critical");
  });

  test("TC-2105: applicable-deals — today's order has the window open and the combo offered; a cancelled order's window is closed (STATUS) with no deals", async () => {
    const orderId = await ringUnpaid([
      { item: burger },
      { item: fries },
      { item: soda },
    ]);
    const open = await applicableDealsRaw(tablet, session, orderId);
    expect(open.status, JSON.stringify(open.data)).toBe(200);
    expect(open.data.data?.window).toEqual({ open: true });
    expect(open.data.data?.hasCoupon).toBe(false);
    expect(open.data.data?.coupon).toBeNull();
    const offered = (open.data.data?.deals ?? []).map((d) => d.id);
    expect(offered).toContain(combo.id);

    const doomed = await ringUnpaid([{ item: soda }]);
    const cancelled = await cancelTabletOrderRaw(
      tablet,
      session,
      doomed,
      "Automation: window check"
    );
    expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
    unpaid.splice(unpaid.indexOf(doomed), 1);
    const closed = await applicableDealsRaw(tablet, session, doomed);
    expect(closed.status, JSON.stringify(closed.data)).toBe(200);
    expect(closed.data.data?.window).toEqual({ open: false, reason: "STATUS" });
    expect(closed.data.data?.deals).toEqual([]);
  });

  test("TC-2106: apply-deal on a READY cash-paid order lowers the total by the deal's savings, owes the cash back, and moves the units into the deal", async () => {
    const orderId = await ringCashPaid([
      { item: burger },
      { item: fries },
      { item: soda },
    ]);
    await advanceTo(orderId, "READY");
    const before = await readOrder(orderId);
    expect(Number(before.total)).toBe(BURGER + FRIES + SODA);

    const applied = await applyDealRaw(tablet, session, orderId, {
      dealId: combo.id,
      picks: comboPicks(before, combo),
    });
    expect(applied.status, JSON.stringify(applied.data)).toBe(200);
    const r = applied.data;
    expect(r.success).toBe(true);
    expect(r.dealApplied).toBe(true);
    expect(r.couponRemoved).toBe(false);
    expect(r.delta).toBeCloseTo(-COMBO_SAVES, 2);
    expect(r.order?.total).toBeCloseTo(COMBO + SODA, 2);
    expect(r.appliedDeal).toMatchObject({
      dealId: combo.id,
      title: combo.name,
    });
    expect(r.appliedDeal?.savings).toBeCloseTo(COMBO_SAVES, 2);
    // Cash: nothing goes to a card; the drawer owes the difference.
    expect(r.refundedToCard ?? 0).toBe(0);
    expect(r.requiresRefund).toBeCloseTo(COMBO_SAVES, 2);
    expect(r.balanceDue ?? 0).toBe(0);
    expect(
      r.breakdown,
      "the response carries the money breakdown"
    ).toBeTruthy();

    const after = await readOrder(orderId);
    expect(Number(after.total)).toBeCloseTo(COMBO + SODA, 2);
    expect(after.status).toBe("READY");
    // The burger and fries left their lines; the soda stays à la carte.
    const items = (after.orderItems ?? []) as Rec[];
    expect(items.map((i) => i.menuItemId)).toEqual([soda.id]);
    const deals = (after.orderDeals ?? []) as Rec[];
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ dealId: combo.id, quantity: 1 });
    expect(
      ((deals[0]!.orderDealItems ?? []) as Rec[])
        .map((i) => i.menuItemId)
        .sort()
    ).toEqual([burger.id, fries.id].sort());
    expect(Number(after.refundDueAmount ?? 0)).toBeCloseTo(COMBO_SAVES, 2);

    const handed = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${orderId}/record-cash-refund`,
      {},
      session
    );
    expect(handed.status, msg(handed.data)).toBe(200);
    expect(Number((await readOrder(orderId)).refundDueAmount ?? 0)).toBe(0);
  });

  test("TC-2107: apply-deal on a PICKED_UP online order paid by card refunds the card automatically", async () => {
    const subtotal = BURGER + FRIES + SODA;
    const order = await placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal,
      tax: 0,
      tip: 0,
      deliveryFee: 0,
      total: subtotal,
      customerEmail: `late-promos-${runId}@restaunax-test.com`,
      customerPhone: generateSeedPhone(),
      firstName: "Late",
      lastName: "Promo",
      orderItems: [burger, fries, soda].map((i) => ({
        menuItemId: i.id,
        menuItemName: i.name,
        quantity: 1,
        price: i.price,
      })),
    });
    expect(order.total).toBe(subtotal);
    paidToday.push(order.id);
    await advanceTo(order.id, "PICKED_UP");
    const before = await readOrder(order.id);
    expect(before.paymentStatus).toBe("COMPLETED");

    // An online order is judged on its own channel (ONLINE): the combo is
    // offered everywhere, so it is applicable here too.
    const listed = await applicableDealsRaw(tablet, session, order.id);
    expect(listed.data.data?.window).toEqual({ open: true });
    expect((listed.data.data?.deals ?? []).map((d) => d.id)).toContain(
      combo.id
    );

    const applied = await applyDealRaw(tablet, session, order.id, {
      dealId: combo.id,
      picks: comboPicks(before, combo),
    });
    expect(applied.status, JSON.stringify(applied.data)).toBe(200);
    const r = applied.data;
    expect(r.delta).toBeCloseTo(-COMBO_SAVES, 2);
    expect(r.order?.total).toBeCloseTo(subtotal - COMBO_SAVES, 2);
    expect(r.refundedToCard).toBeCloseTo(COMBO_SAVES, 2);
    expect(r.requiresRefund ?? 0).toBe(0);
    expect(r.balanceDue ?? 0).toBe(0);
    const after = await readOrder(order.id);
    expect(after.status).toBe("PICKED_UP");
    expect(Number(after.total)).toBeCloseTo(subtotal - COMBO_SAVES, 2);
  });

  test("TC-2108: a coupon on the order — apply-deal is refused (ORDER_HAS_COUPON) unless replaceCoupon swaps them in one step", async () => {
    const orderId = await ringUnpaid([
      { item: burger },
      { item: fries },
      { item: soda },
    ]);
    const coupon = await applyCouponRaw(tablet, session, orderId, oneOff.code);
    expect(coupon.status, JSON.stringify(coupon.data)).toBe(200);
    expect(coupon.data.order?.total).toBeCloseTo(BURGER + FRIES + SODA - 1, 2);

    const listed = await applicableDealsRaw(tablet, session, orderId);
    expect(listed.data.data?.hasCoupon).toBe(true);
    expect(listed.data.data?.coupon?.savings).toBeCloseTo(1, 2);
    expect(listed.data.data?.coupon?.title ?? "").not.toBe("");

    const before = await readOrder(orderId);
    const refused = await applyDealRaw(tablet, session, orderId, {
      dealId: combo.id,
      picks: comboPicks(before, combo),
    });
    expect(refused.status, JSON.stringify(refused.data)).toBe(400);
    expect(refused.data.errorCode).toBe("ORDER_HAS_COUPON");
    expect(refused.data.message).toBe(
      "This order has a coupon. Remove the coupon first: a deal and a coupon can't be combined."
    );

    const swapped = await applyDealRaw(tablet, session, orderId, {
      dealId: combo.id,
      picks: comboPicks(before, combo),
      replaceCoupon: true,
    });
    expect(swapped.status, JSON.stringify(swapped.data)).toBe(200);
    expect(swapped.data.couponRemoved).toBe(true);
    // Net change only: $1 coupon off, $2.50 deal on.
    expect(swapped.data.delta).toBeCloseTo(-(COMBO_SAVES - 1), 2);
    expect(swapped.data.order?.total).toBeCloseTo(COMBO + SODA, 2);
    const after = await readOrder(orderId);
    expect(after.couponId ?? null).toBeNull();
    expect(Number(after.discountAmount ?? 0)).toBe(0);
    expect(((after.orderDeals ?? []) as Rec[]).map((d) => d.dealId)).toEqual([
      combo.id,
    ]);
  });

  test("TC-2109: NO_SAVINGS — swapping a 50% coupon for the combo would raise the total, so it is refused and nothing changes", async () => {
    const orderId = await ringUnpaid([
      { item: burger },
      { item: fries },
      { item: soda },
    ]);
    const coupon = await applyCouponRaw(tablet, session, orderId, halfOff.code);
    expect(coupon.status, JSON.stringify(coupon.data)).toBe(200);
    const half = round2((BURGER + FRIES + SODA) / 2);
    expect(coupon.data.order?.total).toBeCloseTo(half, 2);

    const before = await readOrder(orderId);
    const refused = await applyDealRaw(tablet, session, orderId, {
      dealId: combo.id,
      picks: comboPicks(before, combo),
      replaceCoupon: true,
    });
    expect(refused.status, JSON.stringify(refused.data)).toBe(400);
    expect(refused.data.errorCode).toBe("NO_SAVINGS");
    expect(refused.data.message).toBe(
      "This deal wouldn't lower the price of this order."
    );
    const after = await readOrder(orderId);
    expect(Number(after.total)).toBeCloseTo(half, 2);
    expect(after.couponId).toBe(before.couponId);
    expect((after.orderDeals ?? []) as Rec[]).toHaveLength(0);
  });

  test("TC-2110: DEAL_PICKS_INVALID — picks pointing at food already inside a deal, or no picks, are refused", async () => {
    // A ticket rung WITH the combo (plus a soda): its burger and fries are
    // OrderDealItems, not à-la-carte lines.
    const body = ticket([{ item: soda }], {
      subtotal: round2(SODA + COMBO),
      total: round2(SODA + COMBO),
      orderDeals: [
        {
          dealId: combo.id,
          dealName: combo.name,
          dealPrice: COMBO,
          quantity: 1,
          items: [burger, fries].map((i) => ({
            menuItemId: i.id,
            menuItemName: i.name,
            menuItemPrice: i.price,
            quantity: 1,
          })),
        },
      ],
      dealDiscountAmount: COMBO_SAVES,
    });
    const rung = await createTabletOrderRaw(tablet, session, body);
    expect(rung.status, msg(rung.data)).toBe(201);
    const orderId = String(rung.data.id);
    unpaid.push(orderId);
    const order = await readOrder(orderId);
    const dealItems = (((order.orderDeals ?? []) as Rec[])[0]?.orderDealItems ??
      []) as Rec[];
    const inside = (item: Item) =>
      String(dealItems.find((i) => i.menuItemId === item.id)?.id);

    const fromDeal = await applyDealRaw(tablet, session, orderId, {
      dealId: combo.id,
      picks: [
        { orderItemId: inside(burger), dealItemId: slotId(combo, 0) },
        { orderItemId: inside(fries), dealItemId: slotId(combo, 1) },
      ],
    });
    expect(fromDeal.status, JSON.stringify(fromDeal.data)).toBe(400);
    expect(fromDeal.data.errorCode).toBe("DEAL_PICKS_INVALID");
    expect(fromDeal.data.message).toBe(
      "Those items don't fill this deal. Pick items already on the order, one per spot in the deal."
    );

    const none = await applyDealRaw(tablet, session, orderId, {
      dealId: combo.id,
      picks: [],
    });
    expect(none.status, JSON.stringify(none.data)).toBe(400);
    expect(none.data.errorCode).toBe("DEAL_PICKS_INVALID");
    // Nothing moved.
    const after = await readOrder(orderId);
    expect((after.orderDeals ?? []) as Rec[]).toHaveLength(1);
    expect(Number(after.total)).toBeCloseTo(SODA + COMBO, 2);
  });

  test("TC-2111: apply-coupon is accepted on a READY paid order (it used to be refused once the food was ready) and owes the cash back", async () => {
    const orderId = await ringCashPaid([{ item: burger }]);
    await advanceTo(orderId, "READY");
    const res = await applyCouponRaw(tablet, session, orderId, oneOff.code);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.order?.total).toBeCloseTo(BURGER - 1, 2);
    expect(res.data.requiresRefund).toBeCloseTo(1, 2);
    const handed = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${orderId}/record-cash-refund`,
      {},
      session
    );
    expect(handed.status, msg(handed.data)).toBe(200);
  });

  test("TC-2112: limit per order — a deal whose limit is used up on the order is not offered, and apply-deal refuses it (DEAL_MAX_PER_ORDER)", async () => {
    const token = await freshOwnerToken();
    const capped = await updateDealRaw(token, limited.id, { maxPerOrder: 1 });
    expect(capped.status, JSON.stringify(capped.data)).toBe(200);
    // One copy of the limited combo already on the ticket, plus a burger and
    // fries à la carte that would fill a second copy.
    const body = ticket([{ item: burger }, { item: fries }], {
      subtotal: round2(BURGER + FRIES + COMBO),
      total: round2(BURGER + FRIES + COMBO),
      orderDeals: [
        {
          dealId: limited.id,
          dealName: limited.name,
          dealPrice: COMBO,
          quantity: 1,
          items: [burger, fries].map((i) => ({
            menuItemId: i.id,
            menuItemName: i.name,
            menuItemPrice: i.price,
            quantity: 1,
          })),
        },
      ],
      dealDiscountAmount: COMBO_SAVES,
    });
    const rung = await createTabletOrderRaw(tablet, session, body);
    expect(rung.status, msg(rung.data)).toBe(201);
    const orderId = String(rung.data.id);
    unpaid.push(orderId);

    const listed = await applicableDealsRaw(tablet, session, orderId);
    const offered = (listed.data.data?.deals ?? []).map((d) => d.id);
    expect(offered).not.toContain(limited.id);
    expect(offered).toContain(combo.id);

    const order = await readOrder(orderId);
    const refused = await applyDealRaw(tablet, session, orderId, {
      dealId: limited.id,
      picks: comboPicks(order, limited),
    });
    expect(refused.status, JSON.stringify(refused.data)).toBe(400);
    expect(refused.data.errorCode).toBe("DEAL_MAX_PER_ORDER");
    expect(refused.data.message).toBe(
      "This order has more of this deal than it allows. Remove a copy to continue."
    );
  });

  test("TC-2113: after the day is closed, apply-coupon and apply-deal on that day's order are refused (LATE_PROMOTION_DAY_CLOSED) with guidance, and applicable-deals says the window is closed", async () => {
    // A paid order with a burger and fries still à la carte.
    const orderId = await ringCashPaid([{ item: burger }, { item: fries }]);
    const order = await readOrder(orderId);

    await allure.step("close the day (throwaway restaurant)", async () => {
      for (const id of unpaid) {
        const res = await cancelTabletOrderRaw(
          tablet,
          session,
          id,
          "Automation: before the day close"
        );
        expect(res.status, JSON.stringify(res.data)).toBe(200);
      }
      // Count the drawer: the float + cash taken − cash handed back (TC-2106,
      // TC-2111). A miscount only shows as over/short; it never blocks.
      const expected = round2(
        100 +
          (BURGER + FRIES + SODA) +
          BURGER +
          (BURGER + FRIES) -
          COMBO_SAVES -
          1
      );
      const counted = await closeRegisterSessionPosRaw(tablet, session, {
        countedCash: expected,
      });
      expect(counted.status, JSON.stringify(counted.data)).toBe(200);
      const closed = await tabletRaw<Rec>(
        tablet,
        "POST",
        "/day-close",
        { depositAmount: 0 },
        session
      );
      expect(closed.status, JSON.stringify(closed.data)).toBe(201);
    });

    const coupon = await applyCouponRaw(tablet, session, orderId, oneOff.code);
    expect(coupon.status, JSON.stringify(coupon.data)).toBe(400);
    expect(coupon.data.errorCode).toBe("LATE_PROMOTION_DAY_CLOSED");
    expect(coupon.data.message).toBe(DAY_CLOSED_SENTENCE);

    const deal = await applyDealRaw(tablet, session, orderId, {
      dealId: combo.id,
      picks: comboPicks(order, combo),
    });
    expect(deal.status, JSON.stringify(deal.data)).toBe(400);
    expect(deal.data.errorCode).toBe("LATE_PROMOTION_DAY_CLOSED");
    expect(deal.data.message).toBe(DAY_CLOSED_SENTENCE);

    // Every order of the closed day: the window is closed for all of them.
    for (const id of paidToday) {
      const listed = await applicableDealsRaw(tablet, session, id);
      expect(listed.status, JSON.stringify(listed.data)).toBe(200);
      expect(listed.data.data?.window).toEqual({
        open: false,
        reason: "DAY_CLOSED",
      });
      expect(listed.data.data?.deals).toEqual([]);
    }
    expect(Number((await readOrder(orderId)).total)).toBe(BURGER + FRIES);
  });
});
