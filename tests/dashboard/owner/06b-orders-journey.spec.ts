/**
 * 06b-orders-journey.spec.ts — the customer → owner through-lines (Layer 3).
 *
 * These are the only Orders tests that need a real Stripe checkout: one
 * browser context is an anonymous customer on Template Wind (`page`), the
 * other is the restored owner session (`ownerPage`), in the SAME test. They
 * prove the hand-off — "did the order the customer placed actually reach the
 * owner, with the same receipt / items / total / contact?" — which no amount
 * of API-seeded Orders-tab testing (06-orders.spec.ts) can prove.
 *
 * Kept in their own file so a Stripe/storefront hiccup fails here, not the
 * 30-test owner-UI file. Tagged @stripe in the title for targeted runs.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerOrdersPage } from "../../../pages/dashboard/owner/OwnerOrdersPage";
import { createCustomerCheckoutPage } from "../../../pages/customer/CustomerCheckoutPage";
import {
  readSharedState,
  generateRunId,
  generateSeedPhone,
  generateSeedSurname,
  TEMPLATE_WIND_URL,
} from "../../../utils/testData";
import {
  apiLogin,
  refundOrderRaw,
  BACKEND_URL,
} from "../../../utils/apiHelper";
import { STRIPE_CARDS } from "../../../utils/stripeCards";
import { waitForEmail } from "../../../utils/emailHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const MAILPIT_BASE_URL = process.env.MAILPIT_BASE_URL ?? "";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

test.describe("Owner — Orders journey (customer → owner)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  test.skip(!TEMPLATE_WIND_URL, "TEMPLATE_WIND_URL not set");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Orders");
    await allure.label("severity", "critical");
  });

  /**
   * Guest pickup checkout on Template Wind with a real Stripe test card.
   * Returns the order id (from the confirmation URL) and the checkout total
   * as displayed to the customer right before paying.
   */
  const placeStripePickupOrder = async (
    page: import("@playwright/test").Page,
    customer: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    }
  ) => {
    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);
    await checkoutPage.seedCart(
      restaurantId,
      menuItemId,
      menuItemName,
      menuItemPrice
    );
    await checkoutPage.fillCustomerInfo(
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.phone
    );
    await checkoutPage.selectPickup();
    await expect
      .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
      .not.toBeNaN();
    const checkoutTotal = await checkoutPage.readOrderTotal();
    await checkoutPage.clickProceedToPayment();
    await checkoutPage.assertPaymentSectionVisible();
    await checkoutPage.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
    await checkoutPage.completeOrder();
    await page
      .getByRole("heading", { name: "Order Confirmed!" })
      .waitFor({ state: "visible", timeout: 30_000 });
    const orderId = page.url().match(/order-confirmation\/([^/?]+)/)?.[1] ?? "";
    expect(orderId).toBeTruthy();
    return { orderId, checkoutTotal, restaurantId, menuItemName };
  };

  test("TC-253 @stripe: a customer's Stripe order reaches the owner with the same receipt, items, total and contact, and the owner works it to Picked Up", async ({
    page,
    ownerPage,
  }) => {
    await allure.description(
      "THE through-line. Guest places a real pickup order on Template Wind (`page`); the owner " +
        "(`ownerPage`) opens it by id — same receipt #, 'Customer paid' equals the checkout total, " +
        "the item is listed, Customer Info shows the name/phone the customer typed — then finds it " +
        "in the grid by the customer's surname (exactly one row) and marks it Confirmed → Preparing → " +
        "Ready → Picked Up. Never searches by the confirmation page's 'Order #' — that is the DAILY " +
        "order number, not the permanent receipt."
    );
    const runId = generateRunId();
    const surname = generateSeedSurname(runId);
    const customer = {
      firstName: "Journey",
      lastName: surname,
      email: `journey_${runId}@restaunax-test.com`,
      phone: generateSeedPhone(),
    };

    const placed = await allure.step(
      "Customer completes a real Stripe pickup checkout",
      () => placeStripePickupOrder(page, customer)
    );
    await allure.parameter("orderId", placed.orderId);
    await allure.parameter("checkoutTotal", String(placed.checkoutTotal));

    const ordersPage = createOwnerOrdersPage(ownerPage);
    let receipt = "";

    await allure.step(
      "Owner opens the order — same money/items/contact",
      async () => {
        await ordersPage.gotoOrderDetail(placed.restaurantId, placed.orderId);
        receipt = await ordersPage.sheetReceiptNumber();
        expect(receipt).toBeTruthy();
        await allure.parameter("receiptNumber", receipt);
        await expect(ordersPage.moneyRow("Customer paid")).toHaveText(
          usd(placed.checkoutTotal)
        );
        await expect(ordersPage.itemRow(placed.menuItemName)).toBeVisible();
        await expect(ordersPage.orderInfoValue("Payment Status:")).toHaveText(
          /COMPLETED/i
        );
        await ordersPage.openTab("Customer Info");
        await expect(ordersPage.customerInfoValue("Customer Name")).toHaveText(
          `${customer.firstName} ${customer.lastName}`
        );
        await expect(
          ordersPage.customerInfoValue("Phone Number")
        ).toContainText(customer.phone);
        await expect(ordersPage.customerInfoValue("Email Address")).toHaveText(
          customer.email
        );
        await ordersPage.closeOrderDetail();
      }
    );

    await allure.step("Owner finds it in the grid by surname", async () => {
      const { json } = await ordersPage.waitForManagementResponse(
        () => ordersPage.searchOrders(surname),
        (q) => q.get("search") === surname
      );
      expect(json.totalCount).toBe(1);
      expect(json.orders[0]?.id).toBe(placed.orderId);
      expect(json.orders[0]?.paymentStatus).toBe("COMPLETED");
      await expect(ordersPage.rowByReceipt(receipt)).toBeVisible({
        timeout: 15_000,
      });
    });

    await allure.step("Owner works the order to Picked Up", async () => {
      await ordersPage.gotoOrderDetail(placed.restaurantId, placed.orderId);
      for (const step of [
        { button: "Confirmed", status: "CONFIRMED" },
        { button: "Preparing", status: "PREPARING" },
        { button: "Ready", status: "READY" },
        { button: "Picked Up", status: "PICKED_UP" },
      ]) {
        await expect(ordersPage.markAsNextButton()).toHaveText(
          `Mark as ${step.button}`
        );
        const body = await ordersPage.waitForStatusPut(() =>
          ordersPage.clickMarkAsNext()
        );
        expect(body.status).toBe(step.status);
      }
      await expect(ordersPage.markAsNextButton()).toHaveCount(0);
      await expect(ordersPage.statusChip()).toHaveText("Picked Up");
    });
  });

  test("TC-225 @stripe: owner cancels a Stripe-paid order and triggers a real refund", async ({
    page,
    ownerPage,
  }) => {
    await allure.description(
      "Drives a real customer Stripe checkout on Template Wind, then cancels that order from the " +
        "owner dashboard. Cancel Order's nested dialog smart-detects a completed Stripe payment and " +
        "switches to the refund copy/button ('Cancel & Refund'), which triggers a real " +
        "stripe.refunds.create on confirm (PUT /api/order/statistics/cancel/:orderId)."
    );

    const runId = generateRunId();
    const customer = {
      firstName: `Refund${runId}`,
      lastName: "Tester",
      email: `refundtest_${runId}@restaunax-test.com`,
      phone: generateSeedPhone(),
    };
    const placed = await allure.step(
      "Complete a real Stripe checkout as a guest customer",
      () => placeStripePickupOrder(page, customer)
    );
    await allure.parameter("orderId", placed.orderId);
    await allure.parameter("customerEmail", customer.email);

    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step(
      "Owner deep-links to the order's detail sheet",
      async () => {
        await ordersPage.gotoOrderDetail(placed.restaurantId, placed.orderId);
      }
    );

    await allure.step(
      "Open Cancel Order and verify the paid-refund copy appears",
      async () => {
        await ordersPage.openCancelDialog();
        await ordersPage.assertRefundCopyVisible();
        await expect(ordersPage.confirmCancelAndRefundButton()).toBeVisible({
          timeout: 10_000,
        });
      }
    );

    await allure.step(
      "Confirm Cancel & Refund and verify the order is REFUNDED",
      async () => {
        const body = await ordersPage.waitForCancelPut(() =>
          ordersPage.confirmCancelAndRefund()
        );
        expect(body.success).toBe(true);
        expect(body.action).toBe("REFUNDED");
        expect(body.refundId).toBeTruthy();
      }
    );

    // ── TC-254 continuation: the refund is visible to the customer + idempotent
    await allure.step(
      "TC-254: customer-side order status is REFUNDED (receipt-scoped public read)",
      async () => {
        // GET /api/order/:id?receipt=<receiptNumber> is the customer's own
        // read (full body only with the matching receipt).
        const receipt = await ordersPage.sheetReceiptNumber().catch(() => "");
        const res = await fetch(
          `${BACKEND_URL}/api/order/${placed.orderId}?receipt=${encodeURIComponent(receipt)}`
        );
        expect(res.status).toBe(200);
        const order = (await res.json()) as {
          status?: string;
          paymentStatus?: string;
        };
        expect(order.status).toBe("REFUNDED");
        expect(order.paymentStatus).toBe("REFUNDED");
      }
    );

    await allure.step(
      "TC-254: a second refund attempt is rejected (already refunded)",
      async () => {
        const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
        const again = await refundOrderRaw(accessToken, placed.orderId, {
          reason: "double refund attempt",
        });
        expect(again.status).toBe(400);
        // paymentStatus is now REFUNDED, so the "only completed payments"
        // guard fires first; "already refunded" is the sibling guard.
        expect(JSON.stringify(again.data)).toMatch(
          /only completed payments|already been refunded/i
        );
      }
    );

    if (MAILPIT_BASE_URL) {
      await allure.step(
        "TC-254 @email: the customer receives the refund confirmation email",
        async () => {
          const mail = await waitForEmail(customer.email, {
            subjectPattern: /refund confirmation/i,
            timeoutMs: 60_000,
          });
          expect(mail.subject).toMatch(/refund confirmation/i);
        }
      );
    } else {
      test.info().annotations.push({
        type: "note",
        description: "MAILPIT_BASE_URL not set — refund-email step skipped.",
      });
    }
  });
});
