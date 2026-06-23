import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerCouponPage } from "../../../pages/dashboard/owner/OwnerCouponPage";
import { readSharedState } from "../../../utils/testData";

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

    const couponCode = `AUTO${Date.now().toString().slice(-6)}`;

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
      await couponPage.fillCouponForm(
        couponCode,
        "10",
        "2026-07-01",
        "2026-12-31"
      );
      await allure.parameter("Coupon code", couponCode);
    });

    await allure.step("Submit and verify success toast", async () => {
      await couponPage.submit();
      await couponPage.assertSuccessToast();
    });
  });
});
