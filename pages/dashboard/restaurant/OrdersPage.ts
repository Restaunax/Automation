import { type Page } from "@playwright/test";

/**
 * Dashboard — Orders tab of the Restaurant Management portal. ROLE-AGNOSTIC
 * (Owner / Employee / Admin reach the same screen). STUB POM (see TEST_PLAN.md).
 */
export const createOrdersPage = (page: Page) => {
  const goto = async (restaurantId: string): Promise<void> => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Orders`,
      { waitUntil: "domcontentloaded" }
    );
  };

  const setOrderStatus = async (
    orderId: string,
    status: string
  ): Promise<void> => {
    // TODO: open order `orderId` and change its status to `status`
    await page.getByText(orderId).first().click();
    await page.getByRole("button", { name: status }).click();
  };

  return { goto, setOrderStatus };
};

export type OrdersPage = ReturnType<typeof createOrdersPage>;
