/**
 * apiHelper.ts
 *
 * Direct HTTP calls to the RestauNax backend for test data setup and teardown.
 * Uses Bearer token auth — no browser required.
 * All functions throw on non-2xx responses with a clear error message.
 *
 * TOKEN LIFETIME: apiLogin() returns a raw access token that expires after
 * 15 MINUTES with no refresh path (unlike browser sessions, which carry the
 * 30-day refresh token — see utils/auth.ts). Caching a token in beforeAll is
 * fine for a normal-length spec file; never reuse one across more than ~10
 * minutes of test execution — re-login instead.
 */

import {
  readUsersForCleanup,
  clearUsersForCleanup,
  recordUserForCleanup,
} from "./testData";

export const BACKEND_URL =
  process.env.BACKEND_URL ?? "https://api.qa.restaunax.com";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApiLoginResult {
  accessToken: string;
  userId: string;
  role: string;
  firstName: string;
  lastName: string;
}

export interface ApiRestaurant {
  id: string;
  name: string;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Throwing wrapper around apiRequestRaw — the single fetch implementation
 * lives there; this variant turns any non-2xx into a descriptive Error.
 * Use apiRequest for setup/teardown (failures should abort loudly) and
 * apiRequestRaw-based helpers for negative tests (status is the assertion).
 */
async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string
): Promise<T> {
  const res = await apiRequestRaw<T>(method, path, body, accessToken);
  if (!res.ok) {
    const detail =
      typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(
      `API ${method} ${path} → ${res.status}: ${detail || "(no body)"}`
    );
  }
  return res.data;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Logs in via the backend API and returns the access token + basic user info.
 * Used by globalSetup and globalTeardown for data seeding / cleanup.
 */
export async function apiLogin(
  email: string,
  password: string
): Promise<ApiLoginResult> {
  const data = await apiRequest<{
    accessToken: string;
    userId: string;
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    // Backend mounts auth at /login (no /api prefix); /api/login 404s on QA.
  }>("POST", "/login", { email, password });

  return {
    accessToken: data.accessToken,
    userId: data.userId ?? data.id,
    role: data.role,
    firstName: data.firstName,
    lastName: data.lastName,
  };
}

/**
 * Returns all restaurants owned by the authenticated user.
 * Uses GET /restaurant/owned — no special permissions required beyond auth.
 */
export async function getOwnerRestaurants(
  accessToken: string
): Promise<ApiRestaurant[]> {
  const data = await apiRequest<
    | ApiRestaurant[]
    | { restaurant: ApiRestaurant[] }
    | { restaurants: ApiRestaurant[] }
  >("GET", "/restaurant/owned", undefined, accessToken);
  if (Array.isArray(data)) return data;
  if ("restaurant" in data && Array.isArray(data.restaurant))
    return data.restaurant;
  if ("restaurants" in data && Array.isArray(data.restaurants))
    return data.restaurants;
  return [];
}

/**
 * Toggle a restaurant's "pass processing fee to customer" setting via the
 * settings endpoint (PUT /api/restaurantId/:id/settings). Used by the
 * processing-fee E2E to flip the fee ON/OFF around the customer-facing
 * assertion. Pass an owner (or admin) token for a restaurant they manage.
 */
export async function setPassProcessingFee(
  accessToken: string,
  restaurantId: string,
  enabled: boolean
): Promise<void> {
  await apiRequest<unknown>(
    "PUT",
    `/api/restaurantId/${restaurantId}/settings`,
    { passProcessingFeeToCustomer: enabled },
    accessToken
  );
}

/**
 * Deletes a restaurant by ID using an admin-role token.
 * Requires ADMIN role — pass the admin access token.
 */
export async function deleteTestRestaurant(
  adminAccessToken: string,
  restaurantId: string
): Promise<void> {
  await apiRequest<unknown>(
    "DELETE",
    `/api/admin/restaurants/${restaurantId}`,
    undefined,
    adminAccessToken
  );
}

/**
 * Deletes a menu item by ID. Requires auth (owner token is sufficient).
 * NOTE: this is a SOFT delete (backend sets isActive=false) — and the
 * category-delete endpoint counts soft-deleted items, so a group containing
 * one can never be deleted afterwards. Prefer permanentlyDeleteMenuItemApi
 * (admin token) when the item's category must be deletable.
 */
export async function deleteTestMenuItem(
  accessToken: string,
  menuItemId: string
): Promise<void> {
  await apiRequest<unknown>(
    "DELETE",
    `/menu/menuItemId/${menuItemId}`,
    undefined,
    accessToken
  );
}

/**
 * HARD-deletes a menu item — DELETE /menu/menuItemId/:id/permanent.
 * ADMIN role required. Unlike the soft delete, this removes the row, so the
 * item's category can subsequently be deleted.
 */
export async function permanentlyDeleteMenuItemApi(
  adminToken: string,
  menuItemId: string
): Promise<void> {
  await apiRequest<unknown>(
    "DELETE",
    `/menu/menuItemId/${menuItemId}/permanent`,
    undefined,
    adminToken
  );
}

/**
 * Deletes a menu group by ID. Requires auth (owner token is sufficient).
 */
export async function deleteTestMenuGroup(
  accessToken: string,
  menuGroupId: string
): Promise<void> {
  await apiRequest<unknown>(
    "DELETE",
    `/menu/group/${menuGroupId}`,
    undefined,
    accessToken
  );
}

export interface ApiMenuGroup {
  id: string;
  name?: string;
  menuItems?: ApiMenuItem[];
}

export interface ApiMenuItem {
  id: string;
  name: string;
  price: number;
}

/**
 * GET /menu/restaurants/:restaurantId/menus — returns all menu groups with
 * their items. Used by teardown to drain a group before deleting it.
 *
 * Response shape (backend getRestaurantMenus → getMergedMenuForRestaurant):
 * { success, menus: [{ groups: [{ id, name, items: [...] }] }], chain }.
 * NOTE: an earlier version of this helper read a top-level `groups` key that
 * the endpoint never returns — it always yielded [] and the drain-before-
 * delete silently no-opped. Parse the real nested shape.
 */
export async function getRestaurantMenuGroups(
  accessToken: string,
  restaurantId: string
): Promise<ApiMenuGroup[]> {
  const data = await apiRequest<{
    menus?: {
      groups?: { id: string; name?: string; items?: ApiMenuItem[] }[];
    }[];
  }>("GET", `/menu/restaurants/${restaurantId}/menus`, undefined, accessToken);
  return (data.menus ?? []).flatMap((menu) =>
    (menu.groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      menuItems: g.items ?? [],
    }))
  );
}

/**
 * Delete every menu item in a group, then delete the group.
 *
 * When `adminToken` is provided the items are HARD-deleted — necessary
 * because the plain item delete only soft-deletes (isActive=false), and the
 * category-delete endpoint counts soft-deleted items too, so a soft-drained
 * group still 400s with "Cannot Delete Category With Items". Without an
 * admin token the soft-delete drain is attempted, but the group delete will
 * fail if the group ever contained a (now soft-deleted) item.
 */
export async function deleteTestMenuGroupWithItems(
  accessToken: string,
  restaurantId: string,
  menuGroupId: string,
  adminToken?: string
): Promise<void> {
  const groups = await getRestaurantMenuGroups(accessToken, restaurantId);
  const group = groups.find((g) => g.id === menuGroupId);
  if (group?.menuItems?.length) {
    for (const item of group.menuItems) {
      if (adminToken) {
        await permanentlyDeleteMenuItemApi(adminToken, item.id);
      } else {
        await deleteTestMenuItem(accessToken, item.id);
      }
    }
  }
  await apiRequest<unknown>(
    "DELETE",
    `/menu/group/${menuGroupId}`,
    undefined,
    accessToken
  );
}

export async function createTestMenuGroup(
  accessToken: string,
  restaurantId: string
): Promise<ApiMenuGroup> {
  const data = await apiRequest<{ group: ApiMenuGroup }>(
    "POST",
    "/menu/group/new",
    { restaurantId, menuGroup: "Automation Items" },
    accessToken
  );
  return data.group;
}

export async function createTestMenuItem(
  accessToken: string,
  groupId: string
): Promise<ApiMenuItem> {
  const data = await apiRequest<{ menuItem: ApiMenuItem }>(
    "POST",
    "/menu/item/new",
    { name: "Automation Burger", price: 12.99, groupId },
    accessToken
  );
  return data.menuItem;
}

/**
 * Delete every automation-created menu group (name matches the UI-test naming
 * patterns) from a restaurant — this run's AND leftovers from interrupted
 * runs. Best-effort per group; never throws.
 */
export async function deleteAutomationMenuGroups(
  accessToken: string,
  restaurantId: string,
  adminToken?: string,
  namePattern = /^(Test Starters|TC45 Delete|Automation Items|Automation Menu) ?/
): Promise<number> {
  const groups = await getRestaurantMenuGroups(accessToken, restaurantId);
  let deleted = 0;
  const stranded: string[] = [];
  for (const group of groups) {
    if (!group.name || !namePattern.test(group.name)) continue;
    try {
      await deleteTestMenuGroupWithItems(
        accessToken,
        restaurantId,
        group.id,
        adminToken
      );
      deleted++;
    } catch {
      // Almost always a pre-existing orphan: a prior run soft-deleted its item
      // (isActive=false), which the merged-menu endpoint hides, so the drain
      // can't hard-delete it and the group-delete 400s ("Cannot Delete Category
      // With Items"). We deliberately do NOT weaken the backend guard for tests,
      // so these clear only via a one-time manual admin/DB pass. Collect them and
      // log ONE summary below instead of 80+ identical warnings per run.
      stranded.push(group.id);
    }
  }
  if (stranded.length) {
    console.warn(
      `[apiHelper] ${stranded.length} legacy orphan menu group(s) could not be ` +
        `auto-deleted — pre-existing residue whose items are soft-deleted and ` +
        `invisible to the API. Not a run failure; clear once with a manual admin cleanup.`
    );
  }
  return deleted;
}

// ── Menu: deep helpers (item detail, modifiers, availability, featured,
//    chain overrides, images) ────────────────────────────────────────────────
//
// Backing routes: src/routes/menu/menu.ts + src/routes/upload/upload.ts in the
// backend; the rules each one enforces are catalogued in
// docs/MENU_TAB_TEST_STRATEGY.md §3.5. Raw variants return {status, data} for
// contract tests; throwing variants are for seeding/cleanup.

export type ModifierPricingMode =
  | "INCLUDED"
  | "ADJUSTS_PRICE"
  | "REPLACES_PRICE";

/** Body shape of a modifier as POST /menu/item/new and the `added` branch of PUT …/changes accept it. */
export interface ModifierInput {
  name: string;
  price?: number;
  isDefault?: boolean;
  allowsDuplicates?: boolean;
  outOfStock?: boolean;
  /** One level only — the backend forces child groups to INCLUDED/0 and drops grandchildren. */
  childModifierGroups?: ModifierGroupInput[];
}

export interface ModifierGroupInput {
  name: string;
  pricingMode: ModifierPricingMode;
  minSelections?: number;
  /** null/undefined = unlimited */
  maxSelections?: number | null;
  modifiers: ModifierInput[];
}

export interface CreateMenuItemOpts {
  description?: string;
  modifierGroups?: ModifierGroupInput[];
  /** Chain: stamp the item as location-only (see CHAIN_RESTAURANTS.md). */
  ownerRestaurantId?: string;
  weightOz?: number;
}

/** Full menu item as GET /menu/itemId/:id returns it (fields the suite asserts on). */
export interface ApiMenuItemDetail {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  outOfStock: boolean;
  isActive: boolean;
  featured: boolean;
  ownerRestaurantId?: string | null;
  groupId: string;
  imageUrls?: Record<string, string | null> | null;
  group?: { menu?: { restaurantGroupId?: string | null } };
  modifierGroups?: ApiModifierGroup[];
}

export interface ApiModifierGroup {
  id: string;
  name: string;
  pricingMode: ModifierPricingMode;
  minSelections: number;
  maxSelections: number | null;
  sortOrder: number;
  modifiers: ApiModifier[];
}

export interface ApiModifier {
  id: string;
  name: string;
  price: number;
  isDefault: boolean;
  allowsDuplicates: boolean;
  outOfStock: boolean;
  sortOrder: number;
  childModifierGroups?: ApiModifierGroup[];
}

/** One item as the merged-menu resolver (GET /menu/restaurants/:id/menus, customer menu) emits it. */
export interface ApiMergedMenuItem {
  id: string;
  name: string;
  price: number;
  outOfStock: boolean;
  featured?: boolean;
  isActive?: boolean;
  ownerRestaurantId?: string | null;
  source?: "CHAIN" | "RESTAURANT";
  masterPrice?: number;
  priceOverride?: number | null;
  effectivePrice?: number;
  isCarried?: boolean;
  modifierGroups?: ApiModifierGroup[];
}

export interface ApiMergedMenuGroup {
  id: string;
  name: string;
  items: ApiMergedMenuItem[];
}

export interface ApiMergedMenu {
  id: string;
  groups: ApiMergedMenuGroup[];
  source?: "CHAIN" | "RESTAURANT";
}

export interface ApiChainContext {
  groupId: string;
  ownerId: string;
  name: string;
  locationCount: number;
}

/**
 * Owner-path menu read — GET /menu/restaurants/:id/menus (public route; the
 * owner UI calls it with a token). Always `includeUncarried:true` server-side,
 * so uncarried chain items are still listed with `isCarried:false`. Pass
 * `sharedItemsOnly` for the chain-shell "all locations" view.
 */
export async function getRestaurantMenusApi(
  restaurantId: string,
  opts: { accessToken?: string; sharedItemsOnly?: boolean } = {}
): Promise<{ menus: ApiMergedMenu[]; chain: ApiChainContext | null }> {
  const qs = opts.sharedItemsOnly ? "?sharedItemsOnly=true" : "";
  const data = await apiRequest<{
    menus?: ApiMergedMenu[];
    chain?: ApiChainContext | null;
  }>(
    "GET",
    `/menu/restaurants/${restaurantId}/menus${qs}`,
    undefined,
    opts.accessToken
  );
  return { menus: data.menus ?? [], chain: data.chain ?? null };
}

export function getRestaurantMenusRaw(
  restaurantId: string
): Promise<RawResponse> {
  return apiRequestRaw("GET", `/menu/restaurants/${restaurantId}/menus`);
}

/** Flatten every item across menus/groups (owner path). */
export function flattenMenuItems(menus: ApiMergedMenu[]): ApiMergedMenuItem[] {
  return menus.flatMap((m) => (m.groups ?? []).flatMap((g) => g.items ?? []));
}

/**
 * CUSTOMER-path menu read — GET /api/order/restaurantId/:id (what template-wind
 * / the ordering app render). Uncarried chain items are DROPPED here (vs kept +
 * flagged on the owner path) and prices are the location-effective ones.
 */
export async function getPublicMenuItems(
  restaurantId: string
): Promise<ApiMergedMenuItem[]> {
  const data = await apiRequest<{ restaurant?: { menus?: ApiMergedMenu[] } }>(
    "GET",
    `/api/order/restaurantId/${restaurantId}`
  );
  return flattenMenuItems(data.restaurant?.menus ?? []);
}

/** GET /menu/itemId/:id — item + image + full modifier tree (still 200 for soft-deleted items). */
export async function getMenuItemApi(
  accessToken: string,
  menuItemId: string
): Promise<ApiMenuItemDetail> {
  const data = await apiRequest<{ item: ApiMenuItemDetail }>(
    "GET",
    `/menu/itemId/${menuItemId}`,
    undefined,
    accessToken
  );
  return data.item;
}

export function getMenuItemRaw(
  accessToken: string | undefined,
  menuItemId: string
): Promise<RawResponse<{ item?: ApiMenuItemDetail }>> {
  return apiRequestRaw(
    "GET",
    `/menu/itemId/${menuItemId}`,
    undefined,
    accessToken
  );
}

/**
 * Create a menu group with an explicit name. Chain: pass `groupId` (the
 * RestaurantGroup id) INSTEAD of restaurantId to create a shared category on
 * the chain's master menu.
 */
export async function createMenuGroupNamed(
  accessToken: string,
  name: string,
  scope: { restaurantId: string } | { groupId: string }
): Promise<ApiMenuGroup> {
  const data = await apiRequest<{ group: ApiMenuGroup }>(
    "POST",
    "/menu/group/new",
    { menuGroup: name, ...scope },
    accessToken
  );
  return data.group;
}

export function createMenuGroupRaw(
  accessToken: string | undefined,
  body: Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw("POST", "/menu/group/new", body, accessToken);
}

/** Create a menu item with a name/price and optional modifiers/owner stamp. */
export async function createMenuItemFull(
  accessToken: string,
  groupId: string,
  name: string,
  price: number,
  opts: CreateMenuItemOpts = {}
): Promise<ApiMenuItem> {
  const data = await apiRequest<{ menuItem: ApiMenuItem }>(
    "POST",
    "/menu/item/new",
    { name, price, groupId, ...opts },
    accessToken
  );
  return data.menuItem;
}

export function deleteMenuItemRaw(
  accessToken: string | undefined,
  menuItemId: string
): Promise<
  RawResponse<{ blockers?: { coupons: unknown[]; deals: unknown[] } }>
> {
  return apiRequestRaw(
    "DELETE",
    `/menu/menuItemId/${menuItemId}`,
    undefined,
    accessToken
  );
}

export function permanentlyDeleteMenuItemRaw(
  accessToken: string | undefined,
  menuItemId: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "DELETE",
    `/menu/menuItemId/${menuItemId}/permanent`,
    undefined,
    accessToken
  );
}

export function deleteMenuGroupRaw(
  accessToken: string | undefined,
  groupId: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "DELETE",
    `/menu/group/${groupId}`,
    undefined,
    accessToken
  );
}

/**
 * PUT /menu/menu-items/:id/changes — the deep editor's diff payload. Top-level
 * name/description/price plus modifierGroups {deleted:[ids], added:[groups],
 * modified:[{id,name,minSelections,maxSelections,pricingMode}]}. `menuItemId`
 * in the body must equal the param (400 otherwise).
 */
export interface MenuItemChanges {
  menuItemId: string;
  name?: string;
  description?: string;
  price?: number;
  weightOz?: number | null;
  modifierGroups?: {
    deleted?: string[];
    added?: ModifierGroupInput[];
    modified?: {
      id: string;
      name?: string;
      minSelections?: number;
      maxSelections?: number | null;
      pricingMode?: ModifierPricingMode;
    }[];
  };
}

export function applyMenuItemChangesRaw(
  accessToken: string | undefined,
  menuItemId: string,
  changes: MenuItemChanges | Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw(
    "PUT",
    `/menu/menu-items/${menuItemId}/changes`,
    changes,
    accessToken
  );
}

export async function applyMenuItemChanges(
  accessToken: string,
  menuItemId: string,
  changes: Omit<MenuItemChanges, "menuItemId">
): Promise<void> {
  const res = await applyMenuItemChangesRaw(accessToken, menuItemId, {
    menuItemId,
    ...changes,
  });
  if (!res.ok) {
    throw new Error(
      `PUT /menu/menu-items/${menuItemId}/changes → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
}

/** PUT /menu/menu-items/:id/modifier-order — nested id order; index becomes sortOrder. */
export function reorderModifiersRaw(
  accessToken: string | undefined,
  menuItemId: string,
  groups: {
    id: string;
    modifiers?: {
      id: string;
      childGroups?: { id: string; modifiers?: { id: string }[] }[];
    }[];
  }[]
): Promise<RawResponse> {
  return apiRequestRaw(
    "PUT",
    `/menu/menu-items/${menuItemId}/modifier-order`,
    { groups },
    accessToken
  );
}

/**
 * PATCH /menu/menu-items/:id/availability. Standalone / location-owned item →
 * writes MenuItem.outOfStock. Shared chain item → `restaurantId` REQUIRED and
 * only that location's MenuItemLocationOverride.isOutOfStock is written.
 */
export function setAvailabilityRaw(
  accessToken: string | undefined,
  menuItemId: string,
  body: { outOfStock?: boolean; restaurantId?: string }
): Promise<RawResponse> {
  return apiRequestRaw(
    "PATCH",
    `/menu/menu-items/${menuItemId}/availability`,
    body,
    accessToken
  );
}

export async function setAvailability(
  accessToken: string,
  menuItemId: string,
  outOfStock: boolean,
  restaurantId?: string
): Promise<void> {
  const res = await setAvailabilityRaw(accessToken, menuItemId, {
    outOfStock,
    ...(restaurantId ? { restaurantId } : {}),
  });
  if (!res.ok) {
    throw new Error(
      `PATCH availability ${menuItemId} → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
}

/**
 * POST /menu/menu-groups/:groupId/reset-availability. Without `restaurantId`
 * it clears the MASTER outOfStock flag for the group; with `restaurantId` (a
 * chain member's Menu tab) it clears ONLY that location's
 * MenuItemLocationOverride.isOutOfStock rows + the location's own items —
 * RestauNax #602 (2026-08-17).
 */
export function resetGroupAvailabilityRaw(
  accessToken: string | undefined,
  groupId: string,
  restaurantId?: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "POST",
    `/menu/menu-groups/${groupId}/reset-availability`,
    restaurantId ? { restaurantId } : {},
    accessToken
  );
}

/** PATCH /menu/menu-items/:id/featured {featured} — standalone cap 5; chain master items chain-wide. */
export function setFeaturedRaw(
  accessToken: string | undefined,
  menuItemId: string,
  featured: boolean
): Promise<RawResponse> {
  return apiRequestRaw(
    "PATCH",
    `/menu/menu-items/${menuItemId}/featured`,
    { featured },
    accessToken
  );
}

/** PATCH /menu/menu-items/:id/price-override {restaurantId, priceOverride|null} — SHARED chain items only. */
export function setPriceOverrideRaw(
  accessToken: string | undefined,
  menuItemId: string,
  body: { restaurantId?: string; priceOverride?: number | null }
): Promise<RawResponse> {
  return apiRequestRaw(
    "PATCH",
    `/menu/menu-items/${menuItemId}/price-override`,
    body,
    accessToken
  );
}

/**
 * PATCH /menu/menu-items/:id/location-pricing — base + per-modifier overrides
 * in one transaction. `basePriceOverride` undefined = untouched, null = clear;
 * modifier `priceOverride:null` deletes that row.
 */
export function setLocationPricingRaw(
  accessToken: string | undefined,
  menuItemId: string,
  body: {
    restaurantId?: string;
    basePriceOverride?: number | null;
    modifierOverrides?: { modifierId: string; priceOverride: number | null }[];
  }
): Promise<RawResponse> {
  return apiRequestRaw(
    "PATCH",
    `/menu/menu-items/${menuItemId}/location-pricing`,
    body,
    accessToken
  );
}

/** PATCH /menu/menu-items/:id/carried {restaurantId, isCarried} — SHARED chain items only. */
export function setCarriedRaw(
  accessToken: string | undefined,
  menuItemId: string,
  body: { restaurantId?: string; isCarried?: boolean }
): Promise<RawResponse> {
  return apiRequestRaw(
    "PATCH",
    `/menu/menu-items/${menuItemId}/carried`,
    body,
    accessToken
  );
}

/** POST /menu/restaurant/clone — {sourceRestaurantId, targetRestaurantId, cloneType, …}. */
export function cloneMenuRaw(
  accessToken: string | undefined,
  body: Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw("POST", "/menu/restaurant/clone", body, accessToken);
}

/**
 * Multipart upload of a menu item picture — POST /upload/menu/item/picture/:id
 * (multer field `item`, applied at mount level). Uses Node's global FormData /
 * Blob; bypasses apiRequestRaw's JSON body handling on purpose.
 */
export async function uploadMenuItemImageRaw(
  accessToken: string | undefined,
  menuItemId: string,
  file: { buffer: Buffer; filename: string; mimeType: string }
): Promise<RawResponse> {
  const form = new FormData();
  form.append(
    "item",
    new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
    file.filename
  );
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(
    `${BACKEND_URL}/upload/menu/item/picture/${menuItemId}`,
    {
      method: "POST",
      headers,
      body: form,
    }
  );
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  return { status: res.status, ok: res.ok, data };
}

export function deleteMenuItemImageRaw(
  accessToken: string | undefined,
  menuItemId: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "DELETE",
    `/upload/menu/item/picture/${menuItemId}`,
    undefined,
    accessToken
  );
}

/**
 * Public, stateless price quote — POST /api/order/:restaurantId/quote with the
 * same legacy checkout body the storefront submits ({orderItems:[{menuItemId,
 * quantity, selectedModifiers?}], orderType}). Returns {quote:{subtotal, tax,
 * amountToCharge, …}} — the server-authoritative "what will be charged", i.e.
 * the number that must reflect per-location price overrides.
 */
export interface QuoteDeal {
  dealId: string;
  quantity?: number;
  /** template-wind sends `orderDealItems`; the backend treats it as `items`. */
  items?: {
    menuItemId: string;
    quantity?: number;
    selectedModifiers?: { modifierId: string; quantity?: number }[];
    upchargeAmount?: number;
  }[];
  /** Client-precomputed fallback; ignored the moment modifier ids are sent. */
  upchargeAmount?: number;
  /** Money the client THINKS it pays — the engine ignores it (server-authoritative). */
  dealPrice?: number;
  dealName?: string;
}

export interface QuoteResponse {
  success?: boolean;
  quote?: {
    subtotal?: number;
    itemsSubtotal?: number;
    dealsSubtotal?: number;
    couponDiscount?: number;
    discountTotal?: number;
    tax?: number;
    amountToCharge?: number;
    total?: number;
    deals?: {
      dealId: string;
      dealName: string;
      dealPrice: number;
      quantity: number;
      upcharge: number;
      lineTotal: number;
      savings: number;
    }[];
  };
  issues?: { code: string; severity: string; message: string }[];
  message?: string;
}

/**
 * PUBLIC POST /api/order/:restaurantId/quote — the price the checkout will
 * charge. Accepts the legacy checkout body (orderItems / orderDeals / couponId)
 * exactly as template-wind sends it; every money field on it is ignored and
 * recomputed from the DB (server-authoritative pricing).
 */
export function quoteOrderRaw(
  restaurantId: string,
  body: {
    orderItems?: {
      menuItemId: string;
      quantity: number;
      selectedModifiers?: { modifierId: string; quantity?: number }[];
    }[];
    orderDeals?: QuoteDeal[];
    couponId?: string | null;
    couponCodeId?: string | null;
    orderType?: "PICKUP" | "DELIVERY";
  }
): Promise<RawResponse<QuoteResponse>> {
  return apiRequestRaw("POST", `/api/order/${restaurantId}/quote`, {
    orderType: "PICKUP",
    ...body,
  });
}

// ── Chains (RestaurantGroup) ─────────────────────────────────────────────────
//
// A chain IS a RestaurantGroup; membership is Restaurant.restaurantGroupId.
// Admin routes form/link/unlink (src/routes/admin/chainRoutes.ts); the owner
// reads its chains via GET /api/chains/owned (locationCount >= 2 only).

export interface ApiOwnedChain {
  /** The RestaurantGroup id (the payload key is `groupId`, not `id`). */
  groupId: string;
  name: string;
  ownerId?: string;
  locationCount: number;
  restaurants: { id: string; name: string }[];
}

export async function getOwnedChains(
  accessToken: string
): Promise<ApiOwnedChain[]> {
  const data = await apiRequest<{ chains?: ApiOwnedChain[] }>(
    "GET",
    "/api/chains/owned",
    undefined,
    accessToken
  );
  return data.chains ?? [];
}

/** POST /api/admin/chains {foundingRestaurantId, name} → {chain:{id,name}} (ADMIN/EMPLOYEE). */
export async function adminCreateChain(
  adminToken: string,
  foundingRestaurantId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const data = await apiRequest<{ chain: { id: string; name: string } }>(
    "POST",
    "/api/admin/chains",
    { foundingRestaurantId, name },
    adminToken
  );
  return data.chain;
}

/** POST /api/admin/chains/:gid/restaurants/:rid/link {seedMaster?, menu?: "keep"|"adopt"}. */
export function adminLinkRestaurantToChainRaw(
  adminToken: string,
  groupId: string,
  restaurantId: string,
  body: { seedMaster?: boolean; menu?: "keep" | "adopt" } = {}
): Promise<RawResponse> {
  return apiRequestRaw(
    "POST",
    `/api/admin/chains/${groupId}/restaurants/${restaurantId}/link`,
    body,
    adminToken
  );
}

/**
 * Give a restaurant 24-hour business hours if it has none — POST
 * /restaurant/hours?restaurantId=… (rows are {day, is24Hours}). The builder
 * page (/restaurant/restaurantId/:id, CreateStore) is a data-driven wizard
 * that shows its Business Hours step INSTEAD of the menu builder while a
 * restaurant has no hours, so fixture restaurants that tests open in the
 * builder must have hours.
 */
export async function ensureBusinessHours(
  accessToken: string,
  restaurantId: string
): Promise<void> {
  const data = await apiRequest<{
    restaurant?: { businessHours?: unknown[] };
  }>("GET", `/restaurant/restaurantId/${restaurantId}`, undefined, accessToken);
  if ((data.restaurant?.businessHours ?? []).length > 0) return;
  const days = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ];
  await apiRequest<unknown>(
    "POST",
    `/restaurant/hours?restaurantId=${restaurantId}`,
    { hoursOfOperation: days.map((day) => ({ day, is24Hours: true })) },
    accessToken
  );
}

/**
 * Give a restaurant a tax rate if it has none — PUT /api/restaurantId/:id/settings
 * {tax}. Chain-location provisioning leaves tax null and the public /quote
 * endpoint refuses to price ("hasn't set its tax rate yet"), so fixture
 * restaurants that any storefront/quote test touches need one. Owner
 * (or admin) token.
 */
export async function ensureTaxRate(
  accessToken: string,
  restaurantId: string,
  rate = 8
): Promise<void> {
  const data = await apiRequest<{ restaurant?: { tax?: number | null } }>(
    "GET",
    `/restaurant/restaurantId/${restaurantId}`,
    undefined,
    accessToken
  );
  if (data.restaurant?.tax != null) return;
  await apiRequest<unknown>(
    "PUT",
    `/api/restaurantId/${restaurantId}/settings`,
    { tax: rate },
    accessToken
  );
}

/** POST /api/admin/chains/:gid/restaurants/:rid/unlink → 200 {dissolved} | 400 anchor/established | 404. */
export function adminUnlinkRestaurantFromChainRaw(
  adminToken: string,
  groupId: string,
  restaurantId: string
): Promise<RawResponse<{ dissolved?: boolean; message?: string }>> {
  return apiRequestRaw(
    "POST",
    `/api/admin/chains/${groupId}/restaurants/${restaurantId}/unlink`,
    {},
    adminToken
  );
}

/** Persistent chain-fixture identity — see docs/MENU_TAB_TEST_STRATEGY.md §5 (Option A). */
export const AUTOMATION_CHAIN_NAME = "Automation Chain";
export const AUTOMATION_CHAIN_LOCATION_NAMES = [
  "Automation Chain Loc A",
  "Automation Chain Loc B",
] as const;

export interface AutomationChain {
  groupId: string;
  name: string;
  locationA: { id: string; name: string };
  locationB: { id: string; name: string };
}

/**
 * Create-if-missing: the seed OWNER's persistent two-location "Automation
 * Chain". Idempotent — first looks the chain up by name in the owner's
 * /api/chains/owned; only when absent does it (with the ADMIN token) create
 * two throwaway restaurants, assign the owner, form the chain from A (its
 * "Automation Chain Menu" group becomes the shared master) and link B.
 * Reuses same-named owned restaurants left by a partial earlier attempt.
 * Returns null when it cannot build (missing admin token) — callers skip.
 */
export async function ensureAutomationChain(
  ownerToken: string,
  ownerUserId: string,
  adminToken: string | undefined
): Promise<AutomationChain | null> {
  const toResult = (c: ApiOwnedChain): AutomationChain | null => {
    const [a, b] = [...c.restaurants].sort((x, y) =>
      x.name.localeCompare(y.name)
    );
    if (!a || !b) return null;
    return { groupId: c.groupId, name: c.name, locationA: a, locationB: b };
  };

  const withHours = async (chain: AutomationChain | null) => {
    if (!chain) return chain;
    for (const loc of [chain.locationA, chain.locationB]) {
      await ensureBusinessHours(ownerToken, loc.id).catch((err) =>
        console.warn(
          `[ensureAutomationChain] hours for ${loc.name} failed:`,
          err
        )
      );
      await ensureTaxRate(ownerToken, loc.id).catch((err) =>
        console.warn(`[ensureAutomationChain] tax for ${loc.name} failed:`, err)
      );
    }
    return chain;
  };

  const existing = (await getOwnedChains(ownerToken)).find(
    (c) => c.name === AUTOMATION_CHAIN_NAME && c.locationCount >= 2
  );
  if (existing) return withHours(toResult(existing));
  if (!adminToken) return null;

  const owned = await getOwnerRestaurants(ownerToken);
  const ids: string[] = [];
  for (const locName of AUTOMATION_CHAIN_LOCATION_NAMES) {
    const reuse = owned.find((r) => r.name === locName);
    if (reuse) {
      ids.push(reuse.id);
      continue;
    }
    const res = await createRestaurantRaw(adminToken, {
      name: locName,
      street: "200 Chain Street",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      cuisineType: "American",
      restaurantPhone: "3055550142",
      description:
        "Persistent Automation chain-menu fixture — do not edit by hand",
      minimumOrderPreparationTime: 0,
    });
    const id = (res.data as { restaurant?: { id?: string } })?.restaurant?.id;
    if (!id) {
      throw new Error(
        `[ensureAutomationChain] failed to create ${locName}: ${res.status} ${JSON.stringify(res.data)}`
      );
    }
    await assignRestaurantToUserApi(adminToken, ownerUserId, id);
    ids.push(id);
  }
  const [aId, bId] = ids as [string, string];

  // The founding store needs a menu — that group becomes the chain's shared master.
  const menusA = await getRestaurantMenuGroups(ownerToken, aId);
  if (!menusA.length) {
    await createMenuGroupNamed(ownerToken, "Automation Chain Menu", {
      restaurantId: aId,
    });
  }

  const chain = await adminCreateChain(adminToken, aId, AUTOMATION_CHAIN_NAME);
  const link = await adminLinkRestaurantToChainRaw(adminToken, chain.id, bId, {
    seedMaster: false,
  });
  if (!link.ok) {
    throw new Error(
      `[ensureAutomationChain] link B failed: ${link.status} ${JSON.stringify(link.data)}`
    );
  }
  // Re-resolve by name (not the create response's id) so a partially
  // materialised list can't hand back null after a successful build.
  const created = (await getOwnedChains(ownerToken)).find(
    (c) => c.name === AUTOMATION_CHAIN_NAME && c.locationCount >= 2
  );
  if (!created) {
    throw new Error(
      `[ensureAutomationChain] chain ${chain.id} created but not visible in /api/chains/owned`
    );
  }
  return withHours(toResult(created));
}

/**
 * Mint a per-run second OWNER (real user with a known password) that owns ONE
 * throwaway restaurant — used for tenant-isolation / IDOR contract tests without
 * a second credential in .env. Records the email for globalTeardown's user
 * sweep; the caller deletes the restaurant. Falls back to OWNER2_EMAIL/PASSWORD
 * when both are set.
 */
export async function createSecondOwner(
  adminToken: string,
  runId: string
): Promise<{
  accessToken: string;
  userId: string;
  email: string;
  restaurantId: string | null;
}> {
  const envEmail = process.env.OWNER2_EMAIL;
  const envPassword = process.env.OWNER2_PASSWORD;
  if (envEmail && envPassword) {
    const login = await apiLogin(envEmail, envPassword);
    const owned = await getOwnerRestaurants(login.accessToken);
    return {
      accessToken: login.accessToken,
      userId: login.userId,
      email: envEmail,
      restaurantId: owned[0]?.id ?? null,
    };
  }
  const domain = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";
  const email = `auto-owner2-${runId}@${domain}`;
  const password = "Automation!Owner2-" + runId;
  recordUserForCleanup(email);
  const user = await adminCreateUser(adminToken, {
    firstName: "Auto",
    lastName: "SecondOwner",
    email,
    password,
    role: "OWNER",
  });
  const res = await createRestaurantRaw(adminToken, {
    name: `Automation Owner2 Store ${runId}`,
    street: "300 Other Street",
    city: "Miami",
    state: "FL",
    zipCode: "33101",
    cuisineType: "Mexican",
    restaurantPhone: "3055550177",
    description: "Throwaway second-owner restaurant (IDOR contract tests)",
    minimumOrderPreparationTime: 0,
  });
  const restaurantId =
    (res.data as { restaurant?: { id?: string } })?.restaurant?.id ?? null;
  if (restaurantId)
    await assignRestaurantToUserApi(adminToken, user.id, restaurantId);
  const login = await apiLogin(email, password);
  return {
    accessToken: login.accessToken,
    userId: user.id,
    email,
    restaurantId,
  };
}

// ── Coupons ──────────────────────────────────────────────────────────────────

export interface ApiCoupon {
  id: string;
  code: string;
  /** CouponType enum, e.g. "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_DELIVERY". */
  type?: string;
  /** Discount value (Float). Percentage points or fixed amount per `type`. */
  value?: number;
  /** Minimum order subtotal before the coupon applies (required on FREE_DELIVERY). */
  minOrderAmount?: number | null;
  /** Discount/fee cap (on FREE_DELIVERY, "cover up to $X" of the fee). */
  maxDiscount?: number | null;
  /** "restaurant" | "organization" — org coupons are shared, never delete. */
  source?: string;
}

/** GET /api/coupons/restaurant/:id — response is { success, coupons: [...] }. */
export async function getRestaurantCoupons(
  accessToken: string,
  restaurantId: string
): Promise<ApiCoupon[]> {
  const data = await apiRequest<{ coupons?: ApiCoupon[] }>(
    "GET",
    `/api/coupons/restaurant/${restaurantId}`,
    undefined,
    accessToken
  );
  return data.coupons ?? [];
}

/** DELETE /api/coupons/:id — requires MODIFY_RESTAURANT (owner token). */
export async function deleteCouponApi(
  accessToken: string,
  couponId: string
): Promise<void> {
  await apiRequest<unknown>(
    "DELETE",
    `/api/coupons/${couponId}`,
    undefined,
    accessToken
  );
}

/**
 * Sweep all automation-created coupons (codes starting with `codePrefix`)
 * from a restaurant — this run's AND leftovers from interrupted runs.
 * Organization-level coupons are skipped. Best-effort per coupon.
 */
export async function deleteAutomationCoupons(
  accessToken: string,
  restaurantId: string,
  codePrefix = "AUTO"
): Promise<number> {
  const coupons = await getRestaurantCoupons(accessToken, restaurantId);
  let deleted = 0;
  for (const coupon of coupons) {
    if (!coupon.code?.startsWith(codePrefix)) continue;
    if (coupon.source === "organization") continue;
    try {
      await deleteCouponApi(accessToken, coupon.id);
      deleted++;
    } catch (err) {
      console.warn(
        `[apiHelper] Failed to delete coupon ${coupon.code} (${coupon.id}):`,
        err
      );
    }
  }
  return deleted;
}

// ── Deals ────────────────────────────────────────────────────────────────────
//
// POST /api/deals/restaurant/:id (MODIFY_RESTAURANT — the owner token has it).
// Body contract (backend CreateDealBody): {name, dealPrice, items:
// [{menuItemId, quantity, itemName, itemPrice, isRequired?, sortOrder?}],
// validDays?/validTimeStart?/validTimeEnd? ...} — omit the restrictions so a
// seeded deal is always active. AUTO-prefixed names get swept by
// deleteAutomationDeals in globalTeardown, mirroring the coupon sweep.

export interface ApiDealItem {
  id: string;
  menuItemId?: string | null;
  menuGroupId?: string | null;
  quantity: number;
  itemName: string;
  itemPrice: number;
  isRequired: boolean;
  sortOrder: number;
  menuItem?: {
    id: string;
    name: string;
    price: number;
    outOfStock?: boolean;
  } | null;
}

/**
 * A deal as the owner routes return it (create/get/list). Money fields are
 * SERVER-computed (originalPrice = Σ itemPrice, savingsAmount = max(0, orig −
 * deal), savingsPercentage 1 dp) — assert against them, never a hand sum.
 * `computedStatus` / `hasOutOfStockItem` / `isAvailable` are list-only
 * projections (GET /restaurant/:id) — see docs/DEALS_TAB_TEST_STRATEGY.md §3.6.
 */
export interface ApiDeal {
  id: string;
  name: string;
  description?: string | null;
  dealPrice?: number;
  originalPrice?: number;
  savingsAmount?: number;
  savingsPercentage?: number;
  status?: string;
  computedStatus?: string;
  hasOutOfStockItem?: boolean;
  isAvailable?: boolean;
  validDays?: string[];
  validTimeStart?: string | null;
  validTimeEnd?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  aiGenerated?: boolean;
  imageUrl?: string | null;
  imageStatus?: string | null;
  timesUsed?: number;
  totalRevenue?: number;
  restaurantId?: string | null;
  restaurantGroupId?: string | null;
  createdAt?: string;
  items?: ApiDealItem[];
}

/** Body of POST /api/deals/restaurant/:id and PUT /api/deals/:id (all optional on PUT). */
export interface DealBody {
  name?: string;
  description?: string;
  dealPrice?: number;
  items?: {
    menuItemId?: string;
    menuGroupId?: string;
    quantity: number;
    itemName?: string;
    itemPrice?: number;
    isRequired?: boolean;
    sortOrder?: number;
  }[];
  validDays?: string[];
  validTimeStart?: string;
  validTimeEnd?: string;
  startDate?: string;
  endDate?: string;
  targetAudience?: string;
  mealType?: string;
  occasion?: string;
  aiGenerated?: boolean;
  status?: string;
}

/** Raw deal create — create response is { success, message, deal }. */
export function createDealRaw(
  accessToken: string | undefined,
  restaurantId: string,
  body: Record<string, unknown> | DealBody
): Promise<RawResponse<{ deal?: ApiDeal; message?: string }>> {
  return apiRequestRaw(
    "POST",
    `/api/deals/restaurant/${restaurantId}`,
    body,
    accessToken
  );
}

/**
 * Throwing create for seeding: a fixed-price bundle of the given menu items
 * (`{id, name, price, quantity?}`), AUTO-prefixed name so globalTeardown's
 * sweep backstops the afterAll delete. No restrictions unless passed → the
 * deal is active now.
 */
export async function createDealApi(
  accessToken: string,
  restaurantId: string,
  name: string,
  dealPrice: number,
  items: { id: string; name: string; price: number; quantity?: number }[],
  extra: Partial<DealBody> = {}
): Promise<ApiDeal> {
  const res = await createDealRaw(accessToken, restaurantId, {
    name,
    description: "Automation deal — safe to delete",
    dealPrice,
    items: items.map((it, i) => ({
      menuItemId: it.id,
      quantity: it.quantity ?? 1,
      itemName: it.name,
      itemPrice: it.price,
      isRequired: true,
      sortOrder: i,
    })),
    ...extra,
  });
  if (!res.ok || !res.data?.deal) {
    throw new Error(
      `[apiHelper] deal seed failed: ${res.status} ${JSON.stringify(res.data)}`
    );
  }
  return res.data.deal;
}

/**
 * Like createDealApi, but tolerant of the 10-active cap (enforced on create
 * since RestauNax #618): when another concurrent spec is transiently holding
 * the restaurant at 10 active deals, retry until a slot frees. Use on the
 * SHARED seed restaurant; the throwaway-tenant specs don't need it.
 */
export async function createDealApiCapSafe(
  accessToken: string,
  restaurantId: string,
  name: string,
  dealPrice: number,
  items: { id: string; name: string; price: number; quantity?: number }[],
  extra: Partial<DealBody> = {},
  timeoutMs = 45_000
): Promise<ApiDeal> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await createDealRaw(accessToken, restaurantId, {
      name,
      description: "Automation deal — safe to delete",
      dealPrice,
      items: items.map((it, i) => ({
        menuItemId: it.id,
        quantity: it.quantity ?? 1,
        itemName: it.name,
        itemPrice: it.price,
        isRequired: true,
        sortOrder: i,
      })),
      ...extra,
    });
    if (res.ok && res.data?.deal) return res.data.deal;
    const capped =
      res.status === 400 &&
      (res.data as { error?: string })?.error === "MAX_ACTIVE_DEALS_REACHED";
    if (!capped || Date.now() > deadline) {
      throw new Error(
        `[apiHelper] cap-safe deal seed failed: ${res.status} ${JSON.stringify(res.data)}`
      );
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

/** GET /api/deals/:dealId — { success, deal }. */
export function getDealRaw(
  accessToken: string | undefined,
  dealId: string
): Promise<RawResponse<{ deal?: ApiDeal; message?: string }>> {
  return apiRequestRaw("GET", `/api/deals/${dealId}`, undefined, accessToken);
}

export async function getDealApi(
  accessToken: string,
  dealId: string
): Promise<ApiDeal> {
  const res = await getDealRaw(accessToken, dealId);
  if (!res.ok || !res.data?.deal) {
    throw new Error(
      `[apiHelper] getDeal failed: ${res.status} ${JSON.stringify(res.data)}`
    );
  }
  return res.data.deal;
}

/** PUT /api/deals/:dealId — patch semantics; `items` replaces every slot. */
export function updateDealRaw(
  accessToken: string | undefined,
  dealId: string,
  body: DealBody | Record<string, unknown>
): Promise<RawResponse<{ deal?: ApiDeal; message?: string }>> {
  return apiRequestRaw("PUT", `/api/deals/${dealId}`, body, accessToken);
}

/** PATCH /api/deals/:dealId/status {status: ACTIVE|INACTIVE}. */
export function setDealStatusRaw(
  accessToken: string | undefined,
  dealId: string,
  status: string
): Promise<
  RawResponse<{
    deal?: ApiDeal;
    message?: string;
    error?: string;
    maxActiveDeals?: number;
    currentActiveDeals?: number;
  }>
> {
  return apiRequestRaw(
    "PATCH",
    `/api/deals/${dealId}/status`,
    { status },
    accessToken
  );
}

export function deleteDealRaw(
  accessToken: string | undefined,
  dealId: string
): Promise<RawResponse<{ message?: string }>> {
  return apiRequestRaw(
    "DELETE",
    `/api/deals/${dealId}`,
    undefined,
    accessToken
  );
}

/** GET /api/deals/restaurant/:id — raw (authz pins need the status). */
export function getRestaurantDealsRaw(
  accessToken: string | undefined,
  restaurantId: string
): Promise<RawResponse<{ deals?: ApiDeal[] }>> {
  return apiRequestRaw(
    "GET",
    `/api/deals/restaurant/${restaurantId}`,
    undefined,
    accessToken
  );
}

/** GET /api/deals/restaurant/:id/active-count → {activeDealsCount, maxActiveDeals, slotsAvailable}. */
export function getActiveDealsCountRaw(
  accessToken: string | undefined,
  restaurantId: string
): Promise<
  RawResponse<{
    activeDealsCount?: number;
    maxActiveDeals?: number;
    slotsAvailable?: number;
  }>
> {
  return apiRequestRaw(
    "GET",
    `/api/deals/restaurant/${restaurantId}/active-count`,
    undefined,
    accessToken
  );
}

export interface DealStatsResponse {
  success?: boolean;
  summary?: {
    totalCount: number;
    activeCount: number;
    totalTimesUsed: number;
    totalRevenue: number;
    totalSavingsGiven: number;
    totalUpchargeRevenue?: number;
    averageOrderValueWithDeals: number;
  };
  topDeals?: {
    id: string;
    name: string;
    dealPrice: number;
    savingsPercentage: number;
    timesUsed: number;
    totalRevenue: number;
  }[];
  usageTrend?: unknown[];
  audienceDistribution?: { name: string; value: number }[];
}

/** GET /api/deals/restaurant/:id/stats (what the Deal Analytics tab renders). */
export function getDealStatsRaw(
  accessToken: string | undefined,
  restaurantId: string
): Promise<RawResponse<DealStatsResponse>> {
  return apiRequestRaw(
    "GET",
    `/api/deals/restaurant/${restaurantId}/stats`,
    undefined,
    accessToken
  );
}

/** GET /api/deals/ai/menu-items/:id — the deal-form item picker source. */
export function getDealMenuItemsRaw(
  accessToken: string | undefined,
  restaurantId: string
): Promise<
  RawResponse<{
    menuGroups?: {
      id: string;
      name: string;
      items: { id: string; name: string; price: number; outOfStock: boolean }[];
    }[];
    totalItems?: number;
  }>
> {
  return apiRequestRaw(
    "GET",
    `/api/deals/ai/menu-items/${restaurantId}`,
    undefined,
    accessToken
  );
}

/** POST /api/deals/restaurant/:id/bulk {deals:[...]} → {createdCount, enabledCount, inactiveCount, deals}. */
export function bulkCreateDealsRaw(
  accessToken: string | undefined,
  restaurantId: string,
  deals: DealBody[]
): Promise<
  RawResponse<{
    createdCount?: number;
    enabledCount?: number;
    inactiveCount?: number;
    maxActiveDeals?: number;
    deals?: ApiDeal[];
    message?: string;
    errors?: unknown[];
  }>
> {
  return apiRequestRaw(
    "POST",
    `/api/deals/restaurant/${restaurantId}/bulk`,
    { deals },
    accessToken
  );
}

/** PUBLIC GET /api/deals/restaurant/:id/active — what the storefront lists. */
export function getActiveDealsPublic(
  restaurantId: string
): Promise<RawResponse<{ deals?: ApiDeal[] }>> {
  return apiRequestRaw("GET", `/api/deals/restaurant/${restaurantId}/active`);
}

/** PUBLIC POST /api/deals/validate {dealId, restaurantId, selectedItems?}. */
export function validateDealPublic(body: {
  dealId?: string;
  restaurantId?: string;
  selectedItems?: {
    dealItemId?: string;
    menuItemId: string;
    menuItemName?: string;
    menuItemPrice?: number;
    quantity?: number;
  }[];
}): Promise<
  RawResponse<{
    isValid?: boolean;
    issues?: string[];
    message?: string;
    deal?: { id: string; dealPrice: number };
  }>
> {
  return apiRequestRaw("POST", "/api/deals/validate", body);
}

/** PUBLIC GET /api/deals/ai/questions — static questionnaire (no AI call). */
export function getAiDealQuestionsPublic(): Promise<
  RawResponse<{
    questions?: {
      id: string;
      question: string;
      options?: { value: string; label: string }[];
    }[];
  }>
> {
  return apiRequestRaw("GET", "/api/deals/ai/questions");
}

/** POST /api/chains/:groupId/deals — chain-scoped deal (requireChainOwner). */
export function createChainDealRaw(
  accessToken: string | undefined,
  groupId: string,
  body: DealBody | Record<string, unknown>
): Promise<RawResponse<{ deal?: ApiDeal; message?: string }>> {
  return apiRequestRaw(
    "POST",
    `/api/chains/${groupId}/deals`,
    body,
    accessToken
  );
}

/**
 * GET /api/order/:orderId — with an OWNER token the full order (incl. orderDeals
 * + orderDealItems, dealDiscountAmount, dealUpchargeAmount); anonymously the
 * PII-trimmed view. Used by the storefront hand-off to inspect a placed order.
 */
export function getOrderByIdRaw(
  accessToken: string | undefined,
  orderId: string
): Promise<
  RawResponse<{
    id?: string;
    status?: string;
    subtotal?: number;
    total?: number;
    dealDiscountAmount?: number | null;
    dealUpchargeAmount?: number | null;
    orderDeals?: {
      id: string;
      dealId: string | null;
      dealName: string;
      dealPrice: number;
      quantity: number;
      upchargeAmount: number | null;
      orderDealItems?: {
        menuItemId: string;
        menuItemName: string;
        quantity: number;
      }[];
    }[];
    orderItems?: { menuItemId: string; quantity: number }[];
  }>
> {
  return apiRequestRaw("GET", `/api/order/${orderId}`, undefined, accessToken);
}

/** GET /api/chains/:groupId/deals — { success, deals }. */
export function getChainDealsRaw(
  accessToken: string | undefined,
  groupId: string
): Promise<RawResponse<{ deals?: ApiDeal[] }>> {
  return apiRequestRaw(
    "GET",
    `/api/chains/${groupId}/deals`,
    undefined,
    accessToken
  );
}

/** GET /api/deals/restaurant/:id — response is { success, deals: [...] }. */
export async function getRestaurantDeals(
  accessToken: string,
  restaurantId: string
): Promise<ApiDeal[]> {
  const data = await apiRequest<{ deals?: ApiDeal[] }>(
    "GET",
    `/api/deals/restaurant/${restaurantId}`,
    undefined,
    accessToken
  );
  return data.deals ?? [];
}

/** DELETE /api/deals/:dealId — requires MODIFY_RESTAURANT (owner token). */
export async function deleteDealApi(
  accessToken: string,
  dealId: string
): Promise<void> {
  await apiRequest<unknown>(
    "DELETE",
    `/api/deals/${dealId}`,
    undefined,
    accessToken
  );
}

/**
 * Sweep all automation-created deals (names starting with `namePrefix`) from
 * a restaurant — this run's AND leftovers from interrupted runs. Best-effort
 * per deal; never throws past the per-deal warn.
 */
export async function deleteAutomationDeals(
  accessToken: string,
  restaurantId: string,
  namePrefix = "AUTO"
): Promise<number> {
  const deals = await getRestaurantDeals(accessToken, restaurantId);
  let deleted = 0;
  for (const deal of deals) {
    if (!deal.name?.startsWith(namePrefix)) continue;
    try {
      await deleteDealApi(accessToken, deal.id);
      deleted++;
    } catch (err) {
      console.warn(
        `[apiHelper] Failed to delete deal ${deal.name} (${deal.id}):`,
        err
      );
    }
  }
  return deleted;
}

// ── Gift Cards ───────────────────────────────────────────────────────────────
//
// Codes are server-generated (unlike client-chosen `AUTO*` coupon codes), so
// there's no prefix to sweep by. There's also no delete endpoint — only
// freeze (admin), which is the closest thing to cleanup. See
// testData.ts's gift-card cleanup-file pair + globalTeardown's freeze sweep.

export interface ApiGiftCard {
  id: string;
  /** Display-formatted with dashes on purchase; masked (****-****-****-XXXX) in admin list results. */
  code: string;
  initialBalance: number;
  currentBalance: number;
  status: "ACTIVE" | "DEPLETED" | "FROZEN";
}

export interface GiftCardConfig {
  isEnabled: boolean;
  presetDenominations: number[];
  allowCustomAmount: boolean;
  minCustomAmount: number;
  maxCustomAmount: number;
  canCombineWithCoupons: boolean;
}

/** GET /api/gift-cards/config/restaurant/:id — public, no auth. */
export async function getGiftCardConfig(
  restaurantId: string
): Promise<GiftCardConfig> {
  const data = await apiRequest<{ data: GiftCardConfig }>(
    "GET",
    `/api/gift-cards/config/restaurant/${restaurantId}`
  );
  return data.data;
}

/**
 * POST /api/gift-cards/purchase — public, no auth. `stripePaymentIntentId` is
 * stored as-is for Stripe-fee bookkeeping only; the backend never verifies it
 * against Stripe, so this can seed a valid, fully-funded gift card WITHOUT
 * driving the real purchase UI/Stripe iframe — the right way to fixture a
 * card for checkout-redemption tests (mirrors createCouponRaw's role for
 * coupons). The dedicated purchase-flow tests still drive the real UI.
 */
export async function purchaseGiftCard(body: {
  restaurantId: string;
  amount: number;
  deliveryMethod?: "EMAIL";
  recipientEmail?: string;
}): Promise<ApiGiftCard> {
  const data = await apiRequest<{ data: ApiGiftCard }>(
    "POST",
    "/api/gift-cards/purchase",
    { deliveryMethod: "EMAIL", ...body }
  );
  return data.data;
}

/** Raw purchase — for negative cases (e.g. amount out of config range → 400). */
export function purchaseGiftCardRaw(
  body: Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw("POST", "/api/gift-cards/purchase", {
    deliveryMethod: "EMAIL",
    ...body,
  });
}

/** GET /api/gift-cards/balance/:code — public, no auth. Throws on 404 (unknown code). */
export async function getGiftCardBalance(code: string): Promise<{
  currentBalance: number;
  initialBalance: number;
  status: "ACTIVE" | "DEPLETED" | "FROZEN";
}> {
  const data = await apiRequest<{
    data: {
      currentBalance: number;
      initialBalance: number;
      status: "ACTIVE" | "DEPLETED" | "FROZEN";
    };
  }>("GET", `/api/gift-cards/balance/${code}`);
  return data.data;
}

/** Raw balance check — for negative cases (e.g. nonexistent code → 404). */
export function getGiftCardBalanceRaw(code: string): Promise<RawResponse> {
  return apiRequestRaw("GET", `/api/gift-cards/balance/${code}`);
}

/**
 * Admin-only lookup: gift cards are found/adjusted/frozen by DB `id`, not
 * `code`, but tests only know the code from the purchase response. `search`
 * filters server-side on the raw (unmasked) code column before the response
 * masks it, so passing the full code here still finds the right row.
 */
export async function findGiftCardIdByCode(
  adminToken: string,
  code: string
): Promise<string> {
  // The DB stores the raw code with no separators; the UI-displayed/confirmed
  // code is dash-formatted ("XXXX-XXXX-XXXX-XXXX"), which never matches a
  // `contains` search against the raw column — strip non-alphanumerics first.
  const sanitized = code.replace(/[^A-Z0-9]/gi, "");
  const data = await apiRequest<{
    data: { giftCards: { id: string }[] };
  }>(
    "GET",
    `/api/admin/gift-cards?search=${encodeURIComponent(sanitized)}`,
    undefined,
    adminToken
  );
  const card = data.data.giftCards[0];
  if (!card) throw new Error(`No gift card found matching code ${code}`);
  return card.id;
}

/**
 * POST /api/admin/gift-cards/:id/adjust — `amount` is a DELTA added to
 * currentBalance (not an absolute target). To deplete a card to zero for a
 * negative-redemption test, pass `amount: -currentBalance`.
 */
export async function adjustGiftCardBalance(
  adminToken: string,
  giftCardId: string,
  amount: number,
  reason: string
): Promise<void> {
  await apiRequest<unknown>(
    "POST",
    `/api/admin/gift-cards/${giftCardId}/adjust`,
    { amount, reason },
    adminToken
  );
}

/** PATCH /api/admin/gift-cards/:id/freeze — no body. Used both by negative
 * redemption tests (seed a frozen card) and by the cleanup sweep. */
export async function freezeGiftCardApi(
  adminToken: string,
  giftCardId: string
): Promise<void> {
  await apiRequest<unknown>(
    "PATCH",
    `/api/admin/gift-cards/${giftCardId}/freeze`,
    undefined,
    adminToken
  );
}

// ── Demo requests ────────────────────────────────────────────────────────────

/**
 * DELETE the demo request matching `email` (exact, case-insensitive).
 * ADMIN-only route. Returns true if a matching request was found and deleted.
 * Used by globalTeardown so each run's seeded demo request doesn't accumulate.
 */
export async function deleteDemoRequestByEmail(
  adminToken: string,
  email: string
): Promise<boolean> {
  const data = await apiRequest<{ data?: { id: string; email: string }[] }>(
    "GET",
    `/api/demo-requests?q=${encodeURIComponent(email)}`,
    undefined,
    adminToken
  );
  const match = (data.data ?? []).find(
    (d) => d.email.toLowerCase() === email.toLowerCase()
  );
  if (!match) return false;
  await apiRequest<unknown>(
    "DELETE",
    `/api/demo-requests/${match.id}`,
    undefined,
    adminToken
  );
  return true;
}

/** Raw restaurant create — for negative cases (e.g. missing name → 400). */
export function createRestaurantRaw(
  accessToken: string,
  body: Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw("POST", "/restaurant/new", body, accessToken);
}

/** Raw demo-request submit — for negative cases (e.g. invalid email → 400). */
export function submitDemoRequestRaw(
  body: Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw("POST", "/api/demo-requests", body);
}

/** Raw menu item create — for negative cases (e.g. missing name → 400). */
export function createMenuItemRaw(
  accessToken: string,
  body: Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw("POST", "/menu/item/new", body, accessToken);
}

/** Raw coupon create — for negative cases (e.g. invalid discount → 400). */
export function createCouponRaw(
  accessToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse> {
  return apiRequestRaw(
    "POST",
    `/api/coupons/restaurant/${restaurantId}`,
    body,
    accessToken
  );
}

/** Shape of a successful /api/coupons/validate response (fields we assert on). */
export interface ValidateCouponResponse {
  success: boolean;
  discountAmount: number;
  /** FREE_DELIVERY fee-waiver estimate, sized from the deliveryFee sent. */
  deliveryDiscount?: number;
  coupon?: {
    id: string | null;
    code: string;
    type: string;
    maxDiscount?: number | null;
  };
  message?: string;
  error?: string;
}

/**
 * POST /api/coupons/validate — public (no auth), the endpoint every customer
 * client hits before applying a code. `serviceType` powers the FREE_DELIVERY
 * delivery-only gate; `deliveryFee` sizes the returned waiver estimate. Raw so
 * negative cases (pickup rejection) can assert on status.
 */
export function validateCouponRaw(
  body: Record<string, unknown>
): Promise<RawResponse<ValidateCouponResponse>> {
  return apiRequestRaw<ValidateCouponResponse>(
    "POST",
    "/api/coupons/validate",
    body
  );
}

// ── Orders & POS (tablet) ────────────────────────────────────────────────────
//
// Order seeding + the POS/tablet order-lifecycle surface. Backend specifics
// verified 2026-07-06, updated 2026-07-09:
//   • The backend now runs a server-side pricing guard on placeOrder (backend
//     commits 6205cefe/0d1cbb46, on QA since 2026-07-09): it recomputes the
//     subtotal from DB menu prices and rejects any claimed total below that
//     floor with 400 "Order Price Mismatch". The old total:0 seeding trick
//     (which yielded an instantly-paid order with no Stripe) is permanently
//     dead — seed orders must claim at least the items' real DB prices.
//     createSeededOrder below is the only remaining Stripe-free seed path.
//   • Order status routes accept free-form transitions from a flat allowlist
//     (not a state machine). Path param is :id.
//   • Tablet device create returns the plaintext login code ONCE. There is no
//     delete — devices are deactivated (toggle) for cleanup.

export interface ApiOrder {
  id: string;
  status: string;
  paymentStatus?: string;
  orderType?: string;
  total?: number;
}

export interface SeedOrderItem {
  menuItemId: string;
  name: string;
  price: number;
}

/**
 * GET /api/order/restaurants/:id/orders/current — the kitchen/POS live feed.
 * Staff/POS-only: pass a tablet JWT (mirrors the device) or an owner/admin
 * token with MODIFY_RESTAURANT. Normalizes the two documented shapes: a bare
 * array (normal) or { orders: [] } (no active business-day range).
 */
export async function getCurrentOrders(
  accessToken: string,
  restaurantId: string
): Promise<ApiOrder[]> {
  const data = await apiRequest<ApiOrder[] | { orders: ApiOrder[] }>(
    "GET",
    `/api/order/restaurants/${restaurantId}/orders/current`,
    undefined,
    accessToken
  );
  if (Array.isArray(data)) return data;
  return data.orders ?? [];
}

/**
 * PUT /api/order/orderId/:id/status — drive an order through the lifecycle.
 * Staff/POS-only: pass a tablet JWT or an owner/admin token with
 * MODIFY_RESTAURANT. The backend validates only membership in a flat allowlist,
 * so any transition between listed statuses is accepted. Returns the order.
 */
export async function updateOrderStatus(
  accessToken: string,
  orderId: string,
  status: string
): Promise<ApiOrder> {
  return apiRequest<ApiOrder>(
    "PUT",
    `/api/order/orderId/${orderId}/status`,
    { status },
    accessToken
  );
}

export interface SeedDeliveryAddress {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  deliveryNotes?: string;
}

export interface SeedOrderOpts {
  /** Claimed subtotal — only used to pass the pricing floor; the backend
   *  records the item's real DB price regardless (see createSeededOrder). */
  subtotal?: number;
  /** IGNORED by the backend — tax is recomputed from the restaurant's tax
   *  config. Kept for back-compat; read the real tax from the returned order. */
  tax?: number;
  /** Honoured verbatim. */
  tip?: number;
  /** Honoured only for DELIVERY/SHIPPING orders (and only when > 0). */
  deliveryFee?: number;
  total?: number;
  orderType?: "PICKUP" | "DELIVERY";
  /**
   * Status to bump the order to after creation (default CONFIRMED). Pass
   * `null` to leave the order in INITIALIZED (pre-payment placeholder) — used
   * to prove the owner-facing list excludes placeholders.
   */
  status?: string | null;
  customerEmail?: string;
  /**
   * 10 bare digits with digit[0] and digit[3] in 2-9 (NANP rules — the
   * backend's normalizePhone NULLs anything else, e.g. "5550000000"). Use
   * generateSeedPhone() from utils/testData. Stored and displayed as bare
   * digits, so search with the same string.
   */
  customerPhone?: string;
  firstName?: string;
  lastName?: string;
  specialInstructions?: string;
  /** Required for a meaningful DELIVERY seed (Delivery Info tab, CSV address). */
  deliveryAddress?: SeedDeliveryAddress;
  /** Omit name/email/phone entirely → the dashboard shows "Guest" / "N/A". */
  guest?: boolean;
  quantity?: number;
}

/**
 * Server-truth snapshot of a seeded order (the 201 body of placeOrder plus
 * the status we bumped it to). Money fields are what the pricing engine
 * actually recorded — assert against THESE, never against the opts you passed.
 */
export interface SeededOrder extends ApiOrder {
  receiptNumber: string;
  orderNumber?: number | null;
  subtotal: number;
  tax: number;
  tip: number;
  deliveryFee: number;
  total: number;
  paymentStatus?: string;
  orderType: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  specialInstructions?: string | null;
  deliveryAddress?: (SeedDeliveryAddress & { id?: string }) | null;
  orderItems?: Array<{
    id: string;
    menuItemId: string;
    menuItemName?: string;
    quantity: number;
    price: number;
  }>;
  customerId?: string | null;
  /** The email/phone/name we SENT (undefined for guest seeds). */
  seed: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  /** false when a DELIVERY seed had to fall back to deliveryFee:0 (tax policy). */
  deliveryFeeApplied: boolean;
}

/**
 * Create a *nonzero-revenue* order that counts in reports, WITHOUT Stripe.
 *
 * Two steps:
 *   1. POST the public new-order endpoint with real subtotal/total. A nonzero
 *      order is created in status INITIALIZED (the pre-payment placeholder),
 *      which reports, the owner Orders tab and the POS feed all exclude.
 *   2. PUT the status to an included status (default CONFIRMED) with an
 *      owner/admin token — the status endpoint validates only allowlist
 *      membership (no source-state check), so INITIALIZED→CONFIRMED is accepted.
 *      Pass `status: null` to skip this step.
 *
 * Money is SERVER-AUTHORITATIVE (pricing engine, verified 2026-08-15):
 *   • subtotal = the item's real DB price (claimed subtotal only has to clear
 *     the floor; a higher claim is ignored — TC-142 evidence 2026-07-11);
 *   • tax is RECOMPUTED from the restaurant's tax config (opts.tax ignored);
 *   • tip is honoured; deliveryFee is honoured only for DELIVERY and > 0;
 *   • total may include a processing fee if the restaurant opted in.
 * So the returned SeededOrder carries the recorded values — assert against
 * those (e.g. `formatCurrency(order.total)`), never a hand-computed sum.
 *
 * DELIVERY + deliveryFee > 0 can be rejected (400) when the restaurant's state
 * has an unsupported delivery-tax policy; we retry once with deliveryFee: 0 and
 * flag `deliveryFeeApplied: false` so tests can guard the fee-row assertion.
 *
 * Contact fields (firstName/lastName/email/phone/specialInstructions) are
 * persisted as an on-order snapshot AND on the Customer row, so search by any
 * of them works. Phone must follow the NANP rule documented on SeedOrderOpts.
 *
 * The order's createdAt is "now", so it lands in the current business day.
 * There is no order-delete API — seeded orders are permanent QA residue;
 * tests must assert on their OWN rows / on DELTAS, never absolute totals.
 */
export async function createSeededOrder(
  ownerToken: string,
  restaurantId: string,
  item: SeedOrderItem,
  opts: SeedOrderOpts = {}
): Promise<SeededOrder> {
  const quantity = opts.quantity ?? 1;
  const subtotal = opts.subtotal ?? item.price * quantity;
  const tax = opts.tax ?? 0;
  const tip = opts.tip ?? 0;
  const orderType = opts.orderType ?? "PICKUP";
  const status = opts.status === undefined ? "CONFIRMED" : opts.status;
  const seed = opts.guest
    ? {}
    : {
        email:
          opts.customerEmail ??
          `autoseed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@restaunax-test.com`,
        phone: opts.customerPhone ?? "5552000000",
        firstName: opts.firstName ?? "Auto",
        lastName: opts.lastName ?? "Seed",
      };

  const buildBody = (deliveryFee: number) => ({
    orderType,
    subtotal,
    tax,
    deliveryFee,
    tip,
    total: opts.total ?? subtotal + tax + tip + deliveryFee,
    ...(opts.guest
      ? {}
      : {
          customerEmail: seed.email,
          customerPhone: seed.phone,
          firstName: seed.firstName,
          lastName: seed.lastName,
        }),
    ...(opts.specialInstructions
      ? { specialInstructions: opts.specialInstructions }
      : {}),
    ...(opts.deliveryAddress ? { deliveryAddress: opts.deliveryAddress } : {}),
    orderItems: [
      {
        menuItemId: item.menuItemId,
        menuItemName: item.name,
        quantity,
        price: item.price,
      },
    ],
  });

  const requestedFee = opts.deliveryFee ?? 0;
  let deliveryFeeApplied = requestedFee > 0;
  let res = await apiRequestRaw<{ order?: SeededOrder } & SeededOrder>(
    "POST",
    `/api/order/new/restaurantId/${restaurantId}`,
    buildBody(requestedFee)
  );
  if (
    !res.ok &&
    res.status === 400 &&
    orderType === "DELIVERY" &&
    requestedFee > 0
  ) {
    // Tax-policy fallback (see doc comment) — retry without a delivery fee.
    deliveryFeeApplied = false;
    res = await apiRequestRaw<{ order?: SeededOrder } & SeededOrder>(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      buildBody(0)
    );
  }
  if (!res.ok) {
    const detail =
      typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    throw new Error(
      `API POST /api/order/new/restaurantId/${restaurantId} → ${res.status}: ${detail || "(no body)"}`
    );
  }
  const data = res.data;
  const order = (data.order ?? (data as SeededOrder)) as SeededOrder;
  if (status !== null) {
    await updateOrderStatus(ownerToken, order.id, status);
  }
  return {
    ...order,
    status: status ?? order.status,
    seed,
    deliveryFeeApplied,
  };
}

// ── Owner order-management API (Layer-1 contract tests) ─────────────────────
//
// Raw (non-throwing) wrappers around /api/order/statistics/* so specs can
// assert status codes + bodies directly. All need an owner/admin token.

export interface OrderListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  startDate?: string;
  endDate?: string;
  status?: string;
  orderType?: string;
  search?: string;
}

export interface OrderListResponse {
  orders: Array<
    ApiOrder & {
      receiptNumber?: string;
      orderNumber?: number | null;
      phone?: string | null;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      customer?: {
        phone?: string | null;
        email?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      } | null;
    }
  >;
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

function toQuery(params: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params) as Array<
    [string, string | number | undefined]
  >) {
    if (v !== undefined) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** GET /api/order/statistics/management/:restaurantId — the Orders-tab grid feed. */
export function listOrdersRaw(
  accessToken: string,
  restaurantId: string,
  params: OrderListParams = {}
): Promise<RawResponse<OrderListResponse>> {
  return apiRequestRaw<OrderListResponse>(
    "GET",
    `/api/order/statistics/management/${restaurantId}${toQuery(params)}`,
    undefined,
    accessToken
  );
}

export async function listOrders(
  accessToken: string,
  restaurantId: string,
  params: OrderListParams = {}
): Promise<OrderListResponse> {
  return apiRequest<OrderListResponse>(
    "GET",
    `/api/order/statistics/management/${restaurantId}${toQuery(params)}`,
    undefined,
    accessToken
  );
}

export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: Array<{ status: string; count: number }>;
  ordersByType: Array<{ type: string; count: number; revenue: number }>;
  topSellingItems: Array<{
    name: string;
    totalQuantity: number;
    totalRevenue: number;
  }>;
}

/** GET /api/order/statistics/restaurantId/:id — the Orders-tab header cards. */
export function getOrderStatsRaw(
  accessToken: string,
  restaurantId: string,
  range: { startDate?: string; endDate?: string } = {}
): Promise<RawResponse<OrderStats>> {
  return apiRequestRaw<OrderStats>(
    "GET",
    `/api/order/statistics/restaurantId/${restaurantId}${toQuery(range)}`,
    undefined,
    accessToken
  );
}

export async function getOrderStats(
  accessToken: string,
  restaurantId: string,
  range: { startDate?: string; endDate?: string } = {}
): Promise<OrderStats> {
  return apiRequest<OrderStats>(
    "GET",
    `/api/order/statistics/restaurantId/${restaurantId}${toQuery(range)}`,
    undefined,
    accessToken
  );
}

/**
 * Non-throwing status update. `via: "order"` = PUT /api/order/orderId/:id/status
 * (what the dashboard + POS call); `via: "statistics"` = the sibling
 * PUT /api/order/statistics/:id/status. Both share the same 9-value allowlist.
 */
export function updateOrderStatusRaw(
  accessToken: string,
  orderId: string,
  status: string,
  via: "order" | "statistics" = "order"
): Promise<RawResponse<Record<string, unknown>>> {
  const path =
    via === "order"
      ? `/api/order/orderId/${orderId}/status`
      : `/api/order/statistics/${orderId}/status`;
  return apiRequestRaw<Record<string, unknown>>(
    "PUT",
    path,
    { status },
    accessToken
  );
}

/** PUT /api/order/statistics/cancel/:orderId — the dashboard's Cancel Order path. */
export function cancelOrderRaw(
  accessToken: string,
  orderId: string,
  body: {
    reason?: string;
    reasonCode?: string;
    requestPhotos?: boolean;
    evidenceMode?: "OPTIONAL" | "REQUIRED";
    finalize?: boolean;
    rejectCancellation?: boolean;
  } = {}
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw<Record<string, unknown>>(
    "PUT",
    `/api/order/statistics/cancel/${orderId}`,
    body,
    accessToken
  );
}

/** POST /api/order/statistics/refund/:orderId — standalone (partial) refund. */
export function refundOrderRaw(
  accessToken: string,
  orderId: string,
  body: { amount?: number | string; reason?: string } = {}
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw<Record<string, unknown>>(
    "POST",
    `/api/order/statistics/refund/${orderId}`,
    body,
    accessToken
  );
}

/**
 * POST /api/order/statistics/export/:restaurantId — CSV export. On success
 * `data` is the raw CSV text (apiRequestOnce falls back to text when the
 * body isn't JSON); on 400 it's the JSON error body.
 */
export function exportOrdersRaw(
  accessToken: string,
  restaurantId: string,
  body: {
    exportType?: "current" | "last_30_days" | "last_90_days" | "all" | string;
    startDate?: string;
    endDate?: string;
    status?: string;
    orderType?: string;
    search?: string;
    sortBy?: string;
    sortDirection?: string;
  } = {}
): Promise<RawResponse<string | Record<string, unknown>>> {
  return apiRequestRaw<string | Record<string, unknown>>(
    "POST",
    `/api/order/statistics/export/${restaurantId}`,
    body,
    accessToken
  );
}

/**
 * GET /api/order/statistics/:orderId — the detail sheet's single-order fetch
 * (deep-link `?detailOrderId=`). 404 for unknown ids (looked up before the
 * ownership check), 403 when the token's owner doesn't control the order's
 * restaurant (RestauNax #621).
 */
export function getOrderDetailRaw(
  accessToken: string | undefined,
  orderId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw<Record<string, unknown>>(
    "GET",
    `/api/order/statistics/${orderId}`,
    undefined,
    accessToken
  );
}

/** GET /api/order/statistics/:orderId/receipt — printable receipt payload.
 *  Intended to share getOrderDetailRaw's 404-then-403 ordering, but as of
 *  2026-08-19 the handler 500s for EVERYONE (invalid Prisma select on the
 *  nonexistent Restaurant.street scalar) — pinned by TC-227b. */
export function getOrderReceiptRaw(
  accessToken: string | undefined,
  orderId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw<Record<string, unknown>>(
    "GET",
    `/api/order/statistics/${orderId}/receipt`,
    undefined,
    accessToken
  );
}

/**
 * GET /api/order/now — the unauthenticated all-orders dump DELETED in
 * RestauNax #621 (ORDERS_TAB_TEST_STRATEGY §1 #1). With the route gone,
 * "now" falls through to the public GET /api/order/:orderId matcher and is
 * treated as an order id → 404 ORDER_NOT_FOUND. Exists only for the TC-226
 * security pin.
 */
export function getOrdersNowRaw(
  accessToken?: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw<Record<string, unknown>>(
    "GET",
    "/api/order/now",
    undefined,
    accessToken
  );
}

/** KPI block from the daily-close report (data.comparisons.current). */
export interface DayKpis {
  from: string;
  to: string;
  orderCount: number;
  netSales: number;
  avgOrderValue: number;
  uniqueCustomers: number;
}

/**
 * GET /restaurant/:id/daily-close?include=report — the live current-business-day
 * report. Returns the headline KPIs (orderCount, netSales, …). `from`/`to` are
 * omitted so the backend applies its own business-day bounds (4 AM cutoff,
 * server-local) — the same window the seeded orders' createdAt falls in, which
 * makes the before/after delta deterministic regardless of the runner's tz.
 * Requires an owner/admin token (VIEW_RESTAURANT).
 */
export async function getDailyReportKpis(
  ownerToken: string,
  restaurantId: string
): Promise<DayKpis> {
  const res = await apiRequest<{
    data?: { comparisons?: { current?: DayKpis } };
  }>(
    "GET",
    `/restaurant/${restaurantId}/daily-close?include=report`,
    undefined,
    ownerToken
  );
  const current = res.data?.comparisons?.current;
  if (!current) {
    throw new Error(
      "getDailyReportKpis: response missing data.comparisons.current"
    );
  }
  return current;
}

export interface TabletDevice {
  id: string;
  name: string;
  /** Plaintext login code — the backend returns it only on create. */
  code: string;
}

/**
 * POST /api/tablet/restaurant/:id/device — provision a POS device.
 * Requires an owner/admin token (MODIFY_RESTAURANT). Device names are
 * GLOBALLY unique, so callers pass a run-unique name. The response carries the
 * plaintext code exactly once (stored encrypted thereafter).
 */
export async function createTabletDevice(
  ownerToken: string,
  restaurantId: string,
  name: string
): Promise<TabletDevice> {
  const data = await apiRequest<{ device: TabletDevice }>(
    "POST",
    `/api/tablet/restaurant/${restaurantId}/device`,
    { name },
    ownerToken
  );
  return data.device;
}

/** POST /api/tablet/login — tablet name + plaintext code → tablet JWT. */
export async function tabletLogin(name: string, code: string): Promise<string> {
  const data = await apiRequest<{ accessToken: string }>(
    "POST",
    "/api/tablet/login",
    { name, code }
  );
  return data.accessToken;
}

/**
 * PATCH .../device/:deviceId/toggle — deactivate a device. There is no delete
 * endpoint; deactivation is the cleanup path. Best-effort; never throws.
 */
export async function deactivateTabletDevice(
  ownerToken: string,
  restaurantId: string,
  deviceId: string
): Promise<void> {
  try {
    await apiRequestRaw(
      "PATCH",
      `/api/tablet/restaurant/${restaurantId}/device/${deviceId}/toggle`,
      undefined,
      ownerToken
    );
  } catch (err) {
    console.warn(
      `[apiHelper] Failed to deactivate tablet device ${deviceId}:`,
      err
    );
  }
}

// ── Owner table & reservation management ─────────────────────────────────────
//
// Feature: table-management-reservations-eager-teacup. Owner JWT auth; paths
// have NO /api prefix (same mount style as setOwnerPosPin / getDailyReportKpis
// above: /restaurant/:rid/...). All Raw — specs assert status codes/bodies.

/** GET /restaurant/:rid/tables — floor-plan data feed: tables, sections, and
 *  saved combinations. */
export function listTablesOwnerRaw(
  ownerToken: string,
  restaurantId: string
): Promise<
  RawResponse<{
    tables?: Record<string, unknown>[];
    sections?: Record<string, unknown>[];
    combinations?: Record<string, unknown>[];
  }>
> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/tables`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/tables {name, sectionId?, capacity?, minCapacity?,
 *  shape?, isBookable?, isActive?} — create a table. */
export function createTableOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/tables`,
    body,
    ownerToken
  );
}

/** PATCH /restaurant/:rid/tables/layout {tables:[{id,posX,posY,width,height,
 *  rotation,shape,sectionId}]} — bulk floor-plan save. NOTE: the server
 *  registers this literal path BEFORE /:tableId, so "layout" is never matched
 *  as a table id. */
export function saveTableLayoutOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  tables: Record<string, unknown>[]
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/restaurant/${restaurantId}/tables/layout`,
    { tables },
    ownerToken
  );
}

/** PATCH /restaurant/:rid/tables/:tableId — partial table update. */
export function updateTableOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  tableId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/restaurant/${restaurantId}/tables/${tableId}`,
    body,
    ownerToken
  );
}

/** DELETE /restaurant/:rid/tables/:tableId — data.deleted:true = hard
 *  delete, false = soft-deactivated (table has order/reservation history). */
export function deleteTableOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  tableId: string
): Promise<RawResponse<{ deleted?: boolean; message?: string }>> {
  return apiRequestRaw(
    "DELETE",
    `/restaurant/${restaurantId}/tables/${tableId}`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/tables/:tableId/merge {targetTableId} — merge a
 *  table into targetTableId. */
export function mergeTableOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  tableId: string,
  targetTableId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/tables/${tableId}/merge`,
    { targetTableId },
    ownerToken
  );
}

// ── Table sections ───────────────────────────────────────────────────────────

/** GET /restaurant/:rid/table-sections */
export function listTableSectionsOwnerRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse<{ sections?: Record<string, unknown>[] }>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/table-sections`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/table-sections {name, sortOrder?, color?} */
export function createTableSectionOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/table-sections`,
    body,
    ownerToken
  );
}

/** PATCH /restaurant/:rid/table-sections/:sectionId */
export function updateTableSectionOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  sectionId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/restaurant/${restaurantId}/table-sections/${sectionId}`,
    body,
    ownerToken
  );
}

/** DELETE /restaurant/:rid/table-sections/:sectionId */
export function deleteTableSectionOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  sectionId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/restaurant/${restaurantId}/table-sections/${sectionId}`,
    undefined,
    ownerToken
  );
}

// ── Table combinations ───────────────────────────────────────────────────────

/** GET /restaurant/:rid/table-combinations */
export function listTableCombinationsOwnerRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse<{ combinations?: Record<string, unknown>[] }>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/table-combinations`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/table-combinations {name, capacity, tableIds} */
export function createTableCombinationOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/table-combinations`,
    body,
    ownerToken
  );
}

/** PATCH /restaurant/:rid/table-combinations/:combinationId */
export function updateTableCombinationOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  combinationId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/restaurant/${restaurantId}/table-combinations/${combinationId}`,
    body,
    ownerToken
  );
}

/** DELETE /restaurant/:rid/table-combinations/:combinationId */
export function deleteTableCombinationOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  combinationId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/restaurant/${restaurantId}/table-combinations/${combinationId}`,
    undefined,
    ownerToken
  );
}

// ── Reservation settings ─────────────────────────────────────────────────────

/** Restaurant-level reservation config (RestaurantSettings-adjacent fields). */
export interface ReservationSettings {
  onlineBookingEnabled?: boolean;
  graceMinutes?: number;
  waitlistNotifyTimeoutMinutes?: number;
  reservedSoonLeadMinutes?: number;
  dirtyDecayMinutes?: number;
  defaultDurationMinutes?: number;
  minNoticeMinutes?: number;
  advanceBookingDays?: number;
  maxOpenReservationsPerPhone?: number;
  reminderLeadMinutes?: number;
  [key: string]: unknown;
}

/** GET /restaurant/:rid/reservation-settings */
export function getReservationSettingsOwnerRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse<ReservationSettings>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/reservation-settings`,
    undefined,
    ownerToken
  );
}

/** PUT /restaurant/:rid/reservation-settings — partial merge body. */
export function putReservationSettingsOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  patch: Partial<ReservationSettings>
): Promise<RawResponse<ReservationSettings>> {
  return apiRequestRaw(
    "PUT",
    `/restaurant/${restaurantId}/reservation-settings`,
    patch,
    ownerToken
  );
}

// ── Reservation service periods ──────────────────────────────────────────────

/** GET /restaurant/:rid/reservation-service-periods */
export function listReservationServicePeriodsOwnerRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse<{ servicePeriods?: Record<string, unknown>[] }>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/reservation-service-periods`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/reservation-service-periods {name, dayOfWeek,
 *  startTime, endTime, slotIntervalMinutes, maxCoversPerSlot?,
 *  maxPartiesPerSlot?, minPartySize?, maxPartySize?, isActive?} */
export function createReservationServicePeriodOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/reservation-service-periods`,
    body,
    ownerToken
  );
}

/** PATCH /restaurant/:rid/reservation-service-periods/:periodId */
export function updateReservationServicePeriodOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  periodId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/restaurant/${restaurantId}/reservation-service-periods/${periodId}`,
    body,
    ownerToken
  );
}

/** DELETE /restaurant/:rid/reservation-service-periods/:periodId */
export function deleteReservationServicePeriodOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  periodId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/restaurant/${restaurantId}/reservation-service-periods/${periodId}`,
    undefined,
    ownerToken
  );
}

// ── Reservation turn times ───────────────────────────────────────────────────

/** GET /restaurant/:rid/reservation-turn-times */
export function listReservationTurnTimesOwnerRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse<{ turnTimes?: Record<string, unknown>[] }>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/reservation-turn-times`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/reservation-turn-times */
export function createReservationTurnTimeOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/reservation-turn-times`,
    body,
    ownerToken
  );
}

/** PATCH /restaurant/:rid/reservation-turn-times/:turnTimeId */
export function updateReservationTurnTimeOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  turnTimeId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/restaurant/${restaurantId}/reservation-turn-times/${turnTimeId}`,
    body,
    ownerToken
  );
}

/** DELETE /restaurant/:rid/reservation-turn-times/:turnTimeId */
export function deleteReservationTurnTimeOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  turnTimeId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/restaurant/${restaurantId}/reservation-turn-times/${turnTimeId}`,
    undefined,
    ownerToken
  );
}

// ── Reservation date overrides ───────────────────────────────────────────────

/** GET /restaurant/:rid/reservation-date-overrides */
export function listReservationDateOverridesOwnerRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse<{ dateOverrides?: Record<string, unknown>[] }>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/reservation-date-overrides`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/reservation-date-overrides */
export function createReservationDateOverrideOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/reservation-date-overrides`,
    body,
    ownerToken
  );
}

/** DELETE /restaurant/:rid/reservation-date-overrides/:overrideId */
export function deleteReservationDateOverrideOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  overrideId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/restaurant/${restaurantId}/reservation-date-overrides/${overrideId}`,
    undefined,
    ownerToken
  );
}

// ── Reservations (dashboard/owner-created + list) ────────────────────────────

/** GET /restaurant/:rid/reservations?date=&status=&kind= — date is required
 *  by the backend; status/kind are optional filters. */
export function listReservationsOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  params: { date: string; status?: string; kind?: string }
): Promise<RawResponse<{ reservations?: Record<string, unknown>[] }>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/reservations${toQuery(params)}`,
    undefined,
    ownerToken
  );
}

/** POST /restaurant/:rid/reservations {kind?, partySize, scheduledAt,
 *  guestName, guestPhone, guestEmail?, guestNotes?, internalNotes?,
 *  clientRequestId?} */
export function createReservationOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/restaurant/${restaurantId}/reservations`,
    body,
    ownerToken
  );
}

/** PATCH /restaurant/:rid/reservations/:reservationId */
export function patchReservationOwnerRaw(
  ownerToken: string,
  restaurantId: string,
  reservationId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/restaurant/${restaurantId}/reservations/${reservationId}`,
    body,
    ownerToken
  );
}

// ── Table service (open checks) — the POS tab/* endpoint family ─────────────
//
// Feature reference: restaunax/docs/features/TABLE_SERVICE_OPEN_CHECKS.md.
// Flag-gated per restaurant (RestaurantSettings.tableServiceEnabled). Auth
// model: every endpoint needs a TABLET JWT; the ones that move money or edit
// an order additionally need an X-Staff-Session header (staff sign-in JWT).
// Cash legs are drawer-gated: the device must be REGISTER mode (admin-created
// devices default to REGISTER; OWNER-created ones default KITCHEN_DISPLAY and
// owners may not create REGISTER at all) with an OPEN register session
// assigned to the signed-in staff member.

/** Generic settings PUT — the backend merges arbitrary RestaurantSettings
 *  fields (creates the row when missing). Used to flip tableServiceEnabled. */
export async function updateRestaurantSettingsApi(
  accessToken: string,
  restaurantId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await apiRequest<unknown>(
    "PUT",
    `/api/restaurantId/${restaurantId}/settings`,
    patch,
    accessToken
  );
}

/**
 * POST /api/admin/addons/restaurants/:restaurantId/overrides {feature,
 * enabled, reason?} — admin force-enable/disable of one feature for one
 * restaurant, independent of its plan. 201 on create. First entitlement
 * override helper in this repo.
 */
export function setFeatureOverrideAdminRaw(
  adminToken: string,
  restaurantId: string,
  feature: string,
  enabled: boolean,
  reason?: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/api/admin/addons/restaurants/${restaurantId}/overrides`,
    { feature, enabled, ...(reason !== undefined ? { reason } : {}) },
    adminToken
  );
}

/**
 * DELETE /api/admin/addons/restaurants/:restaurantId/overrides/:feature —
 * remove the override, reverting the restaurant to its plan-derived
 * entitlement for that feature.
 */
export function deleteFeatureOverrideAdminRaw(
  adminToken: string,
  restaurantId: string,
  feature: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/api/admin/addons/restaurants/${restaurantId}/overrides/${feature}`,
    undefined,
    adminToken
  );
}

/**
 * POST /restaurant/:rid/staff/my-pin — set the owner's own POS PIN. Creates
 * (or reuses) their MANAGER membership and returns its staffMemberId, which is
 * what /api/tablet/staff/sign-in needs. PIN: 4–8 digits, not all-identical,
 * not sequential.
 */
export async function setOwnerPosPin(
  ownerToken: string,
  restaurantId: string,
  pin: string
): Promise<string> {
  const data = await apiRequest<{ data?: { staffMemberId?: string } }>(
    "POST",
    `/restaurant/${restaurantId}/staff/my-pin`,
    { pin },
    ownerToken
  );
  const id = data.data?.staffMemberId;
  if (!id) throw new Error("setOwnerPosPin: response missing staffMemberId");
  return id;
}

/** POST /api/tablet/staff/sign-in {staffMemberId, pin} → staff session JWT
 *  (12h TTL), sent on money/edit endpoints as X-Staff-Session. */
export async function tabletStaffSignIn(
  tabletToken: string,
  staffMemberId: string,
  pin: string
): Promise<string> {
  const data = await apiRequest<{ data?: { staffSessionToken?: string } }>(
    "POST",
    "/api/tablet/staff/sign-in",
    { staffMemberId, pin },
    tabletToken
  );
  const token = data.data?.staffSessionToken;
  if (!token)
    throw new Error("tabletStaffSignIn: response missing staffSessionToken");
  return token;
}

const staffHeaders = (staffSession: string): Record<string, string> => ({
  "X-Staff-Session": staffSession,
});

/** POST /api/tablet/register/open — open the device's cash drawer session
 *  (REGISTER-mode device; MANAGER self-authorizes OPEN_REGISTER). */
export async function openRegisterSessionPos(
  tabletToken: string,
  staffSession: string,
  openingFloat = 100
): Promise<string> {
  const res = await apiRequestRaw<{
    data?: { sessionId?: string };
    message?: string;
  }>(
    "POST",
    "/api/tablet/register/open",
    { openingFloat },
    tabletToken,
    staffHeaders(staffSession)
  );
  if (!res.ok || !res.data.data?.sessionId) {
    throw new Error(
      `openRegisterSessionPos → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
  return res.data.data.sessionId;
}

/** One settlement leg as the tab endpoints answer it (giftCardLast4, never the
 *  full code — wire contract with the POS build). */
export interface TabLeg {
  id: string;
  orderId?: string;
  purpose?: string;
  status: string;
  paymentMethod: string;
  amount: number;
  tipAmount: number | null;
  cashTendered?: number | null;
  cashChange?: number | null;
  stripePaymentIntentId?: string | null;
  giftCardId?: string | null;
  giftCardLast4?: string | null;
  clientRequestId?: string | null;
}

/** Shared response shape of every tab settlement endpoint:
 *  {leg, remaining, closed} — remaining is SERVER-computed AFTER the leg. */
export interface TabLegResponse {
  leg?: TabLeg | null;
  remaining?: number;
  closed?: boolean;
  cashChange?: number;
  cardBalance?: number | null;
  replayed?: boolean;
  paymentIntentId?: string;
  clientSecret?: string | null;
  amount?: number;
  fee?: number;
  message?: string;
  success?: boolean;
}

/** POST /api/tablet/create-order — raw (openCheck bodies included). Response
 *  201 {id, orderNumber: RECEIPT number, dailyOrderNumber, status, total}. */
export function createTabletOrderRaw(
  tabletToken: string,
  staffSession: string | undefined,
  body: Record<string, unknown>
): Promise<
  RawResponse<{
    id?: string;
    /** PERMANENT receipt number (legacy tablet wire name). */
    orderNumber?: string;
    /** Daily "Order #" (null for orders without one). */
    dailyOrderNumber?: number | null;
    status?: string;
    total?: number;
    message?: string;
  }>
> {
  return apiRequestRaw(
    "POST",
    "/api/tablet/create-order",
    body,
    tabletToken,
    staffSession ? staffHeaders(staffSession) : undefined
  );
}

export interface TabTableSummary {
  id: string;
  name: string;
  section: string | null;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  openChecks: {
    orderId: string;
    /** Daily "Order #" (platform naming rule — never the receipt). */
    orderNumber: number | null;
    /** Permanent "Receipt #". */
    receiptNumber: string;
    tabOpenedAt: string;
    remaining: number;
    serverName: string | null;
  }[];
}

/** GET /api/tablet/tables — the section-grouped picker grid with live
 *  open-check summaries. Tablet JWT only (no staff session needed). */
export function getTabletTablesRaw(
  tabletToken?: string
): Promise<RawResponse<{ tables?: TabTableSummary[]; message?: string }>> {
  return apiRequestRaw("GET", "/api/tablet/tables", undefined, tabletToken);
}

/** PATCH /api/tablet/orders/:id/tab/table {tableName} — table transfer. */
export function transferTabTableRaw(
  tabletToken: string,
  staffSession: string,
  orderId: string,
  tableName: string
): Promise<
  RawResponse<{
    success?: boolean;
    order?: { id: string; tableId: string | null; tableNumber: string | null };
    table?: { id: string; name: string; section: string | null };
    message?: string;
  }>
> {
  return apiRequestRaw(
    "PATCH",
    `/api/tablet/orders/${orderId}/tab/table`,
    { tableName },
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** PATCH /api/tablet/orders/:id/modify — full-replacement orderItems edit.
 *  On an unpaid tab the delta just moves Order.total (balanceDue stays 0). */
export function modifyTabletOrderRaw(
  tabletToken: string,
  staffSession: string,
  orderId: string,
  body: Record<string, unknown>
): Promise<
  RawResponse<{
    success?: boolean;
    order?: { id: string; total: number; subtotal: number; tip: number };
    delta?: number;
    balanceDue?: number;
    requiresAdditionalPayment?: number;
    message?: string;
  }>
> {
  return apiRequestRaw(
    "PATCH",
    `/api/tablet/orders/${orderId}/modify`,
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST …/tab/settle-cash {amount, cashTendered, tip?, idempotencyKey} —
 *  drawer-gated cash leg; idempotent per (orderId, idempotencyKey). */
export function settleTabCashRaw(
  tabletToken: string,
  staffSession: string,
  orderId: string,
  body: {
    amount?: number;
    cashTendered?: number;
    tip?: number;
    idempotencyKey?: string;
  }
): Promise<RawResponse<TabLegResponse>> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/orders/${orderId}/tab/settle-cash`,
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST …/tab/settle-gift-card {code, amount, idempotencyKey} — gift leg.
 *  NO tip allowed (400); not drawer-gated, so no staff session required. */
export function settleTabGiftCardRaw(
  tabletToken: string,
  orderId: string,
  body: {
    code?: string;
    amount?: number;
    tip?: number;
    idempotencyKey?: string;
  }
): Promise<RawResponse<TabLegResponse>> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/orders/${orderId}/tab/settle-gift-card`,
    body,
    tabletToken
  );
}

/** POST …/tab/create-terminal-intent {amount, tip?, readerId?} — start a card
 *  leg: PENDING OrderPayment + bound card_present PaymentIntent. */
export function createTabTerminalIntentRaw(
  tabletToken: string,
  orderId: string,
  body: { amount?: number; tip?: number; readerId?: string }
): Promise<RawResponse<TabLegResponse>> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/orders/${orderId}/tab/create-terminal-intent`,
    body,
    tabletToken
  );
}

/** POST …/tab/cancel-terminal-intent {paymentIntentId} — abandon a PENDING
 *  card leg (cancels the PI, flips the row FAILED). Idempotent. */
export function cancelTabTerminalIntentRaw(
  tabletToken: string,
  orderId: string,
  paymentIntentId: string
): Promise<RawResponse<TabLegResponse>> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/orders/${orderId}/tab/cancel-terminal-intent`,
    { paymentIntentId },
    tabletToken
  );
}

/** POST /api/tablet/cancel-order/:id {reason} — tab guard: blocked once any
 *  leg SUCCEEDED; a fresh (no settled legs) check cancels cleanly. */
export function cancelTabletOrderRaw(
  tabletToken: string,
  staffSession: string,
  orderId: string,
  reason: string
): Promise<
  RawResponse<{ success?: boolean; action?: string; message?: string }>
> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/cancel-order/${orderId}`,
    { reason },
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** GET /api/order/:orderId with an owner token — full order, loosely typed for
 *  the tab assertions (orderType, paymentStatus, table fields, tip, total). */
export function getOrderFullRaw(
  accessToken: string,
  orderId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw("GET", `/api/order/${orderId}`, undefined, accessToken);
}

// ── Table management & reservations — tablet host stand ──────────────────────
//
// Feature: table-management-reservations-eager-teacup. Device token only for
// /floor; device + staff (X-Staff-Session) for everything else here that
// touches host-stand state, table CRUD, or reservation lifecycle.

/** GET /api/tablet/floor — device token ONLY, no staff session required. */
export function getFloorRaw(
  tabletToken?: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw("GET", "/api/tablet/floor", undefined, tabletToken);
}

/** GET /api/tablet/host[?date=] — host-stand feed: reservations, waitlist,
 *  and table states for the given date (defaults server-side when omitted). */
export function getHostRaw(
  tabletToken: string,
  staffSession: string,
  date?: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "GET",
    `/api/tablet/host${toQuery({ date })}`,
    undefined,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/tables {name, sectionId?, capacity?, minCapacity?,
 *  isActive?} — create a table from the tablet host screen. */
export function createTableTabletRaw(
  tabletToken: string,
  staffSession: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    "/api/tablet/tables",
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** PATCH /api/tablet/tables/:tableId */
export function updateTableTabletRaw(
  tabletToken: string,
  staffSession: string,
  tableId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "PATCH",
    `/api/tablet/tables/${tableId}`,
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/tables/:tableId/state {state: "DIRTY"|"BLOCKED"|"CLEAR"}. */
export function setTableStateTabletRaw(
  tabletToken: string,
  staffSession: string,
  tableId: string,
  state: "DIRTY" | "BLOCKED" | "CLEAR"
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/tables/${tableId}/state`,
    { state },
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/reservations {kind?, partySize, guestName, guestPhone,
 *  scheduledAt?, quotedWaitMinutes?, guestNotes?, clientRequestId?} — create
 *  a reservation or waitlist entry from the host stand. */
export function createReservationTabletRaw(
  tabletToken: string,
  staffSession: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    "/api/tablet/reservations",
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/reservations/:id/notify */
export function notifyReservationTabletRaw(
  tabletToken: string,
  staffSession: string,
  reservationId: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/reservations/${reservationId}/notify`,
    undefined,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/reservations/:id/status {action: "confirm"|"arrive"|
 *  "partially_seat"|"no_show"|"cancel"|"complete"} — lifecycle transition. */
export function reservationStatusTabletRaw(
  tabletToken: string,
  staffSession: string,
  reservationId: string,
  action:
    | "confirm"
    | "arrive"
    | "partially_seat"
    | "no_show"
    | "cancel"
    | "complete"
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/reservations/${reservationId}/status`,
    { action },
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/reservations/:id/seat {tableIds, guestCount?,
 *  clientRequestId?} — seat a reservation; response carries
 *  {reservation, prefill} (prefill feeds the create-order screen). */
export function seatReservationTabletRaw(
  tabletToken: string,
  staffSession: string,
  reservationId: string,
  body: { tableIds: string[]; guestCount?: number; clientRequestId?: string }
): Promise<
  RawResponse<{
    reservation?: Record<string, unknown>;
    prefill?: Record<string, unknown>;
    message?: string;
  }>
> {
  return apiRequestRaw(
    "POST",
    `/api/tablet/reservations/${reservationId}/seat`,
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

// ── Public reservations (no auth) ────────────────────────────────────────────

/** GET /api/public/restaurants/:rid/reservation-availability?date=&partySize=
 *  — the storefront/booking-widget availability check. */
export function getPublicAvailabilityRaw(
  restaurantId: string,
  date: string,
  partySize: number
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "GET",
    `/api/public/restaurants/${restaurantId}/reservation-availability${toQuery({
      date,
      partySize,
    })}`,
    undefined
  );
}

/** POST /api/public/restaurants/:rid/reservations {guestName, guestPhone,
 *  partySize, scheduledAt, guestEmail?, guestNotes?, clientRequestId?} —
 *  guest self-service booking. */
export function createPublicReservationRaw(
  restaurantId: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    `/api/public/restaurants/${restaurantId}/reservations`,
    body
  );
}

/** GET /api/public/reservations/manage/:manageToken — guest self-manage view
 *  (the link sent by the confirmation SMS/email). */
export function getManagedReservationRaw(
  manageToken: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "GET",
    `/api/public/reservations/manage/${manageToken}`,
    undefined
  );
}

/** DELETE /api/public/reservations/manage/:manageToken — guest self-cancel. */
export function cancelManagedReservationRaw(
  manageToken: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "DELETE",
    `/api/public/reservations/manage/${manageToken}`,
    undefined
  );
}

// ── Register (device + staff) ────────────────────────────────────────────────

/** GET /api/tablet/register/status */
export function getRegisterStatusPosRaw(
  tabletToken: string,
  staffSession: string
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "GET",
    "/api/tablet/register/status",
    undefined,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/register/open {openingFloat, managerPin?, note?} — RAW
 *  sibling of openRegisterSessionPos above, for specs that need to assert
 *  400s (e.g. a session already open, or a non-REGISTER-mode device). */
export function openRegisterSessionPosRaw(
  tabletToken: string,
  staffSession: string,
  body: { openingFloat: number; managerPin?: string; note?: string }
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    "/api/tablet/register/open",
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

/** POST /api/tablet/register/close {countedCash, dropAmount?, managerPin?,
 *  note?} — blind-count reconciliation. Response {sessionId, expectedCash,
 *  countedCash, overShort}. */
export function closeRegisterSessionPosRaw(
  tabletToken: string,
  staffSession: string,
  body: {
    countedCash: number;
    dropAmount?: number;
    managerPin?: string;
    note?: string;
  }
): Promise<
  RawResponse<{
    sessionId?: string;
    expectedCash?: number;
    countedCash?: number;
    overShort?: number;
    message?: string;
  }>
> {
  return apiRequestRaw(
    "POST",
    "/api/tablet/register/close",
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

// ── Staff manage (device + staff, needs MANAGE_STAFF / MANAGER session) ─────

/** POST /api/tablet/staff/manage {firstName, lastName, pin, staffRole,
 *  capabilityGrants?, capabilityRevokes?} — mint a PIN-only staff member.
 *  201; used to create a STAFF-role member for negative capability tests. */
export function createPinStaffTabletRaw(
  tabletToken: string,
  staffSession: string,
  body: Record<string, unknown>
): Promise<RawResponse<Record<string, unknown>>> {
  return apiRequestRaw(
    "POST",
    "/api/tablet/staff/manage",
    body,
    tabletToken,
    staffHeaders(staffSession)
  );
}

// ── Admin user management ────────────────────────────────────────────────────
//
// Helpers for tests/dashboard/admin/users.spec.ts. They seed/inspect/clean up
// users via the backend so the UI tests can confirm server-side effects, and
// so the invite→claim→login journey can run without a browser for the
// out-of-tab parts. Note: the invite endpoint never returns the token — it is
// delivered only by email (extract it with emailHelper.extractInviteToken).

/** Result of a request that may legitimately be non-2xx (negative tests). */
export interface RawResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
}

// Transient statuses worth retrying: gateway/availability blips from the
// shared QA infra. Deliberately EXCLUDES 500 — negative tests assert on 500s
// (they're usually deterministic backend bugs, e.g. the TC-92 coupon edit),
// and retrying them would only slow the failure down.
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [1_000, 3_000];

/**
 * Like apiRequest, but returns the status/body instead of throwing on non-2xx.
 * Retries transient failures (network error, timeout, 502/503/504) up to
 * MAX_RETRIES times with backoff — a single QA gateway blip during
 * setup/teardown shouldn't abort the whole run or leak cleanup.
 */
async function apiRequestRaw<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string,
  extraHeaders?: Record<string, string>
): Promise<RawResponse<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BACKOFF_MS[attempt - 1] ?? 3_000;
      console.warn(
        `[apiHelper] transient failure on ${method} ${path} — retry ${attempt}/${MAX_RETRIES} in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      const res = await apiRequestOnce<T>(
        method,
        path,
        body,
        accessToken,
        extraHeaders
      );
      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        lastError = new Error(`API ${method} ${path} → ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) continue;
    }
  }
  throw lastError;
}

/** Single-shot fetch — retry policy lives in apiRequestRaw above. */
async function apiRequestOnce<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string,
  extraHeaders?: Record<string, string>
): Promise<RawResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders ?? {}),
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${BACKEND_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          `API ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms. ` +
            `Is BACKEND_URL=${BACKEND_URL} correct and reachable?`
        );
      }
      throw err;
    }
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* leave as text */
    }
    return { status: res.status, ok: res.ok, data: data as T };
  } finally {
    clearTimeout(timer);
  }
}

export interface InviteUserBody {
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  restaurantId?: string;
}

export interface InviteUserResult {
  id: string;
  email: string;
  role: string;
  restaurantId: string | null;
  expiresAt: string;
}

/** POST /api/admin/users/invite — seed an invitation. Token is NOT returned. */
export async function inviteUserApi(
  adminToken: string,
  body: InviteUserBody
): Promise<InviteUserResult> {
  const data = await apiRequest<{ invitation: InviteUserResult }>(
    "POST",
    "/api/admin/users/invite",
    body,
    adminToken
  );
  return data.invitation;
}

export interface AdminCreateUserBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
}

/**
 * POST /api/admin/users — create a real User directly (no email/claim needed).
 * Used to seed a deletable target row for the side-sheet mutation tests, with a
 * known password so the same account can also drive a UI login. Returns the new
 * user's id + email.
 */
export async function adminCreateUser(
  adminToken: string,
  body: AdminCreateUserBody
): Promise<{ id: string; email: string }> {
  const data = await apiRequest<{ user: { id: string; email: string } }>(
    "POST",
    "/api/admin/users",
    body,
    adminToken
  );
  return data.user;
}

/** Raw invite — for negative cases (e.g. duplicate email → 400). */
export function inviteUserRaw(
  adminToken: string,
  body: InviteUserBody
): Promise<RawResponse> {
  return apiRequestRaw("POST", "/api/admin/users/invite", body, adminToken);
}

export interface AdminUserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  ownedRestaurants?: { id: string; name: string }[];
}

/** GET /api/admin/users[?q=] — list users (optionally filtered by search). */
export async function adminListUsers(
  adminToken: string,
  q?: string
): Promise<AdminUserListItem[]> {
  const path = q
    ? `/api/admin/users?q=${encodeURIComponent(q)}`
    : "/api/admin/users";
  const data = await apiRequest<{ users: AdminUserListItem[] }>(
    "GET",
    path,
    undefined,
    adminToken
  );
  return data.users ?? [];
}

/** Raw role change — for negative cases (e.g. a nonexistent role name → 400). */
export function updateUserRoleRaw(
  adminToken: string,
  userId: string,
  role: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "PUT",
    `/api/roles/users/${userId}`,
    { role },
    adminToken
  );
}

/** Raw toggle-status — for negative cases (e.g. a nonexistent user id → 404). */
export function toggleUserStatusRaw(
  adminToken: string,
  userId: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "PUT",
    `/api/admin/users/${userId}/toggle-status`,
    undefined,
    adminToken
  );
}

/** GET /api/admin/users/:id — full user detail (role, isActive, restaurants…). */
export function adminGetUser(
  adminToken: string,
  userId: string
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(
    "GET",
    `/api/admin/users/${userId}`,
    undefined,
    adminToken
  );
}

// ── Roles & permissions (always discovered dynamically — never hardcode) ─────

/** GET /api/roles — available role names (normalizes string|{name} shapes). */
export async function getRoles(token: string): Promise<string[]> {
  const data = await apiRequest<{ roles: (string | { name: string })[] }>(
    "GET",
    "/api/roles",
    undefined,
    token
  );
  return (data.roles ?? []).map((r) => (typeof r === "string" ? r : r.name));
}

/** GET /api/roles/:role/permissions — the default permissions for a role. */
export async function getRolePermissions(
  token: string,
  role: string
): Promise<string[]> {
  const data = await apiRequest<{ permissions: string[] }>(
    "GET",
    `/api/roles/${role}/permissions`,
    undefined,
    token
  );
  return data.permissions ?? [];
}

export interface UserPermissionsResult {
  rolePermissions: string[];
  userSpecificPermissions: { id: string; permission: string }[];
  availablePermissions: string[];
}

/** GET /api/roles/users/:id/permissions — a user's role + specific + available. */
export function getUserPermissions(
  adminToken: string,
  userId: string
): Promise<UserPermissionsResult> {
  return apiRequest<UserPermissionsResult>(
    "GET",
    `/api/roles/users/${userId}/permissions`,
    undefined,
    adminToken
  );
}

// ── Invite claim (registration) + access-level check ─────────────────────────

export interface RegisterWithInviteBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  userInvitationToken: string;
}

export interface RegisterResult {
  accessToken: string;
  userId: string;
  role: string;
  permissions: string[];
  restaurant: { id: string; name: string } | null;
}

/**
 * POST /register — claim a role-based invite as a NEW user. The backend mounts
 * register at /register (no /api prefix), matching the frontend. We try
 * /register first and fall back to /api/register defensively. Returns a 201
 * LoginRegisterResponse with the granted role + permissions.
 */
export async function registerWithInvite(
  body: RegisterWithInviteBody
): Promise<RegisterResult> {
  let res = await apiRequestRaw<RegisterResult & { message?: string }>(
    "POST",
    "/register",
    body
  );
  if (res.status === 404) {
    res = await apiRequestRaw<RegisterResult & { message?: string }>(
      "POST",
      "/api/register",
      body
    );
  }
  if (!res.ok) {
    throw new Error(
      `registerWithInvite failed → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
  return res.data;
}

export interface PlainRegisterBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/**
 * POST /register — plain self-serve sign-up, no invite token. A fresh account
 * registers as role USER with only VIEW_RESTAURANT (confirmed live) — it does
 * NOT become OWNER until the user creates a restaurant. Used for setup/cleanup
 * in sign-up tests; UI-level negative cases (duplicate email, password
 * mismatch, weak password) are driven through the browser instead, matching
 * how the live form actually validates them.
 */
export async function register(
  body: PlainRegisterBody
): Promise<RegisterResult> {
  let res = await apiRequestRaw<RegisterResult & { message?: string }>(
    "POST",
    "/register",
    body
  );
  if (res.status === 404) {
    res = await apiRequestRaw<RegisterResult & { message?: string }>(
      "POST",
      "/api/register",
      body
    );
  }
  if (!res.ok) {
    throw new Error(
      `register failed → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
  return res.data;
}

/** Raw register — for negative cases (e.g. garbage invite token). */
export async function registerRaw(
  body: RegisterWithInviteBody
): Promise<RawResponse<RegisterResult & { message?: string }>> {
  let res = await apiRequestRaw<RegisterResult & { message?: string }>(
    "POST",
    "/register",
    body
  );
  if (res.status === 404) {
    res = await apiRequestRaw("POST", "/api/register", body);
  }
  return res;
}

export interface MeResult {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  isActive?: boolean;
}

/**
 * The authenticated user's role + permissions (access level). Tries
 * /api/auth/me, falling back to /api/users/me. Both return the user (with a
 * merged permissions array); shapes are { user } or flat — tolerate both.
 */
export async function getMe(accessToken: string): Promise<MeResult> {
  let res = await apiRequestRaw<{ user?: MeResult } & Partial<MeResult>>(
    "GET",
    "/api/auth/me",
    undefined,
    accessToken
  );
  if (res.status === 404) {
    res = await apiRequestRaw("GET", "/api/users/me", undefined, accessToken);
  }
  if (!res.ok) {
    throw new Error(
      `getMe failed → ${res.status}: ${JSON.stringify(res.data)}`
    );
  }
  return (res.data.user ?? (res.data as MeResult)) as MeResult;
}

// ── User cleanup ─────────────────────────────────────────────────────────────

/** DELETE /api/admin/users/:id — best-effort (400 if the user owns restaurants). */
export function deleteUserApi(
  adminToken: string,
  userId: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "DELETE",
    `/api/admin/users/${userId}`,
    undefined,
    adminToken
  );
}

/** Find a user by exact email and delete it. Best-effort; never throws. */
export async function deleteUserByEmail(
  adminToken: string,
  email: string
): Promise<void> {
  try {
    const users = await adminListUsers(adminToken, email);
    const match = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (match) await deleteUserApi(adminToken, match.id);
  } catch (err) {
    console.warn(`[apiHelper] deleteUserByEmail(${email}) failed:`, err);
  }
}

/** Drain the recorded-users cleanup file: delete each user, then clear the file. */
export async function deleteRecordedUsers(adminToken: string): Promise<void> {
  const emails = readUsersForCleanup();
  for (const email of emails) {
    await deleteUserByEmail(adminToken, email);
  }
  clearUsersForCleanup();
}

/**
 * POST /api/user-restaurants/assign-restaurant — sets Restaurant.ownerId and
 * promotes the target user's role USER→OWNER server-side (see
 * assignRestaurantToUser in restaunax-backend). Called via API, not the
 * dashboard UI: confirmed by direct source read (2026-07-11) that the only
 * frontend components referencing this endpoint (UserRestaurantList.tsx,
 * AssignRestaurantDialog.tsx) are dead code — imported nowhere — and the
 * "Restaurants" tab that would host an assign action is never rendered for
 * Role.USER in the first place (UserDetailsModal.tsx's ROLE_CONFIG only
 * grants that tab to OWNER/EMPLOYEE). There is currently no UI path to
 * complete this step — see TEST_COVERAGE.md's Known Technical Debt.
 *
 * Tolerates a specific known false-negative: the controller runs the
 * ownerId/role DB writes BEFORE sending a "you've been assigned a
 * restaurant" welcome email, and the two aren't in one transaction — any
 * email-provider failure throws from inside the same try block and the
 * whole request 500s, even though the assignment already succeeded.
 * Confirmed live 2026-07-11 (real backend bug, written up for the
 * frontend/backend team — see TEST_COVERAGE.md). The non-transactional bug
 * is unfixed; only its most common trigger (the metered Mailtrap sandbox's
 * send quota) went away when QA moved to Mailpit. Callers should verify the
 * real outcome (e.g. the owner can see the restaurant) rather than trust
 * this call's success alone.
 */
export async function assignRestaurantToUserApi(
  adminToken: string,
  userId: string,
  restaurantId: string
): Promise<void> {
  const res = await apiRequestRaw<{ message?: string }>(
    "POST",
    "/api/user-restaurants/assign-restaurant",
    { userId, restaurantId },
    adminToken
  );
  if (res.ok) return;
  const detail =
    typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  if (res.status === 500 && /email limit is reached/i.test(detail)) {
    console.warn(
      "[apiHelper] assignRestaurantToUserApi: DB write likely succeeded despite a 500 " +
        "from the welcome-email send failing — known backend bug, proceeding."
    );
    return;
  }
  throw new Error(
    `API POST /api/user-restaurants/assign-restaurant → ${res.status}: ${detail}`
  );
}

/** Look up a user's id by exact email (admin token required). */
export async function findUserIdByEmail(
  adminToken: string,
  email: string
): Promise<string | undefined> {
  const users = await adminListUsers(adminToken, email);
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.id;
}

// ── Marketing: events, org coupons, lifecycle automations ────────────────────
// API-level fixtures + verification for the marketing suites
// (tests/dashboard/admin/marketing-*.spec.ts, owner 16-marketing-automations).

export interface ApiMarketingEvent {
  id: string;
  name: string;
  eventDate: string;
  isRecurring: boolean;
  status?: string;
  couponId?: string | null;
}

export async function getMarketingEventsApi(
  adminToken: string,
  filter: "upcoming" | "past" | "all" = "all"
): Promise<ApiMarketingEvent[]> {
  const data = await apiRequest<{ events: ApiMarketingEvent[] }>(
    "GET",
    `/api/marketing/events?filter=${filter}`,
    undefined,
    adminToken
  );
  return data.events ?? [];
}

export async function createMarketingEventApi(
  adminToken: string,
  input: {
    name: string;
    eventDate: string;
    couponId?: string;
    isRecurring?: boolean;
  }
): Promise<ApiMarketingEvent> {
  const data = await apiRequest<{ event: ApiMarketingEvent }>(
    "POST",
    "/api/marketing/events",
    input,
    adminToken
  );
  return data.event;
}

export async function deleteMarketingEventApi(
  adminToken: string,
  eventId: string
): Promise<void> {
  await apiRequest(
    "DELETE",
    `/api/marketing/events/${eventId}`,
    undefined,
    adminToken
  );
}

/**
 * Renew an event's coupon into the next year. Raw response on purpose — the
 * renew-twice idempotency regression asserts on the second call's status
 * (the original bug returned 400 "coupon already exists").
 */
export async function renewEventCouponRaw(
  adminToken: string,
  eventId: string
): Promise<
  RawResponse<{
    success: boolean;
    message?: string;
    coupon?: { id: string; code: string };
  }>
> {
  return apiRequestRaw(
    "POST",
    `/api/marketing/events/${eventId}/renew-coupon`,
    {},
    adminToken
  );
}

export interface ApiOrgCoupon {
  id: string;
  code: string;
  type: string;
  status?: string;
}

export async function createOrgCouponApi(
  adminToken: string,
  input: {
    code: string;
    type: string;
    value: number;
    description?: string;
    startDate: string;
    endDate: string;
    autoEnrollRestaurants?: boolean;
  }
): Promise<ApiOrgCoupon> {
  const data = await apiRequest<{ coupon: ApiOrgCoupon }>(
    "POST",
    "/api/coupons/organization",
    { autoEnrollRestaurants: false, ...input },
    adminToken
  );
  return data.coupon;
}

export async function deleteOrgCouponApi(
  adminToken: string,
  couponId: string
): Promise<void> {
  await apiRequest(
    "DELETE",
    `/api/coupons/organization/${couponId}`,
    undefined,
    adminToken
  );
}

export interface ApiAutomation {
  id: string;
  slug: string;
  type: "WIN_BACK" | "WELCOME" | "VIP" | "CUSTOM";
  name: string;
  isEnabled: boolean;
  cooldownDays: number;
  inactiveDays: number | null;
  templateId: string | null;
}

export async function getAutomationsApi(
  adminToken: string
): Promise<ApiAutomation[]> {
  const data = await apiRequest<{ automations: ApiAutomation[] }>(
    "GET",
    "/api/marketing/automations",
    undefined,
    adminToken
  );
  return data.automations ?? [];
}

export async function patchAutomationApi(
  adminToken: string,
  automationId: string,
  patch: Record<string, unknown>
): Promise<ApiAutomation> {
  const data = await apiRequest<{ automation: ApiAutomation }>(
    "PATCH",
    `/api/marketing/automations/${automationId}`,
    patch,
    adminToken
  );
  return data.automation;
}

export async function toggleAutomationApi(
  adminToken: string,
  automationId: string,
  isEnabled: boolean
): Promise<void> {
  await apiRequest(
    "PATCH",
    `/api/marketing/automations/${automationId}/toggle`,
    { isEnabled },
    adminToken
  );
}

/** Raw on purpose: run-now on a DISABLED automation must 400 (no sends). */
export async function runAutomationNowRaw(
  adminToken: string,
  automationId: string
): Promise<RawResponse<{ success: boolean; message?: string }>> {
  return apiRequestRaw(
    "POST",
    `/api/marketing/automations/${automationId}/run-now`,
    {},
    adminToken
  );
}

export interface ApiOwnerAutomationSettings {
  lifecycleMarketingOptOut: boolean;
  automations: {
    id: string;
    name: string;
    type: string;
    isEnrolled: boolean;
  }[];
}

export async function getOwnerAutomationSettingsApi(
  token: string,
  restaurantId: string
): Promise<ApiOwnerAutomationSettings> {
  const data = await apiRequest<{ settings: ApiOwnerAutomationSettings }>(
    "GET",
    `/api/marketing/automations/restaurant/${restaurantId}/settings`,
    undefined,
    token
  );
  return data.settings;
}

export async function setOwnerAutomationOptOutApi(
  token: string,
  restaurantId: string,
  optOut: boolean
): Promise<void> {
  await apiRequest(
    "PATCH",
    `/api/marketing/automations/restaurant/${restaurantId}/opt-out`,
    { optOut },
    token
  );
}

export async function setOwnerAutomationEnrollmentApi(
  token: string,
  restaurantId: string,
  automationId: string,
  isEnrolled: boolean
): Promise<void> {
  await apiRequest(
    "PATCH",
    `/api/marketing/automations/restaurant/${restaurantId}/enrollment/${automationId}`,
    { isEnrolled },
    token
  );
}

export interface ApiAutomationConfig {
  frequencyCapDays: number;
  dailySendCapPerRestaurant: number;
}

export async function getAutomationConfigApi(
  adminToken: string
): Promise<ApiAutomationConfig> {
  const data = await apiRequest<{ config: ApiAutomationConfig }>(
    "GET",
    "/api/marketing/automations/config",
    undefined,
    adminToken
  );
  return data.config;
}

export async function patchAutomationConfigApi(
  adminToken: string,
  patch: Partial<ApiAutomationConfig>
): Promise<void> {
  await apiRequest(
    "PATCH",
    "/api/marketing/automations/config",
    patch,
    adminToken
  );
}

export interface ApiAutomationSend {
  id: string;
  customerEmail: string;
  emailStatus: string | null;
  sentAt: string | null;
}

export async function getAutomationSendsApi(
  adminToken: string,
  automationId: string
): Promise<ApiAutomationSend[]> {
  const data = await apiRequest<{ sends: ApiAutomationSend[] }>(
    "GET",
    `/api/marketing/automations/${automationId}/sends`,
    undefined,
    adminToken
  );
  return data.sends ?? [];
}

export interface ApiAutomationStats {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  opened: number;
  clicked: number;
  redeemed: number;
  discountValueGiven: number;
}

export async function getAutomationStatsApi(
  adminToken: string,
  automationId: string
): Promise<ApiAutomationStats> {
  const data = await apiRequest<{ stats: ApiAutomationStats }>(
    "GET",
    `/api/marketing/automations/${automationId}/stats`,
    undefined,
    adminToken
  );
  return data.stats;
}
