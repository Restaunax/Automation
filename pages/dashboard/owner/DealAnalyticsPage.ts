import { type Page, expect } from "@playwright/test";

/**
 * DealAnalytics.tsx — `?tab=deal-analytics`. Pure numbers + one table, fed by
 * GET /api/deals/restaurant/:id/stats (chain: /api/chains/:gid/deal-stats):
 * four metric cards (Total Deals, Active Deals, Total Revenue, Total Savings
 * Given), "Usage Summary" (Total Orders with Deals, Avg. Usage per Deal),
 * "Revenue Summary" (Total Revenue, Avg. Order Value) and "Top Performing
 * Deals" (Rank / Deal Name / Deal Price / Savings % / Times Used / Revenue),
 * or "No deal usage data yet". No date-range controls, no refresh.
 * Verified on QA 2026-08-18. Money is `$` + toFixed(2), savings chip is the
 * raw server value ("24.2% off").
 */
export const createDealAnalyticsPage = (page: Page) => {
  const heading = () =>
    page.getByRole("heading", { name: "Deal Analytics", exact: true });
  const assertLoaded = async () => {
    await expect(heading()).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .getByText("Total Savings Given")
        .or(page.getByText("No deal statistics available"))
    ).toBeVisible({ timeout: 20_000 });
  };

  /**
   * The big number rendered right before a metric/summary label. "Total
   * Revenue" appears twice (metric card + Revenue Summary) — both show the
   * same value, so the first is fine.
   */
  const metricValue = (label: string) =>
    page
      .getByText(label, { exact: true })
      .first()
      .locator("xpath=preceding::*[self::h3 or self::h4][1]");

  const topDealsTable = () =>
    page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Rank" }) });
  const topDealRow = (dealName: string) =>
    topDealsTable()
      .getByRole("row")
      .filter({ has: page.getByText(dealName, { exact: true }) });
  const noUsageYet = () => page.getByText("No deal usage data yet");
  const noStats = () => page.getByText("No deal statistics available");

  return {
    heading,
    assertLoaded,
    metricValue,
    topDealsTable,
    topDealRow,
    noUsageYet,
    noStats,
  };
};

export type DealAnalyticsPage = ReturnType<typeof createDealAnalyticsPage>;
