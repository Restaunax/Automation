/**
 * 23-tip-waterfall-ui.spec.ts — the tip-out waterfall on the dashboard
 * (P6, restaunax #924) (TC-677..679).
 *
 * Browser. A per-run throwaway owner (loginViaUi) with TIP_MANAGEMENT, the
 * restaurant moved to a zone where it is about 16:00, jobs Server /
 * Bartender / Busser, and one finished day: Ana (Server, $300.00 cash tip),
 * Cal (Bartender), Dee (Busser) on shift.
 *   - Tip policy: the "Waterfall" preset fills both rules, the flow shows
 *     the order, the live example shows dollars, Save stores it;
 *   - Tips: the Gave / Received columns and "Where the tip-outs went";
 *   - at 390 px the Tips tab shows people as cards and fits the screen.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  payrollRaw,
  tipsRaw,
  tabletRaw,
  updateRestaurantSettingsApi,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  openRegisterSessionPos,
  createTabletOrderRaw,
  settleTabCashRaw,
  restaurantBasicInfoRaw,
  zoneAtMidday,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const ZONE = zoneAtMidday(new Date(), 16);
const minutesAgo = (m: number) =>
  new Date(Math.floor(Date.now() / 60_000) * 60_000 - m * 60_000).toISOString();

type Rec = Record<string, LooseJson>;

test.describe.configure({ mode: "serial" });

test.describe("Owner — tip-out waterfall (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const openStaff = async (staffTab: string) => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=staff&staffTab=${staffTab}`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page().getByRole("tab").first()).toBeVisible({
      timeout: 20_000,
    });
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[tip-waterfall-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await restaurantBasicInfoRaw(ownerToken, restaurantId, { timezone: ZONE });
    await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      true
    );
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    const group = (
      await createMenuGroupNamed(ownerToken, `Food ${runId}`, { restaurantId })
    ).id;
    const item = await createMenuItemFull(
      ownerToken,
      group,
      `Burger ${runId}`,
      10
    );
    const job = async (name: string) =>
      String(
        (
          await createStaffJobRaw(ownerToken, restaurantId, {
            name: `${name} ${runId}`,
            defaultHourlyRateCents: 1000,
            isTipped: true,
          })
        ).data.data?.id
      );
    const server = await job("Server");
    const bar = await job("Bartender");
    const busser = await job("Busser");

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-twui-${runId}`
    );
    deviceId = device.id;
    const tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    const ownerSession = await tabletStaffSignIn(tablet, ownerMember, "8462");
    const person = async (
      first: string,
      pin: string,
      jobId: string,
      hours: number
    ) => {
      const r = await tabletRaw<Rec>(
        tablet,
        "POST",
        "/staff/manage",
        { firstName: first, lastName: "Ui", pin },
        ownerSession
      );
      const id = String(r.data.data.id);
      await setMemberJobsRaw(ownerToken, restaurantId, id, [
        { jobId, isPrimary: true },
      ]);
      await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
        staffMemberId: id,
        clockInAt: minutesAgo(2 + hours * 60),
        clockOutAt: minutesAgo(2),
        jobId,
        reason: "Saturday",
      });
      return { id, pin };
    };
    const ana = await person("Ana", "3816", server, 6);
    await person("Cal", "6491", bar, 8);
    await person("Dee", "7359", busser, 5);
    const anaSession = await tabletStaffSignIn(tablet, ana.id, ana.pin);
    const check = await createTabletOrderRaw(tablet, anaSession, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: 10,
      tax: 0,
      tip: 0,
      total: 10,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: 1,
          price: 10,
        },
      ],
      openCheck: true,
      tableName: "T1",
      guestCount: 2,
    });
    await openRegisterSessionPos(tablet, ownerSession, 100);
    await settleTabCashRaw(tablet, ownerSession, String(check.data.id), {
      amount: 10,
      cashTendered: 310,
      tip: 300,
      idempotencyKey: `twui-${runId}`,
    });

    session = await loginViaUi(
      browser,
      tenant.email,
      process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`
    );
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Tip-out waterfall (dashboard)");
    await allure.label("severity", "critical");
  });

  test("TC-677: the Waterfall preset fills the rules, the example shows dollars, and Save stores it", async () => {
    await page().setViewportSize({ width: 1280, height: 900 });
    await openStaff("tipPolicy");
    const card = page().getByTestId("tip-outs-card");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByText("Waterfall", { exact: true }).click();
    await expect(card.getByTestId("tip-out-rule")).toHaveCount(2);
    const flow = card.getByTestId("tip-outs-flow");
    await expect(flow).toContainText("Server");
    await expect(flow).toContainText("Bartender");
    await expect(flow).toContainText("Busser");
    const example = page().getByTestId("tip-policy-example").first();
    await expect(example).toContainText(/\$\d/, { timeout: 15_000 });

    const saved = page().waitForResponse(
      (r) =>
        r.url().includes("/tips/") &&
        r.url().includes("/policy") &&
        r.request().method() === "PUT"
    );
    await page().getByRole("button", { name: "Save tip policy" }).click();
    expect((await saved).status()).toBe(200);
    const stored = await tipsRaw(ownerToken, restaurantId, "GET", "/policy");
    expect(stored.data.data.tipOutOrder).toHaveLength(2);
  });

  test("TC-678: the Tips tab shows Gave / Received and where the tip-outs went", async () => {
    await openStaff("tips");
    await expect(
      page().getByRole("columnheader", { name: /Gave/ })
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page().getByRole("columnheader", { name: /Received/ })
    ).toBeVisible();
    const went = page().getByTestId("tips-where-it-went");
    await expect(went).toBeVisible();
    await expect(went).toContainText("Where the tip-outs went");
    // Ana gave 7% of $300.00 = $21.00 to the bar.
    await expect(page().getByText("$21.00").first()).toBeVisible();
  });

  test("TC-679: at 390 px the Tips tab shows people as cards and fits the screen", async () => {
    await page().setViewportSize({ width: 390, height: 844 });
    await openStaff("tips");
    await expect(page().getByText("Ana Ui").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page().getByRole("columnheader", { name: /Gave/ })
    ).toHaveCount(0);
    const overflow = await page().evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
