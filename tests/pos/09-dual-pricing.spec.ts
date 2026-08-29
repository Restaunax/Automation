/**
 * 09-dual-pricing.spec.ts — Dual pricing v2 (per-item cash tier), API level.
 * Feature: dual pricing (restaunax #683, device-in-store #44). The stored price of every item/modifier is the CARD price; a
 * company-admin card markup derives a cash price per unit (integer-cent
 * half-up, Bella Cucina's printed menu: 13.40 ↔ 12.95, 3.11 ↔ 3.00 at 3.5%),
 * and a ticket paid ENTIRELY in cash is charged the cash prices, taxed on
 * that base. The server re-derives the discount from the order's own line
 * fields and refuses a mismatch.
 *
 * Own tenant, deliberately: the menu CONVERSION (TC-486) is a one-way stamp
 * on the restaurant, so this file can never run on the shared seed
 * restaurant. Setup chain mirrors 08-register-cash: admin-minted OWNER →
 * settings (tableServiceEnabled, acceptingOrders, tax 7%) → menu item seeded
 * at CASH prices (12.95 + a 3.00 add-on) → REGISTER device → tablet login →
 * owner PIN → staff sign-in → register open (cash orders are drawer-gated).
 *
 * Backend: restaunax #683 (merged 2026-08-29, on QA). First green run against
 * QA: 2026-08-29 (all of TC-484..493 live).
 *
 * Expected figures (7% tax, qty 2, item + add-on):
 *   card: 2 × (13.40 + 3.11) = 33.02 · tax 2.31 · total 35.33
 *   cash: 2 × (12.95 + 3.00) = 31.90 · tax 2.23 · total 34.13 · discount 1.12
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  createMenuGroupNamed,
  createMenuItemFull,
  getMenuItemApi,
  getRestaurantMenusApi,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  updateRestaurantSettingsRaw,
  getRestaurantSettingsRaw,
  setOwnerPosPin,
  tabletStaffSignIn,
  createTabletOrderRaw,
  modifyTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  settleTabCashRaw,
  openRegisterSessionPosRaw,
  closeRegisterSessionPosRaw,
  getTabletSettingsRaw,
  convertDualPricingMenuRaw,
  getRestaurantDetailsPublicRaw,
  type TabletDevice,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MARKUP = 0.035;
const ITEM_CASH = 12.95;
const ITEM_CARD = 13.4;
const MOD_CASH = 3.0;
const MOD_CARD = 3.11;
const QTY = 2;
const CARD_SUBTOTAL = 33.02;
const CARD_TAX = 2.31;
const CARD_TOTAL = 35.33;
const CASH_TAX = 2.23;
const CASH_TOTAL = 34.13;
const CASH_DISCOUNT = 1.12;
const round2 = (n: number) => Math.round(n * 100) / 100;

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("POS — Dual pricing v2 (per-item cash tier)", () => {
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
  let groupId = "";
  let item: ApiMenuItem;
  let modifierId = "";
  let modifierName = "";
  let device: TabletDevice | undefined;
  let tabletToken = "";
  let staffSession = "";
  const managerPin = "8462";
  const openedOrderIds: string[] = [];
  let registerOpen = false;

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  /** A register cash order body at the CASH tier (whole ticket in cash). */
  const cashTierBody = (over: Record<string, unknown> = {}) => ({
    restaurantId,
    orderType: "PICKUP",
    paymentMethod: "CASH",
    subtotal: CARD_SUBTOTAL,
    cashDiscount: CASH_DISCOUNT,
    tax: CASH_TAX,
    tip: 0,
    processingFee: 0,
    total: CASH_TOTAL,
    customerPhone: "",
    orderItems: [
      {
        menuItemId: item.id,
        menuItemName: item.name,
        quantity: QTY,
        price: ITEM_CARD,
        selectedModifiers: [
          { modifierId, modifierName, modifierPrice: MOD_CARD, quantity: 1 },
        ],
      },
    ],
    ...over,
  });

  const openCheck = async (tableName: string) => {
    const res = await createTabletOrderRaw(tabletToken, staffSession, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: CARD_SUBTOTAL,
      tax: CARD_TAX,
      tip: 0,
      total: CARD_TOTAL,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: QTY,
          price: ITEM_CARD,
          selectedModifiers: [
            { modifierId, modifierName, modifierPrice: MOD_CARD, quantity: 1 },
          ],
        },
      ],
      openCheck: true,
      tableName,
      guestCount: 2,
    });
    expect(res.status, msg(res.data)).toBe(201);
    openedOrderIds.push(res.data.id!);
    return res.data.id!;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error("[dual-pricing] could not mint the throwaway tenant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
      tax: 7,
    });

    // Seeded at CASH prices on purpose — TC-486 converts them to card prices.
    groupId = (
      await createMenuGroupNamed(token, `Automation Dual Pricing ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Chicken Parm Sub ${runId}`,
      ITEM_CASH,
      {
        modifierGroups: [
          {
            name: "Sides",
            minSelections: 0,
            maxSelections: 1,
            pricingMode: "ADJUSTS_PRICE",
            modifiers: [
              {
                name: `Add Fries ${runId}`,
                price: MOD_CASH,
                selected: false,
                allowsDuplicates: false,
                outOfStock: false,
                isDefault: false,
              },
            ],
          },
        ] as never,
      }
    );
    const detail = (await getMenuItemApi(token, item.id)) as unknown as {
      modifierGroups?: { modifiers: { id: string; name: string }[] }[];
    };
    const mod = detail.modifierGroups?.[0]?.modifiers?.[0];
    if (!mod) throw new Error("[dual-pricing] seeded modifier not found");
    modifierId = mod.id;
    modifierName = mod.name;

    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Dual Pricing POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);
    const managerStaffMemberId = await setOwnerPosPin(
      token,
      restaurantId,
      managerPin
    );
    staffSession = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );
    const opened = await openRegisterSessionPosRaw(tabletToken, staffSession, {
      openingFloat: 100,
    });
    registerOpen = opened.ok;
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const orderId of openedOrderIds) {
      try {
        const read = await getOrderFullRaw(await freshOwnerToken(), orderId);
        const status = String(read.data?.status ?? "");
        const paymentStatus = String(read.data?.paymentStatus ?? "");
        if (
          !read.ok ||
          paymentStatus === "COMPLETED" ||
          status === "CANCELLED" ||
          status === "REFUNDED"
        )
          continue;
        const cancel = await cancelTabletOrderRaw(
          tabletToken,
          staffSession,
          orderId,
          "Automation cleanup"
        );
        if (!cancel.ok && registerOpen) {
          await settleTabCashRaw(tabletToken, staffSession, orderId, {
            amount: round2(Number(read.data?.total ?? 0)),
            cashTendered: 10_000,
            idempotencyKey: `cleanup-${orderId}`,
          });
        }
      } catch (err) {
        console.warn(`[dual-pricing] cleanup failed for ${orderId}:`, err);
      }
    }
    if (registerOpen) {
      await closeRegisterSessionPosRaw(tabletToken, staffSession, {
        countedCash: 10_000,
      }).catch(() => undefined);
    }
    if (device) {
      await deactivateTabletDevice(adminToken, restaurantId, device.id).catch(
        () => undefined
      );
    }
    await deleteTestRestaurant(adminToken, restaurantId).catch(() => undefined);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Dual Pricing");
    await allure.label("severity", "critical");
  });

  test("TC-485: enabling dual pricing is refused until a card markup is set; an owner cannot set the markup", async () => {
    await allure.description(
      "Owner PUT {dualPricingEligible:true} is stripped (admin-only) → enabling is " +
        "refused not_eligible; admin enrolls without a markup → enabling is refused " +
        "markup_not_set; an owner-sent markup is stripped."
    );
    const asOwner = await updateRestaurantSettingsRaw(token, restaurantId, {
      dualPricingEligible: true,
      dualPricingEnabled: true,
    });
    expect(asOwner.status, msg(asOwner.data)).toBe(400);
    expect(msg(asOwner.data)).toMatch(/not enrolled/i);

    const enrolOnly = await updateRestaurantSettingsRaw(
      adminToken,
      restaurantId,
      {
        dualPricingEligible: true,
      }
    );
    expect(enrolOnly.status, msg(enrolOnly.data)).toBe(200);
    const noMarkup = await updateRestaurantSettingsRaw(token, restaurantId, {
      dualPricingEnabled: true,
    });
    expect(noMarkup.status, msg(noMarkup.data)).toBe(400);
    expect(msg(noMarkup.data)).toMatch(/markup/i);

    const ownerMarkup = await updateRestaurantSettingsRaw(token, restaurantId, {
      dualPricingCardMarkup: 0.04,
    });
    expect(ownerMarkup.status, msg(ownerMarkup.data)).toBe(200);
    const read = await getRestaurantSettingsRaw(token, restaurantId);
    expect(read.data.dualPricingCardMarkup ?? null).toBeNull();
  });

  test("TC-484: admin sets the card markup (bounded by the 5% ceiling) and the owner can enable", async () => {
    const tooHigh = await updateRestaurantSettingsRaw(
      adminToken,
      restaurantId,
      {
        dualPricingCardMarkup: 0.06,
      }
    );
    expect(tooHigh.status, msg(tooHigh.data)).toBe(400);

    const set = await updateRestaurantSettingsRaw(adminToken, restaurantId, {
      dualPricingCardMarkup: MARKUP,
    });
    expect(set.status, msg(set.data)).toBe(200);

    const enabled = await updateRestaurantSettingsRaw(token, restaurantId, {
      dualPricingEnabled: true,
    });
    expect(enabled.status, msg(enabled.data)).toBe(200);
    const read = await getRestaurantSettingsRaw(token, restaurantId);
    expect(read.data.dualPricingEnabled).toBe(true);
    expect(read.data.dualPricingCardMarkup).toBe(MARKUP);

    // Mutual exclusion: both programs in one payload is refused outright.
    const both = await updateRestaurantSettingsRaw(adminToken, restaurantId, {
      dualPricingEnabled: true,
      passProcessingFeeToCustomer: true,
    });
    expect(both.status, msg(both.data)).toBe(400);
  });

  test("TC-486: one-time menu conversion raises the stored (cash) prices to card prices; the menu then carries cashPrice pairs; a second run is 409", async () => {
    const preview = await convertDualPricingMenuRaw(token, restaurantId, {
      preview: true,
    });
    expect(preview.status, msg(preview.data)).toBe(200);
    const rows = (preview.data.rows ?? []) as {
      kind: string;
      id: string;
      from: number;
      to: number;
    }[];
    expect(
      rows.find((r) => r.kind === "ITEM" && r.id === item.id)
    ).toMatchObject({
      from: ITEM_CASH,
      to: ITEM_CARD,
    });
    expect(
      rows.find((r) => r.kind === "MODIFIER" && r.id === modifierId)
    ).toMatchObject({
      from: MOD_CASH,
      to: MOD_CARD,
    });

    const run = await convertDualPricingMenuRaw(token, restaurantId, {
      preview: false,
    });
    expect(run.status, msg(run.data)).toBe(200);
    expect(run.data.convertedAt).toBeTruthy();

    const { menus } = await getRestaurantMenusApi(restaurantId, {
      accessToken: token,
    });
    type PricedModifier = { id: string; price: number; cashPrice?: number };
    type PricedItem = {
      id: string;
      price: number;
      cashPrice?: number;
      modifierGroups?: { modifiers: PricedModifier[] }[];
    };
    const items = (
      menus as unknown as { groups?: { items?: PricedItem[] }[] }[]
    )
      .flatMap((m) => m.groups ?? [])
      .flatMap((g) => g.items ?? []);
    const converted = items.find((i) => i.id === item.id);
    expect(converted?.price).toBe(ITEM_CARD);
    expect(converted?.cashPrice).toBe(ITEM_CASH);
    const mod = converted?.modifierGroups?.[0]?.modifiers?.find(
      (m) => m.id === modifierId
    );
    expect(mod?.price).toBe(MOD_CARD);
    expect(mod?.cashPrice).toBe(MOD_CASH);

    const again = await convertDualPricingMenuRaw(token, restaurantId, {
      preview: false,
    });
    expect(again.status, msg(again.data)).toBe(409);
  });

  test("TC-487: the tablet settings payload carries the dual-pricing contract (active, markup, percent, four notices)", async () => {
    const res = await getTabletSettingsRaw(tabletToken);
    expect(res.status, msg(res.data)).toBe(200);
    const dualPricing = res.data.dualPricing as {
      active: boolean;
      cardMarkup: number;
      discountPercent: number;
      notices: Record<string, string>;
    };
    expect(dualPricing).toMatchObject({
      active: true,
      cardMarkup: MARKUP,
      discountPercent: 3.4,
    });
    for (const key of ["menu", "entrance", "check", "receipt"]) {
      expect(typeof dualPricing.notices[key]).toBe("string");
      expect(dualPricing.notices[key]).toMatch(/3\.4%/);
    }
  });

  test("TC-488: a register order paid entirely in cash is priced at the cash tier (pre-tax discount, tax on the cash base)", async () => {
    const res = await createTabletOrderRaw(
      tabletToken,
      staffSession,
      cashTierBody()
    );
    expect(res.status, msg(res.data)).toBe(201);
    openedOrderIds.push(res.data.id!);
    const read = await getOrderFullRaw(token, res.data.id!);
    expect(read.data).toMatchObject({
      subtotal: CARD_SUBTOTAL,
      cashDiscount: CASH_DISCOUNT,
      tax: CASH_TAX,
      total: CASH_TOTAL,
      paymentMethod: "CASH",
    });
  });

  test("TC-489: a claimed discount that does not match the line math is refused; a card tender never gets one", async () => {
    const over = await createTabletOrderRaw(
      tabletToken,
      staffSession,
      cashTierBody({ cashDiscount: 1.5, total: round2(CASH_TOTAL - 0.38) })
    );
    expect(over.status, msg(over.data)).toBe(400);
    expect(msg(over.data)).toMatch(/does not match/i);

    const card = await createTabletOrderRaw(
      tabletToken,
      staffSession,
      cashTierBody({ paymentMethod: "CARD", requiresPaymentFirst: true })
    );
    expect(card.status, msg(card.data)).toBe(400);
    expect(msg(card.data)).toMatch(/paid in cash/i);
  });

  test("TC-490: split tender pays the card price — a cash discount on a split body is refused", async () => {
    const res = await createTabletOrderRaw(
      tabletToken,
      staffSession,
      cashTierBody({
        paymentMethod: undefined,
        payments: [
          { paymentMethod: "CASH", amount: 17, status: "SUCCEEDED" },
          { paymentMethod: "CASH", amount: 17.13, status: "SUCCEEDED" },
        ],
      })
    );
    expect(res.status, msg(res.data)).toBe(400);
    expect(msg(res.data)).toMatch(/split payments/i);
  });

  test("TC-491: an untouched check settled whole in cash is re-priced at the cash tier and collects exactly the cash total; a partly paid check is refused", async () => {
    const whole = await openCheck(`Cash ${runId}`);
    const leg = await settleTabCashRaw(tabletToken, staffSession, whole, {
      amount: CARD_TOTAL, // the device declares the card remaining
      cashTendered: 40,
      idempotencyKey: `whole-${runId}`,
      applyCashDiscount: true,
    });
    expect(leg.status, msg(leg.data)).toBe(200);
    expect(leg.data.cashTier).toEqual({
      cashDiscount: CASH_DISCOUNT,
      total: CASH_TOTAL,
    });
    expect(leg.data.cashChange).toBe(round2(40 - CASH_TOTAL));
    expect(leg.data.closed).toBe(true);
    const read = await getOrderFullRaw(token, whole);
    expect(read.data).toMatchObject({
      cashDiscount: CASH_DISCOUNT,
      tax: CASH_TAX,
      total: CASH_TOTAL,
    });

    const split = await openCheck(`Split ${runId}`);
    const first = await settleTabCashRaw(tabletToken, staffSession, split, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: `split-1-${runId}`,
    });
    expect(first.status, msg(first.data)).toBe(200);
    const rest = await settleTabCashRaw(tabletToken, staffSession, split, {
      amount: round2(CARD_TOTAL - 10),
      cashTendered: 30,
      idempotencyKey: `split-2-${runId}`,
      applyCashDiscount: true,
    });
    expect(rest.status, msg(rest.data)).toBe(400);
    expect(msg(rest.data)).toMatch(/whole check/i);
  });

  test("TC-492: editing a cash-priced order re-derives the discount at the restaurant's markup", async () => {
    await allure.description(
      "A register order paid whole in cash is created at the cash tier (qty 2). " +
        "PATCH /modify with qty 3 — the device sends only the new line set, never a " +
        "discount claim — and the server re-derives the pre-tax discount from the " +
        "authoritative menu at the restaurant's markup: 3 × (0.45 + 0.11) = 1.68, tax " +
        "on the new cash base 47.85 → 3.35, total 51.20."
    );
    const created = await createTabletOrderRaw(
      tabletToken,
      staffSession,
      cashTierBody()
    );
    expect(created.status, msg(created.data)).toBe(201);
    const orderId = created.data.id!;
    openedOrderIds.push(orderId);

    const modified = await modifyTabletOrderRaw(
      tabletToken,
      staffSession,
      orderId,
      {
        orderItems: [
          {
            menuItemId: item.id,
            menuItemName: item.name,
            quantity: QTY + 1,
            price: ITEM_CARD,
            selectedModifiers: [
              {
                modifierId,
                modifierName,
                modifierPrice: MOD_CARD,
                quantity: 1,
              },
            ],
          },
        ],
      }
    );
    expect(modified.status, msg(modified.data)).toBe(200);

    const read = await getOrderFullRaw(token, orderId);
    expect(read.data).toMatchObject({
      subtotal: round2((ITEM_CARD + MOD_CARD) * (QTY + 1)), // 49.53 — card
      cashDiscount: round2(
        (ITEM_CARD + MOD_CARD - ITEM_CASH - MOD_CASH) * (QTY + 1)
      ), // 1.68
      tax: 3.35, // 7% of the cash base 47.85
      total: 51.2,
    });
  });

  test("TC-497: compliance attestations are admin-stamped booleans; owners cannot assert them; raw timestamps are ignored", async () => {
    await allure.description(
      "Admin PUT {dualPricingMenuAttested:true} stamps dualPricingMenuAttestedAt; an owner " +
        "PUT {dualPricingSignageAttested:true} is stripped (stays null); a raw timestamp key " +
        "is ignored even from the admin; admin PUT {dualPricingMenuAttested:false} clears it."
    );
    const stamped = await updateRestaurantSettingsRaw(
      adminToken,
      restaurantId,
      {
        dualPricingMenuAttested: true,
      }
    );
    expect(stamped.status, msg(stamped.data)).toBe(200);
    let read = await getRestaurantSettingsRaw(token, restaurantId);
    expect(typeof read.data.dualPricingMenuAttestedAt).toBe("string");
    expect(read.data.dualPricingSignageAttestedAt ?? null).toBeNull();

    const ownerClaim = await updateRestaurantSettingsRaw(token, restaurantId, {
      dualPricingSignageAttested: true,
    });
    expect(ownerClaim.status, msg(ownerClaim.data)).toBe(200);
    read = await getRestaurantSettingsRaw(token, restaurantId);
    expect(read.data.dualPricingSignageAttestedAt ?? null).toBeNull();

    const rawStamp = await updateRestaurantSettingsRaw(
      adminToken,
      restaurantId,
      {
        dualPricingSignageAttestedAt: "2026-01-01T00:00:00.000Z",
      }
    );
    expect(rawStamp.status, msg(rawStamp.data)).toBe(200);
    read = await getRestaurantSettingsRaw(token, restaurantId);
    expect(read.data.dualPricingSignageAttestedAt ?? null).toBeNull();

    const cleared = await updateRestaurantSettingsRaw(
      adminToken,
      restaurantId,
      {
        dualPricingMenuAttested: false,
      }
    );
    expect(cleared.status, msg(cleared.data)).toBe(200);
    read = await getRestaurantSettingsRaw(token, restaurantId);
    expect(read.data.dualPricingMenuAttestedAt ?? null).toBeNull();
  });

  test("TC-493: the public restaurant details payload never exposes the pricing-program flags", async () => {
    const res = await getRestaurantDetailsPublicRaw(restaurantId);
    expect(res.status, msg(res.data)).toBe(200);
    const text = JSON.stringify(res.data);
    expect(text).not.toMatch(/dualPricing/);
    expect(text).not.toMatch(/passProcessingFeeToCustomer/);
  });
});
