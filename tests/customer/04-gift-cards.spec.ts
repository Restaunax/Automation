import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerGiftCardPage } from "../../pages/customer/CustomerGiftCardPage";
import {
  readRestaurantId,
  generateRunId,
  recordGiftCardForCleanup,
} from "../../utils/testData";
import {
  apiLogin,
  getGiftCardConfig,
  findGiftCardIdByCode,
} from "../../utils/apiHelper";
import { STRIPE_CARDS } from "../../utils/stripeCards";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

// Recipient email for the guest "Send as Gift" path — not a registered
// account, just a string the backend stores against the gift card.
const generateRecipientEmail = () =>
  `giftcard+${generateRunId()}@restaunax-test.com`;

test.describe("Customer — Gift Cards", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, ADMIN_EMAIL, and ADMIN_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Gift Cards");
    await allure.label("severity", "critical");
  });

  test("TC-165: guest purchases a gift card as a Send-as-Gift preset denomination", async ({
    page,
  }) => {
    await allure.description(
      "A guest (no login required for the Send-as-Gift path) picks a preset denomination, fills the " +
        "recipient email, pays with a Stripe test card, and sees the formatted code on confirmation."
    );

    const restaurantId = readRestaurantId();
    const giftCardPage = createCustomerGiftCardPage(page);
    const recipientEmail = generateRecipientEmail();

    let config: Awaited<ReturnType<typeof getGiftCardConfig>>;
    await allure.step("Read the restaurant's gift-card config", async () => {
      config = await getGiftCardConfig(restaurantId);
      test.skip(
        !config.isEnabled,
        "Gift cards are not enabled for this restaurant"
      );
      test.skip(
        config.presetDenominations.length === 0,
        "No preset denominations configured"
      );
    });

    const amount = config!.presetDenominations[0];
    if (amount === undefined) return; // unreachable — skipped above when empty

    await allure.step("Navigate to the gift cards page", async () => {
      await giftCardPage.goto(restaurantId);
    });

    await allure.step(
      `Select the $${amount} preset and Send as Gift`,
      async () => {
        await giftCardPage.selectDenomination(amount);
        await giftCardPage.fillGiftRecipient(recipientEmail);
        await allure.parameter("Recipient", recipientEmail);
        await allure.parameter("Amount", `$${amount}`);
      }
    );

    await allure.step(
      "Continue to payment and fill Stripe test card",
      async () => {
        await giftCardPage.continueButton().click();
        await giftCardPage.assertPaymentSectionVisible();
        await giftCardPage.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
      }
    );

    let code = "";
    await allure.step("Complete purchase and verify confirmation", async () => {
      await giftCardPage.completePurchase();
      await giftCardPage.assertPurchaseConfirmed();
      code = await giftCardPage.readConfirmationCode();
      await allure.parameter("Gift card code", code);
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    await allure.step("Record the gift card for cleanup", async () => {
      const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
      const id = await findGiftCardIdByCode(accessToken, code);
      recordGiftCardForCleanup(id);
    });
  });

  test("TC-166: guest purchases a gift card with a custom amount", async ({
    page,
  }) => {
    await allure.description(
      "Typing a custom amount within the restaurant's configured [min, max] range is accepted and " +
        "completes the purchase."
    );

    const restaurantId = readRestaurantId();
    const giftCardPage = createCustomerGiftCardPage(page);
    const recipientEmail = generateRecipientEmail();

    const config = await getGiftCardConfig(restaurantId);
    test.skip(
      !config.isEnabled,
      "Gift cards are not enabled for this restaurant"
    );
    test.skip(
      !config.allowCustomAmount,
      "Custom amounts are not allowed for this restaurant"
    );

    const amount = Math.floor(
      (config.minCustomAmount + config.maxCustomAmount) / 2
    );

    await giftCardPage.goto(restaurantId);

    await allure.step(`Enter a custom amount of $${amount}`, async () => {
      await giftCardPage.fillCustomAmount(String(amount));
      await giftCardPage.fillGiftRecipient(recipientEmail);
    });

    await allure.step(
      "Continue to payment and fill Stripe test card",
      async () => {
        await giftCardPage.continueButton().click();
        await giftCardPage.assertPaymentSectionVisible();
        await giftCardPage.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
      }
    );

    let code = "";
    await allure.step("Complete purchase and verify confirmation", async () => {
      await giftCardPage.completePurchase();
      await giftCardPage.assertPurchaseConfirmed();
      code = await giftCardPage.readConfirmationCode();
    });

    await allure.step("Record the gift card for cleanup", async () => {
      const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
      const id = await findGiftCardIdByCode(accessToken, code);
      recordGiftCardForCleanup(id);
    });
  });

  test("TC-167: a custom amount below the minimum is rejected", async ({
    page,
  }) => {
    await allure.description(
      "Typing a custom amount below the restaurant's configured minimum shows an inline error and " +
        "does not advance to payment."
    );

    const restaurantId = readRestaurantId();
    const giftCardPage = createCustomerGiftCardPage(page);

    const config = await getGiftCardConfig(restaurantId);
    test.skip(
      !config.isEnabled,
      "Gift cards are not enabled for this restaurant"
    );
    test.skip(
      !config.allowCustomAmount,
      "Custom amounts are not allowed for this restaurant"
    );
    test.skip(
      config.minCustomAmount <= 0,
      "Minimum is 0 — no below-minimum value exists"
    );

    await giftCardPage.goto(restaurantId);

    const belowMin = config.minCustomAmount - 1;
    await giftCardPage.fillCustomAmount(String(belowMin));
    await giftCardPage.continueButton().click();

    await expect(giftCardPage.amountErrorText()).toBeVisible({
      timeout: 10_000,
    });
    await expect(giftCardPage.paymentHeading()).not.toBeVisible();
  });

  test("TC-168: a custom amount above the maximum is rejected", async ({
    page,
  }) => {
    await allure.description(
      "Typing a custom amount above the restaurant's configured maximum shows an inline error and " +
        "does not advance to payment."
    );

    const restaurantId = readRestaurantId();
    const giftCardPage = createCustomerGiftCardPage(page);

    const config = await getGiftCardConfig(restaurantId);
    test.skip(
      !config.isEnabled,
      "Gift cards are not enabled for this restaurant"
    );
    test.skip(
      !config.allowCustomAmount,
      "Custom amounts are not allowed for this restaurant"
    );

    await giftCardPage.goto(restaurantId);

    const aboveMax = config.maxCustomAmount + 1;
    await giftCardPage.fillCustomAmount(String(aboveMax));
    await giftCardPage.continueButton().click();

    await expect(giftCardPage.amountErrorText()).toBeVisible({
      timeout: 10_000,
    });
    await expect(giftCardPage.paymentHeading()).not.toBeVisible();
  });

  test("TC-169: balance check shows the correct balance for a freshly purchased card", async ({
    page,
  }) => {
    await allure.description(
      "The public balance-check tool on the gift cards page shows the correct current/initial " +
        "balance for a code purchased moments earlier."
    );

    const restaurantId = readRestaurantId();
    const giftCardPage = createCustomerGiftCardPage(page);
    const recipientEmail = generateRecipientEmail();

    const config = await getGiftCardConfig(restaurantId);
    test.skip(
      !config.isEnabled,
      "Gift cards are not enabled for this restaurant"
    );
    const amount = config.presetDenominations[0];
    test.skip(amount === undefined, "No preset denominations configured");
    if (amount === undefined) return; // narrows the type after the skip

    let code = "";
    await allure.step("Purchase a gift card", async () => {
      await giftCardPage.goto(restaurantId);
      await giftCardPage.selectDenomination(amount);
      await giftCardPage.fillGiftRecipient(recipientEmail);
      await giftCardPage.continueButton().click();
      await giftCardPage.assertPaymentSectionVisible();
      await giftCardPage.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
      await giftCardPage.completePurchase();
      await giftCardPage.assertPurchaseConfirmed();
      code = await giftCardPage.readConfirmationCode();
    });

    await allure.step("Check its balance", async () => {
      await giftCardPage.checkBalance(code);
      await giftCardPage.assertBalanceResult(amount);
    });

    await allure.step("Record the gift card for cleanup", async () => {
      const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
      const id = await findGiftCardIdByCode(accessToken, code);
      recordGiftCardForCleanup(id);
    });
  });

  test("TC-170: balance check shows not-found for a nonexistent code", async ({
    page,
  }) => {
    await allure.description(
      "Checking the balance of a code that doesn't exist shows 'Card not found or invalid code'."
    );

    const restaurantId = readRestaurantId();
    const giftCardPage = createCustomerGiftCardPage(page);

    await giftCardPage.goto(restaurantId);
    await giftCardPage.checkBalance(`NOPE-${generateRunId().toUpperCase()}`);
    await giftCardPage.assertBalanceNotFound();
  });
});
