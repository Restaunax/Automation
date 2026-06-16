import { type Page } from "@playwright/test";

/** Template Wind — /order-confirmation/[orderId]. STUB POM (see TEST_PLAN.md). */
export const createOrderConfirmationPage = (page: Page) => {
  const confirmationHeading = page.getByRole("heading"); // TODO: target the confirmation banner

  const getOrderNumber = async (): Promise<string> => {
    // TODO: read the order number shown on the confirmation page
    return (await confirmationHeading.first().textContent()) ?? "";
  };

  const orderMore = async (): Promise<void> => {
    await page.getByRole("button", { name: /order more/i }).click();
  };

  return { getOrderNumber, orderMore };
};

export type OrderConfirmationPage = ReturnType<
  typeof createOrderConfirmationPage
>;
