import { type Page, type Locator, expect } from "@playwright/test";
import { createOwnerRestaurantManagementPage } from "./OwnerRestaurantManagementPage";

/**
 * Status text in the row's status cell. Before restaunax #898: the
 * DealStatusBadge ("Active"/"Inactive"/"Expired"); since: the live-status chip
 * ("Live now"/"Off"/"Ended", or the server's availabilityLabel when upcoming).
 * Specs assert with these until the dashboard gate is enforced (Task 16 Step 9).
 */
export const DEAL_STATUS_TEXT = {
  active: /^(Active|Live now)$/,
  inactive: /^(Inactive|Off)$/,
  expired: /^(Expired|Ended)$/,
} as const;

/**
 * Owner → Restaurant Management → Deals.
 *
 * Four deep-linkable tabs (PortalShell `?tab=`): `deals` (Manage Deals table,
 * DealsDashboard.tsx), `create-deal` (DealForm — create AND edit),
 * `ai-deals` (AIDealsGenerator), `deal-analytics` (DealAnalytics). The sidebar
 * "Deals" entry is a hover flyout on desktop, so every driver here navigates
 * by URL; `navigateToManageDeals` keeps the click path for TC-86.
 *
 * Selectors (verified on QA 2026-08-18 — the Deals components ship ZERO
 * data-testids): rows are `role=row` named by their visible cells
 * ("<name> <desc> This location only 2 items $22.00 $28.98 24% off Mon, Wed
 * 11:00 - 14:00 Active Deactivate 0 times $0.00"); the first button in a row
 * expands it, the last opens the Edit/Delete menu; the status Switch is the
 * row's `role=switch` wrapped in a Tooltip whose title is "Deactivate" /
 * "Activate" / "This deal has ended. Change its last day to turn it back on."; #deal-search, #status-filter
 * (MUI select → role=combobox), the shared Confirm dialog
 * (`role=dialog` "Delete this deal?"), snackbars as `role=alert` text.
 * See docs/DEALS_TAB_TEST_STRATEGY.md §2 "Selectors that exist today".
 */
export const createOwnerDealsPage = (page: Page) => {
  const mgmtPage = createOwnerRestaurantManagementPage(page);
  const main = () => page.locator("#root");

  const gotoTab = async (
    restaurantId: string,
    tab: "deals" | "create-deal" | "ai-deals" | "deal-analytics"
  ) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=${tab}`,
      { waitUntil: "domcontentloaded" }
    );
    await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  };

  /** Chain shell twin: /chain/:groupId/restaurantManagement?tab=… */
  const gotoChainTab = async (
    groupId: string,
    tab: "deals" | "create-deal" | "ai-deals" | "deal-analytics"
  ) => {
    await page.goto(`/chain/${groupId}/restaurantManagement?tab=${tab}`, {
      waitUntil: "domcontentloaded",
    });
    await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  };

  /** Deep-link to the table and wait for the first fetch to settle. */
  const gotoManageDeals = async (restaurantId: string) => {
    await gotoTab(restaurantId, "deals");
    await assertManageDealsLoaded();
    await tableSettled();
  };

  const gotoChainManageDeals = async (groupId: string) => {
    await gotoChainTab(groupId, "deals");
    await assertManageDealsLoaded();
    await tableSettled();
  };

  // Deals lives behind a flyout section (like Coupons): expand "Deals",
  // then click the "Manage Deals" sub-item. Kept for TC-86 (the sidebar path).
  const navigateToManageDeals = async (restaurantId: string) => {
    await mgmtPage.goto(restaurantId);
    const dealsEntry = mgmtPage
      .drawer()
      .getByRole("button", { name: "Deals", exact: true });
    const manageDealsBtn = page.getByRole("button", {
      name: "Manage Deals",
      exact: true,
    });
    // Desktop = hover flyout (Popper + Grow), mobile = click accordion; do
    // both. The flyout is transient (SidebarFlyoutSection closes it 80ms after
    // the pointer leaves, or on click-away): on the 2026-10-01 nightly (CI, 2
    // loaded workers) it closed while Grow was still animating, so the "Manage
    // Deals" item was "not stable" then "detached from the DOM" and the click
    // had nothing left to retry against for 15s, on both attempts. Not
    // reproducible locally at any viewport height. Re-open and re-click as one
    // unit until the navigation happens.
    await expect(async () => {
      await dealsEntry.hover();
      await dealsEntry.click();
      await manageDealsBtn.click({ timeout: 3_000 });
      await page.waitForURL(/tab=deals/, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await page
      .getByRole("heading", { name: "Manage Deals" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertManageDealsLoaded = () =>
    expect(page.getByRole("heading", { name: "Manage Deals" })).toBeVisible({
      timeout: 15_000,
    });

  /** The table shows rows or the empty state — either means the fetch settled. */
  const tableSettled = () =>
    expect(
      page
        .getByRole("row")
        .filter({ has: page.getByRole("switch") })
        .first()
        .or(emptyState())
    ).toBeVisible({ timeout: 20_000 });

  // "Create Deal" also appears as a sidebar flyout item with the same
  // accessible name — scope to #root's main content to get the page action.
  const createDealButton = () =>
    main().getByRole("button", { name: "Create Deal", exact: true });
  const aiGenerateButton = () =>
    main().getByRole("button", { name: "AI Generate Deals", exact: true });
  const viewAnalyticsButton = () =>
    main().getByRole("button", { name: "View Analytics", exact: true });
  const refreshButton = () =>
    main().getByRole("button", { name: "Refresh", exact: true });

  // ── Stat cards ("Total Deals" / "Active Deals" / "Times Used" / "Total Revenue")
  const statCardValue = (label: string) =>
    page
      .locator(".MuiCard-root, .MuiPaper-root")
      .filter({ has: page.getByText(label, { exact: true }) })
      .first()
      .getByRole("heading")
      .first();

  // ── Filters ────────────────────────────────────────────────────────────────
  const searchInput = () => page.locator("#deal-search");
  const search = async (text: string) => {
    await searchInput().fill(text);
  };
  const statusFilter = () => page.locator("#status-filter");
  const selectStatusFilter = async (
    label: "All Statuses" | "Live now" | "Coming up" | "Off" | "Ended"
  ) => {
    await statusFilter().click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };
  const sortBy = (header: "Deal Name" | "Price" | "Savings" | "Usage") =>
    page
      .getByRole("columnheader")
      .getByRole("button", { name: header })
      .click();

  // ── Rows ───────────────────────────────────────────────────────────────────
  /** A deal row by its (unique, AUTO-prefixed) name; the name is the row's leading text. */
  const row = (dealName: string): Locator =>
    page.getByRole("row").filter({
      has: page.getByRole("heading", { name: dealName, exact: true }),
    });
  const dataRows = () =>
    page.getByRole("row").filter({ has: page.getByRole("switch") });
  const rowNames = async () =>
    dataRows().evaluateAll((rows) =>
      rows.map(
        (r) => r.querySelector("h6")?.textContent?.trim() ?? r.textContent ?? ""
      )
    );

  const emptyState = () => page.getByText("No deals found", { exact: true });
  const createFirstDealButton = () =>
    page.getByRole("button", { name: "Create Your First Deal" });

  const rowSwitch = (dealName: string) => row(dealName).getByRole("switch");
  const rowExpandButton = (dealName: string) =>
    row(dealName).getByRole("button").first();
  const rowMenuButton = (dealName: string) =>
    row(dealName).getByRole("button").last();
  const rowStatusText = (dealName: string) =>
    row(dealName)
      .getByTestId("deal-live-status")
      .or(
        row(dealName)
          .getByRole("cell")
          .filter({ has: page.getByRole("switch") })
          .locator(".MuiChip-label")
      )
      .first();
  /** Tooltip title of the switch wrapper (Deactivate / Activate / Cannot toggle expired deals). */
  const rowSwitchTooltip = (dealName: string) =>
    row(dealName)
      .getByRole("cell")
      .filter({ has: page.getByRole("switch") })
      .locator("[aria-label]")
      .first();
  /** Chip in the Deal Name cell — "Location" / "Chain" scope. */
  const rowScopeChip = (dealName: string) =>
    row(dealName).locator(".MuiChip-root").first();

  const openRowMenu = async (dealName: string) => {
    await rowMenuButton(dealName).click();
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5_000 });
  };
  const editMenuItem = () => page.getByRole("menuitem", { name: "Edit" });
  const deleteMenuItem = () => page.getByRole("menuitem", { name: "Delete" });

  const expandRow = async (dealName: string) => {
    await rowExpandButton(dealName).click();
    await page
      .getByRole("heading", { name: "Deal Items" })
      .first()
      .waitFor({ state: "visible", timeout: 5_000 });
  };
  /** Chips in the expanded "Deal Items" panel, e.g. "1x Chicken Wings ($14.99)". */
  const expandedItemChips = () =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("heading", { name: "Deal Items" }) })
      .locator(".MuiChip-label");

  /** Click the switch and return the PATCH /status response. */
  const toggleStatus = async (dealName: string) => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/deals\/[^/]+\/status$/.test(r.url()) &&
          r.request().method() === "PATCH",
        { timeout: 15_000 }
      ),
      rowSwitch(dealName).click(),
    ]);
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  };

  /**
   * Turn a deal ON, tolerating the transient MAX_ACTIVE_DEALS_REACHED that
   * other suite files can cause on the shared seed restaurant (they seed and
   * delete their own ACTIVE deals concurrently). Retries until a slot frees or
   * the deadline passes; returns the last PATCH status.
   */
  const activateWithRetry = async (dealName: string, timeoutMs = 90_000) => {
    const deadline = Date.now() + timeoutMs;
    let last = await toggleStatus(dealName);
    while (
      last.status === 400 &&
      last.body?.error === "MAX_ACTIVE_DEALS_REACHED" &&
      Date.now() < deadline
    ) {
      // Back-off between PATCH retries (not a UI wait — the slot frees server-side).
      await new Promise((r) => setTimeout(r, 5_000));
      last = await toggleStatus(dealName);
    }
    return last;
  };

  // ── Delete confirm (shared ConfirmProvider) ────────────────────────────────
  const confirmDialog = () =>
    page.getByRole("dialog", { name: "Delete this deal?" });
  const confirmDialogConsequences = () => confirmDialog().getByRole("listitem");
  const confirmButton = () =>
    confirmDialog().getByRole("button", { name: "Confirm", exact: true });
  const cancelButton = () =>
    confirmDialog().getByRole("button", { name: "Cancel", exact: true });

  const deleteViaMenu = async (dealName: string) => {
    await openRowMenu(dealName);
    await deleteMenuItem().click();
    await confirmDialog().waitFor({ state: "visible", timeout: 5_000 });
  };
  /** Confirm the open delete dialog and return the DELETE response status. */
  const confirmDelete = async () => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/deals\/[^/]+$/.test(r.url()) &&
          r.request().method() === "DELETE",
        { timeout: 15_000 }
      ),
      confirmButton().click(),
    ]);
    return res.status();
  };

  // ── Snackbars / banners ────────────────────────────────────────────────────
  const snackbar = (text: string | RegExp) =>
    page.getByRole("alert").filter({ hasText: text });
  const capBanner = () =>
    page
      .getByRole("alert")
      .filter({ hasText: /of 10|Maximum active deals reached/ });

  // ── Pagination ─────────────────────────────────────────────────────────────
  const rowsPerPageSelect = () =>
    page.getByRole("combobox", { name: /Rows per page/ });
  const setRowsPerPage = async (n: 5 | 10 | 25) => {
    await rowsPerPageSelect().click();
    await page.getByRole("option", { name: String(n), exact: true }).click();
  };
  const nextPageButton = () =>
    page.getByRole("button", { name: "Go to next page" });
  const previousPageButton = () =>
    page.getByRole("button", { name: "Go to previous page" });

  // ── Chain shell ────────────────────────────────────────────────────────────
  const chainRollupCaption = () => page.getByText(/across \d+ chain locations/);
  const chainManagedHeading = () =>
    page.getByRole("heading", { name: "Managed at chain level" });
  const disabledSidebarDeals = () =>
    mgmtPage
      .drawer()
      .getByRole("button", { name: "Deals", exact: true, disabled: true });

  /** DealsDashboard live-status chip (deal scheduling, Plan 2). */
  /** Every live-status chip on the page (presence = #898 dashboard deployed). */
  const liveStatusChips = () => page.getByTestId("deal-live-status");
  const rowLiveStatus = (dealName: string) =>
    row(dealName).getByTestId("deal-live-status");
  /** Chain shell caption ("Times are in each location's local time."). */
  const chainScheduleCaption = () =>
    page.getByText(/each location's local time/i).first();
  /** True once #898's live-status filter is deployed (has "Coming up"); closes the menu again. */
  const hasLiveStatusFilter = async (): Promise<boolean> => {
    await statusFilter().click();
    const present = await page
      .getByRole("option", { name: "All Statuses", exact: true })
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(
        async () =>
          (await page
            .getByRole("option", { name: "Coming up", exact: true })
            .count()) > 0
      )
      // No menu within 5 s = the filter didn't open; report "not deployed" and let the gate decide.
      .catch(() => false);
    await page.keyboard.press("Escape");
    return present;
  };

  return {
    gotoTab,
    gotoChainTab,
    gotoManageDeals,
    gotoChainManageDeals,
    navigateToManageDeals,
    assertManageDealsLoaded,
    tableSettled,
    createDealButton,
    aiGenerateButton,
    viewAnalyticsButton,
    refreshButton,
    statCardValue,
    searchInput,
    search,
    statusFilter,
    selectStatusFilter,
    rowLiveStatus,
    liveStatusChips,
    chainScheduleCaption,
    hasLiveStatusFilter,
    sortBy,
    row,
    dataRows,
    rowNames,
    emptyState,
    createFirstDealButton,
    rowSwitch,
    rowExpandButton,
    rowMenuButton,
    rowStatusText,
    rowSwitchTooltip,
    rowScopeChip,
    openRowMenu,
    editMenuItem,
    deleteMenuItem,
    expandRow,
    expandedItemChips,
    toggleStatus,
    activateWithRetry,
    confirmDialog,
    confirmDialogConsequences,
    confirmButton,
    cancelButton,
    deleteViaMenu,
    confirmDelete,
    snackbar,
    capBanner,
    rowsPerPageSelect,
    setRowsPerPage,
    nextPageButton,
    previousPageButton,
    chainRollupCaption,
    chainManagedHeading,
    disabledSidebarDeals,
  };
};

export type OwnerDealsPage = ReturnType<typeof createOwnerDealsPage>;
