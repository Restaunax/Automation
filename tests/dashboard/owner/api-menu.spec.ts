/**
 * api-menu.spec.ts — Owner menu-management API contract (Layer 1).
 *
 * No browser. Hits /menu/* and /upload/menu/* with an owner JWT and asserts
 * the rules the Menu tab, the builder and the chain-menu surfaces depend on:
 * modifier normalisation, soft-delete + blockers, featured cap, per-location
 * overrides (chain), and the authorization pins. See
 * docs/MENU_TAB_TEST_STRATEGY.md §3.5 / §4 (Layer 1) for the inventory.
 *
 * Own data: every group/item here is created under a per-run "Automation Menu
 * <id>" category (seed restaurant) or "Automation Chain Menu <id>" (shared
 * chain master), and HARD-deleted in afterAll via the admin permanent-delete —
 * a soft delete would block the category delete forever (documented debt).
 * globalTeardown sweeps "Automation Menu *" leftovers as a safety net.
 *
 * Chain cases use the persistent "Automation Chain" fixture (globalSetup →
 * ensureAutomationChain) and skip with a reason when it isn't available.
 * Authorization pins (TC-282..287) mint a per-run second OWNER through the
 * admin user API and skip without admin creds.
 */

import * as fs from "fs";
import * as path from "path";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { readSharedState, generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuGroupRaw,
  createMenuItemFull,
  createMenuItemRaw,
  getMenuItemApi,
  getMenuItemRaw,
  getRestaurantMenusApi,
  getRestaurantMenusRaw,
  getPublicMenuItems,
  flattenMenuItems,
  applyMenuItemChangesRaw,
  reorderModifiersRaw,
  setAvailabilityRaw,
  resetGroupAvailabilityRaw,
  setFeaturedRaw,
  setPriceOverrideRaw,
  setLocationPricingRaw,
  setCarriedRaw,
  cloneMenuRaw,
  deleteMenuItemRaw,
  permanentlyDeleteMenuItemRaw,
  permanentlyDeleteMenuItemApi,
  deleteMenuGroupRaw,
  deleteTestMenuGroup,
  uploadMenuItemImageRaw,
  createDealRaw,
  deleteDealApi,
  createSecondOwner,
  deleteTestRestaurant,
  type ApiMenuItem,
  type ApiDeal,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const errorMessage = (body: unknown): string => {
  if (body && typeof body === "object" && "message" in body)
    return String((body as { message: unknown }).message);
  return typeof body === "string" ? body : JSON.stringify(body);
};

const PNG_FIXTURE = path.resolve(
  __dirname,
  "../../../fixtures/assets/menu-item.png"
);

test.describe("Owner — Menu API contract", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  const runId = generateRunId();
  let token = "";
  let adminToken = "";
  let restaurantId = "";
  // Per-run private category on the seed restaurant + the items it holds.
  let groupId = "";
  const createdItemIds: string[] = [];
  // Chain fixture (may be empty → chain cases skip).
  let chainGroupId = "";
  let locA = "";
  let locB = "";
  let sharedGroupId = "";
  const chainItemIds: string[] = [];

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  /** Create an item in the run's private group and remember it for cleanup. */
  const seedItem = async (
    name: string,
    price = 9.5,
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
  /** Same, on the chain's shared master category. */
  const seedChainItem = async (
    name: string,
    price = 12,
    opts: Parameters<typeof createMenuItemFull>[4] = {}
  ): Promise<ApiMenuItem> => {
    const item = await createMenuItemFull(
      token,
      sharedGroupId,
      `${name} ${runId}`,
      price,
      opts
    );
    chainItemIds.push(item.id);
    return item;
  };
  const skipWithoutChain = () =>
    test.skip(
      !chainGroupId,
      "Automation Chain fixture not available (globalSetup could not build it — needs ADMIN creds)"
    );

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const state = readSharedState();
    restaurantId = state.restaurantId;
    chainGroupId = state.chainGroupId ?? "";
    locA = state.chainLocationAId ?? "";
    locB = state.chainLocationBId ?? "";
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    }
    groupId = (
      await createMenuGroupNamed(token, `Automation Menu ${runId}`, {
        restaurantId,
      })
    ).id;
    if (chainGroupId) {
      sharedGroupId = (
        await createMenuGroupNamed(token, `Automation Chain Menu ${runId}`, {
          groupId: chainGroupId,
        })
      ).id;
    }
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    const admin = adminToken
      ? await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)
          .then((r) => r.accessToken)
          .catch(() => adminToken)
      : "";
    for (const id of [...createdItemIds, ...chainItemIds]) {
      if (admin) {
        await permanentlyDeleteMenuItemApi(admin, id).catch(() => {});
      } else {
        await deleteMenuItemRaw(t, id).catch(() => {});
      }
    }
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (sharedGroupId)
      await deleteTestMenuGroup(t, sharedGroupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Menu API Contract");
    await allure.label("severity", "normal");
    token = await freshToken();
  });

  // ── Reads ──────────────────────────────────────────────────────────────────

  test("TC-263: the owner menu read is public, hides soft-deleted items and carries the availability flags", async () => {
    await allure.description(
      "GET /menu/restaurants/:id/menus needs no token (the storefront and the owner UI share it). " +
        "The merged shape is {menus[{groups[{items}]}], chain}; each item exposes outOfStock + featured; " +
        "a soft-deleted item (isActive=false) is NOT listed while GET /menu/itemId/:id still returns it."
    );
    const live = await seedItem("Contract Live");
    const gone = await seedItem("Contract Gone");
    const del = await deleteMenuItemRaw(token, gone.id);
    expect(del.status, errorMessage(del.data)).toBe(200);

    const raw = await getRestaurantMenusRaw(restaurantId);
    expect(raw.status).toBe(200);
    const body = raw.data as { menus?: unknown[]; chain?: unknown };
    expect(Array.isArray(body.menus)).toBe(true);
    expect("chain" in body).toBe(true);

    const items = flattenMenuItems(
      (await getRestaurantMenusApi(restaurantId)).menus
    );
    const liveRow = items.find((i) => i.id === live.id);
    expect(liveRow, "live item listed").toBeTruthy();
    expect(typeof liveRow?.outOfStock).toBe("boolean");
    expect(typeof liveRow?.featured).toBe("boolean");
    expect(
      items.find((i) => i.id === gone.id),
      "soft-deleted item hidden"
    ).toBeUndefined();

    const detail = await getMenuItemRaw(token, gone.id);
    expect(detail.status).toBe(200);
    expect(detail.data.item?.isActive).toBe(false);
  });

  // ── Create / validation / normalisation ────────────────────────────────────

  test("TC-264: creating an item requires price and groupId (name is TC-65)", async () => {
    await allure.description(
      "POST /menu/item/new: missing price → 4xx; missing groupId → 4xx; a valid body returns the created " +
        "menuItem with an id."
    );
    const noPrice = await createMenuItemRaw(token, {
      name: `NoPrice ${runId}`,
      groupId,
    });
    expect(noPrice.status, "no price").toBeGreaterThanOrEqual(400);
    expect(noPrice.status).toBeLessThan(500);
    const noGroup = await createMenuItemRaw(token, {
      name: `NoGroup ${runId}`,
      price: 5,
    });
    expect(noGroup.status, "no groupId").toBeGreaterThanOrEqual(400);
    expect(noGroup.status).toBeLessThan(500);
    const ok = await createMenuItemRaw(token, {
      name: `Valid ${runId}`,
      price: 5,
      groupId,
    });
    expect(ok.status, errorMessage(ok.data)).toBeLessThan(300);
    const id = (ok.data as { menuItem?: { id?: string } }).menuItem?.id;
    expect(id).toBeTruthy();
    if (id) createdItemIds.push(id);
  });

  test("TC-265: modifier normalisation — INCLUDED prices → 0, child groups forced free, one level of nesting", async () => {
    await allure.description(
      "MENU_MODIFIER_SYSTEM.md rules enforced on save: an INCLUDED group stores every option at $0 even " +
        "when the client sends prices; a nested (child) group is forced to INCLUDED/$0 regardless of the " +
        "requested pricing mode; a grandchild group is dropped; sortOrder = submitted array index."
    );
    const item = await seedItem("Normalise", 10, {
      modifierGroups: [
        {
          name: "Size",
          pricingMode: "REPLACES_PRICE",
          minSelections: 1,
          maxSelections: 1,
          modifiers: [
            { name: "Small", price: 10, isDefault: true },
            {
              name: "Large",
              price: 14,
              childModifierGroups: [
                {
                  name: "Free sauces",
                  pricingMode: "ADJUSTS_PRICE", // must be forced to INCLUDED
                  modifiers: [
                    {
                      name: "BBQ",
                      price: 2, // must be stored as 0
                      childModifierGroups: [
                        {
                          name: "Grandchild",
                          pricingMode: "INCLUDED",
                          modifiers: [{ name: "Nope" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: "Remove",
          pricingMode: "INCLUDED",
          modifiers: [
            { name: "No onions", price: 3 },
            { name: "No pickles", price: 1.5 },
          ],
        },
        {
          name: "Extras",
          pricingMode: "ADJUSTS_PRICE",
          modifiers: [{ name: "Cheese", price: 1.5, allowsDuplicates: true }],
        },
      ],
    });
    const detail = await getMenuItemApi(token, item.id);
    const groups = [...(detail.modifierGroups ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    expect(groups.map((g) => g.name)).toEqual(["Size", "Remove", "Extras"]);
    expect(groups.map((g) => g.sortOrder)).toEqual([0, 1, 2]);

    const remove = groups[1]!;
    expect(remove.pricingMode).toBe("INCLUDED");
    expect(remove.modifiers.map((m) => m.price)).toEqual([0, 0]);

    const extras = groups[2]!;
    expect(extras.pricingMode).toBe("ADJUSTS_PRICE");
    expect(extras.modifiers[0]?.price).toBe(1.5);
    expect(extras.modifiers[0]?.allowsDuplicates).toBe(true);

    const size = groups[0]!;
    expect(size.pricingMode).toBe("REPLACES_PRICE");
    const large = size.modifiers.find((m) => m.name === "Large");
    expect(large?.price).toBe(14);
    const child = large?.childModifierGroups?.[0];
    expect(child?.name).toBe("Free sauces");
    expect(child?.pricingMode, "child group forced INCLUDED").toBe("INCLUDED");
    expect(child?.modifiers[0]?.price, "child modifier forced $0").toBe(0);
    expect(
      child?.modifiers[0]?.childModifierGroups ?? [],
      "grandchild group dropped"
    ).toHaveLength(0);
  });

  test("TC-266: the deep-editor diff payload adds, modifies and deletes modifier groups in one call", async () => {
    await allure.description(
      "PUT /menu/menu-items/:id/changes takes {name?, price?, modifierGroups:{deleted[], added[], modified[]}} " +
        "and applies it transactionally; body.menuItemId must equal the path id (400 otherwise)."
    );
    const item = await seedItem("Changes", 8, {
      modifierGroups: [
        { name: "Doomed", pricingMode: "INCLUDED", modifiers: [{ name: "x" }] },
        {
          name: "Keep",
          pricingMode: "ADJUSTS_PRICE",
          minSelections: 0,
          maxSelections: 2,
          modifiers: [{ name: "Bacon", price: 2 }],
        },
      ],
    });
    const before = await getMenuItemApi(token, item.id);
    const doomed = before.modifierGroups!.find((g) => g.name === "Doomed")!;
    const keep = before.modifierGroups!.find((g) => g.name === "Keep")!;

    const mismatch = await applyMenuItemChangesRaw(token, item.id, {
      menuItemId: "not-the-same-id",
      name: "nope",
    });
    expect(mismatch.status, "menuItemId mismatch").toBe(400);

    const res = await applyMenuItemChangesRaw(token, item.id, {
      menuItemId: item.id,
      name: `Changes Edited ${runId}`,
      price: 8.75,
      modifierGroups: {
        deleted: [doomed.id],
        added: [
          {
            name: "Sauce",
            pricingMode: "INCLUDED",
            modifiers: [{ name: "Ranch" }],
          },
        ],
        modified: [
          { id: keep.id, name: "Kept", minSelections: 1, maxSelections: 3 },
        ],
      },
    });
    expect(res.status, errorMessage(res.data)).toBe(200);

    const after = await getMenuItemApi(token, item.id);
    expect(after.name).toBe(`Changes Edited ${runId}`);
    expect(after.price).toBe(8.75);
    const names = (after.modifierGroups ?? []).map((g) => g.name).sort();
    expect(names).toEqual(["Kept", "Sauce"]);
    const kept = after.modifierGroups!.find((g) => g.id === keep.id)!;
    expect(kept.minSelections).toBe(1);
    expect(kept.maxSelections).toBe(3);
    // Added groups append AFTER existing siblings (reordering is a separate endpoint).
    const sauce = after.modifierGroups!.find((g) => g.name === "Sauce")!;
    expect(sauce.sortOrder).toBeGreaterThan(kept.sortOrder);
  });

  test("TC-267: modifier reorder is index-based and ignores foreign ids", async () => {
    await allure.description(
      "PUT /menu/menu-items/:id/modifier-order persists sortOrder = array position at every level; a group " +
        "id that doesn't belong to the item matches zero rows (its own sortOrder is untouched)."
    );
    const item = await seedItem("Reorder", 7, {
      modifierGroups: [
        {
          name: "G1",
          pricingMode: "INCLUDED",
          modifiers: [{ name: "a" }, { name: "b" }],
        },
        { name: "G2", pricingMode: "INCLUDED", modifiers: [{ name: "c" }] },
      ],
    });
    const other = await seedItem("Reorder Other", 7, {
      modifierGroups: [
        {
          name: "Foreign",
          pricingMode: "INCLUDED",
          modifiers: [{ name: "z" }],
        },
      ],
    });
    const d = await getMenuItemApi(token, item.id);
    const g1 = d.modifierGroups!.find((g) => g.name === "G1")!;
    const g2 = d.modifierGroups!.find((g) => g.name === "G2")!;
    const foreign = (await getMenuItemApi(token, other.id)).modifierGroups![0]!;

    const res = await reorderModifiersRaw(token, item.id, [
      { id: g2.id },
      {
        id: g1.id,
        modifiers: [...g1.modifiers].reverse().map((m) => ({ id: m.id })),
      },
      { id: foreign.id },
    ]);
    expect(res.status, errorMessage(res.data)).toBe(200);

    const after = await getMenuItemApi(token, item.id);
    const a1 = after.modifierGroups!.find((g) => g.id === g1.id)!;
    const a2 = after.modifierGroups!.find((g) => g.id === g2.id)!;
    expect(a2.sortOrder).toBe(0);
    expect(a1.sortOrder).toBe(1);
    expect(
      [...a1.modifiers]
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map((m) => m.name)
    ).toEqual(["b", "a"]);
    const foreignAfter = (await getMenuItemApi(token, other.id))
      .modifierGroups![0]!;
    expect(foreignAfter.sortOrder, "foreign group untouched").toBe(
      foreign.sortOrder
    );
  });

  // ── Availability / featured ────────────────────────────────────────────────

  test("TC-268: availability toggle writes MenuItem.outOfStock on a standalone item and requires the flag", async () => {
    await allure.description(
      "PATCH /menu/menu-items/:id/availability {outOfStock} flips the master flag for a standalone " +
        "restaurant's item (visible on the public read); a body without outOfStock is a 400."
    );
    const item = await seedItem("Avail");
    const missing = await setAvailabilityRaw(token, item.id, {});
    expect(missing.status).toBe(400);
    expect(errorMessage(missing.data)).toMatch(/outOfStock/i);

    const off = await setAvailabilityRaw(token, item.id, { outOfStock: true });
    expect(off.status, errorMessage(off.data)).toBe(200);
    let row = flattenMenuItems(
      (await getRestaurantMenusApi(restaurantId)).menus
    ).find((i) => i.id === item.id);
    expect(row?.outOfStock).toBe(true);

    const on = await setAvailabilityRaw(token, item.id, { outOfStock: false });
    expect(on.status).toBe(200);
    row = flattenMenuItems(
      (await getRestaurantMenusApi(restaurantId)).menus
    ).find((i) => i.id === item.id);
    expect(row?.outOfStock).toBe(false);
  });

  test("TC-269: reset-availability restores every out-of-stock item in the group", async () => {
    await allure.description(
      "POST /menu/menu-groups/:gid/reset-availability clears outOfStock for all items of the group; " +
        "calling it on a group with nothing out of stock is a harmless 200."
    );
    const items = await Promise.all([
      seedItem("Reset 1"),
      seedItem("Reset 2"),
      seedItem("Reset 3"),
    ]);
    for (const it of items.slice(0, 2)) {
      expect(
        (await setAvailabilityRaw(token, it.id, { outOfStock: true })).status
      ).toBe(200);
    }
    const res = await resetGroupAvailabilityRaw(token, groupId);
    expect(res.status, errorMessage(res.data)).toBe(200);
    const rows = flattenMenuItems(
      (await getRestaurantMenusApi(restaurantId)).menus
    );
    for (const it of items) {
      expect(rows.find((r) => r.id === it.id)?.outOfStock, it.name).toBe(false);
    }
    expect((await resetGroupAvailabilityRaw(token, groupId)).status).toBe(200);
  });

  test("TC-270: a standalone restaurant can feature at most 5 items", async () => {
    await allure.description(
      "PATCH /menu/menu-items/:id/featured {featured:true} succeeds up to 5 featured items per standalone " +
        "restaurant and rejects the 6th with 'You can only have 5 featured items'; un-featuring one frees " +
        "the slot. Runs on a throwaway second-owner restaurant so the seed restaurant's real featured " +
        "list is never touched."
    );
    test.skip(
      !adminToken,
      "ADMIN creds needed to mint the throwaway restaurant"
    );
    const second = await createSecondOwner(adminToken, `${runId}f`);
    test.skip(!second.restaurantId, "second owner has no restaurant");
    const rid = second.restaurantId!;
    try {
      const g = await createMenuGroupNamed(
        second.accessToken,
        `Automation Menu ${runId}`,
        {
          restaurantId: rid,
        }
      );
      const ids: string[] = [];
      for (let i = 1; i <= 6; i++) {
        ids.push(
          (
            await createMenuItemFull(
              second.accessToken,
              g.id,
              `Feat ${i} ${runId}`,
              5
            )
          ).id
        );
      }
      for (const id of ids.slice(0, 5)) {
        const r = await setFeaturedRaw(second.accessToken, id, true);
        expect(
          r.status,
          `feature #${ids.indexOf(id) + 1}: ${errorMessage(r.data)}`
        ).toBe(200);
      }
      const sixth = await setFeaturedRaw(second.accessToken, ids[5]!, true);
      expect(sixth.status).toBe(400);
      expect(errorMessage(sixth.data)).toMatch(/only have 5 featured/i);
      expect(
        (await setFeaturedRaw(second.accessToken, ids[0]!, false)).status
      ).toBe(200);
      const again = await setFeaturedRaw(second.accessToken, ids[5]!, true);
      expect(again.status, errorMessage(again.data)).toBe(200);
      const rows = flattenMenuItems((await getRestaurantMenusApi(rid)).menus);
      expect(rows.filter((r) => r.featured).length).toBe(5);
    } finally {
      await deleteTestRestaurant(adminToken, rid).catch(() => {});
    }
  });

  // ── Delete rules ───────────────────────────────────────────────────────────

  test("TC-271: item delete is a soft delete; the permanent route is admin-only", async () => {
    await allure.description(
      "DELETE /menu/menuItemId/:id sets isActive=false (row survives, GET /menu/itemId still 200); " +
        "DELETE …/permanent with an owner token → 403; with an admin token → 200 and the item is gone."
    );
    const item = await seedItem("Soft");
    expect((await deleteMenuItemRaw(token, item.id)).status).toBe(200);
    const detail = await getMenuItemRaw(token, item.id);
    expect(detail.status).toBe(200);
    expect(detail.data.item?.isActive).toBe(false);

    const ownerPerm = await permanentlyDeleteMenuItemRaw(token, item.id);
    expect(ownerPerm.status, "owner on /permanent").toBe(403);

    test.skip(!adminToken, "ADMIN creds needed for the permanent-delete half");
    const adminPerm = await permanentlyDeleteMenuItemRaw(adminToken, item.id);
    expect(adminPerm.status, errorMessage(adminPerm.data)).toBe(200);
    expect((await getMenuItemRaw(token, item.id)).status).toBe(404);
    createdItemIds.splice(createdItemIds.indexOf(item.id), 1);
  });

  test("TC-272: an item referenced by an ACTIVE deal cannot be deleted (409 with blockers)", async () => {
    await allure.description(
      "DELETE /menu/menuItemId/:id → 409 {blockers:{deals:[…]}} while an active deal includes the item; " +
        "after the deal is removed the same delete succeeds."
    );
    const item = await seedItem("Dealt", 11);
    const dealRes = await createDealRaw(token, restaurantId, {
      name: `AUTO Deal Blocker ${runId}`,
      description: "Automation delete-blocker deal — safe to delete",
      dealPrice: 9,
      items: [
        {
          menuItemId: item.id,
          quantity: 1,
          itemName: item.name,
          itemPrice: 11,
          isRequired: true,
        },
      ],
    });
    expect(
      dealRes.ok,
      `deal seed failed: ${JSON.stringify(dealRes.data)}`
    ).toBe(true);
    const dealId = (dealRes.data as { deal: ApiDeal }).deal.id;
    try {
      const blocked = await deleteMenuItemRaw(token, item.id);
      expect(blocked.status).toBe(409);
      expect(blocked.data.blockers?.deals?.length ?? 0).toBeGreaterThan(0);
      expect(errorMessage(blocked.data)).toMatch(/active deals or coupons/i);
      expect((await getMenuItemRaw(token, item.id)).data.item?.isActive).toBe(
        true
      );
    } finally {
      await deleteDealApi(token, dealId).catch(() => {});
    }
    const ok = await deleteMenuItemRaw(token, item.id);
    expect(ok.status, errorMessage(ok.data)).toBe(200);
  });

  test("TC-273: a category with items cannot be deleted; an empty one can", async () => {
    await allure.description(
      "DELETE /menu/group/:id → 400 'Cannot delete a menu category that still has items' while any item " +
        "is present; an empty category deletes with 200."
    );
    const g = await createMenuGroupNamed(
      token,
      `Automation Menu Del ${runId}`,
      { restaurantId }
    );
    const item = await createMenuItemFull(token, g.id, `Blocker ${runId}`, 4);
    const blocked = await deleteMenuGroupRaw(token, g.id);
    expect(blocked.status).toBe(400);
    expect(errorMessage(blocked.data)).toMatch(/still has items/i);
    if (adminToken) {
      await permanentlyDeleteMenuItemApi(adminToken, item.id);
      const ok = await deleteMenuGroupRaw(token, g.id);
      expect(ok.status, errorMessage(ok.data)).toBe(200);
    } else {
      // Without admin we can only soft-delete → the group is stuck (documented debt); leave it to the sweep.
      createdItemIds.push(item.id);
    }
  });

  // ── Chain overrides ────────────────────────────────────────────────────────

  test("TC-274: override routes reject standalone items, require restaurantId and a token", async () => {
    await allure.description(
      "PATCH …/price-override on an item of a standalone restaurant → 400 'only available for chain master " +
        "items'; without restaurantId → 400; without a token → 401 (the routes sit behind requireAuth — " +
        "CHANNEL_PRICING_DESIGN.md claims otherwise; this pins the code)."
    );
    const item = await seedItem("Standalone Override");
    const noRid = await setPriceOverrideRaw(token, item.id, {
      priceOverride: 1,
    });
    expect(noRid.status, "missing restaurantId").toBe(400);
    const notChain = await setPriceOverrideRaw(token, item.id, {
      restaurantId,
      priceOverride: 1,
    });
    expect(notChain.status).toBe(400);
    expect(errorMessage(notChain.data)).toMatch(/chain master items/i);
    const anon = await setPriceOverrideRaw(undefined, item.id, {
      restaurantId,
      priceOverride: 1,
    });
    expect(anon.status, "unauthenticated").toBe(401);
    const carriedNotChain = await setCarriedRaw(token, item.id, {
      restaurantId,
      isCarried: false,
    });
    expect(carriedNotChain.status).toBe(400);
  });

  test("TC-275: a per-location price override changes only that location's effective price", async () => {
    skipWithoutChain();
    await allure.description(
      "Chain: PATCH …/price-override {restaurantId:A, priceOverride:14} → A's merged menu shows " +
        "effectivePrice/price=14 with masterPrice=12; B still 12; priceOverride:null clears A back to 12."
    );
    const item = await seedChainItem("Override", 12);
    const set = await setPriceOverrideRaw(token, item.id, {
      restaurantId: locA,
      priceOverride: 14,
    });
    expect(set.status, errorMessage(set.data)).toBe(200);

    const rowA = flattenMenuItems(
      (await getRestaurantMenusApi(locA, { accessToken: token })).menus
    ).find((i) => i.id === item.id);
    const rowB = flattenMenuItems(
      (await getRestaurantMenusApi(locB, { accessToken: token })).menus
    ).find((i) => i.id === item.id);
    expect(rowA?.price).toBe(14);
    expect(rowA?.effectivePrice ?? rowA?.price).toBe(14);
    expect(rowA?.masterPrice).toBe(12);
    expect(rowB?.price, "B inherits master").toBe(12);

    const clear = await setPriceOverrideRaw(token, item.id, {
      restaurantId: locA,
      priceOverride: null,
    });
    expect(clear.status).toBe(200);
    const rowA2 = flattenMenuItems(
      (await getRestaurantMenusApi(locA, { accessToken: token })).menus
    ).find((i) => i.id === item.id);
    expect(rowA2?.price).toBe(12);
  });

  test("TC-276: location-pricing overrides a size price per location and validates the modifier id", async () => {
    skipWithoutChain();
    await allure.description(
      "Chain: PATCH …/location-pricing {restaurantId:A, basePriceOverride, modifierOverrides:[{modifierId, " +
        "priceOverride}]} resolves that modifier's price to the override on A's read (masterPrice kept) and " +
        "leaves B alone; a modifier that isn't on the item → 400; priceOverride:null deletes the row."
    );
    const item = await seedChainItem("LocPricing", 10, {
      modifierGroups: [
        {
          name: "Size",
          pricingMode: "REPLACES_PRICE",
          minSelections: 1,
          maxSelections: 1,
          modifiers: [
            { name: "Small", price: 10, isDefault: true },
            { name: "Large", price: 13 },
          ],
        },
      ],
    });
    const other = await seedChainItem("LocPricing Other", 5, {
      modifierGroups: [
        {
          name: "X",
          pricingMode: "ADJUSTS_PRICE",
          modifiers: [{ name: "y", price: 1 }],
        },
      ],
    });
    const detail = await getMenuItemApi(token, item.id);
    const large = detail.modifierGroups![0]!.modifiers.find(
      (m) => m.name === "Large"
    )!;
    const foreignMod = (await getMenuItemApi(token, other.id))
      .modifierGroups![0]!.modifiers[0]!;

    const bad = await setLocationPricingRaw(token, item.id, {
      restaurantId: locA,
      modifierOverrides: [{ modifierId: foreignMod.id, priceOverride: 9 }],
    });
    expect(bad.status, "foreign modifier id").toBe(400);

    const ok = await setLocationPricingRaw(token, item.id, {
      restaurantId: locA,
      basePriceOverride: 11,
      modifierOverrides: [{ modifierId: large.id, priceOverride: 15 }],
    });
    expect(ok.status, errorMessage(ok.data)).toBe(200);

    const findMod = (rid: string) =>
      getRestaurantMenusApi(rid, { accessToken: token }).then((r) => {
        const row = flattenMenuItems(r.menus).find((i) => i.id === item.id);
        const mod = row?.modifierGroups?.[0]?.modifiers.find(
          (m) => m.id === large.id
        );
        return {
          row,
          mod: mod as (typeof large & { masterPrice?: number }) | undefined,
        };
      });
    const a = await findMod(locA);
    expect(a.row?.price).toBe(11);
    expect(a.mod?.price).toBe(15);
    expect(a.mod?.masterPrice ?? 13).toBe(13);
    const b = await findMod(locB);
    expect(b.row?.price).toBe(10);
    expect(b.mod?.price).toBe(13);

    const clear = await setLocationPricingRaw(token, item.id, {
      restaurantId: locA,
      basePriceOverride: null,
      modifierOverrides: [{ modifierId: large.id, priceOverride: null }],
    });
    expect(clear.status).toBe(200);
    const a2 = await findMod(locA);
    expect(a2.row?.price).toBe(10);
    expect(a2.mod?.price).toBe(13);
  });

  test("TC-277: un-carrying a shared item hides it from that location's storefront only", async () => {
    skipWithoutChain();
    await allure.description(
      "Chain: PATCH …/carried {restaurantId:A, isCarried:false} → owner read for A still lists the item " +
        "with isCarried:false (so it can be restored), the CUSTOMER read for A omits it, and B still sells " +
        "it; isCarried:true restores."
    );
    const item = await seedChainItem("Carry", 6);
    const off = await setCarriedRaw(token, item.id, {
      restaurantId: locA,
      isCarried: false,
    });
    expect(off.status, errorMessage(off.data)).toBe(200);
    try {
      const ownerA = flattenMenuItems(
        (await getRestaurantMenusApi(locA, { accessToken: token })).menus
      ).find((i) => i.id === item.id);
      expect(ownerA, "owner path keeps uncarried item").toBeTruthy();
      expect(ownerA?.isCarried).toBe(false);
      expect(
        (await getPublicMenuItems(locA)).find((i) => i.id === item.id),
        "customer path drops it at A"
      ).toBeUndefined();
      expect(
        (await getPublicMenuItems(locB)).find((i) => i.id === item.id),
        "B still lists it"
      ).toBeTruthy();
    } finally {
      await setCarriedRaw(token, item.id, {
        restaurantId: locA,
        isCarried: true,
      });
    }
    expect(
      (await getPublicMenuItems(locA)).find((i) => i.id === item.id)
    ).toBeTruthy();
  });

  test("TC-278: 86'ing a shared item is per location and requires restaurantId", async () => {
    skipWithoutChain();
    await allure.description(
      "Chain: PATCH …/availability on a shared item without restaurantId → 400; with A → A reads " +
        "outOfStock:true, B false (only A's MenuItemLocationOverride row is written, the master flag stays)."
    );
    const item = await seedChainItem("Chain86", 6);
    const noRid = await setAvailabilityRaw(token, item.id, {
      outOfStock: true,
    });
    expect(noRid.status).toBe(400);
    const off = await setAvailabilityRaw(token, item.id, {
      outOfStock: true,
      restaurantId: locA,
    });
    expect(off.status, errorMessage(off.data)).toBe(200);
    try {
      const rowA = flattenMenuItems(
        (await getRestaurantMenusApi(locA, { accessToken: token })).menus
      ).find((i) => i.id === item.id);
      const rowB = flattenMenuItems(
        (await getRestaurantMenusApi(locB, { accessToken: token })).menus
      ).find((i) => i.id === item.id);
      expect(rowA?.outOfStock).toBe(true);
      expect(rowB?.outOfStock, "B unaffected").toBe(false);
      expect(
        (await getMenuItemApi(token, item.id)).outOfStock,
        "master flag untouched"
      ).toBe(false);
    } finally {
      await setAvailabilityRaw(token, item.id, {
        outOfStock: false,
        restaurantId: locA,
      });
    }
  });

  test("TC-279: a location-only item under a shared category is invisible to the other location", async () => {
    skipWithoutChain();
    await allure.description(
      "Chain: POST /menu/item/new {groupId: sharedCategory, ownerRestaurantId: A} → A lists it with " +
        "source:'RESTAURANT', B does not; ownerRestaurantId of a restaurant outside the chain → 400 " +
        "'does not belong to the chain'."
    );
    const bad = await createMenuItemRaw(token, {
      name: `Outsider ${runId}`,
      price: 5,
      groupId: sharedGroupId,
      ownerRestaurantId: restaurantId, // the seed restaurant is NOT a chain member
    });
    expect(bad.status).toBe(400);
    expect(errorMessage(bad.data)).toMatch(/does not belong to the chain/i);

    const local = await seedChainItem("LocalOnly", 7, {
      ownerRestaurantId: locA,
    });
    const rowA = flattenMenuItems(
      (await getRestaurantMenusApi(locA, { accessToken: token })).menus
    ).find((i) => i.id === local.id);
    const rowB = flattenMenuItems(
      (await getRestaurantMenusApi(locB, { accessToken: token })).menus
    ).find((i) => i.id === local.id);
    expect(rowA).toBeTruthy();
    expect(rowA?.source).toBe("RESTAURANT");
    expect(rowB, "other location never sees a private item").toBeUndefined();
    // Override machinery is for shared items only.
    const ov = await setPriceOverrideRaw(token, local.id, {
      restaurantId: locA,
      priceOverride: 9,
    });
    expect(ov.status).toBe(400);
  });

  test("TC-280: cloning a menu into a chain member is refused", async () => {
    skipWithoutChain();
    await allure.description(
      "POST /menu/restaurant/clone with targetRestaurantId = a chain member → 400 'part of a chain and uses " +
        "the chain's shared menu' (restaurant-owned duplicates would collide with the shared menu)."
    );
    const res = await cloneMenuRaw(token, {
      sourceRestaurantId: restaurantId,
      targetRestaurantId: locA,
      type: "FULL_MENU",
    });
    expect(res.status).toBe(400);
    expect(errorMessage(res.data)).toMatch(/part of a chain/i);
  });

  test("TC-281: featuring a shared chain item is chain-wide; a location-only item stays local", async () => {
    skipWithoutChain();
    await allure.description(
      "Chain: PATCH …/featured on a shared master item flips `featured` on every location's read (no 5-cap " +
        "for chain master items); on a location-only item only its own location reads featured:true."
    );
    const shared = await seedChainItem("FeatShared", 6);
    const local = await seedChainItem("FeatLocal", 6, {
      ownerRestaurantId: locB,
    });
    try {
      expect((await setFeaturedRaw(token, shared.id, true)).status).toBe(200);
      expect((await setFeaturedRaw(token, local.id, true)).status).toBe(200);
      const rowsA = flattenMenuItems(
        (await getRestaurantMenusApi(locA, { accessToken: token })).menus
      );
      const rowsB = flattenMenuItems(
        (await getRestaurantMenusApi(locB, { accessToken: token })).menus
      );
      expect(rowsA.find((i) => i.id === shared.id)?.featured).toBe(true);
      expect(rowsB.find((i) => i.id === shared.id)?.featured).toBe(true);
      expect(rowsB.find((i) => i.id === local.id)?.featured).toBe(true);
      expect(
        rowsA.find((i) => i.id === local.id),
        "local item absent at A"
      ).toBeUndefined();
    } finally {
      await setFeaturedRaw(token, shared.id, false);
      await setFeaturedRaw(token, local.id, false);
    }
  });

  test("TC-282: 🔴 pin — chain reset-availability should un-86 locations (currently a no-op)", async () => {
    skipWithoutChain();
    test.fail(
      true,
      "resetGroupAvailability clears only MenuItem.outOfStock; per-location MenuItemLocationOverride.isOutOfStock rows are left set — see MENU_TAB_TEST_STRATEGY.md §1.2. Flip to a plain test when fixed."
    );
    await allure.description(
      "Chain: 86 a shared item at A, then POST /menu/menu-groups/:sharedGroup/reset-availability. Expected: " +
        "A reads outOfStock:false. Today the location override is untouched, so this test.fail()s until the " +
        "backend clears location rows too."
    );
    const item = await seedChainItem("ResetChain", 6);
    expect(
      (
        await setAvailabilityRaw(token, item.id, {
          outOfStock: true,
          restaurantId: locA,
        })
      ).status
    ).toBe(200);
    try {
      const reset = await resetGroupAvailabilityRaw(token, sharedGroupId);
      expect(reset.status).toBe(200);
      const rowA = flattenMenuItems(
        (await getRestaurantMenusApi(locA, { accessToken: token })).menus
      ).find((i) => i.id === item.id);
      expect(
        rowA?.outOfStock,
        "A should be back in stock after group reset"
      ).toBe(false);
    } finally {
      await setAvailabilityRaw(token, item.id, {
        outOfStock: false,
        restaurantId: locA,
      });
    }
  });

  // ── Authorization pins (second owner) ──────────────────────────────────────

  test.describe("authorization — a second owner against our menu", () => {
    let other = "";
    let otherRestaurantId: string | null = null;
    let target: ApiMenuItem | undefined;
    let emptyGroupId = "";

    test.beforeAll(async () => {
      if (!adminToken || !token) return;
      const second = await createSecondOwner(adminToken, runId);
      other = second.accessToken;
      otherRestaurantId = second.restaurantId;
      target = await seedItem("IDOR Target", 6);
      emptyGroupId = (
        await createMenuGroupNamed(token, `Automation Menu Empty ${runId}`, {
          restaurantId,
        })
      ).id;
    });

    test.afterAll(async () => {
      if (adminToken && otherRestaurantId) {
        await deleteTestRestaurant(adminToken, otherRestaurantId).catch(
          () => {}
        );
      }
      if (emptyGroupId)
        await deleteTestMenuGroup(token, emptyGroupId).catch(() => {});
    });

    test.beforeEach(async () => {
      test.skip(!adminToken, "ADMIN creds needed to mint the second owner");
      await allure.label("severity", "critical");
    });

    test("TC-283: 🔴 pin — another owner must not be able to edit our item (PUT …/changes)", async () => {
      test.fail(
        true,
        "PUT /menu/menu-items/:id/changes has no ownership check (authenticated IDOR) — MENU_TAB_TEST_STRATEGY.md §1.1"
      );
      const res = await applyMenuItemChangesRaw(other, target!.id, {
        menuItemId: target!.id,
        name: `HACKED ${runId}`,
      });
      await allure.parameter("status", String(res.status));
      // Restore if it went through, so the rest of the file isn't affected.
      if (res.ok) {
        await applyMenuItemChangesRaw(token, target!.id, {
          menuItemId: target!.id,
          name: target!.name,
        });
      }
      expect(res.status).toBe(403);
    });

    test("TC-284: 🔴 pin — another owner must not be able to delete our item", async () => {
      test.fail(
        true,
        "DELETE /menu/menuItemId/:id has no ownership check — MENU_TAB_TEST_STRATEGY.md §1.1"
      );
      const victim = await seedItem("IDOR Delete", 6);
      const res = await deleteMenuItemRaw(other, victim.id);
      await allure.parameter("status", String(res.status));
      expect(res.status).toBe(403);
    });

    test("TC-285: 🔴 pin — another owner must not create into, or delete, our category", async () => {
      test.fail(
        true,
        "POST /menu/item/new and DELETE /menu/group/:id have no ownership check — MENU_TAB_TEST_STRATEGY.md §1.1"
      );
      const create = await createMenuItemRaw(other, {
        name: `IDOR Create ${runId}`,
        price: 3,
        groupId,
      });
      await allure.parameter("create status", String(create.status));
      const createdId = (create.data as { menuItem?: { id?: string } })
        ?.menuItem?.id;
      if (createdId) createdItemIds.push(createdId);
      const del = await deleteMenuGroupRaw(other, emptyGroupId);
      await allure.parameter("delete status", String(del.status));
      if (del.ok) emptyGroupId = "";
      expect(create.status).toBe(403);
      expect(del.status).toBe(403);
    });

    test("TC-286: 🔴 pin — another owner must not upload an image onto our item", async () => {
      test.fail(
        true,
        "POST /upload/menu/item/picture/:id has no ownership check — MENU_TAB_TEST_STRATEGY.md §1.1"
      );
      const res = await uploadMenuItemImageRaw(other, target!.id, {
        buffer: fs.readFileSync(PNG_FIXTURE),
        filename: "menu-item.png",
        mimeType: "image/png",
      });
      await allure.parameter("status", String(res.status));
      expect(res.status).toBe(403);
    });

    test("TC-287: the guarded routes DO reject another owner (positive control for the pins)", async () => {
      await allure.description(
        "availability / featured / price-override carry assertControlsRestaurant / assertControlsMenuOwner: " +
          "a second owner's token gets 403 on our item. Proves the second-owner token and fixture are real, " +
          "and keeps the guarded set guarded."
      );
      const avail = await setAvailabilityRaw(other, target!.id, {
        outOfStock: true,
      });
      const feat = await setFeaturedRaw(other, target!.id, true);
      const price = await setPriceOverrideRaw(other, target!.id, {
        restaurantId,
        priceOverride: 1,
      });
      expect(avail.status, "availability").toBe(403);
      expect(feat.status, "featured").toBe(403);
      expect(price.status, "price-override").toBe(403);
      // And the second owner CAN act on their own restaurant (token sanity).
      if (otherRestaurantId) {
        const own = await createMenuGroupRaw(other, {
          menuGroup: `Own ${runId}`,
          restaurantId: otherRestaurantId,
        });
        expect(own.status, errorMessage(own.data)).toBeLessThan(300);
      }
    });
  });
});
