import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import type { Page } from "@playwright/test";
import {
  createCustomerGiftCardPage,
  type CustomerGiftCardPage,
} from "../../pages/customer/CustomerGiftCardPage";
import {
  readRestaurantId,
  generateRunId,
  generateUserEmail,
  recordGiftCardForCleanup,
} from "../../utils/testData";
import {
  apiLogin,
  findGiftCardIdByCode,
  getGiftCardBalance,
  getGiftCardConfig,
} from "../../utils/apiHelper";
import { waitForEmail } from "../../utils/emailHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT_BASE_URL = process.env.MAILPIT_BASE_URL ?? "";

test.describe("Customer — Gift Cards", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, ADMIN_EMAIL, and ADMIN_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Gift Cards");
    await allure.label("severity", "critical");
  });

  /**
   * A guest buys a card on wind as a gift and pays with the Stripe test card:
   * "Gift card sent" with a code, the recipient's email in Mailpit (when the
   * sandbox is configured), and the code's public balance equals the amount.
   * The card is recorded for the teardown freeze.
   */
  const buyAsGuest = async (
    page: Page,
    choose: (gc: CustomerGiftCardPage) => Promise<void>,
    amount: number
  ) => {
    const restaurantId = readRestaurantId();
    const giftCardPage = createCustomerGiftCardPage(page);
    const recipient = generateUserEmail("giftcard");
    await giftCardPage.goto(restaurantId);
    await choose(giftCardPage);
    await giftCardPage.fillGiftRecipient(recipient, "Auto Recipient");
    await giftCardPage.continueButton().click();
    await giftCardPage.assertPaymentSectionVisible();
    await expect(giftCardPage.payButton()).toHaveText(
      `Pay $${amount.toFixed(2)}`
    );
    await giftCardPage.fillStripeCard();
    await giftCardPage.completePurchase();
    await giftCardPage.assertPurchaseConfirmed();
    const code = await giftCardPage.readConfirmationCode();
    await allure.parameter("Gift card code", code);

    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    recordGiftCardForCleanup(await findGiftCardIdByCode(accessToken, code));

    const balance = await getGiftCardBalance(code.replace(/-/g, ""));
    expect(balance.status).toBe("ACTIVE");
    expect(balance.initialBalance).toBe(amount);
    expect(balance.currentBalance).toBe(amount);
    return { code, recipient, giftCardPage };
  };

  test("TC-165: guest purchases a gift card as a Send-as-Gift preset denomination", async ({
    page,
  }) => {
    await allure.description(
      "A guest picks the first preset amount, sends it as a gift to an email, pays with the Stripe " +
        "test card and sees 'Gift card sent' with a code; the card is ACTIVE with that balance."
    );
    const config = await getGiftCardConfig(readRestaurantId());
    test.skip(
      !config.isEnabled,
      "Gift cards are not enabled for this restaurant"
    );
    const amount = config.presetDenominations[0];
    test.skip(amount === undefined, "No preset denominations configured");

    const { recipient } = await buyAsGuest(
      page,
      (gc) => gc.selectDenomination(amount!),
      amount!
    );
    if (MAILPIT_BASE_URL) {
      await allure.step("The recipient gets the gift card email", async () => {
        const mail = await waitForEmail(recipient, { timeoutMs: 60_000 });
        expect(mail.subject).toBeTruthy();
      });
    }
  });

  test("TC-166: guest purchases a gift card with a custom amount", async ({
    page,
  }) => {
    await allure.description(
      "A guest types a custom amount inside the restaurant's range, pays, and the card is minted " +
        "for exactly that amount."
    );
    const config = await getGiftCardConfig(readRestaurantId());
    test.skip(
      !config.isEnabled,
      "Gift cards are not enabled for this restaurant"
    );
    test.skip(
      !config.allowCustomAmount,
      "Custom amounts are not allowed for this restaurant"
    );
    // An in-range amount no preset uses, so the custom path is what charged.
    const amount = Math.min(
      config.maxCustomAmount,
      Math.max(config.minCustomAmount, 17)
    );
    await buyAsGuest(page, (gc) => gc.fillCustomAmount(String(amount)), amount);
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
      "After buying a card, the page's own 'Check a balance' tool shows its full balance."
    );
    const config = await getGiftCardConfig(readRestaurantId());
    test.skip(
      !config.isEnabled,
      "Gift cards are not enabled for this restaurant"
    );
    const amount = config.presetDenominations[0];
    test.skip(amount === undefined, "No preset denominations configured");

    const { code } = await buyAsGuest(
      page,
      (gc) => gc.selectDenomination(amount!),
      amount!
    );
    const giftCardPage = createCustomerGiftCardPage(page);
    await giftCardPage.goto(readRestaurantId());
    await giftCardPage.checkBalance(code);
    await giftCardPage.assertBalanceResult(amount!);
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
