import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminRestaurantsPage } from "../../../pages/dashboard/admin/AdminRestaurantsPage";
import { readSharedState } from "../../../utils/testData";
import { requireRelease } from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Admin — Restaurant Management", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Admin Restaurants");
    await allure.label("severity", "critical");
  });

  test("TC-32: admin can navigate to the Restaurants tab and see the list @smoke", async ({
    adminPage,
  }) => {
    await allure.description(
      "The admin Restaurants tab loads a table of restaurants, and searching finds the seed restaurant's row."
    );

    const { restaurantName } = readSharedState();
    const restaurantsPage = createAdminRestaurantsPage(adminPage);

    await allure.step("Navigate to admin restaurants tab", async () => {
      await restaurantsPage.goto();
    });

    await allure.step("Verify page heading is visible", async () => {
      await restaurantsPage.assertPageLoaded();
      await allure.parameter("URL", adminPage.url());
    });

    await allure.step("Verify the table lists restaurants", async () => {
      await expect(restaurantsPage.anyRow()).toBeVisible({ timeout: 15_000 });
    });

    // The list is server-paginated and sorted newest-first (QA holds 100+
    // restaurants, plus automation's per-run ones), so the long-lived seed
    // restaurant is not on page 1 — find it the way an admin does: search.
    await allure.step(
      `Search finds seed restaurant "${restaurantName}"`,
      async () => {
        await restaurantsPage.searchInput().fill(restaurantName.trim());
        await restaurantsPage.assertRestaurantRowVisible(restaurantName);
        await allure.parameter("restaurantName", restaurantName);
      }
    );
  });

  test("TC-930: Manage Ownership → Invite User says the invitation expires in 48 hours @bugfix-1036 @invite", async ({
    adminPage,
  }) => {
    await allure.description(
      "RestauNax #1036: the owner invitation link lives 48 hours (INVITATION_EXPIRY_HOURS), and the " +
        "dialog's 'What happens next?' now says so — it used to promise 7 days. Read-only: the dialog is " +
        "opened and closed without sending."
    );
    const { restaurantName } = readSharedState();
    const restaurantsPage = createAdminRestaurantsPage(adminPage);
    await restaurantsPage.goto();
    // The seed name carries a trailing space; the search box doesn't.
    await restaurantsPage.openRowActionMenu(restaurantName.trim());
    await adminPage
      .getByRole("menuitem", { name: "Manage Ownership", exact: true })
      .click();
    const dialog = adminPage.getByRole("dialog").filter({
      hasText: "Manage Ownership",
    });
    await dialog.getByRole("tab", { name: "Invite User", exact: true }).click();
    await expect(dialog.getByText("What happens next?")).toBeVisible();

    const notice = dialog.getByText(
      /The invitation expires in .+ if not claimed/
    );
    await expect(notice).toBeVisible();
    requireRelease(
      "bugBatch",
      !(await notice.innerText()).includes("7 days"),
      "the invite dialog still says 7 days"
    );
    await expect(notice).toContainText(
      "The invitation expires in 48 hours if not claimed"
    );
  });
});
