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
 * A FREE_ITEM promotion and a combo cannot share an order (PROMOTIONS.md
 * "Which promotion wins"), so the combo is its own order: TC-899 (a second
 * describe, independent of TC-898's serial chain) pays a CODE-only combo on
 * wind and checks the deal row with its contents and the "You saved $X with
 * …" info line, which is shown but never summed. Wind's delivery address
 * needs a Google Places suggestion that QA does not return, so delivery is
 * API-only: TC-900 (a third describe with its own one-item menu, no wind or
 * storefront seed needed) quotes a delivery order with and without a
 * FREE_DELIVERY code and reads DELIVERY_FEE / FREE_DELIVERY off
 * `quote.breakdown`.
 *
 * The free item is an AUTOMATIC FREE_ITEM triggered by buying this run's own
 * item (never a spend offer: only customer/10-promotions may run one on the
 * seed restaurant), on a cart under $55. Everything is AUTO/"Automation Menu"
 * named and deleted in afterAll (shared serial setup); the gift card is
 * recorded for the teardown freeze. The imported reward member is named
 * "AUTO Breakdown Member <runId>" and stays: customers have no delete endpoint.
 * TC-898 creates no deal; TC-899 holds one active-deal slot for its own
 * duration only (withStorefrontCombo: cap-safe, deleted in its finally —
 * TEST_PLAN footprint).
 *
 * FREE marker: asserted where the surface draws item rows from the breakdown
 * (backend, wind confirmation, dashboard sheet, email). The wind checkout's
 * item rows come from the local cart, not `breakdown.items`, so it shows no
 * marker by design (exemption in TEST_CASES.md TC-898).
 *
 * The email step is @email: it needs Mailpit and is skipped when
 * MAILPIT_BASE_URL is unset.
 */

import type { Page, TestInfo } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createCustomerCheckoutPage } from "../../../pages/customer/CustomerCheckoutPage";
import { createCustomerDealPage } from "../../../pages/customer/CustomerDealPage";
import { createCustomerOrderConfirmationPage } from "../../../pages/customer/CustomerOrderConfirmationPage";
import { createCustomerRewardSection } from "../../../pages/customer/CustomerRewardSection";
import { createOwnerOrdersPage } from "../../../pages/dashboard/owner/OwnerOrdersPage";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  DEAL_SLOT_TEST_TIMEOUT_MS,
  deactivateTabletDeviceRaw,
  getCurrentOrders,
  getOrderByIdRaw,
  getRestaurantDetailsPublicRaw,
  quoteOrderRaw,
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
import {
  cleanupStorefrontPromotions,
  seedStorefrontPromotions,
  STOREFRONT_PRICES,
  withStorefrontCombo,
} from "../../../utils/promotionFixtures";
import type {
  SeededItem,
  StorefrontDealContext,
  StorefrontPromotionSet,
} from "../../../utils/promotionFixtures";
import { createCouponPromotion } from "../../../utils/promotionsApi";
import {
  expectShownMatchesLatestQuote,
  trackQuotes,
} from "../../../utils/quoteTracker";
import { seedRewardMember } from "../../../utils/rewardsApi";
import { STRIPE_CARDS } from "../../../utils/stripeCards";
import {
  generateCouponCode,
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

/**
 * Pays the wind checkout with the Stripe test card and waits for "Order
 * Confirmed!". One retry of the Stripe step (Link/Element flake), only when
 * the first attempt provably did not go through; then fail with screenshots.
 */
async function payWithTestCard(page: Page, testInfo: TestInfo): Promise<void> {
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
      const quote = (await quotes.latest()).body.quote;
      expect(
        quote?.breakdown,
        "the latest /quote carries a breakdown"
      ).toBeTruthy();
      // Same lines first: a surface that lost its rows fails with "[wind
      // checkout …] read …" rather than a misleading sum.
      assertSameLines(
        apiBreakdownLines({ breakdown: quote!.breakdown! }),
        checkoutLines,
        "wind checkout vs its own /quote breakdown"
      );
      assertSums(checkoutLines, "wind checkout");
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
    });

    await checkout.clickProceedToPayment();
    await checkout.assertPaymentSectionVisible();

    await payWithTestCard(page, testInfo);

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
    assertSums(lines, "backend order", { items: order.breakdown.items });
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
    const order = await oracle();
    const expected = apiBreakdownLines(order);
    const orders = createOwnerOrdersPage(ownerPage);
    await orders.gotoOrderDetail(restaurantId, orderId);
    const sheet = orders.detailSheet();
    await expect(sheet.getByText("Subtotal", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const lines = await readDashboardLines(sheet);
    assertSameLines(expected, lines, "owner dashboard");
    const giftRow = order.breakdown.items?.find((i) => i.name === gift.name);
    expect(giftRow?.markerLabel, "backend gift row markerLabel").toBeTruthy();
    await expect(orders.itemRow(gift.name)).toContainText(
      giftRow!.markerLabel!
    );
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

test.describe("Order money breakdown — combo order", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL and OWNER_* must be set in .env"
  );

  const runId = generateRunId();
  let restaurantId = "";
  let set: StorefrontPromotionSet;
  const created: Partial<StorefrontPromotionSet> & {
    createdItems?: SeededItem[];
    createdCoupons?: string[];
    createdDeals?: string[];
  } = {};

  const ownerToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readRestaurantId();
    // The storefront set without its spend free item: only
    // customer/10-promotions may run an automatic spend offer here. The
    // set's automatic sale and order code touch only this run's items.
    set = await seedStorefrontPromotions(
      await ownerToken(),
      restaurantId,
      runId,
      created,
      { label: "Breakdown", withFreeItem: false }
    );
  });

  test.afterAll(async () => {
    if (!OWNER_EMAIL || !restaurantId) return;
    // Backstop for a deal / coupon a test's finally could not delete, plus
    // the menu and the set's coupons. A leaked deal holds an active slot.
    const failures = await cleanupStorefrontPromotions(
      await ownerToken(),
      created
    );
    expect(failures, "combo cleanup").toEqual([]);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Order Breakdown");
    await allure.label("severity", "critical");
  });

  test("TC-899: a paid wind combo order shows the deal row with its contents and a 'You saved' info line that is never summed — the same on the confirmation, the backend and the dashboard", async ({
    page,
    ownerPage,
  }, testInfo) => {
    // A deal-slot wait (up to CAP_WAIT_MS) plus a real Stripe checkout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS + 120_000);
    const token = await ownerToken();
    const dealCtx: StorefrontDealContext = {
      token,
      restaurantId,
      set,
      createdDeals: (created.createdDeals ??= []),
    };
    await withStorefrontCombo(dealCtx, async (combo) => {
      const { platter, burger } = set.items;
      const deals = createCustomerDealPage(page);
      const checkout = createCustomerCheckoutPage(page);
      const quotes = trackQuotes(page);

      await allure.step("build the combo from its code", async () => {
        await deals.gotoBuilder(restaurantId, combo.dealId, combo.code);
        await expect(deals.builderHeading(combo.name)).toBeVisible({
          timeout: 20_000,
        });
        await deals.openIncompleteSlot(platter.name);
        await deals.clickAddToDeal();
        await deals.openIncompleteSlot(burger.name);
        await deals.clickAddToDeal();
        await deals.assertDealComplete();
        await deals.addDealToCart();
        // No wait for the first /quote here: the tracker waits for the
        // checkout's quoting to settle before anything reads it.
        await deals.viewCartButton().click();
        await expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });
      });

      await checkout.fillCustomerInfo(
        "Breakdown",
        "Combo",
        generateUserEmail("breakdown-combo"),
        generateSeedPhone()
      );
      await checkout.selectPickup();
      await expectShownMatchesLatestQuote(checkout.readOrderTotal, quotes);
      await expect(page.getByTestId("checkout-total")).toHaveText(/\$\d/);

      let checkoutLines: Line[] = [];
      let quoteSavings = 0;
      await allure.step(
        "checkout lines add up and equal the /quote",
        async () => {
          checkoutLines = await readWindCheckoutLines(page);
          const quote = (await quotes.latest()).body.quote;
          expect(
            quote?.breakdown,
            "the /quote carries a breakdown"
          ).toBeTruthy();
          expect(
            quote?.deals?.map((d) => d.dealId),
            "the /quote prices the combo"
          ).toEqual([combo.dealId]);
          assertSameLines(
            apiBreakdownLines({ breakdown: quote!.breakdown! }),
            checkoutLines,
            "wind checkout vs its own /quote breakdown"
          );
          assertSums(checkoutLines, "wind checkout");
          quoteSavings = quote!.deals![0]!.savings;
        }
      );

      await checkout.clickProceedToPayment();
      await checkout.assertPaymentSectionVisible();
      await payWithTestCard(page, testInfo);

      const orderId =
        page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
      expect(orderId, `order id from ${page.url()}`).toBeTruthy();
      await allure.parameter("orderId", orderId);

      const res = await getOrderByIdRaw(await ownerToken(), orderId);
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      const order = res.data as typeof res.data & { breakdown: ApiBreakdown };
      expect(order.breakdown, "order has a breakdown").toBeTruthy();
      const expected = apiBreakdownLines(order);
      const dealRow = order.breakdown.items?.find((i) =>
        Array.isArray(i.children)
      );
      const saved = order.breakdown.info?.find(
        (l) => l.kind === "DEAL_SAVINGS"
      );

      await allure.step(
        "backend: one deal row with its contents, the info line outside the sums",
        async () => {
          expect(dealRow, "a deal item row").toBeTruthy();
          expect(dealRow!.name).toBe(combo.name);
          expect(dealRow!.amount).toBe(STOREFRONT_PRICES.comboPrice);
          expect(dealRow!.children?.map((c) => c.name).sort()).toEqual(
            [platter.name, burger.name].sort()
          );
          expect(
            saved,
            `DEAL_SAVINGS info line in ${JSON.stringify(order.breakdown.info)}`
          ).toBeTruthy();
          expect(saved!.label).toBe(
            `You saved $${saved!.amount.toFixed(2)} with ${combo.name}`
          );
          // The order's savings equal what the checkout's /quote priced for
          // this deal (two surfaces compared, nothing recomputed).
          expect(saved!.amount, "savings = the /quote's deals[0].savings").toBe(
            quoteSavings
          );
          expect(saved!.amount).toBeGreaterThan(0);
          // Shown, never summed: no totals line is the info line, and the
          // totals still add up without it.
          expect(
            expected.filter(
              (l) => l.kind === "DEAL_SAVINGS" || /you saved/i.test(l.label)
            ),
            "the info line is not a totals line"
          ).toEqual([]);
          assertSameLines(expected, checkoutLines, "backend vs wind checkout");
          assertSums(expected, "backend order", {
            items: order.breakdown.items,
          });
          // No tender on this order: Order.total is the TOTAL line.
          const totalLine = expected.find((l) => l.kind === "TOTAL");
          expect(totalLine, "backend TOTAL line").toBeTruthy();
          expect(order.total).toBe(totalLine!.amount);
        }
      );

      await allure.step(
        "wind confirmation: the deal row, its contents and the info line",
        async () => {
          await expect(
            page.locator('[data-testid^="order-breakdown-totals-"]').first()
          ).toBeVisible({ timeout: 20_000 });
          const row = page.getByTestId(`order-breakdown-item-${dealRow!.key}`);
          await expect(row).toContainText(`1x ${combo.name}`);
          await expect(row).toContainText(`1x ${platter.name}`);
          await expect(row).toContainText(`1x ${burger.name}`);
          await expect(
            page.getByTestId("order-breakdown-info-DEAL_SAVINGS")
          ).toHaveText(saved!.label);
          assertSameLines(
            expected,
            await readWindConfirmationLines(page),
            "wind confirmation"
          );
        }
      );

      await allure.step(
        "owner dashboard: the same money lines, the deal row and the info caption",
        async () => {
          const orders = createOwnerOrdersPage(ownerPage);
          await orders.gotoOrderDetail(restaurantId, orderId);
          const sheet = orders.detailSheet();
          await expect(
            sheet.getByText("Subtotal", { exact: true })
          ).toBeVisible({ timeout: 20_000 });
          assertSameLines(
            expected,
            await readDashboardLines(sheet),
            "owner dashboard"
          );
          await expect(orders.itemRow(combo.name)).toBeVisible();
          await expect(
            sheet.getByText(platter.name, { exact: true })
          ).toBeVisible();
          await expect(
            sheet.getByText(burger.name, { exact: true })
          ).toBeVisible();
          await expect(
            sheet.getByText(saved!.label, { exact: true })
          ).toBeVisible();
        }
      );
    });
  });
});

// API-only: needs no storefront and no wind, only one menu item of its own.
test.describe("Order money breakdown — delivery quote", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_* must be set in .env");

  const runId = generateRunId();
  let restaurantId = "";
  let item: SeededItem;
  const created: {
    groupId?: string;
    createdItems?: SeededItem[];
    createdCoupons?: string[];
  } = { createdItems: [], createdCoupons: [] };

  const ownerToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readRestaurantId();
    const token = await ownerToken();
    const group = await createMenuGroupNamed(
      token,
      `Automation Menu Breakdown Delivery ${runId}`,
      { restaurantId }
    );
    created.groupId = group.id;
    const name = `Breakdown Delivery Platter ${runId}`;
    const made = await createMenuItemFull(token, group.id, name, PAID_PRICE, {
      description: "Automation order-breakdown item",
    });
    item = { id: made.id, name, price: PAID_PRICE };
    created.createdItems!.push(item);
  });

  test.afterAll(async () => {
    if (!OWNER_EMAIL || !restaurantId) return;
    // Backstop for the coupon if the test's finally could not delete it.
    const failures = await cleanupStorefrontPromotions(
      await ownerToken(),
      created
    );
    expect(failures, "delivery-quote cleanup").toEqual([]);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Order Breakdown");
    await allure.label("severity", "critical");
  });

  test("TC-900: a delivery quote carries the delivery fee and, with a FREE_DELIVERY code, an equal and opposite free-delivery line; without the code there is none", async () => {
    const token = await ownerToken();
    const details = await getRestaurantDetailsPublicRaw(restaurantId);
    expect(details.status, JSON.stringify(details.data)).toBe(200);
    const fee = (
      details.data as { data?: { settings?: { baseDeliveryFee?: number } } }
    ).data?.settings?.baseDeliveryFee;
    expect(fee, "seed restaurant baseDeliveryFee").toBeGreaterThan(0);
    await allure.parameter("delivery fee", String(fee));

    const MAX_FEE_WAIVER = 10;
    expect(
      fee,
      `test-setup precondition: the seed baseDeliveryFee must be ≤ the promotion's maxDiscount (${MAX_FEE_WAIVER}) or the waiver is capped — raise MAX_FEE_WAIVER, this is not a breakdown bug`
    ).toBeLessThanOrEqual(MAX_FEE_WAIVER);

    const body = {
      orderType: "DELIVERY" as const,
      deliveryFee: fee!,
      orderItems: [{ menuItemId: item.id, quantity: 1 }],
    };
    // A CODE promotion (passed by id, as wind does after redeeming the code)
    // prices only this quote: an AUTOMATIC one would reach every delivery
    // cart on the seed restaurant.
    const name = `AUTO Breakdown free delivery ${runId}`;
    const promo = await createCouponPromotion(token, restaurantId, {
      name,
      code: generateCouponCode(),
      type: "FREE_DELIVERY",
      value: 0,
      // FREE_DELIVERY needs a minimum and a fee cap (margin guardrail); the
      // cap covers the whole fee.
      minOrderAmount: 1,
      maxDiscount: MAX_FEE_WAIVER,
      applyMode: "CODE",
    });
    created.createdCoupons!.push(promo.id);
    try {
      await allure.step("with the FREE_DELIVERY code", async () => {
        const res = await quoteOrderRaw(restaurantId, {
          ...body,
          couponId: promo.id,
        });
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        const breakdown = res.data.quote?.breakdown;
        expect(breakdown, "quote.breakdown").toBeTruthy();
        const lines = apiBreakdownLines({ breakdown });
        assertSums(lines, "delivery quote with the code", {
          items: breakdown!.items,
        });
        const deliveryFee = lines.find((l) => l.kind === "DELIVERY_FEE");
        const free = lines.find((l) => l.kind === "FREE_DELIVERY");
        expect(deliveryFee, JSON.stringify(lines)).toBeTruthy();
        expect(free, JSON.stringify(lines)).toBeTruthy();
        expect(deliveryFee!.amount).toBe(fee);
        expect(free!.amount).toBe(-deliveryFee!.amount);
        expect(free!.label).toBe(name);
        // Contract order: the fee line, then its waiver.
        expect(lines.indexOf(free!)).toBe(lines.indexOf(deliveryFee!) + 1);
      });

      await allure.step("without it: the fee, no free delivery", async () => {
        const res = await quoteOrderRaw(restaurantId, body);
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        const breakdown = res.data.quote?.breakdown;
        expect(breakdown, "quote.breakdown").toBeTruthy();
        const lines = apiBreakdownLines({ breakdown });
        assertSums(lines, "delivery quote without the code", {
          items: breakdown!.items,
        });
        expect(lines.find((l) => l.kind === "DELIVERY_FEE")?.amount).toBe(fee);
        expect(
          lines.filter((l) => l.kind === "FREE_DELIVERY"),
          JSON.stringify(lines)
        ).toEqual([]);
      });
    } finally {
      const del = await apiRequestRaw(
        "DELETE",
        `/api/coupons/${promo.id}`,
        undefined,
        token
      ).catch((err: unknown) => ({ ok: false, status: 0, data: String(err) }));
      if (!del.ok && del.status !== 404) {
        console.warn(
          `[27-order-breakdown] free-delivery coupon ${promo.id} delete → ${del.status}; afterAll retries`
        );
      }
    }
  });
});
