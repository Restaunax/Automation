import { type Page, expect } from "@playwright/test";
import { createOwnerRestaurantManagementPage } from "./OwnerRestaurantManagementPage";

export const createOwnerDealsPage = (page: Page) => {
  const mgmtPage = createOwnerRestaurantManagementPage(page);

  // Deals lives behind a flyout section (like Coupons): expand "Deals",
  // then click the "Manage Deals" sub-item.
  const navigateToManageDeals = async (restaurantId: string) => {
    await mgmtPage.goto(restaurantId);
    await mgmtPage
      .drawer()
      .getByRole("button", { name: "Deals", exact: true })
      .click();
    const manageDealsBtn = page.getByRole("button", {
      name: "Manage Deals",
      exact: true,
    });
    await manageDealsBtn.waitFor({ state: "visible", timeout: 5_000 });
    await manageDealsBtn.click();
    await page.waitForURL(/tab=deals/, { timeout: 10_000 });
    await page
      .getByRole("heading", { name: "Manage Deals" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertManageDealsLoaded = () =>
    expect(page.getByRole("heading", { name: "Manage Deals" })).toBeVisible({
      timeout: 10_000,
    });

  // "Create Deal" also appears as a sidebar flyout item with the same
  // accessible name — scope to #root's main content to get the page action.
  const createDealButton = () =>
    page
      .locator("#root")
      .getByRole("button", { name: "Create Deal", exact: true });

  return { navigateToManageDeals, assertManageDealsLoaded, createDealButton };
};

export type OwnerDealsPage = ReturnType<typeof createOwnerDealsPage>;
