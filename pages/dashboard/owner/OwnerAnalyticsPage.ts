import { type Page, expect } from "@playwright/test";

/**
 * OwnerAnalyticsPage — the owner "Analytics" tab of the restaurant portal
 * (PortalShell menu id "Analytics" → ?tab=Analytics). Renders the
 * Restaurant Analytics dashboard: summary cards, a date-range picker, and a
 * set of charts, all driven by GET /api/analytics/dashboard/:restaurantId.
 *
 * Selectors use roles/visible text (no test-ids) to match the QA deployment,
 * consistent with OwnerOrdersPage. The page title, card titles, and quick-
 * select labels come from the `analytics` i18n namespace.
 */
export const createOwnerAnalyticsPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToAnalyticsTab = async () => {
    await drawer()
      .getByRole("button", { name: "Analytics", exact: true })
      .click();
    await page.waitForURL(/tab=Analytics/, { timeout: 10_000 });
    await pageTitle().waitFor({ state: "visible", timeout: 15_000 });
  };

  // "Restaurant Analytics" — rendered as <Typography variant="h4" component="h1">
  const pageTitle = () =>
    page.getByRole("heading", { name: "Restaurant Analytics" });

  const refreshButton = () =>
    page.getByRole("button", { name: "Refresh data" });

  // The date-range trigger is an outlined button whose label IS the formatted
  // range (e.g. "Jun 7, 2026 - Jul 7, 2026"). Match on that shape rather than a
  // fixed string so it survives whatever the current default window is.
  const dateRangeButton = () =>
    page.getByRole("button", { name: /\d{1,2},\s*\d{4}\s*-\s*/ });

  // ── Assertions ─────────────────────────────────────────────────────────────
  const assertLoaded = async () => {
    await expect(pageTitle()).toBeVisible({ timeout: 15_000 });
    await expect(refreshButton()).toBeVisible({ timeout: 10_000 });
    await expect(dateRangeButton()).toBeVisible({ timeout: 10_000 });
  };

  // The dashboard resolves to one of two deterministic states once the API
  // responds: summary cards (has data) OR the "no data for this range" empty
  // state. Both prove the tab loaded and the fetch completed without erroring.
  // Target the card by its heading — the same text also appears as a chart
  // caption ("Order Summary by Status"), so a plain getByText double-matches.
  const summaryCard = (title: string) =>
    page.getByRole("heading", { name: new RegExp(title) });

  const emptyState = () =>
    page.getByText("No analytics data for this date range");

  const assertDashboardResolved = async () => {
    await expect(
      summaryCard("Total Orders").or(emptyState()).first()
    ).toBeVisible({ timeout: 20_000 });
  };

  const assertNoError = () =>
    expect(
      page.getByText("Failed to load dashboard data. Please try again.")
    ).toHaveCount(0);

  // ── Date-range picker ──────────────────────────────────────────────────────
  const openDateRangePicker = async () => {
    await dateRangeButton().click();
    await page
      .getByText("Quick Select")
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  const quickSelectOption = (label: string) =>
    page.getByRole("button", { name: label, exact: true });

  // Pick a preset (e.g. "Last 7 days") and apply it.
  const applyQuickSelect = async (label: string) => {
    await quickSelectOption(label).click();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
  };

  return {
    navigateToAnalyticsTab,
    pageTitle,
    refreshButton,
    dateRangeButton,
    summaryCard,
    emptyState,
    assertLoaded,
    assertDashboardResolved,
    assertNoError,
    openDateRangePicker,
    quickSelectOption,
    applyQuickSelect,
  };
};
