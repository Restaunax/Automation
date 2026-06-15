import { type Page, expect } from "@playwright/test";

const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

export const createCustomerMenuPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(`${TEMPLATE_WIND_URL}/menu?restaurantId=${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
  };

  const menuItemCard = (name: string) =>
    page
      .locator('[data-testid="menu-item-card"], .menu-item-card, article')
      .filter({ hasText: name });

  const floatingCartButton = () =>
    page.getByRole("button", { name: /view cart/i });

  const assertPageLoaded = () =>
    expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });

  const openItemModal = (itemName: string) => menuItemCard(itemName).click();

  const assertItemModalOpen = () =>
    expect(
      page.locator('[role="dialog"], [data-testid="item-modal"]')
    ).toBeVisible({ timeout: 10_000 });

  const addToCartButton = () =>
    page.getByRole("button", { name: /add to cart/i });

  const clickAddToCart = () => addToCartButton().click();

  const assertCartButtonVisible = () =>
    expect(floatingCartButton()).toBeVisible({ timeout: 10_000 });

  return {
    goto,
    menuItemCard,
    floatingCartButton,
    assertPageLoaded,
    openItemModal,
    assertItemModalOpen,
    addToCartButton,
    clickAddToCart,
    assertCartButtonVisible,
  };
};
