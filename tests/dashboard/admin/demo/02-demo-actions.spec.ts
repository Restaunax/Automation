import * as allure from "allure-js-commons";
import { test, expect } from "../../../../fixtures/base";
import { createAdminDemoManagementPage } from "../../../../pages/dashboard/admin/AdminDemoManagementPage";
import { readSharedState } from "../../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Admin — Demo Request Actions", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  test.beforeEach(async ({ adminPage }) => {
    await allure.label("feature", "Demo Request Flow");
    await allure.label("severity", "critical");

    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);
    await demoPage.goto();
    await demoPage.searchByEmail(email);
    await demoPage.assertRowExists(email);
  });

  test("TC-05: admin can open the action menu on a demo row", async ({
    adminPage,
  }) => {
    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);

    for (const label of [
      "View/Edit Details",
      "Assign Request",
      "Schedule Demo",
      "Send Follow-up Email",
      "Proceed to Onboarding",
      "Delete demo",
    ]) {
      await expect(
        adminPage.locator('[role="menu"]').getByText(label, { exact: true })
      ).toBeVisible();
    }

    await adminPage.keyboard.press("Escape");
  });

  test("TC-06: admin can change demo status via inline dropdown", async ({
    adminPage,
  }) => {
    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.changeStatusInline(email, "Contacted");

    await expect(
      demoPage.findRowByEmail(email).locator('[role="combobox"] .MuiChip-label')
    ).toContainText("Contacted", { timeout: 10_000 });

    // Reset status so TC-04 (which asserts "NEW") is not affected on re-runs.
    await demoPage.changeStatusInline(email, "New");
  });

  test("TC-07: admin can open View/Edit Details side sheet", async ({
    adminPage,
  }) => {
    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("View/Edit Details");
    await demoPage.assertSideSheetOpen("Request Details");
    await demoPage.closeSideSheet();
  });

  test("TC-08: admin can open Send Follow-up Email dialog", async ({
    adminPage,
  }) => {
    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("Send Follow-up Email");
    await demoPage.assertDialogOpen("Send Follow-up Email");
    await demoPage.closeDialog();
  });

  test("TC-09: admin sees delete confirmation and can cancel", async ({
    adminPage,
  }) => {
    const { email, firstName, lastName } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("Delete demo");

    const dialog = adminPage.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(`${firstName} ${lastName}`);

    await dialog.getByRole("button", { name: /cancel/i }).click();
    await demoPage.assertRowExists(email);
  });

  test("TC-10: admin can open Assign Request dialog", async ({ adminPage }) => {
    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("Assign Request");
    await demoPage.assertDialogOpen("Assign Demo Request");
    await demoPage.closeDialog();
  });

  test("TC-11: admin can open Schedule Demo dialog", async ({ adminPage }) => {
    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("Schedule Demo");
    await demoPage.assertDialogOpen("Schedule Demo");
    await demoPage.closeDialog();
  });

  test("TC-12: Proceed to Onboarding navigates to restaurant setup", async ({
    adminPage,
  }) => {
    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("Proceed to Onboarding");
    await expect(adminPage).toHaveURL(/\/restaurant\/new\/demoId\//, {
      timeout: 10_000,
    });
  });
});
