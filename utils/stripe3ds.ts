import { type Page, type Request, expect } from "@playwright/test";
import {
  apiLogin,
  cancelOrderRaw,
  getOrderByIdRaw,
  listOrdersRaw,
  refundOrderRaw,
  stripeConfigRaw,
  stripePublicRaw,
} from "./apiHelper";

/**
 * 3D Secure (a bank check on a card payment) on the storefronts.
 *
 * Two ways Stripe can run the bank check, and they reach different code:
 *
 * 1. IN-PAGE (what Stripe.js does by default). `confirmPayment({ redirect:
 *    "if_required" })` opens the bank's challenge in a modal iframe
 *    (`three-ds-2-challenge` → testmode-acs.stripe.com) and resolves in place.
 *    The storefront's in-place branch then calls /api/stripe/confirm-payment.
 *    The `return_url` is NEVER visited. Verified on QA 2026-10-23 with
 *    4000 0027 6000 3184 on wind and lima.
 *
 * 2. FULL-PAGE REDIRECT. Stripe answers the confirm with
 *    `next_action.redirect_to_url` when the confirm says `use_stripe_sdk=false`
 *    (Stripe's documented flag: "true when … using Stripe.js … to handle the
 *    next actions"). Stripe.js then sends the whole page to Stripe's hosted 3DS
 *    page (hooks.stripe.com/3d_secure_2/hosted), and Complete/Fail there sends
 *    the browser to the storefront's OWN `return_url` with Stripe's real
 *    `payment_intent` + `payment_intent_client_secret` (and `source_type=card`;
 *    the hosted 3DS page sends no `redirect_status`).
 *    This is what a bank or a redirecting payment method does in production,
 *    and it is the only way to exercise `/checkout/return` end to end.
 *    `forceStripeRedirect` flips that one flag on the storefront's own confirm
 *    call; nothing else in the request changes.
 */

/** The bank's challenge iframe — present on the storefront (in-page) AND on Stripe's hosted page. */
const CHALLENGE_IFRAME = 'iframe[src*="three-ds-2-challenge"]';

/**
 * Answer the bank check: press Complete or Fail on Stripe's 3DS test page.
 *
 * The press is retried only while the challenge is still on screen: the first
 * press can land while the challenge iframe is still animating in and be
 * silently lost (seen on QA lima 2026-10-23: one press, the challenge stayed).
 * A press that registered removes the challenge (in-page) or navigates the
 * page away (hosted), so a retry can never answer twice.
 */
export async function answerStripe3ds(
  page: Page,
  outcome: "COMPLETE" | "FAIL"
): Promise<void> {
  const button = page
    .frameLocator(CHALLENGE_IFRAME)
    .frameLocator("iframe")
    // Accessible names are "Complete" / "Fail" (shown upper-case by CSS).
    .getByRole("button", { name: new RegExp(`^${outcome}$`, "i") });
  await expect(button).toBeVisible({ timeout: 45_000 });
  await expect(async () => {
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 5_000 });
    }
    await expect(page.locator(CHALLENGE_IFRAME)).toHaveCount(0, {
      timeout: 10_000,
    });
  }).toPass({ timeout: 60_000 });
}

/** True when the in-page challenge (not a redirect) is showing on the storefront. */
export const challengeIframe = (page: Page) => page.locator(CHALLENGE_IFRAME);

export interface StripeConfirmWatch {
  /** The `return_url` the storefront sent with its confirm (null until it confirmed). */
  returnUrl(): string | null;
  /** Whether the confirm carried `use_stripe_sdk=true` and was switched to false. */
  rewritten(): boolean;
}

const CONFIRM_URL = /api\.stripe\.com\/v1\/payment_intents\/[^/]+\/confirm/;

const readReturnUrl = (body: string): string | null => {
  const m = /(?:^|&)return_url=([^&]*)/.exec(body);
  return m?.[1] ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
};

/**
 * Watch the storefront's Stripe confirm call (no change to it) — records the
 * `return_url` it sends, so an in-page test can still pin where a redirect
 * WOULD land.
 */
export function watchStripeConfirm(page: Page): StripeConfirmWatch {
  let body = "";
  page.on("request", (r: Request) => {
    if (r.method() === "POST" && CONFIRM_URL.test(r.url())) {
      body = r.postData() ?? "";
    }
  });
  return { returnUrl: () => readReturnUrl(body), rewritten: () => false };
}

/**
 * Make Stripe run the bank check as a FULL-PAGE REDIRECT (see the file
 * header). Call before pressing the storefront's pay button. Assert
 * `rewritten()` afterwards: if a Stripe.js update stops sending the flag the
 * test must fail loudly rather than quietly fall back to the modal.
 */
export async function forceStripeRedirect(
  page: Page
): Promise<StripeConfirmWatch> {
  let body = "";
  let rewritten = false;
  await page.route(CONFIRM_URL, async (route) => {
    body = route.request().postData() ?? "";
    if (/(?:^|&)use_stripe_sdk=true(?:&|$)/.test(body)) {
      rewritten = true;
      await route.continue({
        postData: body.replace(
          /(^|&)use_stripe_sdk=true(?=&|$)/,
          "$1use_stripe_sdk=false"
        ),
      });
      return;
    }
    await route.continue();
  });
  return { returnUrl: () => readReturnUrl(body), rewritten: () => rewritten };
}

export interface PaymentIntentCapture {
  /** The order the storefront created (INITIALIZED until paid). */
  orderId: string;
  /** The PaymentIntent the storefront got for it. */
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * Start waiting for the storefront's POST /api/stripe/payment-intent (both
 * storefronts send `{ orderId }` and get `{ clientSecret }` back). Call BEFORE
 * "Proceed to Payment"; await the returned promise after it.
 */
export function capturePaymentIntent(
  page: Page
): Promise<PaymentIntentCapture> {
  return page
    .waitForResponse(
      (r) =>
        /\/api\/stripe\/payment-intent$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 60_000 }
    )
    .then(async (r) => {
      expect(r.status(), "POST /api/stripe/payment-intent").toBe(200);
      const req = (r.request().postDataJSON() ?? {}) as { orderId?: string };
      const res = (await r.json()) as { clientSecret?: string };
      const clientSecret = res.clientSecret ?? "";
      const paymentIntentId = clientSecret.split("_secret_")[0] ?? "";
      expect(
        req.orderId,
        "payment-intent request names the order"
      ).toBeTruthy();
      expect(paymentIntentId, "clientSecret names a PaymentIntent").toMatch(
        /^pi_/
      );
      return { orderId: req.orderId!, clientSecret, paymentIntentId };
    });
}

/** Count the storefront's POST /api/stripe/confirm-payment calls from now on. */
export function countConfirmPaymentCalls(page: Page): () => number {
  let n = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/api\/stripe\/confirm-payment$/.test(r.url())
    ) {
      n += 1;
    }
  });
  return () => n;
}

/**
 * The PaymentIntent's status, read from Stripe with the PUBLISHABLE key and
 * the client secret — what the customer's own browser can see. Proves
 * "nothing was charged" independently of our backend.
 */
export async function paymentIntentStatus(
  clientSecret: string
): Promise<string> {
  const pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
  expect(pk, "GET /api/stripe/config publishableKey").toMatch(/^pk_test_/);
  const id = clientSecret.split("_secret_")[0]!;
  const res = await stripePublicRaw(pk, "GET", `/payment_intents/${id}`, {
    client_secret: clientSecret,
  });
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  return String(res.data.status);
}

export interface OwnerOrderView {
  status?: string;
  paymentStatus?: string;
  total?: number;
  breakdown?: unknown;
}

/** Owner GET /api/order/:id (as the other specs read a placed order). */
export async function ownerOrder(
  ownerToken: string,
  orderId: string
): Promise<OwnerOrderView> {
  const res = await getOrderByIdRaw(ownerToken, orderId);
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  return res.data as OwnerOrderView;
}

/** The owner's order list for one customer email (INITIALIZED placeholders excluded, as the owner sees it). */
export async function ownerOrdersFor(
  ownerToken: string,
  restaurantId: string,
  email: string
): Promise<{ id: string; status?: string; paymentStatus?: string }[]> {
  const res = await listOrdersRaw(ownerToken, restaurantId, {
    search: email,
    limit: 50,
  });
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  return res.data.orders.map((o) => ({
    id: o.id,
    status: o.status,
    paymentStatus: (o as { paymentStatus?: string }).paymentStatus,
  }));
}

/**
 * Leave nothing behind: refund every paid order (money goes back to the test
 * card) and cancel every unpaid placeholder these tests created. Each order is
 * read first, so a step that already failed does not hide the others.
 */
export async function cleanUpOrders(
  ownerEmail: string,
  ownerPassword: string,
  orderIds: string[],
  label: string
): Promise<void> {
  if (orderIds.length === 0) return;
  const { accessToken } = await apiLogin(ownerEmail, ownerPassword);
  for (const id of orderIds) {
    const res = await getOrderByIdRaw(accessToken, id).catch(() => null);
    const order = res?.data as OwnerOrderView | undefined;
    if (!order) continue;
    if (order.paymentStatus === "COMPLETED") {
      await refundOrderRaw(accessToken, id, {
        reason: `AUTO ${label} cleanup`,
      }).catch(() => {});
    } else if (order.status === "INITIALIZED") {
      await cancelOrderRaw(accessToken, id, {
        reason: `AUTO ${label} cleanup`,
      }).catch(() => {});
    }
  }
}
