import { type Page, expect } from "@playwright/test";

export const createOwnerUberEatsPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/uber`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByText(/uber eats/i).first().waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(page.getByText(/uber eats/i).first()).toBeVisible({ timeout: 15_000 });

  const assertConnectOptionVisible = () =>
    expect(page.getByRole("button", { name: /connect|integrate|link/i }).first()).toBeVisible({ timeout: 10_000 });

  return { goto, assertPageLoaded, assertConnectOptionVisible };
};
