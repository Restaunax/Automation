import { type Page, expect } from "@playwright/test";

/**
 * Dashboard — menu item DETAIL page (`MenuItemDisplay.tsx`), a full page at
 *   …/restaurant/restaurantId/:rid/groupId/:gid/itemId/:iid   (chain: /chain/:groupId/groupId/:gid/itemId/:iid)
 * reached by clicking an item card in the builder. Image overlay actions
 * (Upload / AI Generate / Remove Image / Enhance / Upload from Phone),
 * "Customization Options" (modifier groups with Min/Max + option chips), and
 * the bottom bar: Preview · Edit · Reorder modifiers · Delete
 * (`DELETE_MENU_ITEM`) · Permanently Delete (ADMIN).
 *
 * ROLE-AGNOSTIC. Selectors verified on QA 2026-08-16. Confirm dialogs are
 * ConfirmProvider dialogs named by their title. The reorder sheet is dnd-kit
 * with the keyboard sensor: focus "Drag to reorder <name>" → Space → Arrow → Space.
 */
export const createMenuItemDetailPage = (page: Page) => {
  const goto = (restaurantId: string, groupId: string, itemId: string) =>
    page.goto(
      `/restaurant/restaurantId/${restaurantId}/groupId/${groupId}/itemId/${itemId}`,
      { waitUntil: "domcontentloaded" }
    );

  const urlPattern = /\/groupId\/[^/]+\/itemId\/[^/]+$/;
  const title = (name: string) => page.getByRole("heading", { name, level: 1 });
  const price = (text: string) =>
    page.getByRole("heading", { name: text, level: 5 });
  const customizationHeading = () =>
    page.getByRole("heading", { name: "Customization Options" });
  const groupHeading = (name: string) =>
    page.getByRole("heading", { name, level: 6 });
  const minMaxText = (text: string) => page.getByText(text, { exact: true });
  const optionChip = (text: RegExp | string) => page.getByText(text).first();

  // Image overlay
  const uploadButton = () =>
    page.getByRole("button", { name: "Upload", exact: true });
  const removeImageButton = () =>
    page.getByRole("button", { name: "Remove Image" });
  const aiGenerateButton = () =>
    page.getByRole("button", { name: /^AI Generate/ });
  const enhanceButton = () => page.getByRole("button", { name: /^Enhance/ });
  const phoneUploadButton = () =>
    page.getByRole("button", { name: "Upload from Phone" });
  const itemImage = () =>
    page.locator("img[alt]").filter({ hasNot: page.locator("[src='']") });

  /**
   * "Upload" → (replace confirm "Yes, Replace" when an image exists) → the
   * AddItemPicture dialog (ImageUploader with a hidden file input) → "Save
   * changes" → POST /upload/menu/item/picture/:id. Resolves with the status.
   */
  const uploadImage = async (absPath: string) => {
    await uploadButton().click();
    const replace = page.getByRole("dialog", {
      name: /This will replace your current image/,
    });
    if (await replace.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await replace.getByRole("button", { name: "Yes, Replace" }).click();
    }
    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.locator('input[type="file"]') });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.locator('input[type="file"]').first().setInputFiles(absPath);
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/upload\/menu\/item\/picture\//.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 30_000 }
      ),
      dialog.getByRole("button", { name: "Save changes" }).click(),
    ]);
    return res.status();
  };

  const removeImage = async () => {
    await removeImageButton().click();
    const dialog = page.getByRole("dialog", {
      name: "This will remove the current image. Are you sure?",
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/upload\/menu\/item\/picture\//.test(r.url()) &&
          r.request().method() === "DELETE",
        { timeout: 30_000 }
      ),
      dialog.getByRole("button", { name: "Yes, Remove" }).click(),
    ]);
    return res.status();
  };

  // Bottom bar
  const previewButton = () =>
    page.getByRole("button", { name: "Preview", exact: true });
  const editButton = () =>
    page.getByRole("button", { name: "Edit", exact: true });
  const reorderButton = () =>
    page.getByRole("button", { name: "Reorder modifiers" });
  const deleteButton = () =>
    page.getByRole("button", { name: "Delete", exact: true });
  const permanentDeleteButton = () =>
    page.getByRole("button", { name: "Permanently Delete" });

  const deleteDialog = (itemName: string) =>
    page.getByRole("dialog", {
      name: `Are you sure you want to delete ${itemName}`,
    });
  const blockedDialog = () =>
    page.getByRole("dialog", { name: "Cannot Delete This Item" });
  const inactiveBanner = () =>
    page.getByText(
      "This item is no longer available. All actions are disabled."
    );

  /** Delete → confirm; resolves with the DELETE status (200 soft-delete, 409 blocked). */
  const deleteItem = async (itemName: string) => {
    await deleteButton().click();
    const dialog = deleteDialog(itemName);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/menu\/menuItemId\/[^/]+$/.test(r.url()) &&
          r.request().method() === "DELETE",
        { timeout: 30_000 }
      ),
      dialog.getByRole("button", { name: "Delete" }).click(),
    ]);
    return res.status();
  };

  // Reorder sheet
  const reorderSheet = () =>
    page.getByRole("dialog").filter({ hasText: "Reorder modifiers" });
  const dragHandle = (name: string) =>
    reorderSheet().getByRole("button", { name: `Drag to reorder ${name}` });
  const saveOrderButton = () =>
    reorderSheet().getByRole("button", { name: "Save order" });
  /** Keyboard drag: move `name` down/up by `steps` positions. */
  const keyboardMove = async (
    name: string,
    direction: "down" | "up",
    steps = 1
  ) => {
    await dragHandle(name).focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press(direction === "down" ? "ArrowDown" : "ArrowUp");
      await page.waitForTimeout(250);
    }
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
  };
  const saveOrder = async () => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/modifier-order/.test(r.url()) &&
          r.request().method() === "PUT",
        { timeout: 30_000 }
      ),
      saveOrderButton().click(),
    ]);
    return res.status();
  };
  const orderSavedToast = () => page.getByText("Modifier order saved");

  return {
    goto,
    urlPattern,
    title,
    price,
    customizationHeading,
    groupHeading,
    minMaxText,
    optionChip,
    uploadButton,
    removeImageButton,
    aiGenerateButton,
    enhanceButton,
    phoneUploadButton,
    itemImage,
    uploadImage,
    removeImage,
    previewButton,
    editButton,
    reorderButton,
    deleteButton,
    permanentDeleteButton,
    deleteDialog,
    blockedDialog,
    inactiveBanner,
    deleteItem,
    reorderSheet,
    dragHandle,
    saveOrderButton,
    keyboardMove,
    saveOrder,
    orderSavedToast,
  };
};

export type MenuItemDetailPage = ReturnType<typeof createMenuItemDetailPage>;
