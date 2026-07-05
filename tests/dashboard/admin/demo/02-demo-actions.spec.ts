import * as allure from "allure-js-commons";
import { test, expect } from "../../../../fixtures/base";
import { createAdminDemoManagementPage } from "../../../../pages/dashboard/admin/AdminDemoManagementPage";
import {
  readSharedState,
  generateDemoFormData,
} from "../../../../utils/testData";
import { submitDemoRequestRaw } from "../../../../utils/apiHelper";
import { waitForEmail } from "../../../../utils/emailHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const mailtrapReady = !!(
  process.env.MAILTRAP_API_TOKEN && process.env.MAILTRAP_INBOX_ID
);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  test("TC-07: admin can edit and save notes in the View/Edit Details side sheet", async ({
    adminPage,
  }) => {
    await allure.description(
      "Filling the Notes field and clicking Save Changes PUTs /api/demo-requests/:id and the side " +
        "sheet auto-closes on success (no toast). Reopening confirms the note persisted server-side."
    );

    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);
    const note = `Automation note ${Date.now()}`;

    await allure.step("Open View/Edit Details and save a note", async () => {
      await demoPage.openActionMenu(email);
      await demoPage.clickMenuAction("View/Edit Details");
      await demoPage.assertSideSheetOpen("Request Details");
      await demoPage.fillNotesAndSave(note);
    });

    await allure.step("Reopen and verify the note persisted", async () => {
      await demoPage.openActionMenu(email);
      await demoPage.clickMenuAction("View/Edit Details");
      await expect(demoPage.notesInput()).toHaveValue(note, {
        timeout: 10_000,
      });
      await demoPage.closeSideSheet();
    });
  });

  test("TC-08: admin can send a follow-up email", async ({ adminPage }) => {
    await allure.description(
      "Sending the pre-filled follow-up email flips demo status NEW -> CONTACTED and delivers a " +
        "real email through the Mailtrap sandbox (verified via waitForEmail, gated on Mailtrap creds)."
    );

    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await allure.step("Open Send Follow-up Email and send it", async () => {
      await demoPage.openActionMenu(email);
      await demoPage.clickMenuAction("Send Follow-up Email");
      await demoPage.assertDialogOpen("Send Follow-up Email");
      await demoPage.sendFollowupEmail();
    });

    await allure.step("Verify status flips to Contacted", async () => {
      await expect(
        demoPage
          .findRowByEmail(email)
          .locator('[role="combobox"] .MuiChip-label')
      ).toContainText("Contacted", { timeout: 10_000 });
    });

    if (mailtrapReady) {
      await allure.step("Verify the email actually arrived", async () => {
        const msg = await waitForEmail(email, { timeoutMs: 20_000 });
        expect(msg.subject).toBeTruthy();
        await allure.parameter("Email subject", msg.subject);
      });
    }

    // Reset status so TC-04 (which asserts "NEW") is not affected on re-runs.
    await demoPage.changeStatusInline(email, "New");
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

  test("TC-98: admin can permanently delete a demo request", async ({
    adminPage,
  }) => {
    await allure.description(
      "Confirming the delete dialog actually removes the row, verified via the DELETE response and " +
        "a re-search. Uses a throwaway seeded demo request rather than the shared one TC-04→TC-12 " +
        "depend on, so it doesn't disrupt the rest of the file."
    );

    const formData = generateDemoFormData();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await allure.step("Seed a throwaway demo request", async () => {
      const res = await submitDemoRequestRaw({
        ...formData,
        planType: "restaurant",
      });
      expect(res.ok).toBe(true);
      await allure.parameter("email", formData.email);
    });

    await allure.step("Search for it and open Delete", async () => {
      await demoPage.searchByEmail(formData.email);
      await demoPage.assertRowExists(formData.email);
      await demoPage.openActionMenu(formData.email);
      await demoPage.clickMenuAction("Delete demo");
    });

    await allure.step("Confirm delete", async () => {
      await demoPage.confirmDelete();
    });

    await allure.step("Verify the row is gone", async () => {
      await demoPage.searchByEmail(formData.email);
      await expect(demoPage.findRowByEmail(formData.email)).toHaveCount(0);
    });
  });

  test("TC-10: admin can assign a demo request to a team member", async ({
    adminPage,
  }) => {
    await allure.description(
      "Searching the Assign autocomplete for the known ADMIN_EMAIL account, selecting it, and " +
        "clicking Assign PUTs assignedToId — verified via the response body (the UI doesn't surface " +
        "the assignee anywhere else)."
    );

    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("Assign Request");
    await demoPage.assertDialogOpen("Assign Demo Request");

    const respPromise = adminPage.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/api/demo-requests/"),
      { timeout: 10_000 }
    );
    await demoPage.assignToUser(
      ADMIN_EMAIL,
      new RegExp(`<${escapeRegex(ADMIN_EMAIL)}>`)
    );
    const resp = await respPromise;
    const body = await resp.json();
    expect(body.data.assignedToId).toBeTruthy();
  });

  test("TC-11: admin can schedule a demo", async ({ adminPage }) => {
    await allure.description(
      "Typing a date/time into the masked MM/DD/YYYY hh:mm aa field and clicking Schedule Demo " +
        "flips status to Scheduled and sets scheduledDemoAt."
    );

    const { email } = readSharedState();
    const demoPage = createAdminDemoManagementPage(adminPage);

    await demoPage.openActionMenu(email);
    await demoPage.clickMenuAction("Schedule Demo");
    await demoPage.assertDialogOpen("Schedule Demo");
    await demoPage.scheduleDemo("07102026", "1000AM");

    await expect(
      demoPage.findRowByEmail(email).locator('[role="combobox"] .MuiChip-label')
    ).toContainText("Scheduled", { timeout: 10_000 });

    // Reset status so TC-04 (which asserts "NEW") is not affected on re-runs.
    await demoPage.changeStatusInline(email, "New");
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
