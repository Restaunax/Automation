/**
 * globalSetup.ts
 *
 * Runs once before all tests. Responsibilities:
 *   1. API-login as owner → create seed test restaurant
 *   2. Browser-login as owner → save owner-auth.tmp.json (storageState)
 *   3. Browser-login as admin → save admin-auth.tmp.json (storageState)
 *   4. Write shared-state.tmp.json with all data specs need
 *
 * Sends NO email. It used to submit a demo request here on EVERY run; the demo
 * specs now self-seed their own request instead (see 01-demo-management /
 * 02-demo-actions). Keep it that way — a request seeded here is shared state
 * every demo spec would have to reason about, and it puts noise in the shared
 * Mailpit inbox that humans also read.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { chromium, type Page, type BrowserContext } from "@playwright/test";
import { createSignInPage } from "./pages/dashboard/auth/SignInPage";
import { jwtExpiryMs } from "./utils/auth";
import {
  apiLogin,
  getOwnerRestaurants,
  createTestMenuGroup,
  createTestMenuItem,
  ensureAutomationChain,
  ensureOrderingSlug,
  BACKEND_URL,
} from "./utils/apiHelper";
import { readProcessStartedAt } from "./utils/deployGuard";
import { assertSafeTargets } from "./utils/targetGuard";
import {
  STATE_FILE,
  OWNER_AUTH_FILE,
  ADMIN_AUTH_FILE,
  EMPLOYEE_AUTH_FILE,
  FRONTEND_URL,
  TEMPLATE_WIND_URL,
  writeSharedState,
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

// ── Main ─────────────────────────────────────────────────────────────────────
export default async function globalSetup(): Promise<void> {
  // SAFETY: refuse to run if any target resolves to a non-QA/localhost host.
  // Teardown hard-deletes via an admin token; this guard prevents a misconfigured
  // env from ever pointing that at production. Must be first — before any login.
  assertSafeTargets({ FRONTEND_URL, BACKEND_URL, TEMPLATE_WIND_URL });

  // MINIMUM ENV GATE: owner + admin creds are load-bearing (owner seeds all
  // shared state; admin runs the teardown sweeps). Without them a run
  // self-skips most of the suite and can look green while covering half of
  // it — fail fast instead. Set ALLOW_PARTIAL_ENV=true to deliberately run a
  // partial suite (e.g. customer-only smoke); the optional-credential gaps
  // below are always summarized so partial coverage is visible in the log.
  const missingCore = [
    ...(!OWNER_EMAIL || !OWNER_PASSWORD ? ["OWNER_EMAIL/OWNER_PASSWORD"] : []),
    ...(!ADMIN_EMAIL || !ADMIN_PASSWORD ? ["ADMIN_EMAIL/ADMIN_PASSWORD"] : []),
  ];
  if (missingCore.length && process.env.ALLOW_PARTIAL_ENV !== "true") {
    throw new Error(
      `[globalSetup] Missing core credentials: ${missingCore.join(", ")}.\n` +
        "A run without them silently skips most of the suite (green-but-half-covered). " +
        "Fill them in .env (see .env.example), or set ALLOW_PARTIAL_ENV=true to run a deliberate partial suite."
    );
  }
  const optionalGaps = [
    ...(!EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD ? ["employee suite"] : []),
    ...(!process.env.MAILPIT_BASE_URL ? ["email-journey tests"] : []),
  ];
  if (optionalGaps.length) {
    console.warn(
      `[globalSetup] Partial coverage this run — skipped surfaces: ${optionalGaps.join(", ")}`
    );
  }

  // Record when the backend process started, so globalTeardown / publish-results
  // can detect a deploy that restarted it mid-run and mark the run superseded.
  const processStartedAt = await readProcessStartedAt(BACKEND_URL);

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
  let chain: Awaited<ReturnType<typeof ensureAutomationChain>> = null;
  // Hoisted: the slug endpoints are ADMIN/EMPLOYEE-guarded and are seeded below,
  // outside the owner block where the chain fixture obtains this token.
  let adminAccessToken: string | undefined;

  if (OWNER_EMAIL && OWNER_PASSWORD) {
    const { accessToken, userId: ownerUserId } = await apiLogin(
      OWNER_EMAIL,
      OWNER_PASSWORD
    );
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
    if (!restaurant) {
      // Unreachable (length checked above) but satisfies noUncheckedIndexedAccess.
      throw new Error("[globalSetup] No seed restaurant resolvable");
    }
    restaurantId = restaurant.id;
    restaurantName = restaurant.name;
    console.log(
      `[globalSetup] Using existing restaurant: ${restaurantName} (${restaurantId})` +
        (restaurants.length > 1 && !pinned
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

    // Persistent two-location chain fixture for the chain-menu suites
    // (docs/MENU_TAB_TEST_STRATEGY.md §5, Option A). Create-if-missing: one
    // GET on a normal run; the admin-driven build happens once per QA env.
    // Never torn down — chain membership can't be cleanly undone via API.
    try {
      adminAccessToken =
        ADMIN_EMAIL && ADMIN_PASSWORD
          ? (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken
          : undefined;
      chain = await ensureAutomationChain(
        accessToken,
        ownerUserId,
        adminAccessToken
      );
      if (chain) {
        console.log(
          `[globalSetup] Chain fixture: ${chain.name} (${chain.groupId}) — ` +
            `${chain.locationA.name} / ${chain.locationB.name}`
        );
      } else {
        console.warn(
          "[globalSetup] Chain fixture unavailable (no admin creds to build it) — chain-menu specs will skip"
        );
      }
    } catch (err) {
      console.warn(
        "[globalSetup] Chain fixture setup failed — chain-menu specs will skip:",
        err
      );
    }
  } else {
    console.warn(
      "[globalSetup] OWNER_EMAIL/PASSWORD not set — skipping owner auth + restaurant seed"
    );
  }

  // 2-4. Owner, admin, and employee auth are fully independent — run all three
  //      browser sessions in parallel to cut setup time. No demo submission here
  //      (it emailed the requester on every run); the demo specs self-seed.
  await Promise.all([
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
  ]);

  // 3b. Ordering slugs for the embedded-ordering storefront. Idempotent, and
  //     tolerant of a backend that predates the endpoint (returns "" → specs
  //     skip rather than failing the run).
  const restaurantSlug =
    adminAccessToken && restaurantId
      ? await ensureOrderingSlug(
          adminAccessToken,
          "restaurant",
          restaurantId,
          "automation-restaurant"
        )
      : "";
  const chainSlug =
    adminAccessToken && chain?.groupId
      ? await ensureOrderingSlug(
          adminAccessToken,
          "chain",
          chain.groupId,
          "automation-chain"
        )
      : "";
  const chainLocationASlug =
    adminAccessToken && chain?.locationA.id
      ? await ensureOrderingSlug(
          adminAccessToken,
          "restaurant",
          chain.locationA.id,
          "automation-chain-location-a"
        )
      : "";
  console.log(
    `[globalSetup] ordering slugs: restaurant=${restaurantSlug || "(none)"} chain=${chainSlug || "(none)"}`
  );

  // 4. Persist all shared data for specs
  writeSharedState({
    restaurantId,
    restaurantName,
    menuGroupId,
    menuItemId,
    menuItemName,
    menuItemPrice,
    processStartedAt,
    chainGroupId: chain?.groupId ?? "",
    chainLocationAId: chain?.locationA.id ?? "",
    chainLocationAName: chain?.locationA.name ?? "",
    chainLocationBId: chain?.locationB.id ?? "",
    chainLocationBName: chain?.locationB.name ?? "",
    restaurantSlug,
    chainSlug,
    chainLocationASlug,
  });

  console.log(`[globalSetup] shared-state.tmp.json written.\n`);
}
