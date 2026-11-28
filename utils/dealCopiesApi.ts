/**
 * dealCopiesApi.ts — API helpers for deal copies and late promotions
 * (RestauNax feat/deal-copies-late-promotions, spec
 * docs/features/DEAL_COPIES_AND_LATE_PROMOTIONS.md → "Backend contract (as
 * built)"). Gated by RELEASED_ON_QA.dealCopies (utils/releaseGate.ts).
 *
 * Every helper is raw: refusals are the assertion.
 */
import {
  apiRequestRaw,
  tabletRaw,
  type QuoteResponse,
  type RawResponse,
} from "./apiHelper";

/** One "Your cart qualifies for …" suggestion on the checkout quote. */
export interface DealSuggestion {
  dealId: string;
  title: string;
  savings: number;
  /** `lineIndex` indexes the REQUEST's orderItems. */
  picks: { lineIndex: number; dealItemId: string }[];
}

/** The quote wire with the additive `dealSuggestions` and issue context. */
export type QuoteWithSuggestions = Omit<QuoteResponse, "quote" | "issues"> & {
  quote?: NonNullable<QuoteResponse["quote"]> & {
    dealSuggestions?: DealSuggestion[];
    couponDiscount?: number;
  };
  issues?: {
    code: string;
    severity: string;
    message?: string;
    reason?: string;
    context?: { dealId?: string; reason?: string };
    dealId?: string;
  }[];
};

/** A legacy-body checkout line, as template-wind sends it. */
export interface CheckoutLine {
  menuItemId: string;
  menuItemName?: string;
  quantity: number;
  price?: number;
}

/** A legacy-body deal line: one `orderDeals[]` item per cart entry. */
export interface CheckoutDealLine {
  dealId: string;
  dealName?: string;
  quantity: number;
  items: {
    dealItemId: string;
    menuItemId: string;
    menuItemName?: string;
    quantity: number;
  }[];
}

/**
 * PUBLIC POST /api/order/:restaurantId/quote with the storefront's legacy
 * body (orderItems / orderDeals), the shape `lineIndex` refers to.
 */
export function quoteCheckoutRaw(
  restaurantId: string,
  body: {
    orderItems?: CheckoutLine[];
    orderDeals?: CheckoutDealLine[];
    couponCode?: string;
    customerEmail?: string;
    customerPhone?: string;
  }
): Promise<RawResponse<QuoteWithSuggestions>> {
  return apiRequestRaw("POST", `/api/order/${restaurantId}/quote`, {
    orderType: "PICKUP",
    orderItems: [],
    orderDeals: [],
    ...body,
  });
}

/** The reason of a `deal_not_eligible` issue (flattened or in `context`). */
export const issueReason = (issue: {
  reason?: string;
  context?: { reason?: string };
}): string | undefined => issue.reason ?? issue.context?.reason;

/** `GET /api/tablet/orders/:orderId/applicable-deals`. */
export interface ApplicableDeals {
  success?: boolean;
  message?: string;
  errorCode?: string;
  data?: {
    window: { open: boolean; reason?: "STATUS" | "NOT_TODAY" | "DAY_CLOSED" };
    hasCoupon: boolean;
    coupon: { title: string; savings: number } | null;
    deals: { id: string; name: string; maxPerOrder?: number | null }[];
  };
}

export function applicableDealsRaw(
  tabletToken: string,
  staffSession: string,
  orderId: string
): Promise<RawResponse<ApplicableDeals>> {
  return tabletRaw<ApplicableDeals>(
    tabletToken,
    "GET",
    `/orders/${orderId}/applicable-deals`,
    undefined,
    staffSession
  );
}

/** apply-coupon / apply-deal success: the shared settlement fields. */
export interface LatePromotionResult {
  success?: boolean;
  message?: string;
  errorCode?: string;
  details?: Record<string, unknown>;
  order?: {
    id: string;
    subtotal: number;
    total: number;
    tax?: number;
    discountAmount?: number | null;
    dealDiscountAmount?: number | null;
    couponId?: string | null;
    paymentStatus?: string;
    breakdown?: unknown;
  };
  breakdown?: unknown;
  delta?: number;
  balanceDue?: number;
  requiresAdditionalPayment?: number;
  autoChargedToCard?: number;
  refundedToCard?: number;
  refundedToGiftCard?: number;
  requiresRefund?: number;
  dealApplied?: boolean;
  couponRemoved?: boolean;
  appliedDeal?: {
    orderDealId: string;
    dealId: string;
    title: string;
    savings: number;
  };
}

/** `POST /api/tablet/orders/:orderId/apply-deal`. */
export function applyDealRaw(
  tabletToken: string,
  staffSession: string,
  orderId: string,
  body: {
    dealId: string;
    picks: { orderItemId: string; dealItemId: string }[];
    replaceCoupon?: boolean;
    voidReason?: string;
    /** A manager's approval for staff without the capability (the POS PIN pad). */
    managerPin?: string;
    approverStaffMemberId?: string;
  }
): Promise<RawResponse<LatePromotionResult>> {
  return tabletRaw<LatePromotionResult>(
    tabletToken,
    "POST",
    `/orders/${orderId}/apply-deal`,
    body,
    staffSession
  );
}

/** `POST /api/tablet/orders/:orderId/apply-coupon {code}`. */
export function applyCouponRaw(
  tabletToken: string,
  staffSession: string,
  orderId: string,
  code: string
): Promise<RawResponse<LatePromotionResult>> {
  return tabletRaw<LatePromotionResult>(
    tabletToken,
    "POST",
    `/orders/${orderId}/apply-coupon`,
    { code },
    staffSession
  );
}
