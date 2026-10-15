/**
 * 21-promotion-send.spec.ts — Owner → Promotions → "Send to customers" (spec:
 * restaunax docs/features/PROMOTIONS.md → "Sending any promotion").
 *
 * A restaurant can send one of its promotions to one person by typing their
 * email: the list row's "Send to customers" opens the "Send a promotion"
 * dialog on that promotion, the backend emails the code
 * (POST /api/coupons/:id/send-to-contact), and the send shows up in the
 * promotion's Send history on the Send & campaigns tab.
 *
 * Own data on the seed restaurant: one AUTO code promotion (a coupon — no
 * deal slot), deleted in the test's `finally`; globalTeardown's AUTO coupon
 * sweep backstops an interrupted run. The recipient is a unique Mailpit
 * address (generateUserEmail). When MAILPIT_BASE_URL isn't set (local runs
 * without the shared inbox's credentials) the email step is skipped and
 * annotated — locally only: in CI (process.env.CI) a missing MAILPIT_BASE_URL
 * fails TC-852, so the email check can never silently drop out of the nightly.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerPromotionsPage } from "../../../pages/dashboard/owner/OwnerPromotionsPage";
import { apiLogin, apiRequestRaw } from "../../../utils/apiHelper";
import { createCouponPromotion } from "../../../utils/promotionsApi";
import { waitForEmail } from "../../../utils/emailHelper";
import {
  generateCouponCode,
  generateRunId,
  generateUserEmail,
  readSharedState,
} from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const MAILPIT_BASE_URL = process.env.MAILPIT_BASE_URL ?? "";

test.describe("Owner — Promotions send", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-852: @email send a code promotion to one email — the code arrives and Send history lists it", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Row action Send to customers → Send a promotion dialog (starts on that promotion) → Email to a unique Mailpit address. The email's subject names the restaurant and its body carries the code; Send & campaigns opened on the promotion shows a Direct send of 1 in its Send history."
    );
    // CI must prove the email arrives; only a local run may skip that step.
    // Checked first, so a misconfigured CI run sends nothing.
    if (process.env.CI) {
      expect(
        MAILPIT_BASE_URL,
        "MAILPIT_BASE_URL must be set in CI — TC-852's email step can't be skipped there"
      ).toBeTruthy();
    }
    const { restaurantId, restaurantName } = readSharedState();
    const { accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const name = `AUTO Send ${generateRunId()}`;
    const code = generateCouponCode();
    const recipient = generateUserEmail("promo_send");
    const coupon = await createCouponPromotion(token, restaurantId, {
      name,
      code,
      type: "FIXED_AMOUNT",
      value: 3,
    });
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      const sentAt = new Date();
      await allure.step("Send it from the list row", async () => {
        await list.goto(restaurantId);
        const res = await list.sendToEmail(name, recipient);
        expect(res.status).toBe(200);
      });

      if (MAILPIT_BASE_URL) {
        await allure.step(
          "The recipient gets the code from the restaurant",
          async () => {
            const email = await waitForEmail(recipient, {
              notBefore: sentAt,
              timeoutMs: 60_000,
            });
            // Trimmed: the seed name ends in a space, which mail headers and
            // HTML rendering don't keep reliably.
            const shownName = restaurantName.trim();
            expect(email.subject).toContain(shownName);
            const body = `${email.html_body}\n${email.text_body}`;
            expect(body).toContain(code);
            expect(body).toContain(shownName);
          }
        );
      } else {
        test.info().annotations.push({
          type: "skipped-step",
          description: "MAILPIT_BASE_URL not set — email step skipped.",
        });
      }

      await allure.step(
        "Send & campaigns shows the send in its history",
        async () => {
          await list.gotoCampaigns(restaurantId, coupon.id);
          const event = list.sendHistoryEvent("Direct sends (1)");
          await expect(event).toBeVisible({ timeout: 20_000 });
          await expect(
            event.getByText("Direct", { exact: true })
          ).toBeVisible();
        }
      );
    } finally {
      const res = await apiRequestRaw(
        "DELETE",
        `/api/coupons/${coupon.id}`,
        undefined,
        token
      );
      // Never fail the test on cleanup; the AUTO sweep in globalTeardown
      // removes anything left behind.
      if (!res.ok) {
        console.warn(
          `[21-promotion-send] cleanup: deleting coupon ${coupon.id} → ${res.status}`
        );
      }
    }
  });
  test('TC-857: the list\'s Send confirms with "Promotion sent."', async ({
    ownerPage,
  }) => {
    test.fixme(
      true,
      'BUG: sending from the Promotions list row never shows the "Promotion sent." toast — PromotionsSection keys SendPromotionDialog on the row id, so closing it remounts the dialog and drops the dialog\'s own Snackbar (restaunax-frontend PromotionsSection.tsx ~L250). The send itself succeeds (TC-852).'
    );
    await allure.description(
      "After Send in the row's Send a promotion dialog, the owner sees the success toast."
    );
    const { restaurantId } = readSharedState();
    const { accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const name = `AUTO Send Toast ${generateRunId()}`;
    const coupon = await createCouponPromotion(token, restaurantId, {
      name,
      code: generateCouponCode(),
      type: "FIXED_AMOUNT",
      value: 3,
    });
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      await list.goto(restaurantId);
      const res = await list.sendToEmail(
        name,
        generateUserEmail("promo_send_toast")
      );
      expect(res.status).toBe(200);
      await expect(list.sentToast()).toBeVisible();
    } finally {
      // Never fail on cleanup; globalTeardown's AUTO sweep backstops it.
      await apiRequestRaw(
        "DELETE",
        `/api/coupons/${coupon.id}`,
        undefined,
        token
      ).catch(() => undefined);
    }
  });
});
