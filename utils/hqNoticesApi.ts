/**
 * hqNoticesApi.ts — HQ notices (RestauNax PR #1174, docs/features/HQ_NOTICES.md).
 *
 * Admin routes `/api/admin/notices/*` are gated by the HQ permission
 * HQ_OPERATIONS_NOTICES; `/api/notices/unsubscribe` and `/resubscribe` are
 * public (the signed token is the credential). Every wrapper is RAW (status +
 * body) so specs can assert refusals as well as successes. Success bodies are
 * `{ success: true, data }`.
 *
 * Sends from the E2E suite must ALWAYS use `restaurantScope: "CHOSEN"` with
 * the suite's own throwaway restaurant — `chosenAudience` is the only builder
 * here, so a spec cannot reach every restaurant on QA by accident.
 */
import { expect } from "@playwright/test";
import { apiRequestRaw, type RawResponse } from "./apiHelper";

export type NoticeType = "SERVICE" | "PRODUCT_UPDATE" | "TRAINING" | "LEGAL";
export type NoticeChannel = "EMAIL" | "PUSH";
export type NoticeGroup = "OWNERS" | "MANAGERS" | "TEAM" | "AFFILIATES";
export type NoticeStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "CANCELLED";

export interface NoticeAudience {
  groups: NoticeGroup[];
  restaurantScope: "CHOSEN";
  restaurantIds: string[];
  liveOnly: boolean;
}

/**
 * The only audience the suite sends to: one (or more) restaurants it created.
 * `liveOnly: false` because a throwaway restaurant is never activated.
 */
export const chosenAudience = (
  restaurantIds: string[],
  groups: NoticeGroup[]
): NoticeAudience => {
  if (restaurantIds.length === 0 || restaurantIds.some((id) => !id))
    throw new Error("[hqNoticesApi] a notice audience needs restaurant ids");
  return { groups, restaurantScope: "CHOSEN", restaurantIds, liveOnly: false };
};

export interface NoticeRow {
  id: string;
  type: NoticeType;
  status: NoticeStatus;
  channels: NoticeChannel[];
  sendAt?: string | null;
  sentAt?: string | null;
}

export interface AudienceCount {
  people: number;
  restaurants: number;
  withPush: number;
  teamWithoutEmail: number;
}

export interface ReportRecipient {
  id: string;
  email: string;
  name: string | null;
  emailStatus: string;
  emailSkipReason: string | null;
  pushStatus: string;
  pushSkipReason: string | null;
}

export interface NoticeReport {
  notice: { id: string; type: NoticeType; status: NoticeStatus };
  counts: { EMAIL: Record<string, number>; PUSH: Record<string, number> };
  skipReasons: {
    EMAIL: Record<string, number>;
    PUSH: Record<string, number>;
  };
  recipients: { total: number; items: ReportRecipient[] };
}

type Body<T> = { success?: boolean; data?: T; error?: string };

const admin = <T>(
  token: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<RawResponse<Body<T>>> =>
  apiRequestRaw(method, `/api/admin/notices${path}`, body, token);

export const listNoticesRaw = (token: string) =>
  admin<{ items: NoticeRow[]; total: number }>(token, "GET", "?pageSize=5");

export const createNoticeRaw = (
  token: string,
  body: {
    type: NoticeType;
    channels: NoticeChannel[];
    audience: NoticeAudience;
    subject: string;
    bodyHtml?: string;
    urgency?: "NORMAL" | "URGENT";
  }
) =>
  admin<NoticeRow>(token, "POST", "", {
    type: body.type,
    urgency: body.urgency ?? "NORMAL",
    channels: body.channels,
    audience: body.audience,
    // English only: one email per person, whatever their language.
    englishOnly: true,
    content: {
      en: {
        subject: body.subject,
        bodyHtml:
          body.bodyHtml ??
          `<p>Automated end-to-end check (${body.subject}). Nothing to do.</p>`,
      },
    },
  });

export const patchNoticeRaw = (
  token: string,
  id: string,
  patch: Record<string, unknown>
) => admin<NoticeRow>(token, "PATCH", `/${id}`, patch);

export const getNoticeRaw = (token: string, id: string) =>
  admin<NoticeRow>(token, "GET", `/${id}`);

export const countAudienceRaw = (
  token: string,
  type: NoticeType,
  audience: NoticeAudience
) => admin<AudienceCount>(token, "POST", "/audience/count", { type, audience });

export const sendNoticeRaw = (token: string, id: string) =>
  admin<{ status: NoticeStatus }>(token, "POST", `/${id}/send`, {});

export const testNoticeRaw = (token: string, id: string) =>
  admin<{
    results: { locale: string; channel: string; status: string }[];
  }>(token, "POST", `/${id}/test`, {});

export const scheduleNoticeRaw = (
  token: string,
  id: string,
  scheduledLocal: string
) =>
  admin<{ status: NoticeStatus; sendAt: string }>(
    token,
    "POST",
    `/${id}/schedule`,
    { scheduledLocal }
  );

export const cancelNoticeRaw = (token: string, id: string) =>
  admin<{ status: NoticeStatus }>(token, "POST", `/${id}/cancel`, {});

export const noticeReportRaw = (token: string, id: string) =>
  admin<NoticeReport>(token, "GET", `/${id}/report?pageSize=100`);

/** POST /api/notices/unsubscribe|resubscribe — public, `{ token }`. */
export const noticeOptRaw = (
  kind: "unsubscribe" | "resubscribe",
  token: string
) =>
  apiRequestRaw<Body<{ category: string }>>("POST", `/api/notices/${kind}`, {
    token,
  });

/** Create a notice and fail with the server's answer unless it is 201. */
export async function createNotice(
  token: string,
  body: Parameters<typeof createNoticeRaw>[1]
): Promise<NoticeRow> {
  const res = await createNoticeRaw(token, body);
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.data as NoticeRow;
}

/** Send now and wait until the notice is SENT (every channel decided). */
export async function sendAndWait(
  token: string,
  id: string,
  timeoutMs = 120_000
): Promise<NoticeReport> {
  const sent = await sendNoticeRaw(token, id);
  expect(sent.status, JSON.stringify(sent.data)).toBe(200);
  await waitForNoticeStatus(token, id, ["SENT"], timeoutMs);
  const report = await noticeReportRaw(token, id);
  expect(report.status, JSON.stringify(report.data)).toBe(200);
  return report.data.data as NoticeReport;
}

/** Poll GET /:id until its status is one of `statuses`. */
export async function waitForNoticeStatus(
  token: string,
  id: string,
  statuses: NoticeStatus[],
  timeoutMs = 120_000
): Promise<NoticeRow> {
  let last: NoticeRow | undefined;
  await expect
    .poll(
      async () => {
        const res = await getNoticeRaw(token, id);
        last = res.data.data;
        return last?.status;
      },
      {
        timeout: timeoutMs,
        intervals: [1_000, 2_000, 3_000],
        message: `notice ${id} never reached ${statuses.join("/")}`,
      }
    )
    .toEqual(expect.stringMatching(new RegExp(`^(${statuses.join("|")})$`)));
  return last as NoticeRow;
}

/** The report row for one address (case-insensitive). */
export const recipientRow = (
  report: NoticeReport,
  email: string
): ReportRecipient | undefined =>
  report.recipients.items.find(
    (r) => r.email.toLowerCase() === email.toLowerCase()
  );

/**
 * The signed unsubscribe token from a notice email body. The HTML part
 * encodes `=` (`token&#x3D;…`); the text part keeps it raw. Tokens are
 * `<base64url payload>.<base64url signature>`.
 */
export function extractUnsubscribeToken(body: string): string | undefined {
  const m = body.match(
    /\/notices\/unsubscribe\?token(?:=|&#x3d;|&#61;|%3d)([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i
  );
  return m?.[1];
}

/** True when the body carries an unsubscribe link of any form. */
export const hasUnsubscribeLink = (body: string): boolean =>
  /\/notices\/unsubscribe/i.test(body);

// ── Permissions (the one under test is named; the catalog is not) ─────────

export const NOTICES_PERMISSION = "HQ_OPERATIONS_NOTICES";

interface UserPermissionsBody {
  allPermissions?: string[];
  availablePermissions?: string[];
}

export async function userPermissions(
  adminToken: string,
  userId: string
): Promise<UserPermissionsBody> {
  const res = await apiRequestRaw<UserPermissionsBody>(
    "GET",
    `/api/roles/users/${userId}/permissions`,
    undefined,
    adminToken
  );
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  return res.data;
}

/**
 * Give `userId` the notices permission (POST clears an earlier revoke too)
 * or take it away (DELETE writes a revoke when the role confers it, deletes
 * the extra grant otherwise). No-op when the user is already in that state.
 */
export async function setNoticesPermission(
  adminToken: string,
  userId: string,
  on: boolean
): Promise<void> {
  const before = await userPermissions(adminToken, userId);
  const has = (before.allPermissions ?? []).includes(NOTICES_PERMISSION);
  if (has === on) return;
  const res = on
    ? await apiRequestRaw(
        "POST",
        `/api/roles/users/${userId}/permissions`,
        { permission: NOTICES_PERMISSION },
        adminToken
      )
    : await apiRequestRaw(
        "DELETE",
        `/api/roles/users/${userId}/permissions/${NOTICES_PERMISSION}`,
        undefined,
        adminToken
      );
  expect(
    res.ok,
    `${on ? "grant" : "revoke"}: ${JSON.stringify(res.data)}`
  ).toBe(true);
  const after = await userPermissions(adminToken, userId);
  expect((after.allPermissions ?? []).includes(NOTICES_PERMISSION)).toBe(on);
}

// ── Scheduling ─────────────────────────────────────────────────────────────

/** "YYYY-MM-DDTHH:mm" for `at` as wall-clock time in `timeZone`. */
export function localMinute(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}
