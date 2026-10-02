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
    await deliveryPrepTimeInput().waitFor({
      state: "visible",
      timeout: 10_000,
    });
  };

  // Testid-first with legacy fallback (TEST_PLAN → "Locator strategy"):
  // #delivery-prep-time is a stable id in the frontend source
  // (OrderPreparationTab.tsx); the positional input[type=number] fallback
  // covers a QA deployment that predates it. Same node when both match.
  const deliveryPrepTimeInput = () =>
    page
      .locator("#delivery-prep-time")
      .or(page.locator('input[type="number"]').first())
      .first();

  const saveChangesButton = () =>
    page
      .getByTestId("unsaved-changes-save")
      .or(page.locator("#root").getByRole("button", { name: "Save changes" }))
      .first();

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
