import { type Page, expect } from "@playwright/test";

export const createOwnerSubscriptionPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(`/restaurant/restaurantId/${restaurantId}/subscription`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Subscription Management" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(
      page.getByRole("heading", { name: "Subscription Management" })
    ).toBeVisible({ timeout: 10_000 });

  const assertPlanDetailsVisible = () =>
    expect(page.getByRole("heading", { name: "Plan Details" })).toBeVisible({
      timeout: 10_000,
    });

  return { goto, assertPageLoaded, assertPlanDetailsVisible };
};

export type OwnerSubscriptionPage = ReturnType<
  typeof createOwnerSubscriptionPage
>;
