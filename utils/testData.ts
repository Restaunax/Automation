import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type { DemoFormData } from "../pages/dashboard/public/DemoBookingPage";

export const FRONTEND_URL =
  process.env.FRONTEND_URL ?? "https://app.qa.restaunax.com";

// Template Wind (customer ordering site) — base URL for the `customer` project.
export const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "restaunax-test.com";

// Demo tests submit real demo requests and send follow-up emails, which the
// backend delivers to the (quota-limited) Mailtrap sandbox. HELD OFF by default
// so routine runs don't exhaust the inbox limit; set SEND_DEMO_EMAILS=true to
// run the demo-email surface (globalSetup demo seed + demo request/management/
// actions specs). See TEST_PLAN → "Email-sending tests".
export const DEMO_EMAILS_ENABLED = process.env.SEND_DEMO_EMAILS === "true";

// Account-lifecycle emails (admin invite, password reset, self-serve sign-up)
// also deliver real mail to the quota-limited Mailtrap sandbox — lower volume
// than demos, but held the same way. Set SEND_ACCOUNT_EMAILS=true to run them.
// Negative cases that never send (duplicate-invite 400, client-side password
// validation) are NOT gated. See TEST_PLAN → "Email-sending tests".
export const ACCOUNT_EMAILS_ENABLED =
  process.env.SEND_ACCOUNT_EMAILS === "true";

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
export const generateRunId = () => uuidv4().split("-")[0];

// Coupon codes created by automation. The shared prefix is the sweep marker
// globalTeardown uses to delete this run's coupons AND leftovers from
// interrupted runs — see apiHelper.deleteAutomationCoupons.
export const AUTOMATION_COUPON_PREFIX = "AUTO";
export const generateCouponCode = () =>
  `${AUTOMATION_COUPON_PREFIX}${generateRunId().toUpperCase()}`;

export function generateDemoFormData(): DemoFormData & { uniqueId: string } {
  const uniqueId = uuidv4().split("-")[0];
  return {
    uniqueId,
    firstName: "Test",
    lastName: "Automation",
    email: `test+${uniqueId}@${EMAIL_DOMAIN}`,
    phone: "5551234567",
    restaurantName: `Automation Restaurant ${uniqueId}`,
    preferredContact: "email",
    agreeToTerms: true,
  };
}

// Unique, recognizable email for an invited/registered test user. The
// TEST_USER_MARKER prefix lets cleanup find leftovers. In QA all outbound mail
// is captured by the Mailtrap sandbox, so the domain need not be real.
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
export interface SharedState {
  email: string;
  firstName: string;
  lastName: string;
  submittedAt: string; // ISO 8601
  restaurantId: string;
  restaurantName: string;
  menuGroupId: string;
  menuItemId: string;
  menuItemName: string;
  menuItemPrice: number;
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
