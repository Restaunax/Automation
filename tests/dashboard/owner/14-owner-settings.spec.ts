import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerSettingsPage } from "../../../pages/dashboard/owner/OwnerSettingsPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Owner Settings Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Settings");
    await allure.label("severity", "normal");
  });

  test("TC-139: owner can open Owner Settings and see the Automated Reports form", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking Owner Settings in the sidebar loads the settings view: the title, both sub-tabs " +
        "(Automated Reports / Notifications), and — once the settings fetch resolves — the Automated " +
        "Business Reports section, its Schedule, and the Save Settings button. Read-only: no toggle is " +
        "flipped and nothing is saved, so the shared QA owner account's real report config is untouched."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const settingsPage = createOwnerSettingsPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Click Owner Settings in the sidebar", async () => {
      await settingsPage.navigateToOwnerSettingsTab();
    });

    await allure.step(
      "Verify the settings view + sub-tabs loaded",
      async () => {
        await settingsPage.assertLoaded();
        await allure.parameter("URL", ownerPage.url());
      }
    );

    await allure.step(
      "Verify the Automated Reports form rendered (read-only)",
      async () => {
        await settingsPage.assertReportsSettingsRendered();
      }
    );
  });

  test("TC-140: the Notifications sub-tab shows the coming-soon placeholder", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Selecting the Notifications sub-tab shows the 'launching soon' placeholder — documenting that " +
        "this surface is not yet functional, so no test should assert real notification settings there."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const settingsPage = createOwnerSettingsPage(ownerPage);

    await allure.step("Navigate to the Owner Settings tab", async () => {
      await mgmtPage.goto(restaurantId);
      await settingsPage.navigateToOwnerSettingsTab();
      await settingsPage.assertLoaded();
    });

    await allure.step("Switch to the Notifications sub-tab", async () => {
      await settingsPage.goToSubTab("Notifications");
    });

    await allure.step(
      "Verify the coming-soon placeholder is shown",
      async () => {
        await settingsPage.assertNotificationsComingSoon();
      }
    );
  });
});
