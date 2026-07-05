import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerCouponPage } from "../../../pages/dashboard/owner/OwnerCouponPage";
import { readSharedState, generateRunId } from "../../../utils/testData";

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

    const couponCode = `AUTO${generateRunId()}`;

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
      await couponPage.fillCouponForm(`AUTO${generateRunId()}`, "-10");
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
    const couponCode = `AUTO${generateRunId()}`;

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

  // Editing ANY coupon currently 500s server-side: the frontend sends `value`
  // as a string, but Prisma's coupon.update() expects a Float
  // ("Argument `value`: Invalid value provided. Expected Float or
  // FloatFieldUpdateOperationsInput, provided String."). Confirmed live by
  // creating a coupon, opening its row's Edit action, changing the discount
  // value, and inspecting the PUT /api/coupons/:id response (500). Filed as
  // fixme rather than asserting the broken 500 as expected behavior — flip
  // back to a real test once the backend fix ships.
  test.fixme("TC-92: owner can edit an existing coupon's discount value", async () => {});
});
