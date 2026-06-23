import { type Page, expect } from "@playwright/test";

export const createOwnerPublishPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(`/restaurant/restaurantId/${restaurantId}/publish`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: /publish/i })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const publishButton = () =>
    page.getByRole("button", { name: "Publish Restaurant" });

  const assertPublishButtonVisible = () =>
    expect(publishButton()).toBeVisible({ timeout: 10_000 });

  const assertChecklistItemVisible = (label: string) =>
    expect(page.getByText(label, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

  const clickPublish = () => publishButton().click();

  const confirmPublish = async () => {
    await page.getByRole("button", { name: "Yes, Publish" }).click();
  };

  const assertPublishedToast = () =>
    expect(page.getByText("Published!")).toBeVisible({ timeout: 10_000 });

  return {
    goto,
    publishButton,
    assertPublishButtonVisible,
    assertChecklistItemVisible,
    clickPublish,
    confirmPublish,
    assertPublishedToast,
  };
};
