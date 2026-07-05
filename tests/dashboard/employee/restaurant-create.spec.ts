import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerCreateRestaurantPage } from "../../../pages/dashboard/owner/OwnerCreateRestaurantPage";
import { apiLogin, deleteTestRestaurant } from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";

const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * Employee — Create restaurant (/restaurant/new).
 *
 * Gated by the CREATE_RESTAURANT permission — held by EMPLOYEE/ADMIN, NOT
 * OWNER (see TEST_PLAN.md role model). Same CreateStore.tsx component used
 * for a fresh owner's own sign-up-driven creation and an employee creating
 * on behalf of a client — differentiated by permission only, not a distinct
 * UI. Submitting Step 0 (Restaurant Info) immediately POSTs /restaurant/new
 * and the restaurant exists from that point on; Steps 1/2 (hours, menu) just
 * continue editing it. Cleaned up via the admin-token restaurant-delete
 * helper so repeated runs don't accumulate junk restaurants in QA.
 */
test.describe("Employee — Create restaurant", () => {
  test.skip(
    !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD,
    "EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Employee Restaurant Setup");
    await allure.label("severity", "critical");
  });

  test("TC-97: employee creates a restaurant on behalf of a client", async ({
    employeePage,
  }) => {
    await allure.description(
      "Employee fills the Restaurant Info step (name, address, cuisine, phone, description, prep " +
        "time) and submits — the restaurant is created immediately and the wizard advances to the " +
        "Business Hours step."
    );

    const createPage = createOwnerCreateRestaurantPage(employeePage);
    const restaurantName = `Automation Onboarding ${generateRunId()}`;
    let restaurantId = "";

    try {
      await allure.step("Navigate to Create Restaurant", async () => {
        await createPage.goto();
      });

      await allure.step("Fill Restaurant Info (Step 0)", async () => {
        await createPage.fillStep0({
          name: restaurantName,
          addressSearch: "350 5th Ave, New York",
          addressSuggestionText: "350 5th Ave, New York, NY, USA",
          cuisineType: "Italian",
          phone: "(555) 123-4567",
          description: "Created by Playwright automation",
        });
        await allure.parameter("Restaurant name", restaurantName);
      });

      await allure.step(
        "Submit and verify the wizard advances to Business Hours",
        async () => {
          restaurantId = await createPage.submitStep0();
          await createPage.assertBusinessHoursStepVisible();
          await allure.parameter("restaurantId", restaurantId);
          await expect(employeePage).toHaveURL(
            new RegExp(`restaurantId/${restaurantId}`)
          );
        }
      );
    } finally {
      if (restaurantId) {
        const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
        await deleteTestRestaurant(accessToken, restaurantId);
      }
    }
  });
});
