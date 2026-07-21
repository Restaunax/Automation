import { type Page, expect } from "@playwright/test";

export const createAdminRestaurantsPage = (page: Page) => {
  const searchInput = () =>
    page.locator('input[placeholder*="Search"]').first();

  const goto = async () => {
    await page.goto("/admin?tab=restaurant&section=restaurant", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: /restaurant management/i })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(
      page.getByRole("heading", { name: /restaurant management/i })
    ).toBeVisible({ timeout: 15_000 });

  const assertTableColumnVisible = (columnName: string) =>
    expect(page.getByRole("columnheader", { name: columnName })).toBeVisible({
      timeout: 10_000,
    });

  const findRowByName = (name: string) =>
    page.locator("tbody tr").filter({ hasText: name });

  const assertRestaurantRowVisible = async (name: string) => {
    await expect(findRowByName(name)).toBeVisible({ timeout: 10_000 });
  };

  return {
    goto,
    searchInput,
    assertPageLoaded,
    assertTableColumnVisible,
    findRowByName,
    assertRestaurantRowVisible,
  };
};
