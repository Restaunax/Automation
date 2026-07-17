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
 * Business Hours (CreateStore Step 1, HoursOfOperation.tsx). Zero prior
 * coverage anywhere in the suite (see TEST_COVERAGE.md's onboarding gap
 * writeup) despite being a required, always-visited step for every new
 * restaurant. Each restaurant here is fresh via the Employee create-restaurant
 * path (fastest route to a Step-1-ready restaurant) and cleaned up via the
 * admin-token delete helper, same pattern as restaurant-create.spec.ts.
 */
test.describe("Employee — Business Hours", () => {
  test.skip(
    !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD,
    "EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Onboarding — Business Hours");
    await allure.label("severity", "normal");
  });

  test("TC-183: every day defaults to Closed, and Open/24 Hours toggle the time pickers correctly", async ({
    employeePage,
  }) => {
    await allure.description(
      "A freshly created restaurant's Business Hours step defaults every day to Closed. Selecting " +
        "Open auto-fills default 09:00-17:00 hours and shows the time pickers; selecting 24 Hours " +
        "hides them (fixed 00:00-23:59, no picker needed); switching back to Closed hides them too."
    );

    const createPage = createOwnerCreateRestaurantPage(employeePage);
    const restaurantName = `Automation Hours ${generateRunId()}`;
    let restaurantId = "";

    try {
      await allure.step("Create a restaurant and reach Step 1", async () => {
        await createPage.goto();
        await createPage.fillStep0({
          name: restaurantName,
          addressSearch: "350 5th Ave, New York",
          addressSuggestionText: "350 5th Ave, New York, NY, USA",
          cuisineType: "Italian",
          phone: "(555) 123-4567",
          description: "Created by the hours-of-operation automation test",
        });
        restaurantId = await createPage.submitStep0();
        await createPage.assertBusinessHoursStepVisible();
      });

      await allure.step("Monday defaults to Closed", async () => {
        await expect(createPage.dayRadio("monday", "Closed")).toBeChecked();
        await expect(createPage.dayTimeSelectors("monday")).toHaveCount(0);
      });

      await allure.step(
        "Selecting Open reveals the opening/closing time pickers",
        async () => {
          await createPage.setDayOpen("monday");
          const timeInputs = createPage.dayTimeSelectors("monday");
          await expect(timeInputs).toHaveCount(2);
          // Default 09:00-17:00 (BusinessHoursEditor.tsx) renders across the
          // sectioned MUI time picker's separate hour/minute/meridiem spans —
          // check the row's combined text rather than a single input value.
          await expect(createPage.dayRow("monday")).toContainText(/09.*00.*AM/);
          await expect(createPage.dayRow("monday")).toContainText(/05.*00.*PM/);
        }
      );

      await allure.step(
        "Selecting 24 Hours hides the time pickers",
        async () => {
          await createPage.setDay24Hours("monday");
          await expect(createPage.dayTimeSelectors("monday")).toHaveCount(0);
        }
      );

      await allure.step(
        "Switching back to Closed also hides the time pickers",
        async () => {
          await createPage.setDayClosed("monday");
          await expect(createPage.dayTimeSelectors("monday")).toHaveCount(0);
          await expect(createPage.dayRadio("monday", "Closed")).toBeChecked();
        }
      );

      await allure.step(
        "Submitting with at least one day open advances to the Menu step",
        async () => {
          await createPage.setDayOpen("monday");
          await createPage.submitHours();
          await createPage.assertMenuStepVisible();
        }
      );
    } finally {
      if (restaurantId && ADMIN_EMAIL && ADMIN_PASSWORD) {
        try {
          const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
          await deleteTestRestaurant(accessToken, restaurantId);
        } catch (err) {
          console.warn(
            `[hours-of-operation] Failed to delete test restaurant ${restaurantId} — clean it up manually:`,
            err
          );
        }
      } else if (restaurantId) {
        console.warn(
          `[hours-of-operation] ADMIN_EMAIL/PASSWORD not set — restaurant ${restaurantId} left behind in QA`
        );
      }
    }
  });
});
