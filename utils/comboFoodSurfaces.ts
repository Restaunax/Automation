import { expect } from "@playwright/test";
import { apiRequestRaw, stripePublicRaw } from "./apiHelper";

/**
 * Place a PAID online order with no browser — the storefront's own calls, in
 * the storefront's order (template-wind checkout/page.tsx + PaymentSection):
 *   1. POST /api/order/new/restaurantId/:rid  (public placeOrder → INITIALIZED)
 *   2. POST /api/stripe/payment-intent {orderId} → clientSecret
 *   3. Stripe (PUBLISHABLE key only): a card PaymentMethod from tok_visa, then
 *      confirm the intent with its client secret — never a secret key
 *   4. POST /api/stripe/confirm-payment {paymentIntentId} → the order is paid
 *      and leaves INITIALIZED.
 * The restaurant needs a Stripe TEST Connect account
 * (stripeTestOnboardingRaw) and open business hours. Returns the order as
 * placeOrder recorded it (server-priced).
 */
export async function placePaidOnlineOrder(
  publishableKey: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<{ id: string; total: number }> {
  const placed = await apiRequestRaw<{ id?: string; total?: number }>(
    "POST",
    `/api/order/new/restaurantId/${restaurantId}`,
    body
  );
  expect(placed.status, `placeOrder: ${JSON.stringify(placed.data)}`).toBe(201);
  const orderId = String(placed.data.id);

  const intent = await apiRequestRaw<{
    clientSecret?: string;
    paymentIntentId?: string;
  }>("POST", "/api/stripe/payment-intent", { orderId });
  expect(intent.status, `payment-intent: ${JSON.stringify(intent.data)}`).toBe(
    200
  );
  const clientSecret = String(intent.data.clientSecret ?? "");
  const piId = clientSecret.split("_secret_")[0];
  expect(piId, "clientSecret carries the intent id").toMatch(/^pi_/);

  const pm = await stripePublicRaw(publishableKey, "POST", "/payment_methods", {
    type: "card",
    "card[token]": "tok_visa",
  });
  expect(pm.status, JSON.stringify(pm.data)).toBe(200);
  const confirmed = await stripePublicRaw(
    publishableKey,
    "POST",
    `/payment_intents/${piId}/confirm`,
    { client_secret: clientSecret, payment_method: String(pm.data.id) }
  );
  expect(confirmed.status, JSON.stringify(confirmed.data)).toBe(200);
  expect(["succeeded", "requires_capture"]).toContain(
    String(confirmed.data.status)
  );

  const done = await apiRequestRaw("POST", "/api/stripe/confirm-payment", {
    paymentIntentId: piId,
  });
  expect(done.status, `confirm-payment: ${JSON.stringify(done.data)}`).toBe(
    200
  );
  return { id: orderId, total: Number(placed.data.total) };
}
