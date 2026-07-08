import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerAnalyticsPage } from "../../../pages/dashboard/owner/OwnerAnalyticsPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Analytics Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Analytics");
    await allure.label("severity", "critical");
  });

  test("TC-35: owner can open the Analytics tab and see the dashboard header", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking Analytics in the portal sidebar loads the Restaurant Analytics dashboard: " +
        "title, refresh control, and the date-range selector are all present."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const analyticsPage = createOwnerAnalyticsPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Click Analytics in the sidebar", async () => {
      await analyticsPage.navigateToAnalyticsTab();
    });

    await allure.step("Verify the dashboard header loaded", async () => {
      await analyticsPage.assertLoaded();
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-127: the analytics dashboard resolves to data or an empty state without erroring", async ({
    ownerPage,
  }) => {
    await allure.description(
      "After the /api/analytics/dashboard fetch completes, the page shows either the summary cards " +
        "(when the range has orders) or the 'no data for this range' empty state — never a load error. " +
        "This asserts the fetch path works regardless of the current QA data volume."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const analyticsPage = createOwnerAnalyticsPage(ownerPage);

    await allure.step("Navigate to the Analytics tab", async () => {
      await mgmtPage.goto(restaurantId);
      await analyticsPage.navigateToAnalyticsTab();
    });

    await allure.step(
      "Verify the dashboard resolved (cards or empty state)",
      async () => {
        await analyticsPage.assertDashboardResolved();
      }
    );

    await allure.step("Verify no load-error alert is shown", async () => {
      await analyticsPage.assertNoError();
    });
  });

  test("TC-128: the date-range picker opens with quick-select presets", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking the date-range button opens the picker popover exposing the Quick Select presets " +
        "(Last 7 days / Last 30 days), so owners can change the reporting window."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const analyticsPage = createOwnerAnalyticsPage(ownerPage);

    await allure.step("Navigate to the Analytics tab", async () => {
      await mgmtPage.goto(restaurantId);
      await analyticsPage.navigateToAnalyticsTab();
      await analyticsPage.assertLoaded();
    });

    await allure.step("Open the date-range picker", async () => {
      await analyticsPage.openDateRangePicker();
    });

    await allure.step(
      "Verify the quick-select presets are visible",
      async () => {
        await expect(
          analyticsPage.quickSelectOption("Last 7 days")
        ).toBeVisible({ timeout: 10_000 });
        await expect(
          analyticsPage.quickSelectOption("Last 30 days")
        ).toBeVisible({ timeout: 10_000 });
      }
    );
  });

  test("TC-129: changing the range to Last 7 days reloads the dashboard", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Selecting the 'Last 7 days' preset and applying it re-fetches the dashboard for the new window: " +
        "the request fires, the picker closes, and the page resolves again with no load error."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const analyticsPage = createOwnerAnalyticsPage(ownerPage);

    await allure.step("Navigate to the Analytics tab", async () => {
      await mgmtPage.goto(restaurantId);
      await analyticsPage.navigateToAnalyticsTab();
      await analyticsPage.assertLoaded();
    });

    await allure.step(
      "Apply the 'Last 7 days' preset and wait for the dashboard fetch",
      async () => {
        await analyticsPage.openDateRangePicker();
        const responsePromise = ownerPage.waitForResponse(
          (r) =>
            /\/api\/analytics\/dashboard\//.test(r.url()) &&
            r.request().method() === "GET",
          { timeout: 20_000 }
        );
        await analyticsPage.applyQuickSelect("Last 7 days");
        const response = await responsePromise;
        expect(response.ok()).toBeTruthy();
      }
    );

    await allure.step(
      "Verify the dashboard resolved again without error",
      async () => {
        await analyticsPage.assertDashboardResolved();
        await analyticsPage.assertNoError();
      }
    );
  });
});
