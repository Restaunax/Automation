/**
 * api-service-charges-to-staff.spec.ts — the server's guards for service
 * charges paid to staff (RestauNax #1078,
 * docs/features/back-office/SERVICE_CHARGES_TO_STAFF.md), asked directly so
 * no screen can hide a gap (TC-958..960).
 *
 *   TC-958  Without Tip Management or Payroll, a NEW "paid to staff" is
 *           refused (400 STAFF_SHARE_NOT_ENTITLED, a readable message) for
 *           the service fee and the auto-gratuity; nothing is saved.
 *   TC-959  A NEW auto-gratuity above 25% is refused (400
 *           GRATUITY_PERCENT_TOO_HIGH, readable); 25% is accepted.
 *   TC-960  With Tip Management: STAFF + "the server on the check" saves and
 *           reads back for both charges; HOUSE clears the allocation.
 *
 * No browser. A per-run throwaway owner + restaurant (deleted afterwards).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  getRestaurantSettingsRaw,
  setFeatureOverrideAdminRaw,
  updateRestaurantSettingsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  AUTO_GRATUITY_HOUSE,
  looksLikeKey,
  SERVICE_FEE_HOUSE,
} from "../../../utils/backOfficeApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

const SERVICE_FEE = SERVICE_FEE_HOUSE;
const AUTO_GRATUITY = AUTO_GRATUITY_HOUSE;

test.describe.configure({ mode: "serial" });

test.describe("Service charges paid to staff — server guards (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";

  const settings = async (): Promise<Rec> => {
    const r = await getRestaurantSettingsRaw(ownerToken, restaurantId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const body = r.data as Rec;
    return ((body.data as Rec | undefined) ?? body) as Rec;
  };
  const put = (patch: Rec) =>
    updateRestaurantSettingsRaw(ownerToken, restaurantId, patch);
  /** A refusal a person can read: a code, and a sentence that isn't a key. */
  const expectRefused = (r: { status: number; data: Rec }, code: string) => {
    expect(r.status, JSON.stringify(r.data)).toBe(400);
    expect(r.data.error).toBe(code);
    const message = String(r.data.message ?? "");
    expect(message.length, JSON.stringify(r.data)).toBeGreaterThan(20);
    expect(looksLikeKey(message), message).toBe(false);
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId)
      throw new Error("[service-charges] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const base = await put({
      tableServiceEnabled: true,
      serviceFee: SERVICE_FEE,
      autoGratuity: AUTO_GRATUITY,
    });
    if (base.status !== 200)
      throw new Error(`[service-charges] base: ${JSON.stringify(base.data)}`);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Service charges paid to staff");
    await allure.label("severity", "critical");
  });

  test("TC-958: without Tip Management, a new 'paid to staff' is refused for both charges and nothing is saved", async () => {
    expectRefused(
      await put({ serviceFee: { ...SERVICE_FEE, distribution: "STAFF" } }),
      "STAFF_SHARE_NOT_ENTITLED"
    );
    expectRefused(
      await put({
        autoGratuity: { ...AUTO_GRATUITY, distribution: "STAFF" },
      }),
      "STAFF_SHARE_NOT_ENTITLED"
    );
    const s = await settings();
    expect((s.serviceFee as Rec).distribution).toBe("HOUSE");
    expect((s.autoGratuity as Rec).distribution).toBe("HOUSE");
    // Re-saving what is stored (an old screen) still works.
    expect((await put({ serviceFee: s.serviceFee })).status).toBe(200);
  });

  test("TC-959: a new auto-gratuity above 25% is refused; 25% is accepted", async () => {
    expectRefused(
      await put({ autoGratuity: { ...AUTO_GRATUITY, percent: 30 } }),
      "GRATUITY_PERCENT_TOO_HIGH"
    );
    expect(((await settings()).autoGratuity as Rec).percent).toBe(18);
    const ok = await put({ autoGratuity: { ...AUTO_GRATUITY, percent: 25 } });
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(((await settings()).autoGratuity as Rec).percent).toBe(25);
  });

  test("TC-960: with Tip Management, 'the server on the check' saves and reads back; HOUSE clears it", async () => {
    const granted = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      true
    );
    expect(granted.ok, JSON.stringify(granted.data)).toBe(true);
    const staff = await put({
      serviceFee: {
        ...SERVICE_FEE,
        distribution: "STAFF",
        allocation: "CHECK_SERVER",
      },
      autoGratuity: {
        ...AUTO_GRATUITY,
        distribution: "STAFF",
        allocation: "TIP_RULES",
      },
    });
    expect(staff.status, JSON.stringify(staff.data)).toBe(200);
    let s = await settings();
    expect(s.serviceFee).toMatchObject({
      distribution: "STAFF",
      allocation: "CHECK_SERVER",
    });
    expect(s.autoGratuity).toMatchObject({
      distribution: "STAFF",
      allocation: "TIP_RULES",
    });
    expect((await put({ serviceFee: SERVICE_FEE })).status).toBe(200);
    s = await settings();
    expect((s.serviceFee as Rec).distribution).toBe("HOUSE");
  });
});
