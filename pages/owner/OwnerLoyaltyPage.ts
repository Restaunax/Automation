import { type Page, expect } from "@playwright/test";

export const createOwnerLoyaltyPage = (page: Page) => {
  const goto = async () => {
    await page.goto("/restaurant/loyalty", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /loyalty/i }).waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(page.getByRole("heading", { name: /loyalty/i })).toBeVisible({ timeout: 15_000 });

  const assertSetupOptionVisible = () =>
    expect(page.getByText(/points|rewards|program/i).first()).toBeVisible({ timeout: 10_000 });

  return { goto, assertPageLoaded, assertSetupOptionVisible };
};
