/**
 * supplyShopCartApi.ts — the Print Shop's cart, quote requests and the
 * table-card builder's "Add to cart" (RestauNax #1072, #1075, #1100).
 *
 * Owner calls carry the restaurant in `X-Restaurant-Id`; the table-card
 * builder is the one exception (`/restaurant/:id/table-qr-cards/…`, bare
 * prefix). Money in these payloads is dollars, estimates are ranges, and no
 * owner payload carries a vendor cost.
 */
import { apiRequestRaw, type RawResponse } from "./apiHelper";

const owner = (restaurantId: string) => ({ "X-Restaurant-Id": restaurantId });

export type CartUnavailableReason =
  | "NOT_LAUNCHED"
  | "INACTIVE"
  | "TABLE_CARDS_CHANGED"
  | "WITH_UNAVAILABLE_ITEM"
  | "ADD_ON_UNAVAILABLE";

export interface CartLine {
  id: string;
  productSlug: string;
  productName: string;
  variantName: string;
  quantity: number;
  estimateLow: number;
  estimateHigh: number;
  packageKey: string;
  available: boolean;
  unavailableReason?: CartUnavailableReason;
  /** Resolved text, e.g. "needed to hold your table cards". */
  addOnLabel: string | null;
  /** The cart line this one came with, while it is in the cart. */
  addOnForId?: string | null;
  /** Needed by that line: no quantity or Remove of its own. */
  addOnRequired?: boolean;
}

export interface CartView {
  lines: CartLine[];
  totalLow: number;
  totalHigh: number;
  shippingLow: number;
  shippingHigh: number;
  packageCount: number;
}

type Envelope<T> = { success: boolean; data: T; code?: string; error?: string };

export function getSupplyCartRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse<Envelope<CartView>>> {
  return apiRequestRaw(
    "GET",
    "/api/supply-shop/cart",
    undefined,
    ownerToken,
    owner(restaurantId)
  );
}

export function patchSupplyCartItemRaw(
  ownerToken: string,
  restaurantId: string,
  lineId: string,
  quantity: number
): Promise<RawResponse<Envelope<unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/api/supply-shop/cart/items/${lineId}`,
    { quantity },
    ownerToken,
    owner(restaurantId)
  );
}

export function deleteSupplyCartItemRaw(
  ownerToken: string,
  restaurantId: string,
  lineId: string
): Promise<RawResponse<Envelope<unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/api/supply-shop/cart/items/${lineId}`,
    undefined,
    ownerToken,
    owner(restaurantId)
  );
}

export interface CheckoutResult {
  checkout: { id: string; checkoutNumber: string } | null;
  placed: string[];
  failed: { orderId: string; code: string }[];
}

export function checkoutSupplyCartRaw(
  ownerToken: string,
  restaurantId: string,
  paymentTerm: "IMMEDIATE" | "NEXT_INVOICE" = "IMMEDIATE"
): Promise<RawResponse<Envelope<CheckoutResult>>> {
  return apiRequestRaw(
    "POST",
    "/api/supply-shop/cart/checkout",
    { paymentTerm },
    ownerToken,
    owner(restaurantId)
  );
}

/** Empty the cart (best effort): cards first, so their stands go with them. */
export async function emptySupplyCart(
  ownerToken: string,
  restaurantId: string
): Promise<void> {
  const cart = await getSupplyCartRaw(ownerToken, restaurantId);
  const lines = cart.data?.data?.lines ?? [];
  const ordered = [
    ...lines.filter((l) => !l.addOnRequired),
    ...lines.filter((l) => l.addOnRequired),
  ];
  for (const line of ordered) {
    await deleteSupplyCartItemRaw(ownerToken, restaurantId, line.id);
  }
}

export type TableQrFormat =
  | "folded-tent"
  | "cards-with-stand"
  | "acrylic-sign"
  | "cards-only";

/** The builder's Add to cart: `count` identical "same card on every table" cards. */
export function addSameTableCardsToCartRaw(
  ownerToken: string,
  restaurantId: string,
  count: number,
  variantSlug: TableQrFormat,
  addOns?: { variantId: string; quantity: number }[]
): Promise<
  RawResponse<Envelope<{ orderId: string; addOnOrderIds: string[] }>>
> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/table-qr-cards/cart`,
    {
      sameForAll: { count },
      variantSlug,
      design: "clean",
      ...(addOns ? { addOns } : {}),
    },
    ownerToken
  );
}

/** The old one-line order endpoint (no client calls it any more). */
export function orderSameTableCardsRaw(
  ownerToken: string,
  restaurantId: string,
  count: number,
  variantSlug: TableQrFormat
): Promise<RawResponse<Envelope<unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/table-qr-cards/order`,
    { sameForAll: { count }, variantSlug, paymentTerm: "IMMEDIATE" },
    ownerToken
  );
}

export function requestSupplyQuoteRaw(
  ownerToken: string,
  restaurantId: string,
  productId: string
): Promise<
  RawResponse<Envelope<{ id: string; createdAt: string; created: boolean }>>
> {
  return apiRequestRaw(
    "POST",
    `/api/supply-shop/catalog/${productId}/quote-request`,
    {},
    ownerToken,
    owner(restaurantId)
  );
}

export interface AdminQuoteRequest {
  id: string;
  createdAt: string;
  restaurant: { id: string; name: string };
  product: { id: string; slug: string; name: string };
}

/** HQ's open quote requests. */
export function listQuoteRequestsAdminRaw(
  adminToken: string
): Promise<RawResponse<Envelope<AdminQuoteRequest[]>>> {
  return apiRequestRaw(
    "GET",
    "/api/admin/supply-shop/quote-requests",
    undefined,
    adminToken
  );
}

export function handleQuoteRequestAdminRaw(
  adminToken: string,
  requestId: string
): Promise<RawResponse<Envelope<unknown>>> {
  return apiRequestRaw(
    "POST",
    `/api/admin/supply-shop/quote-requests/${requestId}/handle`,
    {},
    adminToken
  );
}

/** Close every open quote request this restaurant made (cleanup). */
export async function handleQuoteRequestsFor(
  adminToken: string,
  restaurantId: string
): Promise<void> {
  const open = await listQuoteRequestsAdminRaw(adminToken);
  for (const request of open.data?.data ?? []) {
    if (request.restaurant?.id === restaurantId) {
      await handleQuoteRequestAdminRaw(adminToken, request.id);
    }
  }
}
