/**
 * hq-notices.spec.ts — HQ → Operations → Notices (RestauNax PR #1174,
 * docs/features/HQ_NOTICES.md). TC-1980 → TC-1989. Tag `@hq-notices`; the
 * cases that read Mailpit also carry `@email`.
 *
 * HQ writes a notice once and sends it by email (and push) to owners,
 * managers, the team and affiliates. This file covers who may use it, the
 * audience count, a real send (one email per address, the "on the team at"
 * line, the unsubscribe link + List-Unsubscribe headers), unsubscribe and
 * resubscribe on the public page, service/legal emails without an
 * unsubscribe, LEGAL never pushing, the test send, schedule-then-cancel, the
 * restaurant list's "Send a notice" action and the delivery report.
 *
 * Gated: until the feature is on QA `/api/admin/notices` answers 404 and every
 * test here SKIPS with that reason (utils/releaseGate.ts →
 * RELEASED_ON_QA.hqNotices). Against a stack that has it, it runs for real.
 *
 * Data — every send reaches ONLY this file's own tenant:
 *   - a per-run HQ ADMIN (`autouser_hqnotices_*`, unique Mailpit address) who
 *     holds HQ_OPERATIONS_NOTICES; it sends everything, so the test send lands
 *     in an inbox nobody else uses. The permission is the one named here (it
 *     is the feature's own gate); nothing else in the catalog is assumed.
 *   - a fresh OWNER with one throwaway, PUBLISHED restaurant
 *     (createSecondOwner alwaysFresh), an emailed team member (an invite: a
 *     staff row with an email and no login) and a PIN-only staff member (made
 *     on a throwaway register; no email);
 *   - a second, UNPUBLISHED throwaway restaurant for the hidden-action case.
 *   Audiences are always `restaurantScope: "CHOSEN"` with the tenant's id
 *   (utils/hqNoticesApi.chosenAudience) and `liveOnly: false` (a throwaway
 *   restaurant is never activated). Subjects carry the run id.
 * Cleanup: the register is deactivated and both restaurants deleted in
 * afterAll; the per-run users are swept by globalTeardown. Notices themselves
 * have no delete endpoint, so this run's notices (subject "AUTO HQ notice
 * <runId> …") stay in HQ's list; opt-outs are keyed by this run's unique
 * addresses and are cleared again by the resubscribe case.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminRestaurantsPage } from "../../../pages/dashboard/admin/AdminRestaurantsPage";
import {
  adminCreateUser,
  apiLogin,
  apiRequestRaw,
  createRestaurantRaw,
  createSecondOwner,
  createTabletDevice,
  deactivateTabletDevice,
  deleteTestRestaurant,
  inviteStaffRaw,
  restaurantBasicInfoRaw,
  setOwnerPosPin,
  setRestaurantPublishedApi,
  tabletLogin,
  tabletRaw,
  tabletStaffSignIn,
} from "../../../utils/apiHelper";
import { loginViaUi } from "../../../utils/auth";
import {
  emailHeader,
  getEmailHeaders,
  listEmailIds,
  waitForEmail,
  type MailpitMessage,
} from "../../../utils/emailHelper";
import {
  cancelNoticeRaw,
  chosenAudience,
  countAudienceRaw,
  createNotice,
  createNoticeRaw,
  extractUnsubscribeToken,
  getNoticeRaw,
  hasUnsubscribeLink,
  listNoticesRaw,
  localMinute,
  noticeOptRaw,
  noticeReportRaw,
  patchNoticeRaw,
  recipientRow,
  scheduleNoticeRaw,
  sendAndWait,
  setNoticesPermission,
  testNoticeRaw,
  type NoticeGroup,
  type NoticeType,
} from "../../../utils/hqNoticesApi";
import { probeHqNotices, requireRelease } from "../../../utils/releaseGate";
import {
  FRONTEND_URL,
  generateRunId,
  generateUserEmail,
  recordUserForCleanup,
} from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const NO_MAILPIT = "MAILPIT_BASE_URL not set — this case reads the inbox";

/** The tenant's zone, set explicitly so a scheduled minute is predictable. */
const ZONE = "America/New_York";
const NOTICES_URL = "/admin?tab=operations&section=notices";

// admin.json → notices.* / landing.* (EN), settings.json → noticeUnsubscribe.*
const TXT = {
  notAllowed: "That section isn't part of your access",
  description:
    "Tell the people we work with about outages, product updates, how-tos and legal changes",
  pushChannel: "Push (Owner or Staff app)",
  emailChannel: "Email",
  legalType: "Legal",
  legalHint: "Legal notices go by email only to the people you pick",
  sendNotice: "Send a notice",
  scopeChosen: "Choose restaurants",
  liveOnly: "Only live restaurants",
  unsubTitle: "Unsubscribe from RestauNax messages",
  unsubButton: "Unsubscribe",
  unsubDone: "You are unsubscribed",
  resubButton: "Resubscribe",
  resubDone: "You are subscribed again",
  // email.json → hqNotice.whyReceived*
  whyOwner: "because you work with RestauNax",
  whyLegal: "It can't be turned off.",
  // api.json → hqNotice.legalNoPush
  legalNoPush: "Legal notices are sent by email only.",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactSubject = (s: string) => new RegExp(`^${escapeRe(s)}$`);

test.describe.configure({ mode: "serial", timeout: 240_000 });

test.describe("HQ notices", { tag: "@hq-notices" }, () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  const runId = generateRunId();
  const subject = (label: string) => `AUTO HQ notice ${runId} ${label}`;

  let deployed = false;
  let adminToken = "";
  /** The per-run HQ admin who sends everything. */
  const hq = {
    userId: "",
    email: generateUserEmail("hqnotices"),
    password: `Automation!Hq-${runId}`,
    token: "",
    at: 0,
  };
  const owner = { email: "", token: "" };
  let restaurantId = "";
  let restaurantName = "";
  const teamEmail = generateUserEmail("hqteam");
  let deviceId = "";
  let unpublishedId = "";
  const unpublishedName = `Automation Notice Unpublished ${runId}`;

  /** Shared across the serial cases. */
  let promoNoticeId = "";
  let teamUnsubToken = "";
  const serviceMails: MailpitMessage[] = [];

  /** Raw API tokens last ~15 min: re-login the HQ admin when it ages. */
  const hqToken = async (): Promise<string> => {
    if (!hq.token || Date.now() - hq.at > 8 * 60_000) {
      hq.token = (await apiLogin(hq.email, hq.password)).accessToken;
      hq.at = Date.now();
    }
    return hq.token;
  };
  const audience = (groups: NoticeGroup[]) =>
    chosenAudience([restaurantId], groups);
  const draft = async (
    type: NoticeType,
    label: string,
    groups: NoticeGroup[] = ["OWNERS", "TEAM"]
  ) => {
    const s = subject(label);
    const n = await createNotice(await hqToken(), {
      type,
      channels: ["EMAIL"],
      audience: audience(groups),
      subject: s,
    });
    return { id: n.id, subject: s };
  };
  /** Exactly one copy of `subj` reached `email`. */
  const expectOneCopy = async (email: string, subj: string) => {
    const mail = await waitForEmail(email, {
      subjectPattern: exactSubject(subj),
      timeoutMs: 60_000,
    });
    expect(
      await listEmailIds(email, { subjectPattern: exactSubject(subj) }),
      `${email} got more than one copy of "${subj}"`
    ).toHaveLength(1);
    return mail;
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    deployed = await probeHqNotices(adminToken);
    if (!deployed) return;

    // The per-run HQ admin, holding the notices permission.
    recordUserForCleanup(hq.email);
    hq.userId = (
      await adminCreateUser(adminToken, {
        firstName: "Auto",
        lastName: `HqNotices${runId}`,
        email: hq.email,
        password: hq.password,
        role: "ADMIN",
      })
    ).id;
    await setNoticesPermission(adminToken, hq.userId, true);

    // The tenant: a fresh owner + one published restaurant in a known zone.
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[hq-notices] no tenant");
    restaurantId = tenant.restaurantId;
    owner.email = tenant.email;
    owner.token = tenant.accessToken;
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    const zone = await restaurantBasicInfoRaw(adminToken, restaurantId, {
      timezone: ZONE,
    });
    if (zone.status !== 200)
      throw new Error(`[hq-notices] timezone: ${JSON.stringify(zone.data)}`);
    const r = await apiRequestRaw<{
      restaurant?: { name?: string; timezone?: string };
    }>(
      "GET",
      `/restaurant/restaurantId/${restaurantId}`,
      undefined,
      adminToken
    );
    restaurantName = r.data?.restaurant?.name ?? "";
    if (!restaurantName) throw new Error("[hq-notices] no restaurant name");
    // The scheduled-minute case (TC-1988) computes local time in ZONE.
    if (r.data?.restaurant?.timezone !== ZONE)
      throw new Error(
        `[hq-notices] timezone did not stick: ${r.data?.restaurant?.timezone}`
      );

    // An emailed team member: a staff row with an email and no login yet.
    const invited = await inviteStaffRaw(owner.token, restaurantId, {
      email: teamEmail,
      firstName: "Tess",
      lastName: `Team${runId}`,
    });
    if (!invited.ok)
      throw new Error(`[hq-notices] invite: ${JSON.stringify(invited.data)}`);

    // A PIN-only staff member (no email), made on a throwaway register the
    // way the POS does.
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-notices-${runId}`
    );
    deviceId = device.id;
    const tabletToken = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(owner.token, restaurantId, "8462");
    const session = await tabletStaffSignIn(tabletToken, ownerMember, "8462");
    const pinOnly = await tabletRaw(
      tabletToken,
      "POST",
      "/staff/manage",
      { firstName: "Pip", lastName: `NoEmail${runId}`, pin: "5207" },
      session
    );
    if (pinOnly.status !== 201)
      throw new Error(
        `[hq-notices] PIN staff: ${JSON.stringify(pinOnly.data)}`
      );

    // A second restaurant that stays unpublished (new restaurants start in
    // preview mode).
    const unpublished = await createRestaurantRaw(adminToken, {
      name: unpublishedName,
      street: "301 Other Street",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      cuisineType: "Mexican",
      restaurantPhone: "3055550178",
      description: "Throwaway unpublished restaurant (HQ notices E2E)",
      minimumOrderPreparationTime: 0,
    });
    unpublishedId =
      (unpublished.data as { restaurant?: { id?: string } })?.restaurant?.id ??
      "";
    if (!unpublishedId)
      throw new Error(
        `[hq-notices] unpublished restaurant: ${unpublished.status} ${JSON.stringify(unpublished.data)}`
      );
  });

  test.afterAll(async () => {
    if (!deployed || !ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    const token = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    if (deviceId && restaurantId)
      await deactivateTabletDevice(token, restaurantId, deviceId);
    for (const id of [restaurantId, unpublishedId].filter(Boolean))
      await deleteTestRestaurant(token, id).catch(() => {});
  });

  test.beforeEach(async () => {
    requireRelease("hqNotices", deployed);
    await allure.label("feature", "HQ notices");
    await allure.label("severity", "critical");
  });

  test("TC-1980: without HQ_OPERATIONS_NOTICES the Notices section is hidden and the API answers 403; with it, 200", async ({
    browser,
  }) => {
    await allure.description(
      "HQ → Operations → Notices is gated by its own HQ permission. A per-run admin whose " +
        "HQ_OPERATIONS_NOTICES is taken away gets 403 from /api/admin/notices and the dashboard " +
        "refuses the section ('isn't part of your access'); given it back, both open."
    );
    const openSection = async (expectAllowed: boolean) => {
      const { context, page } = await loginViaUi(
        browser,
        hq.email,
        hq.password
      );
      try {
        await page.goto(NOTICES_URL, { waitUntil: "domcontentloaded" });
        if (expectAllowed) {
          await expect(page.getByText(TXT.description).first()).toBeVisible({
            timeout: 20_000,
          });
          await expect(page.getByText(TXT.notAllowed)).toHaveCount(0);
        } else {
          await expect(
            page.getByRole("alert").filter({ hasText: TXT.notAllowed }).first()
          ).toBeVisible({
            timeout: 20_000,
          });
          await expect(page.getByText(TXT.description)).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    };

    try {
      await allure.step(
        "Without the permission: 403 and no section",
        async () => {
          await setNoticesPermission(adminToken, hq.userId, false);
          hq.token = "";
          const res = await listNoticesRaw(await hqToken());
          expect(res.status, JSON.stringify(res.data)).toBe(403);
          await openSection(false);
        }
      );
    } finally {
      await setNoticesPermission(adminToken, hq.userId, true);
      hq.token = "";
    }

    await allure.step(
      "With the permission: 200 and the section opens",
      async () => {
        const res = await listNoticesRaw(await hqToken());
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        expect(Array.isArray(res.data.data?.items)).toBe(true);
        await openSection(true);
      }
    );
  });

  test("TC-1981: audience count — owners only, then the team; a PIN-only member shows as 'no email'", async () => {
    await allure.description(
      "POST /audience/count for the tenant (CHOSEN scope): OWNERS = the owner (1 person, 1 " +
        "restaurant, nobody without email). OWNERS + TEAM adds the emailed team member (the " +
        "owner's own staff row is the same address, so it is counted once) and reports the " +
        "PIN-only member in teamWithoutEmail."
    );
    const token = await hqToken();
    const owners = await countAudienceRaw(
      token,
      "PRODUCT_UPDATE",
      audience(["OWNERS"])
    );
    expect(owners.status, JSON.stringify(owners.data)).toBe(200);
    expect(owners.data.data).toMatchObject({
      people: 1,
      restaurants: 1,
      teamWithoutEmail: 0,
    });

    const team = await countAudienceRaw(
      token,
      "PRODUCT_UPDATE",
      audience(["OWNERS", "TEAM"])
    );
    expect(team.status, JSON.stringify(team.data)).toBe(200);
    expect(team.data.data?.people).toBeGreaterThan(
      owners.data.data?.people ?? 0
    );
    expect(team.data.data).toMatchObject({
      people: 2,
      restaurants: 1,
      teamWithoutEmail: 1,
    });
  });

  test(
    "TC-1982: a product update reaches the owner and the team once each, with the team line, an unsubscribe link and List-Unsubscribe headers",
    { tag: "@email" },
    async () => {
      test.skip(!MAILPIT, NO_MAILPIT);
      await allure.description(
        "PRODUCT_UPDATE by email to OWNERS + TEAM of the tenant. Each address gets exactly one " +
          "copy. The team member's copy says 'on the team at <restaurant>', the owner's 'because " +
          "you work with RestauNax'. Being promotional, every copy carries one unsubscribe link " +
          "and List-Unsubscribe (one-click) headers."
      );
      const n = await draft("PRODUCT_UPDATE", "product A");
      promoNoticeId = n.id;
      await sendAndWait(await hqToken(), n.id);

      const ownerMail = await expectOneCopy(owner.email, n.subject);
      const teamMail = await expectOneCopy(teamEmail, n.subject);

      await allure.step("Why-you-received line per recipient", async () => {
        expect(teamMail.text_body).toContain(
          `you're on the team at ${restaurantName}`
        );
        expect(ownerMail.text_body).toContain(TXT.whyOwner);
        expect(ownerMail.text_body).not.toContain("on the team at");
      });

      await allure.step(
        "Unsubscribe link + List-Unsubscribe headers",
        async () => {
          for (const mail of [ownerMail, teamMail]) {
            expect(
              extractUnsubscribeToken(mail.html_body),
              `no unsubscribe link in the HTML to ${mail.to_email}`
            ).toBeTruthy();
            const headers = await getEmailHeaders(mail.id);
            const listUnsub = emailHeader(headers, "List-Unsubscribe");
            expect(
              listUnsub,
              `List-Unsubscribe on ${mail.to_email}`
            ).toHaveLength(1);
            expect(listUnsub[0]).toMatch(/\/api\/notices\/unsubscribe\?token=/);
            expect(emailHeader(headers, "List-Unsubscribe-Post")).toEqual([
              "List-Unsubscribe=One-Click",
            ]);
          }
          teamUnsubToken = extractUnsubscribeToken(teamMail.html_body) ?? "";
        }
      );
    }
  );

  test(
    "TC-1983: the delivery report matches what Mailpit received",
    { tag: "@email" },
    async () => {
      test.skip(!MAILPIT, NO_MAILPIT);
      await allure.description(
        "GET /:id/report for the TC-1982 notice: SENT, two recipients, both email SENT and " +
          "nothing failed or skipped — and the SENT count equals the copies in the inbox."
      );
      expect(promoNoticeId, "TC-1982 sent no notice").toBeTruthy();
      const res = await noticeReportRaw(await hqToken(), promoNoticeId);
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      const report = res.data.data!;
      expect(report.notice.status).toBe("SENT");
      expect(report.recipients.total).toBe(2);
      expect(report.counts.EMAIL).toEqual({ SENT: 2 });
      expect(report.skipReasons.EMAIL).toEqual({});
      for (const email of [owner.email, teamEmail])
        expect(recipientRow(report, email)?.emailStatus).toBe("SENT");

      const subj = exactSubject(subject("product A"));
      const inbox =
        (await listEmailIds(owner.email, { subjectPattern: subj })).length +
        (await listEmailIds(teamEmail, { subjectPattern: subj })).length;
      expect(inbox).toBe(report.counts.EMAIL.SENT);
    }
  );

  test(
    "TC-1984: unsubscribe on the public page skips the next product update (OPTED_OUT) but not a service notice; Resubscribe turns it back on",
    { tag: "@email" },
    async ({ browser }) => {
      test.skip(!MAILPIT, NO_MAILPIT);
      // Three full sends, each waited out to SENT and to the inbox.
      test.setTimeout(420_000);
      await allure.description(
        "The team member opens the unsubscribe link from TC-1982 and presses Unsubscribe. The " +
          "next PRODUCT_UPDATE reaches the owner and skips the team member (report: SKIPPED " +
          "OPTED_OUT, no email in the inbox). A SERVICE notice still reaches them. Resubscribe " +
          "(same page, same token) clears it: the next PRODUCT_UPDATE reaches them again."
      );
      expect(teamUnsubToken, "TC-1982 found no unsubscribe link").toBeTruthy();
      const context = await browser.newContext({ baseURL: FRONTEND_URL });
      const page = await context.newPage();
      try {
        await allure.step("Unsubscribe on the public page", async () => {
          await page.goto(
            `/notices/unsubscribe?token=${encodeURIComponent(teamUnsubToken)}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(page.getByText(TXT.unsubTitle)).toBeVisible({
            timeout: 20_000,
          });
          await page
            .getByRole("button", { name: TXT.unsubButton, exact: true })
            .click();
          await expect(page.getByText(TXT.unsubDone)).toBeVisible();
        });

        await allure.step("The next product update skips them", async () => {
          const n = await draft("PRODUCT_UPDATE", "product B");
          const report = await sendAndWait(await hqToken(), n.id);
          expect(recipientRow(report, teamEmail)).toMatchObject({
            emailStatus: "SKIPPED",
            emailSkipReason: "OPTED_OUT",
          });
          expect(recipientRow(report, owner.email)?.emailStatus).toBe("SENT");
          expect(report.skipReasons.EMAIL).toEqual({ OPTED_OUT: 1 });
          // The owner's copy arriving proves the send is over.
          await expectOneCopy(owner.email, n.subject);
          expect(
            await listEmailIds(teamEmail, {
              subjectPattern: exactSubject(n.subject),
            })
          ).toHaveLength(0);
        });

        await allure.step("A service notice still reaches them", async () => {
          const n = await draft("SERVICE", "service C");
          const report = await sendAndWait(await hqToken(), n.id);
          expect(report.counts.EMAIL).toEqual({ SENT: 2 });
          serviceMails.push(
            await expectOneCopy(teamEmail, n.subject),
            await expectOneCopy(owner.email, n.subject)
          );
        });

        await allure.step(
          "Resubscribe turns product updates back on",
          async () => {
            await page
              .getByRole("button", { name: TXT.resubButton, exact: true })
              .click();
            await expect(page.getByText(TXT.resubDone)).toBeVisible();
            // The page's token names the muted category; the public endpoint
            // is idempotent, so posting it again just confirms the category.
            const again = await noticeOptRaw("resubscribe", teamUnsubToken);
            expect(again.status, JSON.stringify(again.data)).toBe(200);
            expect(again.data.data?.category).toBe("PRODUCT_UPDATE");
            const n = await draft("PRODUCT_UPDATE", "product D");
            const report = await sendAndWait(await hqToken(), n.id);
            expect(recipientRow(report, teamEmail)?.emailStatus).toBe("SENT");
            await expectOneCopy(teamEmail, n.subject);
          }
        );
      } finally {
        await context.close();
      }
    }
  );

  test(
    "TC-1985: service and legal emails carry no unsubscribe; the API refuses LEGAL + PUSH",
    { tag: "@email" },
    async () => {
      test.skip(!MAILPIT, NO_MAILPIT);
      await allure.description(
        "SERVICE (TC-1984) and LEGAL copies have no unsubscribe link and no List-Unsubscribe " +
          "header; the LEGAL copy says it can't be turned off. Creating a LEGAL notice with PUSH, " +
          "or adding PUSH to a LEGAL draft, is a 400 with a resolved message."
      );
      expect(serviceMails, "TC-1984 sent no service notice").toHaveLength(2);
      const token = await hqToken();

      let controlId = "";
      await allure.step("API: LEGAL can never push", async () => {
        const payload = {
          channels: ["EMAIL", "PUSH"] as ("EMAIL" | "PUSH")[],
          audience: audience(["OWNERS"]),
          subject: subject("push control"),
        };
        const refused = await createNoticeRaw(token, {
          ...payload,
          type: "LEGAL",
        });
        expect(refused.status, JSON.stringify(refused.data)).toBe(400);
        expect(refused.data.error).toBe(TXT.legalNoPush);
        // Control: the same payload as a product update is a valid draft.
        const accepted = await createNoticeRaw(token, {
          ...payload,
          type: "PRODUCT_UPDATE",
        });
        expect(accepted.status, JSON.stringify(accepted.data)).toBe(201);
        controlId = accepted.data.data?.id ?? "";
      });

      const legal = await draft("LEGAL", "legal E", ["OWNERS"]);
      await allure.step(
        "API: PUSH can't be added to a LEGAL draft",
        async () => {
          const patched = await patchNoticeRaw(token, legal.id, {
            channels: ["EMAIL", "PUSH"],
          });
          expect(patched.status, JSON.stringify(patched.data)).toBe(400);
          expect(patched.data.error).toBe(TXT.legalNoPush);
          const still = await getNoticeRaw(token, legal.id);
          expect(still.data.data?.channels).toEqual(["EMAIL"]);
          // Control: the same PATCH on a product-update draft is accepted.
          const control = await draft("PRODUCT_UPDATE", "patch control", [
            "OWNERS",
          ]);
          const ok = await patchNoticeRaw(token, control.id, {
            channels: ["EMAIL", "PUSH"],
          });
          expect(ok.status, JSON.stringify(ok.data)).toBe(200);
          expect(ok.data.data?.channels).toEqual(["EMAIL", "PUSH"]);
          expect(controlId, "create control draft").toBeTruthy();
        }
      );

      const report = await sendAndWait(token, legal.id);
      expect(report.counts.EMAIL).toEqual({ SENT: 1 });
      const legalMail = await expectOneCopy(owner.email, legal.subject);
      expect(legalMail.text_body).toContain(TXT.whyLegal);

      for (const mail of [...serviceMails, legalMail]) {
        await allure.step(
          `No unsubscribe: "${mail.subject}" to ${mail.to_email}`,
          async () => {
            expect(hasUnsubscribeLink(mail.html_body)).toBe(false);
            expect(hasUnsubscribeLink(mail.text_body)).toBe(false);
            const headers = await getEmailHeaders(mail.id);
            expect(emailHeader(headers, "List-Unsubscribe")).toEqual([]);
          }
        );
      }
    }
  );

  test("TC-1986: the composer offers no push channel for a LEGAL notice", async ({
    browser,
  }) => {
    await allure.description(
      "New notice → the default type (product update) offers Email and Push; switching Type to " +
        "Legal removes the Push option and shows the legal hint."
    );
    const { context, page } = await loginViaUi(browser, hq.email, hq.password);
    try {
      await page.goto(`${NOTICES_URL}&notice=new`, {
        waitUntil: "domcontentloaded",
      });
      const push = page.getByRole("checkbox", { name: TXT.pushChannel });
      await expect(push).toBeVisible({ timeout: 20_000 });
      await page.getByRole("combobox", { name: "Type" }).click();
      await page
        .getByRole("option", { name: TXT.legalType, exact: true })
        .click();
      await expect(page.getByText(TXT.legalHint)).toBeVisible();
      await expect(push).toHaveCount(0);
      await expect(
        page.getByRole("checkbox", { name: TXT.emailChannel, exact: true })
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test(
    "TC-1987: a test send goes only to the sender, '[TEST]' subject, no unsubscribe, no recipient rows",
    { tag: "@email" },
    async () => {
      test.skip(!MAILPIT, NO_MAILPIT);
      await allure.description(
        "POST /:id/test on a PRODUCT_UPDATE draft sends to the signed-in HQ admin only: subject " +
          "'[TEST] …', no unsubscribe link and no List-Unsubscribe header (so the sender can't " +
          "opt out by clicking around). The notice stays a DRAFT with no recipient rows, and the " +
          "owner gets nothing."
      );
      const token = await hqToken();
      const n = await draft("PRODUCT_UPDATE", "test F", ["OWNERS"]);
      const res = await testNoticeRaw(token, n.id);
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      expect(res.data.data?.results).toContainEqual(
        expect.objectContaining({ channel: "EMAIL", status: "SENT" })
      );

      const mail = await expectOneCopy(hq.email, `[TEST] ${n.subject}`);
      expect(hasUnsubscribeLink(mail.html_body)).toBe(false);
      expect(hasUnsubscribeLink(mail.text_body)).toBe(false);
      const headers = await getEmailHeaders(mail.id);
      expect(emailHeader(headers, "List-Unsubscribe")).toEqual([]);

      const report = await noticeReportRaw(token, n.id);
      expect(report.status, JSON.stringify(report.data)).toBe(200);
      expect(report.data.data?.notice.status).toBe("DRAFT");
      expect(report.data.data?.recipients.total).toBe(0);
      expect(
        await listEmailIds(owner.email, {
          subjectPattern: new RegExp(escapeRe(n.subject)),
        })
      ).toHaveLength(0);
    }
  );

  test(
    "TC-1988: a scheduled notice that is cancelled never sends",
    { tag: "@email" },
    async () => {
      test.skip(!MAILPIT, NO_MAILPIT);
      await allure.description(
        "Schedule a PRODUCT_UPDATE about two minutes ahead in the tenant's local time, then " +
          "cancel it: status CANCELLED, a second cancel is refused (409), and once the scheduled " +
          "minute has passed nobody received it and the report has no recipients."
      );
      const token = await hqToken();
      const n = await draft("PRODUCT_UPDATE", "scheduled G");
      // Next-minute-plus-one in the tenant's zone: 60–120 s ahead.
      const when = localMinute(new Date(Date.now() + 120_000), ZONE);
      const scheduled = await scheduleNoticeRaw(token, n.id, when);
      expect(scheduled.status, JSON.stringify(scheduled.data)).toBe(200);
      expect(scheduled.data.data?.status).toBe("SCHEDULED");
      const sendAt = Date.parse(scheduled.data.data?.sendAt ?? "");
      expect(Number.isNaN(sendAt)).toBe(false);
      // The zone was read back in beforeAll, so sendAt is the minute we asked
      // for: in the future and no more than ~3 minutes away.
      expect(sendAt).toBeGreaterThan(Date.now());
      expect(sendAt - Date.now()).toBeLessThan(180_000);

      const cancelled = await cancelNoticeRaw(token, n.id);
      expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
      expect((await getNoticeRaw(token, n.id)).data.data?.status).toBe(
        "CANCELLED"
      );
      expect((await cancelNoticeRaw(token, n.id)).status).toBe(409);

      await allure.step(
        "Nothing arrives past the scheduled minute",
        async () => {
          const subj = exactSubject(n.subject);
          // Cancel removes the start job, so 20 s past sendAt is enough; never
          // wait more than 150 s whatever sendAt says.
          const deadline = Math.min(sendAt + 20_000, Date.now() + 150_000);
          // Check the inbox every 10 s until past sendAt; any copy fails.
          while (Date.now() < deadline) {
            const got =
              (await listEmailIds(owner.email, { subjectPattern: subj }))
                .length +
              (await listEmailIds(teamEmail, { subjectPattern: subj })).length;
            expect(got, "a cancelled notice was delivered").toBe(0);
            await new Promise((resolve) => setTimeout(resolve, 10_000));
          }
        }
      );

      const report = await noticeReportRaw(await hqToken(), n.id);
      expect(report.data.data?.notice.status).toBe("CANCELLED");
      expect(report.data.data?.recipients.total).toBe(0);
    }
  );

  test("TC-1989: the restaurant list's 'Send a notice' opens the composer with that restaurant chosen; an unpublished restaurant has no such action", async ({
    browser,
  }) => {
    await allure.description(
      "HQ → Restaurants → row menu → Send a notice (active, published restaurants only) opens a " +
        "new notice with 'Choose restaurants' picked, the restaurant in the chooser and 'Only " +
        "live restaurants' off; the count matches the API's. The unpublished restaurant's menu " +
        "has no Send a notice."
    );
    const owners = await countAudienceRaw(
      await hqToken(),
      "PRODUCT_UPDATE",
      audience(["OWNERS"])
    );
    const people = owners.data.data?.people ?? -1;
    const { context, page } = await loginViaUi(browser, hq.email, hq.password);
    try {
      const restaurants = createAdminRestaurantsPage(page);
      await restaurants.goto();
      await restaurants.openRowActionMenu(restaurantName);
      await page
        .getByRole("menuitem", { name: TXT.sendNotice, exact: true })
        .click();

      await expect(page).toHaveURL(/section=notices/);
      await expect(page).toHaveURL(/notice=new/);
      await expect(
        page.getByRole("radio", { name: TXT.scopeChosen })
      ).toBeChecked({ timeout: 20_000 });
      await expect(
        page.locator(".MuiAutocomplete-root").getByText(restaurantName)
      ).toBeVisible();
      await expect(
        page.getByRole("switch", { name: TXT.liveOnly })
      ).not.toBeChecked();
      // Default group is Owners: the composer's count is the API's.
      await expect(
        page
          .getByText(people === 1 ? "1 person" : `${people} people`, {
            exact: true,
          })
          .first()
      ).toBeVisible();

      await restaurants.goto();
      await restaurants.openRowActionMenu(unpublishedName);
      await expect(
        page.getByRole("menuitem", { name: TXT.sendNotice, exact: true })
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    } finally {
      await context.close();
    }
  });
});
