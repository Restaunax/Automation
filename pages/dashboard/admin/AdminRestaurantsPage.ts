import { type Page, expect } from "@playwright/test";

export const createAdminRestaurantsPage = (page: Page) => {
  const searchInput = () =>
    page.locator('input[placeholder*="Search"]').first();

  const goto = async () => {
    await page.goto("/admin?tab=restaurant&section=restaurant", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: /restaurant management/i })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(
      page.getByRole("heading", { name: /restaurant management/i })
    ).toBeVisible({ timeout: 15_000 });

  const assertTableColumnVisible = (columnName: string) =>
    expect(page.getByRole("columnheader", { name: columnName })).toBeVisible({
      timeout: 10_000,
    });

  const findRowByName = (name: string) =>
    page.locator("tbody tr").filter({ hasText: name });

  const assertRestaurantRowVisible = async (name: string) => {
    await expect(findRowByName(name)).toBeVisible({ timeout: 10_000 });
  };

  // ── Row kebab → Edit → "Update Restaurant Info" → RestaurantUpdateDialog ──
  // The kebab IconButton carries no aria-label; MUI stamps the icon with
  // data-testid="MoreVertIcon", which is the stable hook.
  const openRowActionMenu = async (name: string) => {
    await searchInput().fill(name);
    const row = findRowByName(name).first();
    await row.waitFor({ state: "visible", timeout: 15_000 });
    // The kebab is the row's last button (the actions cell sits at the far
    // right of a horizontally scrolling table); testid-first with a
    // positional fallback.
    const kebab = row
      .locator('button:has([data-testid="MoreVertIcon"])')
      .or(row.getByRole("button").last())
      .first();
    await kebab.scrollIntoViewIfNeeded();
    await kebab.click();
    await page
      .getByRole("menuitem", { name: "Edit", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  const openUpdateRestaurantInfo = async (name: string) => {
    await openRowActionMenu(name);
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    // On QA "Edit" opens the Update Restaurant dialog directly; an older
    // build routes through EditRestaurantDialog ("Restaurant Actions" →
    // "Update Restaurant Info"). Accept either.
    const basicInfoTab = page.getByRole("tab", { name: "Basic Information" });
    const actionsStep = page.getByRole("button", {
      name: /Update Restaurant Info/,
    });
    await basicInfoTab
      .or(actionsStep)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    if (await actionsStep.isVisible()) {
      await actionsStep.click();
    }
    await basicInfoTab.waitFor({ state: "visible", timeout: 20_000 });
  };

  // ── Dual-pricing block on the Basic Information tab (admin-only fields) ──
  const dualPricingEligibleSwitch = () =>
    page
      .locator("label")
      .filter({ hasText: "Dual pricing eligible (cash discount)" })
      .locator('input[type="checkbox"]');

  const cardMarkupInput = () => page.locator("#dual-pricing-card-markup");

  const convertMenuButton = () =>
    page.getByRole("button", { name: /Convert menu/ });

  const priceListButton = () =>
    page.getByRole("button", { name: "Price list / signage" });

  const assertDualPricingAdminControlsVisible = async () => {
    await expect(dualPricingEligibleSwitch()).toBeVisible({ timeout: 15_000 });
    await expect(cardMarkupInput()).toBeVisible({ timeout: 15_000 });
    await expect(convertMenuButton()).toBeVisible();
    await expect(priceListButton()).toBeVisible();
    await expect(page.getByText(/legal in every US state/i)).toBeVisible();
  };

  return {
    goto,
    searchInput,
    assertPageLoaded,
    assertTableColumnVisible,
    findRowByName,
    assertRestaurantRowVisible,
    openRowActionMenu,
    openUpdateRestaurantInfo,
    dualPricingEligibleSwitch,
    cardMarkupInput,
    convertMenuButton,
    priceListButton,
    assertDualPricingAdminControlsVisible,
  };
};
