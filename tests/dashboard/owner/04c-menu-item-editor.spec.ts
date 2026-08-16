/**
 * 04c-menu-item-editor.spec.ts — builder cards, item wizard (modifiers +
 * image), item detail page (Layer 2b). Extends 04-menu-management.spec.ts
 * (TC-19..67: category create/delete, add item, edit name/price, blank-field
 * validation). See docs/MENU_TAB_TEST_STRATEGY.md §3.2–3.4 / §4 (Layer 2b).
 *
 * Own data: a per-run "Automation Menu <id>" category on the seed restaurant;
 * items are created through the real wizard or the API; everything is
 * hard-deleted in afterAll (admin permanent delete → group delete).
 */

import * as path from "path";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerMenuPage } from "../../../pages/dashboard/owner/OwnerMenuPage";
import { createMenuItemWizardPage } from "../../../pages/dashboard/restaurant/MenuItemWizardPage";
import { createMenuItemDetailPage } from "../../../pages/dashboard/restaurant/MenuItemDetailPage";
import { createMenuAvailabilityPage } from "../../../pages/dashboard/restaurant/MenuManagementPage";
import { readSharedState, generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  getMenuItemApi,
  getMenuItemRaw,
  getRestaurantMenuGroups,
  getRestaurantMenusApi,
  flattenMenuItems,
  deleteTestMenuGroup,
  deleteMenuItemRaw,
  permanentlyDeleteMenuItemApi,
  createDealRaw,
  deleteDealApi,
  type ApiDeal,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const PNG_FIXTURE = path.resolve(
  __dirname,
  "../../../fixtures/assets/menu-item.png"
);

test.describe("Owner — Menu builder, item wizard & item detail", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  const CATEGORY = `Automation Menu ${runId}`;
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  // Items created through the UI in this file (id → for detail-page navigation).
  const created: Record<string, string> = {};

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
  });

  test.afterAll(async () => {
    if (!token || !groupId) return;
    const t = await freshToken().catch(() => token);
    // Drain (incl. soft-deleted ids we know about) then delete the group.
    const ids = new Set<string>(Object.values(created));
    const groups = await getRestaurantMenuGroups(t, restaurantId).catch(
      () => []
    );
    for (const it of groups.find((g) => g.id === groupId)?.menuItems ?? [])
      ids.add(it.id);
    for (const id of ids) {
      if (adminToken)
        await permanentlyDeleteMenuItemApi(adminToken, id).catch(() => {});
      else await deleteMenuItemRaw(t, id).catch(() => {});
    }
    await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Menu Management");
    await allure.label("severity", "critical");
    token = await freshToken();
  });

  // ── Builder: category dialog ────────────────────────────────────────────

  test("TC-294: New Category offers presets and refuses a duplicate name", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The 'Add Category' dialog lists preset chips (Appetizers, Desserts, …); typing a name that already " +
        "exists on this menu shows '<name> already exists in category' and the dialog stays open. " +
        "Uses the run's own category name as the duplicate so no real category is touched."
    );
    const builder = createOwnerMenuPage(ownerPage);
    await builder.gotoBuilder(restaurantId);
    await expect(builder.addCategoryButton()).toBeVisible({ timeout: 20_000 });
    await builder.openCategoryDialog();
    for (const preset of ["Appetizers", "Desserts", "Beverages", "Pizza"]) {
      await expect(builder.categoryPreset(preset)).toBeVisible();
    }
    // Preset fills the field.
    await builder.categoryPreset("Desserts").click();
    await expect(builder.categoryNameInput()).toHaveValue("Desserts");
    // Duplicate of our own category.
    await builder.categoryNameInput().fill(CATEGORY);
    await builder.categorySaveButton().click();
    await expect(
      builder.categoryDialog().getByText(/already exists in category/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect(builder.categoryDialog()).toBeVisible();
    await ownerPage.keyboard.press("Escape");
  });

  // ── Wizard: validation, modifiers, image, templates ─────────────────────

  test("TC-295: wizard step 0 enforces name length, price bounds and description length", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Add-item wizard, Basic Information: 1-char name → 'at least 2 characters'; price 0 → 'at least $0.01' " +
        "(the QA build says 'Price must be positive' — both accepted); " +
        "price 10000 → 'cannot exceed $9,999.99'; 501-char description → 'cannot exceed 500 characters'; " +
        "Next stays disabled while any error is present and enables once all fields are valid."
    );
    const wizard = createMenuItemWizardPage(ownerPage);
    await wizard.gotoCreate(restaurantId, groupId);
    await wizard.waitForStep0();

    await wizard.fillBasics({
      name: "A",
      price: "0",
      description: "x".repeat(501),
    });
    await expect(wizard.fieldErrors()).toContainText([
      /at least 2 characters/,
      /at least \$0\.01|must be positive/,
      /cannot exceed 500 characters/,
    ]);
    await expect(wizard.nextButton()).toBeDisabled();

    await wizard.fillBasics({ price: "10000" });
    await expect(wizard.fieldErrors()).toContainText([
      /cannot exceed \$9,999\.99/,
    ]);
    await expect(wizard.nextButton()).toBeDisabled();

    await wizard.fillBasics({
      name: `Valid ${runId}`,
      price: "9.99",
      description: "ok",
    });
    await expect(wizard.nextButton()).toBeEnabled({ timeout: 10_000 });
  });

  test("TC-296: the wizard saves an item with a Sets-Final-Price size group, a paid extra and a free group", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Add-item wizard end to end: Basic Information → three modifier groups (Size = Sets Final Price, " +
        "min1/max1, Small default + Large; Extras = Adds to Price with Allow Multiples; Remove = Free) → " +
        "skip image → Review auto-saves. The item detail page lists the groups under 'Customization " +
        "Options' with Min/Max and the API stores the pricing modes and prices as entered (Free options at $0)."
    );
    const wizard = createMenuItemWizardPage(ownerPage);
    const name = `Wizard Mods ${runId}`;
    await wizard.gotoCreate(restaurantId, groupId);
    await wizard.waitForStep0();
    await wizard.fillBasics({
      name,
      price: "8.5",
      description: "Wizard modifiers item",
    });
    await wizard.next();
    await wizard.assertOnStep(1);

    await allure.step("Add 3 modifier groups", async () => {
      await wizard.addModifierGroup({
        name: "Size",
        pricing: "Sets Final Price",
        min: 1,
        max: 1,
        options: [
          { name: "Small", price: 8.5, isDefault: true },
          { name: "Large", price: 11 },
        ],
      });
      await wizard.addModifierGroup({
        name: "Extras",
        pricing: "Adds to Price (+$)",
        min: 0,
        max: 3,
        options: [{ name: "Cheese", price: 1.5, allowMultiples: true }],
      });
      await wizard.addModifierGroup({
        name: "Remove",
        pricing: "Free / Included",
        options: [{ name: "No onions" }, { name: "No pickles" }],
      });
    });

    const { status, itemId } = await wizard.finish();
    expect(status, "create status").toBeLessThan(300);
    expect(itemId).toBeTruthy();
    created[name] = itemId!;
    await expect(wizard.successToast("created")).toBeVisible({
      timeout: 15_000,
    });

    await allure.step("API stored modes/prices", async () => {
      const item = await getMenuItemApi(token, itemId!);
      const byName = Object.fromEntries(
        (item.modifierGroups ?? []).map((g) => [g.name, g])
      );
      expect(byName["Size"]?.pricingMode).toBe("REPLACES_PRICE");
      expect(byName["Size"]?.minSelections).toBe(1);
      expect(byName["Size"]?.maxSelections).toBe(1);
      expect(
        byName["Size"]?.modifiers.find((m) => m.name === "Small")?.isDefault
      ).toBe(true);
      expect(
        byName["Size"]?.modifiers.find((m) => m.name === "Large")?.price
      ).toBe(11);
      expect(byName["Extras"]?.pricingMode).toBe("ADJUSTS_PRICE");
      expect(byName["Extras"]?.modifiers[0]?.price).toBe(1.5);
      expect(byName["Extras"]?.modifiers[0]?.allowsDuplicates).toBe(true);
      expect(byName["Remove"]?.pricingMode).toBe("INCLUDED");
      expect(byName["Remove"]?.modifiers.map((m) => m.price)).toEqual([0, 0]);
    });

    await allure.step("Detail page shows Customization Options", async () => {
      const detail = createMenuItemDetailPage(ownerPage);
      await detail.goto(restaurantId, groupId, itemId!);
      await expect(detail.title(name)).toBeVisible({ timeout: 20_000 });
      await expect(detail.customizationHeading()).toBeVisible();
      await expect(detail.groupHeading("Size")).toBeVisible();
      await expect(detail.minMaxText("Min: 1 / Max: 1")).toBeVisible();
      await expect(detail.groupHeading("Extras")).toBeVisible();
      await expect(detail.groupHeading("Remove")).toBeVisible();
      await expect(detail.optionChip(/Large/)).toBeVisible();
    });
  });

  test("TC-297: the wizard uploads an image from the Image step and the item carries it", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Add-item wizard: Basic Information → skip modifiers → Image Upload via the hidden file input " +
        "(fixtures/assets/menu-item.png) → 'View image' / 'Remove image' controls appear → Review saves " +
        "the item and POSTs /upload/menu/item/picture/:id. The detail page shows the image and " +
        "GET /menu/itemId/:id has imageUrls."
    );
    const wizard = createMenuItemWizardPage(ownerPage);
    const name = `Wizard Image ${runId}`;
    await wizard.gotoCreate(restaurantId, groupId);
    await wizard.waitForStep0();
    await wizard.fillBasics({ name, price: "6.75" });
    await wizard.next();
    await wizard.assertOnStep(1);
    await wizard.next();
    await wizard.assertOnStep(2);
    await wizard.uploadImage(PNG_FIXTURE);

    const upload = ownerPage.waitForResponse(
      (r) =>
        /\/upload\/menu\/item\/picture\//.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 30_000 }
    );
    const { status, itemId } = await wizard.finish();
    expect(status).toBeLessThan(300);
    created[name] = itemId!;
    expect((await upload).status(), "image upload").toBeLessThan(300);

    const item = await getMenuItemApi(token, itemId!);
    expect(item.imageUrls, "imageUrls stored").toBeTruthy();
    const detail = createMenuItemDetailPage(ownerPage);
    await detail.goto(restaurantId, groupId, itemId!);
    await expect(detail.title(name)).toBeVisible({ timeout: 20_000 });
    await expect(detail.removeImageButton()).toBeVisible({ timeout: 10_000 });
  });

  test("TC-298: 'Start from a Template' prefills name and price from the gallery", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Add-item wizard step 0 → 'Browse Templates' → 'Menu Item Templates' gallery (lazy per cuisine) → Pizza → search 'pizza' → " +
        "'Use This Item' on the first result → the Item Name and Base Price fields are prefilled (no save)."
    );
    const wizard = createMenuItemWizardPage(ownerPage);
    await wizard.gotoCreate(restaurantId, groupId);
    await wizard.waitForStep0();
    await wizard.browseTemplatesButton().click();
    const gallery = ownerPage
      .getByRole("dialog")
      .filter({ hasText: "Menu Item Templates" });
    await expect(gallery).toBeVisible({ timeout: 10_000 });
    // Templates load lazily per cuisine ("Showing 0 of N templates. Pick a
    // cuisine tab to load it…") — the tab is named "🍕 Pizza 6 items".
    await gallery.getByRole("tab", { name: /Pizza/ }).click();
    const use = gallery.getByRole("button", { name: "Use This Item" }).first();
    await expect(use).toBeVisible({ timeout: 10_000 });
    await use.click();
    await expect(gallery).toBeHidden({ timeout: 10_000 });
    await expect(wizard.nameInput()).not.toHaveValue("");
    await expect(wizard.priceInput()).not.toHaveValue("");
    // Template names vary ("Margherita", "Pepperoni…"); just assert prefilled.
  });

  // ── Cards: clone, detail navigation, featured ───────────────────────────

  test("TC-299: Clone Item opens a prefilled wizard and saves a second, independent item", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Card 'Clone Item' (data-testid menu-item-clone) → wizard at ?cloneFrom=<id> prefilled with '<name> (Copy)' " +
        "and the source price → rename → save → two cards exist and the clone has its own id."
    );
    const source = await createMenuItemFull(
      token,
      groupId,
      `Clone Source ${runId}`,
      5.25,
      {
        description: "clone me",
      }
    );
    created[source.name] = source.id;
    const builder = createOwnerMenuPage(ownerPage);
    const wizard = createMenuItemWizardPage(ownerPage);
    await builder.gotoBuilder(restaurantId);
    await builder.activateCategory(CATEGORY);
    await builder.cloneItemButton(source.name).click();
    await expect(ownerPage).toHaveURL(new RegExp(`cloneFrom=${source.id}`));
    await wizard.waitForStep0();
    // The clone wizard prefills "<source name> (Copy)".
    await expect(wizard.nameInput()).toHaveValue(`${source.name} (Copy)`, {
      timeout: 15_000,
    });
    await expect(wizard.priceInput()).toHaveValue("5.25");
    const cloneName = `Clone Copy ${runId}`;
    await wizard.fillBasics({ name: cloneName });
    const { status, itemId } = await wizard.finish();
    expect(status).toBeLessThan(300);
    expect(itemId).toBeTruthy();
    expect(itemId).not.toBe(source.id);
    created[cloneName] = itemId!;
    await builder.activateCategory(CATEGORY);
    await expect(builder.itemCard(source.name)).toBeVisible({
      timeout: 15_000,
    });
    await expect(builder.itemCard(cloneName)).toBeVisible();
  });

  test("TC-300: clicking a card opens the item detail page; Edit opens the edit wizard", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Builder card body click → …/groupId/:gid/itemId/:iid with the item's name and price rendered and " +
        "the bottom bar (Preview / Edit / Delete). 'Edit' → …/edit wizard with the name prefilled; browser " +
        "Back returns to the detail page."
    );
    const item = await createMenuItemFull(
      token,
      groupId,
      `Detail Nav ${runId}`,
      4.5,
      {
        description: "detail navigation",
      }
    );
    created[item.name] = item.id;
    const builder = createOwnerMenuPage(ownerPage);
    const detail = createMenuItemDetailPage(ownerPage);
    const wizard = createMenuItemWizardPage(ownerPage);
    await builder.gotoBuilder(restaurantId);
    await builder.activateCategory(CATEGORY);
    await builder.openItemDetail(item.name);
    await expect(ownerPage).toHaveURL(
      new RegExp(`/groupId/${groupId}/itemId/${item.id}$`)
    );
    await expect(detail.title(item.name)).toBeVisible({ timeout: 20_000 });
    await expect(detail.price("$4.5")).toBeVisible();
    await expect(detail.previewButton()).toBeVisible();
    await expect(detail.deleteButton()).toBeVisible();
    await detail.editButton().click();
    await expect(ownerPage).toHaveURL(/\/edit$/);
    await wizard.waitForStep0();
    await expect(wizard.nameInput()).toHaveValue(item.name, {
      timeout: 15_000,
    });
    await ownerPage.goBack();
    await expect(detail.title(item.name)).toBeVisible({ timeout: 20_000 });
  });

  test("TC-305: the card star toggles featured and the Menu tab's Featured accordion reflects it", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Builder card star → PATCH …/featured {featured:true} → 'Featured' badge on the card and the item listed " +
        "under the Menu tab's 'Featured Items' accordion; star again → badge gone."
    );
    const item = await createMenuItemFull(
      token,
      groupId,
      `Card Star ${runId}`,
      4.5
    );
    created[item.name] = item.id;
    const builder = createOwnerMenuPage(ownerPage);
    await builder.gotoBuilder(restaurantId);
    await builder.activateCategory(CATEGORY);
    const [on] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/featured/.test(r.url()) &&
          r.request().method() === "PATCH"
      ),
      builder.cardFeaturedButton(item.name).click(),
    ]);
    expect(on.status()).toBe(200);
    await expect(builder.cardBadge(item.name, "Featured")).toBeVisible({
      timeout: 10_000,
    });

    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(restaurantId);
    await tab.assertLoaded();
    await expect(tab.featuredRow(item.name)).toBeVisible({ timeout: 15_000 });

    await builder.gotoBuilder(restaurantId);
    await builder.activateCategory(CATEGORY);
    const [off] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/featured/.test(r.url()) &&
          r.request().method() === "PATCH"
      ),
      builder.cardFeaturedButton(item.name).click(),
    ]);
    expect(off.status()).toBe(200);
    await expect(builder.cardBadge(item.name, "Featured")).toHaveCount(0);
  });

  // ── Item detail page ────────────────────────────────────────────────────

  test("TC-301: item detail Upload / Remove Image round-trip", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Detail page 'Upload' → hidden file input → POST /upload/menu/item/picture/:id → 'Remove Image' shown; " +
        "'Remove Image' → confirm 'Yes, Remove' → DELETE …/picture → back to the upload-only overlay; " +
        "GET /menu/itemId/:id imageUrls goes truthy then null."
    );
    const item = await createMenuItemFull(
      token,
      groupId,
      `Detail Image ${runId}`,
      4.5
    );
    created[item.name] = item.id;
    const detail = createMenuItemDetailPage(ownerPage);
    await detail.goto(restaurantId, groupId, item.id);
    await expect(detail.title(item.name)).toBeVisible({ timeout: 20_000 });
    await expect(detail.uploadButton()).toBeVisible();

    const up = await detail.uploadImage(PNG_FIXTURE);
    expect(up).toBeLessThan(300);
    await expect(detail.removeImageButton()).toBeVisible({ timeout: 15_000 });
    expect((await getMenuItemApi(token, item.id)).imageUrls).toBeTruthy();

    const del = await detail.removeImage();
    expect(del).toBe(200);
    await expect(detail.removeImageButton()).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(detail.uploadButton()).toBeVisible();
    expect((await getMenuItemApi(token, item.id)).imageUrls ?? null).toBeNull();
  });

  test("TC-302: Delete on the detail page soft-deletes — card badged, hidden from the menu read, detail shows the inactive banner", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Detail 'Delete' → confirm → DELETE /menu/menuItemId/:id (soft: isActive=false) → the builder card gets " +
        "the 'No longer available' badge, the merged-menu read (Menu tab / storefront) hides it, and opening " +
        "the detail URL directly shows 'This item is no longer available. All actions are disabled.' Skips " +
        "with a reason if this owner lacks the Delete button (DELETE_MENU_ITEM)."
    );
    const item = await createMenuItemFull(
      token,
      groupId,
      `Detail Delete ${runId}`,
      4.5
    );
    created[item.name] = item.id;
    const detail = createMenuItemDetailPage(ownerPage);
    const builder = createOwnerMenuPage(ownerPage);
    await detail.goto(restaurantId, groupId, item.id);
    await expect(detail.title(item.name)).toBeVisible({ timeout: 20_000 });
    if (
      !(await detail
        .deleteButton()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(
        true,
        "Owner has no Delete button on the item detail page (DELETE_MENU_ITEM not held)"
      );
    }
    const status = await detail.deleteItem(item.name);
    expect(status).toBe(200);
    expect((await getMenuItemRaw(token, item.id)).data.item?.isActive).toBe(
      false
    );

    await builder.gotoBuilder(restaurantId);
    await builder.activateCategory(CATEGORY);
    // The builder reads /restaurant/restaurantId/:id (inactive items included)
    // and marks the card "No longer available"; the merged-menu read hides it.
    await expect(
      builder.cardBadge(item.name, "No longer available")
    ).toBeVisible({ timeout: 15_000 });
    expect(
      flattenMenuItems((await getRestaurantMenusApi(restaurantId)).menus).find(
        (i) => i.id === item.id
      )
    ).toBeUndefined();

    await detail.goto(restaurantId, groupId, item.id);
    await expect(detail.inactiveBanner()).toBeVisible({ timeout: 20_000 });
  });

  test("TC-303: Delete is blocked with a 'Cannot Delete This Item' dialog while an active deal uses the item", async ({
    ownerPage,
  }) => {
    await allure.description(
      "An ACTIVE deal (API-seeded) references the item → detail 'Delete' → confirm → backend 409 → dialog " +
        "'Cannot Delete This Item' listing the deal under 'Active Deals' → OK; the item stays active."
    );
    const item = await createMenuItemFull(
      token,
      groupId,
      `Detail Blocked ${runId}`,
      9
    );
    created[item.name] = item.id;
    const dealName = `AUTO Blocker ${runId}`;
    const dealRes = await createDealRaw(token, restaurantId, {
      name: dealName,
      description: "Automation delete-blocker deal — safe to delete",
      dealPrice: 7,
      items: [
        {
          menuItemId: item.id,
          quantity: 1,
          itemName: item.name,
          itemPrice: 9,
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
      const detail = createMenuItemDetailPage(ownerPage);
      await detail.goto(restaurantId, groupId, item.id);
      await expect(detail.title(item.name)).toBeVisible({ timeout: 20_000 });
      const status = await detail.deleteItem(item.name);
      expect(status).toBe(409);
      const blocked = detail.blockedDialog();
      await expect(blocked).toBeVisible({ timeout: 10_000 });
      await expect(blocked).toContainText("Active Deals");
      await expect(blocked).toContainText(dealName);
      await blocked.getByRole("button", { name: "OK" }).click();
      await expect(blocked).toBeHidden();
      expect((await getMenuItemRaw(token, item.id)).data.item?.isActive).toBe(
        true
      );
    } finally {
      await deleteDealApi(token, dealId).catch(() => {});
    }
  });

  test("TC-304: Reorder modifiers — keyboard drag in the sheet persists the new order", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Detail 'Reorder modifiers' opens the dnd-kit sheet; focusing 'Drag to reorder Small' and pressing " +
        "Space, ArrowDown, Space moves it below Large; 'Save order' → PUT …/modifier-order → toast " +
        "'Modifier order saved' and GET /menu/itemId/:id returns Large before Small."
    );
    const item = await createMenuItemFull(
      token,
      groupId,
      `Detail Reorder ${runId}`,
      5,
      {
        modifierGroups: [
          {
            name: "Size",
            pricingMode: "REPLACES_PRICE",
            minSelections: 1,
            maxSelections: 1,
            modifiers: [
              { name: "Small", price: 5 },
              { name: "Large", price: 7 },
            ],
          },
        ],
      }
    );
    created[item.name] = item.id;
    const detail = createMenuItemDetailPage(ownerPage);
    await detail.goto(restaurantId, groupId, item.id);
    await expect(detail.title(item.name)).toBeVisible({ timeout: 20_000 });
    await detail.reorderButton().click();
    await expect(detail.reorderSheet()).toBeVisible({ timeout: 10_000 });
    await detail.keyboardMove("Small", "down");
    const status = await detail.saveOrder();
    expect(status).toBe(200);
    await expect(detail.orderSavedToast()).toBeVisible({ timeout: 10_000 });
    const after = await getMenuItemApi(token, item.id);
    const mods = [...(after.modifierGroups?.[0]?.modifiers ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    expect(mods.map((m) => m.name)).toEqual(["Large", "Small"]);
  });

  // ── Presence smokes ─────────────────────────────────────────────────────

  test("TC-306: the Clone Menu dialog opens with its source-restaurant step (smoke, no clone)", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Builder 'Clone Menu' → dialog 'Clone Menu Items' with 'Step 1: Select Source Restaurant'. Closed without " +
        "cloning — the actual clone rules are API-covered (TC-280 refuses chain targets)."
    );
    const builder = createOwnerMenuPage(ownerPage);
    await builder.gotoBuilder(restaurantId);
    await builder.cloneMenuButton().click();
    await expect(builder.cloneMenuDialog()).toBeVisible({ timeout: 10_000 });
    await expect(builder.cloneMenuDialog()).toContainText(
      /Select Source Restaurant/i
    );
    await ownerPage.keyboard.press("Escape");
    await expect(builder.cloneMenuDialog()).toBeHidden({ timeout: 10_000 });
  });

  test("TC-307: AI entry points open their dialogs (presence only — nothing is generated)", async ({
    ownerPage,
  }) => {
    await allure.description(
      "'Generate Menu' → 'AI Menu Import' (Upload File / Import from URL); 'Generate Images' → 'Bulk AI Image " +
        "Generation'; wizard 'Paste Text' → 'Paste Menu Item'. Each is closed without submitting."
    );
    const builder = createOwnerMenuPage(ownerPage);
    const wizard = createMenuItemWizardPage(ownerPage);
    await builder.gotoBuilder(restaurantId);
    await builder.generateMenuButton().click();
    const aiImport = ownerPage
      .getByRole("dialog")
      .filter({ hasText: "AI Menu Import" });
    await expect(aiImport).toBeVisible({ timeout: 10_000 });
    await expect(
      aiImport.getByRole("tab", { name: /Upload File/ })
    ).toBeVisible();
    await expect(
      aiImport.getByRole("tab", { name: /Import from URL/ })
    ).toBeVisible();
    await ownerPage.keyboard.press("Escape");
    await expect(aiImport).toBeHidden({ timeout: 10_000 });

    await builder.generateImagesButton().click();
    const bulk = ownerPage
      .getByRole("dialog")
      .filter({ hasText: "Bulk AI Image Generation" });
    await expect(bulk).toBeVisible({ timeout: 10_000 });
    await ownerPage.keyboard.press("Escape");
    await expect(bulk).toBeHidden({ timeout: 10_000 });

    await wizard.gotoCreate(restaurantId, groupId);
    await wizard.waitForStep0();
    await wizard.pasteTextButton().click();
    const paste = ownerPage
      .getByRole("dialog")
      .filter({ hasText: "Paste Menu Item" });
    await expect(paste).toBeVisible({ timeout: 10_000 });
    await expect(
      paste.getByRole("button", { name: "Analyze with AI" })
    ).toBeVisible();
    await ownerPage.keyboard.press("Escape");
  });
});
