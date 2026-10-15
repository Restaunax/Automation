/**
 * api-accountant-access.spec.ts — the owner's accountant, Books & taxes B5
 * (TC-774..780).
 *
 * restaunax docs/features/back-office/BOOKS_B5_ACCOUNTANT_AND_YEAR_END.md
 * (#943). Two throwaway restaurants with the Books & Taxes add-on
 * (ACCOUNTING_SYNC) by admin override: A invites an accountant, B is the
 * "other client" that must stay invisible. The accountant is a REAL new
 * account: the invite email is read from Mailpit (unique recipient, never
 * deleted — shared inbox) and claimed with `registerWithInvite`. The account
 * stays a plain USER — never OWNER — so every owner write route refuses it.
 *
 * TC-777 is the one browser step: the accountant signs in and opens the
 * read-only workspace (/accountant), with no 403 on any screen load.
 *
 * Skips without MAILPIT_BASE_URL (CI has it; see TEST_PLAN → Test execution
 * strategy). Serial: every step builds on the claimed account.
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
  deleteFeatureOverrideAdminRaw,
  registerWithInvite,
  getOwnerRestaurants,
  booksRaw,
  accountantRaw,
  accountingRaw,
  partnerAccessRaw,
  taxRaw,
  inviteStaffRaw,
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
const YEAR = new Date().getUTCFullYear() - 1;
const today = () => new Date().toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

test.describe("Accountant access — invite, read-only, other clients invisible, revoke (B5, API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenants)"
  );
  test.skip(
    !MAILPIT,
    "MAILPIT_BASE_URL not set — the accountant claims their invite from the email"
  );

  const runId = generateRunId();
  let adminToken = "";
  const a = { owner: "", id: "", name: "", ownerEmail: "" };
  const b = { owner: "", id: "" };
  const accountant = {
    email: `auto-accountant-${runId}@${DOMAIN}`,
    password: `Automation!Acct-${runId}`,
    token: "",
    rowId: "",
    inviteToken: "",
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const ta = await createSecondOwner(adminToken, `${runId}a`);
    const tb = await createSecondOwner(adminToken, `${runId}b`);
    if (!ta.restaurantId || !tb.restaurantId)
      throw new Error("[api-accountant] no tenant");
    a.owner = ta.accessToken;
    a.id = ta.restaurantId;
    a.ownerEmail = ta.email;
    a.name = `Automation Owner2 Store ${runId}a`;
    b.owner = tb.accessToken;
    b.id = tb.restaurantId;
    for (const id of [a.id, b.id]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        id,
        "ACCOUNTING_SYNC",
        true,
        `automation accountant ${runId}`
      );
      if (!g.ok)
        throw new Error(`[api-accountant] grant: ${JSON.stringify(g.data)}`);
    }
  });

  test.afterAll(async () => {
    for (const id of [a.id, b.id]) {
      if (adminToken && id)
        await deleteTestRestaurant(adminToken, id).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Books & taxes — accountant");
    await allure.label("severity", "critical");
  });

  test("TC-774: the owner's accountant list starts empty; a missing, malformed or own email is refused", async () => {
    const empty = await booksRaw(a.owner, a.id, "GET", "/accountants");
    expect(empty.status, JSON.stringify(empty.data)).toBe(200);
    expect(empty.data.data).toEqual([]);
    for (const [email, message] of [
      ["", "Enter your accountant's email address."],
      ["not-an-email", "That email address doesn't look right."],
      [
        a.ownerEmail,
        "That's the owner's own email. Invite your accountant with their email.",
      ],
    ] as const) {
      const r = await booksRaw(a.owner, a.id, "POST", "/accountants", {
        email,
      });
      expect(r.status, email).toBe(400);
      expect(r.data.message).toBe(message);
    }
  });

  test("TC-775: the owner invites an accountant — PENDING, and the invite email arrives @email", async () => {
    const sentAt = new Date();
    const r = await booksRaw(a.owner, a.id, "POST", "/accountants", {
      email: accountant.email,
      firstName: "Avery",
      lastName: "Ledger",
      firmName: `Ledger & Co ${runId}`,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    expect(r.data.message).toBe(
      `Invitation sent to ${accountant.email}. They get access once they accept.`
    );
    const row = r.data.data as Rec;
    accountant.rowId = String(row.id);
    expect(row).toMatchObject({
      email: accountant.email,
      firstName: "Avery",
      lastName: "Ledger",
      status: "PENDING",
      activatedAt: null,
    });

    const mail = await waitForEmail(accountant.email, {
      subjectPattern: /read-only access to .+'s books/i,
      timeoutMs: 90_000,
      notBefore: sentAt,
    });
    expect(mail.subject).toBe(
      `Auto SecondOwner gave you read-only access to ${a.name}'s books`
    );
    const body = mail.text_body || mail.html_body;
    expect(body).toContain("Create your account");
    accountant.inviteToken = extractInviteToken(body);
    expect(accountant.inviteToken.length).toBeGreaterThanOrEqual(16);
  });

  test("TC-776: the accountant accepts with a new account — a plain USER that sees exactly this restaurant", async () => {
    const claimed = await registerWithInvite({
      firstName: "Avery",
      lastName: "Ledger",
      email: accountant.email,
      password: accountant.password,
      userInvitationToken: accountant.inviteToken,
    });
    accountant.token = claimed.accessToken;
    // An accountant earns no role: never OWNER, so owner routes stay closed.
    expect(claimed.role).toBe("USER");
    expect(await getOwnerRestaurants(accountant.token)).toEqual([]);

    const owners = await booksRaw(a.owner, a.id, "GET", "/accountants");
    expect(list(owners.data.data)).toMatchObject([
      { id: accountant.rowId, email: accountant.email, status: "ACTIVE" },
    ]);

    const clients = await accountantRaw(accountant.token, "/clients");
    expect(clients.status, JSON.stringify(clients.data)).toBe(200);
    expect(list(clients.data.data)).toMatchObject([
      {
        restaurantId: a.id,
        name: a.name,
        ownerName: "Auto SecondOwner",
        available: true,
      },
    ]);
  });

  test("TC-777: the accountant's workspace opens read-only in the browser, with no refused screen load", async ({
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
      await page.goto("/accountant", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: "Your clients' books" })
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(a.name)).toBeVisible();
      await page
        .getByRole("button", { name: "Open the books" })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`/accountant/${a.id}`));
      await expect(
        page.getByText(
          "Read-only: you can see and download everything, and change nothing."
        )
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("tab", { name: "Sales tax" })).toBeVisible();
      expect(refused).toEqual([]);
    } finally {
      session.page.off("response", watch);
      await session.context.close().catch(() => {});
    }
  });

  test("TC-778: the accountant reads the books, sales tax (+CSV), tips and the year-end package", async () => {
    const overview = await accountantRaw(accountant.token, `/clients/${a.id}`);
    expect(overview.status, JSON.stringify(overview.data)).toBe(200);
    const data = overview.data.data as Rec;
    expect(data.restaurant).toEqual({ id: a.id, name: a.name });
    // Read-only: no action buttons are offered.
    expect((data.books as Rec).books).toMatchObject({ action: null });
    expect(list((data.calendar as Rec).items).length).toBeGreaterThan(0);

    const range = `?startDate=${today()}&endDate=${today()}`;
    const tax = await accountantRaw(
      accountant.token,
      `/clients/${a.id}/sales-tax${range}`
    );
    expect(tax.status).toBe(200);
    const csv = await downloadRaw(
      accountant.token,
      `/api/accountant/clients/${a.id}/sales-tax/csv${range}`
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const tips = await accountantRaw(
      accountant.token,
      `/clients/${a.id}/tips${range}`
    );
    expect(tips.status).toBe(200);
    expect(tips.data.data).toMatchObject({ people: [] });
    const badRange = await accountantRaw(
      accountant.token,
      `/clients/${a.id}/tips?startDate=2024-01-01&endDate=2026-01-01`
    );
    expect(badRange.status).toBe(400);

    const ye = await accountantRaw(
      accountant.token,
      `/clients/${a.id}/year-end?year=${YEAR}`
    );
    expect(ye.status).toBe(200);
    expect((ye.data.data as Rec).package).toMatchObject({ year: YEAR });
    const zip = await downloadRaw(
      accountant.token,
      `/api/accountant/clients/${a.id}/year-end/${YEAR}/package.zip`
    );
    expect(zip.status).toBe(200);
    expect(zip.headers.get("content-type")).toContain("application/zip");
  });

  test("TC-779: every write is refused for the accountant; the owner's own books routes are closed to them", async () => {
    const t = accountant.token;
    const attempts: [string, Promise<{ status: number }>][] = [
      [
        "books: invite",
        booksRaw(t, a.id, "POST", "/accountants", {
          email: `x-${runId}@${DOMAIN}`,
        }),
      ],
      [
        "books: remove",
        booksRaw(t, a.id, "DELETE", `/accountants/${accountant.rowId}`),
      ],
      [
        "books: calendar answer",
        booksRaw(t, a.id, "PATCH", "/tax-calendar/settings", {
          salesTaxFrequency: "MONTHLY",
        }),
      ],
      ["books: owner list", booksRaw(t, a.id, "GET", "/accountants")],
      [
        "accounting: settings",
        accountingRaw(t, a.id, "PATCH", "/settings", { autoPost: false }),
      ],
      [
        "accounting: sync deposits",
        accountingRaw(t, a.id, "POST", "/deposits/sync"),
      ],
      [
        "partner: API key",
        partnerAccessRaw(t, a.id, "POST", "/api-keys", {
          name: "Mine",
          scopes: ["orders:read"],
        }),
      ],
      ["partner: overview", partnerAccessRaw(t, a.id, "GET", "")],
      [
        "tax: new rate",
        taxRaw(t, a.id, "POST", "/rates", { name: "Sneaky", percent: 1 }),
      ],
      [
        "staff: invite",
        inviteStaffRaw(t, a.id, {
          email: `y-${runId}@${DOMAIN}`,
          firstName: "Y",
          lastName: "Z",
        }),
      ],
      ["daily close", closeDayWebRaw(t, a.id)],
    ];
    for (const [what, call] of attempts) {
      const r = await call;
      expect([403, 404], `${what} answered ${r.status}`).toContain(r.status);
    }
    // Nothing changed: still one accountant, still active.
    const owners = await booksRaw(a.owner, a.id, "GET", "/accountants");
    expect(list(owners.data.data).map((x) => x.status)).toEqual(["ACTIVE"]);
  });

  test("TC-780: another restaurant is invisible (404, same as a made-up id); add-on off keeps the list, closes the numbers; revoke ends access at once", async () => {
    const t = accountant.token;
    const other = await accountantRaw(t, `/clients/${b.id}`);
    expect(other.status).toBe(404);
    expect(other.data.message).toBe(
      "You don't have access to this restaurant's numbers."
    );
    const madeUp = await accountantRaw(
      t,
      "/clients/00000000-0000-4000-8000-000000000000"
    );
    expect(madeUp.status).toBe(404);
    expect(madeUp.data.message).toBe(other.data.message);
    for (const path of ["sales-tax", "tips", `year-end?year=${YEAR}`]) {
      expect(
        (await accountantRaw(t, `/clients/${b.id}/${path}`)).status,
        path
      ).toBe(404);
    }

    // Add-on off: the client list still loads (marked unavailable) — the
    // screen never 403s — and the numbers are closed with a reason.
    await deleteFeatureOverrideAdminRaw(adminToken, a.id, "ACCOUNTING_SYNC");
    try {
      const clients = await accountantRaw(t, "/clients");
      expect(clients.status).toBe(200);
      expect(list(clients.data.data)).toMatchObject([
        { restaurantId: a.id, available: false },
      ]);
      const closed = await accountantRaw(t, `/clients/${a.id}`);
      expect(closed.status).toBe(403);
      expect(closed.data.message).toBe(
        "This restaurant's Books & Taxes add-on is off, so its numbers can't be opened right now."
      );
    } finally {
      await setFeatureOverrideAdminRaw(
        adminToken,
        a.id,
        "ACCOUNTING_SYNC",
        true
      );
    }
    expect((await accountantRaw(t, `/clients/${a.id}`)).status).toBe(200);

    const removed = await booksRaw(
      a.owner,
      a.id,
      "DELETE",
      `/accountants/${accountant.rowId}`
    );
    expect(removed.status, JSON.stringify(removed.data)).toBe(200);
    expect(removed.data.message).toBe(
      "Access removed. They can no longer see this restaurant's numbers."
    );
    // The very next request, same token.
    expect((await accountantRaw(t, `/clients/${a.id}`)).status).toBe(404);
    expect(
      (await accountantRaw(t, `/clients/${a.id}/year-end?year=${YEAR}`)).status
    ).toBe(404);
    const clients = await accountantRaw(t, "/clients");
    expect(clients.status).toBe(200);
    expect(clients.data.data).toEqual([]);
    expect(
      (await booksRaw(a.owner, a.id, "GET", "/accountants")).data.data
    ).toEqual([]);
  });
});
