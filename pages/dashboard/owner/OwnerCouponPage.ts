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
  const fillCouponForm = async (code: string, discountValue: string) => {
    await couponCodeInput().fill(code);
    await discountValueInput().fill(discountValue);
  };

  const submit = () => createCouponButton().click();

  const assertSuccessToast = () =>
    expect(successToast()).toBeVisible({ timeout: 10_000 });

  const errorAlert = () => page.getByRole("alert");
  const fieldErrors = () => page.locator(".MuiFormHelperText-root");

  // ── Manage Coupons list ──────────────────────────────────────────────────
  const navigateToManageCoupons = async () => {
    await drawer()
      .getByRole("button", { name: "Coupons", exact: true })
      .click();
    const manageCouponsBtn = page.getByRole("button", {
      name: "Manage Coupons",
      exact: true,
    });
    await manageCouponsBtn.waitFor({ state: "visible", timeout: 5_000 });
    await manageCouponsBtn.click();
    await page.waitForURL(/tab=coupons/, { timeout: 10_000 });
    await page
      .getByRole("heading", { name: "Coupon Management" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertManageCouponsLoaded = () =>
    expect(
      page.getByRole("heading", { name: "Coupon Management" })
    ).toBeVisible({ timeout: 10_000 });

  const couponRowByCode = (code: string) =>
    page.locator("tr", { hasText: code });

  // Submitting an invalid discount value stays on the create form and shows
  // both a top-level alert and an inline percentage-range error.
  const assertInvalidDiscountError = async () => {
    await expect(errorAlert()).toContainText(
      "Please fix the errors before submitting"
    );
    await expect(fieldErrors().first()).toContainText(
      "Percentage must be between 1 and 100"
    );
    await expect(couponCodeInput()).toBeVisible();
  };

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
    errorAlert,
    fieldErrors,
    assertInvalidDiscountError,
    navigateToManageCoupons,
    assertManageCouponsLoaded,
    couponRowByCode,
  };
};
