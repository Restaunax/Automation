/**
 * api-staff-hiring.spec.ts — hiring a staff member end to end (TC-553..562).
 *
 * No browser. A per-run throwaway restaurant (PAYROLL granted, for jobs and
 * wages) and a REGISTER device. One person, Cam, goes the whole way:
 *   owner invites (with a role) → the invite email arrives → Cam registers
 *   with it → she's on the staff list, linked to her account → the owner
 *   gives her a job and her own wage → she gets a PIN, signs in on the POS,
 *   and her ROLE decides what the POS lets her do (S3) → she opens Restaunax
 *   Staff and sees the restaurant → the owner deactivates her and every door
 *   closes.
 * Plus the invite's single use: a claimed token can't be claimed again, its
 * PIN link is dead, and the same email can't be invited twice.
 *
 * Serial: each step builds on the last. Skips without ADMIN creds or Mailpit
 * (the invite token only travels by email).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import {
  apiLogin,
  register,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  registerWithInvite,
  inviteStaffRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  staffAppRaw,
  ownerStaffRaw,
  payrollRaw,
  tabletRaw,
  claimStaffInviteSignedInRaw,
  setInvitationPinRaw,
  type LooseJson,
  createTabletDevice,
  tabletLogin,
  tabletStaffSignInRaw,
  deactivateTabletDevice,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("Hiring — invite, claim, job, role, staff app (API)", () => {
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
  let restaurantName = "";
  let deviceId = "";
  let tabletToken = "";
  const roles: Record<string, Rec> = {};
  let bartenderId = "";
  const cam = {
    email: "",
    password: `Automation!Staff-${runId}`,
    token: "",
    inviteToken: "",
    staffMemberId: "",
    session: "",
  };
  const CAM_PIN = "4826";
  let jobId = "";

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-staff-hiring] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    restaurantName = `Automation Owner2 Store ${runId}`;
    // PAYROLL is the package that brings jobs and wages (TIMECARDS).
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "PAYROLL",
      true
    );
    if (!g.ok)
      throw new Error(`[api-staff-hiring] grant: ${JSON.stringify(g.data)}`);
    // Admin-created devices default to REGISTER mode.
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-hire-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Hiring & roles");
    await allure.label("severity", "critical");
  });

  test("TC-553: a new restaurant has the four preset roles; the owner adds Bartender from Staff + Void", async () => {
    const res = await ownerStaffRaw(ownerToken, restaurantId, "GET", "/roles");
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    for (const r of list(res.data.data)) if (r.preset) roles[r.preset] = r;
    expect(Object.keys(roles).sort()).toEqual(
      ["MANAGER", "OWNER", "SHIFT_LEAD", "STAFF"].sort()
    );
    expect(roles.OWNER?.locked).toBe(true);
    // Staff rings sales only: no manager powers.
    expect(roles.STAFF?.permissions).not.toContain("MANAGE_STAFF");
    expect(roles.STAFF?.permissions).not.toContain("APPROVE_VOID");

    const created = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/roles",
      {
        name: "Bartender",
        permissions: [
          ...(roles.STAFF?.permissions ?? []),
          "APPROVE_VOID",
          "NOT_A_PERMISSION",
        ],
      }
    );
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    bartenderId = String(created.data.data.id);
    // Unknown keys are dropped on write.
    expect(created.data.data.permissions).toContain("APPROVE_VOID");
    expect(created.data.data.permissions).not.toContain("NOT_A_PERMISSION");

    const dup = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/roles",
      {
        name: "Bartender",
        permissions: [],
      }
    );
    expect(dup.status).toBe(400);
    const owner = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/roles/${roles.OWNER?.id}`,
      { name: "Boss" }
    );
    expect(owner.status, "the Owner role is locked").toBe(400);
  });

  test("TC-554: the owner invites Cam as Staff; the invite email arrives with a claim link @email", async () => {
    cam.email = `auto-staff-cam-${runId}@${DOMAIN}`;
    recordUserForCleanup(cam.email);
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: cam.email.toUpperCase(), // stored lower-cased
      firstName: "Cam",
      lastName: "Diaz",
      roleId: roles.STAFF?.id,
    });
    expect(invited.status, JSON.stringify(invited.data)).toBe(201);
    cam.staffMemberId = String(invited.data.data?.staffMemberId ?? "");

    const mail = await waitForEmail(cam.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    expect(mail.subject).toBe(
      `You've been added to the team at ${restaurantName}`
    );
    const body = mail.text_body || mail.html_body;
    cam.inviteToken = extractInviteToken(body);
    expect(cam.inviteToken.length).toBeGreaterThanOrEqual(16);

    const staff = await ownerStaffRaw(ownerToken, restaurantId, "GET");
    const row = list(staff.data.data).find((s) => s.id === cam.staffMemberId);
    expect(row).toMatchObject({
      email: cam.email,
      firstName: "Cam",
      lastName: "Diaz",
      status: "pending",
      roleId: roles.STAFF?.id,
      roleName: roles.STAFF?.name,
      hasPin: false,
      isActive: true,
    });
  });

  test("TC-555: Cam registers with the invite; she's active on the staff list as a staff account", async () => {
    const claimed = await registerWithInvite({
      firstName: "Cam",
      lastName: "Diaz",
      email: cam.email,
      password: cam.password,
      userInvitationToken: cam.inviteToken,
    });
    cam.token = claimed.accessToken;
    expect(claimed.role).toBe("RESTAURANT_STAFF");

    const staff = await ownerStaffRaw(ownerToken, restaurantId, "GET");
    const row = list(staff.data.data).find((s) => s.id === cam.staffMemberId);
    expect(row?.status).toBe("active");
    expect(row?.activatedAt).toBeTruthy();
    // Still one row for her — claiming didn't add a second.
    expect(
      list(staff.data.data).filter((s) => s.email === cam.email)
    ).toHaveLength(1);
  });

  test("TC-556: a claimed invite is single use — no second claim, no PIN from the link, no re-invite", async () => {
    // Someone else, signed in, presenting Cam's token.
    const strangerEmail = `auto-stranger-${runId}@${DOMAIN}`;
    recordUserForCleanup(strangerEmail);
    const stranger = await register({
      firstName: "Stranger",
      lastName: "Danger",
      email: strangerEmail,
      password: `Automation!Stranger-${runId}`,
    });
    const steal = await claimStaffInviteSignedInRaw(
      stranger.accessToken,
      cam.inviteToken
    );
    expect(steal.status).toBe(404);
    // Cam herself can't claim it twice either.
    const again = await claimStaffInviteSignedInRaw(cam.token, cam.inviteToken);
    expect(again.status).toBe(404);
    // The stranger is not on staff anywhere.
    const me = await staffAppRaw<{ data: Rec }>(
      stranger.accessToken,
      "GET",
      "/me"
    );
    expect(me.status).toBe(200);
    expect(list(me.data.data.restaurants)).toHaveLength(0);
    // The link's PIN step is dead once claimed.
    const pin = await setInvitationPinRaw(cam.inviteToken, "7391");
    expect(pin.status).toBe(404);
    // The same email can't be invited twice at one restaurant.
    const reinvite = await inviteStaffRaw(ownerToken, restaurantId, {
      email: cam.email,
      firstName: "Cam",
      lastName: "Again",
    });
    expect(reinvite.status).toBe(400);
    // Nor can her invite be "resent" now that it's claimed.
    const resend = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${cam.staffMemberId}/resend-invite`
    );
    expect(resend.status).toBeGreaterThanOrEqual(400);
    expect(resend.status).toBeLessThan(500);
  });

  test("TC-557: the owner gives Cam a job and her own wage; the job's default stays", async () => {
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Bartender ${runId}`,
      defaultHourlyRateCents: 1500,
      isTipped: true,
    });
    expect(job.status, JSON.stringify(job.data)).toBe(201);
    jobId = String(job.data.data?.id ?? "");

    const bad = await setMemberJobsRaw(
      ownerToken,
      restaurantId,
      cam.staffMemberId,
      [{ jobId, hourlyRateCents: -5 }]
    );
    expect(bad.status, "a negative wage is refused").toBe(400);

    const set = await setMemberJobsRaw(
      ownerToken,
      restaurantId,
      cam.staffMemberId,
      [{ jobId, hourlyRateCents: 1825, isPrimary: true }]
    );
    expect(set.status, JSON.stringify(set.data)).toBe(200);
    const mine = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/members/${cam.staffMemberId}/jobs`
    );
    expect(list(mine.data.data)).toEqual([
      expect.objectContaining({
        jobId,
        hourlyRateCents: 1825,
        effectiveHourlyRateCents: 1825,
        isPrimary: true,
        isTipped: true,
      }),
    ]);
    const jobs = await payrollRaw(ownerToken, restaurantId, "GET", "/jobs");
    expect(
      list(jobs.data.data).find((j) => j.id === jobId)?.defaultHourlyRateCents
    ).toBe(1500);
  });

  test("TC-558: with the Staff role, Cam signs in on the POS but can't manage staff", async () => {
    const pin = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${cam.staffMemberId}/pin`,
      { pin: CAM_PIN }
    );
    expect(pin.status, JSON.stringify(pin.data)).toBe(200);

    const wrong = await tabletStaffSignInRaw(
      tabletToken,
      cam.staffMemberId,
      "9157"
    );
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const signIn = await tabletStaffSignInRaw(
      tabletToken,
      cam.staffMemberId,
      CAM_PIN
    );
    expect(signIn.status, JSON.stringify(signIn.data)).toBe(200);
    cam.session = String(signIn.data.data?.staffSessionToken ?? "");
    const member = (signIn.data.data as Rec)?.staffMember as Rec;
    expect(member.roleName).toBe(roles.STAFF?.name);
    expect(member.capabilities).not.toContain("MANAGE_STAFF");

    const manage = await tabletRaw(
      tabletToken,
      "GET",
      "/staff/manage",
      undefined,
      cam.session
    );
    expect(manage.status).toBe(403);
  });

  test("TC-559: changing Cam's role (and editing the role) changes what the POS allows, live", async () => {
    const moved = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/${cam.staffMemberId}`,
      { roleId: bartenderId }
    );
    expect(moved.status, JSON.stringify(moved.data)).toBe(200);

    // Same session: the role is read on every call, not frozen at sign-in.
    const me = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/staff/me",
      undefined,
      cam.session
    );
    expect(me.status).toBe(200);
    expect(me.data.data.staffMember.roleName).toBe("Bartender");
    expect(me.data.data.staffMember.capabilities).toContain("APPROVE_VOID");
    const still = await tabletRaw(
      tabletToken,
      "GET",
      "/staff/manage",
      undefined,
      cam.session
    );
    expect(still.status).toBe(403);

    // The owner gives every Bartender "Manage staff".
    const edited = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/roles/${bartenderId}`,
      {
        permissions: [
          ...(roles.STAFF?.permissions ?? []),
          "APPROVE_VOID",
          "MANAGE_STAFF",
        ],
      }
    );
    expect(edited.status, JSON.stringify(edited.data)).toBe(200);
    const now = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/staff/manage",
      undefined,
      cam.session
    );
    expect(now.status, JSON.stringify(now.data)).toBe(200);

    // The role list counts its holder; a role in use can't be deleted.
    const listed = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/roles"
    );
    expect(
      list(listed.data.data).find((r) => r.id === bartenderId)?.memberCount
    ).toBe(1);
    const del = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "DELETE",
      `/roles/${bartenderId}`
    );
    expect(del.status).toBe(400);
  });

  test("TC-560: guards — Cam can't edit herself or hand out more than she holds", async () => {
    const self = await tabletRaw(
      tabletToken,
      "PATCH",
      `/staff/manage/${cam.staffMemberId}`,
      { capabilityGrants: ["APPROVE_REFUND"] },
      cam.session
    );
    expect(self.status).toBe(403);

    const asManager = await tabletRaw(
      tabletToken,
      "POST",
      "/staff/manage",
      {
        firstName: "Dev",
        lastName: `Mgr${runId}`,
        pin: "6284",
        roleId: roles.MANAGER?.id,
      },
      cam.session
    );
    expect(asManager.status, JSON.stringify(asManager.data)).toBe(403);

    const asStaff = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/manage",
      {
        firstName: "Eli",
        lastName: `Staff${runId}`,
        pin: "6284",
        roleId: roles.STAFF?.id,
      },
      cam.session
    );
    expect(asStaff.status, JSON.stringify(asStaff.data)).toBe(201);

    const withRefund = await tabletRaw(
      tabletToken,
      "POST",
      "/staff/manage",
      {
        firstName: "Fay",
        lastName: `Refund${runId}`,
        pin: "6284",
        roleId: roles.STAFF?.id,
        capabilityGrants: ["APPROVE_REFUND"],
      },
      cam.session
    );
    expect(withRefund.status, "she doesn't hold Refund").toBe(403);
  });

  test("TC-561: Cam signs in to Restaunax Staff with her account and sees the restaurant", async () => {
    const login = await apiLogin(cam.email, cam.password);
    const me = await staffAppRaw<{ data: Rec }>(
      login.accessToken,
      "GET",
      "/me"
    );
    expect(me.status).toBe(200);
    expect(me.data.data.user).toMatchObject({
      firstName: "Cam",
      lastName: "Diaz",
      email: cam.email,
    });
    expect(list(me.data.data.restaurants)).toEqual([
      expect.objectContaining({
        restaurantId,
        restaurantName,
        staffMemberId: cam.staffMemberId,
        // PAYROLL only: no scheduling requests, no RestauNax Payroll stubs.
        requests: false,
        payStubs: false,
      }),
    ]);
    const periods = await staffAppRaw(
      login.accessToken,
      "GET",
      `/restaurants/${restaurantId}/pay-periods`
    );
    expect(periods.status).toBe(200);
  });

  test("TC-562: a deactivated staff member loses the POS and the staff app; the record stays", async () => {
    const off = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "DELETE",
      `/${cam.staffMemberId}`
    );
    expect(off.status, JSON.stringify(off.data)).toBe(200);

    const me = await staffAppRaw<{ data: Rec }>(cam.token, "GET", "/me");
    expect(me.status).toBe(200);
    expect(list(me.data.data.restaurants)).toHaveLength(0);
    const periods = await staffAppRaw(
      cam.token,
      "GET",
      `/restaurants/${restaurantId}/pay-periods`
    );
    expect(periods.status).toBe(404);

    // Her open POS session dies, and she can't sign in again.
    const session = await tabletRaw(
      tabletToken,
      "GET",
      "/staff/me",
      undefined,
      cam.session
    );
    expect(session.status).toBeGreaterThanOrEqual(400);
    const signIn = await tabletStaffSignInRaw(
      tabletToken,
      cam.staffMemberId,
      CAM_PIN
    );
    expect(signIn.status).toBeGreaterThanOrEqual(400);

    const active = await ownerStaffRaw(ownerToken, restaurantId, "GET");
    expect(list(active.data.data).some((s) => s.id === cam.staffMemberId)).toBe(
      false
    );
    const all = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      "?includeInactive=true"
    );
    expect(
      list(all.data.data).find((s) => s.id === cam.staffMemberId)
    ).toMatchObject({ status: "inactive", isActive: false });
    // Her job and wage are kept for history.
    const jobs = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/members/${cam.staffMemberId}/jobs`
    );
    expect(list(jobs.data.data)[0]?.hourlyRateCents).toBe(1825);
  });

  test("TC-618: an owner-set PIN lets an invited (not yet claimed) person sign in on the POS", async () => {
    // PRODUCT BUG (found 2026-10-06): POST /restaurant/:rid/staff/:id/pin on a
    // pending email invitee answers 200 "PIN updated." but leaves the row
    // unactivated (setStaffPinDirect never sets activatedAt), so the person is
    // missing from the POS roster and /api/tablet/staff/sign-in answers 401
    // "The PIN you entered is incorrect." — restaunax-backend
    // src/Service/restaurantStaffService.ts setStaffPinDirect (~L1971) vs
    // eligibleCandidateWhere (~L1360, activatedAt: { not: null }). Expected:
    // either activate on an owner-set PIN (as POS-created staff are) or refuse
    // the PIN with a clear message. Remove test.fail() once fixed.
    test.fail();
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: `auto-staff-pat-${runId}@${DOMAIN}`,
      firstName: "Pat",
      lastName: "Moss",
    });
    expect(invited.status).toBe(201);
    const patId = String(invited.data.data?.staffMemberId);
    const pin = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${patId}/pin`,
      { pin: "7391" }
    );
    expect(pin.status, JSON.stringify(pin.data)).toBe(200);
    const signIn = await tabletStaffSignInRaw(tabletToken, patId, "7391");
    expect(signIn.status, JSON.stringify(signIn.data)).toBe(200);
  });
});
