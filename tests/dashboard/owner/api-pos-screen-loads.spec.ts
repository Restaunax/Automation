/**
 * api-pos-screen-loads.spec.ts — a POS screen's own load never answers 403;
 * what a person may SEE and DO is decided inside it (TC-647..649).
 *
 * No browser. A per-run throwaway restaurant with table reservations, a
 * REGISTER device and three people signed in on it:
 *   Kai — a custom "Kitchen" role with no permissions at all;
 *   the owner — Owner role (everything; the approving manager).
 *   - staff capabilities: Kai's screen loads (groups only, no role
 *     catalogue); managing staff stays refused;
 *   - host stand: Kai sees the list without guests' phone/email and
 *     canManage false; his writes are refused; the owner sees contacts;
 *   - safe: a manager's MANAGE_SAFE approval token opens the safe read for
 *     Kai; no token, a token for another capability or a forged one → 403.
 * Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, generateSeedPhone } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  updateRestaurantSettingsApi,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  ownerStaffRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("POS screen loads never 403 (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tabletToken = "";
  const owner = { id: "", pin: "8462", session: "" };
  const kai = { id: "", pin: "3816", session: "" };
  const guestPhone = generateSeedPhone();
  const guestEmail = `auto-guest-${runId}@example.com`;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[screen-loads] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );

    const kitchen = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/roles",
      {
        name: "Kitchen",
        permissions: [],
      }
    );
    if (kitchen.status !== 201)
      throw new Error(`[screen-loads] role: ${JSON.stringify(kitchen.data)}`);

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-loads-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    owner.id = await setOwnerPosPin(ownerToken, restaurantId, owner.pin);
    owner.session = await tabletStaffSignIn(tabletToken, owner.id, owner.pin);
    const created = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/manage",
      {
        firstName: "Kai",
        lastName: "Kitchen",
        pin: kai.pin,
        roleId: kitchen.data.data.id,
      },
      owner.session
    );
    if (created.status !== 201)
      throw new Error(`[screen-loads] staff: ${JSON.stringify(created.data)}`);
    kai.id = String(created.data.data.id);
    kai.session = await tabletStaffSignIn(tabletToken, kai.id, kai.pin);

    // A walk-in with contact details, added by the owner.
    const walkIn = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/reservations",
      { partySize: 2, guestName: `Guest ${runId}`, guestPhone, guestEmail },
      owner.session
    );
    if (walkIn.status !== 201)
      throw new Error(`[screen-loads] walk-in: ${JSON.stringify(walkIn.data)}`);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS screen loads");
    await allure.label("severity", "critical");
  });

  test("TC-647: the permissions catalogue loads for anyone; the role catalogue and staff management stay with managers", async () => {
    const mine = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/staff/capabilities",
      undefined,
      kai.session
    );
    expect(mine.status, JSON.stringify(mine.data)).toBe(200);
    expect(list(mine.data.data.groups).length).toBeGreaterThan(0);
    expect(mine.data.data).not.toHaveProperty("roles");
    expect(mine.data.data).not.toHaveProperty("roleBases");

    const boss = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/staff/capabilities",
      undefined,
      owner.session
    );
    expect(boss.status).toBe(200);
    expect(list(boss.data.data.roles).map((r) => r.name)).toContain("Kitchen");
    expect(boss.data.data.roleBases).toBeTruthy();

    const manage = await tabletRaw(
      tabletToken,
      "GET",
      "/staff/manage",
      undefined,
      kai.session
    );
    expect(manage.status).toBe(403);
  });

  test("TC-648: the host stand loads for anyone, without guests' contact details; writes stay refused", async () => {
    const view = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/host",
      undefined,
      kai.session
    );
    expect(view.status, JSON.stringify(view.data)).toBe(200);
    expect(view.data.canManage).toBe(false);
    const row = list(view.data.data).find(
      (r) => r.guestName === `Guest ${runId}`
    );
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty("guestPhone");
    expect(row).not.toHaveProperty("guestEmail");

    const write = await tabletRaw(
      tabletToken,
      "POST",
      "/reservations",
      {
        partySize: 3,
        guestName: `Nope ${runId}`,
        guestPhone: generateSeedPhone(),
      },
      kai.session
    );
    expect(write.status).toBe(403);

    const host = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/host",
      undefined,
      owner.session
    );
    expect(host.data.canManage).toBe(true);
    const full = list(host.data.data).find(
      (r) => r.guestName === `Guest ${runId}`
    );
    expect(full).toMatchObject({ guestEmail });
    expect(String(full?.guestPhone ?? "")).toContain(guestPhone.slice(-4));
  });

  test("TC-649: the safe opens for a cashier only with a manager's MANAGE_SAFE approval", async () => {
    const safe = (headers?: Record<string, string>) =>
      tabletRaw<Rec>(
        tabletToken,
        "GET",
        "/safe",
        undefined,
        kai.session,
        headers
      );
    expect((await safe()).status, "no approval").toBe(403);
    expect(
      (await safe({ "x-approval-token": "forged.token.value" })).status
    ).toBe(403);

    const approve = (capability: string) =>
      tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/authorize-action",
        { capability, managerPin: owner.pin, approverStaffMemberId: owner.id },
        kai.session
      );
    const discount = await approve("APPROVE_DISCOUNT");
    expect(discount.status, JSON.stringify(discount.data)).toBe(200);
    expect(
      (await safe({ "x-approval-token": String(discount.data.data.token) }))
        .status,
      "a token for another capability"
    ).toBe(403);

    const ok = await approve("MANAGE_SAFE");
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(ok.data.data.selfAuthorized).toBe(false);
    const opened = await safe({
      "x-approval-token": String(ok.data.data.token),
    });
    expect(opened.status, JSON.stringify(opened.data)).toBe(200);
    expect(opened.data.data).toHaveProperty("entries");

    // The manager opens it on their own.
    const own = await tabletRaw(
      tabletToken,
      "GET",
      "/safe",
      undefined,
      owner.session
    );
    expect(own.status).toBe(200);
  });
});
