/**
 * 08-deals-handoff.spec.ts — owner deal → customer storefront (Layer 3).
 *
 * Two contexts in ONE test: `page` (anonymous, Template Wind at
 * TEMPLATE_WIND_URL) and `ownerPage` (restored owner dashboard session). Proves
 * what the owner tab tests can't: the deal the owner creates / toggles / 86s
 * is what the customer is offered, builds, is quoted, PAYS for, and what the
 * owner's usage counters then report. See docs/PROMOTIONS_TEST_STRATEGY.md §4
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
import { createOwnerPromotionsPage } from "../../pages/dashboard/owner/OwnerPromotionsPage";
import { createOwnerPromotionResultsPage } from "../../pages/dashboard/owner/OwnerPromotionResultsPage";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import { requireScheduling } from "../../utils/dealScheduleGate";
import {
  DAY_NAMES,
  dayNameOfKey,
  isInsideWindow,
  laterTodayWindow,
  liveNowWindow,
  localDateKey,
  localParts,
  mentionsClock,
  normalizeSpaces,
  openSpanOn,
  type LocalWindow,
} from "../../utils/dealSchedule";

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
  getRestaurantTimeZonePublic,
  getBusinessHoursRaw,
  getBrandingAdminRaw,
  putBrandingAdminRaw,
  getOrderByIdRaw,
  waitForFreeDealSlot,
  CAP_WAIT_MS,
  type ApiDeal,
  type ApiMenuItem,
  DEAL_SLOT_TEST_TIMEOUT_MS,
  DEAL_SLOT_TWO_TEST_TIMEOUT_MS,
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
  // TC-892's own items (created in the test, cleaned up in afterAll).
  const unitItems: ApiMenuItem[] = [];

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TWO_TEST_TIMEOUT_MS);
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
    for (const it of [burger, fries, pizza, ...unitItems].filter(Boolean))
      await setAvailability(t, it.id, false).catch(() => {});
    for (const id of dealIds) await deleteDealApi(t, id).catch(() => {});
    if (adminToken)
      for (const it of [burger, fries, pizza, ...unitItems].filter(Boolean))
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Deals → Storefront");
    await allure.label("severity", "critical");
    token = await freshToken();
  });

  test("TC-367: 'Today's Deals' on /menu offers the owner's deal; pausing it in Promotions removes it, Turn on brings it back", async ({
    page,
    ownerPage,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    await allure.description(
      "Storefront /menu renders the DealCard for the API-seeded combo (name, 'Save 21%', 'Includes:' one " +
        "'1x' chip per slot row, struck $26.50 / $21.00, 'View Deal' → /deals/<id>). The owner flips the " +
        "row's menu → Pause in ?tab=promotions (row reads Paused) → the storefront no longer offers it (public " +
        "/active hides INACTIVE); Turn on (row reads Live) → back."
    );
    const menu = createCustomerMenuPage(page);
    const deals = createCustomerDealPage(page);
    const promotions = createOwnerPromotionsPage(ownerPage);

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

    await allure.step("Owner pauses it → storefront drops it", async () => {
      await promotions.goto(restaurantId);
      const off = await promotions.setStatusFromMenu(combo.name, "Pause");
      expect(off.status, JSON.stringify(off.body)).toBe(200);
      await promotions.expectRowStatus(combo.name, "Paused");
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
    });

    await allure.step(
      "Owner turns it on → storefront offers it again",
      async () => {
        // Cap-tolerant: other files may hold the seed restaurant at 10 active
        // deals for a moment — a refused Turn on (cap dialog) is retried once
        // a slot frees, until CAP_WAIT_MS.
        const deadline = Date.now() + CAP_WAIT_MS;
        for (;;) {
          await waitForFreeDealSlot(token, restaurantId);
          const on = await promotions.setStatusFromMenu(combo.name, "Turn on");
          if (on.status === 200) break;
          expect(on.body?.error, JSON.stringify(on.body)).toBe(
            "MAX_ACTIVE_DEALS_REACHED"
          );
          await promotions.confirmDialog("OK");
          expect(Date.now(), "a deal slot freed in time").toBeLessThan(
            deadline
          );
        }
        await promotions.expectRowStatus(combo.name, "Live");
        await menu.goto(restaurantId);
        await expect(deals.dealCard(combo.name)).toBeVisible({
          timeout: 30_000,
        });
      }
    );
  });

  test("TC-368: a multi-item deal is added with one Add; checkout shows 'Part of deal', the deal line, 'You're saving', and the /quote the page makes prices it at the deal price", async ({
    page,
  }) => {
    await allure.description(
      "Builder for burger ×2 + fries @ $21: header 'Save 21%' + 'You save $5.50' + 'Available: All days, All " +
        "day' (validDays = every day), two fixed steps: ONE '2 × <burger>' step (the burger ×2 is stored as two unit rows, " +
        "grouped into one step per spec §13; the burger has no options, so no unit rows and no Customize) plus the fries, " +
        "'All set' from the start; " +
        "one 'Add deal to cart'. Checkout: 3× 'Part of deal', '1x <deal>' row, 'You're saving $5.50', proceed " +
        "button is the normal 'Proceed to Payment', and the POST /quote the page issues carries orderDeals " +
        "and comes back with dealsSubtotal 21 / subtotal 21."
    );
    const deals = createCustomerDealPage(page);
    const checkout = createCustomerCheckoutPage(page);

    await deals.gotoBuilder(restaurantId, combo.id);
    await expect(deals.builderHeading(combo.name)).toBeVisible({
      timeout: 20_000,
    });
    await expect(deals.saveBadge()).toHaveText("Save 21%");
    await expect(deals.youSaveChip()).toHaveText("You save $5.50");
    // Unrestricted deal: no schedule line at all (scheduleSummary is null).
    await expect(deals.availabilityLine()).toHaveCount(0);
    // Fixed items without options, included from the start. The backend
    // stores every DealItem at quantity 1 (splitDealItemsToUnitQuantity), so
    // "burger ×2" is persisted as TWO burger rows; the builder groups those
    // identical units into ONE step "2 × <burger>" (spec §13), "✓ Included".
    // The burger has no options, so the step has no unit rows and no
    // Customize. Then one step for the fries: two fixed steps in all — never
    // the old "1. <burger>" / "2. <burger>" pair.
    const burgerStep = `2 × ${burger.name}`;
    await expect(deals.fixedSteps(burger.name)).toHaveCount(1, {
      timeout: 20_000,
    });
    const step = deals.stepByHeading(burgerStep);
    await expect(step).toBeVisible();
    await expect(step.getByTestId("deal-step-status")).toHaveText("✓ Included");
    await expect(deals.unitRows(burgerStep)).toHaveCount(0);
    await expect(step.getByTestId("deal-unit-customize")).toHaveCount(0);
    await expect(step.getByTestId("deal-step-customize")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: burger.name, exact: true })
    ).toHaveCount(0);
    await expect(deals.fixedSteps(fries.name)).toHaveCount(1);
    await expect(deals.allFixedSteps()).toHaveCount(2);
    await expect(deals.choiceSlots()).toHaveCount(0);
    await deals.completeFixedSteps();
    await deals.assertDealComplete();
    await deals.addDealToCart();

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
        "shows the upgrade build-up (Items $15.00, Upgrades +$2.00 itemised 'Extra Cheese +$2.00', Subtotal " +
        "$17.00 — template-wind #117 replaced the old 'Modifiers/Upgrades' row), the expanded deal lists " +
        "'1x <pizza> (+$2.00)', and the page's own " +
        "/quote returns upcharge 2 / lineTotal 17 / subtotal 17 — the client's number is recomputed server-side."
    );
    const deals = createCustomerDealPage(page);
    const modal = createCustomerItemModal(page);
    const checkout = createCustomerCheckoutPage(page);
    await deals.gotoBuilder(restaurantId, pizzaDeal.id);
    await expect(deals.builderHeading(pizzaDeal.name)).toBeVisible({
      timeout: 20_000,
    });
    // The pizza's extras are optional: its step is included and offers
    // "Customize"; the chosen extra shows on the step with its upcharge.
    await deals.openIncompleteSlot(pizza.name);
    await modal.selectOption(`Extra Cheese ${runId}`);
    await modal.assertOptionChecked(`Extra Cheese ${runId}`);
    await expect(modal.addToCartButton()).toHaveText("Done");
    await deals.clickAddToDeal();
    await expect(
      deals.fixedSteps(pizza.name).getByTestId("deal-step-options")
    ).toHaveText(`Extra Cheese ${runId} · +$2.00`);
    await deals.completeFixedSteps();
    await deals.assertDealComplete();
    await deals.addDealToCart();
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
    await expect(checkout.summaryItemsRow()).toContainText("$15.00");
    await expect(checkout.summaryUpgradesRow()).toContainText("+$2.00");
    await expect(checkout.summaryUpgradeDetails()).toHaveText(
      `Extra Cheese ${runId} +$2.00`
    );
    await deals.dealSummaryRow(pizzaDeal.name).click();
    await expect(deals.dealItemUpchargeLine(pizza.name)).toBeVisible();
    await expect(deals.dealItemUpchargeLine(pizza.name)).toContainText(
      "(+$2.00)"
    );
    await expect(
      page.getByText("Subtotal", { exact: true }).locator("..")
    ).toContainText("$17.00");
  });

  test("TC-892: a combo with 2 of the same item that has options is ONE '2 × <item>' step with a Customize row per unit — customising Burger 2 leaves Burger 1 on its defaults, an Add with Burger 2's required options missing is refused, and the quote carries one line per unit", async ({
    page,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    await allure.description(
      "Spec §13 (identical fixed items as one '{qty} × {name}' step). Combo @ $30 = 2 × Units Burger ($10, " +
        "optional 'Bacon' +$1.50) + 2 × Units Melt ($8, REQUIRED 'Sauce': Ranch $0 / Chipotle +$0.75); the " +
        "backend stores four quantity-1 rows. The builder shows two steps: '2 × <burger>' ✓ Included and " +
        "'2 × <melt>' Required, each with two unit rows ('<item> 1', '<item> 2', 'Included', own button " +
        "'Customize <item> n' / 'Choose options for <item> n'). Customising Burger 2 with Bacon: row 2 shows " +
        "'Bacon' + '+$1.50', row 1 stays 'Included' with no options. Melt 1 → Ranch, then Add → refused: alert " +
        "'Choose options for <melt> 2', focus on that unit's button, nothing added. Melt 2 → Chipotle → bar " +
        "$32.25 → one Add. The checkout /quote carries one orderDeals item per DealItem row (each its own " +
        "dealItemId) with upchargeAmount 0 / 1.50 (burgers) and 0 / 0.75 (melts); the server answers upcharge " +
        "2.25, lineTotal 32.25, subtotal 32.25; the summary shows two '1x <burger>' and two '1x <melt>' cart " +
        "lines ('Part of deal' ×4) with '+ Bacon', '+ Ranch', '+ Chipotle' once each."
    );
    const deals = createCustomerDealPage(page);
    const modal = createCustomerItemModal(page);
    const checkout = createCustomerCheckoutPage(page);
    const unitsBurger = await createMenuItemFull(
      token,
      groupId,
      `Units Burger ${runId}`,
      10,
      {
        description: "spec 13 unit rows: optional extra",
        modifierGroups: [
          {
            name: `Extras ${runId}`,
            pricingMode: "ADJUSTS_PRICE",
            minSelections: 0,
            maxSelections: null,
            modifiers: [{ name: `Bacon ${runId}`, price: 1.5 }],
          },
        ],
      }
    );
    unitItems.push(unitsBurger);
    const unitsMelt = await createMenuItemFull(
      token,
      groupId,
      `Units Melt ${runId}`,
      8,
      {
        description: "spec 13 unit rows: required option",
        modifierGroups: [
          {
            name: `Sauce ${runId}`,
            pricingMode: "ADJUSTS_PRICE",
            minSelections: 1,
            maxSelections: 1,
            modifiers: [
              { name: `Ranch ${runId}`, price: 0 },
              { name: `Chipotle ${runId}`, price: 0.75 },
            ],
          },
        ],
      }
    );
    unitItems.push(unitsMelt);
    const unitsDeal = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Handoff Units ${runId}`,
      30,
      [
        { id: unitsBurger.id, name: unitsBurger.name, price: 10, quantity: 2 },
        { id: unitsMelt.id, name: unitsMelt.name, price: 8, quantity: 2 },
      ],
      { description: "two burgers and two melts", validDays: ALL_DAYS }
    );
    dealIds.push(unitsDeal.id);
    try {
      const burgerStep = `2 × ${unitsBurger.name}`;
      const meltStep = `2 × ${unitsMelt.name}`;
      const rows = (await getDealApi(token, unitsDeal.id)).items ?? [];
      // The backend splits each quantity-2 line into two quantity-1 rows.
      expect(rows, JSON.stringify(rows)).toHaveLength(4);

      await allure.step(
        "One '2 × <item>' step per item, a row per unit",
        async () => {
          await deals.gotoBuilder(restaurantId, unitsDeal.id);
          await expect(deals.builderHeading(unitsDeal.name)).toBeVisible({
            timeout: 20_000,
          });
          await expect(deals.unitRows(meltStep)).toHaveCount(2, {
            timeout: 20_000,
          });
          await expect(deals.allFixedSteps()).toHaveCount(2);
          await expect(deals.fixedSteps(unitsBurger.name)).toHaveCount(1);
          await expect(deals.fixedSteps(unitsMelt.name)).toHaveCount(1);
          await expect(
            deals.stepByHeading(burgerStep).getByTestId("deal-step-status")
          ).toHaveText("✓ Included");
          await expect(
            deals.stepByHeading(meltStep).getByTestId("deal-step-status")
          ).toHaveText("Required");
          // Rows replace the step-level Customize and options summary.
          for (const h of [burgerStep, meltStep]) {
            await expect(
              deals.stepByHeading(h).getByTestId("deal-step-customize")
            ).toHaveCount(0);
            await expect(
              deals.stepByHeading(h).getByTestId("deal-step-options")
            ).toHaveCount(0);
          }
          await expect(deals.unitRows(burgerStep)).toHaveCount(2);
          for (const n of [1, 2]) {
            await expect(deals.unitLabel(burgerStep, n)).toHaveText(
              `${unitsBurger.name} ${n}`
            );
            await expect(deals.unitPrice(burgerStep, n)).toHaveText("Included");
            await expect(deals.unitOptions(burgerStep, n)).toHaveCount(0);
            await expect(deals.unitCustomizeButton(burgerStep, n)).toHaveText(
              "Customize"
            );
            await expect(
              deals.unitCustomizeButton(burgerStep, n)
            ).toHaveAccessibleName(`Customize ${unitsBurger.name} ${n}`);
            await expect(deals.unitLabel(meltStep, n)).toHaveText(
              `${unitsMelt.name} ${n}`
            );
            await expect(deals.unitCustomizeButton(meltStep, n)).toHaveText(
              "Choose options"
            );
            await expect(
              deals.unitCustomizeButton(meltStep, n)
            ).toHaveAccessibleName(`Choose options for ${unitsMelt.name} ${n}`);
          }
          // Each row is its own unit: four distinct unit keys.
          const keys = await page
            .getByTestId("deal-unit-row")
            .evaluateAll((els) =>
              els.map((e) => e.getAttribute("data-unit-key"))
            );
          expect(new Set(keys).size, JSON.stringify(keys)).toBe(4);
          // Only the melt step asks for something.
          await deals.assertProgress(0, 1);
          await expect(deals.progressDealPrice()).toHaveText("$30.00");
        }
      );

      await allure.step(
        "Customise Burger 2 only → Burger 1 keeps its defaults",
        async () => {
          await deals.customizeUnit(burgerStep, 2, async () => {
            await modal.selectOption(`Bacon ${runId}`);
            await modal.assertOptionChecked(`Bacon ${runId}`);
          });
          await expect(deals.unitOptions(burgerStep, 2)).toHaveText(
            `Bacon ${runId}`
          );
          await expect(deals.unitPrice(burgerStep, 2)).toHaveText("+$1.50");
          await expect(deals.unitPrice(burgerStep, 1)).toHaveText("Included");
          await expect(deals.unitOptions(burgerStep, 1)).toHaveCount(0);
          await expect(deals.progressDealPrice()).toHaveText("$31.50");
          // Burger 1 reopens on its defaults: no Bacon carried over.
          await deals.customizeUnit(burgerStep, 1);
          await modal.assertOptionUnchecked(`Bacon ${runId}`);
          await deals.clickAddToDeal();
          await expect(deals.unitOptions(burgerStep, 1)).toHaveCount(0);
          await expect(deals.unitOptions(burgerStep, 2)).toHaveText(
            `Bacon ${runId}`
          );
        }
      );

      await allure.step(
        "Melt 1 answered, Melt 2 not → the Add is refused and names Melt 2",
        async () => {
          await deals.customizeUnit(meltStep, 1, async () => {
            await modal.selectOption(`Ranch ${runId}`);
            await modal.assertOptionChecked(`Ranch ${runId}`);
          });
          await expect(deals.unitOptions(meltStep, 1)).toHaveText(
            `Ranch ${runId}`
          );
          await expect(deals.unitPrice(meltStep, 1)).toHaveText("Included");
          await expect(deals.unitCustomizeButton(meltStep, 1)).toHaveText(
            "Customize"
          );
          await expect(
            deals.stepByHeading(meltStep).getByTestId("deal-step-status")
          ).toHaveText("Required");
          await deals.assertProgress(0, 1);
          await deals.addDealToCartButton().click();
          await expect(deals.stepAlert(meltStep)).toHaveText(
            `Choose options for ${unitsMelt.name} 2`
          );
          await expect(deals.unitCustomizeButton(meltStep, 2)).toBeFocused();
          await expect(deals.keepShoppingButton()).toHaveCount(0);
          // The burger step has nothing to flag.
          await expect(deals.stepAlert(burgerStep)).toHaveCount(0);
        }
      );

      await allure.step("Melt 2 answered → All set → one Add", async () => {
        await deals.customizeUnit(meltStep, 2, async () => {
          await modal.selectOption(`Chipotle ${runId}`);
          await modal.assertOptionChecked(`Chipotle ${runId}`);
        });
        await expect(deals.stepAlert(meltStep)).toHaveCount(0);
        await expect(deals.unitOptions(meltStep, 2)).toHaveText(
          `Chipotle ${runId}`
        );
        await expect(deals.unitPrice(meltStep, 2)).toHaveText("+$0.75");
        await expect(
          deals.stepByHeading(meltStep).getByTestId("deal-step-status")
        ).toHaveText("✓ Included");
        // Earlier choices untouched.
        await expect(deals.unitOptions(burgerStep, 2)).toHaveText(
          `Bacon ${runId}`
        );
        await expect(deals.unitOptions(burgerStep, 1)).toHaveCount(0);
        await expect(deals.unitOptions(meltStep, 1)).toHaveText(
          `Ranch ${runId}`
        );
        await deals.assertDealComplete();
        await expect(deals.progressDealPrice()).toHaveText("$32.25");
        await expect(deals.addDealToCartButton()).toHaveText(
          "Add deal to cart · $32.25"
        );
        await deals.addDealToCart();
      });

      await allure.step(
        "Checkout: one line per unit, priced by the server",
        async () => {
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
          const req = quoteRes.request().postDataJSON() as {
            orderDeals?: {
              dealId: string;
              items: {
                dealItemId?: string;
                menuItemId: string;
                quantity: number;
                upchargeAmount: number;
              }[];
            }[];
          };
          const sent = req.orderDeals?.find((d) => d.dealId === unitsDeal.id);
          expect(sent, JSON.stringify(req.orderDeals)).toBeTruthy();
          // One entry per DealItem row, each naming its own row.
          expect(sent!.items.map((i) => i.dealItemId).sort()).toEqual(
            rows.map((r) => r.id).sort()
          );
          const upchargesOf = (menuItemId: string) =>
            sent!.items
              .filter((i) => i.menuItemId === menuItemId)
              .map((i) => {
                expect(i.quantity).toBe(1);
                return i.upchargeAmount;
              })
              .sort((a, b) => a - b);
          expect(upchargesOf(unitsBurger.id)).toEqual([0, 1.5]);
          expect(upchargesOf(unitsMelt.id)).toEqual([0, 0.75]);
          const quote = (await quoteRes.json()) as {
            quote?: {
              subtotal?: number;
              deals?: {
                dealId?: string;
                dealPrice: number;
                upcharge: number;
                lineTotal: number;
              }[];
            };
          };
          expect(quote.quote?.deals?.[0]).toMatchObject({
            dealPrice: 30,
            upcharge: 2.25,
            lineTotal: 32.25,
          });
          expect(quote.quote?.subtotal).toBe(32.25);

          await expect(
            page.getByRole("heading", {
              name: `1x ${unitsBurger.name}`,
              exact: true,
            })
          ).toHaveCount(2);
          await expect(
            page.getByRole("heading", {
              name: `1x ${unitsMelt.name}`,
              exact: true,
            })
          ).toHaveCount(2);
          await expect(deals.partOfDealLabels()).toHaveCount(4);
          for (const mod of [
            `Bacon ${runId}`,
            `Ranch ${runId}`,
            `Chipotle ${runId}`,
          ])
            await expect(
              page.getByText(`+ ${mod}`, { exact: true })
            ).toHaveCount(1);
          await expect(checkout.summaryItemsRow()).toContainText("$30.00");
          await expect(checkout.summaryUpgradesRow()).toContainText("+$2.25");
          await expect(checkout.summaryUpgradeDetails()).toContainText(
            `Bacon ${runId} +$1.50`
          );
          await expect(checkout.summaryUpgradeDetails()).toContainText(
            `Chipotle ${runId} +$0.75`
          );
          await expect(checkout.subtotalRow()).toContainText("$32.25");
        }
      );
    } finally {
      // Give the seed restaurant's deal slot back right away.
      await deleteDealApi(token, unitsDeal.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
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

  test("TC-371: paying for a deal order records the deal on the order and bumps the owner's usage counters (stats API, Promotions row, Results)", async ({
    page,
    ownerPage,
  }) => {
    await allure.description(
      "Builds the combo, checks out as a pickup guest with the Stripe VISA test card → 'Order Confirmed!'. " +
        "The order (owner GET /api/order/:id) carries orderDeals[0] {dealId, dealPrice 21, quantity 1} and " +
        "3 orderDealItems; on payment processDealStatistics increments Deal.timesUsed / totalRevenue → the " +
        "/stats summary moves by +1 / +21; the Promotions list row reads one more use and the $5.50 saved, " +
        "and Results' Top promotions lists it with the same numbers. Leaves one real paid order on QA (as " +
        "TC-26 does)."
    );
    const deals = createCustomerDealPage(page);
    const checkout = createCustomerCheckoutPage(page);
    const confirmation = createCustomerOrderConfirmationPage(page);
    const promotions = createOwnerPromotionsPage(ownerPage);
    const results = createOwnerPromotionResultsPage(ownerPage);

    const before = (await getDealStatsRaw(token, restaurantId)).data.summary!;
    const dealBefore = await getDealApi(token, combo.id);

    await allure.step("Build the deal and reach checkout", async () => {
      await deals.gotoBuilder(restaurantId, combo.id);
      await deals.completeFixedSteps();
      await deals.assertDealComplete();
      await deals.addDealToCart();
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

    await allure.step("Promotions list row and Results show it", async () => {
      const uses = (dealBefore.timesUsed ?? 0) + 1;
      await promotions.goto(restaurantId);
      await promotions.expectRowUses(combo.name, uses);
      // The deal's saving on this order (dealDiscountAmount 5.5 above).
      await promotions.expectRowSavings(combo.name, "$5.50");
      await results.goto(restaurantId);
      await results.expectLoaded();
      const top = results.topRow(combo.name);
      await expect(top).toBeVisible({ timeout: 15_000 });
      await expect(top.getByRole("cell").nth(3)).toHaveText(String(uses));
      await expect(top.getByRole("cell").nth(4)).toHaveText("$5.50");
    });
  });

  // ── Deal scheduling on the storefront (Plans 1 + 4) ───────────────────────
  /** Today's restaurant-local business span (null = closed today). */
  const todaySpan = async (tz: string) => {
    const hours =
      (await getBusinessHoursRaw(token, restaurantId)).data.businessHours ?? [];
    return openSpanOn(hours, localDateKey(tz));
  };
  /**
   * A deal on burger + fries limited to `w`, plus what seedCartWithDeal needs.
   * `choice`: the first line is "one of burger / pizza" instead of the burger
   * (a pick step on the deal page; its cart slots are then not seedable).
   */
  const windowDeal = async (
    label: string,
    w: LocalWindow,
    opts: { choice?: boolean } = {}
  ) => {
    const lines = [
      { id: burger.id, name: burger.name, price: 10 },
      { id: fries.id, name: fries.name, price: 6.5 },
    ];
    const choiceItems = opts.choice
      ? {
          items: [
            {
              optionMenuItemIds: [burger.id, pizza.id],
              quantity: 1,
              isRequired: true,
              itemName: "",
              itemPrice: 0,
              sortOrder: 0,
            },
            {
              menuItemId: fries.id,
              quantity: 1,
              itemName: fries.name,
              itemPrice: 6.5,
              isRequired: true,
              sortOrder: 1,
            },
          ],
        }
      : {};
    const deal = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Handoff ${label} ${runId}`,
      14,
      lines,
      { validTimeStart: w.start, validTimeEnd: w.end, ...choiceItems }
    );
    dealIds.push(deal.id);
    const slots = ((await getDealApi(token, deal.id)).items ?? []).map((s) => ({
      dealItemId: s.id,
      menuItemId: s.menuItemId!,
      name: s.itemName,
      price: s.itemPrice,
    }));
    return {
      deal,
      cart: {
        id: deal.id,
        name: deal.name,
        dealPrice: 14,
        originalPrice: 16.5,
        slots,
      },
    };
  };
  /** Gate on Plan 4 wind: the card of a scheduled deal carries deal-schedule-summary. */
  const windShipsScheduleUi = async (
    page: Parameters<typeof createCustomerDealPage>[0],
    dealName: string
  ) => {
    const menu = createCustomerMenuPage(page);
    const deals = createCustomerDealPage(page);
    await menu.goto(restaurantId);
    await expect(deals.dealCard(dealName)).toBeVisible({ timeout: 30_000 });
    return (await deals.cardScheduleSummary(dealName).count()) > 0;
  };

  test("TC-535: a deal that starts later today is offered with 'Available from <time>' and its schedule, but its builder's options and Add are disabled until then", async ({
    page,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    const tz = await getRestaurantTimeZonePublic(restaurantId);
    requireScheduling("backend", Boolean(tz));
    const span = await todaySpan(tz);
    const w = span
      ? laterTodayWindow(tz, { notBefore: span.open, notAfter: span.close })
      : null;
    test.skip(
      !w,
      "No hour-long window left in the seed restaurant's business hours today"
    );
    // A pick step (burger or pizza) + fries, so there are options to lock.
    const { deal } = await windowDeal("Later", w!, { choice: true });
    try {
      // The deal has an option line (burger or pizza): the public list only
      // returns it to a client that says it renders the new mechanics
      // (X-Promotions-Version: 2), as wind does — old clients never see it.
      const listed = (
        await getActiveDealsPublic(restaurantId, { v2: true })
      ).data.deals?.find((d) => d.id === deal.id);
      expect(listed?.availableNow).toBe(false);
      requireScheduling("wind", await windShipsScheduleUi(page, deal.name));
      const deals = createCustomerDealPage(page);
      // Wind sends no Accept-Language of its own: assert the times, not the words.
      const label = await deals.cardAvailabilityLabel(deal.name).innerText();
      expect(mentionsClock(label, w!.start), label).toBe(true);
      const summary = await deals.cardScheduleSummary(deal.name).innerText();
      expect(
        mentionsClock(summary, w!.start) && mentionsClock(summary, w!.end),
        summary
      ).toBe(true);
      await deals.viewDeal(deal.name);
      await expect(deals.builderHeading(deal.name)).toBeVisible({
        timeout: 20_000,
      });
      await expect(deals.builderAvailabilityLabel()).toBeVisible();
      // Two steps: the pick (burger or pizza) and the fixed fries.
      await expect(deals.slotCardHooks()).toHaveCount(2);
      await expect(deals.choiceSlots()).toHaveCount(1);
      // Nothing can be picked or added until the window opens.
      const options = deals.choiceSlots().getByRole("radio");
      await expect(options).toHaveCount(2);
      for (const option of await options.all())
        await expect(option).toHaveAttribute("aria-disabled", "true");
      await expect(deals.addDealToCartButton()).toBeDisabled();
      await expect(deals.keepShoppingButton()).toHaveCount(0);
    } finally {
      // Free the shared seed restaurant's cap slot right away, not in afterAll.
      await deleteDealApi(await freshToken(), deal.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });

  test("TC-536: choosing a scheduled pickup inside the deal's window unlocks it — the quote with scheduledFor prices the deal", async ({
    page,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    const tz = await getRestaurantTimeZonePublic(restaurantId);
    requireScheduling("backend", Boolean(tz));
    const span = await todaySpan(tz);
    const w = span
      ? laterTodayWindow(tz, { notBefore: span.open, notAfter: span.close })
      : null;
    test.skip(
      !w,
      "No hour-long window left in the seed restaurant's business hours today"
    );
    const { deal, cart } = await windowDeal("Unlock", w!);
    try {
      requireScheduling("wind", await windShipsScheduleUi(page, deal.name));
      const checkout = createCustomerCheckoutPage(page);
      const deals = createCustomerDealPage(page);
      await checkout.seedCartWithDeal(restaurantId, cart);
      await expect(deals.partOfDealLabels()).toHaveCount(2);
      await expect(deals.completeDealsToContinueButton()).toHaveCount(0);

      if (await checkout.asapOption().isEnabled()) {
        await checkout.asapOption().check();
        await expect(checkout.dealTimeError()).toBeVisible({ timeout: 20_000 });
        await expect(checkout.changeTimeButton()).toBeVisible();
      }
      const quoted = page.waitForResponse(
        (r) =>
          checkout.isQuote(r) &&
          Boolean(
            (r.request().postDataJSON() as { scheduledFor?: string })
              .scheduledFor
          ),
        { timeout: 30_000 }
      );
      const slot = await checkout.chooseScheduledSlot((iso) =>
        isInsideWindow(tz, iso, w!)
      );
      // On the skip path nobody awaits the listener; don't let its
      // "Test ended" rejection fail the skipped test.
      if (!slot) quoted.catch(() => {});
      test.skip(
        !slot,
        "The storefront offers no slot inside the window today (prep time / lead time)"
      );
      const quote = await quoted;
      expect(
        (quote.request().postDataJSON() as { scheduledFor?: string })
          .scheduledFor
      ).toBe(slot);
      expect(quote.status()).toBe(200);
      const body = (await quote.json()) as {
        quote?: { deals?: { dealId: string }[] };
      };
      expect(body.quote?.deals?.[0]?.dealId).toBe(deal.id);
      await expect(checkout.dealTimeError()).toBeHidden();
      await expect(checkout.proceedToPaymentButton()).toBeVisible();
    } finally {
      // Free the shared seed restaurant's cap slot right away, not in afterAll.
      await deleteDealApi(await freshToken(), deal.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });

  test("TC-537: a scheduled pickup outside the deal's window shows the server's DEAL_NOT_AVAILABLE_AT_TIME message naming the deal, with Remove deal / Change time — Remove deal drops it and checkout continues", async ({
    page,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    const tz = await getRestaurantTimeZonePublic(restaurantId);
    requireScheduling("backend", Boolean(tz));
    const w = liveNowWindow(tz);
    test.skip(
      !w,
      "Too close to the restaurant's midnight for a same-day live window"
    );
    const { deal, cart } = await windowDeal("Now", w!);
    try {
      requireScheduling("wind", await windShipsScheduleUi(page, deal.name));
      const checkout = createCustomerCheckoutPage(page);
      const deals = createCustomerDealPage(page);
      await checkout.seedCartWithDeal(restaurantId, cart, [
        { menuItemId: pizza.id, name: pizza.name, price: 12 },
      ]);
      const refused = page.waitForResponse(
        (r) => checkout.isQuote(r) && r.status() === 400,
        { timeout: 30_000 }
      );
      const outside = (iso: string) => {
        const m = localParts(tz, new Date(iso)).minuteOfDay;
        return m < w!.startMinute || m >= w!.endMinute;
      };
      const slot = await checkout.chooseScheduledSlot(outside);
      // On the skip path nobody awaits the listener; don't let its
      // "Test ended" rejection fail the skipped test.
      if (!slot) refused.catch(() => {});
      test.skip(
        !slot,
        "The storefront offers no slot outside the deal's window"
      );
      const res = await refused;
      const err = (await res.json()) as {
        errorCode?: string;
        message?: string;
      };
      expect(err.errorCode).toBe("DEAL_NOT_AVAILABLE_AT_TIME");
      await expect(checkout.dealTimeError()).toBeVisible();
      await expect(checkout.dealTimeError()).toContainText(deal.name);
      expect(
        normalizeSpaces(await checkout.dealTimeError().innerText())
      ).toContain(normalizeSpaces(err.message ?? ""));
      await expect(checkout.changeTimeButton()).toBeVisible();
      await checkout.removeDealButton().click();
      await expect(deals.dealSummaryRow(deal.name)).toHaveCount(0);
      await expect(checkout.dealTimeError()).toBeHidden();
      await expect(checkout.proceedToPaymentButton()).toBeVisible();
    } finally {
      // Free the shared seed restaurant's cap slot right away, not in afterAll.
      await deleteDealApi(await freshToken(), deal.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });

  test("TC-538: the Deals grid block shows each deal's real price, struck original, item names and schedule text — exactly what the page's own /active returned", async ({
    page,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    await allure.description(
      "DealsGridBlock (block type deals_grid) is placed on no page by default. An ADMIN puts one on the seed " +
        "restaurant's catering page (PUT /api/admin/restaurants/:id/branding with restaurantPages only — the " +
        "/catering route renders its blocks whether or not the nav links it), the test reads the page, and the " +
        "original restaurantPages is restored in finally. The block shows the first 3 deals of /active; every " +
        "rendered card is checked against the page's OWN /active response (so no language assumption): " +
        "$dealPrice, struck $originalPrice, '1x <itemName>' chips, and scheduleSummary (or availabilityLabel when " +
        "availableNow is false). Before the Plan 4 fix the block showed dealPrice/100 and undefined item names."
    );
    test.skip(!adminToken, "ADMIN creds needed to place the block on a page");
    const tz = await getRestaurantTimeZonePublic(restaurantId);
    requireScheduling("backend", Boolean(tz));
    const branding = await getBrandingAdminRaw(adminToken, restaurantId);
    expect(branding.status, JSON.stringify(branding.data)).toBe(200);
    test.skip(
      branding.data.scope !== "restaurant" || !branding.data.data,
      "The wind restaurant has no standalone branding row — creating one would restyle the whole storefront"
    );
    const originalPages = (branding.data.data!.restaurantPages ??
      null) as Record<string, unknown> | null;
    // Live today (every day but one far weekday), so it carries a non-null scheduleSummary.
    const farDay = dayNameOfKey(localDateKey(tz, 3));
    const grid = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Handoff Grid ${runId}`,
      14,
      [
        { id: burger.id, name: burger.name, price: 10 },
        { id: fries.id, name: fries.name, price: 6.5 },
      ],
      { validDays: DAY_NAMES.filter((d) => d !== farDay) }
    );
    dealIds.push(grid.id);
    try {
      const title = `Automation Deals Grid ${runId}`;
      const catering = (originalPages?.catering ?? {}) as Record<
        string,
        unknown
      >;
      const put = await putBrandingAdminRaw(adminToken, restaurantId, {
        restaurantPages: {
          ...(originalPages ?? {}),
          catering: {
            ...catering,
            blocks: [{ type: "deals_grid", data: { title } }],
          },
        },
      });
      expect(put.status, JSON.stringify(put.data)).toBe(200);
      try {
        const deals = createCustomerDealPage(page);
        const [activeRes] = await Promise.all([
          page.waitForResponse(
            (r) =>
              new RegExp(`/api/deals/restaurant/${restaurantId}/active`).test(
                r.url()
              ) && r.request().method() === "GET",
            { timeout: 30_000 }
          ),
          deals.gotoCateringPage(restaurantId),
        ]);
        const shown = (
          ((await activeRes.json()) as { deals?: ApiDeal[] }).deals ?? []
        ).slice(0, 3);
        expect(
          shown.length,
          "our own ACTIVE deal guarantees at least one card"
        ).toBeGreaterThan(0);
        await expect(deals.dealsGridHeading(title)).toBeVisible({
          timeout: 30_000,
        });
        const first = deals.dealsGridCard(title, shown[0]!.name);
        await expect(first).toBeVisible();
        requireScheduling(
          "wind",
          (await first.innerText()).includes(
            `$${shown[0]!.dealPrice!.toFixed(2)}`
          )
        );
        for (const d of shown) {
          const card = deals.dealsGridCard(title, d.name);
          await expect(card).toBeVisible();
          await expect(card).toContainText(`$${d.dealPrice!.toFixed(2)}`);
          if ((d.originalPrice ?? 0) > (d.dealPrice ?? 0))
            await expect(card).toContainText(`$${d.originalPrice!.toFixed(2)}`);
          for (const item of d.items ?? [])
            await expect(card).toContainText(`1x ${item.itemName}`);
          const expected =
            d.availableNow === false ? d.availabilityLabel : d.scheduleSummary;
          if (expected)
            expect(normalizeSpaces(await card.innerText())).toContain(
              normalizeSpaces(expected)
            );
        }
        if (!shown.some((d) => d.id === grid.id))
          test.info().annotations.push({
            type: "note",
            description:
              "our scheduled deal was not among the first 3 the block renders; schedule text checked on the cards it did render",
          });
      } finally {
        // Restore exactly; an originally-null column is restored as {} (the backend ignores null; wind reads both the same).
        await putBrandingAdminRaw(adminToken, restaurantId, {
          restaurantPages: originalPages ?? {},
        });
      }
    } finally {
      // Free the shared seed restaurant's cap slot right away, not in afterAll.
      await deleteDealApi(await freshToken(), grid.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });
});
