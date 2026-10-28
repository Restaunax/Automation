/**
 * backOfficeApi.ts — helpers for the back office "next level" specs
 * (RestauNax PR #1074; spec restaunax
 * docs/superpowers/specs/2026-10-27-back-office-next-level/README.md).
 *
 * Endpoints (all owner JWT unless noted):
 *   GET  /api/staff/back-office/:rid/setup            — the setup checklist
 *   GET  /api/staff/payroll/:rid/pay-periods/:start/payday — Payday header
 *   GET  /api/needs-you/restaurant/:rid · /api/needs-you/mine
 *   GET|POST /api/restaurantId/:rid/special-hours · PUT|DELETE …/:id
 *   GET  /api/restaurantId/:rid/ordering-status
 *   GET  /api/restaurantId/:rid/settings/changes?area=&limit=
 *   GET|PUT /api/owner-settings/reports/:rid          — morningSummaryEnabled
 *
 * Every text field these return is resolved on the server (never an i18n
 * key), so specs assert the English sentence.
 */
import {
  apiRequestRaw,
  createStaffJobRaw,
  payrollRaw,
  putPayrollSettingsRaw,
  setMemberJobsRaw,
  setOwnerPosPin,
  type LooseJson,
  type RawResponse,
} from "./apiHelper";

type Rec = Record<string, LooseJson>;

/** True when a resolved-text field leaked an i18n key instead. */
export const looksLikeKey = (text: unknown): boolean =>
  typeof text !== "string" ||
  text.length === 0 ||
  /^(api|error|email):/.test(text) ||
  /^[a-z]+(\.[a-zA-Z0-9]+){2,}$/.test(text);

export const backOfficeSetupRaw = (token: string, rid: string) =>
  apiRequestRaw<{ success?: boolean; data?: Rec }>(
    "GET",
    `/api/staff/back-office/${rid}/setup`,
    undefined,
    token
  );

export const paydayRaw = (token: string, rid: string, startDate: string) =>
  payrollRaw<{ success?: boolean; data?: Rec; message?: string }>(
    token,
    rid,
    "GET",
    `/pay-periods/${startDate}/payday`
  );

export const needsYouRaw = (token: string, rid: string) =>
  apiRequestRaw<{ success?: boolean; data?: Rec }>(
    "GET",
    `/api/needs-you/restaurant/${rid}`,
    undefined,
    token
  );

export const needsYouMineRaw = (token: string) =>
  apiRequestRaw<{ success?: boolean; data?: Rec }>(
    "GET",
    "/api/needs-you/mine",
    undefined,
    token
  );

export const specialHoursRaw = (
  token: string,
  rid: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  id?: string,
  body?: Record<string, unknown>
): Promise<
  RawResponse<{
    success?: boolean;
    data?: LooseJson;
    message?: string;
    timeZone?: string;
  }>
> =>
  apiRequestRaw(
    method,
    `/api/restaurantId/${rid}/special-hours${id ? `/${id}` : ""}`,
    body,
    token
  );

export const orderingStatusRaw = (token: string, rid: string) =>
  apiRequestRaw<{ success?: boolean; data?: Rec }>(
    "GET",
    `/api/restaurantId/${rid}/ordering-status`,
    undefined,
    token
  );

export interface SettingChangeItem {
  id: string;
  area: string;
  field: string;
  sentence: string;
  actorType: string;
  actorName: string | null;
  deviceName: string | null;
  source: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export const settingChangesRaw = (
  token: string,
  rid: string,
  query: { area?: string; limit?: number } = {}
) => {
  const qs = new URLSearchParams();
  if (query.area) qs.set("area", query.area);
  if (query.limit) qs.set("limit", String(query.limit));
  const q = qs.toString();
  return apiRequestRaw<{
    success?: boolean;
    data?: { items?: SettingChangeItem[]; areas?: { key: string }[] };
  }>(
    "GET",
    `/api/restaurantId/${rid}/settings/changes${q ? `?${q}` : ""}`,
    undefined,
    token
  );
};

export const reportSettingsRaw = (
  token: string,
  rid: string,
  body?: Record<string, unknown>
) =>
  apiRequestRaw<{ success?: boolean; data?: Rec; message?: string }>(
    body ? "PUT" : "GET",
    `/api/owner-settings/reports/${rid}`,
    body,
    token
  );

/** The restaurant's calendar date today, in its own zone (YYYY-MM-DD). */
export const localToday = (timeZone: string, at = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);

export const addDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * A finished pay period with hours waiting for approval: weekly periods
 * (anchor Sunday 2026-01-04), the owner's own POS membership on a job, and
 * one 4-hour manager-entered shift in the most recent FINISHED period. The
 * restaurant needs TIMECARDS (e.g. the SCHEDULING override). Returns the
 * period's startDate and the owner's staffMemberId.
 */
export async function seedPeriodAwaitingApproval(
  ownerToken: string,
  rid: string,
  runId: string,
  pin = "8462"
): Promise<{ startDate: string; endDate: string; staffMemberId: string }> {
  const saved = await putPayrollSettingsRaw(ownerToken, rid, {
    payFrequency: "WEEKLY",
    periodAnchorDate: "2026-01-04",
    workweekStartDay: 0,
  });
  if (!saved.ok)
    throw new Error(
      `[back-office] pay schedule: ${JSON.stringify(saved.data)}`
    );
  const me = await setOwnerPosPin(ownerToken, rid, pin);
  const job = await createStaffJobRaw(ownerToken, rid, {
    name: `Cook ${runId}`,
    defaultHourlyRateCents: 1500,
  });
  const jobId = String(job.data.data?.id ?? "");
  if (!jobId) throw new Error(`[back-office] job: ${JSON.stringify(job.data)}`);
  await setMemberJobsRaw(ownerToken, rid, me, [{ jobId, isPrimary: true }]);
  const periods = await payrollRaw(
    ownerToken,
    rid,
    "GET",
    "/pay-periods?count=4"
  );
  const list = (periods.data.data as Rec | undefined)?.periods;
  const finished = (Array.isArray(list) ? (list as Rec[]) : [])
    .filter((p) => p.status === "OPEN")
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const last = finished.at(-1);
  if (!last)
    throw new Error(
      `[back-office] no finished period: ${JSON.stringify(periods.data)}`
    );
  const startDate = String(last.startDate);
  const day = addDays(startDate, 2);
  const shift = await payrollRaw(ownerToken, rid, "POST", "/shifts", {
    staffMemberId: me,
    clockInAt: `${day}T14:00:00.000Z`,
    clockOutAt: `${day}T18:00:00.000Z`,
    jobId,
    reason: "Paper sheet",
  });
  if (shift.status !== 201)
    throw new Error(`[back-office] shift: ${JSON.stringify(shift.data)}`);
  return { startDate, endDate: String(last.endDate), staffMemberId: me };
}
