import { type Page, expect } from "@playwright/test";

/**
 * OwnerCustomersPage — the owner "Customers" tab of the restaurant portal
 * (PortalShell menu id "Customers" → ?tab=Customers). Renders CustomerManagement,
 * which has three sub-tabs: "All Customers" (directory), "Customer Groups"
 * (segments), and "Analytics" (data-dependent, not covered here).
 *
 * The directory lists customers from GET /api/customers/restaurant/:restaurantId
 * with stat cards and a name/email/phone search. Segments come from
 * GET /api/customers/restaurant/:restaurantId/segments.
 *
 * Selectors use roles/visible text (no test-ids) to match the QA deployment,
 * consistent with the other owner POMs.
 */
export const createOwnerCustomersPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToCustomersTab = async () => {
    await drawer()
      .getByRole("button", { name: "Customers", exact: true })
      .click();
    await page.waitForURL(/tab=Customers/, { timeout: 10_000 });
    // The sub-tab row is the most stable signal the CustomerManagement view mounted.
    await subTab("All Customers").waitFor({
      state: "visible",
      timeout: 15_000,
    });
  };

  // ── Sub-tabs ────────────────────────────────────────────────────────────────
  const subTab = (label: string) => page.getByRole("tab", { name: label });

  const goToSubTab = (label: string) => subTab(label).click();

  // ── Directory (All Customers) ────────────────────────────────────────────────
  const searchInput = () =>
    page.getByPlaceholder("Search by name, email, or phone");

  const statCard = (title: string) => page.getByText(title, { exact: true });

  const assertDirectoryLoaded = async () => {
    await expect(subTab("All Customers")).toBeVisible({ timeout: 15_000 });
    await expect(subTab("Customer Groups")).toBeVisible({ timeout: 10_000 });
    await expect(searchInput()).toBeVisible({ timeout: 15_000 });
    await expect(statCard("Total Customers")).toBeVisible({ timeout: 15_000 });
  };

  // Typing drives an immediate re-query (searchTerm is a fetch dependency).
  const searchCustomers = async (query: string) => {
    await searchInput().fill(query);
  };

  // ── Segments (Customer Groups) ───────────────────────────────────────────────
  const assertSegmentsLoaded = async () => {
    await expect(
      page.getByRole("heading", { name: "Customer Segments" })
    ).toBeVisible({ timeout: 15_000 });
    // A representative segment card ("VIP") proves the segments rendered, not
    // just the page shell.
    await expect(page.getByText("VIP", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  };

  const assertNoLoadError = () =>
    expect(
      page.getByText("Failed to load customers. Please try again.")
    ).toHaveCount(0);

  return {
    navigateToCustomersTab,
    subTab,
    goToSubTab,
    searchInput,
    statCard,
    assertDirectoryLoaded,
    searchCustomers,
    assertSegmentsLoaded,
    assertNoLoadError,
  };
};
