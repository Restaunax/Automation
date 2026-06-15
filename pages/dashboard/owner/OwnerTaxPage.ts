import { type Page, expect } from "@playwright/test";

export const createOwnerTaxPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/tax`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByPlaceholder("e.g., 7.5").waitFor({ state: "visible", timeout: 15_000 });
  };

  const taxRateInput = () => page.getByPlaceholder("e.g., 7.5");
  const saveButton = () => page.getByRole("button", { name: "Save Tax Settings" });
  const successToast = () => page.getByText("Tax settings updated successfully!");

  const setTaxRate = async (rate: string) => {
    await taxRateInput().clear();
    await taxRateInput().fill(rate);
  };

  const assertFormVisible = () => expect(taxRateInput()).toBeVisible({ timeout: 10_000 });
  const save = () => saveButton().click();
  const assertSuccessToast = () => expect(successToast()).toBeVisible({ timeout: 10_000 });

  return { goto, taxRateInput, saveButton, successToast, setTaxRate, assertFormVisible, save, assertSuccessToast };
};
