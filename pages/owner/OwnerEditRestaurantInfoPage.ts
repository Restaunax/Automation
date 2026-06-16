import { type Page, expect } from "@playwright/test";

export const createOwnerEditRestaurantInfoPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToRestaurantInfo = async () => {
    // Store Settings is an accordion in the sidebar — expand it first
    const storeSettingsAccordion = drawer().getByRole("button", { name: /store settings/i }).first();
    await storeSettingsAccordion.click();
    await drawer().getByRole("button", { name: /restaurant info|general/i }).first().click();
    await page.waitForURL(/tab=Store|tab=restaurant-info|tab=general/i, { timeout: 10_000 });
    await page.getByLabel(/restaurant name/i).waitFor({ state: "visible", timeout: 15_000 });
  };

  const restaurantNameInput = () => page.getByLabel(/restaurant name/i);
  const phoneInput = () => page.getByLabel(/phone/i).first();
  const descriptionInput = () => page.getByLabel(/description|bio/i).first();
  const saveButton = () => page.getByRole("button", { name: /save|update/i }).first();
  const successToast = () => page.getByText(/saved|updated successfully/i).first();

  const assertFormVisible = async () => {
    await expect(restaurantNameInput()).toBeVisible({ timeout: 10_000 });
  };

  const editPhoneNumber = async (phone: string) => {
    await phoneInput().clear();
    await phoneInput().fill(phone);
  };

  const save = () => saveButton().click();

  const assertSuccessToast = () =>
    expect(successToast()).toBeVisible({ timeout: 10_000 });

  return {
    navigateToRestaurantInfo,
    restaurantNameInput,
    phoneInput,
    descriptionInput,
    saveButton,
    successToast,
    assertFormVisible,
    editPhoneNumber,
    save,
    assertSuccessToast,
  };
};
