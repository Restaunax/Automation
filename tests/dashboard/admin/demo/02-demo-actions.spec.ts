import * as allure from "allure-js-commons";
import { test, expect } from "../../../../fixtures/base";
import { createAdminDemoManagementPage } from "../../../../pages/dashboard/admin/AdminDemoManagementPage";
import { generateDemoFormData } from "../../../../utils/testData";
import {
  apiLogin,
  submitDemoRequestRaw,
  deleteDemoRequestByEmail,
} from "../../../../utils/apiHelper";
import { waitForEmail } from "../../../../utils/emailHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
// Gate on the URL only: a missing password should surface as a loud 401 from
// Mailpit, not as a silently skipped assertion.
const mailpitReady = !!process.env.MAILPIT_BASE_URL;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A schedule date must always be in the future — compute it per run instead of
// hardcoding one that silently becomes "in the past" and breaks the test.
// Format matches the masked MM/DD/YYYY picker input (digits only).
const futureScheduleDate = (daysFromNow = 7): string => {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}${dd}${d.getFullYear()}`;
};

// @demo @email: beforeAll seeds a demo request (emails the requester) and TC-08
// sends a follow-up email — both land in QA's Mailpit inbox. The tags are
// selectors for targeted runs (`npm run test:demo` / `test:email`), not an
// exclusion: these run in the default suite and the nightly.
test.describe(
  "Admin — Demo Request Actions",
  { tag: ["@demo", "@email"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
    );

    // This file MUTATES its demo request (status, notes, schedule, assignment),
    // so it seeds a private one instead of using the shared globalSetup request
    // that 01-demo-management asserts against — files run in parallel now, and
    // sharing a mutable row across files is a race. Deleted in afterAll.
    let demoEmail = "";
    let demoFirstName = "";
    let demoLastName = "";

    test.beforeAll(async () => {
      // Don't seed a demo we can't clean up: the afterAll delete needs admin creds
      // (the describe is skipped without them, but beforeAll still runs).
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      const formData = generateDemoFormData();
      const res = await submitDemoRequestRaw({
        ...formData,
        planType: "restaurant",
      });
      if (!res.ok) {
        throw new Error(
          `Failed to seed demo request for demo-actions: ${res.status} ${JSON.stringify(res.data)}`
        );
      }
      demoEmail = formData.email;
      demoFirstName = formData.firstName;
      demoLastName = formData.lastName;
    });

    test.afterAll(async () => {
      if (!demoEmail || !ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      try {
        const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
        await deleteDemoRequestByEmail(accessToken, demoEmail);
      } catch (err) {
        console.warn(
          `[demo-actions] Failed to delete seeded demo request (${demoEmail}):`,
          err
        );
      }
    });

    test.beforeEach(async ({ adminPage }) => {
      await allure.label("feature", "Demo Request Flow");
      await allure.label("severity", "critical");

      const demoPage = createAdminDemoManagementPage(adminPage);
      await demoPage.goto();
      await demoPage.searchByEmail(demoEmail);
      await demoPage.assertRowExists(demoEmail);
    });

    test("TC-05: admin can open the action menu on a demo row", async ({
      adminPage,
    }) => {
      const email = demoEmail;
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
        await expect(demoPage.menuActionItem(label)).toBeVisible();
      }

      await adminPage.keyboard.press("Escape");
    });

    test("TC-06: admin can change demo status via inline dropdown", async ({
      adminPage,
    }) => {
      const email = demoEmail;
      const demoPage = createAdminDemoManagementPage(adminPage);

      try {
        await demoPage.changeStatusInline(email, "Contacted");

        await expect(demoPage.statusChip(email)).toContainText("Contacted", {
          timeout: 10_000,
        });
      } finally {
        // Reset to "New" so later tests in this file start from a known state —
        // in a finally so a mid-test failure can't leave the row wrong.
        // Best-effort: never mask the original failure.
        await demoPage.changeStatusInline(email, "New").catch(() => {});
      }
    });

    test("TC-07: admin can edit and save notes in the View/Edit Details side sheet", async ({
      adminPage,
    }) => {
      await allure.description(
        "Filling the Notes field and clicking Save Changes PUTs /api/demo-requests/:id and the side " +
          "sheet auto-closes on success (no toast). Reopening confirms the note persisted server-side."
      );

      const email = demoEmail;
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
          "real email through the Mailpit sandbox (verified via waitForEmail, gated on MAILPIT_BASE_URL)."
      );

      const email = demoEmail;
      const demoPage = createAdminDemoManagementPage(adminPage);

      try {
        await allure.step("Open Send Follow-up Email and send it", async () => {
          await demoPage.openActionMenu(email);
          await demoPage.clickMenuAction("Send Follow-up Email");
          await demoPage.assertDialogOpen("Send Follow-up Email");
          await demoPage.sendFollowupEmail();
        });

        await allure.step("Verify status flips to Contacted", async () => {
          await expect(demoPage.statusChip(email)).toContainText("Contacted", {
            timeout: 10_000,
          });
        });

        if (mailpitReady) {
          await allure.step("Verify the email actually arrived", async () => {
            const msg = await waitForEmail(email, { timeoutMs: 20_000 });
            expect(msg.subject).toBeTruthy();
            await allure.parameter("Email subject", msg.subject);
          });
        }
      } finally {
        // Reset to "New" so later tests in this file start from a known state —
        // in a finally so a mid-test failure can't leave the row wrong.
        await demoPage.changeStatusInline(email, "New").catch(() => {});
      }
    });

    test("TC-09: admin sees delete confirmation and can cancel", async ({
      adminPage,
    }) => {
      const email = demoEmail;
      const demoPage = createAdminDemoManagementPage(adminPage);

      await demoPage.openActionMenu(email);
      await demoPage.clickMenuAction("Delete demo");

      const dialog = demoPage.confirmDialog();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog).toContainText(`${demoFirstName} ${demoLastName}`);

      await dialog.getByRole("button", { name: /cancel/i }).click();
      await demoPage.assertRowExists(email);
    });

    test("TC-98: admin can permanently delete a demo request", async ({
      adminPage,
    }) => {
      await allure.description(
        "Confirming the delete dialog actually removes the row, verified via the DELETE response and " +
          "a re-search. Uses its own throwaway seeded demo request (separate even from this file's " +
          "main seeded row) so the delete doesn't disrupt the other tests."
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

      const email = demoEmail;
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

      const email = demoEmail;
      const demoPage = createAdminDemoManagementPage(adminPage);

      try {
        await demoPage.openActionMenu(email);
        await demoPage.clickMenuAction("Schedule Demo");
        await demoPage.assertDialogOpen("Schedule Demo");
        await demoPage.scheduleDemo(futureScheduleDate(), "1000AM");

        await expect(demoPage.statusChip(email)).toContainText("Scheduled", {
          timeout: 10_000,
        });
      } finally {
        // Reset to "New" so later tests in this file start from a known state —
        // in a finally so a mid-test failure can't leave the row wrong.
        await demoPage.changeStatusInline(email, "New").catch(() => {});
      }
    });

    test("TC-12: Proceed to Onboarding navigates to restaurant setup", async ({
      adminPage,
    }) => {
      const email = demoEmail;
      const demoPage = createAdminDemoManagementPage(adminPage);

      await demoPage.openActionMenu(email);
      await demoPage.clickMenuAction("Proceed to Onboarding");
      await expect(adminPage).toHaveURL(/\/restaurant\/new\/demoId\//, {
        timeout: 10_000,
      });
    });
  }
);
