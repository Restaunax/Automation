/**
 * api-addon-billing.spec.ts — add-on billing (restaunax #943,
 * docs/features/ADDON_BILLING.md) and add-on REQUESTS (restaunax #998,
 * docs/features/back-office/E0_ENTITLEMENTS_AND_PACKAGING.md §5 "As built —
 * add-on requests"): the Add-ons page rows, the refusals, the Team bundle,
 * HQ's payroll headcount (TC-781..784), then the request flow (TC-894..896,
 * TC-786, TC-787), the Stage 6 request flow (TC-1530..1534: products and
 * requests before the account is live, HQ's Waiting list, decline, the POS
 * answer) and the two flows QA still can't run (TC-785, TC-788 fixme).
 *
 * Stage 6 (RestauNax bo1031/reqflow, W5:P1–P4): a throwaway restaurant has
 * no subscription, so once Stage 6 is deployed its requests are WAITING, not
 * OPEN — TC-894/895 follow whichever the backend does (probeRequestFlowStage6);
 * an OPEN request HQ can mark done or decline then exists only on the seed
 * restaurant (TC-1533).
 *
 * No browser. Since #998 owners never add or remove an add-on themselves: the
 * owner sends an AddonRequest (ADD / REMOVE, one OPEN per restaurant + add-on
 * + kind) and HQ handles it — Attach (with "Start the free trial"), Schedule
 * removal, or Mark done — and the owners get an email. The old owner
 * `POST /restaurant/:id/addons` and `DELETE /restaurant/:id/addons/:instanceId`
 * answer 404.
 *
 * Two kinds of restaurant:
 *   - throwaway tenants (createSecondOwner) for the page, the refusals and the
 *     request lifecycle. They have no subscription, so HQ can't attach there —
 *     which TC-895 uses on purpose (a failed attach leaves the request open);
 *   - the SEED restaurant, the one QA restaurant with an ACTIVE (Stripe test
 *     mode) subscription, for the real attach / scheduled removal / keep /
 *     bundle swap. Only features no other spec reads on the seed are used
 *     (Menu TVs; the Team bundle swap for a few seconds), and every add-on
 *     this file attaches there is detached immediately afterwards (and before,
 *     to heal a crashed run), so the next run starts from "off".
 *
 * Deploy gate: utils/addonRequestGate.ts. Until #998 is on QA the request
 * tests skip; TC-783 checks whichever row flags the backend has.
 * Mailpit assertions run when MAILPIT_BASE_URL is set; the inbox is shared,
 * so nothing is ever deleted there (notBefore scopes each wait). Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { generateRunId, readSharedState } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  getRestaurantFeaturesRaw,
  apiRequestRaw,
  createTabletDevice,
  tabletLogin,
  tabletRaw,
  ownerAddonsRaw,
  ownerAddonRemoveRaw,
  ownerAddonRequestRaw,
  ownerAddonRequestCancelRaw,
  adminAddonsRaw,
  schedulingRaw,
  tipsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  addonRequestsLive,
  requireAddonRequests,
} from "../../../utils/addonRequestGate";
import { waitForEmail } from "../../../utils/emailHelper";
import {
  probeRequestFlowStage6,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
/** The platform's support mailbox (restaunax constant/company.ts). */
const SUPPORT_EMAIL = "support@restaunax.com";
const ZERO_ID = "00000000-0000-4000-8000-000000000000";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every field of a features[] row since restaunax #998 (G11 + requests). */
const ROW_FIELDS = [
  "feature",
  "source",
  "includedWith",
  "activePriceUsd",
  "activeInterval",
  "activeInstanceId",
  "activePerUnitUsd",
  "activeUnitLabel",
  "commitmentEndsAt",
  "committedRemoval",
  "trialEndsAt",
  "trialKind",
  "endsAt",
  "launchPriceApplied",
  "offer",
  "replaces",
  "activeAddonId",
  "canRequestAdd",
  "requestAddonId",
  "canRequestRemove",
  "pendingAdd",
  "pendingRemove",
  "contactUs",
];
/** The owner-buy flags #998 removed: no row may carry them any more. */
const GONE_FIELDS = ["canAdd", "canKeep", "canRemove"];
const OFFER_FIELDS = [
  "addonId",
  "monthlyPriceUsd",
  "perUnitUsd",
  "unitLabel",
  "trialDays",
  "trialKind",
  "trialEligible",
  "launchPriceUsd",
  "launchPriceMonths",
  "launchOfferEndsAt",
];
const MSG = {
  sent: "Request sent. We'll contact you to set it up, usually within one business day.",
  alreadySent: "You've already asked for this. We'll contact you soon.",
  cancelled: "Request cancelled.",
  invalid: "Choose an add-on and whether to add or remove it.",
  addonNotFound: "That add-on isn't available for this restaurant.",
  notOn: "This restaurant doesn't have this add-on.",
  noSubscription: "This restaurant has no subscription to add it to.",
  requestNotFound: "That request doesn't exist.",
  requestClosed: "That request has already been handled or cancelled.",
  hqHandled: "Marked done. The owners have been emailed.",
  // Stage 6 (W5:P1/P4).
  sentWaiting:
    "Request saved. We'll set it up as soon as your account is live.",
  waitingForAccount:
    "This request is waiting for the restaurant's subscription to be active. It opens on its own when it is.",
  notOpen: "Only an open request can be declined.",
  declined: "Declined. The owners have been told.",
  reasonText: "Available once your account is live",
  reasonTextEs: "Disponible cuando tu cuenta esté activa",
};
/** The owners' "declined" email subject, EN or ES. */
const DECLINED_SUBJECT = /About your|Sobre tu solicitud/;
/** The owners' "done" email subject, EN or ES (billing-notice template). */
const DONE_SUBJECT = /request is done|está lista/;
/** Seed add-ons this file attaches and must always take off again. */
const SEED_FEATURES = [
  "MENU_TVS",
  "SCHEDULING",
  "TIP_MANAGEMENT",
  "TEAM_BUNDLE",
];

test.describe.configure({ mode: "serial" });

test.describe("Add-on billing — Add-ons page, requests, refusals, Team bundle, payroll headcount (API)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenants"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let ownerEmail = "";
  let restaurantId = "";
  let otherOwner = "";
  let otherId = "";
  let live = false;
  /** Stage 6 request flow deployed (waiting / declined requests). */
  let stage6 = false;
  /** TC-1531's request, cancelled: TC-1532 tries to decline it. */
  let cancelledWaitingId = "";
  let seedToken = "";
  let seedId = "";

  const rows = async (token = ownerToken, id = restaurantId) => {
    const r = await ownerAddonsRaw(token, id, "GET");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const row = (data: Rec, feature: string) =>
    list(data.features).find((f) => f.feature === feature);
  const featuresOf = async (token: string, id: string) =>
    (await getRestaurantFeaturesRaw(token, id)).data.data?.features ?? [];
  const hqList = async (status: "OPEN" | "WAITING" | "CLOSED") => {
    const r = await adminAddonsRaw(
      adminToken,
      "GET",
      `/requests?status=${status}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return list(r.data.data);
  };
  const hqFind = async (status: "OPEN" | "WAITING" | "CLOSED", id: string) =>
    (await hqList(status)).find((x) => x.id === id);
  const request = async (
    token: string,
    id: string,
    addonId: string,
    kind: "ADD" | "REMOVE",
    note?: string
  ) => {
    const r = await ownerAddonRequestRaw(token, id, { addonId, kind, note });
    expect([200, 201], JSON.stringify(r.data)).toContain(r.status);
    return {
      status: r.status,
      data: r.data.data as Rec,
      message: r.data.message,
    };
  };
  const fulfil = async (requestId: string, body: Rec = {}) => {
    const r = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${requestId}/fulfil`,
      body
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };

  /** Take every SEED_FEATURES add-on off the seed now, and drop its open requests. */
  const resetSeed = async () => {
    if (!seedId || !adminToken) return;
    const listed = await adminAddonsRaw<Rec[]>(
      adminToken,
      "GET",
      `/restaurants/${seedId}`
    );
    for (const a of list(listed.data)) {
      const feature = String((a.addon as Rec | null)?.feature ?? "");
      if (a.isActive && a.activeInstanceId && SEED_FEATURES.includes(feature))
        await adminAddonsRaw(
          adminToken,
          "DELETE",
          `/restaurants/instances/${String(a.activeInstanceId)}`
        );
    }
    if (!live || !seedToken) return;
    for (const r of await hqList("OPEN")) {
      const feature = String((r.addon as Rec | null)?.feature ?? "");
      if (
        (r.restaurant as Rec | null)?.id === seedId &&
        SEED_FEATURES.includes(feature)
      )
        await ownerAddonRequestCancelRaw(seedToken, seedId, String(r.id));
    }
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, `${runId}a`, {
      alwaysFresh: true,
    });
    const other = await createSecondOwner(adminToken, `${runId}b`, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !other.restaurantId)
      throw new Error("[api-addon-billing] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    ownerEmail = tenant.email;
    otherId = other.restaurantId;
    otherOwner = other.accessToken;
    live = await addonRequestsLive(adminToken);
    stage6 = live && (await probeRequestFlowStage6(adminToken));
    if (OWNER_EMAIL && OWNER_PASSWORD) {
      seedToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
      seedId = readSharedState().restaurantId;
    }
    if (live) await resetSeed();
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    if (live) await resetSeed().catch(() => {});
    for (const id of [restaurantId, otherId]) {
      if (adminToken && id)
        await deleteTestRestaurant(adminToken, id).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Add-on billing");
    await allure.label("severity", "critical");
  });

  test("TC-781: every per-location service is a row with its terms in fields; each one can be requested or says 'talk to us'", async () => {
    requireAddonRequests(live);
    const data = await rows();
    expect(data).toMatchObject({
      canRequest: true,
      subscriptionStatus: null,
      payrollBilling: null,
    });
    expect(data).not.toHaveProperty("canPurchase");
    const features = list(data.features);
    expect(features.map((f) => f.feature)).toEqual(
      expect.arrayContaining([
        "SCHEDULING",
        "TIP_MANAGEMENT",
        "TEAM_BUNDLE",
        "PAYROLL",
        "ACCOUNTING_SYNC",
      ])
    );
    const offers: string[] = [];
    for (const f of features) {
      const at = String(f.feature);
      expect(Object.keys(f).sort(), at).toEqual([...ROW_FIELDS].sort());
      expect(f.source, at).toBeNull();
      expect(f, at).toMatchObject({
        canRequestRemove: false,
        activeAddonId: null,
        pendingAdd: null,
        pendingRemove: null,
        replaces: [],
      });
      if (f.offer) {
        offers.push(at);
        expect(Object.keys(f.offer as Rec)).toEqual(
          expect.arrayContaining(OFFER_FIELDS)
        );
        // One trial per feature, ever: a fresh restaurant is still eligible.
        if ((f.offer as Rec).trialDays)
          expect((f.offer as Rec).trialEligible).toBe(true);
        expect(f, at).toMatchObject({
          canRequestAdd: true,
          requestAddonId: (f.offer as Rec).addonId,
          contactUs: false,
        });
      } else {
        // No price in the catalog: "talk to us", never a disabled button.
        expect(f, at).toMatchObject({
          canRequestAdd: false,
          requestAddonId: null,
          contactUs: true,
        });
      }
    }
    // The selfServe switch is gone: every active flat add-on in the catalog
    // is offered (QA's catalog has one for each back-office service).
    expect(offers).toEqual(
      expect.arrayContaining(["SCHEDULING", "TIP_MANAGEMENT", "TEAM_BUNDLE"])
    );
    for (const a of list(data.addons)) {
      for (const gone of GONE_FIELDS) expect(a).not.toHaveProperty(gone);
      expect(a).toMatchObject({ pendingAdd: null, pendingRemove: null });
      expect(typeof a.canRequestAdd).toBe("boolean");
      expect(typeof a.canRequestRemove).toBe("boolean");
    }
    test.info().annotations.push({
      type: "catalogue",
      description: `requestable on QA: ${offers.join(", ") || "none"}`,
    });
  });

  test("TC-782: the old buy/remove routes are gone (404); a request is refused in words; another owner can't look or ask", async () => {
    requireAddonRequests(live);
    const offer = (row(await rows(), "SCHEDULING")?.offer as Rec).addonId;
    expect(offer, "QA's catalog offers Scheduling").toBeTruthy();

    // The old owner purchase and removal no longer exist.
    expect(
      (
        await ownerAddonsRaw(ownerToken, restaurantId, "POST", {
          addonId: offer,
        })
      ).status
    ).toBe(404);
    expect(
      (await ownerAddonRemoveRaw(ownerToken, restaurantId, ZERO_ID)).status
    ).toBe(404);

    const refused = async (body: Rec, status: number, message: string) => {
      const r = await ownerAddonRequestRaw(ownerToken, restaurantId, body);
      expect(r.status, JSON.stringify(r.data)).toBe(status);
      expect(r.data.message).toBe(message);
    };
    await refused({}, 400, MSG.invalid);
    await refused({ addonId: offer, kind: "BUY" }, 400, MSG.invalid);
    await refused({ addonId: ZERO_ID, kind: "ADD" }, 404, MSG.addonNotFound);
    await refused({ addonId: offer, kind: "REMOVE" }, 400, MSG.notOn);
    const unknown = await ownerAddonRequestCancelRaw(
      ownerToken,
      restaurantId,
      ZERO_ID
    );
    expect(unknown.status).toBe(404);
    expect(unknown.data.message).toBe(MSG.requestNotFound);

    // Another restaurant's owner can neither look nor ask; HQ's list is HQ's.
    expect((await ownerAddonsRaw(otherOwner, restaurantId, "GET")).status).toBe(
      403
    );
    expect(
      (
        await ownerAddonRequestRaw(otherOwner, restaurantId, {
          addonId: offer,
          kind: "ADD",
        })
      ).status
    ).toBe(403);
    expect(
      (await ownerAddonRequestCancelRaw(otherOwner, restaurantId, ZERO_ID))
        .status
    ).toBe(403);
    expect(
      (await adminAddonsRaw(ownerToken, "GET", "/requests?status=OPEN")).status
    ).toBe(403);
  });

  test("TC-783: the Team bundle grants Scheduling and Tip Management; the page shows them included with it, not for sale", async () => {
    // Pre-#998 the rows carry canAdd/canRemove; since #998 canRequestAdd/
    // canRequestRemove (utils/addonRequestGate.ts).
    const ADD = live ? "canRequestAdd" : "canAdd";
    const REMOVE = live ? "canRequestRemove" : "canRemove";
    const day = new Date().toISOString().slice(0, 10);
    const before = {
      schedule: (
        await schedulingRaw(ownerToken, restaurantId, "GET", `?date=${day}`)
      ).status,
      tips: (await tipsRaw(ownerToken, restaurantId, "GET", "/policy")).status,
    };
    expect(before).toEqual({ schedule: 403, tips: 403 });

    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TEAM_BUNDLE",
      true,
      `automation team bundle ${runId}`
    );
    expect(g.ok, JSON.stringify(g.data)).toBe(true);
    try {
      const features = await featuresOf(ownerToken, restaurantId);
      expect(features).toEqual(
        expect.arrayContaining([
          "TEAM_BUNDLE",
          "SCHEDULING",
          "TIP_MANAGEMENT",
          "TIMECARDS",
        ])
      );
      expect(features).not.toContain("PAYROLL");

      const data = await rows();
      expect(row(data, "TEAM_BUNDLE")).toMatchObject({
        source: "RESTAUNAX",
        [ADD]: false,
        [REMOVE]: false,
        contactUs: false,
      });
      for (const f of ["SCHEDULING", "TIP_MANAGEMENT"]) {
        expect(row(data, f), f).toMatchObject({
          source: "INCLUDED_WITH",
          includedWith: "TEAM_BUNDLE",
          [ADD]: false,
          contactUs: false,
        });
      }
      expect(row(data, "PAYROLL")).toMatchObject({ source: null });

      expect(
        (await schedulingRaw(ownerToken, restaurantId, "GET", `?date=${day}`))
          .status
      ).toBe(200);
      expect(
        (await tipsRaw(ownerToken, restaurantId, "GET", "/policy")).status
      ).toBe(200);
    } finally {
      await deleteFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        "TEAM_BUNDLE"
      );
    }
    // Removing the bundle takes both away again.
    expect(
      (await schedulingRaw(ownerToken, restaurantId, "GET", `?date=${day}`))
        .status
    ).toBe(403);
    expect(row(await rows(), "SCHEDULING")).toMatchObject({ source: null });
  });

  test("TC-784: HQ's payroll headcount page loads for a month (Gusto's count marked unavailable on QA); owners can't open it", async () => {
    const month = new Date().toISOString().slice(0, 7);
    const r = await adminAddonsRaw(
      adminToken,
      "GET",
      `/payroll-headcount?month=${month}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    expect(data.month).toBe(month);
    expect(Array.isArray(data.rows)).toBe(true);
    expect(typeof data.gustoAvailable).toBe("boolean");
    for (const x of list(data.rows)) {
      expect(x).toMatchObject({ month });
      expect(typeof x.billableCount).toBe("number");
    }
    // A malformed month falls back to this one rather than failing.
    const fallback = await adminAddonsRaw(
      adminToken,
      "GET",
      "/payroll-headcount?month=2026-13"
    );
    expect(fallback.status).toBe(200);
    expect((fallback.data.data as Rec).month).toBe(month);
    const owner = await adminAddonsRaw(
      ownerToken,
      "GET",
      `/payroll-headcount?month=${month}`
    );
    expect(owner.status).toBe(403);
  });

  test("TC-894: the owner requests an add-on; asking again returns the same open request; HQ sees it; the owner cancels it", async () => {
    requireAddonRequests(live);
    const addonId = String(
      (row(await rows(), "SCHEDULING")?.offer as Rec).addonId
    );
    const note = `automation ${runId}: best time is mornings`;

    // Stage 6: a restaurant with no active subscription parks the request
    // as WAITING (HQ's Waiting list), before it it was OPEN.
    const status = stage6 ? "WAITING" : "OPEN";
    const first = await request(ownerToken, restaurantId, addonId, "ADD", note);
    expect(first.status).toBe(201);
    expect(first.message).toBe(stage6 ? MSG.sentWaiting : MSG.sent);
    expect(first.data).toMatchObject({ addonId, kind: "ADD", status });
    const id = String(first.data.id);

    // One live request per (restaurant, add-on, kind): the second is the first.
    const again = await request(ownerToken, restaurantId, addonId, "ADD");
    expect(again.status).toBe(200);
    expect(again.message).toBe(stage6 ? MSG.sentWaiting : MSG.alreadySent);
    expect(again.data.id).toBe(id);

    // The card shows it as sent, with nothing turned on.
    const r1 = row(await rows(), "SCHEDULING");
    expect(r1).toMatchObject({
      source: null,
      pendingAdd: { id, createdAt: first.data.createdAt },
      pendingRemove: null,
    });

    // HQ → Add-ons → Add-on requests lists it with who asked and the note.
    const hq = await hqFind(status, id);
    expect(hq, `the request is in HQ's ${status} list`).toBeTruthy();
    expect(hq).toMatchObject({
      kind: "ADD",
      status,
      note,
      handledAt: null,
      restaurant: { id: restaurantId, subscriptionStatus: null },
      addon: { id: addonId, feature: "SCHEDULING" },
      requestedBy: { email: ownerEmail },
    });

    const cancelled = await ownerAddonRequestCancelRaw(
      ownerToken,
      restaurantId,
      id
    );
    expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
    expect(cancelled.data).toMatchObject({
      data: { id, status: "CANCELLED" },
      message: MSG.cancelled,
    });
    const twice = await ownerAddonRequestCancelRaw(
      ownerToken,
      restaurantId,
      id
    );
    expect(twice.status).toBe(409);
    expect(twice.data.message).toBe(MSG.requestClosed);
    expect(row(await rows(), "SCHEDULING")).toMatchObject({ pendingAdd: null });
    expect(await hqFind(status, id)).toBeUndefined();
    expect(await hqFind("CLOSED", id)).toMatchObject({ status: "CANCELLED" });

    // A cancelled request can't be handled by HQ any more.
    const late = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${id}/fulfil`,
      {}
    );
    expect(late.status).toBe(409);
    expect(late.data.message).toBe(MSG.requestClosed);
  });

  test("TC-895: an attach that can't happen leaves the request open; 'Mark done' closes it, alerts support on the way in and emails the owner on the way out", async () => {
    requireAddonRequests(live);
    const addonId = String(
      (row(await rows(), "TIP_MANAGEMENT")?.offer as Rec).addonId
    );
    const asked = new Date();
    const sent = await request(ownerToken, restaurantId, addonId, "ADD");
    expect(sent.status).toBe(201);
    const id = String(sent.data.id);
    if (stage6) {
      // Stage 6: no subscription = WAITING. HQ can neither attach it nor
      // mark it done until the account is live; Mark done on an OPEN
      // request is TC-1533 (the seed restaurant).
      expect(sent.data.status).toBe("WAITING");
      for (const action of ["fulfil", "done"]) {
        const r = await adminAddonsRaw(
          adminToken,
          "POST",
          `/requests/${id}/${action}`,
          {}
        );
        expect(r.status, `${action} on a waiting request`).toBe(409);
        expect(r.data.message).toBe(MSG.waitingForAccount);
      }
      expect(await hqFind("WAITING", id)).toMatchObject({ status: "WAITING" });
      expect(
        (await ownerAddonRequestCancelRaw(ownerToken, restaurantId, id)).status
      ).toBe(200);
      return;
    }
    const restaurantName = String(
      ((await hqFind("OPEN", id))?.restaurant as Rec).name
    );

    // No subscription on a throwaway restaurant: Attach is refused in words,
    // nothing is charged, and the request goes back to OPEN.
    const attach = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${id}/fulfil`,
      {
        offerTrial: true,
      }
    );
    expect(attach.status, JSON.stringify(attach.data)).toBe(400);
    expect(attach.data.message).toBe(MSG.noSubscription);
    expect(await hqFind("OPEN", id)).toMatchObject({
      status: "OPEN",
      handledAt: null,
    });
    expect(row(await rows(), "TIP_MANAGEMENT")).toMatchObject({
      source: null,
      pendingAdd: { id },
    });

    const done = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${id}/done`
    );
    expect(done.status, JSON.stringify(done.data)).toBe(200);
    expect(done.data).toMatchObject({
      data: { id, status: "DONE" },
      message: MSG.hqHandled,
    });
    const closed = await hqFind("CLOSED", id);
    expect(closed).toMatchObject({ status: "DONE" });
    expect(closed?.handledAt).toBeTruthy();
    expect(closed?.handledBy).not.toBeNull();
    expect(row(await rows(), "TIP_MANAGEMENT")).toMatchObject({
      source: null,
      pendingAdd: null,
    });
    // Handled once: a second Mark done is refused.
    expect(
      (await adminAddonsRaw(adminToken, "POST", `/requests/${id}/done`)).status
    ).toBe(409);

    if (!MAILPIT) {
      test.info().annotations.push({
        type: "skipped-assertion",
        description:
          "MAILPIT_BASE_URL not set — support alert and owner email not checked",
      });
      return;
    }
    const alert = await waitForEmail(SUPPORT_EMAIL, {
      subjectPattern: new RegExp(
        `^Add-on request: ${escapeRe(restaurantName)} wants `
      ),
      notBefore: asked,
      timeoutMs: 60_000,
    });
    expect(alert.subject).not.toMatch(/remove/);
    const mail = await waitForEmail(ownerEmail, {
      subjectPattern: DONE_SUBJECT,
      notBefore: asked,
      timeoutMs: 60_000,
    });
    expect(mail.html_body + mail.text_body).toContain(restaurantName);
  });

  test("TC-896: the owner requests Menu TVs; HQ attaches it with 'Start the free trial'; it's on, the request is DONE and the owner is emailed", async () => {
    requireAddonRequests(live);
    test.skip(
      !seedToken || !seedId,
      "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
    );
    test.setTimeout(120_000);
    const before = await rows(seedToken, seedId);
    expect(
      before.subscriptionStatus,
      "the seed restaurant's subscription"
    ).toBe("ACTIVE");
    const tv = row(before, "MENU_TVS");
    expect(tv, "the seed restaurant has a Menu TVs row").toBeTruthy();
    expect(tv).toMatchObject({ source: null, canRequestAdd: true });
    const offer = tv!.offer as Rec;
    const addonId = String(offer.addonId);
    expect(await featuresOf(seedToken, seedId)).not.toContain("MENU_TVS");

    const sent = await request(seedToken, seedId, addonId, "ADD");
    expect(sent.status).toBe(201);
    const id = String(sent.data.id);
    const asked = new Date();
    const result = await fulfil(id, { offerTrial: true });
    expect(result).toMatchObject({
      id,
      status: "DONE",
      outcome: "added",
      endsAt: null,
    });
    // G4: the trial applies only when the add-on has one and this restaurant
    // hasn't used it for the feature (QA's catalog has no trialDays today).
    if (offer.trialDays && offer.trialEligible) {
      expect(result.trialEndsAt).toBeTruthy();
      expect(Date.parse(String(result.trialEndsAt))).toBeGreaterThan(
        Date.now()
      );
    } else {
      expect(result.trialEndsAt).toBeNull();
    }

    expect(await featuresOf(seedToken, seedId)).toContain("MENU_TVS");
    const after = row(await rows(seedToken, seedId), "MENU_TVS");
    expect(after).toMatchObject({
      source: "ADDON",
      activeAddonId: addonId,
      canRequestAdd: false,
      canRequestRemove: true,
      pendingAdd: null,
      endsAt: null,
    });
    expect(after?.activeInstanceId).toBeTruthy();
    expect(await hqFind("CLOSED", id)).toMatchObject({ status: "DONE" });
    // Already on: another ADD request is refused, not queued.
    const dup = await ownerAddonRequestRaw(seedToken, seedId, {
      addonId,
      kind: "ADD",
    });
    expect(dup.status).toBe(400);

    if (MAILPIT) {
      const mail = await waitForEmail(OWNER_EMAIL, {
        subjectPattern: DONE_SUBJECT,
        notBefore: asked,
        timeoutMs: 60_000,
      });
      expect(mail.subject).toMatch(/Menu TV|men[uú]/i);
    }
  });

  test("TC-786: a removal request keeps the add-on until the paid period ends; asking to keep it undoes the removal", async () => {
    requireAddonRequests(live);
    test.skip(
      !seedToken || !seedId,
      "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
    );
    test.setTimeout(120_000);
    const tv = row(await rows(seedToken, seedId), "MENU_TVS");
    expect(tv, "TC-896 left Menu TVs on").toMatchObject({ source: "ADDON" });
    const addonId = String(tv!.activeAddonId);
    const inTrial = !!tv!.trialEndsAt;

    const sent = await request(seedToken, seedId, addonId, "REMOVE");
    expect(sent.status).toBe(201);
    const id = String(sent.data.id);
    expect(row(await rows(seedToken, seedId), "MENU_TVS")).toMatchObject({
      pendingRemove: { id },
      // Nothing changes until HQ does it.
      source: "ADDON",
      endsAt: null,
    });

    const asked = new Date();
    const removed = await fulfil(id);
    if (inTrial) {
      // In its free trial it goes now and nothing is charged.
      expect(removed).toMatchObject({ outcome: "removedNow", endsAt: null });
      expect(await featuresOf(seedToken, seedId)).not.toContain("MENU_TVS");
      test.info().annotations.push({
        type: "trial",
        description:
          "Menu TVs was in its trial, so the period-end removal and Keep weren't exercised",
      });
      return;
    }
    expect(removed).toMatchObject({
      outcome: "removalScheduled",
      status: "DONE",
    });
    const endsAt = String(removed.endsAt);
    expect(Date.parse(endsAt)).toBeGreaterThan(Date.now());
    // G5: still working until the end of the month already paid for.
    expect(await featuresOf(seedToken, seedId)).toContain("MENU_TVS");
    expect(row(await rows(seedToken, seedId), "MENU_TVS")).toMatchObject({
      source: "ADDON",
      endsAt,
      canRequestRemove: false,
      // "Request to keep it": an ADD request for the add-on it's on.
      canRequestAdd: true,
      requestAddonId: addonId,
      pendingRemove: null,
    });
    if (MAILPIT)
      await waitForEmail(OWNER_EMAIL, {
        subjectPattern: DONE_SUBJECT,
        notBefore: asked,
        timeoutMs: 60_000,
      });

    const keep = await request(seedToken, seedId, addonId, "ADD");
    expect(keep.status).toBe(201);
    const kept = await fulfil(String(keep.data.id));
    expect(kept).toMatchObject({ outcome: "kept", endsAt: null });
    expect(row(await rows(seedToken, seedId), "MENU_TVS")).toMatchObject({
      source: "ADDON",
      endsAt: null,
      canRequestRemove: true,
      canRequestAdd: false,
    });
    expect(await featuresOf(seedToken, seedId)).toContain("MENU_TVS");

    // Clean up now (immediate HQ detach), so the next run starts from off.
    await resetSeed();
    expect(await featuresOf(seedToken, seedId)).not.toContain("MENU_TVS");
  });

  test("TC-787: attaching a requested Team bundle replaces the separate Scheduling and Tip Management lines", async () => {
    requireAddonRequests(live);
    test.skip(
      !seedToken || !seedId,
      "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
    );
    test.setTimeout(180_000);
    try {
      const page = await rows(seedToken, seedId);
      for (const f of ["SCHEDULING", "TIP_MANAGEMENT"]) {
        const r = row(page, f);
        expect(r, f).toMatchObject({ source: null, canRequestAdd: true });
        const sent = await request(
          seedToken,
          seedId,
          String(r!.requestAddonId),
          "ADD"
        );
        expect(sent.status, f).toBe(201);
        // No trial: keep the seed's once-per-feature trials unused.
        const res = await fulfil(String(sent.data.id), { offerTrial: false });
        expect(res, f).toMatchObject({ outcome: "added", trialEndsAt: null });
      }
      const both = await rows(seedToken, seedId);
      for (const f of ["SCHEDULING", "TIP_MANAGEMENT"])
        expect(row(both, f), f).toMatchObject({ source: "ADDON" });
      const bundle = row(both, "TEAM_BUNDLE");
      expect(bundle).toMatchObject({ source: null, canRequestAdd: true });
      expect([...(bundle!.replaces as string[])].sort()).toEqual([
        "SCHEDULING",
        "TIP_MANAGEMENT",
      ]);

      const sent = await request(
        seedToken,
        seedId,
        String(bundle!.requestAddonId),
        "ADD"
      );
      expect(sent.status).toBe(201);
      const res = await fulfil(String(sent.data.id), { offerTrial: false });
      // A swap is an upgrade: no trial.
      expect(res).toMatchObject({ outcome: "added", trialEndsAt: null });

      const swapped = await rows(seedToken, seedId);
      expect(row(swapped, "TEAM_BUNDLE")).toMatchObject({ source: "ADDON" });
      for (const f of ["SCHEDULING", "TIP_MANAGEMENT"])
        expect(row(swapped, f), f).toMatchObject({
          source: "INCLUDED_WITH",
          includedWith: "TEAM_BUNDLE",
          activeInstanceId: null,
        });
      // The separate lines are gone from the subscription.
      const hq = await adminAddonsRaw<Rec[]>(
        adminToken,
        "GET",
        `/restaurants/${seedId}`
      );
      for (const a of list(hq.data)) {
        const feature = String((a.addon as Rec).feature);
        if (feature === "SCHEDULING" || feature === "TIP_MANAGEMENT")
          expect(a.activeInstanceId, feature).toBeNull();
      }
      expect(await featuresOf(seedToken, seedId)).toEqual(
        expect.arrayContaining(["TEAM_BUNDLE", "SCHEDULING", "TIP_MANAGEMENT"])
      );
    } finally {
      await resetSeed();
    }
    expect(await featuresOf(seedToken, seedId)).not.toContain("TEAM_BUNDLE");
  });

  // ── Stage 6 (RestauNax bo1031/reqflow, W5:P1–P4) ──────────────────────────

  test("TC-1530: an account that isn't live sees every product, marked 'available once your account is live' (EN and ES)", async () => {
    requireAddonRequests(live);
    requireRelease("requestFlowStage6", stage6);
    const en = await getRestaurantFeaturesRaw(ownerToken, restaurantId);
    expect(en.status).toBe(200);
    const data = en.data.data as Rec;
    expect(data.accountLive).toBe(false);
    const products = list(data.availableProducts);
    expect(products.length, "the list is not empty").toBeGreaterThan(0);
    expect((data.available as string[]).length).toBe(products.length);
    for (const p of products) {
      expect(p).toMatchObject({
        accountLive: false,
        reason: "ACCOUNT_NOT_ACTIVE",
        reasonText: MSG.reasonText,
      });
      expect(p).toHaveProperty("pendingRequestStatus");
    }
    const es = await apiRequestRaw<{ data?: Rec }>(
      "GET",
      `/restaurant/restaurantId/${restaurantId}/features`,
      undefined,
      ownerToken,
      { "Accept-Language": "es" }
    );
    expect(list(es.data.data?.availableProducts)[0]?.reasonText).toBe(
      MSG.reasonTextEs
    );
    // The Products page's own answer says the same.
    expect((await rows()).accountLive).toBe(false);
  });

  test("TC-1531: a request before the account is live waits: HQ's Waiting list (with its count), not Open; HQ can't attach it; the owner can cancel it", async () => {
    requireAddonRequests(live);
    requireRelease("requestFlowStage6", stage6);
    const asked = await ownerAddonRequestRaw(ownerToken, restaurantId, {
      feature: "PAYROLL",
      kind: "ADD",
      source: "products_page",
    });
    expect(asked.status, JSON.stringify(asked.data)).toBe(201);
    expect(asked.data.message).toBe(MSG.sentWaiting);
    const req = asked.data.data as Rec;
    expect(req).toMatchObject({ feature: "PAYROLL", status: "WAITING" });
    const id = String(req.id);

    const payroll = list(
      (
        (await getRestaurantFeaturesRaw(ownerToken, restaurantId)).data
          .data as Rec
      ).availableProducts
    ).find((p) => p.feature === "PAYROLL");
    expect(payroll).toMatchObject({
      pendingRequestStatus: "WAITING",
      pendingRequestAt: req.createdAt,
    });

    const waiting = await adminAddonsRaw(
      adminToken,
      "GET",
      "/requests?status=WAITING"
    );
    expect(waiting.status).toBe(200);
    expect(typeof (waiting.data as Rec).waitingCount).toBe("number");
    expect(Number((waiting.data as Rec).waitingCount)).toBeGreaterThanOrEqual(
      1
    );
    expect(list(waiting.data.data).find((x) => x.id === id)).toMatchObject({
      status: "WAITING",
      feature: "PAYROLL",
      restaurant: { id: restaurantId, subscriptionStatus: null },
    });
    expect(await hqFind("OPEN", id)).toBeUndefined();

    const attach = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${id}/fulfil`,
      {}
    );
    expect(attach.status).toBe(409);
    expect(attach.data.message).toBe(MSG.waitingForAccount);

    const cancel = await ownerAddonRequestCancelRaw(
      ownerToken,
      restaurantId,
      id
    );
    expect(cancel.status).toBe(200);
    expect(await hqFind("CLOSED", id)).toMatchObject({ status: "CANCELLED" });
    cancelledWaitingId = id;
  });

  test("TC-1532: decline is HQ's only: 401 without a sign-in, 403 for an owner, 404 for no such request, 409 when it isn't open", async () => {
    requireAddonRequests(live);
    requireRelease("requestFlowStage6", stage6);
    expect(cancelledWaitingId, "TC-1531 ran").not.toBe("");
    const path = (id: string) => `/api/admin/addons/requests/${id}/decline`;
    expect(
      (await apiRequestRaw("POST", path(cancelledWaitingId), {})).status
    ).toBe(401);
    expect(
      (await apiRequestRaw("POST", path(cancelledWaitingId), {}, ownerToken))
        .status
    ).toBe(403);
    expect(
      (await adminAddonsRaw(adminToken, "POST", `/requests/${ZERO_ID}/decline`))
        .status
    ).toBe(404);
    const closed = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${cancelledWaitingId}/decline`,
      { reason: "automation" }
    );
    expect(closed.status).toBe(409);
    expect(closed.data.message).toBe(MSG.notOpen);
  });

  test("TC-1533: on a live account a request is OPEN; HQ declines it (reason emailed, Closed shows Declined); asked again, Mark done closes it", async () => {
    requireAddonRequests(live);
    requireRelease("requestFlowStage6", stage6);
    test.skip(
      !seedToken || !seedId,
      "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
    );
    const features = (await getRestaurantFeaturesRaw(seedToken, seedId)).data
      .data as Rec;
    expect(features.accountLive, "the seed restaurant is live").toBe(true);
    // A product the seed can ask for and hasn't, never one TC-896/786/787 attach.
    const product = list(features.availableProducts).find(
      (p) =>
        !p.pendingRequestStatus && !SEED_FEATURES.includes(String(p.feature))
    );
    test.skip(!product, "the seed restaurant has no product left to ask for");
    const feature = String(product!.feature);
    expect(product).toMatchObject({ accountLive: true, reason: null });

    const askFeature = async () => {
      const r = await ownerAddonRequestRaw(seedToken, seedId, {
        feature,
        kind: "ADD",
        source: "products_page",
        note: `automation ${runId}`,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      expect(r.data.data).toMatchObject({ feature, status: "OPEN" });
      return String((r.data.data as Rec).id);
    };
    const pendingOf = async () =>
      list(
        ((await getRestaurantFeaturesRaw(seedToken, seedId)).data.data as Rec)
          .availableProducts
      ).find((p) => p.feature === feature);

    const asked = new Date();
    const id = await askFeature();
    expect(await pendingOf()).toMatchObject({ pendingRequestStatus: "OPEN" });
    expect(await hqFind("OPEN", id)).toMatchObject({ status: "OPEN" });

    const declined = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${id}/decline`,
      { reason: `automation ${runId}: not for this restaurant yet` }
    );
    expect(declined.status, JSON.stringify(declined.data)).toBe(200);
    expect(declined.data).toMatchObject({
      data: { id, status: "DECLINED" },
      message: MSG.declined,
    });
    const closed = await hqFind("CLOSED", id);
    expect(closed).toMatchObject({ status: "DECLINED" });
    expect(closed?.handledBy).not.toBeNull();
    expect(await pendingOf()).toMatchObject({ pendingRequestStatus: null });

    if (MAILPIT) {
      const mail = await waitForEmail(OWNER_EMAIL, {
        subjectPattern: DECLINED_SUBJECT,
        notBefore: asked,
        timeoutMs: 60_000,
      });
      expect(mail.html_body + mail.text_body).toContain(
        "not for this restaurant yet"
      );
    }

    // Declined is not forever: asked again, Mark done closes it (DONE).
    const again = await askFeature();
    expect(again).not.toBe(id);
    const done = await adminAddonsRaw(
      adminToken,
      "POST",
      `/requests/${again}/done`
    );
    expect(done.status, JSON.stringify(done.data)).toBe(200);
    expect(done.data).toMatchObject({
      data: { id: again, status: "DONE" },
      message: MSG.hqHandled,
    });
    expect(await pendingOf()).toMatchObject({ pendingRequestStatus: null });
  });

  test("TC-1534: the POS answer carries the products with their request status, and whether the account is live", async () => {
    requireAddonRequests(live);
    requireRelease("requestFlowStage6", stage6);
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-reqflow-${runId}`
    );
    const tabletToken = await tabletLogin(device.name, device.code);
    const pos = await tabletRaw<Rec>(tabletToken, "GET", "/features");
    expect(pos.status, JSON.stringify(pos.data)).toBe(200);
    expect(pos.data.accountLive).toBe(false);
    const products = list(pos.data.availableProducts);
    expect(products.length).toBeGreaterThan(0);
    // The old key list stays, the same products.
    expect((pos.data.available as string[]).sort()).toEqual(
      products.map((p) => String(p.feature)).sort()
    );
    for (const p of products) {
      expect(p).toMatchObject({
        accountLive: false,
        reason: "ACCOUNT_NOT_ACTIVE",
      });
      expect(p).toHaveProperty("pendingRequestAt");
      expect(p).toHaveProperty("pendingRequestStatus");
    }
  });

  test.fixme("TC-785: trial — HQ attaching a requested add-on with 'Start the free trial' starts its 30-day trial once per feature; a second attach after removal bills at once", async () => {
    // Arrange: an add-on with trialDays 30 and a restaurant with an ACTIVE
    // subscription that never had that feature's trial. Act: owner POST
    // /addons/requests {addonId, kind ADD} → HQ POST /requests/:id/fulfil
    // {offerTrial: true}. Assert: outcome "added", trialEndsAt ≈ now + 30 d,
    // email "free until <date>"; row trialKind TRIAL, offer.trialEligible
    // false; REMOVE request → fulfil → outcome "removedNow"; ADD again →
    // trialEndsAt null.
    // Still blocked on QA: no add-on in QA's catalog has trialDays
    // (create-back-office-addons.ts not run there), and the trial is once per
    // feature, so the seed restaurant — the only QA restaurant with an ACTIVE
    // subscription; a throwaway can't get one (Stripe ToS needs a human) —
    // could run it once ever. Covered by restaunax addonRequests.int.test.ts /
    // addonBilling.int.test.ts. TC-896 asserts the trial whenever QA's
    // catalog offers one.
  });

  test.fixme("TC-788: the payroll card shows this month's people on payroll and the per-person price", async () => {
    // With RestauNax Payroll (Embedded Gusto) on: GET /restaurant/:rid/addons
    // payrollBilling {month, billableCount, perUnitUsd 6, estimateUsd =
    // 6 × count, staleCount, people[]}. Still blocked on QA: the catalog's
    // Payroll add-on has no per-person price (perUnitUsd null) and QA has no
    // Gusto Embedded keys (BACK_OFFICE_COVERAGE row 11). HQ attach via a
    // request is no longer the blocker.
  });
});
