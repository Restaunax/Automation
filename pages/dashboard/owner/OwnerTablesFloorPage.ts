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
 * Floor canvas: react-konva renders to plain <canvas> elements with no per-
 * shape DOM nodes, and since the editor rework (RestauNax 85fbccfc6) the
 * canvas zooms and pans, so screen coordinates are not stable. Tables are
 * placed and selected through the editor's own "All tables" browser instead
 * (FloorTablesBrowser.tsx): clicking a row places an unplaced table of the
 * open section, or selects and scrolls to one already on the floor.
 */

export const createOwnerTablesFloorPage = (page: Page) => {
  const mgmtPage = createOwnerRestaurantManagementPage(page);
  const main = () => page.locator("#root");

  /** The tab has two views behind a toggle (RestauNax 85fbccfc6): "floor"
   * (the editor — section tabs, Unplaced tray, details panel) and "manage"
   * (Sections & tables — Add Section / Add Table, the table rows and their
   * menus). The last choice is remembered in localStorage, so every test
   * picks its view explicitly rather than trusting the default. */
  const viewToggle = (view: "floor" | "manage") =>
    page.getByRole("group", { name: "Tables view" }).getByRole("button", {
      name: view === "floor" ? "Floor plan" : "Sections & tables",
      exact: true,
    });

  const showView = async (view: "floor" | "manage") => {
    const button = viewToggle(view);
    await button.waitFor({ state: "visible", timeout: 15_000 });
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  };

  const gotoTab = async (
    restaurantId: string,
    view: "floor" | "manage" = "manage"
  ) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=tables`,
      { waitUntil: "domcontentloaded" }
    );
    await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
    await showView(view);
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

  /** Hovers + clicks the Store Operations flyout header — the sidebar's
   * desktop flyouts open on hover. */
  const openStoreOpsFlyout = async () => {
    await storeOpsHeader().hover();
    await storeOpsHeader().click();
  };

  /**
   * Opens the Store Operations flyout and clicks `item`, retrying the WHOLE
   * open-then-click until the URL matches. The flyout is hover-driven (opens
   * on mouseenter, closes 80 ms after mouseleave, animates in with Grow), and
   * right after a page load the sidebar can still be settling — a single
   * attempt intermittently timed out with "element is not stable" (TC-434,
   * 2026-10-13 QA run). Each attempt is short so a stuck one is abandoned
   * and the menu reopened, rather than waiting out one long click.
   */
  const clickStoreOpsItem = async (item: Locator, url: RegExp) => {
    await expect(async () => {
      await openStoreOpsFlyout();
      await item.click({ timeout: 3_000 });
      await page.waitForURL(url, { timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  };

  const navigateViaSidebar = async (restaurantId: string) => {
    await mgmtPage.goto(restaurantId);
    await clickStoreOpsItem(tablesFloorNavItem(), /tab=tables/);
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
  // The editor's own save bar ("1 unsaved change · Discard changes · Save
  // layout"), not the shared unsaved-changes bar it used before 85fbccfc6.
  const saveLayoutButton = () =>
    page.getByRole("button", { name: "Save layout", exact: true });

  const floorTableNameInput = () => page.locator("#floor-table-name");
  const floorTableCapacityInput = () => page.locator("#floor-table-capacity");
  const floorTableBookableSwitch = () => page.locator("#floor-table-bookable");
  const floorDetailsSaveButton = () => page.getByTestId("floor-details-save");
  const floorSelectionEmpty = () =>
    page.getByText("Select a table on the floor to edit its details.");

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

  // ── "All tables" browser (floor Add panel → popper) ───────────────────────
  const tablesBrowserButton = () => page.getByTestId("floor-browser-open");
  const browserRow = (name: string) =>
    page.getByTestId("floor-browser-row").filter({ hasText: name });
  /** "Not placed" / "On floor" / "Move here" — the row's status chip. */
  const browserRowStatus = (name: string) =>
    browserRow(name).locator(".MuiChip-label");

  const openTablesBrowser = async () => {
    if (await page.getByTestId("floor-browser-row").first().isVisible()) return;
    await tablesBrowserButton().click();
    await page
      .getByTestId("floor-browser-row")
      .first()
      .waitFor({ state: "visible", timeout: 5_000 });
  };

  /** Picks a table in the browser: an unplaced table of the open section is
   * placed on the floor (needs Save layout), one already placed is selected
   * into the details panel. The popper closes on pick. */
  const pickTableInBrowser = async (name: string) => {
    await openTablesBrowser();
    await browserRow(name).click();
    await browserRow(name).waitFor({ state: "hidden", timeout: 5_000 });
  };

  // ── Snackbars ──────────────────────────────────────────────────────────────
  const snackbar = (text: string | RegExp) =>
    page.getByRole("alert").filter({ hasText: text });

  return {
    gotoTab,
    showView,
    assertLoaded,
    storeOpsHeader,
    tablesFloorNavItem,
    reservationsNavItem,
    openStoreOpsFlyout,
    clickStoreOpsItem,
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
    saveLayoutButton,
    floorTableNameInput,
    floorTableCapacityInput,
    floorTableBookableSwitch,
    floorDetailsSaveButton,
    floorSelectionEmpty,
    tablesBrowserButton,
    browserRow,
    browserRowStatus,
    openTablesBrowser,
    pickTableInBrowser,
    presetTile,
    undoButton,
    redoButton,
    discardLayoutButton,
    shortcutsButton,
    shortcutsDialog,
    floorEmptyState,
    floorEmptyPrimaryButton,
    snackbar,
  };
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type OwnerTablesFloorPage = ReturnType<
  typeof createOwnerTablesFloorPage
>;
