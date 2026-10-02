import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerMenuPage } from "../../pages/customer/CustomerMenuPage";
import { createCustomerItemModal } from "../../pages/customer/CustomerItemModal";
import { readRestaurantId, generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createTestMenuGroup,
  createMenuItemRaw,
  deleteTestMenuGroupWithItems,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

// ── ItemModal modifier rules — the storefront's richest client-side logic,
// previously untested. Items are seeded with INLINE modifierGroups on the
// item-create endpoint (POST /menu/item/new accepts NewModifierGroup[]:
// {name, minSelections, maxSelections, pricingMode, modifiers[]}, each
// modifier {name, price, selected, allowsDuplicates, outOfStock, isDefault}).
// One own "Automation Items" group holds all four items; deleted in afterAll
// with the admin token (permanent item deletes — soft-deleted items still
// block category deletion) and backstopped by globalTeardown's sweep.
test.describe("Customer — Item Modifiers", () => {
  test.skip(
    !TEMPLATE_WIND_URL ||
      !OWNER_EMAIL ||
      !OWNER_PASSWORD ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL/PASSWORD, and ADMIN_EMAIL/PASSWORD must all be set in .env"
  );

  const runId = generateRunId();
  // Modifier option names are unique per run so getByRole name matching can
  // never collide with anything else on the page (or a parallel run's data).
  const OPT = {
    alpha: `Option Alpha ${runId}`,
    beta: `Option Beta ${runId}`,
    topping1: `Topping One ${runId}`,
    topping2: `Topping Two ${runId}`,
    topping3: `Topping Three ${runId}`,
    cheese: `Extra Cheese ${runId}`,
    small: `Size Small ${runId}`,
    large: `Size Large ${runId}`,
  };

  let ownerToken = "";
  let adminToken = "";
  let groupId = "";
  let requiredItem: ApiMenuItem | null = null;
  let limitItem: ApiMenuItem | null = null;
  let extrasItem: ApiMenuItem | null = null;
  let sizeItem: ApiMenuItem | null = null;

  const seedItem = async (
    name: string,
    modifierGroups: unknown[]
  ): Promise<ApiMenuItem> => {
    const res = await createMenuItemRaw(ownerToken, {
      name,
      price: 10,
      groupId,
      modifierGroups,
    });
    expect(res.ok, `item seed failed: ${JSON.stringify(res.data)}`).toBe(true);
    return (res.data as { menuItem: ApiMenuItem }).menuItem;
  };

  const modifier = (
    name: string,
    price: number,
    overrides: Record<string, unknown> = {}
  ) => ({
    name,
    price,
    selected: false,
    allowsDuplicates: false,
    outOfStock: false,
    isDefault: false,
    ...overrides,
  });

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    ownerToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const restaurantId = readRestaurantId();
    const group = await createTestMenuGroup(ownerToken, restaurantId);
    groupId = group.id;

    requiredItem = await seedItem(`AUTO Mod Required ${runId}`, [
      {
        name: `Choose One ${runId}`,
        minSelections: 1,
        maxSelections: 1,
        pricingMode: "ADJUSTS_PRICE",
        modifiers: [modifier(OPT.alpha, 0), modifier(OPT.beta, 1.5)],
      },
    ]);
    limitItem = await seedItem(`AUTO Mod Limit ${runId}`, [
      {
        name: `Pick Up To Two ${runId}`,
        minSelections: 0,
        maxSelections: 2,
        pricingMode: "ADJUSTS_PRICE",
        modifiers: [
          modifier(OPT.topping1, 1),
          modifier(OPT.topping2, 1),
          modifier(OPT.topping3, 1),
        ],
      },
    ]);
    extrasItem = await seedItem(`AUTO Mod Extras ${runId}`, [
      {
        name: `Extras ${runId}`,
        minSelections: 0,
        maxSelections: 5,
        pricingMode: "ADJUSTS_PRICE",
        modifiers: [modifier(OPT.cheese, 1.5, { allowsDuplicates: true })],
      },
    ]);
    sizeItem = await seedItem(`AUTO Mod Size ${runId}`, [
      {
        name: `Size ${runId}`,
        minSelections: 1,
        maxSelections: 1,
        pricingMode: "REPLACES_PRICE",
        modifiers: [
          modifier(OPT.small, 8, { isDefault: true, selected: true }),
          modifier(OPT.large, 12),
        ],
      },
    ]);
  });

  test.afterAll(async () => {
    if (!ownerToken || !groupId) return;
    await deleteTestMenuGroupWithItems(
      ownerToken,
      readRestaurantId(),
      groupId,
      adminToken
    );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  const openItem = async (
    page: Parameters<typeof createCustomerMenuPage>[0],
    item: ApiMenuItem | null
  ) => {
    expect(item, "seed item missing — beforeAll failed").not.toBeNull();
    const menuPage = createCustomerMenuPage(page);
    await menuPage.gotoWithItem(readRestaurantId(), item!.id);
    await menuPage.assertItemModalOpen();
  };

  test("TC-189: a required modifier group blocks Add to Cart until a selection is made", async ({
    page,
  }) => {
    await allure.description(
      "A minSelections=1 group with no default: the group shows its Required pill and Add to Cart " +
        "stays disabled; picking an option enables it."
    );

    await openItem(page, requiredItem);
    const modal = createCustomerItemModal(page);

    await allure.step("Required pill shown, Add to Cart disabled", async () => {
      await modal.assertRequiredPillVisible();
      await modal.assertAddToCartDisabled();
    });

    await allure.step("Selecting an option enables Add to Cart", async () => {
      await modal.selectOption(OPT.alpha);
      await modal.assertAddToCartEnabled();
    });
  });

  test("TC-190: a maxSelections=1 group behaves as a radio — picking B replaces A", async ({
    page,
  }) => {
    await allure.description(
      "Single-select groups render real radio inputs sharing one name: choosing a second option " +
        "deselects the first."
    );

    await openItem(page, requiredItem);
    const modal = createCustomerItemModal(page);

    await modal.selectOption(OPT.alpha);
    await modal.assertOptionChecked(OPT.alpha);

    await modal.selectOption(OPT.beta);
    await modal.assertOptionChecked(OPT.beta);
    await modal.assertOptionUnchecked(OPT.alpha);
  });

  test("TC-191: maxSelections caps a multi-select group — remaining options disable at the cap", async ({
    page,
  }) => {
    await allure.description(
      "A maxSelections=2 checkbox group: after two selections the third, unchecked option is " +
        "disabled (and un-checking frees it again)."
    );

    await openItem(page, limitItem);
    const modal = createCustomerItemModal(page);

    await modal.selectOption(OPT.topping1);
    await modal.selectOption(OPT.topping2);
    await modal.assertOptionDisabled(OPT.topping3);
  });

  test("TC-192: an ADJUSTS_PRICE modifier adds its price to the item total", async ({
    page,
  }) => {
    await allure.description(
      "Base $10.00 item + $1.50 ADJUSTS_PRICE add-on → the Add to Cart label's live price reads " +
        "$11.50."
    );

    await openItem(page, extrasItem);
    const modal = createCustomerItemModal(page);

    await modal.assertPrice("10.00");
    await modal.selectOption(OPT.cheese);
    await modal.assertPrice("11.50");
  });

  test("TC-193: a REPLACES_PRICE modifier overrides the base price", async ({
    page,
  }) => {
    await allure.description(
      "REPLACES_PRICE size group on a $10.00 item: the default Small ($8.00) prices the item at " +
        "$8.00; switching to Large reprices to $12.00 — the base price is replaced, not adjusted."
    );

    await openItem(page, sizeItem);
    const modal = createCustomerItemModal(page);

    await modal.assertPrice("8.00");
    await modal.selectOption(OPT.large);
    await modal.assertPrice("12.00");
  });

  test("TC-194: an allowsDuplicates modifier's quantity stepper multiplies its price", async ({
    page,
  }) => {
    await allure.description(
      "Selecting an allowsDuplicates modifier reveals its Qty stepper; bumping quantity to 2 " +
        "doubles that modifier's contribution ($10.00 + 2 × $1.50 = $13.00)."
    );

    await openItem(page, extrasItem);
    const modal = createCustomerItemModal(page);

    await modal.selectOption(OPT.cheese);
    await modal.assertPrice("11.50");

    await modal.increaseQty();
    await modal.assertQty(2);
    await modal.assertPrice("13.00");
  });
});
