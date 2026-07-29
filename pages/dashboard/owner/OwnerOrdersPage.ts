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

  // The DataGrid virtualizes columns horizontally, so far-right headers
  // (Payment, Subtotal) aren't in the DOM at the default viewport. Use this to
  // assert the grid rendered a real column set without depending on which
  // columns happen to be scrolled into view.
  const columnHeaders = () => page.getByRole("columnheader");

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

  // The filter panel is a MUI Menu (Popover). Scope controls to the paper that
  // holds the "Filter Orders" heading so we don't collide with the page's other
  // Select comboboxes (sort, page size).
  const filterPanel = () =>
    page
      .locator(".MuiPaper-root")
      .filter({ has: page.getByRole("heading", { name: "Filter Orders" }) });

  // Inside the panel the first combobox is Order Status, the second Order Type.
  const statusFilter = () => filterPanel().getByRole("combobox").first();

  // Open the Order Status dropdown and choose an option by its visible label
  // (status options render a Chip whose text is the accessible name, e.g.
  // "Pending"; "All Statuses" is plain text).
  const selectStatusFilter = async (label: string) => {
    await statusFilter().click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };

  const assertStatusFilterValue = (label: string) =>
    expect(statusFilter()).toHaveText(label, { timeout: 10_000 });

  const applyFilters = async () => {
    await filterPanel().getByRole("button", { name: "Apply Filters" }).click();
    // The Menu closes on apply; wait for it to detach so the grid re-query runs.
    await filterPanel().waitFor({ state: "hidden", timeout: 10_000 });
  };

  // Reset clears the filter state AND closes the panel (handleResetFilters →
  // handleFilterMenuClose). Callers that want to verify the reset value must
  // reopen the panel afterwards.
  const resetFilters = async () => {
    await filterPanel().getByRole("button", { name: "Reset" }).click();
    await filterPanel().waitFor({ state: "hidden", timeout: 10_000 });
  };

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const exportButton = () => page.getByRole("button", { name: /Export/i });

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

  // Deeper than assertOrderDetailVisible: confirm the dialog actually renders
  // the line-items section and the money summary, not just the header block.
  const assertOrderDetailHasItemsAndTotal = async () => {
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Order Details")).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog.getByText("Order Total")).toBeVisible({
      timeout: 10_000,
    });
  };

  const closeOrderDetail = async () => {
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog")
      .waitFor({ state: "hidden", timeout: 10_000 });
  };

  // Orders.tsx syncs the open detail sheet to ?detailOrderId=<id> — deep-link
  // straight to a known order instead of relying on grid row order or search.
  const gotoOrderDetail = async (restaurantId: string, orderId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Orders&detailOrderId=${orderId}`,
      { waitUntil: "domcontentloaded" }
    );
    await page
      .getByRole("dialog")
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  // ── Status change — a single forward-only "Mark as {next status}" button
  // in the detail sheet's footer (OrderDetailsDialog.tsx's getNextStatus()),
  // not a dropdown. Disappears once the order reaches a terminal state
  // (CANCELLED/REFUNDED).
  const markAsNextButton = () =>
    page.getByRole("dialog").getByRole("button", { name: /^Mark as / });

  const clickMarkAsNext = () => markAsNextButton().click();

  // ── Cancel / refund — "Cancel Order" opens a NESTED MUI Dialog on top of
  // the detail sheet (also role="dialog"), so once it's open there are two
  // dialog-role elements on the page. Scope every locator below to this one
  // via its "Cancel Order — Receipt" heading text.
  const cancelOrderButton = () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel Order", exact: true });

  const openCancelDialog = () => cancelOrderButton().click();

  const cancelRefundDialog = () =>
    page.getByRole("dialog").filter({ hasText: "Cancel Order — Receipt" });

  const assertRefundCopyVisible = () =>
    expect(cancelRefundDialog().getByText(/will be refunded/i)).toBeVisible({
      timeout: 10_000,
    });

  const cancelReasonInput = () => page.locator("#cancel-refund-reason");

  // Paid orders (paymentStatus === COMPLETED) show "Cancel & Refund"; unpaid
  // orders show "Cancel Order" — same label as the outer trigger button, so
  // this must stay scoped to cancelRefundDialog(), not the page at large.
  const confirmCancelAndRefundButton = () =>
    cancelRefundDialog().getByRole("button", { name: "Cancel & Refund" });

  const confirmCancelAndRefund = () => confirmCancelAndRefundButton().click();

  return {
    navigateToOrdersTab,
    searchInput,
    filtersButton,
    emptyStateMessage,
    assertOrdersTabLoaded,
    assertTableColumnVisible,
    columnHeaders,
    searchOrders,
    openFilters,
    assertFilterPanelVisible,
    filterPanel,
    statusFilter,
    selectStatusFilter,
    assertStatusFilterValue,
    applyFilters,
    resetFilters,
    exportButton,
    firstOrderRow,
    openFirstOrderDetail,
    assertOrderDetailVisible,
    assertOrderDetailHasItemsAndTotal,
    closeOrderDetail,
    gotoOrderDetail,
    markAsNextButton,
    clickMarkAsNext,
    cancelOrderButton,
    openCancelDialog,
    cancelRefundDialog,
    assertRefundCopyVisible,
    cancelReasonInput,
    confirmCancelAndRefundButton,
    confirmCancelAndRefund,
  };
};
