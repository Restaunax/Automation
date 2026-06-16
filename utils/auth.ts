/**
 * auth.ts
 *
 * Reusable login primitives. The suite deliberately has ONE place each for the
 * two login styles so specs never reinvent login:
 *   - API login: utils/apiHelper.ts → apiLogin() (token, no browser)
 *   - UI login : pages/dashboard/auth/SignInPage.ts → createSignInPage()
 *
 * loginViaUi wraps the SignInPage POM in a fresh browser context so any test
 * can log in as an *arbitrary* (non-seeded) user — e.g. an invitee whose
 * password was just set during the API claim step. Pre-seeded owner/admin
 * sessions should still use the ownerPage / adminPage fixtures instead.
 */

import { type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createSignInPage } from "../pages/dashboard/auth/SignInPage";
import { FRONTEND_URL } from "./testData";

export interface UiLoginSession {
  context: BrowserContext;
  page: Page;
}

/**
 * Opens a fresh (unauthenticated) dashboard context and logs in via the UI.
 * Caller owns the returned context and must close it (e.g. in afterAll).
 */
export async function loginViaUi(
  browser: Browser,
  email: string,
  password: string
): Promise<UiLoginSession> {
  const context = await browser.newContext({ baseURL: FRONTEND_URL });
  const page = await context.newPage();
  await createSignInPage(page).loginAndWait(email, password);
  return { context, page };
}
