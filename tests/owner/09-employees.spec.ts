import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../pages/owner/OwnerRestaurantManagementPage";
import { createOwnerEmployeesPage } from "../../pages/owner/OwnerEmployeesPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Employee Management", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Employees");
    await allure.label("severity", "normal");
  });

  test("TC-34: owner can navigate to Employee Management and see the Add Employee button", async ({ ownerPage }) => {
    await allure.description(
      "Clicking Employees in the portal sidebar loads the employee management area with an option to add staff."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage      = createOwnerRestaurantManagementPage(ownerPage);
    const employeesPage = createOwnerEmployeesPage(ownerPage);

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Click Employees in the sidebar", async () => {
      await employeesPage.navigateToEmployeesTab();
    });

    await allure.step("Verify employee management loaded — Add Employee button visible", async () => {
      await employeesPage.assertEmployeesTabLoaded();
      await allure.parameter("URL", ownerPage.url());
    });
  });
});
