/**
 * 28-shipping-order-notice.spec.ts — Store Settings for a home-food seller
 * who SHIPS (RestauNax PR #1036: "home-food shipping sellers get an Order
 * notice setting").
 *
 * TC-934. Before #1036 a shipping seller's Store Settings said "Shipping
 * settings coming soon". Now it carries the same lead-time field a pickup
 * home cook has (RestaurantSettings.minimumOrderPreparationTime, hours),
 * worded as "Order notice", plus a note that RestauNax chooses the carrier
 * (there is deliberately no carrier setting).
 *
 * Own tenant: a throwaway HOME_FOOD restaurant with shippingEnabled
 * (createSecondOwner with restaurant overrides), owner logged in through the
 * UI; deleted afterwards.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
} from "../../../utils/apiHelper";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { generateRunId } from "../../../utils/testData";
import { requireRelease } from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe(
  "Owner — home-food shipping seller: Order notice",
  { tag: ["@bugfix-1036", "@home-food"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own tenant)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let ownerToken = "";
    let restaurantId = "";
    let session: UiLoginSession | null = null;

    test.beforeAll(async ({ browser }) => {
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        restaurant: {
          name: `Automation Home Shipper ${runId}`,
          businessType: "HOME_FOOD",
          shippingEnabled: true,
        },
      });
      if (!tenant.restaurantId || !tenant.password)
        throw new Error("[order-notice] could not mint the throwaway seller");
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      session = await loginViaUi(browser, tenant.email, tenant.password);
    });

    test.afterAll(async () => {
      // Best-effort cleanup; must not mask the result.
      if (restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
      if (session) await session.context.close().catch(() => {});
    });

    test("TC-934: a shipping seller sets an Order notice in Store Settings; it saves and reloads", async () => {
      await allure.label("feature", "Owner Store Settings");
      await allure.label("severity", "normal");
      await allure.description(
        "Store Settings shows 'Shipping Settings' with the 'Order notice' select and the carrier note. " +
          "Choosing '2 days ahead (48 hours)' and Save Settings PUTs minimumOrderPreparationTime: 48; the " +
          "settings API returns 48 and a reload shows the choice."
      );
      const page = (session as UiLoginSession).page;
      const open = async () => {
        await page.goto(
          `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Store%20Settings`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(
          page.getByRole("heading", { name: "Shipping Settings" })
        ).toBeVisible({ timeout: 30_000 });
      };
      await open();

      requireRelease(
        "bugBatch",
        await page
          .getByText(
            "Configure how much notice you need before an order ships."
          )
          .isVisible(),
        "Shipping Settings is still the 'coming soon' placeholder"
      );

      const select = page.locator("#home-cook-minimum-lead-time");
      await allure.step("The Order notice field and carrier note", async () => {
        await expect(
          page.locator('label[for="home-cook-minimum-lead-time"]')
        ).toHaveText("Order notice");
        await expect(
          page.getByText(/^RestauNax chooses the carrier for you/)
        ).toBeVisible();
      });

      await allure.step("Choose 48 hours and save", async () => {
        await select.click();
        await page
          .getByRole("option", { name: "2 days ahead (48 hours)" })
          .click();
        const saved = page.waitForResponse(
          (r) =>
            r.request().method() === "PUT" &&
            r.url().endsWith(`/api/restaurantId/${restaurantId}/settings`)
        );
        await page.getByRole("button", { name: "Save Settings" }).click();
        const res = await saved;
        expect(res.status()).toBe(200);
        expect(res.request().postDataJSON()).toEqual({
          minimumOrderPreparationTime: 48,
        });
      });

      await allure.step("The API and a reload agree", async () => {
        const settings = await apiRequestRaw<{
          minimumOrderPreparationTime?: number;
        }>(
          "GET",
          `/api/restaurantId/${restaurantId}/settings`,
          undefined,
          ownerToken
        );
        expect(settings.data.minimumOrderPreparationTime).toBe(48);
        await open();
        await expect(select).toHaveText("2 days ahead (48 hours)");
      });
    });
  }
);
