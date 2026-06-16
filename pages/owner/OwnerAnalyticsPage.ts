import { type Page, expect } from "@playwright/test";

export const createOwnerAnalyticsPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToAnalyticsTab = async () => {
    await drawer().getByRole("button", { name: /analytics/i }).first().click();
    await page.waitForURL(/tab=Analytics|tab=analytics/i, { timeout: 10_000 });
    await page.getByText(/total (orders|revenue|sales)/i).waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertAnalyticsTabLoaded = () =>
    expect(page.getByText(/total (orders|revenue|sales)/i)).toBeVisible({ timeout: 15_000 });

  return { navigateToAnalyticsTab, assertAnalyticsTabLoaded };
};
