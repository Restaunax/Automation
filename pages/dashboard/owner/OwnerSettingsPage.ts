import { type Page, expect } from "@playwright/test";

/**
 * OwnerSettingsPage — the owner "Owner Settings" tab of the restaurant portal
 * (PortalShell menu id "Owner Settings" → ?tab=Owner Settings). Renders the
 * OwnerSettings view with two sub-tabs:
 *   - "Automated Reports" — BusinessReportSettingsTab (loads from
 *     GET api/owner-settings/reports/:restaurantId; toggles AUTO-SAVE via PUT)
 *   - "Notifications" — a "launching soon" placeholder
 *
 * These tests are intentionally READ-ONLY: the report toggles persist to the
 * shared QA owner account (and can trigger real summary emails), so we assert
 * the controls render without ever flipping a switch or saving — same principle
 * as the subscription/billing tests.
 */
export const createOwnerSettingsPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToOwnerSettingsTab = async () => {
    await drawer()
      .getByRole("button", { name: "Owner Settings", exact: true })
      .click();
    await page.waitForURL(/tab=Owner(%20|\+|\s)?Settings/, { timeout: 10_000 });
    await pageTitle().waitFor({ state: "visible", timeout: 15_000 });
  };

  // "Owner Settings" — <Typography variant="h5" component="h1">
  const pageTitle = () => page.getByRole("heading", { name: "Owner Settings" });

  // ── Sub-tabs ────────────────────────────────────────────────────────────────
  const subTab = (label: string) => page.getByRole("tab", { name: label });

  const goToSubTab = (label: string) => subTab(label).click();

  // ── Automated Reports sub-tab (default) ──────────────────────────────────────
  // Renders only after the settings GET resolves. This label is a
  // Typography with component="div" (not a heading role) and carries an inline
  // help icon, so match it by text rather than getByRole("heading").
  const automatedReportsHeading = () =>
    page.getByText("Automated Business Reports").first();

  // The "Save Settings" button and the Schedule section live inside the
  // `settings.enabled &&` block, so they only exist when the master toggle is
  // ON — account-state-dependent on shared QA, so tests must not require them.
  const saveButton = () => page.getByRole("button", { name: "Save Settings" });

  const assertLoaded = async () => {
    await expect(pageTitle()).toBeVisible({ timeout: 15_000 });
    await expect(subTab("Automated Reports")).toBeVisible({ timeout: 10_000 });
    await expect(subTab("Notifications")).toBeVisible({ timeout: 10_000 });
  };

  // Read-only: assert the always-present sections (Order Notifications +
  // Automated Business Reports), which render regardless of the toggle state.
  const assertReportsSettingsRendered = async () => {
    await expect(
      page.getByRole("heading", { name: "Order Notifications" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(automatedReportsHeading()).toBeVisible({ timeout: 15_000 });
  };

  // ── Notifications sub-tab (placeholder) ──────────────────────────────────────
  const assertNotificationsComingSoon = () =>
    expect(
      page.getByText("Notification settings — launching soon")
    ).toBeVisible({ timeout: 10_000 });

  return {
    navigateToOwnerSettingsTab,
    pageTitle,
    subTab,
    goToSubTab,
    automatedReportsHeading,
    saveButton,
    assertLoaded,
    assertReportsSettingsRendered,
    assertNotificationsComingSoon,
  };
};
