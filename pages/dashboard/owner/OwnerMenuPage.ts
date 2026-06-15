import { type Page, expect } from "@playwright/test";

export const createOwnerMenuPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToMenuTab = async () => {
    await drawer().getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Add Category" }).waitFor({ state: "visible", timeout: 15_000 });
  };

  const addCategoryButton = () => page.getByRole("button", { name: "Add Category" });

  const categorySection = (name: string) =>
    page.locator(".MuiAccordion-root, [data-testid='menu-category']").filter({ hasText: name });

  const assertCategoryVisible = (name: string) =>
    expect(categorySection(name)).toBeVisible({ timeout: 10_000 });

  const createCategory = async (name: string) => {
    await addCategoryButton().click();
    await page.getByPlaceholder("appetizer, Main Course, Dessert...").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByPlaceholder("appetizer, Main Course, Dessert...").fill(name);
    await page.getByRole("button", { name: "Save changes" }).click();
  };

  const createMenuItem = async (
    categoryName: string,
    itemName: string,
    price: string,
    description: string
  ) => {
    await categorySection(categoryName).getByRole("button", { name: "Add Item" }).click();
    await page.getByPlaceholder("Enter the menu item name").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByPlaceholder("Enter the menu item name").fill(itemName);
    await page.getByPlaceholder("Enter the base price").fill(price);
    await page.getByPlaceholder("Enter a detailed description of the item").fill(description);
    // Verify exact label against live UI; regex covers common variants
    await page.getByRole("button", { name: /save|create|add item/i }).last().click();
  };

  const assertMenuItemSuccessToast = () =>
    expect(page.getByText("Menu item created successfully!")).toBeVisible({ timeout: 10_000 });

  return {
    navigateToMenuTab,
    addCategoryButton,
    categorySection,
    assertCategoryVisible,
    createCategory,
    createMenuItem,
    assertMenuItemSuccessToast,
  };
};
