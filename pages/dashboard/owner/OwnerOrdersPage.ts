import { type Page, expect } from "@playwright/test";

export const createOwnerOrdersPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToOrdersTab = async () => {
    await drawer().getByRole("button", { name: "Orders", exact: true }).click();
    await page.waitForURL(/tab=Orders/, { timeout: 10_000 });
    await page
      .getByPlaceholder("Search orders, customers, phone...")
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const searchInput = () =>
    page.getByPlaceholder("Search orders, customers, phone...");

  const filtersButton = () => page.getByRole("button", { name: "Filters" });

  const emptyStateMessage = () =>
    page.getByText("No orders found matching your filters");

  const assertOrdersTabLoaded = () =>
    expect(searchInput()).toBeVisible({ timeout: 15_000 });

  const assertTableColumnVisible = (columnName: string) =>
    expect(page.getByRole("columnheader", { name: columnName })).toBeVisible({
      timeout: 10_000,
    });

  const searchOrders = async (query: string) => {
    await searchInput().fill(query);
  };

  return {
    navigateToOrdersTab,
    searchInput,
    filtersButton,
    emptyStateMessage,
    assertOrdersTabLoaded,
    assertTableColumnVisible,
    searchOrders,
  };
};
