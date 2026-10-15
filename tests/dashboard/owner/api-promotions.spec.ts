/**
 * api-promotions.spec.ts — Promotions API contract (Layer 1).
 * Spec: restaunax docs/features/PROMOTIONS.md. Runs on a throwaway tenant
 * (createSecondOwner), never the seed restaurant.
 *
 * TC-713..714: codes resolve. TC-715..733: every type, every money rule and
 * the old-client protections, on the acceptance set (seedAcceptanceSet). Every
 * money assertion is the server's number (/quote, /validate, redeem-code).
 *
 * Tests in this file share one tenant and run in file order (fullyParallel is
 * off). A test that turns on an extra AUTOMATIC promotion (it competes in
 * every quote — "best one wins") pauses it again in `finally`, so each test
 * stays independent of the others.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  createSeededOrder,
  deleteTestRestaurant,
  getActiveDealsPublic,
  getRestaurantTimeZonePublic,
  setRestaurantPublishedApi,
  updateRestaurantSettingsApi,
  validateCouponRaw,
  type QuoteResponse,
} from "../../../utils/apiHelper";
import { generateCouponCode, generateRunId } from "../../../utils/testData";
import {
  createCouponPromotion,
  promotionQuote,
  redeemCode,
  listPromotions,
  setPromotionStatus,
} from "../../../utils/promotionsApi";
import {
  MENU_PRICES,
  createPromotionDeal,
  publicMenuItem,
  seedAcceptanceSet,
  slotId,
  type AcceptanceSet,
} from "../../../utils/promotionFixtures";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/** An i18n key leaking instead of resolved text (e.g. "api:error.x"). */
const I18N_KEY = /^[a-z]+:[a-zA-Z.]+$/;

test.describe("Promotions — API contract", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_* credentials not set in .env (admin mints the throwaway tenant)"
  );

  let adminToken = "";
  let token = "";
  let restaurantId = "";
  let ownsEnvTenant = false;
  let set: AcceptanceSet;

  /** 3 gyros: 12.99 + 13.99 + 14.99 = $41.97. */
  const threeGyros = () =>
    set.menu.gyroIds.map((menuItemId) => ({ menuItemId, quantity: 1 }));

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, generateRunId());
    if (!tenant.restaurantId)
      throw new Error("throwaway tenant has no restaurant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownsEnvTenant = Boolean(
      process.env.OWNER2_EMAIL && process.env.OWNER2_PASSWORD
    );
    // A tax rate (0% keeps the money readable) or /quote refuses to price;
    // published + accepting orders or the seeded prior order (TC-721) is
    // refused.
    await updateRestaurantSettingsApi(token, restaurantId, {
      acceptingOrders: true,
      tax: 0,
    });
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    set = await seedAcceptanceSet(token, restaurantId);
  });

  test.afterAll(async () => {
    if (restaurantId && !ownsEnvTenant) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
        // Best-effort: the AUTO sweep in globalTeardown covers leftovers.
      });
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-713: an order code redeems as ORDER and appears in the promotions list", async () => {
    const code = generateCouponCode();
    const { id } = await createCouponPromotion(token, restaurantId, {
      name: `AUTO ${code}`,
      code,
      type: "PERCENTAGE",
      value: 15,
      minOrderAmount: 30,
      maxDiscount: 4.5,
      applyMode: "CODE",
    });
    const r = await redeemCode(restaurantId, code);
    expect(r.status).toBe(200);
    expect(r.body.data?.kind).toBe("ORDER");
    const list = await listPromotions(token, restaurantId);
    expect(list.find((p) => p.id === id)?.code).toBe(code);
  });

  test("TC-714: an unknown code is refused with a readable message", async () => {
    const r = await redeemCode(restaurantId, "AUTONOPE" + Date.now());
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.success).toBe(false);
    // Resolved text, never an i18n key.
    expect(r.body.message ?? "").not.toMatch(I18N_KEY);
  });

  test("TC-715: SAVE15 on 3 gyros ($41.97) saves the $4.50 cap", async () => {
    const q = await allure.step("quote 3 gyros + SAVE15", () =>
      promotionQuote(restaurantId, {
        items: threeGyros(),
        couponCode: set.save15.code,
      })
    );
    expect(q.subtotal).toBeCloseTo(41.97, 2);
    expect(q.appliedPromotion, JSON.stringify(q.raw)).not.toBeNull();
    expect(q.appliedPromotion?.couponId).toBe(set.save15.id);
    expect(q.appliedPromotion?.savings).toBeCloseTo(4.5, 2);
    expect(q.appliedPromotion?.title).toBeTruthy();
    expect(q.codeOutcome).toBe("APPLIED");
  });

  test("TC-716: SAVE15 on $24.98 of food is refused for the minimum", async () => {
    const q = await promotionQuote(restaurantId, {
      items: [
        { menuItemId: set.menu.riceBowlId, quantity: 1 },
        { menuItemId: set.menu.gyroIds[0], quantity: 1 },
      ],
      couponCode: set.save15.code,
    });
    expect(q.subtotal).toBeCloseTo(
      MENU_PRICES.riceBowl + MENU_PRICES.chickenGyro,
      2
    );
    expect(q.appliedPromotion, JSON.stringify(q.raw)).toBeNull();
    expect(q.codeOutcome).toBe("NOT_ELIGIBLE");
    expect(q.codeOutcomeMessage ?? "").toMatch(/minimum/i);
  });

  test("TC-717: the SAVE2 code redeems as a BUNDLE that opens its deal", async () => {
    const r = await redeemCode(restaurantId, set.save2.code);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toEqual({ kind: "BUNDLE", dealId: set.save2.dealId });
  });

  test("TC-718: SAVE2 with Lamb + Chicken prices the 2nd gyro at $1.99 ($15.98)", async () => {
    const [chicken, lamb] = set.menu.gyroIds;
    const q = await promotionQuote(restaurantId, {
      items: [],
      orderDeals: [
        {
          dealId: set.save2.dealId,
          quantity: 1,
          items: [
            { dealItemId: set.save2.buyItemId, menuItemId: lamb, quantity: 1 },
            {
              dealItemId: set.save2.getItemId,
              menuItemId: chicken,
              quantity: 1,
            },
          ],
        },
      ],
    });
    const line = q.deals.find((d) => d.dealId === set.save2.dealId);
    expect(line, JSON.stringify(q.raw)).toBeTruthy();
    // Equal-or-lesser value: the cheaper pick is the one at $1.99.
    expect(line?.lineTotal).toBeCloseTo(MENU_PRICES.lambGyro + 1.99, 2);
    expect(q.subtotal).toBeCloseTo(15.98, 2);
  });

  test("TC-719: the SAVE3 combo (bowl + gyro + patty) is $21.99 with no code", async () => {
    const [bowlSlot, gyroSlot, pattySlot] = set.save3.slotIds;
    const q = await promotionQuote(restaurantId, {
      items: [],
      orderDeals: [
        {
          dealId: set.save3.dealId,
          quantity: 1,
          items: [
            {
              dealItemId: bowlSlot,
              menuItemId: set.menu.riceBowlId,
              quantity: 1,
            },
            {
              dealItemId: gyroSlot,
              menuItemId: set.menu.gyroIds[1],
              quantity: 1,
            },
            {
              dealItemId: pattySlot,
              menuItemId: set.menu.pattyId,
              quantity: 1,
            },
          ],
        },
      ],
    });
    const line = q.deals.find((d) => d.dealId === set.save3.dealId);
    expect(line, JSON.stringify(q.raw)).toBeTruthy();
    expect(line?.dealPrice).toBeCloseTo(21.99, 2);
    expect(q.subtotal).toBeCloseTo(21.99, 2);
    expect(q.issues?.filter((i) => i.severity === "ERROR") ?? []).toEqual([]);
  });

  test("TC-720: FIRST5 takes $5 off for a guest with a fresh email", async () => {
    const q = await promotionQuote(restaurantId, {
      items: [{ menuItemId: set.menu.gyroIds[0], quantity: 1 }],
      couponCode: set.first5.code,
      customerEmail: `auto-first-${generateRunId()}@restaunax-test.com`,
    });
    expect(q.appliedPromotion, JSON.stringify(q.raw)).not.toBeNull();
    expect(q.appliedPromotion?.couponId).toBe(set.first5.id);
    expect(q.appliedPromotion?.savings).toBeCloseTo(5, 2);
  });

  test.describe.serial("TC-721: FIRST5 after a prior paid order", () => {
    const email = `auto-repeat-${generateRunId()}@restaunax-test.com`;

    test.beforeAll(async () => {
      // A confirmed (paid-equivalent) order makes this email a returning
      // customer at the tenant.
      const order = await createSeededOrder(
        token,
        restaurantId,
        {
          menuItemId: set.menu.gyroIds[0],
          name: "Chicken Gyro",
          price: MENU_PRICES.chickenGyro,
        },
        { customerEmail: email }
      );
      expect(order.status).toBe("CONFIRMED");
    });

    test("TC-721: FIRST5 is refused as only for a first order", async () => {
      const q = await promotionQuote(restaurantId, {
        items: [{ menuItemId: set.menu.gyroIds[0], quantity: 1 }],
        couponCode: set.first5.code,
        customerEmail: email,
      });
      expect(q.appliedPromotion, JSON.stringify(q.raw)).toBeNull();
      expect(q.codeOutcome).toBe("NOT_ELIGIBLE");
      expect(q.codeOutcomeMessage ?? "").toMatch(/only for a first order/i);
    });
  });

  test("TC-722: an automatic first-order promotion is not quoted to a guest with no identity", async () => {
    const auto = await createCouponPromotion(token, restaurantId, {
      name: `AUTO $3 off first order ${generateRunId()}`,
      type: "FIXED_AMOUNT",
      value: 3,
      audience: "FIRST_ORDER",
      applyMode: "AUTOMATIC",
    });
    try {
      const cart = [{ menuItemId: set.menu.gyroIds[0], quantity: 1 }];
      const anon = await allure.step("anonymous guest quote", () =>
        promotionQuote(restaurantId, { items: cart })
      );
      expect(anon.appliedPromotion, JSON.stringify(anon.raw)).toBeNull();
      // Control: the same cart with an identity does get it — the
      // promotion is live, the quote just withholds it from nobody.
      const known = await allure.step("identified guest quote", () =>
        promotionQuote(restaurantId, {
          items: cart,
          customerEmail: `auto-first-${generateRunId()}@restaunax-test.com`,
        })
      );
      expect(known.appliedPromotion?.couponId, JSON.stringify(known.raw)).toBe(
        auto.id
      );
      expect(known.appliedPromotion?.savings).toBeCloseTo(3, 2);
    } finally {
      await setPromotionStatus(token, "COUPON", auto.id, "INACTIVE");
    }
  });

  test("TC-723: best wins — an automatic 10% beats a smaller code, and says so", async () => {
    const auto = await createCouponPromotion(token, restaurantId, {
      name: `AUTO 10% off everything ${generateRunId()}`,
      type: "PERCENTAGE",
      value: 10,
      applyMode: "AUTOMATIC",
    });
    const code = generateCouponCode();
    const small = await createCouponPromotion(token, restaurantId, {
      name: `AUTO $1 off ${code}`,
      code,
      type: "FIXED_AMOUNT",
      value: 1,
      applyMode: "CODE",
    });
    try {
      const q = await promotionQuote(restaurantId, {
        items: threeGyros(),
        couponCode: code,
      });
      expect(q.appliedPromotion?.couponId, JSON.stringify(q.raw)).toBe(auto.id);
      expect(q.appliedPromotion?.savings).toBeCloseTo(4.2, 2);
      expect(q.codeOutcome).toBe("BETTER_OFFER_APPLIED");
      const msg = q.codeOutcomeMessage ?? "";
      expect(msg).toContain(code);
      expect(msg).toContain(q.appliedPromotion?.title ?? "<no title>");
      expect(msg).toContain("$1.00");
      expect(msg).toContain("$4.20");
    } finally {
      await setPromotionStatus(token, "COUPON", auto.id, "INACTIVE");
      await setPromotionStatus(token, "COUPON", small.id, "INACTIVE");
    }
  });

  test("TC-724: a combo in the cart keeps its price and blocks the SAVE15 code", async () => {
    const [bowlSlot, gyroSlot, pattySlot] = set.save3.slotIds;
    // Combo $21.99 + a Shrimp Gyro $14.99 = $36.98, over SAVE15's $30 minimum,
    // so the only reason left to refuse the code is the bundle.
    const q = await promotionQuote(restaurantId, {
      items: [{ menuItemId: set.menu.gyroIds[2], quantity: 1 }],
      orderDeals: [
        {
          dealId: set.save3.dealId,
          quantity: 1,
          items: [
            {
              dealItemId: bowlSlot,
              menuItemId: set.menu.riceBowlId,
              quantity: 1,
            },
            {
              dealItemId: gyroSlot,
              menuItemId: set.menu.gyroIds[0],
              quantity: 1,
            },
            {
              dealItemId: pattySlot,
              menuItemId: set.menu.pattyId,
              quantity: 1,
            },
          ],
        },
      ],
      couponCode: set.save15.code,
    });
    expect(q.appliedPromotion, JSON.stringify(q.raw)).toBeNull();
    expect(q.codeIssue?.code).toBe("coupon_deal_exclusive");
    expect(q.codeIssue?.message ?? "").not.toMatch(I18N_KEY);
    expect(
      q.deals.find((d) => d.dealId === set.save3.dealId)?.dealPrice
    ).toBeCloseTo(21.99, 2);
    expect(q.subtotal).toBeCloseTo(21.99 + MENU_PRICES.shrimpGyro, 2);
  });

  test("TC-725: free delivery rides alongside a combo", async () => {
    const code = generateCouponCode();
    const freeDel = await createCouponPromotion(token, restaurantId, {
      name: `AUTO Free delivery ${code}`,
      code,
      type: "FREE_DELIVERY",
      value: 0,
      // A free-delivery code needs a minimum (backend guard); the combo's
      // $21.99 clears $15, and the $8 cap covers the $5.99 fee in full.
      minOrderAmount: 15,
      maxDiscount: 8,
      applyMode: "CODE",
    });
    // createSecondOwner's tenant is in FL, whose delivery-fee tax rule is
    // conditional: the engine refuses any delivery fee there
    // (tax_policy_unsupported, "isn't available for this location's region").
    // Move the throwaway tenant to NY (fee always taxable; tax is 0% here).
    const moved = await apiRequestRaw(
      "PUT",
      `/restaurant/${restaurantId}/basic-info`,
      {
        address: {
          street: "300 Other Street",
          city: "New York",
          state: "NY",
          zipCode: "10001",
        },
      },
      token
    );
    expect(moved.status, JSON.stringify(moved.data)).toBe(200);
    const [bowlSlot, gyroSlot, pattySlot] = set.save3.slotIds;
    // Legacy checkout body: the only /quote shape that carries a delivery fee.
    const res = await apiRequestRaw<
      QuoteResponse & {
        quote?: { deliveryFee?: number; deliveryDiscount?: number };
      }
    >("POST", `/api/order/${restaurantId}/quote`, {
      orderType: "DELIVERY",
      deliveryFee: 5.99,
      couponId: freeDel.id,
      orderItems: [],
      orderDeals: [
        {
          dealId: set.save3.dealId,
          quantity: 1,
          items: [
            { dealItemId: bowlSlot, menuItemId: set.menu.riceBowlId },
            { dealItemId: gyroSlot, menuItemId: set.menu.gyroIds[0] },
            { dealItemId: pattySlot, menuItemId: set.menu.pattyId },
          ],
        },
      ],
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const quote = res.data.quote;
    expect(quote?.deliveryFee).toBeCloseTo(5.99, 2);
    expect(quote?.deliveryDiscount, JSON.stringify(res.data)).toBeCloseTo(
      5.99,
      2
    );
    expect(
      quote?.deals?.find((d) => d.dealId === set.save3.dealId)?.dealPrice
    ).toBeCloseTo(21.99, 2);
  });

  test("TC-726: an automatic 50% sale on Garlic Knots shows on the menu and prices the quote", async () => {
    const sale = await createCouponPromotion(token, restaurantId, {
      name: `AUTO Garlic Knots half off ${generateRunId()}`,
      type: "ITEM_SALE",
      saleKind: "PERCENT_OFF",
      value: 50,
      scopeItemIds: [set.menu.knotsId],
      applyMode: "AUTOMATIC",
    });
    try {
      const knots = await allure.step("public menu item", () =>
        publicMenuItem(restaurantId, set.menu.knotsId)
      );
      expect(knots?.promotion, JSON.stringify(knots)).toBeTruthy();
      expect(knots?.promotion?.salePrice).toBeCloseTo(2, 2);
      expect(knots?.promotion?.label ?? "").not.toBe("");
      expect(knots?.promotion?.label ?? "").not.toMatch(I18N_KEY);
      const salePrice = knots?.promotion?.salePrice ?? Number.NaN;

      const q = await promotionQuote(restaurantId, {
        items: [{ menuItemId: set.menu.knotsId, quantity: 1 }],
      });
      expect(q.appliedPromotion?.couponId, JSON.stringify(q.raw)).toBe(sale.id);
      // The quote charges exactly the price the menu showed.
      expect(q.appliedPromotion?.savings).toBeCloseTo(
        MENU_PRICES.knots - salePrice,
        2
      );
    } finally {
      await setPromotionStatus(token, "COUPON", sale.id, "INACTIVE");
    }
  });

  test("TC-727: a free soda is offered over $40 and discounted once added", async () => {
    const gift = await createCouponPromotion(token, restaurantId, {
      name: `AUTO Free soda over $40 ${generateRunId()}`,
      type: "FREE_ITEM",
      value: 0,
      triggerKind: "SPEND",
      minOrderAmount: 40,
      giftMenuItemId: set.menu.sodaId,
      applyMode: "AUTOMATIC",
    });
    try {
      // 3 gyros + garlic knots = $45.96.
      const cart = [
        ...threeGyros(),
        { menuItemId: set.menu.knotsId, quantity: 1 },
      ];
      const offered = await allure.step("quote at $45.96", () =>
        promotionQuote(restaurantId, { items: cart })
      );
      expect(offered.subtotal).toBeCloseTo(45.96, 2);
      expect(
        offered.freeItemOffer?.menuItemId,
        JSON.stringify(offered.raw)
      ).toBe(set.menu.sodaId);

      const added = await allure.step("quote with the soda added", () =>
        promotionQuote(restaurantId, {
          items: [...cart, { menuItemId: set.menu.sodaId, quantity: 1 }],
        })
      );
      expect(added.appliedPromotion?.couponId, JSON.stringify(added.raw)).toBe(
        gift.id
      );
      expect(added.appliedPromotion?.savings).toBeCloseTo(MENU_PRICES.soda, 2);
      expect(added.amountToCharge).toBeCloseTo(45.96, 2);
    } finally {
      await setPromotionStatus(token, "COUPON", gift.id, "INACTIVE");
    }
  });

  test("TC-728: a CODE-only deal is listed and priced only with its code", async () => {
    const code = generateCouponCode();
    const deal = await createPromotionDeal(token, restaurantId, {
      name: `AUTO Code combo ${code}`,
      dealType: "COMBO",
      dealPrice: 12,
      applyMode: "CODE",
      code,
      items: [
        {
          menuItemId: set.menu.riceBowlId,
          quantity: 1,
          role: "INCLUDED",
          isRequired: true,
          itemName: "Rice Bowl",
          itemPrice: MENU_PRICES.riceBowl,
          sortOrder: 0,
        },
        {
          menuItemId: set.menu.sodaId,
          quantity: 1,
          role: "INCLUDED",
          isRequired: true,
          itemName: "Fountain Soda",
          itemPrice: MENU_PRICES.soda,
          sortOrder: 1,
        },
      ],
    });
    try {
      const listed = (r: Awaited<ReturnType<typeof getActiveDealsPublic>>) =>
        (r.data.deals ?? []).some((d) => d.id === deal.id);
      const hidden = await getActiveDealsPublic(restaurantId, { v2: true });
      expect(hidden.status).toBe(200);
      expect(listed(hidden)).toBe(false);
      const shown = await getActiveDealsPublic(restaurantId, {
        v2: true,
        code,
      });
      expect(shown.status).toBe(200);
      expect(listed(shown)).toBe(true);

      const line = (withCode: boolean) => ({
        dealId: deal.id,
        quantity: 1,
        ...(withCode ? { code } : {}),
        items: [
          {
            dealItemId: slotId(deal, 0),
            menuItemId: set.menu.riceBowlId,
            quantity: 1,
          },
          {
            dealItemId: slotId(deal, 1),
            menuItemId: set.menu.sodaId,
            quantity: 1,
          },
        ],
      });
      const refused = await allure.step("quote without the code", () =>
        quoteRaw({ items: [], deals: [engineDeal(line(false))] })
      );
      const issue = refused.issues?.find((i) => i.code === "deal_not_eligible");
      expect(issue, JSON.stringify(refused)).toBeTruthy();
      expect(issue?.severity).toBe("ERROR");
      expect(issue?.reason).toBe("code_required");

      const priced = await allure.step("quote with the code", () =>
        promotionQuote(restaurantId, { items: [], orderDeals: [line(true)] })
      );
      expect(
        priced.deals.find((d) => d.dealId === deal.id)?.dealPrice,
        JSON.stringify(priced.raw)
      ).toBeCloseTo(12, 2);
      expect(
        priced.issues?.some((i) => i.code === "deal_not_eligible") ?? false
      ).toBe(false);
    } finally {
      await setPromotionStatus(token, "DEAL", deal.id, "INACTIVE");
    }
  });

  test("TC-729: a BOGO_FIXED_PRICE deal is listed only to clients that send the v2 header", async () => {
    const old = await getActiveDealsPublic(restaurantId);
    expect(old.status).toBe(200);
    expect((old.data.deals ?? []).some((d) => d.id === set.save2.dealId)).toBe(
      false
    );
    const v2 = await getActiveDealsPublic(restaurantId, { v2: true });
    expect(v2.status).toBe(200);
    expect((v2.data.deals ?? []).some((d) => d.id === set.save2.dealId)).toBe(
      true
    );
  });

  test("TC-730: /api/coupons/validate checks the day rule on the restaurant's clock", async () => {
    const zone = await getRestaurantTimeZonePublic(restaurantId);
    const today = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: zone || "America/New_York",
    })
      .format(new Date())
      .toUpperCase();
    const days = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ];
    const otherDay = days[(days.indexOf(today) + 3) % 7] as string;

    const offCode = generateCouponCode();
    await createCouponPromotion(token, restaurantId, {
      name: `AUTO ${otherDay} only ${offCode}`,
      code: offCode,
      type: "FIXED_AMOUNT",
      value: 2,
      applyMode: "CODE",
      validDays: [otherDay],
    });
    const onCode = generateCouponCode();
    await createCouponPromotion(token, restaurantId, {
      name: `AUTO ${today} only ${onCode}`,
      code: onCode,
      type: "FIXED_AMOUNT",
      value: 2,
      applyMode: "CODE",
      validDays: [today],
    });

    const off = await validateCouponRaw({
      code: offCode,
      restaurantId,
      orderAmount: 20,
    });
    expect(off.status, JSON.stringify(off.data)).toBe(400);
    expect(off.data.success).toBe(false);
    // The engine's own schedule sentence (PROMOTIONS.md → Old clients).
    expect(off.data.message ?? "").toMatch(/isn't available right now/i);

    const on = await validateCouponRaw({
      code: onCode,
      restaurantId,
      orderAmount: 20,
    });
    expect(on.status, JSON.stringify(on.data)).toBe(200);
    expect(on.data.discountAmount).toBeCloseTo(2, 2);
  });

  test("TC-731: pausing a promotion stops it everywhere; re-activating restores it", async () => {
    const quote = () =>
      promotionQuote(restaurantId, {
        items: threeGyros(),
        couponCode: set.save15.code,
      });
    const dealListed = async () => {
      const r = await getActiveDealsPublic(restaurantId, { v2: true });
      expect(r.status).toBe(200);
      return (r.data.deals ?? []).some((d) => d.id === set.save3.dealId);
    };
    const rowStatus = async (id: string) =>
      (await listPromotions(token, restaurantId)).find((p) => p.id === id)
        ?.status;

    await setPromotionStatus(token, "COUPON", set.save15.id, "INACTIVE");
    await setPromotionStatus(token, "DEAL", set.save3.dealId, "INACTIVE");
    try {
      await allure.step("paused", async () => {
        const r = await redeemCode(restaurantId, set.save15.code);
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.body.success).toBe(false);
        const q = await quote();
        expect(q.appliedPromotion, JSON.stringify(q.raw)).toBeNull();
        expect(await dealListed()).toBe(false);
        expect(await rowStatus(set.save15.id)).toBe("INACTIVE");
        expect(await rowStatus(set.save3.dealId)).toBe("INACTIVE");
      });
    } finally {
      await setPromotionStatus(token, "COUPON", set.save15.id, "ACTIVE");
      await setPromotionStatus(token, "DEAL", set.save3.dealId, "ACTIVE");
    }
    await allure.step("re-activated", async () => {
      const r = await redeemCode(restaurantId, set.save15.code);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const q = await quote();
      expect(q.appliedPromotion?.savings).toBeCloseTo(4.5, 2);
      expect(await dealListed()).toBe(true);
      expect(await rowStatus(set.save15.id)).toBe("ACTIVE");
      expect(await rowStatus(set.save3.dealId)).toBe("ACTIVE");
    });
  });

  test("TC-732: line quantities must be whole numbers from 1 to 999", async () => {
    for (const quantity of [1000, 0.5]) {
      const r = await quoteRaw({
        items: [{ menuItemId: set.menu.gyroIds[0], quantity }],
      });
      expect(r.status, `quantity ${quantity}: ${JSON.stringify(r)}`).toBe(400);
      expect(r.message ?? "").toMatch(/whole number from 1 to 999/i);
    }
  });

  test("TC-733: a legacy FIXED_ITEM coupon still discounts exactly once", async () => {
    const code = generateCouponCode();
    const legacy = await createCouponPromotion(token, restaurantId, {
      name: `AUTO $2 off a patty ${code}`,
      code,
      type: "FIXED_ITEM",
      value: 2,
      menuItemId: set.menu.pattyId,
      applyMode: "CODE",
    });
    // Three patties ($14.97): "$2 off once", never $2 per patty.
    const items = [{ menuItemId: set.menu.pattyId, quantity: 3 }];
    const v = await validateCouponRaw({
      code,
      restaurantId,
      orderAmount: 14.97,
      items,
    });
    expect(v.status, JSON.stringify(v.data)).toBe(200);
    expect(v.data.discountAmount).toBeCloseTo(2, 2);

    const q = await promotionQuote(restaurantId, { items, couponCode: code });
    expect(q.appliedPromotion?.couponId, JSON.stringify(q.raw)).toBe(legacy.id);
    expect(q.appliedPromotion?.savings).toBeCloseTo(2, 2);
    expect(q.amountToCharge).toBeCloseTo(12.97, 2);
  });

  // ── local raw helpers (refusals are the assertion) ─────────────────────────

  /** promotionQuote's deal line → the engine body's `deals[]` entry. */
  function engineDeal(d: {
    dealId: string;
    quantity: number;
    code?: string;
    items: { dealItemId: string; menuItemId: string }[];
  }) {
    return {
      dealId: d.dealId,
      quantity: d.quantity,
      ...(d.code ? { code: d.code } : {}),
      selections: d.items.map(({ dealItemId, menuItemId }) => ({
        dealItemId,
        menuItemId,
      })),
    };
  }

  /** Raw engine-shape /quote: status + message + issues, never throws. */
  async function quoteRaw(body: {
    items: { menuItemId: string; quantity: number }[];
    deals?: ReturnType<typeof engineDeal>[];
  }): Promise<{
    status: number;
    message?: string;
    issues?: {
      code?: string;
      severity: string;
      reason?: string | null;
    }[];
  }> {
    const res = await apiRequestRaw<{
      message?: string;
      issues?: { code?: string; severity: string; reason?: string | null }[];
    }>("POST", `/api/order/${restaurantId}/quote`, {
      orderType: "PICKUP",
      deals: [],
      ...body,
    });
    return {
      status: res.status,
      message: res.data?.message,
      issues: res.data?.issues,
    };
  }
});
