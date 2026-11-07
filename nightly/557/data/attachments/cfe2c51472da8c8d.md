# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/dual-pricing.spec.ts >> Dashboard — Dual pricing v2 >> TC-494: the owner's Dual Pricing toggle is disabled until an admin sets the card markup; the Confirm-menu dialog previews the card/cash table and names no rate
- Location: tests/dashboard/owner/dual-pricing.spec.ts:101:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('tab', { name: 'Order Settings' }) to be visible

```

# Test source

```ts
  1   | import { type Page, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * OwnerOrderSettingsPage — Store Settings → "Order Settings" sub-tab of the
  5   |  * restaurant portal (RestaurantSettingsPage → OrderSettingsTab.tsx), scoped to
  6   |  * the dual-pricing block. The block renders ONLY for restaurants a company
  7   |  * admin has enrolled (settings.dualPricingEligible); the toggle is disabled
  8   |  * until the admin has also set a card markup (the server refuses enabling
  9   |  * without one, so the UI never offers a switch that can only fail).
  10  |  *
  11  |  * All English strings below come from restaurant.json → orderSettings.dualPricing
  12  |  * and menu.json → dualPricing.conversion.
  13  |  */
  14  | export const createOwnerOrderSettingsPage = (page: Page) => {
  15  |   const drawer = () => page.locator(".MuiDrawer-paper").first();
  16  | 
  17  |   const navigateToOrderSettings = async () => {
  18  |     await drawer()
  19  |       .getByRole("button", { name: "Store Settings", exact: true })
  20  |       .click();
  21  |     const tab = page.getByRole("tab", { name: "Order Settings" });
> 22  |     await tab.waitFor({ state: "visible", timeout: 15_000 });
      |               ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  23  |     await tab.click();
  24  |     // OrderSettingsTab.tsx title: restaurant.json → orderSettings.title
  25  |     await page
  26  |       .getByRole("heading", { name: "Order Processing Settings" })
  27  |       .first()
  28  |       .waitFor({ state: "visible", timeout: 15_000 });
  29  |   };
  30  | 
  31  |   // ── Dual pricing block ──────────────────────────────────────────────────
  32  |   const dualPricingLabel = () =>
  33  |     page.locator("label").filter({ hasText: "Dual Pricing (Cash Discount)" });
  34  | 
  35  |   const dualPricingSwitch = () =>
  36  |     dualPricingLabel().locator('input[type="checkbox"]');
  37  | 
  38  |   const markupMissingWarning = () =>
  39  |     page.getByText("Contact RestauNax to set your card markup first");
  40  | 
  41  |   const convertButton = () =>
  42  |     page.getByRole("button", { name: /Confirm menu prices/ });
  43  | 
  44  |   const priceListButton = () =>
  45  |     page.getByRole("button", { name: "Price list / signage" });
  46  | 
  47  |   const convertedCaption = () => page.getByText(/Menu prices confirmed on/);
  48  | 
  49  |   const assertDualPricingBlockVisible = () =>
  50  |     expect(dualPricingSwitch()).toBeVisible({ timeout: 15_000 });
  51  | 
  52  |   const assertToggleGatedOnMarkup = async () => {
  53  |     await expect(dualPricingSwitch()).toBeDisabled({ timeout: 10_000 });
  54  |     await expect(markupMissingWarning()).toBeVisible({ timeout: 10_000 });
  55  |     await expect(convertButton()).toBeDisabled();
  56  |     await expect(priceListButton()).toBeDisabled();
  57  |   };
  58  | 
  59  |   // No `percent` argument: the owner's screen states no rate at all any more.
  60  |   // A 3.5% card markup is a 3.38% discount off the card price, so every figure
  61  |   // shown disagreed with the number the company had set — the platform now
  62  |   // shows amounts and the card/cash labels, nothing else.
  63  |   const assertToggleOffered = async () => {
  64  |     await expect(dualPricingSwitch()).toBeEnabled({ timeout: 10_000 });
  65  |     await expect(markupMissingWarning()).toHaveCount(0);
  66  |     await expect(priceListButton()).toBeEnabled();
  67  |   };
  68  | 
  69  |   // ── Convert-menu dialog (PREVIEW ONLY — never confirm on shared QA) ─────
  70  |   const conversionDialog = () =>
  71  |     page.getByRole("dialog").filter({
  72  |       hasText: "Confirm menu prices",
  73  |     });
  74  | 
  75  |   const openConversionPreview = async () => {
  76  |     await convertButton().click();
  77  |     await conversionDialog().waitFor({ state: "visible", timeout: 10_000 });
  78  |   };
  79  | 
  80  |   const assertConversionPreviewRendered = async () => {
  81  |     const dialog = conversionDialog();
  82  |     // The preview table appears once POST …/dual-pricing/convert {preview:true}
  83  |     // resolves. It no longer shows a rewrite (from → to): confirming changes
  84  |     // no price, so the columns are the posted card price and the cash price it
  85  |     // derives — how the menu will READ once dual pricing is on.
  86  |     await expect(
  87  |       dialog.getByRole("columnheader", { name: "Card price" })
  88  |     ).toBeVisible({ timeout: 20_000 });
  89  |     await expect(
  90  |       dialog.getByRole("columnheader", { name: "Cash price" })
  91  |     ).toBeVisible();
  92  |     await expect(dialog.locator("tbody tr").first()).toBeVisible();
  93  |     // The destructive confirm exists but stays gated behind the acknowledge
  94  |     // checkbox — assert the gate, never tick it.
  95  |     await expect(
  96  |       dialog.getByRole("button", { name: /Convert \d+ prices/ })
  97  |     ).toBeDisabled();
  98  |     await expect(
  99  |       dialog.getByLabel("I understand this cannot be undone")
  100 |     ).not.toBeChecked();
  101 |   };
  102 | 
  103 |   const closeConversionDialog = async () => {
  104 |     await page.keyboard.press("Escape");
  105 |     await conversionDialog().waitFor({ state: "hidden", timeout: 10_000 });
  106 |   };
  107 | 
  108 |   // ── Price list / signage dialog (read-only) ─────────────────────────────
  109 |   const priceListDialog = () =>
  110 |     page.getByRole("dialog").filter({ hasText: /Card|Cash/ });
  111 | 
  112 |   const openPriceList = async () => {
  113 |     await priceListButton().click();
  114 |     await priceListDialog().waitFor({ state: "visible", timeout: 10_000 });
  115 |   };
  116 | 
  117 |   const closePriceList = async () => {
  118 |     await page.keyboard.press("Escape");
  119 |     await priceListDialog().waitFor({ state: "hidden", timeout: 10_000 });
  120 |   };
  121 | 
  122 |   return {
```