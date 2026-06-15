import { type Page } from "@playwright/test";

/**
 * Template Wind — item modal (modifiers, quantity, Add to Cart).
 * STUB POM — see TEST_PLAN.md for the factory-POM pattern.
 */
export const createItemModal = (page: Page) => {
  const dialog = page.getByRole("dialog");
  const addToCartButton = dialog.getByRole("button", { name: /add to cart/i });

  const selectModifier = async (label: string): Promise<void> => {
    // TODO: choose a modifier option by its visible label
    await dialog.getByText(label, { exact: false }).click();
  };

  const setQuantity = async (qty: number): Promise<void> => {
    // TODO: set the quantity stepper to `qty`
    await dialog.getByRole("spinbutton").fill(String(qty));
  };

  const addToCart = async (): Promise<void> => {
    await addToCartButton.click();
  };

  return { selectModifier, setQuantity, addToCart };
};

export type ItemModal = ReturnType<typeof createItemModal>;
