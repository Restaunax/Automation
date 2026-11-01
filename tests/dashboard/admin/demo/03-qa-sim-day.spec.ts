import * as allure from "allure-js-commons";
import { test, expect } from "../../../../fixtures/base";
import { apiLogin, BACKEND_URL } from "../../../../utils/apiHelper";

/**
 * QA "Run a day" (back-office audit W0:SIM-1..6): the simulator's daily check,
 * read through the HQ API, proves the realistic, lawful week every day.
 *
 * - Every run says how it was played: LIVE (the automatic day, across the
 *   opening hours) or MANUAL (a compressed button press).
 * - The checks added with the live day are never red for a day played after
 *   the fix shipped: lawful wages after tips, POS punches with no sweeps, no
 *   minutes-long shifts, no tips to the manager, sales spread over the day,
 *   tip-outs with receivers.
 * - The reference tax-rate check is at worst amber: the simulator never
 *   changes an owner's rate, it only shows the difference.
 *
 * Days before QA_SIM_LIVE_SINCE (default 2026-11-02, the first full live
 * day) are left out: they were played by the old simulator.
 */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const LIVE_SINCE = process.env.QA_SIM_LIVE_SINCE ?? "2026-11-02";

const NEVER_RED = [
  "payroll.minWage",
  "time.ordersSpread",
  "time.punchSource",
  "time.shortShift",
  "tips.managerReceives",
  "tips.noReceiverDays",
];

interface CheckLine {
  check: string;
  businessDate: string;
  verdict: "OK" | "WAITING" | "WRONG" | "NOT_APPLICABLE";
  code: string;
  text: string;
}
interface ChecksDetail {
  restaurantName: string;
  problems: CheckLine[];
  waiting: CheckLine[];
  ok: CheckLine[];
  notChecked: CheckLine[];
}
interface SimRow {
  restaurantId: string;
  restaurantName: string;
  enabled: boolean;
  lastRun: { status: string; trigger?: string } | null;
}

async function hqGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status, `GET ${path}`).toBe(200);
  const body = (await res.json()) as { data: T };
  return body.data;
}

test.describe(
  "Admin — QA Run a day: the live, lawful week",
  { tag: ["@demo"] },
  () => {
    let token = "";
    let rows: SimRow[] = [];

    test.beforeAll(async () => {
      // A check that can't sign in must fail, never pass silently.
      expect(ADMIN_EMAIL, "ADMIN_EMAIL is required").not.toBe("");
      expect(ADMIN_PASSWORD, "ADMIN_PASSWORD is required").not.toBe("");
      token = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      rows = await hqGet<SimRow[]>(token, "/api/admin/qa-sim/restaurants");
    });

    test("every run says how it was played (live day or compressed button press)", async () => {
      await allure.severity("normal");
      for (const r of rows) {
        if (!r.lastRun) continue;
        expect(["MANUAL", "AUTO", "LIVE"], r.restaurantName).toContain(
          r.lastRun.trigger
        );
      }
    });

    test("the live-day and lawful-wage checks are never red after the fix shipped", async () => {
      await allure.severity("critical");
      const enabled = rows.filter((r) => r.enabled);
      test.skip(
        enabled.length === 0,
        "No enrolled test restaurant on this environment"
      );
      const red: string[] = [];
      for (const r of enabled) {
        const d = await hqGet<ChecksDetail>(
          token,
          `/api/admin/qa-sim/checks/${r.restaurantId}`
        );
        for (const line of d.problems) {
          if (!NEVER_RED.includes(line.check)) continue;
          if (line.businessDate < LIVE_SINCE) continue;
          red.push(
            `${d.restaurantName} ${line.businessDate} ${line.check}: ${line.text}`
          );
        }
      }
      expect(red).toEqual([]);
    });

    test("the reference tax-rate check is at worst amber, and every line is text, not a key", async () => {
      await allure.severity("normal");
      for (const r of rows.filter((x) => x.enabled)) {
        const d = await hqGet<ChecksDetail>(
          token,
          `/api/admin/qa-sim/checks/${r.restaurantId}`
        );
        const all = [...d.problems, ...d.waiting, ...d.ok, ...d.notChecked];
        for (const line of all.filter(
          (l) => l.check === "tax.rateMatchesState"
        )) {
          expect(
            line.verdict,
            `${d.restaurantName} ${line.businessDate}`
          ).not.toBe("WRONG");
        }
        for (const line of all) {
          expect(line.text, line.check).not.toMatch(/^api:|qaSim\.checks\./);
        }
      }
    });
  }
);
