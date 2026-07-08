import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerCustomersPage } from "../../../pages/dashboard/owner/OwnerCustomersPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Customers Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Customers");
    await allure.label("severity", "critical");
  });

  test("TC-136: owner can open the Customers tab and see the directory", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking Customers in the portal sidebar loads the customer directory: the sub-tabs " +
        "(All Customers / Customer Groups), the search field, and the Total Customers stat are all present."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const customersPage = createOwnerCustomersPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Click Customers in the sidebar", async () => {
      await customersPage.navigateToCustomersTab();
    });

    await allure.step("Verify the directory loaded", async () => {
      await customersPage.assertDirectoryLoaded();
      await customersPage.assertNoLoadError();
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-137: searching the customer directory re-queries the server", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Typing in the customer search fires GET /api/customers/restaurant/:id with the search term — " +
        "proving the directory filters against the backend rather than only client-side."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const customersPage = createOwnerCustomersPage(ownerPage);

    await allure.step("Navigate to the Customers tab", async () => {
      await mgmtPage.goto(restaurantId);
      await customersPage.navigateToCustomersTab();
      await customersPage.assertDirectoryLoaded();
    });

    await allure.step(
      "Type a search term and confirm the directory re-query fires",
      async () => {
        const responsePromise = ownerPage.waitForResponse(
          (r) =>
            /\/api\/customers\/restaurant\//.test(r.url()) &&
            /[?&]search=zzz-nonexistent/.test(r.url()) &&
            r.request().method() === "GET",
          { timeout: 20_000 }
        );
        await customersPage.searchCustomers("zzz-nonexistent-customer");
        const response = await responsePromise;
        expect(response.ok()).toBeTruthy();
      }
    );

    await allure.step(
      "Directory is still present after searching",
      async () => {
        await customersPage.assertNoLoadError();
      }
    );
  });

  test("TC-138: owner can switch to the Customer Groups (segments) sub-tab", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Selecting the 'Customer Groups' sub-tab renders the Customer Segments view with its segment " +
        "cards (e.g. VIP) from GET /api/customers/restaurant/:id/segments."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const customersPage = createOwnerCustomersPage(ownerPage);

    await allure.step("Navigate to the Customers tab", async () => {
      await mgmtPage.goto(restaurantId);
      await customersPage.navigateToCustomersTab();
      await customersPage.assertDirectoryLoaded();
    });

    await allure.step("Switch to the Customer Groups sub-tab", async () => {
      await customersPage.goToSubTab("Customer Groups");
    });

    await allure.step("Verify the segments view rendered", async () => {
      await customersPage.assertSegmentsLoaded();
    });
  });
});
