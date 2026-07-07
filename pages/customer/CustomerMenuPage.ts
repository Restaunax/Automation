import { type Page, expect } from "@playwright/test";

const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

export const createCustomerMenuPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(`${TEMPLATE_WIND_URL}/menu?restaurantId=${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
  };

  // Testid-first with legacy fallback (TEST_PLAN → "Locator strategy"):
  // data-testid=menu-item-card exists in template-wind source; until the QA
  // deployment carries it, fall back to the item-name <h3> heading (the click
  // bubbles up to the card's onClick either way).
  const menuItemCard = (name: string) =>
    page
      .getByTestId("menu-item-card")
      .filter({ hasText: name })
      .or(page.getByRole("heading", { name, exact: true }))
      .first();

  const floatingCartButton = () =>
    page
      .getByTestId("view-cart")
      .or(page.getByRole("button", { name: /view cart/i }))
      .first();

  const assertPageLoaded = () =>
    expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });

  const openItemModal = (itemName: string) => menuItemCard(itemName).click();

  // ItemModal: source now has role="dialog" + data-testid=item-modal, but the
  // QA deployment may predate both — the "Add to Cart — $…" button only
  // exists while the modal is open, so it stays the modal-open signal that
  // works on every deployment.
  const assertItemModalOpen = () =>
    expect(addToCartButton()).toBeVisible({ timeout: 10_000 });

  const addToCartButton = () =>
    page
      .getByTestId("add-to-cart")
      .or(page.getByRole("button", { name: /add to cart/i }))
      .first();

  const clickAddToCart = () => addToCartButton().click();

  const assertCartButtonVisible = () =>
    expect(floatingCartButton()).toBeVisible({ timeout: 10_000 });

  // Open the cart modal (CartSummary) via the floating View Cart button.
  const openCart = () => floatingCartButton().click();

  // CartSummary's checkout button label depends on auth state:
  // "Proceed to Checkout" (signed-in) / "Checkout & Sign In" (guest).
  const checkoutButton = () =>
    page.getByRole("button", {
      name: /proceed to checkout|checkout & sign in/i,
    });

  const proceedToCheckout = async () => {
    await checkoutButton().waitFor({ state: "visible", timeout: 10_000 });
    await checkoutButton().click();
  };

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
    openCart,
    checkoutButton,
    proceedToCheckout,
  };
};
