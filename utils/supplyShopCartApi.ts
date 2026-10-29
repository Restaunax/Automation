/**
 * supplyShopCartApi.ts — the Print Shop's cart, quote requests and the
 * table-card builder's "Add to cart" (RestauNax #1072, #1075, #1100).
 *
 * Owner calls carry the restaurant in `X-Restaurant-Id`; the table-card
 * builder is the one exception (`/restaurant/:id/table-qr-cards/…`, bare
 * prefix). Money in these payloads is dollars, estimates are ranges, and no
 * owner payload carries a vendor cost.
 */
import * as fs from "fs";
import * as path from "path";

import {
  apiRequestRaw,
  createSupplyDesignOwnerRaw,
  listSupplyOrdersOwnerRaw,
  type RawResponse,
  type SupplyOrder,
} from "./apiHelper";

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
  /** Whether "Add it to my next RestauNax bill" is offered at checkout. */
  terms?: { invoiceAvailable: boolean; invoiceReason?: string };
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

/** The brief form's / product page's "Add to cart": one DRAFT line in the cart. */
export function addSupplyCartItemRaw(
  ownerToken: string,
  restaurantId: string,
  body: { variantId: string; quantity: number; designId?: string }
): Promise<RawResponse<Envelope<{ id: string; orderNumber: string }>>> {
  return apiRequestRaw(
    "POST",
    "/api/supply-shop/cart/items",
    body,
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

/**
 * Place order. Owners choose IMMEDIATE or NEXT_INVOICE; COMP (an HQ
 * decision) and FREE_TIER (the server picks the free line) are typed here
 * only so a test can prove checkout refuses them.
 */
export function checkoutSupplyCartRaw(
  ownerToken: string,
  restaurantId: string,
  paymentTerm: "IMMEDIATE" | "NEXT_INVOICE" | "COMP" | "FREE_TIER" = "IMMEDIATE"
): Promise<RawResponse<Envelope<CheckoutResult>>> {
  return apiRequestRaw(
    "POST",
    "/api/supply-shop/cart/checkout",
    { paymentTerm },
    ownerToken,
    owner(restaurantId)
  );
}

/**
 * Composite, the way an owner orders since the cart (RestauNax #1072): a design
 * with the brief → Add to cart → Place order. Nothing is charged; the line
 * lands in IN_DESIGN inside a SupplyCheckout (SC-YYYY-NNNN). Throws on any
 * refusal so a broken setup fails loudly.
 */
export async function placeSupplyOrderViaCart(
  ownerToken: string,
  restaurantId: string,
  opts: {
    variantId: string;
    quantity: number;
    message: string;
    paymentTerm?: "IMMEDIATE" | "NEXT_INVOICE";
  }
): Promise<{
  order: SupplyOrder;
  checkout: { id: string; checkoutNumber: string };
}> {
  const design = await createSupplyDesignOwnerRaw(ownerToken, restaurantId, {
    variantId: opts.variantId,
    name: `Automation design ${opts.message}`,
    brief: { message: opts.message },
  });
  if (!design.ok) {
    throw new Error(
      `[supply-shop] design create failed: ${JSON.stringify(design.data)}`
    );
  }
  const added = await addSupplyCartItemRaw(ownerToken, restaurantId, {
    variantId: opts.variantId,
    quantity: opts.quantity,
    designId: design.data.data.id,
  });
  if (!added.ok) {
    throw new Error(
      `[supply-shop] add to cart failed: ${JSON.stringify(added.data)}`
    );
  }
  const placed = await checkoutSupplyCartRaw(
    ownerToken,
    restaurantId,
    opts.paymentTerm ?? "IMMEDIATE"
  );
  const checkout = placed.data?.data?.checkout;
  if (!placed.ok || !checkout || placed.data.data.failed.length > 0) {
    throw new Error(
      `[supply-shop] checkout failed: ${JSON.stringify(placed.data)}`
    );
  }
  const mine = await listSupplyOrdersOwnerRaw(ownerToken, restaurantId);
  const order = mine.data?.data?.find((o) => o.checkoutId === checkout.id);
  if (!order) {
    throw new Error(`[supply-shop] ${checkout.checkoutNumber} has no line`);
  }
  return { order, checkout };
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

/**
 * Products this run launched, so globalTeardown can pause them again. A file,
 * not memory: specs run in several workers, and one spec pausing a product at
 * its end would break another spec still ordering it.
 */
export const SUPPLY_LAUNCH_MARKER_FILE = path.resolve(
  __dirname,
  "../supply-launches.tmp.json"
);

const readLaunchMarker = (): string[] => {
  try {
    return JSON.parse(
      fs.readFileSync(SUPPLY_LAUNCH_MARKER_FILE, "utf-8")
    ) as string[];
  } catch {
    return [];
  }
};

/**
 * Make sure a Print Shop product is orderable for this run. Owners can only
 * order launched products (RestauNax #1072), and on QA only Table QR cards
 * is launched, so a spec that orders another product launches it itself
 * rather than depending on a manual QA setting. If this run is the one that
 * launched it, globalTeardown pauses it again (`pauseProductsThisRunLaunched`);
 * a product that was already launched is left alone.
 *
 * While launched, every QA restaurant can order the product, and launching
 * closes every open quote request for it.
 */
export async function ensureSupplyProductLaunched(
  adminToken: string,
  slug: string
): Promise<void> {
  const catalog = await apiRequestRaw<
    Envelope<{ id: string; slug: string; launchedAt: string | null }[]>
  >("GET", "/api/admin/supply-shop/catalog", undefined, adminToken);
  const product = catalog.data?.data?.find((p) => p.slug === slug);
  if (!product) throw new Error(`[supply-shop] no catalog product ${slug}`);
  if (product.launchedAt) return;

  // Marker first: a run that dies right after the launch still pauses it.
  const marked = readLaunchMarker();
  if (!marked.includes(product.id)) {
    fs.writeFileSync(
      SUPPLY_LAUNCH_MARKER_FILE,
      JSON.stringify([...marked, product.id])
    );
  }
  const launched = await apiRequestRaw<Envelope<unknown>>(
    "POST",
    `/api/admin/supply-shop/catalog/${product.id}/launch`,
    {},
    adminToken
  );
  if (!launched.ok) {
    throw new Error(
      `[supply-shop] could not launch ${slug}: ${JSON.stringify(launched.data)}`
    );
  }
}

/** globalTeardown: pause what this run launched, then forget the marker. */
export async function pauseProductsThisRunLaunched(
  adminToken: string
): Promise<number> {
  const ids = readLaunchMarker();
  let paused = 0;
  for (const id of ids) {
    const res = await apiRequestRaw(
      "POST",
      `/api/admin/supply-shop/catalog/${id}/pause`,
      {},
      adminToken
    );
    if (res.ok) paused += 1;
    else console.warn(`[supply-shop] could not pause ${id}: ${res.status}`);
  }
  fs.rmSync(SUPPLY_LAUNCH_MARKER_FILE, { force: true });
  return paused;
}

// ── Finalise: one charge for a set of lines (RestauNax #1075) ───────────────

export interface FinaliseDraftLine {
  orderId: string;
  orderNumber: string;
  quantity: number;
  waived: boolean;
  unitPrice: number;
  shippingAmount: number;
  estimatedTotalLow: number | null;
  estimatedTotalHigh: number | null;
  unitCost: number;
}

export interface FinaliseDraftPackage {
  key: string;
  supplierName: string | null;
  route: string;
  shippingEstimate: number;
  lines: FinaliseDraftLine[];
}

export interface FinaliseDraft {
  restaurant: { id: string; name: string };
  paymentTerm: string;
  checkoutNumber: string | null;
  /** What the owner agreed to: above it, the charge waits for their OK. */
  ceiling: number;
  settled: boolean;
  packages: FinaliseDraftPackage[];
}

/** HQ's Finalise dialog prefill: a whole checkout, or one legacy line. */
export function getFinaliseDraftRaw(
  adminToken: string,
  by: { checkoutId: string } | { orderId: string }
): Promise<RawResponse<Envelope<FinaliseDraft>>> {
  const query =
    "checkoutId" in by
      ? `checkoutId=${encodeURIComponent(by.checkoutId)}`
      : `orderId=${encodeURIComponent(by.orderId)}`;
  return apiRequestRaw(
    "GET",
    `/api/admin/supply-shop/finalise-draft?${query}`,
    undefined,
    adminToken
  );
}

export interface FinaliseOutcome {
  state: "PLACED" | "AWAITING_APPROVAL" | "AWAITING_PAYMENT";
  chargeId: string | null;
  total: number;
  ceiling: number | null;
  hostedPaymentUrl?: string | null;
  giftCardBatchIds: Record<string, string>;
}

export interface FinaliseBody {
  lines: {
    orderId: string;
    unitPrice?: number | null;
    unitCost?: number | null;
    comp?: { reason: string } | null;
  }[];
  packages: {
    key: string;
    orderIds: string[];
    routeId?: string;
    shippingCharged: number;
    vendor?: string;
    vendorShipping?: number;
    vendorTax?: number;
    vendorOrderRef?: string;
  }[];
}

/** POST /api/admin/supply-shop/finalise — what the Finalise dialog submits. */
export function finaliseSupplyLinesRaw(
  adminToken: string,
  body: FinaliseBody
): Promise<RawResponse<Envelope<FinaliseOutcome> & { message?: string }>> {
  return apiRequestRaw(
    "POST",
    "/api/admin/supply-shop/finalise",
    body,
    adminToken
  );
}

/**
 * Build a finalise body from the draft, the way the dialog does: every line
 * at `unitPrice` (waived lines at none), every package's shipping at its
 * estimate unless given, one supplier bill per package.
 */
export function finaliseBodyFromDraft(
  draft: FinaliseDraft,
  opts: {
    unitPrice: number;
    unitCost: number;
    shippingCharged?: number;
    vendor: string;
    vendorShipping: number;
    vendorOrderRef?: string;
  }
): FinaliseBody {
  return {
    lines: draft.packages.flatMap((p) =>
      p.lines.map((l) => ({
        orderId: l.orderId,
        unitPrice: l.waived ? null : opts.unitPrice,
        unitCost: opts.unitCost,
      }))
    ),
    packages: draft.packages.map((p) => ({
      key: p.key,
      orderIds: p.lines.map((l) => l.orderId),
      routeId: p.route,
      shippingCharged: opts.shippingCharged ?? p.shippingEstimate,
      vendor: opts.vendor,
      vendorShipping: opts.vendorShipping,
      vendorTax: 0,
      vendorOrderRef: opts.vendorOrderRef,
    })),
  };
}
