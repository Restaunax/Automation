/**
 * 22-ux-audit-staff-ui.spec.ts — dashboard checks for the UX-audit fixes
 * (restaunax #913) (TC-664..666).
 *
 * Browser. A per-run throwaway owner (loginViaUi) on a restaurant with
 * SCHEDULING + TIP_MANAGEMENT (the most Staff tabs), weekly pay periods and
 * manager-entered hours in the two most recent finished periods:
 *   - the Staff tab bar scrolls to every tab at 1024 px and 390 px, and the
 *     page is never wider than the screen;
 *   - Timecards opens on the OLDEST period still waiting for approval;
 *   - the language picked in the top bar survives a reload (and is saved to
 *     the account).
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
  setFeatureOverrideAdminRaw,
  setOwnerPosPin,
  createStaffJobRaw,
  setMemberJobsRaw,
  putPayrollSettingsRaw,
  payrollRaw,
  usersRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

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

test.describe("Owner — UX-audit fixes in the Staff area (UI)", () => {
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

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const isInView = async (loc: ReturnType<Page["locator"]>) => {
    const box = await loc.boundingBox();
    const bar = await page().getByRole("tablist").first().boundingBox();
    if (!box || !bar) return false;
    return box.x >= bar.x - 8 && box.x + box.width <= bar.x + bar.width + 8;
  };
  const openStaff = async (staffTab?: string) => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=staff${
        staffTab ? `&staffTab=${staffTab}` : ""
      }`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page().getByRole("tab").first()).toBeVisible({
      timeout: 20_000,
    });
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
    const me = await setOwnerPosPin(ownerToken, restaurantId, "8462");
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
    session = await loginViaUi(
      browser,
      tenant.email,
      process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`
    );
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
    test(`TC-664: at ${width}px the Staff tab bar reaches every tab and the page fits the screen`, async () => {
      await page().setViewportSize({ width, height });
      await openStaff();
      const tabs = page().getByRole("tab");
      const count = await tabs.count();
      expect(count).toBeGreaterThanOrEqual(10);
      const next = page().locator(".MuiTabs-scrollButtons").last();
      for (let i = 0; i < count; i++) {
        const tab = tabs.nth(i);
        // Reach it the way a person does: the › arrow when the bar shows
        // arrows (desktop), else swiping the bar (phones hide the arrows).
        for (let step = 0; step < count && !(await isInView(tab)); step++) {
          const arrow =
            (await next.isVisible().catch(() => false)) &&
            !/Mui-disabled/.test((await next.getAttribute("class")) ?? "");
          if (arrow) await next.click();
          else {
            await tab.evaluate((el) =>
              el.scrollIntoView({ inline: "center", block: "nearest" })
            );
            break;
          }
        }
        await expect(tab).toBeInViewport();
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
      }
      const overflow = await page().evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(1);
    });
  }

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
    await page()
      .getByRole("menuitem")
      .filter({ hasText: /Español|Spanish|ES/ })
      .first()
      .click();
    await expect(page().getByRole("tab", { name: "Personas" })).toBeVisible({
      timeout: 15_000,
    });
    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(page().getByRole("tab", { name: "Personas" })).toBeVisible({
      timeout: 20_000,
    });
    // Saved to the account, not just the browser.
    await expect
      .poll(async () =>
        JSON.stringify((await usersRaw<Rec>(ownerToken, "GET", "/me")).data)
      )
      .toContain('"locale":"es"');
  });
});
