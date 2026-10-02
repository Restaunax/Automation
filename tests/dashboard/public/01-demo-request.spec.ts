/**
 * 01-demo-request.spec.ts
 *
 * Public user opens the dashboard's /demo, is forwarded to the marketing
 * site's /get-started form (restaunax-frontend 49dd9759c, 2026-08-08 — the
 * redirect must live forever for affiliate links / QR codes), fills the form
 * and submits it.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateDemoFormData } from "../../../utils/testData";
import { waitForEmail } from "../../../utils/emailHelper";
import { apiLogin, deleteDemoRequestByEmail } from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Demo Request — Public Form", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Demo Request Flow");
    await allure.label("severity", "critical");
  });

  test(
    "TC-01: submit demo request form and display success confirmation",
    {
      tag: ["@demo", "@email"],
    },
    async ({ demoBookingPage }) => {
      await allure.description(
        "End user opens the dashboard's /demo, is forwarded to the marketing site's " +
          "/get-started form, fills personal and business info, submits it (POST " +
          "/api/demo-requests succeeds) and sees the success dialog. The created lead " +
          "is deleted afterwards."
      );

      const formData = generateDemoFormData();

      try {
        await allure.step(
          "Navigate via /demo to the demo booking form",
          async () => {
            await demoBookingPage.goto();
          }
        );

        await allure.step("Fill in the demo request form", async () => {
          await demoBookingPage.fillForm(formData);
        });

        await allure.step("Submit the form", async () => {
          const response = await demoBookingPage.submit();
          expect(
            response.ok(),
            `POST /api/demo-requests → ${response.status()}`
          ).toBe(true);
          const sent = response.request().postDataJSON() as Record<
            string,
            unknown
          >;
          expect(sent.email).toBe(formData.email);
          // The form no longer offers a choice — every inbound lead is called.
          expect(String(sent.preferredContact).toLowerCase()).toBe("phone");
        });

        await allure.step("Verify success dialog is displayed", async () => {
          await demoBookingPage.waitForSuccess();
          await expect(demoBookingPage.successDialog).toBeVisible();
        });
      } finally {
        // A real lead row (with its rep-alert pipeline) — don't leave it on QA.
        if (ADMIN_EMAIL && ADMIN_PASSWORD) {
          await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)
            .then(({ accessToken }) =>
              deleteDemoRequestByEmail(accessToken, formData.email)
            )
            .catch((err: unknown) =>
              console.warn(
                `[TC-01] Failed to delete demo request ${formData.email}:`,
                err
              )
            );
        }
      }
    }
  );

  test("TC-74: submitting without agreeing to terms does not submit the form", async ({
    demoBookingPage,
  }) => {
    await allure.description(
      "Filling every field but leaving 'agree to terms' unchecked and clicking submit sends no " +
        "request, shows the 'You must agree to the terms' error and no success dialog."
    );

    const formData = generateDemoFormData();

    await allure.step(
      "Navigate and fill the form without agreeing to terms",
      async () => {
        await demoBookingPage.goto();
        await demoBookingPage.fillForm({ ...formData, agreeToTerms: false });
      }
    );

    await allure.step(
      "Submit and verify no request fires and no success dialog appears",
      async () => {
        await demoBookingPage.submitExpectingNoRequest(
          "You must agree to the terms"
        );
      }
    );
  });

  test("TC-75: submitting an invalid email format does not submit the form", async ({
    demoBookingPage,
  }) => {
    await allure.description(
      "Filling the form with a malformed email and clicking submit sends no request, shows the " +
        "'Please enter a valid email address' error and no success dialog."
    );

    const formData = generateDemoFormData();

    await allure.step(
      "Navigate and fill the form with a bad email",
      async () => {
        await demoBookingPage.goto();
        await demoBookingPage.fillForm({ ...formData, email: "not-an-email" });
      }
    );

    await allure.step(
      "Submit and verify no request fires and no success dialog appears",
      async () => {
        await demoBookingPage.submitExpectingNoRequest(
          "Please enter a valid email address"
        );
      }
    );
  });

  // Still skipped, but NOT for the old reason — the sandbox creds are in CI now
  // that QA sends to Mailpit. As written this test never submits the form: it
  // generates an address and immediately waits for mail, so un-skipping it would
  // just time out. To enable, self-seed the request here via submitDemoRequestRaw
  // (like the sibling demo specs), gate on MAILPIT_BASE_URL, and tag @demo @email.
  test.skip("TC-02: receive confirmation email after demo request submission", async () => {
    await allure.description(
      "After a demo request is submitted, the Mailpit sandbox inbox should contain " +
        "a confirmation email addressed to the submitted email."
    );

    const { email } = generateDemoFormData();

    await allure.step(
      `Wait for confirmation email to arrive at ${email}`,
      async () => {
        const message = await waitForEmail(email, {
          subjectPattern: /demo|confirm|request/i,
          timeoutMs: 30_000,
        });

        expect(message.to_email.toLowerCase()).toBe(email.toLowerCase());
        expect(message.subject).toBeTruthy();

        await allure.parameter("Email recipient", message.to_email);
        await allure.parameter("Email subject", message.subject);
        await allure.parameter("Received at", message.created_at);
      }
    );
  });
});
