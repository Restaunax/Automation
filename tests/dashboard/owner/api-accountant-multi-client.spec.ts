/**
 * api-accountant-multi-client.spec.ts — one accountant, several clients, the
 * books read-only (TC-1338..1343).
 *
 * restaunax back-office audit W2:A10 (docs/features/back-office/
 * ACCOUNTING_SYNC.md → "The accountant's books"). Three throwaway
 * restaurants with the Books & Taxes add-on: A and B invite the SAME
 * accountant by email (A's invite creates the account, B's is claimed by
 * signing in with the link's token); C never invites them. The accountant
 * reads A's and B's books — journal by day, a day's entry, deposits, the
 * accounts each line posts to, the sales summary and the QuickBooks / Xero
 * files — and nothing can be written: every non-GET under /api/accountant is
 * 403, the owner's own routes 404, C and a made-up id 404. B's owner revokes
 * and only B closes. TC-1343 is the browser step: the new tabs and the client
 * switcher load with no refused request.
 *
 * Skips without MAILPIT_BASE_URL (the invites are claimed from the email),
 * like api-accountant-access.spec.ts. Serial.
 */
import * as allure from "allure-js-commons";
import type { Response as PwResponse } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import { loginViaUi } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  registerWithInvite,
  claimStaffInviteSignedInRaw,
  booksRaw,
  accountantRaw,
  accountantAnyRaw,
  accountingRaw,
  closeDayWebRaw,
  downloadRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = process.env.MAILPIT_BASE_URL ?? "";
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("Accountant across clients — the books, read-only (W2:A10, API + browser)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenants)"
  );
  test.skip(
    !MAILPIT,
    "MAILPIT_BASE_URL not set — the accountant claims the invites from the emails"
  );

  const runId = generateRunId();
  let adminToken = "";
  const tenants: Record<
    "a" | "b" | "c",
    { owner: string; id: string; name: string; day: string }
  > = {
    a: { owner: "", id: "", name: "", day: "" },
    b: { owner: "", id: "", name: "", day: "" },
    c: { owner: "", id: "", name: "", day: "" },
  };
  const accountant = {
    email: `auto-acct-multi-${runId}@${DOMAIN}`,
    password: `Automation!Multi-${runId}`,
    token: "",
    rowB: "",
  };
  const books = (id: string, path = "") => `/clients/${id}/books${path}`;
  const range = (t: { day: string }) => `?startDate=${t.day}&endDate=${t.day}`;

  const invite = async (key: "a" | "b") => {
    const sentAt = new Date();
    const r = await booksRaw(
      tenants[key].owner,
      tenants[key].id,
      "POST",
      "/accountants",
      {
        email: accountant.email,
        firstName: "Morgan",
        lastName: "Books",
      }
    );
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    const mail = await waitForEmail(accountant.email, {
      subjectPattern: new RegExp(`read-only access to .*${runId}${key}`, "i"),
      timeoutMs: 90_000,
      notBefore: sentAt,
    });
    return {
      rowId: String((r.data.data as Rec).id),
      token: extractInviteToken(mail.text_body || mail.html_body),
    };
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    for (const key of ["a", "b", "c"] as const) {
      const t = await createSecondOwner(adminToken, `${runId}${key}`, {
        alwaysFresh: true,
      });
      if (!t.restaurantId) throw new Error(`[acct-multi] no tenant ${key}`);
      tenants[key].owner = t.accessToken;
      tenants[key].id = t.restaurantId;
      tenants[key].name = `Automation Owner2 Store ${runId}${key}`;
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        t.restaurantId,
        "ACCOUNTING_SYNC",
        true,
        `automation accountant multi ${runId}`
      );
      if (!g.ok)
        throw new Error(`[acct-multi] grant: ${JSON.stringify(g.data)}`);
      const closed = await closeDayWebRaw(t.accessToken, t.restaurantId);
      if (closed.status !== 201)
        throw new Error(`[acct-multi] close: ${JSON.stringify(closed.data)}`);
      tenants[key].day = String((closed.data.data as Rec).businessDate).slice(
        0,
        10
      );
    }
  });

  test.afterAll(async () => {
    for (const t of Object.values(tenants)) {
      if (adminToken && t.id)
        await deleteTestRestaurant(adminToken, t.id).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Books & taxes — accountant");
    await allure.label("severity", "critical");
  });

  test("TC-1338: two owners invite the same accountant; one account, both clients in the switcher list @email", async () => {
    const a = await invite("a");
    const claimed = await registerWithInvite({
      firstName: "Morgan",
      lastName: "Books",
      email: accountant.email,
      password: accountant.password,
      userInvitationToken: a.token,
    });
    expect(claimed.role).toBe("USER");
    const b = await invite("b");
    accountant.rowB = b.rowId;
    // An existing account takes a second client while signed in, as the
    // invitation page does: password login ignores an invitation token.
    const login = await apiLogin(accountant.email, accountant.password);
    accountant.token = login.accessToken;
    const claim = await claimStaffInviteSignedInRaw(accountant.token, b.token);
    expect(claim.status, JSON.stringify(claim.data)).toBe(200);

    const clients = await accountantRaw(accountant.token, "/clients");
    expect(clients.status).toBe(200);
    const ids = list(clients.data.data).map((c) => c.restaurantId);
    expect(ids.sort()).toEqual([tenants.a.id, tenants.b.id].sort());
  });

  test("TC-1339: the accountant reads each client's books — settings, accounts, journal, a day's entry, deposits, sales summary", async () => {
    for (const key of ["a", "b"] as const) {
      const t = tenants[key];
      const get = (path: string) =>
        accountantRaw(accountant.token, books(t.id, path));
      const settings = await get("");
      expect(settings.status, `${key} ${JSON.stringify(settings.data)}`).toBe(
        200
      );
      expect(JSON.stringify(settings.data)).not.toMatch(
        /accessToken|refreshToken/
      );
      const matching = await get("/matching");
      expect(matching.status).toBe(200);
      expect(list((matching.data.data as Rec).rows).length).toBeGreaterThan(0);
      const days = await get(`/days${range(t)}`);
      expect(days.status).toBe(200);
      expect(list(days.data.data)).toEqual([
        expect.objectContaining({ businessDate: t.day, closed: true }),
      ]);
      const entry = await get(`/days/${t.day}`);
      expect(entry.status).toBe(200);
      expect(((entry.data.data as Rec).entry as Rec).balanced).toBe(true);
      const deposits = await get(`/deposits${range(t)}`);
      expect(deposits.status).toBe(200);
      const summary = await get(`/sales-summary${range(t)}`);
      expect(summary.status).toBe(200);
      expect(summary.data.data).toMatchObject({ ties: true, closedDays: 1 });
    }
  });

  test("TC-1340: the accountant downloads the QuickBooks file and the sales summary CSV", async () => {
    const t = tenants.a;
    const qbo = await downloadRaw(
      accountant.token,
      `/api/accountant${books(t.id, `/export.csv${range(t)}&format=quickbooks`)}`
    );
    expect(qbo.status).toBe(200);
    expect(qbo.body.toString("utf8").split(/\r?\n/)[0]).toBe(
      "Journal No.,Journal Date,Account Name,Journal/Description,Debits,Credits"
    );
    const check = await accountantRaw(
      accountant.token,
      books(t.id, `/export/check${range(t)}&format=xero`)
    );
    expect(check.status).toBe(200);
    const csv = await downloadRaw(
      accountant.token,
      `/api/accountant${books(t.id, `/sales-summary.csv${range(t)}`)}`
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
  });

  test("TC-1341: every write is refused — 403 under /api/accountant, 404 on the owner's own routes; nothing changed", async () => {
    const t = tenants.a;
    const tok = accountant.token;
    for (const [method, path] of [
      ["POST", books(t.id, `/days/${t.day}/post`)],
      ["PUT", books(t.id, "/mapping")],
      ["PATCH", books(t.id)],
      ["DELETE", books(t.id)],
      ["POST", books(t.id, "/deposits/sync")],
    ] as const) {
      const r = await accountantAnyRaw(tok, method, path, {});
      expect(r.status, `${method} ${path}`).toBe(403);
      expect(r.data.message).toBe(
        "This is a read-only view of the client's books."
      );
    }
    for (const [method, path, body] of [
      ["PUT", "/mapping", { mapping: { tips: { name: "Mine" } } }],
      ["POST", "/mapping/preset", { preset: "SIMPLE" }],
      ["PATCH", "/settings", { toleranceCents: 0 }],
      ["POST", `/days/${t.day}/post`, undefined],
    ] as const) {
      const r = await accountingRaw(tok, t.id, method, path, body);
      expect(r.status, `${method} ${path}`).toBe(404);
    }
    const mine = await accountingRaw(t.owner, t.id, "GET", "");
    expect((mine.data.data as Rec).mappingPreset).toBe("DETAILED");
    expect(((mine.data.data as Rec).mapping as Rec).tips).toBeUndefined();
  });

  test("TC-1342: a client they don't serve, or a made-up id, is 404; a revoke closes that client only", async () => {
    for (const id of [tenants.c.id, "00000000-0000-4000-8000-000000000000"]) {
      for (const path of [
        "",
        `/days${range(tenants.c)}`,
        `/sales-summary${range(tenants.c)}`,
      ]) {
        const r = await accountantRaw(accountant.token, books(id, path));
        expect(r.status, `${id}${path}`).toBe(404);
      }
    }
    const removed = await booksRaw(
      tenants.b.owner,
      tenants.b.id,
      "DELETE",
      `/accountants/${accountant.rowB}`
    );
    expect(removed.status, JSON.stringify(removed.data)).toBe(200);
    expect(
      (
        await accountantRaw(
          accountant.token,
          books(tenants.b.id, `/days${range(tenants.b)}`)
        )
      ).status
    ).toBe(404);
    expect(
      (
        await accountantRaw(
          accountant.token,
          books(tenants.a.id, `/days${range(tenants.a)}`)
        )
      ).status
    ).toBe(200);
    const clients = await accountantRaw(accountant.token, "/clients");
    expect(list(clients.data.data).map((c) => c.restaurantId)).toEqual([
      tenants.a.id,
    ]);
  });

  test("TC-1343: the workspace shows Journal, Deposits, Accounts and Sales summary, with no refused screen load", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await loginViaUi(
      browser,
      accountant.email,
      accountant.password
    );
    const refused: string[] = [];
    const watch = (res: PwResponse) => {
      if (/\/api\//.test(res.url()) && [401, 403].includes(res.status()))
        refused.push(`${res.status()} ${res.url()}`);
    };
    session.page.on("response", watch);
    try {
      const page = session.page;
      await page.goto(`/accountant/${tenants.a.id}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByText(
          "Read-only: you can see and download everything, and change nothing."
        )
      ).toBeVisible({ timeout: 20_000 });
      for (const tab of ["Journal", "Deposits", "Accounts", "Sales summary"]) {
        await page.getByRole("tab", { name: tab }).click();
      }
      // The summary opens on last month; the day this suite closed is today.
      await page.locator("#sales-summary-start").fill(tenants.a.day);
      await page.locator("#sales-summary-end").fill(tenants.a.day);
      await expect(
        page.getByText("Ties to the books", { exact: false }).first()
      ).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("tab", { name: "Journal" }).click();
      await expect(
        page.getByRole("button", { name: "Download file" })
      ).toBeVisible();
      expect(refused).toEqual([]);
    } finally {
      session.page.off("response", watch);
      await session.context.close().catch(() => {});
    }
  });
});
