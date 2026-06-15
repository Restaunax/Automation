import * as fs from "fs";
import * as path from "path";
import { test as base, type Page, type Browser, type BrowserContext } from "@playwright/test";
import { createDemoBookingPage, type DemoBookingPage } from "../pages/dashboard/public/DemoBookingPage";
import { createSignInPage, type SignInPage } from "../pages/dashboard/auth/SignInPage";
import { OWNER_AUTH_FILE, ADMIN_AUTH_FILE, FRONTEND_URL, TEMPLATE_WIND_URL } from "../utils/testData";

// Roles that share the dashboard restaurant-management screens. Used by the
// access-control matrix to verify who-can-reach-what without re-running the
// full feature flow per role. See TEST_PLAN.md → "Shared capabilities".
export type DashboardRole = "owner" | "admin" | "employee";
export type PageForRole = (role: DashboardRole) => Promise<Page>;

export type Fixtures = {
  // ownerContext / adminContext: full session (use when a test needs multiple tabs)
  // ownerPage   / adminPage:    convenience single-tab shortcut for the common case
  demoBookingPage: DemoBookingPage;
  signInPage: SignInPage;
  ownerContext: BrowserContext;
  ownerPage: Page;
  adminContext: BrowserContext;
  adminPage: Page;
  // pageForRole(role): an authenticated page for any dashboard role — for the
  // access-control matrix. Contexts it opens are closed at test end.
  pageForRole: PageForRole;
  // customerContext / customerPage: fresh no-auth session on Template Wind
  // (guest customer). Reward-member (OTP) variant is a future addition — see
  // TEST_PLAN.md "Future infrastructure".
  customerContext: BrowserContext;
  customerPage: Page;
};

async function loadAuthContext(
  browser: Browser,
  authFile: string,
  label: string,
  use: (ctx: BrowserContext) => Promise<void>
): Promise<void> {
  if (!fs.existsSync(authFile)) {
    throw new Error(
      `${path.basename(authFile)} not found.\n` +
        `Make sure ${label}_EMAIL and ${label}_PASSWORD are set in .env and globalSetup ran.`
    );
  }
  const context = await browser.newContext({ storageState: authFile, baseURL: FRONTEND_URL });
  await use(context);
  await context.close();
}

export const test = base.extend<Fixtures>({
  demoBookingPage: async ({ page }, use) => {
    await use(createDemoBookingPage(page));
  },

  signInPage: async ({ page }, use) => {
    await use(createSignInPage(page));
  },

  ownerContext: async ({ browser }, use) => {
    await loadAuthContext(browser, OWNER_AUTH_FILE, "OWNER", use);
  },

  ownerPage: async ({ ownerContext }, use) => {
    const page = await ownerContext.newPage();
    await use(page);
    await page.close();
  },

  adminContext: async ({ browser }, use) => {
    await loadAuthContext(browser, ADMIN_AUTH_FILE, "ADMIN", use);
  },

  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();
    await use(page);
    await page.close();
  },

  // Guest customer on Template Wind — no auth, no storageState. POMs append
  // ?restaurantId=<id> (via readRestaurantId) so the location picker is skipped.
  customerContext: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: TEMPLATE_WIND_URL });
    await use(context);
    await context.close();
  },

  customerPage: async ({ customerContext }, use) => {
    const page = await customerContext.newPage();
    await use(page);
    await page.close();
  },

  pageForRole: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];
    const resolve: PageForRole = async (role) => {
      // employee has no stored session yet — that's future infrastructure.
      const authFile =
        role === "admin" ? ADMIN_AUTH_FILE : role === "owner" ? OWNER_AUTH_FILE : null;
      if (!authFile) {
        throw new Error(
          `pageForRole("${role}") is not available yet — no ${role} session is stored. ` +
            `Add an ${role.toUpperCase()} account + storageState (see TEST_PLAN.md → "Future infrastructure").`
        );
      }
      if (!fs.existsSync(authFile)) {
        throw new Error(
          `${path.basename(authFile)} not found for role "${role}". ` +
            `Ensure the matching *_EMAIL / *_PASSWORD are set in .env and globalSetup ran.`
        );
      }
      const context = await browser.newContext({ storageState: authFile, baseURL: FRONTEND_URL });
      opened.push(context);
      return context.newPage();
    };
    await use(resolve);
    for (const ctx of opened) await ctx.close();
  },
});

export { expect } from "@playwright/test";
