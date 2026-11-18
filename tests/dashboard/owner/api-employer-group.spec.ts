/**
 * api-employer-group.spec.ts — setting up an employer group (one EIN over
 * several restaurants) on QA (TC-1400..1409). RestauNax back-office audit
 * 2026-10, Stage 5, W3:C4 / decision D2 (docs/features/back-office/
 * EMPLOYER_GROUP.md).
 *
 * No browser. Per run: a fresh owner controlling two throwaway Miami
 * restaurants (A, B) with PAYROLL granted (→ TIMECARDS), plus a third
 * restaurant (C) HQ creates and nobody in the spec controls. The owner's own
 * POS membership at A and at B are one human with two staff records: the
 * people screen suggests linking them "by account".
 *   - /api/employers needs a sign-in; bad EIN / pay frequency / no name 400;
 *   - the owner groups A + B; C is 404 (not theirs); a restaurant already in
 *     a group is ALREADY_GROUPED; another owner can't see the group (404);
 *   - people: suggestion shape, link, unlink;
 *   - a member's pay schedule is the employer's: GET /settings names the
 *     employer, PUT changing payFrequency is 403 SET_BY_EMPLOYER, the same
 *     value goes through; GET /payroll/:rid/employer; out of the group the
 *     restaurant edits its own calendar again;
 *   - delete is refused while a sick/PTO policy exists — retired too (the
 *     ledger is a legal record), as in the backend int test;
 *   - RestauNax EMPLOYEE staff read the group but every write is 403.
 * Leftover by design: the employer that got a policy can never be deleted
 * (TC-1408), so afterAll empties it (removes A and B) and leaves the bare row.
 * Serial. Fails (does not skip) without admin credentials.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnvHere } from "../../../utils/envGate";
import { generateRunId } from "../../../utils/testData";
import { looksLikeKey } from "../../../utils/backOfficeApi";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  getPayrollSettingsRaw,
  payrollRaw,
  putPayrollSettingsRaw,
  setOwnerPosPin,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  accrualRaw,
  codeOf,
  employerRaw,
  ownerWithRestaurants,
  strangerRestaurant,
} from "../../../utils/employerApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const SCHEDULE_FIELDS = [
  "payFrequency",
  "periodAnchorDate",
  "workweekStartDay",
];

test.describe.configure({ mode: "serial" });

test.describe("Employer group — setup (API)", () => {
  const runId = generateRunId();
  const legalName = `Automation Group LLC ${runId}`;
  let adminToken = "";
  let ownerToken = "";
  let A = "";
  let B = "";
  let C = "";
  /** The owner's own staff records at A and B (one human). */
  let meA = "";
  let meB = "";
  let employerId = "";
  let spareEmployerId = "";
  let policyId = "";
  let other = { token: "", restaurantId: "", fresh: false };
  const created: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error(
        "[api-employer-group] ADMIN_EMAIL / ADMIN_PASSWORD not set: the tenants are minted by HQ"
      );
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const t = await ownerWithRestaurants(adminToken, runId, { count: 2 });
    ownerToken = t.ownerToken;
    [A, B] = t.restaurantIds as [string, string];
    created.push(A, B);
    C = await strangerRestaurant(adminToken, runId);
    created.push(C);
    meA = await setOwnerPosPin(ownerToken, A, "8462", { clocksIn: true });
    meB = await setOwnerPosPin(ownerToken, B, "8462", { clocksIn: true });
    const o = await createSecondOwner(adminToken, `${runId}o`);
    other = {
      token: o.accessToken,
      restaurantId: o.restaurantId ?? "",
      fresh: !!o.password,
    };
    if (other.fresh && other.restaurantId) created.push(other.restaurantId);
  });

  test.afterAll(async () => {
    if (ownerToken && policyId && A)
      await accrualRaw(ownerToken, A, "DELETE", `/policies/${policyId}`).catch(
        () => {}
      );
    if (ownerToken && employerId) {
      for (const rid of [A, B])
        await employerRaw(
          ownerToken,
          "DELETE",
          `/${employerId}/restaurants/${rid}`
        ).catch(() => {});
      // Refused when a policy was ever attached (TC-1408): the empty row stays.
      await employerRaw(ownerToken, "DELETE", `/${employerId}`).catch(() => {});
    }
    if (ownerToken && spareEmployerId)
      await employerRaw(ownerToken, "DELETE", `/${spareEmployerId}`).catch(
        () => {}
      );
    if (adminToken)
      for (const rid of created)
        await deleteTestRestaurant(adminToken, rid).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Employer group");
    await allure.label("severity", "critical");
  });

  test("TC-1400: /api/employers needs a sign-in", async () => {
    await allure.description(
      "Unauthenticated list, create and read are 401 (requireAuth on the whole router)."
    );
    for (const [method, path, body] of [
      ["GET", "", undefined],
      ["POST", "", { legalName: "Nobody LLC" }],
      ["GET", "/00000000-0000-0000-0000-000000000000", undefined],
    ] as const) {
      const r = await employerRaw(undefined, method, path, body);
      expect({ method, path, status: r.status }).toEqual({
        method,
        path,
        status: 401,
      });
    }
  });

  test("TC-1401: creating refuses a full EIN, an unknown pay frequency and a missing legal name", async () => {
    await allure.description(
      "Only the last four EIN digits are ever stored: a 9-digit EIN is 400 INVALID (field einLast4). " +
        "payFrequency outside WEEKLY|BIWEEKLY|SEMIMONTHLY|MONTHLY, a bad workweek day and a blank name are 400. " +
        "Each refusal is translated text, never an i18n key."
    );
    const cases: [Rec, string][] = [
      [{ legalName, einLast4: "123456789", restaurantIds: [A] }, "einLast4"],
      [{ legalName, einLast4: "12-3456789" }, "einLast4"],
      [{ legalName, payFrequency: "DAILY" }, "payFrequency"],
      [{ legalName, workweekStartDay: 7 }, "workweekStartDay"],
      [{ legalName, periodAnchorDate: "01/04/2026" }, "periodAnchorDate"],
      [{ legalName: "   " }, "legalName"],
    ];
    for (const [body, field] of cases) {
      const r = await employerRaw(ownerToken, "POST", "", body);
      expect({ field, status: r.status }, JSON.stringify(r.data)).toEqual({
        field,
        status: 400,
      });
      expect(codeOf(r.data)).toBe("INVALID");
      expect((r.data as Rec).details?.field).toBe(field);
      expect(looksLikeKey(r.data.message), String(r.data.message)).toBe(false);
    }
    // Nothing was created by the refused calls.
    const mine = await employerRaw(ownerToken, "GET");
    expect(mine.status).toBe(200);
    expect(
      list(mine.data.data).filter((e) => e.legalName === legalName)
    ).toEqual([]);
  });

  test("TC-1402: the owner groups their two restaurants; list and read show it", async () => {
    await allure.description(
      "POST with restaurantIds [A, B] and a weekly calendar → 201 EmployerView: EIN last 4 only, " +
        "both restaurants, no payroll company, canManage true. It is in GET /api/employers and GET /:id."
    );
    const r = await employerRaw(ownerToken, "POST", "", {
      legalName,
      einLast4: "4321",
      workweekStartDay: 0,
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      restaurantIds: [A, B],
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    expect(looksLikeKey(r.data.message)).toBe(false);
    const e = r.data.data as Rec;
    employerId = String(e.id);
    expect(e).toMatchObject({
      legalName,
      einLast4: "4321",
      workweekStartDay: 0,
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      payrollConnection: null,
      canManage: true,
    });
    expect(
      list(e.restaurants)
        .map((x) => x.id)
        .sort()
    ).toEqual([A, B].sort());
    for (const x of list(e.restaurants)) expect(typeof x.name).toBe("string");
    expect(typeof e.createdAt).toBe("string");

    const all = await employerRaw(ownerToken, "GET");
    expect(all.status).toBe(200);
    expect(list(all.data.data).map((x) => x.id)).toContain(employerId);
    const one = await employerRaw(ownerToken, "GET", `/${employerId}`);
    expect(one.status).toBe(200);
    expect(one.data.data).toMatchObject({ id: employerId, legalName });
  });

  test("TC-1403: a restaurant the owner doesn't control is 404; one already grouped is ALREADY_GROUPED; another owner sees nothing", async () => {
    await allure.description(
      "Adding C (HQ-created, not the owner's) → 404 RESTAURANT_NOT_FOUND, also at create time. " +
        "A second (empty) employer can't take A: 400 ALREADY_GROUPED. Another owner: the group is 404 " +
        "on read, change and people, and absent from their list (nobody learns it exists)."
    );
    const add = await employerRaw(
      ownerToken,
      "POST",
      `/${employerId}/restaurants`,
      { restaurantId: C }
    );
    expect(add.status, JSON.stringify(add.data)).toBe(404);
    expect(codeOf(add.data)).toBe("RESTAURANT_NOT_FOUND");
    const atCreate = await employerRaw(ownerToken, "POST", "", {
      legalName: `Not Mine ${runId}`,
      restaurantIds: [C],
    });
    expect(atCreate.status, JSON.stringify(atCreate.data)).toBe(404);

    const spare = await employerRaw(ownerToken, "POST", "", {
      legalName: `Spare Group ${runId}`,
    });
    expect(spare.status, JSON.stringify(spare.data)).toBe(201);
    spareEmployerId = String(spare.data.data.id);
    expect(spare.data.data.restaurants).toEqual([]);
    const grouped = await employerRaw(
      ownerToken,
      "POST",
      `/${spareEmployerId}/restaurants`,
      { restaurantId: A }
    );
    expect(grouped.status, JSON.stringify(grouped.data)).toBe(400);
    expect(codeOf(grouped.data)).toBe("ALREADY_GROUPED");
    expect(looksLikeKey(grouped.data.message)).toBe(false);
    const gone = await employerRaw(ownerToken, "DELETE", `/${spareEmployerId}`);
    expect(gone.status, JSON.stringify(gone.data)).toBe(200);
    spareEmployerId = "";

    for (const [method, path, body] of [
      ["GET", `/${employerId}`, undefined],
      ["PATCH", `/${employerId}`, { legalName: "Hijack LLC" }],
      ["GET", `/${employerId}/people`, undefined],
    ] as const) {
      const r = await employerRaw(other.token, method, path, body);
      expect({ method, path, status: r.status }).toEqual({
        method,
        path,
        status: 404,
      });
    }
    const theirs = await employerRaw(other.token, "GET");
    expect(theirs.status).toBe(200);
    expect(list(theirs.data.data).map((x) => x.id)).not.toContain(employerId);
  });

  test("TC-1404: people suggests the owner's two records by account", async () => {
    await allure.description(
      "GET /people → { persons, unlinked, suggestions }. Nobody linked yet; both of the owner's records are " +
        "unlinked; one suggestion matchedBy ACCOUNT with exactly those two staffMemberIds, and records carrying " +
        "restaurantId, restaurantName, names, email, phone, isActive."
    );
    const r = await employerRaw(ownerToken, "GET", `/${employerId}/people`);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const p = r.data.data as Rec;
    expect(Array.isArray(p.persons)).toBe(true);
    expect(p.persons).toEqual([]);
    const unlinked = list(p.unlinked).map((x) => x.staffMemberId);
    expect(unlinked).toEqual(expect.arrayContaining([meA, meB]));
    const sug = list(p.suggestions).find((s) =>
      (s.staffMemberIds as string[]).includes(meA)
    );
    expect(sug, JSON.stringify(p.suggestions)).toBeTruthy();
    expect(sug?.matchedBy).toBe("ACCOUNT");
    expect([...(sug?.staffMemberIds as string[])].sort()).toEqual(
      [meA, meB].sort()
    );
    for (const rec of list(sug?.records)) {
      expect(Object.keys(rec).sort()).toEqual(
        [
          "email",
          "firstName",
          "isActive",
          "lastName",
          "phone",
          "restaurantId",
          "restaurantName",
          "staffMemberId",
        ].sort()
      );
      expect(rec.isActive).toBe(true);
      expect([A, B]).toContain(rec.restaurantId);
      expect(String(rec.restaurantName).length).toBeGreaterThan(0);
    }
  });

  test("TC-1405: link the two records as one person, then unlink", async () => {
    await allure.description(
      "POST /people needs at least two records (one id → 400 INVALID); with both → one person with two " +
        "records and the suggestion is gone. Unlinking one record leaves a person of one, which is removed: " +
        "both records are unlinked again. A made-up record id is 404 STAFF_NOT_FOUND."
    );
    const one = await employerRaw(ownerToken, "POST", `/${employerId}/people`, {
      staffMemberIds: [meA],
    });
    expect(one.status, JSON.stringify(one.data)).toBe(400);
    expect(codeOf(one.data)).toBe("INVALID");

    const linked = await employerRaw(
      ownerToken,
      "POST",
      `/${employerId}/people`,
      { staffMemberIds: [meA, meB] }
    );
    expect(linked.status, JSON.stringify(linked.data)).toBe(200);
    const persons = list(linked.data.data.persons);
    expect(persons).toHaveLength(1);
    expect(
      list(persons[0]?.records)
        .map((x) => x.staffMemberId)
        .sort()
    ).toEqual([meA, meB].sort());
    expect(
      list(linked.data.data.suggestions).filter((s) =>
        (s.staffMemberIds as string[]).includes(meA)
      )
    ).toEqual([]);

    const unlinked = await employerRaw(
      ownerToken,
      "DELETE",
      `/${employerId}/people/staff/${meA}`
    );
    expect(unlinked.status, JSON.stringify(unlinked.data)).toBe(200);
    expect(unlinked.data.data.persons).toEqual([]);
    expect(
      list(unlinked.data.data.unlinked).map((x) => x.staffMemberId)
    ).toEqual(expect.arrayContaining([meA, meB]));

    const ghost = await employerRaw(
      ownerToken,
      "DELETE",
      `/${employerId}/people/staff/00000000-0000-0000-0000-000000000000`
    );
    expect(ghost.status, JSON.stringify(ghost.data)).toBe(404);
    expect(codeOf(ghost.data)).toBe("STAFF_NOT_FOUND");
  });

  test("TC-1406: a member's pay schedule is the employer's — read-only on the restaurant", async () => {
    await allure.description(
      "GET /api/staff/payroll/A/settings: data.employer { id, legalName, fields: payFrequency, periodAnchorDate, " +
        "workweekStartDay } and the employer's WEEKLY calendar. PUT changing payFrequency → 403 SET_BY_EMPLOYER " +
        "(translated message); sending the employer's own values is fine. A change on the employer (BIWEEKLY) " +
        "shows on both members."
    );
    const s = await getPayrollSettingsRaw(ownerToken, A);
    expect(s.status, JSON.stringify(s.data)).toBe(200);
    const data = s.data.data as Rec;
    expect(data.employer).toEqual({
      id: employerId,
      legalName,
      fields: SCHEDULE_FIELDS,
    });
    expect(data.settings).toMatchObject({
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });

    const refused = await putPayrollSettingsRaw(ownerToken, A, {
      payFrequency: "BIWEEKLY",
    });
    expect(refused.status, JSON.stringify(refused.data)).toBe(403);
    expect(codeOf(refused.data)).toBe("SET_BY_EMPLOYER");
    const msg = String((refused.data as Rec).message);
    expect(looksLikeKey(msg), msg).toBe(false);

    const same = await putPayrollSettingsRaw(ownerToken, A, {
      payFrequency: "WEEKLY",
      workweekStartDay: 0,
    });
    expect(same.status, JSON.stringify(same.data)).toBe(200);

    const patched = await employerRaw(ownerToken, "PATCH", `/${employerId}`, {
      payFrequency: "BIWEEKLY",
    });
    expect(patched.status, JSON.stringify(patched.data)).toBe(200);
    expect(patched.data.data.payFrequency).toBe("BIWEEKLY");
    for (const rid of [A, B]) {
      const after = await getPayrollSettingsRaw(ownerToken, rid);
      expect(
        { rid, f: (after.data.data as Rec).settings?.payFrequency },
        JSON.stringify(after.data)
      ).toEqual({ rid, f: "BIWEEKLY" });
    }
    const back = await employerRaw(ownerToken, "PATCH", `/${employerId}`, {
      payFrequency: "WEEKLY",
    });
    expect(back.status, JSON.stringify(back.data)).toBe(200);
  });

  test("TC-1407: GET /payroll/:rid/employer; out of the group the restaurant runs its own calendar again", async () => {
    await allure.description(
      "GET /api/staff/payroll/A/employer → { id, legalName, workweekStartDay, payFrequency, periodAnchorDate, " +
        "restaurants, payrollConnection: null, combinedOvertime: true }. Removing B: B's /employer is null, its " +
        "settings carry employer null and it may change payFrequency itself. B joins again (same call twice is fine)."
    );
    const r = await payrollRaw(ownerToken, A, "GET", "/employer");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const e = r.data.data as Rec;
    expect(e).toMatchObject({
      id: employerId,
      legalName,
      workweekStartDay: 0,
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      payrollConnection: null,
      combinedOvertime: true,
    });
    expect(
      list(e.restaurants)
        .map((x) => x.id)
        .sort()
    ).toEqual([A, B].sort());

    const out = await employerRaw(
      ownerToken,
      "DELETE",
      `/${employerId}/restaurants/${B}`
    );
    expect(out.status, JSON.stringify(out.data)).toBe(200);
    expect(list(out.data.data.restaurants).map((x) => x.id)).toEqual([A]);
    const none = await payrollRaw(ownerToken, B, "GET", "/employer");
    expect(none.status).toBe(200);
    expect(none.data.data).toBeNull();
    const own = await getPayrollSettingsRaw(ownerToken, B);
    expect((own.data.data as Rec).employer).toBeNull();
    const free = await putPayrollSettingsRaw(ownerToken, B, {
      payFrequency: "BIWEEKLY",
    });
    expect(free.status, JSON.stringify(free.data)).toBe(200);

    for (let i = 0; i < 2; i++) {
      const back = await employerRaw(
        ownerToken,
        "POST",
        `/${employerId}/restaurants`,
        { restaurantId: B }
      );
      expect(back.status, JSON.stringify(back.data)).toBe(200);
      expect(
        list(back.data.data.restaurants)
          .map((x) => x.id)
          .sort()
      ).toEqual([A, B].sort());
    }
    const again = await getPayrollSettingsRaw(ownerToken, B);
    expect((again.data.data as Rec).settings?.payFrequency).toBe("WEEKLY");
  });

  test("TC-1408: delete is refused while a sick/PTO policy exists — retired too", async () => {
    await allure.description(
      "A custom PTO policy applied on A is the GROUP's (employerId set, restaurantId null). DELETE /api/employers/:id " +
        "→ 400 HAS_ACCRUAL_POLICIES. Retiring it keeps its ledger, so delete stays refused (backend int test, " +
        "employerGroup.int.test.ts). This employer therefore outlives the run as an empty row."
    );
    const p = await accrualRaw(ownerToken, A, "POST", "/policies", {
      kind: "PTO",
      name: `Vacation ${runId}`,
      accrueMinutes: 60,
      perWorkedMinutes: 2400,
    });
    expect(p.status, JSON.stringify(p.data)).toBe(201);
    policyId = String(p.data.data.id);
    expect(p.data.data).toMatchObject({
      employerId,
      restaurantId: null,
      kind: "PTO",
      active: true,
    });

    const refused = await employerRaw(ownerToken, "DELETE", `/${employerId}`);
    expect(refused.status, JSON.stringify(refused.data)).toBe(400);
    expect(codeOf(refused.data)).toBe("HAS_ACCRUAL_POLICIES");
    expect(looksLikeKey(refused.data.message)).toBe(false);

    const retired = await accrualRaw(
      ownerToken,
      A,
      "DELETE",
      `/policies/${policyId}`
    );
    expect(retired.status, JSON.stringify(retired.data)).toBe(200);
    policyId = "";
    const still = await employerRaw(ownerToken, "DELETE", `/${employerId}`);
    expect(still.status, JSON.stringify(still.data)).toBe(400);
    expect(codeOf(still.data)).toBe("HAS_ACCRUAL_POLICIES");
    const alive = await employerRaw(ownerToken, "GET", `/${employerId}`);
    expect(alive.status).toBe(200);
  });

  test("TC-1409: RestauNax EMPLOYEE staff read the group; every write is 403", async () => {
    requireEnvHere(
      ["EMPLOYEE_EMAIL", "EMPLOYEE_PASSWORD"],
      "RestauNax company staff are read-only on employer groups (W5:L4)"
    );
    await allure.description(
      "EMPLOYEE: GET /api/employers/:id and /people 200 with canManage false; create, change, delete and " +
        "add-restaurant are 403 PLATFORM_EMPLOYEE_READ_ONLY with a sentence, and nothing changed."
    );
    const employeeToken = (await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD))
      .accessToken;
    const read = await employerRaw(employeeToken, "GET", `/${employerId}`);
    expect(read.status, JSON.stringify(read.data)).toBe(200);
    expect(read.data.data).toMatchObject({ id: employerId, canManage: false });
    const people = await employerRaw(
      employeeToken,
      "GET",
      `/${employerId}/people`
    );
    expect(people.status).toBe(200);

    for (const [method, path, body] of [
      ["POST", "", { legalName: `HQ Group ${runId}` }],
      ["PATCH", `/${employerId}`, { legalName: "HQ rename" }],
      ["DELETE", `/${employerId}`, undefined],
      ["POST", `/${employerId}/restaurants`, { restaurantId: C }],
    ] as const) {
      const r = await employerRaw(employeeToken, method, path, body);
      expect(
        { method, path, status: r.status },
        JSON.stringify(r.data)
      ).toEqual({ method, path, status: 403 });
      expect(r.data).toMatchObject({ error: "PLATFORM_EMPLOYEE_READ_ONLY" });
      expect(looksLikeKey(r.data.message)).toBe(false);
    }
    const after = await employerRaw(ownerToken, "GET", `/${employerId}`);
    expect(after.data.data.legalName).toBe(legalName);
  });
});
