/**
 * api-settings-history.spec.ts — what the settings change history records for
 * holiday hours and the ordering pause (RestauNax #1078 "settings history
 * polish", docs/features/back-office/SETTINGS_SAFETY.md) (TC-968..969).
 * The screen is checked in 32-settings-history-ui.spec.ts (TC-970).
 *
 *   TC-968  Holiday & special hours: adding a date writes ONE "Holiday hours"
 *           row for it; moving it to another date writes a removal and an
 *           addition; deleting it writes a removal. Every sentence is words
 *           (no raw key, no raw timestamp).
 *   TC-969  Pausing and resuming orders writes "Accepting new orders" rows
 *           and never a row for the pause's own timestamp (orderingPausedAt)
 *           or a sentence with a raw timestamp in it.
 *
 * Gated: RELEASED_ON_QA.settingsSafety (the history endpoint). A per-run
 * throwaway owner + restaurant (deleted afterwards). Tag @settings-safety.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  addDays,
  localToday,
  looksLikeKey,
  settingChangesRaw,
  specialHoursRaw,
  type SettingChangeItem,
} from "../../../utils/backOfficeApi";
import {
  probeSettingsSafety,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

test.describe.configure({ mode: "serial" });

test.describe(
  "Settings history — holiday hours and the ordering pause (API)",
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
    let zone = "";

    const changes = async (): Promise<SettingChangeItem[]> => {
      const r = await settingChangesRaw(ownerToken, restaurantId, {
        limit: 100,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      return r.data.data?.items ?? [];
    };
    /** Rows written since `seen` (the history is newest first). */
    const since = async (seen: Set<string>) =>
      (await changes()).filter((c) => !seen.has(c.id));
    const ids = async () => new Set((await changes()).map((c) => c.id));
    const expectWords = (rows: SettingChangeItem[]) => {
      for (const r of rows) {
        expect(looksLikeKey(r.sentence), r.sentence).toBe(false);
        expect(r.sentence, r.sentence).not.toMatch(ISO);
        expect(r.sentence, r.sentence).not.toMatch(/undefined|NaN|null/);
      }
    };

    test.beforeAll(async () => {
      test.setTimeout(120_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId)
        throw new Error("[settings-history] could not mint the tenant");
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      zone = String(
        (await specialHoursRaw(ownerToken, restaurantId, "GET")).data.timeZone
      );
    });

    test.afterAll(async () => {
      if (adminToken && restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    });

    test.beforeEach(async () => {
      requireRelease(
        "settingsSafety",
        await probeSettingsSafety(ownerToken, restaurantId)
      );
      await allure.label("feature", "Settings history");
      await allure.label("severity", "normal");
    });

    test("TC-968: holiday hours — one row per date; a move is a removal and an addition; a delete is a removal", async () => {
      const first = addDays(localToday(zone), 21);
      const moved = addDays(localToday(zone), 22);
      let seen = await ids();
      const created = await specialHoursRaw(
        ownerToken,
        restaurantId,
        "POST",
        undefined,
        { date: first, isClosed: true, note: `Auto ${runId}` }
      );
      expect(created.status, JSON.stringify(created.data)).toBe(201);
      const id = String((created.data.data as Rec | undefined)?.id ?? "");

      let rows = (await since(seen)).filter((c) => c.field === "specialHours");
      expect(rows, JSON.stringify(rows)).toHaveLength(1);
      expect(rows[0]?.area).toBe("hours");
      expect(rows[0]?.sentence).toContain("Holiday hours");
      expectWords(rows);

      seen = await ids();
      const updated = await specialHoursRaw(
        ownerToken,
        restaurantId,
        "PUT",
        id,
        {
          date: moved,
          isClosed: false,
          openingTime: "11:00",
          closingTime: "15:00",
        }
      );
      expect(updated.status, JSON.stringify(updated.data)).toBe(200);
      rows = (await since(seen)).filter((c) => c.field === "specialHours");
      // The old date removed, the new one added.
      expect(rows, JSON.stringify(rows)).toHaveLength(2);
      expectWords(rows);

      seen = await ids();
      const removed = await specialHoursRaw(
        ownerToken,
        restaurantId,
        "DELETE",
        id
      );
      expect(removed.status, JSON.stringify(removed.data)).toBe(200);
      rows = (await since(seen)).filter((c) => c.field === "specialHours");
      expect(rows, JSON.stringify(rows)).toHaveLength(1);
      expectWords(rows);
    });

    test("TC-969: pausing and resuming orders records Accepting new orders, never the pause timestamp", async () => {
      const seen = await ids();
      for (const acceptingOrders of [false, true]) {
        const r = await updateRestaurantSettingsRaw(ownerToken, restaurantId, {
          acceptingOrders,
        });
        expect(r.status, JSON.stringify(r.data)).toBe(200);
      }
      const rows = await since(seen);
      expect(
        rows.filter((c) => c.field === "acceptingOrders"),
        JSON.stringify(rows)
      ).toHaveLength(2);
      expect(
        rows.filter((c) => /orderingPaused/.test(c.field)),
        JSON.stringify(rows)
      ).toHaveLength(0);
      expectWords(rows);
    });
  }
);
