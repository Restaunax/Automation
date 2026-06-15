import { type Page, expect } from "@playwright/test";

export const createCustomerOrderConfirmationPage = (page: Page) => {
  const assertConfirmed = () =>
    expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible({ timeout: 20_000 });

  const assertOrderNumberVisible = () =>
    expect(page.getByText(/Order # #/)).toBeVisible({ timeout: 10_000 });

  const assertCustomerName = (firstName: string) =>
    expect(page.getByText(`Thanks ${firstName}!`)).toBeVisible({ timeout: 10_000 });

  return { assertConfirmed, assertOrderNumberVisible, assertCustomerName };
};
