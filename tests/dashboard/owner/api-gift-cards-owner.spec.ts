/**
 * api-gift-cards-owner.spec.ts — the owner's gift card routes on a standalone
 * restaurant (TC-2000..2012).
 *
 * RestauNax feat/owner-gift-cards (plan B "API contract"): the owner sees the
 * cards their restaurant holds (masked codes, resolved text), freezes and
 * unfreezes, resends and re-addresses, saves the selling settings, and reads
 * what is owed, the activity, the monthly roll-forward, the unsold stock and
 * the settlement. A restaurant outside a chain has no settlement.
 *
 * Tenant A: a fresh owner, published, open, with only the QA dummy Stripe
 * onboarding (charges NOT enabled: its Stripe setup is unfinished, like a
 * real restaurant that never pressed Agree); cards: an imported $30 card and a
 * batch of 2 printed stock cards. Tenant B: a second fresh owner with one $10
 * imported card (the IDOR counterpart). TC-2012 mints its own home-food
 * seller.
 *
 * The $50 card bought on the website (emailed) is bought at the shared SEED
 * restaurant S (`seedRestaurantForCardSales`): only a restaurant whose Stripe
 * setup is finished may sell a card by card, and the seed is the one QA
 * restaurant that has. S is shared, so its cases use the seed owner's token
 * and assert deltas or this run's card by id, never S's totals; its config is
 * put back in afterAll.
 *
 * The whole file is gated behind RELEASED_ON_QA.ownerGiftCards: it skips
 * (with the gate's reason) until the owner routes are on the stack, and the
 * setup stops before any money is seeded when they are not.
 *
 *   TC-2000 list and detail: masked codes, resolved text, history of the web card (S).
 *   TC-2001 another owner: 403 on the scope, 404 on the id (same as a missing card).
 *   TC-2002 owner freezes and unfreezes; no money moves.
 *   TC-2003 a RestauNax freeze can't be lifted by the owner.
 *   TC-2004 @email resend and change recipient (the web card, S).
 *   TC-2005 settings save, validate; selling off never stops spending.
 *   TC-2006 what's owed, from the cards actually held.
 *   TC-2007 activity for today.
 *   TC-2008 the monthly roll-forward ties to the live balance.
 *   TC-2009 unsold stock by batch.
 *   TC-2010 a restaurant outside a chain has no settlement.
 *   TC-2011 answers come back in the caller's language.
 *   TC-2012 a home-food seller is refused the owner routes and selling, and still redeems.
 *   TC-2051 an owner can't change selling, cash or printed cards (silently kept).
 *   TC-2052 RestauNax staff change them through the owner route.
 *   TC-2053 the unsold stock report is paged; totals cover every batch.
 *   TC-2055 a restaurant whose Stripe setup is unfinished can't sell a card by card.
 *
 * TC-2051..2053 and TC-2055 are the owner UX follow-up (RestauNax feat/gift-cards-owner-ux),
 * gated on RELEASED_ON_QA.giftCardsOwnerUx (probe: GET config carries
 * `canEditPlatformFields`). Selling, cash and printed cards are set up by
 * RestauNax, so the setup and TC-2005 switch them through the admin config
 * route (`PUT /api/admin/gift-cards/config`), which works before and after
 * that change.
 */
import { randomUUID } from "crypto";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  generateRunId,
  recordGiftCardForCleanup,
} from "../../../utils/testData";
import { waitForEmail } from "../../../utils/emailHelper";
import {
  addDays,
  localToday,
  looksLikeKey,
} from "../../../utils/backOfficeApi";
import {
  buyGiftCardOnline,
  dataOf,
  isMaskedCode,
  ownerGiftCardRaw,
  rollForwardTies,
  seedRestaurantForCardSales,
} from "../../../utils/giftCardOwnerApi";
import {
  probeGiftCardsOwnerUx,
  probeOwnerGiftCards,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  apiLogin,
  apiRequestRaw,
  createGiftCardBatchRaw,
  createSecondOwner,
  deleteTestRestaurant,
  ensureBusinessHours,
  freezeGiftCardApi,
  freezeGiftCardBatchRaw,
  getOwnerGiftCardSummaryRaw,
  getRestaurantTimeZonePublic,
  seedFundedGiftCard,
  setRestaurantPublishedApi,
  stripeConfigRaw,
  putGiftCardConfigAdminRaw,
  stripeTestOnboardingRaw,
  unfreezeGiftCardRaw,
  validateGiftCardPublicRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
const money = (x: unknown): Rec => x as Rec;

test.describe.configure({ mode: "serial" });

test.describe(
  "Owner gift cards — standalone restaurant (API)",
  { tag: ["@owner-gift-cards"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD || !OWNER_EMAIL || !OWNER_PASSWORD,
      "ADMIN_* / OWNER_* not set (own tenants, plus a web card at the seed)"
    );

    const runId = generateRunId();
    const webRecipient = `auto-gc-${runId}@${EMAIL_DOMAIN}`;
    const newRecipient = `auto-gc-new-${runId}@${EMAIL_DOMAIN}`;
    let adminToken = "";
    let ownerA = "";
    let ownerB = "";
    let A = "";
    let B = "";
    /** Owner routes exist on this stack (probed once, in beforeAll). */
    let present = false;
    /** The owner UX follow-up is on this stack (probed once, in beforeAll). */
    let uxPresent = false;
    let tz = "America/New_York";
    let imported = { id: "", code: "" };
    /** The $50 web card, bought at the seed restaurant S. */
    let web = { id: "", code: "" };
    let S = "";
    let ownerS = "";
    let restoreSeed: () => Promise<void> = async () => {};
    let seedTz = "America/New_York";
    /** S's website sales today before this run's purchase. */
    let seedSoldBefore = { amount: 0, count: 0 };
    let batchId = "";
    let batchLabel = "";
    /** A second batch TC-2053 mints so the stock report has two pages. */
    let secondBatchId = "";
    const extraRestaurants: string[] = [];

    const scopeA = () => ({ restaurantId: A });
    const asA = (
      method: "GET" | "POST" | "PUT",
      path: string,
      body?: unknown,
      lang?: "en" | "es"
    ) => ownerGiftCardRaw<Rec>(ownerA, scopeA(), method, path, body, lang);
    /** RestauNax staff on the owner route (platform-only settings). */
    const asAdminA = (method: "GET" | "PUT", path: string, body?: unknown) =>
      ownerGiftCardRaw<Rec>(adminToken, scopeA(), method, path, body);
    /** The seed owner on the seed restaurant S. */
    const asS = (
      method: "GET" | "POST" | "PUT",
      path: string,
      body?: unknown,
      lang?: "en" | "es"
    ) =>
      ownerGiftCardRaw<Rec>(
        ownerS,
        { restaurantId: S },
        method,
        path,
        body,
        lang
      );
    const seedWebsiteSold = async () => {
      const today = localToday(seedTz);
      const r = await asS("GET", `/reports/activity?from=${today}&to=${today}`);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const w = (dataOf(r.data).sold as Rec).website as Rec;
      return { amount: Number(w.amount), count: Number(w.count) };
    };
    const summary = async () => {
      const r = await asA("GET", "/reports/summary");
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      return dataOf(r.data);
    };
    const gate = () => requireRelease("ownerGiftCards", present);
    const uxGate = () => {
      gate();
      requireRelease("giftCardsOwnerUx", uxPresent);
    };

    test.beforeAll(async () => {
      test.setTimeout(240_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;

      const a = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!a.restaurantId) throw new Error("[gc-owner] no tenant A");
      A = a.restaurantId;
      ownerA = a.accessToken;
      // Probe before spending anything: no owner routes, nothing to seed.
      present = await probeOwnerGiftCards(ownerA, A);
      if (!present) return;

      await setRestaurantPublishedApi(adminToken, A, true);
      await ensureBusinessHours(ownerA, A);
      const onboard = await stripeTestOnboardingRaw(ownerA, A);
      if (onboard.status !== 200)
        throw new Error(`[gc-owner] stripe: ${JSON.stringify(onboard.data)}`);
      uxPresent = await probeGiftCardsOwnerUx(ownerA, A);
      // Selling, cash and printed cards are RestauNax's to switch (an owner's
      // PUT drops them): the admin config route turns them on.
      const cfg = await putGiftCardConfigAdminRaw(adminToken, A, {
        isEnabled: true,
        allowCashFunding: true,
        allowPhysicalActivation: true,
      });
      if (!cfg.ok)
        throw new Error(`[gc-owner] config: ${JSON.stringify(cfg.data)}`);
      tz = (await getRestaurantTimeZonePublic(A)) || tz;

      const seeded = await seedFundedGiftCard(adminToken, A, 30);
      imported = { id: seeded.id, code: seeded.code };
      recordGiftCardForCleanup(imported.id);

      // The web card: sold by card at the seed restaurant, the only QA
      // restaurant whose Stripe setup is finished.
      const seed = await seedRestaurantForCardSales(adminToken, [50]);
      S = seed.restaurantId;
      ownerS = seed.ownerToken;
      restoreSeed = seed.restore;
      seedTz = (await getRestaurantTimeZonePublic(S)) || seedTz;
      seedSoldBefore = await seedWebsiteSold();
      const pk = String(
        (await stripeConfigRaw()).data.data?.publishableKey ?? ""
      );
      const bought = await buyGiftCardOnline(pk, S, 50, {
        recipientEmail: webRecipient,
      });
      web = { id: bought.giftCardId, code: bought.code };
      recordGiftCardForCleanup(web.id);

      batchLabel = `Auto owner stock ${runId}`;
      const batch = await createGiftCardBatchRaw(adminToken, {
        restaurantId: A,
        quantity: 2,
        label: batchLabel,
      });
      if (!batch.ok || !batch.data.data)
        throw new Error(`[gc-owner] batch: ${JSON.stringify(batch.data)}`);
      batchId = batch.data.data.id;

      const b = await createSecondOwner(adminToken, `${runId}b`, {
        alwaysFresh: true,
      });
      if (!b.restaurantId) throw new Error("[gc-owner] no tenant B");
      B = b.restaurantId;
      ownerB = b.accessToken;
      const seededB = await seedFundedGiftCard(adminToken, B, 10);
      recordGiftCardForCleanup(seededB.id);
    });

    test.afterAll(async () => {
      if (!adminToken) return;
      await restoreSeed().catch(() => {});
      for (const id of [batchId, secondBatchId])
        if (id) await freezeGiftCardBatchRaw(adminToken, id).catch(() => {});
      for (const id of [A, B, ...extraRestaurants]) {
        if (id)
          await deleteTestRestaurant(adminToken, id).catch(() => {
            /* archive is best-effort; globalTeardown sweeps the users */
          });
      }
    });

    test.beforeEach(async () => {
      await allure.label("feature", "Owner gift cards");
      await allure.label("severity", "critical");
    });

    test("TC-2000: the list and a card's detail show masked codes and resolved text", async () => {
      gate();
      const list = await asA("GET", "/cards");
      expect(list.status, JSON.stringify(list.data)).toBe(200);
      const body = dataOf(list.data);
      expect(body.total).toBeGreaterThanOrEqual(2);
      for (const card of body.giftCards as Rec[]) {
        expect(isMaskedCode(card.displayCode), card.displayCode).toBe(true);
        if (card.status === "INACTIVE") {
          // Unsold printed stock has no holder yet.
          expect(card.heldBy).toBeNull();
          expect(card.heldHere).toBe(false);
        } else {
          expect(card.heldHere).toBe(true);
          expect(card.heldBy.id).toBe(A);
        }
        expect(looksLikeKey(card.statusText), card.statusText).toBe(false);
      }
      expect(JSON.stringify(list.data)).not.toContain(imported.code);

      const last4 = imported.code.replace(/[^A-Za-z0-9]/g, "").slice(-4);
      const found = await asA("GET", `/cards?search=${last4}`);
      expect(found.status, JSON.stringify(found.data)).toBe(200);
      const ids = (dataOf(found.data).giftCards as Rec[]).map((c) => c.id);
      expect(ids).toEqual([imported.id]);

      // The web card, at the seed restaurant: found by its last 4 among S's
      // cards (others may share them), masked, sold on the website by card.
      const webLast4 = web.code.replace(/[^A-Za-z0-9]/g, "").slice(-4);
      const atS = await asS("GET", `/cards?search=${webLast4}`);
      expect(atS.status, JSON.stringify(atS.data)).toBe(200);
      expect((dataOf(atS.data).giftCards as Rec[]).map((c) => c.id)).toContain(
        web.id
      );
      expect(JSON.stringify(atS.data)).not.toContain(web.code);

      const detail = await asS("GET", `/cards/${web.id}`);
      expect(detail.status, JSON.stringify(detail.data)).toBe(200);
      const card = dataOf(detail.data);
      const first = (card.history as Rec[]).find(
        (h) => h.kind === "SOLD"
      ) as Rec;
      expect(first, JSON.stringify(card.history)).toBeTruthy();
      expect(first).toMatchObject({
        kind: "SOLD",
        channel: "WEBSITE",
        tender: "CARD",
        amount: 50,
        balanceAfter: 50,
      });
      expect(looksLikeKey(first.label), first.label).toBe(false);
      expect(card.canResend).toBe(true);
      expect(JSON.stringify(detail.data)).not.toContain(web.code);

      const impDetail = await asA("GET", `/cards/${imported.id}`);
      expect(impDetail.status, JSON.stringify(impDetail.data)).toBe(200);
      const kinds = (dataOf(impDetail.data).history as Rec[]).map(
        (h) => h.kind
      );
      expect(kinds).toContain("IMPORTED");
      expect(JSON.stringify(impDetail.data)).not.toContain(imported.code);
    });

    test("TC-2001: another owner's cards answer 403 on the scope and 404 on the id, like a missing card", async () => {
      gate();
      const scopeOfA = { restaurantId: A };
      const scopeOfB = { restaurantId: B };
      for (const path of ["/cards", "/reports/summary"]) {
        const r = await ownerGiftCardRaw<Rec>(ownerB, scopeOfA, "GET", path);
        expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(403);
        expect(r.data.code).toBe("FORBIDDEN");
      }

      const theirs = await ownerGiftCardRaw<Rec>(
        ownerB,
        scopeOfB,
        "GET",
        `/cards/${web.id}`
      );
      const missing = await ownerGiftCardRaw<Rec>(
        ownerB,
        scopeOfB,
        "GET",
        `/cards/${randomUUID()}`
      );
      expect(theirs.status, JSON.stringify(theirs.data)).toBe(404);
      expect(theirs.data.code).toBe("CARD_NOT_FOUND");
      expect(theirs.data).toEqual(missing.data);

      const noToken = await apiRequestRaw(
        "GET",
        `/api/gift-cards/restaurants/${A}/cards`,
        undefined,
        undefined,
        { "X-Restaurant-Id": A }
      );
      expect(noToken.status).toBe(401);

      const attempts: [string, string, unknown][] = [
        ["POST", `/cards/${web.id}/freeze`, { reason: "Not mine" }],
        ["POST", `/cards/${web.id}/resend`, undefined],
        ["PUT", `/cards/${web.id}/recipient`, { recipientEmail: webRecipient }],
      ];
      for (const [method, path, body] of attempts) {
        const r = await ownerGiftCardRaw<Rec>(
          ownerB,
          scopeOfB,
          method as "POST" | "PUT",
          path,
          body
        );
        expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(404);
        expect(r.data.code).toBe("CARD_NOT_FOUND");
      }
      // Still the seed's card, still untouched.
      const detail = await asS("GET", `/cards/${web.id}`);
      expect(dataOf(detail.data).status).toBe("ACTIVE");
    });

    test("TC-2002: the owner freezes and unfreezes; no money moves", async () => {
      gate();
      const before = await summary();
      const freeze = (reason: string) =>
        asA("POST", `/cards/${imported.id}/freeze`, { reason });

      const empty = await freeze("");
      expect(empty.status, JSON.stringify(empty.data)).toBe(400);
      expect(empty.data.code).toBe("REASON_REQUIRED");
      const system = await freeze(" funding_disputed ");
      expect(system.status, JSON.stringify(system.data)).toBe(400);
      expect(system.data.code).toBe("INVALID_REASON");

      try {
        const ok = await freeze("Customer lost it");
        expect(ok.status, JSON.stringify(ok.data)).toBe(200);
        expect(dataOf(ok.data).status).toBe("FROZEN");
        expect(dataOf(ok.data).freeze).toMatchObject({
          origin: "OWNER",
          canLift: true,
          reasonText: "Customer lost it",
        });
        const again = await freeze("Customer lost it");
        expect(again.status).toBe(409);
        expect(again.data.code).toBe("ALREADY_FROZEN");

        // Owner-frozen is still owed, and is not a funding hold.
        const during = await summary();
        expect(money(during.owed).amount).toBe(money(before.owed).amount);
        expect(money(during.onHold).amount).toBe(0);

        const lift = await asA("POST", `/cards/${imported.id}/unfreeze`);
        expect(lift.status, JSON.stringify(lift.data)).toBe(200);
        expect(dataOf(lift.data).status).toBe("ACTIVE");
        expect(dataOf(lift.data).freeze).toBeNull();
        const lifted = await asA("POST", `/cards/${imported.id}/unfreeze`);
        expect(lifted.status).toBe(409);
        expect(lifted.data.code).toBe("NOT_FROZEN");
      } finally {
        // Never leave the card frozen for later cases.
        await asA("POST", `/cards/${imported.id}/unfreeze`).catch(() => {});
      }

      const detail = dataOf((await asA("GET", `/cards/${imported.id}`)).data);
      expect(detail.currentBalance).toBe(30);
      const history = detail.history as Rec[];
      for (const kind of ["FROZEN", "UNFROZEN"]) {
        const row = history.find((h) => h.kind === kind);
        expect(row, `${kind} row`).toBeTruthy();
        expect(row?.amount).toBe(0);
      }
    });

    test("TC-2003: a RestauNax freeze can't be lifted by the owner", async () => {
      gate();
      await freezeGiftCardApi(adminToken, imported.id);
      try {
        const detail = dataOf((await asA("GET", `/cards/${imported.id}`)).data);
        expect(detail.freeze).toMatchObject({
          origin: "ADMIN",
          canLift: false,
        });
        const lift = await asA("POST", `/cards/${imported.id}/unfreeze`);
        expect(lift.status, JSON.stringify(lift.data)).toBe(403);
        expect(lift.data.code).toBe("FREEZE_NOT_LIFTABLE");
        // error:giftCard.care.FREEZE_NOT_LIFTABLE (RestauNax en/error.json).
        expect(looksLikeKey(lift.data.error), lift.data.error).toBe(false);
        expect(lift.data.error).toBe(
          "This card was frozen by RestauNax and only RestauNax can unfreeze it. Contact support."
        );
      } finally {
        await unfreezeGiftCardRaw(adminToken, imported.id);
      }
      const after = dataOf((await asA("GET", `/cards/${imported.id}`)).data);
      expect(after.status).toBe("ACTIVE");
    });

    test("TC-2004: @email the owner resends the card and changes the recipient", async () => {
      gate();
      const t0 = new Date();
      const resend = await asS("POST", `/cards/${web.id}/resend`);
      expect(resend.status, JSON.stringify(resend.data)).toBe(200);
      expect(dataOf(resend.data).sentTo).toBe(webRecipient);
      const mail = await waitForEmail(webRecipient, {
        timeoutMs: 60_000,
        notBefore: t0,
      });
      expect(mail.to_email.toLowerCase()).toBe(webRecipient.toLowerCase());

      const bad = await asS("PUT", `/cards/${web.id}/recipient`, {
        recipientEmail: "nope",
      });
      expect(bad.status, JSON.stringify(bad.data)).toBe(400);
      expect(bad.data.code).toBe("INVALID_EMAIL");

      const t1 = new Date();
      const moved = await asS("PUT", `/cards/${web.id}/recipient`, {
        recipientEmail: newRecipient,
      });
      expect(moved.status, JSON.stringify(moved.data)).toBe(200);
      expect(dataOf(moved.data).sentTo).toBe(newRecipient);
      expect(dataOf(moved.data).card.recipientEmail).toBe(newRecipient);
      const history = dataOf((await asS("GET", `/cards/${web.id}`)).data)
        .history as Rec[];
      expect(history.map((h) => h.kind)).toContain("RECIPIENT_CHANGED");
      await waitForEmail(newRecipient, { timeoutMs: 60_000, notBefore: t1 });

      const frozen = await asS("POST", `/cards/${web.id}/freeze`, {
        reason: "Hold while resend is checked",
      });
      expect(frozen.status, JSON.stringify(frozen.data)).toBe(200);
      try {
        const blocked = await asS("POST", `/cards/${web.id}/resend`);
        expect(blocked.status, JSON.stringify(blocked.data)).toBe(409);
        expect(blocked.data.code).toBe("CARD_NOT_SENDABLE");
      } finally {
        await asS("POST", `/cards/${web.id}/unfreeze`);
      }
    });

    test("TC-2005: settings save and validate; switching selling off never stops spending", async () => {
      gate();
      const config = await asA("GET", "/config");
      expect(config.status, JSON.stringify(config.data)).toBe(200);
      expect(dataOf(config.data)).toMatchObject({
        level: "RESTAURANT",
        editable: true,
      });

      const dup = await asA("PUT", "/config", {
        presetDenominations: [25, 25],
      });
      expect(dup.status, JSON.stringify(dup.data)).toBe(400);
      expect(dup.data.code).toBe("INVALID_CONFIG");
      expect(String(dup.data.error)).toMatch(/presetDenominations|preset/i);

      const wanted = {
        presetDenominations: [20, 40, 60],
        minCustomAmount: 10,
        maxCustomAmount: 300,
      };
      const saved = await asA("PUT", "/config", wanted);
      expect(saved.status, JSON.stringify(saved.data)).toBe(200);
      expect(dataOf((await asA("GET", "/config")).data)).toMatchObject(wanted);

      // Which restaurant proves "selling off refuses a purchase": on the old
      // backend, A. On the new one A is refused for its unfinished Stripe
      // setup BEFORE the selling switch is read (409, TC-2055), so the leg
      // runs at the seed, the one restaurant that can sell by card. That
      // switches the shared seed's selling off for one request, so it runs
      // only on the new backend and is put back in finally. Spending is still
      // checked on A, which stays isolated.
      const sellingOffRefuses = async (rid: string) => {
        const buy = await apiRequestRaw<Rec>(
          "POST",
          "/api/stripe/gift-card-payment-intent",
          { amount: 40, restaurantId: rid, deliveryMethod: "LINK" }
        );
        expect(buy.status, JSON.stringify(buy.data)).toBe(400);
        expect(buy.data.code).not.toBe("GIFT_CARD_HOLDER_CANNOT_RECEIVE");
        expect(buy.data.errorCode).not.toBe("GIFT_CARD_HOLDER_CANNOT_RECEIVE");
        // error:giftCard.notEnabledForProgram (RestauNax en/error.json).
        expect(String(buy.data.message ?? buy.data.error)).toBe(
          "Gift cards are not enabled for this program."
        );
        expect(buy.data.clientSecret).toBeUndefined();
      };
      try {
        // RestauNax switches selling off (an owner can't: TC-2051).
        const off = await putGiftCardConfigAdminRaw(adminToken, A, {
          isEnabled: false,
        });
        expect(off.status, JSON.stringify(off.data)).toBe(200);
        if (!uxPresent) await sellingOffRefuses(A);
        // Spending is never read from the selling switch.
        const valid = await validateGiftCardPublicRaw(imported.code, A);
        expect(valid.status, JSON.stringify(valid.data)).toBe(200);
        expect(valid.data.data.valid).toBe(true);
      } finally {
        await putGiftCardConfigAdminRaw(adminToken, A, { isEnabled: true });
      }
      if (uxPresent) {
        try {
          const off = await putGiftCardConfigAdminRaw(adminToken, S, {
            isEnabled: false,
          });
          expect(off.status, JSON.stringify(off.data)).toBe(200);
          await sellingOffRefuses(S);
        } finally {
          // seedRestaurantForCardSales left selling on: put it back on.
          await putGiftCardConfigAdminRaw(adminToken, S, { isEnabled: true });
        }
      }
      expect(dataOf((await asA("GET", "/config")).data).isEnabled).toBe(true);
    });

    test("TC-2006: what is owed comes from the cards actually held", async () => {
      gate();
      const s = await summary();
      // The imported card alone: the web card was sold at the seed.
      expect(s.owed).toMatchObject({ amount: 30, count: 1 });
      expect(s.ofWhichImported).toMatchObject({ amount: 30, count: 1 });
      expect(s.onHold).toMatchObject({ amount: 0, count: 0 });
      expect(s.legacyPlatformHeld).toMatchObject({ amount: 0, count: 0 });
      expect(s.unsoldStockCount).toBe(2);

      // The old shape still answers: the compat pin for old Owner-app builds.
      const legacy = await getOwnerGiftCardSummaryRaw(ownerA, A);
      expect(legacy.status, JSON.stringify(legacy.data)).toBe(200);
      const old = legacy.data.data as Rec;
      for (const key of [
        "outstandingBalance",
        "cardCount",
        "importedBalance",
        "importedCardCount",
      ])
        expect(typeof old[key], key).toBe("number");
      expect(typeof old.isChainWide).toBe("boolean");
    });

    test("TC-2007: today's activity counts the $50 sale and nothing else", async () => {
      gate();
      const today = localToday(tz);
      const r = await asA("GET", `/reports/activity?from=${today}&to=${today}`);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const a = dataOf(r.data);
      // An import is not a sale: A sold nothing.
      expect(a.sold.total).toMatchObject({ amount: 0, count: 0 });
      // The $50 web sale counts at the seed. S is shared (other runs sell
      // there too), so its website sales grew by AT LEAST this one.
      const seedNow = await seedWebsiteSold();
      expect(seedNow.amount - seedSoldBefore.amount).toBeGreaterThanOrEqual(50);
      expect(seedNow.count - seedSoldBefore.count).toBeGreaterThanOrEqual(1);
      expect(a.spent.total.amount).toBe(0);
      expect(a.cashedOut.amount).toBe(0);

      const backwards = await asA(
        "GET",
        `/reports/activity?from=${today}&to=${addDays(today, -1)}`
      );
      expect(backwards.status, JSON.stringify(backwards.data)).toBe(400);
      expect(backwards.data.code).toBe("INVALID_RANGE");
      const tooLong = await asA(
        "GET",
        `/reports/activity?from=${addDays(today, -400)}&to=${today}`
      );
      expect(tooLong.status, JSON.stringify(tooLong.data)).toBe(400);
      expect(tooLong.data.code).toBe("INVALID_RANGE");
    });

    test("TC-2008: the monthly roll-forward ties to the live balance", async () => {
      gate();
      const today = localToday(tz);
      const month = today.slice(0, 7);
      const r = await asA("GET", `/reports/roll-forward?month=${month}`);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const rf = dataOf(r.data) as Parameters<typeof rollForwardTies>[0] & Rec;
      expect(rf.isCurrentPeriod).toBe(true);
      expect(rf.lines.sold).toBe(0);
      expect(rf.lines.importedOpening).toBe(30);
      const s = await summary();
      expect(Math.round(rf.endBalance * 100)).toBe(
        Math.round((money(s.owed).amount + money(s.onHold).amount) * 100)
      );
      expect(rollForwardTies(rf)).toBe(true);

      const nextMonth = addDays(`${month}-28`, 7).slice(0, 7);
      const future = await asA(
        "GET",
        `/reports/roll-forward?month=${nextMonth}`
      );
      expect(future.status, JSON.stringify(future.data)).toBe(400);
      expect(future.data.code).toBe("INVALID_RANGE");
    });

    test("TC-2009: unsold stock is listed by batch", async () => {
      gate();
      const r = await asA("GET", "/reports/stock");
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const stock = dataOf(r.data);
      const row = (stock.batches as Rec[]).find((b) => b.id === batchId);
      expect(row, JSON.stringify(stock.batches)).toBeTruthy();
      expect(row).toMatchObject({ quantity: 2, unsold: 2, activated: 0 });
      expect(stock.totals.unsold).toBeGreaterThanOrEqual(2);
    });

    test("TC-2010: a restaurant outside a chain has no settlement", async () => {
      gate();
      const r = await asA("GET", "/reports/settlement");
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const s = dataOf(r.data);
      expect(s.balance).toBe(0);
      expect(s.entries).toEqual([]);
      expect(s.totals).toMatchObject({ owed: 0, earned: 0 });
    });

    test("TC-2011: answers come back in the caller's language", async () => {
      gate();
      const en = await asA("GET", "/cards", undefined, "en");
      const es = await asA("GET", "/cards", undefined, "es");
      expect(es.status, JSON.stringify(es.data)).toBe(200);
      const enCards = dataOf(en.data).giftCards as Rec[];
      const esCards = dataOf(es.data).giftCards as Rec[];
      const enStatus = new Map(enCards.map((c) => [c.id, c.statusText]));
      for (const card of esCards) {
        expect(looksLikeKey(card.statusText), card.statusText).toBe(false);
        expect(card.statusText).not.toBe(enStatus.get(card.id));
      }

      const enDetail = dataOf((await asS("GET", `/cards/${web.id}`)).data);
      const esDetail = dataOf(
        (await asS("GET", `/cards/${web.id}`, undefined, "es")).data
      );
      const label = (d: Rec) => (d.history as Rec[])[0]?.label;
      expect(looksLikeKey(label(esDetail)), label(esDetail)).toBe(false);
      expect(label(esDetail)).not.toBe(label(enDetail));

      const refusedEn = await asA(
        "POST",
        `/cards/${imported.id}/freeze`,
        { reason: "funding_disputed" },
        "en"
      );
      const refusedEs = await asA(
        "POST",
        `/cards/${imported.id}/freeze`,
        { reason: "funding_disputed" },
        "es"
      );
      expect(refusedEs.status).toBe(400);
      expect(refusedEs.data.code).toBe("INVALID_REASON");
      expect(looksLikeKey(refusedEs.data.error)).toBe(false);
      expect(refusedEs.data.error).not.toBe(refusedEn.data.error);
    });

    test("TC-2012: a home-food seller is refused the owner gift card routes and can't sell", async () => {
      gate();
      const seller = await createSecondOwner(adminToken, `${runId}h`, {
        restaurant: {
          name: `Automation Home Seller ${runId}`,
          businessType: "HOME_FOOD",
        },
      });
      if (!seller.restaurantId) throw new Error("[gc-owner] no home seller");
      extraRestaurants.push(seller.restaurantId);
      const scope = { restaurantId: seller.restaurantId };
      for (const path of ["/reports/summary", "/cards", "/config"]) {
        const r = await ownerGiftCardRaw<Rec>(
          seller.accessToken,
          scope,
          "GET",
          path
        );
        expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(403);
        expect(r.data.code).toBe("FEATURE_NOT_AVAILABLE");
        expect(looksLikeKey(r.data.error)).toBe(false);
      }
      // Selling is refused in words, by the feature check. A fresh tenant is
      // unpublished, and the public buy route refuses an unpublished
      // restaurant first (400 preview mode), so publish it. The feature check
      // runs before any Stripe-readiness check, so no onboarding is needed.
      await setRestaurantPublishedApi(adminToken, seller.restaurantId, true);
      const buy = await apiRequestRaw<Rec>(
        "POST",
        "/api/stripe/gift-card-payment-intent",
        {
          amount: 25,
          restaurantId: seller.restaurantId,
          deliveryMethod: "LINK",
        }
      );
      expect(buy.status, JSON.stringify(buy.data)).toBe(403);
      expect(buy.data.code).toBe("FEATURE_NOT_AVAILABLE");

      // A card the seller already holds still redeems (spending never reads
      // the feature). Seeding goes through the admin import; if the backend
      // refuses to import onto a home-food seller, say so rather than guess.
      let seeded: { id: string; code: string } | null = null;
      try {
        seeded = await seedFundedGiftCard(adminToken, seller.restaurantId, 15);
        recordGiftCardForCleanup(seeded.id);
      } catch (e) {
        test.info().annotations.push({
          type: "home-food redeem not checked",
          description: `admin import refused on a HOME_FOOD seller: ${String(e).slice(0, 300)}`,
        });
      }
      if (seeded) {
        const valid = await validateGiftCardPublicRaw(
          seeded.code,
          seller.restaurantId
        );
        expect(valid.status, JSON.stringify(valid.data)).toBe(200);
        expect(valid.data.data.valid).toBe(true);
      }
    });

    const PLATFORM_FIELDS = [
      "isEnabled",
      "allowCashFunding",
      "allowPhysicalActivation",
    ] as const;
    const platformOf = (c: Rec) =>
      Object.fromEntries(PLATFORM_FIELDS.map((k) => [k, c[k]]));

    test("TC-2051: an owner can't switch selling, cash or printed cards; the save keeps them", async () => {
      uxGate();
      const before = await asA("GET", "/config");
      expect(before.status, JSON.stringify(before.data)).toBe(200);
      const was = dataOf(before.data);
      expect(was.canEditPlatformFields).toBe(false);
      expect(was).toMatchObject({ isEnabled: true, allowCashFunding: true });

      // Old Owner-app builds send these on every save: dropped, never refused.
      const put = await asA("PUT", "/config", {
        isEnabled: false,
        allowCashFunding: false,
      });
      expect(put.status, JSON.stringify(put.data)).toBe(200);
      expect(platformOf(dataOf(put.data))).toEqual(platformOf(was));
      expect(dataOf(put.data).canEditPlatformFields).toBe(false);

      const after = dataOf((await asA("GET", "/config")).data);
      expect(platformOf(after)).toEqual(platformOf(was));
      expect(after.presetDenominations).toEqual(was.presetDenominations);
    });

    test("TC-2052: RestauNax staff switch them through the owner route", async () => {
      uxGate();
      const was = dataOf((await asA("GET", "/config")).data);
      const asStaff = await asAdminA("GET", "/config");
      expect(asStaff.status, JSON.stringify(asStaff.data)).toBe(200);
      expect(dataOf(asStaff.data).canEditPlatformFields).toBe(true);
      try {
        const put = await asAdminA("PUT", "/config", {
          allowCashFunding: false,
          allowPhysicalActivation: false,
        });
        expect(put.status, JSON.stringify(put.data)).toBe(200);
        const seen = dataOf((await asA("GET", "/config")).data);
        expect(seen).toMatchObject({
          allowCashFunding: false,
          allowPhysicalActivation: false,
          canEditPlatformFields: false,
        });
      } finally {
        const restore = await asAdminA("PUT", "/config", platformOf(was));
        expect(restore.status, JSON.stringify(restore.data)).toBe(200);
      }
      const restored = dataOf((await asA("GET", "/config")).data);
      expect(platformOf(restored)).toEqual(platformOf(was));
    });

    test("TC-2053: the unsold stock report is paged and its totals cover every batch", async () => {
      uxGate();
      const second = await createGiftCardBatchRaw(adminToken, {
        restaurantId: A,
        quantity: 1,
        label: `${batchLabel} 2`,
      });
      if (!second.ok || !second.data.data)
        throw new Error(`[gc-owner] batch 2: ${JSON.stringify(second.data)}`);
      secondBatchId = second.data.data.id;

      const page = async (query: string) => {
        const r = await asA("GET", `/reports/stock${query}`);
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        return dataOf(r.data);
      };
      const all = await page("");
      expect(all).toMatchObject({ page: 1, limit: 20 });
      expect(all.total).toBeGreaterThanOrEqual(2);

      const p1 = await page("?page=1&limit=1");
      expect(p1).toMatchObject({ page: 1, limit: 1, total: all.total });
      expect(p1.totalPages).toBe(all.total);
      const p2 = await page("?page=2&limit=1");
      expect(p2).toMatchObject({ page: 2, limit: 1, total: all.total });
      expect(p1.batches as Rec[]).toHaveLength(1);
      expect(p2.batches as Rec[]).toHaveLength(1);
      // Newest first: the batch just minted, then the setup's batch.
      expect((p1.batches as Rec[])[0]?.id).toBe(secondBatchId);
      expect((p2.batches as Rec[])[0]?.id).toBe(batchId);
      // Totals are the whole scope, the same on every page.
      expect(p1.totals).toEqual(all.totals);
      expect(p2.totals).toEqual(all.totals);
      expect((all.totals as Rec).unsold).toBeGreaterThanOrEqual(3);

      const past = await page(`?page=${Number(all.total) + 1}&limit=1`);
      expect(past.batches).toEqual([]);
      expect(past).toMatchObject({
        total: all.total,
        totalPages: all.total,
      });
      expect(past.totals).toEqual(all.totals);
    });

    test("TC-2055: a restaurant whose Stripe setup is unfinished can't sell a card by card", async () => {
      uxGate();
      // A has a Stripe account from the QA dummy onboarding but never accepted
      // Stripe's terms, so it can't take charges: the purchase is refused
      // before any money moves, rather than kept on the platform.
      const buy = await apiRequestRaw<Rec>(
        "POST",
        "/api/stripe/gift-card-payment-intent",
        { amount: 40, restaurantId: A, deliveryMethod: "LINK" }
      );
      expect(buy.status, JSON.stringify(buy.data)).toBe(409);
      expect(buy.data.code).toBe("GIFT_CARD_HOLDER_CANNOT_RECEIVE");
      expect(buy.data.message).toBe(
        "Gift cards can't be bought here right now. Please try again later."
      );
      expect(buy.data.clientSecret).toBeUndefined();
      expect(looksLikeKey(String(buy.data.error)), String(buy.data.error)).toBe(
        false
      );
      // Selling is on: the refusal is the Stripe setup, not the switch.
      expect(dataOf((await asA("GET", "/config")).data).isEnabled).toBe(true);
    });
  }
);
