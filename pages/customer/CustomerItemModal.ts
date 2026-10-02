import { type Page, expect } from "@playwright/test";

/**
 * The menu ItemModal's modifier-selection surface (template-wind
 * src/components/menu/ItemModal.tsx). Selector notes, verified in source:
 *
 * - Options are REAL `<input type="radio">` (maxSelections === 1 groups) or
 *   `<input type="checkbox">` inside a `<label>` that also contains the
 *   modifier name and its price display — so getByRole with a non-exact name
 *   regex on the modifier name resolves the input. Tests seed their own
 *   modifier names, so names are unique within the open modal.
 * - The Add to Cart button is disabled until every required group is
 *   satisfied, and its label carries the live price ("Add to Cart — $12.00")
 *   — price assertions read the button text, no separate price locator.
 * - allowsDuplicates quantity steppers are icon-only buttons (no aria-label);
 *   they're reached from the adjacent "Qty:" text — sibling order is
 *   [minus button, qty span, plus button].
 */
export const createCustomerItemModal = (page: Page) => {
  const addToCartButton = () =>
    page
      .getByTestId("add-to-cart")
      .or(page.getByRole("button", { name: /add to cart/i }))
      .first();

  // Radio or checkbox depending on the group's maxSelections — .or() covers
  // both; only one control per (unique) modifier name exists in the modal.
  const option = (name: string) =>
    page
      .getByRole("radio", { name: new RegExp(name) })
      .or(page.getByRole("checkbox", { name: new RegExp(name) }))
      .first();

  const selectOption = (name: string) => option(name).check();

  const assertOptionChecked = (name: string) =>
    expect(option(name)).toBeChecked({ timeout: 10_000 });

  const assertOptionUnchecked = (name: string) =>
    expect(option(name)).not.toBeChecked({ timeout: 10_000 });

  const assertOptionDisabled = (name: string) =>
    expect(option(name)).toBeDisabled({ timeout: 10_000 });

  const assertRequiredPillVisible = () =>
    expect(page.getByText("Required", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

  const assertAddToCartDisabled = () =>
    expect(addToCartButton()).toBeDisabled({ timeout: 10_000 });

  const assertAddToCartEnabled = () =>
    expect(addToCartButton()).toBeEnabled({ timeout: 10_000 });

  // The live price on the Add to Cart label ("Add to Cart — $11.50").
  const assertPrice = (amount: string) =>
    expect(addToCartButton()).toContainText(`$${amount}`, { timeout: 10_000 });

  // Only one Qty row is visible in these scenarios (one allowsDuplicates
  // modifier selected at a time). Siblings of the "Qty:" span, in order:
  // minus button, qty value span, plus button.
  const qtyPlusButton = () =>
    page
      .getByText("Qty:", { exact: true })
      .locator("xpath=following-sibling::button[2]");
  const qtyMinusButton = () =>
    page
      .getByText("Qty:", { exact: true })
      .locator("xpath=following-sibling::button[1]");
  const qtyValue = () =>
    page
      .getByText("Qty:", { exact: true })
      .locator("xpath=following-sibling::span");

  const increaseQty = () => qtyPlusButton().click();
  const decreaseQty = () => qtyMinusButton().click();

  const assertQty = (value: number) =>
    expect(qtyValue()).toHaveText(String(value), { timeout: 10_000 });

  return {
    addToCartButton,
    option,
    selectOption,
    assertOptionChecked,
    assertOptionUnchecked,
    assertOptionDisabled,
    assertRequiredPillVisible,
    assertAddToCartDisabled,
    assertAddToCartEnabled,
    assertPrice,
    increaseQty,
    decreaseQty,
    assertQty,
  };
};
