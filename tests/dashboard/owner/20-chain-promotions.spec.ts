/**
 * 20-chain-promotions.spec.ts — chain-scoped Promotions in the owner portal
 * (replaces 18-chain-deals; spec: restaunax docs/features/PROMOTIONS.md →
 * "Chain behaviour" and "Chain saves warn first").
 *
 * The chain shell (`/chain/:groupId/restaurantManagement?tab=promotions`) lists
 * the chain's own promotions, creates them behind the "This will affect all N
 * locations" confirm, and every member location's Promotions section is
 * disabled ("Managed at chain level") while its automated marketing page still
 * opens. The chain-deal API contract (shared schedule validation, per-location
 * schedule-check) and the schedule section's chain wording keep their old ids
 * (TC-523 / TC-533 / TC-534).
 *
 * Uses the persistent "Automation Chain" fixture (globalSetup →
 * ensureAutomationChain) and skips with a reason when it isn't available.
 * A chain promotion is ONE row owned by the chain group, visible at every
 * member: deleting that row (DELETE /api/coupons/:id or /api/deals/:id, which
 * the chain owner controls) removes it everywhere, so each test's `finally`
 * deletes by AUTO name from the chain list and no member copy can be left.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerPromotionsPage } from "../../../pages/dashboard/owner/OwnerPromotionsPage";
import { createOwnerCreatePromotionPage } from "../../../pages/dashboard/owner/OwnerCreatePromotionPage";
import { createOwnerMarketingAutomationsPage } from "../../../pages/dashboard/owner/OwnerMarketingAutomationsPage";
import {
  readSharedState,
  generateRunId,
  generateCouponCode,
} from "../../../utils/testData";
import { requireScheduling } from "../../../utils/dealScheduleGate";
import {
  DAY_NAMES,
  dayNameOfKey,
  localDateKey,
  shortDayEn,
  type DayName,
} from "../../../utils/dealSchedule";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createChainDealRaw,
  bulkCreateChainDealsRaw,
  getChainDealScheduleCheckRaw,
  getBusinessHoursRaw,
  setBusinessHoursApi,
  getRestaurantTimeZonePublic,
  deleteDealApi,
  type BusinessHoursRow,
  type ApiMenuItem,
} from "../../../utils/apiHelper";
import {
  listChainPromotions,
  listPromotions,
} from "../../../utils/promotionsApi";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Owner — Chain promotions", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  let token = "";
  let chainGroupId = "";
  let locA = "";
  let locB = "";
  const createdDealIds: string[] = [];

  const promoName = (label: string) => `AUTO Chain ${label} ${runId}`;
  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  const skipWithoutChain = () =>
    test.skip(
      !chainGroupId,
      "Automation Chain fixture not available (globalSetup could not build it — needs ADMIN creds)"
    );

  /**
   * Deletes every chain promotion titled `name`. Never throws (so one failed
   * cleanup can't skip the next) but reports a refused delete.
   */
  const cleanup = async (name: string) => {
    try {
      const t = await freshToken();
      const rows = (await listChainPromotions(t, chainGroupId)).filter(
        (r) => r.name === name
      );
      for (const r of rows) {
        const res = await apiRequestRaw(
          "DELETE",
          r.source === "COUPON" ? `/api/coupons/${r.id}` : `/api/deals/${r.id}`,
          undefined,
          t
        );
        if (!res.ok) {
          console.warn(
            `[20-chain-promotions] cleanup: deleting ${r.source} ${r.id} (${name}) → ${res.status} ${JSON.stringify(res.data)}`
          );
        }
      }
    } catch (err) {
      console.warn(`[20-chain-promotions] cleanup of "${name}" failed:`, err);
    }
  };

  test.beforeAll(async () => {
    const state = readSharedState();
    chainGroupId = state.chainGroupId ?? "";
    locA = state.chainLocationAId ?? "";
    locB = state.chainLocationBId ?? "";
    if (chainGroupId) token = await freshToken();
  });

  test.afterAll(async () => {
    if (!chainGroupId) return;
    const t = await freshToken().catch(() => token);
    for (const id of createdDealIds) await deleteDealApi(t, id).catch(() => {});
    // Backstop: anything of this run still on the chain list.
    const left = await listChainPromotions(t, chainGroupId).catch(() => []);
    for (const r of left.filter((x) => x.name.includes(runId)))
      await cleanup(r.name);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
    if (token) token = await freshToken();
  });

  test("TC-833: the chain shell's Promotions tab lists the chain's promotions, scoped to the chain", async ({
    ownerPage,
  }) => {
    skipWithoutChain();
    await allure.description(
      "/chain/:gid/restaurantManagement?tab=promotions renders the chain's own list (GET /api/chains/:gid/promotions). " +
        "A chain promotion seeded through the API is a row there with its code and status, and the create page on the " +
        "chain shell says 'Applies to all N locations of <chain>'. The member's restaurant list API carries it too " +
        "(chain rows apply there)."
    );
    const name = promoName("Listed");
    const code = `AUTOCH${runId.replace(/\W/g, "").slice(-8).toUpperCase()}`;
    const promos = createOwnerPromotionsPage(ownerPage);
    try {
      const res = await apiRequestRaw<{ coupon?: { id: string } }>(
        "POST",
        `/api/chains/${chainGroupId}/coupons`,
        {
          description: name,
          code,
          type: "PERCENTAGE",
          value: 10,
          applyMode: "CODE",
          status: "ACTIVE",
          startDate: new Date(Date.now() - 86_400_000).toISOString(),
          endDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        },
        token
      );
      expect(res.status, JSON.stringify(res.data)).toBe(201);

      await promos.gotoChain(chainGroupId);
      await promos.expectRow(name);
      await promos.expectRowStatus(name, "Live");
      await promos.expectRowCode(name, code);

      const server = (await listChainPromotions(token, chainGroupId)).find(
        (r) => r.name === name
      );
      expect(server?.code).toBe(code);

      await allure.step("the chain create page names its reach", async () => {
        await promos.clickCreate();
        await expect(
          createOwnerCreatePromotionPage(ownerPage).chainScopeLine()
        ).toContainText(/Applies to all [2-9]\d* locations of /);
      });

      await allure.step(
        "the member's own list API carries it too",
        async () => {
          // Chain rows apply at every member, so the restaurant list API
          // includes them (the member UI never opens that list — TC-835).
          const own = await listPromotions(token, locA);
          expect(own.some((r) => r.name === name)).toBe(true);
        }
      );
    } finally {
      await cleanup(name);
    }
  });

  test("TC-834: creating a chain promotion asks 'This will affect all N locations', and Continue saves it for the chain", async ({
    ownerPage,
  }) => {
    skipWithoutChain();
    await allure.description(
      "Chain shell → Create promotion → Money off the order, named, 10% off, code only → Turn on opens 'Heads up — chain-wide change' " +
        "with 'create a promotion … This will affect all N locations in your chain.' (N = the chain's member count); " +
        "Continue → back on the list with the row Live, and GET /api/chains/:gid/promotions has it."
    );
    const name = promoName("Created");
    const promos = createOwnerPromotionsPage(ownerPage);
    const create = createOwnerCreatePromotionPage(ownerPage);
    try {
      await promos.gotoChain(chainGroupId);
      // The confirm is suppressed for the rest of a browser session after
      // "Don't ask again"; start clean.
      await ownerPage.evaluate(() => {
        for (const k of Object.keys(sessionStorage))
          if (k.startsWith("restaunax:fanOutConfirm"))
            sessionStorage.removeItem(k);
      });
      await promos.clickCreate();
      await create.pickCard("Money off the order");
      await create.setAmount("Percentage off", "10");
      await create.setHowCustomersGetIt("Only with a code");
      await create.setName(name);
      await create.setCode(generateCouponCode());
      await ownerPage
        .getByRole("button", { name: "Turn on", exact: true })
        .click();

      const dialog = ownerPage
        .getByRole("dialog")
        .filter({ hasText: "Heads up — chain-wide change" });
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await expect(dialog).toContainText(
        /You're about to create a promotion\. This will affect all \d+ locations in your chain\./
      );
      const members = Number(
        /all (\d+) locations/.exec((await dialog.textContent()) ?? "")?.[1]
      );
      expect(members).toBeGreaterThanOrEqual(2);

      await allure.step("Cancel leaves nothing behind", async () => {
        await promos.cancelDialog();
        await expect(
          (await listChainPromotions(token, chainGroupId)).some(
            (r) => r.name === name
          )
        ).toBe(false);
      });

      await ownerPage
        .getByRole("button", { name: "Turn on", exact: true })
        .click();
      await create.settle();
      await create.expectSaved();
      await promos.showAllRows();
      await promos.expectRow(name);
      await promos.expectRowStatus(name, "Live");

      const server = (await listChainPromotions(token, chainGroupId)).find(
        (r) => r.name === name
      );
      expect(server, "chain list has the new promotion").toBeTruthy();
      expect(server?.status).toBe("ACTIVE");
    } finally {
      await cleanup(name);
    }
  });

  test("TC-835: a member location's Promotions section is disabled — managed at chain level — while its automated marketing still opens", async ({
    ownerPage,
  }) => {
    skipWithoutChain();
    await allure.description(
      "Location A (a chain member): the Promotions entry in the sidebar is disabled; ?tab=promotions (and create-promotion) " +
        "show 'Managed at chain level' instead of the page; ?tab=marketing-automations still opens 'Automated Marketing'."
    );
    const promos = createOwnerPromotionsPage(ownerPage);
    await promos.gotoLegacyTab(locA, "promotions");
    await promos.expectSectionDisabled();
    await expect(
      ownerPage.getByRole("heading", { name: "Managed at chain level" })
    ).toBeVisible();
    await expect(promos.heading()).toHaveCount(0);

    await allure.step("the sidebar entry is disabled", async () => {
      await expect(
        ownerPage
          .locator(".MuiDrawer-paper")
          .first()
          .getByRole("button", { name: "Promotions", disabled: true })
      ).toBeVisible({ timeout: 15_000 });
    });

    await allure.step(
      "a direct create link is refused the same way",
      async () => {
        await promos.gotoLegacyTab(locA, "create-promotion");
        await promos.expectSectionDisabled();
      }
    );

    await allure.step("automated marketing still opens", async () => {
      await createOwnerMarketingAutomationsPage(ownerPage).goto(locA);
    });
  });

  // ── Chain deal API + schedule wording (kept ids; deals are still a chain
  // promotion type, the Deals pages are gone) ───────────────────────────────
  test.describe("schedule", () => {
    let adminToken = "";
    let sharedGroupId = "";
    let s1: ApiMenuItem;
    let s2: ApiMenuItem;
    let tzA = "";
    let closedDay: DayName = "SUNDAY";

    test.beforeAll(async () => {
      if (!chainGroupId) return;
      if (ADMIN_EMAIL && ADMIN_PASSWORD)
        adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      tzA = await getRestaurantTimeZonePublic(locA);
      if (!tzA) return;
      closedDay = dayNameOfKey(
        localDateKey((await getRestaurantTimeZonePublic(locB)) || tzA, 3)
      );
      const t = await freshToken();
      sharedGroupId = (
        await createMenuGroupNamed(t, `Automation Chain Promos ${runId}`, {
          groupId: chainGroupId,
        })
      ).id;
      s1 = await createMenuItemFull(
        t,
        sharedGroupId,
        `Chain Promo Pizza ${runId}`,
        9
      );
      s2 = await createMenuItemFull(
        t,
        sharedGroupId,
        `Chain Promo Soda ${runId}`,
        6
      );
    });

    test.afterAll(async () => {
      if (!chainGroupId) return;
      const t = await freshToken().catch(() => token);
      if (adminToken)
        for (const it of [s1, s2].filter(Boolean))
          await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
      if (sharedGroupId)
        await deleteTestMenuGroup(t, sharedGroupId).catch(() => {});
    });

    /**
     * Run `body` with location B closed on `closedDay`; B's exact original
     * rows are restored in finally.
     */
    const withClosedDayAtB = async (body: () => Promise<void>) => {
      const t = await freshToken();
      const originalB =
        (await getBusinessHoursRaw(t, locB)).data.businessHours ?? [];
      const base: BusinessHoursRow[] = originalB.length
        ? originalB
        : DAY_NAMES.map((day) => ({
            day,
            openingTime: null,
            closingTime: null,
            isClosed: false,
            is24Hours: true,
          }));
      await setBusinessHoursApi(
        t,
        locB,
        base.map((r) =>
          r.day === closedDay
            ? {
                day: r.day,
                openingTime: null,
                closingTime: null,
                isClosed: true,
                is24Hours: false,
              }
            : r
        )
      );
      try {
        await body();
      } finally {
        await setBusinessHoursApi(await freshToken(), locB, originalB);
      }
    };

    test.beforeEach(() => {
      skipWithoutChain();
      requireScheduling("backend", Boolean(tzA));
    });

    test("TC-523: chain create and chain bulk create run the shared schedule validation", async () => {
      const items = [
        { menuItemId: s1.id, quantity: 1, itemName: s1.name, itemPrice: 9 },
        { menuItemId: s2.id, quantity: 1, itemName: s2.name, itemPrice: 6 },
      ];
      const same = await createChainDealRaw(token, chainGroupId, {
        name: promoName("SameTime"),
        dealPrice: 12,
        items,
        validTimeStart: "15:00",
        validTimeEnd: "15:00",
      });
      if (same.data?.deal?.id) createdDealIds.push(same.data.deal.id);
      expect(same.status, JSON.stringify(same.data)).toBe(400);
      expect(same.data.message).toBe(
        "The start and end time can't be the same."
      );
      const bulk = await bulkCreateChainDealsRaw(token, chainGroupId, [
        {
          name: promoName("BulkBad"),
          dealPrice: 12,
          items,
          occasion: "Birthday",
        },
      ]);
      for (const d of bulk.data.deals ?? []) createdDealIds.push(d.id);
      expect(bulk.status, JSON.stringify(bulk.data)).toBe(400);
      expect(bulk.data.message).toBe(
        "Choose an option from the list for audience, meal type and occasion."
      );
    });

    test("TC-534: chain schedule-check returns one warning per location that is closed on a chosen day — named by location — and none for days every location is open", async () => {
      await withClosedDayAtB(async () => {
        const state = readSharedState();
        const res = await getChainDealScheduleCheckRaw(token, chainGroupId, {
          validDays: [closedDay],
        });
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        const data = res.data.data!;
        expect(data.timeZone).toBe(tzA);
        expect(data.warnings).toHaveLength(1);
        expect(data.warnings[0]).toMatchObject({
          restaurantId: locB,
          restaurantName: state.chainLocationBName,
        });
        expect(data.warnings[0]!.message).toContain(shortDayEn(closedDay));
        const otherDay = DAY_NAMES.find((d) => d !== closedDay)!;
        const quiet = await getChainDealScheduleCheckRaw(token, chainGroupId, {
          validDays: [otherDay],
          validTimeStart: "20:00",
          validTimeEnd: "23:00",
        });
        expect(quiet.data.data?.warnings).toEqual([]);
      });
    });

    test("TC-533: in the chain shell the promotion form's When? card warns, by location name only, when a chosen day is closed at one location", async ({
      ownerPage,
    }) => {
      await withClosedDayAtB(async () => {
        const state = readSharedState();
        const promos = createOwnerPromotionsPage(ownerPage);
        const create = createOwnerCreatePromotionPage(ownerPage);
        await promos.gotoChain(chainGroupId);
        await promos.clickCreate();
        await create.pickCard("Money off the order");
        await create.openRule("When?");
        await create.scheduleChip("lunch").click();
        const [checkRes] = await Promise.all([
          create.waitForScheduleCheck((url) =>
            url.includes(`validDays=${closedDay}`)
          ),
          create.dayChip(closedDay).click(),
        ]);
        expect(checkRes.status()).toBe(200);
        await expect(create.hoursWarning()).toBeVisible();
        await expect(create.hoursWarning()).toContainText(
          `${state.chainLocationBName ?? ""}:`
        );
        await expect(create.hoursWarning()).not.toContainText(
          state.chainLocationAName ?? ""
        );
        await create.cancel();
      });
    });
  });
});
