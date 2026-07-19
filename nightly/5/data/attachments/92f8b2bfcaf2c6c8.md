# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/07-coupons.spec.ts >> Owner — Coupons >> TC-159: Duplicate pre-fills a new coupon form from an existing coupon
- Location: tests/dashboard/owner/07-coupons.spec.ts:619:7

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('button[type="submit"]')
    - locator resolved to <button tabindex="0" type="submit" class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary css-1gbawk9">Create from Template</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - performing click action
    - <html lang="en" data-mui-color-scheme="light">…</html> intercepts pointer events
  - retrying click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Test source

```ts
  1   | import { type Page, expect } from "@playwright/test";
  2   | 
  3   | export const createOwnerCouponPage = (page: Page) => {
  4   |   const drawer = () => page.locator(".MuiDrawer-paper").first();
  5   | 
  6   |   const navigateToCreateCoupon = async () => {
  7   |     // Expand the Coupons section in the sidebar (MUI Collapse accordion).
  8   |     await drawer()
  9   |       .getByRole("button", { name: "Coupons", exact: true })
  10  |       .click();
  11  |     // Wait for the Collapse animation to finish before clicking the sub-item.
  12  |     const createCouponBtn = page.getByRole("button", {
  13  |       name: "Create Coupon",
  14  |       exact: true,
  15  |     });
  16  |     await createCouponBtn.waitFor({ state: "visible", timeout: 5_000 });
  17  |     await createCouponBtn.click();
  18  |     // The create-coupon form rendering IS the success signal — a separate
  19  |     // waitForURL before it added no correctness (the form can't appear
  20  |     // without the URL having changed) but did add a tight 10s budget that
  21  |     // flaked under concurrent-worker load; the form wait's own 15s timeout
  22  |     // already covers this navigation.
  23  |     await page
  24  |       .getByPlaceholder("SUMMER2025")
  25  |       .waitFor({ state: "visible", timeout: 15_000 });
  26  |   };
  27  | 
  28  |   const couponCodeInput = () => page.getByPlaceholder("SUMMER2025");
  29  |   // FormLabel does not emit a `for` attribute so getByLabel won't find this input;
  30  |   // target by name attribute instead (the only input[name="value"] in this form).
  31  |   const discountValueInput = () => page.locator('input[name="value"]');
  32  |   const descriptionInput = () => page.locator('input[name="description"]');
  33  |   // The sidebar "Create Coupon" nav button and the form submit button share the
  34  |   // same text — use type="submit" to target only the form button.
  35  |   const createCouponButton = () => page.locator('button[type="submit"]');
  36  |   const resetFormButton = () =>
  37  |     page.getByRole("button", { name: "Reset Form", exact: true });
  38  |   const successToast = () => page.getByText("Coupon created successfully!");
  39  | 
  40  |   const assertFormVisible = () =>
  41  |     expect(couponCodeInput()).toBeVisible({ timeout: 10_000 });
  42  | 
  43  |   // Start Date and End Date come pre-filled with moment() defaults, so no
  44  |   // need to fill them — just fill code and discount value for TC-31.
  45  |   const fillCouponForm = async (code: string, discountValue: string) => {
  46  |     await couponCodeInput().fill(code);
  47  |     await discountValueInput().fill(discountValue);
  48  |   };
  49  | 
> 50  |   const submit = () => createCouponButton().click();
      |                                             ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  51  | 
  52  |   const assertSuccessToast = () =>
  53  |     expect(successToast()).toBeVisible({ timeout: 10_000 });
  54  | 
  55  |   // Duplicate opens the create form pre-filled as a "template" (isFromTemplate),
  56  |   // so a successful submit shows a different message than a plain create.
  57  |   const successFromTemplateToast = () =>
  58  |     page.getByText("Coupon created successfully from template!");
  59  |   const assertSuccessFromTemplateToast = () =>
  60  |     expect(successFromTemplateToast()).toBeVisible({ timeout: 10_000 });
  61  | 
  62  |   const errorAlert = () => page.getByRole("alert");
  63  |   const fieldErrors = () => page.locator(".MuiFormHelperText-root");
  64  | 
  65  |   // ── Discount type / menu item Selects ────────────────────────────────────
  66  |   // MUI's Select generates id="mui-component-select-<name>" on its clickable
  67  |   // display element when given a `name` prop but no explicit `id`/`labelId`
  68  |   // (this form sets neither) — target by that convention rather than by label,
  69  |   // since FormLabel here has no `for` attribute either.
  70  |   const discountTypeSelect = () => page.locator("#mui-component-select-type");
  71  |   const menuItemSelect = () => page.locator("#mui-component-select-menuItemId");
  72  |   const statusSelect = () => page.locator("#mui-component-select-status");
  73  | 
  74  |   const chooseOption = async (
  75  |     selectLocator: ReturnType<typeof page.locator>,
  76  |     optionName: string | RegExp
  77  |   ) => {
  78  |     await selectLocator.click();
  79  |     await page.getByRole("option", { name: optionName }).first().click();
  80  |   };
  81  | 
  82  |   const selectDiscountType = (
  83  |     type: "Percentage (%)" | "Fixed Amount ($)" | "Item Discount ($)"
  84  |   ) => chooseOption(discountTypeSelect(), type);
  85  | 
  86  |   const selectMenuItem = (itemName: string) =>
  87  |     chooseOption(menuItemSelect(), new RegExp(itemName));
  88  | 
  89  |   const selectStatus = (status: "Active" | "Inactive") =>
  90  |     chooseOption(statusSelect(), status);
  91  | 
  92  |   // MUI Select's real <input name="menuItemId"> is a hidden sibling of the
  93  |   // display div — it's what carries native HTML5 `required` validity state
  94  |   // (see TC-147/TC-150: native validation intercepts submit before React's).
  95  |   const menuItemHiddenInput = () =>
  96  |     menuItemSelect().locator(
  97  |       'xpath=following-sibling::input[@name="menuItemId"]'
  98  |     );
  99  | 
  100 |   const menuItemRequiredError = () =>
  101 |     page.getByText("Menu item selection is required for item discounts");
  102 |   const amountGreaterThanZeroError = () =>
  103 |     page.getByText("Amount must be greater than 0");
  104 |   const endDateAfterStartDateError = () =>
  105 |     page.getByText("End date must be after start date");
  106 |   const codeRequiredError = () => page.getByText("Coupon code is required");
  107 | 
  108 |   // ── Validity Period date fields ──────────────────────────────────────────
  109 |   // MUI X DatePicker's visible widget is a sectioned input, not a plain text
  110 |   // box — clicking a hidden proxy input doesn't work; click the sections
  111 |   // container (scoped to the FormControl whose label contains labelText) and
  112 |   // type through the keyboard instead. Mirrors the pattern already used for
  113 |   // the demo-scheduling datetime field in AdminDemoManagementPage.
  114 |   const dateSectionsFor = (labelText: string) =>
  115 |     page
  116 |       .locator(".MuiFormControl-root")
  117 |       .filter({ has: page.getByText(labelText, { exact: false }) })
  118 |       .locator(".MuiPickersSectionList-root");
  119 | 
  120 |   const setDateField = async (labelText: string, mmddyyyy: string) => {
  121 |     await dateSectionsFor(labelText).click();
  122 |     await page.keyboard.type(mmddyyyy, { delay: 60 });
  123 |   };
  124 | 
  125 |   const setStartDate = (mmddyyyy: string) =>
  126 |     setDateField("Start Date", mmddyyyy);
  127 |   const setEndDate = (mmddyyyy: string) => setDateField("End Date", mmddyyyy);
  128 | 
  129 |   // ── Manage Coupons list ──────────────────────────────────────────────────
  130 |   const navigateToManageCoupons = async () => {
  131 |     await drawer()
  132 |       .getByRole("button", { name: "Coupons", exact: true })
  133 |       .click();
  134 |     const manageCouponsBtn = page.getByRole("button", {
  135 |       name: "Manage Coupons",
  136 |       exact: true,
  137 |     });
  138 |     await manageCouponsBtn.waitFor({ state: "visible", timeout: 5_000 });
  139 |     await manageCouponsBtn.click();
  140 |     await page.waitForURL(/tab=coupons/, { timeout: 10_000 });
  141 |     await page
  142 |       .getByRole("heading", { name: "Coupon Management" })
  143 |       .waitFor({ state: "visible", timeout: 15_000 });
  144 |     // Wait for the table to actually finish loading — a first data row OR the
  145 |     // empty-state — before returning. Without this, callers (TC-157's sort click,
  146 |     // TC-159/162's row actions) interact before the table renders and flake out.
  147 |     await page
  148 |       .locator("tbody tr")
  149 |       .or(emptyState())
  150 |       .first()
```