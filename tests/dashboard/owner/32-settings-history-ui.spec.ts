/**
 * 32-settings-history-ui.spec.ts — an owner adds holiday hours and sees the
 * change in Recent changes (RestauNax #1078 settings history polish)
 * (TC-970). What the history records is pinned in
 * api-settings-history.spec.ts (TC-968..969).
 *
 *   TC-970  Store Settings → Holiday & special hours: "Add a date" can't save
 *           without a date; Cancel and Escape close it and add nothing; with
 *           a date it saves, the owner sees "Special hours saved" on screen,
 *           the list shows the date without a reload, and Recent changes on
 *           the same page (filtered to Hours) shows one "Holiday hours"
 *           sentence in words, also without a reload. Phone width: Add
 *           and the list are reachable, nothing overflows.
 *
 *   TC-971  KNOWN PRODUCT BUG (expected to fail, runs first on the fresh
 *           restaurant): after the FIRST holiday, Recent changes on the same
 *           page keeps saying "No changes recorded yet" until a reload. Marked
 *           test.fail(); once fixed it reports "passed unexpectedly": remove
 *           the mark.
 *
 * Browser. A per-run throwaway owner (createSecondOwner alwaysFresh) signed
 * in through the UI; the restaurant is deleted afterwards. Gated:
 * RELEASED_ON_QA.settingsSafety. Tag @settings-safety.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
} from "../../../utils/apiHelper";
import {
  addDays,
  localToday,
  settingChangesRaw,
  specialHoursRaw,
} from "../../../utils/backOfficeApi";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectNoHorizontalOverflow,
  expectSeenByUser,
  PHONE,
} from "../../../utils/humanQa";
import {
  probeSettingsSafety,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

test.describe(
  "Owner — holiday hours in Recent changes (UI)",
  { tag: "@settings-safety" },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
    );

    const runId = generateRunId();
    const note = `Auto ${runId}`;
    let adminToken = "";
    let ownerToken = "";
    let restaurantId = "";
    let zone = "";
    let session: UiLoginSession | undefined;

    const page = (): Page => {
      if (!session) throw new Error("no browser session");
      return session.page;
    };
    const portal = (query: string) =>
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
    const openHoliday = async () => {
      await page().goto(
        portal(
          "?tab=Store%20Settings&settingsTab=ordering&section=holiday-hours"
        ),
        { waitUntil: "domcontentloaded" }
      );
      await expect(
        page().getByText("Holiday & special hours").first()
      ).toBeVisible({ timeout: 25_000 });
    };
    const stored = async () =>
      ((await specialHoursRaw(ownerToken, restaurantId, "GET")).data
        .data as unknown[]) ?? [];

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(150_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId || !tenant.password)
        throw new Error("[history-ui] could not mint the throwaway tenant");
      restaurantId = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      zone = String(
        (await specialHoursRaw(ownerToken, restaurantId, "GET")).data.timeZone
      );
      session = await loginViaUi(browser, tenant.email, tenant.password);
    });

    test.afterAll(async () => {
      if (adminToken && restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
      if (session) await session.context.close().catch(() => {});
    });

    test.beforeEach(async () => {
      requireRelease(
        "settingsSafety",
        await probeSettingsSafety(ownerToken, restaurantId)
      );
      await allure.label("feature", "Settings history (dashboard)");
      await allure.label("severity", "normal");
      await page().setViewportSize(DESKTOP);
    });

    test("TC-971: the first holiday shows in Recent changes on the same page without a reload (known bug)", async () => {
      test.fail(
        true,
        "Product bug: on a restaurant with no history yet, Recent changes keeps saying 'No changes recorded yet' after the owner saves a holiday on the same page; only a reload shows the line (reproduced 2/2 on QA 2026-10-28)"
      );
      await openHoliday();
      const panel = page().getByTestId("recent-changes");
      await expect(panel).toBeVisible({ timeout: 20_000 });
      await expect(panel).toContainText("No changes recorded yet");
      const day = addDays(localToday(zone), 20);
      const [y, m, d] = day.split("-");
      await page().getByRole("button", { name: "Add a date" }).click();
      const dialog = activeDialog(page());
      await dialog.locator(".MuiPickersSectionList-root").click();
      await page().keyboard.type(`${m}${d}${y}`, { delay: 60 });
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(page().getByRole("dialog")).toHaveCount(0);
      await expect(panel.getByText("Holiday hours")).toHaveCount(1, {
        timeout: 15_000,
      });
    });

    test("TC-970: add a holiday — Cancel/Escape add nothing; Save shows the date and one Holiday hours line in Recent changes", async () => {
      const already = (await stored()).length;
      await openHoliday();
      const add = page().getByRole("button", { name: "Add a date" });

      // Cancel and Escape close it and add nothing.
      await add.click();
      let dialog = activeDialog(page());
      await expect(dialog).toContainText("Add holiday or special hours");
      await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(page().getByRole("dialog")).toHaveCount(0);
      await add.click();
      await expect(activeDialog(page())).toBeVisible();
      await page().keyboard.press("Escape");
      await expect(page().getByRole("dialog")).toHaveCount(0);
      expect(await stored(), "nothing was added").toHaveLength(already);

      // With a date it saves.
      const day = addDays(localToday(zone), 21);
      const [y, m, d] = day.split("-");
      await add.click();
      dialog = activeDialog(page());
      await dialog.locator(".MuiPickersSectionList-root").click();
      await page().keyboard.type(`${m}${d}${y}`, { delay: 60 });
      await dialog.locator("#special-hours-note").fill(note);
      const save = dialog.getByRole("button", { name: "Save" });
      await expect(save).toBeEnabled();
      const saved = page().waitForResponse(
        (r) =>
          r.url().includes(`/special-hours`) && r.request().method() === "POST"
      );
      await save.click();
      expect((await saved).status()).toBe(201);
      await expect(page().getByRole("dialog")).toHaveCount(0);
      await expectSeenByUser(
        page().getByText("Special hours saved").first(),
        "'Special hours saved'"
      );
      // The list shows it without a reload.
      const row = page().getByRole("listitem").filter({ hasText: note });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("Closed all day");
      await expectHumanText(row, "the holiday row");

      // Recent changes: one Holiday hours sentence, in words.
      const api = await settingChangesRaw(ownerToken, restaurantId, {
        area: "hours",
      });
      const lines = (api.data.data?.items ?? []).filter(
        (i) => i.field === "specialHours"
      );
      // One per saved date (TC-971's and this one), newest first.
      expect(lines, JSON.stringify(api.data)).toHaveLength(already + 1);
      // On the page the owner is on (filtered to Hours), after a reload
      // (refresh without one is TC-971's known bug).
      await page().reload({ waitUntil: "domcontentloaded" });
      const panel = page().getByTestId("recent-changes");
      await expect(panel).toBeVisible({ timeout: 20_000 });
      const line = panel.getByText(String(lines[0]?.sentence));
      await expectSeenByUser(line, "the Holiday hours line");
      await expect(line).toContainText("Holiday hours");
      await expectHumanText(panel, "Recent changes");

      // Phone width: Add and the list are reachable, nothing overflows.
      await page().setViewportSize(PHONE);
      await openHoliday();
      await expectSeenByUser(
        page().getByRole("button", { name: "Add a date" }),
        "Add a date at phone width"
      );
      await expectSeenByUser(
        page().getByRole("listitem").filter({ hasText: note }),
        "the holiday row at phone width"
      );
      await expectNoHorizontalOverflow(
        page(),
        "Holiday & special hours (phone)"
      );
    });
  }
);
