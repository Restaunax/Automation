import { test } from "../../../fixtures/base";
import { readSharedState } from "../../../utils/testData";

/**
 * Owner — Store settings.
 *
 * SCAFFOLD placeholder. TODO: add a role-agnostic StoreSettingsPage POM under
 * pages/dashboard/restaurant/ (Store Settings is a shared screen).
 */
test.describe("Owner — Settings", () => {
  test.fixme("TC-XXX: owner edits store settings", async ({ ownerPage }) => {
    const { restaurantId } = readSharedState();
    await ownerPage.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Store%20Settings`,
      { waitUntil: "domcontentloaded" }
    );
    // TODO: edit a setting and assert it persists
  });
});
