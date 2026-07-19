import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerDealPage } from "../../pages/customer/CustomerDealPage";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import {
  readSharedState,
  readRestaurantId,
  generateRunId,
} from "../../utils/testData";
import {
  apiLogin,
  createDealRaw,
  deleteDealApi,
  type ApiDeal,
} from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// ── Deal builder + deal↔coupon exclusion — the deal purchase path had zero
// coverage. One own single-slot deal on the seed menu item (no day/time
// restrictions → always active), AUTO-prefixed so globalTeardown's deal
// sweep backstops the afterAll delete.
test.describe("Customer — Deals", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  let ownerToken = "";
  let dealId = "";
  let dealName = "";

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    ownerToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    dealName = `AUTO Deal ${generateRunId()}`;
    const res = await createDealRaw(ownerToken, restaurantId, {
      name: dealName,
      description: "Automation deal — safe to delete",
      // Below the item price (there must be savings) but well above Stripe's
      // $0.50 floor.
      dealPrice: Math.max(1, Math.round((menuItemPrice - 2) * 100) / 100),
      items: [
        {
          menuItemId,
          quantity: 1,
          itemName: menuItemName,
          itemPrice: menuItemPrice,
          isRequired: true,
        },
      ],
    });
    expect(res.ok, `deal seed failed: ${JSON.stringify(res.data)}`).toBe(true);
    dealId = (res.data as { deal: ApiDeal }).deal.id;
  });

  test.afterAll(async () => {
    if (!ownerToken || !dealId) return;
    await deleteDealApi(ownerToken, dealId);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-195: the deal builder auto-adds the deal and completing its slot enables checkout", async ({
    page,
  }) => {
    await allure.description(
      "Opening /deals/<id> auto-adds the deal to the cart and shows per-slot progress " +
        "('0 of 1 items added'); picking the slot item via 'Add to Deal' completes it " +
        "('Deal Complete!') and checkout offers the normal Proceed to Payment button."
    );

    const restaurantId = readRestaurantId();
    const { menuItemName } = readSharedState();
    const dealPage = createCustomerDealPage(page);
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Open the deal builder — deal auto-added", async () => {
      await dealPage.gotoBuilder(restaurantId, dealId);
      await dealPage.assertProgress(0, 1);
      await allure.parameter("Deal", dealName);
    });

    await allure.step("Fill the slot via Add to Deal", async () => {
      await dealPage.openSlot(menuItemName);
      await dealPage.clickAddToDeal();
      await dealPage.assertDealComplete();
    });

    await allure.step(
      "Checkout shows the normal Proceed to Payment button",
      async () => {
        // The cart (deal included) rides sessionStorage into this navigation.
        await checkoutPage.gotoCheckoutEmpty(restaurantId);
        await expect(checkoutPage.proceedToPaymentButton()).toBeVisible({
          timeout: 15_000,
        });
      }
    );
  });

  test("TC-196: an incomplete deal blocks checkout with 'Complete Deals to Continue'", async ({
    page,
  }) => {
    await allure.description(
      "With the deal auto-added but its slot unfilled, the checkout proceed button is disabled " +
        "and labeled 'Complete Deals to Continue'."
    );

    const restaurantId = readRestaurantId();
    const dealPage = createCustomerDealPage(page);
    const checkoutPage = createCustomerCheckoutPage(page);

    await dealPage.gotoBuilder(restaurantId, dealId);
    await dealPage.assertProgress(0, 1);

    await checkoutPage.gotoCheckoutEmpty(restaurantId);
    const blockedButton = page.getByRole("button", {
      name: "Complete Deals to Continue",
    });
    await expect(blockedButton).toBeVisible({ timeout: 15_000 });
    await expect(blockedButton).toBeDisabled();
  });

  test("TC-197: a coupon cannot be combined with a deal in the cart", async ({
    page,
  }) => {
    await allure.description(
      "With a deal in the cart, attempting to apply any coupon code is blocked client-side with " +
        "'Cannot combine coupons with deals' — the check fires before validation, so no seeded " +
        "coupon is needed."
    );

    const restaurantId = readRestaurantId();
    const dealPage = createCustomerDealPage(page);
    const checkoutPage = createCustomerCheckoutPage(page);

    await dealPage.gotoBuilder(restaurantId, dealId);
    await dealPage.assertProgress(0, 1);

    await checkoutPage.gotoCheckoutEmpty(restaurantId);
    await checkoutPage.applyCoupon(`AUTOX${Date.now()}`);
    await expect(
      page.getByText(/Cannot combine coupons with deals/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Saving \$\d/)).toHaveCount(0);
  });
});
