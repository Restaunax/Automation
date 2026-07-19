import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import {
  readSharedState,
  readRestaurantId,
  generateCouponCode,
  generateRunId,
  recordGiftCardForCleanup,
} from "../../utils/testData";
import {
  apiLogin,
  createCouponRaw,
  getRestaurantCoupons,
  purchaseGiftCard,
  adjustGiftCardBalance,
  freezeGiftCardApi,
  createTestMenuGroup,
  createMenuItemRaw,
  deleteTestMenuGroupWithItems,
  type ApiMenuItem,
} from "../../utils/apiHelper";
import { STRIPE_CARDS } from "../../utils/stripeCards";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Customer — Checkout", () => {
  // No default here on purpose: Template Wind is deployed per-restaurant, and
  // the qa.restaunax.com root serves the marketing site — the env var must
  // point at a real customer-site deployment.
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-24: customer with pre-seeded cart can reach checkout and see the form", async ({
    page,
  }) => {
    await allure.description(
      "Cart is injected via sessionStorage; customer navigates to /checkout and sees the customer info form."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and navigate to checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("Item", menuItemName);
    });

    await allure.step("Verify checkout form is visible", async () => {
      await checkoutPage.assertFormVisible();
      await allure.parameter("URL", page.url());
    });
  });

  test("TC-25: customer can fill checkout form and proceed to payment step", async ({
    page,
  }) => {
    await allure.description(
      "Customer fills First Name, Last Name, Email, Phone, selects Pickup, and clicks Proceed to Payment. Stripe payment section appears."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and navigate to checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    await allure.step("Fill customer info", async () => {
      await checkoutPage.fillCustomerInfo(
        "Jane",
        "Tester",
        "jane@restaunax-test.com",
        "5559876543"
      );
      await allure.parameter("Name", "Jane Tester");
      await allure.parameter("Email", "jane@restaunax-test.com");
    });

    await allure.step("Select Pickup service type", async () => {
      await checkoutPage.selectPickup();
    });

    await allure.step("Click Proceed to Payment", async () => {
      await checkoutPage.clickProceedToPayment();
    });

    await allure.step("Verify Stripe payment section is visible", async () => {
      await checkoutPage.assertPaymentSectionVisible();
    });
  });

  test("TC-185: /checkout with an empty cart shows the empty-cart message", async ({
    page,
  }) => {
    await allure.description(
      "A customer landing on /checkout without anything in the cart gets the 'Your Cart is Empty' " +
        "screen instead of the checkout form."
    );

    const restaurantId = readRestaurantId();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Open checkout with no cart seeded", async () => {
      await checkoutPage.gotoCheckoutEmpty(restaurantId);
    });

    await allure.step("Verify the empty-cart message renders", async () => {
      await checkoutPage.assertEmptyCart();
    });
  });

  test("TC-186: tip presets and custom tip flow into the server-quoted total", async ({
    page,
  }) => {
    await allure.description(
      "Tip is client-selected but the charged total is the server quote (amountToCharge): raising " +
        "the tip preset raises the quoted Total, zeroing it via the custom input lowers it. Proves " +
        "the tip → /quote round-trip, with no assumptions about tax math."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );

    // Default tip is 15% — wait for the first quote to land and record it.
    let baseTotal = 0;
    await allure.step("Read the default-tip (15%) quoted total", async () => {
      await expect
        .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
        .toBeGreaterThan(0);
      baseTotal = await checkoutPage.readOrderTotal();
      await allure.parameter("Total @15%", `$${baseTotal.toFixed(2)}`);
    });

    await allure.step("Select the 25% preset — total rises", async () => {
      await checkoutPage.selectTipPreset(25);
      await checkoutPage.assertTipTotal((menuItemPrice * 0.25).toFixed(2));
      await expect
        .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
        .toBeGreaterThan(baseTotal);
    });

    await allure.step(
      "Zero the tip via the custom input — total drops",
      async () => {
        await checkoutPage.fillCustomTip("0");
        await checkoutPage.assertTipTotal("0.00");
        await expect
          .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
          .toBeLessThan(baseTotal);
      }
    );
  });
});

// ── Coupon auto-revalidation on cart change — CouponSection re-POSTs
// /api/coupons/validate (500ms debounce) whenever the cart changes and
// removes the coupon if the server now rejects it. Driven here with a
// minOrderAmount coupon: two cart lines clear the minimum, removing one
// drops below it.
test.describe("Customer — Checkout coupon revalidation", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-187: a coupon is auto-removed when the cart drops below its minimum order amount", async ({
    page,
  }) => {
    await allure.description(
      "A minOrderAmount coupon applies while two cart lines clear the minimum; removing one line " +
        "triggers CouponSection's debounced revalidation, the backend 400s ('Order must be at " +
        "least $X'), and the coupon is auto-removed with an explanatory error."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    // Minimum sits between one line (below) and two lines (above).
    const minOrder = Math.round(menuItemPrice * 1.5 * 100) / 100;
    const couponCode = generateCouponCode();

    await allure.step(
      `Seed an AUTO coupon with minOrderAmount $${minOrder}`,
      async () => {
        const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
        const res = await createCouponRaw(accessToken, restaurantId, {
          code: couponCode,
          type: "PERCENTAGE",
          value: 10,
          minOrderAmount: minOrder,
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
        await allure.parameter("minOrderAmount", `$${minOrder}`);
      }
    );

    await allure.step("Seed a two-line cart (above the minimum)", async () => {
      await checkoutPage.seedCartItems(restaurantId, [
        { menuItemId, name: menuItemName, price: menuItemPrice },
        { menuItemId, name: menuItemName, price: menuItemPrice },
      ]);
    });

    await allure.step("Apply the coupon — accepted", async () => {
      await checkoutPage.applyCoupon(couponCode);
      await checkoutPage.assertCouponApplied(couponCode);
    });

    await allure.step(
      "Remove one line — revalidation strips the coupon",
      async () => {
        await checkoutPage.removeFirstCartItem();
        // Backend: "Order must be at least $X to use this coupon"; the
        // section's fallback copy is "Coupon removed: No longer valid…".
        await expect(
          page.getByText(/must be at least|no longer valid/i).first()
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/Saving \$\d/)).toHaveCount(0);
      }
    );
  });
});

// ── Stripe's $0.50 floor — a real cheap item is seeded because the server
// quote reprices the cart from DB prices (sessionStorage prices are never
// trusted). Own "Automation Items" group, deleted in afterAll (and the
// globalTeardown sweep backstops interrupted runs).
test.describe("Customer — Checkout Stripe minimum", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  let ownerToken = "";
  let cheapGroupId = "";
  let cheapItem: ApiMenuItem | null = null;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    ownerToken = accessToken;
    const restaurantId = readRestaurantId();
    const group = await createTestMenuGroup(accessToken, restaurantId);
    cheapGroupId = group.id;
    const res = await createMenuItemRaw(accessToken, {
      name: `AUTO Cheap Item ${generateRunId()}`,
      price: 0.25,
      groupId: group.id,
    });
    expect(res.ok, `cheap item seed failed: ${JSON.stringify(res.data)}`).toBe(
      true
    );
    cheapItem = (res.data as { menuItem: ApiMenuItem }).menuItem;
  });

  test.afterAll(async () => {
    if (!ownerToken || !cheapGroupId) return;
    await deleteTestMenuGroupWithItems(
      ownerToken,
      readRestaurantId(),
      cheapGroupId
    );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-188: a quoted total under Stripe's $0.50 minimum blocks payment", async ({
    page,
  }) => {
    await allure.description(
      "With a $0.25 item (server-quoted total lands between $0.01 and $0.49), checkout disables " +
        "the proceed button — label 'Minimum $0.50 Required' — and shows the explainer banner. " +
        "No order is created."
    );

    expect(cheapItem, "cheap item was not seeded").not.toBeNull();
    const restaurantId = readRestaurantId();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed the cart with the $0.25 item", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        cheapItem!.id,
        cheapItem!.name ?? "AUTO Cheap Item",
        0.25
      );
    });

    await allure.step("Fill the form and select Pickup", async () => {
      await checkoutPage.fillCustomerInfo(
        "Jane",
        "Tester",
        "jane@restaunax-test.com",
        "5559876543"
      );
      await checkoutPage.selectPickup();
    });

    await allure.step("Verify the below-minimum block", async () => {
      await checkoutPage.assertBelowStripeMinimum();
    });
  });
});

// ── Coupon redemption + delivery — the revenue paths the suite was missing.
// Separate describe so the coupon seed's beforeAll is scoped to these tests.
test.describe("Customer — Checkout coupon & delivery", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  // A percentage coupon the customer will redeem at checkout. The AUTO* prefix
  // means globalTeardown's deleteAutomationCoupons sweep cleans it up — no
  // per-file cleanup needed. Seeded via the owner API for determinism.
  let couponCode = "";

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const restaurantId = readRestaurantId();
    couponCode = generateCouponCode();
    const res = await createCouponRaw(accessToken, restaurantId, {
      code: couponCode,
      type: "PERCENTAGE",
      value: 10,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
    });
    expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
      true
    );
    // Confirm it's queryable before the UI tries to validate it.
    const coupons = await getRestaurantCoupons(accessToken, restaurantId);
    expect(coupons.some((c) => c.code === couponCode)).toBe(true);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-125: a valid coupon applied at checkout shows the discount, an invalid one is rejected", async ({
    page,
  }) => {
    await allure.description(
      "The customer coupon-redemption path (previously untested): applying the " +
        "seeded percentage coupon at checkout shows the discount in the order " +
        "summary; a bogus code is rejected with an error and no discount."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and open checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    await allure.step(`Apply valid coupon ${couponCode}`, async () => {
      await checkoutPage.applyCoupon(couponCode);
      await checkoutPage.assertCouponApplied(couponCode);
      await allure.parameter("Coupon", couponCode);
    });

    await allure.step("Apply a bogus coupon and verify rejection", async () => {
      // Reload to clear the applied coupon, then try a code that can't exist.
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
      await checkoutPage.applyCoupon("NOPE" + Date.now());
      await checkoutPage.assertCouponRejected();
    });
  });

  test("TC-126: selecting Delivery drives the address → quote round-trip", async ({
    page,
  }) => {
    await allure.description(
      "Quote-wiring coverage for delivery (not a full delivery order — that " +
        "needs QA's delivery provider + a deliverable address): selecting " +
        "Delivery and entering an address fires /api/delivery/quote and the UI " +
        "resolves to either an available fee or a not-available message. Skips " +
        "cleanly when the restaurant is pickup-only or Google Places yields no " +
        "suggestion (external dependency)."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and open checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    // Delivery is hidden on pickup-only / ship-only restaurants — skip, don't fail.
    const deliveryAvailable = await checkoutPage.isDeliveryAvailable();
    test.skip(
      !deliveryAvailable,
      "This restaurant does not offer Delivery (pickup-only or ship-only)"
    );

    await allure.step("Select Delivery and enter an address", async () => {
      await checkoutPage.selectDelivery();
      await checkoutPage.fillDeliveryAddress("350 5th Ave, New York");
    });

    // Google Places is external — if no suggestion appears, skip rather than fail.
    const suggestion = checkoutPage.firstAddressSuggestion();
    const hasSuggestion = await suggestion
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !hasSuggestion,
      "Google Places returned no suggestion (external dependency unavailable)"
    );

    await allure.step(
      "Pick the suggestion and verify the quote resolved",
      async () => {
        await suggestion.click();
        await checkoutPage.assertDeliveryQuoteResolved();
      }
    );
  });
});

// ── Gift card redemption at checkout — previously zero coverage anywhere in
// the suite. Seeds fixtures via purchaseGiftCard/adjustGiftCardBalance/
// freezeGiftCardApi (public purchase + admin endpoints) rather than driving
// the real purchase UI each time — mirrors createCouponRaw's role for
// coupons (see 04-gift-cards.spec.ts for the purchase-UI coverage itself).
test.describe("Customer — Checkout gift card", () => {
  test.skip(
    !TEMPLATE_WIND_URL ||
      !OWNER_EMAIL ||
      !OWNER_PASSWORD ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL/PASSWORD, and ADMIN_EMAIL/PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-171: a valid gift card applied at checkout shows the discount", async ({
    page,
  }) => {
    await allure.description(
      "Applying a freshly purchased, fully-funded gift card at checkout shows the 'Gift card applied' " +
        "discount summary in the Gift Card box."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    const giftCard = await allure.step("Seed a gift card", async () => {
      const card = await purchaseGiftCard({ restaurantId, amount: 10 });
      recordGiftCardForCleanup(card.id);
      await allure.parameter("Gift card code", card.code);
      return card;
    });

    await allure.step("Seed cart and open checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    await allure.step("Apply the gift card", async () => {
      await checkoutPage.applyGiftCard(giftCard.code);
      await checkoutPage.assertGiftCardApplied();
    });
  });

  test("TC-172: removing an applied gift card clears the discount", async ({
    page,
  }) => {
    await allure.description(
      "After applying a gift card, clicking Remove clears the 'Gift card applied' summary and " +
        "returns to the code-entry state."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    const giftCard = await purchaseGiftCard({ restaurantId, amount: 10 });
    recordGiftCardForCleanup(giftCard.id);

    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );
    await checkoutPage.applyGiftCard(giftCard.code);
    await checkoutPage.assertGiftCardApplied();

    await checkoutPage.removeGiftCard();
    await checkoutPage.assertGiftCardRemoved();
  });

  test("TC-173: an invalid gift card code is rejected", async ({ page }) => {
    await allure.description(
      "Applying a code that doesn't exist shows an error and no discount is applied."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );
    await checkoutPage.applyGiftCard(`NOPE${Date.now()}`);
    await checkoutPage.assertGiftCardRejected();
  });

  test("TC-174: a depleted gift card is rejected", async ({ page }) => {
    await allure.description(
      "A gift card whose balance has been adjusted down to $0 (admin) is rejected at checkout with " +
        "a 'no remaining balance' error."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    const giftCard = await allure.step(
      "Seed a gift card and deplete it to $0 balance",
      async () => {
        const card = await purchaseGiftCard({ restaurantId, amount: 10 });
        recordGiftCardForCleanup(card.id);
        const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
        await adjustGiftCardBalance(
          accessToken,
          card.id,
          -card.currentBalance,
          "Automation: deplete for TC-174"
        );
        return card;
      }
    );

    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );
    await checkoutPage.applyGiftCard(giftCard.code);
    await checkoutPage.assertGiftCardRejected();
  });

  test("TC-175: a frozen gift card is rejected", async ({ page }) => {
    await allure.description(
      "A gift card frozen by an admin is rejected at checkout with a 'frozen' error."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    const giftCard = await allure.step(
      "Seed a gift card and freeze it",
      async () => {
        const card = await purchaseGiftCard({ restaurantId, amount: 10 });
        recordGiftCardForCleanup(card.id);
        const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
        await freezeGiftCardApi(accessToken, card.id);
        return card;
      }
    );

    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );
    await checkoutPage.applyGiftCard(giftCard.code);
    await checkoutPage.assertGiftCardRejected();
  });

  test("TC-176: a coupon and a gift card can both be applied to the same order", async ({
    page,
  }) => {
    await allure.description(
      "The frontend doesn't gate gift-card redemption on whether a coupon is already applied (or vice " +
        "versa) — both discounts show simultaneously. This documents currently-supported behavior; it " +
        "does not touch the separate canCombineWithCoupons config flag, which isn't enforced by either " +
        "side today (see TEST_COVERAGE.md's Known Technical Debt)."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);
    const couponCode = generateCouponCode();
    let giftCardCode = "";

    await allure.step("Seed a coupon and a gift card", async () => {
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      const res = await createCouponRaw(accessToken, restaurantId, {
        code: couponCode,
        type: "PERCENTAGE",
        value: 10,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: "ACTIVE",
      });
      expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
        true
      );
      const giftCard = await purchaseGiftCard({ restaurantId, amount: 10 });
      recordGiftCardForCleanup(giftCard.id);
      giftCardCode = giftCard.code;
    });

    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );

    await allure.step("Apply both the coupon and the gift card", async () => {
      await checkoutPage.applyCoupon(couponCode);
      await checkoutPage.assertCouponApplied(couponCode);
      await checkoutPage.applyGiftCard(giftCardCode);
      await checkoutPage.assertGiftCardApplied();
    });
  });

  // A gift card funded well above the order total should cover the entire
  // charge and skip Stripe (per checkout/page.tsx's $0-total branch). Live
  // network trace instead shows: POST /api/order/new/... succeeds (201, the
  // order IS created), but the frontend then still attempts to create a
  // Stripe PaymentIntent for the now-$0 remainder anyway, which the backend
  // correctly rejects (400, "Error creating order" logged client-side) —
  // stripe requires a minimum charge amount. The customer is left stuck on
  // the checkout page with no confirmation, even though their order actually
  // went through server-side. Same class of bug as TC-92 (real, not a test
  // bug) — filed as fixme rather than asserting the broken behavior as
  // correct. Tracked in TEST_COVERAGE.md's Known Technical Debt.
  test.fixme("TC-177: a gift card that fully covers the order completes without a Stripe step", async () => {});

  test("TC-178: a gift card that partially covers the order still requires Stripe payment for the remainder", async ({
    page,
  }) => {
    await allure.description(
      "A gift card funded below the order total covers only part of the charge — the customer still " +
        "pays the remainder via Stripe, and the order completes normally."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    const giftCard = await allure.step(
      "Seed a small-balance gift card (comfortably below any single-item order total)",
      async () => {
        const card = await purchaseGiftCard({ restaurantId, amount: 5 });
        recordGiftCardForCleanup(card.id);
        return card;
      }
    );
    test.skip(
      giftCard.currentBalance >= menuItemPrice,
      "Seed menu item price is too low for a partial-coverage scenario"
    );

    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );
    await checkoutPage.fillCustomerInfo(
      "Jane",
      "Tester",
      "jane@restaunax-test.com",
      "5559876543"
    );
    await checkoutPage.selectPickup();
    await checkoutPage.applyGiftCard(giftCard.code);
    await checkoutPage.assertGiftCardApplied();

    await checkoutPage.clickProceedToPayment();
    await checkoutPage.assertPaymentSectionVisible();
    await checkoutPage.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
    await checkoutPage.completeOrder();

    await expect(
      page.getByRole("heading", { name: "Order Confirmed!" })
    ).toBeVisible({ timeout: 20_000 });
  });
});
