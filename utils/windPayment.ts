/**
 * windPayment.ts — pay the template-wind checkout with the Stripe test card,
 * the way a guest does, and wait for "Order Confirmed!". Shared by the wind
 * order specs (moved from tests/dashboard/owner/27-order-breakdown.spec.ts).
 */
import type { Page, TestInfo } from "@playwright/test";
import * as allure from "allure-js-commons";
import { expect } from "../fixtures/base";
import { createCustomerCheckoutPage } from "../pages/customer/CustomerCheckoutPage";
import { createCustomerOrderConfirmationPage } from "../pages/customer/CustomerOrderConfirmationPage";
import { STRIPE_CARDS } from "./stripeCards";

/**
 * Pays the wind checkout with the Stripe test card and waits for "Order
 * Confirmed!". One retry of the Stripe step (Link/Element flake), only when
 * the first attempt provably did not go through; then fail with screenshots.
 */
export async function payWithTestCard(
  page: Page,
  testInfo: TestInfo
): Promise<void> {
  const checkout = createCustomerCheckoutPage(page);
  const confirmation = createCustomerOrderConfirmationPage(page);
  await allure.step("pay with the Stripe test card", async () => {
    const confirmedHeading = page.getByRole("heading", {
      name: "Order Confirmed!",
    });
    const shot = async (name: string) =>
      testInfo.attach(name, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    const paymentError = async () => {
      const box = page
        .getByRole("heading", { name: "Payment Error" })
        .locator("xpath=following-sibling::p");
      return (await box.count()) > 0 ? (await box.innerText()).trim() : "";
    };
    // Any failure — a late Stripe iframe timing out the card fill, the click,
    // or the confirmation wait — returns false so the caller can screenshot
    // and decide on the single guarded retry below.
    let lastError = "";
    const pay = async () => {
      try {
        await checkout.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
        await checkout.completeOrder();
        await confirmation.assertConfirmed();
        return true;
      } catch (err) {
        lastError =
          err instanceof Error ? err.message.split("\n")[0]! : String(err);
        return false;
      }
    };

    if (await pay()) return;
    await shot("payment-attempt-1");

    // Resubmitting a payment that is in flight or went through would charge
    // the card twice. Retry only when the page is back to an idle checkout:
    // still on /checkout, no "Payment Successful!" panel, no "Processing...",
    // and "Complete Order" enabled again.
    const firstError = await paymentError();
    if (/payment processed/i.test(firstError)) {
      throw new Error(
        `payment went through but the order was not confirmed: "${firstError}" (url ${page.url()})`
      );
    }
    const completeOrder = page.getByRole("button", {
      name: "Complete Order",
    });
    // Give a just-failed submit a moment to settle back to the form: wait
    // (briefly, on the condition) for "Complete Order" to be enabled again,
    // then re-check nothing is in flight or done.
    const formBack = await expect(completeOrder)
      .toBeEnabled({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    const idle =
      formBack &&
      new URL(page.url()).pathname.startsWith("/checkout") &&
      !(await page
        .getByRole("heading", { name: "Payment Successful!" })
        .isVisible()) &&
      !(await page.getByRole("button", { name: "Processing..." }).isVisible());
    if (!idle) {
      await expect(
        confirmedHeading,
        `first payment attempt is in flight or went through; not resubmitting (url ${page.url()}, error "${firstError}", attempt 1: ${lastError})`
      ).toBeVisible({ timeout: 45_000 });
      return;
    }

    if (await pay()) return;
    await shot("payment-attempt-2");
    throw new Error(
      `payment did not reach 'Order Confirmed!' after one retry (url ${page.url()}, error "${await paymentError()}", attempt 2: ${lastError})`
    );
  });
}
