/**
 * 25-gift-card-care.spec.ts — the register finds a gift card, honours who may
 * sell / manage cards, and cashes a balance out (TC-2024..2033, TC-2050).
 *
 * RestauNax feat/owner-gift-cards (plan B "API contract" + "Contract
 * amendments"). No browser: the POS is played through its own API. A per-run
 * throwaway restaurant (Stripe TEST, gift cards on with cash + physical
 * activation, a REGISTER device) with four people: the owner (MANAGER, PIN
 * 8462), Dee (STAFF), Rae (STAFF without SELL_GIFT_CARDS) and Sam (SHIFT_LEAD
 * granted MANAGE_GIFT_CARDS). Cards: a $25 cash-sold card, a $40 cash-sold
 * card emailed to a recipient and a $15 imported card. A stranger tenant
 * holds one seeded card.
 *
 * The drawer is the owner's: opening it assigns it to whoever is signed in,
 * and a drawer only takes cash for the person it belongs to (RestauNax
 * `assertDrawerOperableBy`; a manager's PIN is no substitute). So every cash
 * sale that goes through is the owner's, and a cashier who MAY sell proves it
 * by getting past the permission check to that drawer refusal (403
 * STAFF_DRAWER_OWNER_PIN_REQUIRED) with no money moved (TC-2026).
 *
 * Nothing here is sold BY CARD. The tenant has only the QA dummy Stripe
 * onboarding (charges not enabled), and since RestauNax
 * feat/gift-cards-owner-ux such a restaurant may not sell a card by card:
 * TC-2026 asserts that refusal at the register (gated giftCardsOwnerUx). The
 * "card-funded today waits 30 days to cash out" case (CASH_OUT_TOO_SOON) needs
 * a card-funded card at a register of a restaurant that can take charges; on
 * QA that is only the shared seed restaurant, so it is not covered here.
 *
 * Gated behind RELEASED_ON_QA.ownerGiftCards: the setup probes the owner
 * routes right after the tenant exists and stops before seeding when they
 * are absent, and every test skips with the gate's reason.
 *
 *   TC-2024 any signed-in staff member finds a card; unknown and foreign codes answer the same 404.
 *   TC-2025 the old lookup still answers what old registers read, plus `freeze`.
 *   TC-2026 a cashier who may not sell is stopped before any money moves; an
 *           unfinished Stripe setup refuses a card sale (409); one who may sell
 *           is stopped only by the drawer not being theirs.
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
import { looksLikeKey } from "../../utils/backOfficeApi";
import {
  isMaskedCode,
  ownerGiftCardRaw,
  tabletGiftCardRaw,
} from "../../utils/giftCardOwnerApi";
import {
  probeGiftCardsOwnerUx,
  probeOwnerGiftCards,
  releasePresent,
  requireRelease,
} from "../../utils/releaseGate";
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
  ownerStaffRaw,
  putGiftCardConfigAdminRaw,
  seedFundedGiftCard,
  setOwnerPosPin,
  setRestaurantPublishedApi,
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
    const emailRecipient = `auto-gc-care-${runId}@${EMAIL_DOMAIN}`;
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
    /** `label` is the owner as card history names staff ("First L."). */
    const owner = { id: "", pin: "8462", session: "", label: "" };
    const dee = { id: "", pin: "4826", session: "" };
    const rae = { id: "", pin: "5938", session: "" };
    const sam = { id: "", pin: "7261", session: "" };
    let cashCard = { id: "", code: "" };
    let emailCard = { id: "", code: "" };
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
        for (const code of [cashCard.code, emailCard.code, importedCard.code])
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
      // The owner's staff row, for the name card history shows (TC-2024).
      const staff = await ownerStaffRaw(ownerToken, rid, "GET");
      const row = (
        (staff.data.data ?? []) as {
          id: string;
          firstName?: string;
          lastName?: string;
        }[]
      ).find((s) => s.id === ownerMember);
      if (!row?.firstName)
        throw new Error(
          `[gc-care] owner staff row: ${JSON.stringify(staff.data)}`
        );
      const last = row.lastName?.trim();
      owner.label = last ? `${row.firstName} ${last[0]}.` : row.firstName;

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
      // The drawer is the owner's from here on (see the header).
      sessionId = await openRegisterSessionPos(tablet, owner.session, 100);

      // cashCard: the owner sells $25 cash, print-only.
      const sold = await sellCash(owner.session, 25);
      expect(sold.status, JSON.stringify(sold.data)).toBe(201);
      cashCard = { id: sold.data.data.giftCardId, code: sold.data.data.code };
      recordGiftCardForCleanup(cashCard.id);

      // emailCard: the owner sells $40 cash, emailed to a recipient.
      const emailed = await sellCash(owner.session, 40, {
        deliveryMethod: "EMAIL",
        recipientEmail: emailRecipient,
      });
      expect(emailed.status, JSON.stringify(emailed.data)).toBe(201);
      emailCard = {
        id: emailed.data.data.giftCardId,
        code: emailed.data.data.code,
      };
      recordGiftCardForCleanup(emailCard.id);

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
        performedBy: owner.label,
      });
      expect(looksLikeKey(d.statusText)).toBe(false);
      expect(looksLikeKey(d.history[0]?.label)).toBe(false);
      expect(JSON.stringify(r.data)).not.toContain(cashCard.code);

      const web = await details(dee.session, emailCard.code);
      expect(web.status, JSON.stringify(web.data)).toBe(200);
      expect(web.data.data.recipient?.emailMasked).toMatch(MASKED_EMAIL);
      expect(JSON.stringify(web.data)).not.toContain(emailRecipient);

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

    test("TC-2026: a cashier who may not sell is stopped before any money moves; one who may is stopped only by the drawer not being theirs", async () => {
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

      // On the new backend a restaurant whose Stripe setup is unfinished
      // can't sell a new card by card at all: past the permission check, the
      // intent is refused with 409 before any money moves (the old backend
      // kept such money on the platform and answered 200).
      const ux = releasePresent(
        "giftCardsOwnerUx",
        await probeGiftCardsOwnerUx(ownerToken, rid)
      );
      const expectIntent = (r: {
        status: number;
        data: { clientSecret?: string; code?: string };
      }) => {
        if (ux) {
          expect(r.status, JSON.stringify(r.data)).toBe(409);
          expect(r.data.code).toBe("GIFT_CARD_HOLDER_CANNOT_RECEIVE");
          expect(r.data.clientSecret).toBeUndefined();
        } else {
          expect(r.status, JSON.stringify(r.data)).toBe(200);
          expect(r.data.clientSecret).toMatch(/_secret_/);
        }
      };

      // A manager's PIN approves it for her (no 403 any more).
      const raeIntentApproved = await tabletRaw<{
        clientSecret?: string;
        code?: string;
      }>(
        tablet,
        "POST",
        "/terminal/create-gift-card-payment-intent",
        { ...intentBody, ...approval() },
        rae.session
      );
      expectIntent(raeIntentApproved);

      // No session header (kiosk, old build): no permission check, same
      // answer. An uncaptured intent expires on its own.
      const kiosk = await tabletRaw<{ clientSecret?: string; code?: string }>(
        tablet,
        "POST",
        "/terminal/create-gift-card-payment-intent",
        intentBody
      );
      expectIntent(kiosk);

      // Rae with a manager's PIN, and Dee on her default STAFF rights, MAY
      // sell: both get past the permission check. What stops their cash sale
      // is the drawer, which is the owner's (a drawer only takes cash for the
      // person it belongs to, and a manager's PIN is no substitute). Card is
      // refused for this tenant (above), so that refusal is the proof.
      for (const [who, attempt] of [
        [
          "Rae with a manager's PIN",
          () => sellCash(rae.session, 20, approval()),
        ],
        ["Dee", () => sellCash(dee.session, 20)],
      ] as const) {
        const r = await attempt();
        expect(r.status, `${who}: ${JSON.stringify(r.data)}`).toBe(403);
        const body = r.data as unknown as Refusal;
        expect(body.errorCode, who).toBe("STAFF_DRAWER_OWNER_PIN_REQUIRED");
        expect(body.capability, who).toBeUndefined();
      }
      // Refused before any money moved.
      expect(await loads()).toEqual(loadsBefore);
      expect((await drawer()).expectedCash).toBe(expectedBefore);

      // The owner, whose drawer it is, makes those two $20 sales.
      for (let i = 0; i < 2; i += 1) {
        const sold = await sellCash(owner.session, 20);
        expect(sold.status, JSON.stringify(sold.data)).toBe(201);
        recordGiftCardForCleanup(sold.data.data.giftCardId);
      }
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

      // The ledger names the manager whose PIN approved Dee's unfreeze, and
      // names no approver for Sam, who froze on his own grant. The note is
      // read from the admin movement ledger (masked codes): owner and tablet
      // history rows carry no note.
      const ledger = await apiRequestRaw<{
        data: {
          transactions: { giftCardId: string; note: string | null }[];
        };
      }>(
        "GET",
        `/api/admin/gift-cards/transactions?restaurantId=${rid}&limit=100`,
        undefined,
        adminToken
      );
      expect(ledger.status, JSON.stringify(ledger.data)).toBe(200);
      const notes = ledger.data.data.transactions
        .filter((t) => t.giftCardId === cashCard.id)
        .map((t) => t.note ?? "");
      const unfrozenNote = notes.find((n) => n.startsWith("Card unfrozen"));
      const frozenNote = notes.find((n) => n.startsWith("Card frozen"));
      expect(unfrozenNote, notes.join(" | ")).toContain(
        `(approved by staff ${owner.id})`
      );
      expect(frozenNote, notes.join(" | ")).toBeTruthy();
      expect(frozenNote).not.toContain("approved by");
    });

    test("TC-2028: resend needs selling rights; changing the recipient needs managing rights", async () => {
      gate();
      const resend = await gc<{ data: { sentTo: string } }>(
        dee.session,
        "POST",
        `/${emailCard.id}/resend`,
        {}
      );
      expect(resend.status, JSON.stringify(resend.data)).toBe(200);
      expect(resend.data.data.sentTo).toMatch(MASKED_EMAIL);

      const byDee = await gc(dee.session, "PUT", `/${emailCard.id}/recipient`, {
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
        `/${emailCard.id}/recipient`,
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
    });

    test("TC-2031: the drawer expects the cash that left", async () => {
      gate();
      // Cash sales, all by the owner (it is the owner's drawer): 25, 40
      // (emailed), 20 and 20; cash-out 25. Rae's and Dee's refused attempts
      // added nothing.
      const live = await drawer();
      expect(live.expectedCash).toBe(180);

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

      // Count the drawer out: 100 + 25 + 40 + 20 + 20 - 25 = 180, nothing over.
      const closed = await closeRegisterSessionPosRaw(tablet, owner.session, {
        countedCash: 180,
      });
      expect(closed.status, JSON.stringify(closed.data)).toBe(200);
      expect(closed.data.data).toMatchObject({
        expectedCash: 180,
        countedCash: 180,
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
        cash: { amount: 105, count: 4 },
        card: { amount: 0, count: 0 },
        total: { amount: 105, count: 4 },
        voided: { amount: 0, count: 0 },
        net: 105,
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
