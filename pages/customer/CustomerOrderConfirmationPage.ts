import { type Page, expect } from "@playwright/test";

export const createCustomerOrderConfirmationPage = (page: Page) => {
  const assertConfirmed = () =>
    expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible(
      { timeout: 20_000 }
    );

  // "Order #" (label) and the number itself render as separate text nodes/
  // lines in the same card, not concatenated — the original `/Order # #/`
  // regex never matched either node (confirmed live). Match the label alone.
  const assertOrderNumberVisible = () =>
    expect(page.getByText("Order #", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

  const assertCustomerName = (firstName: string) =>
    expect(page.getByText(`Thanks ${firstName}!`)).toBeVisible({
      timeout: 10_000,
    });

  return { assertConfirmed, assertOrderNumberVisible, assertCustomerName };
};
