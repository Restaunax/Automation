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
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroupWithItems,
  deleteAutomationMenuGroups,
  deleteAutomationCoupons,
  deleteDemoRequestByEmail,
  deleteRecordedUsers,
} from "./utils/apiHelper";
import {
  STATE_FILE,
  OWNER_AUTH_FILE,
  ADMIN_AUTH_FILE,
  EMPLOYEE_AUTH_FILE,
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

  // Admin token (optional): needed for the HARD item delete — the plain item
  // delete only soft-deletes, and the backend's category delete counts
  // soft-deleted items, so groups drained via soft delete can never be
  // removed ("Cannot Delete Category With Items").
  let adminToken: string | undefined;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    try {
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    } catch (err) {
      console.warn("[globalTeardown] Admin login failed:", err);
    }
  }

  // 1. Delete the seed menu item + group created by globalSetup, plus any
  //    automation-created categories/coupons — this run's AND leftovers from
  //    interrupted runs. The restaurant itself is an existing owner
  //    restaurant — do NOT delete it. Each step has its own try/catch so one
  //    failure can't skip the rest of the cleanup.
  if (OWNER_EMAIL && OWNER_PASSWORD && fs.existsSync(STATE_FILE)) {
    const { menuItemId, menuGroupId, restaurantId, restaurantName } =
      readSharedState();
    let accessToken = "";
    try {
      ({ accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));
    } catch (err) {
      console.warn("[globalTeardown] Owner login failed:", err);
    }

    if (accessToken && menuItemId) {
      try {
        if (adminToken) {
          // Hard delete so the seed group can actually be removed afterwards.
          await permanentlyDeleteMenuItemApi(adminToken, menuItemId);
        } else {
          await deleteTestMenuItem(accessToken, menuItemId);
        }
        console.log(`[globalTeardown] Deleted seed menu item (${menuItemId})`);
      } catch (err) {
        console.warn("[globalTeardown] Failed to delete seed menu item:", err);
      }
    }

    if (accessToken && menuGroupId) {
      try {
        // Drains remaining items first (hard-deleted when adminToken is
        // available) so the group delete isn't blocked.
        await deleteTestMenuGroupWithItems(
          accessToken,
          restaurantId,
          menuGroupId,
          adminToken
        );
        console.log(
          `[globalTeardown] Deleted seed menu group (${menuGroupId}) from ${restaurantName}`
        );
      } catch (err) {
        console.warn("[globalTeardown] Failed to delete seed menu group:", err);
      }
    }

    if (accessToken && restaurantId) {
      // Sweep categories the menu-management UI tests created (this run's
      // "Test Starters <id>" / "TC45 Delete <id>" plus any prior leftovers,
      // including orphaned "Automation Items" seed groups from older runs).
      try {
        const groupsDeleted = await deleteAutomationMenuGroups(
          accessToken,
          restaurantId,
          adminToken
        );
        if (groupsDeleted) {
          console.log(
            `[globalTeardown] Deleted ${groupsDeleted} automation menu group(s)`
          );
        }
      } catch (err) {
        console.warn("[globalTeardown] Menu group sweep failed:", err);
      }

      // Sweep AUTO* coupons the coupon tests created (never cleaned before —
      // they accumulated and risked duplicate-code collisions).
      try {
        const couponsDeleted = await deleteAutomationCoupons(
          accessToken,
          restaurantId
        );
        if (couponsDeleted) {
          console.log(
            `[globalTeardown] Deleted ${couponsDeleted} automation coupon(s)`
          );
        }
      } catch (err) {
        console.warn("[globalTeardown] Coupon sweep failed:", err);
      }
    }
  } else {
    console.warn(
      "[globalTeardown] Skipping menu cleanup (missing owner credentials or state file)"
    );
  }

  // 2. Admin-token cleanup: recorded test users + this run's demo request
  //    (globalSetup submits one per run; without this it accumulates forever).
  if (adminToken) {
    try {
      await deleteRecordedUsers(adminToken);
      console.log("[globalTeardown] Cleaned up recorded test users");
    } catch (err) {
      console.warn("[globalTeardown] Failed to clean up test users:", err);
    }

    if (fs.existsSync(STATE_FILE)) {
      try {
        const { email } = readSharedState();
        if (email && (await deleteDemoRequestByEmail(adminToken, email))) {
          console.log(
            `[globalTeardown] Deleted this run's demo request (${email})`
          );
        }
      } catch (err) {
        console.warn(
          "[globalTeardown] Failed to delete this run's demo request:",
          err
        );
      }
    }
  }

  // 3. Remove all temp files
  for (const f of [
    STATE_FILE,
    OWNER_AUTH_FILE,
    ADMIN_AUTH_FILE,
    EMPLOYEE_AUTH_FILE,
    USERS_CLEANUP_FILE,
  ]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`[globalTeardown] Removed ${path.basename(f)}`);
    }
  }

  console.log("[globalTeardown] Cleanup complete.\n");
}
