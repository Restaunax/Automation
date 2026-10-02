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

/**
 * Session lifetime (measured from the QA backend, 2026-07-05):
 *   - access token (JWT): 15 minutes (AuthTokenService.ACCESS_TOKEN_EXPIRY)
 *   - refresh token: 30 days, stored inside the localStorage `user` object
 *     (and as an httpOnly cookie); the dashboard auto-refreshes via
 *     POST /api/auth/refresh whenever the stored access token is invalid.
 *
 * Consequences for tests:
 *   - Browser sessions restored from storageState survive long runs because
 *     the saved localStorage carries the 30-day refresh token — every fresh
 *     page load re-mints an access token. globalSetup verifies the refresh
 *     token made it into each auth file.
 *   - Raw apiLogin() tokens have NO refresh path. Never cache one across more
 *     than ~10 minutes of test execution (e.g. a beforeAll token in a very
 *     long spec file) — re-login instead.
 */

/** Decode a JWT's `exp` claim into epoch milliseconds; undefined if not a JWT. */
export function jwtExpiryMs(token: string): number | undefined {
  const [, payloadPart] = token.split(".");
  if (!payloadPart || token.split(".").length !== 3) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf-8")
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

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
