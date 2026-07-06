/**
 * users.spec.ts — Admin User Management (/admin?tab=user)
 *
 * Comprehensive coverage of every action in the admin User tab, plus the
 * cross-cutting "invite → claim → login → see access level" journey.
 *
 * Strategy (see TEST_PLAN + the plan file):
 *   • In-tab actions are driven through the UI (adminPage fixture) and confirmed
 *     by the network response and/or an admin API GET of server truth.
 *   • Target users for mutation tests are seeded via the admin create-user API
 *     (a real, deletable row with a known password) — independent of Mailtrap.
 *   • The full claim journey extracts the invite token from the Mailtrap sandbox
 *     email, registers a NEW user, asserts access level via /api/auth/me, then
 *     logs in through the real UI. Gated on the Mailtrap Email Testing token.
 *
 * Permissions are ALWAYS discovered at runtime — never hardcoded (the catalog
 * evolves). See utils/apiHelper getRolePermissions / getUserPermissions.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminUsersPage } from "../../../pages/dashboard/admin/AdminUsersPage";
import {
  apiLogin,
  adminCreateUser,
  adminGetUser,
  getRolePermissions,
  getUserPermissions,
  registerWithInvite,
  registerRaw,
  getMe,
  updateUserRoleRaw,
  toggleUserStatusRaw,
} from "../../../utils/apiHelper";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import { loginViaUi } from "../../../utils/auth";
import {
  generateUserEmail,
  recordUserForCleanup,
} from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const TEST_USER_PASSWORD = "AutoTest123!@#";
const mailtrapReady = !!(
  process.env.MAILTRAP_API_TOKEN && process.env.MAILTRAP_INBOX_ID
);

let adminToken = "";

/** Seed a real, deletable target user with a known password. */
async function createTargetUser(role = "USER"): Promise<{
  id: string;
  email: string;
}> {
  const email = generateUserEmail(role.toLowerCase());
  recordUserForCleanup(email);
  const user = await adminCreateUser(adminToken, {
    firstName: "Auto",
    lastName: "Target",
    email,
    password: TEST_USER_PASSWORD,
    role,
  });
  return { id: user.id, email };
}

test.describe("Admin — User Management", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  });

  // NOTE: deliberately no afterAll drain of the recorded-users file. That
  // file is GLOBAL — sign-up/sign-in specs record into it too, and with spec
  // files running in parallel a drain from here could delete a user another
  // file just created and still needs (e.g. sign-up TC-94's duplicate-email
  // flow). globalTeardown drains it once, after all workers finish.

  test.beforeEach(async () => {
    await allure.label("feature", "Admin / User Management");
    await allure.label("severity", "critical");
  });

  // ── Group A — Invite dialog ────────────────────────────────────────────────
  test.describe("Invite dialog", () => {
    test("TC-101: admin can invite a new user", async ({ adminPage }) => {
      const users = createAdminUsersPage(adminPage);
      const email = generateUserEmail("invite");
      recordUserForCleanup(email);

      await users.goto();
      await users.openInviteDialog();
      await users.fillInvite({ email, role: "User" });
      const resp = await users.submitInvite();

      expect(resp.status()).toBe(201);
      await users.assertSnackbar(users.S.invitationSentSnackbar);
    });

    test("TC-102: invalid email shows an error and sends no request", async ({
      adminPage,
    }) => {
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.openInviteDialog();
      await users.fillInvite({ email: "not-an-email", role: "User" });

      let invited = false;
      adminPage.on("request", (r) => {
        if (r.url().includes("/api/admin/users/invite")) invited = true;
      });
      await users.inviteSubmitButton().click();

      await users.assertInviteError(/valid email/i);
      expect(invited).toBe(false);
    });

    test("TC-103: submit is disabled until a role is selected", async ({
      adminPage,
    }) => {
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.openInviteDialog();
      await users.inviteEmailInput().fill(generateUserEmail("norole"));
      // Email present, role still empty → Send stays disabled.
      await expect(users.inviteSubmitButton()).toBeDisabled();
    });

    test("TC-104: inviting an existing email is rejected", async ({
      adminPage,
    }) => {
      // Seed a real user, then try to invite the same email via the UI.
      const { email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);

      await users.goto();
      await users.openInviteDialog();
      await users.fillInvite({ email, role: "User" });
      const resp = await users.submitInvite();

      expect(resp.status()).toBe(400);
      await users.assertInviteError(/already|in use|exists/i);
    });

    test("TC-105: Owner role reveals the restaurant autocomplete", async ({
      adminPage,
    }) => {
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.openInviteDialog();
      await users.inviteEmailInput().fill(generateUserEmail("owner"));

      await users.selectInviteRole("Owner");
      await expect(users.ownerRestaurantAutocomplete()).toBeVisible();

      await users.selectInviteRole("User");
      await expect(users.ownerRestaurantAutocomplete()).toHaveCount(0);
    });

    test("TC-106: cancel resets the invite form", async ({ adminPage }) => {
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.openInviteDialog();
      await users.inviteEmailInput().fill(generateUserEmail("cancel"));
      await users.cancelInviteDialog();

      await users.openInviteDialog();
      await expect(users.inviteEmailInput()).toHaveValue("");
    });
  });

  // ── Group B — List / search / filter ───────────────────────────────────────
  test.describe("List, search & filter", () => {
    let target: { id: string; email: string };

    test.beforeAll(async () => {
      if (adminToken) target = await createTargetUser("USER");
    });

    test("TC-107: search finds a user by email", async ({ adminPage }) => {
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(target.email);
      await users.assertRowExists(target.email);
    });

    test("TC-109: role filter narrows the list", async ({ adminPage }) => {
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(target.email);
      await users.assertRowExists(target.email);

      // Filtering to a different role hides our USER row…
      await users.filterByRole("ADMIN");
      await expect(users.findRowByEmail(target.email)).toHaveCount(0);
      // …and resetting brings it back.
      await users.filterByRole("All Roles");
      await users.assertRowExists(target.email);
    });

    test("TC-110: status filter narrows the list", async ({ adminPage }) => {
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(target.email);
      await users.assertRowExists(target.email);

      // Filtering to "Inactive" hides our active USER row…
      await users.filterByStatus("Inactive");
      await expect(users.findRowByEmail(target.email)).toHaveCount(0);
      // …and resetting brings it back.
      await users.filterByStatus("All Statuses");
      await users.assertRowExists(target.email);
    });
  });

  // ── Group C — Detail side sheet & tabs ─────────────────────────────────────
  test.describe("Detail side sheet", () => {
    test("TC-111: clicking a row opens the detail side sheet", async ({
      adminPage,
    }) => {
      const { email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);
      await users.assertTabPresent(users.S.tabOverview);
    });

    test("TC-112: USER detail shows the role-appropriate tabs", async ({
      adminPage,
    }) => {
      const { email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);

      // USER role → Overview / Permissions / Settings only.
      await users.assertTabPresent(users.S.tabOverview);
      await users.assertTabPresent(users.S.tabPermissions);
      await users.assertTabPresent(users.S.tabSettings);
      await users.assertTabAbsent(users.S.tabDemos);
      await users.assertTabAbsent(users.S.tabRestaurants);

      await expect(
        adminPage
          .locator(".MuiDrawer-paper")
          .getByText(users.S.overviewBasicInfo)
      ).toBeVisible();
    });

    test("TC-113: OWNER detail exposes all tabs incl. read-only Restaurants", async ({
      adminPage,
    }) => {
      const { email } = await createTargetUser("OWNER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);

      for (const tab of [
        users.S.tabOverview,
        users.S.tabDemos,
        users.S.tabRestaurants,
        users.S.tabPermissions,
        users.S.tabSettings,
      ]) {
        await users.assertTabPresent(tab);
      }
      // Restaurants tab is read-only here (no assign/unassign UI) — just renders.
      await users.switchTab(users.S.tabRestaurants);
      await expect(adminPage.locator(".MuiDrawer-paper")).toBeVisible();
    });

    test("TC-114: the side sheet can be closed", async ({ adminPage }) => {
      const { email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);
      await users.closeSideSheet();
    });
  });

  // ── Group D — Settings tab actions ─────────────────────────────────────────
  test.describe("Settings tab", () => {
    test("TC-115: admin can change a user's role", async ({ adminPage }) => {
      const { id, email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);
      await users.switchTab(users.S.tabSettings);

      // The inline success Alert is wiped by the detail re-fetch (which
      // unmounts the tab), so assert on the PUT response + the server state.
      const resp = await users.changeRole("EMPLOYEE");
      expect(resp.ok()).toBeTruthy();

      const updated = await adminGetUser(adminToken, id);
      expect(updated.role).toBe("EMPLOYEE");
    });

    test("TC-116: admin can deactivate then reactivate a user", async ({
      adminPage,
    }) => {
      const { id, email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);
      await users.switchTab(users.S.tabSettings);

      // Confirm via the response + server state (the inline Alert is transient,
      // wiped by the re-fetch the toggle triggers).
      const deactivate = await users.toggleStatus();
      expect(deactivate.ok()).toBeTruthy();
      expect((await adminGetUser(adminToken, id)).isActive).toBe(false);

      const reactivate = await users.toggleStatus();
      expect(reactivate.ok()).toBeTruthy();
      expect((await adminGetUser(adminToken, id)).isActive).toBe(true);
    });

    test("TC-117: admin can send a password reset email", async ({
      adminPage,
    }) => {
      const { email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);
      await users.switchTab(users.S.tabSettings);

      const resp = await users.sendPasswordReset();
      expect(resp.ok()).toBeTruthy();
      await users.assertSideSheetAlert(users.S.passwordResetSuccess);
    });
  });

  // ── Group E — Permissions tab (fully dynamic) ──────────────────────────────
  test.describe("Permissions tab", () => {
    test("TC-118: admin can add then remove a user-specific permission", async ({
      adminPage,
    }) => {
      await allure.description(
        "Permissions are discovered at runtime: the test grants whatever the " +
          "Add dialog currently offers, never a hardcoded permission name."
      );
      const { id, email } = await createTargetUser("USER");
      const users = createAdminUsersPage(adminPage);
      await users.goto();
      await users.searchUser(email);
      await users.openUserDetails(email);
      await users.switchTab(users.S.tabPermissions);

      const before = (await getUserPermissions(adminToken, id))
        .userSpecificPermissions.length;

      // Add the first OFFERED permission (whatever the catalog exposes now).
      // Confirm via the POST response + server state (the inline Alert is wiped
      // by the re-fetch the action triggers).
      const addResp = await users.addFirstAvailablePermission();
      expect(addResp.ok()).toBeTruthy();

      const afterAdd = (await getUserPermissions(adminToken, id))
        .userSpecificPermissions.length;
      expect(afterAdd).toBe(before + 1);

      // Remove it again.
      const removeResp = await users.removeFirstUserPermission();
      expect(removeResp.ok()).toBeTruthy();

      const afterRemove = (await getUserPermissions(adminToken, id))
        .userSpecificPermissions.length;
      expect(afterRemove).toBe(before);
    });
  });

  // ── Group F0 — API-level negative cases ─────────────────────────────────────
  // Self-deactivation is deliberately NOT tested here: it would risk locking
  // out the shared ADMIN_EMAIL account this whole suite depends on if the
  // backend doesn't guard against it.
  test.describe("Settings tab — negative", () => {
    test("TC-76: changing a user's role to an unknown value is rejected", async () => {
      const { id } = await createTargetUser("USER");
      const res = await updateUserRoleRaw(adminToken, id, "NOT_A_ROLE");

      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      // Role must be unchanged on the server.
      expect((await adminGetUser(adminToken, id)).role).toBe("USER");
    });

    test("TC-77: toggling status of a nonexistent user id is rejected", async () => {
      const res = await toggleUserStatusRaw(
        adminToken,
        "00000000-0000-0000-0000-000000000000"
      );

      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
    });
  });

  // ── Group F — Negative claim (API, no Mailtrap needed) ─────────────────────
  test.describe("Invite claim — defensive", () => {
    test("TC-124: a bogus invite token grants no elevated access", async () => {
      const email = generateUserEmail("badtoken");
      recordUserForCleanup(email);

      const res = await registerRaw({
        firstName: "Auto",
        lastName: "BadToken",
        email,
        password: TEST_USER_PASSWORD,
        userInvitationToken: "deadbeef-not-a-real-token",
      });

      // Registration still succeeds, but the user stays a plain USER and the
      // invitation is NOT processed.
      expect(res.status).toBe(201);
      expect(res.data.role).toBe("USER");
      expect(
        (res.data as { invitationProcessed?: boolean }).invitationProcessed
      ).toBeFalsy();
    });
  });

  // ── Group G — Full journey: invite → email → claim → login (gated) ─────────
  test.describe("Invite → claim → login journey", () => {
    test.skip(
      !mailtrapReady,
      "Requires Mailtrap Email Testing token (MAILTRAP_API_TOKEN / MAILTRAP_INBOX_ID)"
    );

    test("TC-123: invited user claims access, and sees their access level", async ({
      adminPage,
      browser,
    }) => {
      // Email delivery + UI login push past the default 60s per-test budget.
      test.setTimeout(150_000);
      const users = createAdminUsersPage(adminPage);
      const email = generateUserEmail("journey");
      const invitedRole = "USER";
      recordUserForCleanup(email);

      // 1. Admin invites a brand-new user through the UI.
      await allure.step("Admin invites a new user", async () => {
        await users.goto();
        await users.openInviteDialog();
        await users.fillInvite({ email, role: "User" });
        const resp = await users.submitInvite();
        expect(resp.status()).toBe(201);
      });

      // 2. Pull the invitation token out of the Mailtrap sandbox email.
      const token = await allure.step("Extract token from email", async () => {
        const msg = await waitForEmail(email, {
          subjectPattern: /You've Been Invited to Join RestauNax/i,
          timeoutMs: 90_000,
        });
        // Prefer the text body (raw URL); the HTML body HTML-encodes the '='.
        return extractInviteToken(msg.text_body || msg.html_body);
      });

      // 3. The new user claims the invite by registering — role is granted.
      const claim = await allure.step("Register with the invite", async () => {
        const result = await registerWithInvite({
          firstName: "Auto",
          lastName: "Journey",
          email,
          password: TEST_USER_PASSWORD,
          userInvitationToken: token,
        });
        expect(result.role).toBe(invitedRole);
        return result;
      });

      // 4. Access level at the source of truth: /api/auth/me. Compare against
      //    the role's defaults fetched live (never a hardcoded list).
      await allure.step("Verify access level via /api/auth/me", async () => {
        const me = await getMe(claim.accessToken);
        expect(me.role).toBe(invitedRole);
        const roleDefaults = await getRolePermissions(adminToken, invitedRole);
        expect([...me.permissions].sort()).toEqual([...roleDefaults].sort());
      });

      // 5. The literal "user logs in and sees their access": real UI login.
      await allure.step("New user logs in through the UI", async () => {
        const { context, page } = await loginViaUi(
          browser,
          email,
          TEST_USER_PASSWORD
        );
        await expect(page).not.toHaveURL(/\/sign-in/);
        await context.close();
      });
    });
  });
});
