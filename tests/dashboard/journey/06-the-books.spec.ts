/**
 * 06-the-books.spec.ts — "a week in a restaurant", part 6: the restaurant's
 * days reach its books and its sales tax service (TC-1028..1025).
 * docs/COVERAGE_MAP.md §3, phase 7 (Track B). Tag `@partner`.
 *
 * READ-ONLY, on the QA restaurants a person connected to the partners'
 * test systems (restaunax/docs/features/QA_PARTNER_CONNECTIONS.md), whose
 * days the QA simulator runs every day:
 *   my 2 store      QuickBooks sandbox + Avalara (Neaj's trial)
 *   New Restaurant  Xero demo company
 *   Sally's Pizza   nothing connected — the control
 * Nothing here connects, posts, sends or changes a setting. It reads with
 * the admin login (platform staff may view books), in the browser where an
 * owner would look and through the API for the entries.
 *
 * A restaurant that is missing or no longer connected skips its tests, so
 * a partner's sandbox being reset never fails the run. Days are checked from
 * two days back, so a day that hasn't posted yet doesn't either.
 *
 *   TC-1028 my 2 store: Overview says each connection is working, in words.
 *   TC-1029 my 2 store: each recent day is posted to QuickBooks as one
 *           balanced entry with its own number.
 *   TC-1030 my 2 store: on days without refunds, the tax Avalara has is the
 *           tax in that day's entry, for the same orders.
 *   TC-1030b my 2 store: on a day with refunds too (RestauNax #1104;
 *           test.fail until it is on QA).
 *   TC-1031 my 2 store: each posted card deposit's entry balances, its bank
 *           line is the payout, and the Card deposits tab lists it.
 *   TC-1032 New Restaurant: Overview names the Xero company; recent days are
 *           posted to Xero, balanced.
 *   TC-1033 Sally's Pizza: with nothing connected the page invites setup,
 *           shows no error, and no day failed.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  accountingRaw,
  adminSearchRestaurantsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { addDays } from "../../../utils/backOfficeApi";
import { DESKTOP, expectHumanText } from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const PARTNER = { tag: ["@partner"] };
/** Until RestauNax #1104 is on QA, TC-1030 is known to fail. */
const FIX_1104 = "RestauNax #1104 not on QA yet";
const FIXED_1104 = process.env.EXPECT_FIX_1104 === "1";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

/** "Wednesday, Oct 28" — how the health lines name a day. */
const longDay = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

test.describe.configure({ mode: "serial" });

test.describe("Journey 6 — the books (partner restaurants, read-only)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set"
  );

  let adminToken = "";
  const ids: Record<string, string> = {};
  let session: UiLoginSession | undefined;
  /** Days two or more days old: the simulator's day has had time to post. */
  const cutoff = addDays(new Date().toISOString().slice(0, 10), -2);

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const books = async (name: string) => {
    const id = ids[name] ?? "";
    test.skip(!id, `QA has no restaurant named "${name}"`);
    const r = await accountingRaw(adminToken, id, "GET", "");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { id, integration: r.data.data as Rec };
  };
  const recentDays = async (id: string, n = 3) => {
    const r = await accountingRaw(adminToken, id, "GET", "/days");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec | Rec[];
    return (Array.isArray(data) ? data : list(data.days))
      .filter((d) => String(d.businessDate ?? d.date) <= cutoff)
      .slice(0, n);
  };
  const dayEntry = async (id: string, date: string) => {
    const r = await accountingRaw(adminToken, id, "GET", `/days/${date}`);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const openBooks = async (id: string, section = "") => {
    await page().goto(
      `/restaurant/restaurantId/${id}/restaurantManagement?tab=books-taxes${
        section ? `&section=${section}` : ""
      }`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page().getByRole("heading", { name: "Books & taxes" })
    ).toBeVisible({ timeout: 30_000 });
  };
  /** A posted day: one balanced entry, numbered RNX-yymmdd-<rid start>. */
  const expectPosted = async (
    id: string,
    date: string,
    provider: string
  ): Promise<Rec> => {
    const day = await dayEntry(id, date);
    expect(day.status, `${date}: ${JSON.stringify(day.error)}`).toBe("POSTED");
    expect(day.provider).toBe(provider);
    expect(day.externalId, `${date} has no id in the books`).toBeTruthy();
    expect(String(day.docNumber)).toBe(
      `RNX-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-${id.slice(0, 4)}`
    );
    const entry = day.entry as Rec;
    expect(entry.balanced, date).toBe(true);
    expect(entry.debitCents, date).toBe(entry.creditCents);
    expect(entry.leftoverCents, date).toBe(0);
    const lines = list(entry.lines);
    const side = (s: string) =>
      lines
        .filter((l) => l.side === s)
        .reduce((sum, l) => sum + Number(l.cents), 0);
    expect(side("DEBIT"), date).toBe(Number(entry.debitCents));
    expect(side("CREDIT"), date).toBe(Number(entry.creditCents));
    // Lines come with words, never keys.
    for (const l of lines) expect(String(l.label)).not.toMatch(/^[a-z_]+:/);
    return entry;
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    for (const name of ["my 2 store", "New Restaurant", "Sally's Pizza"]) {
      const found = await adminSearchRestaurantsRaw(adminToken, name);
      ids[name] =
        (found.data.restaurants ?? []).find((r) => r.name === name)?.id ?? "";
    }
    session = await loginViaUi(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test.afterAll(async () => {
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Journey — the books (partners)");
    await allure.label("severity", "normal");
    await page().setViewportSize(DESKTOP);
  });

  test(
    "TC-1028: my 2 store — Overview says each connection is working, in words",
    PARTNER,
    async () => {
      const { id, integration } = await books("my 2 store");
      test.skip(
        integration.provider !== "QUICKBOOKS" || integration.connected !== true,
        `my 2 store is no longer connected to QuickBooks (${String(integration.provider)})`
      );
      const company = String(integration.companyName);
      await openBooks(id);
      await expect(
        page().getByText(
          new RegExp(
            `^Posted through [A-Z][a-z]+, [A-Z][a-z]{2} \\d{1,2} to ${company}\\.$`
          )
        )
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page().getByText(
          /^Deposits matched through [A-Z][a-z]+, [A-Z][a-z]{2} \d{1,2}\.$/
        )
      ).toBeVisible();
      const tax = await accountingRaw(adminToken, id, "GET", "/avalara");
      const last = String((tax.data.data as Rec).lastSentDate ?? "");
      if (last)
        await expect(
          page().getByText(
            `Days are in Avalara (RestauNax) through ${longDay(last)}.`
          )
        ).toBeVisible();
      await expect(
        page().getByText("RestauNax Payroll is running.")
      ).toBeVisible();
      // Nothing on the page asks for help.
      await expect(
        page().getByText(/failed|refused|disconnected/i)
      ).toHaveCount(0);
      await expectHumanText(page().getByRole("main"), "Books & taxes");
    }
  );

  test(
    "TC-1029: my 2 store — each recent day is posted to QuickBooks as one balanced entry",
    PARTNER,
    async () => {
      const { id, integration } = await books("my 2 store");
      test.skip(integration.connected !== true, "my 2 store is not connected");
      const days = await recentDays(id);
      test.skip(days.length === 0, "no closed day two or more days back");
      for (const d of days)
        await expectPosted(id, String(d.businessDate ?? d.date), "QUICKBOOKS");
    }
  );

  /** Avalara's sent days (two or more days back) beside their entries. */
  const taxDays = async () => {
    const { id } = await books("my 2 store");
    const r = await accountingRaw(adminToken, id, "GET", "/avalara");
    expect(r.status).toBe(200);
    const av = r.data.data as Rec;
    test.skip(!av.connection, "my 2 store is not connected to Avalara");
    expect((av.health as Rec).state, JSON.stringify(av.health)).toBe("OK");
    const out: { date: string; avalara: Rec; entry: Rec; refunds: boolean }[] =
      [];
    for (const d of list(av.days)
      .filter((d) => d.status === "SENT" && String(d.date) <= cutoff)
      .slice(0, 7)) {
      const entry = (await dayEntry(id, String(d.date))).entry as Rec;
      out.push({
        date: String(d.date),
        avalara: d,
        entry,
        refunds: list(entry.lines).some((l) => l.key === "refunds"),
      });
    }
    return out;
  };
  const expectSameTax = (day: { date: string; avalara: Rec; entry: Rec }) => {
    expect(day.avalara.statusLabel).toBe("In Avalara");
    expect(day.avalara.error).toBeNull();
    // Collected minus given back, per the books' sales tax lines.
    const bookTax = list(day.entry.lines)
      .filter((l) => String(l.key).startsWith("tax:"))
      .reduce(
        (s, l) => s + (l.side === "CREDIT" ? 1 : -1) * Number(l.cents),
        0
      );
    expect(day.avalara.taxCents, `${day.date}: Avalara vs the books`).toBe(
      bookTax
    );
    expect(day.avalara.orders, `${day.date}: orders`).toBe(
      day.entry.orderCount
    );
  };

  test(
    "TC-1030: my 2 store — on days without refunds Avalara has the same tax as the books, for the same orders",
    PARTNER,
    async () => {
      const days = (await taxDays()).filter((d) => !d.refunds);
      test.skip(days.length === 0, "no day in Avalara without refunds");
      for (const d of days.slice(0, 3)) expectSameTax(d);
    }
  );

  test(
    "TC-1030b: my 2 store — on a day with refunds the books owe the same tax as Avalara",
    PARTNER,
    async () => {
      // The books took the refund's tax off nothing: sales tax payable stayed
      // above what was filed by the refunded tax (RestauNax #1104).
      test.fail(!FIXED_1104, FIX_1104);
      const days = (await taxDays()).filter((d) => d.refunds);
      test.skip(days.length === 0, "no day in Avalara with a refund");
      for (const d of days.slice(0, 3)) expectSameTax(d);
    }
  );

  test(
    "TC-1031: my 2 store — each posted card deposit balances, its bank line is the payout, and Card deposits lists it",
    PARTNER,
    async () => {
      const { id, integration } = await books("my 2 store");
      test.skip(integration.connected !== true, "my 2 store is not connected");
      const r = await accountingRaw(adminToken, id, "GET", "/deposits");
      expect(r.status).toBe(200);
      const posted = list((r.data.data as Rec).deposits).filter(
        (d) => d.status === "POSTED"
      );
      test.skip(posted.length === 0, "no posted card deposit");
      for (const d of posted.slice(0, 3)) {
        const one = await accountingRaw(
          adminToken,
          id,
          "GET",
          `/deposits/${d.id}`
        );
        expect(one.status).toBe(200);
        const entry = (one.data.data as Rec).entry as Rec;
        expect(entry.debitCents, String(d.docNumber)).toBe(entry.creditCents);
        const bank = list(entry.lines).find((l) => l.key === "deposit:bank");
        expect(bank?.cents, String(d.docNumber)).toBe(
          Math.abs(Number(d.amountCents))
        );
      }
      await openBooks(id, "deposits");
      // Each row: the bank date, the amount, what it carried, Posted.
      const first = posted[0] as Rec;
      const bankDate = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${String(first.arrivalDate)}T12:00:00Z`));
      const amount = `$${(Number(first.amountCents) / 100).toFixed(2)}`;
      await expect(
        page().getByRole("row", {
          name: new RegExp(
            `^${bankDate} \\${amount} \\d+ orders? · \\$[\\d.]+ in fees Posted`
          ),
        })
      ).not.toHaveCount(0, { timeout: 20_000 });
    }
  );

  test(
    "TC-1032: New Restaurant — Overview names the Xero company; recent days are posted to Xero, balanced",
    PARTNER,
    async () => {
      const { id, integration } = await books("New Restaurant");
      test.skip(
        integration.provider !== "XERO" || integration.connected !== true,
        `New Restaurant is no longer connected to Xero (${String(integration.provider)})`
      );
      await openBooks(id);
      await expect(
        page().getByText(
          new RegExp(
            `^Posted through [A-Z][a-z]+, [A-Z][a-z]{2} \\d{1,2} to ${String(
              integration.companyName
            ).replace(/[()]/g, "\\$&")}\\.$`
          )
        )
      ).toBeVisible({ timeout: 20_000 });
      const days = await recentDays(id);
      test.skip(days.length === 0, "no closed day two or more days back");
      for (const d of days)
        await expectPosted(id, String(d.businessDate ?? d.date), "XERO");
    }
  );

  test(
    "TC-1033: Sally's Pizza — with nothing connected the page invites setup, shows no error, and no day failed",
    PARTNER,
    async () => {
      const { id, integration } = await books("Sally's Pizza");
      test.skip(
        integration.connected === true,
        "Sally's Pizza is connected now: it's no longer the control"
      );
      const days = await recentDays(id, 7);
      for (const d of days)
        expect(d.status, String(d.businessDate ?? d.date)).not.toBe("FAILED");

      await openBooks(id);
      await expect(
        page().getByRole("heading", { name: "Set it up once" })
      ).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page().getByText("Tell us where you keep your books.")
      ).toBeVisible();
      await expect(
        page().getByText(/failed|refused|disconnected/i)
      ).toHaveCount(0);
      await expectHumanText(page().getByRole("main"), "Books & taxes");

      await page().getByRole("tab", { name: "Books" }).click();
      await expect(
        page().getByRole("button", { name: "Connect QuickBooks Online" })
      ).toBeVisible();
      await expect(
        page().getByRole("button", { name: "Connect Xero" })
      ).toBeVisible();
    }
  );
});
