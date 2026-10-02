/**
 * AdminUsersPage.ts
 *
 * Page Object for the admin User-management tab (/admin?tab=user) of the
 * Restaunax dashboard. Factory style per TEST_PLAN — no classes.
 *
 * The dashboard is MUI + i18n. Every visible string is centralized in `S`
 * (sourced from restaunax-frontend/public/locales/en/admin.json → userManagement)
 * so label drift is a one-line fix. The user detail panel is a right-anchored
 * MUI Drawer (SideSheet), not a dialog; its tabs carry aria-labels so
 * getByRole("tab") resolves at any viewport. Role labels differ by surface:
 * the invite dialog shows display names ("Owner"); the filter and change-role
 * dropdowns show raw enum values ("OWNER").
 */

import { type Page, type Locator, expect } from "@playwright/test";

// ── Centralized UI strings (en/admin.json → userManagement) ─────────────────
const S = {
  inviteUserBtn: "Invite User",
  inviteDialogTitle: "Invite New User",
  sendInvitation: "Send Invitation",
  sending: "Sending...",
  searchPlaceholder: "Search by name, email, or role...",
  allRoles: "All Roles",
  allStatuses: "All Statuses",
  statusActive: "Active",
  statusInactive: "Inactive",
  noUsersFound: "No users found",
  invitationSentSnackbar: "User invitation sent successfully!",
  restaurantSearchPlaceholder: "Search by restaurant name...",
  // detail side sheet
  tabOverview: "Overview",
  tabDemos: "Demos",
  tabRestaurants: "Restaurants",
  tabPermissions: "Permissions",
  tabSettings: "Settings",
  close: "Close",
  overviewBasicInfo: "Basic Information",
  // settings tab
  changeRoleBtn: "Change Role",
  changeRoleDialogTitle: "Change User Role",
  deactivate: "Deactivate Account",
  activate: "Activate Account",
  sendPasswordReset: "Send Password Reset Email",
  deactivatedSuccess: "User deactivated successfully",
  activatedSuccess: "User activated successfully",
  passwordResetSuccess: "Password reset email sent successfully",
  roleUpdatedSuccess: "User role updated successfully",
  // permissions tab
  addPermissions: "Add Permissions",
  addPermissionsDialogTitle: "Add Permissions to User",
} as const;

export interface InviteOptions {
  email: string;
  /** Invite-dialog display name: "User" | "Owner" | "Employee" | "Admin". */
  role: string;
  firstName?: string;
  lastName?: string;
  /** Restaurant name to assign — only valid when role is "Owner". */
  restaurant?: string;
}

export const createAdminUsersPage = (page: Page) => {
  const searchInput = page.getByPlaceholder(S.searchPlaceholder);
  const inviteDialog = page
    .locator('[role="dialog"]')
    .filter({ hasText: S.inviteDialogTitle });
  // Scope to the detail SideSheet (Drawer): the only drawer that contains tabs.
  const sideSheet = page
    .locator(".MuiDrawer-paper")
    .filter({ has: page.locator('[role="tab"]') });
  // MUI Select/Autocomplete popover. The waitFor-hidden calls after option
  // clicks are best-effort (.catch(() => {})): the popover unmounts async and
  // occasionally outlives the wait, but every caller's next action asserts
  // the real outcome, so a lingering popover surfaces there if it matters.
  const listbox = page.locator('[role="listbox"]');

  const goto = async (): Promise<void> => {
    await page.goto("/admin?tab=people&section=user", {
      waitUntil: "domcontentloaded",
    });
    await searchInput.waitFor({ state: "visible", timeout: 15_000 });
    // Wait for the initial user-list fetch so the React effect's initialLoadDone
    // flag is true before any search fill — prevents the debounced search from
    // being skipped when fill() runs before the initial GET completes.
    await page
      .waitForResponse((r) => /\/api\/admin\/users(\?|$)/.test(r.url()), {
        timeout: 15_000,
      })
      .catch(() => {});
  };

  // ── list / search / filter ────────────────────────────────────────────────
  // QA renders UserManagement as a MUI DataGrid (role="grid") — no <tbody>/<tr>.
  const rows = (): Locator => page.locator('[role="rowgroup"] [role="row"]');
  const findRowByEmail = (email: string): Locator =>
    rows().filter({ hasText: email });

  const searchUser = async (q: string): Promise<void> => {
    // Register BEFORE fill so the promise is already listening when the 500ms
    // debounce fires — avoids the race where the response arrives before
    // waitForResponse is set up. URL must contain ?q= to distinguish search
    // calls from the initial page-load GET /api/admin/users.
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/admin/users?q="),
      { timeout: 10_000 }
    );
    await searchInput.fill(q);
    await responsePromise.catch(() => {});
  };

  const assertRowExists = async (email: string): Promise<Locator> => {
    const row = findRowByEmail(email);
    await expect(row).toBeVisible({ timeout: 10_000 });
    return row;
  };

  const assertNoResults = (): Promise<void> =>
    expect(page.getByText(S.noUsersFound)).toBeVisible({ timeout: 10_000 });

  // Filter Selects: testid-first with positional fallback (TEST_PLAN →
  // "Locator strategy"). data-testid=user-role-filter/user-status-filter live
  // on the Select roots in frontend source; scoping to the combobox INSIDE
  // the testid root makes both branches resolve to the same node once the
  // testids reach QA ([0]=role, [1]=status are the legacy positions).
  const roleFilterCombobox = () =>
    page
      .getByTestId("user-role-filter")
      .locator('[role="combobox"]')
      .or(page.locator('[role="combobox"]').nth(0))
      .first();
  const statusFilterCombobox = () =>
    page
      .getByTestId("user-status-filter")
      .locator('[role="combobox"]')
      .or(page.locator('[role="combobox"]').nth(1))
      .first();

  const filterByRole = async (roleLabel: string): Promise<void> => {
    await roleFilterCombobox().click();
    await listbox.getByRole("option", { name: roleLabel, exact: true }).click();
    await listbox.waitFor({ state: "hidden" }).catch(() => {});
  };
  const filterByStatus = async (statusLabel: string): Promise<void> => {
    await statusFilterCombobox().click();
    await listbox
      .getByRole("option", { name: statusLabel, exact: true })
      .click();
    await listbox.waitFor({ state: "hidden" }).catch(() => {});
  };

  // ── invite dialog ───────────────────────────────────────────────────────--
  const openInviteDialog = async (): Promise<void> => {
    await page.getByRole("button", { name: S.inviteUserBtn }).click();
    await expect(inviteDialog).toBeVisible({ timeout: 10_000 });
  };

  const inviteNameField = (label: string): Locator =>
    inviteDialog
      .locator(`.MuiFormControl-root:has(label:has-text("${label}")) input`)
      .first();

  const inviteEmailInput = (): Locator =>
    inviteDialog.locator('input[type="email"]');

  /** Select a role in the open invite dialog (display name, e.g. "Owner"). */
  const selectInviteRole = async (roleLabel: string): Promise<void> => {
    await inviteDialog.locator('[role="combobox"]').first().click();
    await listbox.getByRole("option", { name: roleLabel, exact: true }).click();
    await listbox.waitFor({ state: "hidden" }).catch(() => {});
  };

  const cancelInviteDialog = async (): Promise<void> => {
    await inviteDialog.getByRole("button", { name: "Cancel" }).click();
    await inviteDialog.waitFor({ state: "hidden", timeout: 5_000 });
  };

  const fillInvite = async (opts: InviteOptions): Promise<void> => {
    await inviteDialog.locator('input[type="email"]').fill(opts.email);
    if (opts.firstName)
      await inviteNameField("First Name").fill(opts.firstName);
    if (opts.lastName) await inviteNameField("Last Name").fill(opts.lastName);
    // Role Select is the first combobox in the dialog (the owner restaurant
    // Autocomplete only appears AFTER a role is chosen).
    await inviteDialog.locator('[role="combobox"]').first().click();
    await listbox.getByRole("option", { name: opts.role, exact: true }).click();
    if (opts.restaurant) {
      const ac = inviteDialog.getByPlaceholder(S.restaurantSearchPlaceholder);
      await ac.fill(opts.restaurant);
      await page
        .locator('[role="option"]')
        .filter({ hasText: opts.restaurant })
        .first()
        .click();
    }
  };

  /** Click Send and return the invite network response (any status). */
  const submitInvite = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/users/invite")),
      inviteDialog
        .getByRole("button", {
          name: new RegExp(`${S.sendInvitation}|${S.sending}`),
        })
        .click(),
    ]);
    return resp;
  };

  const inviteSubmitButton = (): Locator =>
    inviteDialog.getByRole("button", {
      name: new RegExp(`${S.sendInvitation}|${S.sending}`),
    });

  const assertInviteError = (substr: string | RegExp): Promise<void> =>
    expect(inviteDialog.getByRole("alert")).toContainText(substr);

  const ownerRestaurantAutocomplete = (): Locator =>
    inviteDialog.getByPlaceholder(S.restaurantSearchPlaceholder);

  // ── detail side sheet & tabs ────────────────────────────────────────────--
  const openUserDetails = async (email: string): Promise<void> => {
    await findRowByEmail(email).first().click();
    await expect(sideSheet).toBeVisible({ timeout: 10_000 });
    // Detail GET drives tab rendering — wait for the tablist to settle.
    await sideSheet
      .getByRole("tab")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  const switchTab = async (tabName: string): Promise<void> => {
    await sideSheet.getByRole("tab", { name: tabName }).click();
  };
  const assertTabPresent = (tabName: string): Promise<void> =>
    expect(sideSheet.getByRole("tab", { name: tabName })).toBeVisible();
  const assertTabAbsent = (tabName: string): Promise<void> =>
    expect(sideSheet.getByRole("tab", { name: tabName })).toHaveCount(0);

  const closeSideSheet = async (): Promise<void> => {
    // Two "Close" controls exist (header X IconButton + footer Button) — the
    // header one is first in the DOM; either dismisses the drawer.
    await sideSheet.getByRole("button", { name: S.close }).first().click();
    await sideSheet.waitFor({ state: "hidden", timeout: 5_000 });
  };

  // ── settings tab ────────────────────────────────────────────────────────--
  /** Change role via the Settings tab. newRole = enum value, e.g. "OWNER". */
  const changeRole = async (newRole: string) => {
    await sideSheet.getByRole("button", { name: S.changeRoleBtn }).click();
    const dlg = page
      .locator('[role="dialog"]')
      .filter({ hasText: S.changeRoleDialogTitle });
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    await dlg.locator('[role="combobox"]').click();
    await listbox.getByRole("option", { name: newRole, exact: true }).click();
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/roles\/users\/[^/]+$/.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      dlg.getByRole("button", { name: S.changeRoleBtn }).click(),
    ]);
    return resp;
  };

  const toggleStatus = async () => {
    const btn = sideSheet.getByRole("button", {
      name: new RegExp(`${S.deactivate}|${S.activate}`),
    });
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/toggle-status")),
      btn.click(),
    ]);
    // The action triggers a detail re-fetch that re-renders the tab — wait for
    // it so the button reflects the new state before any follow-up toggle.
    await page
      .waitForResponse(
        (r) =>
          /\/api\/admin\/users\/[^/?]+$/.test(r.url()) &&
          r.request().method() === "GET"
      )
      .catch(() => {});
    return resp;
  };

  const sendPasswordReset = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) =>
        r.url().includes("/login/password-reset/request")
      ),
      sideSheet.getByRole("button", { name: S.sendPasswordReset }).click(),
    ]);
    return resp;
  };

  // ── permissions tab ─────────────────────────────────────────────────────--
  const addPermissionsButton = (): Locator =>
    sideSheet.getByRole("button", { name: S.addPermissions });

  /**
   * Open the Add-Permissions dialog, select the first OFFERED option (whatever
   * the catalog currently exposes — never hardcoded), submit. Returns the POST
   * response so the spec can confirm via the API which permission was granted.
   */
  const addFirstAvailablePermission = async () => {
    await addPermissionsButton().click();
    const dlg = page
      .locator('[role="dialog"]')
      .filter({ hasText: S.addPermissionsDialogTitle });
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    await dlg.getByRole("combobox").click();
    const firstOption = page
      .locator('[role="listbox"] [role="option"]')
      .first();
    await firstOption.waitFor({ state: "visible", timeout: 10_000 });
    await firstOption.click();
    // Close the Autocomplete popup so it can't intercept the submit click.
    // (The dialog itself ignores Escape, so this only dismisses the popup.)
    await page.keyboard.press("Escape");
    const submit = dlg.getByRole("button", { name: S.addPermissions });
    await expect(submit).toBeEnabled();
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/roles\/users\/[^/]+\/permissions$/.test(r.url()) &&
          r.request().method() === "POST"
      ),
      submit.click(),
    ]);
    return resp;
  };

  /** Remove the first user-specific permission (delete IconButton in the list). */
  const removeFirstUserPermission = async () => {
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/roles\/users\/[^/]+\/permissions\/[^/]+$/.test(r.url()) &&
          r.request().method() === "DELETE"
      ),
      sideSheet.locator("li button").first().click(),
    ]);
    return resp;
  };

  // ── feedback helpers ────────────────────────────────────────────────────--
  const assertSnackbar = (text: string): Promise<void> =>
    expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

  /** Inline success/error Alert inside the detail side sheet (settings/perms). */
  const assertSideSheetAlert = (text: string): Promise<void> =>
    expect(sideSheet.getByRole("alert").filter({ hasText: text })).toBeVisible({
      timeout: 10_000,
    });

  return {
    S,
    searchInput,
    rows,
    goto,
    findRowByEmail,
    searchUser,
    assertRowExists,
    assertNoResults,
    filterByRole,
    filterByStatus,
    openInviteDialog,
    fillInvite,
    selectInviteRole,
    cancelInviteDialog,
    inviteEmailInput,
    submitInvite,
    inviteSubmitButton,
    assertInviteError,
    ownerRestaurantAutocomplete,
    openUserDetails,
    sideSheet,
    switchTab,
    assertTabPresent,
    assertTabAbsent,
    closeSideSheet,
    changeRole,
    toggleStatus,
    sendPasswordReset,
    addPermissionsButton,
    addFirstAvailablePermission,
    removeFirstUserPermission,
    assertSnackbar,
    assertSideSheetAlert,
  };
};

export type AdminUsersPage = ReturnType<typeof createAdminUsersPage>;
