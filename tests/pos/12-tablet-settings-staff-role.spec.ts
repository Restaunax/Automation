/**
 * 12-tablet-settings-staff-role.spec.ts — who may change store settings from
 * the POS (TC-949..951). RestauNax PR #1074, SETTINGS_SAFETY.md §2 "The POS
 * contract":
 *
 *   PUT /api/tablet/settings (device token)
 *   - with an X-Staff-Session whose person lacks MANAGE_DEVICE_SETTINGS (a
 *     plain STAFF member) → 403 { error: "STAFF_CAPABILITY_REQUIRED",
 *     capability: "MANAGE_DEVICE_SETTINGS", message } and nothing is written;
 *   - EXCEPT a body with only acceptingOrders / orderingPausedForDayClose /
 *     orderingAutoResumeAt (pause or resume online ordering): allowed for
 *     whoever is working, and recorded in the change history by name;
 *   - a manager session may change device settings (recorded as STAFF);
 *   - no staff session at all (old POS builds) is still accepted and recorded
 *     as "changed on a device" (DEVICE).
 *
 * Own tenant: an admin-minted throwaway OWNER (createSecondOwner alwaysFresh),
 * one POS device, the owner's MANAGER PIN session and a minted STAFF-role
 * member. The device is deactivated and the restaurant deleted afterwards.
 * Select with `--grep @settings-safety`.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createPinStaffTabletRaw,
  createSecondOwner,
  createTabletDevice,
  deactivateTabletDevice,
  deleteTestRestaurant,
  getTabletSettingsRaw,
  setOwnerPosPin,
  tabletLogin,
  tabletStaffSignIn,
} from "../../utils/apiHelper";
import {
  looksLikeKey,
  settingChangesRaw,
  type SettingChangeItem,
} from "../../utils/backOfficeApi";
import { probeSettingsSafety, requireRelease } from "../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const REFUSAL = "Your role can't change store settings. Ask a manager.";

test.describe.configure({ mode: "serial" });

test.describe(
  "POS — store settings need a role that may change them",
  { tag: "@settings-safety" },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let ownerToken = "";
    let restaurantId = "";
    let deviceId = "";
    let deviceName = "";
    let tabletToken = "";
    let managerSession = "";
    let staffSession = "";
    const staffName = `Pat Plain${runId}`;

    const putSettings = (body: Record<string, unknown>, session?: string) =>
      apiRequestRaw<{
        success?: boolean;
        error?: string;
        capability?: string;
        message?: string;
      }>(
        "PUT",
        "/api/tablet/settings",
        body,
        tabletToken,
        session ? { "X-Staff-Session": session } : undefined
      );
    const deviceSetting = async (key: string): Promise<unknown> => {
      const r = await getTabletSettingsRaw(tabletToken);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const settings = (r.data as { settings?: Record<string, unknown> })
        .settings;
      return settings?.[key];
    };
    const changes = async (): Promise<SettingChangeItem[]> => {
      const r = await settingChangesRaw(ownerToken, restaurantId, {
        limit: 50,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      return r.data.data?.items ?? [];
    };

    test.beforeAll(async () => {
      test.setTimeout(120_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId)
        throw new Error("[pos-settings] could not mint the throwaway tenant");
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      const device = await createTabletDevice(
        ownerToken,
        restaurantId,
        `Automation Settings POS ${runId}`
      );
      deviceId = device.id;
      deviceName = device.name;
      tabletToken = await tabletLogin(device.name, device.code);
      const managerId = await setOwnerPosPin(ownerToken, restaurantId, "8462");
      managerSession = await tabletStaffSignIn(tabletToken, managerId, "8462");
      const minted = await createPinStaffTabletRaw(
        tabletToken,
        managerSession,
        {
          firstName: "Pat",
          lastName: `Plain${runId}`,
          pin: "5931",
          staffRole: "STAFF",
        }
      );
      const staffId = (minted.data as { data?: { id?: string } }).data?.id;
      if (!minted.ok || !staffId)
        throw new Error(
          `[pos-settings] could not mint a STAFF member: ${JSON.stringify(minted.data)}`
        );
      staffSession = await tabletStaffSignIn(tabletToken, staffId, "5931");
    });

    test.afterAll(async () => {
      if (adminToken && restaurantId) {
        if (deviceId)
          await deactivateTabletDevice(adminToken, restaurantId, deviceId);
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
      }
    });

    test.beforeEach(async () => {
      await allure.label("feature", "Settings Safety (POS)");
      await allure.label("severity", "critical");
      requireRelease(
        "settingsSafety",
        await probeSettingsSafety(ownerToken, restaurantId)
      );
    });

    test("TC-949: a plain staff member can't change device settings from the POS (403 STAFF_CAPABILITY_REQUIRED); nothing is written", async () => {
      const before = await deviceSetting("autoPrintReceipts");
      for (const body of [
        { autoPrintReceipts: !before },
        // Mixing a pause with a setting is still a settings change.
        { acceptingOrders: false, autoPrintReceipts: !before },
      ]) {
        const r = await putSettings(body, staffSession);
        expect(r.status, JSON.stringify(body)).toBe(403);
        expect(r.data).toEqual({
          success: false,
          error: "STAFF_CAPABILITY_REQUIRED",
          capability: "MANAGE_DEVICE_SETTINGS",
          message: REFUSAL,
        });
      }
      expect(await deviceSetting("autoPrintReceipts")).toBe(before);
      expect(await deviceSetting("acceptingOrders")).toBe(true);
      expect(
        (await changes()).filter((c) => c.actorName === staffName)
      ).toEqual([]);
    });

    test("TC-950: anyone signed in may pause and resume online ordering; the history names them and the device", async () => {
      const paused = await putSettings(
        { acceptingOrders: false },
        staffSession
      );
      expect(paused.status, JSON.stringify(paused.data)).toBe(200);
      expect(await deviceSetting("acceptingOrders")).toBe(false);

      // The Open-day resume after a day close sends all three fields.
      const resumed = await putSettings(
        {
          acceptingOrders: true,
          orderingPausedForDayClose: false,
          orderingAutoResumeAt: null,
        },
        staffSession
      );
      expect(resumed.status, JSON.stringify(resumed.data)).toBe(200);
      expect(await deviceSetting("acceptingOrders")).toBe(true);

      const rows = (await changes()).filter(
        (c) => c.field === "acceptingOrders" && c.actorName === staffName
      );
      // Newest first: the resume, then the pause.
      expect(rows.map((c) => c.newValue)).toEqual([true, false]);
      for (const row of rows) {
        expect(row).toMatchObject({
          area: "ordering",
          actorType: "STAFF",
          deviceName,
          source: "pos",
        });
        expect(row.sentence).toContain(staffName);
        expect(row.sentence).toContain(deviceName);
        expect(looksLikeKey(row.sentence)).toBe(false);
      }
      expect(rows[1]?.sentence).toContain("turned off");
      expect(rows[0]?.sentence).toContain("turned on");
    });

    test("TC-951: a manager may change device settings (recorded by name); an old POS build without a staff session is recorded as the device", async () => {
      const before = Boolean(await deviceSetting("autoPrintReceipts"));
      const byManager = await putSettings(
        { autoPrintReceipts: !before },
        managerSession
      );
      expect(byManager.status, JSON.stringify(byManager.data)).toBe(200);
      expect(await deviceSetting("autoPrintReceipts")).toBe(!before);

      const byDevice = await putSettings({ autoPrintReceipts: before });
      expect(byDevice.status, JSON.stringify(byDevice.data)).toBe(200);
      expect(await deviceSetting("autoPrintReceipts")).toBe(before);

      const rows = (await changes()).filter(
        (c) => c.field === "autoPrintReceipts"
      );
      expect(rows.slice(0, 2)).toMatchObject([
        {
          actorType: "DEVICE",
          actorName: null,
          deviceName,
          source: "pos",
          newValue: before,
        },
        {
          actorType: "STAFF",
          actorName: "Auto SecondOwner",
          deviceName,
          source: "pos",
          newValue: !before,
        },
      ]);
      expect(rows[0]?.sentence).toContain("(no one signed in)");
    });
  }
);
