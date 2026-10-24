import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  inviteStaffRaw,
  inviteUserRaw,
  ownerStaffRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

/**
 * Employee — invite a restaurant's (POS) staff (TC-940).
 *
 * Product decision (2026-10-23): a company EMPLOYEE CAN invite a restaurant's
 * staff — `POST /restaurant/:id/staff/invite` allows EMPLOYEE through
 * `requireOwnerOrAdmin`. Inviting COMPANY users (`/api/admin/users/invite`)
 * stays ADMIN-only, so EMPLOYEE gets 403 there. Runs on a throwaway tenant
 * (fresh owner + restaurant) that is removed afterwards. The invite email
 * goes to a Mailpit-routed auto address, so the test needs MAILPIT_BASE_URL.
 */
test.describe("Employee — invite restaurant staff (API)", () => {
  test.skip(
    !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD,
    "EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set in .env"
  );
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the test mints its own tenant)"
  );
  test.skip(
    !MAILPIT,
    "Requires Mailpit (MAILPIT_BASE_URL): the invite sends an email"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Employee Staff Invite");
    await allure.label("severity", "normal");
  });

  test("TC-940: an employee can invite a restaurant's staff, but not a company user", async () => {
    const runId = generateRunId();
    const admin = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const employee = await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
    const tenant = await createSecondOwner(admin.accessToken, runId, {
      alwaysFresh: true,
    });
    const restaurantId = tenant.restaurantId ?? "";
    let staffMemberId = "";
    let removal: Awaited<ReturnType<typeof deleteTestRestaurant>>;
    try {
      expect(restaurantId, "throwaway restaurant was not created").toBeTruthy();

      const email = `auto-emp-invite-${runId}@${DOMAIN}`;
      recordUserForCleanup(email);

      await allure.step("EMPLOYEE invites a staff member", async () => {
        const res = await inviteStaffRaw(employee.accessToken, restaurantId, {
          email,
          firstName: "Auto",
          lastName: "Invitee",
        });
        expect(res.status, JSON.stringify(res.data)).toBe(201);
        staffMemberId = String(res.data.data?.staffMemberId ?? "");
        expect(staffMemberId).toBeTruthy();
      });

      await allure.step("The staff record exists for the owner", async () => {
        const list = await ownerStaffRaw(
          tenant.accessToken,
          restaurantId,
          "GET"
        );
        expect(list.status, JSON.stringify(list.data)).toBe(200);
        expect(JSON.stringify(list.data)).toContain(staffMemberId);
      });

      await allure.step(
        "EMPLOYEE still cannot invite a company user (403)",
        async () => {
          const res = await inviteUserRaw(employee.accessToken, {
            email: `auto-emp-company-${runId}@${DOMAIN}`,
            role: "EMPLOYEE",
          } as LooseJson);
          expect(res.status, JSON.stringify(res.data)).toBe(403);
        }
      );
    } finally {
      if (staffMemberId) {
        await ownerStaffRaw(
          tenant.accessToken,
          restaurantId,
          "DELETE",
          `/${staffMemberId}`
        ).catch(() => {});
      }
      if (restaurantId) {
        removal = await deleteTestRestaurant(
          admin.accessToken,
          restaurantId
        ).catch((err) => {
          console.warn(`[staff-invite] cleanup of ${restaurantId} failed`, err);
          return undefined;
        });
      }
    }
    // Reached only when the body passed: insist nothing is left behind.
    expect(
      removal,
      `restaurant ${restaurantId} was not purged — it is still in QA`
    ).toBe("purged");
  });
});
