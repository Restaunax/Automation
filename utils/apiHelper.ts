/**
 * apiHelper.ts
 *
 * Direct HTTP calls to the RestauNax backend for test data setup and teardown.
 * Uses Bearer token auth — no browser required.
 * All functions throw on non-2xx responses with a clear error message.
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

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
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
 */
export async function getRestaurantMenuGroups(
  accessToken: string,
  restaurantId: string
): Promise<ApiMenuGroup[]> {
  const data = await apiRequest<{ groups: ApiMenuGroup[] }>(
    "GET",
    `/menu/restaurants/${restaurantId}/menus`,
    undefined,
    accessToken
  );
  return data.groups ?? [];
}

/**
 * Delete every menu item in a group, then delete the group.
 * Gracefully handles the "Cannot Delete Category With Items" error by first
 * removing any items that tests may have left behind.
 */
export async function deleteTestMenuGroupWithItems(
  accessToken: string,
  restaurantId: string,
  menuGroupId: string
): Promise<void> {
  const groups = await getRestaurantMenuGroups(accessToken, restaurantId);
  const group = groups.find((g) => g.id === menuGroupId);
  if (group?.menuItems?.length) {
    for (const item of group.menuItems) {
      await apiRequest<unknown>(
        "DELETE",
        `/menu/menuItemId/${item.id}`,
        undefined,
        accessToken
      );
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
