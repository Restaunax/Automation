/**
 * 03-review-the-week.spec.ts — "a week in a restaurant", part 3: the owner
 * reviews last week's timecards, fixes what's flagged and approves the pay
 * period, in the browser (TC-1001..1007). docs/COVERAGE_MAP.md §3, phase 4.
 *
 * One throwaway restaurant (Eastern Time) with weekly pay periods from a
 * Sunday and one break rule: a 30-minute unpaid meal break is due after 5
 * hours (waivable). Last week, from the paper sheet (manager entries):
 *
 *   Dee (Server, her own $13.00)  Mon, Thu, Fri, Sat 11:00–19:00 with the
 *                                 meal break (7.5 h each)
 *                                 Tue 11:00–19:00, no break (missed break)
 *                                 Wed 11:00 – Thu 03:00 (forgot to clock out:
 *                                 long shift + missed break)
 *   Ben (Busser, $12.00)          Fri 18:00–22:00
 *
 * W3:C2/C3: the restaurant is in Miami ($15.00 full minimum wage, $11.98
 * tipped cash wage, a CONFIRMED rule). Both are tipped jobs paid below
 * $15.00, so a tip credit is taken; nobody received tips that week, so the
 * weekly make-up tops them up to $15.00 an hour, and overtime is figured
 * on the $15.00 regular rate (cash + tip credit). Their pay is therefore
 * exactly $15.00 an hour + half of it on overtime hours.
 *
 *   TC-1001 Today: "2 timecards need fixing"; Fix timecards opens last week
 *           with only what needs review, and Approve waits.
 *   TC-1002 Dee is 40:00 + 14:00 overtime = $915.00 before the fixes;
 *           Tuesday says Missed break, Wednesday Missed break and Long shift.
 *   TC-1002b Typed-in shifts don't say "Edited"; Wednesday's clock-out reads
 *           "3:00 AM (Thu)"; Correct as is offers a fitting example.
 *   TC-1003 Wednesday's clock-out: no reason is refused in the dialog; with
 *           one (left at 3:30) she is 40:00 + 2:30 = $656.25.
 *   TC-1004 Tuesday is confirmed as is with a reason; nothing is left to
 *           review and the period is ready to approve.
 *   TC-1005 Approve: "Pay period approved" is seen; the period is locked,
 *           still after a reload; 44:00 + 2:30, $716.25 in all.
 *   TC-1006 Reopen with no reason is refused in the dialog; it stays
 *           approved.
 *   TC-1007 The Labor report for the week agrees with the timecards, by
 *           person and by job.
 *
 * TC-1002b and TC-1007 guard bugs RestauNax #1099 fixed (on QA 2026-10-29).
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
  putPayrollSettingsRaw,
  payrollRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { addDays, specialHoursRaw } from "../../../utils/backOfficeApi";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectSeenByUser,
} from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const REASON = "Entered from the paper sheet";

type Rec = Record<string, LooseJson>;

/** "Tue, Oct 20" — how the timecards name a day. */
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** "Oct 20" */
const shortDay = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** Minutes the zone is ahead of UTC at noon on `date`. */
const offsetMinutes = (zone: string, date: string) => {
  const noon = new Date(`${date}T12:00:00Z`);
  const p: Record<string, string> = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(noon)
      .map((x) => [x.type, x.value])
  );
  const n = (k: string) => Number(p[k] ?? 0);
  const local = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute")
  );
  return (local - noon.getTime()) / 60_000;
};

test.describe.configure({ mode: "serial" });

test.describe("Journey 3 — the owner reviews and approves last week", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let deviceId = "";
  let zone = "";
  /** Last week's Sunday: the finished pay period. */
  let p1 = "";
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const portal = (query = "") =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const day = (n: number) => addDays(p1, n);
  /** A restaurant-local time as an instant. */
  const at = (date: string, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const utc = Date.UTC(
      +date.slice(0, 4),
      +date.slice(5, 7) - 1,
      +date.slice(8, 10),
      h,
      m
    );
    return new Date(utc - offsetMinutes(zone, date) * 60_000).toISOString();
  };
  const snackbar = (text: string | RegExp) =>
    page().locator(".MuiSnackbar-root").filter({ hasText: text });
  const personRow = (name: string): Locator =>
    page().getByRole("row", {
      name: new RegExp(`^Show or hide ${name}'s shifts ${name} `),
    });
  const shiftRow = (date: string): Locator =>
    page().getByRole("row", { name: new RegExp(`^${dayLabel(date)} `) });
  const approve = () =>
    page().getByRole("button", { name: "Approve period", exact: true });
  const openTimecards = async () => {
    await page().goto(portal(`?tab=staff&staffTab=timecards&period=${p1}`), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page().getByRole("combobox", {
        name: `${dayLabel(p1)} – ${dayLabel(day(6))}`,
      })
    ).toBeVisible({ timeout: 25_000 });
  };
  const shiftAction = async (date: string, action: string) => {
    await shiftRow(date).getByRole("button", { name: "Shift actions" }).click();
    await page().getByRole("menuitem", { name: action }).click();
    return activeDialog(page());
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[journey-3] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    const owner = tenant.accessToken;
    for (const feature of ["PAYROLL", "SCHEDULING", "TIP_MANAGEMENT"]) {
      const granted = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!granted.ok)
        throw new Error(
          `[journey-3] ${feature}: ${JSON.stringify(granted.data)}`
        );
    }
    zone = String(
      (await specialHoursRaw(owner, restaurantId, "GET")).data.timeZone
    );

    const saved = await putPayrollSettingsRaw(owner, restaurantId, {
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
      breaks: {
        types: [
          {
            id: "meal",
            name: "Meal break",
            expectedMinutes: 30,
            isPaid: false,
          },
          { id: "rest", name: "Rest break", expectedMinutes: 10, isPaid: true },
        ],
        rules: [
          { breakTypeId: "meal", afterHours: 5, repeat: false, waivable: true },
        ],
        convertPaidOverageToUnpaid: false,
      },
    });
    if (!saved.ok)
      throw new Error(`[journey-3] settings: ${JSON.stringify(saved.data)}`);
    const periods = await payrollRaw(
      owner,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    const finished = (
      ((periods.data.data as Rec | undefined)?.periods as Rec[]) ?? []
    )
      .filter((p) => p.status === "OPEN")
      .map((p) => String(p.startDate))
      .sort();
    p1 = finished.at(-1) ?? "";
    if (!p1)
      throw new Error(
        `[journey-3] no finished period: ${JSON.stringify(periods.data)}`
      );

    const job = async (name: string, cents: number) => {
      const r = await createStaffJobRaw(owner, restaurantId, {
        name,
        defaultHourlyRateCents: cents,
        isTipped: true,
      });
      if (r.status !== 201)
        throw new Error(`[journey-3] job: ${JSON.stringify(r.data)}`);
      return String(r.data.data?.id);
    };
    const server = await job("Server", 1200);
    // At least the $11.98 tipped cash wage (W3:C3: $11.00 is refused).
    const busser = await job("Busser", 1200);

    // People are added on the register, as the POS does it.
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-wk-${runId}`
    );
    deviceId = device.id;
    const tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(owner, restaurantId, "8462");
    const ownerSession = await tabletStaffSignIn(tablet, ownerMember, "8462");
    const person = async (firstName: string, lastName: string, pin: string) => {
      const r = await tabletRaw<Rec>(
        tablet,
        "POST",
        "/staff/manage",
        { firstName, lastName, pin },
        ownerSession
      );
      if (r.status !== 201)
        throw new Error(`[journey-3] staff: ${JSON.stringify(r.data)}`);
      return String((r.data.data as Rec).id);
    };
    const dee = await person("Dee", "Server", "4826");
    const ben = await person("Ben", "Busser", "5207");
    await setMemberJobsRaw(owner, restaurantId, dee, [
      { jobId: server, isPrimary: true, hourlyRateCents: 1300 },
    ]);
    await setMemberJobsRaw(owner, restaurantId, ben, [
      { jobId: busser, isPrimary: true },
    ]);

    const shift = async (
      who: string,
      jobId: string,
      inDay: string,
      inAt: string,
      outDay: string,
      outAt: string
    ) => {
      const r = await payrollRaw(owner, restaurantId, "POST", "/shifts", {
        staffMemberId: who,
        clockInAt: at(inDay, inAt),
        clockOutAt: at(outDay, outAt),
        jobId,
        reason: REASON,
      });
      if (r.status !== 201)
        throw new Error(`[journey-3] shift: ${JSON.stringify(r.data)}`);
      return String((r.data.data as Rec).id);
    };
    for (const n of [1, 4, 5, 6]) {
      const id = await shift(dee, server, day(n), "11:00", day(n), "19:00");
      const meal = await payrollRaw(
        owner,
        restaurantId,
        "POST",
        `/shifts/${id}/breaks`,
        {
          breakTypeId: "meal",
          startAt: at(day(n), "14:00"),
          endAt: at(day(n), "14:30"),
          reason: REASON,
        }
      );
      if (meal.status !== 201)
        throw new Error(`[journey-3] break: ${JSON.stringify(meal.data)}`);
    }
    await shift(dee, server, day(2), "11:00", day(2), "19:00");
    await shift(dee, server, day(3), "11:00", day(4), "03:00");
    await shift(ben, busser, day(5), "18:00", day(5), "22:00");

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Journey — review and approve the week");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1001: Today says 2 timecards need fixing; Fix timecards opens last week, and Approve waits", async () => {
    await page().goto(portal(), { waitUntil: "domcontentloaded" });
    const card = page().getByTestId("needs-you-today");
    await expect(card).toBeVisible({ timeout: 25_000 });
    await expect(
      card.getByRole("heading", { name: "2 timecards need fixing" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText(
      `Fix them to approve ${shortDay(p1)} – ${shortDay(day(6))}. Payroll uses these hours.`
    );
    await card.getByRole("button", { name: "Fix timecards" }).click();

    await expect(page()).toHaveURL(/staffTab=timecards/);
    await expect(page()).toHaveURL(new RegExp(`period=${p1}`));
    await expect(
      page().getByRole("switch", { name: "Needs review only" })
    ).toBeChecked({ timeout: 20_000 });
    await expectSeenByUser(
      page().getByText(
        "2 shifts need review before you can approve this period."
      ),
      "why Approve waits"
    );
    await expect(approve()).toBeDisabled();
  });

  test("TC-1002: before the fixes Dee is 40:00 + 14:00 overtime, $915.00; Tuesday and Wednesday say why", async () => {
    await expect(personRow("Dee Server")).toHaveAccessibleName(
      /Dee Server 40:00 14:00 .*0:00 \$915\.00 2 to review$/
    );
    const tue = shiftRow(day(2));
    await expect(tue).toHaveAccessibleName(
      new RegExp(`^${dayLabel(day(2))} 11:00 AM 7:00 PM Server 8:00 `)
    );
    await expect(tue.getByText("Missed break", { exact: true })).toBeVisible();
    const wed = shiftRow(day(3));
    await expect(wed).toHaveAccessibleName(
      // Out on the next day says which (RestauNax #1099).
      new RegExp(
        `^${dayLabel(day(3))} 11:00 AM 3:00 AM \\(${dayLabel(day(4)).slice(0, 3)}\\) Server 16:00 `
      )
    );
    await expect(wed.getByText("Missed break", { exact: true })).toBeVisible();
    await expect(wed.getByText("Long shift", { exact: true })).toBeVisible();
    await expectHumanText(page().getByRole("main"), "the timecards");
  });

  test("TC-1002b: shifts typed in from the paper sheet don't say Edited; Wednesday's clock-out names Thursday; the reason example fits", async () => {
    const wed = shiftRow(day(3));
    await expect(wed.getByRole("cell").nth(2)).toHaveText(
      `3:00 AM (${dayLabel(day(4)).slice(0, 3)})`
    );
    // Nobody corrected these: a manager wrote them in.
    for (const date of [day(2), day(3)])
      await expect(
        shiftRow(date).getByText("Edited", { exact: true })
      ).toHaveCount(0);
    const dialog = await shiftAction(day(2), "Correct as is");
    await expect(
      dialog.getByRole("textbox", { name: "Reason" })
    ).toHaveAttribute("placeholder", "e.g. Took the meal break off the clock");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("TC-1003: Wednesday's clock-out is corrected with a reason; Dee is 40:00 + 2:30, $656.25", async () => {
    const dialog = await shiftAction(day(3), "Edit times or job");
    await expect(dialog).toHaveAccessibleName(
      `Correct Dee Server's shift — ${dayLabel(day(3))}`
    );
    await expect(
      dialog.getByText(/^Times are in the restaurant's time zone \(.+\)\.$/)
    ).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: "Clock out" })
    ).toHaveValue(`${day(4)}T03:00`);
    await dialog
      .getByRole("textbox", { name: "Clock out" })
      .fill(`${day(3)}T15:30`);
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expectSeenByUser(
      dialog.getByText("Enter a reason for this change."),
      "the missing-reason message"
    );

    await dialog
      .getByRole("textbox", { name: "Reason" })
      .fill("Forgot to clock out, left at 3:30");
    await save.click();
    await expect(dialog).toBeHidden();
    await expectSeenByUser(
      snackbar("Timecard updated."),
      '"Timecard updated."'
    );
    await expect(personRow("Dee Server")).toHaveAccessibleName(
      /Dee Server 40:00 2:30 .*0:00 \$656\.25 1 to review$/
    );
    // Fixed, so it leaves the review list.
    await expect(shiftRow(day(3))).toHaveCount(0);
    await expect(
      page().getByText(
        "1 shift needs review before you can approve this period."
      )
    ).toBeVisible();
  });

  test("TC-1004: Tuesday is confirmed as is with a reason; the period is ready to approve", async () => {
    const dialog = await shiftAction(day(2), "Correct as is");
    await expect(dialog).toHaveAccessibleName(
      `Confirm Dee Server's shift is correct — ${dayLabel(day(2))}`
    );
    await expect(
      dialog.getByText(
        "The shift stays as it is and stops blocking approval. Say why it's correct."
      )
    ).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Reason" })
      .fill("Took her meal break off the clock");
    await dialog.getByRole("button", { name: "Correct as is" }).click();
    await expect(dialog).toBeHidden();
    await expectSeenByUser(
      snackbar("Timecard updated."),
      '"Timecard updated."'
    );
    await expect(
      page().getByText("Nothing needs review in this pay period.")
    ).toBeVisible();
    await expect(page().getByText("Ready to approve")).toBeVisible();
    await expect(approve()).toBeEnabled();
  });

  test("TC-1005: Approve locks the period, still after a reload; 44:00 + 2:30, $716.25 in all", async () => {
    await page().getByRole("switch", { name: "Needs review only" }).click();
    await expect(
      page().getByRole("row", { name: /^Total 44:00 2:30 0:00 \$716\.25/ })
    ).toBeVisible();
    await expect(personRow("Ben Busser")).toHaveAccessibleName(
      /Ben Busser 4:00 0:00 0:00 \$60\.00/
    );

    await approve().click();
    await expectSeenByUser(
      snackbar("Pay period approved. Its timecards are now locked."),
      '"Pay period approved"'
    );
    const locked = page().getByText(
      "This pay period is approved and locked. Reopen it to make corrections."
    );
    await expect(locked).toBeVisible();
    await expect(approve()).toHaveCount(0);

    await openTimecards();
    await expect(locked).toBeVisible();
    await expect(page().getByText("Approved", { exact: true })).toBeVisible();
    await expect(
      page().getByRole("button", { name: "Reopen period" })
    ).toBeVisible();
  });

  test("TC-1006: reopening without a reason is refused in the dialog; the period stays approved", async () => {
    await page().getByRole("button", { name: "Reopen period" }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Reopen this pay period");
    await expect(dialog).toContainText(
      "Its timecards unlock so you can correct them."
    );
    await dialog.getByRole("button", { name: "Reopen period" }).click();
    await expectSeenByUser(
      dialog.getByText("Enter a reason for this change."),
      "the missing-reason message"
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page().getByText(
        "This pay period is approved and locked. Reopen it to make corrections."
      )
    ).toBeVisible();
  });

  test("TC-1007: the Labor report for the week agrees with the timecards", async () => {
    // Typing the dates left "Pick a valid date range" on screen for a valid
    // week (a half-typed date's request answered last): RestauNax #1099.
    await page().goto(portal("?tab=staff&staffTab=labor"), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page().getByRole("columnheader", { name: "Wage cost" })
    ).toBeVisible({ timeout: 25_000 });
    // Type the week the way an owner does: From, then To.
    const typeDate = async (field: number, date: string) => {
      await page()
        .getByRole("spinbutton", { name: "Month" })
        .nth(field)
        .click();
      await page().keyboard.type(
        `${date.slice(5, 7)}${date.slice(8, 10)}${date.slice(0, 4)}`
      );
    };
    await typeDate(0, p1);
    await typeDate(1, day(6));

    await page().getByRole("button", { name: "By person" }).click();
    const table = page()
      .getByRole("table")
      .filter({ has: page().getByRole("columnheader", { name: "Person" }) });
    await expect(
      table.getByRole("row", { name: "Dee Server 40.00 2.50 0.00 $656.25" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      table.getByRole("row", { name: "Ben Busser 4.00 0.00 0.00 $60.00" })
    ).toBeVisible();
    await expect(
      table.getByRole("row", { name: "Total 44.00 2.50 0.00 $716.25" })
    ).toBeVisible();

    await page().getByRole("button", { name: "By job" }).click();
    const byJob = page()
      .getByRole("table")
      .filter({ has: page().getByRole("columnheader", { name: "Job" }) });
    await expect(
      byJob.getByRole("row", { name: "Server 40.00 2.50 0.00 $656.25" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      byJob.getByRole("row", { name: "Busser 4.00 0.00 0.00 $60.00" })
    ).toBeVisible();
  });
});
