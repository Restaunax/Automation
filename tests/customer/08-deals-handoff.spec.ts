/**
 * 08-deals-handoff.spec.ts — owner deal → customer storefront (Layer 3).
 *
 * Two contexts in ONE test: `page` (anonymous, Template Wind at
 * TEMPLATE_WIND_URL) and `ownerPage` (restored owner dashboard session). Proves
 * what the owner tab tests can't: the deal the owner creates / toggles / 86s
 * is what the customer is offered, builds, is quoted, PAYS for, and what the
 * owner's usage counters then report. See docs/DEALS_TAB_TEST_STRATEGY.md §4
 * (Layer 3). Own data: a per-run "Automation Deals Storefront <id>" category on
 * the seed restaurant (Burger 10 · Fries 6.50 · Pizza 12 with an ADJUSTS_PRICE
 * "Extra Cheese" +2 modifier) and AUTO deals; everything deleted / hard-deleted
 * afterwards. TC-371 places ONE real Stripe test-card order (as TC-26 does).
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerMenuPage } from "../../pages/customer/CustomerMenuPage";
import { createCustomerDealPage } from "../../pages/customer/CustomerDealPage";
import { createCustomerItemModal } from "../../pages/customer/CustomerItemModal";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { createCustomerOrderConfirmationPage } from "../../pages/customer/CustomerOrderConfirmationPage";
import { createOwnerDealsPage } from "../../pages/dashboard/owner/OwnerDealsPage";
import { createDealAnalyticsPage } from "../../pages/dashboard/owner/DealAnalyticsPage";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import {
  readSharedState,
  generateRunId,
  generateSeedPhone,
} from "../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  setAvailability,
  createDealApiCapSafe,
  deleteDealApi,
  getDealApi,
  getDealStatsRaw,
  getActiveDealsPublic,
  getOrderByIdRaw,
  type ApiDeal,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const ALL_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

test.describe("Deals → Storefront hand-off", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL and OWNER_PASSWORD must be set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  let burger: ApiMenuItem; // 10.00
  let fries: ApiMenuItem; // 6.50
  let pizza: ApiMenuItem; // 12.00 + Extra Cheese (+2.00)
  let combo: ApiDeal; // burger ×2 + fries @ 21 (orig 26.50, save 5.50 = 21%)
  let pizzaDeal: ApiDeal; // pizza + fries @ 15 (orig 18.50)
  const dealIds: string[] = [];

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readSharedState().restaurantId;
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD)
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    groupId = (
      await createMenuGroupNamed(
        token,
        `Automation Deals Storefront ${runId}`,
        { restaurantId }
      )
    ).id;
    burger = await createMenuItemFull(
      token,
      groupId,
      `Handoff Burger ${runId}`,
      10,
      {
        description: "deal hand-off burger",
      }
    );
    fries = await createMenuItemFull(
      token,
      groupId,
      `Handoff Fries ${runId}`,
      6.5,
      {
        description: "deal hand-off fries",
      }
    );
    pizza = await createMenuItemFull(
      token,
      groupId,
      `Handoff Pizza ${runId}`,
      12,
      {
        description: "deal hand-off pizza",
        modifierGroups: [
          {
            name: "Extras",
            pricingMode: "ADJUSTS_PRICE",
            minSelections: 0,
            maxSelections: null,
            modifiers: [{ name: `Extra Cheese ${runId}`, price: 2 }],
          },
        ],
      }
    );
    combo = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Handoff Combo ${runId}`,
      21,
      [
        { id: burger.id, name: burger.name, price: 10, quantity: 2 },
        { id: fries.id, name: fries.name, price: 6.5 },
      ],
      { description: "two burgers and fries", validDays: ALL_DAYS }
    );
    dealIds.push(combo.id);
    pizzaDeal = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Handoff Pizza ${runId}`,
      15,
      [
        { id: pizza.id, name: pizza.name, price: 12 },
        { id: fries.id, name: fries.name, price: 6.5 },
      ]
    );
    dealIds.push(pizzaDeal.id);
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    for (const it of [burger, fries, pizza].filter(Boolean))
      await setAvailability(t, it.id, false).catch(() => {});
    for (const id of dealIds) await deleteDealApi(t, id).catch(() => {});
    if (adminToken)
      for (const it of [burger, fries, pizza].filter(Boolean))
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Deals → Storefront");
    await allure.label("severity", "critical");
    token = await freshToken();
  });

  test("TC-367: 'Today's Deals' on /menu offers the owner's deal; toggling it OFF in Manage Deals removes it, ON brings it back", async ({
    page,
    ownerPage,
  }) => {
    await allure.description(
      "Storefront /menu renders the DealCard for the API-seeded combo (name, 'Save 21%', 'Includes:' one " +
        "'1x' chip per slot row, struck $26.50 / $21.00, 'View Deal' → /deals/<id>). The owner flips the " +
        "row's switch OFF in ?tab=deals → the storefront no longer offers it (public /active hides INACTIVE); " +
        "ON → back."
    );
    const menu = createCustomerMenuPage(page);
    const deals = createCustomerDealPage(page);
    const dashboard = createOwnerDealsPage(ownerPage);

    await allure.step("Storefront lists the deal card", async () => {
      await menu.goto(restaurantId);
      await menu.assertPageLoaded();
      await expect(deals.dealsSectionHeading()).toBeVisible({
        timeout: 30_000,
      });
      const card = deals.dealCard(combo.name);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText("Save 21%");
      await expect(card).toContainText("Includes:");
      // One chip per qty-1 slot row: burger, burger, fries.
      await expect(
        card.locator("span", { hasText: `1x ${burger.name}` })
      ).toHaveCount(2);
      await expect(card).toContainText(`1x ${fries.name}`);
      await expect(card).toContainText("$26.50");
      await expect(card).toContainText("$21.00");
      await deals.viewDeal(combo.name);
      await expect(page).toHaveURL(new RegExp(`/deals/${combo.id}`), {
        timeout: 15_000,
      });
      await expect(deals.builderHeading(combo.name)).toBeVisible({
        timeout: 20_000,
      });
    });

    await allure.step(
      "Owner deactivates it → storefront drops it",
      async () => {
        await dashboard.gotoManageDeals(restaurantId);
        await dashboard.search(combo.name);
        const off = await dashboard.toggleStatus(combo.name);
        expect(off.status).toBe(200);
        await expect(dashboard.rowStatusText(combo.name)).toHaveText(
          "Inactive"
        );
        await menu.goto(restaurantId);
        await menu.assertPageLoaded();
        // Positive control: our second (still active) deal is offered.
        await expect(deals.dealCard(pizzaDeal.name)).toBeVisible({
          timeout: 30_000,
        });
        await expect(deals.dealCard(combo.name)).toHaveCount(0);
        await deals.gotoBuilder(restaurantId, combo.id);
        await expect(deals.dealNotFound()).toBeVisible({ timeout: 20_000 });
        await expect(deals.returnToMenuButton()).toBeVisible();
      }
    );

    await allure.step(
      "Owner re-activates → storefront offers it again",
      async () => {
        // Cap-tolerant: 11-deals may hold the seed restaurant at 10 active for a
        // few seconds (its cap-banner test) — retry until a slot frees.
        const on = await dashboard.activateWithRetry(combo.name);
        expect(on.status, JSON.stringify(on.body)).toBe(200);
        await menu.goto(restaurantId);
        await expect(deals.dealCard(combo.name)).toBeVisible({
          timeout: 30_000,
        });
      }
    );
  });

  test("TC-368: a multi-slot deal is built slot by slot; checkout shows 'Part of deal', the deal line, 'You're saving', and the /quote the page makes prices it at the deal price", async ({
    page,
  }) => {
    await allure.description(
      "Builder for burger ×2 + fries @ $21: header 'Save 21%' + 'You save $5.50' + 'Available: All days, All " +
        "day' (validDays = every day), three slot cards, '0 of 3 items added'. Each 'Add to Deal' fills a slot " +
        "→ 'Deal Complete!'. Checkout: 3× 'Part of deal', '1x <deal>' row, 'You're saving $5.50', proceed " +
        "button is the normal 'Proceed to Payment', and the POST /quote the page issues carries orderDeals " +
        "and comes back with dealsSubtotal 21 / subtotal 21."
    );
    const deals = createCustomerDealPage(page);
    const modal = createCustomerItemModal(page);
    const checkout = createCustomerCheckoutPage(page);

    await deals.gotoBuilder(restaurantId, combo.id);
    await expect(deals.builderHeading(combo.name)).toBeVisible({
      timeout: 20_000,
    });
    await expect(deals.saveBadge()).toHaveText("Save 21%");
    await expect(deals.youSaveChip()).toHaveText("You save $5.50");
    await expect(deals.availabilityLine()).toHaveText(
      "Available: All days, All day"
    );
    await deals.assertProgress(0, 3);
    await expect(deals.slotCards(burger.name)).toHaveCount(2);
    await expect(deals.slotCards(fries.name)).toHaveCount(1);

    await deals.openIncompleteSlot(burger.name);
    await modal.assertAddToCartEnabled();
    await expect(modal.addToCartButton()).toContainText("Add to Deal");
    await deals.clickAddToDeal();
    await deals.assertProgress(1, 3);
    await deals.openIncompleteSlot(burger.name);
    await deals.clickAddToDeal();
    await deals.assertProgress(2, 3);
    await deals.openIncompleteSlot(fries.name);
    await deals.clickAddToDeal();
    await deals.assertDealComplete();

    const [quoteRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/order\/[^/]+\/quote$/.test(r.url()) &&
          r.request().method() === "POST" &&
          r.status() === 200,
        { timeout: 30_000 }
      ),
      deals.viewCartButton().click(),
    ]);
    await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
    const quoteReq = quoteRes.request().postDataJSON() as {
      orderDeals?: { dealId: string; quantity: number; items?: unknown[] }[];
      orderItems?: unknown[];
    };
    expect(quoteReq.orderDeals?.[0]?.dealId).toBe(combo.id);
    expect(quoteReq.orderDeals?.[0]?.quantity).toBe(1);
    // Claimed items are stripped from orderItems (billed once, via the deal).
    expect(quoteReq.orderItems ?? []).toEqual([]);
    const quote = (await quoteRes.json()) as {
      quote?: {
        dealsSubtotal?: number;
        subtotal?: number;
        deals?: { lineTotal: number }[];
      };
    };
    expect(quote.quote?.dealsSubtotal).toBe(21);
    expect(quote.quote?.subtotal).toBe(21);
    expect(quote.quote?.deals?.[0]?.lineTotal).toBe(21);

    await expect(deals.partOfDealLabels()).toHaveCount(3);
    await expect(deals.dealSummaryRow(combo.name)).toBeVisible();
    await expect(deals.youAreSavingRow()).toContainText("$5.50");
    await expect(deals.completeDealsToContinueButton()).toHaveCount(0);
    await expect(checkout.proceedToPaymentButton()).toBeVisible();
  });

  test("TC-369: a modifier chosen on a deal slot is charged as an upcharge on top of the deal price — in the summary and in the quote", async ({
    page,
  }) => {
    await allure.description(
      "Pizza + fries @ $15; the pizza slot is customised with 'Extra Cheese' (+$2.00, ADJUSTS_PRICE). Checkout " +
        "shows 'Modifiers/Upgrades +$2.00', the expanded deal lists '1x <pizza> (+$2.00)', and the page's own " +
        "/quote returns upcharge 2 / lineTotal 17 / subtotal 17 — the client's number is recomputed server-side."
    );
    const deals = createCustomerDealPage(page);
    const modal = createCustomerItemModal(page);
    await deals.gotoBuilder(restaurantId, pizzaDeal.id);
    await expect(deals.builderHeading(pizzaDeal.name)).toBeVisible({
      timeout: 20_000,
    });
    await deals.assertProgress(0, 2);
    await deals.openIncompleteSlot(pizza.name);
    await modal.selectOption(`Extra Cheese ${runId}`);
    await modal.assertOptionChecked(`Extra Cheese ${runId}`);
    await expect(modal.addToCartButton()).toContainText("$14.00");
    await deals.clickAddToDeal();
    await deals.assertProgress(1, 2);
    await deals.openIncompleteSlot(fries.name);
    await deals.clickAddToDeal();
    await deals.assertDealComplete();
    const [quoteRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/order\/[^/]+\/quote$/.test(r.url()) &&
          r.request().method() === "POST" &&
          r.status() === 200,
        { timeout: 30_000 }
      ),
      deals.viewCartButton().click(),
    ]);
    const quote = (await quoteRes.json()) as {
      quote?: {
        subtotal?: number;
        deals?: { upcharge: number; lineTotal: number; dealPrice: number }[];
      };
    };
    expect(quote.quote?.deals?.[0]).toMatchObject({
      dealPrice: 15,
      upcharge: 2,
      lineTotal: 17,
    });
    expect(quote.quote?.subtotal).toBe(17);
    await expect(deals.modifiersUpgradesRow()).toContainText("+$2.00");
    await deals.dealSummaryRow(pizzaDeal.name).click();
    await expect(deals.dealItemUpchargeLine(pizza.name)).toBeVisible();
    await expect(deals.dealItemUpchargeLine(pizza.name)).toContainText(
      "(+$2.00)"
    );
    await expect(
      page.getByText("Subtotal", { exact: true }).locator("..")
    ).toContainText("$17.00");
  });

  test("TC-370: 86'ing a required slot item pulls the whole deal from the storefront; restoring it brings the deal back", async ({
    page,
  }) => {
    const menu = createCustomerMenuPage(page);
    const deals = createCustomerDealPage(page);
    await menu.goto(restaurantId);
    await expect(deals.dealCard(pizzaDeal.name)).toBeVisible({
      timeout: 30_000,
    });
    await setAvailability(token, pizza.id, true);
    try {
      expect(
        ((await getActiveDealsPublic(restaurantId)).data.deals ?? []).some(
          (d) => d.id === pizzaDeal.id
        )
      ).toBe(false);
      await menu.goto(restaurantId);
      await menu.assertPageLoaded();
      await expect(deals.dealCard(combo.name)).toBeVisible({ timeout: 30_000 });
      await expect(deals.dealCard(pizzaDeal.name)).toHaveCount(0);
      await deals.gotoBuilder(restaurantId, pizzaDeal.id);
      await expect(deals.dealNotFound()).toBeVisible({ timeout: 20_000 });
    } finally {
      await setAvailability(token, pizza.id, false);
    }
    await menu.goto(restaurantId);
    await expect(deals.dealCard(pizzaDeal.name)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-371: paying for a deal order records the deal on the order and bumps the owner's usage counters (stats API, Manage Deals row, Deal Analytics)", async ({
    page,
    ownerPage,
  }) => {
    await allure.description(
      "Builds the combo, checks out as a pickup guest with the Stripe VISA test card → 'Order Confirmed!'. " +
        "The order (owner GET /api/order/:id) carries orderDeals[0] {dealId, dealPrice 21, quantity 1} and " +
        "3 orderDealItems; on payment processDealStatistics increments Deal.timesUsed / totalRevenue → the " +
        "/stats summary moves by +1 / +21, the Manage Deals row reads '1 times' + '$21.00', and Deal " +
        "Analytics' Top Performing Deals lists it. Leaves one real paid order on QA (as TC-26 does)."
    );
    const deals = createCustomerDealPage(page);
    const checkout = createCustomerCheckoutPage(page);
    const confirmation = createCustomerOrderConfirmationPage(page);
    const dashboard = createOwnerDealsPage(ownerPage);
    const analytics = createDealAnalyticsPage(ownerPage);

    const before = (await getDealStatsRaw(token, restaurantId)).data.summary!;
    const dealBefore = await getDealApi(token, combo.id);

    await allure.step("Build the deal and reach checkout", async () => {
      await deals.gotoBuilder(restaurantId, combo.id);
      await deals.assertProgress(0, 3);
      for (const name of [burger.name, burger.name, fries.name]) {
        await deals.openIncompleteSlot(name);
        await deals.clickAddToDeal();
      }
      await deals.assertDealComplete();
      await deals.viewCartButton().click();
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
      await checkout.assertFormVisible();
    });

    await allure.step("Pay with the Stripe test card", async () => {
      // A fresh NANP-valid phone: the backend resolves a known phone to the
      // existing customer record (and greets by THAT name), so reusing TC-26's
      // number would show "Thanks Jane!".
      await checkout.fillCustomerInfo(
        "Dealer",
        "Tester",
        `dealer-${runId}@restaunax-test.com`,
        generateSeedPhone()
      );
      await checkout.selectPickup();
      await checkout.clickProceedToPayment();
      await checkout.assertPaymentSectionVisible();
      await checkout.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
      await checkout.completeOrder();
      await confirmation.assertConfirmed();
      await confirmation.assertCustomerName("Dealer");
      // The confirmation lists the deal as a line and the savings as a row.
      await expect(
        page.getByRole("heading", { name: `1x ${combo.name}` })
      ).toBeVisible();
      await expect(page.getByText("Deal Savings")).toBeVisible();
      await expect(page.getByText("-$5.50")).toBeVisible();
    });

    const orderId =
      page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(orderId, `order id from ${page.url()}`).toBeTruthy();
    await allure.parameter("orderId", orderId);

    await allure.step("The order carries the deal (owner read)", async () => {
      const order = await getOrderByIdRaw(token, orderId);
      expect(order.status, JSON.stringify(order.data)).toBe(200);
      expect(order.data.orderDeals).toHaveLength(1);
      expect(order.data.orderDeals![0]).toMatchObject({
        dealId: combo.id,
        dealPrice: 21,
        quantity: 1,
      });
      expect(order.data.orderDeals![0]!.orderDealItems).toHaveLength(3);
      expect(order.data.subtotal).toBe(21);
      expect(order.data.dealDiscountAmount).toBe(5.5);
    });

    await allure.step("Usage counters move on payment", async () => {
      await expect
        .poll(async () => (await getDealApi(token, combo.id)).timesUsed ?? 0, {
          timeout: 60_000,
          message: "Deal.timesUsed incremented",
        })
        .toBe((dealBefore.timesUsed ?? 0) + 1);
      const dealAfter = await getDealApi(token, combo.id);
      expect(Math.round((dealAfter.totalRevenue ?? 0) * 100) / 100).toBe(
        Math.round(((dealBefore.totalRevenue ?? 0) + 21) * 100) / 100
      );
      const after = (await getDealStatsRaw(token, restaurantId)).data.summary!;
      expect(after.totalTimesUsed).toBeGreaterThanOrEqual(
        before.totalTimesUsed + 1
      );
      expect(after.totalRevenue).toBeGreaterThanOrEqual(
        before.totalRevenue + 21 - 0.01
      );
    });

    await allure.step(
      "Manage Deals row and Deal Analytics show it",
      async () => {
        await dashboard.gotoManageDeals(restaurantId);
        await dashboard.search(combo.name);
        const row = dashboard.row(combo.name);
        await expect(row).toContainText(
          `${(dealBefore.timesUsed ?? 0) + 1} times`
        );
        await expect(row).toContainText("$21.00");
        await dashboard.gotoTab(restaurantId, "deal-analytics");
        await analytics.assertLoaded();
        const top = analytics.topDealRow(combo.name);
        await expect(top).toBeVisible({ timeout: 15_000 });
        await expect(top).toContainText("$21.00");
      }
    );
  });
});
