import { type Page, expect } from "@playwright/test";

export const createOwnerUberSettingsPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(`/restaurant/restaurantId/${restaurantId}/uber`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Uber Direct Delivery Settings" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(
      page.getByRole("heading", { name: "Uber Direct Delivery Settings" })
    ).toBeVisible({ timeout: 10_000 });

  const assertDeliveryConfigVisible = () =>
    expect(
      page.getByRole("heading", { name: "Delivery Configuration" })
    ).toBeVisible({ timeout: 10_000 });

  return { goto, assertPageLoaded, assertDeliveryConfigVisible };
};

export type OwnerUberSettingsPage = ReturnType<
  typeof createOwnerUberSettingsPage
>;
