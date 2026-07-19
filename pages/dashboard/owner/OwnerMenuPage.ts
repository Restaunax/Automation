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

    // Step 3 — Review. The current build auto-submits on entering Review
    // (same behavior as the edit wizard): the Save Item button stays disabled
    // and the wizard navigates back to the menu page, firing the success
    // toast. Wait for that; if a future build stops auto-submitting, fall
    // back to clicking Save Item once RHF validation enables it.
    const successToast = page.getByText("Menu item created successfully!");
    try {
      await successToast.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      const saveItemButton = page.getByRole("button", { name: "Save Item" });
      await expect(saveItemButton).toBeEnabled({ timeout: 10_000 });
      await saveItemButton.click();
    }
  };

  // Opens the Add Item wizard and stops at Step 0 (Basic Information) —
  // caller drives the fields/assertions from there.
  const openAddItemWizard = async (categoryName: string) => {
    await addItemButton(categoryName).click();
    await page
      .getByPlaceholder("Enter the menu item name")
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const nextButton = () => page.getByRole("button", { name: "Next" });

  const fieldErrors = () => page.locator(".MuiFormHelperText-root");

  const assertMenuItemSuccessToast = () =>
    expect(page.getByText("Menu item created successfully!")).toBeVisible({
      timeout: 10_000,
    });

  // After save, page navigates back to /restaurant/restaurantId/:id.
  // Item name appears as a card in the category section. Activate the category
  // tab first (non-active panels may be unmounted) — see activateCategory.
  // .first(): the name can render in more than one node inside the card.
  const assertItemVisible = (_categoryName: string, itemName: string) =>
    expect(page.getByText(itemName).first()).toBeVisible({ timeout: 15_000 });

  // Activate a category tab so its item cards are rendered in the DOM.
  const activateCategory = (categoryName: string) =>
    page.getByRole("tab", { name: categoryName, exact: true }).click();

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

  // Inverse of deleteCategory: a category that still HAS items must NOT be
  // deletable — the UI hides the "Delete" button until the category is emptied,
  // so the owner can't wipe out all its items in one click. Positive control
  // first (the item card is present in the scoped panel) so the zero-Delete
  // assertion can't false-pass on a mis-scoped or empty locator. Scoped with
  // .last() (innermost Paper carrying the heading = the tightest category panel)
  // to avoid matching a parent Paper that could hold another category's button.
  const assertCategoryNotDeletable = async (
    categoryName: string,
    itemName: string
  ) => {
    await activateCategory(categoryName);
    const categoryPanel = page
      .locator(".MuiPaper-root")
      .filter({
        has: page.getByRole("heading", { name: categoryName, exact: true }),
      })
      .last();
    await expect(categoryPanel.getByText(itemName).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      categoryPanel.getByRole("button", { name: "Delete", exact: true })
    ).toHaveCount(0);
  };

  // Find item card by name, click its Edit button.
  // Locator is testid-first with a legacy fallback (see TEST_PLAN → "Locator
  // strategy"): [data-testid=menu-item-edit] exists in frontend source but may
  // not be on the QA deployment yet; until it is, fall back to the positional
  // 2nd CardActions button (order: featured, edit, clone). Post-deploy both
  // branches resolve to the SAME node, so .or() stays strict-mode safe.
  // The response-wait for the wizard's item fetch (/menu/itemId/:id) is
  // registered BEFORE the click that triggers it — subscribing after
  // navigation races the fetch and times out when the response lands first.
  const clickEditItem = async (itemName: string) => {
    const card = page
      .getByTestId("menu-item-card")
      .filter({ hasText: itemName })
      .or(page.locator(".MuiCard-root").filter({ hasText: itemName }))
      .first();
    await card.waitFor({ state: "visible", timeout: 10_000 });
    const editButton = card
      .getByTestId("menu-item-edit")
      .or(card.locator(".MuiCardActions-root button").nth(1));
    await Promise.all([
      page.waitForResponse(
        (r) => /\/menu\/itemId\/[^/?]+/.test(r.url()) && r.status() === 200,
        { timeout: 20_000 }
      ),
      editButton.click(),
    ]);
  };

  // In the edit wizard, overwrite name and price in Step 0 then save.
  // The wizard's useEffect fetches item data from /menu/itemId/:id and calls
  // reset() with the API data (awaited in clickEditItem). Waiting for the name
  // input to hold a non-empty value confirms reset() has run, so our fills
  // can't be wiped by a late reset.
  //
  // Navigating to step 3 (Review) triggers an automatic form submission in the
  // current build; we rely on that auto-submit rather than clicking Save Item.
  const editItemInWizard = async (newName: string, newPrice: string) => {
    const nameInput = page.getByPlaceholder("Enter the menu item name");
    await nameInput.waitFor({ state: "visible", timeout: 15_000 });
    await expect(nameInput).not.toHaveValue("", { timeout: 15_000 });

    await nameInput.fill(newName);
    await nameInput.press("Tab");
    const priceInput = page.getByPlaceholder("Enter the base price");
    await priceInput.fill(newPrice);
    await priceInput.press("Tab");

    const nextBtn = page.getByRole("button", { name: "Next" });
    await nextBtn.click();
    await nextBtn.waitFor({ state: "visible", timeout: 10_000 });
    await nextBtn.click();
    await nextBtn.waitFor({ state: "visible", timeout: 10_000 });
    await nextBtn.click();
  };

  const assertEditSuccessToast = () =>
    expect(page.getByText("Menu item updated successfully!")).toBeVisible({
      timeout: 10_000,
    });

  // Wizard step-0 inputs, exposed for specs that assert blur-validation
  // behavior directly (e.g. required-field errors on empty blur).
  const itemNameInput = () => page.getByPlaceholder("Enter the menu item name");
  const basePriceInput = () => page.getByPlaceholder("Enter the base price");

  return {
    navigateToMenuTab,
    addCategoryButton,
    itemNameInput,
    basePriceInput,
    assertCategoryVisible,
    createCategory,
    addItemButton,
    openAddItemWizard,
    nextButton,
    fieldErrors,
    createMenuItem,
    assertMenuItemSuccessToast,
    assertItemVisible,
    activateCategory,
    deleteCategory,
    assertCategoryDeleted,
    assertCategoryNotDeletable,
    clickEditItem,
    editItemInWizard,
    assertEditSuccessToast,
  };
};

export type OwnerMenuPage = ReturnType<typeof createOwnerMenuPage>;
