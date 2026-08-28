/**
 * 09-dual-pricing.spec.ts — Dual pricing on the ONLINE storefront: nothing.
 * A cash price appears only where cash can be tendered; template-wind's
 * checkout is card-only, so a dual-priced restaurant's checkout shows the
 * single posted (card) price, no "cash" wording and no fee line (the
 * pass-through is mutually exclusive with dual pricing). Runs on the shared
 * QA restaurant: admin enrolls + sets the markup, owner enables, everything
 * is restored in a finally.
 *
 * pins → restaunax feat/dual-pricing-v2 (not on QA yet); gate DUAL_PRICING_V2=1.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { readSharedState, readRestaurantId } from "../../utils/testData";
import { apiLogin, updateRestaurantSettingsApi } from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const BACKEND_LANDED = process.env.DUAL_PRICING_V2 === "1";

test.describe("Customer — Dual pricing stays off the online checkout", () => {
  test.skip(
    !TEMPLATE_WIND_URL ||
      !OWNER_EMAIL ||
      !OWNER_PASSWORD ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER + ADMIN creds must all be set in .env"
  );
  test.skip(
    !BACKEND_LANDED,
    "pins → restaunax feat/dual-pricing-v2 — set DUAL_PRICING_V2=1 once it is on QA"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Dual Pricing");
    await allure.label("severity", "critical");
  });

  test("TC-495: a dual-priced restaurant's wind checkout shows the single card price — no cash wording, no fee line", async ({
    page,
  }) => {
    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);
    const owner = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const admin = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;

    try {
      await updateRestaurantSettingsApi(admin, restaurantId, {
        passProcessingFeeToCustomer: false,
        dualPricingEligible: true,
        dualPricingCardMarkup: 0.035,
      });
      await updateRestaurantSettingsApi(owner, restaurantId, {
        dualPricingEnabled: true,
      });

      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
      await expect
        .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
        .toBeGreaterThan(0);
      await checkoutPage.assertNoProcessingFee();
      await expect(page.getByText(/cash (price|discount|total)/i)).toHaveCount(
        0
      );
    } finally {
      await updateRestaurantSettingsApi(owner, restaurantId, {
        dualPricingEnabled: false,
      }).catch(() => {});
      await updateRestaurantSettingsApi(admin, restaurantId, {
        dualPricingEligible: false,
      }).catch(() => {});
    }
  });
});
