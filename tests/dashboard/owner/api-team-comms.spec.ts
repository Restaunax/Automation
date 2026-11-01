/**
 * api-team-comms.spec.ts — RestauNax back-office audit, growth track B
 * (bo1031/growthb): mobile clock-in from the staff app (W0:MF-6,
 * TC-1790..1796) and one-way staff announcements with read receipts
 * (W0:MF-10, TC-1797..1803).
 *
 * restaunax docs/features/back-office/MOBILE_CLOCK_IN.md and
 * STAFF_ANNOUNCEMENTS.md. The accepted punches (inside the fence, breaks,
 * clock-out, the MOBILE / OUTSIDE_GEOFENCE timecard flags) need a phone
 * standing at the restaurant, so on QA this file proves the settings and
 * every refusal; restaunax `teamComms.int.test.ts` proves the accepted path.
 *
 * No browser. A per-run throwaway restaurant in Miami created WITH
 * coordinates (so the fence has an origin), SCHEDULING + TIMECARDS, one job
 * ("Driver"), and two people with real accounts (invite → Mailpit →
 * register): Dee holds the Driver job (the staff-app user) and Mia is made a
 * manager. A second throwaway restaurant has TIMECARDS turned off (the
 * paywall check). Both restaurants are deleted at the end; before that, the
 * mobile clock-in settings are put back to off and every announcement this
 * file created is archived (QA is left as found).
 *
 * Gating: needs admin credentials (it mints its own tenants) and Mailpit (the
 * invites travel by email) — FAILS, never skips, without them. Gated by
 * `RELEASED_ON_QA.teamCommsGrowthB` until the change is on QA (probe:
 * `GET /api/staff/announcements/:id`). Serial. Tag: @team-comms.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import {
  probeTeamCommsGrowthB,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  createStaffJobRaw,
  deleteTestRestaurant,
  inviteStaffRaw,
  registerWithInvite,
  setFeatureOverrideAdminRaw,
  setMemberJobsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

/** The restaurant's address (downtown Miami); 0.001° of latitude ≈ 111 m. */
const HOME = { latitude: 25.7743, longitude: -80.1937 };
/** ~5.5 km north of the restaurant: outside any allowed radius. */
const FAR = { latitude: HOME.latitude + 0.05, longitude: HOME.longitude };

/** API text is resolved server-side, never an i18n key (CLAUDE.md). */
const isText = (s: unknown) => {
  expect(typeof s).toBe("string");
  expect(String(s).length).toBeGreaterThan(0);
  expect(String(s)).not.toMatch(/^(api|error|email):/);
};

test.describe.configure({ mode: "serial" });

test.describe("Team comms — mobile clock-in + staff announcements (API) @team-comms", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let bareOwnerToken = "";
  let bareRestaurantId = "";
  let driverJobId = "";
  let released = false;
  const dee = {
    email: `auto-comms-dee-${runId}@${DOMAIN}`,
    password: `Automation!Staff-${runId}`,
    staffId: "",
    token: "",
  };
  const mia = {
    email: `auto-comms-mia-${runId}@${DOMAIN}`,
    password: `Automation!Mgr-${runId}`,
    staffId: "",
    token: "",
  };
  const createdAnnouncements: string[] = [];
  let ownerAnnId = "";
  let managerAnnId = "";

  const call = (
    token: string,
    method: string,
    path: string,
    body?: unknown,
    lang = "en"
  ) =>
    apiRequestRaw<Rec>(method, path, body, token, { "Accept-Language": lang });
  const settingsUrl = () =>
    `/api/staff/payroll/${restaurantId}/mobile-clock-in`;
  const clockUrl = (p = "") =>
    `/api/staff-app/restaurants/${restaurantId}/clock${p}`;
  const annUrl = (p = "", rid = restaurantId) =>
    `/api/staff/announcements/${rid}${p}`;
  const inboxUrl = (p = "") =>
    `/api/staff-app/restaurants/${restaurantId}/announcements${p}`;
  const meRow = async (token: string) => {
    const me = await call(token, "GET", "/api/staff-app/me");
    expect(me.status, JSON.stringify(me.data)).toBe(200);
    return list(me.data.data?.restaurants).find(
      (r) => r.restaurantId === restaurantId
    );
  };

  /** Invite → Mailpit → register; returns the staff row id and a token. */
  const hire = async (
    person: { email: string; password: string },
    firstName: string,
    lastName: string
  ) => {
    recordUserForCleanup(person.email);
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: person.email,
      firstName,
      lastName,
    });
    if (invited.status !== 201)
      throw new Error(
        `[api-team-comms] invite: ${JSON.stringify(invited.data)}`
      );
    const staffId = String(invited.data.data?.staffMemberId ?? "");
    const mail = await waitForEmail(person.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    const reg = await registerWithInvite({
      firstName,
      lastName,
      email: person.email,
      password: person.password,
      userInvitationToken: extractInviteToken(mail.text_body || mail.html_body),
    });
    return { staffId, token: reg.accessToken };
  };

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "[api-team-comms] ADMIN_EMAIL / ADMIN_PASSWORD must be set: this file mints its own tenants"
      );
    }
    if (!MAILPIT) {
      throw new Error(
        "[api-team-comms] MAILPIT_BASE_URL must be set: the staff invites travel by email"
      );
    }
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;

    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
      restaurant: { latitude: HOME.latitude, longitude: HOME.longitude },
    });
    if (!tenant.restaurantId) throw new Error("[api-team-comms] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const feature of ["SCHEDULING", "TIMECARDS"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!g.ok)
        throw new Error(
          `[api-team-comms] grant ${feature}: ${JSON.stringify(g.data)}`
        );
    }

    // A restaurant without the add-on (TIMECARDS comes with SCHEDULING).
    const bare = await createSecondOwner(adminToken, `${runId}b`, {
      alwaysFresh: true,
    });
    if (!bare.restaurantId) throw new Error("[api-team-comms] no bare tenant");
    bareRestaurantId = bare.restaurantId;
    bareOwnerToken = bare.accessToken;
    for (const feature of ["SCHEDULING", "TIMECARDS"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        bareRestaurantId,
        feature,
        false
      );
      if (!g.ok)
        throw new Error(
          `[api-team-comms] revoke ${feature}: ${JSON.stringify(g.data)}`
        );
    }

    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Driver ${runId}`,
      defaultHourlyRateCents: 1600,
    });
    if (job.status !== 201 && job.status !== 200)
      throw new Error(`[api-team-comms] job: ${JSON.stringify(job.data)}`);
    driverJobId = String(job.data.data?.id ?? "");

    const d = await hire(dee, "Dee", "Driver");
    dee.staffId = d.staffId;
    dee.token = d.token;
    const jobs = await setMemberJobsRaw(ownerToken, restaurantId, dee.staffId, [
      { jobId: driverJobId, isPrimary: true },
    ]);
    if (!jobs.ok)
      throw new Error(`[api-team-comms] jobs: ${JSON.stringify(jobs.data)}`);

    const m = await hire(mia, "Mia", "Manager");
    mia.staffId = m.staffId;
    const made = await call(
      ownerToken,
      "POST",
      `/restaurant/${restaurantId}/staff/managers`,
      { staffMemberId: mia.staffId }
    );
    if (made.status !== 200)
      throw new Error(`[api-team-comms] manager: ${JSON.stringify(made.data)}`);
    // A fresh sign-in carries the promoted account.
    mia.token = (await apiLogin(mia.email, mia.password)).accessToken;

    released = await probeTeamCommsGrowthB(ownerToken, restaurantId);
  });

  test.afterAll(async () => {
    if (released && ownerToken && restaurantId) {
      // Leave QA as found: mobile clock-in off, our announcements archived.
      await call(ownerToken, "PUT", settingsUrl(), {
        enabled: false,
        jobIds: [],
        roleIds: [],
        radiusMeters: 150,
        allowOutsideGeofence: false,
      }).catch(() => {});
      for (const id of createdAnnouncements)
        await call(ownerToken, "PATCH", annUrl(`/${id}`), {
          archived: true,
          pinned: false,
        }).catch(() => {});
    }
    if (adminToken) {
      for (const rid of [restaurantId, bareRestaurantId])
        if (rid) await deleteTestRestaurant(adminToken, rid).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Team comms");
    await allure.label("severity", "critical");
    requireRelease("teamCommsGrowthB", released);
  });

  // ── W0:MF-6 mobile clock-in ───────────────────────────────────────────────

  test("TC-1790: mobile clock-in is off by default (150 m fence, 50–2000 m), and the restaurant has a location", async () => {
    const res = await call(ownerToken, "GET", settingsUrl());
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.data).toMatchObject({
      enabled: false,
      jobIds: [],
      roleIds: [],
      radiusMeters: 150,
      allowOutsideGeofence: false,
      hasRestaurantLocation: true,
      minRadiusMeters: 50,
      maxRadiusMeters: 2000,
    });
  });

  test("TC-1791: the owner changes the radius; a radius outside 50–2000, a fraction or a foreign job is 400 with text", async () => {
    for (const bad of [
      { radiusMeters: 5 },
      { radiusMeters: 2001 },
      { radiusMeters: 120.5 },
      { jobIds: ["not-a-job"] },
      { enabled: "yes" },
    ]) {
      const res = await call(ownerToken, "PUT", settingsUrl(), bad);
      expect(res.status, `${JSON.stringify(bad)} → ${res.status}`).toBe(400);
      expect(res.data.success).toBe(false);
      isText(res.data.message);
    }
    const ok = await call(ownerToken, "PUT", settingsUrl(), {
      radiusMeters: 300,
    });
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(ok.data.data).toMatchObject({ enabled: false, radiusMeters: 300 });
    isText(ok.data.message);
    const read = await call(ownerToken, "GET", settingsUrl());
    expect(read.data.data.radiusMeters).toBe(300);
    // Back to the default for the fence checks below.
    const back = await call(ownerToken, "PUT", settingsUrl(), {
      radiusMeters: 150,
    });
    expect(back.status).toBe(200);
    expect(back.data.data.radiusMeters).toBe(150);
  });

  test("TC-1792: a manager cannot change the mobile clock-in settings (403); nothing changes", async () => {
    const res = await call(mia.token, "PUT", settingsUrl(), { enabled: true });
    expect(res.status, JSON.stringify(res.data)).toBe(403);
    expect(res.data.success).toBe(false);
    const read = await call(ownerToken, "GET", settingsUrl());
    expect(read.data.data.enabled).toBe(false);
  });

  test("TC-1793: while it is off, the staff app's clock says NOT_ENABLED with a message; /me says no phone clock-in", async () => {
    const res = await call(dee.token, "GET", clockUrl());
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.data).toMatchObject({
      available: false,
      reason: "NOT_ENABLED",
    });
    isText(res.data.data.message);
    const row = await meRow(dee.token);
    expect(row?.mobileClockIn).toBe(false);
  });

  test("TC-1794: a punch without a usable location is 400 INVALID_LOCATION", async () => {
    for (const body of [
      {},
      { latitude: 200, longitude: HOME.longitude },
      { latitude: "here", longitude: HOME.longitude },
    ]) {
      const res = await call(dee.token, "POST", clockUrl("/in"), body);
      expect(res.status, `${JSON.stringify(body)} → ${res.status}`).toBe(400);
      expect(res.data).toMatchObject({
        success: false,
        errorCode: "MOBILE_CLOCK_IN_REFUSED",
        reason: "INVALID_LOCATION",
      });
      isText(res.data.message);
    }
  });

  test("TC-1795: the owner turns it on for the Driver job: Dee may punch from her phone, Mia (no Driver job) may not", async () => {
    const on = await call(ownerToken, "PUT", settingsUrl(), {
      enabled: true,
      jobIds: [driverJobId],
      radiusMeters: 150,
    });
    expect(on.status, JSON.stringify(on.data)).toBe(200);
    expect(on.data.data).toMatchObject({
      enabled: true,
      jobIds: [driverJobId],
      radiusMeters: 150,
      allowOutsideGeofence: false,
    });

    const clock = await call(dee.token, "GET", clockUrl());
    expect(clock.status).toBe(200);
    expect(clock.data.data).toMatchObject({
      available: true,
      radiusMeters: 150,
      allowOutsideGeofence: false,
      shift: null,
      openBreak: null,
    });
    expect(Array.isArray(clock.data.data.breakTypes)).toBe(true);
    expect(list(clock.data.data.jobs).map((j) => j.id)).toContain(driverJobId);
    expect((await meRow(dee.token))?.mobileClockIn).toBe(true);

    const mgr = await call(mia.token, "GET", clockUrl());
    expect(mgr.status).toBe(200);
    expect(mgr.data.data).toMatchObject({
      available: false,
      reason: "NOT_ELIGIBLE",
    });
    isText(mgr.data.data.message);
    const mgrPunch = await call(mia.token, "POST", clockUrl("/in"), HOME);
    expect(mgrPunch.status).toBe(403);
    expect(mgrPunch.data.reason).toBe("NOT_ELIGIBLE");
  });

  test("TC-1796: a punch ~5.5 km away is refused 403 OUTSIDE_GEOFENCE with the distance, in the employee's language; no shift opens", async () => {
    const res = await call(dee.token, "POST", clockUrl("/in"), {
      ...FAR,
      accuracyMeters: 10,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(403);
    expect(res.data).toMatchObject({
      success: false,
      errorCode: "MOBILE_CLOCK_IN_REFUSED",
      reason: "OUTSIDE_GEOFENCE",
    });
    expect(res.data.details.radiusMeters).toBe(150);
    expect(res.data.details.distanceMeters).toBeGreaterThan(5000);
    expect(res.data.details.distanceMeters).toBeLessThan(6000);
    isText(res.data.message);
    expect(String(res.data.message)).toMatch(/\d+ m from the restaurant/);

    const es = await call(dee.token, "POST", clockUrl("/in"), FAR, "es");
    expect(es.status).toBe(403);
    expect(String(es.data.message)).toMatch(/Estás a \d+ m del restaurante/);

    const clock = await call(dee.token, "GET", clockUrl());
    expect(clock.data.data.shift).toBeNull();

    // Leave it as found: off, no jobs, default fence.
    const off = await call(ownerToken, "PUT", settingsUrl(), {
      enabled: false,
      jobIds: [],
      radiusMeters: 150,
      allowOutsideGeofence: false,
    });
    expect(off.status).toBe(200);
    expect(off.data.data).toMatchObject({
      enabled: false,
      jobIds: [],
      radiusMeters: 150,
    });
    const after = await call(dee.token, "GET", clockUrl());
    expect(after.data.data.reason).toBe("NOT_ENABLED");
  });

  // ── W0:MF-10 staff announcements ─────────────────────────────────────────

  test("TC-1797: the owner sends an announcement to all staff (201, recipientCount, text kept as typed)", async () => {
    const title = `Inventory Sunday ${runId}`;
    const body = "Please come at 9.\nBring gloves.";
    const res = await call(ownerToken, "POST", annUrl(), { title, body });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    const a = res.data.data;
    ownerAnnId = String(a.id);
    createdAnnouncements.push(ownerAnnId);
    expect(a).toMatchObject({
      title,
      body,
      audience: "ALL_STAFF",
      pinned: false,
      archivedAt: null,
      readCount: 0,
    });
    // Dee and Mia at least (the audience is every active staff member).
    expect(a.recipientCount).toBeGreaterThanOrEqual(2);
  });

  test("TC-1798: an empty title is 400 TITLE_REQUIRED, in the author's language; an empty message is BODY_REQUIRED", async () => {
    const en = await call(ownerToken, "POST", annUrl(), {
      title: "  ",
      body: "x",
    });
    expect(en.status, JSON.stringify(en.data)).toBe(400);
    expect(en.data.reason).toBe("TITLE_REQUIRED");
    expect(en.data.message).toBe("Add a title.");
    const es = await call(
      ownerToken,
      "POST",
      annUrl(),
      { title: " ", body: "x" },
      "es"
    );
    expect(es.status).toBe(400);
    expect(es.data.message).toBe("Agrega un título.");
    const noBody = await call(ownerToken, "POST", annUrl(), {
      title: "t",
      body: "",
    });
    expect(noBody.status).toBe(400);
    expect(noBody.data.reason).toBe("BODY_REQUIRED");
    const noJobs = await call(ownerToken, "POST", annUrl(), {
      title: "t",
      body: "b",
      audience: "JOBS",
      jobIds: [],
    });
    expect(noJobs.status).toBe(400);
    expect(noJobs.data.reason).toBe("JOBS_REQUIRED");
  });

  test("TC-1799: a manager has the announcements capability and sends one to the Driver job (recipientCount 1)", async () => {
    const owned = await call(mia.token, "GET", "/restaurant/owned");
    const row = list(owned.data.restaurant).find((r) => r.id === restaurantId);
    expect(row?.accessRole).toBe("MANAGER");
    expect(row?.managerCapabilities).toContain("announcements");

    const res = await call(mia.token, "POST", annUrl(), {
      title: `Drivers: new bags ${runId}`,
      body: "Use the blue bags.",
      audience: "JOBS",
      jobIds: [driverJobId],
    });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    managerAnnId = String(res.data.data.id);
    createdAnnouncements.push(managerAnnId);
    expect(res.data.data).toMatchObject({
      audience: "JOBS",
      jobIds: [driverJobId],
      recipientCount: 1,
      readCount: 0,
    });
  });

  test("TC-1800: the staff app inbox lists both for Dee; opening one records the read and lowers the unread count", async () => {
    const inbox = await call(dee.token, "GET", inboxUrl());
    expect(inbox.status, JSON.stringify(inbox.data)).toBe(200);
    const ids = list(inbox.data.data.announcements).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([ownerAnnId, managerAnnId]));
    const unreadBefore = Number(inbox.data.data.unreadCount);
    expect(unreadBefore).toBeGreaterThanOrEqual(2);
    const mine = list(inbox.data.data.announcements).find(
      (a) => a.id === ownerAnnId
    );
    expect(mine?.readAt ?? null).toBeNull();
    expect(mine?.title).toBe(`Inventory Sunday ${runId}`);

    const row = await meRow(dee.token);
    expect(row?.announcements).toBe(true);
    expect(row?.unreadAnnouncements).toBe(unreadBefore);

    const read = await call(dee.token, "POST", inboxUrl(`/${ownerAnnId}/read`));
    expect(read.status, JSON.stringify(read.data)).toBe(200);
    expect(read.data.data.readAt).toBeTruthy();

    const again = await call(dee.token, "GET", inboxUrl());
    expect(again.data.data.unreadCount).toBe(unreadBefore - 1);
    expect((await meRow(dee.token))?.unreadAnnouncements).toBe(
      unreadBefore - 1
    );

    // Mia is not a driver: the job announcement is not hers to read.
    const notMine = await call(
      mia.token,
      "POST",
      inboxUrl(`/${managerAnnId}/read`)
    );
    expect(notMine.status).toBe(404);
  });

  test("TC-1801: the owner's list shows the read count; the detail lists recipients, unread first, with Dee's read time", async () => {
    const res = await call(ownerToken, "GET", annUrl());
    expect(res.status).toBe(200);
    const item = list(res.data.data).find((a) => a.id === ownerAnnId);
    expect(item).toMatchObject({ readCount: 1, pinned: false });
    expect(item?.recipientCount).toBeGreaterThanOrEqual(2);

    const detail = await call(mia.token, "GET", annUrl(`/${ownerAnnId}`));
    expect(detail.status, JSON.stringify(detail.data)).toBe(200);
    const recipients = list(detail.data.data.recipients);
    const deeRow = recipients.find((r) => r.staffMemberId === dee.staffId);
    const miaRow = recipients.find((r) => r.staffMemberId === mia.staffId);
    expect(deeRow?.readAt).toBeTruthy();
    expect(miaRow?.readAt ?? null).toBeNull();
    const firstRead = recipients.findIndex((r) => r.readAt);
    const lastUnread = recipients.map((r) => !r.readAt).lastIndexOf(true);
    expect(lastUnread, "unread recipients come first").toBeLessThan(firstRead);
  });

  test("TC-1802: pin puts it first; archive takes it out of the list and the inbox (still there with includeArchived)", async () => {
    const pin = await call(ownerToken, "PATCH", annUrl(`/${ownerAnnId}`), {
      pinned: true,
    });
    expect(pin.status, JSON.stringify(pin.data)).toBe(200);
    expect(pin.data.data.pinned).toBe(true);
    const listed = await call(ownerToken, "GET", annUrl());
    expect(list(listed.data.data)[0]?.id).toBe(ownerAnnId);

    const down = await call(ownerToken, "PATCH", annUrl(`/${managerAnnId}`), {
      archived: true,
    });
    expect(down.status, JSON.stringify(down.data)).toBe(200);
    expect(down.data.data.archivedAt).toBeTruthy();
    const active = await call(ownerToken, "GET", annUrl());
    expect(list(active.data.data).map((a) => a.id)).not.toContain(managerAnnId);
    const all = await call(ownerToken, "GET", annUrl("?includeArchived=true"));
    const archived = list(all.data.data).find((a) => a.id === managerAnnId);
    expect(archived?.archivedAt).toBeTruthy();
    const inbox = await call(dee.token, "GET", inboxUrl());
    expect(list(inbox.data.data.announcements).map((a) => a.id)).not.toContain(
      managerAnnId
    );
  });

  test("TC-1803: a restaurant without TIMECARDS is refused announcements and mobile clock-in settings (403)", async () => {
    const send = await call(
      bareOwnerToken,
      "POST",
      annUrl("", bareRestaurantId),
      {
        title: "t",
        body: "b",
      }
    );
    expect(send.status, JSON.stringify(send.data)).toBe(403);
    const read = await call(
      bareOwnerToken,
      "GET",
      annUrl("", bareRestaurantId)
    );
    expect(read.status).toBe(403);
    const settings = await call(
      bareOwnerToken,
      "GET",
      `/api/staff/payroll/${bareRestaurantId}/mobile-clock-in`
    );
    expect(settings.status).toBe(403);
  });
});
