import { type Page } from "@playwright/test";

/** Template Wind — cart summary modal. STUB POM (see TEST_PLAN.md). */
export const createCartSummary = (page: Page) => {
  const dialog = page.getByRole("dialog");
  const checkoutButton = dialog.getByRole("button", { name: /checkout/i });

  const getLineItemCount = async (): Promise<number> => {
    // TODO: count the cart line items
    return dialog.getByRole("listitem").count();
  };

  const goToCheckout = async (): Promise<void> => {
    await checkoutButton.click();
  };

  return { getLineItemCount, goToCheckout };
};

export type CartSummary = ReturnType<typeof createCartSummary>;
