import { type Page } from "@playwright/test";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "./stripeCards";

/**
 * Fills the Stripe PaymentElement card fields inside its iframe.
 *
 * Stripe renders card inputs in a sandboxed iframe whose src contains
 * "stripe.com". All callers should use this helper rather than hardcoding
 * iframe selectors so a Stripe SDK update only needs fixing here.
 */
export async function fillStripePaymentElement(
  page: Page,
  cardNumber: string = STRIPE_CARDS.VISA_SUCCESS,
  expiry: string = STRIPE_DEFAULTS.EXPIRY_MM_YY,
  cvc = STRIPE_DEFAULTS.CVC,
  zip = STRIPE_DEFAULTS.ZIP
): Promise<void> {
  const frame = page.frameLocator('iframe[src*="stripe.com"]').first();
  await frame.locator('[placeholder="1234 1234 1234 1234"]').fill(cardNumber);
  await frame.locator('[placeholder="MM / YY"]').fill(expiry);
  await frame.locator('[placeholder="CVC"]').fill(cvc);
  // Some Payment Element configurations also collect a billing ZIP (e.g. the
  // gift-card purchase page, unlike checkout, doesn't pass billing details
  // separately) — fill it only if present so this stays a no-op elsewhere.
  // The field's placeholder is the example format ("12345"), not the label "ZIP".
  const zipField = frame.locator('[placeholder="12345"]');
  if (await zipField.count()) {
    await zipField.fill(zip);
  }
}
