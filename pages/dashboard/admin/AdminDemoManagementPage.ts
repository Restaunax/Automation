import { type Page, type Locator, expect } from "@playwright/test";

export const createAdminDemoManagementPage = (page: Page) => {
  const searchInput = page.locator('input[placeholder*="Search by ID"]');
  const actionMenu = page.locator('[role="menu"]');
  const listbox = page.locator('[role="listbox"]');

  const goto = async () => {
    await page.goto("/admin?tab=demo", { waitUntil: "domcontentloaded" });
    await searchInput.waitFor({ state: "visible", timeout: 15_000 });
  };

  const searchByEmail = async (email: string) => {
    await searchInput.clear();
    await searchInput.fill(email);
    // ~800ms debounce; networkidle confirms the search request settled.
    await page
      .waitForLoadState("networkidle", { timeout: 5_000 })
      .catch(() => {});
  };

  const findRowByEmail = (email: string): Locator =>
    page.locator("tbody tr").filter({ hasText: email });

  const assertRowExists = async (email: string): Promise<Locator> => {
    const row = findRowByEmail(email);
    await expect(row).toBeVisible({ timeout: 10_000 });
    return row;
  };

  const getStatusFromRow = async (row: Locator) =>
    (await row.locator('[role="combobox"] .MuiChip-label').textContent()) ?? "";

  const getCreatedAtFromRow = async (row: Locator) =>
    ((await row.locator("td").first().textContent()) ?? "").trim();

  const openActionMenu = async (email: string) => {
    await findRowByEmail(email).locator('button[aria-label="Actions"]').click();
    await actionMenu.waitFor({ state: "visible", timeout: 5_000 });
  };

  const clickMenuAction = async (label: string) =>
    actionMenu.getByText(label, { exact: true }).click();

  const changeStatusInline = async (email: string, status: string) => {
    await findRowByEmail(email).locator('[role="combobox"]').click();
    await listbox.waitFor({ state: "visible", timeout: 5_000 });
    await listbox.getByRole("option", { name: status, exact: true }).click();
    await page
      .waitForLoadState("networkidle", { timeout: 5_000 })
      .catch(() => {});
  };

  // SideSheet = right-anchored MUI Drawer; Dialog = standard MUI modal.
  const assertSideSheetOpen = (text: string) =>
    expect(
      page.locator(".MuiDrawer-paper").filter({ hasText: text })
    ).toBeVisible({ timeout: 10_000 });

  const assertDialogOpen = (text: string) =>
    expect(
      page.locator('[role="dialog"]').filter({ hasText: text })
    ).toBeVisible({ timeout: 10_000 });

  const closeSideSheet = async () => {
    await page
      .locator(".MuiDrawer-paper")
      .getByRole("button", { name: "Close" })
      .click();
    await page
      .locator(".MuiDrawer-paper")
      .waitFor({ state: "hidden", timeout: 5_000 });
  };

  const closeDialog = async () => {
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: /cancel|close/i })
      .first()
      .click();
    await page
      .locator('[role="dialog"]')
      .waitFor({ state: "hidden", timeout: 5_000 });
  };

  return {
    searchInput,
    goto,
    searchByEmail,
    findRowByEmail,
    assertRowExists,
    getStatusFromRow,
    getCreatedAtFromRow,
    openActionMenu,
    clickMenuAction,
    changeStatusInline,
    assertSideSheetOpen,
    assertDialogOpen,
    closeSideSheet,
    closeDialog,
  };
};

export type AdminDemoManagementPage = ReturnType<
  typeof createAdminDemoManagementPage
>;
