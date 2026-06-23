import { type Page, expect } from "@playwright/test";

export const createOwnerCouponPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToCreateCoupon = async () => {
    // Coupons is an accordion section in the sidebar — expand it first
    const couponsAccordion = drawer()
      .getByRole("button", { name: /coupons/i })
      .first();
    await couponsAccordion.click();
    await drawer()
      .getByRole("button", { name: "Create Coupon", exact: true })
      .click();
    await page.waitForURL(/tab=create-coupon/, { timeout: 10_000 });
    await page
      .getByPlaceholder("SUMMER2025")
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const couponCodeInput = () => page.getByPlaceholder("SUMMER2025");
  const discountValueInput = () => page.getByLabel("Discount Value");
  const startDateInput = () => page.getByLabel("Start Date");
  const endDateInput = () => page.getByLabel("End Date");
  const createCouponButton = () =>
    page.getByRole("button", { name: "Create Coupon" });
  const successToast = () => page.getByText("Coupon created successfully!");

  const assertFormVisible = () =>
    expect(couponCodeInput()).toBeVisible({ timeout: 10_000 });

  const fillCouponForm = async (
    code: string,
    discountValue: string,
    startDate: string,
    endDate: string
  ) => {
    await couponCodeInput().fill(code);
    await discountValueInput().fill(discountValue);
    // DateSelector may render as a text input — fill with ISO date string
    await startDateInput().fill(startDate);
    await endDateInput().fill(endDate);
  };

  const submit = () => createCouponButton().click();

  const assertSuccessToast = () =>
    expect(successToast()).toBeVisible({ timeout: 10_000 });

  return {
    navigateToCreateCoupon,
    couponCodeInput,
    discountValueInput,
    startDateInput,
    endDateInput,
    createCouponButton,
    successToast,
    assertFormVisible,
    fillCouponForm,
    submit,
    assertSuccessToast,
  };
};
