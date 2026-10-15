/**
 * api-addon-billing.spec.ts — add-on billing (restaunax #943,
 * docs/features/ADDON_BILLING.md): the Add-ons page rows, purchase refusals,
 * the Team bundle, HQ's payroll headcount (TC-781..784), plus the Stripe
 * flows that QA can't run yet as placeholders (TC-785..788).
 *
 * No browser, one throwaway restaurant.
 *
 * Why the trial / removal / "Keep it" / bundle-swap flows are test.fixme:
 *   1. QA's catalogue has no self-serve back-office add-ons with trials yet —
 *      `prisma/scripts/create-back-office-addons.ts --yes` (ADDON_BILLING.md
 *      §3) has not been run in the QA backend container (2026-10-15: no
 *      TEAM_BUNDLE or TIP_MANAGEMENT add-on, trialDays null on all of them).
 *      The suite must not create them: only one self-serve add-on per feature
 *      may exist (`selfServeTaken`), so a test-made one would block the real
 *      catalogue.
 *   2. A throwaway restaurant can't reach an ACTIVE subscription by API.
 *      Activation needs Stripe Connect charges enabled, and Stripe refuses to
 *      let a platform accept its Terms of Service for an Express account
 *      (stripeTestOnboardingService.ts) — a human clicks "Agree".
 * Admin overrides cover the entitlement side (TC-783); restaunax's
 * addonBilling.int.test.ts covers the Stripe side against an in-memory
 * Stripe. Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  getRestaurantFeaturesRaw,
  ownerAddonsRaw,
  ownerAddonRemoveRaw,
  adminAddonsRaw,
  schedulingRaw,
  tipsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const ROW_FIELDS = [
  "feature",
  "source",
  "includedWith",
  "activePriceUsd",
  "activeInterval",
  "activeInstanceId",
  "activePerUnitUsd",
  "trialEndsAt",
  "trialKind",
  "endsAt",
  "launchPriceApplied",
  "offer",
  "replaces",
  "canAdd",
  "canRemove",
  "canKeep",
  "contactUs",
];
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
const NOT_SELF_SERVE =
  "That add-on can't be added or removed here. Contact RestauNax support.";
const QA_NOT_READY =
  "QA can't run it: no self-serve back-office add-ons with trials in the catalogue (create-back-office-addons.ts not run on QA) and no API path to an ACTIVE subscription for a throwaway restaurant (Stripe ToS needs a human). Covered by restaunax addonBilling.int.test.ts.";

test.describe.configure({ mode: "serial" });

test.describe("Add-on billing — Add-ons page, refusals, Team bundle, payroll headcount (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenants)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let otherOwner = "";
  let otherId = "";

  const rows = async (token = ownerToken) => {
    const r = await ownerAddonsRaw(token, restaurantId, "GET");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const row = (data: Rec, feature: string) =>
    list(data.features).find((f) => f.feature === feature);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, `${runId}a`);
    const other = await createSecondOwner(adminToken, `${runId}b`);
    if (!tenant.restaurantId || !other.restaurantId)
      throw new Error("[api-addon-billing] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    otherId = other.restaurantId;
    otherOwner = other.accessToken;
  });

  test.afterAll(async () => {
    for (const id of [restaurantId, otherId]) {
      if (adminToken && id)
        await deleteTestRestaurant(adminToken, id).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Add-on billing");
    await allure.label("severity", "critical");
  });

  test("TC-781: every per-location service is a row with its terms in fields; nothing is offered as a locked button", async () => {
    const data = await rows();
    expect(data).toMatchObject({
      canPurchase: true,
      subscriptionStatus: null,
      payrollBilling: null,
    });
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
      expect(Object.keys(f).sort(), String(f.feature)).toEqual(
        [...ROW_FIELDS].sort()
      );
      expect(f.source, String(f.feature)).toBeNull();
      expect(f.canRemove).toBe(false);
      expect(f.canKeep).toBe(false);
      expect(f.replaces).toEqual([]);
      if (f.offer) {
        offers.push(String(f.feature));
        expect(Object.keys(f.offer as Rec)).toEqual(
          expect.arrayContaining(OFFER_FIELDS)
        );
        // One trial per feature, ever: a fresh restaurant is still eligible.
        if ((f.offer as Rec).trialDays)
          expect((f.offer as Rec).trialEligible).toBe(true);
        expect(f.canAdd).toBe(true);
        expect(f.contactUs).toBe(false);
      } else {
        // No public price: "talk to us", never a disabled Add button.
        expect(f.canAdd).toBe(false);
        expect(f.contactUs).toBe(true);
      }
    }
    test.info().annotations.push({
      type: "catalogue",
      description: `self-serve offers on QA: ${offers.join(", ") || "none"}`,
    });
  });

  test("TC-782: buying is refused in words — not self-serve, unknown, not this owner's; removing an unknown add-on is 404", async () => {
    const data = await rows();
    const offered = new Set(
      list(data.features)
        .map((f) => (f.offer as Rec | null)?.addonId)
        .filter(Boolean)
    );
    const catalog = await adminAddonsRaw(adminToken, "GET", "/catalog");
    expect(catalog.status).toBe(200);
    const notSelfServe = list(catalog.data).find(
      (x) => x.isActive && !offered.has(x.id)
    );
    expect(
      notSelfServe,
      "QA's catalogue has an admin-only add-on"
    ).toBeTruthy();
    const refused = await ownerAddonsRaw(ownerToken, restaurantId, "POST", {
      addonId: notSelfServe!.id,
    });
    expect(refused.status).toBe(400);
    expect(refused.data.message).toBe(NOT_SELF_SERVE);
    const unknown = await ownerAddonsRaw(ownerToken, restaurantId, "POST", {
      addonId: "00000000-0000-4000-8000-000000000000",
    });
    expect(unknown.status).toBe(400);

    const gone = await ownerAddonRemoveRaw(
      ownerToken,
      restaurantId,
      "00000000-0000-4000-8000-000000000000"
    );
    expect(gone.status).toBe(404);

    // Another restaurant's owner can neither look nor buy.
    expect((await rows(ownerToken)).canPurchase).toBe(true);
    const peek = await ownerAddonsRaw(otherOwner, restaurantId, "GET");
    expect(peek.status).toBe(403);
    const buy = await ownerAddonsRaw(otherOwner, restaurantId, "POST", {
      addonId: notSelfServe!.id,
    });
    expect(buy.status).toBe(403);
  });

  test("TC-783: the Team bundle grants Scheduling and Tip Management; the page shows them included with it, not for sale", async () => {
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
      const features =
        (await getRestaurantFeaturesRaw(ownerToken, restaurantId)).data.data
          ?.features ?? [];
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
        canAdd: false,
        canRemove: false,
        contactUs: false,
      });
      for (const f of ["SCHEDULING", "TIP_MANAGEMENT"]) {
        expect(row(data, f), f).toMatchObject({
          source: "INCLUDED_WITH",
          includedWith: "TEAM_BUNDLE",
          canAdd: false,
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

  test.fixme("TC-785: trial — adding a self-serve add-on starts its 30-day trial once per feature; a second add after removal bills at once", async () => {
    // Arrange: restaurant with an ACTIVE subscription; self-serve SCHEDULING
    // offer with trialDays 30. Act: POST /restaurant/:rid/addons {addonId}.
    // Assert: 201, data.trialEndsAt ≈ now + 30 d, message "…free until <date>";
    // row trialKind TRIAL, offer.trialEligible false afterwards; DELETE in
    // trial → removed at once (status CANCELED, "removedInTrial"); add again →
    // no trialEndsAt. Reason: QA_NOT_READY.
    void QA_NOT_READY;
  });

  test.fixme("TC-786: removal keeps the add-on until the paid period ends; 'Keep it' undoes it", async () => {
    // DELETE /restaurant/:rid/addons/:instanceId (out of trial) → data.endsAt
    // = the subscription's period end, message "keeps working until <date>";
    // row endsAt set, canRemove false, canKeep true, feature still entitled;
    // POST the same addonId → message "kept", endsAt null. Reason: QA_NOT_READY.
  });

  test.fixme("TC-787: buying the Team bundle removes the separate Scheduling and Tip Management lines (one Stripe update, credit for unused time)", async () => {
    // With SCHEDULING and TIP_MANAGEMENT bought: row TEAM_BUNDLE.replaces =
    // ["SCHEDULING","TIP_MANAGEMENT"]; POST TEAM_BUNDLE → 201 replaced[] equal,
    // no trialEndsAt (a swap is an upgrade); both rows INCLUDED_WITH
    // TEAM_BUNDLE; their instances CANCELED. Reason: QA_NOT_READY.
  });

  test.fixme("TC-788: the payroll card shows this month's people on payroll and the per-person price", async () => {
    // With RestauNax Payroll (Embedded Gusto) on: GET /restaurant/:rid/addons
    // payrollBilling {month, billableCount, perUnitUsd 6, estimateUsd =
    // 6 × count, staleCount, people[]}. Also needs QA's Gusto Embedded keys
    // (BACK_OFFICE_COVERAGE row 11). Reason: QA_NOT_READY.
  });
});
