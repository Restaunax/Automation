/**
 * globalSetup.ts
 *
 * Runs once before all tests. Responsibilities:
 *   1. API-login as owner → create seed test restaurant
 *   2. Browser-login as owner → save owner-auth.tmp.json (storageState)
 *   3. Browser-login as admin → save admin-auth.tmp.json (storageState)
 *   4. Submit demo request via browser → capture email for email-check tests
 *   5. Write shared-state.tmp.json with all data specs need
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page, type BrowserContext } from "@playwright/test";
import { createDemoBookingPage } from "./pages/dashboard/public/DemoBookingPage";
import { createSignInPage } from "./pages/dashboard/auth/SignInPage";
import { jwtExpiryMs } from "./utils/auth";
import {
  apiLogin,
  getOwnerRestaurants,
  createTestMenuGroup,
  createTestMenuItem,
} from "./utils/apiHelper";
import {
  STATE_FILE,
  OWNER_AUTH_FILE,
  ADMIN_AUTH_FILE,
  EMPLOYEE_AUTH_FILE,
  FRONTEND_URL,
  writeSharedState,
  generateDemoFormData,
  DEMO_EMAILS_ENABLED,
} from "./utils/testData";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";

// ── Shared browser lifecycle ──────────────────────────────────────────────────
async function withBrowser<T>(
  fn: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: FRONTEND_URL });
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await browser.close();
  }
}

// ── Helper: verify a saved auth state can outlive the 15-minute access token ─
//
// Access tokens expire after 15 minutes; sessions only survive a longer run
// because the dashboard auto-refreshes using the 30-day refresh token stored
// in the localStorage `user` object (captured into storageState). If that
// refresh token is ever missing — frontend auth change, login flow change —
// every test starting >15 min after setup fails with a baffling redirect to
// /sign-in. Fail HERE instead, with a message that says what actually broke.
function verifyAuthStateLifetime(outputFile: string, label: string): void {
  interface StorageState {
    origins?: {
      origin: string;
      localStorage?: { name: string; value: string }[];
    }[];
  }
  const state = JSON.parse(
    fs.readFileSync(outputFile, "utf-8")
  ) as StorageState;
  const userEntry = state.origins
    ?.flatMap((o) => o.localStorage ?? [])
    .find((e) => e.name === "user");
  const user = userEntry
    ? (JSON.parse(userEntry.value) as {
        accessToken?: string;
        refreshToken?: string;
      })
    : undefined;

  if (!user?.refreshToken) {
    throw new Error(
      `[globalSetup] ${label} auth state has no refresh token in localStorage "user". ` +
        `Access tokens expire after 15 minutes — without the refresh token, every test ` +
        `starting later than that will fail with a redirect to /sign-in. ` +
        `The frontend's session storage shape has probably changed; update globalSetup/fixtures.`
    );
  }

  const expMs = user.accessToken ? jwtExpiryMs(user.accessToken) : undefined;
  const ttlMin = expMs ? Math.round((expMs - Date.now()) / 60_000) : undefined;
  console.log(
    `[globalSetup] ${label} session OK — access token TTL ~${ttlMin ?? "?"}m, ` +
      `refresh token present (app auto-refreshes; sessions good for the whole run)`
  );
}

// ── Helper: browser login → storageState file ────────────────────────────────
async function saveAuthState(
  email: string,
  password: string,
  outputFile: string,
  label: string
): Promise<void> {
  console.log(`[globalSetup] Logging in as ${label} (${email})…`);
  await withBrowser(async (page, context) => {
    try {
      await createSignInPage(page).loginAndWait(email, password);
      await context.storageState({ path: outputFile });
      verifyAuthStateLifetime(outputFile, label);
      console.log(
        `[globalSetup] ${label} auth state saved → ${path.basename(outputFile)}`
      );
    } catch (err) {
      await page
        .screenshot({
          path: path.resolve(
            __dirname,
            `test-results/globalSetup-${label}-failure.png`
          ),
        })
        .catch(() => {});
      throw err;
    }
  });
}

// ── Helper: submit demo request via browser ──────────────────────────────────
async function submitDemoRequest(): Promise<{
  email: string;
  firstName: string;
  lastName: string;
}> {
  const formData = generateDemoFormData();
  console.log(`[globalSetup] Submitting demo request for: ${formData.email}`);
  await withBrowser(async (page) => {
    try {
      await createDemoBookingPage(page).fillAndSubmit(formData);
      console.log("[globalSetup] Demo request submitted successfully.");
    } catch (err) {
      await page
        .screenshot({
          path: path.resolve(
            __dirname,
            "test-results/globalSetup-demo-failure.png"
          ),
        })
        .catch(() => {});
      throw err;
    }
  });
  return {
    email: formData.email,
    firstName: formData.firstName,
    lastName: formData.lastName,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default async function globalSetup(): Promise<void> {
  // Ensure test-results dir exists for failure screenshots
  fs.mkdirSync(path.resolve(__dirname, "test-results"), { recursive: true });

  // Clean all stale tmp files from previous runs
  for (const f of [
    STATE_FILE,
    OWNER_AUTH_FILE,
    ADMIN_AUTH_FILE,
    EMPLOYEE_AUTH_FILE,
  ]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // 1. Owner API login → seed test restaurant (must finish before browser sessions start
  //    so restaurantId is available for shared state)
  let restaurantId = "";
  let restaurantName = "";
  let menuGroupId = "";
  let menuItemId = "";
  let menuItemName = "";
  let menuItemPrice = 0;

  if (OWNER_EMAIL && OWNER_PASSWORD) {
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const restaurants = await getOwnerRestaurants(accessToken);
    if (!restaurants.length) {
      throw new Error(
        "[globalSetup] Owner account has no restaurants in QA. " +
          "Ask an admin or employee to create one for this owner first."
      );
    }
    // Pin the seed restaurant explicitly via SEED_RESTAURANT_ID (or by name
    // via SEED_RESTAURANT_NAME) — restaurants[0] is API-order-dependent, and
    // the "seed restaurant" carries implicit state other tests rely on
    // (Stripe connected, orders). Falls back to the first restaurant with a
    // loud log so a silent switch is at least visible in the run output.
    const pinnedId = process.env.SEED_RESTAURANT_ID;
    const pinnedName = process.env.SEED_RESTAURANT_NAME;
    const pinned =
      (pinnedId ? restaurants.find((r) => r.id === pinnedId) : undefined) ??
      (pinnedName ? restaurants.find((r) => r.name === pinnedName) : undefined);
    if ((pinnedId || pinnedName) && !pinned) {
      console.warn(
        `[globalSetup] SEED_RESTAURANT_ID/NAME set but no match among ${restaurants.length} owned restaurants — falling back to the first`
      );
    }
    const restaurant = pinned ?? restaurants[0];
    restaurantId = restaurant.id;
    restaurantName = restaurant.name;
    console.log(
      `[globalSetup] Using existing restaurant: ${restaurantName} (${restaurantId})` +
        (restaurants.length > 1
          ? ` — owner has ${restaurants.length} restaurants; pin with SEED_RESTAURANT_ID to keep this stable`
          : "")
    );

    const group = await createTestMenuGroup(accessToken, restaurantId);
    const item = await createTestMenuItem(accessToken, group.id);
    menuGroupId = group.id;
    menuItemId = item.id;
    menuItemName = item.name;
    menuItemPrice = item.price;
    console.log(
      `[globalSetup] Seed menu item created: ${menuItemName} (${menuItemId})`
    );
  } else {
    console.warn(
      "[globalSetup] OWNER_EMAIL/PASSWORD not set — skipping owner auth + restaurant seed"
    );
  }

  // 2-5. Owner auth, admin auth, employee auth, and demo submission are fully
  //      independent — run all four browser sessions in parallel to cut setup time.
  const [, , , demoResult] = await Promise.all([
    OWNER_EMAIL && OWNER_PASSWORD
      ? saveAuthState(OWNER_EMAIL, OWNER_PASSWORD, OWNER_AUTH_FILE, "owner")
      : Promise.resolve(),
    ADMIN_EMAIL && ADMIN_PASSWORD
      ? saveAuthState(ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_AUTH_FILE, "admin")
      : Promise.resolve(
          console.warn(
            "[globalSetup] ADMIN_EMAIL/PASSWORD not set — skipping admin auth"
          )
        ),
    EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD
      ? saveAuthState(
          EMPLOYEE_EMAIL,
          EMPLOYEE_PASSWORD,
          EMPLOYEE_AUTH_FILE,
          "employee"
        )
      : Promise.resolve(
          console.warn(
            "[globalSetup] EMPLOYEE_EMAIL/PASSWORD not set — skipping employee auth"
          )
        ),
    // Held off unless SEND_DEMO_EMAILS=true — a demo submission emails the
    // requester via the quota-limited Mailtrap sandbox. When held, the demo
    // specs (request/management/actions) skip too, so the empty demo fields
    // below are never read.
    DEMO_EMAILS_ENABLED
      ? submitDemoRequest()
      : Promise.resolve(
          (console.warn(
            "[globalSetup] SEND_DEMO_EMAILS not set — skipping demo request submission (holding emails)"
          ),
          { email: "", firstName: "", lastName: "" })
        ),
  ]);

  const { email, firstName, lastName } = demoResult;

  // 5. Persist all shared data for specs
  writeSharedState({
    email,
    firstName,
    lastName,
    submittedAt: new Date().toISOString(),
    restaurantId,
    restaurantName,
    menuGroupId,
    menuItemId,
    menuItemName,
    menuItemPrice,
  });

  console.log(`[globalSetup] shared-state.tmp.json written.\n`);
}
