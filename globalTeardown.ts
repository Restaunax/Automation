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
  deleteTestMenuItem,
  deleteTestMenuGroupWithItems,
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

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

export default async function globalTeardown(): Promise<void> {
  console.log("\n[globalTeardown] Starting cleanup…");

  // 1. Delete the seed menu item + group created by globalSetup.
  //    The restaurant itself is an existing owner restaurant — do NOT delete it.
  if (OWNER_EMAIL && OWNER_PASSWORD && fs.existsSync(STATE_FILE)) {
    try {
      const { menuItemId, menuGroupId, restaurantId, restaurantName } =
        readSharedState();
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

      if (menuItemId) {
        await deleteTestMenuItem(accessToken, menuItemId);
        console.log(`[globalTeardown] Deleted seed menu item (${menuItemId})`);
      }
      if (menuGroupId) {
        // deleteTestMenuGroupWithItems first drains any leftover items (e.g.
        // from tests that create items in the seed category) before deleting
        // the group, preventing the "Cannot Delete Category With Items" error.
        await deleteTestMenuGroupWithItems(
          accessToken,
          restaurantId,
          menuGroupId
        );
        console.log(
          `[globalTeardown] Deleted seed menu group (${menuGroupId}) from ${restaurantName}`
        );
      }
    } catch (err) {
      console.warn("[globalTeardown] Failed to clean up seed menu data:", err);
    }
  } else {
    console.warn(
      "[globalTeardown] Skipping menu cleanup (missing owner credentials or state file)"
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
