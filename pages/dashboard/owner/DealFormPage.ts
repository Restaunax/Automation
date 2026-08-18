import { type Page, expect } from "@playwright/test";

/**
 * DealForm.tsx — `?tab=create-deal` (create) and the same tab in edit mode
 * (reached from a row's Edit menu item). One page, no stepper: Basic
 * Information → Deal Items (MUI Autocomplete picker, grouped by category, out-
 * of-stock items excluded; each pick renders an outlined Card with a qty
 * spinbutton and an unlabeled delete IconButton) → Pricing (live "Original
 * Price:", "Savings: $x (y% off)", ≥90% warning) → Time Restrictions /
 * Additional Information (hard-disabled on purpose, commit 011c5188) → sticky
 * preview with the submit button ("Create Deal" / "Update Deal" / chain
 * variants) and "Cancel".
 *
 * Verified on QA 2026-08-18: textbox "Deal Name *", textbox "Description",
 * combobox "Search and add menu items...", spinbutton "Deal Price *", options
 * read "<name> - $<price> (<group>)", validation errors render as plain
 * paragraphs under the field ("Deal name is required", "Deal price must be
 * greater than 0", "Deal price must be less than original price"), the
 * duplicate-item guard is a warning snackbar "This item is already in the deal".
 * After a successful save the form shows "Deal created/updated successfully"
 * and returns to ?tab=deals after ~1.5 s.
 */
export const createDealFormPage = (page: Page) => {
  const heading = () =>
    page.getByRole("heading", { name: /^(Create New Deal|Edit Deal)$/ });
  const assertCreateMode = () =>
    expect(
      page.getByRole("heading", { name: "Create New Deal", exact: true })
    ).toBeVisible({ timeout: 15_000 });
  const assertEditMode = () =>
    expect(
      page.getByRole("heading", { name: "Edit Deal", exact: true })
    ).toBeVisible({ timeout: 15_000 });

  const nameInput = () => page.locator("#deal-name");
  const descriptionInput = () => page.locator("#deal-description");
  const priceInput = () => page.locator("#deal-price");
  const itemPicker = () =>
    page.getByRole("combobox", { name: "Search and add menu items..." });

  /** Type in the picker and click the option whose label starts with the item name. */
  const addItem = async (itemName: string) => {
    await itemPicker().click();
    await itemPicker().fill(itemName);
    const option = page
      .getByRole("option", { name: new RegExp(`^${escapeRe(itemName)} - \\$`) })
      .first();
    await option.waitFor({ state: "visible", timeout: 10_000 });
    await option.click();
  };

  /** The outlined Card for a picked item (name paragraph + "$x each" + qty + delete). */
  const itemCard = (itemName: string) =>
    page
      .locator(".MuiCard-root")
      .filter({ has: page.getByText(itemName, { exact: true }) })
      .filter({ hasText: "each" })
      .first();
  const itemQtyInput = (itemName: string) =>
    itemCard(itemName).getByRole("spinbutton");
  const setItemQty = async (itemName: string, qty: number) => {
    await itemQtyInput(itemName).fill(String(qty));
    await itemQtyInput(itemName).press("Tab");
  };
  const removeItem = (itemName: string) =>
    itemCard(itemName).getByRole("button").last().click();
  const pickedItemNames = () =>
    page
      .locator(".MuiCard-root")
      .filter({ hasText: "each" })
      .locator("p")
      .filter({ hasNotText: "each" })
      .filter({ hasNotText: /^\$/ })
      .allTextContents();

  // Pricing read-outs
  const originalPriceText = () =>
    page.getByText(/^Original Price:/).locator("..");
  const savingsText = () => page.getByText(/^Savings: \$/);
  const highDiscountWarning = () =>
    page.getByRole("alert").filter({ hasText: /Make sure your deal price/ });

  // Preview
  const previewSaveChip = () => page.getByText(/^Save \d+%$/);
  /** "1x Name" chips in the preview (the "Save X%" chip lives in the same box — excluded). */
  const previewIncludesChips = () =>
    page
      .getByRole("heading", { name: "Includes:" })
      .locator("..")
      .locator(".MuiChip-label")
      .filter({ hasNotText: /^Save \d+%$/ });
  const previewNoItems = () => page.getByText("No items added yet");

  // Validation strings (plain paragraphs, not FormHelperText)
  const nameRequiredError = () => page.getByText("Deal name is required");
  const pricePositiveError = () =>
    page.getByText("Deal price must be greater than 0");
  const priceBelowOriginalError = () =>
    page.getByText("Deal price must be less than original price");
  const duplicateItemSnackbar = () =>
    page
      .getByRole("alert")
      .filter({ hasText: "This item is already in the deal" });

  // Disabled-on-purpose sections (asserted, never driven)
  const dayCheckbox = (
    label: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
  ) => page.getByRole("checkbox", { name: label, exact: true });

  // Submit / cancel
  const submitButton = () =>
    page
      .locator("#root")
      .getByRole("button", {
        name: /^(Create Deal|Update Deal|Create deal for .*|Update deal .*|Saving\.\.\.)$/,
      })
      .last();
  const cancelButton = () =>
    page.locator("#root").getByRole("button", { name: "Cancel", exact: true });

  /** Click submit and return the create (POST) or update (PUT) response. */
  const submitAndWait = async (mode: "create" | "update") => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          mode === "create"
            ? /\/api\/(deals\/restaurant\/[^/]+|chains\/[^/]+\/deals)$/.test(
                r.url()
              ) && r.request().method() === "POST"
            : /\/api\/deals\/[^/]+$/.test(r.url()) &&
              r.request().method() === "PUT",
        { timeout: 20_000 }
      ),
      submitButton().click(),
    ]);
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  };
  const createdSnackbar = () =>
    page.getByRole("alert").filter({ hasText: "Deal created successfully" });
  const updatedSnackbar = () =>
    page.getByRole("alert").filter({ hasText: "Deal updated successfully" });

  // Chain fan-out confirm (useFanOutConfirm — suppressed per session after the first Continue)
  const fanOutDialog = () =>
    page.getByRole("dialog", { name: "Heads up — chain-wide change" });
  const fanOutContinue = () =>
    fanOutDialog().getByRole("button", { name: "Continue", exact: true });

  return {
    heading,
    assertCreateMode,
    assertEditMode,
    nameInput,
    descriptionInput,
    priceInput,
    itemPicker,
    addItem,
    itemCard,
    itemQtyInput,
    setItemQty,
    removeItem,
    pickedItemNames,
    originalPriceText,
    savingsText,
    highDiscountWarning,
    previewSaveChip,
    previewIncludesChips,
    previewNoItems,
    nameRequiredError,
    pricePositiveError,
    priceBelowOriginalError,
    duplicateItemSnackbar,
    dayCheckbox,
    submitButton,
    cancelButton,
    submitAndWait,
    createdSnackbar,
    updatedSnackbar,
    fanOutDialog,
    fanOutContinue,
  };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type DealFormPage = ReturnType<typeof createDealFormPage>;
