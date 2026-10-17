/**
 * 14-promotions.spec.ts — Promotions on the template-lima embedded ordering
 * storefront (spec: restaunax docs/features/PROMOTIONS.md → "Clients as built
 * (plan 3)" → Storefronts): what the customer sees, and what the server
 * prices and stores.
 *
 * Own data on the SEED restaurant (the slug's tenant), seeded through the API
 * in beforeAll by the same seedStorefrontPromotions the wind spec uses
 * (tests/customer/10-promotions), labelled "Lima": a per-run
 * "Automation Menu Promo Lima <id>" category with six items, a 50% automatic
 * sale scoped to one of them and a 15%-off-$30+ order code. NO free item: a
 * spend-triggered gift offers itself to every cart over its threshold, so
 * only the wind file runs one (two would compete for each other's carts).
 * The two deals — a "2nd gyro for $1.99" BOGO with item options (menu + code)
 * and a CODE-only combo — are created inside the tests that use them
 * (cap-safe) and deleted in that test's finally, so the file holds at most one
 * ACTIVE deal slot, and only while a test runs — see TEST_PLAN.md's footprint
 * table. The rest is deleted in afterAll (each delete checked; a failed one
 * fails the hook), and globalTeardown's AUTO / "Automation Menu" sweeps backstop an
 * interrupted run.
 *
 * Lima's code box is on the CART; the server quote, promotion line and Pay
 * total are on CHECKOUT. TC-L70 places ONE real Stripe test-card order (the
 * plan's one lima order). Every other money check reads the page's own /quote
 * or the API's.
 */

import * as allure from "allure-js-commons";
import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaDealPage } from "../../pages/lima/LimaDealPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import {
  apiLogin,
  getOrderByIdRaw,
  DEAL_SLOT_TEST_TIMEOUT_MS,
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
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import {
  generateRunId,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const money = (n: number) => `$${n.toFixed(2)}`;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("Lima — Promotions", () => {
  const restaurantSlug = readRestaurantSlug();
  test.skip(
    !restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD,
    "Ordering slug not seeded, or OWNER_EMAIL / OWNER_PASSWORD missing"
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

  test.beforeAll(async () => {
    if (!restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readSharedState().restaurantId;
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));
    set = await seedStorefrontPromotions(token, restaurantId, runId, created, {
      label: "Lima",
      withFreeItem: false,
    });
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

  /** Menu → open each item → Add to Cart (once per unit), then the cart page. */
  const reachCartWith = async (page: Page, items: SeededItem[]) => {
    const lima = createLimaStorefrontPage(page);
    const checkout = createLimaCheckoutPage(page);
    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    for (const item of items) {
      await expect(lima.itemCard(item.name)).toBeVisible({ timeout: 30_000 });
      await lima.itemCard(item.name).click();
      await expect(lima.addToCartButton()).toBeEnabled({ timeout: 20_000 });
      await lima.clickAddToCart();
      await expect(lima.addToCartButton()).toBeHidden({ timeout: 15_000 });
    }
    await lima.cartButton().click();
    await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
      timeout: 15_000,
    });
    await expect(checkout.proceedToCheckoutButton()).toBeVisible({
      timeout: 20_000,
    });
    return { lima, checkout };
  };

  /** Enter a code in the cart's code box; resolves with redeem-code's status. */
  const applyCodeOnCart = async (page: Page, code: string) => {
    const checkout = createLimaCheckoutPage(page);
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/promotions/redeem-code") &&
          r.request().method() === "POST",
        { timeout: 20_000 }
      ),
      checkout.applyCoupon(code),
    ]);
    return res.status();
  };

  /** A quote whose request carries this coupon id. */
  const quoteWithCoupon =
    (couponId: string) => (r: Parameters<typeof isQuoteResponse>[0]) =>
      isQuoteResponse(r) &&
      (r.request().postDataJSON() as PageQuote["request"]).couponId ===
        couponId;

  /** A quote whose request carries this deal. */
  const quoteWithDeal =
    (dealId: string) => (r: Parameters<typeof isQuoteResponse>[0]) =>
      isQuoteResponse(r) &&
      (
        (r.request().postDataJSON() as PageQuote["request"]).orderDeals ?? []
      ).some((d) => d.dealId === dealId);

  test("TC-L64: an automatic sale shows on the Lima menu card — struck regular price, the sale price and the sale's label, exactly as the public menu prices it", async ({
    page,
  }) => {
    const lima = createLimaStorefrontPage(page);
    const sale = set.items.saleItem;
    const served = await allure.step("public menu carries the sale", () =>
      publicMenuItem(restaurantId, sale.id)
    );
    expect(served?.promotion, JSON.stringify(served)).toBeTruthy();
    const { salePrice, label } = served!.promotion!;
    expect(salePrice).toBe(STOREFRONT_PRICES.saleItem / 2);

    await allure.step("menu card shows it", async () => {
      await lima.gotoMenu(restaurantSlug);
      await lima.assertOnMenu();
      const card = lima.itemCard(sale.name);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(lima.cardRegularPrice(sale.name)).toHaveText(
        money(sale.price)
      );
      await expect(lima.cardRegularPrice(sale.name)).toHaveCSS(
        "text-decoration-line",
        "line-through"
      );
      await expect(card).toContainText(money(salePrice));
      await expect(lima.cardSaleLabel(sale.name)).toHaveText(label);
    });

    await allure.step(
      "an item outside the sale has no sale price or label",
      async () => {
        const platter = set.items.platter;
        await expect(lima.itemCard(platter.name)).toContainText(
          money(platter.price)
        );
        await expect(lima.cardRegularPrice(platter.name)).toHaveCount(0);
        await expect(lima.cardSaleLabel(platter.name)).toHaveCount(0);
      }
    );
  });

  test("TC-L65: the Lima BOGO builder offers each step's options as radios ('Required' → '✓ Done'); two picks, then one Add, show the deal's server price, and checkout quotes the deal at it", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const deals = createLimaDealPage(page);
      const checkout = createLimaCheckoutPage(page);
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
        await deals.gotoBuilder(restaurantSlug, bogo.dealId);
        await expect(deals.builderHeading(bogo.name)).toBeVisible({
          timeout: 20_000,
        });
        await expect(deals.choiceSlots()).toHaveCount(2);
        for (const slot of [0, 1]) {
          for (const item of [gyroA, gyroB]) {
            const card = deals.choiceCard(slot, item.name);
            await expect(card).toBeVisible();
            await expect(card).toHaveAttribute("aria-checked", "false");
          }
        }
        await expect(deals.stepStatus(0)).toHaveText("Required");
        await deals.assertProgress(0, 2);
      });

      await allure.step("pick one option per slot", async () => {
        await deals.pickChoice(0, gyroA.name);
        await deals.assertProgress(1, 2);
        await expect(deals.choiceCard(0, gyroA.name)).toHaveAttribute(
          "aria-checked",
          "true"
        );
        await expect(deals.stepStatus(0)).toHaveText("✓ Done");
        await deals.pickChoice(1, gyroB.name);
        await deals.assertDealComplete();
        await expect(deals.progressDealPrice()).toHaveText(money(dealPrice!));
      });

      await allure.step("checkout quotes the deal at that price", async () => {
        await deals.addDealToCart();
        await deals.viewCartButton().click();
        await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
          timeout: 15_000,
        });
        await expect(page.getByText(bogo.name).first()).toBeVisible({
          timeout: 15_000,
        });
        const [quoteRes] = await Promise.all([
          page.waitForResponse(quoteWithDeal(bogo.dealId), {
            timeout: 30_000,
          }),
          checkout.goToCheckout(),
        ]);
        const quote = await readQuote(quoteRes);
        expect(
          quote.body.quote?.deals?.find((d) => d.dealId === bogo.dealId)
            ?.dealPrice
        ).toBe(dealPrice);
      });
    });
  });

  test("TC-L66: the order code entered on the cart shows at checkout as the promotion's title and savings; the Total is the page's latest /quote amountToCharge", async ({
    page,
  }) => {
    const quotes = trackQuotes(page);
    const { checkout } = await reachCartWith(page, [
      set.items.platter,
      set.items.platter,
    ]);
    expect(await applyCodeOnCart(page, set.orderCode.code)).toBe(200);
    // Applied on the cart, priced at checkout (the cart has no quote).
    await expect(checkout.appliedCodeChip(set.orderCode.code)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Savings shown at checkout")).toBeVisible();

    const [codeQuoteRes] = await Promise.all([
      page.waitForResponse(quoteWithCoupon(set.orderCode.id), {
        timeout: 30_000,
      }),
      checkout.goToCheckout(),
    ]);
    const codeQuote = (await readQuote(codeQuoteRes)).body.quote!;
    // Acceptance set: 15% of $40 = $6, capped at $4.50.
    expect(codeQuote.appliedPromotion).toMatchObject({
      couponId: set.orderCode.id,
      title: set.orderCode.name,
      savings: 4.5,
    });

    await expect(checkout.promotionLine(set.orderCode.name)).toContainText(
      "-$4.50",
      { timeout: 20_000 }
    );
    await expect(checkout.codeRow(set.orderCode.code)).toContainText(
      "Saving $4.50"
    );
    await expectShownMatchesLatestQuote(checkout.readTotal, quotes);
    const latest = await quotes.latest();
    expect(latest.request.couponId, "the latest quote is for the code").toBe(
      set.orderCode.id
    );
  });

  test("TC-L67: a bundle code opens its deal builder on Lima — from the cart's code box and from a ?promo= link", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const lima = createLimaStorefrontPage(page);
      const deals = createLimaDealPage(page);
      const builderUrl = new RegExp(
        `/${restaurantSlug}/deal/${bogo.dealId}\\?code=${escapeRegExp(bogo.code)}`
      );

      await allure.step("cart code box", async () => {
        await reachCartWith(page, [set.items.platter]);
        expect(await applyCodeOnCart(page, bogo.code)).toBe(200);
        await expect(page).toHaveURL(builderUrl, { timeout: 20_000 });
        await expect(deals.builderHeading(bogo.name)).toBeVisible({
          timeout: 20_000,
        });
      });

      await allure.step("?promo= link", async () => {
        await lima.gotoMenu(restaurantSlug, `?promo=${bogo.code}`);
        await expect(page).toHaveURL(builderUrl, { timeout: 20_000 });
        await expect(deals.builderHeading(bogo.name)).toBeVisible({
          timeout: 20_000,
        });
      });
    });
  });

  test("TC-L68: Keep shopping after adding a deal lands on the Lima menu with '<deal> added to your cart' — once — and the deal is in the cart", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const lima = createLimaStorefrontPage(page);
      const deals = createLimaDealPage(page);
      const expected = `${bogo.name} added to your cart`;

      await allure.step("complete the deal → Add → Keep shopping", async () => {
        await deals.gotoBuilder(restaurantSlug, bogo.dealId);
        await expect(deals.builderHeading(bogo.name)).toBeVisible({
          timeout: 20_000,
        });
        // Only an added deal offers it.
        await expect(deals.keepShoppingButton()).toHaveCount(0);
        await deals.pickChoice(0, set.items.gyroA.name);
        await deals.pickChoice(1, set.items.gyroB.name);
        await deals.assertDealComplete();
        // Complete is not added: Keep shopping appears only after the Add.
        await expect(deals.keepShoppingButton()).toHaveCount(0);
        await deals.addDealToCart();
        await deals.keepShoppingButton().click();
        await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/menu`), {
          timeout: 15_000,
        });
        // The Snackbar auto-hides after 3 s: assert it inside that window.
        await expect(lima.dealAddedConfirmation()).toHaveText(expected, {
          timeout: 2_500,
        });
      });

      await allure.step("a refresh does not show it again", async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(lima.itemCard(set.items.platter.name)).toBeVisible({
          timeout: 30_000,
        });
        await expect(lima.dealAddedConfirmation()).toHaveCount(0);
      });

      await allure.step("the cart holds the deal", async () => {
        await lima.cartButton().click();
        await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
          timeout: 15_000,
        });
        await expect(page.getByText(bogo.name).first()).toBeVisible({
          timeout: 15_000,
        });
      });
    });
  });

  test("TC-L69: a deal with upgrade picks shows Items, Upgrades (itemised, incl. the size choice) and Subtotal at Lima checkout — Items + Upgrades = Subtotal = the quote's", async ({
    page,
  }) => {
    await withStorefrontCombo(dealCtx(), async (combo) => {
      const lima = createLimaStorefrontPage(page);
      const deals = createLimaDealPage(page);
      const checkout = createLimaCheckoutPage(page);
      const { platter, burger } = set.items;
      const P = STOREFRONT_PRICES;

      await deals.gotoBuilder(restaurantSlug, combo.dealId, combo.code);
      await expect(deals.builderHeading(combo.name)).toBeVisible({
        timeout: 20_000,
      });
      await deals.openIncompleteSlot(platter.name);
      await deals.clickAddToDeal();
      await deals.openIncompleteSlot(burger.name);
      await lima.modifierOption(`Large ${runId}`).check();
      await lima.modifierOption(`Bacon ${runId}`).check();
      await deals.clickAddToDeal();
      await deals.assertDealComplete();
      await deals.addDealToCart();
      await deals.viewCartButton().click();
      await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
        timeout: 15_000,
      });

      const [quoteRes] = await Promise.all([
        page.waitForResponse(quoteWithDeal(combo.dealId), {
          timeout: 30_000,
        }),
        checkout.goToCheckout(),
      ]);
      const quote = (await readQuote(quoteRes)).body.quote!;
      const upcharge = quote.deals?.find(
        (d) => d.dealId === combo.dealId
      )?.upcharge;
      // Large replaces Regular ($15 − $12) + Bacon $1.50.
      expect(upcharge).toBe(P.burgerLarge - P.burger + P.bacon);

      await expect(checkout.summaryItemsRow()).toBeVisible({ timeout: 15_000 });
      const items = await checkout.readMoney(checkout.summaryItemsRow());
      const upgrades = await checkout.readMoney(checkout.summaryUpgradesRow());
      const subtotal = await checkout.readMoney(checkout.summarySubtotalRow());
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

  test("TC-L70: paying on Lima with the order code records the code's promotion, the quoted savings and the Total shown before paying", async ({
    page,
  }) => {
    const quotes = trackQuotes(page);
    const { checkout } = await reachCartWith(page, [
      set.items.platter,
      set.items.platter,
    ]);
    expect(await applyCodeOnCart(page, set.orderCode.code)).toBe(200);
    await checkout.goToCheckout();
    await checkout.assertPickupSelected();
    await checkout.fillCustomerInfo({
      firstName: "Promo",
      lastName: "Lima",
      email: generateUserEmail("limapromo"),
      phone: generateSeedPhone(),
    });
    await expect(checkout.promotionLine(set.orderCode.name)).toContainText(
      "-$4.50",
      { timeout: 20_000 }
    );
    await checkout.proceedToPayment();

    const payTotal = await expectShownMatchesLatestQuote(
      checkout.readTotal,
      quotes
    );
    const latest = await quotes.latest();
    const quoted = latest.body.quote!;
    expect(latest.request.couponId).toBe(set.orderCode.id);
    expect(quoted.amountToCharge).toBe(payTotal);
    await allure.parameter("pay total", money(payTotal));

    await fillStripePaymentElement(page, STRIPE_CARDS.VISA_SUCCESS);
    await checkout.placeOrder();
    await checkout.assertOrderConfirmed();
    const orderId =
      page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(orderId, `order id from ${page.url()}`).toBeTruthy();
    expect(page.url()).toContain(`/${restaurantSlug}/order-confirmation/`);
    await allure.parameter("orderId", orderId);

    const order = await getOrderByIdRaw(token, orderId);
    expect(order.status, JSON.stringify(order.data)).toBe(200);
    expect(order.data.couponId).toBe(set.orderCode.id);
    expect(order.data.discountAmount).toBe(quoted.appliedPromotion!.savings);
    expect(order.data.total).toBe(payTotal);
  });
});
