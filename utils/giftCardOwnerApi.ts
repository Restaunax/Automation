/**
 * giftCardOwnerApi.ts — wrappers and pure helpers for the owner gift card
 * specs (RestauNax feat/owner-gift-cards: plans A + B + web).
 *
 * Owner routes live under `/api/gift-cards/restaurants/:rid/...` (one
 * restaurant) and `/api/gift-cards/groups/:gid/...` (a chain). The POS uses
 * `/api/tablet/gift-cards/...`. Refusals carry both `code` and `errorCode`.
 * Money is dollars (Float); compare in cents.
 */
import {
  BACKEND_URL,
  apiLogin,
  apiRequestRaw,
  getGiftCardConfigAdminRaw,
  putGiftCardConfigAdminRaw,
  type GiftCardConfigFull,
  stripeConfigRaw,
  stripePublicRaw,
  tabletRaw,
  type LooseJson,
  type RawResponse,
} from "./apiHelper";
import { expect } from "../fixtures/base";
import { readRestaurantId } from "./testData";

export type Scope = { restaurantId: string } | { groupId: string };

type Rec = Record<string, LooseJson>;

/** The `data` of a `{ success, data }` body (an empty object when absent). */
export const dataOf = (body: unknown): Rec =>
  ((body as Rec | undefined)?.data ?? {}) as Rec;

/** Dollars as the web dashboard shows them (dailyReport/shared.tsx `usd`). */
export const usd = (n: number): string =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** A card code without separators, upper-cased: compare codes with this. */
export const sanitizeCode = (s: string): string =>
  s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const scopePrefix = (scope: Scope): string =>
  "restaurantId" in scope
    ? `/api/gift-cards/restaurants/${scope.restaurantId}`
    : `/api/gift-cards/groups/${scope.groupId}`;

const scopeHeaders = (
  scope: Scope,
  lang?: "en" | "es"
): Record<string, string> => ({
  ...("restaurantId" in scope ? { "X-Restaurant-Id": scope.restaurantId } : {}),
  ...(lang ? { "Accept-Language": lang } : {}),
});

/** Any owner gift card call for a restaurant or a chain. */
export function ownerGiftCardRaw<T = LooseJson>(
  token: string,
  scope: Scope,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  lang?: "en" | "es"
): Promise<RawResponse<T>> {
  const headers = scopeHeaders(scope, lang);
  return apiRequestRaw<T>(
    method,
    `${scopePrefix(scope)}${path}`,
    body,
    token,
    Object.keys(headers).length ? headers : undefined
  );
}

/** Path of the CSV export for a scope: `<prefix>/export.csv` + query. */
export const csvExportPath = (scope: Scope, query = ""): string =>
  `${scopePrefix(scope)}/export.csv${query}`;

/** The CSV export (text, not JSON): status, headers and the raw body. */
export async function ownerGiftCardCsvRaw(
  token: string,
  scope: Scope,
  query = ""
): Promise<{ status: number; headers: Headers; text: string }> {
  const res = await fetch(`${BACKEND_URL}${csvExportPath(scope, query)}`, {
    headers: { Authorization: `Bearer ${token}`, ...scopeHeaders(scope) },
  });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

/** Any POS gift card call: `/api/tablet/gift-cards{path}`. */
export function tabletGiftCardRaw<T = LooseJson>(
  tablet: string,
  session: string | undefined,
  method: "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<RawResponse<T>> {
  return tabletRaw<T>(tablet, method, `/gift-cards${path}`, body, session);
}

/**
 * Buy a card online the way a guest's browser does: PaymentIntent from the
 * backend, confirmed through Stripe's publishable key with a test token, then
 * `/api/gift-cards/purchase` with the client secret (so the code is revealed
 * even when the webhook minted the card first). `tok_createDispute` makes the
 * charge dispute itself a few seconds later.
 */
export async function buyGiftCardOnline(
  pk: string,
  restaurantId: string,
  amount: number,
  opts: {
    cardToken?: "tok_visa" | "tok_createDispute";
    recipientEmail?: string;
  } = {}
): Promise<{ code: string; giftCardId: string; paymentIntentId: string }> {
  const publishableKey =
    pk || String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
  const intent = await apiRequestRaw<{ clientSecret?: string }>(
    "POST",
    "/api/stripe/gift-card-payment-intent",
    {
      amount,
      restaurantId,
      deliveryMethod: opts.recipientEmail ? "EMAIL" : "LINK",
      recipientEmail: opts.recipientEmail,
    }
  );
  expect(
    intent.status,
    `gift-card-payment-intent: ${JSON.stringify(intent.data)}`
  ).toBe(200);
  const clientSecret = String(intent.data.clientSecret ?? "");
  const paymentIntentId = clientSecret.split("_secret_")[0] ?? "";
  expect(paymentIntentId, "clientSecret carries the intent id").toMatch(/^pi_/);

  const pm = await stripePublicRaw(publishableKey, "POST", "/payment_methods", {
    type: "card",
    "card[token]": opts.cardToken ?? "tok_visa",
  });
  expect(pm.status, JSON.stringify(pm.data)).toBe(200);
  const confirmed = await stripePublicRaw(
    publishableKey,
    "POST",
    `/payment_intents/${paymentIntentId}/confirm`,
    { client_secret: clientSecret, payment_method: String(pm.data.id) }
  );
  expect(confirmed.status, JSON.stringify(confirmed.data)).toBe(200);

  const purchase = await apiRequestRaw<{
    data?: { id?: string; code?: string };
  }>("POST", "/api/gift-cards/purchase", {
    paymentIntentClientSecret: clientSecret,
    stripePaymentIntentId: paymentIntentId,
    amount,
    restaurantId,
    deliveryMethod: opts.recipientEmail ? "EMAIL" : "LINK",
    recipientEmail: opts.recipientEmail,
  });
  // 201 on a fresh mint, 200 when the webhook minted the card first.
  expect(
    [200, 201],
    `purchase ${purchase.status}: ${JSON.stringify(purchase.data)}`
  ).toContain(purchase.status);
  const card = purchase.data.data ?? {};
  expect(card.id, "purchase returns the card id").toBeTruthy();
  expect(card.code, "purchase reveals the code").toBeTruthy();
  return {
    code: String(card.code),
    giftCardId: String(card.id),
    paymentIntentId,
  };
}

/** The masked shape every owner/tablet surface shows: ****-****-****-AB12. */
export const isMaskedCode = (s: string): boolean =>
  /^\*{4}-\*{4}-\*{4}-[A-Z0-9]{4}$/.test(s);

/** Dollars (a number or a numeric string) to whole cents. */
export const cents = (n: unknown): number => Math.round(Number(n) * 100);

/** Roll-forward: start + Σ lines = end, to the cent, and difference is 0. */
export const rollForwardTies = (rf: {
  startBalance: number;
  endBalance: number;
  difference: number;
  lines: Record<string, number>;
}): boolean =>
  cents(rf.startBalance) +
    Object.values(rf.lines).reduce((sum, v) => sum + cents(v), 0) ===
    cents(rf.endBalance) && cents(rf.difference) === 0;

/** Sum `{ amount, count }` rows; the amount is rounded to cents. */
export const sumMoneyCounts = (
  xs: { amount: number; count: number }[]
): { amount: number; count: number } => ({
  amount: xs.reduce((s, x) => s + cents(x.amount), 0) / 100,
  count: xs.reduce((s, x) => s + x.count, 0),
});

/**
 * The shared seed restaurant (`readRestaurantId()`, the globalSetup /
 * TEMPLATE_WIND_RESTAURANT_ID restaurant) as the place to sell gift cards BY
 * CARD. It is the one QA restaurant whose Stripe setup is finished (charges
 * and payouts enabled). A throwaway tenant only gets the QA dummy onboarding,
 * which can't accept Stripe's terms, so since RestauNax
 * feat/gift-cards-owner-ux a card-paid sale there is refused with 409
 * GIFT_CARD_HOLDER_CANNOT_RECEIVE: the product rule, which the specs follow
 * rather than work around. Cash and imported value stay on throwaway tenants.
 *
 * The seed is shared with every other spec (and an overlapping CI e2e run),
 * so this changes as little as it can and puts it back:
 *  - it reads the config through the admin route and turns on only what is
 *    off: selling, and a custom amount range wide enough for `amounts`;
 *  - `restore()` writes back only the fields it changed (call it in afterAll).
 * A parallel run doing the same could still restore a field mid-run; that
 * window only exists when the seed had selling off, which it does not on QA.
 * Callers record every card with recordGiftCardForCleanup and assert deltas
 * or their own card's id, never the seed's absolute totals.
 */
export async function seedRestaurantForCardSales(
  adminToken: string,
  amounts: number[]
): Promise<{
  restaurantId: string;
  ownerToken: string;
  ownerEmail: string;
  ownerPassword: string;
  restore: () => Promise<void>;
}> {
  const ownerEmail = process.env.OWNER_EMAIL ?? "";
  const ownerPassword = process.env.OWNER_PASSWORD ?? "";
  if (!ownerEmail || !ownerPassword)
    throw new Error("OWNER_EMAIL / OWNER_PASSWORD (the seed owner) not set");
  const restaurantId = readRestaurantId();
  const ownerToken = (await apiLogin(ownerEmail, ownerPassword)).accessToken;

  const read = await getGiftCardConfigAdminRaw(adminToken, restaurantId);
  if (read.status !== 200)
    throw new Error(`[seed gift cards] config: ${JSON.stringify(read.data)}`);
  const was = read.data.data;
  const patch: Partial<GiftCardConfigFull> = {};
  if (!was.isEnabled) patch.isEnabled = true;
  const sellable = (a: number) =>
    (was.presetDenominations ?? []).includes(a) ||
    (was.allowCustomAmount &&
      a >= was.minCustomAmount &&
      a <= was.maxCustomAmount);
  if (!amounts.every(sellable)) {
    patch.allowCustomAmount = true;
    patch.minCustomAmount = Math.min(was.minCustomAmount, ...amounts);
    patch.maxCustomAmount = Math.max(was.maxCustomAmount, ...amounts);
  }
  if (Object.keys(patch).length) {
    const put = await putGiftCardConfigAdminRaw(
      adminToken,
      restaurantId,
      patch
    );
    if (!put.ok)
      throw new Error(`[seed gift cards] enable: ${JSON.stringify(put.data)}`);
  }
  const restore = async () => {
    if (!Object.keys(patch).length) return;
    const back = Object.fromEntries(
      Object.keys(patch).map((k) => [k, was[k as keyof GiftCardConfigFull]])
    ) as Partial<GiftCardConfigFull>;
    await putGiftCardConfigAdminRaw(adminToken, restaurantId, back);
  };
  return { restaurantId, ownerToken, ownerEmail, ownerPassword, restore };
}
