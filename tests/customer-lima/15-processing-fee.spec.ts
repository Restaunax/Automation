import * as allure from "allure-js-commons";
import type { Page } from "@playwright/test";

import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import {
  apiLogin,
  getOrderByIdRaw,
  setPassProcessingFee,
} from "../../utils/apiHelper";
import {
  generateUserEmail,
  generateSeedPhone,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * Processing-fee pass-through on the embedded ordering surface — the lima
 * twin of tests/customer/03-processing-fee.spec.ts.
 *
 * Fee ON → the checkout shows "Processing fee (credit cards)", a CREDIT card
 * is charged it, a DEBIT card is not (the checkout reads the card's funding
 * type through finalize-surcharge before confirming —
 * CARD_SURCHARGE_COMPLIANCE.md §4). The flag is a company-admin switch and is
 * always restored to OFF: the seed restaurant is shared.
 */
test.describe("Lima — processing fee pass-through", () => {
  const restaurantSlug = readRestaurantSlug();

  test.skip(
    !restaurantSlug ||
      !OWNER_EMAIL ||
      !OWNER_PASSWORD ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD,
    "Ordering slug not seeded, or OWNER/ADMIN credentials missing in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "critical");
  });

  const feeLine = (page: Page) =>
    page.getByText(/^Processing fee\s*\(credit cards\)$/i);

  const placeOrderWithFee = async (page: Page, card: string) => {
    const state = readSharedState();
    const { accessToken: adminToken } = await apiLogin(
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const { accessToken: ownerToken } = await apiLogin(
      OWNER_EMAIL,
      OWNER_PASSWORD
    );
    await allure.parameter("restaurantId", state.restaurantId);
    await allure.parameter("Card", card);

    try {
      await setPassProcessingFee(adminToken, state.restaurantId, true);

      const lima = createLimaStorefrontPage(page);
      const checkout = createLimaCheckoutPage(page);
      await lima.gotoMenu(restaurantSlug);
      await lima.assertOnMenu();
      await lima.openItemModal(state.menuItemName);
      await lima.clickAddToCart();
      await page.goto(`${lima.tenantRoot(restaurantSlug)}/cart`, {
        waitUntil: "domcontentloaded",
      });
      await checkout.goToCheckout();
      await checkout.assertPickupSelected();
      await checkout.fillCustomerInfo({
        firstName: "Fee",
        lastName: "Lima",
        email: generateUserEmail("lima-fee"),
        phone: generateSeedPhone(),
      });

      let quotedTotal = 0;
      await allure.step("Checkout quotes the fee", async () => {
        await expect(feeLine(page)).toBeVisible({ timeout: 20_000 });
        quotedTotal = (await checkout.readTotal()) ?? 0;
        expect(quotedTotal).toBeGreaterThan(0);
        await allure.parameter("Quoted total", `$${quotedTotal.toFixed(2)}`);
      });

      await checkout.proceedToPayment();
      await fillStripePaymentElement(page, card);
      const finalize = page.waitForResponse(
        (r) =>
          /\/api\/order\/[0-9a-f-]{36}\/finalize-surcharge$/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 60_000 }
      );
      await checkout.placeOrder();
      const finalizeResponse = await finalize;
      expect(
        finalizeResponse.status(),
        "finalize-surcharge must succeed — the card is checked before it is charged"
      ).toBe(200);

      // When the fee comes off (debit/prepaid), the checkout shows the new
      // total and asks for one more tap before charging it (lima hotfix
      // 2026-10-20). A credit card goes straight through.
      const feeRemovedNotice = page.getByText(
        /(?:not|n't) charged the processing fee/i
      );
      // Either the confirmation (credit) or the fee-removed notice (debit).
      await expect
        .poll(
          async () =>
            /\/order-confirmation\//.test(page.url()) ||
            (await feeRemovedNotice.isVisible()),
          { timeout: 30_000 }
        )
        .toBe(true);
      if (!/\/order-confirmation\//.test(page.url())) {
        await allure.step(
          "Fee removed: the lower total is shown, then a second tap pays it",
          async () => {
            await expect(feeRemovedNotice).toBeVisible({ timeout: 10_000 });
            await expect(feeLine(page)).toHaveCount(0);
            expect((await checkout.readTotal()) ?? 0).toBeLessThan(quotedTotal);
            await checkout.placeOrder();
          }
        );
      }

      await checkout.assertOrderConfirmed();
      const orderId =
        page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
      expect(orderId, `order id from ${page.url()}`).toBeTruthy();
      await allure.parameter("orderId", orderId);

      const order = await getOrderByIdRaw(ownerToken, orderId);
      expect(order.status, JSON.stringify(order.data)).toBe(200);
      await allure.attachment(
        "order",
        JSON.stringify(order.data, null, 2),
        "application/json"
      );
      return { quotedTotal, order: order.data };
    } finally {
      await setPassProcessingFee(adminToken, state.restaurantId, false).catch(
        () => {}
      );
    }
  };

  test("TC-L71: a credit card is charged the quoted total including the processing fee", async ({
    page,
  }) => {
    await allure.description(
      "Fee ON → lima order with a Stripe CREDIT test card (4242). The stored " +
        "order carries processingFee > 0 and its total equals the quoted total."
    );
    const { quotedTotal, order } = await placeOrderWithFee(
      page,
      STRIPE_CARDS.VISA_SUCCESS
    );
    expect(order.processingFee ?? 0).toBeGreaterThan(0);
    expect(order.total).toBeCloseTo(quotedTotal, 2);
  });

  test("TC-L72: a debit card is NOT charged the processing fee", async ({
    page,
  }) => {
    await allure.description(
      "Fee ON → lima order with a Stripe DEBIT test card. finalize-surcharge " +
        "drops the fee before the charge: processingFee 0, total below the " +
        "credit quote."
    );
    const { quotedTotal, order } = await placeOrderWithFee(
      page,
      STRIPE_CARDS.VISA_DEBIT
    );
    expect(order.processingFee ?? 0).toBe(0);
    expect(order.total ?? 0).toBeLessThan(quotedTotal);
  });
});
