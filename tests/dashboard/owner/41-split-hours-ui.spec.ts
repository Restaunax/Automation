/**
 * 41-split-hours-ui.spec.ts — an owner gives a day two sets of hours (lunch,
 * a break, dinner) in Store Settings → Business hours, and takes one away
 * again (RestauNax feat/split-hours, restaunax docs/features/SPLIT_HOURS.md)
 * (TC-2010..2012). What the server stores and refuses is pinned in
 * api-split-hours.spec.ts (TC-2000..2007).
 *
 *   TC-2010 "Add hours" adds a second row; with no room after 10:00 PM it
 *           comes empty and the day says what is missing (Save disabled). The
 *           owner types lunch 12:00–3:00 PM and dinner 5:00–10:00 PM, sees
 *           what saving does, saves, sees "Business hours updated." and the
 *           change in words in Recent changes. After a reload both rows are
 *           still there. Phone width: both rows reachable, nothing overflows.
 *   TC-2011 Dinner moved into lunch: the day says the hours overlap and Save
 *           is disabled; nothing is saved. At four rows "Add hours" is gone.
 *   TC-2012 Removing the second row leaves one row with no remove button;
 *           saved, and after a reload the day has one window again.
 *
 * Browser. A per-run throwaway owner (createSecondOwner alwaysFresh) signed
 * in through the UI, open 8:00 AM–10:00 PM every day; the restaurant is
 * deleted afterwards. The day edited is three days ahead on the restaurant's
 * calendar, so the save never closes or opens the restaurant right now (that
 * would put a "Save these hours?" confirmation in the way).
 * Gated: RELEASED_ON_QA.splitHours + splitHoursDashboard. Tag @split-hours.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerBusinessHoursPage } from "../../../pages/dashboard/owner/OwnerBusinessHoursPage";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  getBusinessHoursRaw,
  putBusinessHoursRaw,
} from "../../../utils/apiHelper";
import {
  settingChangesRaw,
  specialHoursRaw,
} from "../../../utils/backOfficeApi";
import {
  DAY_NAMES,
  dayNameOfKey,
  localDateKey,
  type DayName,
} from "../../../utils/dealSchedule";
import {
  DESKTOP,
  expectHumanText,
  expectNoHorizontalOverflow,
  expectSeenByUser,
  PHONE,
} from "../../../utils/humanQa";
import {
  probeSplitHours,
  probeSplitHoursDashboard,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const LUNCH = { openingTime: "12:00:00", closingTime: "15:00:00" };
const DINNER = { openingTime: "17:00:00", closingTime: "22:00:00" };
const pm = (hour: string) => ({ hour, minute: "00", meridiem: "PM" as const });

test.describe.configure({ mode: "serial" });

test.describe(
  "Owner — two sets of hours in one day (UI)",
  { tag: "@split-hours" },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let ownerToken = "";
    let restaurantId = "";
    /** The day being edited, e.g. "TUESDAY" / "Tuesday". */
    let day: DayName = "MONDAY";
    let dayTitle = "Monday";
    let session: UiLoginSession | undefined;

    const page = (): Page => {
      if (!session) throw new Error("no browser session");
      return session.page;
    };
    const hours = () => createOwnerBusinessHoursPage(page());
    const savedDay = async () => {
      const res = await getBusinessHoursRaw(ownerToken, restaurantId);
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      const row = (res.data.businessHours ?? []).find((r) => r.day === day);
      if (!row) throw new Error(`[split-hours-ui] no saved row for ${day}`);
      const { openingTime, closingTime, windows } = row;
      return { openingTime, closingTime, windows };
    };
    /** The newest Hours sentence in the settings history. */
    const newestHoursChange = async (): Promise<string> => {
      const res = await settingChangesRaw(ownerToken, restaurantId, {
        area: "hours",
      });
      return String(res.data.data?.items?.[0]?.sentence ?? "");
    };

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(150_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId || !tenant.password)
        throw new Error("[split-hours-ui] could not mint the throwaway tenant");
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      // One window a day, in the shape every backend takes (no `windows` key).
      const seeded = await putBusinessHoursRaw(
        ownerToken,
        restaurantId,
        DAY_NAMES.map((name) => ({
          day: name,
          openingTime: "08:00:00",
          closingTime: "22:00:00",
          isClosed: false,
          is24Hours: false,
        }))
      );
      if (!seeded.ok)
        throw new Error(
          `[split-hours-ui] hours: ${JSON.stringify(seeded.data)}`
        );
      const zone = String(
        (await specialHoursRaw(ownerToken, restaurantId, "GET")).data
          .timeZone ?? ""
      );
      if (!zone) throw new Error("[split-hours-ui] no time zone");
      day = dayNameOfKey(localDateKey(zone, 3));
      dayTitle = `${day[0]}${day.slice(1).toLowerCase()}`;
      session = await loginViaUi(browser, tenant.email, tenant.password);
    });

    test.afterAll(async () => {
      // Best-effort cleanup: neither may mask the test result.
      if (adminToken && restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
      if (session) await session.context.close().catch(() => {});
    });

    test.beforeEach(async () => {
      requireRelease(
        "splitHours",
        await probeSplitHours(ownerToken, restaurantId)
      );
      requireRelease("splitHoursDashboard", await probeSplitHoursDashboard());
      await allure.label("feature", "Split hours (dashboard)");
      await allure.label("severity", "critical");
      await page().setViewportSize(DESKTOP);
    });

    test("TC-2010: the owner adds a second set of hours, saves lunch + dinner, and both are still there after a reload", async () => {
      const editor = hours();
      await editor.goto(restaurantId);

      await allure.step("one set of hours: no remove button", async () => {
        await expect(editor.windowRows(day)).toHaveCount(1);
        expect(await editor.shownWindows(day)).toEqual([
          ["08:00 AM", "10:00 PM"],
        ]);
        await expect(editor.removeHoursButtons(day)).toHaveCount(0);
      });

      await allure.step(
        "Add hours: an empty second row, and the day says what is missing",
        async () => {
          await expectSeenByUser(editor.addHoursButton(day), "Add hours");
          await expect(editor.addHoursButton(day)).toHaveText("Add hours");
          await editor.addHoursButton(day).click();
          await expect(editor.windowRows(day)).toHaveCount(2);
          // The day runs to 10:00 PM: no room for two more hours, so the new
          // row has no times yet.
          expect(await editor.shownWindows(day)).toEqual([
            ["08:00 AM", "10:00 PM"],
            ["", ""],
          ]);
          await expectSeenByUser(editor.problem(day), "what is missing");
          await expect(editor.problem(day)).toHaveText(
            "Give each set of hours an opening and a closing time."
          );
          await expect(editor.saveButton()).toBeDisabled();
          await expect(editor.removeHoursButtons(day)).toHaveCount(2);
        }
      );

      await allure.step(
        "lunch 12:00–3:00 PM, dinner 5:00–10:00 PM",
        async () => {
          await editor.setTime(day, 0, "opening", pm("12"));
          await editor.setTime(day, 0, "closing", pm("03"));
          await editor.setTime(day, 1, "opening", pm("05"));
          await editor.setTime(day, 1, "closing", pm("10"));
          await expect(editor.problem(day)).toHaveCount(0);
          await expect(editor.saveButton()).toBeEnabled();
          // What saving would do right now, before the owner commits to it.
          await expectSeenByUser(editor.preview(), "the save preview");
          await expect(editor.preview()).toContainText("If you save:");
          await expectHumanText(editor.preview(), "the save preview");
        }
      );

      await allure.step("Save hours", async () => {
        const saved = await editor.save();
        expect(saved.status).toBe(200);
        // The editor always sends `windows` (null for a one-window day).
        expect(saved.sent.every((d) => "windows" in d)).toBe(true);
        await expectSeenByUser(
          editor.savedMessage(),
          "'Business hours updated.'"
        );
        await expect(editor.preview()).toHaveCount(0);
        expect(await savedDay()).toEqual({
          openingTime: "12:00:00",
          closingTime: "22:00:00",
          windows: [LUNCH, DINNER],
        });
      });

      await allure.step("Recent changes says it in words", async () => {
        const sentence = await newestHoursChange();
        expect(sentence).toContain(
          `changed ${dayTitle} hours from 08:00–22:00 to 12:00–15:00, 17:00–22:00`
        );
        const line = editor.recentChanges().getByText(sentence);
        await expectSeenByUser(line, "the change in Recent changes");
        await expectHumanText(editor.recentChanges(), "Recent changes");
      });

      await allure.step(
        "after a reload both sets of hours are still shown",
        async () => {
          await editor.goto(restaurantId);
          await expect(editor.windowRows(day)).toHaveCount(2);
          expect(await editor.shownWindows(day)).toEqual([
            ["12:00 PM", "03:00 PM"],
            ["05:00 PM", "10:00 PM"],
          ]);
          await expect(editor.problem(day)).toHaveCount(0);
          await expect(editor.preview()).toHaveCount(0);
          await expectSeenByUser(editor.windowRow(day, 1), "the dinner row");
        }
      );

      await allure.step(
        "phone width: both rows and Add hours reachable, nothing overflows",
        async () => {
          await page().setViewportSize(PHONE);
          await editor.goto(restaurantId);
          await expectSeenByUser(editor.windowRow(day, 0), "the lunch row");
          await expectSeenByUser(editor.windowRow(day, 1), "the dinner row");
          await expectSeenByUser(
            editor.removeHoursButton(day, 1),
            "Remove these hours"
          );
          await expectSeenByUser(editor.addHoursButton(day), "Add hours");
          await expectNoHorizontalOverflow(page(), "Business hours (phone)");
        }
      );
    });

    test("TC-2011: overlapping hours are named on the day and can't be saved; four sets is the limit", async () => {
      const editor = hours();
      await editor.goto(restaurantId);
      const before = await savedDay();
      expect(before.windows, "TC-2010 saved lunch + dinner").toEqual([
        LUNCH,
        DINNER,
      ]);

      await allure.step("dinner opens before lunch closes", async () => {
        await editor.setTime(day, 1, "opening", pm("02"));
        await expectSeenByUser(editor.problem(day), "the overlap message");
        await expect(editor.problem(day)).toHaveText(
          "These hours overlap. Leave a gap between one closing time and the next opening time."
        );
        await expect(editor.saveButton()).toBeDisabled();
      });

      await allure.step(
        "dinner opens the minute lunch closes: still an overlap",
        async () => {
          await editor.setTime(day, 1, "opening", pm("03"));
          await expect(editor.problem(day)).toHaveText(
            "These hours overlap. Leave a gap between one closing time and the next opening time."
          );
          await expect(editor.saveButton()).toBeDisabled();
        }
      );

      await allure.step(
        "a gap again: the message goes and Save comes back",
        async () => {
          await editor.setTime(day, 1, "opening", pm("05"));
          await expect(editor.problem(day)).toHaveCount(0);
          await expect(editor.saveButton()).toBeEnabled();
        }
      );

      await allure.step("four sets of hours: Add hours is gone", async () => {
        await editor.addHoursButton(day).click();
        await editor.addHoursButton(day).click();
        await expect(editor.windowRows(day)).toHaveCount(4);
        await expect(editor.addHoursButton(day)).toHaveCount(0);
        await expect(editor.removeHoursButtons(day)).toHaveCount(4);
        await expect(editor.saveButton()).toBeDisabled();
      });

      expect(await savedDay(), "nothing was saved").toEqual(before);
    });

    test("TC-2012: removing the second set of hours leaves one, saved and still one after a reload", async () => {
      const editor = hours();
      await editor.goto(restaurantId);
      await expect(editor.windowRows(day)).toHaveCount(2);

      await allure.step("Remove these hours on the dinner row", async () => {
        await expect(editor.removeHoursButton(day, 1)).toHaveAccessibleName(
          "Remove these hours"
        );
        await editor.removeHoursButton(day, 1).click();
        await expect(editor.windowRows(day)).toHaveCount(1);
        expect(await editor.shownWindows(day)).toEqual([
          ["12:00 PM", "03:00 PM"],
        ]);
        // One set of hours looks the way it always did.
        await expect(editor.removeHoursButtons(day)).toHaveCount(0);
        await expectSeenByUser(editor.addHoursButton(day), "Add hours");
        await expect(editor.problem(day)).toHaveCount(0);
      });

      await allure.step("Save hours", async () => {
        const saved = await editor.save();
        expect(saved.status).toBe(200);
        await expectSeenByUser(
          editor.savedMessage(),
          "'Business hours updated.'"
        );
        expect(await savedDay()).toEqual({
          openingTime: "12:00:00",
          closingTime: "15:00:00",
          windows: null,
        });
        const sentence = await newestHoursChange();
        expect(sentence).toContain(
          `changed ${dayTitle} hours from 12:00–15:00, 17:00–22:00 to 12:00–15:00`
        );
        await expectSeenByUser(
          editor.recentChanges().getByText(sentence),
          "the change in Recent changes"
        );
      });

      await allure.step(
        "after a reload the day has one set of hours",
        async () => {
          await editor.goto(restaurantId);
          await expect(editor.windowRows(day)).toHaveCount(1);
          expect(await editor.shownWindows(day)).toEqual([
            ["12:00 PM", "03:00 PM"],
          ]);
          await expect(editor.removeHoursButtons(day)).toHaveCount(0);
        }
      );
    });
  }
);
