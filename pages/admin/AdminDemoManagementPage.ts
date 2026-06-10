import { type Page, type Locator, expect } from "@playwright/test";

const buildLocators = (page: Page) => ({
  searchInput: page.locator('input[placeholder*="Search by ID"]'),
});

export const createAdminDemoManagementPage = (page: Page) => {
  const els = buildLocators(page);

  const goto = async (): Promise<void> => {
    await page.goto("/admin?tab=demo", { waitUntil: "domcontentloaded" });
    await els.searchInput.waitFor({ state: "visible", timeout: 15_000 });
  };

  const searchByEmail = async (email: string): Promise<void> => {
    await els.searchInput.waitFor({ state: "visible", timeout: 10_000 });
    await els.searchInput.clear();
    await els.searchInput.fill(email);
    // Wait for the debounced search request to complete (~800ms debounce).
    // networkidle is used here intentionally: this is a point-in-time search
    // action, not a page with background polling.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch((err) => {
      console.warn("[AdminDemoManagementPage] networkidle timed out after search — results may be stale:", err);
    });
  };

  const findRowByEmail = (email: string): Locator =>
    page.locator("tbody tr").filter({ hasText: email });

  const assertRowExists = async (email: string): Promise<Locator> => {
    const row = findRowByEmail(email);
    await expect(row).toBeVisible({ timeout: 10_000 });
    return row;
  };

  const getStatusFromRow = async (row: Locator): Promise<string> => {
    const statusEl = row.locator('[role="combobox"] .MuiChip-label');
    return (await statusEl.textContent()) ?? "";
  };

  const getCreatedAtFromRow = async (row: Locator): Promise<string> => {
    // Date is the first column in the demo management table.
    return ((await row.locator("td").first().textContent()) ?? "").trim();
  };

  return {
    searchInput: els.searchInput,
    goto,
    searchByEmail,
    findRowByEmail,
    assertRowExists,
    getStatusFromRow,
    getCreatedAtFromRow,
  };
};

export type AdminDemoManagementPage = ReturnType<typeof createAdminDemoManagementPage>;
