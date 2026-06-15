/**
 * apiHelper.ts
 *
 * Direct HTTP calls to the RestauNax backend for test data setup and teardown.
 * Uses Bearer token auth — no browser required.
 * All functions throw on non-2xx responses with a clear error message.
 */

import { generateRestaurantData } from "./testData";

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
  }>("POST", "/api/login", { email, password });

  return {
    accessToken: data.accessToken,
    userId: data.userId ?? data.id,
    role: data.role,
    firstName: data.firstName,
    lastName: data.lastName,
  };
}

/**
 * Creates a uniquely-named test restaurant owned by the authenticated user.
 * Returns the new restaurant's id and name.
 */
export async function createTestRestaurant(
  accessToken: string
): Promise<ApiRestaurant> {
  const payload = generateRestaurantData();
  const data = await apiRequest<{ id: string; name: string }>(
    "POST",
    "/api/restaurant/new",
    payload,
    accessToken
  );
  return { id: data.id, name: data.name };
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
    `/api/admin/restaurant/${restaurantId}`,
    undefined,
    adminAccessToken
  );
}

export interface ApiMenuGroup {
  id: string;
}

export interface ApiMenuItem {
  id: string;
  name: string;
  price: number;
}

export async function createTestMenuGroup(
  accessToken: string,
  restaurantId: string
): Promise<ApiMenuGroup> {
  return apiRequest<ApiMenuGroup>(
    "POST",
    "/menu/group/new",
    { restaurantId, menuGroup: "Automation Items" },
    accessToken
  );
}

export async function createTestMenuItem(
  accessToken: string,
  groupId: string
): Promise<ApiMenuItem> {
  return apiRequest<ApiMenuItem>(
    "POST",
    "/menu/item/new",
    { name: "Automation Burger", price: 12.99, groupId },
    accessToken
  );
}
