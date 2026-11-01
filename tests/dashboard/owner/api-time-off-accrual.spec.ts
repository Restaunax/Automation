/**
 * api-time-off-accrual.spec.ts — sick time and PTO policies, balances and
 * the Staff app's view of them on QA (TC-1413..1418). RestauNax back-office
 * audit 2026-10, Stage 5, W3:H5.
 *
 * Nothing applies by itself: the location's paid sick leave rule is only a
 * SUGGESTION. A CONFIRMED rule is applied in one click; a DRAFT one needs the
 * owner's explicit acknowledgeDraft:true. Every sick-leave rule is seeded
 * DRAFT (only government-sourced wage rules seed CONFIRMED), so a California
 * restaurant gets a DRAFT "CA paid sick time" suggestion: 1 h per 30 h worked.
 *
 * No browser. Per run: a fresh owner and one throwaway Sacramento, CA
 * restaurant with PAYROLL granted (→ TIMECARDS), not in an employer group
 * (scope RESTAURANT). The owner's own POS membership is the staff record, so
 * the owner's token also reads the Staff app endpoint (the membership is
 * linked to their account). Policies are retired in the spec; the restaurant
 * is deleted in afterAll. Serial. Fails (does not skip) without admin
 * credentials.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { looksLikeKey } from "../../../utils/backOfficeApi";
import {
  apiLogin,
  deleteTestRestaurant,
  setOwnerPosPin,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  accrualRaw,
  codeOf,
  ownerWithRestaurants,
  timeOffBalancesRaw,
} from "../../../utils/employerApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const SACRAMENTO = {
  street: "1 Capitol Mall",
  city: "Sacramento",
  state: "CA",
  zipCode: "95814",
  restaurantPhone: "9165550142",
};
const BALANCE_KEYS = [
  "annualCapMinutes",
  "balanceMinutes",
  "earnedThisYearMinutes",
  "kind",
  "policyId",
  "policyName",
  "policyYear",
  "usedThisYearMinutes",
];

test.describe.configure({ mode: "serial" });

test.describe("Sick time and PTO — policies and balances (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let rid = "";
  let me = "";
  let suggestionStatus = "";
  let sickId = "";
  let ptoId = "";

  const setup = async () => {
    const r = await accrualRaw(ownerToken, rid, "GET");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error(
        "[api-time-off-accrual] ADMIN_EMAIL / ADMIN_PASSWORD not set: the tenant is minted by HQ"
      );
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const t = await ownerWithRestaurants(adminToken, runId, {
      count: 1,
      restaurant: SACRAMENTO,
    });
    ownerToken = t.ownerToken;
    rid = t.restaurantIds[0] ?? "";
    me = await setOwnerPosPin(ownerToken, rid, "8462", { clocksIn: true });
  });

  test.afterAll(async () => {
    for (const id of [sickId, ptoId].filter(Boolean))
      await accrualRaw(ownerToken, rid, "DELETE", `/policies/${id}`).catch(
        () => {}
      );
    if (adminToken && rid)
      await deleteTestRestaurant(adminToken, rid).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Sick time and PTO");
    await allure.label("severity", "critical");
  });

  test("TC-1413: no policy yet — the California rule is suggested, nothing applied; the Staff app shows nothing", async () => {
    await allure.description(
      "GET /accrual → scope RESTAURANT, employerId null, policies [], suggestion { kind SICK, status " +
        "CONFIRMED|DRAFT, state CA, ruleKey sickLeave@CA, 'CA paid sick time', 60 min per 1800 worked, " +
        "employeeCount ≥ 1, sourceUrl }. The Staff app's balances are an empty list (a quiet empty state, " +
        "never an error)."
    );
    const s = await setup();
    expect(s).toMatchObject({
      scope: "RESTAURANT",
      employerId: null,
      policies: [],
    });
    const sug = s.suggestion as Rec;
    expect(
      sug,
      "a CA restaurant must get the sickLeave suggestion"
    ).toBeTruthy();
    expect(["CONFIRMED", "DRAFT"]).toContain(sug.status);
    suggestionStatus = String(sug.status);
    expect(sug).toMatchObject({
      kind: "SICK",
      state: "CA",
      ruleKey: "sickLeave@CA",
      name: "CA paid sick time",
      accrueMinutes: 60,
      perWorkedMinutes: 1800,
    });
    expect(typeof sug.smallEmployer).toBe("boolean");
    expect(sug.employeeCount).toBeGreaterThanOrEqual(1);
    expect(
      sug.annualCapMinutes === null || typeof sug.annualCapMinutes === "number"
    ).toBe(true);
    expect(sug.sourceUrl === null || typeof sug.sourceUrl === "string").toBe(
      true
    );

    const app = await timeOffBalancesRaw(ownerToken, rid);
    expect(app.status, JSON.stringify(app.data)).toBe(200);
    expect(app.data.data).toEqual({ balances: [], history: [] });
  });

  test("TC-1414: a DRAFT rule is never applied in one click — 400 DRAFT_RULE until the owner acknowledges it", async () => {
    await allure.description(
      "POST /accrual/policies { fromRule: true } on a DRAFT suggestion → 400 DRAFT_RULE (translated) and still " +
        "no policy. With acknowledgeDraft: true → 201 SICK policy built from the rule (ruleKey sickLeave@CA, " +
        "this restaurant's, not an employer's); the suggestion disappears. If HQ has CONFIRMED the CA rule, the " +
        "one-click apply is 201 instead."
    );
    if (suggestionStatus === "DRAFT") {
      const refused = await accrualRaw(ownerToken, rid, "POST", "/policies", {
        fromRule: true,
      });
      expect(refused.status, JSON.stringify(refused.data)).toBe(400);
      expect(codeOf(refused.data)).toBe("DRAFT_RULE");
      expect(looksLikeKey(refused.data.message)).toBe(false);
      expect((await setup()).policies).toEqual([]);
    } else {
      test.info().annotations.push({
        type: "note",
        description: `CA sickLeave is ${suggestionStatus} on this environment: one-click apply checked instead of DRAFT_RULE`,
      });
    }
    const applied = await accrualRaw(ownerToken, rid, "POST", "/policies", {
      fromRule: true,
      ...(suggestionStatus === "DRAFT" ? { acknowledgeDraft: true } : {}),
    });
    expect(applied.status, JSON.stringify(applied.data)).toBe(201);
    expect(looksLikeKey(applied.data.message)).toBe(false);
    const p = applied.data.data as Rec;
    sickId = String(p.id);
    expect(p).toMatchObject({
      kind: "SICK",
      name: "CA paid sick time",
      ruleKey: "sickLeave@CA",
      restaurantId: rid,
      employerId: null,
      accrueMinutes: 60,
      perWorkedMinutes: 1800,
      active: true,
    });
    const s = await setup();
    expect(list(s.policies).map((x) => x.id)).toEqual([sickId]);
    expect(s.suggestion).toBeNull();
  });

  test("TC-1415: a custom PTO policy is 201; a second one is POLICY_EXISTS; bad numbers are INVALID", async () => {
    await allure.description(
      "Custom { kind PTO, name, 1 h per 40 h, annual cap 40 h, year from 01-01 } → 201. Another active PTO in " +
        "the same scope → 400 POLICY_EXISTS; another sick policy (from the rule) too. accrueMinutes 0 or an " +
        "unknown kind → 400 INVALID. GET /accrual lists SICK and PTO."
    );
    const pto = await accrualRaw(ownerToken, rid, "POST", "/policies", {
      kind: "PTO",
      name: `Vacation ${runId}`,
      accrueMinutes: 60,
      perWorkedMinutes: 2400,
      annualCapMinutes: 2400,
      yearStart: "01-01",
    });
    expect(pto.status, JSON.stringify(pto.data)).toBe(201);
    ptoId = String(pto.data.data.id);
    expect(pto.data.data).toMatchObject({
      kind: "PTO",
      name: `Vacation ${runId}`,
      ruleKey: null,
      accrueMinutes: 60,
      perWorkedMinutes: 2400,
      annualCapMinutes: 2400,
      yearStart: "01-01",
      restaurantId: rid,
      active: true,
    });

    for (const body of [
      {
        kind: "PTO",
        name: "Second PTO",
        accrueMinutes: 60,
        perWorkedMinutes: 2400,
      },
      { fromRule: true, acknowledgeDraft: true },
    ]) {
      const dup = await accrualRaw(ownerToken, rid, "POST", "/policies", body);
      expect(dup.status, JSON.stringify(dup.data)).toBe(400);
      expect(codeOf(dup.data)).toBe("POLICY_EXISTS");
      expect(looksLikeKey(dup.data.message)).toBe(false);
    }
    for (const body of [
      { kind: "PTO", name: "Zero", accrueMinutes: 0, perWorkedMinutes: 2400 },
      {
        kind: "VACATION",
        name: "Bad kind",
        accrueMinutes: 60,
        perWorkedMinutes: 2400,
      },
    ]) {
      const bad = await accrualRaw(ownerToken, rid, "POST", "/policies", body);
      expect(bad.status, JSON.stringify(bad.data)).toBe(400);
      expect(codeOf(bad.data)).toBe("INVALID");
    }
    const s = await setup();
    expect(
      list(s.policies)
        .map((x) => x.kind)
        .sort()
    ).toEqual(["PTO", "SICK"]);
  });

  test("TC-1416: GET /accrual/balances — every active person, a zero balance per policy", async () => {
    await allure.description(
      "[{ id, firstName, lastName, balances: BalanceView[] }]: the owner's record carries SICK and PTO, each " +
        "{ kind, policyId, policyName, balanceMinutes 0, earnedThisYearMinutes 0, usedThisYearMinutes 0, " +
        "annualCapMinutes, policyYear } — nothing accrues before a pay period is approved."
    );
    const r = await accrualRaw(ownerToken, rid, "GET", "/balances");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const row = list(r.data.data).find((x) => x.id === me);
    expect(row, JSON.stringify(r.data.data)).toBeTruthy();
    expect(typeof row?.firstName).toBe("string");
    expect(typeof row?.lastName).toBe("string");
    const balances = list(row?.balances);
    expect(balances.map((b) => b.kind).sort()).toEqual(["PTO", "SICK"]);
    for (const b of balances) {
      expect(Object.keys(b).sort()).toEqual(BALANCE_KEYS);
      expect(b).toMatchObject({
        balanceMinutes: 0,
        earnedThisYearMinutes: 0,
        usedThisYearMinutes: 0,
      });
      expect(b.policyId).toBe(b.kind === "SICK" ? sickId : ptoId);
      expect(String(b.policyYear)).toMatch(/^\d{4}$/);
    }
    expect(balances.find((b) => b.kind === "PTO")?.annualCapMinutes).toBe(2400);
  });

  test("TC-1417: the Staff app shows the person their balances and (empty) history", async () => {
    await allure.description(
      "GET /api/staff-app/restaurants/:rid/time-off-balances as the signed-in person → { balances: " +
        "[{ kind, policyName, balanceMinutes, earnedThisYearMinutes, usedThisYearMinutes, annualCapMinutes, " +
        "policyYear }], history: [] } — no policy ids, nothing accrued yet."
    );
    const r = await timeOffBalancesRaw(ownerToken, rid);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const d = r.data.data as Rec;
    expect(d.history).toEqual([]);
    const balances = list(d.balances);
    expect(balances.map((b) => b.kind).sort()).toEqual(["PTO", "SICK"]);
    for (const b of balances) {
      expect(Object.keys(b).sort()).toEqual(
        BALANCE_KEYS.filter((k) => k !== "policyId")
      );
      expect(b.balanceMinutes).toBe(0);
      expect(looksLikeKey(b.policyName)).toBe(false);
    }
  });

  test("TC-1418: retiring a policy stops it; the suggestion comes back; an unknown policy is 404", async () => {
    await allure.description(
      "DELETE /accrual/policies/:id retires (200, translated). With both retired: policies [], the sick " +
        "suggestion is offered again, the Staff app's balances are empty. Retiring a made-up id → 404 " +
        "POLICY_NOT_FOUND."
    );
    for (const id of [sickId, ptoId]) {
      const r = await accrualRaw(ownerToken, rid, "DELETE", `/policies/${id}`);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      expect(looksLikeKey(r.data.message)).toBe(false);
    }
    sickId = "";
    ptoId = "";
    const s = await setup();
    expect(s.policies).toEqual([]);
    expect((s.suggestion as Rec | null)?.ruleKey).toBe("sickLeave@CA");
    const app = await timeOffBalancesRaw(ownerToken, rid);
    expect((app.data.data as Rec).balances).toEqual([]);

    const ghost = await accrualRaw(
      ownerToken,
      rid,
      "DELETE",
      "/policies/00000000-0000-0000-0000-000000000000"
    );
    expect(ghost.status, JSON.stringify(ghost.data)).toBe(404);
    expect(codeOf(ghost.data)).toBe("POLICY_NOT_FOUND");
  });
});
