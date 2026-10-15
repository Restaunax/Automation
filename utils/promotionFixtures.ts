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
  createDealRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  type ApiDeal,
  type DealBody,
} from "./apiHelper";
import { createCouponPromotion } from "./promotionsApi";
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

/** Throwing deal create that returns the stored deal (with its slot ids). */
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
