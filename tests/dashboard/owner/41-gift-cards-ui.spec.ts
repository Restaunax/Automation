/**
 * 41-gift-cards-ui.spec.ts — the owner's web Gift cards section, and Payouts
 * without the gift card blocks (TC-2037..2045).
 *
 * RestauNax feat/owner-gift-cards (web plan C): the restaurant portal has a
 * "Gift cards" sidebar item right after Promotions (`?tab=gift-cards`), with
 * Overview / Reports / Settings tabs (`?section=`, push) and a card drawer
 * (`?card=`). The gift card balance and settlement blocks left Payouts; the
 * CSV export moved to Gift cards → Reports behind the same "treat it like
 * cash" warning. Selectors live in OwnerGiftCardsPage (the web's own ids).
 *
 * Browser. A fresh owner (gift cards on) with a $50 imported card (`importedBig`), a
 * $30 imported card (`imported`) and a $10 imported card frozen by RestauNax
 * (`adminFrozen`), signed in through the UI. No card is sold BY CARD here: a
 * throwaway tenant's Stripe setup is unfinished, so since RestauNax
 * feat/gift-cards-owner-ux it may not sell one (TC-2055), and this file can't
 * use the shared seed restaurant instead: it switches the owner's language
 * (TC-2044), edits settings (TC-2040) and compares totals, all of which need
 * an owner and a restaurant of its own. A card sold online is covered at the
 * seed in api-gift-cards-owner.spec.ts (TC-2000, TC-2004, TC-2007). Every /api/gift-cards/ response is watched: the screen must never
 * answer 401/403 while it loads. TC-2043 alone reads the seed restaurant as
 * the seed owner: Payout History is on Billing, which needs a subscription
 * ("No Subscription Assigned" otherwise), and a throwaway tenant has none.
 *
 * Gated behind RELEASED_ON_QA.ownerGiftCards: skips with the gate's reason
 * until the owner routes are on the stack; nothing is bought before that.
 *
 *   TC-2037 Gift cards sits next to Promotions and opens on what's owed.
 *   TC-2038 find a card by its last 4 and read its history.
 *   TC-2039 freeze a lost card, then unfreeze it; a RestauNax hold has no button.
 *   TC-2040 settings save, and refuse a bad amount on the field.
 *   TC-2041 reports tie, and the export downloads after a warning.
 *   TC-2042 browser Back returns to the previous gift cards tab.
 *   TC-2043 Payouts no longer carries gift card blocks.
 *   TC-2044 the page is plain Spanish for a Spanish owner.
 *   TC-2045 a manager opens Gift cards without a 403.
 *   TC-2054 a standalone restaurant has no Chain settlement report.
 *
 * The owner UX follow-up (RestauNax feat/gift-cards-owner-ux, dashboard
 * gate RELEASED_ON_QA.giftCardsOwnerUxDashboard): selling / cash / printed
 * cards are "Set up by RestauNax" read-only rows for an owner (TC-2040), and
 * Chain settlement shows only on a chain or chain member page (TC-2054; the
 * chain report itself is TC-2018). Selling is switched on through the admin
 * config route, since an owner's PUT drops it on the new backend.
 */
import { readFile } from "fs/promises";
import * as allure from "allure-js-commons";
import type { Page, Response as PwResponse } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import {
  generateRunId,
  readSharedState,
  recordGiftCardForCleanup,
} from "../../../utils/testData";
import { parseCsv } from "../../../utils/csvHelper";
import { looksLikeKey } from "../../../utils/backOfficeApi";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { createRestaurantManager } from "../../../utils/managerApi";
import {
  dataOf,
  isMaskedCode,
  ownerGiftCardRaw,
  sanitizeCode,
  usd,
} from "../../../utils/giftCardOwnerApi";
import {
  probeGiftCardsOwnerUxDashboard,
  probeOwnerGiftCards,
  releasePresent,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
  freezeGiftCardApi,
  putGiftCardConfigAdminRaw,
  seedFundedGiftCard,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  createOwnerGiftCardsPage,
  last4Of,
} from "../../../pages/dashboard/owner/OwnerGiftCardsPage";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
/** EN copy the Spanish page must not show (web giftCards.json, en). */
const EN = {
  sidebar: "Gift cards",
  owedHint:
    "What your customers can still spend on cards whose money you hold.",
  restaunaxHold: "RestauNax froze this card. Call us to lift it.",
  exportWarning: /treat it like cash/i,
  platformHint: "RestauNax sets this up for you. Ask us to change it.",
} as const;

test.describe.configure({ mode: "serial" });

test.describe(
  "Owner gift cards — web section and Payouts (UI)",
  { tag: ["@owner-gift-cards"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let owner = "";
    let rid = "";
    /** Owner routes exist on this stack (probed once, in beforeAll). */
    let present = false;
    let importedBig = { id: "", code: "" };
    let imported = { id: "", code: "" };
    let adminFrozen = { id: "", code: "" };
    let session: UiLoginSession | undefined;
    const refused: string[] = [];

    const gate = () => requireRelease("ownerGiftCards", present);
    const page = (): Page => {
      if (!session) throw new Error("no browser session");
      return session.page;
    };
    const gc = () => createOwnerGiftCardsPage(page());
    const asOwner = (
      method: "GET" | "PUT",
      path: string,
      body?: unknown,
      lang: "en" | "es" = "en"
    ) =>
      ownerGiftCardRaw<Rec>(
        owner,
        { restaurantId: rid },
        method,
        path,
        body,
        lang
      );
    const watch = (res: PwResponse) => {
      if (
        res.url().includes("/api/gift-cards/") &&
        [401, 403].includes(res.status())
      )
        refused.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    };
    const setLocale = async (locale: "en" | "es") => {
      await apiRequestRaw("PATCH", "/users/me/locale", { locale }, owner);
      await page().evaluate(
        (lng) => localStorage.setItem("i18nextLng", lng),
        locale
      );
    };

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(240_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;

      const a = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!a.restaurantId) throw new Error("[gc-ui] no tenant");
      rid = a.restaurantId;
      owner = a.accessToken;
      // Probe before spending anything: no owner routes, nothing to seed.
      present = await probeOwnerGiftCards(owner, rid);
      if (!present) return;

      // Selling is RestauNax's to switch (an owner's PUT drops it since
      // feat/gift-cards-owner-ux): the admin config route turns it on.
      const cfg = await putGiftCardConfigAdminRaw(adminToken, rid, {
        isEnabled: true,
      });
      if (!cfg.ok)
        throw new Error(`[gc-ui] config: ${JSON.stringify(cfg.data)}`);

      const first = await seedFundedGiftCard(adminToken, rid, 50);
      importedBig = { id: first.id, code: first.code };
      recordGiftCardForCleanup(importedBig.id);
      const imp = await seedFundedGiftCard(adminToken, rid, 30);
      imported = { id: imp.id, code: imp.code };
      recordGiftCardForCleanup(imported.id);
      const held = await seedFundedGiftCard(adminToken, rid, 10);
      adminFrozen = { id: held.id, code: held.code };
      recordGiftCardForCleanup(adminFrozen.id);
      await freezeGiftCardApi(adminToken, adminFrozen.id);

      session = await loginViaUi(browser, a.email, a.password ?? "");
      session.page.on("response", watch);
    });

    test.afterAll(async () => {
      if (session) {
        if (owner)
          await apiRequestRaw(
            "PATCH",
            "/users/me/locale",
            { locale: "en" },
            owner
          ).catch(() => {});
        await session.context.close().catch(() => {});
      }
      if (adminToken && rid)
        await deleteTestRestaurant(adminToken, rid).catch(() => {
          /* archive is best-effort; globalTeardown sweeps the users */
        });
    });

    test.beforeEach(async () => {
      refused.length = 0;
      await allure.label("feature", "Owner gift cards (dashboard)");
      await allure.label("severity", "critical");
    });

    test("TC-2037: Gift cards sits next to Promotions and opens on what's owed", async () => {
      gate();
      await page().goto(
        `/restaurant/restaurantId/${rid}/restaurantManagement`,
        { waitUntil: "domcontentloaded" }
      );
      const item = gc().sidebarItem();
      await expect(item).toBeVisible({ timeout: 30_000 });
      await expect(item).toContainText(EN.sidebar);
      const order = await gc().sidebarOrder();
      const at = order.indexOf("tab-gift-cards");
      const promotions = order.indexOf("section-promotions");
      expect(at, order.join(", ")).toBeGreaterThanOrEqual(0);
      expect(promotions, order.join(", ")).toBeGreaterThanOrEqual(0);
      expect(Math.abs(at - promotions), order.join(", ")).toBe(1);

      await item.click();
      await expect(page()).toHaveURL(/[?&]tab=gift-cards(&|$)/);
      await expect(gc().section()).toBeVisible({ timeout: 30_000 });

      const s = await asOwner("GET", "/reports/summary");
      expect(s.status, JSON.stringify(s.data)).toBe(200);
      const owed = Number((dataOf(s.data).owed as Rec).amount);
      await expect(gc().owedFigure()).toHaveText(usd(owed), {
        timeout: 30_000,
      });
      const hint = (await gc().owedHint().innerText()).trim();
      expect(hint).not.toBe("");
      expect(looksLikeKey(hint), hint).toBe(false);
      expect(refused).toEqual([]);
    });

    test("TC-2038: find a card by its last 4 and read its history", async () => {
      gate();
      await gc().goto(rid, "overview");
      const last4 = last4Of(importedBig.code);
      await gc().search(last4);
      await expect(gc().rows()).toHaveCount(1, { timeout: 15_000 });
      const shown = (
        await gc().rowById(importedBig.id).locator("td").first().innerText()
      ).trim();
      expect(isMaskedCode(shown), shown).toBe(true);

      await gc().openCard(last4);
      await expect(page()).toHaveURL(
        new RegExp(`[?&]card=${importedBig.id}(&|$)`)
      );
      const detail = await asOwner("GET", `/cards/${importedBig.id}`);
      expect(detail.status, JSON.stringify(detail.data)).toBe(200);
      const expected = (dataOf(detail.data).history as Rec[]).map((h) =>
        String(h.label)
      );
      expect(await gc().historyLabels()).toEqual(expected);
      expect(await page().content()).not.toContain(importedBig.code);
      expect(sanitizeCode(await page().content())).not.toContain(
        sanitizeCode(importedBig.code)
      );
      await gc().closeCard();
      expect(refused).toEqual([]);
    });

    test("TC-2039: freeze a lost card, then unfreeze it; a RestauNax hold has no button", async () => {
      gate();
      await gc().goto(rid, "overview");
      await gc().openCard(last4Of(importedBig.code), importedBig.id);
      await gc().freeze("Customer lost it");
      try {
        const frozen = dataOf(
          (await asOwner("GET", `/cards/${importedBig.id}`)).data
        );
        expect(frozen.status).toBe("FROZEN");
        expect((frozen.freeze as Rec).origin).toBe("OWNER");
        await expect(gc().drawerStatus()).toHaveText(String(frozen.statusText));
        await expect(gc().freezeBanner()).toContainText("Customer lost it");
        await expect(gc().unfreezeButton()).toBeVisible();
        await gc().unfreeze();
      } finally {
        // The card must be spendable for the rest of the file.
        const now = dataOf(
          (await asOwner("GET", `/cards/${importedBig.id}`)).data
        );
        if (now.status === "FROZEN")
          await ownerGiftCardRaw(
            owner,
            { restaurantId: rid },
            "POST",
            `/cards/${importedBig.id}/unfreeze`
          );
      }
      const active = dataOf(
        (await asOwner("GET", `/cards/${importedBig.id}`)).data
      );
      expect(active.status).toBe("ACTIVE");
      await expect(gc().drawerStatus()).toHaveText(String(active.statusText));
      await gc().closeCard();

      await gc().openCard(last4Of(adminFrozen.code), adminFrozen.id);
      await expect(gc().freezeBanner()).toBeVisible();
      await expect(gc().unfreezeButton()).toBeHidden();
      await expect(gc().unfreezeBlocked()).toHaveText(EN.restaunaxHold);
      await gc().closeCard();
      expect(refused).toEqual([]);
    });

    test("TC-2040: settings save, and refuse a bad amount on the field", async () => {
      gate();
      const before = dataOf((await asOwner("GET", "/config")).data);
      try {
        await gc().goto(rid, "settings");
        await expect(gc().settingsPanel()).toBeVisible({ timeout: 30_000 });

        await gc().removeAllPresets();
        for (const amount of [20, 40, 60]) await gc().addPreset(amount);
        await expect(gc().settingsPresets()).toHaveText([
          "$20.00",
          "$40.00",
          "$60.00",
        ]);
        await gc().saveSettings();
        const saved = dataOf((await asOwner("GET", "/config")).data);
        expect(saved.presetDenominations).toEqual([20, 40, 60]);

        // A duplicate is refused on the field; Save stays off.
        await gc().addPreset(20);
        await expect(gc().presetsError()).toHaveText(
          "Each amount can appear only once."
        );
        await expect(gc().saveButton()).toBeDisabled();
        await gc().removeLastPreset();
        await expect(gc().presetsError()).toHaveCount(0);
        const still = dataOf((await asOwner("GET", "/config")).data);
        expect(still.presetDenominations).toEqual([20, 40, 60]);

        // Selling, cash and printed cards are set up by RestauNax: the owner
        // reads them as On/Off, with no switch to flip.
        const ux = releasePresent(
          "giftCardsOwnerUxDashboard",
          await probeGiftCardsOwnerUxDashboard()
        );
        if (ux) {
          const cfg = dataOf((await asOwner("GET", "/config")).data);
          await expect(gc().platformGroup()).toBeVisible();
          await expect(gc().platformHint()).toHaveText(EN.platformHint);
          const onOff = (v: unknown) => (v === true ? "On" : "Off");
          const fields = {
            selling: cfg.isEnabled,
            cash: cfg.allowCashFunding,
            physical: cfg.allowPhysicalActivation,
          } as const;
          for (const [key, value] of Object.entries(fields) as [
            keyof typeof fields,
            unknown,
          ][]) {
            await expect(gc().settingsReadonly(key)).toHaveText(onOff(value));
            await expect(gc().settingsSwitch(key)).toHaveCount(0);
          }
        }
      } finally {
        // A mid-test failure can leave a draft: discard it, so the next goto
        // never meets the unsaved-changes prompt, then restore through the API.
        await gc()
          .discardChanges()
          .catch(() => {});
        await asOwner("PUT", "/config", {
          presetDenominations: before.presetDenominations,
        });
      }
      expect(refused).toEqual([]);
    });

    test("TC-2041: reports tie, and the export downloads after a warning", async () => {
      gate();
      await gc().goto(rid, "reports");
      // Activity (the default report, no dates = the server's default range).
      const act = await asOwner("GET", "/reports/activity");
      expect(act.status, JSON.stringify(act.data)).toBe(200);
      const sold = Number(((dataOf(act.data).sold as Rec).total as Rec).amount);
      // Imports are not sales: nothing was sold here.
      expect(sold).toBe(0);
      await expect(gc().soldTotalAmount()).toHaveText(usd(sold), {
        timeout: 30_000,
      });

      await gc().openReport("rollForward");
      await expect(gc().rollForwardTies()).toBeVisible({ timeout: 30_000 });
      await expect(gc().rollForwardOff()).toHaveCount(0);
      const rfHint = (await gc().reportHint().innerText()).trim();
      expect(rfHint).not.toBe("");
      expect(looksLikeKey(rfHint), rfHint).toBe(false);

      const download = await gc().exportCsv(async (dialog) => {
        await expect(dialog).toContainText(EN.exportWarning);
      });
      const file = await download.path();
      const rows = parseCsv(await readFile(file, "utf8"));
      const body = rows.slice(1).filter((r) => r.some((c) => c.trim()));
      expect(body.length, JSON.stringify(rows[0])).toBeGreaterThanOrEqual(2);
      const hasCode = (code: string) =>
        body.some((r) => r.some((c) => sanitizeCode(c) === sanitizeCode(code)));
      expect(hasCode(importedBig.code), "the $50 card's full code").toBe(true);
      expect(hasCode(imported.code), "the imported card's full code").toBe(
        true
      );
      const masked = body.flat().filter((c) => isMaskedCode(c.trim()));
      expect(masked, "no masked code in the export").toEqual([]);
      expect(refused).toEqual([]);
    });

    test("TC-2042: browser Back returns to the previous gift cards tab", async () => {
      gate();
      await gc().goto(rid, "overview");
      await expect(gc().sectionPanel("overview")).toBeVisible();
      await gc().openSection("reports");
      await expect(page()).toHaveURL(/[?&]section=reports(&|$)/);
      await gc().openSection("settings");
      await expect(page()).toHaveURL(/[?&]section=settings(&|$)/);

      await page().goBack();
      await expect(page()).toHaveURL(/[?&]section=reports(&|$)/);
      await expect(gc().sectionPanel("reports")).toBeVisible();
      await page().goBack();
      await expect(page()).toHaveURL(/[?&]section=overview(&|$)/);
      await expect(page()).toHaveURL(/[?&]tab=gift-cards(&|$)/);
      await expect(gc().sectionPanel("overview")).toBeVisible();
    });

    // On the SEED restaurant (the seed owner's own session): Payout History
    // only renders with a subscription, and the throwaway tenant has none.
    test("TC-2043: Payouts no longer carries gift card blocks", async ({
      ownerPage,
    }) => {
      gate();
      test.skip(
        !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
        "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
      );
      const seedId = readSharedState().restaurantId;
      const loaded = ownerPage.waitForResponse(
        (r) =>
          r
            .url()
            .includes(`/api/subscriptions/restaurants/${seedId}/payouts`) &&
          r.request().method() === "GET",
        { timeout: 30_000 }
      );
      await ownerPage.goto(
        `/restaurant/restaurantId/${seedId}/subscription?section=payoutHistory`,
        { waitUntil: "domcontentloaded" }
      );
      // The heading alone is also on the "No Subscription Assigned" screen,
      // which has no Payout History at all: the selected tab is the proof.
      await expect(
        ownerPage.getByRole("heading", { name: "Subscription Management" })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        ownerPage.getByRole("heading", { name: "No Subscription Assigned" })
      ).toHaveCount(0);
      await expect(
        ownerPage.getByRole("tab", { name: "Payout History", selected: true })
      ).toBeVisible({ timeout: 30_000 });
      await loaded;
      await expect(
        ownerPage.getByText("Outstanding gift card balances")
      ).toHaveCount(0);
      await expect(ownerPage.getByText(/Gift card settlement:/)).toHaveCount(0);
      await expect(
        ownerPage.getByText(/This money is yours.*cards you sold/)
      ).toHaveCount(0);
      await expect(ownerPage.getByTestId("gift-cards-export")).toHaveCount(0);
      await expect(
        ownerPage.getByRole("button", { name: "Download every card" })
      ).toHaveCount(0);
    });

    test("TC-2044: the page is plain Spanish for a Spanish owner", async () => {
      gate();
      await gc().goto(rid, "overview");
      await setLocale("es");
      try {
        await page().reload({ waitUntil: "domcontentloaded" });
        await expect(gc().section()).toBeVisible({ timeout: 30_000 });

        const item = gc().sidebarItem();
        await expect(item).toBeVisible({ timeout: 30_000 });
        await expect(item).not.toContainText(EN.sidebar);
        const itemText = (await item.innerText()).trim();
        expect(itemText).not.toBe("");
        expect(looksLikeKey(itemText), itemText).toBe(false);

        await expect(gc().owedHint()).toBeVisible({ timeout: 30_000 });
        const hint = (await gc().owedHint().innerText()).trim();
        expect(hint).not.toBe(EN.owedHint);
        expect(hint).not.toBe("");
        expect(looksLikeKey(hint), hint).toBe(false);

        // The status chip is the server's statusText in the page's language.
        const list = async (lang: "en" | "es") =>
          (
            dataOf((await asOwner("GET", "/cards", undefined, lang)).data)
              .giftCards as Rec[]
          ).find((c) => c.id === importedBig.id) as Rec;
        const es = String((await list("es")).statusText);
        const en = String((await list("en")).statusText);
        expect(es).not.toBe(en);
        await expect(gc().rowStatus(gc().rowById(importedBig.id))).toHaveText(
          es,
          {
            timeout: 30_000,
          }
        );
        expect(looksLikeKey(es), es).toBe(false);
      } finally {
        await setLocale("en");
        await page().reload({ waitUntil: "domcontentloaded" });
      }
      expect(refused).toEqual([]);
    });

    test("TC-2054: a standalone restaurant has no Chain settlement report", async () => {
      gate();
      requireRelease(
        "giftCardsOwnerUxDashboard",
        await probeGiftCardsOwnerUxDashboard()
      );
      const settlementCalls: string[] = [];
      const onRequest = (req: { url: () => string }) => {
        if (req.url().includes("/reports/settlement"))
          settlementCalls.push(req.url());
      };
      page().on("request", onRequest);
      try {
        await gc().goto(rid, "reports");
        await expect(gc().reportTab("activity")).toBeVisible({
          timeout: 30_000,
        });
        await expect(gc().reportTab("rollForward")).toBeVisible();
        await expect(gc().reportTab("settlement")).toHaveCount(0);

        // An old link to the chain report falls back to Activity.
        await page().goto(
          `/restaurant/restaurantId/${rid}/restaurantManagement?tab=gift-cards&section=reports&report=settlement`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(gc().soldTotalAmount()).toBeVisible({ timeout: 30_000 });
        await expect(
          page().getByTestId("gift-cards-report-settlement")
        ).toHaveCount(0);
        await expect(gc().reportTab("settlement")).toHaveCount(0);
      } finally {
        page().off("request", onRequest);
      }
      expect(settlementCalls).toEqual([]);
      expect(refused).toEqual([]);
    });

    test("TC-2045: a manager opens Gift cards without a 403", async ({
      browser,
    }) => {
      gate();
      test.skip(!MAILPIT, "needs a manager account (Mailpit invite)");
      test.setTimeout(240_000);
      const managerEmail = `auto-gcmgr-${runId}@${EMAIL_DOMAIN}`;
      const managerPassword = `Automation!Mgr-${runId}`;
      // The shared manager-role harness: RestauNax Team, an invited team
      // member with their own account, made manager.
      await createRestaurantManager({
        adminToken,
        ownerToken: owner,
        restaurantId: rid,
        email: managerEmail,
        password: managerPassword,
        firstName: "Gia",
        lastName: "Manager",
        tag: "[gc-ui]",
      });

      const manager = await loginViaUi(browser, managerEmail, managerPassword);
      const statuses: string[] = [];
      manager.page.on("response", (res) => {
        if (res.url().includes("/api/gift-cards/"))
          statuses.push(
            `${res.status()} ${res.request().method()} ${res.url()}`
          );
      });
      try {
        const mgc = createOwnerGiftCardsPage(manager.page);
        await mgc.goto(rid);
        await expect(mgc.sidebarItem()).toBeVisible({ timeout: 30_000 });
        await expect(mgc.owedFigure()).toBeVisible({ timeout: 30_000 });
        await expect(mgc.sectionTab("overview")).toBeVisible();
        await expect(mgc.sectionTab("reports")).toBeVisible();
        await expect(mgc.sectionTab("settings")).toHaveCount(0);
        await mgc.openSection("reports");
        await expect(mgc.soldTotalAmount()).toBeVisible({ timeout: 30_000 });
        await expect(mgc.exportButton()).toHaveCount(0);
        // An owner-only link falls back to Overview and never loads settings.
        await mgc.goto(rid, "settings");
        await expect(mgc.sectionPanel("overview")).toBeVisible();
        await expect(mgc.settingsPanel()).toHaveCount(0);

        expect(statuses.length).toBeGreaterThan(0);
        expect(statuses.filter((s) => /^40[13] /.test(s))).toEqual([]);
        expect(statuses.filter((s) => /\/config(\?|$)/.test(s))).toEqual([]);
      } finally {
        await manager.context.close().catch(() => {});
      }
    });
  }
);
