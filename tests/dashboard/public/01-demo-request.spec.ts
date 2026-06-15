/**
 * 01-demo-request.spec.ts
 *
 * Public user visits /demo, fills the form, submits it, and receives a
 * confirmation email in the Mailtrap test inbox.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateDemoFormData, readSharedState } from "../../../utils/testData";
import { waitForEmail } from "../../../utils/emailHelper";

test.describe("Demo Request — Public Form", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Demo Request Flow");
    await allure.label("severity", "critical");
  });

  test("TC-01: submit demo request form and display success confirmation", async ({
    demoBookingPage,
  }) => {
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
  });

  // TODO: enable once MAILTRAP_API_TOKEN + MAILTRAP_INBOX_ID are available in CI.
  // Track at: https://github.com/Restaunax/RestauNax/issues (open a ticket when wiring up Mailtrap)
  test.skip("TC-02: receive confirmation email after demo request submission", async () => {
    await allure.description(
      "After the demo request submitted in globalSetup, the Mailtrap test inbox " +
        "should contain a confirmation email addressed to the submitted email."
    );

    const { email } = readSharedState();

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
