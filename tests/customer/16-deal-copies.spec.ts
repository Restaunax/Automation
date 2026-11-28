/**
 * 16-deal-copies.spec.ts — several copies of one deal on the template-wind
 * storefront, its limit per order, and "Your cart qualifies for …".
 *
 * Spec: restaunax docs/features/DEAL_COPIES_AND_LATE_PROMOTIONS.md (Parts 1,
 * 2 and 4). Template-wind feat/deal-copies-late-promotions: every Add is a NEW
 * cart entry, the bar offers "Add another" after an Add, the cart's Edit opens
 * THAT entry (?entry=), and Remove drops only that copy. The order payload is
 * unchanged: one orderDeals[] item per entry.
 *
 * Gated (utils/releaseGate.ts, tag @deal-copies): RELEASED_ON_QA.dealCopiesWind
 * for the storefront (probe: "Add another" after an Add), and
 * RELEASED_ON_QA.dealCopies for the backend half TC-2116 / TC-2117 need
 * (maxPerOrder on the deal, dealSuggestions on the quote). Until each is on
 * QA the tests skip with the reason; flip the flags once they are.
 *
 * Own data on the SEED restaurant (the storefront is pinned to it), seeded by
 * seedStorefrontPromotions with the label "Wind Copies" and no free-item
 * offer (only 10-promotions may run that). The deal is the storefront BOGO
 * ("buy a gyro, get the 2nd for $1.99", both steps "gyro A or gyro B"),
 * created per test and deleted in its finally (withStorefrontBogo), so the
 * file never holds a deal slot between tests.
 *
 *   TC-2114 Add, then Add another with different picks: the cart holds two
 *           entries and the quote carries two orderDeals, each with its own
 *           picks.
 *   TC-2115 Edit one copy (?entry=, opens pre-filled), change a pick: the
 *           other copy is untouched; Remove one copy leaves the other.
 *   TC-2116 limit per order 1: "Limit 1 per order" on the builder; after an
 *           Add, Add another is disabled and the limit is said.
 *   TC-2117 checkout offers the deal the cart's à-la-carte gyros fill, with
 *           the quote's savings; Apply turns them into the deal.
 *
 * Not automated: the cart drawer's "cart-deal-limit" note and its disabled +
 * (the drawer is no longer reachable from /menu, whose cart button goes
 * straight to /checkout; the stepper logic is unit-tested in template-wind
 * dealCopies.test.ts).
 */

import * as allure from "allure-js-commons";
import { type Page } from "@playwright/test";
import { test, expect } from "../../fixtures/base";
import { createCustomerDealPage } from "../../pages/customer/CustomerDealPage";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import {
  apiLogin,
  updateDealRaw,
  DEAL_SLOT_TEST_TIMEOUT_MS,
} from "../../utils/apiHelper";
import {
  cleanupStorefrontPromotions,
  seedStorefrontPromotions,
  withStorefrontBogo,
  type StorefrontBogo,
  type StorefrontDealContext,
  type StorefrontPromotionSet,
} from "../../utils/promotionFixtures";
import { isQuoteResponse, trackQuotes } from "../../utils/quoteTracker";
import { probeDealCopies, requireRelease } from "../../utils/releaseGate";
import type { DealSuggestion } from "../../utils/dealCopiesApi";
import { generateRunId, readRestaurantId } from "../../utils/testData";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const money = (n: number) => `$${n.toFixed(2)}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The deal lines of a page quote request, as picked menu item ids. */
interface SentDeal {
  dealId: string;
  items?: { menuItemId: string }[];
  orderDealItems?: { menuItemId: string }[];
}
const picksOf = (d: SentDeal): string[] =>
  (d.items ?? d.orderDealItems ?? []).map((i) => i.menuItemId).sort();

test.describe("Storefront — deal copies (template-wind) @deal-copies", () => {
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

  test.beforeAll(async () => {
    if (!TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readRestaurantId();
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));
    set = await seedStorefrontPromotions(token, restaurantId, runId, created, {
      label: "Wind Copies",
      withFreeItem: false,
    });
  });

  test.afterAll(async () => {
    if (!token) return;
    const failures = await cleanupStorefrontPromotions(token, created);
    // A leaked deal holds one of the seed restaurant's 10 active slots for
    // every other file: fail loudly rather than log.
    expect(failures, "storefront promotions cleanup").toEqual([]);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Deal copies");
    await allure.label("severity", "critical");
  });

  /** Open the builder, pick `buy` / `get`, Add. Returns once Keep shopping shows. */
  const buildCopy = async (
    page: Page,
    bogo: StorefrontBogo,
    buy: string,
    get: string,
    { open = true }: { open?: boolean } = {}
  ) => {
    const deals = createCustomerDealPage(page);
    if (open) await deals.gotoBuilder(restaurantId, bogo.dealId);
    await expect(deals.builderHeading(bogo.name)).toBeVisible({
      timeout: 20_000,
    });
    await deals.pickChoice(0, buy);
    await deals.pickChoice(1, get);
    await deals.assertDealComplete();
    await deals.addDealToCart();
  };

  /** Gate on the storefront: "Add another" shows after an Add. */
  const requireWindCopies = async (page: Page) => {
    const deals = createCustomerDealPage(page);
    await expect(deals.keepShoppingButton()).toBeVisible();
    requireRelease(
      "dealCopiesWind",
      (await deals.addAnotherButton().count()) > 0
    );
  };

  /** Two copies: (A, A), then Add another → (B, B). Ends on the builder. */
  const buildTwoCopies = async (page: Page, bogo: StorefrontBogo) => {
    const deals = createCustomerDealPage(page);
    const { gyroA, gyroB } = set.items;
    await buildCopy(page, bogo, gyroA.name, gyroA.name);
    await requireWindCopies(page);
    await deals.addAnotherButton().click();
    // A fresh builder: nothing picked, the Add is back.
    await expect(deals.stepStatus(0)).toHaveText("Required");
    await expect(deals.keepShoppingButton()).toHaveCount(0);
    await buildCopy(page, bogo, gyroB.name, gyroB.name, { open: false });
  };

  /** View Cart → /checkout, with the page's quotes tracked from the click. */
  const viewCart = async (page: Page) => {
    const deals = createCustomerDealPage(page);
    const quotes = trackQuotes(page);
    await deals.viewCartButton().click();
    await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
    return quotes;
  };

  test("TC-2114: Add, then Add another with different picks — two cart entries, two orderDeals each with its own picks", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const deals = createCustomerDealPage(page);
      const { gyroA, gyroB } = set.items;
      await allure.step("build two copies", () => buildTwoCopies(page, bogo));
      const quotes = await viewCart(page);
      await expect(deals.dealSummaryRow(bogo.name)).toHaveCount(2, {
        timeout: 15_000,
      });
      await expect(deals.partOfDealLabels()).toHaveCount(4);
      const latest = await quotes.latest();
      const sent = (latest.request.orderDeals ?? []) as SentDeal[];
      expect(sent.filter((d) => d.dealId === bogo.dealId)).toHaveLength(2);
      expect(sent.map(picksOf).sort()).toEqual(
        [
          [gyroA.id, gyroA.id],
          [gyroB.id, gyroB.id],
        ].sort()
      );
      // The server prices both copies.
      expect(
        (latest.body.quote?.deals ?? []).filter((d) => d.dealId === bogo.dealId)
      ).toHaveLength(2);
    });
  });

  test("TC-2115: Edit one copy changes only that copy; Remove one copy leaves the other", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      const deals = createCustomerDealPage(page);
      const { gyroA, gyroB } = set.items;
      await buildTwoCopies(page, bogo);
      await viewCart(page);
      await expect(deals.dealSummaryRow(bogo.name)).toHaveCount(2, {
        timeout: 15_000,
      });

      await allure.step(
        "Edit the first copy: it opens pre-filled for THAT entry",
        async () => {
          await deals.cartDealEditButton(bogo.name).first().click();
          await expect(page).toHaveURL(
            new RegExp(`/deals/${escapeRe(bogo.dealId)}\\?(.*&)?entry=`),
            { timeout: 15_000 }
          );
          await expect(deals.builderHeading(bogo.name)).toBeVisible({
            timeout: 20_000,
          });
          await expect(deals.choiceCard(0, gyroA.name)).toHaveAttribute(
            "aria-checked",
            "true",
            { timeout: 15_000 }
          );
          await expect(deals.choiceCard(1, gyroA.name)).toHaveAttribute(
            "aria-checked",
            "true"
          );
          await deals.pickChoice(1, gyroB.name);
          await deals.assertDealComplete();
          await deals.addDealToCart();
        }
      );

      const quotes = await viewCart(page);
      await expect(deals.dealSummaryRow(bogo.name)).toHaveCount(2, {
        timeout: 15_000,
      });
      const edited = await quotes.latest();
      const afterEdit = (edited.request.orderDeals ?? []) as SentDeal[];
      expect(afterEdit.map(picksOf).sort()).toEqual(
        [[gyroA.id, gyroB.id].sort(), [gyroB.id, gyroB.id]].sort()
      );

      await allure.step("Remove the first copy: the other stays", async () => {
        // The summary and the payload both list the cart's entries in order.
        const survivor = picksOf(afterEdit[1]!);
        await deals.removeDealButtons().first().click();
        await expect(deals.dealSummaryRow(bogo.name)).toHaveCount(1, {
          timeout: 15_000,
        });
        await expect
          .poll(async () => {
            const q = await quotes.settled();
            if (typeof q === "string") return q;
            return ((q.request.orderDeals ?? []) as SentDeal[]).map(picksOf);
          })
          .toEqual([survivor]);
      });
    });
  });

  test("TC-2116: limit per order 1 — the builder says so, and after an Add 'Add another' is disabled with the limit message", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      requireRelease("dealCopies", await probeDealCopies(token, bogo.dealId));
      const capped = await updateDealRaw(token, bogo.dealId, {
        maxPerOrder: 1,
      });
      expect(capped.status, JSON.stringify(capped.data)).toBe(200);
      const deals = createCustomerDealPage(page);
      const { gyroA, gyroB } = set.items;

      await deals.gotoBuilder(restaurantId, bogo.dealId);
      await expect(deals.builderHeading(bogo.name)).toBeVisible({
        timeout: 20_000,
      });
      const shown = await deals
        .limitPerOrderNote()
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(
          () => true,
          () => false
        );
      requireRelease("dealCopiesWind", shown);
      await expect(deals.limitPerOrderNote()).toHaveText("Limit 1 per order");
      await expect(deals.limitReachedMessage()).toHaveCount(0);

      await buildCopy(page, bogo, gyroA.name, gyroB.name, { open: false });
      await expect(deals.addAnotherButton()).toBeDisabled();
      await expect(deals.limitReachedMessage()).toHaveText(
        "You've reached the limit of 1 per order."
      );
    });
  });

  test("TC-2117: checkout says 'Your cart qualifies for <deal>. Save $X.' for à-la-carte gyros that fill it, with the quote's savings; Apply turns them into the deal", async ({
    page,
  }) => {
    await withStorefrontBogo(dealCtx(), async (bogo) => {
      requireRelease("dealCopies", await probeDealCopies(token, bogo.dealId));
      const deals = createCustomerDealPage(page);
      const checkout = createCustomerCheckoutPage(page);
      const { gyroA, gyroB } = set.items;
      const quotes = trackQuotes(page);
      await checkout.seedCartItems(restaurantId, [
        { menuItemId: gyroA.id, name: gyroA.name, price: gyroA.price },
        { menuItemId: gyroB.id, name: gyroB.name, price: gyroB.price },
      ]);

      const first = await quotes.latest();
      const quoteBody = first.body.quote as
        | { dealSuggestions?: DealSuggestion[]; subtotal: number }
        | undefined;
      const suggestion = quoteBody?.dealSuggestions?.find(
        (s) => s.dealId === bogo.dealId
      );
      expect(suggestion, JSON.stringify(quoteBody)).toBeTruthy();

      const banner = deals.dealSuggestion(bogo.name);
      const shown = await banner
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(
          () => true,
          () => false
        );
      requireRelease("dealCopiesWind", shown);
      await expect(banner).toContainText(
        `Your cart qualifies for ${bogo.name}. Save ${money(suggestion!.savings)}.`
      );

      const [applied] = await Promise.all([
        page.waitForResponse(
          (r) =>
            isQuoteResponse(r) &&
            ((r.request().postDataJSON()?.orderDeals ?? []) as SentDeal[])
              .length > 0,
          { timeout: 30_000 }
        ),
        deals.dealSuggestionApply(bogo.name).click(),
      ]);
      expect(applied.ok()).toBe(true);
      await expect(deals.dealSummaryRow(bogo.name)).toHaveCount(1, {
        timeout: 15_000,
      });
      await expect(deals.partOfDealLabels()).toHaveCount(2);
      await expect(banner).toHaveCount(0);
      const after = await quotes.latest();
      const sent = (after.request.orderDeals ?? []) as SentDeal[];
      expect(sent.map(picksOf)).toEqual([[gyroA.id, gyroB.id].sort()]);
      // The gyros are billed once, through the deal.
      expect(
        (after.request.orderItems ?? []).filter((i) =>
          [gyroA.id, gyroB.id].includes(i.menuItemId)
        )
      ).toEqual([]);
      expect(after.body.quote?.subtotal).toBeCloseTo(
        (quoteBody?.subtotal ?? NaN) - suggestion!.savings,
        2
      );
    });
  });
});
