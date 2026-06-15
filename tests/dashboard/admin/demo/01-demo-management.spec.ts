/**
 * 01-demo-management.spec.ts
 *
 * Admin verifies the demo request submitted by globalSetup appears in the
 * Demo Management table with correct name, status NEW, and a timestamp.
 *
 * Authentication is handled entirely by globalSetup + the adminPage fixture —
 * no login steps inside these tests.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../../fixtures/base";
import { createAdminDemoManagementPage } from "../../../../pages/dashboard/admin/AdminDemoManagementPage";
import { readSharedState } from "../../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Admin — Demo Management", () => {
  // Skip the entire suite at the describe level so Playwright never attempts
  // to instantiate the adminPage fixture (which throws when auth file is missing).
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Demo Request Flow");
    await allure.label("severity", "critical");
  });

  test("TC-03: admin can reach the dashboard after login", async ({
    adminPage,
  }) => {
    await allure.description(
      "Using the pre-authenticated admin session from globalSetup, " +
        "the admin should land on a page that is not /sign-in."
    );

    await allure.step("Navigate to admin dashboard", async () => {
      await adminPage.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(adminPage).not.toHaveURL(/\/sign-in/);
      await allure.parameter("Landed on", adminPage.url());
    });
  });

  test("TC-04: admin can find the new demo request in Demo Management", async ({
    adminPage,
  }) => {
    await allure.description(
      "Admin navigates to Demo Management, searches by email, and verifies " +
        "the row shows correct name, status NEW, and a creation timestamp."
    );

    const { email, firstName, lastName, submittedAt } = readSharedState();
    const adminDemoPage = createAdminDemoManagementPage(adminPage);

    await allure.step("Navigate to Demo Management page", async () => {
      await adminDemoPage.goto();
    });

    await allure.step(`Search for email: ${email}`, async () => {
      await adminDemoPage.searchByEmail(email);
    });

    const row = await adminDemoPage.assertRowExists(email);

    await allure.step("Verify row exists with correct name", async () => {
      const rowText = (await row.textContent()) ?? "";
      expect(rowText).toContain(firstName);
      expect(rowText).toContain(lastName);
      await allure.parameter("Submitted email", email);
      await allure.parameter("Name in row", `${firstName} ${lastName}`);
    });

    await allure.step("Verify status is NEW", async () => {
      const status = await adminDemoPage.getStatusFromRow(row);
      expect(status.toUpperCase()).toContain("NEW");
      await allure.parameter("Status", status);
    });

    await allure.step("Verify createdAt timestamp is visible", async () => {
      const createdAtText = await adminDemoPage.getCreatedAtFromRow(row);
      expect(createdAtText.length).toBeGreaterThan(0);
      await allure.parameter("Created at (display)", createdAtText);
      await allure.parameter("Submitted at (ISO)", submittedAt);
    });
  });
});
