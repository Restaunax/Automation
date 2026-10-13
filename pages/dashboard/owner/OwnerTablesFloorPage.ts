import { type Page, type Locator, expect } from "@playwright/test";
import { createOwnerRestaurantManagementPage } from "./OwnerRestaurantManagementPage";

/**
 * Owner → Restaurant Management → Store Operations → "Tables & Floor".
 *
 * The tab lives inside the Store Operations sidebar flyout (SidebarFlyoutSection,
 * same hover-then-click desktop pattern as the Deals/Coupons flyouts) alongside
 * Devices/Registers/etc. Content is a StandaloneTabPage wrapping TablesFloorTab
 * (SectionsPanel, TablesListPanel, CombinationsPanel, FloorEditor). Selectors
 * verified against the live QA portal component source
 * (restaunax-frontend/src/components/RestaurantManagement/tabs/tables/*.tsx)
 * — the components ship data-testids on every form's Save button and on the
 * tables list row/kebab-menu-button; sections/service-period-style rows do
 * NOT (bare "Edit"/"Delete" aria-labelled IconButtons), so those are scoped
 * per-row via role=row.
 *
 * Floor editor (reworked 2026-10-07): react-konva renders to plain <canvas>
 * elements with no per-shape DOM nodes, and the editor now places a table at
 * the nearest FREE spot to the visible centre (not a fixed cascade), with
 * zoom/pan state of its own. So placement and selection both go through the
 * DOM "All tables" browser (`floor-browser-open` → `floor-browser-row`):
 * clicking an unplaced row places it on the current section's floor, clicking
 * a placed row selects it and opens the inspector. Tests read the resulting
 * geometry back from the API rather than predicting pixels.
 */

export const createOwnerTablesFloorPage = (page: Page) => {
  const mgmtPage = createOwnerRestaurantManagementPage(page);
  const main = () => page.locator("#root");

  const gotoTab = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=tables`,
      { waitUntil: "domcontentloaded" }
    );
    await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  };

  const assertLoaded = () =>
    expect(
      page.getByRole("heading", { name: "Tables & Floor", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

  // ── Sidebar navigation (Store Operations flyout) ──────────────────────────
  const storeOpsHeader = () =>
    mgmtPage
      .drawer()
      .getByRole("button", { name: "Store Operations", exact: true });
  const tablesFloorNavItem = () =>
    page.getByRole("button", { name: "Tables & Floor", exact: true });
  const reservationsNavItem = () =>
    page.getByRole("button", { name: "Reservations", exact: true });

  /** Hovers + clicks the Store Operations flyout header — desktop hover
   * flyout, mirrors OwnerDealsPage.navigateToManageDeals's Deals flyout. */
  const openStoreOpsFlyout = async () => {
    await storeOpsHeader().hover();
    await storeOpsHeader().click();
  };

  const navigateViaSidebar = async (restaurantId: string) => {
    await mgmtPage.goto(restaurantId);
    await openStoreOpsFlyout();
    await tablesFloorNavItem().waitFor({ state: "visible", timeout: 5_000 });
    await tablesFloorNavItem().click();
    await page.waitForURL(/tab=tables/, { timeout: 10_000 });
    await assertLoaded();
  };

  // ── Sections panel ─────────────────────────────────────────────────────────
  const addSectionButton = () =>
    main().getByRole("button", { name: "Add Section", exact: true });
  // data-testid on a MUI TextField lands on the outer FormControl root, not
  // the native <input> — fill()/press() need the actual input descendant.
  const sectionNameInput = () =>
    page.getByTestId("section-form-name").locator("input");
  const sectionSaveButton = () => page.getByTestId("section-form-save");
  const sectionRow = (name: string): Locator =>
    page
      .getByRole("row")
      .filter({ has: page.getByText(name, { exact: true }) });

  const openCreateSection = async () => {
    await addSectionButton().click();
    await sectionNameInput().waitFor({ state: "visible", timeout: 5_000 });
  };

  /** Fills the name and saves — returns the POST response for status assertion. */
  const createSection = async (name: string) => {
    await openCreateSection();
    await sectionNameInput().fill(name);
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/table-sections$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      sectionSaveButton().click(),
    ]);
    return res;
  };

  // ── Tables list panel ──────────────────────────────────────────────────────
  const addTableButton = () =>
    main().getByRole("button", { name: "Add Table", exact: true });
  const tableNameInput = () =>
    page.getByTestId("table-form-name").locator("input");
  const tableSectionSelect = () => page.locator("#table-section-select");
  const tableCapacityInput = () => page.locator("#table-capacity");
  const tableMinCapacityInput = () => page.locator("#table-min-capacity");
  const tableBookableSwitch = () => page.locator("#table-bookable");
  const tableSaveButton = () => page.getByTestId("table-form-save");

  const openCreateTable = async () => {
    await addTableButton().click();
    await tableNameInput().waitFor({ state: "visible", timeout: 5_000 });
  };

  const selectMuiOption = async (
    selectLocator: Locator,
    optionName: string
  ) => {
    await selectLocator.click();
    await page.getByRole("option", { name: optionName, exact: true }).click();
  };

  /** Creates a table through the sheet form, optionally assigning a section.
   * Returns the POST response. */
  const createTable = async (name: string, opts?: { sectionName?: string }) => {
    await openCreateTable();
    await tableNameInput().fill(name);
    if (opts?.sectionName) {
      await selectMuiOption(tableSectionSelect(), opts.sectionName);
    }
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) => /\/tables$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      tableSaveButton().click(),
    ]);
    return res;
  };

  const tableRow = (name: string): Locator =>
    page.getByTestId("table-row").filter({ hasText: name });
  const tableRowMenuButton = (name: string) =>
    tableRow(name).getByTestId("table-row-menu");
  const tableRowStatusChip = (name: string) =>
    tableRow(name).locator(".MuiChip-label");

  const openTableRowMenu = async (name: string) => {
    await tableRowMenuButton(name).click();
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5_000 });
  };
  // MUI Menu portals to <body> — only one is ever open at a time, so these
  // are found globally rather than scoped under the row.
  const editMenuItem = () =>
    page.getByRole("menuitem", { name: "Edit", exact: true });
  const mergeMenuItem = () =>
    page.getByRole("menuitem", { name: "Merge into…" });
  const deactivateMenuItem = () =>
    page.getByRole("menuitem", { name: "Deactivate", exact: true });
  const deleteTableMenuItem = () =>
    page.getByRole("menuitem", { name: "Delete", exact: true });

  // ── Merge dialog (MergeTableDialog — ActionDialog/MUI Dialog, role=dialog) ─
  const mergeDialog = (sourceName: string) =>
    page.getByRole("dialog", {
      name: new RegExp(`Merge "${escapeRegExp(sourceName)}"`),
    });
  const mergeTargetSelect = () => page.getByTestId("merge-target-select");
  const mergeConfirmButton = () => page.getByTestId("merge-confirm");

  const mergeTableInto = async (sourceName: string, targetName: string) => {
    await openTableRowMenu(sourceName);
    await mergeMenuItem().click();
    await mergeDialog(sourceName).waitFor({ state: "visible", timeout: 5_000 });
    await selectMuiOption(mergeTargetSelect(), targetName);
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) => /\/merge$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      mergeConfirmButton().click(),
    ]);
    return res;
  };

  // ── Shared ConfirmProvider dialog (deactivate/reactivate/delete) ──────────
  const confirmDialog = (title: string) =>
    page.getByRole("dialog", { name: title });
  const confirmDialogButton = (title: string, buttonName: string) =>
    confirmDialog(title).getByRole("button", { name: buttonName, exact: true });

  /** Opens the row menu, clicks the given menu item, confirms the dialog, and
   * waits for the underlying network call so callers assert on the response. */
  const performRowAction = async (
    tableName: string,
    menuItem: () => Locator,
    dialogTitle: string,
    confirmButtonName: string,
    method: "PATCH" | "DELETE"
  ) => {
    await openTableRowMenu(tableName);
    await menuItem().click();
    await confirmDialog(dialogTitle).waitFor({
      state: "visible",
      timeout: 5_000,
    });
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/tables\/[^/]+$/.test(r.url()) && r.request().method() === method,
        { timeout: 15_000 }
      ),
      confirmDialogButton(dialogTitle, confirmButtonName).click(),
    ]);
    return res;
  };

  const deactivateTableViaMenu = (tableName: string) =>
    performRowAction(
      tableName,
      deactivateMenuItem,
      "Deactivate this table?",
      "Deactivate",
      "PATCH"
    );
  const deleteTableViaMenu = (tableName: string) =>
    performRowAction(
      tableName,
      deleteTableMenuItem,
      "Delete this table?",
      "Delete",
      "DELETE"
    );

  // ── Floor editor ───────────────────────────────────────────────────────────
  const floorCanvas = () => page.locator("canvas").first();
  const sectionTab = (sectionName: string) =>
    page.getByRole("tab", { name: sectionName, exact: true });
  const tablesBrowserButton = () => page.getByTestId("floor-browser-open");
  const tablesBrowserRow = (name: string) =>
    page.getByTestId("floor-browser-row").filter({ hasText: name });
  // FloorSaveControl — shown only while the layout has unsaved changes.
  const saveLayoutButton = () =>
    page.getByRole("button", { name: "Save layout", exact: true });

  const floorTableNameInput = () => page.locator("#floor-table-name");
  const floorTableCapacityInput = () => page.locator("#floor-table-capacity");
  const floorTableBookableSwitch = () => page.locator("#floor-table-bookable");
  const floorDetailsSaveButton = () => page.getByTestId("floor-details-save");

  // Add panel presets: floor-preset-<id> (square2, round2, rect4, round4,
  // rect6, round6, rect8, round8 — floorPresets.ts). A click creates the
  // table on the server and places it locally (unsaved).
  const presetTile = (presetId: string) =>
    page.getByTestId(`floor-preset-${presetId}`);
  // Toolbar — the labels carry the platform's key combo ("Undo (Ctrl+Z)").
  const undoButton = () => page.getByRole("button", { name: /^Undo\b/ });
  const redoButton = () => page.getByRole("button", { name: /^Redo\b/ });
  const discardLayoutButton = () =>
    page.getByRole("button", { name: "Discard changes", exact: true });
  const shortcutsButton = () =>
    page.getByRole("button", { name: "Keyboard shortcuts", exact: true });
  const shortcutsDialog = () =>
    page.getByRole("dialog").filter({ hasText: "Floor editor shortcuts" });
  // Canvas empty state for a section with no placed tables.
  const floorEmptyState = () => page.getByTestId("floor-empty-state");
  const floorEmptyPrimaryButton = () => page.getByTestId("floor-empty-primary");

  /** Opens the "All tables" browser (if it isn't already) and returns the
   * row for `name`. The popper closes itself after every pick. */
  const openTablesBrowserRow = async (name: string) => {
    const row = tablesBrowserRow(name);
    if (!(await row.isVisible())) await tablesBrowserButton().click();
    await row.waitFor({ state: "visible", timeout: 10_000 });
    return row;
  };

  /** Clicks a table in the "All tables" browser: an unplaced table of this
   * section is placed on the floor (free spot near the view centre) and
   * selected; a placed one is selected. Either way the inspector opens. */
  const pickTableInBrowser = async (name: string) => {
    await (await openTablesBrowserRow(name)).click();
    await expect(floorTableNameInput()).toHaveValue(name, { timeout: 10_000 });
  };

  // ── Snackbars ──────────────────────────────────────────────────────────────
  const snackbar = (text: string | RegExp) =>
    page.getByRole("alert").filter({ hasText: text });

  return {
    gotoTab,
    assertLoaded,
    storeOpsHeader,
    tablesFloorNavItem,
    reservationsNavItem,
    openStoreOpsFlyout,
    navigateViaSidebar,
    addSectionButton,
    sectionNameInput,
    sectionSaveButton,
    sectionRow,
    openCreateSection,
    createSection,
    addTableButton,
    tableNameInput,
    tableSectionSelect,
    tableCapacityInput,
    tableMinCapacityInput,
    tableBookableSwitch,
    tableSaveButton,
    openCreateTable,
    createTable,
    selectMuiOption,
    tableRow,
    tableRowMenuButton,
    tableRowStatusChip,
    openTableRowMenu,
    editMenuItem,
    mergeMenuItem,
    deactivateMenuItem,
    deleteTableMenuItem,
    mergeDialog,
    mergeTargetSelect,
    mergeConfirmButton,
    mergeTableInto,
    confirmDialog,
    confirmDialogButton,
    deactivateTableViaMenu,
    deleteTableViaMenu,
    floorCanvas,
    sectionTab,
    tablesBrowserButton,
    tablesBrowserRow,
    presetTile,
    undoButton,
    redoButton,
    discardLayoutButton,
    shortcutsButton,
    shortcutsDialog,
    floorEmptyState,
    floorEmptyPrimaryButton,
    openTablesBrowserRow,
    pickTableInBrowser,
    saveLayoutButton,
    floorTableNameInput,
    floorTableCapacityInput,
    floorTableBookableSwitch,
    floorDetailsSaveButton,
    snackbar,
  };
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type OwnerTablesFloorPage = ReturnType<
  typeof createOwnerTablesFloorPage
>;
