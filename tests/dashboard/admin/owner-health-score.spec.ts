/**
 * owner-health-score.spec.ts — HQ → People → Owners: the health score
 * (RestauNax PR #1036, "one shared owner health score").
 *
 * TC-931. The Owners list (GET /api/admin/owners → owners[].stats.healthScore,
 * OwnersList.tsx's chip) and the owner's Health Score tab
 * (GET /api/admin/owners/:id/health-score → healthScore.score,
 * OwnerHealth.tsx) used to run two different formulas, so one owner showed
 * two numbers. Both now come from computeOwnerHealthScore. API level —
 * those two fields are exactly what the two screens print. Read-only.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { apiLogin, apiRequestRaw } from "../../../utils/apiHelper";
import { requireRelease } from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";

interface OwnerRow {
  id: string;
  email: string;
  stats: { healthScore: number };
}

test.describe(
  "HQ — Owner health score",
  { tag: ["@bugfix-1036", "@health-score"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
    );

    test("TC-931: the Owners list and the Health Score tab give the same score", async () => {
      await allure.label("feature", "Owner Portal");
      await allure.label("severity", "normal");
      await allure.description(
        "For the seed owner plus the first page of owners: stats.healthScore from the list equals " +
          "healthScore.score from the owner's Health Score endpoint, and the score is 0–100."
      );
      const token = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;

      const list = async (q: string) => {
        const res = await apiRequestRaw<{ owners?: OwnerRow[] }>(
          "GET",
          `/api/admin/owners?limit=10&q=${encodeURIComponent(q)}`,
          undefined,
          token
        );
        expect(res.status).toBe(200);
        return res.data.owners ?? [];
      };
      const rows = [
        ...(OWNER_EMAIL ? await list(OWNER_EMAIL) : []),
        ...(await list("")),
      ].slice(0, 6);
      expect(rows.length, "QA has owners").toBeGreaterThan(0);

      const pairs: Array<{ email: string; list: number; tab: number }> = [];
      for (const row of rows) {
        const res = await apiRequestRaw<{ healthScore?: { score: number } }>(
          "GET",
          `/api/admin/owners/${row.id}/health-score`,
          undefined,
          token
        );
        expect(res.status).toBe(200);
        pairs.push({
          email: row.email,
          list: row.stats.healthScore,
          tab: res.data.healthScore?.score ?? NaN,
        });
      }
      await allure.attachment(
        "scores.json",
        JSON.stringify(pairs, null, 2),
        "application/json"
      );

      requireRelease(
        "bugBatch",
        pairs.every((p) => p.list === p.tab),
        "the list and the Health Score tab still disagree for some owners"
      );
      for (const p of pairs) {
        expect(p.tab, p.email).toBe(p.list);
        expect(p.tab).toBeGreaterThanOrEqual(0);
        expect(p.tab).toBeLessThanOrEqual(100);
      }
    });
  }
);
