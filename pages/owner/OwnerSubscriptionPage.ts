import { type Page, expect } from "@playwright/test";

export const createOwnerSubscriptionPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/subscription`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByText(/plan|subscription|billing/i).first().waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(page.getByText(/plan|subscription|billing/i).first()).toBeVisible({ timeout: 15_000 });

  const assertUpgradeOptionVisible = () =>
    expect(page.getByRole("button", { name: /upgrade|manage|change plan/i }).first()).toBeVisible({ timeout: 10_000 });

  return { goto, assertPageLoaded, assertUpgradeOptionVisible };
};
