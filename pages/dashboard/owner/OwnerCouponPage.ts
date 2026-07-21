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
    // The create-coupon form rendering IS the success signal — a separate
    // waitForURL before it added no correctness (the form can't appear
    // without the URL having changed) but did add a tight 10s budget that
    // flaked under concurrent-worker load; the form wait's own 15s timeout
    // already covers this navigation.
    await page
      .getByPlaceholder("SUMMER2025")
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const couponCodeInput = () => page.getByPlaceholder("SUMMER2025");
  // FormLabel does not emit a `for` attribute so getByLabel won't find this input;
  // target by name attribute instead (the only input[name="value"] in this form).
  const discountValueInput = () => page.locator('input[name="value"]');
  const descriptionInput = () => page.locator('input[name="description"]');
  // The sidebar "Create Coupon" nav button and the form submit button share the
  // same text — use type="submit" to target only the form button.
  const createCouponButton = () => page.locator('button[type="submit"]');
  const resetFormButton = () =>
    page.getByRole("button", { name: "Reset Form", exact: true });
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

  // Editing an existing coupon shows a distinct "updated" toast, not the
  // "created" one above (see TC-92).
  const couponUpdatedToast = () =>
    page.getByText("Coupon updated successfully!");
  const assertCouponUpdatedToast = () =>
    expect(couponUpdatedToast()).toBeVisible({ timeout: 10_000 });

  // Duplicate opens the create form pre-filled as a "template" (isFromTemplate),
  // so a successful submit shows a different message than a plain create.
  const successFromTemplateToast = () =>
    page.getByText("Coupon created successfully from template!");
  const assertSuccessFromTemplateToast = () =>
    expect(successFromTemplateToast()).toBeVisible({ timeout: 10_000 });

  const errorAlert = () => page.getByRole("alert");
  const fieldErrors = () => page.locator(".MuiFormHelperText-root");

  // ── Discount type / menu item Selects ────────────────────────────────────
  // MUI's Select generates id="mui-component-select-<name>" on its clickable
  // display element when given a `name` prop but no explicit `id`/`labelId`
  // (this form sets neither) — target by that convention rather than by label,
  // since FormLabel here has no `for` attribute either.
  const discountTypeSelect = () => page.locator("#mui-component-select-type");
  const menuItemSelect = () => page.locator("#mui-component-select-menuItemId");
  const statusSelect = () => page.locator("#mui-component-select-status");

  const chooseOption = async (
    selectLocator: ReturnType<typeof page.locator>,
    optionName: string | RegExp
  ) => {
    await selectLocator.click();
    await page.getByRole("option", { name: optionName }).first().click();
  };

  const selectDiscountType = (
    type:
      | "Percentage (%)"
      | "Fixed Amount ($)"
      | "Item Discount ($)"
      | "Free Delivery"
  ) => chooseOption(discountTypeSelect(), type);

  const selectMenuItem = (itemName: string) =>
    chooseOption(menuItemSelect(), new RegExp(itemName));

  const selectStatus = (status: "Active" | "Inactive") =>
    chooseOption(statusSelect(), status);

  // MUI Select's real <input name="menuItemId"> is a hidden sibling of the
  // display div — it's what carries native HTML5 `required` validity state
  // (see TC-147/TC-150: native validation intercepts submit before React's).
  const menuItemHiddenInput = () =>
    menuItemSelect().locator(
      'xpath=following-sibling::input[@name="menuItemId"]'
    );

  const menuItemRequiredError = () =>
    page.getByText("Menu item selection is required for item discounts");
  const amountGreaterThanZeroError = () =>
    page.getByText("Amount must be greater than 0");
  const endDateAfterStartDateError = () =>
    page.getByText("End date must be after start date");
  const codeRequiredError = () => page.getByText("Coupon code is required");

  // ── Validity Period date fields ──────────────────────────────────────────
  // MUI X DatePicker's visible widget is a sectioned input, not a plain text
  // box — clicking a hidden proxy input doesn't work; click the sections
  // container (scoped to the FormControl whose label contains labelText) and
  // type through the keyboard instead. Mirrors the pattern already used for
  // the demo-scheduling datetime field in AdminDemoManagementPage.
  const dateSectionsFor = (labelText: string) =>
    page
      .locator(".MuiFormControl-root")
      .filter({ has: page.getByText(labelText, { exact: false }) })
      .locator(".MuiPickersSectionList-root");

  const setDateField = async (labelText: string, mmddyyyy: string) => {
    await dateSectionsFor(labelText).click();
    await page.keyboard.type(mmddyyyy, { delay: 60 });
  };

  const setStartDate = (mmddyyyy: string) =>
    setDateField("Start Date", mmddyyyy);
  const setEndDate = (mmddyyyy: string) => setDateField("End Date", mmddyyyy);

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
    // Wait for the table to actually finish loading — a first data row OR the
    // empty-state — before returning. Without this, callers (TC-157's sort click,
    // TC-159/162's row actions) interact before the table renders and flake out.
    await page
      .locator("tbody tr")
      .or(emptyState())
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertManageCouponsLoaded = () =>
    expect(
      page.getByRole("heading", { name: "Coupon Management" })
    ).toBeVisible({ timeout: 10_000 });

  const couponRowByCode = (code: string) =>
    page.locator("tr", { hasText: code });

  const emptyState = () => page.getByText("No coupons found");

  // ── Manage Coupons — filters, sorting, pagination ────────────────────────
  const searchInput = () => page.locator("#coupon-search");
  const search = (text: string) => searchInput().fill(text);

  const statusFilterSelect = () => page.locator("#coupon-status-filter");
  const selectStatusFilter = (
    status: "All Statuses" | "Active" | "Inactive" | "Expired"
  ) => chooseOption(statusFilterSelect(), status);

  const sortByCodeHeader = () =>
    page.locator("thead").getByText("Code", { exact: true });
  const sortByValidUntilHeader = () =>
    page.locator("thead").getByText("Valid Until", { exact: true });

  const nextPageButton = () =>
    page.getByRole("button", { name: "Go to next page" });
  const rowsPerPageSelect = () =>
    page.locator('[aria-labelledby*="MuiTablePagination-selectLabel"]');

  const copyCodeButton = (code: string) =>
    couponRowByCode(code).locator("button").first();
  const codeCopiedToast = () =>
    page.getByText("Coupon code copied to clipboard");

  // ── Row actions (⋮ menu) ──────────────────────────────────────────────────
  // Actions is the last column; the ⋮ IconButton has no aria-label, but it's
  // the last button in the row (copy-code is the first, enrollment toggle is
  // a Switch not a button).
  const openRowActionMenu = (code: string) =>
    couponRowByCode(code).locator("button").last().click();

  const editMenuItem = () => page.getByRole("menuitem", { name: "Edit" });
  const sendToCustomersMenuItem = () =>
    page.getByRole("menuitem", { name: "Send to Customers" });
  const duplicateMenuItem = () =>
    page.getByRole("menuitem", { name: "Duplicate" });
  const deleteMenuItem = () => page.getByRole("menuitem", { name: "Delete" });

  // ── Delete confirmation dialog (typed-word confirm) ──────────────────────
  const deleteConfirmDialog = () => page.getByRole("dialog");
  const assertDeleteDialogVisible = () =>
    expect(deleteConfirmDialog().getByText("Confirm Delete")).toBeVisible({
      timeout: 10_000,
    });
  const typeDeleteConfirmWord = () =>
    deleteConfirmDialog().getByPlaceholder("DELETE").fill("DELETE");
  const confirmDeleteButton = () =>
    deleteConfirmDialog().getByRole("button", { name: "Delete", exact: true });
  const cancelDeleteButton = () =>
    deleteConfirmDialog().getByRole("button", { name: "Cancel", exact: true });
  const couponDeletedToast = () =>
    page.getByText("Coupon deleted successfully");

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
    descriptionInput,
    createCouponButton,
    resetFormButton,
    successToast,
    assertFormVisible,
    fillCouponForm,
    submit,
    assertSuccessToast,
    couponUpdatedToast,
    assertCouponUpdatedToast,
    successFromTemplateToast,
    assertSuccessFromTemplateToast,
    errorAlert,
    fieldErrors,
    assertInvalidDiscountError,
    discountTypeSelect,
    menuItemSelect,
    menuItemHiddenInput,
    statusSelect,
    selectDiscountType,
    selectMenuItem,
    selectStatus,
    menuItemRequiredError,
    amountGreaterThanZeroError,
    endDateAfterStartDateError,
    codeRequiredError,
    setStartDate,
    setEndDate,
    navigateToManageCoupons,
    assertManageCouponsLoaded,
    couponRowByCode,
    emptyState,
    searchInput,
    search,
    statusFilterSelect,
    selectStatusFilter,
    sortByCodeHeader,
    sortByValidUntilHeader,
    nextPageButton,
    rowsPerPageSelect,
    copyCodeButton,
    codeCopiedToast,
    openRowActionMenu,
    editMenuItem,
    sendToCustomersMenuItem,
    duplicateMenuItem,
    deleteMenuItem,
    deleteConfirmDialog,
    assertDeleteDialogVisible,
    typeDeleteConfirmWord,
    confirmDeleteButton,
    cancelDeleteButton,
    couponDeletedToast,
  };
};
