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
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { readSharedState, generateRunId } from "../../../utils/testData";
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
/** "HH:MM" twelve hours away from UTC-now — a 1-minute window that is never "now" on a UTC server. */
const farHHMM = () => {
  const d = new Date(Date.now() + 12 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

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
  let groupId = "";
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
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    for (const id of createdDealIds) await deleteDealApi(t, id).catch(() => {});
    for (const id of createdItemIds)
      await permanentlyDeleteMenuItemApi(adminToken, id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
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
      { endDate: daysFromNowIso(-1) }
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

  test("TC-331: public /active lists only deals that are ACTIVE and inside every window (status, dates, weekday, HH:MM); unknown restaurant → 200 []", async () => {
    await allure.description(
      "GET /api/deals/restaurant/:id/active is what the storefront renders. Six seeded deals: one plain " +
        "(listed, with dealPrice/originalPrice/savings and slot items), one INACTIVE, one endDate yesterday, " +
        "one startDate in 3 days, one validDays = a weekday 3 days from now, one 1-minute validTimeStart=End " +
        "window 12 h away (server-local time) — the five restricted ones are absent. Empty validDays = all " +
        "days; a single-sided time bound is ignored (validTimeStart only → still listed)."
    );
    const two = [itemA, itemB].map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
    }));
    const plain = await seedDeal("Plain", 12, two);
    const inactive = await seedDeal("Inactive", 12, two);
    expect(
      (await setDealStatusRaw(token, inactive.id, "INACTIVE")).status
    ).toBe(200);
    const ended = await seedDeal("Ended", 12, two, {
      endDate: daysFromNowIso(-1),
    });
    const notYet = await seedDeal("NotYet", 12, two, {
      startDate: daysFromNowIso(3),
    });
    const wrongDay = await seedDeal("WrongDay", 12, two, {
      validDays: [farDay()],
    });
    const hhmm = farHHMM();
    const wrongTime = await seedDeal("WrongTime", 12, two, {
      validTimeStart: hhmm,
      validTimeEnd: hhmm,
    });
    const halfWindow = await seedDeal("HalfWindow", 12, two, {
      validTimeStart: hhmm,
    });

    const res = await getActiveDealsPublic(restaurantId);
    expect(res.status).toBe(200);
    const ids = (res.data.deals ?? []).map((d) => d.id);
    expect(ids).toContain(plain.id);
    expect(ids).toContain(halfWindow.id);
    for (const [label, d] of [
      ["INACTIVE", inactive],
      ["endDate past", ended],
      ["startDate future", notYet],
      ["validDays other weekday", wrongDay],
      ["1-minute window 12h away", wrongTime],
    ] as const) {
      expect(ids, `${label} must be hidden`).not.toContain(d.id);
    }
    const shown = res.data.deals!.find((d) => d.id === plain.id)!;
    expect(shown.dealPrice).toBe(12);
    expect(shown.originalPrice).toBe(16.5);
    expect(shown.savingsAmount).toBe(4.5);
    expect(shown.savingsPercentage).toBe(27.3);
    expect(shown.items).toHaveLength(2);
    expect(shown.items!.map((i) => i.menuItemId).sort()).toEqual(
      [itemA.id, itemB.id].sort()
    );
    // /validate explains WHY the restricted ones are hidden — this is the
    // timezone-independent cross-check for the time-window case.
    const v = await validateDealPublic({ dealId: wrongTime.id, restaurantId });
    expect(v.status).toBe(200);
    expect(v.data.isValid).toBe(false);
    expect(v.data.issues).toContain(
      `Deal is only available between ${hhmm} and ${hhmm}`
    );
    const vd = await validateDealPublic({ dealId: wrongDay.id, restaurantId });
    expect(vd.data.isValid).toBe(false);
    expect(
      vd.data.issues?.some((s) => /^Deal is not available on /.test(s))
    ).toBe(true);

    const none = await getActiveDealsPublic(
      "00000000-0000-4000-8000-000000000000"
    );
    expect(none.status).toBe(200);
    expect(none.data.deals).toEqual([]);
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
    expect(inactive.data.issues).toContain("Deal is not active");
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
