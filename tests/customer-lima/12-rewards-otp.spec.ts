import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { apiLogin } from "../../utils/apiHelper";
import { seedRewardMember } from "../../utils/rewardsApi";
import {
  generateRunId,
  generateSeedPhone,
  readRestaurantId,
  readRestaurantSlug,
} from "../../utils/testData";

/**
 * Reward member login on the shared ordering host.
 *
 * TC-L50 seeds its own member (admin bulk import, a fresh NANP phone) at the
 * seed restaurant and signs in with OTP 123456: QA runs with ENABLE_SMS off,
 * so the backend issues that fixed code for every phone and sends no SMS. It
 * used to use 5555550100, the App Store / Play reviewer number, which is live
 * in production and was never enrolled in the seed restaurant's program, so
 * the test always skipped. Automation must not churn that account anyway.
 */
const FIXED_OTP = "123456";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

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
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_* needed to seed the reward member"
    );
    const memberPhone = generateSeedPhone();
    await allure.step(
      "Seed a reward member at the seed restaurant",
      async () => {
        const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
        await seedRewardMember(
          accessToken,
          readRestaurantId(),
          memberPhone,
          10,
          "",
          `AUTO Lima Member ${generateRunId()}`
        );
      }
    );

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
    await allure.step("Enter the member's phone", async () => {
      await loginTrigger.click();
      const phone = page
        .getByLabel(/phone/i)
        .or(page.getByPlaceholder(/phone/i))
        .first();
      await phone.fill(memberPhone);
      await page.getByRole("button", { name: /^go$/i }).first().click();
    });

    await allure.step("Confirm and send the code", async () => {
      const send = page.getByRole("button", { name: /send code/i }).first();
      await expect(send).toBeVisible({ timeout: 15_000 });
      await send.click();
    });

    // A "not a member" notice here means the seeded member did not land in
    // this restaurant's program: fail with that, not with a locator timeout.
    // The code step stays in the "Rewards Sign In" dialog: "Enter the
    // 6-digit code sent to …", one textbox (placeholder 000000), Verify.
    const signInDialog = page.getByRole("dialog", { name: "Rewards Sign In" });
    const otpInput = signInDialog.getByRole("textbox");
    const notAMember = page
      .getByRole("alert")
      .filter({ hasText: /not a member|join our rewards/i })
      .first();
    await expect(otpInput.or(notAMember)).toBeVisible({ timeout: 20_000 });
    await expect(
      notAMember,
      `${memberPhone} was seeded but the storefront says it is not a member`
    ).toHaveCount(0);

    await allure.step("Enter the fixed OTP", async () => {
      await otpInput.fill(FIXED_OTP);
      await signInDialog.getByRole("button", { name: "Verify" }).click();
      await expect(signInDialog).toBeHidden({ timeout: 20_000 });
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
