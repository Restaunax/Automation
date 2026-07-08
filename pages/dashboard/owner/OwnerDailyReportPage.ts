import { type Page, expect } from "@playwright/test";

/**
 * OwnerDailyReportPage — the owner "Daily Report" tab (Store Operations →
 * "Daily Report", PortalShell id "store-daily-close" → ?tab=store-daily-close,
 * rendering DailyCloseTab). The default view is the CURRENT business day's live
 * report: an "At a Glance" comparison-KPI block (Net Sales / Orders / Avg Order
 * Value / Customers) plus a "Sales" section, aggregated from the day's orders.
 *
 * Store Operations is a SidebarFlyoutSection — on desktop the sub-items live in
 * a flyout that opens when its header is clicked; then the "Daily Report" row is
 * clickable. Selectors use roles/visible text (no test-ids), consistent with the
 * other owner POMs.
 */
export const createOwnerDailyReportPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToDailyReportTab = async () => {
    // Open the Store Operations flyout (desktop: click the header opens it).
    await drawer().getByRole("button", { name: "Store Operations" }).click();
    // Click the "Daily Report" row that appears in the flyout.
    await page
      .getByRole("button", { name: "Daily Report", exact: true })
      .click();
    await page.waitForURL(/tab=store-daily-close/, { timeout: 10_000 });
    await comparisonsSection().waitFor({ state: "visible", timeout: 20_000 });
  };

  // "At a Glance" — the comparison-KPI block; a unique, stable signal that the
  // live current-day report finished loading.
  const comparisonsSection = () =>
    page.getByText("At a Glance", { exact: true });

  // The comparison tiles show the current day's headline figures.
  const netSalesTile = () => page.getByText("Net Sales", { exact: true });
  const ordersTile = () => page.getByText("Orders", { exact: true }).first();

  const assertReportLoaded = async () => {
    await expect(comparisonsSection()).toBeVisible({ timeout: 20_000 });
    await expect(netSalesTile()).toBeVisible({ timeout: 10_000 });
    await expect(ordersTile()).toBeVisible({ timeout: 10_000 });
  };

  const assertNoLoadError = () =>
    expect(page.getByText("Failed to load", { exact: false })).toHaveCount(0);

  return {
    navigateToDailyReportTab,
    comparisonsSection,
    netSalesTile,
    ordersTile,
    assertReportLoaded,
    assertNoLoadError,
  };
};
