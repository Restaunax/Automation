import * as allure from "allure-js-commons";
import { type Page } from "@playwright/test";

import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { apiLogin } from "../../utils/apiHelper";
import {
  apiBreakdownLines,
  assertSameLines,
  readLimaConfirmationLines,
} from "../../utils/orderBreakdown";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
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
  generateSeedPhone,
  generateUserEmail,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
/** A return URL for the report, with the client secret's secret half hidden. */
const maskSecret = (url: string) => url.replace(/_secret_[^&]+/, "_secret_***");

/**
 * A card that needs a 3D Secure bank check, on template-lima (the embedded
 * ordering surface under a tenant basename).
 *
 * Same plan as the wind file (`customer/12-3ds-bank-check.spec.ts`): each
 * outcome in the page (Stripe.js's default modal, `return_url` not visited)
 * and as a real full-page redirect through Stripe's hosted 3DS page back to
 * lima's own `return_url`, `/<slug>/checkout/return` — the only coverage of
 * `CheckoutReturn.tsx`. Fresh customer per run; paid orders refunded and
 * unpaid placeholders cancelled in afterAll.
 */
test.describe("Lima — 3D Secure bank check @3ds", () => {
  const restaurantSlug = readRestaurantSlug();

  test.skip(
    !restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD,
    "Ordering slug not seeded, or OWNER_EMAIL / OWNER_PASSWORD unset"
  );

  const createdOrders: string[] = [];

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "blocker");
  });

  test.afterAll(async () => {
    await cleanUpOrders(OWNER_EMAIL, OWNER_PASSWORD, createdOrders, "lima 3DS");
  });

  interface Attempt {
    email: string;
    restaurantId: string;
    pi: PaymentIntentCapture;
    watch: StripeConfirmWatch;
    confirmCalls: () => number;
    navigations: string[];
    returnUrl: string;
  }

  /**
   * Press Order Now until the press reaches Stripe. Lima's Link panel can
   * swallow a press (see LimaCheckoutPage.placeOrderAndConfirm); a lost press
   * sent nothing, so pressing again cannot pay twice.
   */
  const submitPayment = async (page: Page) => {
    const checkout = createLimaCheckoutPage(page);
    let submitted = false;
    const onRequest = (r: { url: () => string; method: () => string }) => {
      if (
        r.method() === "POST" &&
        /api\.stripe\.com\/v1\/(payment_methods|payment_intents|confirmation_tokens)/.test(
          r.url()
        )
      )
        submitted = true;
    };
    page.on("request", onRequest);
    try {
      await expect(async () => {
        if (!submitted) await checkout.placeOrder();
        expect(submitted, "Order Now reached Stripe").toBe(true);
      }).toPass({ timeout: 60_000, intervals: [3_000, 5_000, 5_000] });
    } finally {
      page.off("request", onRequest);
    }
  };

  const payWith3dsCard = async (
    page: Page,
    mode: "in-page" | "redirect"
  ): Promise<Attempt> => {
    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);
    const checkout = createLimaCheckoutPage(page);
    const email = generateUserEmail("lima3ds");
    const returnUrl = `${lima.tenantRoot(restaurantSlug)}/checkout/return`;

    await allure.step("Menu → item → cart → checkout (Pickup)", async () => {
      await lima.gotoMenu(restaurantSlug);
      await lima.assertOnMenu();
      await lima.openItemModal(state.menuItemName);
      await lima.clickAddToCart();
      await page.goto(`${lima.tenantRoot(restaurantSlug)}/cart`, {
        waitUntil: "domcontentloaded",
      });
      await expect(checkout.proceedToCheckoutButton()).toBeVisible({
        timeout: 20_000,
      });
      await checkout.goToCheckout();
      await checkout.assertPickupSelected();
      await checkout.fillCustomerInfo({
        firstName: "Auto",
        lastName: "ThreeDS",
        email,
        phone: generateSeedPhone(),
      });
    });

    const piPromise = capturePaymentIntent(page);
    await checkout.proceedToPayment();
    const pi = await piPromise;
    createdOrders.push(pi.orderId);
    await allure.parameter("orderId", pi.orderId);
    await allure.parameter("paymentIntent", pi.paymentIntentId);

    await fillStripePaymentElement(page, STRIPE_CARDS.VISA_3DS_ALWAYS);

    const watch =
      mode === "redirect"
        ? await forceStripeRedirect(page)
        : watchStripeConfirm(page);
    const confirmCalls = countConfirmPaymentCalls(page);
    const navigations: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });

    await submitPayment(page);

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
          await checkout.assertOnCheckout();
        }
      );
    }
    // The return_url stays inside the tenant basename.
    expect(watch.returnUrl(), "return_url sent to Stripe").toBe(returnUrl);

    return {
      email,
      restaurantId: state.restaurantId,
      pi,
      watch,
      confirmCalls,
      navigations,
      returnUrl,
    };
  };

  /** Lima's tenant-scoped cart in sessionStorage: number of items. */
  const storedCartItems = (page: Page, restaurantId: string) =>
    page.evaluate((rid) => {
      const raw = sessionStorage.getItem(`rx:r_${rid}:cart`);
      return raw
        ? ((JSON.parse(raw) as { items?: unknown[] }).items ?? []).length
        : 0;
    }, restaurantId);

  const assertPaidAndConfirmed = async (page: Page, a: Attempt) => {
    const lima = createLimaStorefrontPage(page);
    const checkout = createLimaCheckoutPage(page);
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

    await allure.step(
      "Confirmation for THIS order, inside the tenant",
      async () => {
        await expect(page).toHaveURL(
          new RegExp(`/${restaurantSlug}/order-confirmation/${a.pi.orderId}$`),
          { timeout: 60_000 }
        );
        // Lima's confirmation heading (wind says "Order Confirmed!").
        await expect(
          page.getByRole("heading", { name: "Thank You for Your Order!" })
        ).toBeVisible({ timeout: 20_000 });
        expect(a.confirmCalls(), "POST /api/stripe/confirm-payment calls").toBe(
          1
        );
      }
    );

    await allure.step(
      "Backend: paid, not INITIALIZED, exactly one order",
      async () => {
        await expect
          .poll(
            async () =>
              (await ownerOrder(accessToken, a.pi.orderId)).paymentStatus,
            { timeout: 30_000 }
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

        await expect(
          page.locator('[data-testid^="order-breakdown-totals-"]').first()
        ).toBeVisible({ timeout: 20_000 });
        assertSameLines(
          apiBreakdownLines(order as Parameters<typeof apiBreakdownLines>[0]),
          await readLimaConfirmationLines(page),
          "lima confirmation after 3DS"
        );
      }
    );

    await allure.step("The cart is empty afterwards", async () => {
      expect(await storedCartItems(page, a.restaurantId)).toBe(0);
      expect(await lima.cartBadgeCount()).toBe(0);
      await page.goto(`${lima.tenantRoot(restaurantSlug)}/cart`, {
        waitUntil: "domcontentloaded",
      });
      await expect(checkout.emptyCartMessage()).toBeVisible({
        timeout: 20_000,
      });
    });
  };

  const assertNotPaid = async (page: Page, a: Attempt) => {
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const checkout = createLimaCheckoutPage(page);

    await allure.step(
      "Checkout says the payment didn't go through",
      async () => {
        await expect(page).toHaveURL(
          new RegExp(`/${restaurantSlug}/checkout$`),
          { timeout: 60_000 }
        );
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
        // The item is still in the cart to try again.
        expect(await storedCartItems(page, a.restaurantId)).toBe(1);
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
    await checkout.assertOnCheckout();
  };

  /** The URL Stripe sent the browser back to, from the main-frame history. */
  const returnedTo = (a: Attempt): URL => {
    const landed = a.navigations.find((u) => u.startsWith(`${a.returnUrl}?`));
    expect(landed, a.navigations.join("\n")).toBeTruthy();
    return new URL(landed!);
  };

  test("TC-L73: 3DS completed in the page — order confirmed, paid once, cart empty", async ({
    page,
  }) => {
    await allure.description(
      "Card 4000 0027 6000 3184 → the bank check opens in lima's checkout → Complete. Lands on " +
        "/<slug>/order-confirmation/<the order> with the backend's money lines; one " +
        "confirm-payment call; owner GET /api/order/:id is COMPLETED (not INITIALIZED); the " +
        "PaymentIntent succeeded; exactly one order for this customer; the cart is empty."
    );
    const attempt = await payWith3dsCard(page, "in-page");
    await answerStripe3ds(page, "COMPLETE");
    await assertPaidAndConfirmed(page, attempt);
  });

  test("TC-L74: 3DS failed in the page — payment error, nothing charged", async ({
    page,
  }) => {
    await allure.description(
      "Same card, Fail on the in-page bank check. Checkout stays and shows the error with the " +
        "cart kept; no confirm-payment; the order stays INITIALIZED, the PaymentIntent is " +
        "requires_payment_method and the owner sees no order."
    );
    const attempt = await payWith3dsCard(page, "in-page");
    await answerStripe3ds(page, "FAIL");
    await assertNotPaid(page, attempt);
  });

  test("TC-L75: 3DS completed through a full-page redirect — /<slug>/checkout/return finishes the order", async ({
    page,
  }) => {
    await allure.description(
      "The bank check as a real redirect: Stripe's hosted 3DS page → Complete → Stripe sends the " +
        "browser to /<slug>/checkout/return with payment_intent and payment_intent_client_secret. " +
        "CheckoutReturn strips them, calls POST /api/stripe/confirm-payment once, clears the cart " +
        "and lands on /<slug>/order-confirmation/<the order>. Same backend checks as TC-L73."
    );
    const attempt = await payWith3dsCard(page, "redirect");
    await answerStripe3ds(page, "COMPLETE");

    await allure.step(
      "Stripe returned to /<slug>/checkout/return for this PaymentIntent",
      async () => {
        await expect(page).toHaveURL(/\/order-confirmation\//, {
          timeout: 60_000,
        });
        const q = returnedTo(attempt).searchParams;
        expect(q.get("payment_intent")).toBe(attempt.pi.paymentIntentId);
        expect(q.get("payment_intent_client_secret")).toBe(
          attempt.pi.clientSecret
        );
        await allure.parameter(
          "returned to",
          maskSecret(returnedTo(attempt).toString())
        );
        expect(page.url()).not.toContain("_secret_");
      }
    );

    await assertPaidAndConfirmed(page, attempt);
  });

  test("TC-L76: 3DS failed through a full-page redirect — back on checkout with the error, nothing charged", async ({
    page,
  }) => {
    await allure.description(
      "Fail on Stripe's hosted 3DS page → /<slug>/checkout/return → back to /<slug>/checkout " +
        "with the payment error and the cart kept; no confirm-payment; same backend checks as TC-L74."
    );
    const attempt = await payWith3dsCard(page, "redirect");
    await answerStripe3ds(page, "FAIL");

    await allure.step(
      "Stripe returned to /<slug>/checkout/return for this PaymentIntent",
      async () => {
        await expect(page).toHaveURL(
          new RegExp(`/${restaurantSlug}/checkout$`),
          { timeout: 60_000 }
        );
        const q = returnedTo(attempt).searchParams;
        expect(q.get("payment_intent")).toBe(attempt.pi.paymentIntentId);
        expect(q.get("payment_intent_client_secret")).toBe(
          attempt.pi.clientSecret
        );
        await allure.parameter(
          "returned to",
          maskSecret(returnedTo(attempt).toString())
        );
      }
    );

    await assertNotPaid(page, attempt);
  });
});
