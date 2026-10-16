/**
 * promotionFixtures.ts — the Promotions acceptance set (restaunax
 * docs/features/PROMOTIONS.md → "Testing"), seeded through the API on a
 * throwaway tenant. Port of the Maestro seed
 * (restaunax/.superpowers/sdd/promotions-maestro/seed-promotions.mjs): the
 * same menu, prices and four promotions, with AUTO-prefixed names and codes so
 * globalTeardown's sweep backstops the tenant delete.
 *
 *   SAVE15 — 15% off $30+, capped at $4.50 (money off the order, CODE)
 *   SAVE2  — buy a gyro, get the 2nd for $1.99, "one of these items"
 *            (BOGO_FIXED_PRICE, BOTH)
 *   FIRST5 — $5 off a first order (money off the order + FIRST_ORDER, CODE)
 *   SAVE3  — any rice bowl + any gyro + a beef patty for $21.99 (COMBO,
 *            AUTOMATIC)
 */

import {
  apiRequestRaw,
  createDealApiCapSafe,
  createDealRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  type ApiDeal,
  type CreateMenuItemOpts,
  type DealBody,
} from "./apiHelper";
import {
  createCouponPromotion,
  type CouponPromotionBody,
} from "./promotionsApi";
import { generateCouponCode, generateRunId } from "./testData";

export interface AcceptanceSet {
  menu: {
    /** Chicken 12.99, Lamb 13.99, Shrimp 14.99. */
    gyroIds: [string, string, string];
    riceBowlId: string;
    pattyId: string;
    sodaId: string;
    knotsId: string;
    /** Category ids (combo slots are category-scoped). */
    gyroGroupId: string;
    bowlGroupId: string;
    promoGroupId: string;
  };
  save15: { id: string; code: string };
  /** `buyItemId` / `getItemId` = the deal's BUY / GET slot (DealItem.id). */
  save2: { dealId: string; code: string; buyItemId: string; getItemId: string };
  first5: { id: string; code: string };
  /** Slot ids in order: bowl, gyro, patty. */
  save3: { dealId: string; slotIds: [string, string, string] };
}

export const MENU_PRICES = {
  chickenGyro: 12.99,
  lambGyro: 13.99,
  shrimpGyro: 14.99,
  riceBowl: 11.99,
  patty: 4.99,
  soda: 2.49,
  knots: 3.99,
} as const;

const DAY_MS = 86_400_000;

/**
 * Throwing deal create that returns the stored deal (with its slot ids).
 * THROWAWAY TENANTS ONLY: it is not cap-safe (one refusal throws), so on the
 * shared seed restaurant use createDealApiCapSafe / withStorefrontBogo.
 */
export async function createPromotionDeal(
  token: string,
  restaurantId: string,
  body: DealBody
): Promise<ApiDeal> {
  const now = Date.now();
  const res = await createDealRaw(token, restaurantId, {
    status: "ACTIVE",
    startDate: new Date(now - DAY_MS).toISOString(),
    endDate: new Date(now + 30 * DAY_MS).toISOString(),
    description: "Automation promotion — safe to delete",
    ...body,
  });
  if (!res.ok || !res.data?.deal?.id) {
    throw new Error(
      `createPromotionDeal → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
  return res.data.deal;
}

/** The DealItem.id of the slot with this sortOrder (create echoes items). */
export function slotId(deal: ApiDeal, sortOrder: number): string {
  const slot = (deal.items ?? []).find((i) => i.sortOrder === sortOrder);
  if (!slot) {
    throw new Error(
      `deal ${deal.id} has no slot ${sortOrder}: ${JSON.stringify(deal.items)}`
    );
  }
  return slot.id;
}

/**
 * Menu (3 categories, 7 items) + the four acceptance promotions on the
 * tenant. Owner token. Every promotion starts ACTIVE, dated yesterday → +30d.
 */
export async function seedAcceptanceSet(
  token: string,
  restaurantId: string
): Promise<AcceptanceSet> {
  const run = generateRunId();
  const group = async (label: string) =>
    (
      await createMenuGroupNamed(token, `AUTO ${label} ${run}`, {
        restaurantId,
      })
    ).id;
  const promoGroupId = await group("Promos");
  const gyroGroupId = await group("Gyros");
  const bowlGroupId = await group("Bowls");
  const item = async (name: string, price: number, groupId: string) =>
    (
      await createMenuItemFull(token, groupId, name, price, {
        description: "Automation promotions item",
      })
    ).id;

  const chicken = await item(
    "Chicken Gyro",
    MENU_PRICES.chickenGyro,
    gyroGroupId
  );
  const lamb = await item("Lamb Gyro", MENU_PRICES.lambGyro, gyroGroupId);
  const shrimp = await item("Shrimp Gyro", MENU_PRICES.shrimpGyro, gyroGroupId);
  const riceBowlId = await item("Rice Bowl", MENU_PRICES.riceBowl, bowlGroupId);
  const pattyId = await item(
    "Jamaican Beef Patty",
    MENU_PRICES.patty,
    promoGroupId
  );
  const knotsId = await item("Garlic Knots", MENU_PRICES.knots, promoGroupId);
  const sodaId = await item("Fountain Soda", MENU_PRICES.soda, promoGroupId);
  const gyroIds: [string, string, string] = [chicken, lamb, shrimp];

  const save15Code = generateCouponCode();
  const save15 = await createCouponPromotion(token, restaurantId, {
    name: `AUTO 15% off $30+ ${run}`,
    code: save15Code,
    type: "PERCENTAGE",
    value: 15,
    minOrderAmount: 30,
    maxDiscount: 4.5,
    applyMode: "CODE",
  });

  const first5Code = generateCouponCode();
  const first5 = await createCouponPromotion(token, restaurantId, {
    name: `AUTO $5 off first order ${run}`,
    code: first5Code,
    type: "FIXED_AMOUNT",
    value: 5,
    audience: "FIRST_ORDER",
    applyMode: "CODE",
    perUserLimit: 1,
  });

  const save2Code = generateCouponCode();
  const save2 = await createPromotionDeal(token, restaurantId, {
    name: `AUTO Gyro 2nd for $1.99 ${run}`,
    dealType: "BOGO_FIXED_PRICE",
    getPrice: 1.99,
    applyMode: "BOTH",
    code: save2Code,
    items: [
      {
        optionMenuItemIds: gyroIds,
        quantity: 1,
        role: "BUY",
        isRequired: true,
        itemName: "",
        itemPrice: 0,
        sortOrder: 0,
      },
      {
        optionMenuItemIds: gyroIds,
        quantity: 1,
        role: "GET",
        isRequired: true,
        itemName: "",
        itemPrice: 0,
        sortOrder: 1,
      },
    ],
  });

  const save3 = await createPromotionDeal(token, restaurantId, {
    name: `AUTO Bowl + gyro + patty $21.99 ${run}`,
    dealType: "COMBO",
    dealPrice: 21.99,
    applyMode: "AUTOMATIC",
    items: [
      {
        menuGroupId: bowlGroupId,
        quantity: 1,
        role: "INCLUDED",
        isRequired: true,
        itemName: "Any rice bowl",
        itemPrice: 0,
        sortOrder: 0,
      },
      {
        menuGroupId: gyroGroupId,
        quantity: 1,
        role: "INCLUDED",
        isRequired: true,
        itemName: "Any gyro",
        itemPrice: 0,
        sortOrder: 1,
      },
      {
        menuItemId: pattyId,
        quantity: 1,
        role: "INCLUDED",
        isRequired: true,
        itemName: "Jamaican Beef Patty",
        itemPrice: MENU_PRICES.patty,
        sortOrder: 2,
      },
    ],
  });

  return {
    menu: {
      gyroIds,
      riceBowlId,
      pattyId,
      sodaId,
      knotsId,
      gyroGroupId,
      bowlGroupId,
      promoGroupId,
    },
    save15: { id: save15.id, code: save15Code },
    save2: {
      dealId: save2.id,
      code: save2Code,
      buyItemId: slotId(save2, 0),
      getItemId: slotId(save2, 1),
    },
    first5: { id: first5.id, code: first5Code },
    save3: {
      dealId: save3.id,
      slotIds: [slotId(save3, 0), slotId(save3, 1), slotId(save3, 2)],
    },
  };
}

/** A public menu item as the storefronts read it, with its sale field. */
export interface PublicMenuItem {
  id: string;
  price?: number;
  promotion?: { salePrice: number; label: string } | null;
}

/**
 * The item from the public ONLINE menu (GET /menu/restaurants/:id/menus
 * ?channel=online — the payload that carries `promotion` for a live
 * automatic sale). Null when the item is not on the menu.
 */
export async function publicMenuItem(
  restaurantId: string,
  menuItemId: string
): Promise<PublicMenuItem | null> {
  const res = await apiRequestRaw<unknown>(
    "GET",
    `/menu/restaurants/${restaurantId}/menus?channel=online`
  );
  if (!res.ok) {
    throw new Error(
      `publicMenuItem → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
  const find = (o: unknown): PublicMenuItem | null => {
    if (Array.isArray(o)) {
      for (const x of o) {
        const hit = find(x);
        if (hit) return hit;
      }
    } else if (o && typeof o === "object") {
      if ((o as { id?: unknown }).id === menuItemId) return o as PublicMenuItem;
      for (const v of Object.values(o)) {
        const hit = find(v);
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(res.data);
}

// ── Storefront set (template-wind / template-lima on the SEED restaurant) ────

/** A seeded menu item: id, name, regular price. */
export interface SeededItem {
  id: string;
  name: string;
  price: number;
}

/**
 * What the storefront promotion specs seed on the shared seed restaurant
 * (the storefronts are pinned to it). Own per-run category, so the automatic
 * sale and free item can only ever touch this run's items:
 *
 *   saleItem  $10  — 50% ITEM_SALE (AUTOMATIC), shown on the menu
 *   platter   $20  — the plain item for code orders and the spend threshold
 *   gyroA/B   $12/$13 — the BOGO's "one of these items" options
 *   burger    $12  — Size (REPLACES: Regular 12 default / Large 15) +
 *                    Extras (ADJUSTS: Bacon +1.50): the upcharge pick
 *   gift      $4   — the FREE_ITEM gift (spend ≥ FREE_ITEM_MIN, AUTOMATIC)
 *
 *   orderCode  — 15% off $30+, capped at $4.50 (CODE)
 *
 * The two deals are NOT part of the set: each test that needs one creates it
 * for its own duration (withStorefrontBogo / withStorefrontCombo), so the
 * seed restaurant's 10 ACTIVE slots are never held for a whole file:
 *
 *   bogo       — buy a gyro, get the 2nd for $1.99, options A/B (BOTH + code)
 *   combo      — platter + burger for $25 (CODE only: hidden without its code)
 */
export interface StorefrontPromotionSet {
  groupId: string;
  items: {
    saleItem: SeededItem;
    platter: SeededItem;
    gyroA: SeededItem;
    gyroB: SeededItem;
    burger: SeededItem;
    gift: SeededItem;
  };
  sale: { id: string; name: string };
  /** Null when seeded with `withFreeItem: false`. */
  freeItem: { id: string; name: string } | null;
  orderCode: { id: string; name: string; code: string };
  /** Name prefix ("Wind" / "Lima") and run id, for the per-test deals. */
  label: string;
  runId: string;
}

/**
 * The storefront BOGO — buy a gyro, get the 2nd for $1.99, options A/B
 * (BOTH + code). `buyItemId` / `getItemId` = its BUY / GET slot ids.
 */
export interface StorefrontBogo {
  dealId: string;
  name: string;
  code: string;
  buyItemId: string;
  getItemId: string;
}

/** The storefront combo — platter + burger for $25 (CODE only). */
export interface StorefrontCombo {
  dealId: string;
  name: string;
  code: string;
  platterSlotId: string;
  burgerSlotId: string;
}

export const STOREFRONT_PRICES = {
  saleItem: 10,
  platter: 20,
  gyroA: 12,
  gyroB: 13,
  burger: 12,
  burgerLarge: 15,
  bacon: 1.5,
  gift: 4,
  comboPrice: 25,
  bogoGetPrice: 1.99,
} as const;

/** Spend that earns the free item (subtotal without the gift line). */
export const FREE_ITEM_MIN = 55;

/** Which storefront the set is for (names) and whether to add the free item. */
export interface StorefrontSeedOptions {
  /** Prefix of the category and item names: "Wind" (default) / "Lima". */
  label?: string;
  /**
   * Seed the automatic FREE_ITEM spend offer (default true). Only ONE file
   * may run it: a spend trigger offers its gift to EVERY cart over the
   * threshold, so two files' offers would compete for each other's carts.
   */
  withFreeItem?: boolean;
}

/**
 * Seeds the storefront set (menu + coupons, no deals) on the seed restaurant.
 * Throws on any refusal; on a throw, whatever was created is returned via
 * `partial` so the caller's cleanup still removes it.
 */
export async function seedStorefrontPromotions(
  token: string,
  restaurantId: string,
  runId: string,
  partial: Partial<StorefrontPromotionSet> & {
    createdItems?: SeededItem[];
    createdCoupons?: string[];
    /** Filled by the per-test deal helpers (StorefrontDealContext). */
    createdDeals?: string[];
  } = {},
  { label = "Wind", withFreeItem = true }: StorefrontSeedOptions = {}
): Promise<StorefrontPromotionSet> {
  partial.createdItems ??= [];
  partial.createdCoupons ??= [];
  partial.createdDeals ??= [];
  const groupId = (
    await createMenuGroupNamed(
      token,
      `Automation Menu Promo ${label} ${runId}`,
      {
        restaurantId,
      }
    )
  ).id;
  partial.groupId = groupId;
  const item = async (
    what: string,
    price: number,
    opts: CreateMenuItemOpts = {}
  ): Promise<SeededItem> => {
    const name = `${label} ${what} ${runId}`;
    const created = await createMenuItemFull(token, groupId, name, price, {
      description: "Automation storefront promotions item",
      ...opts,
    });
    const seeded = { id: created.id, name, price };
    partial.createdItems!.push(seeded);
    return seeded;
  };
  const P = STOREFRONT_PRICES;
  const saleItem = await item("Wrap", P.saleItem);
  const platter = await item("Platter", P.platter);
  const gyroA = await item("Gyro A", P.gyroA);
  const gyroB = await item("Gyro B", P.gyroB);
  const burger = await item("Burger", P.burger, {
    modifierGroups: [
      {
        name: "Size",
        pricingMode: "REPLACES_PRICE",
        minSelections: 1,
        maxSelections: 1,
        modifiers: [
          { name: `Regular ${runId}`, price: P.burger, isDefault: true },
          { name: `Large ${runId}`, price: P.burgerLarge },
        ],
      },
      {
        name: "Extras",
        pricingMode: "ADJUSTS_PRICE",
        minSelections: 0,
        maxSelections: null,
        modifiers: [{ name: `Bacon ${runId}`, price: P.bacon }],
      },
    ],
  });
  const gift = await item("Cookie", P.gift);
  const items = { saleItem, platter, gyroA, gyroB, burger, gift };

  const coupon = async (body: CouponPromotionBody) => {
    const created = await createCouponPromotion(token, restaurantId, body);
    partial.createdCoupons!.push(created.id);
    return created;
  };
  const saleName = `AUTO ${label} half-price wrap ${runId}`;
  const sale = await coupon({
    name: saleName,
    type: "ITEM_SALE",
    saleKind: "PERCENT_OFF",
    value: 50,
    scopeItemIds: [saleItem.id],
    applyMode: "AUTOMATIC",
  });
  const freeName = `AUTO ${label} free cookie over $${FREE_ITEM_MIN} ${runId}`;
  const freeItem = withFreeItem
    ? await coupon({
        name: freeName,
        type: "FREE_ITEM",
        value: 0,
        triggerKind: "SPEND",
        minOrderAmount: FREE_ITEM_MIN,
        giftMenuItemId: gift.id,
        applyMode: "AUTOMATIC",
      })
    : null;
  const orderCodeName = `AUTO ${label} 15% off $30+ ${runId}`;
  const orderCodeValue = generateCouponCode();
  const orderCode = await coupon({
    name: orderCodeName,
    code: orderCodeValue,
    type: "PERCENTAGE",
    value: 15,
    minOrderAmount: 30,
    maxDiscount: 4.5,
    applyMode: "CODE",
  });

  return {
    groupId,
    items,
    sale: { id: sale.id, name: saleName },
    freeItem: freeItem ? { id: freeItem.id, name: freeName } : null,
    orderCode: { id: orderCode.id, name: orderCodeName, code: orderCodeValue },
    label,
    runId,
  };
}

/** Where a storefront deal is created, and the list its id is tracked in. */
export interface StorefrontDealContext {
  token: string;
  restaurantId: string;
  set: StorefrontPromotionSet;
  /**
   * Every created deal id is pushed here, so the file's afterAll cleanup
   * (cleanupStorefrontPromotions) backstops a delete that never ran.
   */
  createdDeals: string[];
}

function dealDates() {
  const now = Date.now();
  return {
    status: "ACTIVE",
    startDate: new Date(now - DAY_MS).toISOString(),
    endDate: new Date(now + 30 * DAY_MS).toISOString(),
  };
}

/**
 * Creates one storefront deal (cap-safe: it waits for one of the seed
 * restaurant's 10 ACTIVE slots), runs `fn`, and deletes the deal in a
 * `finally` so the slot is given back the moment the test is done — never
 * held for the whole file (TEST_PLAN.md → "Seed-restaurant deal budget").
 * A refused delete fails the test unless the test already failed (then it
 * is logged and the original error wins; afterAll retries the delete).
 */
async function withStorefrontDeal<D extends { dealId: string }, T>(
  ctx: StorefrontDealContext,
  create: () => Promise<D>,
  fn: (deal: D) => Promise<T>
): Promise<T> {
  const deal = await create();
  ctx.createdDeals.push(deal.dealId);
  // Resolves to why the delete was refused, or null when it went through.
  const release = async (): Promise<string | null> => {
    const res = await apiRequestRaw(
      "DELETE",
      `/api/deals/${deal.dealId}`,
      undefined,
      ctx.token
    ).catch((err: unknown) => ({ ok: false, status: 0, data: String(err) }));
    return res.ok || res.status === 404
      ? null
      : `storefront deal ${deal.dealId} delete → ${res.status} ${JSON.stringify(res.data)}`;
  };
  let result: T;
  try {
    result = await fn(deal);
  } catch (err) {
    // The test's own failure is the one to report; afterAll retries this.
    const why = await release();
    if (why) console.warn(`[promotionFixtures] ${why}`);
    throw err;
  }
  const why = await release();
  if (why) throw new Error(why);
  return result;
}

/**
 * The BOGO ("buy a gyro, get the 2nd for $1.99", options gyro A/B, menu +
 * code) for the duration of `fn` — see withStorefrontDeal.
 */
export function withStorefrontBogo<T>(
  ctx: StorefrontDealContext,
  fn: (bogo: StorefrontBogo) => Promise<T>
): Promise<T> {
  return withStorefrontDeal(
    ctx,
    async () => {
      const { set } = ctx;
      const { gyroA, gyroB } = set.items;
      const name = `AUTO ${set.label} gyro 2nd $1.99 ${set.runId}`;
      const code = generateCouponCode();
      const optionLine = (role: "BUY" | "GET", sortOrder: number) => ({
        optionMenuItemIds: [gyroA.id, gyroB.id],
        quantity: 1,
        role,
        isRequired: true,
        itemName: "",
        itemPrice: 0,
        sortOrder,
      });
      const deal = await createDealApiCapSafe(
        ctx.token,
        ctx.restaurantId,
        name,
        0,
        [],
        {
          ...dealDates(),
          dealType: "BOGO_FIXED_PRICE",
          getPrice: STOREFRONT_PRICES.bogoGetPrice,
          applyMode: "BOTH",
          code,
          items: [optionLine("BUY", 0), optionLine("GET", 1)],
        }
      );
      return {
        dealId: deal.id,
        name,
        code,
        buyItemId: slotId(deal, 0),
        getItemId: slotId(deal, 1),
      };
    },
    fn
  );
}

/**
 * The CODE-only combo (platter + burger for $25, hidden without its code)
 * for the duration of `fn` — see withStorefrontDeal.
 */
export function withStorefrontCombo<T>(
  ctx: StorefrontDealContext,
  fn: (combo: StorefrontCombo) => Promise<T>
): Promise<T> {
  return withStorefrontDeal(
    ctx,
    async () => {
      const { set } = ctx;
      const { platter, burger } = set.items;
      const name = `AUTO ${set.label} platter + burger ${set.runId}`;
      const code = generateCouponCode();
      const deal = await createDealApiCapSafe(
        ctx.token,
        ctx.restaurantId,
        name,
        STOREFRONT_PRICES.comboPrice,
        [
          { id: platter.id, name: platter.name, price: platter.price },
          { id: burger.id, name: burger.name, price: burger.price },
        ],
        { ...dealDates(), applyMode: "CODE", code }
      );
      return {
        dealId: deal.id,
        name,
        code,
        platterSlotId: slotId(deal, 0),
        burgerSlotId: slotId(deal, 1),
      };
    },
    fn
  );
}

/**
 * Removes what seedStorefrontPromotions created: deals and coupons first (an
 * item a deal uses can't be deleted), then the items, then the category.
 * Every delete runs on its own and is response-checked; returns the failures
 * (empty = clean) so the caller can fail loudly instead of leaking a deal slot.
 */
export async function cleanupStorefrontPromotions(
  token: string,
  created: {
    groupId?: string;
    createdItems?: SeededItem[];
    createdCoupons?: string[];
    createdDeals?: string[];
  }
): Promise<string[]> {
  const failures: string[] = [];
  const del = async (what: string, path: string) => {
    try {
      const res = await apiRequestRaw("DELETE", path, undefined, token);
      if (!res.ok && res.status !== 404) {
        failures.push(`${what} → ${res.status} ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      failures.push(`${what} → ${String(err)}`);
    }
  };
  for (const id of created.createdDeals ?? [])
    await del(`deal ${id}`, `/api/deals/${id}`);
  for (const id of created.createdCoupons ?? [])
    await del(`coupon ${id}`, `/api/coupons/${id}`);
  for (const it of created.createdItems ?? [])
    await del(`item ${it.name}`, `/menu/menuItemId/${it.id}`);
  if (created.groupId)
    await del(`category ${created.groupId}`, `/menu/group/${created.groupId}`);
  return failures;
}
