import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerDealPage } from "../../pages/customer/CustomerDealPage";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import {
  readSharedState,
  readRestaurantId,
  generateRunId,
  generateCouponCode,
} from "../../utils/testData";
import {
  apiLogin,
  createDealApiCapSafe,
  createCouponRaw,
  deleteDealRaw,
} from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// ── Deal builder + deal↔coupon exclusion — the deal purchase path had zero
// coverage. Each test creates its own single-slot deal on the seed menu item
// (no day/time restrictions → always active) cap-safe — it waits for one of
// the seed restaurant's 10 ACTIVE slots — and deletes it in its `finally`, so
// the file holds a slot only while a test runs (TEST_PLAN.md → "Seed-restaurant
// deal budget"). AUTO-prefixed so globalTeardown's deal sweep backstops a
// delete that never ran.
//
// Guided deal types (restaunax DEAL_TYPES.md): a one-item COMBO is now refused
// (comboNeedsTwoItems), so the single slot is seeded as a PERCENT_OFF deal —
// still ONE slot, so the "0 of 1" builder assertions are unchanged. The body
// also carries the same price as dealPrice, which a pre-deploy backend (no
// dealType) uses and the new backend ignores (it computes it) — so the seed
// works on both sides of the deploy.
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
  });

  /**
   * Creates this test's deal (sets dealId / dealName), runs `fn`, and deletes
   * the deal in `finally` — a refused delete fails the test unless the test
   * already failed (then the original error wins and the sweep backstops).
   */
  const withDeal = async (fn: () => Promise<void>) => {
    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    dealName = `AUTO Deal ${generateRunId()}`;
    const percent = 20;
    // Throws on any refusal other than the cap (which it waits out).
    const deal = await createDealApiCapSafe(
      ownerToken,
      restaurantId,
      dealName,
      // What the server computes for 20% off; only a pre-deploy backend reads it.
      Math.round(menuItemPrice * (1 - percent / 100) * 100) / 100,
      [{ id: menuItemId, name: menuItemName, price: menuItemPrice }],
      { dealType: "PERCENT_OFF", discountPercent: percent }
    );
    dealId = deal.id;
    // Resolves to why the delete was refused, or null when it went through.
    const release = async (): Promise<string | null> => {
      const res = await deleteDealRaw(ownerToken, dealId);
      return res.ok || res.status === 404
        ? null
        : `deal ${dealId} delete → ${res.status} ${JSON.stringify(res.data)}`;
    };
    try {
      await fn();
    } catch (err) {
      // The test's own failure is the one to report; teardown sweeps AUTO deals.
      const why = await release();
      if (why) console.warn(`[06-deals] ${why}`);
      throw err;
    }
    const why = await release();
    if (why) throw new Error(why);
  };

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-195: the deal builder auto-adds the deal and completing its slot enables checkout @smoke", async ({
    page,
  }) => {
    await withDeal(async () => {
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
  });

  test("TC-196: an incomplete deal blocks checkout with 'Complete Deals to Continue'", async ({
    page,
  }) => {
    await withDeal(async () => {
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
  });

  test("TC-197: a coupon cannot be combined with a deal in the cart", async ({
    page,
  }) => {
    await withDeal(async () => {
      await allure.description(
        "With a completed deal in the cart, applying a real, valid order-level coupon is refused by " +
          "the server's pricing ('Coupons can't be combined with deals…'), shown next to the code, " +
          "and no saving is applied. (Before Promotions the storefront blocked any code client-side " +
          "with 'Cannot combine coupons with deals'; the server is now the one that refuses it.)"
      );

      const restaurantId = readRestaurantId();
      const { menuItemName } = readSharedState();
      const dealPage = createCustomerDealPage(page);
      const checkoutPage = createCustomerCheckoutPage(page);
      const couponCode = generateCouponCode();

      // A real code: the refusal must come from the coupon⊥deal rule, not from
      // "code not found" (the old client-side check needed no coupon at all).
      await allure.step("Seed a valid AUTO percentage coupon", async () => {
        const res = await createCouponRaw(ownerToken, restaurantId, {
          code: couponCode,
          type: "PERCENTAGE",
          value: 10,
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          status: "ACTIVE",
        });
        expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
          true
        );
        await allure.parameter("Coupon", couponCode);
      });

      await allure.step("Put a completed deal in the cart", async () => {
        await dealPage.gotoBuilder(restaurantId, dealId);
        await dealPage.assertProgress(0, 1);
        await dealPage.openSlot(menuItemName);
        await dealPage.clickAddToDeal();
        await dealPage.assertDealComplete();
      });

      await allure.step("Apply the coupon at checkout — refused", async () => {
        await checkoutPage.gotoCheckoutEmpty(restaurantId);
        await checkoutPage.applyCoupon(couponCode);
        // spec: PROMOTIONS.md "Which promotion wins (money rules)" rule 3 — a
        // bundle in the cart is the customer's promotion, order-level food
        // promotions do not apply; "Clients as built (plan 3)" → Storefronts —
        // the entered code's blocking sentence sits next to the code.
        await expect(
          page.getByText(/Coupons can't be combined with deals/i).first()
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/Saving \$\d/)).toHaveCount(0);
      });
    });
  });
});
