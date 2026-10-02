import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerMarketingAutomationsPage } from "../../../pages/dashboard/owner/OwnerMarketingAutomationsPage";
import { readSharedState } from "../../../utils/testData";
import {
  apiLogin,
  getOwnerAutomationSettingsApi,
  setOwnerAutomationEnrollmentApi,
  setOwnerAutomationOptOutApi,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

/**
 * Owner — Automated Marketing portal tab (?tab=marketing-automations).
 *
 * The auto-enroll + opt-out contract: owners are enrolled by default and can
 * pause everything (master switch) or a single program. Every toggle is
 * verified through the settings API and restored, so the seed restaurant's
 * marketing state is unchanged after the run.
 */
test.describe("Owner — Automated Marketing", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Marketing Automations");
    await allure.label("severity", "normal");
  });

  test("TC-206: the deep link renders the section with every program row", async ({
    ownerPage,
  }) => {
    await allure.description(
      "?tab=marketing-automations shows the Automated Marketing section, the master switch, and one row per program from the settings API."
    );
    const { restaurantId } = readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const settings = await getOwnerAutomationSettingsApi(
      accessToken,
      restaurantId
    );

    const portal = createOwnerMarketingAutomationsPage(ownerPage);
    await portal.goto(restaurantId);

    await expect(portal.masterSwitch()).toBeVisible();
    for (const automation of settings.automations) {
      await expect(portal.programName(automation.name)).toBeVisible();
    }
  });

  test("TC-207: the master switch pauses and resumes all automated marketing", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Flipping the master switch persists Restaurant.lifecycleMarketingOptOut (verified via API); the test restores the original state."
    );
    const { restaurantId } = readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const before = await getOwnerAutomationSettingsApi(
      accessToken,
      restaurantId
    );

    const portal = createOwnerMarketingAutomationsPage(ownerPage);
    try {
      await portal.goto(restaurantId);
      await portal.masterSwitch().click();

      await expect
        .poll(async () => {
          const s = await getOwnerAutomationSettingsApi(
            accessToken,
            restaurantId
          );
          return s.lifecycleMarketingOptOut;
        })
        .toBe(!before.lifecycleMarketingOptOut);
    } finally {
      await setOwnerAutomationOptOutApi(
        accessToken,
        restaurantId,
        before.lifecycleMarketingOptOut
      ).catch(() => {});
    }
  });

  test("TC-208: a single program can be paused without touching the others", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Toggling one program row persists that enrollment only (verified via API — the other programs keep their state); restored afterwards."
    );
    const { restaurantId } = readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const before = await getOwnerAutomationSettingsApi(
      accessToken,
      restaurantId
    );
    const target = before.automations[0];
    test.skip(!target, "No automations seeded on QA");
    test.skip(
      before.lifecycleMarketingOptOut,
      "Master opt-out is on — per-program switches are disabled"
    );
    if (!target) return;

    const portal = createOwnerMarketingAutomationsPage(ownerPage);
    try {
      await portal.goto(restaurantId);
      await portal.programSwitch(target.name).click();

      await expect
        .poll(async () => {
          const s = await getOwnerAutomationSettingsApi(
            accessToken,
            restaurantId
          );
          return s.automations.find((a) => a.id === target.id)?.isEnrolled;
        })
        .toBe(!target.isEnrolled);

      const after = await getOwnerAutomationSettingsApi(
        accessToken,
        restaurantId
      );
      for (const other of after.automations.filter((a) => a.id !== target.id)) {
        const original = before.automations.find((a) => a.id === other.id);
        expect(other.isEnrolled).toBe(original?.isEnrolled);
      }
    } finally {
      await setOwnerAutomationEnrollmentApi(
        accessToken,
        restaurantId,
        target.id,
        target.isEnrolled
      ).catch(() => {});
    }
  });
});
