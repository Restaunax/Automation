/**
 * api-gift-cards-chain.spec.ts — gift cards across a chain of two locations
 * (TC-2015..2023, plus the chain shell UI TC-2046).
 *
 * RestauNax feat/owner-gift-cards (plan B "API contract", chain routes
 * `/api/gift-cards/groups/:gid/...`): chain settings are edited at chain level
 * only, any location finds the whole chain's cards, the money sits with the
 * location that sold the card (`fundsHolderRestaurantId`) while the sale
 * belongs to the location that took it, settlement names the sibling, a
 * freeze at one location shows at the other's register, and a sibling can't
 * cash out a card whose money another location holds.
 *
 * One fresh owner with two locations, A and B, linked into a throwaway chain.
 * Each has 7% tax, a $12 Burger, a REGISTER device, the owner's PIN and an
 * open $100 drawer. A sells a $50 card for cash; B takes $12.84 of it on an
 * open check ($37.16 left). A stranger tenant S has one restaurant.
 *
 * Gated behind RELEASED_ON_QA.ownerGiftCards: it skips (with the gate's
 * reason) until the owner routes are on the stack, and the setup stops before
 * any money is seeded when they are not.
 *
 *   TC-2015 chain card settings are edited at chain level only.
 *   TC-2016 any location finds the whole chain's cards and says who holds the money.
 *   TC-2017 a card sold at A and spent at B is A's money and B's sale.
 *   TC-2018 chain settlement names the sibling on each side.
 *   TC-2019 the chain view adds up its locations.
 *   TC-2020 nobody outside the chain reaches it.
 *   TC-2021 the chain CSV is the one place the full code appears.
 *   TC-2022 a card frozen at one location shows frozen at another's register.
 *   TC-2023 a sibling can't cash out a card whose money A holds.
 *   TC-2046 (UI) the chain shell shows the chain's cards by location; a
 *           member's settings point to the chain. With the owner UX
 *           follow-up (gated giftCardsOwnerUxDashboard): the chain page
 *           captions where a card was sold, a member page doesn't, and the
 *           member reads selling / cash / printed cards as On/Off text.
 *           The chain page's Chain settlement report renders (formerly
 *           checked on a standalone tenant in TC-2041).
 */
import { randomUUID } from "crypto";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  generateRunId,
  recordGiftCardForCleanup,
} from "../../../utils/testData";
import { loginViaUi } from "../../../utils/auth";
import { createOwnerGiftCardsPage } from "../../../pages/dashboard/owner/OwnerGiftCardsPage";
import { parseCsv } from "../../../utils/csvHelper";
import { localToday, looksLikeKey } from "../../../utils/backOfficeApi";
import { ownerWithRestaurants } from "../../../utils/employerApi";
import {
  cents,
  dataOf,
  isMaskedCode,
  ownerGiftCardCsvRaw,
  ownerGiftCardRaw,
  rollForwardTies,
  sanitizeCode,
  sumMoneyCounts,
  tabletGiftCardRaw,
  usd,
  type Scope,
} from "../../../utils/giftCardOwnerApi";
import {
  probeGiftCardsOwnerUxDashboard,
  probeOwnerGiftCards,
  releasePresent,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  adminCreateChain,
  adminLinkRestaurantToChainRaw,
  adminUnlinkRestaurantFromChainRaw,
  apiLogin,
  closeRegisterSessionPosRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  createTabletDevice,
  createTabletOrderRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  ensureTaxRate,
  getOwnerRestaurants,
  getRestaurantTimeZonePublic,
  openRegisterSessionPos,
  putGiftCardGroupConfigAdminRaw,
  setOwnerPosPin,
  setRestaurantPublishedApi,
  tabletLogin,
  tabletRaw,
  tabletStaffSignIn,
  updateRestaurantSettingsApi,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
/** A chain report row's location id: `{ restaurant: NamedRef, ... }`. */
const locId = (row: Rec): string => String((row.restaurant as Rec).id);

type Register = {
  restaurantId: string;
  deviceId: string;
  tablet: string;
  session: string;
  drawerId: string;
};

test.describe.configure({ mode: "serial" });

test.describe(
  "Owner gift cards — a chain of two locations (API)",
  { tag: ["@owner-gift-cards"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenants)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let owner = "";
    let stranger = "";
    let A = "";
    let B = "";
    let S = "";
    let gid = "";
    let nameA = "";
    let nameB = "";
    let ownerEmail = "";
    let ownerPassword = "";
    let tz = "America/New_York";
    let linked = false;
    /** Owner routes exist on this stack (probed once, in beforeAll). */
    let present = false;
    let card = { id: "", code: "" };
    const regs: Record<"A" | "B", Register> = {
      A: {
        restaurantId: "",
        deviceId: "",
        tablet: "",
        session: "",
        drawerId: "",
      },
      B: {
        restaurantId: "",
        deviceId: "",
        tablet: "",
        session: "",
        drawerId: "",
      },
    };

    const gate = () => requireRelease("ownerGiftCards", present);
    const chain = (): Scope => ({ groupId: gid });
    const at = (id: string): Scope => ({ restaurantId: id });
    const asOwner = (
      scope: Scope,
      method: "GET" | "POST" | "PUT",
      path: string,
      body?: unknown
    ) => ownerGiftCardRaw<Rec>(owner, scope, method, path, body);
    const pos = (
      which: "A" | "B",
      path: string,
      body: Record<string, unknown>
    ) =>
      tabletGiftCardRaw<Rec>(
        regs[which].tablet,
        regs[which].session,
        "POST",
        path,
        body
      );

    /** One location: tax, a $12 Burger, a register with the owner signed in. */
    async function setUpLocation(
      which: "A" | "B",
      restaurantId: string
    ): Promise<{ burgerId: string }> {
      await updateRestaurantSettingsApi(owner, restaurantId, {
        tableServiceEnabled: true,
        acceptingOrders: true,
      });
      await ensureTaxRate(owner, restaurantId, 7);
      await setRestaurantPublishedApi(adminToken, restaurantId, true);
      await ensureBusinessHours(owner, restaurantId);
      const food = await createMenuGroupNamed(owner, `Food ${which} ${runId}`, {
        restaurantId,
      });
      const burger = await createMenuItemFull(owner, food.id, "Burger", 12);
      const device = await createTabletDevice(
        adminToken,
        restaurantId,
        `auto-gcchain-${which.toLowerCase()}-${runId}`
      );
      const tablet = await tabletLogin(device.name, device.code);
      const member = await setOwnerPosPin(owner, restaurantId, "8462");
      const session = await tabletStaffSignIn(tablet, member, "8462");
      const drawerId = await openRegisterSessionPos(tablet, session, 100);
      regs[which] = {
        restaurantId,
        deviceId: device.id,
        tablet,
        session,
        drawerId,
      };
      return { burgerId: burger.id };
    }

    test.beforeAll(async () => {
      test.setTimeout(300_000);
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;

      const tenant = await ownerWithRestaurants(adminToken, runId, {
        count: 2,
        features: [],
      });
      [A, B] = tenant.restaurantIds as [string, string];
      owner = tenant.ownerToken;
      ownerEmail = tenant.email;
      ownerPassword = tenant.password;
      // Probe before spending anything: no owner routes, nothing to seed.
      present = await probeOwnerGiftCards(owner, A);
      if (!present) return;

      const stray = await createSecondOwner(adminToken, `${runId}s`, {
        alwaysFresh: true,
      });
      if (!stray.restaurantId) throw new Error("[gc-chain] no tenant S");
      S = stray.restaurantId;
      stranger = stray.accessToken;

      // The founding store needs a menu (POST /api/admin/chains refuses one
      // without): this group becomes the chain's shared menu when the chain
      // is founded. It stays empty; each location's own "Food" group and
      // Burger are made after, in setUpLocation.
      await createMenuGroupNamed(owner, `Chain menu ${runId}`, {
        restaurantId: A,
      });
      const made = await adminCreateChain(
        adminToken,
        A,
        `Auto GC chain ${runId}`
      );
      gid = made.id;
      const link = await adminLinkRestaurantToChainRaw(adminToken, gid, B);
      if (!link.ok)
        throw new Error(`[gc-chain] link: ${JSON.stringify(link.data)}`);
      linked = true;
      // A fresh login so the owner token reflects the chain membership.
      owner = (await apiLogin(tenant.email, tenant.password)).accessToken;

      // Selling, cash and printed cards are RestauNax's to switch (an
      // owner's PUT drops them since feat/gift-cards-owner-ux): the admin
      // config route turns them on for the chain.
      const cfg = await putGiftCardGroupConfigAdminRaw(adminToken, gid, {
        isEnabled: true,
        allowCashFunding: true,
        allowPhysicalActivation: true,
      });
      if (!cfg.ok)
        throw new Error(`[gc-chain] config: ${JSON.stringify(cfg.data)}`);

      tz = (await getRestaurantTimeZonePublic(A)) || tz;
      const owned = await getOwnerRestaurants(owner);
      const ownedB = owned.find((r) => r.id === B);
      if (!ownedB) throw new Error(`[gc-chain] owner does not list B (${B})`);
      nameB = ownedB.name;
      nameA = owned.find((r) => r.id === A)?.name ?? "";

      await setUpLocation("A", A);
      const atB = await setUpLocation("B", B);

      // A sells a $50 card for cash, printed (TC-1059's body).
      const sold = await pos("A", "/sell", {
        amount: 50,
        tender: "CASH",
        deliveryMethod: "PHYSICAL",
        idempotencyKey: `gcchain-${runId}-sell-50`,
      });
      if (sold.status !== 201)
        throw new Error(`[gc-chain] sell: ${JSON.stringify(sold.data)}`);
      card = {
        id: String(dataOf(sold.data).giftCardId),
        code: String(dataOf(sold.data).code),
      };
      recordGiftCardForCleanup(card.id);

      // B takes $12.84 of it on an open check (TC-1064's pattern).
      const check = await createTabletOrderRaw(regs.B.tablet, regs.B.session, {
        restaurantId: B,
        orderType: "DINE_IN",
        subtotal: 12,
        tax: 0.84,
        tip: 0,
        total: 12.84,
        customerPhone: "",
        orderItems: [
          {
            menuItemId: atB.burgerId,
            menuItemName: "Burger",
            quantity: 1,
            price: 12,
          },
        ],
        openCheck: true,
        tableName: "T3",
        guestCount: 1,
      });
      if (check.status !== 201)
        throw new Error(`[gc-chain] check: ${JSON.stringify(check.data)}`);
      const paid = await tabletRaw<Rec>(
        regs.B.tablet,
        "POST",
        `/orders/${check.data.id}/tab/settle-gift-card`,
        {
          code: card.code,
          amount: 12.84,
          idempotencyKey: `gcchain-${runId}-tab`,
        },
        regs.B.session
      );
      if (paid.status !== 200)
        throw new Error(`[gc-chain] settle: ${JSON.stringify(paid.data)}`);
    });

    test.afterAll(async () => {
      if (!adminToken) return;
      for (const reg of Object.values(regs)) {
        if (reg.deviceId)
          await deactivateTabletDevice(
            adminToken,
            reg.restaurantId,
            reg.deviceId
          ).catch(() => {});
      }
      // There is no DELETE /api/admin/chains endpoint (see chains.spec.ts).
      // The group goes away only when unlinking drops it below two members
      // (auto-dissolve), and the server refuses to unlink an "established"
      // member: published, with real orders, or with gift cards sold. By the
      // end of this file A and B are all three, so both unlinks are expected
      // to be refused and the group "Auto GC chain <runId>" stays on QA with
      // archived members. Try anyway (a run that stopped early may have left
      // them unestablished), and name the leftover so it can be found.
      let dissolved = false;
      if (linked) {
        for (const id of [B, A]) {
          if (dissolved || !id) continue;
          const r = await adminUnlinkRestaurantFromChainRaw(
            adminToken,
            gid,
            id
          ).catch(() => null);
          dissolved = r?.status === 200 && r.data?.dissolved === true;
        }
      }
      if (gid && !dissolved)
        console.warn(
          `[gc-chain] chain group left on QA (no admin delete; members established): "Auto GC chain ${runId}" (${gid})`
        );
      for (const id of [A, B, S]) {
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

    test("TC-2015: settings for chain cards are edited at chain level only", async () => {
      gate();
      const member = await asOwner(at(B), "GET", "/config");
      expect(member.status, JSON.stringify(member.data)).toBe(200);
      expect(dataOf(member.data)).toMatchObject({
        level: "CHAIN",
        editable: false,
      });

      const blocked = await asOwner(at(B), "PUT", "/config", {
        minCustomAmount: 10,
      });
      expect(blocked.status, JSON.stringify(blocked.data)).toBe(403);
      expect(blocked.data.code).toBe("CONFIG_IS_CHAIN_LEVEL");
      expect(looksLikeKey(blocked.data.error), blocked.data.error).toBe(false);

      const group = await asOwner(chain(), "GET", "/config");
      expect(group.status, JSON.stringify(group.data)).toBe(200);
      expect(dataOf(group.data)).toMatchObject({
        level: "CHAIN",
        editable: true,
      });
    });

    test("TC-2016: any location finds the whole chain's cards and says who holds the money", async () => {
      gate();
      const last4 = sanitizeCode(card.code).slice(-4);
      const cardsOf = async (scope: Scope, query: string) => {
        const r = await asOwner(scope, "GET", `/cards${query}`);
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        expect(JSON.stringify(r.data)).not.toContain(card.code);
        return dataOf(r.data).giftCards as Rec[];
      };
      const idsOf = (xs: Rec[]) => xs.map((c) => c.id);

      const fromB = await cardsOf(at(B), `?search=${last4}`);
      const found = fromB.find((c) => c.id === card.id);
      expect(found, JSON.stringify(fromB)).toBeTruthy();
      expect(isMaskedCode(String(found?.displayCode))).toBe(true);
      expect(found?.heldHere).toBe(false);
      expect((found?.heldBy as Rec).id).toBe(A);
      expect((found?.soldAt as Rec).id).toBe(A);

      const heldAtB = await cardsOf(at(B), `?heldHere=true&search=${last4}`);
      expect(idsOf(heldAtB)).not.toContain(card.id);

      const heldAtA = await cardsOf(at(A), `?heldHere=true&search=${last4}`);
      const mine = heldAtA.find((c) => c.id === card.id);
      expect(mine, JSON.stringify(heldAtA)).toBeTruthy();
      expect(mine?.heldHere).toBe(true);

      const all = await cardsOf(chain(), "");
      expect(idsOf(all)).toContain(card.id);
      for (const c of all) expect(c.heldHere, String(c.id)).toBe(false);
    });

    test("TC-2017: a card sold at A and spent at B is A's money and B's sale", async () => {
      gate();
      const today = localToday(tz);
      const activity = await asOwner(
        at(A),
        "GET",
        `/reports/activity?from=${today}&to=${today}`
      );
      expect(activity.status, JSON.stringify(activity.data)).toBe(200);
      const a = dataOf(activity.data);
      expect((a.sold as Rec).posCash).toMatchObject({ amount: 50, count: 1 });
      expect((a.spent as Rec).atOtherLocations).toMatchObject([
        { id: B, name: nameB, amount: 12.84, count: 1 },
      ]);
      expect(((a.spent as Rec).here as Rec).amount).toBe(0);

      const owed = async (scope: Scope) => {
        const r = await asOwner(scope, "GET", "/reports/summary");
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        return dataOf(r.data);
      };
      expect(cents(((await owed(at(A))).owed as Rec).amount)).toBe(3716);
      expect(((await owed(at(B))).owed as Rec).amount).toBe(0);
      const group = await owed(chain());
      const legacy = (group.totals as Rec).legacyPlatformHeld as Rec;
      expect(legacy, JSON.stringify(group)).toBeTruthy();
      expect(legacy.amount).toBe(0);

      const detail = await asOwner(at(A), "GET", `/cards/${card.id}`);
      expect(detail.status, JSON.stringify(detail.data)).toBe(200);
      const spend = (dataOf(detail.data).history as Rec[]).find(
        (h) => (h.location as Rec | undefined)?.id === B
      );
      expect(
        spend,
        `a history row at B: ${JSON.stringify(dataOf(detail.data).history)}`
      ).toBeTruthy();
      expect(JSON.stringify(detail.data)).not.toContain(card.code);
    });

    test("TC-2018: chain settlement names the sibling on each side", async () => {
      gate();
      const settlement = async (id: string) => {
        const r = await asOwner(at(id), "GET", "/reports/settlement");
        expect(r.status, JSON.stringify(r.data)).toBe(200);
        return dataOf(r.data);
      };
      const check = (s: Rec, kind: "OWED" | "EARNED") => {
        const entries = s.entries as Rec[];
        const entry = entries.find((e) => e.kind === kind);
        expect(entry, JSON.stringify(entries)).toBeTruthy();
        // No payout ran mid-test: the balance is the sum of the entries.
        if (!entries.some((e) => e.kind === "PAYOUT_APPLIED"))
          expect(cents(s.balance)).toBe(
            entries.reduce((sum, e) => sum + cents(e.amount), 0)
          );
        return entry as Rec;
      };

      const sa = await settlement(A);
      const owed = check(sa, "OWED");
      expect(owed.amount).toBe(12.84);
      expect((owed.otherLocation as Rec).id).toBe(B);
      expect(isMaskedCode(String((owed.card as Rec).displayCode))).toBe(true);
      expect((sa.totals as Rec).owed).toBe(12.84);

      const sb = await settlement(B);
      const earned = check(sb, "EARNED");
      expect(earned.amount).toBe(-12.84);
      expect((earned.otherLocation as Rec).id).toBe(A);
      expect((sb.totals as Rec).earned).toBe(12.84);
      expect(JSON.stringify([sa, sb])).not.toContain(card.code);
    });

    test("TC-2019: the chain view adds up its locations", async () => {
      gate();
      const today = localToday(tz);
      const get = async (path: string) => {
        const r = await asOwner(chain(), "GET", path);
        expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(200);
        return dataOf(r.data);
      };

      const summary = await get("/reports/summary");
      const rows = summary.byLocation as Rec[];
      expect(rows.map(locId).sort()).toEqual([A, B].sort());
      const owedSum = sumMoneyCounts(
        rows.map((r) => r.owed as { amount: number; count: number })
      );
      expect(cents((summary.totals as Rec & { owed: Rec }).owed.amount)).toBe(
        cents(owedSum.amount)
      );

      const activity = await get(`/reports/activity?from=${today}&to=${today}`);
      const soldSum = sumMoneyCounts(
        (activity.byLocation as Rec[]).map(
          (l) => (l.sold as Rec).total as { amount: number; count: number }
        )
      );
      const soldTotal = ((activity.totals as Rec).sold as Rec).total as Rec & {
        amount: number;
      };
      expect(cents(soldTotal.amount)).toBe(cents(soldSum.amount));
      expect(cents(soldTotal.amount)).toBe(5000);

      const month = today.slice(0, 7);
      const rf = await get(`/reports/roll-forward?month=${month}`);
      type Tie = Parameters<typeof rollForwardTies>[0];
      for (const row of rf.byLocation as Rec[])
        expect(rollForwardTies(row as unknown as Tie), locId(row)).toBe(true);
      expect(rollForwardTies(rf.totals as unknown as Tie)).toBe(true);

      const settlement = await get("/reports/settlement");
      const by = (id: string) =>
        (settlement.byLocation as Rec[]).find((l) => locId(l) === id) as Rec;
      expect((by(A).totals as Rec).owed).toBe(12.84);
      expect((by(B).totals as Rec).earned).toBe(12.84);
    });

    test("TC-2020: nobody outside the chain reaches it", async () => {
      gate();
      for (const path of ["/cards", "/config", "/reports/summary"]) {
        const r = await ownerGiftCardRaw<Rec>(stranger, chain(), "GET", path);
        expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(403);
        expect(r.data.code).toBe("FORBIDDEN");
      }
      const csv = await ownerGiftCardCsvRaw(stranger, chain());
      expect(csv.status, csv.text).toBe(403);
      expect(JSON.parse(csv.text).code).toBe("FORBIDDEN");

      const own = await ownerGiftCardRaw<Rec>(
        stranger,
        at(S),
        "GET",
        `/cards/${card.id}`
      );
      expect(own.status, JSON.stringify(own.data)).toBe(404);
      expect(own.data.code).toBe("CARD_NOT_FOUND");
      const missing = await ownerGiftCardRaw<Rec>(
        stranger,
        at(S),
        "GET",
        `/cards/${randomUUID()}`
      );
      expect(own.data).toEqual(missing.data);
    });

    test("TC-2021: the chain CSV is the one place the full code appears", async () => {
      gate();
      const csv = await ownerGiftCardCsvRaw(owner, chain());
      expect(csv.status, csv.text.slice(0, 300)).toBe(200);
      expect(csv.headers.get("content-disposition") ?? "").toMatch(
        /attachment/i
      );
      const rows = parseCsv(csv.text);
      const row = rows.find((cells) =>
        cells.some((c) => sanitizeCode(c) === card.code.toUpperCase())
      );
      expect(row, "a row carrying the card's full code").toBeTruthy();
      expect((row ?? []).some((c) => cents(c) === 3716)).toBe(true);
    });

    test("TC-2022: a chain card frozen at one location shows frozen at the register of another", async () => {
      gate();
      const freeze = await asOwner(at(B), "POST", `/cards/${card.id}/freeze`, {
        reason: "Reported stolen",
      });
      expect(freeze.status, JSON.stringify(freeze.data)).toBe(200);
      try {
        expect((dataOf(freeze.data).freeze as Rec).origin).toBe("OWNER");

        const lookup = await pos("A", "/lookup", { code: card.code });
        expect(lookup.status, JSON.stringify(lookup.data)).toBe(200);
        expect(dataOf(lookup.data).freeze).toMatchObject({
          reasonText: "Reported stolen",
          canLift: true,
        });
        expect(JSON.stringify(lookup.data)).not.toContain(card.code);

        const details = await pos("A", "/details", { code: card.code });
        expect(details.status, JSON.stringify(details.data)).toBe(200);
        const d = dataOf(details.data);
        expect(d.status).toBe("FROZEN");
        expect((d.cashOut as Rec).refusal).toMatchObject({ code: "FROZEN" });
        expect(JSON.stringify(details.data)).not.toContain(card.code);
      } finally {
        const lift = await asOwner(at(A), "POST", `/cards/${card.id}/unfreeze`);
        expect(lift.status, JSON.stringify(lift.data)).toBe(200);
      }
      const after = await asOwner(at(A), "GET", `/cards/${card.id}`);
      expect(dataOf(after.data).status).toBe("ACTIVE");
    });

    test("TC-2023: a sibling can't cash out a card whose money A holds", async () => {
      gate();
      const details = await pos("B", "/details", { code: card.code });
      expect(details.status, JSON.stringify(details.data)).toBe(200);
      const d = dataOf(details.data);
      expect(d.cashOut).toMatchObject({
        eligible: false,
        refusal: { code: "CASH_OUT_WRONG_HOLDER" },
      });
      expect(looksLikeKey(((d.cashOut as Rec).refusal as Rec).text)).toBe(
        false
      );
      expect((d.heldBy as Rec).id).toBe(A);

      const out = await pos("B", "/cash-out", {
        giftCardId: card.id,
        idempotencyKey: `gcchain-${runId}-cashout`,
        expectedAmount: 37.16,
      });
      expect(out.status, JSON.stringify(out.data)).toBe(409);
      expect(out.data.code).toBe("CASH_OUT_WRONG_HOLDER");
      expect(out.data.errorCode).toBe("CASH_OUT_WRONG_HOLDER");

      // B's drawer: the $100 float and no cash (the $12.84 was gift card).
      const closed = await closeRegisterSessionPosRaw(
        regs.B.tablet,
        regs.B.session,
        { countedCash: 100 }
      );
      expect(closed.status, JSON.stringify(closed.data)).toBe(200);
      expect(closed.data.data).toMatchObject({ expectedCash: 100 });
      regs.B.drawerId = "";
    });

    test("TC-2046: the chain shell shows the chain's cards by location; a member's settings point to the chain", async ({
      browser,
    }) => {
      gate();
      test.setTimeout(120_000);
      const s = await asOwner(chain(), "GET", "/reports/summary");
      expect(s.status, JSON.stringify(s.data)).toBe(200);
      const totals = dataOf(s.data).totals as Rec;

      const { context, page } = await loginViaUi(
        browser,
        ownerEmail,
        ownerPassword
      );
      try {
        const gc = createOwnerGiftCardsPage(page);
        await gc.gotoChain(gid);
        await expect(gc.chainSidebarItem()).toBeVisible({ timeout: 30_000 });
        await expect(gc.byLocationRows()).toHaveCount(2, { timeout: 30_000 });
        await expect(gc.byLocationRow(nameA)).toHaveCount(1);
        await expect(gc.byLocationRow(nameB)).toHaveCount(1);
        await expect(gc.byLocationOwed(nameA)).toHaveText("$37.16");
        await expect(gc.owedFigure()).toHaveText(
          usd(Number((totals.owed as Rec).amount))
        );
        const ux = releasePresent(
          "giftCardsOwnerUxDashboard",
          await probeGiftCardsOwnerUxDashboard()
        );
        const last4 = sanitizeCode(card.code).slice(-4);
        const soldAt = `Sold at ${nameA}`;
        if (ux) {
          // The chain page says where a card was sold, as a caption only.
          await gc.search(last4);
          await expect(gc.rowLocation(card.id)).toHaveText(soldAt, {
            timeout: 15_000,
          });
          await gc.openCard(last4, card.id);
          await expect(gc.drawerSoldAt()).toHaveText(soldAt);
          await expect(gc.drawer()).not.toContainText("Money held by");
          await gc.closeCard();
          // A member's own page shows neither caption.
          await gc.goto(B, "overview");
          await gc.openCard(last4, card.id);
          await expect(gc.rowLocation(card.id)).toHaveCount(0);
          await expect(gc.drawerSoldAt()).toHaveCount(0);
          await gc.closeCard();
        }

        // Chain settlement lives on the chain page (moved here from the
        // standalone TC-2041, which no longer has the report).
        await gc.gotoChain(gid, "reports");
        await gc.openReport("settlement");
        await expect(
          page.getByTestId("gift-cards-report-settlement")
        ).toBeVisible({ timeout: 30_000 });
        const stHint = (await gc.reportHint().innerText()).trim();
        expect(stHint).not.toBe("");
        expect(looksLikeKey(stHint), stHint).toBe(false);

        // A member location reads the chain's settings, read-only, with a
        // way to the chain's page (this owner controls the chain).
        await gc.goto(B, "settings");
        await expect(gc.chainLevelNotice()).toBeVisible({ timeout: 30_000 });
        const notice = (await gc.chainLevelNotice().innerText()).trim();
        expect(looksLikeKey(notice), notice).toBe(false);
        await expect(gc.openChainSettings()).toBeVisible();
        await expect(gc.settingsSwitch("custom")).toBeDisabled();
        for (const key of ["selling", "cash", "physical"] as const) {
          if (!ux) {
            await expect(gc.settingsSwitch(key)).toBeDisabled();
            continue;
          }
          // Set up by RestauNax (all three on in beforeAll): On/Off text,
          // never a switch, for the owner.
          await expect(gc.settingsReadonly(key)).toHaveText("On");
          await expect(gc.settingsSwitch(key)).toHaveCount(0);
        }
        if (ux) await expect(gc.platformHint()).toBeVisible();
        await expect(gc.presetInput()).toHaveCount(0);
        await expect(gc.saveButton()).toHaveCount(0);
      } finally {
        await context.close().catch(() => {});
      }
    });
  }
);
