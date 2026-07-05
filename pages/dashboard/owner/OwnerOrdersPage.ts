import { type Page, expect } from "@playwright/test";

export const createOwnerOrdersPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToOrdersTab = async () => {
    await drawer().getByRole("button", { name: "Orders", exact: true }).click();
    await page.waitForURL(/tab=Orders/, { timeout: 10_000 });
    // Wait for the Order Dashboard heading — more stable than the search placeholder,
    // which differs between local source and the QA deployment.
    await page
      .getByRole("heading", { name: "Order Dashboard" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  // Use a regex so this matches both "Search orders, customers, phone..." (source)
  // and "Search by order #, receipt #, name," (QA deployment) without hardcoding either.
  const searchInput = () => page.getByPlaceholder(/^Search/i).first();

  const filtersButton = () => page.getByRole("button", { name: "Filters" });

  // The orders grid is a MUI DataGrid — an unmatched search renders its
  // built-in "No rows" overlay, not a custom empty-state message.
  const emptyStateMessage = () => page.getByText("No rows");

  const assertOrdersTabLoaded = () =>
    expect(page.getByRole("heading", { name: "Order Dashboard" })).toBeVisible({
      timeout: 15_000,
    });

  const assertTableColumnVisible = (columnName: string) =>
    expect(page.getByRole("columnheader", { name: columnName })).toBeVisible({
      timeout: 10_000,
    });

  const searchOrders = async (query: string) => {
    await searchInput().fill(query);
    await searchInput().press("Enter");
  };

  // ── Filters panel ────────────────────────────────────────────────────────
  const openFilters = () => filtersButton().click();

  const assertFilterPanelVisible = () =>
    expect(page.getByRole("heading", { name: "Filter Orders" })).toBeVisible({
      timeout: 10_000,
    });

  // ── Order detail dialog ──────────────────────────────────────────────────
  // Clicking a data row (not the header) opens a detail dialog and appends
  // ?detailOrderId=<id>. Grid rows render as MUI DataGrid rows; grab the
  // first one under the column-header row.
  const firstOrderRow = () =>
    page.locator('.MuiDataGrid-row[role="row"]').first();

  const openFirstOrderDetail = async () => {
    await firstOrderRow().click();
    await page
      .getByRole("dialog")
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  const assertOrderDetailVisible = () =>
    expect(page.getByRole("dialog").getByText("Order Information")).toBeVisible(
      {
        timeout: 10_000,
      }
    );

  const closeOrderDetail = async () => {
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog")
      .waitFor({ state: "hidden", timeout: 10_000 });
  };

  return {
    navigateToOrdersTab,
    searchInput,
    filtersButton,
    emptyStateMessage,
    assertOrdersTabLoaded,
    assertTableColumnVisible,
    searchOrders,
    openFilters,
    assertFilterPanelVisible,
    firstOrderRow,
    openFirstOrderDetail,
    assertOrderDetailVisible,
    closeOrderDetail,
  };
};
