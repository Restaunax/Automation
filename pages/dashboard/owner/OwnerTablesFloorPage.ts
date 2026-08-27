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
 * shape DOM nodes, so a placed table can only be selected by clicking at its
 * ACTUAL rendered screen position. `canvasPointToScreen` reimplements
 * FloorCanvas's own fit-to-screen math (computeFitScale/centerStagePosition,
 * see floorGeometry.ts) against the live canvas element's bounding box so a
 * test can click a table by its known canvas-space geometry after a fresh
 * page load (no lingering `selectedIds` state to rely on).
 */

// Mirrors restaunax-frontend's floorGeometry.ts constants — the floor canvas
// is a fixed logical 2000x1200 stage regardless of viewport.
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 1200;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3;
const FIT_PADDING = 48;

const computeFitScale = (containerWidth: number, containerHeight: number) => {
  if (containerWidth <= 0 || containerHeight <= 0) return 1;
  const scaleX = (containerWidth - FIT_PADDING * 2) / CANVAS_WIDTH;
  const scaleY = (containerHeight - FIT_PADDING * 2) / CANVAS_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  return Math.min(Math.max(scale, ZOOM_MIN), ZOOM_MAX);
};

const centerStagePosition = (
  containerWidth: number,
  containerHeight: number,
  scale: number
) => ({
  x: (containerWidth - CANVAS_WIDTH * scale) / 2,
  y: (containerHeight - CANVAS_HEIGHT * scale) / 2,
});

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
  const reactivateMenuItem = () =>
    page.getByRole("menuitem", { name: "Reactivate", exact: true });
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
  const unplacedTrayChip = (name: string) =>
    page.getByTestId("unplaced-tray-chip").filter({ hasText: name });
  const saveLayoutButton = () => page.getByTestId("unsaved-changes-save");

  const floorTableNameInput = () => page.locator("#floor-table-name");
  const floorTableCapacityInput = () => page.locator("#floor-table-capacity");
  const floorTableBookableSwitch = () => page.locator("#floor-table-bookable");
  const floorDetailsSaveButton = () => page.getByTestId("floor-details-save");
  const floorSelectionEmpty = () =>
    page.getByText("Select a table on the floor to edit its details.");

  /** Screen (viewport) coordinates for a point in the floor canvas's own
   * 2000x1200 logical coordinate space, given the canvas element's CURRENT
   * bounding box — reimplements FloorCanvas's fit-to-screen transform. */
  const canvasPointToScreen = async (cx: number, cy: number) => {
    const box = await floorCanvas().boundingBox();
    if (!box)
      throw new Error("[OwnerTablesFloorPage] floor canvas not visible");
    const scale = computeFitScale(box.width, box.height);
    const view = centerStagePosition(box.width, box.height, scale);
    return { x: box.x + view.x + cx * scale, y: box.y + view.y + cy * scale };
  };

  /**
   * Places an unplaced table from the tray onto the canvas via a real
   * mouse-driven HTML5 drag (mousedown on the chip, moved onto the canvas at
   * `targetCanvasPoint`, mouseup) — the chip is native `draggable`, so
   * Chromium's own drag-threshold detection fires `dragstart`/`dragover`/
   * `drop` from plain mouse events. Falls back to a plain click on the chip
   * (also a first-class, code-supported placement path — see UnplacedTray.tsx
   * — landing at the deterministic cascade position) if the drag doesn't
   * register within a short window. Returns which path actually ran and the
   * canvas-space point the table should now sit at (top-left corner), so the
   * caller can assert exact geometry via the API.
   */
  const placeTableFromTray = async (
    name: string,
    targetCanvasPoint: { x: number; y: number },
    tableWidthHeight: { width: number; height: number }
  ): Promise<{
    method: "drag" | "click";
    expected: { x: number; y: number };
  }> => {
    const chip = unplacedTrayChip(name);
    await chip.waitFor({ state: "visible", timeout: 10_000 });
    const chipBox = await chip.boundingBox();
    if (!chipBox)
      throw new Error(`[OwnerTablesFloorPage] tray chip "${name}" not visible`);
    const start = {
      x: chipBox.x + chipBox.width / 2,
      y: chipBox.y + chipBox.height / 2,
    };
    const target = await canvasPointToScreen(
      targetCanvasPoint.x,
      targetCanvasPoint.y
    );

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // Small intermediate move past Chromium's drag threshold before the long
    // move onto the canvas — a single big jump can be swallowed as a plain
    // click instead of a drag.
    await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 });
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await page.mouse.up();

    const dragWorked = await chip
      .waitFor({ state: "hidden", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!dragWorked) {
      // Observed consistently (headless AND headed) against live QA: CDP's
      // synthetic mouse events don't initiate Chromium's native HTML5 drag
      // negotiation (no `dragstart` fires) for a plain `draggable` element —
      // a Playwright/CDP limitation, not a portal bug. Falling back to the
      // click-to-place path, which is equally first-class per UnplacedTray.tsx.
      console.warn(
        `[placeTableFromTray] native drag did not register for "${name}" — falling back to click-to-place.`
      );
    }

    if (dragWorked) {
      return {
        method: "drag",
        expected: {
          x: targetCanvasPoint.x - tableWidthHeight.width / 2,
          y: targetCanvasPoint.y - tableWidthHeight.height / 2,
        },
      };
    }

    // Fall back to the click-to-place path — deterministic cascade position
    // (cascadePosition(0, size) === {x:80, y:80} for the first table placed
    // in an otherwise-empty section canvas).
    await chip.click();
    await chip.waitFor({ state: "hidden", timeout: 5_000 });
    return { method: "click", expected: { x: 80, y: 80 } };
  };

  /** Clicks the floor canvas at the screen position of a table's known
   * (server) top-left geometry + size, selecting it in TableEditPanel. */
  const selectPlacedTable = async (geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    const center = await canvasPointToScreen(
      geometry.x + geometry.width / 2,
      geometry.y + geometry.height / 2
    );
    await page.mouse.click(center.x, center.y);
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
    reactivateMenuItem,
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
    unplacedTrayChip,
    saveLayoutButton,
    floorTableNameInput,
    floorTableCapacityInput,
    floorTableBookableSwitch,
    floorDetailsSaveButton,
    floorSelectionEmpty,
    canvasPointToScreen,
    placeTableFromTray,
    selectPlacedTable,
    snackbar,
  };
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type OwnerTablesFloorPage = ReturnType<
  typeof createOwnerTablesFloorPage
>;
