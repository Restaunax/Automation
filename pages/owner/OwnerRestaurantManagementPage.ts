import { type Page, expect } from "@playwright/test";

export const createOwnerRestaurantManagementPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement`,
      { waitUntil: "domcontentloaded" }
    );
    await drawer().waitFor({ state: "visible", timeout: 20_000 });
  };

  const clickSidebarItem = (label: string) =>
    drawer().getByRole("button", { name: label, exact: true }).click();

  const assertPortalShellLoaded = () =>
    expect(drawer()).toBeVisible({ timeout: 15_000 });

  return { goto, drawer, clickSidebarItem, assertPortalShellLoaded };
};
