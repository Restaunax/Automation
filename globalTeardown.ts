/**
 * globalTeardown.ts
 *
 * Runs once after all tests. Responsibilities:
 *   1. Delete the seed test restaurant created by globalSetup
 *   2. Clean up all *.tmp.json state files
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  apiLogin,
  deleteTestRestaurant,
  deleteRecordedUsers,
} from "./utils/apiHelper";
import {
  STATE_FILE,
  OWNER_AUTH_FILE,
  ADMIN_AUTH_FILE,
  USERS_CLEANUP_FILE,
  readSharedState,
} from "./utils/testData";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

export default async function globalTeardown(): Promise<void> {
  console.log("\n[globalTeardown] Starting cleanup…");

  // 1. Delete the seed restaurant via admin API
  if (ADMIN_EMAIL && ADMIN_PASSWORD && fs.existsSync(STATE_FILE)) {
    try {
      const { restaurantId, restaurantName } = readSharedState();

      if (restaurantId) {
        const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
        await deleteTestRestaurant(accessToken, restaurantId);
        console.log(
          `[globalTeardown] Deleted test restaurant: ${restaurantName} (${restaurantId})`
        );
      }
    } catch (err) {
      // Log but don't throw — a teardown failure must not mask test results
      console.warn("[globalTeardown] Failed to delete test restaurant:", err);
    }
  } else {
    console.warn(
      "[globalTeardown] Skipping restaurant cleanup (missing admin credentials or state file)"
    );
  }

  // 2. Delete any users created by the admin user-management suite (best-effort).
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    try {
      const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
      await deleteRecordedUsers(accessToken);
      console.log("[globalTeardown] Cleaned up recorded test users");
    } catch (err) {
      console.warn("[globalTeardown] Failed to clean up test users:", err);
    }
  }

  // 3. Remove all temp files
  for (const f of [
    STATE_FILE,
    OWNER_AUTH_FILE,
    ADMIN_AUTH_FILE,
    USERS_CLEANUP_FILE,
  ]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`[globalTeardown] Removed ${path.basename(f)}`);
    }
  }

  console.log("[globalTeardown] Cleanup complete.\n");
}
