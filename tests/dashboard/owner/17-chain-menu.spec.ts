/**
 * 17-chain-menu.spec.ts — chain menu behaviour in the owner UI (Layer 2c).
 *
 * Runs against the persistent "Automation Chain" fixture (globalSetup →
 * ensureAutomationChain: two locations A/B owned by the seed OWNER, one shared
 * master menu). Rules under test come from CHAIN_RESTAURANTS.md: name /
 * description / image / modifiers / featured are SHARED and fan out; price,
 * out-of-stock and carried are PER LOCATION; a location can add its own item
 * into a shared category. See docs/MENU_TAB_TEST_STRATEGY.md §3.1 (chain rows),
 * §4 (Layer 2c).
 *
 * Own data: a per-run shared category "Automation Menu <id>" on the chain
 * master with one shared item (size modifiers) + one location-only item at A;
 * every override is restored in-test and everything is hard-deleted in
 * afterAll (admin permanent delete → group delete). Skips when the fixture is
 * unavailable.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createMenuAvailabilityPage } from "../../../pages/dashboard/restaurant/MenuManagementPage";
import { createLocationPricingDialog } from "../../../pages/dashboard/restaurant/LocationPricingDialog";
import { createOwnerMenuPage } from "../../../pages/dashboard/owner/OwnerMenuPage";
import { createMenuItemWizardPage } from "../../../pages/dashboard/restaurant/MenuItemWizardPage";
import { readSharedState, generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  getMenuItemApi,
  getRestaurantMenusApi,
  getPublicMenuItems,
  flattenMenuItems,
  setPriceOverrideRaw,
  setLocationPricingRaw,
  setCarriedRaw,
  setAvailabilityRaw,
  setFeaturedRaw,
  deleteTestMenuGroup,
  deleteMenuItemRaw,
  permanentlyDeleteMenuItemApi,
  type ApiMenuItem,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Owner — Chain menu (per-location overrides, shared vs local)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  const CATEGORY = `Automation Menu ${runId}`;
  let token = "";
  let adminToken = "";
  let chainGroupId = "";
  let locA = "";
  let locB = "";
  let locAName = "";
  let sharedGroupId = "";
  let shared: ApiMenuItem;
  let local: ApiMenuItem;
  const extraIds: string[] = [];

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  const rowAt = async (rid: string, id: string) =>
    flattenMenuItems(
      (await getRestaurantMenusApi(rid, { accessToken: token })).menus
    ).find((i) => i.id === id);

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const state = readSharedState();
    chainGroupId = state.chainGroupId ?? "";
    locA = state.chainLocationAId ?? "";
    locB = state.chainLocationBId ?? "";
    locAName = state.chainLocationAName ?? "";
    if (!chainGroupId) return;
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    }
    sharedGroupId = (
      await createMenuGroupNamed(token, CATEGORY, { groupId: chainGroupId })
    ).id;
    shared = await createMenuItemFull(
      token,
      sharedGroupId,
      `Chain Shared ${runId}`,
      12,
      {
        description: "shared across the chain",
        modifierGroups: [
          {
            name: "Size",
            pricingMode: "REPLACES_PRICE",
            minSelections: 1,
            maxSelections: 1,
            modifiers: [
              { name: "Small", price: 12, isDefault: true },
              { name: "Large", price: 15 },
            ],
          },
        ],
      }
    );
    local = await createMenuItemFull(
      token,
      sharedGroupId,
      `Chain Local ${runId}`,
      7,
      {
        description: "only at A",
        ownerRestaurantId: locA,
      }
    );
  });

  test.afterAll(async () => {
    if (!token || !sharedGroupId) return;
    const t = await freshToken().catch(() => token);
    for (const id of [shared?.id, local?.id, ...extraIds].filter(
      Boolean
    ) as string[]) {
      await setFeaturedRaw(t, id, false).catch(() => {});
      if (adminToken)
        await permanentlyDeleteMenuItemApi(adminToken, id).catch(() => {});
      else await deleteMenuItemRaw(t, id).catch(() => {});
    }
    await deleteTestMenuGroup(t, sharedGroupId).catch(() => {});
  });

  test.beforeEach(async () => {
    test.skip(
      !chainGroupId,
      "Automation Chain fixture not available (globalSetup could not build it — needs ADMIN creds)"
    );
    await allure.label("feature", "Chain Menu");
    await allure.label("severity", "critical");
    token = await freshToken();
  });

  test("TC-308: a chain member's Menu tab shows the location banner, split summary and per-item source chips", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Location A's Menu tab: header 'Managing: A • part of your chain' + 'Switch to chain view (2 locations)'; " +
        "banner 'You're editing A. Shared items come from the chain menu…'; summary 'N shared (chain) · N only " +
        "this location'; the shared item is chipped 'From shared menu' and has $ + carry icons, the local item is " +
        "chipped 'This location only' and has neither. The builder's scope bar reads 'Editing menu for:' with " +
        "'Switch to all 2 locations' → the chain shell Menu tab."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(locA);
    await tab.assertLoaded();
    await expect(tab.managingLine()).toBeVisible();
    await expect(tab.switchToChainViewButton()).toBeVisible();
    await expect(tab.chainLocationBanner()).toBeVisible();
    await expect(tab.chainLocationBanner()).toContainText(locAName);
    await expect(tab.menuSplitSummary()).toBeVisible();
    await tab.expandCategory(CATEGORY);
    await expect(tab.sourceChip(CATEGORY, shared.name, "shared")).toBeVisible();
    await expect(tab.priceOverrideButton(CATEGORY, shared.name)).toBeVisible();
    await expect(tab.carryButton(CATEGORY, shared.name)).toBeVisible();
    await expect(tab.sourceChip(CATEGORY, local.name, "local")).toBeVisible();
    await expect(tab.priceOverrideButton(CATEGORY, local.name)).toHaveCount(0);
    await expect(tab.carryButton(CATEGORY, local.name)).toHaveCount(0);

    const builder = createOwnerMenuPage(ownerPage);
    await builder.gotoBuilder(locA);
    await expect(builder.scopeBarEditingFor()).toBeVisible({ timeout: 20_000 });
    await expect(builder.categoryChip(CATEGORY, "shared")).toBeVisible();
    await expect(builder.cloneMenuButton()).toBeDisabled();
    await builder.scopeBarSwitchToShared().click();
    await expect(ownerPage).toHaveURL(new RegExp(`/chain/${chainGroupId}/`));
  });

  test("TC-309: the chain shell Menu tab is the shared view — no per-location controls, local items hidden", async ({
    ownerPage,
  }) => {
    await allure.description(
      "/chain/:groupId/restaurantManagement?tab=Menu: banner 'This is your shared menu — changes here apply to " +
        "all 2 locations…'; 'Manage shared menu (all locations)' button; the shared item's availability switch " +
        "is disabled and it has no $ / carry icons; A's location-only item is not listed at all " +
        "(?sharedItemsOnly=true)."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.gotoChain(chainGroupId);
    await tab.assertLoaded();
    await expect(tab.chainSharedBanner()).toBeVisible();
    await expect(tab.manageMenuButton()).toHaveText(/Manage shared menu/);
    await tab.expandCategory(CATEGORY);
    await expect(tab.itemRow(CATEGORY, shared.name)).toBeVisible();
    await expect(tab.availabilitySwitch(CATEGORY, shared.name)).toBeDisabled();
    await expect(tab.priceOverrideButton(CATEGORY, shared.name)).toHaveCount(0);
    await expect(tab.carryButton(CATEGORY, shared.name)).toHaveCount(0);
    await expect(
      tab.categoryAccordion(CATEGORY).getByText(local.name)
    ).toHaveCount(0);
  });

  test("TC-310: per-location price via the $ dialog changes A only and can be reset to shared", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A: $ icon ('Using shared price…') → dialog 'Pricing for \"<item>\" at this location' → Base price 14 → " +
        "row chip 'Overridden' → Save → PATCH …/location-pricing {basePriceOverride:14} → toast, icon now " +
        "'Location price: $14', chip '1 location has a different price'; B's tab and API still show 12; " +
        "reopen → 'Reset to shared price' → Save → back to shared."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    const dlg = createLocationPricingDialog(ownerPage);
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await tab.priceOverrideButton(CATEGORY, shared.name).click();
    await dlg.waitFor();
    await expect(dlg.dialog()).toContainText(locAName);
    await expect(dlg.sharedPriceText("12.00")).toBeVisible();
    await dlg.basePriceInput().fill("14");
    await expect(dlg.overriddenChips()).toHaveCount(1);
    const { status, body } = await dlg.save();
    expect(status).toBe(200);
    expect(body.restaurantId).toBe(locA);
    expect(body.basePriceOverride).toBe(14);
    await expect(dlg.savedToast()).toBeVisible({ timeout: 10_000 });

    await tab.expandCategory(CATEGORY);
    await expect(
      tab
        .itemRow(CATEGORY, shared.name)
        .getByRole("button", { name: /Location price: \$14/ })
    ).toBeVisible({ timeout: 10_000 });
    await expect(tab.differentPriceChip(CATEGORY, shared.name)).toBeVisible();
    expect((await rowAt(locA, shared.id))?.price).toBe(14);
    expect((await rowAt(locB, shared.id))?.price, "B unchanged").toBe(12);

    // B's own tab shows the shared price icon state.
    await tab.goto(locB);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await expect(
      tab
        .itemRow(CATEGORY, shared.name)
        .getByRole("button", { name: /Using shared price/ })
    ).toBeVisible();

    // Reset at A.
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await tab.priceOverrideButton(CATEGORY, shared.name).click();
    await dlg.waitFor();
    await dlg.resetRowButtons().first().click();
    const reset = await dlg.save();
    expect(reset.status).toBe(200);
    expect(reset.body.basePriceOverride).toBeNull();
    expect((await rowAt(locA, shared.id))?.price).toBe(12);
  });

  test("TC-311: 86 at one location leaves the other location available", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A: switch OFF the shared item → 'Mark sold out' → PATCH …/availability {outOfStock:true, restaurantId:A} " +
        "→ A reads Out of Stock; B's tab still shows Available and B's API row outOfStock:false; switch ON at A restores."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    const { status, body } = await tab.markSoldOut(CATEGORY, shared.name);
    expect(status).toBe(200);
    expect(body).toMatchObject({ outOfStock: true, restaurantId: locA });
    try {
      await tab.assertItemOutOfStock(CATEGORY, shared.name);
      expect((await rowAt(locB, shared.id))?.outOfStock, "B unaffected").toBe(
        false
      );
      await tab.goto(locB);
      await tab.assertLoaded();
      await tab.expandCategory(CATEGORY);
      await tab.assertItemAvailable(CATEGORY, shared.name);
    } finally {
      await setAvailabilityRaw(token, shared.id, {
        outOfStock: false,
        restaurantId: locA,
      });
    }
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await tab.assertItemAvailable(CATEGORY, shared.name);
  });

  test("TC-312: removing a shared item from one location's menu hides it on that storefront only", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A: eye icon → dialog 'Remove \"<item>\" from this location's menu?' → 'Remove from menu' → PATCH " +
        "…/carried {isCarried:false, restaurantId:A}; the row stays (owner view) with an 'Add back…' icon; the " +
        "CUSTOMER menu for A omits the item while B's still has it; 'Add back' restores."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await tab.carryButton(CATEGORY, shared.name).click();
    const dialog = ownerPage.getByRole("dialog", {
      name: `Remove "${shared.name}" from this location's menu?`,
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const [res] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/carried/.test(r.url()) &&
          r.request().method() === "PATCH"
      ),
      dialog.getByRole("button", { name: "Remove from menu" }).click(),
    ]);
    expect(res.status()).toBe(200);
    expect(res.request().postDataJSON()).toMatchObject({
      isCarried: false,
      restaurantId: locA,
    });
    try {
      await tab.expandCategory(CATEGORY);
      await expect(
        tab.itemRow(CATEGORY, shared.name).getByRole("button", {
          name: /Add back to this location's menu/,
        })
      ).toBeVisible({ timeout: 10_000 });
      expect(
        (await getPublicMenuItems(locA)).find((i) => i.id === shared.id)
      ).toBeUndefined();
      expect(
        (await getPublicMenuItems(locB)).find((i) => i.id === shared.id)
      ).toBeTruthy();
      // Restore through the UI.
      const [back] = await Promise.all([
        ownerPage.waitForResponse(
          (r) =>
            /\/menu\/menu-items\/[^/]+\/carried/.test(r.url()) &&
            r.request().method() === "PATCH"
        ),
        tab
          .itemRow(CATEGORY, shared.name)
          .getByRole("button", { name: /Add back to this location's menu/ })
          .click(),
      ]);
      expect(back.status()).toBe(200);
    } finally {
      await setCarriedRaw(token, shared.id, {
        restaurantId: locA,
        isCarried: true,
      });
    }
    expect(
      (await getPublicMenuItems(locA)).find((i) => i.id === shared.id)
    ).toBeTruthy();
  });

  test("TC-313: editing a shared item at one location fans out to every location", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A, edit the shared item's name in the wizard and save → PUT …/changes; the new name shows on BOTH " +
        "locations' Menu tabs (shared row = one MenuItem). If the build shows the 'Heads up — chain-wide " +
        "change' fan-out confirm it is accepted (Continue) — the QA build at the time of writing did not."
    );
    const wizard = createMenuItemWizardPage(ownerPage);
    const tab = createMenuAvailabilityPage(ownerPage);
    const newName = `Chain Shared ${runId} Renamed`;
    await wizard.gotoEdit(locA, sharedGroupId, shared.id);
    await wizard.waitForStep0();
    await expect(wizard.nameInput()).toHaveValue(shared.name, {
      timeout: 15_000,
    });
    await wizard.fillBasics({ name: newName });
    // finish() drives to Review (auto-submit); handle the optional fan-out dialog meanwhile.
    const fanOut = wizard.fanOutDialog();
    const finishing = wizard.finish();
    const guarded = await fanOut
      .waitFor({ state: "visible", timeout: 6_000 })
      .then(() => true)
      .catch(() => false);
    if (guarded) await fanOut.getByRole("button", { name: "Continue" }).click();
    const { status } = await finishing;
    expect(status).toBe(200);
    shared = { ...shared, name: newName };
    for (const rid of [locA, locB]) {
      expect((await rowAt(rid, shared.id))?.name, rid).toBe(newName);
      await tab.goto(rid);
      await tab.assertLoaded();
      await tab.expandCategory(CATEGORY);
      await expect(tab.itemRow(CATEGORY, newName)).toBeVisible();
    }
  });

  test("TC-314: 'Who is this item for?' — Just this store creates a location-only item invisible to B", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A's builder, 'Add <shared category> Item' → dialog 'Who is this item for?' → 'Just this store' → wizard " +
        "at ?ownerOnly=1 with the banner 'This item is for this location only…' → save → the item is listed at A " +
        "with the 'This location only' chip / 'Only here' badge and is absent from B and from the chain shell; " +
        "'All my stores' → no ownerOnly, item present at both."
    );
    const builder = createOwnerMenuPage(ownerPage);
    const wizard = createMenuItemWizardPage(ownerPage);
    const tab = createMenuAvailabilityPage(ownerPage);

    await allure.step("Just this store", async () => {
      await builder.gotoBuilder(locA);
      await expect(builder.addItemButton(CATEGORY)).toBeVisible({
        timeout: 20_000,
      });
      await builder.addItemButton(CATEGORY).click();
      await expect(builder.scopeDialog()).toBeVisible({ timeout: 10_000 });
      await builder.chooseItemScope("this");
      await expect(ownerPage).toHaveURL(/ownerOnly=1/);
      await wizard.waitForStep0();
      await expect(wizard.locationOnlyBanner()).toBeVisible();
      const name = `Chain JustHere ${runId}`;
      await wizard.fillBasics({ name, price: "6.5" });
      const { status, itemId } = await wizard.finish();
      expect(status).toBeLessThan(300);
      extraIds.push(itemId!);
      const a = await getMenuItemApi(token, itemId!);
      expect(a.ownerRestaurantId).toBe(locA);
      expect((await rowAt(locA, itemId!))?.source).toBe("RESTAURANT");
      expect(await rowAt(locB, itemId!), "absent at B").toBeUndefined();
      await tab.goto(locA);
      await tab.assertLoaded();
      await tab.expandCategory(CATEGORY);
      await expect(tab.sourceChip(CATEGORY, name, "local")).toBeVisible();
    });

    await allure.step("All my stores", async () => {
      await builder.gotoBuilder(locA);
      await builder.addItemButton(CATEGORY).click();
      await expect(builder.scopeDialog()).toBeVisible({ timeout: 10_000 });
      await builder.chooseItemScope("all");
      await expect(ownerPage).not.toHaveURL(/ownerOnly=1/);
      await wizard.waitForStep0();
      const name = `Chain Everywhere ${runId}`;
      await wizard.fillBasics({ name, price: "6.5" });
      const { status, itemId } = await wizard.finish();
      expect(status).toBeLessThan(300);
      extraIds.push(itemId!);
      expect(
        (await getMenuItemApi(token, itemId!)).ownerRestaurantId ?? null
      ).toBeNull();
      expect((await rowAt(locB, itemId!))?.source, "present at B").toBe(
        "CHAIN"
      );
    });
  });

  test("TC-315: New Category at a location offers 'Just this store' vs 'All my stores' scope", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A's builder, 'New Category' shows the radio 'Who is this category for?' — 'Just this store' (default) " +
        "→ chip 'Only at this location' and the category is absent from B; a second one with 'All my stores " +
        "(shared across 2)' → fan-out confirm 'Heads up — chain-wide change … all 2 locations' → Continue → " +
        "chip 'Shared · all 2 locations' and present at B / chain shell."
    );
    const builder = createOwnerMenuPage(ownerPage);
    const localCat = `Automation Menu Local ${runId}`;
    const sharedCat = `Automation Menu Shared ${runId}`;
    await builder.gotoBuilder(locA);
    await expect(builder.addCategoryButton()).toBeVisible({ timeout: 20_000 });

    await builder.openCategoryDialog();
    await expect(builder.categoryScopeRadio("this")).toBeChecked();
    await builder.categoryNameInput().fill(localCat);
    await builder.categorySaveButton().click();
    await builder.assertCategoryVisible(localCat);
    await expect(builder.categoryChip(localCat, "local")).toBeVisible();

    await builder.openCategoryDialog();
    await builder.categoryScopeRadio("all").check();
    await builder.categoryNameInput().fill(sharedCat);
    await builder.categorySaveButton().click();
    // Shared scope is guarded by the fan-out confirm ("Heads up — chain-wide change").
    const fanOut = ownerPage.getByRole("dialog", {
      name: /Heads up — chain-wide change/,
    });
    await expect(fanOut).toBeVisible({ timeout: 10_000 });
    await expect(fanOut).toContainText("all 2 locations");
    await fanOut.getByRole("button", { name: "Continue" }).click();
    await builder.assertCategoryVisible(sharedCat);
    await expect(builder.categoryChip(sharedCat, "shared")).toBeVisible();

    const groupsB = (
      await getRestaurantMenusApi(locB, { accessToken: token })
    ).menus.flatMap((m) => m.groups.map((g) => g.name));
    expect(groupsB).toContain(sharedCat);
    expect(groupsB).not.toContain(localCat);
    // Cleanup: both are empty → deletable now (sweep catches leftovers).
    const groupsA = (
      await getRestaurantMenusApi(locA, { accessToken: token })
    ).menus.flatMap((m) => m.groups);
    for (const name of [localCat, sharedCat]) {
      const g = groupsA.find((x) => x.name === name);
      if (g) await deleteTestMenuGroup(token, g.id).catch(() => {});
    }
  });

  test("TC-316: featuring a shared item at one location is chain-wide; a local item stays local", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A: star the shared item → PATCH …/featured → B's Menu tab lists it under Featured Items too; star the " +
        "location-only item → only A's Featured accordion has it. Both un-starred afterwards."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    // A fan-out confirm may guard the shared toggle in newer builds.
    const fanOut = ownerPage.getByRole("dialog", {
      name: /Heads up — chain-wide change/,
    });
    await tab.featureButton(CATEGORY, shared.name).click();
    // isVisible() never waits — use waitFor for the optional dialog.
    const guarded = await fanOut
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (guarded) {
      await expect(fanOut).toContainText("all 2 locations");
      await fanOut.getByRole("button", { name: "Continue" }).click();
    }
    await expect(tab.featuredRow(shared.name)).toBeVisible({ timeout: 10_000 });
    const [localRes] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/featured/.test(r.url()) &&
          r.request().method() === "PATCH"
      ),
      tab.featureButton(CATEGORY, local.name).click(),
    ]);
    expect(localRes.status()).toBe(200);
    try {
      await expect(tab.featuredRow(local.name)).toBeVisible({
        timeout: 10_000,
      });
      await tab.goto(locB);
      await tab.assertLoaded();
      await expect(tab.featuredRow(shared.name)).toBeVisible({
        timeout: 15_000,
      });
      await expect(tab.featuredRow(local.name)).toHaveCount(0);
      expect((await rowAt(locB, shared.id))?.featured).toBe(true);
    } finally {
      await setFeaturedRaw(token, shared.id, false);
      await setFeaturedRaw(token, local.id, false);
    }
  });

  test("TC-317: 'Reset all to shared' resets SAVED overrides to the shared prices", async ({
    ownerPage,
  }) => {
    await allure.description(
      "With base 13 / Large 18 saved at A, reopen the $ dialog and click 'Reset all to shared'. Expected: both " +
        "rows read 12.00 / 15.00 with no 'Overridden' chip (was an expected-fail pin until RestauNax #602 fixed " +
        "LocationPricingEditor.resetAll, which re-seeded from the saved override)."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    const dlg = createLocationPricingDialog(ownerPage);
    const detail = await getMenuItemApi(token, shared.id);
    const large = detail.modifierGroups![0]!.modifiers.find(
      (m) => m.name === "Large"
    )!;
    expect(
      (
        await setLocationPricingRaw(token, shared.id, {
          restaurantId: locA,
          basePriceOverride: 13,
          modifierOverrides: [{ modifierId: large.id, priceOverride: 18 }],
        })
      ).status
    ).toBe(200);
    try {
      await tab.goto(locA);
      await tab.assertLoaded();
      await tab.expandCategory(CATEGORY);
      await tab.priceOverrideButton(CATEGORY, shared.name).click();
      await dlg.waitFor();
      await expect(dlg.overriddenChips()).toHaveCount(2);
      await dlg.resetAllButton().click();
      await expect(dlg.basePriceInput()).toHaveValue("12.00");
      await expect(dlg.modifierInput("Large")).toHaveValue("15.00");
      await expect(dlg.overriddenChips()).toHaveCount(0);
    } finally {
      await setLocationPricingRaw(token, shared.id, {
        restaurantId: locA,
        basePriceOverride: null,
        modifierOverrides: [{ modifierId: large.id, priceOverride: null }],
      });
    }
  });

  test("TC-318: the $ dialog overrides a size price per location; row resets clear them", async ({
    ownerPage,
  }) => {
    await allure.description(
      "At A: $ dialog → set Base price 13 and Large 18 → two 'Overridden' chips → Save → PATCH body carries " +
        "basePriceOverride + a modifierOverrides row; A's API read resolves Large=18 (masterPrice 15) and B is " +
        "untouched; reopen → '%' quick-adjust 10 + Apply previews values relative to the SHARED prices " +
        "(13.20 / 16.50 — asserted on the inputs, not saved) → per-row 'Reset to shared price' ×2 → Save → both back to shared."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    const dlg = createLocationPricingDialog(ownerPage);
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await tab.priceOverrideButton(CATEGORY, shared.name).click();
    await dlg.waitFor();
    await dlg.basePriceInput().fill("13");
    await dlg.modifierInput("Large").fill("18");
    await expect(dlg.overriddenChips()).toHaveCount(2);
    const { status, body } = await dlg.save();
    expect(status).toBe(200);
    expect(body.basePriceOverride).toBe(13);
    expect(body.modifierOverrides?.some((m) => m.priceOverride === 18)).toBe(
      true
    );
    try {
      const a = await rowAt(locA, shared.id);
      const largeA = a?.modifierGroups?.[0]?.modifiers.find(
        (m) => m.name === "Large"
      );
      expect(a?.price).toBe(13);
      expect(largeA?.price).toBe(18);
      const b = await rowAt(locB, shared.id);
      expect(b?.price).toBe(12);
      expect(
        b?.modifierGroups?.[0]?.modifiers.find((m) => m.name === "Large")?.price
      ).toBe(15);

      // Quick-adjust preview.
      await tab.expandCategory(CATEGORY);
      await tab.priceOverrideButton(CATEGORY, shared.name).click();
      await dlg.waitFor();
      await dlg.adjustModeButton("%").click();
      await dlg.adjustInput().fill("10");
      await dlg.applyButton().click();
      // "Adjust all by" is relative to the SHARED price (12 / 15), not the
      // current override — 12 × 1.1 = 13.20, 15 × 1.1 = 16.50.
      await expect(dlg.basePriceInput()).toHaveValue(/^13\.2/);
      await expect(dlg.modifierInput("Large")).toHaveValue(/^16\.5/);
      // Row-level "Reset to shared price" on both overridden rows → Save.
      // ("Reset all to shared" is pinned separately — TC-317.)
      // The quick-adjust also bumped Small → three overridden rows; reset each.
      await expect(dlg.resetRowButtons()).toHaveCount(3);
      for (let i = 0; i < 3; i++) await dlg.resetRowButtons().first().click();
      await expect(dlg.overriddenChips()).toHaveCount(0);
      const reset = await dlg.save();
      expect(reset.status).toBe(200);
      expect(reset.body.basePriceOverride).toBeNull();
      expect(
        reset.body.modifierOverrides?.every((m) => m.priceOverride === null)
      ).toBe(true);
    } finally {
      await setLocationPricingRaw(token, shared.id, {
        restaurantId: locA,
        basePriceOverride: null,
      });
      await setPriceOverrideRaw(token, shared.id, {
        restaurantId: locA,
        priceOverride: null,
      });
    }
    const a2 = await rowAt(locA, shared.id);
    expect(a2?.price).toBe(12);
    expect(
      a2?.modifierGroups?.[0]?.modifiers.find((m) => m.name === "Large")?.price
    ).toBe(15);
  });

  test("TC-319: 'Manage shared menu' from the chain shell opens a chain-aware LOCATION builder (no separate chain builder)", async ({
    ownerPage,
  }) => {
    await allure.description(
      "By design (MenuManagementPage.handleManageMenu) there is no chain-scoped builder route: 'Manage shared " +
        "menu (all locations)' lands on the builder of the location in focus (/restaurant/restaurantId/<member>), " +
        "whose scope bar reads 'Editing menu for: <member> … this location only' with 'Switch to all 2 locations', " +
        "shared categories carry the 'Shared · all 2 locations' chip, and 'New Category' offers the 'Who is this " +
        "category for?' scope radio — the shared menu is managed from here via those scope choices."
    );
    const tab = createMenuAvailabilityPage(ownerPage);
    const builder = createOwnerMenuPage(ownerPage);
    await tab.gotoChain(chainGroupId);
    await tab.assertLoaded();
    await tab.manageMenuButton().click();
    await expect(ownerPage).toHaveURL(
      new RegExp(`/restaurant/restaurantId/(${locA}|${locB})$`),
      { timeout: 20_000 }
    );
    await expect(builder.scopeBarEditingFor()).toBeVisible({ timeout: 20_000 });
    await expect(builder.scopeBarSwitchToShared()).toBeVisible();
    await expect(builder.categoryChip(CATEGORY, "shared")).toBeVisible();
    await builder.openCategoryDialog();
    await expect(
      builder.categoryDialog().getByText("Who is this category for?")
    ).toBeVisible();
    await ownerPage.keyboard.press("Escape");
  });
});
