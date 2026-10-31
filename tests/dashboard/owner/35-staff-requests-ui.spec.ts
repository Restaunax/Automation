/**
 * 35-staff-requests-ui.spec.ts — the owner answers staff requests in the
 * dashboard: time off, a shift trade, a change of availability
 * (docs/COVERAGE_MAP.md G13) (TC-1081..1085).
 *
 * The API rules are TC-543..552 (api-staff-requests); inviting staff and
 * publishing a first shift in the browser is the journey (TC-984..987). This
 * is the owner's inbox, in the browser, the way they use it.
 *
 * A per-run throwaway restaurant with SCHEDULING. Ana and Bo claim their
 * invites from Mailpit into real accounts (the staff app's identity) and
 * work as Servers. Ana is on Tue and Thu evenings; Bo too on Tuesday. From
 * Restaunax Staff (its API): Ana asks for Tuesday off ("wedding"), releases
 * Thursday ("exam") and Bo picks it up; Bo asks to have Sundays off.
 *
 *   TC-1081 The inbox: "Requests 3" waiting — Ana's day off with the shift
 *           it lands on, the trade Ana → Bo, Bo's Sundays "Asked for /
 *           Now".
 *   TC-1082 Ana's day off is approved with a note: "Approved. They have
 *           been told.", 2 left, and Ana sees the decision and the note.
 *   TC-1083 The trade is approved: Thursday's shift is Bo's on the
 *           schedule.
 *   TC-1084 Bo's Sundays are denied with a reason; Bo sees it.
 *   TC-1085 Nothing is waiting; Decided lists the three decisions.
 *
 * Skips without ADMIN creds or Mailpit (the invite token only travels by
 * email).
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  registerWithInvite,
  inviteStaffRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  createShiftRaw,
  publishScheduleRaw,
  getScheduleWeekRaw,
  staffAppRaw,
} from "../../../utils/apiHelper";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectSeenByUser,
} from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

/** "YYYY-MM-DD" n days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** 18:00–22:00 UTC on a date: the same local day in every US timezone. */
const evening = (date: string) => ({
  startAt: `${date}T18:00:00.000Z`,
  endAt: `${date}T22:00:00.000Z`,
});

type Rec = Record<string, unknown>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("Staff requests in the dashboard (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );
  test.skip(
    !MAILPIT,
    "Requires Mailpit (MAILPIT_BASE_URL): the invite token travels by email"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let jobId = "";
  let session: UiLoginSession | undefined;
  const ana = {
    email: "",
    token: "",
    staffMemberId: "",
    shiftOff: "",
    shiftGive: "",
  };
  const bo = { email: "", token: "", staffMemberId: "" };
  const OFF_DATE = day(10);
  // Never a Sunday: Bo asks for Sundays off, and must still take this one.
  const GIVE_DATE = [12, 13]
    .map(day)
    .find((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) as string;
  let timeOffId = "";

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const openRequests = async () => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=staff&staffTab=requests`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page().getByRole("button", { name: "Decided" })).toBeVisible({
      timeout: 25_000,
    });
  };
  /** The card under a section heading (Time off / Shift changes / …). */
  const section = (title: string) =>
    page()
      .getByRole("heading", { name: title, exact: true })
      .locator("xpath=..");
  /** Decide the request in a section through its dialog. */
  const decide = async (
    title: string,
    act: "Approve" | "Deny",
    note: string
  ) => {
    await section(title).getByRole("button", { name: act }).first().click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName(`${act} this request?`);
    await dialog
      .getByRole("textbox", {
        name:
          act === "Approve"
            ? "Note to them (optional)"
            : "Tell them why (optional)",
      })
      .fill(note);
    await dialog.getByRole("button", { name: act }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expectSeenByUser(
      page()
        .getByText(
          act === "Approve"
            ? "Approved. They have been told."
            : "Denied. They have been told."
        )
        .first(),
      `"${act}d. They have been told."`
    );
  };

  /** Invite → email → claim: a staff member with a real account. */
  const hire = async (
    who: { email: string; token: string; staffMemberId: string },
    first: string,
    last: string
  ) => {
    who.email = `auto-staff-${first.toLowerCase()}-${runId}@${DOMAIN}`;
    recordUserForCleanup(who.email);
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: who.email,
      firstName: first,
      lastName: last,
    });
    expect(invited.status, JSON.stringify(invited.data)).toBe(201);
    who.staffMemberId = String(invited.data.data?.staffMemberId ?? "");
    const mail = await waitForEmail(who.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    const token = extractInviteToken(mail.text_body || mail.html_body);
    const claimed = await registerWithInvite({
      firstName: first,
      lastName: last,
      email: who.email,
      password: `Automation!Staff-${runId}`,
      userInvitationToken: token,
    });
    who.token = claimed.accessToken;
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[staff-requests-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    if (!g.ok)
      throw new Error(
        `[staff-requests-ui] SCHEDULING: ${JSON.stringify(g.data)}`
      );
    await hire(ana, "Ana", "Ruiz");
    await hire(bo, "Bo", "Lee");
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Server ${runId}`,
      defaultHourlyRateCents: 1500,
      isTipped: true,
    });
    jobId = String(job.data.data?.id ?? "");
    for (const p of [ana, bo]) {
      const set = await setMemberJobsRaw(
        ownerToken,
        restaurantId,
        p.staffMemberId,
        [{ jobId, isPrimary: true }]
      );
      if (!set.ok) throw new Error("[staff-requests-ui] job not assigned");
    }
    const shift = async (staffMemberId: string, date: string) => {
      const r = await createShiftRaw(ownerToken, restaurantId, {
        staffMemberId,
        jobId,
        ...evening(date),
      });
      if (r.status !== 201)
        throw new Error(`[staff-requests-ui] shift: ${JSON.stringify(r.data)}`);
      return String(r.data.data?.shift.id ?? "");
    };
    ana.shiftOff = await shift(ana.staffMemberId, OFF_DATE);
    await shift(bo.staffMemberId, OFF_DATE);
    ana.shiftGive = await shift(ana.staffMemberId, GIVE_DATE);
    for (const d of new Set([OFF_DATE, GIVE_DATE])) {
      const p = await publishScheduleRaw(ownerToken, restaurantId, d, "NONE");
      if (!p.ok)
        throw new Error(
          `[staff-requests-ui] publish: ${JSON.stringify(p.data)}`
        );
    }

    // From Restaunax Staff: a day off, a trade, a change of availability.
    const off = await staffAppRaw<{ data: Rec }>(
      ana.token,
      "POST",
      `/restaurants/${restaurantId}/time-off`,
      {
        startDate: OFF_DATE,
        endDate: OFF_DATE,
        type: "UNPAID",
        note: "wedding",
      }
    );
    if (off.status !== 201)
      throw new Error(
        `[staff-requests-ui] time off: ${JSON.stringify(off.data)}`
      );
    timeOffId = String(off.data.data.id);
    const released = await staffAppRaw(
      ana.token,
      "POST",
      `/restaurants/${restaurantId}/shifts/${ana.shiftGive}/release`,
      { note: "exam" }
    );
    const taken = await staffAppRaw(
      bo.token,
      "POST",
      `/restaurants/${restaurantId}/shifts/${ana.shiftGive}/pick-up`
    );
    if (released.status !== 201 || taken.status !== 200)
      throw new Error("[staff-requests-ui] trade not set up");
    const weekly = Array.from({ length: 7 }, () => ({
      allDayUnavailable: false,
      unavailable: [] as { start: string; end: string }[],
      preferred: [] as { start: string; end: string }[],
    }));
    weekly[0]!.allDayUnavailable = true; // Sundays off
    const avail = await staffAppRaw(
      bo.token,
      "PUT",
      `/restaurants/${restaurantId}/availability`,
      { weekly, effectiveFrom: day(0) }
    );
    if (avail.status !== 200)
      throw new Error(
        `[staff-requests-ui] availability: ${JSON.stringify(avail.data)}`
      );

    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Staff requests");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1081: three requests wait — the day off with its shift, the trade, the Sundays", async () => {
    await openRequests();
    await expect(page().getByRole("tab", { name: "Requests 3" })).toBeVisible();
    await expect(
      page().getByRole("button", { name: "Waiting (3)" })
    ).toHaveAttribute("aria-pressed", "true");
    const timeOff = section("Time off");
    await expect(timeOff).toContainText("Ana Ruiz");
    await expect(timeOff).toContainText("Unpaid time off");
    await expect(timeOff).toContainText("“wedding”");
    await expect(timeOff.getByRole("alert")).toContainText(
      "Already scheduled for 1 shift:"
    );
    const trade = section("Shift changes");
    await expect(trade).toContainText("Ana Ruiz → Bo Lee");
    await expect(trade).toContainText("“exam”");
    const avail = section("Availability");
    await expect(avail).toContainText("Bo Lee");
    await expect(
      avail.getByRole("row", { name: "Sun Unavailable all day Available" })
    ).toBeVisible();
    await expectHumanText(page().getByRole("main"), "the requests inbox");
  });

  test("TC-1082: Ana's day off is approved with a note, and she sees it", async () => {
    await openRequests();
    await decide("Time off", "Approve", "Enjoy the wedding");
    await expect(
      page().getByRole("button", { name: "Waiting (2)" })
    ).toBeVisible();
    const mine = await staffAppRaw<{ data: { requests: Rec[] } }>(
      ana.token,
      "GET",
      `/restaurants/${restaurantId}/time-off`
    );
    expect(
      mine.data.data.requests.find((r) => r.id === timeOffId)
    ).toMatchObject({ status: "APPROVED", decisionNote: "Enjoy the wedding" });
    // Approving never removes the shift: the schedule flags it instead.
    const week = await getScheduleWeekRaw(ownerToken, restaurantId, OFF_DATE);
    expect(
      list(week.data.data?.warnings).some(
        (w) => w.code === "TIME_OFF" && w.shiftId === ana.shiftOff
      )
    ).toBe(true);
  });

  test("TC-1083: the trade is approved — Thursday's shift is Bo's", async () => {
    await openRequests();
    await decide("Shift changes", "Approve", "Thanks Bo");
    const week = await getScheduleWeekRaw(ownerToken, restaurantId, GIVE_DATE);
    const moved = list(week.data.data?.shifts).find(
      (s) => s.id === ana.shiftGive
    );
    expect(moved?.staffMemberId).toBe(bo.staffMemberId);
  });

  test("TC-1084: Bo's Sundays are denied with a reason, and Bo sees it", async () => {
    await openRequests();
    await decide("Availability", "Deny", "We need you on Sundays");
    const mine = await staffAppRaw<{ data: Rec }>(
      bo.token,
      "GET",
      `/restaurants/${restaurantId}/availability`
    );
    // Nothing new applies: the request is decided, with the reason.
    expect(mine.data.data).toMatchObject({
      pending: null,
      lastDecided: {
        status: "DENIED",
        decisionNote: "We need you on Sundays",
      },
    });
  });

  test("TC-1085: nothing is waiting; Decided lists the three decisions", async () => {
    await openRequests();
    await expect(page().getByText("Nothing is waiting for you.")).toBeVisible();
    // The red count is gone (a zero badge is hidden on screen).
    await expect(
      page()
        .getByRole("tab", { name: /^Requests( 0)?$/ })
        .locator(".MuiBadge-invisible")
    ).toHaveCount(1);
    await page().getByRole("button", { name: "Decided" }).click();
    const main = page().getByRole("main");
    await expect(main).toContainText("Note: Enjoy the wedding");
    await expect(main).toContainText("Note: Thanks Bo");
    await expect(main).toContainText("Note: We need you on Sundays");
  });
});
