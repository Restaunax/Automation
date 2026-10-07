/**
 * api-discount-permissions.spec.ts — who may discount, comp and ring custom
 * items on the POS (S2 rules + S3 roles), through the order API (TC-604..610).
 *
 * No browser. A per-run throwaway restaurant (core features: no add-on), table
 * service on, one $10.00 item, a REGISTER device, and three people signed in
 * on it: Kim (Staff role), Lou (Shift lead role) and the owner (Owner role,
 * the approver). Every order is an open check — priced and checked by the
 * server, no drawer needed — so each test is one create call:
 *   - Staff can't discount on their own; a Shift lead can;
 *   - the owner's staff allowance (%) lets anyone discount up to it;
 *   - a manager's PIN approval covers exactly what it says (limit), no more;
 *   - comps need APPROVE_COMP; a required reason is enforced;
 *   - custom items: ANYONE vs a manager first;
 *   - giving the Staff ROLE the permission (S3) lets Kim discount;
 *   - the exceptions summary counts it all by employee.
 * Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  ownerStaffRaw,
  tabletRaw,
  updateRestaurantSettingsApi,
  updateRestaurantSettingsRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  createTabletOrderRaw,
  approvalLogSummaryRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const round2 = (n: number) => Math.round(n * 100) / 100;

test.describe.configure({ mode: "serial" });

test.describe("Discount, comp and custom-item permissions on the POS (API)", () => {
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
  let item: { id: string; name: string };
  const roles: Record<string, Rec> = {};
  const kim = { id: "", pin: "3816", session: "" };
  const lou = { id: "", pin: "5207", session: "" };
  const owner = { id: "", pin: "8462" };
  let table = 0;

  /** Open a 2 × $10.00 check with one line adjustment. */
  const ring = (
    session: string,
    line: Rec,
    lineTotal: number,
    custom = false
  ) => {
    const subtotal = round2(lineTotal);
    table += 1;
    return createTabletOrderRaw(tabletToken, session, {
      restaurantId,
      orderType: "PICKUP",
      subtotal,
      tax: 0,
      tip: 0,
      total: subtotal,
      customerPhone: "",
      orderItems: [
        custom
          ? {
              menuItemId: null,
              menuItemName: `Open food ${runId}`,
              quantity: 1,
              price: lineTotal,
              isCustom: true,
              ...line,
            }
          : {
              menuItemId: item.id,
              menuItemName: item.name,
              quantity: 2,
              price: 10,
              ...line,
            },
      ],
      openCheck: true,
      tableName: `P${table}`,
      guestCount: 2,
    });
  };
  const discount = (percent: number, extra: Rec = {}) => ({
    line: {
      lineDiscountType: "PERCENT",
      lineDiscountValue: percent,
      lineDiscountReason: "Regular",
      ...extra,
    },
    total: 20 - round2((20 * percent) / 100),
  });
  const policy = async (patch: Rec) => {
    const r = await updateRestaurantSettingsRaw(ownerToken, restaurantId, {
      posApprovalPolicy: patch,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
  };
  const BASE_POLICY = {
    staffDiscountAllowancePercent: 0,
    customItems: "ANYONE",
    reasons: {
      discount: { required: false, options: [] },
      comp: { required: false, options: [] },
      void: { required: false, options: [] },
    },
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error("[api-discount-permissions] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    const groupId = (
      await createMenuGroupNamed(ownerToken, `Perms ${runId}`, { restaurantId })
    ).id;
    item = await createMenuItemFull(
      ownerToken,
      groupId,
      `Perm Burger ${runId}`,
      10
    );

    const r = await ownerStaffRaw(ownerToken, restaurantId, "GET", "/roles");
    for (const role of list(r.data.data))
      if (role.preset) roles[role.preset] = role;

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-perm-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    owner.id = await setOwnerPosPin(ownerToken, restaurantId, owner.pin);
    const ownerSession = await tabletStaffSignIn(
      tabletToken,
      owner.id,
      owner.pin
    );
    // Created on the POS: PIN-only staff are active at once (an emailed
    // invite stays pending until its link is used — api-staff-hiring TC-618).
    const person = async (
      p: { id: string; pin: string },
      first: string,
      preset: string
    ) => {
      const r = await tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/staff/manage",
        {
          firstName: first,
          lastName: "Perm",
          pin: p.pin,
          roleId: roles[preset]?.id,
        },
        ownerSession
      );
      if (r.status !== 201)
        throw new Error(
          `[api-discount-permissions] staff: ${JSON.stringify(r.data)}`
        );
      p.id = String(r.data.data.id);
    };
    await person(kim, "Kim", "STAFF");
    await person(lou, "Lou", "SHIFT_LEAD");
    kim.session = await tabletStaffSignIn(tabletToken, kim.id, kim.pin);
    lou.session = await tabletStaffSignIn(tabletToken, lou.id, lou.pin);
    await policy(BASE_POLICY);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Discount permissions");
    await allure.label("severity", "critical");
  });

  test("TC-604: Staff can't discount on their own; a Shift lead can", async () => {
    const d = discount(10);
    const kimTry = await ring(kim.session, d.line, d.total);
    expect(kimTry.status, JSON.stringify(kimTry.data)).toBe(403);
    expect(String(kimTry.data.message)).toMatch(/approv|manager/i);
    const louTry = await ring(lou.session, d.line, d.total);
    expect(louTry.status, JSON.stringify(louTry.data)).toBe(201);
    expect(louTry.data.total).toBe(18);
  });

  test("TC-605: the staff allowance lets anyone discount up to it — and not a cent past", async () => {
    await policy({ ...BASE_POLICY, staffDiscountAllowancePercent: 10 });
    const ok = discount(10);
    const inside = await ring(kim.session, ok.line, ok.total);
    expect(inside.status, JSON.stringify(inside.data)).toBe(201);
    const over = discount(15);
    const past = await ring(kim.session, over.line, over.total);
    expect(past.status).toBe(403);
    await policy(BASE_POLICY);
  });

  test("TC-606: a manager's PIN approval covers exactly what was approved", async () => {
    const auth = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/authorize-action",
      {
        capability: "APPROVE_DISCOUNT",
        limit: { percent: 15 },
        managerPin: owner.pin,
        approverStaffMemberId: owner.id,
      },
      kim.session
    );
    expect(auth.status, JSON.stringify(auth.data)).toBe(200);
    expect(auth.data.data.selfAuthorized).toBe(false);
    const token = String(auth.data.data.token);

    const fifteen = discount(15, {
      approvalTokens: { APPROVE_DISCOUNT: token },
    });
    const ok = await ring(kim.session, fifteen.line, fifteen.total);
    expect(ok.status, JSON.stringify(ok.data)).toBe(201);
    const twenty = discount(20, {
      approvalTokens: { APPROVE_DISCOUNT: token },
    });
    const beyond = await ring(kim.session, twenty.line, twenty.total);
    expect(beyond.status).toBe(403);

    const badPin = await tabletRaw(
      tabletToken,
      "POST",
      "/authorize-action",
      {
        capability: "APPROVE_DISCOUNT",
        managerPin: "1357",
        approverStaffMemberId: owner.id,
      },
      kim.session
    );
    expect(badPin.status).toBeGreaterThanOrEqual(400);
  });

  test("TC-607: comps need APPROVE_COMP; a required reason is enforced", async () => {
    const comp = { isComped: true, compReason: "Cold food" };
    expect((await ring(kim.session, comp, 0)).status).toBe(403);
    const lead = await ring(lou.session, comp, 0);
    expect(lead.status, JSON.stringify(lead.data)).toBe(201);
    expect(lead.data.total).toBe(0);

    await policy({
      ...BASE_POLICY,
      reasons: {
        ...BASE_POLICY.reasons,
        comp: { required: true, options: ["Cold food"] },
      },
    });
    const noReason = await ring(lou.session, { isComped: true }, 0);
    expect(noReason.status).toBe(400);
    expect((await ring(lou.session, comp, 0)).status).toBe(201);
    await policy(BASE_POLICY);
  });

  test("TC-608: custom items — anyone by default; a manager first when the owner says so", async () => {
    expect((await ring(kim.session, {}, 7.5, true)).status).toBe(201);
    await policy({ ...BASE_POLICY, customItems: "OVERRIDE_PRICE" });
    const refused = await ring(kim.session, {}, 7.5, true);
    expect(refused.status).toBe(403);
    await policy(BASE_POLICY);
  });

  test("TC-609: giving the Staff ROLE the permission (S3) lets Kim discount on her own", async () => {
    const staff = roles.STAFF as Rec;
    const edited = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/roles/${staff.id}`,
      { permissions: [...(staff.permissions ?? []), "APPROVE_DISCOUNT"] }
    );
    expect(edited.status, JSON.stringify(edited.data)).toBe(200);
    const d = discount(25);
    const ok = await ring(kim.session, d.line, d.total);
    expect(ok.status, JSON.stringify(ok.data)).toBe(201);
    expect(ok.data.total).toBe(15);
    // Put it back.
    await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/roles/${staff.id}`,
      {
        permissions: staff.permissions ?? [],
      }
    );
    expect((await ring(kim.session, d.line, d.total)).status).toBe(403);
  });

  test("TC-610: the exceptions summary counts every discount and comp, by who did it and who approved", async () => {
    const day = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const res = await approvalLogSummaryRaw(
      ownerToken,
      restaurantId,
      day(-1),
      day(1)
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const data = res.data.data as Rec;
    const by = new Map(list(data.byEmployee).map((e) => [e.staffMemberId, e]));
    // Kim: 10% (allowance) + 15% (owner's PIN) + 25% (role) of $20.00.
    expect(by.get(kim.id)?.actions?.LINE_DISCOUNT).toMatchObject({ count: 3 });
    expect(Number(by.get(kim.id)?.actions?.LINE_DISCOUNT?.amount)).toBeCloseTo(
      10,
      2
    );
    expect(by.get(kim.id)?.approvedByOthers).toBe(1);
    // Lou: one 10% discount and two comps of a $20.00 line.
    expect(by.get(lou.id)?.actions?.LINE_DISCOUNT).toMatchObject({ count: 1 });
    expect(by.get(lou.id)?.actions?.COMP).toMatchObject({ count: 2 });
    expect(Number(by.get(lou.id)?.actions?.COMP?.amount)).toBeCloseTo(40, 2);
    const approver = list(data.byApprover).find(
      (a) => a.staffMemberId === owner.id
    );
    expect(approver).toMatchObject({ count: 1 });
    expect(Number(approver?.amount)).toBeCloseTo(3, 2);
  });
});
