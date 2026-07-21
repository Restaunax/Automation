import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerCouponPage } from "../../../pages/dashboard/owner/OwnerCouponPage";
import { readSharedState, generateCouponCode } from "../../../utils/testData";
import {
  apiLogin,
  getRestaurantCoupons,
  createCouponRaw,
} from "../../../utils/apiHelper";

// MM/DD/YYYY for the DatePicker's sectioned keyboard input (see setStartDate/
// setEndDate in OwnerCouponPage).
const formatMMDDYYYY = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}${date.getFullYear()}`;

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Coupons", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Coupons");
    await allure.label("severity", "normal");
  });

  test("TC-30: owner can navigate to the Create Coupon form", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Expanding the Coupons accordion and clicking Create Coupon loads the coupon form."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step(
      "Expand Coupons section and click Create Coupon",
      async () => {
        await couponPage.navigateToCreateCoupon();
      }
    );

    await allure.step("Verify coupon form is visible", async () => {
      await couponPage.assertFormVisible();
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-31: owner can fill and submit a new coupon", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Filling the coupon code, discount value, start and end dates and clicking Create Coupon shows a success toast."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    const couponCode = generateCouponCode();

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Navigate to Create Coupon form", async () => {
      await couponPage.navigateToCreateCoupon();
    });

    await allure.step("Fill coupon details", async () => {
      // Start/end dates are left at the form's moment() defaults.
      await couponPage.fillCouponForm(couponCode, "10");
      await allure.parameter("Coupon code", couponCode);
    });

    await allure.step("Submit and verify success toast", async () => {
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Verify the coupon persisted server-side", async () => {
      // Not just the toast: the coupon must exist at the API source of truth.
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      const coupons = await getRestaurantCoupons(accessToken, restaurantId);
      expect(
        coupons.some((c) => c.code === couponCode),
        `coupon ${couponCode} should be in GET /api/coupons/restaurant/${restaurantId}`
      ).toBe(true);
    });
  });

  test("TC-63: an invalid discount percentage is rejected", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Submitting a coupon with a discount value outside 1-100 shows a validation error and does " +
        "not create the coupon."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Navigate to Create Coupon form", async () => {
      await couponPage.navigateToCreateCoupon();
    });

    await allure.step("Fill an out-of-range discount value", async () => {
      await couponPage.fillCouponForm(generateCouponCode(), "-10");
      await couponPage.discountValueInput().press("Tab");
    });

    await allure.step(
      "Submit and verify the validation error, no success toast",
      async () => {
        await couponPage.submit();
        await couponPage.assertInvalidDiscountError();
      }
    );
  });

  test("TC-91: owner can see a created coupon in the Manage Coupons list", async ({
    ownerPage,
  }) => {
    await allure.description(
      "After creating a coupon, it shows up as a row in the Manage Coupons list (a separate tab from " +
        "Create Coupon, never visited by prior tests)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await allure.step("Create a coupon", async () => {
      await mgmtPage.goto(restaurantId);
      await couponPage.navigateToCreateCoupon();
      await couponPage.fillCouponForm(couponCode, "10");
      await couponPage.submit();
      await couponPage.assertSuccessToast();
      await allure.parameter("Coupon code", couponCode);
    });

    await allure.step("Navigate to Manage Coupons", async () => {
      await couponPage.navigateToManageCoupons();
      await couponPage.assertManageCouponsLoaded();
    });

    await allure.step("Verify the coupon appears in the list", async () => {
      await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test("TC-145: owner can create a FIXED_AMOUNT coupon", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Selecting Fixed Amount as the discount type and a positive dollar value creates the coupon."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    await allure.step("Select Fixed Amount and fill the form", async () => {
      await couponPage.selectDiscountType("Fixed Amount ($)");
      await couponPage.fillCouponForm(couponCode, "5");
    });

    await allure.step("Submit and verify success", async () => {
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Verify the coupon persisted server-side", async () => {
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      const coupons = await getRestaurantCoupons(accessToken, restaurantId);
      expect(coupons.some((c) => c.code === couponCode)).toBe(true);
    });
  });

  test("TC-146: owner can create a FIXED_ITEM coupon", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Selecting Item Discount as the discount type requires and accepts a menu item selection."
    );

    const { restaurantId, menuItemName } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    await allure.step(
      "Select Item Discount, pick a menu item, fill the rest",
      async () => {
        await couponPage.selectDiscountType("Item Discount ($)");
        await couponPage.selectMenuItem(menuItemName);
        await couponPage.fillCouponForm(couponCode, "5");
      }
    );

    await allure.step("Submit and verify success", async () => {
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Verify the coupon persisted server-side", async () => {
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      const coupons = await getRestaurantCoupons(accessToken, restaurantId);
      expect(coupons.some((c) => c.code === couponCode)).toBe(true);
    });
  });

  test("TC-147: FIXED_ITEM without a menu item selection is rejected", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Submitting an Item Discount coupon without picking a menu item is blocked and no coupon is " +
        "created. Note: the app's own validateForm() has a menuItemId-required rule with a custom " +
        "message, but it never gets a chance to run here — MUI's Select renders a hidden " +
        "input[name=menuItemId][required] for native HTML5 form validation, and the browser's native " +
        "'Please fill out this field' constraint-validation UI intercepts the submit event before " +
        "React's onSubmit fires (confirmed live: no POST /api/coupons request is ever sent)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    let couponRequestFired = false;
    ownerPage.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/coupons")) {
        couponRequestFired = true;
      }
    });

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    await couponPage.selectDiscountType("Item Discount ($)");
    await couponPage.fillCouponForm(generateCouponCode(), "5");
    await couponPage.submit();

    await allure.step(
      "Verify the native required-field validation blocks submission",
      async () => {
        const isValueMissing = await couponPage
          .menuItemHiddenInput()
          .evaluate((el: HTMLInputElement) => el.validity.valueMissing);
        expect(isValueMissing).toBe(true);
        expect(couponRequestFired).toBe(false);
        await expect(couponPage.couponCodeInput()).toBeVisible();
      }
    );
  });

  test("TC-148: a non-positive FIXED_AMOUNT value is rejected", async ({
    ownerPage,
  }) => {
    await allure.description(
      "A Fixed Amount coupon submitted with a value of 0 shows 'Amount must be greater than 0' and " +
        "does not create the coupon (complements TC-63, which covers the PERCENTAGE-range path)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    await couponPage.selectDiscountType("Fixed Amount ($)");
    await couponPage.couponCodeInput().fill(generateCouponCode());
    await couponPage.discountValueInput().fill("0");
    await couponPage.discountValueInput().press("Tab");
    await couponPage.submit();

    await expect(couponPage.amountGreaterThanZeroError()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("TC-149: an end date before the start date is rejected", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Setting an End Date earlier than the Start Date shows 'End date must be after start date' " +
        "and does not create the coupon."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    await couponPage.fillCouponForm(generateCouponCode(), "10");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await couponPage.setEndDate(formatMMDDYYYY(yesterday));
    await couponPage.submit();

    await expect(couponPage.endDateAfterStartDateError()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("TC-150: an empty coupon code is rejected", async ({ ownerPage }) => {
    await allure.description(
      "Submitting the create-coupon form with no code is blocked and no coupon is created. Note: like " +
        "TC-147, the code TextField is a real required HTML input, so the browser's native constraint " +
        "validation intercepts the submit before React's own validateForm()/'Coupon code is required' " +
        "message ever gets a chance to run (confirmed live: no POST /api/coupons request is sent)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    let couponRequestFired = false;
    ownerPage.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/coupons")) {
        couponRequestFired = true;
      }
    });

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    await couponPage.discountValueInput().fill("10");
    await couponPage.submit();

    const isValueMissing = await couponPage
      .couponCodeInput()
      .evaluate((el: HTMLInputElement) => el.validity.valueMissing);
    expect(isValueMissing).toBe(true);
    expect(couponRequestFired).toBe(false);
  });

  test("TC-151: a duplicate coupon code on the same restaurant is rejected", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The create form has no client-side uniqueness check, so a second coupon with the same code " +
        "reaches the API and is rejected there (backend enforces per-restaurant code uniqueness)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await allure.step("Create the first coupon", async () => {
      await mgmtPage.goto(restaurantId);
      await couponPage.navigateToCreateCoupon();
      await couponPage.fillCouponForm(couponCode, "10");
      await couponPage.submit();
      await couponPage.assertSuccessToast();
      // The form auto-navigates back to the Manage Coupons dashboard ~1.5s
      // after a successful submit — wait for that to settle before driving
      // the sidebar again, otherwise the in-flight unmount races the next
      // navigateToCreateCoupon() click and can transiently match a second,
      // unrelated "Create Coupon" node (e.g. a fading tooltip).
      await couponPage.assertManageCouponsLoaded();
    });

    await allure.step(
      "Attempt to create a second coupon with the same code",
      async () => {
        await couponPage.navigateToCreateCoupon();
        await couponPage.fillCouponForm(couponCode, "15");
        await couponPage.submit();
        // No client-side uniqueness check exists, so this reaches the API and
        // comes back as a Snackbar error (same MUI Alert component/role as the
        // client-validation alert) rather than a success toast.
        await expect(couponPage.errorAlert()).toBeVisible({ timeout: 10_000 });
        await expect(couponPage.successToast()).not.toBeVisible();
      }
    );
  });

  test("TC-152: coupon code input truncates at 20 characters", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The coupon code field has maxLength=20 — typing a longer string is truncated at the input level."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    const longCode = "A".repeat(30);
    await couponPage.couponCodeInput().fill(longCode);

    await expect(couponPage.couponCodeInput()).toHaveValue("A".repeat(20));
  });

  test("TC-153: Manage Coupons search filters by code", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Typing a coupon's code into the search box narrows the table to matching rows."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await allure.step("Create a coupon to search for", async () => {
      await mgmtPage.goto(restaurantId);
      await couponPage.navigateToCreateCoupon();
      await couponPage.fillCouponForm(couponCode, "10");
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Search by its code", async () => {
      await couponPage.navigateToManageCoupons();
      await couponPage.search(couponCode);
      await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test("TC-154: Manage Coupons search filters by description", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Typing a substring of a coupon's description into the search box also matches that coupon."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();
    const description = `AutoDesc-${couponCode}`;

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();
    await couponPage.couponCodeInput().fill(couponCode);
    await couponPage.discountValueInput().fill("10");
    await couponPage.descriptionInput().fill(description);
    await couponPage.submit();
    await couponPage.assertSuccessToast();

    await couponPage.navigateToManageCoupons();
    await couponPage.search(description);
    await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("TC-155: Manage Coupons search with no matches shows the empty state", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Searching for a code that doesn't exist shows the 'No coupons found' empty state."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToManageCoupons();
    await couponPage.search(`NO-SUCH-COUPON-${generateCouponCode()}`);

    await expect(couponPage.emptyState()).toBeVisible({ timeout: 10_000 });
  });

  test("TC-156: Manage Coupons status filter narrows to Active", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Filtering by 'Active' hides an expired coupon (seeded with a past end date) from the list."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const expiredCode = generateCouponCode();

    await allure.step(
      "Seed a coupon whose end date is already in the past",
      async () => {
        const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
        const past = new Date();
        past.setDate(past.getDate() - 10);
        const evenEarlier = new Date(past);
        evenEarlier.setDate(evenEarlier.getDate() - 5);
        const res = await createCouponRaw(accessToken, restaurantId, {
          code: expiredCode,
          type: "PERCENTAGE",
          value: 10,
          startDate: evenEarlier.toISOString(),
          endDate: past.toISOString(),
        });
        expect(res.status, JSON.stringify(res.data)).toBe(201);
      }
    );

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToManageCoupons();

    await allure.step(
      "Verify it shows as Expired, then is hidden by the Active filter",
      async () => {
        await couponPage.search(expiredCode);
        await expect(couponPage.couponRowByCode(expiredCode)).toContainText(
          "Expired",
          { timeout: 10_000 }
        );
        await couponPage.selectStatusFilter("Active");
        await expect(couponPage.couponRowByCode(expiredCode)).not.toBeVisible();
      }
    );
  });

  test("TC-157: Manage Coupons table sorts by Code", async ({ ownerPage }) => {
    await allure.description(
      "Clicking the Code column header toggles the sort direction without erroring."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToManageCoupons();

    // Assert the header is present BEFORE the first click — navigateToManageCoupons
    // now waits for the table to load, but keep this so the click is never fired
    // at a not-yet-actionable header.
    await expect(couponPage.sortByCodeHeader()).toBeVisible();
    await couponPage.sortByCodeHeader().click();
    await expect(couponPage.sortByCodeHeader()).toBeVisible();
    await couponPage.sortByCodeHeader().click();
    await expect(couponPage.sortByCodeHeader()).toBeVisible();
  });

  test("TC-158: owner can copy a coupon code from the Manage Coupons list", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking the copy-code icon on a row copies the code to the clipboard and shows a confirmation toast."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    // navigator.clipboard.writeText requires an explicit grant in the test
    // browser context (Chromium rejects it otherwise with "Write permission
    // denied"), which would silently swallow the app's copy handler — the
    // component never reaches its .then() (and never shows the toast) since
    // the promise rejection has no .catch.
    await ownerPage
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();
    await couponPage.fillCouponForm(couponCode, "10");
    await couponPage.submit();
    await couponPage.assertSuccessToast();

    await couponPage.navigateToManageCoupons();
    await couponPage.search(couponCode);
    await couponPage.copyCodeButton(couponCode).click();

    await expect(couponPage.codeCopiedToast()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("TC-159: Duplicate pre-fills a new coupon form from an existing coupon", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The row action menu's Duplicate option opens the create form pre-filled with '<code>-COPY', " +
        "and submitting it creates a second, independent coupon."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await allure.step("Create the original coupon", async () => {
      await mgmtPage.goto(restaurantId);
      await couponPage.navigateToCreateCoupon();
      await couponPage.fillCouponForm(couponCode, "10");
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Duplicate it from the Manage Coupons list", async () => {
      await couponPage.navigateToManageCoupons();
      await couponPage.search(couponCode);
      // Wait for the filtered row before opening its ⋮ menu — matches the
      // settled pattern the passing search tests use; its absence is the flake.
      await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
        timeout: 10_000,
      });
      await couponPage.openRowActionMenu(couponCode);
      await couponPage.duplicateMenuItem().click();
      await expect(couponPage.couponCodeInput()).toHaveValue(
        `${couponCode}-COPY`
      );
    });

    await allure.step(
      "Submit the duplicate and verify both exist",
      async () => {
        await couponPage.submit();
        // Duplicate opens the form as a "template", so the success message
        // differs from a plain create ("...from template!").
        await couponPage.assertSuccessFromTemplateToast();
        const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
        const coupons = await getRestaurantCoupons(accessToken, restaurantId);
        expect(coupons.some((c) => c.code === couponCode)).toBe(true);
        expect(coupons.some((c) => c.code === `${couponCode}-COPY`)).toBe(true);
      }
    );
  });

  test("TC-160: owner can delete a coupon via the typed-confirmation dialog", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Delete opens a typed-word confirmation dialog; confirming removes the coupon from both the " +
        "table and the API."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await allure.step("Create a coupon to delete", async () => {
      await mgmtPage.goto(restaurantId);
      await couponPage.navigateToCreateCoupon();
      await couponPage.fillCouponForm(couponCode, "10");
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Open Delete and confirm", async () => {
      await couponPage.navigateToManageCoupons();
      await couponPage.search(couponCode);
      await couponPage.openRowActionMenu(couponCode);
      await couponPage.deleteMenuItem().click();
      await couponPage.assertDeleteDialogVisible();
      await couponPage.typeDeleteConfirmWord();
      await couponPage.confirmDeleteButton().click();
      await expect(couponPage.couponDeletedToast()).toBeVisible({
        timeout: 10_000,
      });
    });

    await allure.step(
      "Verify it's gone from the table and the API",
      async () => {
        await expect(couponPage.couponRowByCode(couponCode)).not.toBeVisible({
          timeout: 10_000,
        });
        const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
        const coupons = await getRestaurantCoupons(accessToken, restaurantId);
        expect(coupons.some((c) => c.code === couponCode)).toBe(false);
      }
    );
  });

  test("TC-161: cancelling the delete confirmation leaves the coupon untouched", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Opening Delete and clicking Cancel (without typing the confirm word) does not delete the coupon."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();
    await couponPage.fillCouponForm(couponCode, "10");
    await couponPage.submit();
    await couponPage.assertSuccessToast();

    await couponPage.navigateToManageCoupons();
    await couponPage.search(couponCode);
    await couponPage.openRowActionMenu(couponCode);
    await couponPage.deleteMenuItem().click();
    await couponPage.assertDeleteDialogVisible();
    await couponPage.cancelDeleteButton().click();

    await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("TC-162: Edit pre-fills the form with the coupon's existing values", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Opening Edit on a coupon loads its current code/value into the form (read-only check — does " +
        "not submit, since editing currently 500s server-side per TC-92)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();
    await couponPage.fillCouponForm(couponCode, "10");
    await couponPage.submit();
    await couponPage.assertSuccessToast();

    await couponPage.navigateToManageCoupons();
    await couponPage.search(couponCode);
    // Wait for the filtered row before opening its ⋮ menu (see TC-159) — matches
    // the settled pattern the passing search tests use; its absence is the flake.
    await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
      timeout: 10_000,
    });
    await couponPage.openRowActionMenu(couponCode);
    await couponPage.editMenuItem().click();

    await expect(couponPage.couponCodeInput()).toHaveValue(couponCode, {
      timeout: 10_000,
    });
    await expect(couponPage.discountValueInput()).toHaveValue("10");
  });

  test("TC-163: Send to Customers is disabled for an expired coupon", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The row action menu's Send to Customers item is disabled once a coupon's computed status is " +
        "Expired (only enabled while ACTIVE)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const expiredCode = generateCouponCode();

    await allure.step("Seed an already-expired coupon", async () => {
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      const past = new Date();
      past.setDate(past.getDate() - 10);
      const evenEarlier = new Date(past);
      evenEarlier.setDate(evenEarlier.getDate() - 5);
      const res = await createCouponRaw(accessToken, restaurantId, {
        code: expiredCode,
        type: "PERCENTAGE",
        value: 10,
        startDate: evenEarlier.toISOString(),
        endDate: past.toISOString(),
      });
      expect(res.status, JSON.stringify(res.data)).toBe(201);
    });

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToManageCoupons();
    await couponPage.search(expiredCode);
    await couponPage.openRowActionMenu(expiredCode);

    await expect(couponPage.sendToCustomersMenuItem()).toBeDisabled();
  });

  test("TC-164: Reset Form clears the create-coupon form back to defaults", async ({
    ownerPage,
  }) => {
    await allure.description(
      "After partially filling the create form, Reset Form clears the code and description fields."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon();

    await couponPage.couponCodeInput().fill(generateCouponCode());
    await couponPage.descriptionInput().fill("temporary description");
    await couponPage.resetFormButton().click();

    await expect(couponPage.couponCodeInput()).toHaveValue("");
    await expect(couponPage.descriptionInput()).toHaveValue("");
  });

  test("TC-92: owner can edit an existing coupon's discount value", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Editing a coupon's discount value and saving persists the new value. This previously 500'd " +
        "server-side because the form sent `value` as a string but Prisma's coupon.update() expects a " +
        "Float (RestauNax #481); the fix coerces numeric fields on both the form and the update " +
        "controller. Verifies the update toast appears and the new value is reflected server-side."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    // Seed the coupon via API (not the UI) so the edit isn't racing the churn of
    // a just-created coupon (success toast + list refetch settling).
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    const seed = await createCouponRaw(accessToken, restaurantId, {
      code: couponCode,
      type: "PERCENTAGE",
      value: 10,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
    expect(seed.status, JSON.stringify(seed.data)).toBe(201);

    await mgmtPage.goto(restaurantId);

    // The coupon edit form has a timing-sensitive init: its async
    // fetchCouponDetails occasionally loses a race with the form's own reset and
    // renders empty, and a late debounced search re-render can tear the inline
    // form down mid-submit (the submit button detaches, no PUT fires). Both are
    // product-side flakiness, not the #481 fix — so drive the whole open→edit→
    // save as one retried unit, re-navigating from the list each attempt until
    // it lands cleanly. Waiting for the filtered list (one row) before opening
    // Edit keeps the debounce from firing after the form is open.
    await expect(async () => {
      await couponPage.navigateToManageCoupons();
      await couponPage.search(couponCode);
      await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
        timeout: 10_000,
      });
      await expect(ownerPage.locator("tbody tr")).toHaveCount(1, {
        timeout: 10_000,
      });
      await couponPage.openRowActionMenu(couponCode);
      await couponPage.editMenuItem().click();
      // Form-loaded gate: the code field only pre-fills once fetchCouponDetails
      // has populated the form. If it rendered empty, this fails and toPass
      // retries the whole block from a fresh list.
      await expect(couponPage.couponCodeInput()).toHaveValue(couponCode, {
        timeout: 8_000,
      });
      await couponPage.discountValueInput().fill("25");
      await couponPage.submit();
      await couponPage.assertCouponUpdatedToast();
    }).toPass({ timeout: 70_000, intervals: [1_000, 2_000, 3_000, 5_000] });

    // Verify the new value persisted server-side. Codes are stored uppercased,
    // so match case-insensitively.
    const coupons = await getRestaurantCoupons(accessToken, restaurantId);
    const edited = coupons.find(
      (c) => c.code.toUpperCase() === couponCode.toUpperCase()
    );
    expect(
      edited,
      `coupon ${couponCode} not found in restaurant coupons`
    ).toBeTruthy();
    expect(edited?.value).toBe(25);
  });

  test("TC-209: owner can create a Free Delivery coupon (no discount value)", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Selecting the Free Delivery discount type hides the discount-value field (the fee waiver is computed at checkout), and the created coupon persists with type FREE_DELIVERY."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await allure.step("Open the Create Coupon form", async () => {
      await mgmtPage.goto(restaurantId);
      await couponPage.navigateToCreateCoupon();
    });

    await allure.step(
      "Pick Free Delivery — the value field disappears",
      async () => {
        await couponPage.couponCodeInput().fill(couponCode);
        await allure.parameter("Coupon code", couponCode);
        await couponPage.selectDiscountType("Free Delivery");
        await expect(couponPage.discountValueInput()).toBeHidden();
      }
    );

    await allure.step(
      "Free Delivery requires a minimum order + fee cap",
      async () => {
        // Guardrail: the fee waiver is self-funded, so both are mandatory.
        await couponPage.fillFreeDeliveryGuards("20", "6");
      }
    );

    await allure.step("Submit and verify success toast", async () => {
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Coupon persisted as FREE_DELIVERY (API)", async () => {
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      const coupons = await getRestaurantCoupons(accessToken, restaurantId);
      const created = coupons.find((c) => c.code === couponCode);
      expect(created, `coupon ${couponCode} missing from API`).toBeTruthy();
      expect(created?.type).toBe("FREE_DELIVERY");
    });
  });

  test("TC-216: a Free Delivery coupon requires a minimum order and a fee cap", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The minimum-order and fee-cap fields are enabled and required for a " +
        "Free Delivery coupon: submitting without them is blocked with field " +
        "errors, and once filled the coupon persists with both values (the " +
        "margin guardrail — the fee waiver is self-funded)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await allure.step("Open the form and pick Free Delivery", async () => {
      await mgmtPage.goto(restaurantId);
      await couponPage.navigateToCreateCoupon();
      await couponPage.couponCodeInput().fill(couponCode);
      await allure.parameter("Coupon code", couponCode);
      await couponPage.selectDiscountType("Free Delivery");
    });

    await allure.step(
      "Guardrail fields are enabled (the disabled-field regression)",
      async () => {
        await expect(couponPage.minOrderInput()).toBeEnabled();
        await expect(couponPage.feeCapInput()).toBeEnabled();
      }
    );

    await allure.step(
      "Submitting without them is blocked with field errors",
      async () => {
        await couponPage.submit();
        await expect(couponPage.errorAlert()).toContainText(
          "Please fix the errors before submitting"
        );
        await expect(couponPage.freeDeliveryMinOrderError()).toBeVisible();
        await expect(couponPage.freeDeliveryFeeCapError()).toBeVisible();
        // Still on the form — nothing was created.
        await expect(couponPage.couponCodeInput()).toBeVisible();
      }
    );

    await allure.step("Fill both guards and submit → success", async () => {
      await couponPage.fillFreeDeliveryGuards("20", "6");
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });

    await allure.step("Both values persisted (API)", async () => {
      const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
      const coupons = await getRestaurantCoupons(accessToken, restaurantId);
      const created = coupons.find((c) => c.code === couponCode);
      expect(created, `coupon ${couponCode} missing from API`).toBeTruthy();
      expect(created?.type).toBe("FREE_DELIVERY");
      expect(created?.minOrderAmount).toBe(20);
      expect(created?.maxDiscount).toBe(6);
    });
  });
});
