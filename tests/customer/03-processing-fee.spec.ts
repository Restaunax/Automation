import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import type { Page } from "@playwright/test";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { createCustomerOrderConfirmationPage } from "../../pages/customer/CustomerOrderConfirmationPage";
import {
  readSharedState,
  readRestaurantId,
  recordGiftCardForCleanup,
} from "../../utils/testData";
import {
  apiLogin,
  getOrderByIdRaw,
  quoteOrderRaw,
  seedFundedGiftCard,
  setPassProcessingFee,
} from "../../utils/apiHelper";
import { STRIPE_CARDS } from "../../utils/stripeCards";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Customer — Processing fee pass-through", () => {
  // Same gate as the rest of tests/customer: needs a real wind deployment.
  // The pass-through is a company-ADMIN switch since backend ecd99c9d2
  // (2026-08-28) — we are the merchant of record, so the surcharge is ours —
  // so flipping it needs admin creds; the owner token pins that it can't.
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

  test("TC-222: enabling the processing fee adds a Processing Fee line and raises the wind checkout total", async ({
    page,
  }) => {
    await allure.description(
      "A company admin turns ON pass-processing-fee for the restaurant (server-side; an " +
        "owner's attempt to switch it on is ignored — checked first). The template-wind " +
        "checkout order summary then shows a server-authoritative 'Processing Fee (credit " +
        "cards)' line and the quoted Total rises above the fee-OFF baseline. Proves the " +
        "flag → /quote → customer display round-trip end-to-end. The fee is always " +
        "restored to OFF in a finally (shared QA restaurant)."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    // Tokens are used only to flip the restaurant's setting via the API.
    const { accessToken: adminToken } = await apiLogin(
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const { accessToken: ownerToken } = await apiLogin(
      OWNER_EMAIL,
      OWNER_PASSWORD
    );
    await allure.parameter("restaurantId", restaurantId);

    try {
      // ── Baseline: fee OFF — and an owner can't switch it on ──────────────
      await setPassProcessingFee(adminToken, restaurantId, false);
      // Silently stripped server-side (200, nothing changed): the baseline
      // below must still show no fee line.
      await setPassProcessingFee(ownerToken, restaurantId, true);
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );

      let baseTotal = 0;
      await allure.step(
        "Read the fee-OFF baseline total — no Processing Fee line",
        async () => {
          await expect
            .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
            .toBeGreaterThan(0);
          baseTotal = await checkoutPage.readOrderTotal();
          await checkoutPage.assertNoProcessingFee();
          await allure.parameter("Total (fee OFF)", `$${baseTotal.toFixed(2)}`);
        }
      );

      // ── Company admin turns the fee ON ───────────────────────────────────
      await allure.step(
        "Company admin enables pass-processing-fee for the restaurant",
        async () => {
          await setPassProcessingFee(adminToken, restaurantId, true);
        }
      );

      // ── Verify on wind: Processing Fee line appears + total rises ─────────
      await allure.step(
        "Reload checkout — a Processing Fee line appears and the total rises",
        async () => {
          // The cart is re-seeded by addInitScript on reload; the checkout then
          // re-quotes against the restaurant's now-updated setting.
          await page.reload({ waitUntil: "domcontentloaded" });
          await checkoutPage.assertProcessingFeeVisible();
          await expect
            .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
            .toBeGreaterThan(baseTotal);
          const withFee = await checkoutPage.readOrderTotal();
          await allure.parameter("Total (fee ON)", `$${withFee.toFixed(2)}`);
          expect(withFee).toBeGreaterThan(baseTotal);
        }
      );
    } finally {
      // Always restore the restaurant to fee-OFF, even if an assertion failed —
      // this is a shared QA restaurant and the fee changes real order totals.
      await setPassProcessingFee(adminToken, restaurantId, false).catch(
        () => {}
      );
    }
  });

  // ── Placing real orders with the fee ON ─────────────────────────────────
  // TC-222 proves the quote shows the fee; these prove what is CHARGED and
  // STORED. The online checkout reads the card's funding type from Stripe
  // (POST /api/order/:id/finalize-surcharge) before confirming: a credit card
  // keeps the fee, debit and prepaid cards must not pay it (Durbin + card
  // brand rules — CARD_SURCHARGE_COMPLIANCE.md §4). Stripe test cards carry
  // the real funding type, so the server-side read is exercised for real.
  const placeOrderWithFee = async (
    page: Page,
    card: string,
    firstName: string
  ) => {
    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);
    const confirmationPage = createCustomerOrderConfirmationPage(page);
    const { accessToken: adminToken } = await apiLogin(
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const { accessToken: ownerToken } = await apiLogin(
      OWNER_EMAIL,
      OWNER_PASSWORD
    );
    await allure.parameter("restaurantId", restaurantId);
    await allure.parameter("Card", card);

    try {
      await setPassProcessingFee(adminToken, restaurantId, true);
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );

      let quotedTotal = 0;
      await allure.step("Checkout quotes the fee", async () => {
        await checkoutPage.assertProcessingFeeVisible();
        await expect
          .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
          .toBeGreaterThan(0);
        quotedTotal = await checkoutPage.readOrderTotal();
        await allure.parameter("Quoted total", `$${quotedTotal.toFixed(2)}`);
      });

      // A fresh guest per run: the shared QA test phone's Stripe customer has
      // hit Stripe's cap on attached payment methods ("already has the
      // maximum number of payment methods attached").
      const uniq = `${Date.now()}`.slice(-7);
      await checkoutPage.fillCustomerInfo(
        firstName,
        "Feetest",
        `fee-${firstName.toLowerCase()}-${uniq}@restaunax-test.com`,
        `555${uniq}`
      );
      await checkoutPage.selectPickup();
      await checkoutPage.clickProceedToPayment();
      await checkoutPage.assertPaymentSectionVisible();
      await checkoutPage.fillStripeCard(card);

      const finalize = page.waitForResponse(
        (r) =>
          /\/api\/order\/[0-9a-f-]{36}\/finalize-surcharge$/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 60_000 }
      );
      await checkoutPage.completeOrder();
      const finalizeResponse = await finalize;
      expect(
        finalizeResponse.status(),
        "finalize-surcharge must succeed — on failure the checkout falls " +
          "through and charges the quoted (credit) amount"
      ).toBe(200);
      await allure.attachment(
        "finalize-surcharge response",
        await finalizeResponse.text(),
        "application/json"
      );

      // When the fee comes off (debit/prepaid), the checkout shows the new
      // total and asks for one more tap before charging it (wind hotfix
      // 2026-10-20) — the customer is never charged a figure they weren't
      // shown. A credit card goes straight through.
      const feeRemovedNotice = page.getByText(
        /(?:not|n't) charged the processing fee/i
      );
      const confirmed = page.getByRole("heading", { name: "Order Confirmed!" });
      await expect(feeRemovedNotice.or(confirmed)).toBeVisible({
        timeout: 30_000,
      });
      let reconfirmed = false;
      if (await feeRemovedNotice.isVisible()) {
        await allure.step(
          "Fee removed: the lower total is shown, then a second tap pays it",
          async () => {
            await expect
              .poll(() => checkoutPage.readOrderTotal(), { timeout: 10_000 })
              .toBeLessThan(quotedTotal);
            await checkoutPage.assertNoProcessingFee();
            await checkoutPage.completeOrder();
            reconfirmed = true;
          }
        );
      }
      await allure.parameter("Second tap", String(reconfirmed));

      await confirmationPage.assertConfirmed();
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
      return { quotedTotal, order: order.data, reconfirmed };
    } finally {
      await setPassProcessingFee(adminToken, restaurantId, false).catch(
        () => {}
      );
    }
  };

  test("TC-902: a credit card is charged the quoted total including the processing fee", async ({
    page,
  }) => {
    await allure.description(
      "Fee ON → place a wind order with a Stripe CREDIT test card (4242). " +
        "finalize-surcharge keeps the fee; the stored order carries " +
        "processingFee > 0 and its total equals the total quoted on checkout."
    );
    const { quotedTotal, order } = await placeOrderWithFee(
      page,
      STRIPE_CARDS.VISA_SUCCESS,
      "Credit"
    );
    expect(order.processingFee ?? 0).toBeGreaterThan(0);
    expect(order.total).toBeCloseTo(quotedTotal, 2);
    // Never above the 3% network cap on the pre-fee base.
    const base = (order.total ?? 0) - (order.processingFee ?? 0);
    expect(order.processingFee!).toBeLessThanOrEqual(
      Math.floor(base * 0.03 * 100) / 100 + 0.001
    );
  });

  for (const [tc, label, card] of [
    ["TC-903", "debit", STRIPE_CARDS.VISA_DEBIT],
    ["TC-904", "prepaid", STRIPE_CARDS.MASTERCARD_PREPAID],
  ] as const) {
    test(`${tc}: a ${label} card is NOT charged the processing fee`, async ({
      page,
    }) => {
      await allure.description(
        `Fee ON → place a wind order with a Stripe ${label.toUpperCase()} ` +
          "test card. Surcharging debit/prepaid is barred, so " +
          "finalize-surcharge drops the fee before the charge: the stored " +
          "order has processingFee 0 and a total below the credit quote."
      );
      const { quotedTotal, order } = await placeOrderWithFee(
        page,
        card,
        label === "debit" ? "Debit" : "Prepaid"
      );
      expect(order.processingFee ?? 0).toBe(0);
      expect(order.total ?? 0).toBeLessThan(quotedTotal);
    });
  }

  test("TC-905: the fee is priced on the card portion only — never on gift-card tender", async () => {
    await allure.description(
      "Fee ON → quote the same cart with (a) a gift card that covers the " +
        "whole order: no card is charged, so no processing fee; (b) a gift " +
        "card that covers part of it: the fee is at most 3% of what the CARD " +
        "pays. Before backend fix 2026-10-20 the fee was priced on the whole " +
        "order before tender ($3.00 on a $13 card charge for a $100 order " +
        "with a $90 gift card)."
    );
    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemPrice } = readSharedState();
    const { accessToken: adminToken } = await apiLogin(
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const quote = (giftCardCode: string) =>
      quoteOrderRaw(restaurantId, {
        orderItems: [{ menuItemId, quantity: 1 }],
        giftCardCode,
        giftCardAmountUsed: 1000,
      });

    try {
      await setPassProcessingFee(adminToken, restaurantId, true);

      await allure.step("A gift card covering the whole order", async () => {
        const card = await seedFundedGiftCard(adminToken, restaurantId, 100);
        recordGiftCardForCleanup(card.id);
        const res = await quote(card.code);
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        const q = res.data.quote!;
        expect(q.giftCardApplied ?? 0).toBeGreaterThan(0);
        expect(q.amountToCharge).toBe(0);
        expect(q.processingFee ?? 0).toBe(0);
      });

      await allure.step("A gift card covering part of the order", async () => {
        // Leave a few dollars on the card.
        const partial = Math.max(1, Math.floor(menuItemPrice) - 3);
        const card = await seedFundedGiftCard(
          adminToken,
          restaurantId,
          partial
        );
        recordGiftCardForCleanup(card.id);
        const res = await quote(card.code);
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        const q = res.data.quote!;
        const fee = q.processingFee ?? 0;
        const cardBase = (q.amountToCharge ?? 0) - fee;
        await allure.parameter("Card portion", `$${cardBase.toFixed(2)}`);
        await allure.parameter("Fee", `$${fee.toFixed(2)}`);
        expect(q.giftCardApplied).toBeCloseTo(partial, 2);
        expect(cardBase).toBeGreaterThan(0);
        expect(fee).toBeGreaterThan(0);
        expect(fee).toBeLessThanOrEqual(
          Math.floor(cardBase * 3 + 1e-6) / 100 + 0.001
        );
      });
    } finally {
      await setPassProcessingFee(adminToken, restaurantId, false).catch(
        () => {}
      );
    }
  });
});
