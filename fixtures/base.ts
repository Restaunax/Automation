import * as fs from "fs";
import * as path from "path";
import { test as base, type Page, type Browser, type BrowserContext } from "@playwright/test";
import { createDemoBookingPage, type DemoBookingPage } from "../pages/public/DemoBookingPage";
import { createSignInPage, type SignInPage } from "../pages/auth/SignInPage";
import { OWNER_AUTH_FILE, ADMIN_AUTH_FILE, FRONTEND_URL } from "../utils/testData";

export type Fixtures = {
  // ownerContext / adminContext: full session (use when a test needs multiple tabs)
  // ownerPage   / adminPage:    convenience single-tab shortcut for the common case
  demoBookingPage: DemoBookingPage;
  signInPage: SignInPage;
  ownerContext: BrowserContext;
  ownerPage: Page;
  adminContext: BrowserContext;
  adminPage: Page;
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
});

export { expect } from "@playwright/test";
