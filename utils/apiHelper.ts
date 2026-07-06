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

import { readUsersForCleanup, clearUsersForCleanup } from "./testData";

const BACKEND_URL = process.env.BACKEND_URL ?? "https://api.qa.restaunax.com";

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
  namePattern = /^(Test Starters|TC45 Delete|Automation Items) ?/
): Promise<number> {
  const groups = await getRestaurantMenuGroups(accessToken, restaurantId);
  let deleted = 0;
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
    } catch (err) {
      console.warn(
        `[apiHelper] Failed to delete leftover menu group "${group.name}" (${group.id}):`,
        err
      );
    }
  }
  return deleted;
}

// ── Coupons ──────────────────────────────────────────────────────────────────

export interface ApiCoupon {
  id: string;
  code: string;
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

// ── Orders & POS (tablet) ────────────────────────────────────────────────────
//
// Order seeding + the POS/tablet order-lifecycle surface. Backend specifics
// verified 2026-07-06:
//   • POST /api/order/new/restaurantId/:id with total:0 creates a paid order
//     immediately (status=PENDING, paymentStatus=COMPLETED) — no Stripe. This
//     is the only Stripe-free order path on the customer web endpoint.
//   • Order status routes take NO auth and accept free-form transitions from a
//     flat allowlist (not a state machine). Path param is :id.
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
 * Create a $0 PICKUP order via the public customer endpoint. total:0 makes the
 * backend mark it PENDING/COMPLETED with no Stripe intent — ideal seed data.
 * The restaurant must have settings.acceptingOrders=true (the seed restaurant
 * does). No order-delete API exists, so these are left as residue (like the
 * TC-26 real order) and double as seed data for the owner Orders tab.
 */
export async function createZeroTotalOrder(
  restaurantId: string,
  item: SeedOrderItem,
  customerEmail = `autoorder_${Date.now()}@restaunax-test.com`
): Promise<ApiOrder> {
  const data = await apiRequest<{ order?: ApiOrder } & ApiOrder>(
    "POST",
    `/api/order/new/restaurantId/${restaurantId}`,
    {
      orderType: "PICKUP",
      subtotal: 0,
      tax: 0,
      deliveryFee: 0,
      tip: 0,
      total: 0,
      customerEmail,
      customerPhone: "+15550000000",
      firstName: "Auto",
      lastName: "Order",
      orderItems: [
        {
          menuItemId: item.menuItemId,
          menuItemName: item.name,
          quantity: 1,
          price: item.price,
        },
      ],
    }
  );
  // Response may be the order directly or wrapped in { order }.
  return (data.order ?? (data as ApiOrder)) as ApiOrder;
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

/** Like apiRequest, but returns the status/body instead of throwing on non-2xx. */
async function apiRequestRaw<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string
): Promise<RawResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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
