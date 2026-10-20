/**
 * quoteTracker.ts — the storefronts' own POST /api/order/:restaurantId/quote,
 * read off the page's network (template-wind and template-lima both price the
 * cart through it; PROMOTIONS.md → "Clients as built (plan 3)": checkout
 * totals, promotion lines and the Pay amount come from `/quote`).
 *
 * Shared by tests/customer/10-promotions and tests/customer-lima/14-promotions
 * so the two storefronts compare the screen with the server the same way.
 */

import { expect, type Page, type Response } from "@playwright/test";
import type { ApiBreakdown } from "./orderBreakdown";

/** The parts of the page's POST /quote the tests read. */
export interface PageQuote {
  request: {
    couponId?: string | null;
    orderItems?: { menuItemId: string; quantity: number }[];
    orderDeals?: { dealId: string; quantity: number; code?: string }[];
  };
  body: {
    quote?: {
      subtotal: number;
      amountToCharge: number;
      appliedPromotion?: {
        couponId: string;
        title: string;
        savings: number;
      } | null;
      freeItemOffer?: { menuItemId: string; name: string } | null;
      deals?: { dealId: string; dealPrice: number; upcharge: number }[];
      /** The money breakdown the checkout renders (ORDER_MONEY_BREAKDOWN.md). */
      breakdown?: ApiBreakdown;
    };
    issues?: { code?: string; severity: string; message?: string }[];
  };
}

export const isQuoteResponse = (r: Response): boolean =>
  /\/api\/order\/[^/]+\/quote$/.test(r.url()) &&
  r.request().method() === "POST" &&
  r.status() === 200;

export const readQuote = async (r: Response): Promise<PageQuote> => ({
  request: r.request().postDataJSON() as PageQuote["request"],
  body: (await r.json()) as PageQuote["body"],
});

export interface QuoteTracker {
  /** The most recent successful /quote (fails if there has been none). */
  latest: () => Promise<PageQuote>;
}

/**
 * Records every successful /quote the page makes, in response order, so a
 * test can compare the screen with the LATEST quote (the summary re-quotes
 * when the cart, code or tip changes).
 */
export const trackQuotes = (page: Page): QuoteTracker => {
  const seen: Promise<PageQuote | null>[] = [];
  page.on("response", (r) => {
    if (!isQuoteResponse(r)) return;
    // The body can be gone if the page navigated away first: skip that one.
    seen.push(readQuote(r).catch(() => null));
  });
  return {
    latest: async (): Promise<PageQuote> => {
      const all = (await Promise.all(seen)).filter(
        (q): q is PageQuote => q !== null
      );
      expect(all.length, "the page made at least one /quote").toBeGreaterThan(
        0
      );
      return all[all.length - 1]!;
    },
  };
};

/**
 * Polls until the amount on screen equals the LATEST quote's amountToCharge.
 * Both sides are re-read on every attempt: a re-quote that lands while the
 * poll runs moves the target too (a value read once before polling can be
 * stale by the time the screen settles). Returns the matched amount.
 */
export const expectShownMatchesLatestQuote = async (
  readShown: () => Promise<number | null>,
  quotes: QuoteTracker,
  timeout = 15_000
): Promise<number> => {
  let matched = NaN;
  await expect
    .poll(
      async () => {
        const shown = await readShown();
        const charge = (await quotes.latest()).body.quote?.amountToCharge;
        if (shown !== null && shown === charge) {
          matched = shown;
          return "match";
        }
        return `shown ${shown} vs latest quote amountToCharge ${charge}`;
      },
      { timeout }
    )
    .toBe("match");
  return matched;
};
