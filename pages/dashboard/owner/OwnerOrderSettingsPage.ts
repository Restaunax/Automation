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

  const convertButton = () =>
    page.getByRole("button", { name: /Confirm menu prices/ });

  const priceListButton = () =>
    page.getByRole("button", { name: "Price list / signage" });

  const convertedCaption = () => page.getByText(/Menu prices confirmed on/);

  const assertDualPricingBlockVisible = () =>
    expect(dualPricingSwitch()).toBeVisible({ timeout: 15_000 });

  const assertToggleGatedOnMarkup = async () => {
    await expect(dualPricingSwitch()).toBeDisabled({ timeout: 10_000 });
    await expect(markupMissingWarning()).toBeVisible({ timeout: 10_000 });
    await expect(convertButton()).toBeDisabled();
    await expect(priceListButton()).toBeDisabled();
  };

  // No `percent` argument: the owner's screen states no rate at all any more.
  // A 3.5% card markup is a 3.38% discount off the card price, so every figure
  // shown disagreed with the number the company had set — the platform now
  // shows amounts and the card/cash labels, nothing else.
  const assertToggleOffered = async () => {
    await expect(dualPricingSwitch()).toBeEnabled({ timeout: 10_000 });
    await expect(markupMissingWarning()).toHaveCount(0);
    await expect(priceListButton()).toBeEnabled();
  };

  // ── Convert-menu dialog (PREVIEW ONLY — never confirm on shared QA) ─────
  const conversionDialog = () =>
    page.getByRole("dialog").filter({
      hasText: "Confirm menu prices",
    });

  const openConversionPreview = async () => {
    await convertButton().click();
    await conversionDialog().waitFor({ state: "visible", timeout: 10_000 });
  };

  const assertConversionPreviewRendered = async () => {
    const dialog = conversionDialog();
    // The preview table appears once POST …/dual-pricing/convert {preview:true}
    // resolves. It no longer shows a rewrite (from → to): confirming changes
    // no price, so the columns are the posted card price and the cash price it
    // derives — how the menu will READ once dual pricing is on.
    await expect(
      dialog.getByRole("columnheader", { name: "Card price" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      dialog.getByRole("columnheader", { name: "Cash price" })
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
    assertToggleOffered,
    openConversionPreview,
    assertConversionPreviewRendered,
    closeConversionDialog,
    openPriceList,
    closePriceList,
  };
};
