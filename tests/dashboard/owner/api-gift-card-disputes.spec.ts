/**
 * api-gift-card-disputes.spec.ts — a dispute on a gift card purchase is
 * attributed to the restaurant that holds the card (TC-2047..2049).
 *
 * RestauNax feat/owner-gift-cards (plan A): a dispute on a gift card charge
 * belongs to the restaurant whose Connect account received the charge. It is
 * accrued once to that restaurant's payouts, `Dispute.giftCardId` is set and
 * the card is frozen by the system (FUNDING_DISPUTED, SYSTEM) so the owner
 * cannot lift it. Its money is "on hold", not owed. The owner's dispute
 * payload carries `giftCard: { id, maskedCode }`.
 *
 * Setup: the shared SEED restaurant (`seedRestaurantForCardSales`) and its
 * owner. A card can only be sold by card where the Stripe setup is finished
 * (charges enabled), and the seed is the one QA restaurant that has; a
 * throwaway tenant is refused (TC-2055). A $60 card is bought with
 * `tok_createDispute`; Stripe opens the dispute a few seconds later and QA's
 * own webhook delivers it.
 *
 * Each run leaves one lost $60 chargeback (plus Stripe's dispute fee) accrued
 * to the seed restaurant's QA payouts, and the card stays frozen by the
 * system. That is accepted on QA (Neaj, 2026-11-16). The seed is shared, so
 * the cases assert this run's dispute and card by id, and the summary as a
 * delta, never the seed's totals; the gift card config is put back after. The setup polls the owner's
 * disputes for up to 120 s; if QA never delivers it and E2E_STRIPE_* is set,
 * the real `charge.dispute.created` event is delivered by hand.
 *
 * Gated behind RELEASED_ON_QA.ownerGiftCards: skips with the gate's reason
 * until the owner routes are on the stack, and nothing is bought before that.
 *
 *   TC-2047 a stolen-card gift card purchase lands on the restaurant that holds the card.
 *   TC-2048 the disputed money is on hold, not owed, and only RestauNax lifts it.
 *   TC-2049 the owner's Disputes screen shows the gift card and opens it.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  readRestaurantId,
  recordGiftCardForCleanup,
} from "../../../utils/testData";
import { looksLikeKey } from "../../../utils/backOfficeApi";
import {
  buyGiftCardOnline,
  dataOf,
  isMaskedCode,
  ownerGiftCardRaw,
  rollForwardTies,
  seedRestaurantForCardSales,
} from "../../../utils/giftCardOwnerApi";
import {
  probeOwnerGiftCards,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  fireStripeEvent,
  retrieveIntent,
  stripeTestModeReady,
} from "../../../utils/stripeTestMode";
import { loginViaUi } from "../../../utils/auth";
import { createOwnerGiftCardsPage } from "../../../pages/dashboard/owner/OwnerGiftCardsPage";
import {
  apiLogin,
  apiRequestRaw,
  stripeConfigRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

const POLL_MS = 5_000;
const POLL_LIMIT_MS = 120_000;
const FALLBACK_LIMIT_MS = 30_000;

test.describe.configure({ mode: "serial" });

test.describe(
  "Gift card disputes — attributed to the holder (API + UI)",
  { tag: ["@owner-gift-cards"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD || !OWNER_EMAIL || !OWNER_PASSWORD,
      "ADMIN_* / OWNER_* not set (the card is sold at the seed restaurant)"
    );

    let adminToken = "";
    let owner = "";
    let ownerEmail = "";
    let ownerPassword = "";
    let rid = "";
    /** Owner routes exist on this stack (probed once, in beforeAll). */
    let present = false;
    let card = { id: "", code: "", pi: "" };
    let dispute: Rec = {};
    let restoreSeed: () => Promise<void> = async () => {};
    /** The seed's on-hold money before this run's purchase. */
    let onHoldBefore = { amount: 0, count: 0 };

    const asOwner = (
      method: "GET" | "POST" | "PUT",
      path: string,
      body?: unknown
    ) =>
      ownerGiftCardRaw<Rec>(owner, { restaurantId: rid }, method, path, body);
    const gate = () => requireRelease("ownerGiftCards", present);

    /** What the last poll saw, so a timeout names the real cause. */
    let lastSeen = "no poll yet";
    let failures = 0;

    const findDispute = async (): Promise<Rec | undefined> => {
      const r = await apiRequestRaw<Rec>(
        "GET",
        `/api/disputes/restaurant/${rid}`,
        undefined,
        owner,
        { "X-Restaurant-Id": rid }
      );
      if (r.status !== 200) {
        failures += 1;
        lastSeen = `list answered ${r.status}: ${JSON.stringify(r.data)}`;
        // A persistent 403/5xx is not a missing webhook: stop waiting.
        if (failures >= 3 && (r.status === 403 || r.status >= 500))
          throw new Error(`[gc-dispute] disputes list ${lastSeen}`);
        return undefined;
      }
      failures = 0;
      const rows = (r.data.data ?? []) as Rec[];
      const hit = rows.find((d) => (d.giftCard as Rec | null)?.id === card.id);
      if (!hit)
        lastSeen =
          rows.length === 0
            ? "list is empty (no dispute yet)"
            : `${rows.length} dispute row(s) but none carries giftCard.id ${card.id} (giftCard values: ${JSON.stringify(rows.map((d) => d.giftCard ?? null))})`;
      return hit;
    };

    const pollDispute = async (limitMs: number): Promise<Rec | undefined> => {
      const until = Date.now() + limitMs;
      for (;;) {
        const hit = await findDispute();
        if (hit || Date.now() >= until) return hit;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    };

    test.beforeAll(async () => {
      test.setTimeout(360_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;

      // Probe before touching the seed: no owner routes, nothing changes.
      rid = readRestaurantId();
      owner = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
      present = await probeOwnerGiftCards(owner, rid);
      if (!present) return;
      const seed = await seedRestaurantForCardSales(adminToken, [60]);
      ownerEmail = seed.ownerEmail;
      ownerPassword = seed.ownerPassword;
      restoreSeed = seed.restore;

      const before = await asOwner("GET", "/reports/summary");
      if (before.status !== 200)
        throw new Error(`[gc-dispute] summary: ${JSON.stringify(before.data)}`);
      const held = dataOf(before.data).onHold as Rec;
      onHoldBefore = { amount: Number(held.amount), count: Number(held.count) };

      const pk = String(
        (await stripeConfigRaw()).data.data?.publishableKey ?? ""
      );
      const bought = await buyGiftCardOnline(pk, rid, 60, {
        cardToken: "tok_createDispute",
      });
      card = {
        id: bought.giftCardId,
        code: bought.code,
        pi: bought.paymentIntentId,
      };
      recordGiftCardForCleanup(card.id);

      let found = await pollDispute(POLL_LIMIT_MS);
      if (!found && stripeTestModeReady()) {
        const intent = await retrieveIntent(card.pi);
        const chargeId = String(intent.latest_charge ?? "");
        if (chargeId) {
          await fireStripeEvent("charge.dispute.created", chargeId, {
            match: (o) => o.charge === chargeId,
          });
          found = await pollDispute(FALLBACK_LIMIT_MS);
        }
      }
      if (!found)
        throw new Error(
          `QA did not deliver charge.dispute.created for ${card.pi} within ${POLL_LIMIT_MS / 1000} s (last poll: ${lastSeen})`
        );
      dispute = found;
    });

    test.afterAll(async () => {
      // The seed restaurant stays; only its gift card config is put back.
      // The disputed card stays frozen by the system (the teardown sweep
      // freezes recorded cards anyway).
      await restoreSeed().catch(() => {});
    });

    test.beforeEach(async () => {
      await allure.label("feature", "Owner gift cards");
      await allure.label("severity", "critical");
    });

    test("TC-2047: a stolen-card gift card purchase lands on the restaurant that holds the card", async () => {
      gate();
      expect(dispute.id, "dispute row has an id").toBeTruthy();
      const gc = dispute.giftCard as Rec;
      expect(gc.id).toBe(card.id);
      expect(isMaskedCode(String(gc.maskedCode)), String(gc.maskedCode)).toBe(
        true
      );

      const one = await apiRequestRaw<Rec>(
        "GET",
        `/api/disputes/${dispute.id}`,
        undefined,
        owner,
        { "X-Restaurant-Id": rid }
      );
      expect(one.status, JSON.stringify(one.data)).toBe(200);
      expect(dataOf(one.data).giftCard).toEqual(gc);
      expect(JSON.stringify(one.data)).not.toContain(card.code);

      const detail = await asOwner("GET", `/cards/${card.id}`);
      expect(detail.status, JSON.stringify(detail.data)).toBe(200);
      const d = dataOf(detail.data);
      expect(d.status).toBe("FROZEN");
      expect(d.freeze).toMatchObject({
        origin: "SYSTEM",
        reason: "FUNDING_DISPUTED",
        canLift: false,
      });
      const reasonText = String((d.freeze as Rec).reasonText ?? "");
      expect(reasonText).not.toBe("");
      expect(reasonText).not.toBe("FUNDING_DISPUTED");
      expect(looksLikeKey(reasonText), reasonText).toBe(false);
      expect(JSON.stringify(detail.data)).not.toContain(card.code);
    });

    test("TC-2048: the disputed money is on hold, not owed, and only RestauNax lifts it", async () => {
      gate();
      const s = await asOwner("GET", "/reports/summary");
      expect(s.status, JSON.stringify(s.data)).toBe(200);
      const sum = dataOf(s.data);
      // The seed is shared: this run's $60 joined what was on hold (an
      // overlapping run's dispute can add more).
      const held = sum.onHold as Rec;
      expect(Number(held.amount) - onHoldBefore.amount).toBeGreaterThanOrEqual(
        60
      );
      expect(Number(held.count) - onHoldBefore.count).toBeGreaterThanOrEqual(1);
      // Frozen by the system: held, not spendable.
      const card1 = dataOf((await asOwner("GET", `/cards/${card.id}`)).data);
      expect(card1.status).toBe("FROZEN");

      const lift = await asOwner("POST", `/cards/${card.id}/unfreeze`);
      expect(lift.status, JSON.stringify(lift.data)).toBe(403);
      expect(lift.data.code).toBe("FREEZE_NOT_LIFTABLE");
      expect(
        looksLikeKey(String(lift.data.error)),
        String(lift.data.error)
      ).toBe(false);
      const after = await asOwner("GET", `/cards/${card.id}`);
      expect(dataOf(after.data).status).toBe("FROZEN");

      // A freeze moves no money: the books still tie. This is a whole-seed
      // check (every card at the seed, not just this run's), which holds
      // whatever else is sold there, since the roll-forward ties by
      // construction rather than to this run's numbers.
      // No month: the backend defaults to the restaurant's local month.
      const rf = await asOwner("GET", "/reports/roll-forward");
      expect(rf.status, JSON.stringify(rf.data)).toBe(200);
      expect(
        rollForwardTies(
          dataOf(rf.data) as Parameters<typeof rollForwardTies>[0]
        )
      ).toBe(true);
    });

    test("TC-2049: the owner's Disputes screen shows the gift card and opens it", async ({
      browser,
    }) => {
      gate();
      test.setTimeout(120_000);
      const { context, page } = await loginViaUi(
        browser,
        ownerEmail,
        ownerPassword
      );
      try {
        // The portal's Billing → Chargebacks: each dispute is a card (no rows,
        // no detail dialog); a gift card dispute names the masked card and,
        // in the portal, opens it in the Gift cards drawer.
        const gc = createOwnerGiftCardsPage(page);
        const masked = String((dispute.giftCard as Rec).maskedCode);
        const last4 = masked.slice(-4);
        await gc.gotoDisputes(rid);
        const disputeCard = gc.disputeCard(masked);
        await expect(disputeCard).toBeVisible({ timeout: 30_000 });
        await expect(disputeCard).toContainText("$60.00");
        await expect(disputeCard).not.toContainText(/order\s*#/i);
        // The server says the card is frozen: the "we froze it" line shows.
        await expect(disputeCard).toContainText(
          "We froze this card so its balance can't be spent while the bank decides."
        );
        expect(await page.content()).not.toContain(card.code);

        await gc.disputeOpenCard(masked).click();
        await expect(page).toHaveURL(/[?&]tab=gift-cards(&|$)/);
        await expect(page).toHaveURL(new RegExp(`[?&]card=${card.id}(&|$)`));
        await expect(gc.drawerCode()).toContainText(last4, { timeout: 15_000 });
        await expect(gc.freezeBanner()).toBeVisible();
        await expect(gc.unfreezeButton()).toBeHidden();
        await expect(gc.unfreezeBlocked()).toHaveText(
          "The bank flagged the payment that bought this card. RestauNax lifts this hold if the bank sides with you."
        );
      } finally {
        await context.close();
      }
    });
  }
);
