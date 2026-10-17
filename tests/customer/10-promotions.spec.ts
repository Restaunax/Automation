/**
 * 10-promotions.spec.ts — Promotions on the template-wind storefront (spec:
 * restaunax docs/features/PROMOTIONS.md → "Clients as built (plan 3)" →
 * Storefronts): what the customer sees, and what the server prices and stores.
 *
 * Own data on the SEED restaurant (the storefront is pinned to it), seeded
 * through the API in beforeAll by seedStorefrontPromotions: a per-run
 * "Automation Menu Promo Wind <id>" category with six items, a 50% automatic
 * sale and a free-item spend offer scoped to those items only (so no other
 * file's cart is repriced) and a 15%-off-$30+ order code. The two deals — a
 * "2nd gyro for $1.99" BOGO with item options (menu + code) and a CODE-only
 * combo — are created inside the tests that use them (cap-safe) and deleted in
 * that test's finally, so the file holds no ACTIVE deal slot between tests
 * (TC-841 briefly holds both) — see TEST_PLAN.md's footprint table. The rest
 * is deleted in afterAll (each delete checked; a failed one fails the hook), and
 * globalTeardown's AUTO / "Automation Menu" sweeps backstop an interrupted run.
 *
 * TC-844 places ONE real Stripe test-card order (the plan's one wind order).
 * Every other money check reads the page's own /quote or the API's.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerMenuPage } from "../../pages/customer/CustomerMenuPage";
import { createCustomerDealPage } from "../../pages/customer/CustomerDealPage";
import { createCustomerItemModal } from "../../pages/customer/CustomerItemModal";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { createCustomerOrderConfirmationPage } from "../../pages/customer/CustomerOrderConfirmationPage";
import {
  apiLogin,
  getActiveDealsPublic,
  getOrderByIdRaw,
  DEAL_SLOT_TEST_TIMEOUT_MS,
  DEAL_SLOT_TWO_TEST_TIMEOUT_MS,
} from "../../utils/apiHelper";
import {
  cleanupStorefrontPromotions,
  publicMenuItem,
  seedStorefrontPromotions,
  STOREFRONT_PRICES,
  withStorefrontBogo,
  withStorefrontCombo,
  type SeededItem,
  type StorefrontDealContext,
  type StorefrontPromotionSet,
} from "../../utils/promotionFixtures";
import { promotionQuote } from "../../utils/promotionsApi";
import {
  expectShownMatchesLatestQuote,
  isQuoteResponse,
  readQuote,
  trackQuotes,
  type PageQuote,
} from "../../utils/quoteTracker";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import {
  generateRunId,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantId,
} from "../../utils/testData";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const money = (n: number) => `$${n.toFixed(2)}`;

test.describe("Storefront — Promotions (template-wind)", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL and OWNER_PASSWORD must be set in .env"
  );
  test.describe.configure({
    mode: "serial",
    timeout: DEAL_SLOT_TEST_TIMEOUT_MS,
  });

  const runId = generateRunId();
  let restaurantId = "";
  let token = "";
  let set: StorefrontPromotionSet;
  const created: Parameters<typeof seedStorefrontPromotions>[3] = {};
  const dealCtx = (): StorefrontDealContext => ({
    token,
    restaurantId,
    set,
    createdDeals: (created.createdDeals ??= []),
  });

  const cartLine = (item: SeededItem, quantity = 1) => ({
    menuItemId: item.id,
    name: item.name,
    price: item.price,
    quantity,
  });

  test.beforeAll(async () => {
    if (!TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readRestaurantId();
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));
    set = await seedStorefrontPromotions(token, restaurantId, runId, created);
  });

  test.afterAll(async () => {
    if (!token) return;
    const failures = await cleanupStorefrontPromotions(token, created);
    // Backstop for a per-test deal delete that never ran, plus the menu and
    // coupons. A leaked deal holds one of the seed restaurant's 10 active
    // slots for every other file: fail loudly rather than log.
    expect(failures, "storefront promotions cleanup").toEqual([]);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-836: an automatic sale shows on the menu card — struck regular price, the sale price and the sale's label, exactly as the public menu prices it", async ({
    page,
  }) => {
    const menu = createCustomerMenuPage(page);
    const sale = set.items.saleItem;
    const served = await allure.step("public menu carries the sale", () =>
      publicMenuItem(restaurantId, sale.id)
    );
    expect(served?.promotion, JSON.stringify(served)).toBeTruthy();
    const { salePrice, label } = served!.promotion!;
    expect(salePrice).toBe(STOREFRONT_PRICES.saleItem / 2);

    await allure.step("menu card shows it", async () => {
      await menu.goto(restaurantId);
      await menu.assertPageLoaded();
      const card = menu.itemCard(sale.name);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(menu.cardRegularPrice(sale.name)).toHaveText(
        money(sale.price)
      );
      await expect(menu.cardRegularPrice(sale.name)).toHaveCSS(
        "text-decoration-line",
        "line-through"
      );
      await expect(card).toContainText(money(salePrice));
      await expect(menu.cardSaleLabel(sale.name)).toHaveText(label);
    });

    await allure.step(
      "an item outside the sale has no sale price or label",
      async () => {
        const platter = set.items.platter;
        await expect(menu.itemCard(platter.name)).toContainText(
          money(platter.price)
        );
        await expect(menu.cardRegularPrice(platter.name)).toHaveCount(0);
        await expect(menu.cardSaleLabel(platter.name)).toHaveCount(0);
      }
    );
  });

  test("TC-837: the BOGO builder offers each step's options; two picks show the deal's server price, and one Add puts the deal in the cart", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const deals = createCustomerDealPage(page);
      const { gyroA, gyroB } = set.items;
      const server = await allure.step(
        "server price for these picks (/quote)",
        () =>
          promotionQuote(restaurantId, {
            items: [],
            orderDeals: [
              {
                dealId: bogo.dealId,
                quantity: 1,
                items: [
                  {
                    dealItemId: bogo.buyItemId,
                    menuItemId: gyroA.id,
                    quantity: 1,
                  },
                  {
                    dealItemId: bogo.getItemId,
                    menuItemId: gyroB.id,
                    quantity: 1,
                  },
                ],
              },
            ],
          })
      );
      const dealPrice = server.deals[0]?.dealPrice;
      expect(dealPrice, JSON.stringify(server.raw)).toBeDefined();

      await allure.step("each slot lists both options", async () => {
        await deals.gotoBuilder(restaurantId, bogo.dealId);
        await expect(deals.builderHeading(bogo.name)).toBeVisible({
          timeout: 20_000,
        });
        await expect(deals.choiceSlots()).toHaveCount(2);
        // Each card's price label (in its accessible name): the cheaper gyro
        // is "Included", the other costs the deal-price difference — with the
        // other step at the cheaper gyro, the 2nd-at-$1.99 rule makes that
        // exactly the item-price difference.
        const [cheap, dear] =
          gyroA.price <= gyroB.price ? [gyroA, gyroB] : [gyroB, gyroA];
        const priceLabel = (item: typeof gyroA) =>
          item === cheap
            ? "Included"
            : `+$${(dear.price - cheap.price).toFixed(2)}`;
        for (const slot of [0, 1]) {
          for (const item of [gyroA, gyroB]) {
            await expect(deals.choiceCard(slot, item.name)).toBeVisible();
            await expect(deals.choiceCard(slot, item.name)).toHaveAttribute(
              "aria-checked",
              "false"
            );
            await expect(
              deals.choiceCard(slot, item.name)
            ).toHaveAccessibleName(`${item.name}, ${priceLabel(item)}`);
          }
        }
        await expect(deals.stepStatus(0)).toHaveText("Required");
        await deals.assertProgress(0, 2);
      });

      await allure.step("pick one option per slot", async () => {
        await deals.pickChoice(0, gyroA.name);
        await expect(deals.stepStatus(0)).toHaveText("✓ Done");
        await deals.assertProgress(1, 2);
        await deals.pickChoice(1, gyroB.name);
        await deals.assertDealComplete();
        await expect(deals.progressDealPrice()).toHaveText(money(dealPrice!));
      });

      await allure.step("the cart holds the deal at that price", async () => {
        await deals.addDealToCart();
        const [quoteRes] = await Promise.all([
          page.waitForResponse(isQuoteResponse, { timeout: 30_000 }),
          deals.viewCartButton().click(),
        ]);
        const quote = await readQuote(quoteRes);
        expect(quote.request.orderDeals?.[0]?.dealId).toBe(bogo.dealId);
        expect(quote.body.quote?.deals?.[0]?.dealPrice).toBe(dealPrice);
        await expect(deals.dealSummaryRow(bogo.name)).toBeVisible({
          timeout: 15_000,
        });
        await expect(deals.partOfDealLabels()).toHaveCount(2);
      });
    });
  });

  test("TC-838: the order code in the code box shows the promotion's title and savings; the total is the page's /quote amountToCharge", async ({
    page,
  }) => {
    const checkout = createCustomerCheckoutPage(page);
    const quotes = trackQuotes(page);
    await checkout.seedCartItems(restaurantId, [
      cartLine(set.items.platter, 2),
    ]);

    const [codeQuoteRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isQuoteResponse(r) &&
          (r.request().postDataJSON() as PageQuote["request"]).couponId ===
            set.orderCode.id,
        { timeout: 30_000 }
      ),
      checkout.applyCoupon(set.orderCode.code),
    ]);
    const codeQuote = (await readQuote(codeQuoteRes)).body.quote!;
    // Acceptance set: 15% of $40 = $6, capped at $4.50.
    expect(codeQuote.appliedPromotion).toMatchObject({
      couponId: set.orderCode.id,
      title: set.orderCode.name,
      savings: 4.5,
    });

    await checkout.assertCouponApplied(set.orderCode.code, set.orderCode.name);
    await expect(checkout.promotionLine(set.orderCode.name)).toContainText(
      "-$4.50"
    );
    await expectShownMatchesLatestQuote(checkout.readOrderTotal, quotes);
    const latest = await quotes.latest();
    expect(latest.request.couponId, "the latest quote is for the code").toBe(
      set.orderCode.id
    );
  });

  test("TC-839: a bundle code opens its deal builder — from the code box and from a ?promo= link", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const checkout = createCustomerCheckoutPage(page);
      const menu = createCustomerMenuPage(page);
      const deals = createCustomerDealPage(page);
      const builderUrl = new RegExp(
        `/deals/${bogo.dealId}\\?code=${bogo.code}`
      );

      await allure.step("code box", async () => {
        await checkout.seedCartItems(restaurantId, [
          cartLine(set.items.platter),
        ]);
        await checkout.applyCoupon(bogo.code);
        await expect(page).toHaveURL(builderUrl, { timeout: 20_000 });
        await expect(deals.builderHeading(bogo.name)).toBeVisible({
          timeout: 20_000,
        });
      });

      await allure.step("?promo= link", async () => {
        await menu.gotoWithParams(restaurantId, { promo: bogo.code });
        await expect(page).toHaveURL(builderUrl, { timeout: 20_000 });
        await expect(deals.builderHeading(bogo.name)).toBeVisible({
          timeout: 20_000,
        });
      });
    });
  });

  test("TC-840: over the spend threshold the free-item offer shows; Add puts the gift in the cart and its line is free", async ({
    page,
  }) => {
    const checkout = createCustomerCheckoutPage(page);
    const quotes = trackQuotes(page);
    const { gift, platter } = set.items;
    // 3 × $20 = $60, over the $55 threshold (gift line excluded).
    await checkout.seedCartItems(restaurantId, [cartLine(platter, 3)]);
    await expect(checkout.freeItemOfferButton()).toHaveText(
      `You've earned a free ${gift.name} — Add it`,
      { timeout: 20_000 }
    );

    const [giftQuoteRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          isQuoteResponse(r) &&
          (
            (r.request().postDataJSON() as PageQuote["request"]).orderItems ??
            []
          ).some((i) => i.menuItemId === gift.id),
        { timeout: 30_000 }
      ),
      checkout.freeItemOfferButton().click(),
    ]);
    const giftQuote = (await readQuote(giftQuoteRes)).body.quote!;
    // The gift is priced at its regular price and discounted in full.
    expect(giftQuote.appliedPromotion).toMatchObject({
      couponId: set.freeItem!.id,
      title: set.freeItem!.name,
      savings: gift.price,
    });
    expect(giftQuote.freeItemOffer ?? null).toBeNull();

    await expect(
      page.getByRole("heading", { name: `1x ${gift.name}` })
    ).toBeVisible({ timeout: 15_000 });
    await expect(checkout.promotionLine(set.freeItem!.name)).toContainText(
      `-${money(gift.price)}`
    );
    await expect(checkout.freeItemOfferButton()).toHaveCount(0);
    await expectShownMatchesLatestQuote(checkout.readOrderTotal, quotes);
  });

  test("TC-841: a CODE-only combo is not listed on the menu; its code opens it, and checkout prices it with no 'needs its code' issue", async ({
    page,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TWO_TEST_TIMEOUT_MS);
    await withStorefrontBogo(dealCtx(), (bogo) =>
      withStorefrontCombo(dealCtx(), async (combo) => {
        const menu = createCustomerMenuPage(page);
        const deals = createCustomerDealPage(page);
        const checkout = createCustomerCheckoutPage(page);
        const { platter, burger } = set.items;

        await allure.step("hidden without its code", async () => {
          const listed = (
            await getActiveDealsPublic(restaurantId, { v2: true })
          ).data.deals?.map((d) => d.id);
          expect(listed).toContain(bogo.dealId);
          expect(listed).not.toContain(combo.dealId);
          await menu.goto(restaurantId);
          await menu.assertPageLoaded();
          // Positive control: the BOGO (menu + code) is listed.
          await expect(menu.dealHeading(bogo.name)).toBeVisible({
            timeout: 30_000,
          });
          await expect(menu.dealHeading(combo.name)).toHaveCount(0);
        });

        await allure.step("its code opens the builder", async () => {
          await checkout.seedCartItems(restaurantId, [
            cartLine(set.items.gyroA),
          ]);
          await checkout.applyCoupon(combo.code);
          await expect(page).toHaveURL(
            new RegExp(`/deals/${combo.dealId}\\?code=${combo.code}`),
            { timeout: 20_000 }
          );
          await expect(deals.builderHeading(combo.name)).toBeVisible({
            timeout: 20_000,
          });
        });

        await allure.step("build it and check out", async () => {
          await deals.openIncompleteSlot(platter.name);
          await deals.clickAddToDeal();
          await deals.openIncompleteSlot(burger.name);
          await deals.clickAddToDeal();
          await deals.assertDealComplete();
          await deals.addDealToCart();
          const [quoteRes] = await Promise.all([
            page.waitForResponse(isQuoteResponse, { timeout: 30_000 }),
            deals.viewCartButton().click(),
          ]);
          const quote = await readQuote(quoteRes);
          const line = quote.request.orderDeals?.find(
            (d) => d.dealId === combo.dealId
          );
          expect(line?.code, "the coded deal travels with its code").toBe(
            combo.code
          );
          expect(
            (quote.body.issues ?? []).map((i) => i.code),
            JSON.stringify(quote.body.issues)
          ).not.toContain("code_required");
          expect(
            quote.body.quote?.deals?.find((d) => d.dealId === combo.dealId)
              ?.dealPrice
          ).toBe(STOREFRONT_PRICES.comboPrice);
          await expect(deals.dealSummaryRow(combo.name)).toBeVisible({
            timeout: 15_000,
          });
          await expect(checkout.dealNeedsCodeMessage()).toHaveCount(0);
          await expect(checkout.reviewYourOrderButton()).toHaveCount(0);
          // Pay is disabled until the customer form is valid; with it filled,
          // nothing (no code issue, no incomplete deal) may block it.
          await checkout.fillCustomerInfo(
            "Combo",
            "Tester",
            generateUserEmail("windcombo"),
            generateSeedPhone()
          );
          await checkout.selectPickup();
          await expect(checkout.proceedToPaymentButton()).toBeEnabled({
            timeout: 15_000,
          });
        });
      })
    );
  });

  test("TC-842: Keep shopping after adding a deal lands on the menu with '<deal> added to your cart' — once; a crafted dealAdded id shows nothing", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const deals = createCustomerDealPage(page);
      const menu = createCustomerMenuPage(page);
      const expected = `${bogo.name} added to your cart`;

      await allure.step("complete the deal → Add → Keep shopping", async () => {
        await deals.gotoBuilder(restaurantId, bogo.dealId);
        await expect(deals.keepShoppingButton()).toHaveCount(0);
        await deals.pickChoice(0, set.items.gyroA.name);
        await deals.pickChoice(1, set.items.gyroB.name);
        await deals.assertDealComplete();
        // Complete is not added: Keep shopping appears only after the Add.
        await expect(deals.keepShoppingButton()).toHaveCount(0);
        await deals.addDealToCart();
        await deals.keepShoppingButton().click();
        await expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });
        await expect(menu.dealAddedConfirmation()).toHaveText(expected, {
          timeout: 10_000,
        });
        // One-shot: the param is stripped on read.
        await expect(page).not.toHaveURL(/dealAdded=/);
      });

      await allure.step("a refresh does not show it again", async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(menu.itemCard(set.items.platter.name)).toBeVisible({
          timeout: 30_000,
        });
        await expect(menu.dealAddedConfirmation()).toHaveCount(0);
      });

      await allure.step(
        "a crafted id shows nothing; the real one (control) does",
        async () => {
          await menu.gotoWithParams(restaurantId, {
            dealAdded: "00000000-0000-4000-8000-000000000000",
          });
          await expect(menu.itemCard(set.items.platter.name)).toBeVisible({
            timeout: 30_000,
          });
          await expect(page).not.toHaveURL(/dealAdded=/);
          await expect(menu.dealAddedConfirmation()).toHaveCount(0);
          await menu.gotoWithParams(restaurantId, { dealAdded: bogo.dealId });
          await expect(menu.dealAddedConfirmation()).toHaveText(expected, {
            timeout: 10_000,
          });
        }
      );
    });
  });

  test("TC-843: a deal with upgrade picks shows Items, Upgrades (itemised, incl. the size choice) and Subtotal — Items + Upgrades = Subtotal = the quote's", async ({
    page,
  }) => {
    await withStorefrontCombo(dealCtx(), async (combo) => {
      const deals = createCustomerDealPage(page);
      const modal = createCustomerItemModal(page);
      const checkout = createCustomerCheckoutPage(page);
      const { platter, burger } = set.items;
      const P = STOREFRONT_PRICES;

      await deals.gotoBuilder(restaurantId, combo.dealId, combo.code);
      await expect(deals.builderHeading(combo.name)).toBeVisible({
        timeout: 20_000,
      });
      await deals.openIncompleteSlot(platter.name);
      await deals.clickAddToDeal();
      await deals.openIncompleteSlot(burger.name);
      await modal.selectOption(`Large ${runId}`);
      await modal.selectOption(`Bacon ${runId}`);
      // The deal modal's confirm is "Done" (no price); the step shows the
      // chosen options and their upcharge instead.
      await expect(modal.addToCartButton()).toHaveText("Done");
      await deals.clickAddToDeal();
      const burgerOptions = deals
        .fixedSteps(burger.name)
        .getByTestId("deal-step-options");
      // optionsSummaryOf: the picked options in order, then the upcharge.
      await expect(burgerOptions).toHaveText(
        `Large ${runId}, Bacon ${runId} · +$${(
          P.burgerLarge -
          P.burger +
          P.bacon
        ).toFixed(2)}`
      );
      await deals.assertDealComplete();

      await deals.addDealToCart();
      const [quoteRes] = await Promise.all([
        page.waitForResponse(isQuoteResponse, { timeout: 30_000 }),
        deals.viewCartButton().click(),
      ]);
      const quote = (await readQuote(quoteRes)).body.quote!;
      const upcharge = quote.deals?.[0]?.upcharge;
      // Large replaces Regular ($15 − $12) + Bacon $1.50.
      expect(upcharge).toBe(P.burgerLarge - P.burger + P.bacon);

      await expect(checkout.summaryItemsRow()).toBeVisible({ timeout: 15_000 });
      const items = await checkout.readMoney(checkout.summaryItemsRow());
      const upgrades = await checkout.readMoney(checkout.summaryUpgradesRow());
      const subtotal = await checkout.readMoney(checkout.subtotalRow());
      await allure.parameter(
        "items / upgrades / subtotal",
        `${items} / ${upgrades} / ${subtotal}`
      );
      expect(Math.round((items + upgrades) * 100)).toBe(
        Math.round(subtotal * 100)
      );
      expect(upgrades).toBe(upcharge);
      expect(subtotal).toBe(quote.subtotal);
      await expect(checkout.summaryUpgradesRow()).toContainText(
        `+${money(upcharge!)}`
      );
      const details = checkout.summaryUpgradeDetails();
      await expect(details).toContainText(
        `Large ${runId} +${money(P.burgerLarge - P.burger)}`
      );
      await expect(details).toContainText(`Bacon ${runId} +${money(P.bacon)}`);
    });
  });

  test("TC-844: paying with the order code records the code's promotion, the quoted savings and the total shown before paying", async ({
    page,
  }) => {
    const checkout = createCustomerCheckoutPage(page);
    const confirmation = createCustomerOrderConfirmationPage(page);
    const quotes = trackQuotes(page);
    await checkout.seedCartItems(restaurantId, [
      cartLine(set.items.platter, 2),
    ]);
    await checkout.applyCoupon(set.orderCode.code);
    await checkout.assertCouponApplied(set.orderCode.code, set.orderCode.name);

    await checkout.fillCustomerInfo(
      "Promo",
      "Tester",
      generateUserEmail("windpromo"),
      generateSeedPhone()
    );
    await checkout.selectPickup();
    await checkout.clickProceedToPayment();
    await checkout.assertPaymentSectionVisible();

    const payTotal = await expectShownMatchesLatestQuote(
      checkout.readOrderTotal,
      quotes
    );
    const latest = await quotes.latest();
    const quoted = latest.body.quote!;
    expect(latest.request.couponId).toBe(set.orderCode.id);
    expect(quoted.amountToCharge).toBe(payTotal);
    await allure.parameter("pay total", money(payTotal));

    await checkout.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
    await checkout.completeOrder();
    await confirmation.assertConfirmed();
    const orderId =
      page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(orderId, `order id from ${page.url()}`).toBeTruthy();
    await allure.parameter("orderId", orderId);

    const order = await getOrderByIdRaw(token, orderId);
    expect(order.status, JSON.stringify(order.data)).toBe(200);
    expect(order.data.couponId).toBe(set.orderCode.id);
    expect(order.data.discountAmount).toBe(quoted.appliedPromotion!.savings);
    expect(order.data.total).toBe(payTotal);
  });

  test("TC-891: an incomplete deal never reaches the wind cart — Add with a step unpicked points at the first missing step and adds nothing, leaving mid-build leaves no partial deal, and the complete deal is added once", async ({
    page,
  }) => {
    await allure.description(
      "Guided deal choices (spec §5) on template-wind: opening the deal adds nothing (the old page auto-added it); an Add " +
        "with nothing picked, and again with only some steps picked, shows 'Pick one to continue.' (role=alert) in the " +
        "first unfinished step (status 'Required') and adds nothing; checkout then has no deal and no " +
        "'Complete Deals to Continue'; walking away mid-build leaves no partial deal; after every step is picked one Add " +
        "puts the complete deal in the cart. Focus is not asserted (wind focuses the step's control)."
    );
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const deals = createCustomerDealPage(page);
      const checkout = createCustomerCheckoutPage(page);
      const { gyroA, gyroB } = set.items;

      const assertCartEmpty = async () => {
        await checkout.gotoCheckoutEmpty(restaurantId);
        await checkout.assertEmptyCart();
        await expect(
          page.getByRole("button", { name: "Complete Deals to Continue" })
        ).toHaveCount(0);
        await expect(deals.dealSummaryRow(bogo.name)).toHaveCount(0);
      };

      await allure.step(
        "Add with nothing picked: nothing is added",
        async () => {
          await deals.gotoBuilder(restaurantId, bogo.dealId);
          await expect(deals.builderHeading(bogo.name)).toBeVisible({
            timeout: 20_000,
          });
          await expect(deals.stepStatus(0)).toHaveText("Required");
          await deals.addDealToCartButton().click();
          await expect(deals.stepError(0)).toHaveText("Pick one to continue.");
          await expect(deals.stepStatus(0)).toHaveText("Required");
          await expect(deals.keepShoppingButton()).toHaveCount(0);
        }
      );

      await allure.step("the cart is empty", assertCartEmpty);

      await allure.step(
        "Add with one step left: still nothing, the message moves to it",
        async () => {
          await deals.gotoBuilder(restaurantId, bogo.dealId);
          await expect(deals.builderHeading(bogo.name)).toBeVisible({
            timeout: 20_000,
          });
          await deals.pickChoice(0, gyroA.name);
          await deals.addDealToCartButton().click();
          await expect(deals.stepError(1)).toHaveText("Pick one to continue.");
          await expect(deals.stepStatus(1)).toHaveText("Required");
          await expect(deals.stepStatus(0)).toHaveText("✓ Done");
          await expect(deals.keepShoppingButton()).toHaveCount(0);
        }
      );

      await allure.step(
        "leaving the page mid-build leaves no partial deal in the cart",
        assertCartEmpty
      );

      await allure.step(
        "complete it: one Add, the deal is in the cart",
        async () => {
          await deals.gotoBuilder(restaurantId, bogo.dealId);
          await expect(deals.builderHeading(bogo.name)).toBeVisible({
            timeout: 20_000,
          });
          await deals.pickChoice(0, gyroA.name);
          await deals.pickChoice(1, gyroB.name);
          await deals.assertDealComplete();
          await deals.addDealToCart();
          await deals.viewCartButton().click();
          await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
          await expect(deals.dealSummaryRow(bogo.name)).toBeVisible({
            timeout: 15_000,
          });
          await expect(deals.completeDealsToContinueButton()).toHaveCount(0);
        }
      );
    });
  });
});
