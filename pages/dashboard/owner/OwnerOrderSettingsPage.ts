import { type Page, expect } from "@playwright/test";

/**
 * OwnerOrderSettingsPage — Store Settings → "Order Settings" sub-tab of the
 * restaurant portal (RestaurantSettingsPage → OrderSettingsTab.tsx), scoped to
 * the dual-pricing block. The block renders ONLY for restaurants a company
 * admin has enrolled (settings.dualPricingEligible); the toggle is disabled
 * until the admin has also set a card markup (the server refuses enabling
 * without one, so the UI never offers a switch that can only fail).
 *
 * All English strings below come from restaurant.json → orderSettings.dualPricing
 * and menu.json → dualPricing.conversion.
 */
export const createOwnerOrderSettingsPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToOrderSettings = async () => {
    await drawer()
      .getByRole("button", { name: "Store Settings", exact: true })
      .click();
    const tab = page.getByRole("tab", { name: "Order Settings" });
    await tab.waitFor({ state: "visible", timeout: 15_000 });
    await tab.click();
    // OrderSettingsTab.tsx title: restaurant.json → orderSettings.title
    await page
      .getByRole("heading", { name: "Order Processing Settings" })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  // ── Dual pricing block ──────────────────────────────────────────────────
  const dualPricingLabel = () =>
    page.locator("label").filter({ hasText: "Dual Pricing (Cash Discount)" });

  const dualPricingSwitch = () =>
    dualPricingLabel().locator('input[type="checkbox"]');

  const markupMissingWarning = () =>
    page.getByText("Contact RestauNax to set your card markup first");

  const markupSummary = (percent: string) =>
    page.getByText(`Card prices are ${percent}% above cash prices.`);

  const convertButton = () =>
    page.getByRole("button", { name: /Convert menu/ });

  const priceListButton = () =>
    page.getByRole("button", { name: "Price list / signage" });

  const convertedCaption = () => page.getByText(/Menu converted on/);

  const assertDualPricingBlockVisible = () =>
    expect(dualPricingSwitch()).toBeVisible({ timeout: 15_000 });

  const assertToggleGatedOnMarkup = async () => {
    await expect(dualPricingSwitch()).toBeDisabled({ timeout: 10_000 });
    await expect(markupMissingWarning()).toBeVisible({ timeout: 10_000 });
    await expect(convertButton()).toBeDisabled();
    await expect(priceListButton()).toBeDisabled();
  };

  const assertToggleOfferedAt = async (percent: string) => {
    await expect(dualPricingSwitch()).toBeEnabled({ timeout: 10_000 });
    await expect(markupMissingWarning()).toHaveCount(0);
    await expect(markupSummary(percent)).toBeVisible({ timeout: 10_000 });
    await expect(priceListButton()).toBeEnabled();
  };

  // ── Convert-menu dialog (PREVIEW ONLY — never confirm on shared QA) ─────
  const conversionDialog = () =>
    page.getByRole("dialog").filter({
      hasText: "Convert menu to dual pricing",
    });

  const openConversionPreview = async () => {
    await convertButton().click();
    await conversionDialog().waitFor({ state: "visible", timeout: 10_000 });
  };

  const assertConversionPreviewRendered = async () => {
    const dialog = conversionDialog();
    // The preview table appears once POST …/dual-pricing/convert {preview:true}
    // resolves; header cells are the CR/CA columns.
    await expect(
      dialog.getByRole("columnheader", { name: "From (cash)" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      dialog.getByRole("columnheader", { name: "To (card)" })
    ).toBeVisible();
    await expect(dialog.locator("tbody tr").first()).toBeVisible();
    // The destructive confirm exists but stays gated behind the acknowledge
    // checkbox — assert the gate, never tick it.
    await expect(
      dialog.getByRole("button", { name: /Convert \d+ prices/ })
    ).toBeDisabled();
    await expect(
      dialog.getByLabel("I understand this cannot be undone")
    ).not.toBeChecked();
  };

  const closeConversionDialog = async () => {
    await page.keyboard.press("Escape");
    await conversionDialog().waitFor({ state: "hidden", timeout: 10_000 });
  };

  // ── Price list / signage dialog (read-only) ─────────────────────────────
  const priceListDialog = () =>
    page.getByRole("dialog").filter({ hasText: /Card|Cash/ });

  const openPriceList = async () => {
    await priceListButton().click();
    await priceListDialog().waitFor({ state: "visible", timeout: 10_000 });
  };

  const closePriceList = async () => {
    await page.keyboard.press("Escape");
    await priceListDialog().waitFor({ state: "hidden", timeout: 10_000 });
  };

  return {
    navigateToOrderSettings,
    dualPricingSwitch,
    convertButton,
    priceListButton,
    convertedCaption,
    assertDualPricingBlockVisible,
    assertToggleGatedOnMarkup,
    assertToggleOfferedAt,
    openConversionPreview,
    assertConversionPreviewRendered,
    closeConversionDialog,
    openPriceList,
    closePriceList,
  };
};
