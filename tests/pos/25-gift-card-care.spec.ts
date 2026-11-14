/**
 * 25-gift-card-care.spec.ts — the register finds a gift card, honours who may
 * sell / manage cards, and cashes a balance out (TC-2024..2033, TC-2050).
 *
 * RestauNax feat/owner-gift-cards (plan B "API contract" + "Contract
 * amendments"). No browser: the POS is played through its own API. A per-run
 * throwaway restaurant (Stripe TEST, gift cards on with cash + physical
 * activation, a REGISTER device) with four people: the owner (MANAGER, PIN
 * 8462), Dee (STAFF), Rae (STAFF without SELL_GIFT_CARDS) and Sam (SHIFT_LEAD
 * granted MANAGE_GIFT_CARDS). Cards: a $25 cash-sold card, a $40 web card
 * (card-funded today) and a $15 imported card. A stranger tenant holds one
 * seeded card.
 *
 * Gated behind RELEASED_ON_QA.ownerGiftCards: the setup probes the owner
 * routes right after the tenant exists and stops before seeding when they
 * are absent, and every test skips with the gate's reason.
 *
 *   TC-2024 any signed-in staff member finds a card; unknown and foreign codes answer the same 404.
 *   TC-2025 the old lookup still answers what old registers read, plus `freeze`.
 *   TC-2026 a cashier who may not sell is stopped before any money moves.
 *   TC-2027 freezing needs MANAGE_GIFT_CARDS; a shift lead with the grant may.
 *   TC-2028 resend needs selling rights; changing the recipient needs managing rights.
 *   TC-2029 which balances can be cashed out now.
 *   TC-2030 cash-out pays the whole balance once.
 *   TC-2031 the drawer expects the cash that left.
 *   TC-2032 the day close lists gift cards sold and cashed out, apart from sales.
 *   TC-2033 cash-out needs an open drawer.
 *   TC-2050 a cash-out retry replays the original before the drawer and eligibility checks.
 */
import { randomUUID } from "crypto";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId, recordGiftCardForCleanup } from "../../utils/testData";
import { addDays, localToday, looksLikeKey } from "../../utils/backOfficeApi";
import {
  buyGiftCardOnline,
  isMaskedCode,
  ownerGiftCardRaw,
  tabletGiftCardRaw,
} from "../../utils/giftCardOwnerApi";
import { probeOwnerGiftCards, requireRelease } from "../../utils/releaseGate";
import {
  apiLogin,
  apiRequestRaw,
  closeRegisterSessionPosRaw,
  createPinStaffTabletRaw,
  createSecondOwner,
  createTabletDevice,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  getRestaurantTimeZonePublic,
  openRegisterSessionPos,
  putGiftCardConfigAdminRaw,
  seedFundedGiftCard,
  setOwnerPosPin,
  setRestaurantPublishedApi,
  stripeConfigRaw,
  stripeTestOnboardingRaw,
  tabletLogin,
  tabletRaw,
  tabletStaffSignIn,
  type LooseJson,
} from "../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

// ── The exact shapes of plan B's API contract (POS routes) ──────────────────
interface HistoryEntry {
  id: string;
  kind: string;
  label: string;
  amount: number;
  balanceAfter: number;
  performedBy: string | null;
}
interface CashOutRefusal {
  code: string;
  text: string;
  eligibleAt: string | null;
}
interface TabletDetails {
  giftCardId: string;
  displayCode: string;
  status: string;
  statusText: string;
  currentBalance: number;
  freeze: {
    origin: string | null;
    canLift: boolean;
    reasonText: string;
  } | null;
  heldHere: boolean;
  recipient: { name: string | null; emailMasked: string | null } | null;
  cashOut: {
    eligible: boolean;
    amount: number;
    refusal: CashOutRefusal | null;
  };
  history: HistoryEntry[];
}
interface CashOutResult {
  giftCardId: string;
  transactionId: string;
  amount: number;
  balance: number;
  status: string;
  alreadyExisted: boolean;
  receipt: { title: string; displayCode: string; amount: number };
}
/** Every gift card refusal: code AND errorCode, extras at the top level. */
interface Refusal {
  success: false;
  code: string;
  errorCode: string;
  error: string;
  capability?: string;
  eligibleAt?: string;
  currentBalance?: number;
}
interface MoneyCount {
  amount: number;
  count: number;
}

const MASKED_EMAIL = /^.\*\*\*@/;
const SELL_REFUSAL =
  "You don't have permission to sell or reload gift cards. Ask a manager.";

test.describe.configure({ mode: "serial" });

test.describe(
  "POS gift card care (API)",
  { tag: ["@owner-gift-cards"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenants)"
    );

    const runId = generateRunId();
    const webRecipient = `auto-gc-care-${runId}@${EMAIL_DOMAIN}`;
    const newRecipient = `auto-gc-care-new-${runId}@${EMAIL_DOMAIN}`;
    let adminToken = "";
    let ownerToken = "";
    let rid = "";
    let strangerRid = "";
    let deviceId = "";
    let tablet = "";
    let sessionId = "";
    let tz = "America/New_York";
    /** Owner routes exist on this stack (probed once, in beforeAll). */
    let present = false;
    const owner = { id: "", pin: "8462", session: "" };
    const dee = { id: "", pin: "4826", session: "" };
    const rae = { id: "", pin: "5938", session: "" };
    const sam = { id: "", pin: "7261", session: "" };
    let webBoughtAt = new Date();
    let cashCard = { id: "", code: "" };
    let webCard = { id: "", code: "" };
    let importedCard = { id: "", code: "" };
    let strangerCode = "";
    /** The idempotency key of the successful cash-out (TC-2030 / TC-2050). */
    const cashOutKey = `care-${runId}-cash-out`;
    let cashOutTransactionId = "";

    const gate = () => requireRelease("ownerGiftCards", present);
    /** Every POS gift card call; except /sell (it reveals the code once),
     *  no body may ever carry a full card code. */
    const gc = async <T = LooseJson>(
      session: string | undefined,
      method: "POST" | "PUT",
      path: string,
      body?: unknown
    ) => {
      const r = await tabletGiftCardRaw<T>(tablet, session, method, path, body);
      if (path !== "/sell") {
        const text = JSON.stringify(r.data);
        for (const code of [cashCard.code, webCard.code, importedCard.code])
          if (code) expect(text, "no full card code").not.toContain(code);
      }
      return r;
    };
    const loads = async () => {
      const r = await tabletRaw<{ data: { kind: string; amount: number }[] }>(
        tablet,
        "GET",
        `/gift-cards/loads?sessionId=${sessionId}`,
        undefined,
        owner.session
      );
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      return r.data.data;
    };
    /** This device's live drawer, from the manager oversight view. */
    const drawer = async () => {
      const r = await tabletRaw<{
        data: {
          isThisDevice: boolean;
          session: {
            expectedCash: number;
          } | null;
        }[];
      }>(tablet, "GET", "/register/overview", undefined, owner.session);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const mine = r.data.data.find((d) => d.isThisDevice);
      expect(mine?.session, "this device has an open drawer").toBeTruthy();
      return mine!.session!;
    };
    const sellCash = (session: string, amount: number, extra = {}) =>
      gc<{ data: { giftCardId: string; code: string } }>(
        session,
        "POST",
        "/sell",
        {
          amount,
          tender: "CASH",
          deliveryMethod: "PHYSICAL",
          idempotencyKey: randomUUID(),
          ...extra,
        }
      );
    const details = (session: string, code: string) =>
      gc<{ data: TabletDetails }>(session, "POST", "/details", { code });
    const refusal = (r: { data: unknown }) => {
      const body = r.data as Refusal;
      expect(looksLikeKey(body.error), `error text: ${body.error}`).toBe(false);
      return body;
    };
    const mint = async (
      firstName: string,
      pin: string,
      body: Record<string, unknown>
    ) => {
      const r = await createPinStaffTabletRaw(tablet, owner.session, {
        firstName,
        lastName: "Server",
        pin,
        ...body,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      const id = String((r.data.data as { id: string }).id);
      return { id, session: await tabletStaffSignIn(tablet, id, pin) };
    };
    const approval = () => ({
      managerPin: owner.pin,
      approverStaffMemberId: owner.id,
    });

    test.beforeAll(async () => {
      test.setTimeout(240_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId) throw new Error("[gc-care] no tenant");
      rid = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      // Probe before spending anything: no owner routes, nothing to seed.
      present = await probeOwnerGiftCards(ownerToken, rid);
      if (!present) return;

      await setRestaurantPublishedApi(adminToken, rid, true);
      await ensureBusinessHours(ownerToken, rid);
      const onboard = await stripeTestOnboardingRaw(ownerToken, rid);
      if (onboard.status !== 200)
        throw new Error(`[gc-care] stripe: ${JSON.stringify(onboard.data)}`);
      const cfg = await putGiftCardConfigAdminRaw(adminToken, rid, {
        isEnabled: true,
        allowPhysicalActivation: true,
        allowCashFunding: true,
      });
      if (!cfg.ok)
        throw new Error(`[gc-care] config: ${JSON.stringify(cfg.data)}`);
      tz = (await getRestaurantTimeZonePublic(rid)) || tz;

      const device = await createTabletDevice(
        adminToken,
        rid,
        `auto-gc-care-${runId}`
      );
      deviceId = device.id;
      tablet = await tabletLogin(device.name, device.code);
      const ownerMember = await setOwnerPosPin(ownerToken, rid, owner.pin);
      owner.id = ownerMember;
      owner.session = await tabletStaffSignIn(tablet, ownerMember, owner.pin);

      Object.assign(dee, await mint("Dee", dee.pin, { staffRole: "STAFF" }));
      Object.assign(
        rae,
        await mint("Rae", rae.pin, {
          staffRole: "STAFF",
          capabilityRevokes: ["SELL_GIFT_CARDS"],
        })
      );
      Object.assign(
        sam,
        await mint("Sam", sam.pin, {
          staffRole: "SHIFT_LEAD",
          capabilityGrants: ["MANAGE_GIFT_CARDS"],
        })
      );
      sessionId = await openRegisterSessionPos(tablet, owner.session, 100);

      // cashCard: Dee sells $25 cash, print-only.
      const sold = await sellCash(dee.session, 25);
      expect(sold.status, JSON.stringify(sold.data)).toBe(201);
      cashCard = { id: sold.data.data.giftCardId, code: sold.data.data.code };
      recordGiftCardForCleanup(cashCard.id);

      // webCard: bought online with a card today, emailed.
      const pk = String(
        (await stripeConfigRaw()).data.data?.publishableKey ?? ""
      );
      const bought = await buyGiftCardOnline(pk, rid, 40, {
        recipientEmail: webRecipient,
      });
      webBoughtAt = new Date();
      webCard = { id: bought.giftCardId, code: bought.code };
      recordGiftCardForCleanup(webCard.id);

      // importedCard: opening balance from a migration.
      const imported = await seedFundedGiftCard(adminToken, rid, 15);
      importedCard = { id: imported.id, code: imported.code };
      recordGiftCardForCleanup(importedCard.id);

      // The stranger tenant and its one card.
      const stranger = await createSecondOwner(adminToken, `${runId}t`, {
        alwaysFresh: true,
      });
      if (!stranger.restaurantId) throw new Error("[gc-care] no stranger");
      strangerRid = stranger.restaurantId;
      const foreign = await seedFundedGiftCard(adminToken, strangerRid, 10);
      strangerCode = foreign.code;
      recordGiftCardForCleanup(foreign.id);
    });

    test.afterAll(async () => {
      if (!adminToken) return;
      if (rid && deviceId)
        await deactivateTabletDevice(adminToken, rid, deviceId).catch(() => {});
      for (const id of [rid, strangerRid]) {
        if (id) await deleteTestRestaurant(adminToken, id).catch(() => {});
      }
    });

    test.beforeEach(async () => {
      await allure.label("feature", "POS gift card care");
      await allure.label("severity", "critical");
    });

    test("TC-2024: any signed-in staff member finds a card, and an unknown or foreign code answers the same 404", async () => {
      gate();
      const r = await details(dee.session, cashCard.code);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const d = r.data.data;
      expect(isMaskedCode(d.displayCode)).toBe(true);
      expect(d.heldHere).toBe(true);
      expect(d.history[0]).toMatchObject({
        kind: "SOLD",
        performedBy: "Dee S.",
      });
      expect(looksLikeKey(d.statusText)).toBe(false);
      expect(looksLikeKey(d.history[0]?.label)).toBe(false);
      expect(JSON.stringify(r.data)).not.toContain(cashCard.code);

      const web = await details(dee.session, webCard.code);
      expect(web.status, JSON.stringify(web.data)).toBe(200);
      expect(web.data.data.recipient?.emailMasked).toMatch(MASKED_EMAIL);
      expect(JSON.stringify(web.data)).not.toContain(webRecipient);

      const foreign = await details(dee.session, strangerCode);
      const randomCode = Array.from(
        { length: 16 },
        () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
      ).join("");
      const unknown = await details(dee.session, randomCode);
      expect(foreign.status, JSON.stringify(foreign.data)).toBe(404);
      expect(unknown.status, JSON.stringify(unknown.data)).toBe(404);
      expect(refusal(foreign)).toMatchObject({
        code: "NOT_FOUND",
        errorCode: "NOT_FOUND",
      });
      expect(foreign.data).toEqual(unknown.data);
    });

    test("TC-2025: lookup still answers what old registers read, plus freeze", async () => {
      gate();
      const r = await gc<{
        data: Record<string, unknown> & { freeze: unknown };
      }>(dee.session, "POST", "/lookup", { code: cashCard.code });
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const d = r.data.data;
      for (const key of [
        "usableHere",
        "activatable",
        "reloadable",
        "cashCapRemaining",
        "presetDenominations",
      ])
        expect(d, `lookup keeps ${key}`).toHaveProperty(key);
      expect(d.freeze).toBeNull();
      expect(JSON.stringify(r.data)).not.toContain(cashCard.code);
    });

    test("TC-2026: a cashier who may not sell is stopped before any money moves", async () => {
      gate();
      const loadsBefore = await loads();
      const expectedBefore = (await drawer()).expectedCash;

      const sell = await sellCash(rae.session, 20);
      expect(sell.status, JSON.stringify(sell.data)).toBe(403);
      expect(refusal(sell)).toMatchObject({
        code: "GIFT_CARD_PERMISSION_REQUIRED",
        errorCode: "GIFT_CARD_PERMISSION_REQUIRED",
        capability: "SELL_GIFT_CARDS",
        error: SELL_REFUSAL,
      });
      expect(await loads()).toEqual(loadsBefore);
      expect((await drawer()).expectedCash).toBe(expectedBefore);

      const activate = await gc(rae.session, "POST", "/activate", {
        code: cashCard.code,
        amount: 20,
        tender: "CASH",
        idempotencyKey: randomUUID(),
      });
      expect(activate.status, JSON.stringify(activate.data)).toBe(403);
      expect(refusal(activate)).toMatchObject({
        code: "GIFT_CARD_PERMISSION_REQUIRED",
        errorCode: "GIFT_CARD_PERMISSION_REQUIRED",
        capability: "SELL_GIFT_CARDS",
      });

      // The PaymentIntent route is gated whenever a staff session is sent.
      const intentBody = { amount: 20, restaurantId: rid };
      const raeIntent = await tabletRaw<Refusal & { clientSecret?: string }>(
        tablet,
        "POST",
        "/terminal/create-gift-card-payment-intent",
        intentBody,
        rae.session
      );
      expect(raeIntent.status, JSON.stringify(raeIntent.data)).toBe(403);
      expect(raeIntent.data.code).toBe("GIFT_CARD_PERMISSION_REQUIRED");
      expect(looksLikeKey(raeIntent.data.error)).toBe(false);
      expect(raeIntent.data.clientSecret).toBeUndefined();

      // A manager's PIN approves it for her.
      const raeIntentApproved = await tabletRaw<{ clientSecret?: string }>(
        tablet,
        "POST",
        "/terminal/create-gift-card-payment-intent",
        { ...intentBody, ...approval() },
        rae.session
      );
      expect(
        raeIntentApproved.status,
        JSON.stringify(raeIntentApproved.data)
      ).toBe(200);
      expect(raeIntentApproved.data.clientSecret).toMatch(/_secret_/);

      // No session header (kiosk, old build): unchanged. The uncaptured
      // intent expires on its own.
      const kiosk = await tabletRaw<{ clientSecret?: string }>(
        tablet,
        "POST",
        "/terminal/create-gift-card-payment-intent",
        intentBody
      );
      expect(kiosk.status, JSON.stringify(kiosk.data)).toBe(200);
      expect(kiosk.data.clientSecret).toMatch(/_secret_/);

      // Rae with a manager's PIN sells; Dee's default STAFF rights unchanged.
      const approved = await sellCash(rae.session, 20, approval());
      expect(approved.status, JSON.stringify(approved.data)).toBe(201);
      recordGiftCardForCleanup(approved.data.data.giftCardId);
      const byDee = await sellCash(dee.session, 20);
      expect(byDee.status, JSON.stringify(byDee.data)).toBe(201);
      recordGiftCardForCleanup(byDee.data.data.giftCardId);
    });

    test("TC-2027: freezing needs MANAGE_GIFT_CARDS; a shift lead with the grant may", async () => {
      gate();
      const byDee = await gc(dee.session, "POST", `/${cashCard.id}/freeze`, {
        reason: "Customer called",
      });
      expect(byDee.status, JSON.stringify(byDee.data)).toBe(403);
      expect(refusal(byDee)).toMatchObject({
        code: "GIFT_CARD_PERMISSION_REQUIRED",
        errorCode: "GIFT_CARD_PERMISSION_REQUIRED",
        capability: "MANAGE_GIFT_CARDS",
      });

      const bySam = await gc<{ data: TabletDetails }>(
        sam.session,
        "POST",
        `/${cashCard.id}/freeze`,
        { reason: "Customer called" }
      );
      expect(bySam.status, JSON.stringify(bySam.data)).toBe(200);
      expect(bySam.data.data.status).toBe("FROZEN");
      expect(bySam.data.data.freeze).toMatchObject({
        origin: "STAFF",
        canLift: true,
      });

      const lifted = await gc<{ data: TabletDetails }>(
        dee.session,
        "POST",
        `/${cashCard.id}/unfreeze`,
        approval()
      );
      expect(lifted.status, JSON.stringify(lifted.data)).toBe(200);
      expect(lifted.data.data.status).toBe("ACTIVE");
    });

    test("TC-2028: resend needs selling rights; changing the recipient needs managing rights", async () => {
      gate();
      const resend = await gc<{ data: { sentTo: string } }>(
        dee.session,
        "POST",
        `/${webCard.id}/resend`,
        {}
      );
      expect(resend.status, JSON.stringify(resend.data)).toBe(200);
      expect(resend.data.data.sentTo).toMatch(MASKED_EMAIL);

      const byDee = await gc(dee.session, "PUT", `/${webCard.id}/recipient`, {
        recipientEmail: newRecipient,
      });
      expect(byDee.status, JSON.stringify(byDee.data)).toBe(403);
      expect(refusal(byDee)).toMatchObject({
        code: "GIFT_CARD_PERMISSION_REQUIRED",
        errorCode: "GIFT_CARD_PERMISSION_REQUIRED",
        capability: "MANAGE_GIFT_CARDS",
      });

      const bySam = await gc<{ data: { sentTo: string } }>(
        sam.session,
        "PUT",
        `/${webCard.id}/recipient`,
        { recipientEmail: newRecipient }
      );
      expect(bySam.status, JSON.stringify(bySam.data)).toBe(200);
      expect(bySam.data.data.sentTo).toMatch(MASKED_EMAIL);
      expect(JSON.stringify(bySam.data)).not.toContain(newRecipient);
    });

    test("TC-2029: which balances can be cashed out now", async () => {
      gate();
      const cash = await details(owner.session, cashCard.code);
      expect(cash.status, JSON.stringify(cash.data)).toBe(200);
      expect(cash.data.data.cashOut).toMatchObject({
        eligible: true,
        amount: 25,
      });
      const imported = await details(owner.session, importedCard.code);
      expect(imported.data.data.cashOut).toMatchObject({
        eligible: true,
        amount: 15,
      });

      const web = await details(owner.session, webCard.code);
      expect(web.status, JSON.stringify(web.data)).toBe(200);
      const out = web.data.data.cashOut;
      expect(out.eligible).toBe(false);
      expect(out.refusal?.code).toBe("CASH_OUT_TOO_SOON");
      const eligibleAt = String(out.refusal?.eligibleAt);
      expect(
        new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
          new Date(eligibleAt)
        )
      ).toBe(addDays(localToday(tz, webBoughtAt), 30));
      expect(out.refusal?.text).toMatch(/30 days/);
      expect(looksLikeKey(out.refusal?.text)).toBe(false);
    });

    test("TC-2030: cash-out pays the whole balance once", async () => {
      gate();
      const body = {
        giftCardId: cashCard.id,
        idempotencyKey: cashOutKey,
        expectedAmount: 25,
      };
      // Dee may not: refused before the drawer, and no key is recorded.
      const byDee = await gc(dee.session, "POST", "/cash-out", body);
      expect(byDee.status, JSON.stringify(byDee.data)).toBe(403);
      expect(refusal(byDee)).toMatchObject({
        code: "GIFT_CARD_PERMISSION_REQUIRED",
        errorCode: "GIFT_CARD_PERMISSION_REQUIRED",
        capability: "MANAGE_GIFT_CARDS",
      });

      const noKey = await gc(owner.session, "POST", "/cash-out", {
        giftCardId: cashCard.id,
        expectedAmount: 25,
      });
      expect(noKey.status, JSON.stringify(noKey.data)).toBe(400);
      expect(refusal(noKey)).toMatchObject({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        errorCode: "IDEMPOTENCY_KEY_REQUIRED",
      });

      const changed = await gc(owner.session, "POST", "/cash-out", {
        giftCardId: cashCard.id,
        idempotencyKey: randomUUID(),
        expectedAmount: 20,
      });
      expect(changed.status, JSON.stringify(changed.data)).toBe(409);
      expect(refusal(changed)).toMatchObject({
        code: "BALANCE_CHANGED",
        errorCode: "BALANCE_CHANGED",
        currentBalance: 25,
      });

      // Dee's refused attempt used the same key: it must still be free.
      const paid = await gc<{ data: CashOutResult }>(
        owner.session,
        "POST",
        "/cash-out",
        body
      );
      expect(paid.status, JSON.stringify(paid.data)).toBe(201);
      const r = paid.data.data;
      expect(r).toMatchObject({
        giftCardId: cashCard.id,
        amount: 25,
        balance: 0,
        status: "DEPLETED",
        alreadyExisted: false,
      });
      expect(r.receipt).toMatchObject({ amount: 25 });
      expect(isMaskedCode(r.receipt.displayCode)).toBe(true);
      expect(looksLikeKey(r.receipt.title)).toBe(false);
      expect(JSON.stringify(paid.data)).not.toContain(cashCard.code);
      cashOutTransactionId = r.transactionId;

      const again = await gc<{ data: CashOutResult }>(
        owner.session,
        "POST",
        "/cash-out",
        body
      );
      expect(again.status, JSON.stringify(again.data)).toBe(200);
      expect(again.data.data).toMatchObject({
        alreadyExisted: true,
        transactionId: cashOutTransactionId,
      });

      const fresh = await gc(owner.session, "POST", "/cash-out", {
        ...body,
        idempotencyKey: randomUUID(),
      });
      expect(fresh.status, JSON.stringify(fresh.data)).toBe(409);
      expect(refusal(fresh)).toMatchObject({
        code: "NOT_ACTIVE",
        errorCode: "NOT_ACTIVE",
      });

      const card = await ownerGiftCardRaw<{
        data: { history: HistoryEntry[] };
      }>(ownerToken, { restaurantId: rid }, "GET", `/cards/${cashCard.id}`);
      expect(card.status, JSON.stringify(card.data)).toBe(200);
      expect(JSON.stringify(card.data)).not.toContain(cashCard.code);
      expect(
        card.data.data.history.find((h) => h.kind === "CASHED_OUT")
      ).toMatchObject({ amount: -25, balanceAfter: 0 });

      // The web card is card-funded today: it waits.
      const tooSoon = await gc(owner.session, "POST", "/cash-out", {
        giftCardId: webCard.id,
        idempotencyKey: randomUUID(),
        expectedAmount: 40,
      });
      expect(tooSoon.status, JSON.stringify(tooSoon.data)).toBe(409);
      const soon = refusal(tooSoon);
      expect(soon).toMatchObject({
        code: "CASH_OUT_TOO_SOON",
        errorCode: "CASH_OUT_TOO_SOON",
      });
      expect(typeof soon.eligibleAt).toBe("string");
    });

    test("TC-2031: the drawer expects the cash that left", async () => {
      gate();
      // Cash sales: Dee 25, Rae (manager PIN) 20, Dee 20; cash-out 25.
      const live = await drawer();
      expect(live.expectedCash).toBe(140);

      // The drawer's loads list shows the cash-out, not voidable.
      const rows = await tabletRaw<{
        data: { kind: string; amount: number; voidable: boolean }[];
      }>(
        tablet,
        "GET",
        `/gift-cards/loads?sessionId=${sessionId}`,
        undefined,
        owner.session
      );
      expect(rows.data.data.find((l) => l.kind === "CASHED_OUT")).toMatchObject(
        { amount: 25, voidable: false }
      );

      // Count the drawer out: 100 + 25 + 20 + 20 - 25 = 140, nothing over.
      const closed = await closeRegisterSessionPosRaw(tablet, owner.session, {
        countedCash: 140,
      });
      expect(closed.status, JSON.stringify(closed.data)).toBe(200);
      expect(closed.data.data).toMatchObject({
        expectedCash: 140,
        countedCash: 140,
        overShort: 0,
      });
    });

    test("TC-2032: the day close lists gift cards sold and cashed out, apart from sales", async () => {
      gate();
      const r = await apiRequestRaw<{
        data: {
          giftCardsSold: {
            card: MoneyCount;
            cash: MoneyCount;
            total: MoneyCount;
            voided: MoneyCount;
            net: number;
            cashedOut: MoneyCount;
          };
          cash: { giftCardCashOutTotal: number; giftCardCashOutCount: number };
          byMethod: Record<string, unknown>;
          netSales: number;
        };
      }>("GET", `/restaurant/${rid}/daily-close`, undefined, ownerToken);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const d = r.data.data;
      expect(d.giftCardsSold).toEqual({
        cash: { amount: 65, count: 3 },
        card: { amount: 0, count: 0 },
        total: { amount: 65, count: 3 },
        voided: { amount: 0, count: 0 },
        net: 65,
        cashedOut: { amount: 25, count: 1 },
      });
      expect(d.cash.giftCardCashOutTotal).toBe(25);
      expect(d.cash.giftCardCashOutCount).toBe(1);
      // Not revenue: no sale was rung, so sales are nil and byMethod is bare.
      expect(d.netSales).toBe(0);
      expect(JSON.stringify(d.byMethod)).not.toMatch(/gift/i);
    });

    test("TC-2033: cash-out needs an open drawer", async () => {
      gate();
      const r = await gc(owner.session, "POST", "/cash-out", {
        giftCardId: importedCard.id,
        idempotencyKey: randomUUID(),
        expectedAmount: 15,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(409);
      expect(refusal(r)).toMatchObject({
        code: "REGISTER_NOT_OPEN",
        errorCode: "REGISTER_NOT_OPEN",
      });
    });

    test("TC-2050: a cash-out retry replays the original before the drawer and eligibility checks", async () => {
      gate();
      // Plan B contract amendment: replay-before-checks. The drawer is closed and the card reads DEPLETED, yet the key that
      // paid out once still answers that success (200, same transaction).
      const again = await gc<{ data: CashOutResult }>(
        owner.session,
        "POST",
        "/cash-out",
        {
          giftCardId: cashCard.id,
          idempotencyKey: cashOutKey,
          expectedAmount: 25,
        }
      );
      expect(again.status, JSON.stringify(again.data)).toBe(200);
      expect(again.data.data).toMatchObject({
        alreadyExisted: true,
        transactionId: cashOutTransactionId,
        amount: 25,
        balance: 0,
        status: "DEPLETED",
      });
      const card = await details(owner.session, cashCard.code);
      expect(card.data.data.status).toBe("DEPLETED");
    });
  }
);
