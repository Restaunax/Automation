import { type Page } from "@playwright/test";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "../../utils/stripeCards";

export const createPaymentSection = (page: Page) => {
  const payButton = page.getByRole("button", { name: /pay/i });

  const fillCard = async (
    number = STRIPE_CARDS.VISA_SUCCESS,
    expiry = `${STRIPE_DEFAULTS.EXPIRY_MONTH} / ${STRIPE_DEFAULTS.EXPIRY_YEAR}`,
    cvc = STRIPE_DEFAULTS.CVC
  ): Promise<void> => {
    await fillStripePaymentElement(page, number, expiry, cvc);
  };

  const pay = async (): Promise<void> => {
    await payButton.click();
  };

  return { fillCard, pay };
};

export type PaymentSection = ReturnType<typeof createPaymentSection>;
