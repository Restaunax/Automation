import { type Page, expect } from "@playwright/test";

export const createOwnerMenuPage = (page: Page) => {
  // Navigate to the menu editor at /restaurant/restaurantId/:id (not the sidebar
  // "Menu" item, which goes to Menu Availability Management — a read-only view).
  const navigateToMenuTab = async () => {
    const currentUrl = page.url();
    const match = currentUrl.match(/restaurantId\/([^/]+)/);
    if (!match)
      throw new Error(`Cannot extract restaurantId from URL: ${currentUrl}`);
    await page.goto(`/restaurant/restaurantId/${match[1]}`);
    await page
      .getByRole("button", { name: "New Category" })
      .waitFor({ state: "visible", timeout: 20_000 });
  };

  const addCategoryButton = () =>
    page.getByRole("button", { name: "New Category" });

  // Categories are rendered as scrollable Tabs — match by tab role + label.
  const assertCategoryVisible = (name: string) =>
    expect(page.getByRole("tab", { name, exact: true })).toBeVisible({
      timeout: 10_000,
    });

  // Open "New Category" dialog, fill name, save.
  const createCategory = async (name: string) => {
    await addCategoryButton().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    await page
      .getByPlaceholder("appetizer, Main Course, Dessert...")
      .fill(name);
    await page.getByRole("button", { name: "Save changes" }).click();
    // Wait for the dialog to disappear before querying the tab — MUI Dialog sets
    // aria-hidden on the rest of the page while the dialog is open, which hides
    // tab roles from Playwright's accessibility tree.
    await dialog.waitFor({ state: "hidden", timeout: 15_000 });
    await page
      .getByRole("tab", { name, exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  // The "Add Item" button label uses capitalizeFirstLetter from the frontend:
  // first char upper, rest lower — e.g. "Test Starters" → "Add Test starters Item".
  const capitalizeFirst = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  const addItemButton = (categoryName: string) =>
    page.getByRole("button", {
      name: `Add ${capitalizeFirst(categoryName)} Item`,
    });

  // Click "Add [Category] Item" → navigates to 4-step add-item wizard.
  // Step 0: name + price (required) + description (optional) → Next
  // Step 1: Modifiers → Next (skip)
  // Step 2: Image Upload → Next (skip)
  // Step 3: Review → Save Item → navigates back to /restaurant/restaurantId/:id
  const createMenuItem = async (
    categoryName: string,
    itemName: string,
    price: string,
    description: string
  ) => {
    await addItemButton(categoryName).click();

    // Step 0 — Basic Information
    // Press Tab after each field to fire blur events: RHF mode "onBlur" only
    // sets isValid=true after fields are validated, which requires blur.
    await page
      .getByPlaceholder("Enter the menu item name")
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.getByPlaceholder("Enter the menu item name").fill(itemName);
    await page.getByPlaceholder("Enter the menu item name").press("Tab");
    await page.getByPlaceholder("Enter the base price").fill(price);
    await page.getByPlaceholder("Enter the base price").press("Tab");
    await page
      .getByPlaceholder("Enter a detailed description of the item")
      .fill(description);
    await page
      .getByPlaceholder("Enter a detailed description of the item")
      .press("Tab");
    await page.getByRole("button", { name: "Next" }).click();

    // Step 1 — Modifiers (skip)
    await page
      .getByRole("button", { name: "Next" })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2 — Image Upload (skip)
    await page
      .getByRole("button", { name: "Next" })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();

    // Step 3 — Review → Save
    // The button may briefly appear disabled while RHF isValid resolves;
    // force:true bypasses the disabled attribute so the form submit fires,
    // and the Yup resolver inside handleSubmit validates the filled fields.
    await page
      .getByRole("button", { name: "Save Item" })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page
      .getByRole("button", { name: "Save Item" })
      .click({ force: true });
  };

  const assertMenuItemSuccessToast = () =>
    expect(page.getByText("Menu item created successfully!")).toBeVisible({
      timeout: 10_000,
    });

  // After save, page navigates back to /restaurant/restaurantId/:id.
  // Item name appears as a card in the category section.
  const assertItemVisible = (_categoryName: string, itemName: string) =>
    expect(page.getByText(itemName)).toBeVisible({ timeout: 15_000 });

  // "Delete" category button only appears when the category has no items.
  // Scoped to the MuiPaper-root for that category — each category section
  // renders exactly one Paper; the tab section Paper has no headings inside it,
  // so this filter uniquely identifies the category content panel.
  const deleteCategory = async (categoryName: string) => {
    const categoryPanel = page
      .locator(".MuiPaper-root")
      .filter({
        has: page.getByRole("heading", { name: categoryName, exact: true }),
      })
      .filter({
        has: page.getByRole("button", { name: "Delete", exact: true }),
      })
      .first();
    await categoryPanel
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    // Confirmation dialog — click the "Delete" button to confirm.
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    await dialog.getByRole("button", { name: "Delete" }).click();
  };

  const assertCategoryDeleted = (categoryName: string) =>
    expect(
      page.getByRole("tab", { name: categoryName, exact: true })
    ).toBeHidden({ timeout: 10_000 });

  // Find item card by name, click its Edit button (2nd button in CardActions).
  const clickEditItem = async (itemName: string) => {
    const card = page
      .locator(".MuiCard-root")
      .filter({ hasText: itemName })
      .first();
    await card.waitFor({ state: "visible", timeout: 10_000 });
    await card.locator(".MuiCardActions-root button").nth(1).click();
  };

  // In the edit wizard, overwrite name and price in Step 0 then Save.
  const editItemInWizard = async (newName: string, newPrice: string) => {
    await page
      .getByPlaceholder("Enter the menu item name")
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.getByPlaceholder("Enter the menu item name").fill(newName);
    await page.getByPlaceholder("Enter the menu item name").press("Tab");
    await page.getByPlaceholder("Enter the base price").fill(newPrice);
    await page.getByPlaceholder("Enter the base price").press("Tab");
    await page.getByRole("button", { name: "Next" }).click();
    await page
      .getByRole("button", { name: "Next" })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page
      .getByRole("button", { name: "Next" })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page
      .getByRole("button", { name: "Save Item" })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page
      .getByRole("button", { name: "Save Item" })
      .click({ force: true });
  };

  const assertEditSuccessToast = () =>
    expect(page.getByText("Menu item updated successfully!")).toBeVisible({
      timeout: 10_000,
    });

  return {
    navigateToMenuTab,
    addCategoryButton,
    assertCategoryVisible,
    createCategory,
    addItemButton,
    createMenuItem,
    assertMenuItemSuccessToast,
    assertItemVisible,
    deleteCategory,
    assertCategoryDeleted,
    clickEditItem,
    editItemInWizard,
    assertEditSuccessToast,
  };
};

export type OwnerMenuPage = ReturnType<typeof createOwnerMenuPage>;
