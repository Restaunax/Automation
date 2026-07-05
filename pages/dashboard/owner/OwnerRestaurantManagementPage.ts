import { type Page, expect } from "@playwright/test";

export const createOwnerRestaurantManagementPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement`,
      { waitUntil: "domcontentloaded" }
    );
    await drawer().waitFor({ state: "visible", timeout: 20_000 });
  };

  const clickSidebarItem = (label: string) =>
    drawer().getByRole("button", { name: label, exact: true }).click();

  const assertPortalShellLoaded = () =>
    expect(drawer()).toBeVisible({ timeout: 15_000 });

  // ── Store Settings — Order Preparation Times ────────────────────────────
  // The only editable fields on this tab are two number inputs (delivery/
  // pickup standard prep time in minutes); a "Save changes" bar appears once
  // a field is dirty, and saving PUTs /api/restaurantId/:id/settings.
  const navigateToStoreSettings = async () => {
    await clickSidebarItem("Store Settings");
    await page
      .locator('input[type="number"]')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
  };

  const deliveryPrepTimeInput = () =>
    page.locator('input[type="number"]').first();

  const saveChangesButton = () =>
    page.locator("#root").getByRole("button", { name: "Save changes" });

  const setDeliveryPrepTime = async (minutes: string) => {
    await deliveryPrepTimeInput().fill(minutes);
    await deliveryPrepTimeInput().press("Tab");
  };

  const saveStoreSettings = async () => {
    const button = saveChangesButton();
    await button.waitFor({ state: "visible", timeout: 5_000 });
    // The success snackbar can overlap the button's hitbox as it animates in;
    // force bypasses that actionability check rather than fighting the timing.
    await button.click({ force: true });
  };

  const assertSettingsSavedToast = () =>
    expect(page.getByText("Settings saved successfully")).toBeVisible({
      timeout: 10_000,
    });

  return {
    goto,
    drawer,
    clickSidebarItem,
    assertPortalShellLoaded,
    navigateToStoreSettings,
    deliveryPrepTimeInput,
    saveChangesButton,
    setDeliveryPrepTime,
    saveStoreSettings,
    assertSettingsSavedToast,
  };
};
