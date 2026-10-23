/**
 * 12-combo-food-surfaces.spec.ts — "a combo item is just food" (API level).
 *
 * restaunax PR #1017 (2026-10-21, docs/features/ORDER_FOOD_LINES.md): an
 * order's food lives in `orderItems` AND `orderDeals[].orderDealItems`, and
 * every count / make / report surface reads both through `foodLinesOf`. Every
 * past bug read `orderItems` alone, so the case that matters is a COMBO-ONLY
 * order (`orderItems: []`).
 *
 * Own tenant: a per-run throwaway restaurant (createSecondOwner, alwaysFresh)
 * so its top sellers hold only this run's orders and its prep stations touch
 * no one else's routing. Tax 0, so every total is a clean sum.
 *
 * Seed: Burger $10 (free "Double" with a free NESTED "Smoky" sauce under it),
 * Fries $4, Soda $3, and a COMBO deal of all three for $12. Two stations:
 * "Grill" (default — burger, fries) and "Bar" (soda, assigned per item).
 * Two PAID online pickup orders (public placeOrder → /api/stripe/payment-intent
 * → Stripe test card with the publishable key → /api/stripe/confirm-payment —
 * the storefront's own calls; the POS refuses an order with no à-la-carte
 * line, so a combo-only sale cannot be rung there), same customer phone, each burger inside the combo carrying Double → Smoky and a
 * note:
 *   (a) combo-only:          2 × combo                → 6 food units
 *   (b) combo + à la carte:  1 × combo + 2 × fries    → 5 food units
 *
 * TC-908 foodItemCount on the owner list/detail, getOrderById and the
 *        customer's mobile history.
 * TC-909 breakdown deal children: key, note, modifierId + nested parentModifierId.
 * TC-910 KDS make line: components at THEIR station (grill vs bar).
 * TC-911 Uber courier manifest — fixme (manifest is not persisted; no sandbox
 *        dispatch path in the suite). See the test for the exact reason.
 * TC-913 (runs LAST: it adds an order) a REGISTER cash sale that is ONLY the
 *        combo (`orderItems: []`, restaunax #1018) is accepted and stored;
 *        no items and no deals still 400s.
 * TC-912 top sellers count combo units; item revenue stays à-la-carte and
 *        net sales equal the orders' own subtotals (deal money counted once).
 *
 * Run alone: `npx playwright test --project=pos --grep @combo-food`.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId, generateSeedPhone } from "../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  ensureTaxRate,
  deleteTestRestaurant,
  createMenuGroupNamed,
  createMenuItemFull,
  getMenuItemApi,
  createDealApi,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  setOwnerPosPin,
  tabletStaffSignIn,
  openRegisterSessionPos,
  closeRegisterSessionPosRaw,
  createTabletOrderRaw,
  type ApiDeal,
  type ApiMenuItem,
  type TabletDevice,
} from "../../utils/apiHelper";
import { slotId } from "../../utils/promotionFixtures";
import { placePaidOnlineOrder } from "../../utils/comboFoodSurfaces";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const BURGER = 10;
const FRIES = 4;
const SODA = 3;
const COMBO = 12;
const COMBO_QTY_A = 2;
const FRIES_QTY_B = 2;
/** QA has ENABLE_SMS off: any phone verifies with this OTP. */
const QA_OTP = "123456";
const round2 = (n: number) => Math.round(n * 100) / 100;

interface StoredModifier {
  modifierId?: string | null;
  modifierName: string;
  parentModifierId?: string | null;
}
interface StoredOrder {
  id: string;
  subtotal: number;
  total: number;
  foodItemCount?: number;
  orderItems?: { id: string; menuItemId: string; quantity: number }[];
  orderDeals?: {
    id: string;
    dealId: string;
    quantity: number;
    orderDealItems?: {
      id: string;
      menuItemId: string;
      menuItemName: string;
      quantity: number;
      prepStationKey?: string | null;
      specialInstructions?: string | null;
      selectedModifiers?: StoredModifier[];
    }[];
  }[];
  breakdown?: {
    items?: {
      kind?: string;
      label?: string;
      children?: {
        key: string;
        name: string;
        quantity: number;
        specialInstructions: string | null;
        modifiers: {
          name: string;
          modifierId?: string | null;
          parentModifierId?: string | null;
        }[];
      }[];
    }[];
  } | null;
}
interface OutstandingLine {
  orderId: string;
  lineKey: string;
  name: string;
  quantityRemaining: number;
  modifiers: string[];
  specialInstructions: string | null;
}
interface TopSeller {
  name: string;
  totalQuantity: number;
  totalRevenue: number;
  comboQuantity: number;
}

test.describe("Combo food on every surface (@combo-food)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  const note = `no onions ${runId}`;
  const phone = generateSeedPhone();
  let adminToken = "";
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let burger: ApiMenuItem;
  let fries: ApiMenuItem;
  let soda: ApiMenuItem;
  let double = { id: "", name: "" };
  let smoky = { id: "", name: "" };
  let deal: ApiDeal;
  let grillKey = "";
  let barKey = "";
  let kds: TabletDevice | undefined;
  let kdsToken = "";
  let pk = "";
  let comboOnlyId = "";
  let mixedId = "";

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  /** The combo line exactly as the POS sends it: burger customised + noted. */
  const comboLine = (quantity: number) => ({
    dealId: deal.id,
    dealName: deal.name,
    dealPrice: COMBO,
    quantity,
    items: [
      {
        dealItemId: slotId(deal, 0),
        menuItemId: burger.id,
        menuItemName: burger.name,
        menuItemPrice: BURGER,
        quantity: 1,
        specialInstructions: note,
        selectedModifiers: [
          {
            modifierId: double.id,
            modifierName: double.name,
            modifierPrice: 0,
            quantity: 1,
          },
          {
            modifierId: smoky.id,
            modifierName: smoky.name,
            modifierPrice: 0,
            quantity: 1,
            parentModifierId: double.id,
          },
        ],
      },
      {
        dealItemId: slotId(deal, 1),
        menuItemId: fries.id,
        menuItemName: fries.name,
        menuItemPrice: FRIES,
        quantity: 1,
      },
      {
        dealItemId: slotId(deal, 2),
        menuItemId: soda.id,
        menuItemName: soda.name,
        menuItemPrice: SODA,
        quantity: 1,
      },
    ],
  });

  /** A PAID online pickup order, exactly as the storefront places it. */
  const paidOnlineOrder = async (
    combos: number,
    alaCarteFries: number
  ): Promise<string> => {
    const subtotal = round2(COMBO * combos + FRIES * alaCarteFries);
    const order = await placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal,
      tax: 0,
      tip: 0,
      deliveryFee: 0,
      total: subtotal,
      customerEmail: `combo-food-${runId}@restaunax-test.com`,
      customerPhone: phone,
      firstName: "Combo",
      lastName: "Tester",
      orderItems: alaCarteFries
        ? [
            {
              menuItemId: fries.id,
              menuItemName: fries.name,
              quantity: alaCarteFries,
              price: FRIES,
            },
          ]
        : [],
      orderDeals: [comboLine(combos)],
      dealDiscountAmount: round2((BURGER + FRIES + SODA - COMBO) * combos),
    });
    expect(order.total, "server-priced total").toBe(subtotal);
    return order.id;
  };

  const ownerDetail = async (orderId: string): Promise<StoredOrder> => {
    const res = await apiRequestRaw<StoredOrder>(
      "GET",
      `/api/order/statistics/${orderId}`,
      undefined,
      token
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data;
  };

  const station = async (key: string): Promise<OutstandingLine[]> => {
    const set = await apiRequestRaw(
      "PATCH",
      `/api/tablet/restaurant/${restaurantId}/device/${kds!.id}/config`,
      { prepStationKey: key },
      adminToken
    );
    expect(set.status, JSON.stringify(set.data)).toBe(200);
    const res = await apiRequestRaw<{ lines: OutstandingLine[] }>(
      "GET",
      `/api/tablet/prep-stations/${encodeURIComponent(key)}/lines`,
      undefined,
      kdsToken
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.lines;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    // Always fresh: this file adds prep stations and reads the tenant's top
    // sellers, which must hold only this run's two orders.
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[combo-food] could not mint the throwaway tenant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    await updateRestaurantSettingsApi(token, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(token, restaurantId, 0);
    // An unpublished (preview) restaurant refuses every public order.
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    // Online orders are gated by posted hours: open around the clock.
    await ensureBusinessHours(token, restaurantId);
    // A Stripe TEST Connect account, so the orders are paid with a test card.
    const onboard = await stripeTestOnboardingRaw(token, restaurantId);
    expect(onboard.status, JSON.stringify(onboard.data)).toBe(200);
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    expect(pk, "QA must publish a Stripe TEST key").toMatch(/^pk_test_/);

    // Stations first, so the order-create stamper routes against them.
    const mkStation = async (name: string, isDefault: boolean) => {
      const res = await apiRequestRaw<{
        station?: { key: string };
        key?: string;
      }>(
        "POST",
        `/restaurant/${restaurantId}/prep-stations`,
        { name, isDefault },
        token
      );
      expect(res.status, JSON.stringify(res.data)).toBeLessThan(300);
      const key = res.data.station?.key ?? res.data.key;
      if (!key)
        throw new Error(`station key missing: ${JSON.stringify(res.data)}`);
      return key;
    };
    grillKey = await mkStation(`Grill ${runId}`, true);
    barKey = await mkStation(`Bar ${runId}`, false);

    const groupId = (
      await createMenuGroupNamed(token, `AUTO Combo Food ${runId}`, {
        restaurantId,
      })
    ).id;
    const doubleName = `Double ${runId}`;
    const smokyName = `Smoky ${runId}`;
    burger = await createMenuItemFull(
      token,
      groupId,
      `Burger ${runId}`,
      BURGER,
      {
        description: "combo food: free Double with a nested free sauce",
        modifierGroups: [
          {
            name: `Build ${runId}`,
            pricingMode: "INCLUDED",
            minSelections: 0,
            maxSelections: null,
            modifiers: [
              {
                name: doubleName,
                childModifierGroups: [
                  {
                    name: `Sauce ${runId}`,
                    pricingMode: "INCLUDED",
                    minSelections: 0,
                    maxSelections: null,
                    modifiers: [{ name: smokyName }],
                  },
                ],
              },
            ],
          },
        ],
      }
    );
    const mods = (await getMenuItemApi(token, burger.id)).modifierGroups ?? [];
    const d = mods
      .flatMap((g) => g.modifiers)
      .find((m) => m.name === doubleName);
    const s = (d?.childModifierGroups ?? [])
      .flatMap((g) => g.modifiers)
      .find((m) => m.name === smokyName);
    if (!d || !s)
      throw new Error(
        `burger modifiers not read back: ${JSON.stringify(mods)}`
      );
    double = { id: d.id, name: d.name };
    smoky = { id: s.id, name: s.name };
    fries = await createMenuItemFull(token, groupId, `Fries ${runId}`, FRIES, {
      description: "combo food: side",
    });
    soda = await createMenuItemFull(token, groupId, `Soda ${runId}`, SODA, {
      description: "combo food: drink (Bar)",
    });
    const assign = await apiRequestRaw(
      "PATCH",
      `/restaurant/${restaurantId}/prep-stations/assign/item/${soda.id}`,
      { prepStationKey: barKey },
      token
    );
    expect(assign.status, JSON.stringify(assign.data)).toBeLessThan(300);

    deal = await createDealApi(
      token,
      restaurantId,
      `AUTO Combo Food ${runId}`,
      COMBO,
      [
        { id: burger.id, name: burger.name, price: BURGER },
        { id: fries.id, name: fries.name, price: FRIES },
        { id: soda.id, name: soda.name, price: SODA },
      ]
    );

    // The make-line screen: a device whose station is set per read below.
    kds = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Combo Make Line ${runId}`
    );
    kdsToken = await tabletLogin(kds.name, kds.code);

    comboOnlyId = await paidOnlineOrder(COMBO_QTY_A, 0);
    mixedId = await paidOnlineOrder(1, FRIES_QTY_B);
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshOwnerToken().catch(() => token);
    if (kds) await deactivateTabletDevice(t, restaurantId, kds.id);
    // Admin DELETE archives the throwaway restaurant with its menu, deal,
    // stations and the two paid test-card orders.
    if (restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Orders → Combo food lines");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test(
    "TC-908: foodItemCount counts combo components — a combo-only order (2 × a 3-part combo) is 6, combo + 2 fries is 5 — on the owner list, owner detail, getOrderById and the customer's mobile history",
    { tag: ["@combo-food"] },
    async () => {
      const expected: Record<string, number> = {
        [comboOnlyId]: 3 * COMBO_QTY_A,
        [mixedId]: 3 + FRIES_QTY_B,
      };

      await allure.step("Owner orders list (Orders tab grid)", async () => {
        // The list hides INITIALIZED orders, and a paid online order only
        // leaves INITIALIZED when Stripe's payment_intent.succeeded webhook
        // lands (confirm-payment deliberately leaves the transition to it).
        // So the order can be missing on a first read: poll, bounded, until
        // both orders are listed.
        let orders: StoredOrder[] = [];
        await expect
          .poll(
            async () => {
              const res = await apiRequestRaw<{ orders: StoredOrder[] }>(
                "GET",
                `/api/order/statistics/management/${restaurantId}?page=1&limit=50`,
                undefined,
                token
              );
              expect(res.status, JSON.stringify(res.data)).toBe(200);
              orders = res.data.orders;
              return Object.keys(expected).filter(
                (id) => !orders.some((o) => o.id === id)
              );
            },
            {
              message: "both paid orders appear in the owner list",
              timeout: 30_000,
            }
          )
          .toEqual([]);
        for (const [id, count] of Object.entries(expected)) {
          const row = orders.find((o) => o.id === id);
          expect(row, `order ${id} in the owner list`).toBeTruthy();
          expect(row!.foodItemCount, `owner list foodItemCount for ${id}`).toBe(
            count
          );
        }
      });

      await allure.step("Owner detail + getOrderById", async () => {
        for (const [id, count] of Object.entries(expected)) {
          expect(
            (await ownerDetail(id)).foodItemCount,
            `owner detail ${id}`
          ).toBe(count);
          const byId = await apiRequestRaw<StoredOrder>(
            "GET",
            `/api/order/${id}`,
            undefined,
            token
          );
          expect(byId.status, JSON.stringify(byId.data)).toBe(200);
          expect(byId.data.foodItemCount, `GET /api/order/${id}`).toBe(count);
        }
        // The combo-only order really has no à-la-carte lines.
        expect((await ownerDetail(comboOnlyId)).orderItems ?? []).toHaveLength(
          0
        );
      });

      await allure.step("Customer mobile history (OTP sign-in)", async () => {
        const send = await apiRequestRaw("POST", "/login/mobile/send-otp", {
          phone,
          restaurantId,
        });
        expect(send.status, JSON.stringify(send.data)).toBe(200);
        const verify = await apiRequestRaw<{ token?: string }>(
          "POST",
          "/login/mobile/verify-otp",
          { phone, otp: QA_OTP, restaurantId }
        );
        expect(verify.status, JSON.stringify(verify.data)).toBe(200);
        const history = await apiRequestRaw<{ orders: StoredOrder[] }>(
          "GET",
          "/api/mobile/customer/orders",
          undefined,
          verify.data.token
        );
        expect(history.status, JSON.stringify(history.data)).toBe(200);
        for (const [id, count] of Object.entries(expected)) {
          const row = history.data.orders.find((o) => o.id === id);
          expect(row, `order ${id} in the customer's history`).toBeTruthy();
          expect(row!.foodItemCount, `history foodItemCount for ${id}`).toBe(
            count
          );
        }
      });
    }
  );

  test(
    "TC-909: the breakdown's deal children carry key deal:<orderDealId>:<orderDealItemId>, the burger's note, and modifiers with modifierId — the nested sauce's parentModifierId is its parent's modifierId",
    { tag: ["@combo-food"] },
    async () => {
      for (const id of [comboOnlyId, mixedId]) {
        const order = await ownerDetail(id);
        const stored = order.orderDeals?.[0];
        expect(stored, JSON.stringify(order.orderDeals)).toBeTruthy();
        const dealRow = (order.breakdown?.items ?? []).find(
          (i) => (i.children ?? []).length > 0
        );
        expect(dealRow, JSON.stringify(order.breakdown)).toBeTruthy();
        const children = dealRow!.children!;
        expect(children).toHaveLength(3);
        const where = `order ${id} children: ${JSON.stringify(children)}`;
        for (const c of children) {
          expect(c.key, where).toMatch(/^deal:[^:]+:[^:]+$/);
          const part = stored!.orderDealItems!.find(
            (p) => p.menuItemName === c.name
          );
          expect(part, where).toBeTruthy();
          expect(c.key, where).toBe(`deal:${stored!.id}:${part!.id}`);
          // Per-deal quantity; the deal row multiplies it.
          expect(c.quantity, where).toBe(1);
        }
        const b = children.find((c) => c.name === burger.name)!;
        expect(b.specialInstructions, where).toBe(note);
        const parent = b.modifiers.find((m) => m.name === double.name);
        const nested = b.modifiers.find((m) => m.name === smoky.name);
        expect(parent?.modifierId, where).toBe(double.id);
        expect(nested?.modifierId, where).toBe(smoky.id);
        expect(nested?.parentModifierId, where).toBe(parent!.modifierId);
        for (const c of children.filter((c) => c.name !== burger.name)) {
          expect(c.specialInstructions, where).toBeNull();
          expect(c.modifiers, where).toEqual([]);
        }
      }
    }
  );

  test(
    "TC-910: the KDS make line lists a combo's components at their own station — burger and fries on the grill (combo + à-la-carte fries one line), the soda on the bar — with the burger's picks and note",
    { tag: ["@combo-food"] },
    async () => {
      const grill = await allure.step("Grill station lines", () =>
        station(grillKey)
      );
      const at = (lines: OutstandingLine[], orderId: string, name: string) =>
        lines.filter((l) => l.orderId === orderId && l.name === name);
      const where = (lines: OutstandingLine[]) => JSON.stringify(lines);

      // (a) combo-only: 2 burgers, 2 fries, never a soda.
      const aBurger = at(grill, comboOnlyId, burger.name);
      expect(aBurger, where(grill)).toHaveLength(1);
      expect(aBurger[0]!.quantityRemaining).toBe(COMBO_QTY_A);
      expect(aBurger[0]!.specialInstructions).toBe(note);
      const picks = aBurger[0]!.modifiers.join(" | ");
      expect(picks).toContain(double.name);
      expect(picks).toContain(smoky.name);
      expect(at(grill, comboOnlyId, fries.name)[0]?.quantityRemaining).toBe(
        COMBO_QTY_A
      );
      expect(at(grill, comboOnlyId, soda.name), where(grill)).toHaveLength(0);
      // (b) the combo's fries and the à-la-carte fries are one line to make.
      expect(at(grill, mixedId, burger.name)[0]?.quantityRemaining).toBe(1);
      const bFries = at(grill, mixedId, fries.name);
      expect(bFries, where(grill)).toHaveLength(1);
      expect(bFries[0]!.quantityRemaining).toBe(1 + FRIES_QTY_B);

      const bar = await allure.step("Bar station lines", () => station(barKey));
      expect(at(bar, comboOnlyId, soda.name)[0]?.quantityRemaining).toBe(
        COMBO_QTY_A
      );
      expect(at(bar, mixedId, soda.name)[0]?.quantityRemaining).toBe(1);
      for (const id of [comboOnlyId, mixedId])
        expect(
          bar.filter((l) => l.orderId === id && l.name !== soda.name),
          where(bar)
        ).toEqual([]);
    }
  );

  test.fixme(
    "TC-911: the Uber Direct courier manifest of a DELIVERY combo order lists the combo's components",
    { tag: ["@combo-food"] },
    async () => {
      // Not observable from QA, so not faked:
      //  1. The manifest is never persisted. UberOrganizationsService.createDelivery
      //     builds manifest_items from foodLinesOf(order) and sends them only in
      //     the Uber create-delivery request; the Delivery row (schema.prisma
      //     `model Delivery`) has no manifest / item-count column, and
      //     pickup_notes is not stored either. The only record is Uber's own.
      //  2. The suite has no dispatch path: dispatch runs only after a PAID
      //     DELIVERY order (orderPostPaymentService.handleAutoDispatch) or a
      //     staff dispatch call, which needs a restaurant with Uber Direct
      //     credentials + a deliverable address on QA. No Automation fixture
      //     restaurant has that (pos/02-free-delivery-coupon defers the live
      //     Uber quote; TC-851 keeps its DELIVERY tickets unpaid on purpose so
      //     no courier is booked).
      // Covered instead by the backend unit tests of foodLinesOf and the
      // manifest builder (PR #1017). Revisit if a GET of the Uber delivery
      // (manifest from Uber's API) is ever exposed, or a sandbox restaurant is
      // provisioned on QA.
    }
  );

  test(
    "TC-912: owner top sellers count units sold inside combos (burger 3, all 3 in combos) while item revenue stays à-la-carte and net sales equal the orders' own subtotals — the deal's money is counted once",
    { tag: ["@combo-food"] },
    async () => {
      const res = await apiRequestRaw<{
        totalRevenue: number;
        totalOrders: number;
        topSellingItems: TopSeller[];
      }>(
        "GET",
        `/api/order/statistics/restaurantId/${restaurantId}`,
        undefined,
        token
      );
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      const top = res.data.topSellingItems;
      const row = (name: string) => top.find((r) => r.name === name);
      const where = JSON.stringify(top);
      const combos = COMBO_QTY_A + 1;
      // The combo-only order's burgers are counted (2) plus order (b)'s (1).
      expect(row(burger.name), where).toMatchObject({
        totalQuantity: combos,
        comboQuantity: combos,
        totalRevenue: 0,
      });
      expect(row(soda.name), where).toMatchObject({
        totalQuantity: combos,
        comboQuantity: combos,
        totalRevenue: 0,
      });
      expect(row(fries.name), where).toMatchObject({
        totalQuantity: combos + FRIES_QTY_B,
        comboQuantity: combos,
        totalRevenue: round2(FRIES * FRIES_QTY_B),
      });

      // Net sales: exactly what the two orders were sold for — never the
      // components' à-la-carte prices re-added on top of the deal.
      const a = await ownerDetail(comboOnlyId);
      const b = await ownerDetail(mixedId);
      expect(a.subtotal).toBe(round2(COMBO * COMBO_QTY_A));
      expect(b.subtotal).toBe(round2(COMBO + FRIES * FRIES_QTY_B));
      expect(res.data.totalOrders).toBe(2);
      expect(res.data.totalRevenue).toBe(round2(a.subtotal + b.subtotal));
    }
  );
  test(
    "TC-913: a register cash sale of ONLY the combo (orderItems: [], one orderDeal) is accepted and stored with the deal, its items and the burger's picks, foodItemCount 3 — and no items AND no deals still 400s",
    { tag: ["@combo-food"] },
    async () => {
      // restaunax #1018: create-order used to refuse orderItems: [] outright.
      // A REGISTER device (ADMIN-created) + the owner's POS PIN + an open
      // drawer, as in pos/11-promotions — cash needs a register session.
      const register = await createTabletDevice(
        adminToken,
        restaurantId,
        `Automation Combo Register ${runId}`
      );
      const tablet = await tabletLogin(register.name, register.code);
      const pin = "7351";
      const staffMemberId = await setOwnerPosPin(token, restaurantId, pin);
      const session = await tabletStaffSignIn(tablet, staffMemberId, pin);
      await openRegisterSessionPos(tablet, session);
      try {
        // Shaped like the real POS request (device-in-store create-order).
        const body = (orderDeals: unknown[]) => ({
          restaurantId,
          orderSource: "IN_STORE",
          orderType: "PICKUP",
          paymentMethod: "CASH",
          subtotal: COMBO,
          tax: 0,
          tip: 0,
          processingFee: 0,
          total: COMBO,
          customerPhone: "",
          orderItems: [],
          orderDeals,
        });
        const comboOnly = {
          dealId: deal.id,
          dealName: deal.name,
          dealPrice: COMBO,
          quantity: 1,
          items: [
            {
              dealItemId: slotId(deal, 0),
              menuItemId: burger.id,
              menuItemName: burger.name,
              menuItemPrice: BURGER,
              quantity: 1,
              selectedModifiers: [
                {
                  modifierId: double.id,
                  modifierName: double.name,
                  modifierPrice: 0,
                  quantity: 1,
                },
              ],
            },
            {
              dealItemId: slotId(deal, 1),
              menuItemId: fries.id,
              menuItemName: fries.name,
              menuItemPrice: FRIES,
              quantity: 1,
              selectedModifiers: [],
            },
            {
              dealItemId: slotId(deal, 2),
              menuItemId: soda.id,
              menuItemName: soda.name,
              menuItemPrice: SODA,
              quantity: 1,
              selectedModifiers: [],
            },
          ],
        };

        const created = await createTabletOrderRaw(
          tablet,
          session,
          body([comboOnly])
        );
        expect(created.status, JSON.stringify(created.data)).toBe(201);
        expect(created.data.total).toBe(COMBO);
        const order = await ownerDetail(created.data.id!);
        expect(order.orderItems ?? []).toHaveLength(0);
        expect(order.orderDeals, JSON.stringify(order.orderDeals)).toHaveLength(
          1
        );
        const stored = order.orderDeals![0]!;
        expect(stored).toMatchObject({ dealId: deal.id, quantity: 1 });
        expect(
          (stored.orderDealItems ?? []).map((i) => i.menuItemId).sort()
        ).toEqual([burger.id, fries.id, soda.id].sort());
        const b = stored.orderDealItems!.find(
          (i) => i.menuItemId === burger.id
        );
        expect(
          (b?.selectedModifiers ?? []).map((m) => m.modifierName),
          JSON.stringify(b)
        ).toEqual([double.name]);
        expect(order.foodItemCount).toBe(3);

        const empty = await createTabletOrderRaw(tablet, session, body([]));
        expect(empty.status, JSON.stringify(empty.data)).toBe(400);
        expect(
          (empty.data as { message?: string }).message,
          JSON.stringify(empty.data)
        ).toBe("Order must have at least one item");
      } finally {
        await closeRegisterSessionPosRaw(tablet, session, {
          countedCash: 1_000_000,
        }).catch(() => {});
        await deactivateTabletDevice(token, restaurantId, register.id);
      }
    }
  );
});
