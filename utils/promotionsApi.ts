/**
 * promotionsApi.ts — typed wrappers for the promotions backend (spec:
 * restaunax docs/features/PROMOTIONS.md). Thin: one request each, shapes
 * normalised to what the specs assert on. Money fields are always the
 * server's (quote / redeem responses), never computed here.
 */

import { apiRequestRaw, type RawResponse } from "./apiHelper";

export type ApplyMode = "AUTOMATIC" | "CODE" | "BOTH";
export type Audience = "EVERYONE" | "FIRST_ORDER";
export type ItemSaleKind = "PERCENT_OFF" | "AMOUNT_OFF" | "SET_PRICE";

export interface CouponPromotionBody {
  /** AUTO-prefixed. Coupons have no name column: sent as `description`. */
  name: string;
  /** AUTO-prefixed; null/absent for AUTOMATIC. */
  code?: string | null;
  type:
    | "PERCENTAGE"
    | "FIXED_AMOUNT"
    | "FIXED_ITEM"
    | "FREE_DELIVERY"
    | "ITEM_SALE"
    | "FREE_ITEM";
  value?: number;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
  /** Default CODE. */
  applyMode?: ApplyMode;
  /** Default EVERYONE. */
  audience?: Audience;
  validDays?: string[];
  /** "HH:mm". */
  validTimeStart?: string;
  validTimeEnd?: string;
  availableChannels?: ("ONLINE" | "IN_PERSON")[];
  perUserLimit?: number | null;
  usageLimit?: number | null;
  /** Backend REQUIRES both dates; default = yesterday .. +30 days. */
  startDate?: string;
  endDate?: string;
  status?: "ACTIVE" | "INACTIVE";
  // ITEM_SALE
  saleKind?: ItemSaleKind;
  maxDiscountedUnits?: number | null;
  /** Backend field names (couponRules.ts): scopeItemIds / scopeGroupIds. */
  scopeItemIds?: string[];
  scopeGroupIds?: string[];
  // Legacy FIXED_ITEM: "$value off once when this item is in the cart".
  menuItemId?: string;
  // FREE_ITEM
  giftMenuItemId?: string;
  triggerKind?: "SPEND" | "BUY_ITEM";
  triggerMenuItemId?: string;
  triggerMenuGroupId?: string;
}

export interface RedeemCodeResult {
  status: number;
  body: {
    success: boolean;
    message?: string;
    data?:
      | { kind: "BUNDLE"; dealId: string }
      | {
          kind: "ORDER";
          coupon: { id: string; code: string | null; type: string };
          discountAmount?: number;
          [k: string]: unknown;
        };
  };
}

export interface PromotionQuote {
  amountToCharge: number;
  subtotal: number;
  /** Backend key is `couponId` (Service/pricing/types.ts AppliedPromotion), not `id`. */
  appliedPromotion: {
    couponId: string;
    title: string;
    savings: number;
  } | null;
  /** "APPLIED" | "BETTER_OFFER_APPLIED" | "NOT_ELIGIBLE" */
  codeOutcome: string | null;
  codeOutcomeMessage?: string | null;
  freeItemOffer: { menuItemId: string; name: string } | null;
  /** Priced bundle lines (server's dealPrice / lineTotal). */
  deals: {
    dealId: string;
    dealPrice: number;
    lineTotal: number;
    quantity: number;
  }[];
  issues?: {
    code?: string;
    severity: "ERROR" | "WARNING";
    reason?: string | null;
    message?: string;
  }[];
  /**
   * Why the entered code was refused. The backend strips `codeIssue` from the
   * response, so this is the first `issues[]` entry whose `code` is a
   * code-level one (coupon_not_found | coupon_expired | coupon_min_order_not_met
   * | coupon_deal_exclusive | coupon_delivery_only | coupon_required_item_missing
   * | promotion_not_eligible); deal issues (e.g. deal_not_eligible) never
   * count. `reason` (IneligibleReason, e.g. "first_order_needs_customer") is
   * set only on promotion_not_eligible, else null. Null = no code issue.
   */
  codeIssue: {
    code: string;
    severity: "ERROR" | "WARNING";
    reason: string | null;
    message?: string;
  } | null;
  /** Full response (status + body) for debugging. */
  raw: unknown;
}

export interface PromotionListRow {
  id: string;
  source: "COUPON" | "DEAL";
  name: string;
  code: string | null;
  status: string;
  type: string;
}

const DAY_MS = 86_400_000;

function failure(what: string, res: RawResponse): Error {
  return new Error(`${what} → ${res.status}: ${JSON.stringify(res.data)}`);
}

/** POST /api/coupons/restaurant/:id (owner token). */
export async function createCouponPromotion(
  token: string,
  restaurantId: string,
  body: CouponPromotionBody
): Promise<{ id: string; code: string | null }> {
  const { name, ...rest } = body;
  const now = Date.now();
  const res = await apiRequestRaw<{
    coupon?: { id: string; code: string | null };
  }>(
    "POST",
    `/api/coupons/restaurant/${restaurantId}`,
    {
      startDate: new Date(now - DAY_MS).toISOString(),
      endDate: new Date(now + 30 * DAY_MS).toISOString(),
      ...rest,
      description: name,
    },
    token
  );
  if (!res.ok || !res.data?.coupon?.id) {
    throw failure("createCouponPromotion", res);
  }
  return { id: res.data.coupon.id, code: res.data.coupon.code ?? null };
}

/** POST /api/promotions/redeem-code (public). Raw: refusals are the assertion. */
export async function redeemCode(
  restaurantId: string,
  code: string,
  cart: {
    orderAmount?: number;
    items?: unknown[];
    email?: string;
    phone?: string;
    serviceType?: string;
    orderSource?: string;
  } = {}
): Promise<RedeemCodeResult> {
  const res = await apiRequestRaw<RedeemCodeResult["body"]>(
    "POST",
    "/api/promotions/redeem-code",
    { code, restaurantId, ...cart }
  );
  return { status: res.status, body: res.data };
}

interface PromotionRowWire {
  id: string;
  source: "COUPON" | "DEAL";
  type: string;
  title: string;
  code: string | null;
  statusActive: boolean;
}

/** GET /api/promotions/restaurant/:id (owner token), normalised. */
export async function listPromotions(
  token: string,
  restaurantId: string
): Promise<PromotionListRow[]> {
  const res = await apiRequestRaw<{ data?: PromotionRowWire[] }>(
    "GET",
    `/api/promotions/restaurant/${restaurantId}`,
    undefined,
    token
  );
  if (!res.ok) throw failure("listPromotions", res);
  return (res.data.data ?? []).map((r) => ({
    id: r.id,
    source: r.source,
    name: r.title,
    code: r.code ?? null,
    status: r.statusActive ? "ACTIVE" : "INACTIVE",
    type: r.type,
  }));
}

interface QuoteWire {
  quote?: {
    amountToCharge: number;
    subtotal: number;
    appliedPromotion?: PromotionQuote["appliedPromotion"];
    codeOutcome?: string | null;
    codeOutcomeMessage?: string | null;
    freeItemOffer?: PromotionQuote["freeItemOffer"];
    deals?: PromotionQuote["deals"];
  };
  issues?: PromotionQuote["issues"];
}

/**
 * Issue codes that describe the ENTERED code (backend enteredCodeIssue /
 * COUPON_REASON_TO_CODE). Deliberately NOT keyed on `reason`: the backend
 * copies context.reason onto every issue (deal_not_eligible carries one for a
 * deal, not the code), and the coupon_* codes carry none.
 */
const CODE_ISSUE_CODES = new Set([
  "coupon_not_found",
  "coupon_expired",
  "coupon_min_order_not_met",
  "coupon_deal_exclusive",
  "coupon_delivery_only",
  "coupon_required_item_missing",
  "promotion_not_eligible",
]);

export function codeIssueOf(
  issues: PromotionQuote["issues"]
): PromotionQuote["codeIssue"] {
  const hit = issues?.find((i) => i.code && CODE_ISSUE_CODES.has(i.code));
  return hit
    ? { ...hit, code: hit.code as string, reason: hit.reason ?? null }
    : null;
}

/**
 * POST /api/order/:id/quote in the engine-intent shape (items / deals /
 * couponCode — the only shape that carries a typed code). The backend does
 * not read a delivery fee from this shape, so `deliveryFee` is accepted for
 * interface stability but ignored server-side.
 */
export async function promotionQuote(
  restaurantId: string,
  intent: {
    items: { menuItemId: string; quantity: number; modifiers?: unknown[] }[];
    orderDeals?: {
      dealId: string;
      quantity: number;
      code?: string;
      items: { dealItemId: string; menuItemId: string; quantity: number }[];
    }[];
    couponCode?: string;
    customerEmail?: string;
    customerPhone?: string;
    serviceType?: "PICKUP" | "DELIVERY";
    deliveryFee?: number;
  },
  customerToken?: string
): Promise<PromotionQuote> {
  const body = {
    orderType: intent.serviceType ?? "PICKUP",
    items: intent.items.map(({ modifiers, ...i }) => ({
      ...i,
      ...(modifiers ? { selectedModifiers: modifiers } : {}),
    })),
    deals: (intent.orderDeals ?? []).map((d) => ({
      dealId: d.dealId,
      quantity: d.quantity,
      ...(d.code ? { code: d.code } : {}),
      selections: d.items.map((i) => ({
        dealItemId: i.dealItemId,
        menuItemId: i.menuItemId,
      })),
    })),
    ...(intent.couponCode ? { couponCode: intent.couponCode } : {}),
    ...(intent.customerEmail ? { customerEmail: intent.customerEmail } : {}),
    ...(intent.customerPhone ? { customerPhone: intent.customerPhone } : {}),
  };
  const res = await apiRequestRaw<QuoteWire>(
    "POST",
    `/api/order/${restaurantId}/quote`,
    body,
    customerToken
  );
  if (!res.ok || !res.data?.quote) throw failure("promotionQuote", res);
  const q = res.data.quote;
  return {
    amountToCharge: q.amountToCharge,
    subtotal: q.subtotal,
    appliedPromotion: q.appliedPromotion ?? null,
    codeOutcome: q.codeOutcome ?? null,
    codeOutcomeMessage: q.codeOutcomeMessage ?? null,
    freeItemOffer: q.freeItemOffer ?? null,
    deals: q.deals ?? [],
    issues: res.data.issues,
    codeIssue: codeIssueOf(res.data.issues),
    raw: { status: res.status, body: res.data },
  };
}

/**
 * POST /api/tablet/orders/price-preview (device token). The /quote engine on
 * the in-store surface; body = same engine shape + {priceTier?, customerId?}.
 * `staffSession` is sent as X-Staff-Session when given (not required by the
 * route today).
 */
export async function tabletPricePreview(
  tabletToken: string,
  staffSession: string | null,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const res = await apiRequestRaw(
    "POST",
    "/api/tablet/orders/price-preview",
    body,
    tabletToken,
    staffSession ? { "X-Staff-Session": staffSession } : undefined
  );
  return { status: res.status, body: res.data };
}

/**
 * Coupons: PUT /api/coupons/:id {status}. Deals: PATCH /api/deals/:id/status
 * {status} (the same call as setDealStatusRaw). Throws on a refusal.
 */
export async function setPromotionStatus(
  token: string,
  source: "COUPON" | "DEAL",
  id: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<void> {
  const res =
    source === "COUPON"
      ? await apiRequestRaw("PUT", `/api/coupons/${id}`, { status }, token)
      : await apiRequestRaw(
          "PATCH",
          `/api/deals/${id}/status`,
          { status },
          token
        );
  if (!res.ok) throw failure(`setPromotionStatus(${source})`, res);
}
