import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { readSharedState } from "../../../utils/testData";

/**
 * Access control — a completely unauthenticated visitor hitting protected
 * dashboard routes directly (no storage state; the plain `page` fixture has
 * none — see playwright.config.ts). Distinct from role-restrictions.spec.ts,
 * which tests an authenticated-but-wrong-role user.
 */
test.describe("Access — Unauthenticated", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Access Control");
    await allure.label("severity", "critical");
  });

  test("TC-71: an unauthenticated visitor hitting the owner restaurant list is redirected to sign-in", async ({
    page,
  }) => {
    await allure.description(
      "Navigating directly to /restaurant/stores with no session redirects to /sign-in rather than " +
        "rendering the dashboard."
    );

    await page.goto("/restaurant/stores", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
  });

  test("TC-72: an unauthenticated visitor hitting the admin dashboard is redirected to sign-in", async ({
    page,
  }) => {
    await allure.description(
      "Navigating directly to /admin with no session redirects to /sign-in rather than rendering " +
        "the admin dashboard."
    );

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
  });

  test("TC-73: an unauthenticated visitor hitting a specific restaurant management page is redirected to sign-in", async ({
    page,
  }) => {
    await allure.description(
      "Navigating directly to a restaurant's management URL with no session redirects to /sign-in " +
        "instead of leaking restaurant data."
    );

    const { restaurantId } = readSharedState();
    await page.goto(`/restaurant/restaurantId/${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
  });
});
