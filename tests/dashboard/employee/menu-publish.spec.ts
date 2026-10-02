import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createOwnerPublishPage } from "../../../pages/dashboard/owner/OwnerPublishPage";
import { readSharedState } from "../../../utils/testData";

const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";

/**
 * Employee — Publish menu (/restaurant/restaurantId/:id/publish).
 *
 * Route allows [ADMIN, EMPLOYEE] only — OWNER is denied (see TEST_PLAN.md role
 * model). This is a key OWNER-vs-EMPLOYEE difference worth a dedicated test.
 * The page is the same screen the (skipped) owner/05-publish.spec.ts checks —
 * reusing OwnerPublishPage here rather than forking a duplicate POM.
 *
 * The OWNER-is-denied-publish check lives in the access matrix
 * (tests/dashboard/access/role-restrictions.spec.ts), not here.
 */
test.describe("Employee — Publish menu", () => {
  test.skip(
    !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD,
    "EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Employee Publish");
    await allure.label("severity", "critical");
  });

  test("TC-143: employee can reach the publish page and see the Publish Restaurant button", async ({
    employeePage,
  }) => {
    await allure.description(
      "Unlike OWNER (Access Denied — see TC-27), EMPLOYEE holds the publish permission and can open the page."
    );

    const { restaurantId } = readSharedState();
    const publishPage = createOwnerPublishPage(employeePage);

    await allure.step("Navigate to the publish page", async () => {
      await publishPage.goto(restaurantId);
      await allure.parameter("restaurantId", restaurantId);
    });

    await allure.step(
      "Verify Publish Restaurant button is visible",
      async () => {
        await publishPage.assertPublishButtonVisible();
      }
    );
  });

  test("TC-144: employee sees the required checklist on the publish page", async ({
    employeePage,
  }) => {
    await allure.description(
      "The publish page lists the four items that must be complete before a restaurant can go live."
    );

    const { restaurantId } = readSharedState();
    const publishPage = createOwnerPublishPage(employeePage);

    await allure.step("Navigate to the publish page", async () => {
      await publishPage.goto(restaurantId);
    });

    for (const item of [
      "Hours of Operation",
      "Menu Setup",
      "Restaurant Information",
      "Payment Processing",
    ]) {
      await allure.step(
        `Verify checklist item "${item}" is visible`,
        async () => {
          await publishPage.assertChecklistItemVisible(item);
        }
      );
    }
  });
});
