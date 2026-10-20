/**
 * 27-order-breakdown.spec.ts — one real order reads the same money lines on
 * every surface (spec: restaunax docs/features/ORDER_MONEY_BREAKDOWN.md).
 *
 * TC-898: a pickup order on the template-wind storefront with an AUTOMATIC
 * free-item promotion, redeemed points, a partial gift card and a tip, paid
 * with the Stripe test card. The backend `breakdown` (GET /api/order/:id, owner
 * token) is the oracle; the wind checkout, the wind confirmation page, the
 * owner dashboard's order sheet, the POS live feed and the confirmation email
 * must each show exactly its (label, amount) lines.
 *
 * Not covered here, by design: a combo/deal item (DEAL_SAVINGS) and
 * delivery/FREE_DELIVERY. A FREE_ITEM promotion and a combo cannot share an
 * order (PROMOTIONS.md "Which promotion wins"), and wind's delivery address
 * needs a Google Places suggestion that QA does not return — those are the
 * backend table tests' job.
 *
 * The free item is an AUTOMATIC FREE_ITEM triggered by buying this run's own
 * item (never a spend offer: only customer/10-promotions may run one on the
 * seed restaurant), on a cart under $55. Everything is AUTO/"Automation Menu"
 * named and deleted in afterAll (shared serial setup); the gift card is
 * recorded for the teardown freeze. The imported reward member is named
 * "AUTO Breakdown Member <runId>" and stays: customers have no delete endpoint.
 * No deal is created, so no active-deal slot is held (TEST_PLAN footprint).
 *
 * FREE marker: asserted where the surface draws item rows from the breakdown
 * (backend, wind confirmation, dashboard sheet, email). The wind checkout's
 * item rows come from the local cart, not `breakdown.items`, so it shows no
 * marker by design (exemption in TEST_CASES.md TC-898).
 *
 * The email step is @email: it needs Mailpit and is skipped when
 * MAILPIT_BASE_URL is unset.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createCustomerCheckoutPage } from "../../../pages/customer/CustomerCheckoutPage";
import { createCustomerOrderConfirmationPage } from "../../../pages/customer/CustomerOrderConfirmationPage";
import { createCustomerRewardSection } from "../../../pages/customer/CustomerRewardSection";
import { createOwnerOrdersPage } from "../../../pages/dashboard/owner/OwnerOrdersPage";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  deactivateTabletDeviceRaw,
  getCurrentOrders,
  getOrderByIdRaw,
  seedFundedGiftCard,
  tabletLogin,
  type TabletDevice,
} from "../../../utils/apiHelper";
import { waitForEmail } from "../../../utils/emailHelper";
import {
  apiBreakdownLines,
  assertSameLines,
  assertSums,
  readDashboardLines,
  readEmailItemNames,
  readEmailLines,
  readWindCheckoutLines,
  readWindConfirmationLines,
  type ApiBreakdown,
  type Line,
} from "../../../utils/orderBreakdown";
import { cleanupStorefrontPromotions } from "../../../utils/promotionFixtures";
import type { SeededItem } from "../../../utils/promotionFixtures";
import { createCouponPromotion } from "../../../utils/promotionsApi";
import {
  expectShownMatchesLatestQuote,
  trackQuotes,
} from "../../../utils/quoteTracker";
import { seedRewardMember } from "../../../utils/rewardsApi";
import { STRIPE_CARDS } from "../../../utils/stripeCards";
import {
  generateRunId,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantId,
  recordGiftCardForCleanup,
} from "../../../utils/testData";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT_BASE_URL = process.env.MAILPIT_BASE_URL ?? "";

const PAID_PRICE = 20;
const GIFT_PRICE = 4;
const GIFT_CARD_BALANCE = 10;
const POINTS = 200;
const REDEEM_POINTS = 100;

test.describe("Order money breakdown — one order, every surface", () => {
  test.skip(
    !TEMPLATE_WIND_URL ||
      !OWNER_EMAIL ||
      !OWNER_PASSWORD ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_* and ADMIN_* must be set in .env"
  );
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  const runId = generateRunId();
  let restaurantId = "";
  const created: {
    groupId?: string;
    createdItems?: SeededItem[];
    createdCoupons?: string[];
  } = { createdItems: [], createdCoupons: [] };
  let paid: SeededItem;
  let gift: SeededItem;
  let promotionName = "";
  let phone = "";
  let giftCardCode = "";
  let customerEmail = "";
  let device: TabletDevice | undefined;
  let tabletToken = "";

  // Set by the placing test, read by the later surface tests.
  let orderId = "";
  let checkoutLines: Line[] = [];
  let confirmationLines: Line[] = [];

  const ownerToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  const oracle = async () => {
    const res = await getOrderByIdRaw(await ownerToken(), orderId);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.breakdown, "order has a breakdown").toBeTruthy();
    return res.data as typeof res.data & { breakdown: ApiBreakdown };
  };

  test.beforeAll(async () => {
    if (!TEMPLATE_WIND_URL || !OWNER_EMAIL || !ADMIN_EMAIL) return;
    restaurantId = readRestaurantId();
    const token = await ownerToken();
    const adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD))
      .accessToken;

    const group = await createMenuGroupNamed(
      token,
      `Automation Menu Breakdown ${runId}`,
      { restaurantId }
    );
    created.groupId = group.id;
    const item = async (what: string, price: number): Promise<SeededItem> => {
      const name = `Breakdown ${what} ${runId}`;
      const made = await createMenuItemFull(token, group.id, name, price, {
        description: "Automation order-breakdown item",
      });
      const seeded = { id: made.id, name, price };
      created.createdItems!.push(seeded);
      return seeded;
    };
    paid = await item("Platter", PAID_PRICE);
    gift = await item("Cookie", GIFT_PRICE);

    promotionName = `AUTO Breakdown free cookie ${runId}`;
    const coupon = await createCouponPromotion(token, restaurantId, {
      name: promotionName,
      type: "FREE_ITEM",
      value: 0,
      applyMode: "AUTOMATIC",
      triggerKind: "BUY_ITEM",
      triggerMenuItemId: paid.id,
      giftMenuItemId: gift.id,
    });
    created.createdCoupons!.push(coupon.id);

    phone = generateSeedPhone();
    // KNOWN BUG (TC-901): the customer confirmation email goes to the linked
    // Customer's email (the reward member's), not to the address typed at
    // checkout (restaunax-backend emailService.sendOrderConfirmationEmail:
    // `to: opts.to ?? order.customer.email`; the owner copy already prefers
    // `order.email`). Until it is fixed the member is seeded with the same
    // address we type, so this test reads the email wherever it lands.
    customerEmail = generateUserEmail("breakdown");
    await seedRewardMember(
      adminToken,
      restaurantId,
      phone,
      POINTS,
      customerEmail,
      `AUTO Breakdown Member ${runId}`
    );
    const card = await seedFundedGiftCard(
      adminToken,
      restaurantId,
      GIFT_CARD_BALANCE
    );
    recordGiftCardForCleanup(card.id);
    giftCardCode = card.code;

    device = await createTabletDevice(
      token,
      restaurantId,
      `Automation Breakdown POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);
  });

  test.afterAll(async () => {
    if (!OWNER_EMAIL) return;
    const token = await ownerToken();
    const failures: string[] = [];
    if (device) {
      const res = await deactivateTabletDeviceRaw(
        token,
        restaurantId,
        device.id
      ).catch((err: unknown) => ({ ok: false, status: 0, data: String(err) }));
      if (!res.ok) {
        failures.push(
          `tablet device ${device.id} deactivate → ${res.status}: ${JSON.stringify(res.data)}`
        );
      }
    }
    failures.push(...(await cleanupStorefrontPromotions(token, created)));
    expect(failures, "order-breakdown cleanup").toEqual([]);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Order Breakdown");
    await allure.label("severity", "critical");
  });

  test("TC-898: a wind order with a free item, points, a gift card and a tip reads the same money lines at checkout and on the confirmation page", async ({
    page,
  }, testInfo) => {
    const checkout = createCustomerCheckoutPage(page);
    const rewards = createCustomerRewardSection(page);
    const confirmation = createCustomerOrderConfirmationPage(page);
    const quotes = trackQuotes(page);

    await checkout.seedCartItems(restaurantId, [
      { menuItemId: paid.id, name: paid.name, price: paid.price, quantity: 1 },
    ]);
    await checkout.fillCustomerInfo(
      "Breakdown",
      "Tester",
      customerEmail,
      phone
    );

    await allure.step(
      "sign in as the reward member, redeem points",
      async () => {
        await rewards.signIn(phone);
        await rewards.redeem(REDEEM_POINTS);
      }
    );

    await allure.step("add the free item the promotion offers", async () => {
      await expect(checkout.freeItemOfferButton()).toHaveText(
        `You've earned a free ${gift.name} — Add it`,
        { timeout: 20_000 }
      );
      await checkout.freeItemOfferButton().click();
      await expect(
        page.getByRole("heading", { name: `1x ${gift.name}` })
      ).toBeVisible({ timeout: 15_000 });
    });

    await allure.step("apply the gift card, pick a tip", async () => {
      await checkout.applyGiftCard(giftCardCode);
      await checkout.assertGiftCardApplied();
      await checkout.selectTipPreset(15);
    });

    await checkout.selectPickup();
    // The summary is a skeleton while a quote is in flight: wait for the
    // screen to settle on the latest quote before reading any line.
    await expectShownMatchesLatestQuote(checkout.readOrderTotal, quotes);
    await expect(page.getByTestId("checkout-total")).toHaveText(/\$\d/);

    await allure.step("checkout lines add up", async () => {
      checkoutLines = await readWindCheckoutLines(page);
      assertSums(checkoutLines);
      const kinds = checkoutLines.map((l) => l.kind);
      for (const k of [
        "SUBTOTAL",
        "PROMOTION",
        "POINTS",
        "TAX",
        "TIP",
        "TOTAL",
        "GIFT_CARD",
        "CHARGED",
      ]) {
        expect(
          kinds,
          `checkout lines ${JSON.stringify(checkoutLines)}`
        ).toContain(k);
      }
      const quote = (await quotes.latest()).body.quote;
      expect(
        quote?.breakdown,
        "the latest /quote carries a breakdown"
      ).toBeTruthy();
      assertSameLines(
        apiBreakdownLines({ breakdown: quote!.breakdown! }),
        checkoutLines,
        "wind checkout vs its own /quote breakdown"
      );
    });

    await checkout.clickProceedToPayment();
    await checkout.assertPaymentSectionVisible();

    // One retry of the Stripe step (Link/Element flake), only when the first
    // attempt provably did not go through; then fail with screenshots.
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
      const pay = async () => {
        await checkout.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
        await checkout.completeOrder();
        return confirmation
          .assertConfirmed()
          .then(() => true)
          .catch(() => false);
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
      const idle =
        new URL(page.url()).pathname.startsWith("/checkout") &&
        !(await page
          .getByRole("heading", { name: "Payment Successful!" })
          .isVisible()) &&
        !(await page
          .getByRole("button", { name: "Processing..." })
          .isVisible()) &&
        (await completeOrder.isVisible()) &&
        (await completeOrder.isEnabled());
      if (!idle) {
        await expect(
          confirmedHeading,
          `first payment attempt is in flight or went through; not resubmitting (url ${page.url()}, error "${firstError}")`
        ).toBeVisible({ timeout: 45_000 });
        return;
      }

      if (await pay()) return;
      await shot("payment-attempt-2");
      throw new Error(
        `payment did not reach 'Order Confirmed!' after one retry (url ${page.url()}, error "${await paymentError()}")`
      );
    });

    orderId =
      page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(orderId, `order id from ${page.url()}`).toBeTruthy();
    await allure.parameter("orderId", orderId);

    await allure.step("confirmation lines equal the checkout's", async () => {
      await expect(
        page.locator('[data-testid^="order-breakdown-totals-"]').first()
      ).toBeVisible({ timeout: 20_000 });
      confirmationLines = await readWindConfirmationLines(page);
      assertSameLines(
        checkoutLines,
        confirmationLines,
        "wind confirmation vs checkout"
      );
    });

    await allure.step(
      "the confirmation marks the gift item with the server's label",
      async () => {
        const giftRow = (await oracle()).breakdown.items?.find(
          (i) => i.name === gift.name
        );
        expect(giftRow?.markerLabel, "backend gift row markerLabel").toMatch(
          /free/i
        );
        await expect(
          page.getByTestId(`order-breakdown-item-${giftRow!.key}`)
        ).toContainText(giftRow!.markerLabel!);
      }
    );
  });

  test("backend: the owner's order read carries the breakdown the customer saw, and it adds up", async () => {
    test.skip(!orderId, "no order placed");
    const order = await oracle();
    const lines = apiBreakdownLines(order);
    assertSums(lines, { items: order.breakdown.items });
    assertSameLines(lines, checkoutLines, "backend vs wind checkout");
    assertSameLines(lines, confirmationLines, "backend vs wind confirmation");

    const kinds = lines.map((l) => l.kind);
    for (const k of [
      "PROMOTION",
      "POINTS",
      "TAX",
      "TIP",
      "TOTAL",
      "GIFT_CARD",
      "CHARGED",
    ]) {
      expect(kinds).toContain(k);
    }
    const giftRow = order.breakdown.items?.find((i) => i.name === gift.name);
    expect(giftRow, "free gift item row").toBeTruthy();
    expect(giftRow!.marker).toBe("FREE");
    expect(giftRow!.amount).toBe(GIFT_PRICE);
    // A web order stores the amount charged in Order.total.
    const charged = lines.find((l) => l.kind === "CHARGED")!;
    expect(order.total).toBe(charged.amount);
  });

  test("owner dashboard: the order sheet shows the backend's money lines and the free marker", async ({
    ownerPage,
  }) => {
    test.skip(!orderId, "no order placed");
    const expected = apiBreakdownLines(await oracle());
    const orders = createOwnerOrdersPage(ownerPage);
    await orders.gotoOrderDetail(restaurantId, orderId);
    const sheet = orders.detailSheet();
    await expect(sheet.getByText("Subtotal", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const lines = await readDashboardLines(sheet);
    assertSameLines(expected, lines, "owner dashboard");
    await expect(orders.itemRow(gift.name)).toContainText(/free/i);
  });

  test("POS: the live order feed carries the same breakdown totals", async () => {
    test.skip(!orderId, "no order placed");
    const expected = apiBreakdownLines(await oracle());
    const orders = await getCurrentOrders(tabletToken, restaurantId);
    const mine = orders.find((o) => o.id === orderId);
    expect(mine, `order ${orderId} in the POS current feed`).toBeTruthy();
    expect(mine!.breakdown, "POS order has a breakdown").toBeTruthy();
    assertSameLines(
      expected,
      apiBreakdownLines({ breakdown: mine!.breakdown }),
      "POS current orders"
    );
  });

  test("email: the confirmation email's totals match the backend @email", async () => {
    test.skip(!orderId, "no order placed");
    test.skip(
      !MAILPIT_BASE_URL,
      "MAILPIT_BASE_URL not set — email step skipped"
    );
    const order = await oracle();
    const expected = apiBreakdownLines(order);
    expect(order.receiptNumber, "order receipt number").toBeDefined();
    const mail = await waitForEmail(customerEmail, {
      subjectPattern: /Your Order Confirmation/,
      timeoutMs: 60_000,
    });
    expect(mail.subject).toContain(`Receipt #${order.receiptNumber}`);
    assertSameLines(
      expected,
      readEmailLines(mail.html_body),
      "confirmation email"
    );
    const giftRow = order.breakdown.items?.find((i) => i.name === gift.name);
    expect(giftRow?.markerLabel, "backend gift row markerLabel").toBeTruthy();
    expect(readEmailItemNames(mail.html_body)).toContain(
      `${gift.name} ${giftRow!.markerLabel}`
    );
  });

  // KNOWN BUG: a member whose account has no email (or a different one) never
  // gets the receipt at the address typed at checkout — the customer copy is
  // sent to `order.customer.email` (restaunax-backend emailService
  // sendOrderConfirmationEmail). fixme: never runs until the backend fix
  // lands; then drop `.fixme` and it must pass.
  test.fixme("TC-901: BUG: a member with no account email gets the confirmation at the address typed at checkout @email", async ({
    page,
  }) => {
    test.skip(
      !MAILPIT_BASE_URL,
      "MAILPIT_BASE_URL not set — email step skipped"
    );
    const checkout = createCustomerCheckoutPage(page);
    const rewards = createCustomerRewardSection(page);
    const confirmation = createCustomerOrderConfirmationPage(page);
    const adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD))
      .accessToken;
    const blankPhone = generateSeedPhone();
    await seedRewardMember(
      adminToken,
      restaurantId,
      blankPhone,
      POINTS,
      "",
      `AUTO Breakdown Blank ${runId}`
    );
    const typedEmail = generateUserEmail("breakdown-typed");

    await checkout.seedCartItems(restaurantId, [
      { menuItemId: paid.id, name: paid.name, price: paid.price, quantity: 1 },
    ]);
    await checkout.fillCustomerInfo(
      "Breakdown",
      "Typed",
      typedEmail,
      blankPhone
    );
    await rewards.signIn(blankPhone);
    await checkout.selectPickup();
    await checkout.clickProceedToPayment();
    await checkout.assertPaymentSectionVisible();
    await checkout.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
    await checkout.completeOrder();
    await confirmation.assertConfirmed();

    const mail = await waitForEmail(typedEmail, {
      subjectPattern: /Your Order Confirmation/,
      timeoutMs: 60_000,
    });
    expect(mail.subject).toMatch(/Receipt #/);
  });
});
