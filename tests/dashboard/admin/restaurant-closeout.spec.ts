/**
 * restaurant-closeout.spec.ts — staff deactivation runs the restaurant
 * close-out (RestauNax PR #1038, docs/features/FINAL_INVOICE_AND_EQUIPMENT_RECOVERY_DESIGN.md).
 *
 * TC-935..939, serial (one throwaway restaurant walks through the close-out):
 *   935  HQ → Restaurants → Deactivate shows each RestauNax device with the
 *        pay-or-return choice (return by default); confirming closes it out
 *   936  Equipment → Returns due lists the device
 *   937  Subscriptions → Billing Attention → Closing balance lists the restaurant
 *   938  waiving a charge needs a reason, and only an ADMIN may waive
 *   939  the owner cancel / auto-renew endpoints are gone
 *
 * Stripe: the suite has no Stripe test-clock pattern, so the money paths
 * (final invoice on a live subscription, a PAY choice billed on it, a real
 * waiver) are NOT exercised here — the throwaway restaurant has no
 * subscription and its device is FREE, so the close-out runs immediately
 * with no Stripe call. RestauNax covers those paths with
 * scripts/verify-closeout-stripe.ts (checks V1–V6 on Stripe test clocks).
 *
 * Gated: until #1038 is deployed /api/admin/close-out answers 404 and every
 * test SKIPS (RELEASED_ON_QA.closeOut). TC-939 in particular never calls the
 * cancel endpoint on a build that still has it. Select with `--grep @closeout`.
 *
 * Data: a fresh owner + restaurant (deleted afterwards) and the persistent
 * equipment fixture from utils/closeOutApi.ts (returned and put back
 * IN_STOCK afterwards).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminRestaurantsPage } from "../../../pages/dashboard/admin/AdminRestaurantsPage";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
} from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";
import { probeCloseOut, requireRelease } from "../../../utils/releaseGate";
import {
  CLOSEOUT_CATALOG_NAME,
  CLOSEOUT_SERIAL,
  assignFreeDevice,
  ensureCloseOutDevice,
  getCloseOutDevices,
  getClosingBalances,
  getReturnsDue,
  ownerCancelSubscriptionRaw,
  ownerToggleAutoRenewalRaw,
  releaseCloseOutDevice,
  waiveChargeRaw,
} from "../../../utils/closeOutApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";

const DEVICE_LABEL = `${CLOSEOUT_CATALOG_NAME} (SN: ${CLOSEOUT_SERIAL})`;

test.describe("HQ — Restaurant close-out", { tag: "@closeout" }, () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  const runId = generateRunId();
  let adminToken = "";
  let deployed = false;
  let ownerToken = "";
  let restaurantId = "";
  let restaurantName = "";
  let inventoryItemId = "";
  let assignmentId = "";

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    deployed = await probeCloseOut(adminToken);
    if (!deployed) return;

    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId)
      throw new Error("[close-out] could not mint the throwaway restaurant");
    restaurantId = tenant.restaurantId;
    restaurantName = `Automation Owner2 Store ${runId}`;
    ownerToken = tenant.accessToken;

    ({ inventoryItemId } = await ensureCloseOutDevice(adminToken));
    assignmentId = await assignFreeDevice(
      adminToken,
      inventoryItemId,
      restaurantId
    );
  });

  test.afterAll(async () => {
    // Best-effort cleanup; must not mask the results above. Re-login: a raw
    // API token lives 15 minutes and has no refresh path (utils/auth.ts).
    if (!adminToken) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    if (assignmentId)
      await releaseCloseOutDevice(
        adminToken,
        assignmentId,
        inventoryItemId
      ).catch(() => {});
    if (restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    requireRelease("closeOut", deployed);
    await allure.label("feature", "Restaurant close-out");
    await allure.label("severity", "critical");
  });

  test("TC-935: the Deactivate dialog offers pay-or-return per device (return by default) and confirming closes the restaurant out", async ({
    adminPage,
  }) => {
    await allure.description(
      "HQ → Restaurants → row menu → Deactivate loads GET /api/admin/close-out/restaurants/:id/devices and " +
        "lists each RestauNax device under 'RestauNax equipment' with 'Owner returns it' (selected) and " +
        "'Owner keeps it at list price ($…)'. With no live subscription there is no timing choice: " +
        "Deactivate closes out now — PUT /api/admin/restaurants/:id/status carries the RETURN choice and the " +
        "devices endpoint then reports closedOutAt."
    );
    const restaurants = createAdminRestaurantsPage(adminPage);
    await restaurants.goto();
    await restaurants.openRowActionMenu(restaurantName);
    await adminPage
      .getByRole("menuitem", { name: "Deactivate", exact: true })
      .click();
    const dialog = adminPage
      .getByRole("dialog")
      .filter({ hasText: "Deactivate Restaurant" });
    await expect(dialog).toBeVisible();

    const device = dialog.getByRole("radiogroup").filter({
      has: adminPage.getByRole("radio", { name: "Owner returns it" }),
    });
    await allure.step("The device and its two choices", async () => {
      await expect(dialog.getByText("RestauNax equipment")).toBeVisible({
        timeout: 15_000,
      });
      await expect(dialog.getByText(DEVICE_LABEL)).toBeVisible();
      await expect(
        device.getByRole("radio", { name: "Owner returns it" })
      ).toBeChecked();
      await expect(
        device.getByRole("radio", {
          name: /^Owner keeps it at list price \(\$[\d,.]+\)$/,
        })
      ).not.toBeChecked();
    });

    await allure.step("Deactivate → close-out with RETURN", async () => {
      const put = adminPage.waitForResponse(
        (r) =>
          r.request().method() === "PUT" &&
          r.url().endsWith(`/api/admin/restaurants/${restaurantId}/status`)
      );
      await dialog
        .getByRole("button", { name: "Deactivate", exact: true })
        .click();
      const res = await put;
      expect(res.status()).toBe(200);
      expect(res.request().postDataJSON()).toMatchObject({
        field: "isActive",
        value: false,
        equipmentChoices: [{ assignmentId, choice: "RETURN" }],
      });
    });

    await allure.step("The restaurant is closed out", async () => {
      await expect
        .poll(
          async () =>
            (await getCloseOutDevices(adminToken, restaurantId)).closedOutAt,
          { timeout: 20_000 }
        )
        .not.toBeNull();
    });
  });

  test("TC-936: Equipment → Returns due lists the device with its due-back date", async ({
    adminPage,
  }) => {
    await allure.description(
      "A returned-by-default device at a closed restaurant goes on the clock (returnDueAt, 15 business " +
        "days). GET /api/admin/close-out/returns-due groups it under the restaurant, and the 'Returns Due' " +
        "tab of HQ → Finance → Equipment shows the restaurant and the device."
    );
    const group = (await getReturnsDue(adminToken)).find(
      (g) => g.restaurantId === restaurantId
    );
    expect(group?.devices.map((d) => d.assignmentId)).toContain(assignmentId);
    const due = group?.devices.find((d) => d.assignmentId === assignmentId);
    expect(new Date(String(due?.returnDueAt)).getTime()).toBeGreaterThan(
      Date.now()
    );

    await adminPage.goto(
      "/admin?tab=finance&section=equipment&sub=returns-due",
      {
        waitUntil: "domcontentloaded",
      }
    );
    await expect(
      adminPage.getByRole("heading", { name: "Returns due", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    await expect(adminPage.getByText(restaurantName).first()).toBeVisible();
    await expect(adminPage.getByText(DEVICE_LABEL).first()).toBeVisible();
  });

  test("TC-937: Billing Attention → Closing balance lists the closed restaurant", async ({
    adminPage,
  }) => {
    await allure.description(
      "Closed restaurants with money or hardware still to settle are listed by " +
        "GET /api/admin/close-out/closing-balances and in the 'Closing balance' block of HQ → Finance → " +
        "Subscriptions → Billing Attention. A device still out is enough to be listed."
    );
    const items = await getClosingBalances(adminToken);
    expect(items.some((i) => i.restaurantId === restaurantId)).toBe(true);

    await adminPage.goto(
      "/admin?tab=finance&section=subscription&sub=billing-attention",
      { waitUntil: "domcontentloaded" }
    );
    const block = adminPage
      .getByRole("heading", { name: "Closing balance" })
      .locator("xpath=..");
    // Billing Attention renders its blocks after its own list loads, which
    // reads every restaurant's billing state — slower than a plain page.
    await expect(block).toBeVisible({ timeout: 60_000 });
    await expect(block.getByText(restaurantName)).toBeVisible();
  });

  test("TC-938: waiving a charge needs a reason, and only an ADMIN may waive", async () => {
    await allure.description(
      "POST /api/admin/charges/:chargeId/waive (decision D7): no reason → 400 (checked before the charge " +
        "is even looked up, so a placeholder id is safe); the restaurant's owner → 403; an EMPLOYEE (who " +
        "may run every other close-out action) → 403. A real waiver needs a billed charge, i.e. Stripe — " +
        "see the header."
    );
    const placeholder = "00000000-0000-0000-0000-000000000000";

    const noReason = await waiveChargeRaw(adminToken, placeholder);
    expect(noReason.status).toBe(400);
    expect(noReason.data.success).toBe(false);
    expect(String(noReason.data.error)).not.toBe("");

    const blank = await waiveChargeRaw(adminToken, placeholder, "   ");
    expect(blank.status).toBe(400);

    const withReason = await waiveChargeRaw(
      adminToken,
      placeholder,
      "Automation: unknown charge"
    );
    expect(withReason.status).toBe(404);

    const owner = await waiveChargeRaw(ownerToken, placeholder, "x");
    expect(owner.status).toBe(403);

    if (EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD) {
      const employeeToken = (await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD))
        .accessToken;
      const employee = await waiveChargeRaw(employeeToken, placeholder, "x");
      expect(employee.status).toBe(403);
    }
  });

  test("TC-939: the owner can't cancel their own plan — the cancel and auto-renew endpoints are gone", async () => {
    await allure.description(
      "Founder decision 2026-10-23: cancelling is staff-only and always runs the close-out. " +
        "POST /api/subscriptions/restaurants/:id/cancel and …/toggle-auto-renewal no longer exist (404) for " +
        "the restaurant's own owner. Only ever called once the close-out build is confirmed (the gate), on " +
        "the throwaway restaurant."
    );
    const cancel = await ownerCancelSubscriptionRaw(ownerToken, restaurantId);
    expect(cancel.status).toBe(404);
    const toggle = await ownerToggleAutoRenewalRaw(ownerToken, restaurantId);
    expect(toggle.status).toBe(404);
  });
});
