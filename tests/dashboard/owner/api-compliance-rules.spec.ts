/**
 * api-compliance-rules.spec.ts — the labor and tax rules a restaurant's
 * location follows (RestauNax back-office audit 2026-10, Stage 2;
 * GET /api/compliance/:rid/rules) (TC-1210..1214).
 *
 * No browser. A per-run throwaway restaurant (createSecondOwner, fresh: Miami,
 * FL). The rules are seeded on every backend start, so the answers are fixed
 * for a given date:
 *   - Florida minimum wage on 2026-11-01: $15.00, tipped $11.98 — a
 *     government source checked with high confidence → CONFIRMED;
 *     on 2026-06-01 the earlier $14.00 row applies.
 *   - Florida delivery-fee taxability: DRAFT (every sales-tax rule waits for
 *     the CPA).
 * Every label and summary is server-resolved text, never an i18n key.
 * Serial. Fails (does not skip) without admin credentials: it carries the
 * endpoint's tenancy check.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  type LooseJson,
} from "../../../utils/apiHelper";
import { complianceRulesRaw, looksLikeKey } from "../../../utils/backOfficeApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const rules = (data: unknown): Rec[] =>
  Array.isArray((data as Rec | undefined)?.rules)
    ? ((data as Rec).rules as Rec[])
    : [];
const ruleOf = (data: unknown, key: string) =>
  rules(data).find((r) => r.ruleKey === key);

test.describe.configure({ mode: "serial" });

test.describe("Compliance rules (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "[api-compliance-rules] ADMIN_EMAIL / ADMIN_PASSWORD not set: the tenancy check can't run"
      );
    }
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) {
      throw new Error("[api-compliance-rules] no tenant restaurant");
    }
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Compliance rules");
    await allure.label("severity", "normal");
  });

  test("TC-1210: the owner reads every rule with text, value, status and source", async () => {
    const r = await complianceRulesRaw(ownerToken, restaurantId, {
      date: "2026-11-01",
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    expect(data.date).toBe("2026-11-01");
    expect(data.location).toMatchObject({ state: "FL" });
    expect(rules(data).length).toBeGreaterThanOrEqual(13);
    for (const rule of rules(data)) {
      expect(looksLikeKey(rule.label), String(rule.ruleKey)).toBe(false);
      expect(looksLikeKey(rule.summary), String(rule.ruleKey)).toBe(false);
      expect(looksLikeKey(rule.statusLabel), String(rule.ruleKey)).toBe(false);
      expect(["CONFIRMED", "DRAFT", "MISSING"]).toContain(rule.status);
      for (const s of (rule.sources as Rec[]) ?? []) {
        expect(String(s.sourceUrl)).toMatch(/^https:\/\//);
        expect(looksLikeKey(s.jurisdictionLabel)).toBe(false);
      }
    }
  });

  test("TC-1211: Florida's minimum wage on 2026-11-01 is $15.00, tipped $11.98, CONFIRMED", async () => {
    const r = await complianceRulesRaw(ownerToken, restaurantId, {
      date: "2026-11-01",
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const wage = ruleOf(r.data.data, "minimumWage") as Rec;
    expect(wage).toMatchObject({
      status: "CONFIRMED",
      decidedBy: "RULE",
      value: { fullWageCents: 1500, tippedCashWageCents: 1198 },
    });
    expect(String(wage.summary)).toContain("$15.00");
    expect(String(wage.summary)).toContain("$11.98");
    const state = (wage.sources as Rec[]).find(
      (s) => s.jurisdictionLevel === "STATE"
    );
    expect(state).toMatchObject({ state: "FL", sourceKind: "GOVERNMENT" });

    // A date before the 2026-09-30 raise reads the earlier rule.
    const june = await complianceRulesRaw(ownerToken, restaurantId, {
      date: "2026-06-01",
    });
    expect((ruleOf(june.data.data, "minimumWage") as Rec).value).toMatchObject({
      fullWageCents: 1400,
    });
  });

  test("TC-1212: sales-tax rules are DRAFT until the CPA confirms them", async () => {
    const r = await complianceRulesRaw(ownerToken, restaurantId, {
      date: "2026-11-01",
    });
    const fee = ruleOf(r.data.data, "deliveryFeeTaxable") as Rec;
    expect(fee).toMatchObject({
      status: "DRAFT",
      value: { rule: "IF_NOT_AVOIDABLE" },
    });
    expect(String(fee.statusLabel)).toMatch(/not confirmed/i);
  });

  test("TC-1213: answers in Spanish", async () => {
    const r = await complianceRulesRaw(ownerToken, restaurantId, {
      date: "2026-11-01",
      lang: "es",
    });
    expect(r.status).toBe(200);
    const wage = ruleOf(r.data.data, "minimumWage") as Rec;
    expect(wage.label).toBe("Salario mínimo");
    expect(String(wage.summary)).toMatch(/por hora/);
  });

  test("TC-1214: no token 401, another owner 403, a malformed date 400", async () => {
    const anon = await complianceRulesRaw("", restaurantId);
    expect(anon.status).toBe(401);

    if (!OWNER_EMAIL || !OWNER_PASSWORD) {
      throw new Error(
        "[api-compliance-rules] OWNER_EMAIL / OWNER_PASSWORD not set: the cross-tenant check can't run"
      );
    }
    const seedOwner = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const other = await complianceRulesRaw(seedOwner, restaurantId);
    expect(other.status, JSON.stringify(other.data)).toBe(403);

    const bad = await complianceRulesRaw(ownerToken, restaurantId, {
      date: "11/01/2026",
    });
    expect(bad.status).toBe(400);
    expect(looksLikeKey(bad.data.message)).toBe(false);
  });
});
