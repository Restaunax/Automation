/**
 * api-deals.spec.ts — Deals API contract (Layer 1).
 *
 * No browser. Hits /api/deals/*, /api/chains/:gid/deals* and the public
 * /api/order/:id/quote with an owner JWT (or anonymously) and pins the rules
 * the Manage Deals tab, the deal form and the storefront depend on: server-
 * computed money fields, the qty-1 slot invariant, the availability window,
 * status/cap rules, delete semantics, what the customer is charged (deal price
 * × qty + modifier upcharge, never the client's numbers), stats, chain scope
 * and the authorization pins. See docs/DEALS_TAB_TEST_STRATEGY.md §3.6 / §4.
 *
 * Own tenant: the WHOLE file runs on a per-run throwaway restaurant owned by
 * an admin-minted OWNER (`createSecondOwner`) — the seed restaurant carries five
 * real ACTIVE deals and only ten may be active, so seeding here would collide
 * with the UI/storefront files running in other workers. A per-run
 * "Automation Deals <id>" category with a few items, AUTO-prefixed deals, all
 * deleted in afterAll (items hard-deleted via the admin permanent-delete, the
 * restaurant archived). The seed OWNER is the "intruder" for the authz pins.
 * Chain cases use the persistent "Automation Chain" fixture (seed OWNER's).
 *
 * The §1 findings (IDOR, cap bypass, PUT validation, coupon ⊥ deal, aiGenerated)
 * were fixed in RestauNax #618/#619 and are LIVE on QA — the tests that pinned
 * them as test.fail() now assert the FIXED behaviour (TC-334, 335b, 336, 341,
 * 343, 347..350). See docs/DEALS_TAB_TEST_STRATEGY.md §1.
 *
 * Guided deal types (restaunax DEAL_TYPES.md, TC-691..677): every write now
 * runs the type rules — a COMBO needs >= 2 unit rows priced below the items'
 * regular price; BOGO / % off prices are computed. The legacy fixtures here
 * already satisfy both (two real items, deal prices below 16.50); the new
 * cases cover the guided deal types (DEAL_TYPES.md).
 *
 * Slot matching + "buy any X, get one free" (DEAL_TYPES.md, TC-705..687):
 * every pick must fit one of the deal's slots on /quote, placeOrder and
 * /validate; a BOGO with a category line is priced from the picks (equal or
 * lesser value) and the order stores the server's price.
 * Every fixture above already picks exactly its slots' items.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  readSharedState,
  generateRunId,
  generateSeedPhone,
} from "../../../utils/testData";
import { requireScheduling } from "../../../utils/dealScheduleGate";
import {
  addDaysToKey,
  atLocal,
  dayNameOfKey,
  formatClockEn,
  formatDateKeyEn,
  hhmm,
  laterTodayWindow,
  localDateKey,
  localParts,
  normalizeSpaces,
  shortDayEn,
} from "../../../utils/dealSchedule";

import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  getMenuItemApi,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  setAvailability,
  createDealRaw,
  createDealApi,
  getDealRaw,
  getDealApi,
  updateDealRaw,
  setDealStatusRaw,
  deleteDealRaw,
  deleteDealApi,
  getRestaurantDeals,
  getRestaurantDealsRaw,
  getActiveDealsCountRaw,
  getDealStatsRaw,
  getDealMenuItemsRaw,
  bulkCreateDealsRaw,
  getActiveDealsPublic,
  getRestaurantTimeZonePublic,
  getMealPeriodsPublic,
  getDealScheduleCheckRaw,
  getBusinessHoursRaw,
  setBusinessHoursApi,
  placeOrderRaw,
  getOrderByIdRaw,
  setRestaurantPublishedApi,
  updateRestaurantSettingsApi,
  validateDealPublic,
  getAiDealQuestionsPublic,
  createChainDealRaw,
  getChainDealsRaw,
  quoteOrderRaw,
  createCouponRaw,
  deleteCouponApi,
  createSecondOwner,
  deleteTestRestaurant,
  ensureTaxRate,
  type ApiDeal,
  type BusinessHoursRow,
  type ApiMenuItem,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const msg = (body: unknown): string => {
  if (body && typeof body === "object" && "message" in body)
    return String((body as { message: unknown }).message);
  return typeof body === "string" ? body : JSON.stringify(body);
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const daysFromNowIso = (d: number) =>
  new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();
const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
/** A weekday that is NOT today in any timezone within ±24h of UTC (UTC + 3 days). */
const farDay = () => DAY_NAMES[(new Date().getUTCDay() + 3) % 7]!;

test.describe("Owner — Deals API contract", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  /** Token of the throwaway tenant's owner (created in beforeAll). */
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  /** The seed OWNER — chain owner AND the cross-tenant intruder. */
  let seedToken = "";
  let seedRestaurantId = "";
  let adminToken = "";
  /** The throwaway restaurant every deal in this file lives on. */
  let restaurantId = "";
  /** The throwaway tenant's IANA zone as the backend resolves it; "" before Plan 1. */
  let tz = "";
  const twoItems = () =>
    [itemA, itemB].map((i) => ({ id: i.id, name: i.name, price: i.price }));
  const twoBody = () =>
    [itemA, itemB].map((i) => ({
      menuItemId: i.id,
      quantity: 1,
      itemName: i.name,
      itemPrice: i.price,
    }));
  let groupId = "";
  /** Extra per-run categories (the "any pizza" group); deleted after their items. */
  const extraGroupIds: string[] = [];
  const createdItemIds: string[] = [];
  const createdDealIds: string[] = [];
  // Deals created during the CURRENT test — deleted in afterEach so the
  // throwaway tenant never climbs past the 10-active cap (enforced on create
  // since RestauNax #618). Persistent deals a describe needs across its tests
  // (the authz `target`) go to createdDealIds only and survive afterEach.
  let perTest: string[] = [];
  const track = (id: string) => {
    perTest.push(id);
    createdDealIds.push(id);
    return id;
  };
  // Seed items (prices chosen so every sum is a clean cent value).
  let itemA: ApiMenuItem; // 10.00
  let itemB: ApiMenuItem; // 6.50
  let itemC: ApiMenuItem; // 4.00
  let itemMods: ApiMenuItem; // 12.00 with REPLACES + ADJUSTS modifier groups
  let chainGroupId = "";
  let locA = "";
  let locB = "";

  const freshToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;
  const freshSeedToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  const seedItem = async (
    name: string,
    price: number,
    opts: Parameters<typeof createMenuItemFull>[4] = {}
  ): Promise<ApiMenuItem> => {
    const item = await createMenuItemFull(
      token,
      groupId,
      `${name} ${runId}`,
      price,
      opts
    );
    createdItemIds.push(item.id);
    return item;
  };

  /** AUTO deal on the seed restaurant, remembered for cleanup. */
  const seedDeal = async (
    name: string,
    dealPrice: number,
    items: { id: string; name: string; price: number; quantity?: number }[],
    extra: Parameters<typeof createDealApi>[5] = {}
  ): Promise<ApiDeal> => {
    const deal = await createDealApi(
      token,
      restaurantId,
      `AUTO ${name} ${runId}`,
      dealPrice,
      items,
      extra
    );
    track(deal.id);
    return deal;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    const state = readSharedState();
    seedRestaurantId = state.restaurantId;
    chainGroupId = state.chainGroupId ?? "";
    locA = state.chainLocationAId ?? "";
    locB = state.chainLocationBId ?? "";
    seedToken = await freshSeedToken();
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[api-deals] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    // createSecondOwner returns env OWNER2 creds when set; otherwise the
    // password it minted (mirrors its own convention) — needed for freshToken.
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;
    // /quote refuses restaurants without a tax rate.
    await ensureTaxRate(adminToken, restaurantId);
    groupId = (
      await createMenuGroupNamed(token, `Automation Deals ${runId}`, {
        restaurantId,
      })
    ).id;
    itemA = await seedItem("Deal Burger", 10);
    itemB = await seedItem("Deal Fries", 6.5);
    itemC = await seedItem("Deal Drink", 4);
    itemMods = await seedItem("Deal Pizza", 12, {
      modifierGroups: [
        {
          name: "Size",
          pricingMode: "REPLACES_PRICE",
          minSelections: 1,
          maxSelections: 1,
          modifiers: [
            { name: "Regular", price: 12, isDefault: true },
            { name: "Large", price: 15 },
            { name: "Small", price: 10 },
          ],
        },
        {
          name: "Extras",
          pricingMode: "ADJUSTS_PRICE",
          minSelections: 0,
          maxSelections: null,
          modifiers: [
            { name: "Extra Cheese", price: 2 },
            { name: "Bacon", price: 3 },
          ],
        },
      ],
    });
    tz = await getRestaurantTimeZonePublic(restaurantId);
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    for (const id of createdDealIds) await deleteDealApi(t, id).catch(() => {});
    for (const id of createdItemIds)
      await permanentlyDeleteMenuItemApi(adminToken, id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    for (const id of extraGroupIds)
      await deleteTestMenuGroup(t, id).catch(() => {});
    // Admin DELETE archives the throwaway restaurant (never a hard delete).
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Deals API Contract");
    await allure.label("severity", "critical");
    token = await freshToken();
    seedToken = await freshSeedToken();
    perTest = [];
  });

  test.afterEach(async () => {
    if (!perTest.length) return;
    const t = await freshToken().catch(() => token);
    const ids = perTest;
    perTest = [];
    for (const id of ids) {
      await deleteDealApi(t, id).catch(() => {});
      const i = createdDealIds.indexOf(id);
      if (i >= 0) createdDealIds.splice(i, 1);
    }
  });

  // ── Create / read / update / delete ────────────────────────────────────────

  test("TC-325: create computes the money fields server-side, defaults to ACTIVE and splits quantity into qty-1 slots", async () => {
    await allure.description(
      "POST /api/deals/restaurant/:id with Burger ×2 + Fries at dealPrice 20 → 201. originalPrice = 26.50 " +
        "(2×10 + 6.50), savingsAmount 6.50, savingsPercentage 24.5 (1 dp), status ACTIVE, imageUrl null " +
        "(the image is generated by a worker later), and the qty-2 slot is stored as TWO qty-1 DealItem rows " +
        "(the platform-wide 'one row per unit' invariant) with sortOrder preserved."
    );
    const res = await createDealRaw(token, restaurantId, {
      name: `AUTO Combo ${runId}`,
      description: "two burgers and fries",
      dealPrice: 20,
      items: [
        {
          menuItemId: itemA.id,
          quantity: 2,
          itemName: itemA.name,
          itemPrice: itemA.price,
          isRequired: true,
        },
        {
          menuItemId: itemB.id,
          quantity: 1,
          itemName: itemB.name,
          itemPrice: itemB.price,
        },
      ],
    });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    const deal = res.data.deal!;
    track(deal.id);
    expect(res.data.message).toBe("Deal created successfully");
    expect(deal.status).toBe("ACTIVE");
    expect(deal.dealPrice).toBe(20);
    expect(deal.originalPrice).toBe(26.5);
    expect(deal.savingsAmount).toBe(6.5);
    expect(deal.savingsPercentage).toBe(24.5);
    expect(deal.imageUrl ?? null).toBeNull();
    expect(deal.aiGenerated).toBe(false);
    const items = deal.items ?? [];
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.quantity === 1)).toBe(true);
    expect(items.filter((i) => i.menuItemId === itemA.id)).toHaveLength(2);
    expect(items.filter((i) => i.menuItemId === itemB.id)).toHaveLength(1);
    // Split rows are renumbered sequentially (the split is the sort chokepoint).
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
    // isRequired defaults to true when omitted.
    expect(items.find((i) => i.menuItemId === itemB.id)!.isRequired).toBe(true);
    // The snapshot names/prices are what was sent, and the live menuItem rides along.
    expect(items[0]!.menuItem?.id).toBe(itemA.id);
  });

  test("TC-326: create validation — missing fields, non-positive price, bad HH:MM, unknown restaurant", async () => {
    await allure.description(
      "Exact 400/404 strings from dealController.createDeal, in evaluation order: required fields → " +
        "price > 0 → validTimeStart regex → validTimeEnd regex → restaurant exists."
    );
    const good = [
      {
        menuItemId: itemA.id,
        quantity: 1,
        itemName: itemA.name,
        itemPrice: itemA.price,
      },
      {
        menuItemId: itemB.id,
        quantity: 1,
        itemName: itemB.name,
        itemPrice: itemB.price,
      },
    ];
    const cases: {
      label: string;
      rid?: string;
      body: Record<string, unknown>;
      status: number;
      message: string;
    }[] = [
      {
        label: "no name",
        body: { dealPrice: 5, items: good },
        status: 400,
        message: "Missing required fields: name, dealPrice, and items",
      },
      {
        label: "no items",
        body: { name: `AUTO Bad ${runId}`, dealPrice: 5, items: [] },
        status: 400,
        message: "Missing required fields: name, dealPrice, and items",
      },
      {
        label: "price 0",
        body: { name: `AUTO Bad ${runId}`, dealPrice: 0, items: good },
        status: 400,
        message: "Deal price must be greater than 0",
      },
      {
        label: "price negative",
        body: { name: `AUTO Bad ${runId}`, dealPrice: -3, items: good },
        status: 400,
        message: "Deal price must be greater than 0",
      },
      {
        label: "validTimeStart 9am",
        body: {
          name: `AUTO Bad ${runId}`,
          dealPrice: 5,
          items: good,
          validTimeStart: "9am",
        },
        status: 400,
        message:
          "Invalid time format for validTimeStart. Use HH:MM format (e.g., 09:00)",
      },
      {
        label: "validTimeEnd 25:00",
        body: {
          name: `AUTO Bad ${runId}`,
          dealPrice: 5,
          items: good,
          validTimeStart: "09:00",
          validTimeEnd: "25:00",
        },
        status: 400,
        message:
          "Invalid time format for validTimeEnd. Use HH:MM format (e.g., 21:00)",
      },
      {
        // Since RestauNax #618 the ownership guard runs before the exists check,
        // so a restaurant you don't control (incl. a nonexistent one) is 403,
        // not 404 — it no longer leaks whether the restaurant exists.
        label: "unknown / unowned restaurant",
        rid: "00000000-0000-4000-8000-000000000000",
        body: { name: `AUTO Bad ${runId}`, dealPrice: 5, items: good },
        status: 403,
        message:
          "You do not have the required permissions to perform this action.",
      },
    ];
    for (const c of cases) {
      await allure.step(c.label, async () => {
        const res = await createDealRaw(token, c.rid ?? restaurantId, c.body);
        expect(res.status, `${c.label}: ${JSON.stringify(res.data)}`).toBe(
          c.status
        );
        expect(msg(res.data)).toBe(c.message);
        if (res.data?.deal?.id) track(res.data.deal.id);
      });
    }
  });

  test("TC-327: owner list — computedStatus EXPIRED for a past endDate, isAvailable false when a required item is 86'd, newest first", async () => {
    await allure.description(
      "GET /api/deals/restaurant/:id augments each deal: computedStatus = EXPIRED when status is ACTIVE " +
        "but endDate < now (status itself stays ACTIVE — expiry is computed on read, never written); " +
        "hasOutOfStockItem / isAvailable reflect a required item's outOfStock; list is createdAt desc."
    );
    const expired = await seedDeal(
      "Expired",
      8,
      [itemA, itemB].map((i) => ({ id: i.id, name: i.name, price: i.price })),
      // -2 days, not -1: since deal scheduling (Plan 1) "ended" means before the
      // RESTAURANT's today; UTC-yesterday is still today in New York for ~4 h a day.
      { endDate: daysFromNowIso(-2) }
    );
    const live = await seedDeal("Live", 8, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemC.id, name: itemC.name, price: itemC.price },
    ]);
    const list = await getRestaurantDeals(token, restaurantId);
    const ex = list.find((d) => d.id === expired.id)!;
    const lv = list.find((d) => d.id === live.id)!;
    expect(ex.status).toBe("ACTIVE");
    expect(ex.computedStatus).toBe("EXPIRED");
    expect(ex.isAvailable).toBe(false);
    expect(lv.computedStatus).toBe("ACTIVE");
    expect(lv.isAvailable).toBe(true);
    expect(lv.hasOutOfStockItem).toBe(false);
    // Newest first: `live` was created after `expired`.
    expect(list.findIndex((d) => d.id === live.id)).toBeLessThan(
      list.findIndex((d) => d.id === expired.id)
    );
    await setAvailability(token, itemC.id, true);
    try {
      const again = await getRestaurantDeals(token, restaurantId);
      const lv2 = again.find((d) => d.id === live.id)!;
      expect(lv2.hasOutOfStockItem).toBe(true);
      expect(lv2.isAvailable).toBe(false);
      expect(lv2.computedStatus).toBe("ACTIVE");
    } finally {
      await setAvailability(token, itemC.id, false);
    }
  });

  test("TC-328: GET /:dealId 404 for unknown; PUT is a patch (name-only keeps the slots; new items re-create the slots and reprice)", async () => {
    await allure.description(
      "PUT /api/deals/:id writes only the keys present. Renaming keeps items and prices; sending `items` " +
        "deletes and recreates every DealItem row (ids CHANGE — clients holding dealItemId must refetch) " +
        "and recomputes originalPrice/savings; a dealPrice-only patch reprices against the existing slots."
    );
    const unknown = await getDealRaw(
      token,
      "00000000-0000-4000-8000-000000000000"
    );
    expect(unknown.status).toBe(404);
    expect(msg(unknown.data)).toBe("Deal not found");

    const deal = await seedDeal("Patch", 12, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const before = await getDealApi(token, deal.id);
    const oldIds = (before.items ?? []).map((i) => i.id).sort();

    const rename = await updateDealRaw(token, deal.id, {
      name: `AUTO Patched ${runId}`,
    });
    expect(rename.status, JSON.stringify(rename.data)).toBe(200);
    expect(rename.data.message).toBe("Deal updated successfully");
    const afterRename = await getDealApi(token, deal.id);
    expect(afterRename.name).toBe(`AUTO Patched ${runId}`);
    expect((afterRename.items ?? []).map((i) => i.id).sort()).toEqual(oldIds);
    expect(afterRename.originalPrice).toBe(16.5);
    expect(afterRename.dealPrice).toBe(12);

    const reprice = await updateDealRaw(token, deal.id, { dealPrice: 10 });
    expect(reprice.status).toBe(200);
    const afterReprice = await getDealApi(token, deal.id);
    expect(afterReprice.dealPrice).toBe(10);
    expect(afterReprice.savingsAmount).toBe(6.5);
    expect(afterReprice.savingsPercentage).toBe(39.4);

    const reslot = await updateDealRaw(token, deal.id, {
      items: [
        {
          menuItemId: itemA.id,
          quantity: 1,
          itemName: itemA.name,
          itemPrice: itemA.price,
        },
        {
          menuItemId: itemC.id,
          quantity: 2,
          itemName: itemC.name,
          itemPrice: itemC.price,
        },
      ],
    });
    expect(reslot.status, JSON.stringify(reslot.data)).toBe(200);
    const afterReslot = await getDealApi(token, deal.id);
    const newIds = (afterReslot.items ?? []).map((i) => i.id).sort();
    expect(afterReslot.items).toHaveLength(3);
    expect(newIds.some((id) => oldIds.includes(id))).toBe(false);
    expect(afterReslot.originalPrice).toBe(18);
    expect(afterReslot.savingsAmount).toBe(8);
  });

  test("TC-329: PATCH /:dealId/status round-trips ACTIVE ↔ INACTIVE with its messages; anything else is 400", async () => {
    const deal = await seedDeal("Toggle", 9, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const off = await setDealStatusRaw(token, deal.id, "INACTIVE");
    expect(off.status).toBe(200);
    expect(off.data.message).toBe("Deal deactivated successfully");
    expect(off.data.deal?.status).toBe("INACTIVE");
    expect((await getDealApi(token, deal.id)).status).toBe("INACTIVE");
    const on = await setDealStatusRaw(token, deal.id, "ACTIVE");
    expect(on.status).toBe(200);
    expect(on.data.message).toBe("Deal activated successfully");
    for (const bad of ["EXPIRED", "PAUSED", "", "active"]) {
      const r = await setDealStatusRaw(token, deal.id, bad);
      expect(r.status, `status=${JSON.stringify(bad)}`).toBe(400);
      expect(msg(r.data)).toBe("Invalid status. Must be ACTIVE or INACTIVE");
    }
    const unknown = await setDealStatusRaw(
      token,
      "00000000-0000-4000-8000-000000000000",
      "ACTIVE"
    );
    expect(unknown.status).toBe(404);
  });

  test("TC-330: DELETE hard-deletes the deal — GET is 404 afterwards and it leaves the owner list; unknown id is 404", async () => {
    const deal = await seedDeal("Delete", 9, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const del = await deleteDealRaw(token, deal.id);
    expect(del.status).toBe(200);
    expect(del.data.message).toBe("Deal deleted successfully");
    expect((await getDealRaw(token, deal.id)).status).toBe(404);
    const list = await getRestaurantDeals(token, restaurantId);
    expect(list.some((d) => d.id === deal.id)).toBe(false);
    const again = await deleteDealRaw(token, deal.id);
    expect(again.status).toBe(404);
    expect(msg(again.data)).toBe("Deal not found");
  });

  // ── Public availability ────────────────────────────────────────────────────

  test("TC-331: public /active lists only deals that are ACTIVE and inside their dates and weekday on the restaurant's calendar; unknown restaurant → 200 []", async () => {
    await allure.description(
      "GET /api/deals/restaurant/:id/active is what the storefronts render. Rewritten for deal scheduling " +
        "(restaunax Plan 1): each restricted deal is placed by a DATE or WEEKDAY that is wrong in every " +
        "timezone (UTC ±2 days / UTC weekday +3), never by an HH:MM from the runner's clock — QA now judges " +
        "windows on the restaurant clock and rejects start == end. HH:mm windows, overnight and date edges " +
        "are TC-509..512."
    );
    const two = twoItems();
    const plain = await seedDeal("Plain", 12, two);
    const inactive = await seedDeal("Inactive", 12, two);
    expect(
      (await setDealStatusRaw(token, inactive.id, "INACTIVE")).status
    ).toBe(200);
    const ended = await seedDeal("Ended", 12, two, {
      endDate: daysFromNowIso(-2).slice(0, 10),
    });
    const notYet = await seedDeal("NotYet", 12, two, {
      startDate: daysFromNowIso(3).slice(0, 10),
    });
    const wrongDay = await seedDeal("WrongDay", 12, two, {
      validDays: [farDay()],
    });

    const res = await getActiveDealsPublic(restaurantId);
    expect(res.status).toBe(200);
    const ids = (res.data.deals ?? []).map((d) => d.id);
    expect(ids).toContain(plain.id);
    for (const [label, d] of [
      ["INACTIVE", inactive],
      ["endDate before the restaurant's today", ended],
      ["startDate after the restaurant's today", notYet],
      ["validDays other weekday", wrongDay],
    ] as const) {
      expect(ids, `${label} must be hidden`).not.toContain(d.id);
    }
    const shown = res.data.deals!.find((d) => d.id === plain.id)!;
    expect(shown.dealPrice).toBe(12);
    expect(shown.originalPrice).toBe(16.5);
    expect(shown.savingsAmount).toBe(4.5);
    expect(shown.savingsPercentage).toBe(27.3);
    expect(shown.items).toHaveLength(2);
    const vd = await validateDealPublic({ dealId: wrongDay.id, restaurantId });
    expect(vd.status).toBe(200);
    expect(vd.data.isValid).toBe(false);

    const none = await getActiveDealsPublic(
      "00000000-0000-4000-8000-000000000000"
    );
    expect(none.status).toBe(200);
    expect(none.data.deals).toEqual([]);
  });

  test("TC-542: public /active carries the restaurant's timeZone and null schedule text for an unrestricted deal (deal scheduling, Plan 1)", async () => {
    requireScheduling("backend", Boolean(tz));
    const plain = await seedDeal("PlainTz", 12, twoItems());
    const res = await getActiveDealsPublic(restaurantId);
    expect(res.status).toBe(200);
    expect(res.data.timeZone).toBe(tz);
    expect(res.data.deals!.find((d) => d.id === plain.id)).toMatchObject({
      availableNow: true,
      scheduleSummary: null,
      availabilityLabel: null,
      startDate: null,
      endDate: null,
    });
  });

  test("TC-332: 86'ing a required slot item hides the deal from /active; restoring brings it back", async () => {
    const deal = await seedDeal("Stock", 12, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const has = async () =>
      ((await getActiveDealsPublic(restaurantId)).data.deals ?? []).some(
        (d) => d.id === deal.id
      );
    expect(await has()).toBe(true);
    await setAvailability(token, itemB.id, true);
    try {
      expect(await has()).toBe(false);
      const v = await validateDealPublic({ dealId: deal.id, restaurantId });
      expect(v.data.isValid).toBe(false);
      expect(v.data.issues).toContain(`${itemB.name} is out of stock`);
    } finally {
      await setAvailability(token, itemB.id, false);
    }
    expect(await has()).toBe(true);
  });

  test("TC-333: public /validate — required-field, not-found and wrong-restaurant branches; valid, inactive and unfilled-slot verdicts", async () => {
    const deal = await seedDeal("Validate", 12, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const full = await getDealApi(token, deal.id);
    const slots = full.items ?? [];

    const missing = await validateDealPublic({ dealId: deal.id });
    expect(missing.status).toBe(400);
    expect(msg(missing.data)).toBe(
      "Missing required fields: dealId and restaurantId"
    );
    const nf = await validateDealPublic({
      dealId: "00000000-0000-4000-8000-000000000000",
      restaurantId,
    });
    expect(nf.status).toBe(404);
    expect(msg(nf.data)).toBe("Deal not found");
    const wrong = await validateDealPublic({
      dealId: deal.id,
      restaurantId: seedRestaurantId,
    });
    expect(wrong.status).toBe(400);
    expect(msg(wrong.data)).toBe("Deal does not belong to this restaurant");
    const ok = await validateDealPublic({
      dealId: deal.id,
      restaurantId,
      selectedItems: slots.map((s) => ({
        dealItemId: s.id,
        menuItemId: s.menuItemId!,
        quantity: 1,
      })),
    });
    expect(ok.status).toBe(200);
    expect(ok.data.isValid).toBe(true);
    expect(ok.data.message).toBe("Deal is valid");
    expect(ok.data.deal?.dealPrice).toBe(12);

    const partial = await validateDealPublic({
      dealId: deal.id,
      restaurantId,
      selectedItems: [
        { dealItemId: slots[0]!.id, menuItemId: slots[0]!.menuItemId! },
      ],
    });
    expect(partial.data.isValid).toBe(false);
    expect(partial.data.issues).toContain(
      `Please select an item for: ${slots[1]!.itemName}`
    );
    expect(partial.data.message).toMatch(/^Deal validation failed: /);

    await setDealStatusRaw(token, deal.id, "INACTIVE");
    const inactive = await validateDealPublic({
      dealId: deal.id,
      restaurantId,
    });
    expect(inactive.status).toBe(200);
    expect(inactive.data.isValid).toBe(false);
    expect(inactive.data.issues).toContain("This deal is not currently active");
  });

  // ── Deal scheduling: /active judged at ?at= on the restaurant clock ──────────
  //
  // D = the restaurant-local date two days out: never "today" in any zone,
  // well inside the 30-day `at` horizon, and D-1 is still in the future. Every
  // instant is built with atLocal(tz, …) — the restaurant's wall clock.
  test.describe("schedule — public /active at ?at= (restaunax Plan 1)", () => {
    let D = "";
    const at = (dateKey: string, time: string) => atLocal(tz, dateKey, time);
    const listAt = async (when: string, lang?: "en" | "es") => {
      const res = await getActiveDealsPublic(restaurantId, { at: when, lang });
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      return res.data.deals ?? [];
    };
    const find = (deals: ApiDeal[], id: string) =>
      deals.find((d) => d.id === id);
    const text = (s: string | null | undefined) => normalizeSpaces(s ?? "");

    test.beforeEach(() => {
      requireScheduling("backend", Boolean(tz));
      D = localDateKey(tz, 2);
    });

    test("TC-508: GET /api/deals/meal-periods lists the five meal periods with their hours, in order", async () => {
      const res = await getMealPeriodsPublic();
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toEqual([
        { value: "Breakfast", start: "05:00", end: "11:00" },
        { value: "Lunch", start: "11:00", end: "14:00" },
        { value: "Dinner", start: "17:00", end: "22:00" },
        { value: "Late Night", start: "22:00", end: "05:00" },
        { value: "All Day", start: null, end: null },
      ]);
    });

    test("TC-509: a 15:00–17:00 window is listed earlier that day with availableNow false and its next start, is live from 15:00 (inclusive) to 17:00 (exclusive); a start-only window runs to end of day", async () => {
      await allure.description(
        "Window deal at D 14:00 → listed, availableNow false, nextAvailableAt = D 15:00 local, label " +
          "'Available from 3:00 PM', summary '3:00 PM–5:00 PM'. D 15:00 and 16:59 → availableNow true. D 17:00 → " +
          "omitted (end exclusive; next window is another local day). validTimeStart 21:00 alone = 21:00 → midnight."
      );
      const deal = await seedDeal("Window", 12, twoItems(), {
        validTimeStart: "15:00",
        validTimeEnd: "17:00",
      });
      const before = find(await listAt(at(D, "14:00")), deal.id);
      expect(
        before,
        "a window later the same local day keeps the deal listed"
      ).toBeTruthy();
      expect(before!.availableNow).toBe(false);
      expect(before!.nextAvailableAt).toBe(at(D, "15:00"));
      expect(text(before!.availabilityLabel)).toBe("Available from 3:00 PM");
      expect(text(before!.scheduleSummary)).toBe("3:00 PM–5:00 PM");
      const opening = find(await listAt(at(D, "15:00")), deal.id);
      expect(opening?.availableNow, "start is inclusive").toBe(true);
      expect(opening?.availabilityLabel ?? null).toBeNull();
      expect(find(await listAt(at(D, "16:59")), deal.id)?.availableNow).toBe(
        true
      );
      expect(
        find(await listAt(at(D, "17:00")), deal.id),
        "end is exclusive → omitted"
      ).toBeUndefined();

      const evening = await seedDeal("FromNine", 12, twoItems(), {
        validTimeStart: "21:00",
      });
      const early = find(await listAt(at(D, "20:00")), evening.id);
      expect(early?.availableNow).toBe(false);
      expect(text(early?.availabilityLabel)).toBe("Available from 9:00 PM");
      expect(text(early?.scheduleSummary)).toBe("From 9:00 PM");
      expect(find(await listAt(at(D, "23:59")), evening.id)?.availableNow).toBe(
        true
      );
    });

    test("TC-510: an overnight window (22:00–02:00 on one weekday) belongs to the day it STARTS — live after midnight on the next day, gone at 02:00, and not on the previous night", async () => {
      const day = dayNameOfKey(D);
      const nextDay = addDaysToKey(D, 1);
      const deal = await seedDeal("Overnight", 12, twoItems(), {
        validDays: [day],
        validTimeStart: "22:00",
        validTimeEnd: "02:00",
      });
      const evening = find(await listAt(at(D, "21:00")), deal.id);
      expect(evening?.availableNow).toBe(false);
      expect(text(evening?.availabilityLabel)).toBe("Available from 10:00 PM");
      expect(text(evening?.scheduleSummary)).toBe(
        `${shortDayEn(day)} · 10:00 PM–2:00 AM`
      );
      expect(find(await listAt(at(D, "23:30")), deal.id)?.availableNow).toBe(
        true
      );
      expect(
        find(await listAt(at(nextDay, "01:30")), deal.id)?.availableNow,
        "the tail after midnight belongs to the start day"
      ).toBe(true);
      expect(find(await listAt(at(nextDay, "02:00")), deal.id)).toBeUndefined();
      expect(
        find(await listAt(at(addDaysToKey(D, -1), "23:30")), deal.id),
        "the night before is not a start day"
      ).toBeUndefined();
    });

    test("TC-511: start/end dates are restaurant-local calendar days, inclusive — live from 00:00 on the start date through 23:59 on the end date; dates come back as YYYY-MM-DD", async () => {
      const end = addDaysToKey(D, 1);
      const deal = await seedDeal("Dated", 12, twoItems(), {
        startDate: D,
        endDate: end,
      });
      expect(
        find(await listAt(at(addDaysToKey(D, -1), "23:59")), deal.id),
        "not started, and it starts on another local day"
      ).toBeUndefined();
      const first = find(await listAt(at(D, "00:00")), deal.id);
      expect(first?.availableNow).toBe(true);
      expect(first?.startDate).toBe(D);
      expect(first?.endDate).toBe(end);
      expect(text(first?.scheduleSummary)).toBe(
        `${formatDateKeyEn(D)} – ${formatDateKeyEn(end)}`
      );
      expect(find(await listAt(at(end, "23:59")), deal.id)?.availableNow).toBe(
        true
      );
      expect(
        find(await listAt(at(addDaysToKey(D, 2), "00:00")), deal.id),
        "ended after the end date"
      ).toBeUndefined();
    });

    test("TC-512: a deal that is off for the whole local day is omitted (and listed on its day); schedule text follows Accept-Language", async () => {
      const otherDay = await seedDeal("OtherDay", 12, twoItems(), {
        validDays: [dayNameOfKey(addDaysToKey(D, 1))],
      });
      expect(find(await listAt(at(D, "12:00")), otherDay.id)).toBeUndefined();
      expect(
        find(await listAt(at(addDaysToKey(D, 1), "12:00")), otherDay.id)
          ?.availableNow
      ).toBe(true);

      const window = await seedDeal("Spanish", 12, twoItems(), {
        validTimeStart: "15:00",
        validTimeEnd: "17:00",
      });
      const es = find(await listAt(at(D, "14:00"), "es"), window.id);
      expect(text(es?.scheduleSummary)).toBe("15:00–17:00");
      expect(text(es?.availabilityLabel)).toBe("Disponible desde las 15:00");
    });

    test("TC-539: includeUnavailable=1 (the POS list) adds a deal that is off for the whole day — availableNow false, its next start and schedule — but never an ended deal; without the flag the day-off deal stays omitted", async () => {
      await allure.description(
        "GET /active?channel=in_person&includeUnavailable=1 is what the POS lists (it shows unavailable deals and " +
          "explains their hours on tap; the kiosk hides them and calls without the flag). Deal A is valid only on " +
          "the restaurant-local weekday three days out (never today's), deal B ended two local days ago."
      );
      const offDayKey = localDateKey(tz, 3);
      const offDay = dayNameOfKey(offDayKey);
      const dayOff = await seedDeal("DayOff", 12, twoItems(), {
        validDays: [offDay],
      });
      const ended = await seedDeal("EndedFlag", 12, twoItems(), {
        endDate: localDateKey(tz, -2),
      });
      const without = await getActiveDealsPublic(restaurantId, {
        channel: "in_person",
      });
      expect(without.status).toBe(200);
      const withoutIds = (without.data.deals ?? []).map((d) => d.id);
      expect(
        withoutIds,
        "off all day → omitted without the flag"
      ).not.toContain(dayOff.id);
      expect(withoutIds).not.toContain(ended.id);

      const withFlag = await getActiveDealsPublic(restaurantId, {
        channel: "in_person",
        includeUnavailable: true,
      });
      expect(withFlag.status).toBe(200);
      const listed = find(withFlag.data.deals ?? [], dayOff.id);
      expect(listed, "off all day → listed with the flag").toBeTruthy();
      expect(listed!.availableNow).toBe(false);
      expect(listed!.nextAvailableAt).toBe(atLocal(tz, offDayKey, "00:00"));
      expect(text(listed!.scheduleSummary)).toBe(shortDayEn(offDay));
      expect(
        find(withFlag.data.deals ?? [], ended.id),
        "ended deals never come back"
      ).toBeUndefined();
    });

    test("TC-513: ?at= more than 5 minutes in the past, more than 30 days ahead, or unparsable → 400; small clock skew and 29 days ahead are fine", async () => {
      const bad = async (value: string, label: string) => {
        const r = await getActiveDealsPublic(restaurantId, { at: value });
        expect(r.status, `${label}: ${JSON.stringify(r.data)}`).toBe(400);
        expect(r.data.message).toBe(
          "That pickup time can't be used to check deals."
        );
      };
      await bad(
        new Date(Date.now() - 60 * 60_000).toISOString(),
        "an hour ago"
      );
      await bad(
        new Date(Date.now() + 31 * 86_400_000).toISOString(),
        "31 days ahead"
      );
      await bad("not-a-date", "garbage");
      const skew = await getActiveDealsPublic(restaurantId, {
        at: new Date(Date.now() - 2 * 60_000).toISOString(),
      });
      expect(skew.status, "a 2-minute clock skew is tolerated").toBe(200);
      const far = await getActiveDealsPublic(restaurantId, {
        at: new Date(Date.now() + 29 * 86_400_000).toISOString(),
      });
      expect(far.status).toBe(200);
    });

    test("TC-514: /quote judges a deal at scheduledFor — 400 DEAL_NOT_AVAILABLE_AT_TIME with the deal, its schedule and next start before the window, 200 inside it; ASAP is judged now", async () => {
      await allure.description(
        "Deal = D's weekday only, 15:00–17:00. scheduledFor D 12:00 → 400 errorCode DEAL_NOT_AVAILABLE_AT_TIME, " +
          "details {dealId, dealName, scheduleSummary '<Day> · 3:00 PM–5:00 PM', nextAvailableAt D 15:00}. " +
          "scheduledFor D 15:30 → 200 at the deal price. No scheduledFor (ASAP) → judged now; D is never today → 400."
      );
      const day = dayNameOfKey(D);
      const deal = await seedDeal("HappyHour", 12, twoItems(), {
        validDays: [day],
        validTimeStart: "15:00",
        validTimeEnd: "17:00",
      });
      const body = {
        orderItems: [],
        orderDeals: [
          {
            dealId: deal.id,
            quantity: 1,
            items: [
              { menuItemId: itemA.id, quantity: 1 },
              { menuItemId: itemB.id, quantity: 1 },
            ],
          },
        ],
      };
      const summary = `${shortDayEn(day)} · 3:00 PM–5:00 PM`;
      const early = await quoteOrderRaw(restaurantId, {
        ...body,
        scheduledFor: at(D, "12:00"),
      });
      expect(early.status, JSON.stringify(early.data)).toBe(400);
      expect(early.data.errorCode).toBe("DEAL_NOT_AVAILABLE_AT_TIME");
      expect(early.data.details).toEqual({
        dealId: deal.id,
        dealName: deal.name,
        scheduleSummary: summary,
        nextAvailableAt: at(D, "15:00"),
      });
      const message = normalizeSpaces(early.data.message ?? "");
      expect(message).toContain(deal.name);
      expect(message).toContain(summary);

      const inside = await quoteOrderRaw(restaurantId, {
        ...body,
        scheduledFor: at(D, "15:30"),
      });
      expect(inside.status, JSON.stringify(inside.data)).toBe(200);
      expect(inside.data.quote?.deals?.[0]).toMatchObject({
        dealId: deal.id,
        dealPrice: 12,
        lineTotal: 12,
      });

      const asap = await quoteOrderRaw(restaurantId, body);
      expect(
        asap.status,
        "ASAP is judged now — D is never the restaurant's today"
      ).toBe(400);
      expect(asap.data.errorCode).toBe("DEAL_NOT_AVAILABLE_AT_TIME");
    });

    test("TC-515: placing a scheduled order with a deal outside its window is refused with DEAL_NOT_AVAILABLE_AT_TIME; the same order inside the window is accepted", async () => {
      await allure.description(
        "POST /api/order/new/restaurantId/:id (the storefront checkout) with scheduledFor. The tenant is published " +
          "and accepting orders for this test only (unpublished stores refuse every order) and has no business " +
          "hours (= always open). The accepted control leaves one INITIALIZED (unpaid) order on the throwaway tenant."
      );
      const day = dayNameOfKey(D);
      const deal = await seedDeal("Scheduled", 12, twoItems(), {
        validDays: [day],
        validTimeStart: "15:00",
        validTimeEnd: "17:00",
      });
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const { previous } = await setRestaurantPublishedApi(
        adminToken,
        restaurantId,
        true
      );
      await updateRestaurantSettingsApi(token, restaurantId, {
        acceptingOrders: true,
      });
      const orderBody = (scheduledFor: string) => ({
        orderType: "PICKUP",
        subtotal: 12,
        tax: 0.96,
        deliveryFee: 0,
        tip: 0,
        total: 12.96,
        customerEmail: `deal-sched-${runId}@restaunax-test.com`,
        customerPhone: generateSeedPhone(),
        firstName: "Deal",
        lastName: "Schedule",
        orderItems: [],
        orderDeals: [
          {
            dealId: deal.id,
            dealName: deal.name,
            dealPrice: 12,
            quantity: 1,
            items: [itemA, itemB].map((i) => ({
              menuItemId: i.id,
              menuItemName: i.name,
              menuItemPrice: i.price,
              quantity: 1,
            })),
          },
        ],
        scheduledFor,
      });
      try {
        const refused = await placeOrderRaw(
          restaurantId,
          orderBody(at(D, "12:00"))
        );
        expect(refused.status, JSON.stringify(refused.data)).toBe(400);
        expect(refused.data.errorCode).toBe("DEAL_NOT_AVAILABLE_AT_TIME");
        expect(refused.data.details).toMatchObject({
          dealId: deal.id,
          nextAvailableAt: at(D, "15:00"),
        });
        const placed = await placeOrderRaw(
          restaurantId,
          orderBody(at(D, "15:30"))
        );
        expect(placed.ok, JSON.stringify(placed.data)).toBe(true);
      } finally {
        if (!previous)
          await setRestaurantPublishedApi(adminToken, restaurantId, false);
      }
    });
  });

  test.describe("schedule — owner list, cap and ended deals (restaunax Plan 1)", () => {
    test.beforeEach(() => {
      requireScheduling("backend", Boolean(tz));
    });

    test("TC-516: the owner list reports each deal's live status on the restaurant clock — LIVE, LATER_TODAY (with its start), SCHEDULED, ENDED, OFF — plus timeZone/timeZoneLabel and YYYY-MM-DD dates", async () => {
      const live = await seedDeal("Live", 12, twoItems());
      const later = laterTodayWindow(tz);
      const laterDeal = later
        ? await seedDeal("Later", 12, twoItems(), {
            validTimeStart: later.start,
            validTimeEnd: later.end,
          })
        : null;
      const startKey = localDateKey(tz, 3);
      const scheduled = await seedDeal("Scheduled", 12, twoItems(), {
        startDate: startKey,
      });
      const endedKey = localDateKey(tz, -2);
      const ended = await seedDeal("Ended", 12, twoItems(), {
        endDate: endedKey,
      });
      const off = await seedDeal("Off", 12, twoItems());
      expect((await setDealStatusRaw(token, off.id, "INACTIVE")).status).toBe(
        200
      );

      const res = await getRestaurantDealsRaw(token, restaurantId);
      expect(res.status).toBe(200);
      expect(res.data.timeZone).toBe(tz);
      expect((res.data.timeZoneLabel ?? "").length).toBeGreaterThan(0);
      const byId = (id: string) => res.data.deals!.find((d) => d.id === id)!;
      expect(byId(live.id)).toMatchObject({
        liveStatus: "LIVE",
        scheduleSummary: null,
        availabilityLabel: null,
      });
      if (laterDeal && later) {
        const l = byId(laterDeal.id);
        expect(l.liveStatus).toBe("LATER_TODAY");
        expect(l.nextAvailableAt).toBe(atLocal(tz, later.dateKey, later.start));
        expect(normalizeSpaces(l.availabilityLabel ?? "")).toBe(
          `Available from ${formatClockEn(later.start)}`
        );
      } else {
        test.info().annotations.push({
          type: "note",
          description:
            "LATER_TODAY not asserted — less than an hour left in the restaurant's day",
        });
      }
      expect(byId(scheduled.id)).toMatchObject({
        liveStatus: "SCHEDULED",
        startDate: startKey,
      });
      expect(normalizeSpaces(byId(scheduled.id).scheduleSummary ?? "")).toBe(
        `From ${formatDateKeyEn(startKey)}`
      );
      expect(byId(ended.id)).toMatchObject({
        liveStatus: "ENDED",
        computedStatus: "EXPIRED",
        status: "ACTIVE",
        endDate: endedKey,
      });
      expect(byId(off.id).liveStatus).toBe("OFF");
    });

    test("TC-517: a deal whose end date has passed does not take one of the 10 active slots — ten live deals still fit beside it, the eleventh is refused; a deal on its last day whose window is over is ENDED but still holds a slot", async () => {
      const activeCount = async () =>
        (await getActiveDealsCountRaw(token, restaurantId)).data
          .activeDealsCount ?? 0;
      const ended = await seedDeal("CapEnded", 9, twoItems(), {
        endDate: localDateKey(tz, -2),
      });
      expect(ended.status).toBe("ACTIVE");
      expect(await activeCount(), "a date-ended deal frees its slot").toBe(0);

      await allure.step(
        "last day, window already over → ENDED, but the slot frees only after the date (DEAL_SCHEDULING.md rule 4)",
        async () => {
          const now = localParts(tz);
          const endMinute = Math.floor((now.minuteOfDay - 15) / 15) * 15;
          const startMinute = endMinute - 60;
          if (startMinute < 0) {
            test.info().annotations.push({
              type: "note",
              description:
                "too early in the restaurant's day for a window that is already over",
            });
            return;
          }
          const lastDay = await seedDeal("LastDayOver", 9, twoItems(), {
            endDate: now.dateKey,
            validTimeStart: hhmm(startMinute),
            validTimeEnd: hhmm(endMinute),
          });
          const row = (
            await getRestaurantDealsRaw(token, restaurantId)
          ).data.deals!.find((d) => d.id === lastDay.id)!;
          expect(row.liveStatus).toBe("ENDED");
          expect(
            await activeCount(),
            "still holds a slot until its local end date passes"
          ).toBe(1);
          expect((await deleteDealRaw(token, lastDay.id)).status).toBe(200);
        }
      );

      for (let i = 0; i < 10; i++)
        await seedDeal(`Cap live #${i + 1}`, 9, twoItems());
      const over = await createDealRaw(token, restaurantId, {
        name: `AUTO Cap overflow ${runId}`,
        dealPrice: 9,
        items: twoBody(),
      });
      if (over.data?.deal?.id) track(over.data.deal.id);
      expect(over.status, JSON.stringify(over.data)).toBe(400);
      expect(over.data as { error?: string }).toMatchObject({
        error: "MAX_ACTIVE_DEALS_REACHED",
      });
    });

    test("TC-518: an ended deal cannot be switched back on (PATCH or PUT → 400 DEAL_ENDED) until its end date moves", async () => {
      const deal = await seedDeal("EndedOff", 9, twoItems(), {
        endDate: localDateKey(tz, -2),
      });
      expect((await setDealStatusRaw(token, deal.id, "INACTIVE")).status).toBe(
        200
      );
      const on = await setDealStatusRaw(token, deal.id, "ACTIVE");
      expect(on.status).toBe(400);
      expect((on.data as { errorCode?: string }).errorCode).toBe("DEAL_ENDED");
      expect(msg(on.data)).toBe(
        "This deal has ended. Change its end date to turn it back on."
      );
      const put = await updateDealRaw(token, deal.id, { status: "ACTIVE" });
      expect(put.status).toBe(400);
      expect((put.data as { errorCode?: string }).errorCode).toBe("DEAL_ENDED");
      expect(msg(put.data)).toBe(
        "This deal has ended. Change its end date to turn it back on."
      );
      const moved = await updateDealRaw(token, deal.id, {
        endDate: localDateKey(tz, 5),
      });
      expect(moved.status, JSON.stringify(moved.data)).toBe(200);
      expect((await setDealStatusRaw(token, deal.id, "ACTIVE")).status).toBe(
        200
      );
    });

    const SCHEDULE_ERRORS = {
      dateOrder: "The end date must be on or after the start date.",
      sameStartEnd: "The start and end time can't be the same.",
      invalidDays: "Choose valid days of the week.",
      invalidDate: "Enter dates as YYYY-MM-DD.",
      invalidOption:
        "Choose an option from the list for audience, meal type and occasion.",
    } as const;

    test("TC-519: create and PUT reject bad schedules with plain messages and normalize good ones (all seven days → [], ISO date → its date, overnight + options kept)", async () => {
      const k5 = localDateKey(tz, 5);
      const k10 = localDateKey(tz, 10);
      const cases: [string, Record<string, unknown>, string][] = [
        [
          "end before start",
          { startDate: k10, endDate: k5 },
          SCHEDULE_ERRORS.dateOrder,
        ],
        [
          "start equals end",
          { validTimeStart: "15:00", validTimeEnd: "15:00" },
          SCHEDULE_ERRORS.sameStartEnd,
        ],
        [
          "unknown weekday",
          { validDays: ["FUNDAY"] },
          SCHEDULE_ERRORS.invalidDays,
        ],
        ["US date", { startDate: "10/10/2026" }, SCHEDULE_ERRORS.invalidDate],
        [
          "impossible date",
          { endDate: "2026-02-30" },
          SCHEDULE_ERRORS.invalidDate,
        ],
        ["meal type", { mealType: "Brunch" }, SCHEDULE_ERRORS.invalidOption],
        ["audience", { targetAudience: "Kids" }, SCHEDULE_ERRORS.invalidOption],
        ["occasion", { occasion: "Birthday" }, SCHEDULE_ERRORS.invalidOption],
      ];
      for (const [label, extra, message] of cases) {
        const res = await createDealRaw(token, restaurantId, {
          name: `AUTO Invalid ${runId}`,
          dealPrice: 9,
          items: twoBody(),
          ...extra,
        });
        if (res.data?.deal?.id) track(res.data.deal.id);
        expect(res.status, `${label}: ${JSON.stringify(res.data)}`).toBe(400);
        expect(msg(res.data), label).toBe(message);
      }

      const deal = await seedDeal("Patchable", 9, twoItems());
      const badPut = await updateDealRaw(token, deal.id, {
        startDate: k10,
        endDate: k5,
      });
      expect(badPut.status).toBe(400);
      expect(msg(badPut.data)).toBe(SCHEDULE_ERRORS.dateOrder);
      const badOption = await updateDealRaw(token, deal.id, {
        mealType: "Brunch",
      });
      expect(badOption.status).toBe(400);
      expect(msg(badOption.data)).toBe(SCHEDULE_ERRORS.invalidOption);

      const k3 = localDateKey(tz, 3);
      const good = await createDealRaw(token, restaurantId, {
        name: `AUTO Normalized ${runId}`,
        dealPrice: 9,
        items: twoBody(),
        validDays: [
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ],
        validTimeStart: "22:00",
        validTimeEnd: "02:00",
        startDate: `${k3}T04:00:00.000Z`,
        endDate: k10,
        targetAudience: "Couples",
        mealType: "Late Night",
        occasion: "Weekend",
      });
      expect(good.status, JSON.stringify(good.data)).toBe(201);
      track(good.data.deal!.id);
      const row = (await getRestaurantDeals(token, restaurantId)).find(
        (d) => d.id === good.data.deal!.id
      )!;
      expect(row).toMatchObject({
        validDays: [],
        validTimeStart: "22:00",
        validTimeEnd: "02:00",
        startDate: k3,
        endDate: k10,
        targetAudience: "Couples",
        mealType: "Late Night",
        occasion: "Weekend",
      });
    });

    test("TC-520: bulk create (the AI generator's path) runs the same validation before writing anything, and keeps schedule + occasion on a valid deal", async () => {
      const before = (await getRestaurantDeals(token, restaurantId)).length;
      const bad = await bulkCreateDealsRaw(token, restaurantId, [
        { name: `AUTO BulkOk ${runId}`, dealPrice: 9, items: twoBody() },
        {
          name: `AUTO BulkBad ${runId}`,
          dealPrice: 9,
          items: twoBody(),
          mealType: "Brunch",
        },
      ]);
      for (const d of bad.data.deals ?? []) track(d.id);
      expect(bad.status, JSON.stringify(bad.data)).toBe(400);
      expect(msg(bad.data)).toBe(SCHEDULE_ERRORS.invalidOption);
      expect(
        (await getRestaurantDeals(token, restaurantId)).length,
        "nothing was written"
      ).toBe(before);

      const reversed = await bulkCreateDealsRaw(token, restaurantId, [
        {
          name: `AUTO BulkDates ${runId}`,
          dealPrice: 9,
          items: twoBody(),
          startDate: localDateKey(tz, 10),
          endDate: localDateKey(tz, 5),
        },
      ]);
      for (const d of reversed.data.deals ?? []) track(d.id);
      expect(reversed.status).toBe(400);
      expect(msg(reversed.data)).toBe(SCHEDULE_ERRORS.dateOrder);

      const good = await bulkCreateDealsRaw(token, restaurantId, [
        {
          name: `AUTO BulkSched ${runId}`,
          dealPrice: 9,
          items: twoBody(),
          validDays: ["SATURDAY", "SUNDAY"],
          validTimeStart: "11:00",
          validTimeEnd: "14:00",
          targetAudience: "Family",
          mealType: "Lunch",
          occasion: "Weekend",
        },
      ]);
      expect(good.status, JSON.stringify(good.data)).toBe(201);
      for (const d of good.data.deals ?? []) track(d.id);
      const row = (await getRestaurantDeals(token, restaurantId)).find(
        (d) => d.name === `AUTO BulkSched ${runId}`
      )!;
      expect([...(row.validDays ?? [])].sort()).toEqual(["SATURDAY", "SUNDAY"]);
      expect(row).toMatchObject({
        validTimeStart: "11:00",
        validTimeEnd: "14:00",
        mealType: "Lunch",
        occasion: "Weekend",
      });
    });

    /** Mon–Sat 11:00–21:00, Friday until 02:00 (overnight), Sunday closed. */
    const WEEK_HOURS: BusinessHoursRow[] = [
      ...(
        ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "SATURDAY"] as const
      ).map((day) => ({
        day,
        openingTime: "11:00:00",
        closingTime: "21:00:00",
        isClosed: false,
        is24Hours: false,
      })),
      {
        day: "FRIDAY",
        openingTime: "11:00:00",
        closingTime: "02:00:00",
        isClosed: false,
        is24Hours: false,
      },
      {
        day: "SUNDAY",
        openingTime: null,
        closingTime: null,
        isClosed: true,
        is24Hours: false,
      },
    ];

    /** Run `body` with WEEK_HOURS set on the tenant; restore the rows it had (normally none). */
    const withWeekHours = async (body: () => Promise<void>) => {
      const original =
        (await getBusinessHoursRaw(token, restaurantId)).data.businessHours ??
        [];
      await setBusinessHoursApi(token, restaurantId, WEEK_HOURS);
      try {
        await body();
      } finally {
        await setBusinessHoursApi(await freshToken(), restaurantId, original);
      }
    };
    const check = async (q: Parameters<typeof getDealScheduleCheckRaw>[2]) => {
      const res = await getDealScheduleCheckRaw(token, restaurantId, q);
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      return res.data.data!;
    };

    test("TC-521: schedule-check warns about closed days and windows that START outside business hours, names the restaurant, and is quiet when no hours are set; bad days → 400", async () => {
      await allure.description(
        "GET /api/deals/restaurant/:id/schedule-check (warning-only; the owner may still save). Throwaway " +
          "tenant: no hours → no warnings; with Mon–Sat 11–21 / Sun closed: Sun+Mon → one 'closed on Sun' warning, " +
          "Mon 09:00–12:00 → one warning naming Mon, Any time → the Sunday warning. Hours restored in finally."
      );
      const original =
        (await getBusinessHoursRaw(token, restaurantId)).data.businessHours ??
        [];
      if (original.length === 0) {
        const none = await check({
          validDays: ["SUNDAY"],
          validTimeStart: "05:00",
          validTimeEnd: "06:00",
        });
        expect(none.timeZone).toBe(tz);
        expect(none.timeZoneLabel.length).toBeGreaterThan(0);
        expect(none.warnings).toEqual([]);
      }
      await withWeekHours(async () => {
        const closed = await check({ validDays: ["SUNDAY", "MONDAY"] });
        expect(closed.warnings).toHaveLength(1);
        expect(closed.warnings[0]!.restaurantId).toBe(restaurantId);
        expect(closed.warnings[0]!.restaurantName.length).toBeGreaterThan(0);
        expect(closed.warnings[0]!.message).toMatch(/closed/i);
        expect(closed.warnings[0]!.message).toContain("Sun");

        const early = await check({
          validDays: ["MONDAY"],
          validTimeStart: "09:00",
          validTimeEnd: "12:00",
        });
        expect(early.warnings).toHaveLength(1);
        expect(early.warnings[0]!.message).toContain("Mon");

        const anyTime = await check({});
        expect(anyTime.warnings.map((w) => w.message).join(" ")).toContain(
          "Sun"
        );

        const bad = await getDealScheduleCheckRaw(token, restaurantId, {
          validDays: ["FUNDAY"],
        });
        expect(bad.status).toBe(400);
        expect(msg(bad.data)).toBe("Choose valid days of the week.");
      });
    });

    test("TC-522: schedule-check does NOT warn when a window starts inside business hours — even when it runs past closing, or is an overnight window inside an overnight day", async () => {
      await withWeekHours(async () => {
        expect(
          (
            await check({
              validDays: ["MONDAY"],
              validTimeStart: "20:00",
              validTimeEnd: "23:00",
            })
          ).warnings,
          "runs past the 21:00 close but starts while open"
        ).toEqual([]);
        expect(
          (
            await check({
              validDays: ["FRIDAY"],
              validTimeStart: "22:00",
              validTimeEnd: "01:00",
            })
          ).warnings,
          "overnight inside Friday's 11:00–02:00"
        ).toEqual([]);
        expect(
          (
            await check({
              validDays: ["MONDAY", "TUESDAY"],
              validTimeStart: "12:00",
              validTimeEnd: "14:00",
            })
          ).warnings
        ).toEqual([]);
      });
    });
  });

  // ── The 10-active cap (RestauNax #618: also enforced on create + PUT) ────────
  //
  // The per-test afterEach deletes each test's deals, so every cap test starts
  // from a CLEAN tenant — settleAtTen fills 0 → 10 deterministically, and the
  // "10 active + 1 inactive candidate" state is built without ever trying to
  // create an 11th ACTIVE deal (which the create-cap now refuses).
  test.describe("MAX_ACTIVE_DEALS", () => {
    const activeCount = async () =>
      (await getActiveDealsCountRaw(token, restaurantId)).data
        .activeDealsCount ?? 0;
    const capDeal = async (label: string) => {
      const d = await createDealApi(
        token,
        restaurantId,
        `AUTO Cap ${label} ${runId}`,
        9,
        [
          { id: itemA.id, name: itemA.name, price: itemA.price },
          { id: itemB.id, name: itemB.name, price: itemB.price },
        ]
      );
      track(d.id);
      return d;
    };
    /** From a clean tenant, create exactly 10 ACTIVE deals. */
    const fillToTen = async () => {
      for (let i = 0; i < 10; i++) await capDeal(`#${i + 1}`);
      expect(await activeCount()).toBe(10);
    };
    /**
     * 10 ACTIVE deals + one INACTIVE candidate, built without ever holding 11
     * active at once (create is capped): 9 active → candidate (10th) →
     * deactivate candidate (9) → one more (10). Returns the candidate.
     */
    const tenPlusInactiveCandidate = async (): Promise<ApiDeal> => {
      for (let i = 0; i < 9; i++) await capDeal(`#${i + 1}`);
      const candidate = await capDeal("cand");
      expect(
        (await setDealStatusRaw(token, candidate.id, "INACTIVE")).status
      ).toBe(200);
      await capDeal("#10");
      expect(await activeCount()).toBe(10);
      return candidate;
    };

    test("TC-335: active-count contract; PATCH → ACTIVE at 10/10 is refused with MAX_ACTIVE_DEALS_REACHED", async () => {
      await allure.description(
        "Clean tenant → active-count {activeDealsCount:0, maxActiveDeals:10, slotsAvailable:10}. Ten ACTIVE " +
          "deals plus one INACTIVE candidate are built; PATCH-ing the candidate to ACTIVE returns 400 " +
          "{error:'MAX_ACTIVE_DEALS_REACHED', maxActiveDeals:10, currentActiveDeals:10} with the i18n message " +
          "the dashboard shows as a warning snackbar. Freeing a slot lets it through."
      );
      const zero = await getActiveDealsCountRaw(token, restaurantId);
      expect(zero.status).toBe(200);
      expect(zero.data).toMatchObject({
        activeDealsCount: 0,
        maxActiveDeals: 10,
        slotsAvailable: 10,
      });
      const candidate = await tenPlusInactiveCandidate();
      expect(
        (await getActiveDealsCountRaw(token, restaurantId)).data
      ).toMatchObject({ activeDealsCount: 10, slotsAvailable: 0 });
      const on = await setDealStatusRaw(token, candidate.id, "ACTIVE");
      expect(on.status).toBe(400);
      expect(on.data.error).toBe("MAX_ACTIVE_DEALS_REACHED");
      expect(on.data.maxActiveDeals).toBe(10);
      expect(on.data.currentActiveDeals).toBe(10);
      expect(on.data.message).toBe(
        "You can only have 10 active deals at a time. Please deactivate another deal before activating this one."
      );
      // Freeing a slot (any other ACTIVE deal) lets the candidate through.
      const someActive = (await getRestaurantDeals(token, restaurantId)).find(
        (d) => d.status === "ACTIVE" && d.id !== candidate.id
      )!;
      expect(
        (await setDealStatusRaw(token, someActive.id, "INACTIVE")).status
      ).toBe(200);
      expect(
        (await setDealStatusRaw(token, candidate.id, "ACTIVE")).status
      ).toBe(200);
    });

    test("TC-334: creating an 11th ACTIVE deal at the cap is refused (RestauNax #618)", async () => {
      await allure.description(
        "The product rule is at most 10 active deals; since #618 the create path enforces it too (it used to " +
          "only guard PATCH /status). Clean tenant → 10 ACTIVE → POST an 11th → 400 MAX_ACTIVE_DEALS_REACHED."
      );
      await fillToTen();
      const res = await createDealRaw(token, restaurantId, {
        name: `AUTO Cap overflow ${runId}`,
        dealPrice: 9,
        items: [
          {
            menuItemId: itemA.id,
            quantity: 1,
            itemName: itemA.name,
            itemPrice: 10,
          },
          {
            menuItemId: itemB.id,
            quantity: 1,
            itemName: itemB.name,
            itemPrice: 6.5,
          },
        ],
      });
      if (res.data?.deal?.id) track(res.data.deal.id);
      expect(res.status, JSON.stringify(res.data)).toBe(400);
      expect(res.data as { error?: string }).toMatchObject({
        error: "MAX_ACTIVE_DEALS_REACHED",
      });
    });

    test("TC-335b: PUT /:dealId {status:'ACTIVE'} at the cap is refused (RestauNax #618)", async () => {
      await allure.description(
        "updateDeal now runs the same cap check — an INACTIVE deal can't be activated past the cap through " +
          "PUT. 10 active + 1 inactive candidate → PUT {status:'ACTIVE'} → 400."
      );
      const candidate = await tenPlusInactiveCandidate();
      const res = await updateDealRaw(token, candidate.id, {
        status: "ACTIVE",
      });
      expect(res.status, JSON.stringify(res.data)).toBe(400);
      expect(res.data as { error?: string }).toMatchObject({
        error: "MAX_ACTIVE_DEALS_REACHED",
      });
    });
  });

  test("TC-336: PUT /:dealId re-applies create's validation — price > 0, HH:MM (RestauNax #618)", async () => {
    await allure.description(
      "updateDeal used to skip all of createDeal's validation, so dealPrice 0/negative and a malformed " +
        "validTimeStart were accepted (and a 0 price flowed into the pricing engine as the charge). Since " +
        "#618 the patch is validated against the merged row with the same messages/status codes as create."
    );
    const deal = await seedDeal("Unvalidated", 12, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const zero = await updateDealRaw(token, deal.id, { dealPrice: 0 });
    expect(zero.status, `price 0: ${JSON.stringify(zero.data)}`).toBe(400);
    expect(msg(zero.data)).toBe("Deal price must be greater than 0");
    const badTime = await updateDealRaw(token, deal.id, {
      validTimeStart: "9am",
    });
    expect(badTime.status, `time 9am: ${JSON.stringify(badTime.data)}`).toBe(
      400
    );
    // The deal was never mutated by the rejected patches.
    expect((await getDealApi(token, deal.id)).dealPrice).toBe(12);
  });

  // ── What the customer is charged (public /quote) ───────────────────────────

  test("TC-337: /quote charges dealPrice × quantity (+ savings reported) and ignores the client's dealPrice", async () => {
    await allure.description(
      "POST /api/order/:id/quote with the legacy checkout body template-wind sends. quote.deals[0] = " +
        "{dealPrice 12, quantity 2, upcharge 0, lineTotal 24, savings 9}; dealsSubtotal 24 = subtotal. A " +
        "tampered client dealPrice (0.01) changes nothing — server-authoritative pricing."
    );
    const deal = await seedDeal("Quote", 12, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const body = {
      orderItems: [],
      orderDeals: [
        {
          dealId: deal.id,
          dealName: deal.name,
          dealPrice: 0.01,
          quantity: 2,
          upchargeAmount: 0,
          items: [
            { menuItemId: itemA.id, quantity: 1 },
            { menuItemId: itemB.id, quantity: 1 },
          ],
        },
      ],
    };
    const q = await quoteOrderRaw(restaurantId, body);
    expect(q.status, JSON.stringify(q.data)).toBe(200);
    const quote = q.data.quote!;
    expect(quote.deals).toHaveLength(1);
    expect(quote.deals![0]).toMatchObject({
      dealId: deal.id,
      dealPrice: 12,
      quantity: 2,
      upcharge: 0,
      lineTotal: 24,
      savings: 9,
    });
    expect(quote.dealsSubtotal).toBe(24);
    expect(quote.itemsSubtotal).toBe(0);
    expect(quote.subtotal).toBe(24);
    expect(quote.couponDiscount ?? 0).toBe(0);
    expect((q.data.issues ?? []).filter((i) => i.severity === "ERROR")).toEqual(
      []
    );
  });

  test("TC-338: /quote modifier upcharge — ADJUSTS_PRICE at full price, REPLACES_PRICE as the delta above the default, downgrade clamped to 0", async () => {
    await allure.description(
      "Deal = Pizza (12, Size REPLACES: Regular 12 default / Large 15 / Small 10; Extras ADJUSTS: Cheese 2, " +
        "Bacon 3) + Drink (4) at 14. Regular + Bacon → upcharge 3; Large + Cheese → 3 + 2 = 5; Small → 0 " +
        "(downgrades never refund). lineTotal = 14 + upcharge. Client upchargeAmount is ignored when " +
        "modifier ids are sent."
    );
    const detail = await getMenuItemApi(token, itemMods.id);
    const size = detail.modifierGroups!.find((g) => g.name === "Size")!;
    const extras = detail.modifierGroups!.find((g) => g.name === "Extras")!;
    const mod = (g: typeof size, n: string) =>
      g.modifiers.find((m) => m.name === n)!.id;
    const deal = await seedDeal("Upcharge", 14, [
      { id: itemMods.id, name: itemMods.name, price: 12 },
      { id: itemC.id, name: itemC.name, price: 4 },
    ]);
    const quoteWith = async (
      mods: { modifierId: string; quantity?: number }[]
    ) => {
      const q = await quoteOrderRaw(restaurantId, {
        orderItems: [],
        orderDeals: [
          {
            dealId: deal.id,
            quantity: 1,
            upchargeAmount: 99, // must be ignored
            items: [
              { menuItemId: itemMods.id, quantity: 1, selectedModifiers: mods },
              { menuItemId: itemC.id, quantity: 1 },
            ],
          },
        ],
      });
      expect(q.status, JSON.stringify(q.data)).toBe(200);
      return q.data.quote!.deals![0]!;
    };
    const regularBacon = await quoteWith([
      { modifierId: mod(size, "Regular") },
      { modifierId: mod(extras, "Bacon") },
    ]);
    expect(regularBacon.upcharge).toBe(3);
    expect(regularBacon.lineTotal).toBe(17);
    const largeCheese = await quoteWith([
      { modifierId: mod(size, "Large") },
      { modifierId: mod(extras, "Extra Cheese") },
    ]);
    expect(largeCheese.upcharge).toBe(5);
    expect(largeCheese.lineTotal).toBe(19);
    const small = await quoteWith([{ modifierId: mod(size, "Small") }]);
    expect(small.upcharge).toBe(0);
    expect(small.lineTotal).toBe(14);
    const doubleCheese = await quoteWith([
      { modifierId: mod(extras, "Extra Cheese"), quantity: 2 },
    ]);
    expect(doubleCheese.upcharge).toBe(4);
  });

  test("TC-339: /quote rejects a deal from another restaurant and an INACTIVE deal with the customer-facing messages", async () => {
    const deal = await seedDeal("Foreign", 12, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const body = {
      orderItems: [],
      orderDeals: [
        {
          dealId: deal.id,
          quantity: 1,
          items: [
            { menuItemId: itemA.id, quantity: 1 },
            { menuItemId: itemB.id, quantity: 1 },
          ],
        },
      ],
    };
    const foreign = await quoteOrderRaw(seedRestaurantId, body);
    expect(foreign.status).toBe(400);
    expect(msg(foreign.data)).toBe(
      "One of the deals in your cart is no longer available."
    );
    await setDealStatusRaw(token, deal.id, "INACTIVE");
    const inactive = await quoteOrderRaw(restaurantId, body);
    expect(inactive.status).toBe(400);
    expect(msg(inactive.data)).toBe(
      "One of the deals in your cart is not currently available."
    );
  });

  test("TC-343: the pricing engine enforces Coupon ⊥ deal — a coupon on an order with a deal is priced at 0 (RestauNax #619)", async () => {
    await allure.description(
      "COUPON_RULES_AND_FREE_DELIVERY.md: 'a coupon and a deal cannot both apply to one order … the engine " +
        "never prices both'. #619 (product decision: option A) makes the engine enforce it for every client " +
        "(not just template-wind): /quote with a deal + a % coupon returns couponDiscount 0 and a " +
        "coupon_deal_exclusive ERROR issue."
    );
    const deal = await seedDeal("CouponStack", 20, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const code = `AUTODEAL${runId.toUpperCase()}`;
    const c = await createCouponRaw(token, restaurantId, {
      code,
      type: "PERCENTAGE",
      value: 10,
      startDate: daysFromNowIso(-1),
      endDate: daysFromNowIso(30),
      status: "ACTIVE",
    });
    expect(c.ok, JSON.stringify(c.data)).toBe(true);
    const couponId = (c.data as { coupon?: { id?: string } })?.coupon?.id;
    try {
      const q = await quoteOrderRaw(restaurantId, {
        orderItems: [],
        orderDeals: [
          {
            dealId: deal.id,
            quantity: 1,
            items: [
              { menuItemId: itemA.id, quantity: 1 },
              { menuItemId: itemB.id, quantity: 1 },
            ],
          },
        ],
        couponId,
      });
      expect(q.status, JSON.stringify(q.data)).toBe(200);
      const hasErrorIssue = (q.data.issues ?? []).some(
        (i) => i.severity === "ERROR"
      );
      expect(
        (q.data.quote?.couponDiscount ?? 0) === 0 || hasErrorIssue,
        `couponDiscount=${q.data.quote?.couponDiscount} issues=${JSON.stringify(q.data.issues)}`
      ).toBe(true);
    } finally {
      if (couponId) await deleteCouponApi(token, couponId).catch(() => {});
    }
  });

  // ── Stats, bulk, AI questions ──────────────────────────────────────────────

  test("TC-340: /stats summary counts move with seeded deals; shape of topDeals/usageTrend/audienceDistribution", async () => {
    await allure.description(
      "GET /api/deals/restaurant/:id/stats is what Deal Analytics renders. Delta assertion: +1 ACTIVE and " +
        "+1 INACTIVE deal → totalCount +2, activeCount +1; a validDays-restricted ACTIVE deal still counts as " +
        "active (activeCount is status + endDate only). Fresh deals add 0 timesUsed / revenue."
    );
    const before = await getDealStatsRaw(token, restaurantId);
    expect(before.status).toBe(200);
    const s0 = before.data.summary!;
    expect(s0).toEqual(
      expect.objectContaining({
        totalCount: expect.any(Number),
        activeCount: expect.any(Number),
        totalTimesUsed: expect.any(Number),
        totalRevenue: expect.any(Number),
        totalSavingsGiven: expect.any(Number),
        averageOrderValueWithDeals: expect.any(Number),
      })
    );
    expect(Array.isArray(before.data.topDeals)).toBe(true);
    expect(Array.isArray(before.data.usageTrend)).toBe(true);
    expect(Array.isArray(before.data.audienceDistribution)).toBe(true);
    const two = [itemA, itemB].map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
    }));
    const a = await seedDeal("StatsA", 12, two, { validDays: [farDay()] });
    const b = await seedDeal("StatsB", 12, two);
    await setDealStatusRaw(token, b.id, "INACTIVE");
    const after = await getDealStatsRaw(token, restaurantId);
    const s1 = after.data.summary!;
    expect(s1.totalCount).toBe(s0.totalCount + 2);
    expect(s1.activeCount).toBe(s0.activeCount + 1);
    expect(s1.totalTimesUsed).toBe(s0.totalTimesUsed);
    expect(round2(s1.totalRevenue)).toBe(round2(s0.totalRevenue));
    expect(after.data.topDeals!.some((d) => d.id === a.id)).toBe(false);
    // Audience distribution buckets null audience as "Not specified".
    expect(
      after.data.audienceDistribution!.some((x) => x.name === "Not specified")
    ).toBe(true);
  });

  test("TC-341: bulk create — [] is 400; two deals → 201 with counts; aiGenerated:false honoured (RestauNax #618)", async () => {
    const empty = await bulkCreateDealsRaw(token, restaurantId, []);
    expect(empty.status).toBe(400);
    expect(msg(empty.data)).toBe("No deals provided");
    const two = [itemA, itemB].map((i) => ({
      menuItemId: i.id,
      quantity: 1,
      itemName: i.name,
      itemPrice: i.price,
    }));
    const res = await bulkCreateDealsRaw(token, restaurantId, [
      { name: `AUTO Bulk 1 ${runId}`, dealPrice: 11, items: two },
      {
        name: `AUTO Bulk 2 ${runId}`,
        dealPrice: 12,
        items: two,
        aiGenerated: false,
      },
    ]);
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    for (const d of res.data.deals ?? []) track(d.id);
    expect(res.data.createdCount).toBe(2);
    expect(res.data.maxActiveDeals).toBe(10);
    expect((res.data.enabledCount ?? 0) + (res.data.inactiveCount ?? 0)).toBe(
      2
    );
    const list = await getRestaurantDeals(token, restaurantId);
    const bulk2 = list.find((d) => d.name === `AUTO Bulk 2 ${runId}`)!;
    expect(bulk2).toBeTruthy();
    expect(bulk2.dealPrice).toBe(12);
    await allure.step(
      "aiGenerated:false is stored as false (RestauNax #618: `|| true` → `?? false`)",
      async () => {
        expect(bulk2.aiGenerated).toBe(false);
      }
    );
  });

  test("TC-342: public GET /ai/questions is a static questionnaire (no AI call) with the four question ids", async () => {
    await allure.description(
      "The AI Deal Generator's step 0 is served by this unauthenticated, static endpoint. The paid " +
        "POST /ai/generate/:id is deliberately never called by the suite."
    );
    const res = await getAiDealQuestionsPublic();
    expect(res.status).toBe(200);
    const ids = (res.data.questions ?? []).map((q) => q.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "targetAudience",
        "priceRange",
        "mealType",
        "occasion",
      ])
    );
    for (const q of res.data.questions ?? []) {
      expect(typeof q.question).toBe("string");
      expect((q.options ?? []).length).toBeGreaterThan(0);
    }
  });

  // ── Guided deal types (restaunax DEAL_TYPES.md) ────────────────────────────
  //
  // Prices: itemA 10.00, itemB 6.50, itemC 4.00 — every expected dealPrice is
  // what Service/deal/dealTypePricing.ts computes from the MENU's prices.

  test.describe("guided deal types", () => {
    /** EN text of error:deal.type.* (restaunax-backend/src/locales/en/error.json). */
    const TYPE_ERRORS = {
      invalidType: "Choose a valid deal type.",
      invalidRole:
        "Each item must be marked as something the customer buys or something they get.",
      comboNeedsTwoItems:
        "A combo needs at least 2 items. You can add the same item twice.",
      bogoNeedsBuyAndGet:
        "Add at least one item the customer buys and one item they get.",
      discountPercentRange: "Enter a discount between 1% and 99%.",
      priceMustBeBelowRegular:
        "The deal price must be lower than the items' regular price.",
    };
    /** One unit row of a real seed item (price = its real price). */
    const row = (
      item: ApiMenuItem,
      role?: "INCLUDED" | "BUY" | "GET",
      itemPrice = item.price
    ) => ({
      menuItemId: item.id,
      quantity: 1,
      itemName: item.name,
      itemPrice,
      ...(role ? { role } : {}),
    });
    /** Create, track for cleanup, assert 201 and return the deal. */
    const create = async (body: Record<string, unknown>): Promise<ApiDeal> => {
      const res = await createDealRaw(token, restaurantId, body);
      if (res.data?.deal?.id) track(res.data.deal.id);
      expect(res.status, JSON.stringify(res.data)).toBe(201);
      return res.data.deal!;
    };
    const roles = (d: ApiDeal) =>
      (d.items ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => i.role);

    test.beforeEach(async () => {
      await allure.label("feature", "Deals API Contract — guided deal types");
    });

    test("TC-691: BOGO_FREE of one item — no dealPrice needed; the server prices it at 1× the item and stores a BUY and a GET row", async () => {
      await allure.description(
        "POST {dealType BOGO_FREE, items [Burger BUY, Burger GET]} with NO dealPrice → 201, dealPrice 10 " +
          "(sum of BUY rows; GET free), originalPrice 20, savings 10 (50%), discountPercent null, two qty-1 rows " +
          "with roles BUY then GET — and the GET /:id read-back carries the same type and roles."
      );
      const deal = await create({
        name: `AUTO BOGO Free ${runId}`,
        dealType: "BOGO_FREE",
        items: [row(itemA, "BUY"), row(itemA, "GET")],
      });
      expect(deal).toMatchObject({
        dealType: "BOGO_FREE",
        discountPercent: null,
        dealPrice: 10,
        originalPrice: 20,
        savingsAmount: 10,
        savingsPercentage: 50,
      });
      expect(deal.items).toHaveLength(2);
      expect(deal.items!.every((i) => i.menuItemId === itemA.id)).toBe(true);
      expect(deal.items!.every((i) => i.quantity === 1)).toBe(true);
      expect(roles(deal)).toEqual(["BUY", "GET"]);
      const back = await getDealApi(token, deal.id);
      expect(back.dealType).toBe("BOGO_FREE");
      expect(roles(back)).toEqual(["BUY", "GET"]);
    });

    test("TC-692: BOGO_PERCENT_OFF 50% — BUY full price + GET at half; discountPercent persisted", async () => {
      await allure.description(
        "Buy a Burger (10), get Fries (6.50) at 50% off → dealPrice 10 + 3.25 = 13.25, originalPrice 16.50, " +
          "savings 3.25, discountPercent 50, roles [BUY, GET]."
      );
      const deal = await create({
        name: `AUTO BOGO Half ${runId}`,
        dealType: "BOGO_PERCENT_OFF",
        discountPercent: 50,
        items: [row(itemA, "BUY"), row(itemB, "GET")],
      });
      expect(deal).toMatchObject({
        dealType: "BOGO_PERCENT_OFF",
        discountPercent: 50,
        dealPrice: 13.25,
        originalPrice: 16.5,
        savingsAmount: 3.25,
      });
      expect(roles(deal)).toEqual(["BUY", "GET"]);
    });

    test("TC-693: PERCENT_OFF on a single item is a valid deal — 25% off the Burger costs 7.50, one INCLUDED row", async () => {
      await allure.description(
        "PERCENT_OFF needs one item or more (a COMBO needs two). Burger 10 at 25% off → dealPrice 7.50, " +
          "originalPrice 10, savings 2.50, discountPercent 25, a single INCLUDED row."
      );
      const deal = await create({
        name: `AUTO Pct Single ${runId}`,
        dealType: "PERCENT_OFF",
        discountPercent: 25,
        items: [row(itemA)],
      });
      expect(deal).toMatchObject({
        dealType: "PERCENT_OFF",
        discountPercent: 25,
        dealPrice: 7.5,
        originalPrice: 10,
        savingsAmount: 2.5,
      });
      expect(roles(deal)).toEqual(["INCLUDED"]);
    });

    test("TC-694: the client's dealPrice is ignored for computed types, and a client itemPrice never reaches originalPrice (re-read from the menu)", async () => {
      await allure.description(
        "Server-authoritative money: BOGO_FREE sent with dealPrice 1 is stored at 10; PERCENT_OFF 10% sent with " +
          "dealPrice 999 is stored at 9. A COMBO whose rows claim itemPrice 99 / 50 is snapshotted at the menu's " +
          "10 / 6.50 — originalPrice 16.50, not 149 — so the advertised savings can't be inflated. "
      );
      const bogo = await create({
        name: `AUTO BOGO Tamper ${runId}`,
        dealType: "BOGO_FREE",
        dealPrice: 1,
        items: [row(itemA, "BUY"), row(itemA, "GET")],
      });
      expect(bogo.dealPrice).toBe(10);
      const pct = await create({
        name: `AUTO Pct Tamper ${runId}`,
        dealType: "PERCENT_OFF",
        discountPercent: 10,
        dealPrice: 999,
        items: [row(itemA)],
      });
      expect(pct.dealPrice).toBe(9);
      const combo = await create({
        name: `AUTO Combo Snapshot ${runId}`,
        dealPrice: 12,
        items: [row(itemA, undefined, 99), row(itemB, undefined, 50)],
      });
      expect(combo.originalPrice).toBe(16.5);
      expect(combo.savingsAmount).toBe(4.5);
      expect(
        Object.fromEntries(
          (combo.items ?? []).map((i) => [i.menuItemId, i.itemPrice])
        )
      ).toEqual({ [itemA.id]: 10, [itemB.id]: 6.5 });
    });

    test("TC-695: shapes that don't fit their type are 400 with the deal.type.* messages, and nothing is written", async () => {
      await allure.description(
        "invalidType (dealType 'BUNDLE'); invalidRole (a BOGO row without a role / a COMBO row marked BUY); " +
          "bogoNeedsBuyAndGet (BUY only); discountPercentRange (missing, 0, 100, 12.5); comboNeedsTwoItems " +
          "(ONE unit — previously accepted by the API); priceMustBeBelowRegular (combo at exactly and above " +
          "16.50)."
      );
      const before = (await getRestaurantDeals(token, restaurantId)).length;
      const cases: [string, Record<string, unknown>, string][] = [
        [
          "unknown type",
          { dealType: "BUNDLE", dealPrice: 9, items: [row(itemA), row(itemB)] },
          TYPE_ERRORS.invalidType,
        ],
        [
          "BOGO row without a role",
          { dealType: "BOGO_FREE", items: [row(itemA, "BUY"), row(itemA)] },
          TYPE_ERRORS.invalidRole,
        ],
        [
          "COMBO row marked BUY",
          { dealPrice: 9, items: [row(itemA, "BUY"), row(itemB)] },
          TYPE_ERRORS.invalidRole,
        ],
        [
          "BOGO with only BUY rows",
          {
            dealType: "BOGO_FREE",
            items: [row(itemA, "BUY"), row(itemB, "BUY")],
          },
          TYPE_ERRORS.bogoNeedsBuyAndGet,
        ],
        [
          "percent missing",
          { dealType: "PERCENT_OFF", items: [row(itemA)] },
          TYPE_ERRORS.discountPercentRange,
        ],
        [
          "percent 0",
          { dealType: "PERCENT_OFF", discountPercent: 0, items: [row(itemA)] },
          TYPE_ERRORS.discountPercentRange,
        ],
        [
          "percent 100",
          {
            dealType: "BOGO_PERCENT_OFF",
            discountPercent: 100,
            items: [row(itemA, "BUY"), row(itemB, "GET")],
          },
          TYPE_ERRORS.discountPercentRange,
        ],
        [
          "percent 12.5",
          {
            dealType: "PERCENT_OFF",
            discountPercent: 12.5,
            items: [row(itemA)],
          },
          TYPE_ERRORS.discountPercentRange,
        ],
        [
          "combo of one unit",
          { dealPrice: 8, items: [row(itemA)] },
          TYPE_ERRORS.comboNeedsTwoItems,
        ],
        [
          "combo at the regular price",
          { dealPrice: 16.5, items: [row(itemA), row(itemB)] },
          TYPE_ERRORS.priceMustBeBelowRegular,
        ],
        [
          "combo above the regular price",
          { dealPrice: 20, items: [row(itemA), row(itemB)] },
          TYPE_ERRORS.priceMustBeBelowRegular,
        ],
      ];
      for (const [label, body, message] of cases) {
        await allure.step(label, async () => {
          const res = await createDealRaw(token, restaurantId, {
            name: `AUTO Bad Type ${runId}`,
            ...body,
          });
          if (res.data?.deal?.id) track(res.data.deal.id);
          expect(res.status, `${label}: ${JSON.stringify(res.data)}`).toBe(400);
          expect(msg(res.data), label).toBe(message);
        });
      }
      expect(
        (await getRestaurantDeals(token, restaurantId)).length,
        "nothing was written"
      ).toBe(before);
    });

    test("TC-696: a COMBO of the same item twice is accepted — as two rows or as quantity 2 — and stored as two unit rows", async () => {
      await allure.description(
        "'2 burgers for $15': two rows of the Burger, or one row with quantity 2 (split server-side), both " +
          "count as two items → 201, two qty-1 INCLUDED rows, originalPrice 20, savings 5."
      );
      for (const [label, items] of [
        ["two rows", [row(itemA), row(itemA)]],
        ["quantity 2", [{ ...row(itemA), quantity: 2 }]],
      ] as const) {
        await allure.step(label, async () => {
          const deal = await create({
            name: `AUTO Two Burgers ${label} ${runId}`,
            dealPrice: 15,
            items,
          });
          expect(deal.dealType).toBe("COMBO");
          expect(deal.items).toHaveLength(2);
          expect(deal.items!.every((i) => i.menuItemId === itemA.id)).toBe(
            true
          );
          expect(deal.items!.every((i) => i.quantity === 1)).toBe(true);
          expect(roles(deal)).toEqual(["INCLUDED", "INCLUDED"]);
          expect(deal.originalPrice).toBe(20);
          expect(deal.savingsAmount).toBe(5);
        });
      }
    });

    test("TC-697: a price-only PUT is re-validated against the stored rows without rewriting them — at/above regular is 400; a valid one keeps every row id; a percent-only PUT reprices a BOGO in place", async () => {
      await allure.description(
        "COMBO Burger + Fries at 12. PUT {dealPrice 16.5} → 400 priceMustBeBelowRegular, price still 12. " +
          "PUT {dealPrice 11} → 200, savings 5.50, and the DealItem ids are UNCHANGED (they are the checkout " +
          "slots open carts point at). BOGO_PERCENT_OFF 50% (Burger BUY, Fries GET) → PUT {discountPercent 20} " +
          "→ dealPrice 10 + 5.20 = 15.20, discountPercent 20, row ids and roles unchanged."
      );
      const combo = await create({
        name: `AUTO Put Combo ${runId}`,
        dealPrice: 12,
        items: [row(itemA), row(itemB)],
      });
      const ids = (d: ApiDeal) => (d.items ?? []).map((i) => i.id).sort();
      const comboIds = ids(await getDealApi(token, combo.id));

      const tooHigh = await updateDealRaw(token, combo.id, { dealPrice: 16.5 });
      expect(tooHigh.status, JSON.stringify(tooHigh.data)).toBe(400);
      expect(msg(tooHigh.data)).toBe(TYPE_ERRORS.priceMustBeBelowRegular);
      expect((await getDealApi(token, combo.id)).dealPrice).toBe(12);

      const ok = await updateDealRaw(token, combo.id, { dealPrice: 11 });
      expect(ok.status, JSON.stringify(ok.data)).toBe(200);
      const after = await getDealApi(token, combo.id);
      expect(after.dealPrice).toBe(11);
      expect(after.savingsAmount).toBe(5.5);
      expect(ids(after), "a price-only PUT never rewrites the rows").toEqual(
        comboIds
      );

      const bogo = await create({
        name: `AUTO Put BOGO ${runId}`,
        dealType: "BOGO_PERCENT_OFF",
        discountPercent: 50,
        items: [row(itemA, "BUY"), row(itemB, "GET")],
      });
      const bogoIds = ids(await getDealApi(token, bogo.id));
      const pct = await updateDealRaw(token, bogo.id, { discountPercent: 20 });
      expect(pct.status, JSON.stringify(pct.data)).toBe(200);
      const repriced = await getDealApi(token, bogo.id);
      expect(repriced).toMatchObject({
        dealType: "BOGO_PERCENT_OFF",
        discountPercent: 20,
        dealPrice: 15.2,
      });
      expect(ids(repriced)).toEqual(bogoIds);
      expect(roles(repriced)).toEqual(["BUY", "GET"]);
    });

    test("TC-698: a legacy create (no dealType, no roles) reads back as a COMBO of INCLUDED rows with no percent", async () => {
      await allure.description(
        "Every client that predates guided deal types (ordering apps, POS, older dashboards) sends no dealType " +
          "and no item roles. That body still creates a deal: dealType COMBO, discountPercent null, every row " +
          "INCLUDED, the owner's dealPrice kept."
      );
      const deal = await create({
        name: `AUTO Legacy ${runId}`,
        dealPrice: 12,
        items: twoBody(),
      });
      expect(deal).toMatchObject({
        dealType: "COMBO",
        discountPercent: null,
        dealPrice: 12,
        originalPrice: 16.5,
      });
      expect(roles(deal)).toEqual(["INCLUDED", "INCLUDED"]);
      const listed = (await getRestaurantDeals(token, restaurantId)).find(
        (d) => d.id === deal.id
      )!;
      expect(listed.dealType).toBe("COMBO");
    });

    test("TC-699: /quote charges a BOGO deal its computed dealPrice — buy a Burger, get a Burger is 10.00, not 20.00", async () => {
      await allure.description(
        "The guided type is still a plain fixed-price deal for checkout: /quote with the BOGO_FREE deal and " +
          "both slots filled with the Burger → quote.deals[0] {dealPrice 10, quantity 1, lineTotal 10, savings 10}, " +
          "dealsSubtotal 10. A client dealPrice (0.01) is ignored."
      );
      const deal = await create({
        name: `AUTO BOGO Quote ${runId}`,
        dealType: "BOGO_FREE",
        items: [row(itemA, "BUY"), row(itemA, "GET")],
      });
      const q = await quoteOrderRaw(restaurantId, {
        orderItems: [],
        orderDeals: [
          {
            dealId: deal.id,
            dealPrice: 0.01,
            quantity: 1,
            items: [
              { menuItemId: itemA.id, quantity: 1 },
              { menuItemId: itemA.id, quantity: 1 },
            ],
          },
        ],
      });
      expect(q.status, JSON.stringify(q.data)).toBe(200);
      expect(q.data.quote?.deals?.[0]).toMatchObject({
        dealId: deal.id,
        dealPrice: 10,
        quantity: 1,
        lineTotal: 10,
        savings: 10,
      });
      expect(q.data.quote?.dealsSubtotal).toBe(10);
    });

    test("TC-700: bulk create (the AI path) prices computed types and reports a type-invalid deal in errors[] without failing the batch", async () => {
      await allure.description(
        "POST /bulk with a BOGO_FREE deal (no dealPrice) and a one-unit COMBO: 201, createdCount 1 — the BOGO " +
          "stored at 10 with BUY/GET rows — and errors [{index 1, error comboNeedsTwoItems}]."
      );
      const res = await bulkCreateDealsRaw(token, restaurantId, [
        {
          name: `AUTO Bulk BOGO ${runId}`,
          dealType: "BOGO_FREE",
          items: [row(itemA, "BUY"), row(itemA, "GET")],
        },
        {
          name: `AUTO Bulk Solo ${runId}`,
          dealPrice: 8,
          items: [row(itemA)],
        },
      ]);
      for (const d of res.data.deals ?? []) track(d.id);
      expect(res.status, JSON.stringify(res.data)).toBe(201);
      expect(res.data.createdCount).toBe(1);
      expect(res.data.errors).toEqual([
        { index: 1, error: TYPE_ERRORS.comboNeedsTwoItems },
      ]);
      const bogo = (await getRestaurantDeals(token, restaurantId)).find(
        (d) => d.name === `AUTO Bulk BOGO ${runId}`
      )!;
      expect(bogo).toMatchObject({ dealType: "BOGO_FREE", dealPrice: 10 });
      expect(roles(bogo)).toEqual(["BUY", "GET"]);
    });

    test("TC-701: public GET /ai/questions adds the optional multi-select 'dealTypes' question with the four types", async () => {
      await allure.description(
        "The AI generator's questionnaire grows a 5th question, id 'dealTypes', type 'multiple', whose option " +
          "values are exactly COMBO / BOGO_FREE / BOGO_PERCENT_OFF / PERCENT_OFF, each with a label and a plain " +
          "description. The four original ids are still there."
      );
      const res = await getAiDealQuestionsPublic();
      expect(res.status).toBe(200);
      const questions = res.data.questions ?? [];
      expect(questions.map((q) => q.id)).toEqual(
        expect.arrayContaining([
          "targetAudience",
          "priceRange",
          "mealType",
          "occasion",
          "dealTypes",
        ])
      );
      const q = questions.find((x) => x.id === "dealTypes")!;
      expect(q.type).toBe("multiple");
      expect(typeof q.question).toBe("string");
      expect((q.options ?? []).map((o) => o.value)).toEqual([
        "COMBO",
        "BOGO_FREE",
        "BOGO_PERCENT_OFF",
        "PERCENT_OFF",
      ]);
      for (const o of q.options ?? []) {
        expect(o.label, o.value).toBeTruthy();
        expect(o.description, o.value).toBeTruthy();
      }
    });

    // ── Slot matching + "buy any X, get one free" (TC-705..687) ─────────────
    test.describe("deal picks must match their slots; buy any pizza, get one free", () => {
      /** EN text — restaunax-backend/src/locales/en/api.json + error.json. */
      const NOT_IN_DEAL =
        "One of the items you picked isn't part of this deal. Please choose from the deal's options.";
      const SLOT_UNFILLED =
        "Please choose all of the items your deal requires.";
      const CATEGORY_NOT_FOR_PERCENT_OFF =
        "Percent off works with specific items. For “any item from a category”, use a combo or buy one get one.";

      // "Any pizza": Small 8 and Large 14 in stock, plus a Slice 5 that is
      // 86'd — the category's "from" price is its cheapest IN-STOCK item (8).
      let pizzaGroupId = "";
      let small: ApiMenuItem;
      let large: ApiMenuItem;
      let slice: ApiMenuItem;

      type Pick = { menuItemId: string; dealItemId?: string };
      /** A category line ("Any pizza") with a BOGO role. */
      const anyPizza = (role: "BUY" | "GET") => ({
        menuGroupId: pizzaGroupId,
        quantity: 1,
        itemName: "Any pizza",
        role,
      });
      /** The deal's stored rows (= the checkout slots). */
      const slotsOf = async (dealId: string) =>
        (await getDealApi(token, dealId)).items ?? [];
      /** /quote ONE bundle of the deal with these picks (one unit each). */
      const quoteDeal = (dealId: string, picks: Pick[], dealPrice?: number) =>
        quoteOrderRaw(restaurantId, {
          orderItems: [],
          orderDeals: [
            {
              dealId,
              quantity: 1,
              ...(dealPrice !== undefined ? { dealPrice } : {}),
              items: picks.map((p) => ({ ...p, quantity: 1 })),
            },
          ],
        });
      /** The storefront checkout body (template-wind shape) for one bundle. */
      const orderBody = (
        deal: ApiDeal,
        picks: { item: ApiMenuItem; dealItemId?: string }[],
        money: { subtotal: number; tax: number; total: number },
        tamper: { dealPrice: number; itemPrice?: number }
      ) => ({
        orderType: "PICKUP",
        ...money,
        deliveryFee: 0,
        tip: 0,
        customerEmail: `deal-slots-${runId}@restaunax-test.com`,
        customerPhone: generateSeedPhone(),
        firstName: "Deal",
        lastName: "Slots",
        orderItems: [],
        orderDeals: [
          {
            dealId: deal.id,
            dealName: deal.name,
            dealPrice: tamper.dealPrice,
            quantity: 1,
            items: picks.map((p) => ({
              ...(p.dealItemId ? { dealItemId: p.dealItemId } : {}),
              menuItemId: p.item.id,
              menuItemName: p.item.name,
              menuItemPrice: tamper.itemPrice ?? p.item.price,
              quantity: 1,
            })),
          },
        ],
      });
      /** Publish + accept orders for the duration of `fn` (unpublished stores refuse every order). */
      const withOpenStore = async (fn: () => Promise<void>) => {
        adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
        const { previous } = await setRestaurantPublishedApi(
          adminToken,
          restaurantId,
          true
        );
        await updateRestaurantSettingsApi(token, restaurantId, {
          acceptingOrders: true,
        });
        try {
          await fn();
        } finally {
          if (!previous)
            await setRestaurantPublishedApi(adminToken, restaurantId, false);
        }
      };

      test.beforeAll(async () => {
        if (!token) return;
        const t = await freshToken();
        pizzaGroupId = (
          await createMenuGroupNamed(t, `Automation Pizza ${runId}`, {
            restaurantId,
          })
        ).id;
        extraGroupIds.push(pizzaGroupId);
        const add = async (name: string, price: number) => {
          const item = await createMenuItemFull(
            t,
            pizzaGroupId,
            `${name} ${runId}`,
            price
          );
          createdItemIds.push(item.id);
          return item;
        };
        small = await add("Small Pizza", 8);
        large = await add("Large Pizza", 14);
        slice = await add("Pizza Slice", 5);
        await setAvailability(t, slice.id, true);
      });

      test.beforeEach(async () => {
        await allure.label(
          "feature",
          "Deals API Contract — slot matching & category BOGO"
        );
      });

      test("TC-705: /quote refuses a pick that isn't its slot's item and a missing pick — with or without dealItemId — and /validate flags the wrong pick", async () => {
        await allure.description(
          "COMBO Burger + Fries at 12. The right picks quote 200 at 12, with slot ids or without (any order). " +
            "Refused with 400 + api:error.pricingDealSelectionNotInDeal: a Drink instead of the Fries (no ids), the " +
            "Drink named into the Fries slot, Burger and Fries named into each other's slots, a third item beside a " +
            "full deal. Refused with 400 + pricingDealSlotUnfilled: the Fries slot empty (with and without ids), no " +
            "picks at all. Public /validate with the Drink in the Fries slot → isValid false with the same sentence. "
        );
        const deal = await create({
          name: `AUTO Slots ${runId}`,
          dealPrice: 12,
          items: [row(itemA), row(itemB)],
        });
        const slots = await slotsOf(deal.id);
        const burgerSlot = slots.find((s) => s.menuItemId === itemA.id)!.id;
        const friesSlot = slots.find((s) => s.menuItemId === itemB.id)!.id;

        for (const [label, picks] of [
          [
            "slot ids",
            [
              { dealItemId: burgerSlot, menuItemId: itemA.id },
              { dealItemId: friesSlot, menuItemId: itemB.id },
            ],
          ],
          [
            "no slot ids, any order",
            [{ menuItemId: itemB.id }, { menuItemId: itemA.id }],
          ],
        ] as [string, Pick[]][]) {
          await allure.step(`accepted: ${label}`, async () => {
            const q = await quoteDeal(deal.id, picks);
            expect(q.status, `${label}: ${JSON.stringify(q.data)}`).toBe(200);
            expect(q.data.quote?.deals?.[0]?.lineTotal).toBe(12);
          });
        }

        const refused: [string, Pick[], string][] = [
          [
            "a Drink instead of the Fries (no slot ids)",
            [{ menuItemId: itemA.id }, { menuItemId: itemC.id }],
            NOT_IN_DEAL,
          ],
          [
            "the Drink named into the Fries slot",
            [
              { dealItemId: burgerSlot, menuItemId: itemA.id },
              { dealItemId: friesSlot, menuItemId: itemC.id },
            ],
            NOT_IN_DEAL,
          ],
          [
            "Burger and Fries in each other's slots",
            [
              { dealItemId: friesSlot, menuItemId: itemA.id },
              { dealItemId: burgerSlot, menuItemId: itemB.id },
            ],
            NOT_IN_DEAL,
          ],
          [
            "a third item beside a full deal",
            [
              { menuItemId: itemA.id },
              { menuItemId: itemB.id },
              { menuItemId: itemC.id },
            ],
            NOT_IN_DEAL,
          ],
          [
            "the Fries slot empty (no slot ids)",
            [{ menuItemId: itemA.id }],
            SLOT_UNFILLED,
          ],
          [
            "the Fries slot empty (slot ids)",
            [{ dealItemId: burgerSlot, menuItemId: itemA.id }],
            SLOT_UNFILLED,
          ],
          ["no picks at all", [], SLOT_UNFILLED],
        ];
        for (const [label, picks, message] of refused) {
          await allure.step(`refused: ${label}`, async () => {
            const q = await quoteDeal(deal.id, picks);
            expect(q.status, `${label}: ${JSON.stringify(q.data)}`).toBe(400);
            expect(msg(q.data), label).toBe(message);
          });
        }

        const v = await validateDealPublic({
          dealId: deal.id,
          restaurantId,
          selectedItems: [
            { dealItemId: burgerSlot, menuItemId: itemA.id, quantity: 1 },
            { dealItemId: friesSlot, menuItemId: itemC.id, quantity: 1 },
          ],
        });
        expect(v.data.isValid, JSON.stringify(v.data)).toBe(false);
        expect(v.data.issues).toContain(NOT_IN_DEAL);
      });

      test("TC-706: placing an order refuses a pick that isn't its slot's item and a missing pick, with the same messages as /quote", async () => {
        await allure.description(
          "POST /api/order/new/restaurantId/:id (the storefront checkout) for a Burger + Fries combo at 12, the " +
            "tenant published + accepting orders for this test only. A Drink in the Fries slot (without and with " +
            "dealItemId) → 400 pricingDealSelectionNotInDeal; the Fries slot empty → 400 pricingDealSlotUnfilled. " +
            "No order is created."
        );
        const deal = await create({
          name: `AUTO Slots Order ${runId}`,
          dealPrice: 12,
          items: [row(itemA), row(itemB)],
        });
        const slots = await slotsOf(deal.id);
        const burgerSlot = slots.find((s) => s.menuItemId === itemA.id)!.id;
        const friesSlot = slots.find((s) => s.menuItemId === itemB.id)!.id;
        const money = { subtotal: 12, tax: 0.96, total: 12.96 };
        const cases: [
          string,
          { item: ApiMenuItem; dealItemId?: string }[],
          string,
        ][] = [
          [
            "a Drink instead of the Fries (no slot ids)",
            [{ item: itemA }, { item: itemC }],
            NOT_IN_DEAL,
          ],
          [
            "the Drink named into the Fries slot",
            [
              { item: itemA, dealItemId: burgerSlot },
              { item: itemC, dealItemId: friesSlot },
            ],
            NOT_IN_DEAL,
          ],
          [
            "the Fries slot empty",
            [{ item: itemA, dealItemId: burgerSlot }],
            SLOT_UNFILLED,
          ],
        ];
        await withOpenStore(async () => {
          for (const [label, picks, message] of cases) {
            await allure.step(label, async () => {
              const res = await placeOrderRaw(
                restaurantId,
                orderBody(deal, picks, money, { dealPrice: 12 })
              );
              expect(res.status, `${label}: ${JSON.stringify(res.data)}`).toBe(
                400
              );
              expect(msg(res.data), label).toBe(message);
            });
          }
        });
      });

      test("TC-707: a BOGO_FREE deal may use a category line for BUY and GET — its stored dealPrice is the 'from' price, the cheapest in-stock item of the category", async () => {
        await allure.description(
          "'Buy any pizza, get one free': BUY = Any pizza, GET = Any pizza (menuGroupId, no menuItemId). The " +
            "category holds Small 8, Large 14 and an 86'd Slice 5 → 201, dealPrice 8 (the cheapest IN-STOCK item — " +
            "the honest 'from' price), originalPrice 16, savings 8; both rows are category rows (menuGroupId set, " +
            "menuItemId null) snapshotted at 8, roles BUY then GET."
        );
        const deal = await create({
          name: `AUTO Any Pizza BOGO ${runId}`,
          dealType: "BOGO_FREE",
          items: [anyPizza("BUY"), anyPizza("GET")],
        });
        expect(deal).toMatchObject({
          dealType: "BOGO_FREE",
          dealPrice: 8,
          originalPrice: 16,
          savingsAmount: 8,
        });
        const rows = await slotsOf(deal.id);
        expect(rows).toHaveLength(2);
        for (const r of rows) {
          expect(r.menuGroupId, "a category row").toBe(pizzaGroupId);
          expect(r.menuItemId ?? null, "no fixed item").toBeNull();
          expect(r.itemPrice, "snapshot = cheapest in-stock pizza").toBe(8);
        }
        expect(roles(deal)).toEqual(["BUY", "GET"]);
      });

      test("TC-708: /quote prices 'buy any pizza, get one free' from the picks — the cheaper pizza is free whichever slot holds it; a pick from another category is refused", async () => {
        await allure.description(
          "Equal-or-lesser-value rule (DEAL_TYPES.md): the GET discount lands on the CHEAPEST pick. Small 8 + " +
            "Large 14 → dealPrice/lineTotal 14, savings 8 — with no slot ids, Large in BUY + Small in GET, AND " +
            "Small in BUY + Large in GET (nobody takes the large pizza free). Two Larges → 14 (savings 14); two " +
            "Smalls → 8. A client dealPrice 0.01 is ignored. A Burger (another category) in the GET slot, or " +
            "beside a Large without ids → 400 pricingDealSelectionNotInDeal."
        );
        const deal = await create({
          name: `AUTO Any Pizza Quote ${runId}`,
          dealType: "BOGO_FREE",
          items: [anyPizza("BUY"), anyPizza("GET")],
        });
        const rows = await slotsOf(deal.id);
        const buy = rows.find((r) => r.role === "BUY")!.id;
        const get = rows.find((r) => r.role === "GET")!.id;
        const charged: [string, Pick[], number, number][] = [
          [
            "Small + Large, no slot ids",
            [{ menuItemId: small.id }, { menuItemId: large.id }],
            14,
            8,
          ],
          [
            "Large bought, Small free",
            [
              { dealItemId: buy, menuItemId: large.id },
              { dealItemId: get, menuItemId: small.id },
            ],
            14,
            8,
          ],
          [
            "Small bought, Large in the free slot — still the Small is free",
            [
              { dealItemId: buy, menuItemId: small.id },
              { dealItemId: get, menuItemId: large.id },
            ],
            14,
            8,
          ],
          [
            "two Larges",
            [
              { dealItemId: buy, menuItemId: large.id },
              { dealItemId: get, menuItemId: large.id },
            ],
            14,
            14,
          ],
          [
            "two Smalls",
            [
              { dealItemId: buy, menuItemId: small.id },
              { dealItemId: get, menuItemId: small.id },
            ],
            8,
            8,
          ],
        ];
        for (const [label, picks, price, savings] of charged) {
          await allure.step(`${label} → ${price}`, async () => {
            const q = await quoteDeal(deal.id, picks, 0.01);
            expect(q.status, `${label}: ${JSON.stringify(q.data)}`).toBe(200);
            expect(q.data.quote?.deals?.[0], label).toMatchObject({
              dealId: deal.id,
              dealPrice: price,
              quantity: 1,
              lineTotal: price,
              savings,
            });
            expect(q.data.quote?.dealsSubtotal, label).toBe(price);
          });
        }
        for (const [label, picks] of [
          [
            "a Burger in the free slot",
            [
              { dealItemId: buy, menuItemId: large.id },
              { dealItemId: get, menuItemId: itemA.id },
            ],
          ],
          [
            "a Burger beside a Large (no slot ids)",
            [{ menuItemId: large.id }, { menuItemId: itemA.id }],
          ],
        ] as [string, Pick[]][]) {
          await allure.step(`refused: ${label}`, async () => {
            const q = await quoteDeal(deal.id, picks);
            expect(q.status, `${label}: ${JSON.stringify(q.data)}`).toBe(400);
            expect(msg(q.data), label).toBe(NOT_IN_DEAL);
          });
        }
      });

      test("TC-709: 'buy any pizza, get one 50% off' — stored at the 'from' price 12; /quote charges the dearer pick + half the cheaper", async () => {
        await allure.description(
          "BOGO_PERCENT_OFF 50 with Any pizza BUY + Any pizza GET → 201, discountPercent 50, dealPrice 8 + 4 = 12 " +
            "(from the cheapest in-stock pizza). /quote: Small in BUY + Large in GET → 14 + 4 = 18 (savings 4, the " +
            "discount lands on the cheaper pizza); two Larges → 14 + 7 = 21."
        );
        const deal = await create({
          name: `AUTO Any Pizza Half ${runId}`,
          dealType: "BOGO_PERCENT_OFF",
          discountPercent: 50,
          items: [anyPizza("BUY"), anyPizza("GET")],
        });
        expect(deal).toMatchObject({
          dealType: "BOGO_PERCENT_OFF",
          discountPercent: 50,
          dealPrice: 12,
          originalPrice: 16,
        });
        const rows = await slotsOf(deal.id);
        const buy = rows.find((r) => r.role === "BUY")!.id;
        const get = rows.find((r) => r.role === "GET")!.id;
        const mixed = await quoteDeal(deal.id, [
          { dealItemId: buy, menuItemId: small.id },
          { dealItemId: get, menuItemId: large.id },
        ]);
        expect(mixed.status, JSON.stringify(mixed.data)).toBe(200);
        expect(mixed.data.quote?.deals?.[0]).toMatchObject({
          dealPrice: 18,
          lineTotal: 18,
          savings: 4,
        });
        const twoLarge = await quoteDeal(deal.id, [
          { dealItemId: buy, menuItemId: large.id },
          { dealItemId: get, menuItemId: large.id },
        ]);
        expect(twoLarge.status, JSON.stringify(twoLarge.data)).toBe(200);
        expect(twoLarge.data.quote?.deals?.[0]).toMatchObject({
          dealPrice: 21,
          lineTotal: 21,
          savings: 7,
        });
      });

      test("TC-710: PERCENT_OFF refuses a category line (deal.type.categoryNotAllowedForPercentOff) and writes nothing; a COMBO with a category line keeps its set price", async () => {
        await allure.description(
          "PERCENT_OFF 20% on [Any pizza] or on [Burger + Any pizza] → 400 with the EN categoryNotAllowedForPercentOff " +
            "sentence, deal count unchanged. Control: a COMBO of Burger + Any pizza at 15 is still accepted " +
            "(dealType COMBO, dealPrice 15 — the owner's set price)."
        );
        const before = (await getRestaurantDeals(token, restaurantId)).length;
        const pizzaLine = {
          menuGroupId: pizzaGroupId,
          quantity: 1,
          itemName: "Any pizza",
        };
        for (const [label, items] of [
          ["a category line alone", [pizzaLine]],
          ["a fixed item + a category line", [row(itemA), pizzaLine]],
        ] as const) {
          await allure.step(label, async () => {
            const res = await createDealRaw(token, restaurantId, {
              name: `AUTO Pct Category ${runId}`,
              dealType: "PERCENT_OFF",
              discountPercent: 20,
              items,
            });
            if (res.data?.deal?.id) track(res.data.deal.id);
            expect(res.status, `${label}: ${JSON.stringify(res.data)}`).toBe(
              400
            );
            expect(msg(res.data), label).toBe(CATEGORY_NOT_FOR_PERCENT_OFF);
          });
        }
        expect(
          (await getRestaurantDeals(token, restaurantId)).length,
          "nothing was written"
        ).toBe(before);
        const combo = await create({
          name: `AUTO Combo Any Pizza ${runId}`,
          dealPrice: 15,
          items: [row(itemA), pizzaLine],
        });
        expect(combo).toMatchObject({ dealType: "COMBO", dealPrice: 15 });
      });

      test("TC-711: a placed order stores the price the server charged — 'buy any pizza, get one free' with Small + Large is OrderDeal.dealPrice 14, not the client's tampered price or the 'from' price", async () => {
        await allure.description(
          "Orders store what the server charged (DEAL_TYPES.md): the storefront body claims dealPrice 0.01 and " +
            "menuItemPrice 0.01 per pick. Placed (tenant published for this test only; money claims = the /quote) → " +
            "owner GET /api/order/:id: orderDeals[0] {dealId, dealPrice 14, quantity 1}, upcharge 0, and the picks' " +
            "menuItemPrice re-read from the menu (Small 8, Large 14). Leaves one INITIALIZED (unpaid) order on the " +
            "throwaway tenant."
        );
        const deal = await create({
          name: `AUTO Any Pizza Order ${runId}`,
          dealType: "BOGO_FREE",
          items: [anyPizza("BUY"), anyPizza("GET")],
        });
        const rows = await slotsOf(deal.id);
        const picks = [
          { item: small, dealItemId: rows.find((r) => r.role === "BUY")!.id },
          { item: large, dealItemId: rows.find((r) => r.role === "GET")!.id },
        ];
        const q = await quoteDeal(
          deal.id,
          picks.map((p) => ({
            dealItemId: p.dealItemId,
            menuItemId: p.item.id,
          }))
        );
        expect(q.status, JSON.stringify(q.data)).toBe(200);
        const quote = q.data.quote!;
        expect(quote.dealsSubtotal).toBe(14);
        await withOpenStore(async () => {
          const placed = await placeOrderRaw(
            restaurantId,
            orderBody(
              deal,
              picks,
              {
                subtotal: quote.subtotal ?? 14,
                tax: quote.tax ?? 0,
                total: quote.total ?? quote.amountToCharge ?? 14,
              },
              { dealPrice: 0.01, itemPrice: 0.01 }
            )
          );
          expect(placed.ok, JSON.stringify(placed.data)).toBe(true);
          const orderId = placed.data.order?.id ?? placed.data.id;
          expect(orderId, JSON.stringify(placed.data)).toBeTruthy();
          const order = await getOrderByIdRaw(token, orderId!);
          expect(order.status, JSON.stringify(order.data)).toBe(200);
          const od = order.data.orderDeals ?? [];
          expect(od).toHaveLength(1);
          expect(od[0]).toMatchObject({
            dealId: deal.id,
            dealPrice: 14,
            quantity: 1,
          });
          expect(od[0]!.upchargeAmount ?? 0).toBe(0);
          expect(
            Object.fromEntries(
              (od[0]!.orderDealItems ?? []).map((i) => [
                i.menuItemId,
                i.menuItemPrice,
              ])
            )
          ).toEqual({ [small.id]: 8, [large.id]: 14 });
        });
      });
    });
  });

  // ── Chain scope ────────────────────────────────────────────────────────────

  test("TC-344: a chain deal (POST /api/chains/:gid/deals) is offered at every member and quoted there, but is not in a member's owner list; non-chain items are refused", async () => {
    test.skip(!chainGroupId, "Automation Chain fixture not available");
    await allure.description(
      "Chain deals live on the RestaurantGroup (Deal.restaurantId XOR restaurantGroupId). Created from " +
        "shared master items → public /active at Loc A AND Loc B lists it, /quote at Loc B charges its " +
        "dealPrice, GET /api/chains/:gid/deals lists it, but GET /api/deals/restaurant/<Loc A> (the owner " +
        "list) does not (restaurantId-scoped). A seed-restaurant (non-chain) item is refused with 400. " +
        "Deleted through the scope-agnostic DELETE /api/deals/:id."
    );
    const sharedGroup = await createMenuGroupNamed(
      seedToken,
      `Automation Deals ${runId}`,
      { groupId: chainGroupId }
    );
    const s1 = await createMenuItemFull(
      seedToken,
      sharedGroup.id,
      `Chain Deal A ${runId}`,
      9
    );
    const s2 = await createMenuItemFull(
      seedToken,
      sharedGroup.id,
      `Chain Deal B ${runId}`,
      6
    );
    let chainDealId = "";
    try {
      const bad = await createChainDealRaw(seedToken, chainGroupId, {
        name: `AUTO Chain Bad ${runId}`,
        dealPrice: 10,
        items: [
          {
            menuItemId: itemA.id,
            quantity: 1,
            itemName: itemA.name,
            itemPrice: 10,
          },
          { menuItemId: s2.id, quantity: 1, itemName: s2.name, itemPrice: 6 },
        ],
      });
      expect(bad.status, JSON.stringify(bad.data)).toBe(400);
      if (bad.data?.deal?.id) chainDealId = bad.data.deal.id;

      const res = await createChainDealRaw(seedToken, chainGroupId, {
        name: `AUTO Chain Deal ${runId}`,
        dealPrice: 12,
        items: [
          { menuItemId: s1.id, quantity: 1, itemName: s1.name, itemPrice: 9 },
          { menuItemId: s2.id, quantity: 1, itemName: s2.name, itemPrice: 6 },
        ],
      });
      expect(res.status, JSON.stringify(res.data)).toBe(201);
      const deal = res.data.deal!;
      chainDealId = deal.id;
      expect(deal.restaurantGroupId).toBe(chainGroupId);
      expect(deal.restaurantId ?? null).toBeNull();
      expect(deal.originalPrice).toBe(15);
      expect(deal.savingsAmount).toBe(3);

      const chainList = await getChainDealsRaw(seedToken, chainGroupId);
      expect(chainList.status).toBe(200);
      expect(chainList.data.deals!.some((d) => d.id === deal.id)).toBe(true);
      const ownerListA = await getRestaurantDeals(seedToken, locA);
      expect(ownerListA.some((d) => d.id === deal.id)).toBe(false);

      for (const loc of [locA, locB]) {
        const pub = await getActiveDealsPublic(loc);
        expect(
          pub.data.deals!.some((d) => d.id === deal.id),
          `chain deal offered at ${loc}`
        ).toBe(true);
      }
      const q = await quoteOrderRaw(locB, {
        orderItems: [],
        orderDeals: [
          {
            dealId: deal.id,
            quantity: 1,
            items: [
              { menuItemId: s1.id, quantity: 1 },
              { menuItemId: s2.id, quantity: 1 },
            ],
          },
        ],
      });
      expect(q.status, JSON.stringify(q.data)).toBe(200);
      expect(q.data.quote?.deals?.[0]?.lineTotal).toBe(12);

      const del = await deleteDealRaw(seedToken, deal.id);
      expect(del.status).toBe(200);
      chainDealId = "";
      const pubAfter = await getActiveDealsPublic(locA);
      expect(pubAfter.data.deals!.some((d) => d.id === deal.id)).toBe(false);
    } finally {
      if (chainDealId)
        await deleteDealApi(seedToken, chainDealId).catch(() => {});
      for (const it of [s1, s2])
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
      await deleteTestMenuGroup(seedToken, sharedGroup.id).catch(() => {});
    }
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  test("TC-346: unauthenticated requests get 401 on every protected deal route", async () => {
    const deal = await seedDeal("Anon", 12, [
      { id: itemA.id, name: itemA.name, price: itemA.price },
      { id: itemB.id, name: itemB.name, price: itemB.price },
    ]);
    const results = await Promise.all([
      getRestaurantDealsRaw(undefined, restaurantId),
      createDealRaw(undefined, restaurantId, {
        name: "x",
        dealPrice: 1,
        items: [],
      }),
      getDealRaw(undefined, deal.id),
      updateDealRaw(undefined, deal.id, { name: "x" }),
      setDealStatusRaw(undefined, deal.id, "INACTIVE"),
      deleteDealRaw(undefined, deal.id),
      getDealStatsRaw(undefined, restaurantId),
      getActiveDealsCountRaw(undefined, restaurantId),
      getDealMenuItemsRaw(undefined, restaurantId),
      bulkCreateDealsRaw(undefined, restaurantId, []),
    ]);
    results.forEach((r, i) => expect(r.status, `route #${i}`).toBe(401));
    // And the deal is untouched.
    const still = await getDealApi(token, deal.id);
    expect(still.name).toBe(deal.name);
    expect(still.status).toBe("ACTIVE");
  });

  test.describe("authorization — another owner (the seed OWNER) against this tenant's deals", () => {
    let other = "";
    let target: ApiDeal;

    test.beforeAll(async () => {
      if (!token) return;
      other = seedToken;
      target = await createDealApi(
        token,
        restaurantId,
        `AUTO Target ${runId}`,
        12,
        [
          { id: itemA.id, name: itemA.name, price: itemA.price },
          { id: itemB.id, name: itemB.name, price: itemB.price },
        ]
      );
      createdDealIds.push(target.id);
    });

    test.beforeEach(async () => {
      other = seedToken;
    });

    test("TC-345: chain routes are the positive control — a non-owner gets 403 on /api/chains/:gid/deals", async () => {
      test.skip(!chainGroupId, "Automation Chain fixture not available");
      // The throwaway tenant's owner is NOT the chain owner.
      const list = await getChainDealsRaw(token, chainGroupId);
      expect(list.status).toBe(403);
      const create = await createChainDealRaw(token, chainGroupId, {
        name: `AUTO Chain Intruder ${runId}`,
        dealPrice: 5,
        items: [],
      });
      expect(create.status).toBe(403);
    });

    test("TC-347: a second owner cannot READ our deals, stats, deal-picker menu or a deal by id (RestauNax #618)", async () => {
      await allure.description(
        "Since #618 every deal handler asserts restaurant/deal ownership (was a global-capability IDOR — the " +
          "seed owner could read a foreign restaurant's deals/stats/menu with 200). The seed owner now gets 403."
      );
      const list = await getRestaurantDealsRaw(other, restaurantId);
      const stats = await getDealStatsRaw(other, restaurantId);
      const menu = await getDealMenuItemsRaw(other, restaurantId);
      const one = await getDealRaw(other, target.id);
      const cnt = await getActiveDealsCountRaw(other, restaurantId);
      for (const [label, r] of [
        ["list", list],
        ["stats", stats],
        ["menu-items", menu],
        ["get by id", one],
        ["active-count", cnt],
      ] as const) {
        expect(r.status, label).toBe(403);
      }
    });

    test("TC-348: a second owner cannot deactivate our deal — PATCH /:dealId/status (RestauNax #618)", async () => {
      const r = await setDealStatusRaw(other, target.id, "INACTIVE");
      expect(r.status, JSON.stringify(r.data)).toBe(403);
      // Untouched: still ACTIVE.
      expect((await getDealApi(token, target.id)).status).toBe("ACTIVE");
    });

    test("TC-349: a second owner cannot edit our deal — PUT /:dealId (RestauNax #618)", async () => {
      const r = await updateDealRaw(other, target.id, {
        name: `AUTO Hijacked ${runId}`,
        dealPrice: 1,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(403);
      // Untouched: name and price unchanged.
      const after = await getDealApi(token, target.id);
      expect(after.name).toBe(target.name);
      expect(after.dealPrice).toBe(12);
    });

    test("TC-350: a second owner cannot create a deal on our restaurant nor delete ours (RestauNax #618)", async () => {
      const created = await createDealRaw(other, restaurantId, {
        name: `AUTO Intruder ${runId}`,
        dealPrice: 5,
        items: [
          {
            menuItemId: itemA.id,
            quantity: 1,
            itemName: itemA.name,
            itemPrice: 10,
          },
          {
            menuItemId: itemB.id,
            quantity: 1,
            itemName: itemB.name,
            itemPrice: 6.5,
          },
        ],
      });
      if (created.data?.deal?.id)
        await deleteDealApi(token, created.data.deal.id).catch(() => {});
      const victim = await createDealApi(
        token,
        restaurantId,
        `AUTO Victim ${runId}`,
        12,
        [
          { id: itemA.id, name: itemA.name, price: itemA.price },
          { id: itemB.id, name: itemB.name, price: itemB.price },
        ]
      );
      createdDealIds.push(victim.id);
      const del = await deleteDealRaw(other, victim.id);
      expect(created.status, `create: ${JSON.stringify(created.data)}`).toBe(
        403
      );
      expect(del.status, `delete: ${JSON.stringify(del.data)}`).toBe(403);
    });
  });
});
