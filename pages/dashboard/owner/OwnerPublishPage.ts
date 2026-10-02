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

  // Checklist state has no data-testid — confirmed live against QA DOM: each
  // row is `<Stack><Box><svg class="...MuiSvgIcon-color{Success,Error}"/></Box>
  // <Box>{title Stack}{description}</Box></Stack>`. The title's own MuiStack
  // wrapper is the row's 1st `div` ancestor; the outer row Stack (the one
  // carrying the icon) is its 3rd `div` ancestor. Class-based ancestor
  // filters that should be equivalent (`.//svg`, `and .//svg`) don't match in
  // this MUI build — verified empirically, not just assumed — so this pins
  // the exact ancestor depth instead.
  const checklistRow = (label: string) =>
    page.getByText(label, { exact: true }).locator("xpath=ancestor::div[3]");

  const assertItemComplete = (label: string) =>
    expect(checklistRow(label).locator(".MuiSvgIcon-colorSuccess")).toBeVisible(
      { timeout: 10_000 }
    );

  const assertItemIncomplete = (label: string) =>
    expect(checklistRow(label).locator(".MuiSvgIcon-colorError")).toBeVisible({
      timeout: 10_000,
    });

  const assertPublishButtonDisabled = () =>
    expect(publishButton()).toBeDisabled({ timeout: 10_000 });

  return {
    goto,
    publishButton,
    assertPublishButtonVisible,
    assertChecklistItemVisible,
    clickPublish,
    confirmPublish,
    assertPublishedToast,
    assertItemComplete,
    assertItemIncomplete,
    assertPublishButtonDisabled,
  };
};
