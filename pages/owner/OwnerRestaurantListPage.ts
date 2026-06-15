import { type Page, expect } from "@playwright/test";

export const createOwnerRestaurantListPage = (page: Page) => {
  const goto = async () => {
    await page.goto("/restaurant/stores", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "My Restaurants" }).waitFor({ state: "visible", timeout: 15_000 });
  };

  const restaurantCard = (name: string) =>
    page.locator(".MuiCard-root").filter({ hasText: name });

  const assertHeadingVisible = () =>
    expect(page.getByRole("heading", { name: "My Restaurants" })).toBeVisible({ timeout: 10_000 });

  const assertCardVisible = (name: string) =>
    expect(restaurantCard(name)).toBeVisible({ timeout: 10_000 });

  return { goto, restaurantCard, assertHeadingVisible, assertCardVisible };
};
