/**
 * api-settings-safety.spec.ts — RestauNax setup fields are HQ-only
 * (RestauNax feat/ux-round3a, docs/features/back-office/SETTINGS_SAFETY.md §4).
 *
 * TC-942: on PUT /restaurant/:id/basic-info an OWNER token that CHANGES the
 * time zone gets 403 HQ_ONLY_FIELDS with the resolved message, and nothing is
 * written; sending back the current value still succeeds; an ADMIN token may
 * change it.
 *
 * Gated: until the change is deployed `GET /api/restaurantId/:id/settings/setup`
 * answers 404 and the test SKIPS (RELEASED_ON_QA.settingsSafety). On an older
 * build the owner's change would really go through, so nothing is written
 * before the probe passes. Select with `--grep @settings-safety`.
 *
 * Data: a fresh owner + restaurant (deleted afterwards).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
  restaurantBasicInfoRaw,
} from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";
import {
  probeSettingsSafety,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe(
  "Owner — RestauNax-only setup fields",
  { tag: "@settings-safety" },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own tenant)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let ownerToken = "";
    let restaurantId = "";

    test.beforeAll(async () => {
      test.setTimeout(120_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId)
        throw new Error(
          "[settings-safety] could not mint the throwaway tenant"
        );
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
    });

    test.afterAll(async () => {
      if (restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    });

    test.beforeEach(async () => {
      await allure.label("feature", "Settings Safety");
      await allure.label("severity", "critical");
    });

    test("TC-942: an owner can't change the time zone (403 HQ_ONLY_FIELDS); echoing it works; an admin can", async () => {
      requireRelease(
        "settingsSafety",
        await probeSettingsSafety(ownerToken, restaurantId)
      );

      const readZone = async (): Promise<string | null> => {
        const r = await apiRequestRaw<{
          restaurant?: { timezone?: string | null };
        }>(
          "GET",
          `/restaurant/restaurantId/${restaurantId}`,
          undefined,
          ownerToken
        );
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        return r.data.restaurant?.timezone ?? null;
      };
      const current = await readZone();
      const target =
        current === "America/Chicago" ? "America/Denver" : "America/Chicago";

      // Owner CHANGES it: refused with the resolved message, nothing written.
      const owner = await restaurantBasicInfoRaw(ownerToken, restaurantId, {
        timezone: target,
      });
      expect(owner.status, JSON.stringify(owner.data)).toBe(403);
      const body = owner.data as {
        success?: boolean;
        error?: string;
        fields?: string[];
        message?: string;
      };
      expect(body.success).toBe(false);
      expect(body.error).toBe("HQ_ONLY_FIELDS");
      expect(body.fields).toEqual(["timezone"]);
      expect(body.message).toBe(
        "Only RestauNax can change this — contact support."
      );
      expect(await readZone()).toBe(current);

      // Owner sends back the current value (dialogs echo the form): accepted.
      const echo = await restaurantBasicInfoRaw(ownerToken, restaurantId, {
        timezone: current,
      });
      expect(echo.status, JSON.stringify(echo.data)).toBe(200);

      // Admin changes it: accepted and stored.
      const admin = await restaurantBasicInfoRaw(adminToken, restaurantId, {
        timezone: target,
      });
      expect(admin.status, JSON.stringify(admin.data)).toBe(200);
      expect(await readZone()).toBe(target);
    });
  }
);
