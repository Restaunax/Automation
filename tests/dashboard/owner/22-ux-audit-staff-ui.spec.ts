/**
 * 22-ux-audit-staff-ui.spec.ts — dashboard checks for the UX-audit fixes
 * (restaunax #913) (TC-664..666) and the Stage 6 Staff page (TC-1707).
 *
 * Browser. A per-run throwaway owner (loginViaUi) on a restaurant with
 * SCHEDULING + TIP_MANAGEMENT (the most Staff tabs), weekly pay periods and
 * manager-entered hours in the two most recent finished periods:
 *   - at 1024 px and 390 px every Staff group (People · Schedule · Payday ·
 *     Tips · Settings, back-office audit W0:OB-1 — at most five) and every
 *     tab inside it can be reached and opened, and the page is never wider
 *     than the screen;
 *   - every old ?staffTab= link still lands on its screen in its new place
 *     (roles → the one Permissions screen; settings → Settings), gated by
 *     `RELEASED_ON_QA.staffSetupStage6`;
 *   - Timecards opens on the OLDEST period still waiting for approval;
 *   - the language picked in the top bar survives a reload (and is saved to
 *     the account).
 */
import type { Locator, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  setOwnerPosPin,
  createStaffJobRaw,
  setMemberJobsRaw,
  putPayrollSettingsRaw,
  payrollRaw,
  usersRaw,
  loginRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  probeStaffSetupStage6,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const DAY = 86_400_000;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY)
    .toISOString()
    .slice(0, 10);
const shortDate = (d: string) =>
  new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${d}T00:00:00Z`));

test.describe.configure({ mode: "serial" });

test.describe("Owner — UX-audit fixes in the Staff area (UI) @staff-setup", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  let older = "";
  let ownerEmail = "";
  let ownerPassword = "";

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const openStaff = async (staffTab?: string) => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=staff${
        staffTab ? `&staffTab=${staffTab}` : ""
      }`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page().getByTestId("staff-groups").getByRole("tab").first()
    ).toBeVisible({ timeout: 20_000 });
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[ux-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const f of ["SCHEDULING", "TIP_MANAGEMENT"])
      await setFeatureOverrideAdminRaw(adminToken, restaurantId, f, true);
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });
    const me = await setOwnerPosPin(ownerToken, restaurantId, "8462", {
      clocksIn: true,
    });
    const jobId = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: `Cook ${runId}`,
          defaultHourlyRateCents: 1500,
        })
      ).data.data?.id
    );
    await setMemberJobsRaw(ownerToken, restaurantId, me, [
      { jobId, isPrimary: true },
    ]);
    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    const finished = list(periods.data.data?.periods)
      .filter((p) => p.status === "OPEN")
      .map((p) => String(p.startDate))
      .sort();
    // Hours in the two most recent finished periods: both need approving.
    for (const start of finished.slice(-2)) {
      const d = addDays(start, 2);
      const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
        staffMemberId: me,
        clockInAt: `${d}T14:00:00.000Z`,
        clockOutAt: `${d}T18:00:00.000Z`,
        jobId,
        reason: "Paper sheet",
      });
      if (r.status !== 201)
        throw new Error(`[ux-ui] shift: ${JSON.stringify(r.data)}`);
    }
    older = finished.slice(-2)[0] ?? "";
    ownerEmail = tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`;
    session = await loginViaUi(browser, ownerEmail, ownerPassword);
  });

  test.afterAll(async () => {
    if (ownerToken)
      await usersRaw(ownerToken, "PATCH", "/me/locale", { locale: "en" }).catch(
        () => {}
      );
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "UX audit (dashboard)");
    await allure.label("severity", "normal");
  });

  for (const [width, height] of [
    [1024, 800],
    [390, 844],
  ] as const) {
    test(`TC-664: at ${width}px every Staff group and every tab in it can be reached, and the page fits the screen`, async () => {
      // The People · Schedule · Payday · Tips · Settings layout (W0:OB-1).
      requireRelease(
        "staffSetupStage6",
        await probeStaffSetupStage6(ownerToken, restaurantId)
      );
      await page().setViewportSize({ width, height });
      await openStaff();
      const groupBar = page().getByTestId("staff-groups");
      const groups = groupBar.getByRole("tab");
      // The open group's own tab bar sits right after the group bar.
      const groupTabs = page().locator(
        '[data-testid="staff-groups"] + .MuiTabs-root [role="tab"]'
      );
      // SCHEDULING + TIP_MANAGEMENT: every group, never more than five.
      await expect(groups).toHaveText([
        "People",
        "Schedule",
        "Payday",
        "Tips",
        "Settings",
      ]);
      expect(await groups.count()).toBeLessThanOrEqual(5);
      // Walk a bar from the keyboard: each tab must scroll into view and
      // open. (The ‹ › arrows sit under the fixed top bar once the page has
      // scrolled, which makes them unclickable for automation — not users.)
      const walk = async (tabs: Locator, each?: () => Promise<void>) => {
        const count = await tabs.count();
        await page().evaluate(() => window.scrollTo(0, 0));
        await tabs.first().focus();
        for (let i = 0; i < count; i++) {
          const tab = tabs.nth(i);
          if (i > 0) await page().keyboard.press("ArrowRight");
          await expect(tab).toBeFocused();
          await page().keyboard.press("Enter");
          await expect(tab).toHaveAttribute("aria-selected", "true");
          await page().evaluate(() => window.scrollTo(0, 0));
          // The bar scrolls smoothly to the selected tab; if a re-render
          // interrupts that, swiping the bar (scrollIntoView) still reaches it.
          const shown = await expect(tab)
            .toBeInViewport({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (!shown)
            await tab.evaluate((el) =>
              el.scrollIntoView({ inline: "center", block: "nearest" })
            );
          await expect(tab).toBeInViewport();
          if (each) await each();
        }
        return count;
      };
      let reached = 0;
      await walk(groups, async () => {
        const focused = await groups.evaluateAll((els) =>
          els.findIndex((el) => el.getAttribute("aria-selected") === "true")
        );
        // A one-screen group (People with Timecards) has no bar of its own:
        // the group tab opens its screen.
        if (focused === 0) {
          await expect(groupTabs).toHaveCount(0);
          reached += 1;
          return;
        }
        await expect(groupTabs.first()).toBeVisible({ timeout: 10_000 });
        // Focus moves into the group's own bar, then back to the groups.
        reached += await walk(groupTabs);
        await groups.nth(focused).focus();
      });
      // People 1 · Schedule 2 (Schedule, Requests) · Payday 3 (Timecards,
      // Payday, Labor) · Tips 2 · Settings 6 (Pay & overtime, Jobs & wages,
      // Permissions, Schedule settings, Sick time & PTO, Employer group).
      expect(reached).toBe(14);
      const overflow = await page().evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(1);
    });
  }

  // Every Staff tab id a link, email or bookmark ever used → where it lands
  // now (group, then the open tab; null = a one-screen group). With
  // Timecards, the plain Shifts list is Timecards and break types live in
  // Pay & overtime.
  const DEEP_LINKS: [string, string, string | null][] = [
    ["people", "People", null],
    ["shifts", "Payday", "Timecards"],
    ["timecards", "Payday", "Timecards"],
    ["payday", "Payday", "Payday"],
    ["labor", "Payday", "Labor"],
    ["schedule", "Schedule", "Schedule"],
    ["requests", "Schedule", "Requests"],
    ["tips", "Tips", "Tips"],
    ["tipPolicy", "Tips", "Tip policy"],
    ["payrollSettings", "Settings", "Pay & overtime"],
    ["breaks", "Settings", "Pay & overtime"],
    ["jobs", "Settings", "Jobs & wages"],
    ["roles", "Settings", "Permissions"],
    ["permissions", "Settings", "Permissions"],
    ["scheduleSettings", "Settings", "Schedule settings"],
    ["sickTime", "Settings", "Sick time & PTO"],
    ["employer", "Settings", "Employer group"],
    ["settings", "Settings", "Pay & overtime"],
  ];

  test("TC-1707: every old ?staffTab= link still lands on its screen in the new layout", async () => {
    requireRelease(
      "staffSetupStage6",
      await probeStaffSetupStage6(ownerToken, restaurantId)
    );
    test.setTimeout(180_000);
    await page().setViewportSize({ width: 1280, height: 900 });
    const selectedSub = page().locator(
      '[data-testid="staff-groups"] + .MuiTabs-root [role="tab"][aria-selected="true"]'
    );
    for (const [staffTab, group, tab] of DEEP_LINKS) {
      await openStaff(staffTab);
      await expect(
        page()
          .getByTestId("staff-groups")
          .getByRole("tab", { name: group, exact: true }),
        `?staffTab=${staffTab} opens ${group}`
      ).toHaveAttribute("aria-selected", "true");
      if (tab)
        await expect(
          selectedSub,
          `?staffTab=${staffTab} opens ${tab}`
        ).toContainText(tab);
    }
    // roles and permissions both open the ONE Permissions screen (W0:J1-b):
    // roles and the discount & void rules together.
    await openStaff("roles");
    const screen = page().getByTestId("staff-permissions");
    await expect(screen).toBeVisible({ timeout: 15_000 });
    await expect(screen.getByTestId("permissions-roles")).toBeVisible();
    await expect(screen.getByTestId("permissions-rules")).toBeVisible();
  });

  test("TC-665: Timecards opens on the oldest period still waiting for approval", async () => {
    await page().setViewportSize({ width: 1280, height: 900 });
    await openStaff("timecards");
    const picker = page().locator("#pay-period");
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await expect(picker).toContainText(shortDate(older), { timeout: 15_000 });
  });

  test("TC-666: the language picked in the top bar survives a reload", async () => {
    await openStaff();
    await page()
      .getByRole("button", { name: "Select Language" })
      .first()
      .click();
    // The choice is saved to the account (PATCH /api/users/me/locale);
    // reload only once that has answered, as a person would.
    const saved = page().waitForResponse(
      (r) =>
        r.url().includes("/api/users/me/locale") &&
        r.request().method() === "PATCH"
    );
    await page()
      .getByRole("menuitem")
      .filter({ hasText: /Español|Spanish|ES/ })
      .first()
      .click();
    expect((await saved).status()).toBe(200);
    await expect(page().getByRole("tab", { name: "Personas" })).toBeVisible({
      timeout: 15_000,
    });
    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(page().getByRole("tab", { name: "Personas" })).toBeVisible({
      timeout: 20_000,
    });
    // Saved to the account, not just the browser: a fresh sign-in says es.
    await expect
      .poll(async () => (await loginRaw(ownerEmail, ownerPassword)).data.locale)
      .toBe("es");
  });
});
