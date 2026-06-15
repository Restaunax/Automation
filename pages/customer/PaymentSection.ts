import { type Page, type FrameLocator } from "@playwright/test";

/**
 * Template Wind — Stripe payment step (Stripe PaymentElement, rendered in an
 * iframe). STUB POM. Card data lives in utils/stripeCards.ts. A reusable
 * Stripe payment-element fill helper is planned — see TEST_PLAN.md →
 * "Future infrastructure".
 */
export const createPaymentSection = (page: Page) => {
  const payButton = page.getByRole("button", { name: /pay/i });

  // Stripe renders its card inputs inside a private iframe.
  const stripeFrame = (): FrameLocator =>
    page.frameLocator('iframe[name^="__privateStripeFrame"]');

  const fillCard = async (
    number: string,
    expiry: string,
    cvc: string
  ): Promise<void> => {
    // TODO: fill the Stripe PaymentElement fields (see utils/stripeCards.ts)
    const frame = stripeFrame();
    await frame.getByPlaceholder(/card number/i).fill(number);
    await frame.getByPlaceholder(/MM ?\/ ?YY/i).fill(expiry);
    await frame.getByPlaceholder(/CVC/i).fill(cvc);
  };

  const pay = async (): Promise<void> => {
    await payButton.click();
  };

  return { fillCard, pay };
};

export type PaymentSection = ReturnType<typeof createPaymentSection>;
