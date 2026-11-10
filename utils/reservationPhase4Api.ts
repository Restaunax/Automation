/**
 * reservationPhase4Api.ts — shared helpers for the Phase 4 reservation specs
 * (online waitlist, server rotation, deposits): routes, a throwaway tenant, and
 * two LOCAL-ONLY reaches into the database. Spec: PHASE4 contracts A/B/C,
 * restaunax/docs/features/TABLE_RESERVATIONS.md.
 */
import { execFileSync } from "child_process";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createReservationServicePeriodOwnerRaw,
  createSecondOwner,
  createTableOwnerRaw,
  createTabletDevice,
  getRestaurantTimeZonePublic,
  putReservationSettingsOwnerRaw,
  setFeatureOverrideAdminRaw,
  setOwnerPosPin,
  setRestaurantPublishedApi,
  tabletLogin,
  tabletStaffSignIn,
  updateRestaurantSettingsApi,
  type ApiMenuItem,
  type RawResponse,
} from "./apiHelper";
import { createChargeableTestAccount } from "./stripeTestMode";

type Json = Record<string, any>;

const staff = (session?: string) =>
  session ? { "x-staff-session": session } : undefined;

export const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

export const errorCode = (body: unknown): string =>
  body && typeof body === "object" && "errorCode" in body
    ? String((body as { errorCode: unknown }).errorCode)
    : "";

export const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

// ── Local database reach ────────────────────────────────────────────────────
//
// A few things can't be reached through a route: pointing a throwaway tenant at
// a Stripe account that can take charges (no route writes those columns), reading
// what was texted, and aging a row instead of sleeping for hours. Only ever a localhost
// database, never a DELETE. Unset on QA → those tests skip.

const localDbUrl = (): string => {
  const url = process.env.E2E_LOCAL_DATABASE_URL ?? "";
  if (!url) return "";
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1")
    throw new Error("E2E_LOCAL_DATABASE_URL must point at localhost");
  return url;
};

export const localDbReady = (): boolean => !!localDbUrl();

/** Run one statement; rows come back as JSON objects. */
export function localSql<T = Json>(sql: string): T[] {
  if (/^\s*(delete|drop|truncate)\b/i.test(sql))
    throw new Error("localSql never deletes (the local DB keeps every row)");
  const wrapped = /^\s*select\b/i.test(sql)
    ? `select coalesce(json_agg(q), '[]') from (${sql}) q`
    : sql;
  let out: string;
  try {
    out = execFileSync(
      "psql",
      [localDbUrl(), "-At", "-v", "ON_ERROR_STOP=1", "-c", wrapped],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
  } catch (err) {
    // The exec error's message carries the command line, password included.
    const stderr = String((err as { stderr?: unknown }).stderr ?? "");
    throw new Error(`psql failed: ${stderr.trim()}`);
  }
  return /^\s*select\b/i.test(sql) ? (JSON.parse(out) as T[]) : [];
}

/** SmsLog rows for a booking, oldest first. */
export const smsTypesOf = (reservationId: string): string[] =>
  localSql<{ smsType: string }>(
    `select "smsType" from "SmsLog" where "reservationId" = '${reservationId}' order by "createdAt"`
  ).map((r) => r.smsType);

/** Point a tenant at a real connected account. */
export function linkStripeAccountLocally(
  restaurantId: string,
  account: string
): void {
  if (!/^acct_[A-Za-z0-9]+$/.test(account))
    throw new Error("not a Stripe account id");
  localSql(
    `update "Restaurant" set "stripeAccountId" = '${account}', "stripeChargesEnabled" = true, "stripePayoutsEnabled" = true where id = '${restaurantId}'`
  );
}

// ── Throwaway tenant ────────────────────────────────────────────────────────

export interface Phase4Tenant {
  adminToken: string;
  token: string;
  ownerEmail: string;
  ownerPassword: string;
  restaurantId: string;
  timeZone: string;
  item: ApiMenuItem;
  tabletToken: string;
  deviceId: string;
  managerId: string;
  managerSession: string;
  managerPin: string;
  tableId: string;
  /** Empty unless minted with `stripe: true`. */
  stripeAccountId: string;
}

export const ITEM_PRICE = 10;

export async function mintPhase4Tenant(
  runId: string,
  {
    addOn = true,
    tableCapacity = 4,
    onlineBooking = true,
    maxPartiesPerSlot = 2,
    stripe = false,
    label = "Phase4",
  }: {
    addOn?: boolean;
    /** null = no table at all. */
    tableCapacity?: number | null;
    onlineBooking?: boolean;
    maxPartiesPerSlot?: number;
    stripe?: boolean;
    label?: string;
  } = {}
): Promise<Phase4Tenant> {
  const adminToken = (
    await apiLogin(
      process.env.ADMIN_EMAIL ?? "",
      process.env.ADMIN_PASSWORD ?? ""
    )
  ).accessToken;
  const owner = await createSecondOwner(
    adminToken,
    `${runId}${label}`.toLowerCase(),
    {
      alwaysFresh: true,
    }
  );
  if (!owner.restaurantId) throw new Error("could not mint a tenant");
  const restaurantId = owner.restaurantId;
  const token = owner.accessToken;
  const timeZone =
    (await getRestaurantTimeZonePublic(restaurantId)) || "America/New_York";

  await updateRestaurantSettingsApi(token, restaurantId, {
    tableServiceEnabled: true,
    acceptingOrders: true,
  });
  if (addOn) {
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok) throw new Error(`add-on grant: ${msg(grant.data)}`);
  }
  await setRestaurantPublishedApi(adminToken, restaurantId, true);
  let stripeAccountId = "";
  if (stripe) {
    stripeAccountId = await createChargeableTestAccount();
    linkStripeAccountLocally(restaurantId, stripeAccountId);
  }

  const groupId = (
    await createMenuGroupNamed(token, `Automation ${label} ${runId}`, {
      restaurantId,
    })
  ).id;
  const item = await createMenuItemFull(
    token,
    groupId,
    `${label} Burger ${runId}`,
    ITEM_PRICE
  );
  const device = await createTabletDevice(
    adminToken,
    restaurantId,
    `Automation ${label} POS ${runId}`
  );
  const tabletToken = await tabletLogin(device.name, device.code);
  const managerPin = "8462";
  const managerId = await setOwnerPosPin(token, restaurantId, managerPin);
  const managerSession = await tabletStaffSignIn(
    tabletToken,
    managerId,
    managerPin
  );

  let tableId = "";
  if (tableCapacity !== null) {
    const table = await createTableOwnerRaw(token, restaurantId, {
      name: `Table ${runId}`,
      capacity: tableCapacity,
    });
    if (table.status !== 201) throw new Error(`table: ${msg(table.data)}`);
    tableId = unwrap(table).id;
  }

  if (addOn) {
    const s = await putReservationSettingsOwnerRaw(token, restaurantId, {
      advanceBookingDays: 30,
      minNoticeMinutes: 0,
    });
    if (!s.ok) throw new Error(`settings: ${msg(s.data)}`);
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const period = await createReservationServicePeriodOwnerRaw(
        token,
        restaurantId,
        {
          name: `Full Day ${dayOfWeek} ${runId}`,
          dayOfWeek,
          startTime: "00:00",
          endTime: "23:45",
          slotIntervalMinutes: 15,
          maxPartiesPerSlot,
          isActive: true,
        }
      );
      if (!period.ok) throw new Error(`period: ${msg(period.data)}`);
    }
    if (onlineBooking && tableCapacity !== null) {
      const online = await putReservationSettingsOwnerRaw(token, restaurantId, {
        onlineBookingEnabled: true,
      });
      if (!online.ok) throw new Error(`online: ${msg(online.data)}`);
    }
  }

  return {
    adminToken,
    token,
    ownerEmail: owner.email,
    ownerPassword:
      owner.password ?? "Automation!Owner2-" + `${runId}${label}`.toLowerCase(),
    restaurantId,
    timeZone,
    item,
    tabletToken,
    deviceId: device.id,
    managerId,
    managerSession,
    managerPin,
    tableId,
    stripeAccountId,
  };
}

/** A check on a table. */
export const openCheckBody = (
  t: Phase4Tenant,
  tableId: string,
  extra: Json = {},
  price = ITEM_PRICE,
  quantity = 1
) => ({
  restaurantId: t.restaurantId,
  orderType: "PICKUP",
  subtotal: price * quantity,
  tax: 0,
  tip: 0,
  total: price * quantity,
  customerPhone: "",
  orderItems: [
    {
      menuItemId: t.item.id,
      menuItemName: t.item.name,
      quantity,
      price,
    },
  ],
  openCheck: true,
  tableId,
  ...extra,
});

// ── A. Online waitlist ──────────────────────────────────────────────────────

export const getPublicWaitlistRaw = (
  rid: string,
  partySize?: number | string
) =>
  apiRequestRaw<Json>(
    "GET",
    `/api/public/restaurants/${rid}/waitlist${partySize !== undefined ? `?partySize=${partySize}` : ""}`
  );

export const joinPublicWaitlistRaw = (
  rid: string,
  body: Json,
  headers?: Record<string, string>
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/public/restaurants/${rid}/waitlist`,
    body,
    undefined,
    headers
  );

export const onlinePauseTabletRaw = (
  tablet: string,
  session: string,
  body: Json
) =>
  apiRequestRaw<Json>(
    "POST",
    "/api/tablet/waitlist/online-pause",
    body,
    tablet,
    staff(session)
  );

export const onlinePauseOwnerRaw = (token: string, rid: string, body: Json) =>
  apiRequestRaw<Json>(
    "POST",
    `/restaurant/${rid}/reservation-settings/online-waitlist-pause`,
    body,
    token
  );

// ── B. Server rotation ──────────────────────────────────────────────────────

export const getRotationRaw = (tablet: string, session?: string) =>
  apiRequestRaw<Json>(
    "GET",
    "/api/tablet/floor/rotation",
    undefined,
    tablet,
    staff(session)
  );

export const setRotationExcludedRaw = (
  tablet: string,
  session: string,
  staffMemberId: string,
  excluded: unknown
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/tablet/floor/rotation/${staffMemberId}/exclude`,
    { excluded },
    tablet,
    staff(session)
  );

export const clockInRaw = (tablet: string, body: Json) =>
  apiRequestRaw<Json>("POST", "/api/tablet/staff/clock-in", body, tablet);

export const clockOutRaw = (tablet: string, body: Json) =>
  apiRequestRaw<Json>("POST", "/api/tablet/staff/clock-out", body, tablet);

export const seatWalkInWithServerRaw = (
  tablet: string,
  session: string,
  tableId: string,
  body: Json
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/tablet/tables/${tableId}/seat`,
    body,
    tablet,
    staff(session)
  );

export const seatReservationWithServerRaw = (
  tablet: string,
  session: string,
  reservationId: string,
  body: Json
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/tablet/reservations/${reservationId}/seat`,
    body,
    tablet,
    staff(session)
  );

// ── C. Deposits ─────────────────────────────────────────────────────────────

const rulesPath = (rid: string) =>
  `/restaurant/${rid}/reservation-deposit-rules`;

export const listDepositRulesRaw = (token: string, rid: string) =>
  apiRequestRaw<Json>("GET", rulesPath(rid), undefined, token);

export const createDepositRuleRaw = (token: string, rid: string, body: Json) =>
  apiRequestRaw<Json>("POST", rulesPath(rid), body, token);

export const updateDepositRuleRaw = (
  token: string,
  rid: string,
  ruleId: string,
  body: Json
) => apiRequestRaw<Json>("PUT", `${rulesPath(rid)}/${ruleId}`, body, token);

export const deleteDepositRuleRaw = (
  token: string,
  rid: string,
  ruleId: string
) =>
  apiRequestRaw<Json>(
    "DELETE",
    `${rulesPath(rid)}/${ruleId}`,
    undefined,
    token
  );

export const depositQuoteOwnerRaw = (
  token: string,
  rid: string,
  scheduledAt: string,
  partySize: number | string
) =>
  apiRequestRaw<Json>(
    "GET",
    `/restaurant/${rid}/reservations/deposit-quote?scheduledAt=${encodeURIComponent(scheduledAt)}&partySize=${partySize}`,
    undefined,
    token
  );

export const depositQuoteTabletRaw = (
  tablet: string,
  session: string,
  scheduledAt: string,
  partySize: number | string
) =>
  apiRequestRaw<Json>(
    "GET",
    `/api/tablet/reservations/deposit-quote?scheduledAt=${encodeURIComponent(scheduledAt)}&partySize=${partySize}`,
    undefined,
    tablet,
    staff(session)
  );

export const acceptDepositPolicyRaw = (manageToken: string, body: Json) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/public/reservations/manage/${manageToken}/deposit/accept`,
    body
  );

export const refundDepositOwnerRaw = (
  token: string,
  rid: string,
  reservationId: string,
  body: Json
) =>
  apiRequestRaw<Json>(
    "POST",
    `/restaurant/${rid}/reservations/${reservationId}/deposit/refund`,
    body,
    token
  );

export const refundDepositTabletRaw = (
  tablet: string,
  session: string,
  reservationId: string,
  body: Json
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/tablet/reservations/${reservationId}/deposit/refund`,
    body,
    tablet,
    staff(session)
  );

export const sendDepositLinkOwnerRaw = (
  token: string,
  rid: string,
  reservationId: string
) =>
  apiRequestRaw<Json>(
    "POST",
    `/restaurant/${rid}/reservations/${reservationId}/deposit/send-link`,
    undefined,
    token
  );

export const sendDepositLinkTabletRaw = (
  tablet: string,
  session: string,
  reservationId: string
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/tablet/reservations/${reservationId}/deposit/send-link`,
    undefined,
    tablet,
    staff(session)
  );

export const searchReservationsOwnerRaw = (
  token: string,
  rid: string,
  q: string,
  limit?: number
) =>
  apiRequestRaw<Json>(
    "GET",
    `/restaurant/${rid}/reservations/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}`,
    undefined,
    token
  );

export const searchReservationsTabletRaw = (
  tablet: string,
  session: string,
  q: string
) =>
  apiRequestRaw<Json>(
    "GET",
    `/api/tablet/reservations/search?q=${encodeURIComponent(q)}`,
    undefined,
    tablet,
    staff(session)
  );

export const closeCoveredRaw = (
  tablet: string,
  session: string,
  orderId: string
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/tablet/orders/${orderId}/tab/close-covered`,
    undefined,
    tablet,
    staff(session)
  );

export const voidLegRaw = (
  tablet: string,
  session: string,
  orderId: string,
  legId: string,
  body: Json = {}
) =>
  apiRequestRaw<Json>(
    "POST",
    `/api/tablet/orders/${orderId}/tab/legs/${legId}/void`,
    body,
    tablet,
    staff(session)
  );

export const voidLegPreviewRaw = (
  tablet: string,
  session: string,
  orderId: string,
  legId: string
) =>
  apiRequestRaw<Json>(
    "GET",
    `/api/tablet/orders/${orderId}/tab/legs/${legId}/void-preview`,
    undefined,
    tablet,
    staff(session)
  );

export type { RawResponse };
