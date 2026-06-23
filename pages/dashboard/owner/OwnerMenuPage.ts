import { type Page, expect } from "@playwright/test";

export const createOwnerMenuPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToMenuTab = async () => {
    await drawer().getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Add Category" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const addCategoryButton = () =>
    page.getByRole("button", { name: "Add Category" });

  const categorySection = (name: string) =>
    page
      .locator(".MuiAccordion-root, [data-testid='menu-category']")
      .filter({ hasText: name });

  const assertCategoryVisible = (name: string) =>
    expect(categorySection(name)).toBeVisible({ timeout: 10_000 });

  const createCategory = async (name: string) => {
    await addCategoryButton().click();
    await page
      .getByPlaceholder("appetizer, Main Course, Dessert...")
      .waitFor({ state: "visible", timeout: 10_000 });
    await page
      .getByPlaceholder("appetizer, Main Course, Dessert...")
      .fill(name);
    await page.getByRole("button", { name: "Save changes" }).click();
  };

  const createMenuItem = async (
    categoryName: string,
    itemName: string,
    price: string,
    description: string
  ) => {
    await categorySection(categoryName)
      .getByRole("button", { name: "Add Item" })
      .click();
    await page
      .getByPlaceholder("Enter the menu item name")
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByPlaceholder("Enter the menu item name").fill(itemName);
    await page.getByPlaceholder("Enter the base price").fill(price);
    await page
      .getByPlaceholder("Enter a detailed description of the item")
      .fill(description);
    // Verify exact label against live UI; regex covers common variants
    await page
      .getByRole("button", { name: /save|create|add item/i })
      .last()
      .click();
  };

  const assertMenuItemSuccessToast = () =>
    expect(page.getByText("Menu item created successfully!")).toBeVisible({
      timeout: 10_000,
    });

  const menuItemRow = (categoryName: string, itemName: string) =>
    categorySection(categoryName)
      .locator("li, [data-testid='menu-item']")
      .filter({ hasText: itemName });

  const assertItemVisible = (categoryName: string, itemName: string) =>
    expect(menuItemRow(categoryName, itemName)).toBeVisible({
      timeout: 10_000,
    });

  const editCategory = async (currentName: string, newName: string) => {
    await categorySection(currentName)
      .getByRole("button", { name: /edit/i })
      .first()
      .click();
    const input = page.getByPlaceholder("appetizer, Main Course, Dessert...");
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.clear();
    await input.fill(newName);
    await page.getByRole("button", { name: "Save changes" }).click();
  };

  const assertCategorySuccessToast = () =>
    expect(page.getByText(/category updated|saved/i)).toBeVisible({
      timeout: 10_000,
    });

  const editMenuItem = async (
    categoryName: string,
    itemName: string,
    newName: string,
    newPrice: string
  ) => {
    await menuItemRow(categoryName, itemName)
      .getByRole("button", { name: /edit/i })
      .first()
      .click();
    const nameInput = page.getByPlaceholder("Enter the menu item name");
    await nameInput.waitFor({ state: "visible", timeout: 10_000 });
    await nameInput.clear();
    await nameInput.fill(newName);
    const priceInput = page.getByPlaceholder("Enter the base price");
    await priceInput.clear();
    await priceInput.fill(newPrice);
    await page
      .getByRole("button", { name: /save|update/i })
      .last()
      .click();
  };

  const assertMenuItemUpdateToast = () =>
    expect(page.getByText(/menu item updated|saved/i)).toBeVisible({
      timeout: 10_000,
    });

  const deleteMenuItem = async (categoryName: string, itemName: string) => {
    await menuItemRow(categoryName, itemName)
      .getByRole("button", { name: /delete|remove/i })
      .first()
      .click();
    // Confirm deletion dialog if present
    const confirmButton = page
      .getByRole("button", { name: /confirm|yes|delete/i })
      .last();
    const confirmVisible = await confirmButton.isVisible().catch(() => false);
    if (confirmVisible) await confirmButton.click();
  };

  const assertItemDeleted = async (categoryName: string, itemName: string) =>
    expect(menuItemRow(categoryName, itemName)).toBeHidden({ timeout: 10_000 });

  const deleteCategory = async (categoryName: string) => {
    await categorySection(categoryName)
      .getByRole("button", { name: /delete|remove/i })
      .first()
      .click();
    const confirmButton = page
      .getByRole("button", { name: /confirm|yes|delete/i })
      .last();
    const confirmVisible = await confirmButton.isVisible().catch(() => false);
    if (confirmVisible) await confirmButton.click();
  };

  const assertCategoryDeleted = (categoryName: string) =>
    expect(categorySection(categoryName)).toBeHidden({ timeout: 10_000 });

  return {
    navigateToMenuTab,
    addCategoryButton,
    categorySection,
    assertCategoryVisible,
    createCategory,
    createMenuItem,
    assertMenuItemSuccessToast,
    menuItemRow,
    assertItemVisible,
    editCategory,
    assertCategorySuccessToast,
    editMenuItem,
    assertMenuItemUpdateToast,
    deleteMenuItem,
    assertItemDeleted,
    deleteCategory,
    assertCategoryDeleted,
  };
};

export type OwnerMenuPage = ReturnType<typeof createOwnerMenuPage>;
