/**
 * 11-promotions.spec.ts — Promotions at the POS (device-in-store), API level.
 *
 * Spec: restaunax docs/features/PROMOTIONS.md → "Clients" (device-in-store) and
 * "Old clients". The POS asks the server what a cart costs
 * (POST /api/tablet/orders/price-preview — the /quote engine on the in-store
 * surface) and the create-order floor re-judges the same ticket, so a preview
 * total and the stored order total must agree.
 *
 * Own tenant: per-run throwaway restaurant (createSecondOwner) seeded with the
 * acceptance set (SAVE15 / SAVE2 / FIRST5 / SAVE3). Setup chain mirrors
 * 10-deals: ADMIN-created REGISTER device → tablet login → owner PIN → staff
 * sign-in, then a register session for cash tenders. Tax is set to 0%, so
 * every total is a clean sum. Orders are cash tenders, except TC-851's unpaid
 * CARD delivery tickets (never paid, so no courier is dispatched); every order
 * is cancelled in afterAll.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateCouponCode, generateRunId } from "../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  setCanAcceptDeliveriesAdminApi,
  ensureTaxRate,
  deleteTestRestaurant,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  setOwnerPosPin,
  tabletStaffSignIn,
  openRegisterSessionPos,
  closeRegisterSessionPosRaw,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  type TabletDevice,
} from "../../utils/apiHelper";
import {
  codeIssueOf,
  createCouponPromotion,
  tabletPricePreview,
  type PromotionQuote,
} from "../../utils/promotionsApi";
import {
  MENU_PRICES,
  createPromotionDeal,
  seedAcceptanceSet,
  slotId,
  type AcceptanceSet,
} from "../../utils/promotionFixtures";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const round2 = (n: number) => Math.round(n * 100) / 100;
const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

/** The slice of the /quote-shaped preview response these tests read. */
interface PreviewBody {
  quote?: {
    amountToCharge: number;
    subtotal: number;
    appliedPromotion: PromotionQuote["appliedPromotion"];
    codeOutcome?: string | null;
    codeOutcomeMessage?: string | null;
  };
  issues?: PromotionQuote["issues"];
}

const SAVE15_CAP = 4.5;
/** 3 chicken gyros = 38.97, over SAVE15's $30 minimum; 15% = 5.85 → capped 4.50. */
const GYROS = 3;
const GYRO_SUBTOTAL = round2(MENU_PRICES.chickenGyro * GYROS);

test.describe("POS — Promotions (price-preview + cash orders)", () => {
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
  let set: AcceptanceSet;
  let device: TabletDevice | undefined;
  let tabletToken = "";
  let staffSession = "";
  let registerOpen = false;
  const openedOrderIds: string[] = [];

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  const preview = async (body: Record<string, unknown>) => {
    const res = await tabletPricePreview(tabletToken, staffSession, body);
    return { status: res.status, body: res.body as PreviewBody };
  };

  const gyroItems = () => [
    { menuItemId: set.menu.gyroIds[0], quantity: GYROS },
  ];

  /** A register cash order body for the 3-gyro cart, with optional promotion claim. */
  const gyroCashBody = (over: Record<string, unknown> = {}) => ({
    restaurantId,
    orderType: "PICKUP",
    paymentMethod: "CASH",
    subtotal: GYRO_SUBTOTAL,
    tax: 0,
    tip: 0,
    processingFee: 0,
    total: GYRO_SUBTOTAL,
    customerPhone: "",
    orderItems: [
      {
        menuItemId: set.menu.gyroIds[0],
        menuItemName: "Chicken Gyro",
        quantity: GYROS,
        price: MENU_PRICES.chickenGyro,
      },
    ],
    ...over,
  });

  const ring = async (body: Record<string, unknown>) => {
    const res = await createTabletOrderRaw(tabletToken, staffSession, body);
    if (res.status === 201 && res.data.id) openedOrderIds.push(res.data.id);
    return res;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error("[pos-promotions] could not mint the throwaway tenant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;
    await updateRestaurantSettingsApi(token, restaurantId, {
      acceptingOrders: true,
    });
    // Zero rate: the pricing endpoints refuse a restaurant with no tax rate, and 0 keeps every total a clean sum.
    await ensureTaxRate(token, restaurantId, 0);
    set = await seedAcceptanceSet(token, restaurantId);
    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Promotions POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);
    const pin = "8462";
    const staffMemberId = await setOwnerPosPin(token, restaurantId, pin);
    staffSession = await tabletStaffSignIn(tabletToken, staffMemberId, pin);
    await openRegisterSessionPos(tabletToken, staffSession);
    registerOpen = true;
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const orderId of openedOrderIds) {
      // Best-effort: a settled/cancelled order answers 400; the tenant is archived below anyway.
      await cancelTabletOrderRaw(
        tabletToken,
        staffSession,
        orderId,
        "Automation cleanup"
      ).catch(() => {});
    }
    if (registerOpen) {
      // Best-effort: an oversized count still closes the session on the throwaway tenant.
      await closeRegisterSessionPosRaw(tabletToken, staffSession, {
        countedCash: 1_000_000,
      }).catch(() => {});
    }
    const t = await freshOwnerToken().catch(() => token);
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    // Admin DELETE archives the throwaway restaurant; AUTO promotions are also swept by globalTeardown.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test("TC-845: price-preview for a SAVE15 cart (>= $30) applies the capped 15% — savings 4.50 and the total matches", async () => {
    const res = await preview({
      orderType: "PICKUP",
      items: gyroItems(),
      couponCode: set.save15.code,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const q = res.body.quote!;
    expect(q.subtotal).toBe(GYRO_SUBTOTAL);
    expect(q.appliedPromotion?.couponId).toBe(set.save15.id);
    expect(q.appliedPromotion?.savings).toBe(SAVE15_CAP);
    expect(q.amountToCharge).toBe(round2(GYRO_SUBTOTAL - SAVE15_CAP));
  });

  test("TC-846: an automatic ITEM_SALE item is discounted by the preview without any code", async () => {
    const sale = await createCouponPromotion(token, restaurantId, {
      name: `AUTO POS $1 off knots ${runId}`,
      code: null,
      type: "ITEM_SALE",
      saleKind: "AMOUNT_OFF",
      value: 1,
      applyMode: "AUTOMATIC",
      scopeItemIds: [set.menu.knotsId],
    });
    const res = await preview({
      orderType: "PICKUP",
      items: [{ menuItemId: set.menu.knotsId, quantity: 1 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const q = res.body.quote!;
    expect(q.appliedPromotion?.couponId).toBe(sale.id);
    expect(q.appliedPromotion?.savings).toBe(1);
    expect(q.amountToCharge).toBe(round2(MENU_PRICES.knots - 1));
  });

  test("TC-847: a code on a cart holding a bundle is an ERROR issue (coupon_deal_exclusive) — the POS shows 'Remove the code to continue'", async () => {
    const res = await preview({
      orderType: "PICKUP",
      items: [{ menuItemId: set.menu.gyroIds[0], quantity: 2 }],
      deals: [
        {
          dealId: set.save3.dealId,
          quantity: 1,
          selections: [
            {
              dealItemId: set.save3.slotIds[0],
              menuItemId: set.menu.riceBowlId,
            },
            {
              dealItemId: set.save3.slotIds[1],
              menuItemId: set.menu.gyroIds[1],
            },
            { dealItemId: set.save3.slotIds[2], menuItemId: set.menu.pattyId },
          ],
        },
      ],
      couponCode: set.save15.code,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const issue = codeIssueOf(res.body.issues);
    expect(issue, JSON.stringify(res.body.issues)).not.toBeNull();
    expect(issue!.code).toBe("coupon_deal_exclusive");
    expect(issue!.severity).toBe("ERROR");
    expect(issue!.message ?? "").toBe(
      "Coupons can't be combined with deals. Remove the deal or the coupon to continue."
    );
    // The bundle is the customer's promotion: the code did not apply.
    expect(res.body.quote!.appliedPromotion?.couponId).not.toBe(set.save15.id);
  });

  test("TC-848: FIRST5 with no customer phone is refused with the first-order sentence; with a new customer's phone it applies", async () => {
    const anonymous = await preview({
      orderType: "PICKUP",
      items: gyroItems(),
      couponCode: set.first5.code,
    });
    expect(anonymous.status, JSON.stringify(anonymous.body)).toBe(200);
    const issue = codeIssueOf(anonymous.body.issues);
    expect(issue, JSON.stringify(anonymous.body.issues)).not.toBeNull();
    expect(issue!.reason).toBe("first_order_needs_customer");
    expect(issue!.message ?? anonymous.body.quote!.codeOutcomeMessage).toBe(
      "Add the customer's phone number to use a first-order promotion."
    );
    expect(anonymous.body.quote!.appliedPromotion).toBeNull();

    const withPhone = await preview({
      orderType: "PICKUP",
      items: gyroItems(),
      couponCode: set.first5.code,
      customerPhone: `+1555${String(Date.now()).slice(-7)}`,
    });
    expect(withPhone.status, JSON.stringify(withPhone.body)).toBe(200);
    expect(withPhone.body.quote!.appliedPromotion?.couponId).toBe(
      set.first5.id
    );
    expect(withPhone.body.quote!.appliedPromotion?.savings).toBe(5);
  });

  test("TC-849: a cash order with SAVE15 and the discountAmount claim stores couponId, discountAmount 4.50 and the previewed total", async () => {
    const prev = await preview({
      orderType: "PICKUP",
      items: gyroItems(),
      couponCode: set.save15.code,
    });
    expect(prev.status, JSON.stringify(prev.body)).toBe(200);
    const previewTotal = prev.body.quote!.amountToCharge;

    const res = await ring(
      gyroCashBody({
        couponId: set.save15.id,
        discountAmount: SAVE15_CAP,
        total: previewTotal,
      })
    );
    expect(res.status, msg(res.data)).toBe(201);
    const order = await getOrderFullRaw(token, res.data.id!);
    expect(order.status).toBe(200);
    expect(order.data.couponId).toBe(set.save15.id);
    expect(order.data.discountAmount).toBe(SAVE15_CAP);
    expect(order.data.total).toBe(previewTotal);
  });

  test("TC-850: a CODE-only deal on create-order is refused without its code on the deal line (code_required) and created at the deal price (plus a patty) with it", async () => {
    const dealCode = generateCouponCode();
    const sodaPrice = MENU_PRICES.soda;
    const knotsPrice = MENU_PRICES.knots;
    const dealPrice = 5;
    const deal = await createPromotionDeal(token, restaurantId, {
      name: `AUTO POS code-only combo ${runId}`,
      dealType: "COMBO",
      dealPrice,
      applyMode: "CODE",
      code: dealCode,
      items: [
        {
          menuItemId: set.menu.sodaId,
          quantity: 1,
          role: "INCLUDED",
          isRequired: true,
          itemName: "Fountain Soda",
          itemPrice: sodaPrice,
          sortOrder: 0,
        },
        {
          menuItemId: set.menu.knotsId,
          quantity: 1,
          role: "INCLUDED",
          isRequired: true,
          itemName: "Garlic Knots",
          itemPrice: knotsPrice,
          sortOrder: 1,
        },
      ],
    });
    const line = (withCode: boolean) => ({
      dealId: deal.id,
      dealName: deal.name,
      dealPrice,
      quantity: 1,
      ...(withCode ? { code: dealCode } : {}),
      items: [
        {
          dealItemId: slotId(deal, 0),
          menuItemId: set.menu.sodaId,
          menuItemName: "Fountain Soda",
          menuItemPrice: sodaPrice,
          quantity: 1,
        },
        {
          dealItemId: slotId(deal, 1),
          menuItemId: set.menu.knotsId,
          menuItemName: "Garlic Knots",
          menuItemPrice: knotsPrice,
          quantity: 1,
        },
      ],
    });
    const body = (withCode: boolean) => ({
      restaurantId,
      orderType: "PICKUP",
      paymentMethod: "CASH",
      subtotal: round2(dealPrice + MENU_PRICES.patty),
      tax: 0,
      tip: 0,
      processingFee: 0,
      total: round2(dealPrice + MENU_PRICES.patty),
      customerPhone: "",
      orderItems: [
        {
          menuItemId: set.menu.pattyId,
          menuItemName: "Jamaican Beef Patty",
          quantity: 1,
          price: MENU_PRICES.patty,
        },
      ],
      orderDeals: [line(withCode)],
      dealDiscountAmount: round2(sodaPrice + knotsPrice - dealPrice),
    });

    const refused = await ring(body(false));
    expect(refused.status, msg(refused.data)).toBe(400);
    expect(msg(refused.data)).toBe(
      "This deal needs its code. Enter the deal's code to add it."
    );

    const created = await ring(body(true));
    expect(created.status, msg(created.data)).toBe(201);
    const expectedTotal = round2(dealPrice + MENU_PRICES.patty);
    expect(created.data.total).toBe(expectedTotal);
    const order = await getOrderFullRaw(token, created.data.id!);
    const deals = order.data.orderDeals as
      | { dealId: string; dealPrice: number }[]
      | undefined;
    expect(deals).toHaveLength(1);
    expect(deals![0]).toMatchObject({ dealId: deal.id, dealPrice });
    expect(order.data.total).toBe(expectedTotal);
  });

  test("TC-851: an old POS build's delivery ticket (no deliveryDiscount claim) waives the fee for an entered, eligible free-delivery code, never for an automatic one", async () => {
    // Unpaid CARD tickets (requiresPaymentFirst -> INITIALIZED, no payment) so no
    // courier is ever dispatched: dispatch runs only after payment
    // (orderPostPaymentService.handleAutoDispatch) or on a staff dispatch call.
    const FEE = 6;
    await setCanAcceptDeliveriesAdminApi(adminToken, restaurantId, true);
    const deliveryBody = (over: Record<string, unknown>) => ({
      restaurantId,
      orderType: "DELIVERY",
      paymentMethod: "CARD",
      requiresPaymentFirst: true,
      subtotal: GYRO_SUBTOTAL,
      deliveryFee: FEE,
      tax: 0,
      tip: 0,
      processingFee: 0,
      total: round2(GYRO_SUBTOTAL + FEE),
      customerPhone: "",
      deliveryAddress: {
        street: "1 Main St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        country: "US",
      },
      quoteDetails: {
        id: `AUTO-synthetic-quote-${runId}`,
        provider: "UBER",
        fee: FEE * 100,
        estimatedDropoffTime: new Date(Date.now() + 3_600_000).toISOString(),
        duration: 1800,
      },
      orderItems: [
        {
          menuItemId: set.menu.gyroIds[0],
          menuItemName: "Chicken Gyro",
          quantity: GYROS,
          price: MENU_PRICES.chickenGyro,
        },
      ],
      ...over,
    });

    const code = await createCouponPromotion(token, restaurantId, {
      name: `AUTO POS free delivery code ${runId}`,
      code: generateCouponCode(),
      type: "FREE_DELIVERY",
      value: 0,
      minOrderAmount: 1,
      maxDiscount: 8,
      applyMode: "CODE",
    });
    const withCode = await ring(
      deliveryBody({ couponId: code.id, total: GYRO_SUBTOTAL })
    );
    expect(withCode.status, msg(withCode.data)).toBe(201);
    const waived = await getOrderFullRaw(token, withCode.data.id!);
    expect(waived.data.couponId).toBe(code.id);
    expect(waived.data.deliveryDiscount).toBe(FEE);
    expect(waived.data.total).toBe(GYRO_SUBTOTAL);

    await createCouponPromotion(token, restaurantId, {
      name: `AUTO POS automatic free delivery ${runId}`,
      code: null,
      type: "FREE_DELIVERY",
      value: 0,
      minOrderAmount: 1,
      maxDiscount: 8,
      applyMode: "AUTOMATIC",
    });
    const noCode = await ring(deliveryBody({}));
    expect(noCode.status, msg(noCode.data)).toBe(201);
    const full = await getOrderFullRaw(token, noCode.data.id!);
    expect(full.data.deliveryDiscount ?? 0).toBe(0);
    expect(full.data.total).toBe(round2(GYRO_SUBTOTAL + FEE));
  });

  test("TC-855: price-preview without a device token is refused (401)", async () => {
    const res = await apiRequestRaw(
      "POST",
      "/api/tablet/orders/price-preview",
      { orderType: "PICKUP", items: gyroItems() }
    );
    expect(res.status).toBe(401);
  });

  test("TC-856: a cash order claiming more than SAVE15 gives (discountAmount 5.50 vs the 4.50 cap) is refused", async () => {
    const res = await ring(
      gyroCashBody({
        couponId: set.save15.id,
        discountAmount: 5.5,
        total: round2(GYRO_SUBTOTAL - 5.5),
      })
    );
    expect(res.status, msg(res.data)).toBe(400);
    expect(msg(res.data)).toBe(
      "We couldn't verify your order total. Please refresh your cart and try again."
    );
  });
});
