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

  // ── Toolbar (Orders.tsx <Paper data-tour="orders-toolbar">) ────────────
  // Everything the owner uses to narrow the grid lives in this Paper. Scoping
  // to it keeps us clear of the DataGrid's own toolbar (which has its own
  // "Export"/"Filters" buttons) and the header's date-range controls.
  const toolbar = () => page.locator('[data-tour="orders-toolbar"]');

  // Search mode: once a term is set, the date range is ignored server-side and
  // an info Alert says so, with a "Clear Search" action. The X adornment on the
  // input (aria-label "Clear search") does the same thing. exact:true matters —
  // role-name matching is a case-insensitive substring by default.
  const searchModeBanner = () =>
    toolbar()
      .getByRole("alert")
      .filter({ hasText: /Searching all orders/ });
  const clearSearchButton = () =>
    toolbar().getByRole("button", { name: "Clear Search", exact: true });
  const clearSearchIcon = () =>
    toolbar().getByRole("button", { name: "Clear search", exact: true });

  // Filters button carries a count Chip ("1"/"2") when status/type are non-default.
  const filterCountChip = () => filtersButton().locator(".MuiChip-label");

  // Second combobox in the filter panel = Order Type (options "All Types",
  // "Delivery", "Pickup", "Shipping").
  const typeFilter = () => filterPanel().getByRole("combobox").nth(1);
  const selectTypeFilter = async (label: string) => {
    await typeFilter().click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };

  // Sort Select — the only combobox directly inside the toolbar Paper (the
  // filter panel is a portal). Options: "Newest First" | "Oldest First" |
  // "Highest Amount" | "Lowest Amount" ↔ createdAt|total : desc|asc.
  const sortSelect = () => toolbar().getByRole("combobox");
  const selectSort = async (label: string) => {
    await sortSelect().click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };

  // Refresh IconButton has NO aria-label and MUI strips icon data-testids in
  // production builds, so it is "the unlabeled icon button in the toolbar" —
  // the clear-X has aria-label "Clear search" and Export has "Export Orders".
  // (Frontend nice-to-have: give it an aria-label; then switch this locator.)
  const refreshButton = () =>
    toolbar().locator("button.MuiIconButton-root:not([aria-label])").first();

  // Export — icon button (Tooltip title → aria-label "Export Orders") opening a
  // Menu of scopes: "Current View" | "Last 30 Days" | "Last 90 Days" | "All Orders".
  const exportOrdersButton = () =>
    toolbar().getByRole("button", { name: "Export Orders", exact: true });
  const openExportMenu = () => exportOrdersButton().click();
  const exportMenuItem = (label: string) =>
    page.getByRole("menuitem").filter({ hasText: label });
  const exportCurrentView = async () => {
    await openExportMenu();
    await exportMenuItem("Current View").click();
  };

  // ── Grid pagination (server mode, MUI TablePagination in the footer) ─────
  const pageSizeSelect = () =>
    page.getByRole("combobox", { name: /Rows per page/i });
  const selectPageSize = async (n: number) => {
    await pageSizeSelect().click();
    await page.getByRole("option", { name: String(n), exact: true }).click();
  };
  const nextPageButton = () =>
    page.getByRole("button", { name: "Go to next page" });

  // A grid row is identified by its receipt number cell ("#<receiptNumber>").
  const rowByReceipt = (receiptNumber: string) =>
    page
      .locator('.MuiDataGrid-row[role="row"]')
      .filter({ hasText: `#${receiptNumber}` });

  // ── Header (OrderStatistics.tsx): date range + stat cards ────────────────
  // StatCard title is a Typography h6 rendered as <div> (not a heading role).
  const statCard = (title: string) =>
    page.locator(".MuiCard-root").filter({
      has: page.locator(".MuiTypography-h6", { hasText: title }),
    });
  const statCardValue = (title: string) =>
    statCard(title).locator(".MuiTypography-h4");

  // The date-range trigger's text is the matched preset name ("Last 7 days" by
  // default) or a literal range — locate it by its calendar icon + position:
  // it's the button that opens the "Select Date Range" popover.
  const dateRangeButton = () =>
    page
      .getByRole("button")
      .filter({ hasText: /Last \d+ days|Today|Yesterday|month|year|\d{4}/ })
      .first();
  const dateRangePopover = () =>
    page.locator(".MuiPopover-paper").filter({ hasText: "Select Date Range" });
  const openDateRange = async () => {
    await dateRangeButton().click();
    await dateRangePopover().waitFor({ state: "visible", timeout: 10_000 });
  };
  const datePreset = (label: string) =>
    dateRangePopover().getByRole("button", { name: label, exact: true });
  // MUI X v8 date fields use the accessible sectioned DOM: a role=group of
  // Month/Day/Year spinbuttons (the #date-range-* <input> is a hidden mirror
  // and can't be clicked). Typing digits into the Month section auto-advances
  // through the sections, so "01012020" → 01/01/2020. Groups in the popover:
  // [0] Start Date, [1] End Date, [2] the preset ToggleButtonGroup.
  const dateField = (which: "start" | "end") =>
    dateRangePopover()
      .getByRole("group")
      .nth(which === "start" ? 0 : 1);
  const typeDate = async (which: "start" | "end", mmddyyyy: string) => {
    await dateField(which).getByRole("spinbutton", { name: "Month" }).click();
    await page.keyboard.type(mmddyyyy);
  };
  const applyDateRange = async () => {
    await dateRangePopover().getByRole("button", { name: "Apply" }).click();
    await dateRangePopover().waitFor({ state: "hidden", timeout: 10_000 });
  };
  const updateStatsButton = () =>
    page.getByRole("button", { name: "Update Stats" });
  const emptyRangeTitle = () =>
    page.getByText("No orders in this date range", { exact: true });
  const changeDateRangeCta = () =>
    page.getByRole("button", { name: "Change date range" });

  // ── Detail sheet (OrderDetailsDialog.tsx — a SideSheet Drawer whose
  // aria-label/title is "Receipt #<n>"; the nested Cancel dialog is a
  // separate role=dialog and is excluded by the heading filter) ─────────────
  const detailSheet = () =>
    page
      .getByRole("dialog")
      .filter({
        has: page.getByRole("banner").filter({ hasText: /^Receipt #/ }),
      });
  // The header <header> (role banner) holds "Receipt #<n>", the created date
  // and the Order-#/status chips — assert with toContainText.
  const sheetTitle = () => detailSheet().getByRole("banner");
  // The title Typography (h6 class) holds exactly "Receipt #<n>" — use this to
  // READ the receipt; the banner as a whole also contains the date + chips.
  const sheetReceiptNumber = async () => {
    const text =
      (await sheetTitle().locator(".MuiTypography-h6").first().textContent()) ??
      "";
    return text.replace(/^Receipt #/, "").trim();
  };
  // Header status Chip: the MuiChip inside the sheet header whose label is a
  // status word (Pending/Confirmed/…/Cancelled). Order-# chip is "Order #n".
  const statusChip = () =>
    detailSheet()
      .locator(".MuiChip-root")
      .filter({
        hasText:
          /^(Pending|Confirmed|Preparing|Ready|Out for Delivery|Delivered|Picked Up|Cancelled|Refunded|Initialized|Shipped)$/,
      })
      .first();

  const tab = (name: string) =>
    detailSheet().getByRole("tab", { name, exact: true });
  const openTab = async (name: string) => {
    await tab(name).click();
    await expect(tab(name)).toHaveAttribute("aria-selected", "true");
  };

  // Money rows in "Order Total": <Box><p>Label:</p><p>$x.xx</p></Box>.
  const moneyRow = (label: string) =>
    detailSheet()
      .getByText(label, { exact: true })
      .locator("xpath=following-sibling::p[1]");
  // "Order Information" rows follow the same label/value sibling shape, but the
  // value may be a Chip (Order Type, Payment Status) rather than a <p>.
  const orderInfoValue = (label: string) =>
    detailSheet()
      .getByText(label, { exact: true })
      .locator("xpath=following-sibling::*[1]");
  const itemsHeading = () =>
    detailSheet().getByRole("heading", { name: /^Order Items \(\d+\)$/ });
  const itemRow = (itemName: string) =>
    detailSheet().locator("tbody tr").filter({ hasText: itemName }).first();
  const specialInstructionsValue = () =>
    orderInfoValue("Special Instructions:");

  // Customer Info tab: value <p> precedes its caption ("Customer Name" /
  // "Phone Number" / "Email Address").
  const customerInfoValue = (caption: string) =>
    detailSheet()
      .getByText(caption, { exact: true })
      .locator("xpath=preceding-sibling::p[1]");
  // Delivery Info tab: two <p> lines precede the "Delivery Address" caption.
  const deliveryAddressLines = () =>
    detailSheet()
      .getByText("Delivery Address", { exact: true })
      .locator("xpath=preceding-sibling::p");
  const deliveryNotesValue = () =>
    detailSheet()
      .getByText("Delivery Notes:", { exact: true })
      .locator("xpath=following-sibling::p[1]");
  const selfDeliveredNote = () =>
    detailSheet().getByText("Delivered by the restaurant", { exact: true });

  // Progress stepper (hidden for CANCELLED/REFUNDED).
  const orderProgressHeading = () =>
    detailSheet().getByRole("heading", { name: "Order Progress" });
  // MUI puts the state classes on the StepLabel's <span class="MuiStepLabel-label">.
  const completedSteps = () =>
    detailSheet().locator(".MuiStepLabel-label.Mui-completed");
  const activeStepLabel = () =>
    detailSheet().locator(".MuiStepLabel-label.Mui-active");

  // ── Cancel dialog extras ─────────────────────────────────────────────────
  const keepOrderButton = () =>
    cancelRefundDialog().getByRole("button", { name: "Keep Order" });
  // Unpaid orders: the confirm button reads "Cancel Order" (same text as the
  // sheet's trigger button) — MUST stay scoped to the nested dialog.
  const confirmCancelUnpaidButton = () =>
    cancelRefundDialog().getByRole("button", {
      name: "Cancel Order",
      exact: true,
    });
  const refundInfoAlert = () =>
    cancelRefundDialog().getByText(/will be refunded/i);
  const cancelSuccessAlert = () =>
    page.getByText("Order cancelled successfully", { exact: true });

  // ── Network helpers (assert on the request/response, not on virtualised
  // DataGrid cells) ────────────────────────────────────────────────────────
  interface OrderRow {
    id: string;
    status: string;
    paymentStatus?: string;
    orderType?: string;
    total?: number | string;
    receiptNumber?: string;
    orderNumber?: number | null;
    phone?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    customer?: {
      phone?: string | null;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  }
  interface ManagementResponse {
    url: URL;
    query: URLSearchParams;
    json: {
      orders: OrderRow[];
      totalCount: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }
  const waitForManagementResponse = async (
    trigger: () => Promise<unknown>,
    predicate: (query: URLSearchParams) => boolean = () => true
  ): Promise<ManagementResponse> => {
    const [response] = await Promise.all([
      page.waitForResponse((r) => {
        if (
          !/\/api\/order\/statistics\/management\//.test(r.url()) ||
          r.request().method() !== "GET"
        )
          return false;
        return predicate(new URL(r.url()).searchParams);
      }),
      trigger(),
    ]);
    if (!response.ok()) {
      throw new Error(
        `management GET ${response.url()} → ${response.status()}: ${(await response.text()).slice(0, 300)}`
      );
    }
    const url = new URL(response.url());
    return { url, query: url.searchParams, json: await response.json() };
  };

  const waitForStatusPut = async (trigger: () => Promise<unknown>) => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/order\/orderId\/.+\/status/.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      trigger(),
    ]);
    expect(response.ok()).toBe(true);
    return response.json() as Promise<Record<string, unknown>>;
  };

  const waitForCancelPut = async (trigger: () => Promise<unknown>) => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/order\/statistics\/cancel\//.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      trigger(),
    ]);
    expect(response.ok()).toBe(true);
    return response.json() as Promise<Record<string, unknown>>;
  };

  const waitForStatsResponse = async (trigger: () => Promise<unknown>) => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/order\/statistics\/restaurantId\//.test(r.url()) &&
          r.request().method() === "GET"
      ),
      trigger(),
    ]);
    expect(response.ok()).toBe(true);
    const url = new URL(response.url());
    return {
      query: url.searchParams,
      json: (await response.json()) as Record<string, unknown>,
    };
  };

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
    toolbar,
    searchModeBanner,
    clearSearchButton,
    clearSearchIcon,
    filterCountChip,
    typeFilter,
    selectTypeFilter,
    sortSelect,
    selectSort,
    refreshButton,
    exportOrdersButton,
    openExportMenu,
    exportMenuItem,
    exportCurrentView,
    pageSizeSelect,
    selectPageSize,
    nextPageButton,
    rowByReceipt,
    statCard,
    statCardValue,
    dateRangeButton,
    dateRangePopover,
    openDateRange,
    datePreset,
    dateField,
    typeDate,
    applyDateRange,
    updateStatsButton,
    emptyRangeTitle,
    changeDateRangeCta,
    detailSheet,
    sheetTitle,
    sheetReceiptNumber,
    statusChip,
    tab,
    openTab,
    moneyRow,
    orderInfoValue,
    itemsHeading,
    itemRow,
    specialInstructionsValue,
    customerInfoValue,
    deliveryAddressLines,
    deliveryNotesValue,
    selfDeliveredNote,
    orderProgressHeading,
    completedSteps,
    activeStepLabel,
    keepOrderButton,
    confirmCancelUnpaidButton,
    refundInfoAlert,
    cancelSuccessAlert,
    waitForManagementResponse,
    waitForStatusPut,
    waitForCancelPut,
    waitForStatsResponse,
  };
};
