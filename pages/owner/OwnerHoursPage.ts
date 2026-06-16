import { type Page, expect } from "@playwright/test";

export const createOwnerHoursPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToHoursTab = async () => {
    await drawer().getByRole("button", { name: /hours/i }).first().click();
    await page.waitForURL(/tab=Hours|tab=hours/i, { timeout: 10_000 });
    await page.getByText(/monday/i).waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertDayVisible = (day: string) =>
    expect(page.getByText(day, { exact: false })).toBeVisible({ timeout: 10_000 });

  const assertHoursTabLoaded = () =>
    expect(page.getByText(/monday/i)).toBeVisible({ timeout: 15_000 });

  return { navigateToHoursTab, assertDayVisible, assertHoursTabLoaded };
};
