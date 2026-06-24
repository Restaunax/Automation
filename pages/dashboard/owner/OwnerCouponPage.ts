import { type Page, expect } from "@playwright/test";

export const createOwnerCouponPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToCreateCoupon = async () => {
    // Expand the Coupons section in the sidebar (MUI Collapse accordion).
    await drawer()
      .getByRole("button", { name: "Coupons", exact: true })
      .click();
    // Wait for the Collapse animation to finish before clicking the sub-item.
    const createCouponBtn = page.getByRole("button", {
      name: "Create Coupon",
      exact: true,
    });
    await createCouponBtn.waitFor({ state: "visible", timeout: 5_000 });
    await createCouponBtn.click();
    await page.waitForURL(/tab=create-coupon/, { timeout: 10_000 });
    await page
      .getByPlaceholder("SUMMER2025")
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const couponCodeInput = () => page.getByPlaceholder("SUMMER2025");
  // FormLabel does not emit a `for` attribute so getByLabel won't find this input;
  // target by name attribute instead (the only input[name="value"] in this form).
  const discountValueInput = () => page.locator('input[name="value"]');
  // The sidebar "Create Coupon" nav button and the form submit button share the
  // same text — use type="submit" to target only the form button.
  const createCouponButton = () => page.locator('button[type="submit"]');
  const successToast = () => page.getByText("Coupon created successfully!");

  const assertFormVisible = () =>
    expect(couponCodeInput()).toBeVisible({ timeout: 10_000 });

  // Start Date and End Date come pre-filled with moment() defaults, so no
  // need to fill them — just fill code and discount value for TC-31.
  const fillCouponForm = async (
    code: string,
    discountValue: string,
    _startDate: string,
    _endDate: string
  ) => {
    await couponCodeInput().fill(code);
    await discountValueInput().fill(discountValue);
  };

  const submit = () => createCouponButton().click();

  const assertSuccessToast = () =>
    expect(successToast()).toBeVisible({ timeout: 10_000 });

  return {
    navigateToCreateCoupon,
    couponCodeInput,
    discountValueInput,
    createCouponButton,
    successToast,
    assertFormVisible,
    fillCouponForm,
    submit,
    assertSuccessToast,
  };
};
