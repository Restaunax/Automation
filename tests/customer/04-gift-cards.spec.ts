import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerGiftCardPage } from "../../pages/customer/CustomerGiftCardPage";
import { readRestaurantId, generateRunId } from "../../utils/testData";
import { getGiftCardConfig } from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Customer — Gift Cards", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, ADMIN_EMAIL, and ADMIN_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Gift Cards");
    await allure.label("severity", "critical");
  });

  // Intermittently blocked by Stripe Radar's invisible hCaptcha challenge,
  // not a product or test bug. Live trace evidence (2026-07-11): clicking Pay
  // fires HCaptchaInvisible network calls (checksiteconfig, getcaptcha) tied
  // to the Payment Element's Link-enrollment fields; the PaymentIntent then
  // never confirms (no subsequent .../confirm call) and the flow hangs at
  // that step, so the 20s wait for "Gift Card Sent!" times out. Reproduced
  // deterministically across repeated runs; a real Chrome channel (vs.
  // bundled Chromium headless shell) was tried as a possible fix and did NOT
  // reliably avoid the challenge (passed twice, failed on a third run with
  // the identical signature) — this is Stripe-side fraud-detection behavior
  // against automated/headless sessions, not something fixable in test code.
  // Filed as fixme rather than asserting a coin-flip as reliably passing.
  // Tracked in TEST_COVERAGE.md's Known Technical Debt — needs a decision
  // from whoever owns the Stripe account settings (e.g. disabling Radar/Link
  // for the QA test-mode key) before this can be un-fixme'd.
  test.fixme("TC-165: guest purchases a gift card as a Send-as-Gift preset denomination", async () => {});

  // Same Stripe Radar invisible-hCaptcha blocker as TC-165 above — see that
  // test's comment for the full trace evidence and why this is filed as
  // fixme rather than fixed in test code.
  test.fixme("TC-166: guest purchases a gift card with a custom amount", async () => {});

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

  // Same Stripe Radar invisible-hCaptcha blocker as TC-165/166 above — this test
  // purchases a card (completePurchase → assertPurchaseConfirmed) before it can
  // check the balance, so it hangs at the identical Pay step. Filed as fixme
  // until the QA Stripe key's Radar/Link setting is changed. See TC-165 for the
  // full trace evidence.
  test.fixme("TC-169: balance check shows the correct balance for a freshly purchased card", async () => {});

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
