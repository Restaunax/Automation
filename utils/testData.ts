import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type { DemoFormData } from "../pages/public/DemoBookingPage";

export const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://app.qa.restaunax.com";

const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "restaunax-test.com";

// ── Shared temp file paths (all relative to Automation/) ────────────────────
export const STATE_FILE      = path.resolve(__dirname, "../shared-state.tmp.json");
export const OWNER_AUTH_FILE = path.resolve(__dirname, "../owner-auth.tmp.json");
export const ADMIN_AUTH_FILE = path.resolve(__dirname, "../admin-auth.tmp.json");

// ── Test data generators ─────────────────────────────────────────────────────
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
  submittedAt: string;     // ISO 8601
  restaurantId: string;
  restaurantName: string;
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
