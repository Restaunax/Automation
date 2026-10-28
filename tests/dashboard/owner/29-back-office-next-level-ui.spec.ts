/**
 * 29-back-office-next-level-ui.spec.ts — a light browser check per new
 * dashboard screen from RestauNax PR #1074 ("back office: the next level")
 * (TC-952..957). The rules themselves are pinned at API level in
 * api-back-office-next-level.spec.ts (TC-943..948); these only prove each
 * screen shows what the server says and that its one button works.
 *
 *   TC-952  Today (the restaurant's landing page) shows "Needs you today"
 *           with the period to approve; its button opens Timecards on it.
 *   TC-953  Staff → Time & pay → Payday: the deadline sentence and the steps.
 *   TC-954  The "Set up your back office" card on Staff shows the next step;
 *           its button opens that step's screen.
 *   TC-955  Store Settings → Ordering & hours → Holiday & special hours lists
 *           a date; Remove deletes it.
 *   TC-956  Store Settings → Recent changes shows the owner's change as one
 *           plain sentence.
 *   TC-957  Owner Settings → "Yesterday at your restaurant" switch saves off
 *           and on.
 *
 * Browser. A per-run throwaway owner (createSecondOwner alwaysFresh) with the
 * SCHEDULING add-on, weekly pay periods and one manager-entered shift in the
 * last finished period, signed in through the UI (loginViaUi). The
 * restaurant is deleted afterwards.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  addDays,
  backOfficeSetupRaw,
  localToday,
  needsYouRaw,
  paydayRaw,
  reportSettingsRaw,
  seedPeriodAwaitingApproval,
  settingChangesRaw,
  specialHoursRaw,
} from "../../../utils/backOfficeApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

test.describe.configure({ mode: "serial" });

test.describe("Owner — back office next level (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  const note = `Auto Holiday ${runId}`;
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  let period = { startDate: "", endDate: "" };
  let specialId = "";

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const portal = (query = "") =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const groupBar = () => page().getByTestId("staff-groups");
  const groupTabs = () =>
    page().locator('[data-testid="staff-groups"] + .MuiTabs-root [role="tab"]');

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[back-office-ui] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const granted = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    if (!granted.ok)
      throw new Error(
        `[back-office-ui] SCHEDULING: ${JSON.stringify(granted.data)}`
      );
    period = await seedPeriodAwaitingApproval(ownerToken, restaurantId, runId);
    // One owner change for Recent changes, one date for Holiday hours.
    const changed = await apiRequestRaw(
      "PUT",
      `/api/restaurantId/${restaurantId}/settings`,
      { autoAcceptOrders: true },
      ownerToken
    );
    if (!changed.ok)
      throw new Error(
        `[back-office-ui] settings: ${JSON.stringify(changed.data)}`
      );
    const zone = String(
      (await specialHoursRaw(ownerToken, restaurantId, "GET")).data.timeZone
    );
    const created = await specialHoursRaw(
      ownerToken,
      restaurantId,
      "POST",
      undefined,
      { date: addDays(localToday(zone), 20), isClosed: true, note }
    );
    specialId = String((created.data.data as Rec | undefined)?.id ?? "");
    if (created.status !== 201)
      throw new Error(
        `[back-office-ui] special hours: ${JSON.stringify(created.data)}`
      );
    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Back office next level (dashboard)");
    await allure.label("severity", "normal");
    await page().setViewportSize({ width: 1280, height: 900 });
  });

  test("TC-952: Today shows Needs you today with the period to approve; its button opens Timecards on that period", async () => {
    const api = await needsYouRaw(ownerToken, restaurantId);
    const item = ((api.data.data as Rec).items as Rec[]).find(
      (i) => i.kind === "PAY_PERIOD_APPROVAL"
    );
    expect(item, JSON.stringify(api.data)).toBeTruthy();

    // No ?tab=: the restaurant opens on Today.
    await page().goto(portal(), { waitUntil: "domcontentloaded" });
    const card = page().getByTestId("needs-you-today");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText("Needs you today")).toBeVisible();
    const row = card.getByTestId("needs-you-PAY_PERIOD_APPROVAL");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(String(item?.title));
    await expect(row).toContainText("Today");

    await row
      .getByRole("button", { name: String(item?.action?.label) })
      .click();
    await expect(page()).toHaveURL(/[?&]tab=staff(&|$)/);
    await expect(page()).toHaveURL(/staffTab=timecards/);
    await expect(page()).toHaveURL(new RegExp(`period=${period.startDate}`));
    await expect(groupTabs().filter({ hasText: "Timecards" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 20_000 }
    );
  });

  test("TC-953: Time & pay → Payday shows the deadline in words and the steps", async () => {
    const api = await paydayRaw(ownerToken, restaurantId, period.startDate);
    const text = String((api.data.data as Rec).deadline?.text ?? "");
    expect(text).not.toBe("");

    await page().goto(portal("?tab=staff&staffTab=timecards"), {
      waitUntil: "domcontentloaded",
    });
    // Reach it the way an owner does: the group, then its tab.
    await groupBar().getByRole("tab", { name: "Time & pay" }).click();
    await groupTabs().filter({ hasText: "Payday" }).click();
    await expect(page()).toHaveURL(/staffTab=payday/);
    await expect(page().getByTestId("payday-deadline")).toHaveText(text, {
      timeout: 20_000,
    });
    await expect(page().locator("#payday-period")).toBeVisible();
    for (const step of [
      "Fix flagged shifts",
      "Approve the hours",
      "Run payroll",
    ])
      await expect(
        page().getByRole("button", { name: new RegExp(step) })
      ).toBeVisible();
  });

  test("TC-954: the Set up your back office card shows the next step and opens it", async () => {
    const api = await backOfficeSetupRaw(ownerToken, restaurantId);
    const data = api.data.data as Rec;
    const next = data.next as string | null;
    expect(next, JSON.stringify(data)).toBeTruthy();
    const step = (data.steps as Rec[]).find((s) => s.id === next) as Rec;

    await page().goto(portal("?tab=staff"), { waitUntil: "domcontentloaded" });
    const card = page().getByTestId("back-office-setup");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText("Set up your back office")).toBeVisible();
    await expect(card).toContainText(`${data.done} of ${data.total} done.`);
    const row = card.getByTestId(`setup-step-${next}`);
    await expect(row).toContainText(String(step.title));
    await row.getByRole("button", { name: "Go there" }).click();
    const link = step.link as { tab: string; params: Record<string, string> };
    if (link.tab === "staff")
      await expect(page()).toHaveURL(
        new RegExp(`staffTab=${link.params.staffTab}`)
      );
    else
      await expect(page()).toHaveURL(
        new RegExp(
          `tab=${encodeURIComponent(link.tab).replace(/%20/g, "(%20|\\+)")}`
        )
      );
  });

  test("TC-955: Holiday & special hours lists the date and Remove deletes it", async () => {
    await page().goto(
      portal(
        "?tab=Store%20Settings&settingsTab=ordering&section=holiday-hours"
      ),
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page().getByText("Holiday & special hours").first()
    ).toBeVisible({ timeout: 20_000 });
    const row = page()
      .getByRole("listitem")
      .filter({ hasText: "Closed all day" });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row).toContainText(note);

    await row.getByRole("button", { name: "Remove" }).click();
    const dialog = page().getByRole("dialog");
    await expect(dialog).toContainText("Remove these special hours?");
    const removed = page().waitForResponse(
      (r) =>
        r.url().includes(`/special-hours/${specialId}`) &&
        r.request().method() === "DELETE"
    );
    await dialog.getByRole("button", { name: "Remove" }).click();
    expect((await removed).status()).toBe(200);
    await expect(page().getByText("Special hours removed")).toBeVisible();
    await expect(row).toHaveCount(0);
    expect(
      (await specialHoursRaw(ownerToken, restaurantId, "GET")).data.data
    ).toEqual([]);
    specialId = "";
  });

  test("TC-956: Recent changes on Store Settings shows the owner's change as one sentence", async () => {
    const api = await settingChangesRaw(ownerToken, restaurantId, {
      area: "ordering",
    });
    const change = (api.data.data?.items ?? []).find(
      (i) => i.field === "autoAcceptOrders"
    );
    expect(change, JSON.stringify(api.data)).toBeTruthy();

    await page().goto(portal("?tab=Store%20Settings&settingsTab=ordering"), {
      waitUntil: "domcontentloaded",
    });
    const panel = page().getByTestId("recent-changes");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(String(change?.sentence))).toBeVisible({
      timeout: 15_000,
    });
  });

  test("TC-957: Owner Settings — the Yesterday at your restaurant switch saves off and on", async () => {
    await page().goto(portal("?tab=Owner%20Settings"), {
      waitUntil: "domcontentloaded",
    });
    const card = page().getByTestId("morning-summary-setting");
    await expect(card).toBeVisible({ timeout: 20_000 });
    // An MUI Switch: a checkbox named by its aria-label.
    const toggle = card.getByRole("checkbox", {
      name: "Yesterday at your restaurant",
    });
    await expect(toggle).toBeChecked();

    for (const want of [false, true]) {
      const saved = page().waitForResponse(
        (r) =>
          r.url().includes(`/owner-settings/reports/${restaurantId}`) &&
          r.request().method() === "PUT"
      );
      await toggle.click();
      expect((await saved).status()).toBe(200);
      if (want) await expect(toggle).toBeChecked();
      else await expect(toggle).not.toBeChecked();
      expect(
        (await reportSettingsRaw(ownerToken, restaurantId)).data.data
          ?.morningSummaryEnabled
      ).toBe(want);
    }
  });
});
