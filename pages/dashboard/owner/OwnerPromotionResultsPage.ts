import { type Page, expect } from "@playwright/test";

/**
 * Owner — Promotions › Results (?tab=promotion-results).
 *
 * Five KPI cards, then either the day-by-day trend ("Day by day, last N
 * days") or — when nothing was used in the range — the "No results yet"
 * empty state; a 30 / 60 / 90 days toggle in the header. Copy:
 * restaunax-frontend/public/locales/en/promotions.json → results.
 */
export const createOwnerPromotionResultsPage = (page: Page) => {
  const heading = () =>
    page.getByRole("heading", { name: "Results", level: 1, exact: true });
  const range = () => page.getByRole("group", { name: "Show results for" });
  const rangeButton = (days: 30 | 60 | 90) =>
    range().getByRole("button", { name: `${days} days`, exact: true });
  const kpi = (label: string) => page.getByText(label, { exact: true }).first();
  const trend = (days: number) =>
    page.getByRole("heading", { name: `Day by day, last ${days} days` });
  const empty = () => page.getByText("No results yet", { exact: true });

  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=promotion-results`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(heading()).toBeVisible({ timeout: 20_000 });
  };

  /** KPIs loaded, and the trend (or the no-activity state) for the range. */
  const expectLoaded = async (days: 30 | 60 | 90 = 30) => {
    await expect(rangeButton(days)).toHaveAttribute("aria-pressed", "true");
    for (const label of [
      "Live promotions",
      "Times used",
      "Savings given",
      "Orders with a promotion",
      "Revenue with promotions",
    ]) {
      await expect(kpi(label)).toBeVisible({ timeout: 20_000 });
    }
    await expect(trend(days).or(empty())).toBeVisible({ timeout: 20_000 });
  };

  const selectRange = async (days: 30 | 60 | 90) => {
    await rangeButton(days).click();
    await expect(rangeButton(days)).toHaveAttribute("aria-pressed", "true");
  };

  return { heading, goto, expectLoaded, selectRange, trend, empty };
};

export type OwnerPromotionResultsPage = ReturnType<
  typeof createOwnerPromotionResultsPage
>;
