import * as fs from "fs";
import * as path from "path";
import {
  test as base,
  type Page,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import {
  createDemoBookingPage,
  type DemoBookingPage,
} from "../pages/dashboard/public/DemoBookingPage";
import {
  createSignInPage,
  type SignInPage,
} from "../pages/dashboard/auth/SignInPage";
import {
  createSignUpPage,
  type SignUpPage,
} from "../pages/dashboard/auth/SignUpPage";
import {
  OWNER_AUTH_FILE,
  ADMIN_AUTH_FILE,
  EMPLOYEE_AUTH_FILE,
  FRONTEND_URL,
} from "../utils/testData";

// Roles that share the dashboard restaurant-management screens. Used by the
// access-control matrix to verify who-can-reach-what without re-running the
// full feature flow per role. See TEST_PLAN.md → "Shared capabilities".
export type DashboardRole = "owner" | "admin" | "employee";
export type PageForRole = (role: DashboardRole) => Promise<Page>;

export type Fixtures = {
  // ownerContext / adminContext / employeeContext: full session (use when a test needs multiple tabs)
  // ownerPage / adminPage / employeePage: convenience single-tab shortcut for the common case
  demoBookingPage: DemoBookingPage;
  signInPage: SignInPage;
  signUpPage: SignUpPage;
  ownerContext: BrowserContext;
  ownerPage: Page;
  adminContext: BrowserContext;
  adminPage: Page;
  employeeContext: BrowserContext;
  employeePage: Page;
  // pageForRole(role): an authenticated page for any dashboard role — for the
  // access-control matrix. Contexts it opens are closed at test end.
  //
  // NOTE: customer (Template Wind) tests deliberately use the plain `page`
  // fixture — the `customer` project's baseURL already points at Template
  // Wind, and specs resolve the restaurant via readRestaurantId(). Dedicated
  // customerContext/customerPage fixtures existed here once but were never
  // used; add a reward-member (OTP) fixture when that flow gets automated —
  // see TEST_PLAN.md "Future infrastructure".
  pageForRole: PageForRole;
};

// Why these sessions survive runs longer than the 15-minute access token:
// the storageState captured by globalSetup includes the localStorage `user`
// object with its 30-DAY refresh token, and the dashboard auto-refreshes the
// access token on page load (POST /api/auth/refresh). globalSetup fails fast
// if the refresh token is ever missing from a saved auth file — see
// verifyAuthStateLifetime. Details in utils/auth.ts.
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
  const context = await browser.newContext({
    storageState: authFile,
    baseURL: FRONTEND_URL,
  });
  try {
    await use(context);
  } finally {
    await context.close();
  }
}

export const test = base.extend<Fixtures>({
  demoBookingPage: async ({ page }, use) => {
    await use(createDemoBookingPage(page));
  },

  signInPage: async ({ page }, use) => {
    await use(createSignInPage(page));
  },

  signUpPage: async ({ page }, use) => {
    await use(createSignUpPage(page));
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

  employeeContext: async ({ browser }, use) => {
    await loadAuthContext(browser, EMPLOYEE_AUTH_FILE, "EMPLOYEE", use);
  },

  employeePage: async ({ employeeContext }, use) => {
    const page = await employeeContext.newPage();
    await use(page);
    await page.close();
  },

  pageForRole: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];
    const resolve: PageForRole = async (role) => {
      const authFile =
        role === "admin"
          ? ADMIN_AUTH_FILE
          : role === "owner"
            ? OWNER_AUTH_FILE
            : EMPLOYEE_AUTH_FILE;
      if (!fs.existsSync(authFile)) {
        throw new Error(
          `${path.basename(authFile)} not found for role "${role}". ` +
            `Ensure the matching *_EMAIL / *_PASSWORD are set in .env and globalSetup ran.`
        );
      }
      const context = await browser.newContext({
        storageState: authFile,
        baseURL: FRONTEND_URL,
      });
      opened.push(context);
      return context.newPage();
    };
    try {
      await use(resolve);
    } finally {
      for (const ctx of opened) await ctx.close();
    }
  },
});

export { expect } from "@playwright/test";
