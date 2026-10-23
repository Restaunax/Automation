import * as allure from "allure-js-commons";
import { type Page } from "@playwright/test";

import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { createCustomerMenuPage } from "../../pages/customer/CustomerMenuPage";
import { createCustomerOrderConfirmationPage } from "../../pages/customer/CustomerOrderConfirmationPage";
import { apiLogin } from "../../utils/apiHelper";
import {
  apiBreakdownLines,
  assertSameLines,
  readWindConfirmationLines,
} from "../../utils/orderBreakdown";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import {
  answerStripe3ds,
  capturePaymentIntent,
  challengeIframe,
  cleanUpOrders,
  countConfirmPaymentCalls,
  forceStripeRedirect,
  ownerOrder,
  ownerOrdersFor,
  paymentIntentStatus,
  watchStripeConfirm,
  type PaymentIntentCapture,
  type StripeConfirmWatch,
} from "../../utils/stripe3ds";
import {
  TEMPLATE_WIND_URL,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantId,
  readSharedState,
} from "../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
/** A return URL for the report, with the client secret's secret half hidden. */
const maskSecret = (url: string) => url.replace(/_secret_[^&]+/, "_secret_***");
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

/**
 * A card that needs a 3D Secure bank check, on template-wind.
 *
 * Stripe's "always authenticate" test card (4000 0027 6000 3184) shows the
 * bank's test page with COMPLETE / FAIL. Stripe.js runs it IN THE PAGE by
 * default (a modal; `return_url` is not visited), so each outcome is tested
 * twice: in-page, and as a real full-page redirect through Stripe's hosted
 * 3DS page back to wind's own `return_url`, `/checkout/return` (see
 * utils/stripe3ds.ts for how the redirect is triggered). The redirect tests
 * are the only coverage of the return page: `POST /api/stripe/confirm-payment`
 * from it, the cart cleared, `/order-confirmation/:id`.
 *
 * Every run uses a fresh customer email + phone (one Stripe Customer per
 * identity holds a capped number of saved cards). Paid orders are refunded
 * and unpaid placeholders cancelled in afterAll.
 */
test.describe("Customer — 3D Secure bank check (wind) @3ds", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL and OWNER_PASSWORD must be set in .env"
  );

  const createdOrders: string[] = [];
  const windOrigin = new URL(TEMPLATE_WIND_URL || "https://invalid").origin;
  const returnUrl = `${windOrigin}/checkout/return`;

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test.afterAll(async () => {
    await cleanUpOrders(OWNER_EMAIL, OWNER_PASSWORD, createdOrders, "wind 3DS");
  });

  interface Attempt {
    email: string;
    restaurantId: string;
    pi: PaymentIntentCapture;
    watch: StripeConfirmWatch;
    confirmCalls: () => number;
    /** Every URL the main frame loaded from the moment Complete Order was pressed. */
    navigations: string[];
  }

  /**
   * Real UI cart (no seeded init script — it would re-seed the cart on the
   * redirect back and hide whether the return page cleared it) → checkout →
   * pay with the 3DS card, up to the bank's test page.
   */
  const payWith3dsCard = async (
    page: Page,
    mode: "in-page" | "redirect"
  ): Promise<Attempt> => {
    const restaurantId = readRestaurantId();
    const { menuItemName } = readSharedState();
    const menu = createCustomerMenuPage(page);
    const checkout = createCustomerCheckoutPage(page);
    const email = generateUserEmail("wind3ds");

    await allure.step(
      "Add the item through the menu and open checkout",
      async () => {
        await menu.goto(restaurantId);
        await menu.openItemModal(menuItemName);
        await menu.assertItemModalOpen();
        await menu.clickAddToCart();
        await menu.assertCartButtonVisible();
        await menu.openCart();
        await menu.proceedToCheckout();
        await checkout.assertFormVisible();
      }
    );

    await checkout.fillCustomerInfo(
      "Auto",
      "ThreeDS",
      email,
      generateSeedPhone()
    );
    await checkout.selectPickup();

    const piPromise = capturePaymentIntent(page);
    await checkout.clickProceedToPayment();
    await checkout.assertPaymentSectionVisible();
    const pi = await piPromise;
    createdOrders.push(pi.orderId);
    await allure.parameter("orderId", pi.orderId);
    await allure.parameter("paymentIntent", pi.paymentIntentId);

    await checkout.fillStripeCard(STRIPE_CARDS.VISA_3DS_ALWAYS);

    const watch =
      mode === "redirect"
        ? await forceStripeRedirect(page)
        : watchStripeConfirm(page);
    const confirmCalls = countConfirmPaymentCalls(page);
    const navigations: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });

    await checkout.completeOrder();

    if (mode === "redirect") {
      await allure.step(
        "Stripe sends the whole page to its hosted 3DS page",
        async () => {
          await page.waitForURL(/hooks\.stripe\.com\/3d_secure_2\/hosted/, {
            timeout: 45_000,
          });
          expect(watch.rewritten(), "the confirm asked for a redirect").toBe(
            true
          );
        }
      );
    } else {
      await allure.step(
        "The bank check opens IN the checkout page",
        async () => {
          await expect(challengeIframe(page).first()).toBeVisible({
            timeout: 45_000,
          });
          expect(new URL(page.url()).pathname).toBe("/checkout");
        }
      );
    }
    // Where Stripe would send the customer back — both modes send the same.
    expect(watch.returnUrl(), "return_url sent to Stripe").toBe(returnUrl);

    return { email, restaurantId, pi, watch, confirmCalls, navigations };
  };

  /** The paid outcome both modes must end in. */
  const assertPaidAndConfirmed = async (page: Page, a: Attempt) => {
    const confirmation = createCustomerOrderConfirmationPage(page);
    const checkout = createCustomerCheckoutPage(page);
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

    await allure.step("Order Confirmed for THIS order", async () => {
      await expect(page).toHaveURL(
        new RegExp(`/order-confirmation/${a.pi.orderId}$`),
        { timeout: 60_000 }
      );
      await confirmation.assertConfirmed();
      await confirmation.assertCustomerName("Auto");
      expect(a.confirmCalls(), "POST /api/stripe/confirm-payment calls").toBe(
        1
      );
    });

    await allure.step(
      "Backend: paid, not INITIALIZED, exactly one order",
      async () => {
        await expect
          .poll(
            async () =>
              (await ownerOrder(accessToken, a.pi.orderId)).paymentStatus,
            {
              timeout: 30_000,
            }
          )
          .toBe("COMPLETED");
        const order = await ownerOrder(accessToken, a.pi.orderId);
        await allure.attachment(
          "order",
          JSON.stringify(order, null, 2),
          "application/json"
        );
        expect(order.status).not.toBe("INITIALIZED");
        expect(await paymentIntentStatus(a.pi.clientSecret)).toBe("succeeded");
        const orders = await ownerOrdersFor(
          accessToken,
          a.restaurantId,
          a.email
        );
        expect(
          orders.map((o) => o.id),
          "orders for this customer"
        ).toEqual([a.pi.orderId]);

        // The confirmation's money lines are the order's own breakdown.
        await expect(
          page.locator('[data-testid^="order-breakdown-totals-"]').first()
        ).toBeVisible({ timeout: 20_000 });
        assertSameLines(
          apiBreakdownLines(order as Parameters<typeof apiBreakdownLines>[0]),
          await readWindConfirmationLines(page),
          "wind confirmation after 3DS"
        );
      }
    );

    await allure.step("The cart is empty afterwards", async () => {
      const items = await page.evaluate(() => {
        const raw = sessionStorage.getItem("cart");
        return raw
          ? ((JSON.parse(raw) as { items?: unknown[] }).items ?? []).length
          : 0;
      });
      expect(items, "cart items in sessionStorage").toBe(0);
      await checkout.gotoCheckoutEmpty(a.restaurantId);
      await checkout.assertEmptyCart();
    });
  };

  /** The unpaid outcome both modes must end in. */
  const assertNotPaid = async (page: Page, a: Attempt) => {
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const checkout = createCustomerCheckoutPage(page);
    const { menuItemName } = readSharedState();

    await allure.step(
      "Checkout says the payment didn't go through",
      async () => {
        await expect(page).toHaveURL(/\/checkout(\?|$)/, { timeout: 60_000 });
        await expect(
          page
            .getByText(
              /unable to authenticate|failed authentication|payment was not completed/i
            )
            .first()
        ).toBeVisible({ timeout: 20_000 });
        expect(page.url()).not.toContain("order-confirmation");
        expect(a.confirmCalls(), "no confirm-payment for a failed check").toBe(
          0
        );
        // The order is still in the cart to try again.
        // (Order Summary line "1x <item>"; a bare getByText also matches a
        // hidden copy of the name.)
        await expect(
          page.getByRole("heading", {
            name: new RegExp(`^\\d+x ${menuItemName}$`),
          })
        ).toBeVisible({ timeout: 10_000 });
        // …and can pay again: in the page the card step stays (Complete
        // Order); after the redirect checkout starts over (Proceed to Payment).
        await expect(
          page
            .getByRole("button", { name: "Complete Order" })
            .or(checkout.proceedToPaymentButton())
        ).toBeVisible({ timeout: 10_000 });
      }
    );

    await allure.step(
      "Backend: not paid, nothing charged, no order for the owner",
      async () => {
        const order = await ownerOrder(accessToken, a.pi.orderId);
        await allure.attachment(
          "order",
          JSON.stringify(order, null, 2),
          "application/json"
        );
        expect(order.status).toBe("INITIALIZED");
        expect(order.paymentStatus).not.toBe("COMPLETED");
        expect(await paymentIntentStatus(a.pi.clientSecret)).toBe(
          "requires_payment_method"
        );
        expect(
          await ownerOrdersFor(accessToken, a.restaurantId, a.email)
        ).toEqual([]);
      }
    );
  };

  test("TC-914: 3DS completed in the page — order confirmed, paid once, cart empty", async ({
    page,
  }) => {
    await allure.description(
      "Card 4000 0027 6000 3184 → Stripe's bank check opens in the checkout page → COMPLETE. " +
        "Lands on /order-confirmation/<the order> with Order Confirmed! and the backend's money lines; " +
        "one confirm-payment call; owner GET /api/order/:id is COMPLETED (not INITIALIZED); the " +
        "PaymentIntent succeeded; exactly one order for this customer; the cart is empty."
    );
    const attempt = await payWith3dsCard(page, "in-page");
    await answerStripe3ds(page, "COMPLETE");
    await assertPaidAndConfirmed(page, attempt);
  });

  test("TC-915: 3DS failed in the page — payment error, nothing charged", async ({
    page,
  }) => {
    await allure.description(
      "Same card, FAIL on the in-page bank check. Checkout stays, shows the payment error and " +
        "keeps the cart; no confirm-payment; the order stays INITIALIZED, the PaymentIntent is " +
        "requires_payment_method (nothing charged) and the owner sees no order."
    );
    const attempt = await payWith3dsCard(page, "in-page");
    await answerStripe3ds(page, "FAIL");
    await assertNotPaid(page, attempt);
  });

  test("TC-916: 3DS completed through a full-page redirect — /checkout/return finishes the order", async ({
    page,
  }) => {
    await allure.description(
      "The bank check as a real redirect: Stripe's hosted 3DS page → COMPLETE → Stripe sends the " +
        "browser to wind's /checkout/return with payment_intent and payment_intent_client_secret " +
        "(Stripe's hosted page adds source_type=card, not redirect_status). The return page strips them from the address bar, calls " +
        "POST /api/stripe/confirm-payment once, clears the cart and lands on " +
        "/order-confirmation/<the order>. Same backend checks as TC-914."
    );
    const attempt = await payWith3dsCard(page, "redirect");
    await answerStripe3ds(page, "COMPLETE");

    await allure.step(
      "Stripe returned to /checkout/return with its parameters",
      async () => {
        await expect(page).toHaveURL(/\/order-confirmation\//, {
          timeout: 60_000,
        });
        const landed = attempt.navigations.find((u) =>
          u.startsWith(`${returnUrl}?`)
        );
        expect(landed, attempt.navigations.join("\n")).toBeTruthy();
        const q = new URL(landed!).searchParams;
        expect(q.get("payment_intent")).toBe(attempt.pi.paymentIntentId);
        expect(q.get("payment_intent_client_secret")).toBe(
          attempt.pi.clientSecret
        );
        // No redirect_status assertion: Stripe's hosted 3DS page returns
        // payment_intent + payment_intent_client_secret (+ source_type=card)
        // but not redirect_status (seen on QA 2026-10-23). The return page
        // never trusts it anyway; it asks Stripe for the intent's status.
        await allure.parameter("returned to", maskSecret(landed!));
        // The secret never stays in the address bar.
        expect(page.url()).not.toContain("_secret_");
      }
    );

    await assertPaidAndConfirmed(page, attempt);
  });

  test("TC-917: 3DS failed through a full-page redirect — back on checkout with the error, nothing charged", async ({
    page,
  }) => {
    await allure.description(
      "FAIL on Stripe's hosted 3DS page → Stripe sends the browser to /checkout/return with " +
        "the same parameters; the intent is now requires_payment_method. The return page sends the customer back to /checkout with the " +
        "payment error shown and the cart intact; no confirm-payment; same backend checks as TC-915."
    );
    const attempt = await payWith3dsCard(page, "redirect");
    await answerStripe3ds(page, "FAIL");

    await allure.step(
      "Stripe returned to /checkout/return for this PaymentIntent",
      async () => {
        await expect(page).toHaveURL(/\/checkout(\?|$)/, { timeout: 60_000 });
        const landed = attempt.navigations.find((u) =>
          u.startsWith(`${returnUrl}?`)
        );
        expect(landed, attempt.navigations.join("\n")).toBeTruthy();
        const q = new URL(landed!).searchParams;
        expect(q.get("payment_intent")).toBe(attempt.pi.paymentIntentId);
        expect(q.get("payment_intent_client_secret")).toBe(
          attempt.pi.clientSecret
        );
        await allure.parameter("returned to", maskSecret(landed!));
      }
    );

    await assertNotPaid(page, attempt);
  });
});
