/**
 * api-books-deposits-live.spec.ts — card deposits in the books (B2) on the
 * one QA restaurant with a REAL books connection (TC-772..773). Tag
 * `@books-live`: exclude it with `--grep-invert @books-live`.
 *
 * "Rehearsal Kitchen (QA)" is connected to the QuickBooks Online SANDBOX
 * company and takes Stripe test-mode payments, so its deposit list is built
 * from real Stripe payouts. This file is READ-ONLY on purpose: it never
 * connects, disconnects, re-maps accounts or changes settings on that
 * restaurant, and it never re-sends an entry. It reads with the admin token
 * (platform staff may view books, restaunax accountingController handler →
 * requireOwnerOrAdmin), so no extra credential is needed.
 *
 * The one write it may make is "Post" on a deposit that is ALREADY posted —
 * the never-twice guard answers with the same entry (postDeposit returns
 * early for POSTED) — so nothing new reaches QuickBooks. With no posted
 * deposit it skips that step and says why.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  accountingRaw,
  adminSearchRestaurantsRaw,
  downloadRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const NAME = "Rehearsal Kitchen (QA)";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const STATUSES = [
  "READY",
  "POSTED",
  "MAPPING_NEEDED",
  "FAILED",
  "NEEDS_REVIEW",
  "STALE",
];

test.describe.configure({ mode: "serial" });

test.describe("Books & taxes — card deposits on the QuickBooks sandbox restaurant (B2, live, read-only)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set"
  );

  let adminToken = "";
  let restaurantId = "";
  let deposits: Rec[] = [];

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const found = await adminSearchRestaurantsRaw(
      adminToken,
      "Rehearsal Kitchen"
    );
    restaurantId =
      (found.data.restaurants ?? []).find((r) => r.name === NAME)?.id ?? "";
  });

  test.beforeEach(async () => {
    test.skip(!restaurantId, `QA has no restaurant named "${NAME}"`);
    await allure.label("feature", "Books & taxes (live)");
    await allure.label("severity", "normal");
  });

  test(
    "TC-772: every card deposit's entry balances, its bank line is the payout, and the CSV lists it",
    { tag: ["@books-live"] },
    async () => {
      const books = await accountingRaw(adminToken, restaurantId, "GET", "");
      expect(books.status, JSON.stringify(books.data)).toBe(200);
      const integration = books.data.data as Rec;
      test.skip(
        integration.provider !== "QUICKBOOKS" || integration.connected !== true,
        `${NAME} is no longer connected to QuickBooks (provider ${String(integration.provider)})`
      );
      expect(String(integration.companyName)).toMatch(/^Sandbox Company/);

      const r = await accountingRaw(
        adminToken,
        restaurantId,
        "GET",
        "/deposits"
      );
      expect(r.status).toBe(200);
      const page = r.data.data as Rec;
      expect(page.takesCards).toBe(true);
      deposits = list(page.deposits);
      test.skip(
        deposits.length === 0,
        "no card deposit landed in the last 35 days"
      );
      test.info().annotations.push({
        type: "deposits",
        description: deposits
          .map((d) => `${d.docNumber} ${d.status} ${d.amountCents}`)
          .join("; "),
      });

      for (const d of deposits) {
        expect(STATUSES, String(d.status)).toContain(d.status);
        // RNXD-yymmdd-<last 6 of the payout id>, dated the day it landed.
        const [y, m, day] = String(d.arrivalDate).split("-");
        expect(String(d.docNumber)).toBe(
          `RNXD-${y!.slice(2)}${m}${day}-${String(d.stripePayoutId).slice(-6)}`
        );
        const one = await accountingRaw(
          adminToken,
          restaurantId,
          "GET",
          `/deposits/${d.id}`
        );
        expect(one.status).toBe(200);
        const entry = (one.data.data as Rec).entry as Rec;
        expect(entry.debitCents, String(d.docNumber)).toBe(entry.creditCents);
        const lines = list(entry.lines);
        const bank = lines.find((l) => l.key === "deposit:bank");
        expect(bank?.cents, String(d.docNumber)).toBe(
          Math.abs(Number(d.amountCents))
        );
        expect(bank?.side).toBe(
          Number(d.amountCents) >= 0 ? "DEBIT" : "CREDIT"
        );
        // Lines come with words, never keys.
        for (const l of lines) expect(String(l.label)).not.toMatch(/^[a-z_]+:/);
        if (entry.explained) expect(entry.unexplainedCents).toBe(0);
        else expect(d.status).toBe("NEEDS_REVIEW");
        // Card clearing gets card sales − refunds (refunds never get a line).
        expect(lines.map((l) => l.key)).not.toContain("refunds");
        if (d.status === "MAPPING_NEEDED") {
          expect(list(entry.missingKeys).length).toBeGreaterThan(0);
        }
      }

      const csv = await downloadRaw(
        adminToken,
        `/api/accounting/${restaurantId}/deposits/export.csv`
      );
      expect(csv.status).toBe(200);
      const body = csv.body.toString("utf8").replace(/^\uFEFF/, "");
      expect(body.split(/\r?\n/)[0]).toBe(
        "Date,Journal no.,Account,Debit,Credit,Description,Location,Status"
      );
      for (const d of deposits) expect(body).toContain(String(d.docNumber));
    }
  );

  test(
    "TC-773: posting a deposit that is already in QuickBooks posts nothing new (never twice)",
    { tag: ["@books-live"] },
    async () => {
      const posted = deposits.find((d) => d.status === "POSTED");
      test.skip(
        !posted,
        "no deposit is POSTED yet on the sandbox restaurant — posting a new one would write to QuickBooks, which this file never does"
      );
      const before = await accountingRaw(
        adminToken,
        restaurantId,
        "GET",
        `/deposits/${posted!.id}`
      );
      const again = await accountingRaw(
        adminToken,
        restaurantId,
        "POST",
        `/deposits/${posted!.id}/post`
      );
      expect(again.status, JSON.stringify(again.data)).toBe(200);
      const after = again.data.data as Rec;
      expect(after.status).toBe("POSTED");
      expect(after.externalId).toBe((before.data.data as Rec).externalId);
      expect(after.postedAt).toBe((before.data.data as Rec).postedAt);
    }
  );
});
