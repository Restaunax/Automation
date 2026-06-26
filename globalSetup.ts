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
    const restaurant = restaurants[0];
    restaurantId = restaurant.id;
    restaurantName = restaurant.name;
    console.log(
      `[globalSetup] Using existing restaurant: ${restaurantName} (${restaurantId})`
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
    submitDemoRequest(),
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
