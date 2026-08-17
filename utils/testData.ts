import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type { DemoFormData } from "../pages/dashboard/public/DemoBookingPage";

export const FRONTEND_URL =
  process.env.FRONTEND_URL ?? "https://app.qa.restaunax.com";

// Template Wind (customer ordering site) — base URL for the `customer` project.
// Default is the actual ordering storefront (wind.), NOT qa.restaunax.com — that
// host is the QA marketing site (see utils/targetGuard.ts).
export const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://wind.restaunax.com";

// In QA all outbound mail is captured by the self-hosted Mailpit sandbox, so the
// domain need not be real. Default matches .env/CI (demomailtrap.co — a leftover
// from the Mailtrap era, harmless since nothing leaves the sandbox).
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

// Generated addresses MUST stay unique per test: the Mailpit inbox is shared
// across runs and with humans, and emailHelper matches on the recipient.

// Email-sending tests carry the @email tag (@demo = demo subset) purely as a
// selector for targeted runs — they are NOT excluded from the default suite.
// See playwright.config.ts and TEST_PLAN → "Test execution strategy".

// ── Shared temp file paths (all relative to Automation/) ────────────────────
export const STATE_FILE = path.resolve(__dirname, "../shared-state.tmp.json");
export const OWNER_AUTH_FILE = path.resolve(
  __dirname,
  "../owner-auth.tmp.json"
);
export const ADMIN_AUTH_FILE = path.resolve(
  __dirname,
  "../admin-auth.tmp.json"
);
export const EMPLOYEE_AUTH_FILE = path.resolve(
  __dirname,
  "../employee-auth.tmp.json"
);

// Records users created by the admin user-management suite so globalTeardown
// (and spec afterAll hooks) can delete them even if a test crashes mid-run.
export const USERS_CLEANUP_FILE = path.resolve(
  __dirname,
  "../users-cleanup.tmp.json"
);

// A stable, recognizable marker baked into every test-user email so leftovers
// are easy to identify and sweep. Search the admin user list for it to find
// orphaned accounts from interrupted runs.
export const TEST_USER_MARKER = "autouser";

// ── Test data generators ─────────────────────────────────────────────────────

// Single source of truth for unique run suffixes used in test names/data.
// uuid-based: the previous Date.now()-digits suffix cycled every ~16.7 minutes,
// so a later run could regenerate a value already left behind by an earlier
// run (e.g. a duplicate coupon code → 400 on create).
export const generateRunId = () => uuidv4().slice(0, 8);

// Order-seed identity helpers (see apiHelper.createSeededOrder):
//   • generateSeedPhone — 10 bare digits that survive the backend's NANP
//     normalizePhone (digit[0] and digit[3] must be 2-9; "555" + "0…" is
//     NULLed). "5552" + 6 random digits → stored & displayed as-is, so a test
//     can search the exact same string.
//   • generateSeedSurname — run-unique last name shared by one spec file's seed
//     set, so `search=<surname>` returns exactly that file's rows.
export const generateSeedPhone = () =>
  `5552${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
export const generateSeedSurname = (runId: string) => `Seed${runId}`;

// Coupon codes created by automation. The shared prefix is the sweep marker
// globalTeardown uses to delete this run's coupons AND leftovers from
// interrupted runs — see apiHelper.deleteAutomationCoupons.
export const AUTOMATION_COUPON_PREFIX = "AUTO";
export const generateCouponCode = () =>
  `${AUTOMATION_COUPON_PREFIX}${generateRunId().toUpperCase()}`;

export function generateDemoFormData(): DemoFormData & { uniqueId: string } {
  const uniqueId = generateRunId();
  return {
    uniqueId,
    firstName: "Auto",
    lastName: "Tester",
    email: `test+${uniqueId}@${EMAIL_DOMAIN}`,
    phone: "5551234567",
    restaurantName: `AUTO Demo Restaurant ${uniqueId}`,
    preferredContact: "email",
    agreeToTerms: true,
  };
}

// Unique, recognizable email for an invited/registered test user. The
// TEST_USER_MARKER prefix lets cleanup find leftovers. In QA all outbound mail
// is captured by the Mailpit sandbox, so the domain need not be real.
export function generateUserEmail(label = "u"): string {
  const uniqueId = uuidv4().split("-")[0];
  return `${TEST_USER_MARKER}_${label}_${uniqueId}@${EMAIL_DOMAIN}`;
}

// ── Created-user cleanup tracking ────────────────────────────────────────────
// Append-only, one email per line: multiple worker processes record users
// concurrently, and a JSON read-modify-write would lose entries to races.
// O_APPEND writes of a short line are atomic enough; readUsersForCleanup
// dedupes at read time instead.
export function recordUserForCleanup(email: string): void {
  fs.appendFileSync(USERS_CLEANUP_FILE, `${email}\n`, "utf-8");
}

export function readUsersForCleanup(): string[] {
  if (!fs.existsSync(USERS_CLEANUP_FILE)) return [];
  try {
    const raw = fs.readFileSync(USERS_CLEANUP_FILE, "utf-8").trim();
    if (!raw) return [];
    // Legacy format (JSON array) from a run interrupted before this change.
    if (raw.startsWith("[")) return JSON.parse(raw) as string[];
    return [
      ...new Set(
        raw
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      ),
    ];
  } catch {
    return [];
  }
}

export function clearUsersForCleanup(): void {
  if (fs.existsSync(USERS_CLEANUP_FILE)) fs.unlinkSync(USERS_CLEANUP_FILE);
}

// ── Created-gift-card cleanup tracking ───────────────────────────────────────
// Gift card codes are server-generated (not client-chosen like AUTO* coupon
// codes), so there's no prefix to sweep by, and there's no delete endpoint —
// only admin freeze. Same append-only-file pattern as USERS_CLEANUP_FILE:
// tests record every purchased gift card's id, globalTeardown freezes them
// all as a best-effort sweep.
export const GIFT_CARDS_CLEANUP_FILE = path.resolve(
  __dirname,
  "../gift-cards-cleanup.tmp.json"
);

export function recordGiftCardForCleanup(giftCardId: string): void {
  fs.appendFileSync(GIFT_CARDS_CLEANUP_FILE, `${giftCardId}\n`, "utf-8");
}

export function readGiftCardsForCleanup(): string[] {
  if (!fs.existsSync(GIFT_CARDS_CLEANUP_FILE)) return [];
  try {
    const raw = fs.readFileSync(GIFT_CARDS_CLEANUP_FILE, "utf-8").trim();
    if (!raw) return [];
    return [
      ...new Set(
        raw
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      ),
    ];
  } catch {
    return [];
  }
}

export function clearGiftCardsForCleanup(): void {
  if (fs.existsSync(GIFT_CARDS_CLEANUP_FILE))
    fs.unlinkSync(GIFT_CARDS_CLEANUP_FILE);
}

export function generateRestaurantData() {
  const uniqueId = uuidv4().split("-")[0];
  return {
    name: `Automation Restaurant ${uniqueId}`,
    street: "123 Test Street",
    city: "Miami",
    state: "FL",
    zipCode: "33101",
    restaurantPhone: "5551234567",
    pickupOnly: true,
    emailOnly: false,
    shippingEnabled: false,
    allowPickupWithShipping: false,
    minimumOrderPreparationTime: 15,
  };
}

// ── Shared state (written by globalSetup, read by specs) ────────────────────
// No demo fields here: globalSetup no longer submits a demo request (it emailed
// on every run). Demo specs self-seed their own request instead.
export interface SharedState {
  restaurantId: string;
  restaurantName: string;
  menuGroupId: string;
  menuItemId: string;
  menuItemName: string;
  menuItemPrice: number;
  // Backend process start time (epoch ms) captured at setup, used by
  // publish-results to flag a run superseded by a mid-run deploy. Optional so
  // older state files and health-unreachable runs still parse.
  processStartedAt?: number | null;
  // Persistent "Automation Chain" fixture (globalSetup → ensureAutomationChain).
  // Empty strings when it could not be built — chain-menu specs skip on that.
  chainGroupId?: string;
  chainLocationAId?: string;
  chainLocationAName?: string;
  chainLocationBId?: string;
  chainLocationBName?: string;
}

export function readSharedState(): SharedState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      "shared-state.tmp.json not found. Did globalSetup run successfully?"
    );
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as SharedState;
}

export function writeSharedState(state: SharedState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// restaurantId for Template Wind customer tests — every tests/customer spec
// resolves the restaurant through this (and passes it to the POM gotos, which
// append ?restaurantId=<id> to skip the location picker in QA).
// Prefers the TEMPLATE_WIND_RESTAURANT_ID env override, else the restaurant
// seeded by globalSetup.
export function readRestaurantId(): string {
  return (
    process.env.TEMPLATE_WIND_RESTAURANT_ID ?? readSharedState().restaurantId
  );
}
