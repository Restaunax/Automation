import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { readRestaurantSlug } from "../../utils/testData";

/**
 * Reward member login on the shared ordering host.
 *
 * fixtures/base notes that a reward-member fixture was deferred "when that flow
 * gets automated". It can be automated: restaunax-backend's
 * src/utils/testPhones.ts allowlists one number that always receives a fixed
 * OTP, in every environment including production — it exists for App Store and
 * Play Store reviewers.
 *
 * ⚠️ KEEP EVERY REWARD-MUTATING TEST IN THIS FILE. That is a single shared
 * identity with a mutable point balance, and this repo's isolation unit is the
 * spec FILE (playwright.config: fullyParallel false, different files across
 * workers). Splitting reward tests across files races them against each other.
 * Adding more numbers to TEST_PHONE_NUMBERS is a one-line backend change if the
 * suite outgrows one file.
 */
const REVIEWER_PHONE = "5555550100";
const FIXED_OTP = "123456";

test.describe("Lima — reward member login", () => {
  const restaurantSlug = readRestaurantSlug();

  test.skip(!restaurantSlug, "Ordering slug not seeded");

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-L50: a reward member can log in with OTP @smoke", async ({
    page,
  }) => {
    const lima = createLimaStorefrontPage(page);
    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();

    const loginTrigger = page
      .getByRole("button", { name: /rewards|sign in|log ?in/i })
      .first();
    test.skip(
      (await loginTrigger.count()) === 0,
      "Rewards not enabled for the seed restaurant"
    );

    // Three steps, not two: the navbar field + "Go" opens a "Rewards Sign In"
    // confirmation dialog showing the number back to you, and the code is only
    // sent after "Send Code" is pressed there.
    await allure.step("Enter the reviewer phone", async () => {
      await loginTrigger.click();
      const phone = page
        .getByLabel(/phone/i)
        .or(page.getByPlaceholder(/phone/i))
        .first();
      await phone.fill(REVIEWER_PHONE);
      await page.getByRole("button", { name: /^go$/i }).first().click();
    });

    await allure.step("Confirm and send the code", async () => {
      const send = page.getByRole("button", { name: /send code/i }).first();
      await expect(send).toBeVisible({ timeout: 15_000 });
      await send.click();
    });

    // Pressing "Send Code" leads to one of two outcomes, and which one is not
    // knowable up front — so wait for EITHER rather than assuming success and
    // timing out on a locator when the answer was already on screen.
    //
    // The fixed-OTP test phone still has to be an enrolled member of THIS
    // restaurant's rewards program: the fixed code bypasses SMS delivery, not
    // membership. The durable fix is enrolling REVIEWER_PHONE in globalSetup
    // alongside the other seed data, which needs owner credentials.
    const otpInput = page
      .getByLabel(/code|otp|verification/i)
      .or(page.getByPlaceholder(/code|otp|\d ?- ?digit/i))
      .first();
    const notAMember = page
      .getByRole("alert")
      .filter({ hasText: /not a member|join our rewards/i })
      .first();

    const outcome = await Promise.race([
      otpInput
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => "otp" as const)
        .catch(() => null),
      notAMember
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => "not-a-member" as const)
        .catch(() => null),
    ]);
    await allure.parameter("outcome", outcome ?? "(neither appeared)");

    test.skip(
      outcome === "not-a-member",
      `${REVIEWER_PHONE} is not enrolled in this restaurant's rewards program — enroll it to exercise this flow`
    );
    expect(outcome, "expected either an OTP field or a membership notice").toBe(
      "otp"
    );

    await allure.step("Enter the fixed OTP", async () => {
      const otp = page
        .getByLabel(/code|otp|verification/i)
        .or(page.getByPlaceholder(/code|otp|\d ?- ?digit/i))
        .or(page.getByRole("textbox").last())
        .first();
      await expect(otp).toBeVisible({ timeout: 20_000 });
      await otp.fill(FIXED_OTP);
      await page
        .getByRole("button", { name: /^go$|verify|submit|continue/i })
        .first()
        .click();
    });

    // The token must land in THIS tenant's namespace, never a bare key —
    // apiService reads it on every request.
    await expect
      .poll(
        async () => {
          const keys = await lima.readStorageKeys();
          return keys.local.some(
            (k) => /^rx:[rc]_/.test(k) && k.endsWith(":auth_token")
          );
        },
        { timeout: 20_000 }
      )
      .toBe(true);

    const keys = await lima.readStorageKeys();
    await allure.parameter("localStorage", keys.local.join(", "));
    expect(keys.local).not.toContain("auth_token");
    expect(keys.local).not.toContain("rewardAuthToken");
  });

  test("TC-L52: a reward token survives a reload, unlike the cart", async ({
    page,
  }) => {
    await allure.description(
      "Auth is localStorage and cart is sessionStorage, deliberately: a " +
        "customer should stay logged in across a refresh, and holding reward " +
        "accounts at several restaurants at once is the upside of a shared " +
        "origin. Cross-tenant non-travel is covered by TC-L12, which asserts " +
        "on the Authorization header — this is about persistence, not leakage."
    );

    const lima = createLimaStorefrontPage(page);
    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();

    const planted = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) =>
        k.startsWith("rx:")
      );
      const prefix = key ? key.split(":").slice(0, 2).join(":") : null;
      if (!prefix) return null;
      window.localStorage.setItem(
        `${prefix}:auth_token`,
        "tenant-a-reward-token"
      );
      return `${prefix}:auth_token`;
    });
    test.skip(!planted, "No tenant namespace resolved — tenant did not load");

    await page.reload({ waitUntil: "domcontentloaded" });

    const after = await lima.readStorageKeys();
    await allure.parameter("localStorage", after.local.join(", "));
    expect(
      after.local,
      "the reward token must survive a reload within its tenant"
    ).toContain(planted as string);
  });
});
