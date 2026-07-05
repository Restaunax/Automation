import { type Page, expect } from "@playwright/test";

const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

export const createCustomerMenuPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(`${TEMPLATE_WIND_URL}/menu?restaurantId=${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
  };

  // MenuItemCard renders the item name as an <h3> inside a clickable card div
  // (template-wind src/components/menu/MenuItemCard.tsx). There is no
  // data-testid / .menu-item-card class / <article> in that tree — target the
  // heading; the click bubbles up to the card's onClick.
  const menuItemCard = (name: string) =>
    page.getByRole("heading", { name, exact: true });

  const floatingCartButton = () =>
    page.getByRole("button", { name: /view cart/i });

  const assertPageLoaded = () =>
    expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });

  const openItemModal = (itemName: string) => menuItemCard(itemName).click();

  // ItemModal has no role="dialog" or testid (plain motion.div overlay) — the
  // "Add to Cart — $…" button only exists while the modal is open, so it is
  // the modal-open signal.
  const assertItemModalOpen = () =>
    expect(addToCartButton()).toBeVisible({ timeout: 10_000 });

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
