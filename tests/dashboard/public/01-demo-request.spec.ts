/**
 * 01-demo-request.spec.ts
 *
 * Public user visits /demo, fills the form, submits it, and receives a
 * confirmation email in the Mailtrap test inbox.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateDemoFormData } from "../../../utils/testData";
import { waitForEmail } from "../../../utils/emailHelper";

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
        "End user navigates to /demo, fills personal and business info, " +
          "submits the form, and sees the success dialog."
      );

      const formData = generateDemoFormData();

      await allure.step("Navigate to the demo booking page", async () => {
        await demoBookingPage.goto();
      });

      await allure.step("Fill in the demo request form", async () => {
        await demoBookingPage.fillForm(formData);
      });

      await allure.step("Submit the form", async () => {
        await demoBookingPage.submit();
      });

      await allure.step("Verify success dialog is displayed", async () => {
        await demoBookingPage.waitForSuccess();
        await expect(demoBookingPage.successDialog).toBeVisible();
      });
    }
  );

  test("TC-74: submitting without agreeing to terms does not submit the form", async ({
    demoBookingPage,
  }) => {
    await allure.description(
      "Filling every field but leaving 'agree to terms' unchecked and clicking submit leaves the " +
        "visitor on /demo with no success dialog (native validation blocks it)."
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
        await demoBookingPage.submitExpectingNoRequest();
      }
    );
  });

  test("TC-75: submitting an invalid email format does not submit the form", async ({
    demoBookingPage,
  }) => {
    await allure.description(
      "Filling the form with a malformed email and clicking submit leaves the visitor on /demo with " +
        "no success dialog (native email-type validation blocks it)."
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
        await demoBookingPage.submitExpectingNoRequest();
      }
    );
  });

  // TODO: enable once MAILTRAP_API_TOKEN + MAILTRAP_INBOX_ID are available in CI.
  // Track at: https://github.com/Restaunax/RestauNax/issues (open a ticket when wiring up Mailtrap)
  // When enabling: globalSetup no longer submits a demo — self-seed one here via
  // submitDemoRequestRaw (like the other demo specs) and tag @demo @email.
  test.skip("TC-02: receive confirmation email after demo request submission", async () => {
    await allure.description(
      "After a demo request is submitted, the Mailtrap test inbox should contain " +
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
