import { type Page, expect } from "@playwright/test";

export const createOwnerDealsPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToDealsTab = async () => {
    await drawer().getByRole("button", { name: /deals/i }).first().click();
    await page.waitForURL(/tab=Deals|tab=deals/i, { timeout: 10_000 });
    await page.getByRole("button", { name: /create deal|add deal/i }).waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertDealsTabLoaded = () =>
    expect(page.getByRole("button", { name: /create deal|add deal/i })).toBeVisible({ timeout: 15_000 });

  const createDealButton = () =>
    page.getByRole("button", { name: /create deal|add deal/i });

  return { navigateToDealsTab, assertDealsTabLoaded, createDealButton };
};
