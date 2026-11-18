/**
 * 19-reservations-audit.spec.ts — the reservations audit fixes of 2026-10-31
 * (RestauNax fix/reservations-audit), API level. Spec:
 * restaunax/docs/features/TABLE_RESERVATIONS.md → "Reservations audit fixes".
 *
 * What it pins (TC-1129 → TC-1142):
 *   - `allergyAlert` on every staff row (host list, owner list, create and
 *     PATCH responses) — the shared detector (allerg*, anaphyla*, epi-pen,
 *     coeliac/celiac) over guestNotes + internalNotes;
 *   - `createdAt` on GET /api/tablet/host rows;
 *   - public availability (+ /days) carry `timeZone`, `minPartySize`,
 *     `maxPartySize`; slots are unique and sorted even where two booking
 *     windows overlap; the manage view carries `timeZone`;
 *   - public create caps (name 100, notes 500, email 254 + email shape);
 *   - checked staff edits (tablet + owner PATCH): waitlist entries in line
 *     take name/party/quote and keep their place, ARRIVED takes party size +
 *     notes, anything else 409 RESERVATION_NOT_EDITABLE, a bad quote 400, and
 *     a capacity edit answers the advisory `pacingExceeded` / `tablesExceeded`;
 *   - partial seating: /seat with fewer guests → PARTIALLY_SEATED, then
 *     status `seat` (or seating again) → SEATED;
 *   - a CONFIRMED booking links to a new check;
 *   - the booking-hours suggestion's `suggestedMaxPartiesPerSlot`;
 *   - switching phone-AI booking on needs a table with a capacity
 *     (RESERVATION_TABLES_REQUIRED; the online switch is TC-400 in 05);
 *   - WITHOUT the add-on: none of this opens up — the host-stand and owner
 *     reservation writes still refuse, and tables + open checks behave as
 *     before (a check opens on a table and the table is free again after).
 *
 * Own tenant, same shape as 09-table-hold: an admin-minted throwaway OWNER +
 * TABLE_RESERVATIONS + tableServiceEnabled, a REGISTER device and the owner's
 * MANAGER PIN session. Booking hours: a full-day window on every weekday,
 * paced at 2 parties per slot (online booking needs a cap), one 4-top, then
 * online booking ON. A second throwaway tenant (no add-on) serves the
 * "without the add-on" test and, once granted, the phone-AI tables guard.
 *
 * Deploy gate: every test skips (reason logged) until the backend change is
 * on the stack under test — `probeReservationsAudit`; flip
 * RELEASED_ON_QA.reservationsAudit once it is on QA.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId, generateGuestPhone } from "../../utils/testData";
import { localDateKey } from "../../utils/dealSchedule";
import {
  probeReservationsAudit,
  requireRelease,
} from "../../utils/releaseGate";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  setOwnerPosPin,
  tabletStaffSignIn,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  createTableOwnerRaw,
  listTablesOwnerRaw,
  setRestaurantPublishedApi,
  updateTableOwnerRaw,
  getFloorRaw,
  getReservationSettingsOwnerRaw,
  putReservationSettingsOwnerRaw,
  createReservationServicePeriodOwnerRaw,
  suggestReservationServicePeriodsOwnerRaw,
  createReservationOwnerRaw,
  patchReservationOwnerRaw,
  listReservationsOwnerRaw,
  createReservationTabletRaw,
  getHostRaw,
  notifyReservationTabletRaw,
  reservationStatusTabletRaw,
  seatReservationTabletRaw,
  updateReservationTabletRaw,
  getPublicAvailabilityRaw,
  getPublicAvailabilityDaysRaw,
  createPublicReservationRaw,
  getManagedReservationRaw,
  getRestaurantTimeZonePublic,
  type TabletDevice,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const ITEM_PRICE = 10;
const MINUTE = 60 * 1000;
/** The full-day windows' pacing cap (parties per slot). */
const PARTIES_PER_SLOT = 2;

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

const errorCode = (body: unknown): string =>
  body && typeof body === "object" && "errorCode" in body
    ? String((body as { errorCode: unknown }).errorCode)
    : "";

/** Every route here wraps its success payload in {success, data, message}. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("POS — Reservations audit fixes (2026-10-31)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let groupId = "";
  let item: ApiMenuItem;
  let device: TabletDevice | undefined;
  let tabletToken = "";
  let managerSession = "";
  const managerPin = "8462";
  /** The second throwaway tenant (no add-on until TC-1142 grants it). */
  let bare: { token: string; restaurantId: string } | null = null;
  const openedOrderIds: string[] = [];
  const bookingIds: string[] = [];
  let auditOnStack = false;
  let timeZone = "America/New_York";

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  let phoneSeq = 3000;
  const nextGuestPhone = (): string => {
    phoneSeq += 1;
    return generateGuestPhone(runId, phoneSeq);
  };

  /** `minutesFromNow`, floored to the 15-minute slot grid. */
  const slotAt = (minutesFromNow: number) => {
    const t = Date.now() + minutesFromNow * MINUTE;
    return new Date(Math.floor(t / (15 * MINUTE)) * 15 * MINUTE).toISOString();
  };

  /** Owner phone booking (ADVISORY) — tracked for afterAll cleanup. */
  const book = async (
    label: string,
    minutesFromNow: number,
    extra: Record<string, unknown> = {}
  ): Promise<any> => {
    const res = await createReservationOwnerRaw(token, restaurantId, {
      partySize: 2,
      scheduledAt: slotAt(minutesFromNow),
      guestName: `${label} ${runId}`,
      guestPhone: nextGuestPhone(),
      ...extra,
    });
    expect(res.status, msg(res.data)).toBe(201);
    const row = unwrap(res);
    bookingIds.push(row.id);
    return row;
  };

  /** Host-stand waitlist entry — tracked for cleanup. */
  const joinWaitlist = async (label: string, extra = {}): Promise<any> => {
    const res = await createReservationTabletRaw(tabletToken, managerSession, {
      partySize: 2,
      guestName: `${label} ${runId}`,
      guestPhone: nextGuestPhone(),
      quotedWaitMinutes: 15,
      ...extra,
    });
    expect(res.status, msg(res.data)).toBe(201);
    const row = unwrap(res);
    bookingIds.push(row.id);
    return row;
  };

  const newTable = async (label: string, capacity = 4) => {
    const res = await createTableOwnerRaw(token, restaurantId, {
      name: `${label} ${runId}`,
      capacity,
    });
    expect(res.status, msg(res.data)).toBe(201);
    return unwrap(res) as { id: string; name: string };
  };

  const hostDate = (iso: string) => localDateKey(timeZone, 0, new Date(iso));
  const hostRows = async (iso: string): Promise<any[]> =>
    unwrap(await getHostRaw(tabletToken, managerSession, hostDate(iso)));
  /** A waitlist entry has no scheduledAt; it lists on the day it joined. */
  const hostRow = async (row: { id: string; scheduledAt?: string | null }) =>
    (await hostRows(row.scheduledAt ?? new Date().toISOString())).find(
      (r) => r.id === row.id
    );

  const ownerRow = async (row: { id: string; scheduledAt: string }) => {
    const res = await listReservationsOwnerRaw(token, restaurantId, {
      date: hostDate(row.scheduledAt),
    });
    expect(res.status, msg(res.data)).toBe(200);
    const data = unwrap(res);
    const rows = (Array.isArray(data) ? data : data?.reservations) as any[];
    return rows.find((r) => r.id === row.id);
  };

  const openCheck = async (
    tableId: string,
    extra: Record<string, unknown> = {},
    tt = tabletToken,
    session = managerSession,
    rid = restaurantId,
    menuItem = item
  ) => {
    const res = await createTabletOrderRaw(tt, session, {
      restaurantId: rid,
      orderType: "PICKUP",
      subtotal: ITEM_PRICE,
      tax: 0,
      tip: 0,
      total: ITEM_PRICE,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: menuItem.id,
          menuItemName: menuItem.name,
          quantity: 1,
          price: ITEM_PRICE,
        },
      ],
      openCheck: true,
      tableId,
      ...extra,
    });
    if (res.ok && res.data.id) openedOrderIds.push(res.data.id);
    return res;
  };

  /** A bookable public slot on the restaurant-local `date`. */
  const publicSlot = async (date: string, index = 0): Promise<string> => {
    const avail = await getPublicAvailabilityRaw(restaurantId, date, 2);
    expect(avail.status, msg(avail.data)).toBe(200);
    const slots = unwrap(avail).slots as { scheduledAt: string }[];
    expect(slots.length, `no bookable slots on ${date}`).toBeGreaterThan(index);
    return slots[index]!.scheduledAt;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error("[resv-audit] could not mint the throwaway tenant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;
    timeZone = (await getRestaurantTimeZonePublic(restaurantId)) || timeZone;

    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[resv-audit] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );
    auditOnStack = await probeReservationsAudit(token, restaurantId);
    // An unpublished (preview) restaurant refuses public bookings outright —
    // publish the throwaway tenant the way 07-waitlist-public does.
    await setRestaurantPublishedApi(adminToken, restaurantId, true);

    groupId = (
      await createMenuGroupNamed(token, `Automation Audit ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Audit Burger ${runId}`,
      ITEM_PRICE
    );
    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Audit POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);
    const managerId = await setOwnerPosPin(token, restaurantId, managerPin);
    managerSession = await tabletStaffSignIn(
      tabletToken,
      managerId,
      managerPin
    );

    const settings = await putReservationSettingsOwnerRaw(token, restaurantId, {
      advanceBookingDays: 30,
      minNoticeMinutes: 0,
    });
    if (!settings.ok)
      throw new Error(
        `[resv-audit] could not save reservation settings: ${msg(settings.data)}`
      );
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
          maxPartiesPerSlot: PARTIES_PER_SLOT,
          isActive: true,
        }
      );
      if (!period.ok)
        throw new Error(
          `[resv-audit] could not create day ${dayOfWeek} period: ${msg(period.data)}`
        );
    }
    // Online booking needs a table with a capacity since the audit.
    await newTable("Four Top");
    const online = await putReservationSettingsOwnerRaw(token, restaurantId, {
      onlineBookingEnabled: true,
    });
    if (!online.ok)
      throw new Error(
        `[resv-audit] could not switch online booking on: ${msg(online.data)}`
      );
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const orderId of openedOrderIds) {
      try {
        const read = await getOrderFullRaw(await freshOwnerToken(), orderId);
        const status = String(read.data?.status ?? "");
        if (!read.ok || status === "CANCELLED" || status === "REFUNDED")
          continue;
        await cancelTabletOrderRaw(
          tabletToken,
          managerSession,
          orderId,
          "Automation cleanup"
        );
      } catch (err) {
        // Best-effort: the tenant is archived below regardless.
        console.warn(`[resv-audit] cleanup failed for ${orderId}:`, err);
      }
    }
    for (const id of bookingIds) {
      // Best-effort: terminal bookings refuse cancel, which is fine.
      await reservationStatusTabletRaw(
        tabletToken,
        managerSession,
        id,
        "cancel"
      ).catch(() => {});
    }
    const t = await freshOwnerToken().catch(() => token);
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    if (item)
      await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device)
      await deactivateTabletDevice(t, restaurantId, device.id).catch(() => {});
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (bare)
      await deleteTestRestaurant(adminToken, bare.restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Reservations audit fixes");
    await allure.label("severity", "critical");
    requireRelease("reservationsAudit", auditOnStack);
    token = await freshOwnerToken();
  });

  // ── allergyAlert + createdAt ───────────────────────────────────────────

  test("TC-1129: allergyAlert — set from guest or staff notes on the create response, the host list and the owner list; a plain note leaves it false @reservations-audit", async () => {
    await allure.description(
      "One shared detector over guestNotes + internalNotes. A booking whose " +
        "guest note says 'Severe peanut allergy' answers allergyAlert:true " +
        "on create, on GET /api/tablet/host and on the owner day list; a " +
        "'Window seat please' booking answers false everywhere — until an " +
        "owner PATCH adds the staff note 'EpiPen in her bag', which flips it " +
        "on the PATCH response. A host-stand booking noting 'coeliac' is " +
        "flagged on the tablet create response too."
    );
    const allergic = await book("Allergy", 180, {
      guestNotes: "Severe peanut allergy",
    });
    expect(allergic.allergyAlert).toBe(true);
    expect((await hostRow(allergic))?.allergyAlert).toBe(true);
    expect((await ownerRow(allergic))?.allergyAlert).toBe(true);

    const plain = await book("Plain", 195, {
      guestNotes: "Window seat please",
    });
    expect(plain.allergyAlert).toBe(false);
    expect((await hostRow(plain))?.allergyAlert).toBe(false);
    expect((await ownerRow(plain))?.allergyAlert).toBe(false);

    const noted = await patchReservationOwnerRaw(
      token,
      restaurantId,
      plain.id,
      {
        internalNotes: "EpiPen in her bag",
      }
    );
    expect(noted.status, msg(noted.data)).toBe(200);
    expect(unwrap(noted).allergyAlert).toBe(true);
    expect((await hostRow(plain))?.allergyAlert).toBe(true);

    const coeliac = await createReservationTabletRaw(
      tabletToken,
      managerSession,
      {
        partySize: 2,
        scheduledAt: slotAt(210),
        guestName: `Coeliac ${runId}`,
        guestPhone: nextGuestPhone(),
        guestNotes: "Guest is coeliac",
      }
    );
    expect(coeliac.status, msg(coeliac.data)).toBe(201);
    bookingIds.push(unwrap(coeliac).id);
    expect(unwrap(coeliac).allergyAlert).toBe(true);
  });

  test("TC-1130: host rows carry createdAt — a waitlist entry's join time, as ISO @reservations-audit", async () => {
    await allure.description(
      "GET /api/tablet/host rows add `createdAt` (the waitlist's 'waited " +
        "25m' and place in line). A waitlist entry made just now lists with " +
        "a parseable ISO createdAt within a few minutes of the run clock."
    );
    const before = Date.now();
    const entry = await joinWaitlist("Joined");
    const row = await hostRow(entry);
    expect(
      row,
      "the waitlist entry should be on today's host list"
    ).toBeTruthy();
    expect(typeof row.createdAt).toBe("string");
    const created = Date.parse(row.createdAt);
    expect(Number.isNaN(created)).toBe(false);
    expect(Math.abs(created - before)).toBeLessThan(5 * MINUTE);
  });

  // ── Public booking context ─────────────────────────────────────────────

  test("TC-1131: public availability + /days carry timeZone and the party-size bounds; overlapping windows list each slot once, in order @reservations-audit", async () => {
    await allure.description(
      "GET …/reservation-availability and …/days add `timeZone` (the " +
        "restaurant's IANA zone) and `minPartySize` / `maxPartySize` — the " +
        "bounds over the active PACED windows (schema defaults 1 and 8 " +
        "here). A second paced window overlapping tomorrow's full-day one " +
        "(10:00-14:00) used to list those instants twice: every scheduledAt " +
        "is unique and the list is sorted ascending."
    );
    const tomorrow = localDateKey(timeZone, 1);
    const [y, m, d] = tomorrow.split("-").map(Number);
    const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
    const overlap = await createReservationServicePeriodOwnerRaw(
      token,
      restaurantId,
      {
        name: `Overlap ${runId}`,
        dayOfWeek: dow,
        startTime: "10:00",
        endTime: "14:00",
        slotIntervalMinutes: 15,
        maxPartiesPerSlot: 3,
        isActive: true,
      }
    );
    expect(overlap.status, msg(overlap.data)).toBe(201);

    const avail = await getPublicAvailabilityRaw(restaurantId, tomorrow, 2);
    expect(avail.status, msg(avail.data)).toBe(200);
    const data = unwrap(avail);
    expect(data.timeZone).toBe(timeZone);
    expect(data.minPartySize).toBe(1);
    expect(data.maxPartySize).toBe(8);
    const times = (data.slots as { scheduledAt: string }[]).map(
      (s) => s.scheduledAt
    );
    expect(times.length).toBeGreaterThan(0);
    expect(new Set(times).size, "a slot listed twice").toBe(times.length);
    const sorted = [...times].sort((a, b) => Date.parse(a) - Date.parse(b));
    expect(times).toEqual(sorted);

    const days = await getPublicAvailabilityDaysRaw(restaurantId, {
      from: localDateKey(timeZone, 0),
      to: localDateKey(timeZone, 6),
      partySize: 2,
    });
    expect(days.status, msg(days.data)).toBe(200);
    expect(unwrap(days).timeZone).toBe(timeZone);
    expect(unwrap(days).minPartySize).toBe(1);
    expect(unwrap(days).maxPartySize).toBe(8);
  });

  test("TC-1132: the public manage view carries the restaurant's timeZone @reservations-audit", async () => {
    await allure.description(
      "GET /api/public/reservations/manage/:token adds `timeZone`, so the " +
        "guest sees the booking in the restaurant's local time — and still " +
        "never `manageToken`, `guestPhone` or `internalNotes`."
    );
    const scheduledAt = await publicSlot(localDateKey(timeZone, 2));
    const created = await createPublicReservationRaw(restaurantId, {
      guestName: `Manage Zone ${runId}`,
      guestPhone: nextGuestPhone(),
      partySize: 2,
      scheduledAt,
    });
    expect(created.status, msg(created.data)).toBe(201);
    const manageToken = String(unwrap(created).manageUrl).split("/").pop()!;
    const managed = await getManagedReservationRaw(manageToken);
    expect(managed.status, msg(managed.data)).toBe(200);
    const view = unwrap(managed);
    expect(view.timeZone).toBe(timeZone);
    expect("manageToken" in view).toBe(false);
    expect("guestPhone" in view).toBe(false);
    expect("internalNotes" in view).toBe(false);
  });

  test("TC-1133: public create caps — name over 100, notes over 500, email over 254 or not an email → 400; exactly at the caps books @reservations-audit", async () => {
    await allure.description(
      "A stranger's free text lands on the host stand, in texts and " +
        "emails. POST /api/public/restaurants/:id/reservations refuses " +
        "guestName of 101 characters, guestNotes of 501, a 255-character " +
        "guestEmail and 'not-an-email' — each 400 SYSTEM_VALIDATION_ERROR " +
        "with a message — while a 100-character name with 500-character " +
        "notes and a normal email books (201)."
    );
    const scheduledAt = await publicSlot(localDateKey(timeZone, 3));
    const base = {
      guestPhone: nextGuestPhone(),
      partySize: 2,
      scheduledAt,
    };
    const cases: Array<[string, Record<string, unknown>]> = [
      ["name 101", { guestName: "N".repeat(101) }],
      [
        "notes 501",
        { guestName: `Caps ${runId}`, guestNotes: "x".repeat(501) },
      ],
      [
        "email 255",
        {
          guestName: `Caps ${runId}`,
          guestEmail: `${"e".repeat(243)}@example.com`,
        },
      ],
      [
        "email shape",
        { guestName: `Caps ${runId}`, guestEmail: "not-an-email" },
      ],
    ];
    for (const [label, body] of cases) {
      const res = await createPublicReservationRaw(restaurantId, {
        ...base,
        ...body,
      });
      expect(res.status, `${label} → ${msg(res.data)}`).toBe(400);
      expect(errorCode(res.data), label).toBe("SYSTEM_VALIDATION_ERROR");
      expect(msg(res.data).length, label).toBeGreaterThan(0);
    }

    const ok = await createPublicReservationRaw(restaurantId, {
      ...base,
      guestName: "N".repeat(100),
      guestNotes: "x".repeat(500),
      guestEmail: `caps-${runId}@example.com`,
    });
    expect(ok.status, msg(ok.data)).toBe(201);
  });

  // ── Checked staff edits ────────────────────────────────────────────────

  test("TC-1134: a waitlist entry in line takes edits and keeps its place — name, party, quote; NOTIFIED too; a bad quote 400; a time 409 @reservations-audit", async () => {
    await allure.description(
      "PATCH /api/tablet/reservations/:id on a WAITLIST entry (BOOKED): " +
        "guestName + partySize + quotedWaitMinutes save (200) and the host " +
        "row's createdAt is unchanged — the party keeps its place in line. " +
        "quotedWaitMinutes -5 → 400 RESERVATION_QUOTED_WAIT_INVALID. After " +
        "notify (NOTIFIED) a party-size edit still saves. A waitlist entry " +
        "has no time to move: scheduledAt → 409 RESERVATION_NOT_EDITABLE."
    );
    const entry = await joinWaitlist("Waiting");
    const createdAt = (await hostRow(entry))?.createdAt;
    expect(createdAt).toBeTruthy();

    const edited = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      entry.id,
      {
        guestName: `Waiting Renamed ${runId}`,
        partySize: 3,
        quotedWaitMinutes: 25,
      }
    );
    expect(edited.status, msg(edited.data)).toBe(200);
    expect(unwrap(edited).guestName).toBe(`Waiting Renamed ${runId}`);
    expect(unwrap(edited).partySize).toBe(3);
    expect(unwrap(edited).quotedWaitMinutes).toBe(25);
    expect((await hostRow(entry))?.createdAt).toBe(createdAt);

    const badQuote = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      entry.id,
      { quotedWaitMinutes: -5 }
    );
    expect(badQuote.status, msg(badQuote.data)).toBe(400);
    expect(errorCode(badQuote.data)).toBe("RESERVATION_QUOTED_WAIT_INVALID");

    const notified = await notifyReservationTabletRaw(
      tabletToken,
      managerSession,
      entry.id
    );
    expect(notified.status, msg(notified.data)).toBe(200);
    const notifiedEdit = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      entry.id,
      { partySize: 4 }
    );
    expect(notifiedEdit.status, msg(notifiedEdit.data)).toBe(200);
    expect(unwrap(notifiedEdit).status).toBe("NOTIFIED");
    expect(unwrap(notifiedEdit).partySize).toBe(4);

    const timed = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      entry.id,
      { scheduledAt: slotAt(120) }
    );
    expect(timed.status, msg(timed.data)).toBe(409);
    expect(errorCode(timed.data)).toBe("RESERVATION_NOT_EDITABLE");
  });

  test("TC-1135: an ARRIVED party takes a party-size and notes edit (allergy flag follows), not a new time @reservations-audit", async () => {
    await allure.description(
      "ARRIVED: partySize + guestNotes save (200) and allergyAlert follows " +
        "the new note; scheduledAt → 409 RESERVATION_NOT_EDITABLE (the " +
        "party is at the door — nothing to move). TC-726 covers the name."
    );
    const booking = await book("At Door", 20);
    const arrived = await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      "arrive"
    );
    expect(arrived.status, msg(arrived.data)).toBe(200);

    const edit = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      { partySize: 5, guestNotes: "Shellfish allergy at the table" }
    );
    expect(edit.status, msg(edit.data)).toBe(200);
    expect(unwrap(edit).status).toBe("ARRIVED");
    expect(unwrap(edit).partySize).toBe(5);
    expect(unwrap(edit).allergyAlert).toBe(true);

    const moved = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      { scheduledAt: slotAt(90) }
    );
    expect(moved.status, msg(moved.data)).toBe(409);
    expect(errorCode(moved.data)).toBe("RESERVATION_NOT_EDITABLE");
  });

  test("TC-1136: a capacity edit answers the advisory flags — a party no table fits → tablesExceeded; moving into a full slot → pacingExceeded; both saved anyway @reservations-audit", async () => {
    await allure.description(
      "The only table here is a 4-top. Growing a booking to 12 answers " +
        "data.tablesExceeded:true (saved: partySize 12). Filling a slot to " +
        `its cap (${PARTIES_PER_SLOT} parties) and moving a third booking ` +
        "into it answers data.pacingExceeded:true (saved: the new time). A " +
        "plain name edit carries neither flag."
    );
    const big = await book("Grows", 300);
    const grown = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      big.id,
      { partySize: 12 }
    );
    expect(grown.status, msg(grown.data)).toBe(200);
    expect(unwrap(grown).partySize).toBe(12);
    expect(unwrap(grown).tablesExceeded).toBe(true);

    const fullSlot = slotAt(24 * 60 + 600);
    for (let i = 0; i < PARTIES_PER_SLOT; i++) {
      const res = await createReservationOwnerRaw(token, restaurantId, {
        partySize: 1,
        scheduledAt: fullSlot,
        guestName: `Slot Filler ${i} ${runId}`,
        guestPhone: nextGuestPhone(),
      });
      expect(res.status, msg(res.data)).toBe(201);
      bookingIds.push(unwrap(res).id);
    }
    const mover = await book("Mover", 24 * 60 + 720, { partySize: 1 });
    const moved = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      mover.id,
      { scheduledAt: fullSlot }
    );
    expect(moved.status, msg(moved.data)).toBe(200);
    expect(unwrap(moved).scheduledAt).toBe(fullSlot);
    expect(unwrap(moved).pacingExceeded).toBe(true);

    const renamed = await updateReservationTabletRaw(
      tabletToken,
      managerSession,
      mover.id,
      { guestName: `Mover Renamed ${runId}` }
    );
    expect(renamed.status, msg(renamed.data)).toBe(200);
    expect(unwrap(renamed).pacingExceeded).toBeUndefined();
    expect(unwrap(renamed).tablesExceeded).toBeUndefined();
  });

  test("TC-1137: the owner PATCH follows the same rules — edits a waitlist entry, refuses a finished one's name (409), still annotates it @reservations-audit", async () => {
    await allure.description(
      "Owner PATCH /restaurant/:id/reservations/:rid shares " +
        "updateReservationRow: a waitlist entry's guestName + partySize save; " +
        "once CANCELLED, a new guestName → 409 RESERVATION_NOT_EDITABLE, " +
        "but internalNotes still save (the dashboard annotates any booking)."
    );
    const entry = await joinWaitlist("Owner Wait");
    const edited = await patchReservationOwnerRaw(
      token,
      restaurantId,
      entry.id,
      {
        guestName: `Owner Wait Renamed ${runId}`,
        partySize: 3,
      }
    );
    expect(edited.status, msg(edited.data)).toBe(200);
    expect(unwrap(edited).guestName).toBe(`Owner Wait Renamed ${runId}`);
    expect(unwrap(edited).partySize).toBe(3);

    const cancelled = await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      entry.id,
      "cancel"
    );
    expect(cancelled.status, msg(cancelled.data)).toBe(200);
    const refused = await patchReservationOwnerRaw(
      token,
      restaurantId,
      entry.id,
      { guestName: `Too Late ${runId}` }
    );
    expect(refused.status, msg(refused.data)).toBe(409);
    expect(errorCode(refused.data)).toBe("RESERVATION_NOT_EDITABLE");
    const annotated = await patchReservationOwnerRaw(
      token,
      restaurantId,
      entry.id,
      { internalNotes: "Left before we could seat them" }
    );
    expect(annotated.status, msg(annotated.data)).toBe(200);
  });

  // ── Partial seating + linking ──────────────────────────────────────────

  test("TC-1138: partial seating — fewer guests than the party → PARTIALLY_SEATED; status `seat` seats the rest on the same table; `seat` refuses any other status @reservations-audit", async () => {
    await allure.description(
      "POST /seat {tableIds, guestCount: 2} on an arrived party of 4 → " +
        "PARTIALLY_SEATED. POST /status {action:'seat'} → SEATED, the table " +
        "kept and seatedAt unchanged. A second party seated partially and " +
        "then seated again via /seat with no guestCount → SEATED too. " +
        "`seat` on a BOOKED booking → 400 RESERVATION_INVALID_TRANSITION."
    );
    const table = await newTable("Partial");
    const party = await book("Partial Party", 25, { partySize: 4 });
    await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      party.id,
      "arrive"
    );
    const partial = await seatReservationTabletRaw(
      tabletToken,
      managerSession,
      party.id,
      { tableIds: [table.id], guestCount: 2 }
    );
    expect(partial.status, msg(partial.data)).toBe(201);
    const partialRow = unwrap(partial).reservation;
    expect(partialRow.status).toBe("PARTIALLY_SEATED");

    const rest = await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      party.id,
      "seat"
    );
    expect(rest.status, msg(rest.data)).toBe(200);
    expect(unwrap(rest).status).toBe("SEATED");
    const row = await hostRow(party);
    expect(row?.tableIds).toEqual([table.id]);
    if (partialRow.seatedAt)
      expect(unwrap(rest).seatedAt).toBe(partialRow.seatedAt);

    const table2 = await newTable("Partial Two");
    const second = await book("Partial Again", 25, { partySize: 3 });
    await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      second.id,
      "arrive"
    );
    const first = await seatReservationTabletRaw(
      tabletToken,
      managerSession,
      second.id,
      { tableIds: [table2.id], guestCount: 1 }
    );
    expect(unwrap(first).reservation.status).toBe("PARTIALLY_SEATED");
    const again = await seatReservationTabletRaw(
      tabletToken,
      managerSession,
      second.id,
      { tableIds: [table2.id] }
    );
    expect([200, 201], msg(again.data)).toContain(again.status);
    expect(unwrap(again).reservation.status).toBe("SEATED");

    const booked = await book("Not Partial", 240);
    const illegal = await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      booked.id,
      "seat"
    );
    expect(illegal.status, msg(illegal.data)).toBe(400);
    expect(errorCode(illegal.data)).toBe("RESERVATION_INVALID_TRANSITION");
  });

  test("TC-1139: a CONFIRMED booking links to a new check — create-order with its reservationId opens the check and seats it @reservations-audit", async () => {
    await allure.description(
      "Bug fix: create-order refused a CONFIRMED booking's reservationId " +
        "while accepting a BOOKED one. Confirm a booking, open a check on a " +
        "table with {reservationId, guestCount} → 201, and the reservation " +
        "reads SEATED (the link seats it)."
    );
    const table = await newTable("Confirmed");
    const booking = await book("Confirmed Guest", 30);
    const confirmed = await reservationStatusTabletRaw(
      tabletToken,
      managerSession,
      booking.id,
      "confirm"
    );
    expect(confirmed.status, msg(confirmed.data)).toBe(200);
    expect(unwrap(confirmed).status).toBe("CONFIRMED");

    const check = await openCheck(table.id, {
      reservationId: booking.id,
      guestCount: 2,
    });
    expect(check.status, msg(check.data)).toBe(201);
    const after = await patchReservationOwnerRaw(
      token,
      restaurantId,
      booking.id,
      {}
    );
    expect(unwrap(after).status).toBe("SEATED");
  });

  // ── Config ─────────────────────────────────────────────────────────────

  test("TC-1140: the booking-hours suggestion carries a pacing cap — max(1, round(sellable tables × 15 / default length)) @reservations-audit", async () => {
    await allure.description(
      "GET …/reservation-service-periods/suggested adds " +
        "suggestedMaxPartiesPerSlot and suggestedSlotIntervalMinutes (15). " +
        "Sellable = active, bookable tables with a capacity; the expected " +
        "cap is recomputed from this tenant's own table list and settings."
    );
    const res = await suggestReservationServicePeriodsOwnerRaw(
      token,
      restaurantId
    );
    expect(res.status, msg(res.data)).toBe(200);
    const data = unwrap(res);
    expect(data.suggestedSlotIntervalMinutes).toBe(15);

    const tables = (unwrap(await listTablesOwnerRaw(token, restaurantId))
      ?.tables ?? []) as any[];
    const sellable = tables.filter(
      (t) =>
        t.isActive !== false && t.isBookable !== false && t.capacity != null
    ).length;
    const duration = unwrap(
      await getReservationSettingsOwnerRaw(token, restaurantId)
    ).defaultDurationMinutes as number;
    expect(data.suggestedMaxPartiesPerSlot).toBe(
      Math.max(1, Math.round((sellable * 15) / duration))
    );
  });

  // ── Without the add-on, then the phone-AI tables guard ─────────────────

  test("TC-1141: without the add-on nothing opens up — reservation writes refuse, and a table's open check behaves as before @reservations-audit", async () => {
    await allure.description(
      "A second throwaway tenant with table service on but NO " +
        "TABLE_RESERVATIONS: owner reservation create → 403 " +
        "RESERVATIONS_NOT_ENABLED, settings PUT online booking → 403, the " +
        "public availability → 403. Tables still work the old way: a table " +
        "with a capacity is created, the floor reads it AVAILABLE, a check " +
        "opens on it (OCCUPIED) and, once cancelled, the table reads " +
        "AVAILABLE again — no hold, no PAID-until-cleared, no booking rule."
    );
    const tenant = await createSecondOwner(adminToken, `${runId}-bare`);
    if (!tenant.restaurantId)
      throw new Error("[TC-1141] could not mint the bare tenant");
    bare = { token: tenant.accessToken, restaurantId: tenant.restaurantId };
    await updateRestaurantSettingsApi(bare.token, bare.restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });

    const create = await createReservationOwnerRaw(
      bare.token,
      bare.restaurantId,
      {
        partySize: 2,
        scheduledAt: slotAt(120),
        guestName: `Bare ${runId}`,
        guestPhone: nextGuestPhone(),
      }
    );
    expect(create.status, msg(create.data)).toBe(403);
    expect(errorCode(create.data)).toBe("RESERVATIONS_NOT_ENABLED");
    const online = await putReservationSettingsOwnerRaw(
      bare.token,
      bare.restaurantId,
      { onlineBookingEnabled: true }
    );
    expect(online.status, msg(online.data)).toBe(403);
    const avail = await getPublicAvailabilityRaw(
      bare.restaurantId,
      localDateKey(timeZone, 1),
      2
    );
    expect(avail.status, msg(avail.data)).toBe(403);

    // Tables + open checks the old way, from the bare tenant's own POS.
    const bareTable = await createTableOwnerRaw(bare.token, bare.restaurantId, {
      name: `Bare Table ${runId}`,
      capacity: 4,
    });
    expect(bareTable.status, msg(bareTable.data)).toBe(201);
    const tableId = unwrap(bareTable).id as string;
    const bareGroup = await createMenuGroupNamed(
      bare.token,
      `Automation Bare ${runId}`,
      { restaurantId: bare.restaurantId }
    );
    const bareItem = await createMenuItemFull(
      bare.token,
      bareGroup.id,
      `Bare Burger ${runId}`,
      ITEM_PRICE
    );
    const bareDevice = await createTabletDevice(
      adminToken,
      bare.restaurantId,
      `Automation Bare POS ${runId}`
    );
    const bareTablet = await tabletLogin(bareDevice.name, bareDevice.code);
    const bareManager = await setOwnerPosPin(
      bare.token,
      bare.restaurantId,
      managerPin
    );
    const bareSession = await tabletStaffSignIn(
      bareTablet,
      bareManager,
      managerPin
    );
    const state = async () =>
      (unwrap(await getFloorRaw(bareTablet)).tables as any[]).find(
        (t) => t.table.id === tableId
      )?.state;
    expect(await state()).toBe("AVAILABLE");

    const check = await openCheck(
      tableId,
      { guestCount: 2 },
      bareTablet,
      bareSession,
      bare.restaurantId,
      bareItem
    );
    expect(check.status, msg(check.data)).toBe(201);
    expect(await state()).toBe("OCCUPIED");
    const cancelled = await cancelTabletOrderRaw(
      bareTablet,
      bareSession,
      check.data.id!,
      "Automation — table free again"
    );
    expect(cancelled.ok, msg(cancelled.data)).toBe(true);
    expect(await state()).toBe("AVAILABLE");
    await deactivateTabletDevice(
      bare.token,
      bare.restaurantId,
      bareDevice.id
    ).catch(() => {});
  });

  test("TC-1142: with the add-on, switching phone-AI booking on needs a table with a capacity (400 RESERVATION_TABLES_REQUIRED) @reservations-audit", async () => {
    await allure.description(
      "The bare tenant from TC-1141 gets TABLE_RESERVATIONS and one paced " +
        "booking window; its 4-top is taken out of sale (isBookable:false) " +
        "and a table with NO capacity is added. voiceBookingEnabled:true → " +
        "400 RESERVATION_TABLES_REQUIRED; after a 2-top with a capacity → 200."
    );
    test.skip(!bare, "needs TC-1141's bare tenant");
    const b = bare!;
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      b.restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    expect(grant.ok, msg(grant.data)).toBe(true);
    // TC-1141 gave this tenant a 4-top; take it out of sale so no table
    // with a capacity is bookable.
    const tables = (unwrap(await listTablesOwnerRaw(b.token, b.restaurantId))
      ?.tables ?? []) as any[];
    for (const t of tables) {
      const off = await updateTableOwnerRaw(b.token, b.restaurantId, t.id, {
        isBookable: false,
      });
      expect(off.ok, msg(off.data)).toBe(true);
    }
    const period = await createReservationServicePeriodOwnerRaw(
      b.token,
      b.restaurantId,
      {
        name: `Voice ${runId}`,
        dayOfWeek: 1,
        startTime: "17:00",
        endTime: "21:00",
        maxPartiesPerSlot: 2,
        isActive: true,
      }
    );
    expect(period.status, msg(period.data)).toBe(201);
    const noSeats = await createTableOwnerRaw(b.token, b.restaurantId, {
      name: `No Seats ${runId}`,
    });
    expect(noSeats.status, msg(noSeats.data)).toBe(201);

    const refused = await putReservationSettingsOwnerRaw(
      b.token,
      b.restaurantId,
      { voiceBookingEnabled: true }
    );
    expect(refused.status, msg(refused.data)).toBe(400);
    expect(errorCode(refused.data)).toBe("RESERVATION_TABLES_REQUIRED");

    const twoTop = await createTableOwnerRaw(b.token, b.restaurantId, {
      name: `Two Top ${runId}`,
      capacity: 2,
    });
    expect(twoTop.status, msg(twoTop.data)).toBe(201);
    const ok = await putReservationSettingsOwnerRaw(b.token, b.restaurantId, {
      voiceBookingEnabled: true,
    });
    expect(ok.status, msg(ok.data)).toBe(200);
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      b.restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
  });
});
