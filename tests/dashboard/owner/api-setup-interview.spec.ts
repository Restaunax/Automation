/**
 * api-setup-interview.spec.ts — RestauNax back-office audit Stage 6, the
 * five-question setup interview (W0:J1-a) (TC-1700..1706).
 *
 * GET|POST /restaurant/:rid/back-office/setup-interview. One POST writes the
 * overtime preset (STATE, from the address), the pay schedule (checked
 * against the state's pay-frequency rule: CONFIRMED refuses, DRAFT warns),
 * the tip preset (by business style), the payroll mode and "do you
 * schedule". Only add-ons the restaurant holds are written; the rest come
 * back in `skipped` with a sentence. Idempotent. Logged in the settings
 * history (area "staff"). The setup checklist then reads those steps as
 * done and reports `interview: { available, answered }`.
 *
 * No browser. Two throwaway restaurants: an Arizona counter-service one
 * with Scheduling + Tips (Timecards comes with them, no Payroll), and a
 * Florida one with no add-ons. The CONFIRMED-rule refusal needs an owner
 * confirmation QA can't make for pay frequency: restaunax
 * `setupInterview.int.test.ts` proves it.
 *
 * Gated by `RELEASED_ON_QA.staffSetupStage6` until the change is on QA.
 * Serial. Tag: @staff-setup.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import {
  probeStaffSetupStage6,
  requireRelease,
} from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
  payrollProviderRaw,
  payrollRaw,
  setFeatureOverrideAdminRaw,
  tipsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  backOfficeSetupRaw,
  looksLikeKey,
  settingChangesRaw,
  setupInterviewRaw,
  type SetupInterviewAnswers,
} from "../../../utils/backOfficeApi";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const ids = (v: unknown) => list(v).map((o) => String(o.id));

const ARIZONA = {
  street: "100 W Washington St",
  city: "Phoenix",
  state: "AZ",
  zipCode: "85003",
};

const ANSWERS: SetupInterviewAnswers = {
  state: "AZ",
  tipPreset: "POOL_BY_HOURS",
  payFrequency: "BIWEEKLY",
  payrollMode: "FILE",
  usesSchedule: false,
};

test.describe.configure({ mode: "serial" });

test.describe("Back-office setup interview (API) @staff-setup", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenants and grants add-ons"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let plainToken = "";
  let plainRestaurantId = "";

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    adminToken = (
      await apiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    ).accessToken;
    const az = await createSecondOwner(adminToken, `${runId}az`, {
      restaurant: ARIZONA,
    });
    if (!az.restaurantId) throw new Error("[api-setup-interview] no AZ tenant");
    restaurantId = az.restaurantId;
    ownerToken = az.accessToken;
    for (const f of ["SCHEDULING", "TIP_MANAGEMENT"]) {
      const r = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        f,
        true
      );
      if (!r.ok)
        throw new Error(
          `[api-setup-interview] ${f}: ${JSON.stringify(r.data)}`
        );
    }
    const plain = await createSecondOwner(adminToken, `${runId}fl`, {
      alwaysFresh: true,
    });
    if (!plain.restaurantId)
      throw new Error("[api-setup-interview] no plain tenant");
    plainRestaurantId = plain.restaurantId;
    plainToken = plain.accessToken;
  });

  test.afterAll(async () => {
    for (const rid of [restaurantId, plainRestaurantId])
      if (adminToken && rid)
        await deleteTestRestaurant(adminToken, rid).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Back-office setup interview (API)");
    await allure.label("severity", "critical");
    requireRelease(
      "staffSetupStage6",
      await probeStaffSetupStage6(ownerToken, restaurantId)
    );
  });

  test("TC-1700: GET asks an Arizona counter-service owner five questions, pre-filled from the address, as text", async () => {
    const res = await setupInterviewRaw(ownerToken, restaurantId);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const d = res.data.data as Rec;
    expect(d.available).toBe(true);
    expect(d.answered).toBe(false);
    const state = d.state as Rec;
    expect(state.value).toBe("AZ");
    expect(state.name).toBe("Arizona");
    expect(looksLikeKey(state.note)).toBe(false);
    // Counter service (no table service): pool by hours is recommended.
    const tips = d.tips as Rec;
    expect(tips.recommended).toBe("POOL_BY_HOURS");
    expect(ids(tips.options)).toEqual([
      "POOL_BY_HOURS",
      "SERVER_TIP_OUT",
      "KEEP_OWN",
    ]);
    for (const o of list(tips.options)) {
      expect(looksLikeKey(o.label)).toBe(false);
      expect(looksLikeKey(o.help)).toBe(false);
    }
    const freq = d.payFrequency as Rec;
    expect(ids(freq.options)).toEqual([
      "WEEKLY",
      "BIWEEKLY",
      "SEMIMONTHLY",
      "MONTHLY",
    ]);
    // Arizona's rule asks for at least twice a month: monthly is flagged
    // (WARN while the rule is DRAFT, REFUSED once confirmed), with a note.
    const monthly = list(freq.options).find((o) => o.id === "MONTHLY") as Rec;
    expect(["WARN", "REFUSED"]).toContain(monthly.verdict);
    expect(looksLikeKey(monthly.note)).toBe(false);
    const weekly = list(freq.options).find((o) => o.id === "WEEKLY") as Rec;
    expect(weekly.verdict).toBe("OK");
    // No Payroll add-on: RestauNax Payroll isn't offered.
    expect(ids((d.payrollMode as Rec).options)).toEqual(["FILE", "OWN_GUSTO"]);
    expect((d.payrollMode as Rec).value).toBeNull();
    expect(d.scheduling).toEqual({ value: true });
    // The checklist offers the interview.
    const setup = await backOfficeSetupRaw(ownerToken, restaurantId);
    expect((setup.data.data as Rec).interview).toEqual({
      available: true,
      answered: false,
    });
  });

  test("TC-1701: POST writes the five settings in one go; the checklist reads them as done; the history has a row per answer", async () => {
    const res = await setupInterviewRaw(ownerToken, restaurantId, ANSWERS);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const d = res.data.data as Rec;
    expect(d.skipped).toEqual([]);
    // No tipped job yet: the pool preset makes one.
    expect(d.createdJobs).toEqual(["Counter"]);
    expect(looksLikeKey(res.data.message)).toBe(false);

    const settings = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/settings"
    );
    const s = ((settings.data.data as Rec | undefined)?.settings ?? {}) as Rec;
    // An Arizona owner ends on their state's rules, never a fixed FEDERAL.
    expect((s.overtime as Rec).preset).toBe("STATE");
    expect(s.payFrequency).toBe("BIWEEKLY");
    expect(s.payrollMode).toBe("FILE");
    expect((s.scheduling as Rec).usesSchedule).toBe(false);
    expect((s.scheduling as Rec).clockInRule).toBe("OFF");

    const policy = await tipsRaw(ownerToken, restaurantId, "GET", "/policy");
    const pool = (policy.data.data as Rec & { policy: Rec }).policy.pool as Rec;
    expect(pool.enabled).toBe(true);
    expect(pool.splitWithinJob).toBe("BY_HOURS");
    expect(list(pool.contributors)).toHaveLength(1);

    const checklist = d.checklist as Rec;
    const status = Object.fromEntries(
      list(checklist.steps).map((st) => [String(st.id), st.status])
    );
    for (const id of [
      "jobs",
      "paySchedule",
      "tipRules",
      "payrollMode",
      "publishSchedule",
    ])
      expect(status[id], id).toBe("done");
    expect(checklist.interview).toEqual({ available: true, answered: true });

    const history = await settingChangesRaw(ownerToken, restaurantId, {
      area: "staff",
      limit: 50,
    });
    expect(history.status).toBe(200);
    const fields = (history.data.data?.items ?? []).map((i) => i.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "payroll.payrollMode",
        "payroll.tipPreset",
        "payroll.usesSchedule",
        "payroll.job",
      ])
    );
    for (const item of history.data.data?.items ?? []) {
      expect(item.area).toBe("staff");
      expect(looksLikeKey(item.sentence)).toBe(false);
    }
  });

  test("TC-1702: answering again with the same answers changes nothing", async () => {
    const res = await setupInterviewRaw(ownerToken, restaurantId, ANSWERS);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const d = res.data.data as Rec;
    expect(d.createdJobs).toEqual([]);
    expect(d.changes).toBe(0);
    const read = await setupInterviewRaw(ownerToken, restaurantId);
    const view = read.data.data as Rec;
    expect(view.answered).toBe(true);
    expect((view.tips as Rec).current).toBe("POOL_BY_HOURS");
    expect((view.payrollMode as Rec).value).toBe("FILE");
    expect(view.scheduling).toEqual({ value: false });
  });

  test("TC-1703: an add-on the restaurant doesn't hold is skipped with a sentence (ES); a DRAFT-flagged schedule saves with a warning", async () => {
    const res = await setupInterviewRaw(
      ownerToken,
      restaurantId,
      { ...ANSWERS, payrollMode: "RESTAUNAX_PAYROLL" },
      { "Accept-Language": "es" }
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const skipped = list((res.data.data as Rec).skipped);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      question: "payrollMode",
      reason: "NO_ADDON",
    });
    expect(String(skipped[0]?.message)).toContain("complemento");
    const provider = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "GET",
      ""
    );
    expect((provider.data.data as Rec).chosenMode).toBe("FILE");

    // Monthly in Arizona: a DRAFT rule warns (and saves); a CONFIRMED one
    // would refuse with PAY_FREQUENCY_NOT_ALLOWED and save nothing.
    const monthly = await setupInterviewRaw(ownerToken, restaurantId, {
      ...ANSWERS,
      payFrequency: "MONTHLY",
    });
    if (monthly.status === 400) {
      expect(monthly.data.error).toBe("PAY_FREQUENCY_NOT_ALLOWED");
      expect(looksLikeKey(monthly.data.message)).toBe(false);
    } else {
      expect(monthly.status, JSON.stringify(monthly.data)).toBe(200);
      const warnings = list((monthly.data.data as Rec).warnings);
      expect(warnings[0]).toMatchObject({
        code: "PAY_FREQUENCY_BELOW_STATE",
        minimum: "SEMIMONTHLY",
      });
      expect(looksLikeKey(warnings[0]?.message)).toBe(false);
    }
    // Back to every two weeks for the specs that follow.
    const back = await setupInterviewRaw(ownerToken, restaurantId, ANSWERS);
    expect(back.status).toBe(200);
  });

  test("TC-1704: refuses a state that isn't the address's, and an answer that isn't a choice", async () => {
    const texas = await setupInterviewRaw(ownerToken, restaurantId, {
      ...ANSWERS,
      state: "TX",
    });
    expect(texas.status).toBe(400);
    expect(texas.data.error).toBe("STATE_NOT_ADDRESS");
    expect(String(texas.data.message)).toContain("AZ");
    // The full name of the same state is the same state.
    const arizona = await setupInterviewRaw(ownerToken, restaurantId, {
      ...ANSWERS,
      state: "Arizona",
    });
    expect(arizona.status).toBe(200);
    const daily = await setupInterviewRaw(ownerToken, restaurantId, {
      ...ANSWERS,
      payFrequency: "DAILY",
    });
    expect(daily.status).toBe(400);
    expect(daily.data.error).toBe("INVALID_ANSWER");
    const noMode = await setupInterviewRaw(ownerToken, restaurantId, {
      ...ANSWERS,
      payrollMode: undefined,
    });
    expect(noMode.status).toBe(400);
    expect(noMode.data.error).toBe("INVALID_ANSWER");
  });

  test("TC-1705: another owner is refused; without Timecards GET says unavailable and POST is 403; no token is 401", async () => {
    const otherRead = await setupInterviewRaw(plainToken, restaurantId);
    expect([403, 404]).toContain(otherRead.status);
    const otherWrite = await setupInterviewRaw(
      plainToken,
      restaurantId,
      ANSWERS
    );
    expect([403, 404]).toContain(otherWrite.status);

    const plainRead = await setupInterviewRaw(plainToken, plainRestaurantId);
    expect(plainRead.status, "a screen load never 403s").toBe(200);
    expect((plainRead.data.data as Rec).available).toBe(false);
    const plainWrite = await setupInterviewRaw(plainToken, plainRestaurantId, {
      ...ANSWERS,
      state: null,
    });
    expect(plainWrite.status).toBe(403);
    expect(plainWrite.data.error).toBe("FEATURE_NOT_ENTITLED");

    const anon = await apiRequestRaw(
      "POST",
      `/restaurant/${restaurantId}/back-office/setup-interview`,
      ANSWERS
    );
    expect(anon.status).toBe(401);
  });

  test("TC-1706: a chosen Gusto adds 'Connect your Gusto account' to the checklist; the payroll file needs nothing more", async () => {
    const gusto = await setupInterviewRaw(ownerToken, restaurantId, {
      ...ANSWERS,
      payrollMode: "OWN_GUSTO",
    });
    expect(gusto.status, JSON.stringify(gusto.data)).toBe(200);
    const steps = list(((gusto.data.data as Rec).checklist as Rec).steps);
    const connect = steps.find((s) => s.id === "payrollConnect");
    expect(connect?.title).toBe("Connect your Gusto account");
    expect(steps.find((s) => s.id === "payrollMode")?.status).toBe("done");
    const file = await setupInterviewRaw(ownerToken, restaurantId, ANSWERS);
    const after = list(((file.data.data as Rec).checklist as Rec).steps);
    expect(after.some((s) => s.id === "payrollConnect")).toBe(false);
  });
});
