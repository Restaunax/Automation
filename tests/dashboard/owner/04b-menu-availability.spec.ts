/**
 * 04b-menu-availability.spec.ts — the Menu TAB (Layer 2a).
 *
 * `restaurantManagement?tab=Menu` renders "Menu Availability Management": a
 * toggle surface (86 switch with ConsequenceDialog, featured star, "Restore
 * All to Available" per category, Refresh, Manage Menu → builder). Category /
 * item CRUD is the builder's job (04-menu-management.spec.ts).
 * See docs/MENU_TAB_TEST_STRATEGY.md §3.1 / §4 (Layer 2a).
 *
 * Own data: one private "Automation Menu <id>" category on the seed
 * restaurant with 3 API-seeded items; every mutation is asserted on THOSE rows
 * and restored; the category is hard-deleted in afterAll (admin permanent
 * delete) — the seed restaurant's real menu is never touched.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createMenuAvailabilityPage } from "../../../pages/dashboard/restaurant/MenuManagementPage";
import { readSharedState, generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createRestaurantRaw,
  assignRestaurantToUserApi,
  deleteTestRestaurant,
  deleteTestMenuGroup,
  deleteMenuItemRaw,
  permanentlyDeleteMenuItemApi,
  setAvailability,
  setFeaturedRaw,
  getRestaurantMenusApi,
  flattenMenuItems,
  type ApiMenuItem,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Owner — Menu tab (availability / featured)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  // Every test mutates the same seeded rows and restores them — serial keeps
  // "restore" of one test from racing "assert" of another.
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  const CATEGORY = `Automation Menu ${runId}`;
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  let items: ApiMenuItem[] = [];
  const itemName = (i: number) => items[i]!.name;

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    ({ restaurantId } = readSharedState());
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    }
    groupId = (await createMenuGroupNamed(token, CATEGORY, { restaurantId }))
      .id;
    items = [];
    // Six items: enough to reach the 5-featured cap from any starting count.
    for (const n of ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]) {
      items.push(
        await createMenuItemFull(token, groupId, `Tab ${n} ${runId}`, 7.25, {
          description: `Menu-tab automation item ${n}`,
        })
      );
    }
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    for (const it of items) {
      await setFeaturedRaw(t, it.id, false).catch(() => {});
      if (adminToken)
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
      else await deleteMenuItemRaw(t, it.id).catch(() => {});
    }
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Menu Availability");
    await allure.label("severity", "critical");
    token = await freshToken();
  });

  test("TC-288: the sidebar Menu tab opens Menu Availability Management and Manage Menu opens the builder @smoke", async ({
    ownerPage,
  }) => {
    await allure.description(
      "From the restaurant portal, the sidebar 'Menu' item renders the 'Menu Availability Management' " +
        "page: the seeded category accordion shows '6 Available'; 'Manage Menu' navigates to the builder " +
        "at /restaurant/restaurantId/:id (New Category visible)."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await ownerPage.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Analytics`,
      { waitUntil: "domcontentloaded" }
    );
    await allure.step("Click sidebar Menu", async () => {
      await tab.sidebarMenuTab().click();
      await expect(ownerPage).toHaveURL(/tab=Menu/);
      await tab.assertLoaded();
    });
    await allure.step("Seeded category shows 6 Available", async () => {
      await tab.assertCounts(CATEGORY, 6, 0);
      await tab.expandCategory(CATEGORY);
      for (let i = 0; i < 6; i++)
        await tab.assertItemAvailable(CATEGORY, itemName(i));
    });
    await allure.step("Manage Menu → builder", async () => {
      await tab.manageMenuButton().click();
      await expect(ownerPage).toHaveURL(
        new RegExp(`/restaurant/restaurantId/${restaurantId}$`)
      );
      await expect(
        ownerPage.getByRole("button", { name: "New Category" })
      ).toBeVisible({ timeout: 20_000 });
    });
  });

  test("TC-289: turning an item off asks for confirmation, PATCHes availability and updates the chips; turning it on does not", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Switch OFF → ConsequenceDialog 'Mark \"X\" as sold out?' → 'Mark sold out' → PATCH " +
        "/menu/menu-items/:id/availability {outOfStock:true} → row chip 'Out of Stock', category chips " +
        "'5 Available' / '1 Out of Stock', toast. Switch ON → no dialog, {outOfStock:false}, chips back to 6/0. " +
        "Cancel in the dialog leaves the item available."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(restaurantId);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    const name = itemName(0);

    await allure.step("Cancel keeps it available", async () => {
      await tab.availabilitySwitch(CATEGORY, name).click();
      const dialog = tab.soldOutDialog(name);
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(
        "customers can't order it until you mark it available again"
      );
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await tab.assertItemAvailable(CATEGORY, name);
    });

    await allure.step("Confirm → sold out", async () => {
      const { status, body } = await tab.markSoldOut(CATEGORY, name);
      expect(status).toBe(200);
      expect(body.outOfStock).toBe(true);
      await tab.assertItemOutOfStock(CATEGORY, name);
      await tab.assertCounts(CATEGORY, 5, 1);
      await expect(tab.toast(/marked as out of stock/i)).toBeVisible({
        timeout: 10_000,
      });
      const row = flattenMenuItems(
        (await getRestaurantMenusApi(restaurantId)).menus
      ).find((i) => i.id === items[0]!.id);
      expect(row?.outOfStock, "persisted").toBe(true);
    });

    await allure.step("Switch back on — no dialog", async () => {
      const { status, body } = await tab.markAvailable(CATEGORY, name);
      expect(status).toBe(200);
      expect(body.outOfStock).toBe(false);
      await expect(tab.soldOutDialog(name)).toBeHidden();
      await tab.assertItemAvailable(CATEGORY, name);
      await tab.assertCounts(CATEGORY, 6, 0);
    });
  });

  test("TC-290: Restore All to Available appears only with out-of-stock items and restores the whole category", async ({
    ownerPage,
  }) => {
    await allure.description(
      "With nothing out of stock the category summary has no 'Restore All to Available' button. After " +
        "86'ing two items via the API the button appears; its ConsequenceDialog names the count and category; " +
        "'Restore all' → POST /menu/menu-groups/:id/reset-availability → '6 Available' and the button is gone."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(restaurantId);
    await tab.assertLoaded();
    await expect(tab.restoreAllButton(CATEGORY)).toHaveCount(0);

    await setAvailability(token, items[1]!.id, true);
    await setAvailability(token, items[2]!.id, true);
    await tab.refreshButton().click();
    await tab.assertCounts(CATEGORY, 4, 2);
    await expect(tab.restoreAllButton(CATEGORY)).toBeVisible();

    const { dialog, confirm } = await tab.restoreAll(CATEGORY);
    await expect(dialog).toContainText(
      `2 items currently marked out of stock in "${CATEGORY}" will be marked available again.`
    );
    await confirm();
    await tab.assertCounts(CATEGORY, 6, 0);
    await expect(tab.restoreAllButton(CATEGORY)).toHaveCount(0);
    await tab.expandCategory(CATEGORY);
    for (let i = 0; i < 6; i++)
      await tab.assertItemAvailable(CATEGORY, itemName(i));
  });

  test("TC-291: featuring an item adds it to the Featured accordion with an n/5 counter; the 6th is refused", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Star on a row → PATCH …/featured {featured:true} → item listed under 'Featured Items n/5' and the row's " +
        "button flips to 'Remove from featured items'. Un-star reverses it. If fewer than 5 items are featured " +
        "on the restaurant, our 3 seeded items are used to reach the cap and the next attempt shows the " +
        "'only have 5 featured items' error while the counter stays 5/5 (skipped when the restaurant already " +
        "has 5 real featured items — we never un-feature real data)."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(restaurantId);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);

    const before = flattenMenuItems(
      (await getRestaurantMenusApi(restaurantId)).menus
    ).filter((i) => i.featured).length;

    await allure.step("Feature one seeded item", async () => {
      const { status, body } = await tab.toggleFeatured(CATEGORY, itemName(0));
      expect(status).toBe(200);
      expect(body.featured).toBe(true);
      await expect(tab.featuredSummary()).toBeVisible({ timeout: 10_000 });
      expect(await tab.featuredCounter()).toBe(`${before + 1}/5`);
      await expect(tab.featuredRow(itemName(0))).toBeVisible();
      await expect(
        tab.itemRow(CATEGORY, itemName(0)).getByRole("button", {
          name: "Remove from featured items",
        })
      ).toBeVisible();
    });

    await allure.step("Un-feature it", async () => {
      const { body } = await tab.toggleFeatured(CATEGORY, itemName(0));
      expect(body.featured).toBe(false);
      await expect(tab.featuredRow(itemName(0))).toHaveCount(0);
      if (before === 0) {
        await expect(tab.featuredSummary()).toHaveCount(0);
      } else {
        expect(await tab.featuredCounter()).toBe(`${before}/5`);
      }
    });

    await allure.step("Reach the cap and try a 6th", async () => {
      test.skip(
        before >= 5,
        "restaurant already has 5 featured items — cap not testable without touching real data"
      );
      // Fill up to 5 with our items via API (six seeded → always reachable).
      const need = 5 - before;
      for (let i = 0; i < need; i++) {
        expect((await setFeaturedRaw(token, items[i]!.id, true)).status).toBe(
          200
        );
      }
      await Promise.all([
        tab.waitForMenuLoad(restaurantId),
        tab.refreshButton().click(),
      ]);
      await expect
        .poll(() => tab.featuredCounter(), { timeout: 10_000 })
        .toBe("5/5");
      await tab.expandCategory(CATEGORY);
      const { status } = await tab.toggleFeatured(CATEGORY, itemName(need));
      expect(status).toBe(400);
      await expect(tab.toast(/only have 5 featured|featured/i)).toBeVisible({
        timeout: 10_000,
      });
      expect(await tab.featuredCounter()).toBe("5/5");
      for (let i = 0; i < need; i++)
        await setFeaturedRaw(token, items[i]!.id, false);
    });
  });

  test("TC-292: Refresh re-fetches the menu and reflects a change made outside the page", async ({
    ownerPage,
  }) => {
    await allure.description(
      "86 an item through the API while the tab is open (nothing changes on screen), click Refresh → GET " +
        "/menu/restaurants/:id/menus fires and the row now reads 'Out of Stock'; restore + Refresh → 'Available'."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(restaurantId);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await tab.assertItemAvailable(CATEGORY, itemName(2));

    await setAvailability(token, items[2]!.id, true);
    await tab.assertItemAvailable(CATEGORY, itemName(2)); // stale until refresh
    await Promise.all([
      tab.waitForMenuLoad(restaurantId),
      tab.refreshButton().click(),
    ]);
    await tab.expandCategory(CATEGORY);
    await tab.assertItemOutOfStock(CATEGORY, itemName(2));
    await tab.assertCounts(CATEGORY, 5, 1);

    await setAvailability(token, items[2]!.id, false);
    await Promise.all([
      tab.waitForMenuLoad(restaurantId),
      tab.refreshButton().click(),
    ]);
    await tab.expandCategory(CATEGORY);
    await tab.assertItemAvailable(CATEGORY, itemName(2));
  });

  test("TC-293: a restaurant with no menu shows the empty state that opens the builder", async ({
    ownerPage,
  }) => {
    await allure.description(
      "On a freshly created (menu-less) restaurant assigned to the owner, the Menu tab shows 'No menu data " +
        "available' with an 'Open menu builder' CTA that lands on the builder route (/restaurant/restaurantId/:id, " +
        "scope bar 'Editing menu for: <name>'). NOTE: the builder page is CreateStore's data-driven wizard — a " +
        "restaurant with no business hours shows its Business Hours step before the menu step, so either that " +
        "or the builder's 'No categories yet' empty state is accepted. Throwaway restaurant is created + " +
        "assigned via the admin API and deleted afterwards."
    );
    test.skip(!adminToken, "ADMIN creds needed to mint a menu-less restaurant");
    const res = await createRestaurantRaw(adminToken, {
      name: `Automation Empty Menu ${runId}`,
      street: "1 Empty Street",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      cuisineType: "Cafe",
      restaurantPhone: "3055550199",
      description: "Throwaway — empty-state test",
      minimumOrderPreparationTime: 0,
    });
    const emptyId = (res.data as { restaurant?: { id?: string } })?.restaurant
      ?.id;
    expect(
      emptyId,
      `restaurant seed failed: ${JSON.stringify(res.data)}`
    ).toBeTruthy();
    try {
      const { userId } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      await assignRestaurantToUserApi(adminToken, userId, emptyId!);
      const tab = createMenuAvailabilityPage(ownerPage);
      await tab.goto(emptyId!);
      await tab.assertLoaded();
      await expect(tab.emptyState()).toBeVisible({ timeout: 20_000 });
      await tab.openMenuBuilderButton().click();
      await expect(ownerPage).toHaveURL(
        new RegExp(`/restaurant/restaurantId/${emptyId}`)
      );
      await expect(
        ownerPage.getByText(/Editing menu for:/).first()
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        ownerPage
          .getByText("No categories yet")
          .or(ownerPage.getByRole("heading", { name: "Business Hours" }))
          .first()
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await deleteTestRestaurant(adminToken, emptyId!).catch(() => {});
    }
  });
});
