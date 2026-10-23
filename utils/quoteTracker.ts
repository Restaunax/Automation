/**
 * quoteTracker.ts — the storefronts' own POST /api/order/:restaurantId/quote,
 * read off the page's network (template-wind and template-lima both price the
 * cart through it; PROMOTIONS.md → "Clients as built (plan 3)": checkout
 * totals, promotion lines and the Pay amount come from `/quote`).
 *
 * Shared by tests/customer/10-promotions and tests/customer-lima/14-promotions
 * so the two storefronts compare the screen with the server the same way.
 */

import {
  expect,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
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
      deals?: {
        dealId: string;
        dealPrice: number;
        upcharge: number;
        /** Per-bundle savings (pricingEngine dealUnitSavings). */
        savings: number;
      }[];
      /** The money breakdown the checkout renders (ORDER_MONEY_BREAKDOWN.md). */
      breakdown?: ApiBreakdown;
    };
    issues?: { code?: string; severity: string; message?: string }[];
  };
}

const QUOTE_PATH = /\/api\/order\/[^/]+\/quote$/;

/** A POST /quote the page sent (any outcome). */
export const isQuoteRequest = (r: Request): boolean =>
  QUOTE_PATH.test(r.url()) && r.method() === "POST";

export const isQuoteResponse = (r: Response): boolean =>
  isQuoteRequest(r.request()) && r.status() === 200;

export const readQuote = async (r: Response): Promise<PageQuote> => ({
  request: r.request().postDataJSON() as PageQuote["request"],
  body: (await r.json()) as PageQuote["body"],
});

/** How long `latest()` waits for the page's quoting to settle by default. */
export const QUOTE_SETTLE_TIMEOUT_MS = 15_000;

export interface QuoteTracker {
  /**
   * The quote the screen should be showing: waits (bounded) until no /quote
   * is in flight and at least one has come back 200, then returns the one
   * whose REQUEST was sent last. Fails with the reason if that never happens.
   */
  latest: (timeout?: number) => Promise<PageQuote>;
  /**
   * Non-waiting read of the same thing: the latest quote when settled, or a
   * human-readable reason it is not (for use inside a caller's own poll).
   */
  settled: () => Promise<PageQuote | string>;
}

/**
 * Tracks every POST /quote the page makes from the moment its REQUEST goes
 * out, not only once a response arrives. Recording responses alone left two
 * races: `latest()` failed outright when the first quote had not come back
 * yet, and a re-quote still in flight was invisible, so a check could pass
 * against the stale quote before it.
 *
 * "Latest" is by request order: both storefronts discard a superseded quote's
 * response (template-lima useOrderQuote, template-wind useOrderQuote), so the
 * screen shows the newest REQUEST's answer even if an older one lands later.
 */
export const trackQuotes = (page: Page): QuoteTracker => {
  let sent = 0;
  const inFlight = new Map<Request, number>();
  const done: { seq: number; quote: Promise<PageQuote | null> }[] = [];

  page.on("request", (req) => {
    if (isQuoteRequest(req)) inFlight.set(req, ++sent);
  });
  page.on("requestfinished", (req) => {
    const seq = inFlight.get(req);
    if (seq === undefined) return;
    // Stays "in flight" until its body is read, so a settled tracker never
    // has a half-read quote. Non-200s and unreadable bodies (the page
    // navigated away) count as finished but are not a quote.
    const quote = req
      .response()
      .then((r) => (r && isQuoteResponse(r) ? readQuote(r) : null))
      .catch(() => null);
    done.push({ seq, quote });
    void quote.finally(() => inFlight.delete(req));
  });
  page.on("requestfailed", (req) => {
    inFlight.delete(req);
  });

  const settled = async (): Promise<PageQuote | string> => {
    if (inFlight.size > 0)
      return `${inFlight.size} /quote request(s) in flight`;
    const quotes = await Promise.all(
      done.map(async (d) => ({ seq: d.seq, quote: await d.quote }))
    );
    const ok = quotes.filter(
      (q): q is { seq: number; quote: PageQuote } => q.quote !== null
    );
    if (ok.length === 0) {
      return sent === 0
        ? "the page has not sent a /quote yet"
        : `none of the page's ${sent} /quote request(s) came back 200`;
    }
    return ok.reduce((a, b) => (b.seq > a.seq ? b : a)).quote;
  };

  return {
    settled,
    latest: async (timeout = QUOTE_SETTLE_TIMEOUT_MS): Promise<PageQuote> => {
      let result: PageQuote | undefined;
      await expect
        .poll(
          async () => {
            const s = await settled();
            if (typeof s === "string") return s;
            result = s;
            return "settled";
          },
          {
            message: "the page's /quote settles (none in flight, one 200)",
            timeout,
          }
        )
        .toBe("settled");
      return result!;
    },
  };
};

/**
 * Polls until the amount on screen equals the LATEST quote's amountToCharge,
 * with no /quote in flight. Both sides are re-read on every attempt: a
 * re-quote that starts or lands while the poll runs moves the target too, and
 * a match against a quote that is about to be superseded does not count.
 * Covers "no quote has come back yet" as well, so callers need no ad-hoc wait
 * for the first quote. Returns the matched amount.
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
        const latest = await quotes.settled();
        if (typeof latest === "string") return latest;
        const shown = await readShown();
        const charge = latest.body.quote?.amountToCharge;
        // Re-check after reading the screen: a re-quote that went out in
        // between makes this match stale.
        if (shown !== null && shown === charge) {
          const still = await quotes.settled();
          if (still === latest) {
            matched = shown;
            return "match";
          }
          return "a re-quote started while reading the screen";
        }
        return `shown ${shown} vs latest quote amountToCharge ${charge}`;
      },
      { timeout }
    )
    .toBe("match");
  return matched;
};
