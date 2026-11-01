/**
 * 20-online-waitlist.spec.ts — "join the line from your phone" (reservations
 * phase 4, Contract A), real HTTP. Spec: restaunax/docs/features/
 * TABLE_RESERVATIONS.md → online waitlist.
 *
 * What it pins (TC-1151 → TC-1167): off by default, the add-on gate, the table
 * guard, settings validation, the public status order (disabled → paused →
 * closed → party_too_large → wait_too_long → open), join + replay + refusals,
 * the join text, duplicate phone (no link in the body), place in line and quote
 * on the manage view, leaving the line, and the host's pause from POS + owner.
 *
 * Own tenants, gated on `probeReservationsPhase4` → RELEASED_ON_QA.reservationsPhase4.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateGuestPhone, generateRunId } from "../../utils/testData";
import { localDateKey } from "../../utils/dealSchedule";
import {
  BACKEND_URL,
  createPublicReservationRaw,
  getPublicAvailabilityRaw,
  cancelManagedReservationRaw,
  createPinStaffTabletRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  getHostRaw,
  getManagedReservationRaw,
  getReservationSettingsOwnerRaw,
  notifyReservationTabletRaw,
  putReservationSettingsOwnerRaw,
  setBusinessHoursApi,
  tabletStaffSignIn,
} from "../../utils/apiHelper";
import {
  probeReservationsPhase4,
  requireRelease,
} from "../../utils/releaseGate";
import {
  errorCode,
  getPublicWaitlistRaw,
  joinPublicWaitlistRaw,
  localDbReady,
  mintPhase4Tenant,
  msg,
  onlinePauseOwnerRaw,
  onlinePauseTabletRaw,
  smsTypesOf,
  unwrap,
  type Phase4Tenant,
} from "../../utils/reservationPhase4Api";

const CREDS_OK = !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD;

test.describe("POS — Online waitlist (phase 4) @reservations-phase4", () => {
  test.skip(!CREDS_OK, "ADMIN creds needed (the file mints its own tenants)");

  const runId = generateRunId();
  let t: Phase4Tenant;
  let bare: Phase4Tenant;
  let onStack = false;
  let seq = 100;
  const phone = () => generateGuestPhone(runId, ++seq);
  /** Everyone this file put in line, so each test starts on an empty line. */
  const inLine: string[] = [];

  const settings = (patch: Record<string, unknown>) =>
    putReservationSettingsOwnerRaw(t.token, t.restaurantId, patch);

  const joinBody = (extra: Record<string, unknown> = {}) => ({
    partySize: 2,
    guestName: `Online Guest ${runId}`,
    guestPhone: phone(),
    clientRequestId: `req-${runId}-${++seq}`,
    ...extra,
  });

  const tokenOf = (manageUrl: string) => manageUrl.split("/").pop() as string;

  const join = async (extra: Record<string, unknown> = {}) => {
    const res = await joinPublicWaitlistRaw(t.restaurantId, joinBody(extra));
    expect(res.status, msg(res.data)).toBe(201);
    const data = unwrap(res);
    inLine.push(tokenOf(data.manageUrl));
    return data;
  };

  const emptyTheLine = async () => {
    for (const token of inLine.splice(0))
      await cancelManagedReservationRaw(token).catch(() => {});
  };

  test.beforeAll(async () => {
    if (!CREDS_OK) return;
    t = await mintPhase4Tenant(runId, { label: "wl" });
    bare = await mintPhase4Tenant(runId, { label: "wlbare", addOn: false });
    onStack = await probeReservationsPhase4(t.token, t.restaurantId);
  });

  test.afterAll(async () => {
    for (const tenant of [t, bare]) {
      if (!tenant) continue;
      await deactivateTabletDevice(
        tenant.adminToken,
        tenant.restaurantId,
        tenant.deviceId
      ).catch(() => {});
      await deleteTestRestaurant(tenant.adminToken, tenant.restaurantId).catch(
        () => {}
      );
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Reservations — online waitlist");
    requireRelease("reservationsPhase4", onStack);
    // A failed test restarts the worker and beforeAll mints a fresh tenant, so
    // everything past the switch's own tests turns it on again.
    if (!/TC-115[123]\b/.test(test.info().title))
      await settings({ onlineWaitlistEnabled: true });
  });

  test("TC-1151: off by default — settings read off, the public status is disabled and a join is refused", async () => {
    const read = await getReservationSettingsOwnerRaw(t.token, t.restaurantId);
    const s = unwrap(read);
    expect(s.onlineWaitlistEnabled).toBe(false);
    expect(s.onlineWaitlistMaxWaitMinutes).toBeNull();
    expect(s.onlineWaitlistMaxPartySize).toBeNull();
    expect(s.onlineWaitlistPausedAt).toBeNull();
    expect(s.onlineWaitlistPausedUntil).toBeNull();

    const status = await getPublicWaitlistRaw(t.restaurantId, 2);
    expect(status.status).toBe(200);
    expect(unwrap(status).status).toBe("disabled");
    expect(unwrap(status).quoteMinutes).toBeNull();

    const refused = await joinPublicWaitlistRaw(t.restaurantId, joinBody());
    expect(refused.status).toBe(403);
    expect(errorCode(refused.data)).toBe("WAITLIST_DISABLED");

    // The host board says the control stays hidden.
    const host = await getHostRaw(t.tabletToken, t.managerSession);
    expect((host.data as any).onlineWaitlist.enabled).toBe(false);
  });

  test("TC-1152: without the add-on, every public call answers 403 RESERVATIONS_NOT_ENABLED", async () => {
    const status = await getPublicWaitlistRaw(bare.restaurantId, 2);
    expect(status.status).toBe(403);
    expect(errorCode(status.data)).toBe("RESERVATIONS_NOT_ENABLED");

    const refused = await joinPublicWaitlistRaw(bare.restaurantId, joinBody());
    expect(refused.status).toBe(403);
    expect(errorCode(refused.data)).toBe("RESERVATIONS_NOT_ENABLED");

    const pause = await onlinePauseTabletRaw(
      bare.tabletToken,
      bare.managerSession,
      { minutes: 30 }
    );
    expect(pause.status).toBe(403);
    expect(errorCode(pause.data)).toBe("RESERVATIONS_NOT_ENABLED");
    const ownerPause = await onlinePauseOwnerRaw(
      bare.token,
      bare.restaurantId,
      { minutes: 30 }
    );
    expect(ownerPause.status).toBe(403);
  });

  test("TC-1153: switching on needs a table with a capacity; ranges are validated; the pause fields are read-only", async () => {
    const noTables = await mintPhase4Tenant(runId, {
      label: "wlnotable",
      tableCapacity: null,
    });
    const guard = await putReservationSettingsOwnerRaw(
      noTables.token,
      noTables.restaurantId,
      { onlineWaitlistEnabled: true }
    );
    expect(guard.status).toBe(400);
    expect(errorCode(guard.data)).toBe("RESERVATION_TABLES_REQUIRED");

    for (const bad of [
      { onlineWaitlistMaxWaitMinutes: 4 },
      { onlineWaitlistMaxWaitMinutes: 241 },
      { onlineWaitlistMaxWaitMinutes: 10.5 },
      { onlineWaitlistMaxPartySize: 0 },
      { onlineWaitlistMaxPartySize: 100 },
    ]) {
      const res = await settings(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(errorCode(res.data)).toBe("RESERVATION_SETTINGS_INVALID_RANGE");
    }

    const ok = await settings({
      onlineWaitlistMaxWaitMinutes: 120,
      onlineWaitlistMaxPartySize: 8,
      onlineWaitlistPausedAt: new Date().toISOString(),
      onlineWaitlistPausedUntil: new Date().toISOString(),
    });
    expect(ok.status, msg(ok.data)).toBe(200);
    const s = unwrap(ok);
    expect(s.onlineWaitlistMaxWaitMinutes).toBe(120);
    expect(s.onlineWaitlistMaxPartySize).toBe(8);
    expect(s.onlineWaitlistPausedAt).toBeNull();
    expect(s.onlineWaitlistPausedUntil).toBeNull();

    const cleared = await settings({
      onlineWaitlistMaxWaitMinutes: null,
      onlineWaitlistMaxPartySize: null,
    });
    expect(unwrap(cleared).onlineWaitlistMaxWaitMinutes).toBeNull();

    const on = await settings({ onlineWaitlistEnabled: true });
    expect(on.status, msg(on.data)).toBe(200);
    expect(unwrap(on).onlineWaitlistEnabled).toBe(true);
  });

  test("TC-1154: an open line — status, quote, parties ahead, phone, time zone, cache header; a bad party size is 400", async () => {
    const status = await getPublicWaitlistRaw(t.restaurantId, 2);
    expect(status.status, msg(status.data)).toBe(200);
    const d = unwrap(status);
    expect(d.status).toBe("open");
    expect(d.partiesAhead).toBe(0);
    expect(d.quoteMinutes).toEqual({ low: 0, high: 5 });
    expect(d.timeZone).toBe(t.timeZone);
    expect(d).toHaveProperty("restaurantPhone");
    expect(typeof d.maxPartySize).toBe("number");

    // Without a party size: the state and everyone in line, no quote.
    const noParty = unwrap(await getPublicWaitlistRaw(t.restaurantId));
    expect(noParty.status).toBe("open");
    expect(noParty.quoteMinutes).toBeNull();

    for (const bad of [0, 100, "abc", 1.5]) {
      const res = await getPublicWaitlistRaw(t.restaurantId, bad);
      expect(res.status, String(bad)).toBe(400);
      expect(errorCode(res.data)).toBe("RESERVATION_PARTY_SIZE_INVALID");
    }

    const raw = await fetch(
      `${BACKEND_URL}/api/public/restaurants/${t.restaurantId}/waitlist?partySize=2`
    );
    expect(raw.headers.get("cache-control")).toContain("max-age=15");
  });

  test("TC-1155: a join is validated like a public booking; a preview session may not join", async () => {
    const noName = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ guestName: "  " })
    );
    expect(noName.status).toBe(400);
    expect(errorCode(noName.data)).toBe("RESERVATION_GUEST_NAME_REQUIRED");
    const noPhone = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ guestPhone: "" })
    );
    expect(noPhone.status).toBe(400);
    expect(errorCode(noPhone.data)).toBe("RESERVATION_PHONE_REQUIRED");
    const badEmail = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ guestEmail: "not-an-email" })
    );
    expect(badEmail.status).toBe(400);
    expect(errorCode(badEmail.data)).toBe("SYSTEM_VALIDATION_ERROR");
    const longNotes = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ guestNotes: "x".repeat(501) })
    );
    expect(longNotes.status).toBe(400);
    const badParty = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ partySize: 0 })
    );
    expect(badParty.status).toBe(400);

    const preview = await joinPublicWaitlistRaw(t.restaurantId, joinBody(), {
      "x-promotion-preview": "whatever",
    });
    expect(preview.status).toBe(403);
  });

  test("TC-1156: joining creates a WAITLIST row (WEB), answers place + quote, fires the join text; a replay answers 200 without a second text", async () => {
    const guestPhone = phone();
    const clientRequestId = `req-${runId}-first`;
    const res = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ guestPhone, clientRequestId, guestNotes: "Peanut allergy" })
    );
    expect(res.status, msg(res.data)).toBe(201);
    const d = unwrap(res);
    inLine.push(tokenOf(d.manageUrl));
    expect(d.manageUrl).toMatch(/^\/reservations\/manage\/.+/);
    expect(d.confirmationCode).toBeTruthy();
    expect(d.placeInLine).toBe(1);
    expect(d.partiesAhead).toBe(0);
    expect(d.quoteMinutes).toEqual({ low: 0, high: 5 });

    const host = await getHostRaw(t.tabletToken, t.managerSession);
    const row = (unwrap(host) as any[]).find((r) => r.id === d.reservationId);
    expect(row.kind).toBe("WAITLIST");
    expect(row.status).toBe("BOOKED");
    expect(row.source).toBe("WEB");
    expect(row.quotedWaitMinutes).toBe(5);
    expect(row.allergyAlert).toBe(true);

    const replay = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ guestPhone, clientRequestId })
    );
    expect(replay.status).toBe(200);
    expect(unwrap(replay).reservationId).toBe(d.reservationId);
    if (localDbReady()) {
      expect(smsTypesOf(d.reservationId)).toEqual(["WAITLIST_JOINED"]);
    }
    await emptyTheLine();
  });

  test("TC-1157: the app's source — body flag or header → MOBILE; anything else → WEB", async () => {
    const body = await join({ source: "MOBILE" });
    const header = await joinPublicWaitlistRaw(t.restaurantId, joinBody(), {
      "X-Booking-Source": "MOBILE",
    });
    expect(header.status).toBe(201);
    inLine.push(tokenOf(unwrap(header).manageUrl));
    const other = await join({ source: "KIOSK" });

    const rows = unwrap(
      await getHostRaw(t.tabletToken, t.managerSession)
    ) as any[];
    const sourceOf = (id: string) => rows.find((r) => r.id === id)?.source;
    expect(sourceOf(body.reservationId)).toBe("MOBILE");
    expect(sourceOf(unwrap(header).reservationId)).toBe("MOBILE");
    expect(sourceOf(other.reservationId)).toBe("WEB");
    await emptyTheLine();
  });

  test("TC-1158: one active entry per phone — 409 WAITLIST_ALREADY_JOINED, the link goes by text and never in the body", async () => {
    const guestPhone = phone();
    const first = await join({ guestPhone });
    const dup = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ guestPhone })
    );
    expect(dup.status).toBe(409);
    expect(errorCode(dup.data)).toBe("WAITLIST_ALREADY_JOINED");
    const text = JSON.stringify(dup.data);
    expect(text).not.toContain(tokenOf(first.manageUrl));
    expect(text).not.toContain("/reservations/manage/");
    if (localDbReady()) {
      expect(smsTypesOf(first.reservationId)).toEqual([
        "WAITLIST_JOINED",
        "WAITLIST_JOINED",
      ]);
    }
    // After leaving, the same phone may join again.
    await emptyTheLine();
    await join({ guestPhone });
    await emptyTheLine();
  });

  test("TC-1159: place in line — the manage view counts only those ahead and moves up when someone leaves; a booking row carries nulls", async () => {
    const a = await join();
    const b = await join();
    expect(b.placeInLine).toBe(2);
    expect(b.partiesAhead).toBe(1);
    expect(b.quoteMinutes.high).toBeGreaterThan(5);

    const viewA = unwrap(await getManagedReservationRaw(tokenOf(a.manageUrl)));
    expect(viewA.kind).toBe("WAITLIST");
    expect(viewA.placeInLine).toBe(1);
    expect(viewA.partiesAhead).toBe(0);
    expect(viewA.quoteMinutes).toEqual({ low: 0, high: 5 });
    expect(viewA.cancellable).toBe(true);
    expect(viewA.modifiable).toBe(false);

    const viewB = unwrap(await getManagedReservationRaw(tokenOf(b.manageUrl)));
    expect(viewB.placeInLine).toBe(2);
    expect(viewB.partiesAhead).toBe(1);

    const left = await cancelManagedReservationRaw(tokenOf(a.manageUrl));
    expect(left.status).toBe(200);

    const afterLeave = unwrap(
      await getManagedReservationRaw(tokenOf(b.manageUrl))
    );
    expect(afterLeave.placeInLine).toBe(1);
    expect(afterLeave.partiesAhead).toBe(0);

    // The public status counts the same line.
    expect(
      unwrap(await getPublicWaitlistRaw(t.restaurantId)).partiesAhead
    ).toBe(1);

    const date = localDateKey(t.timeZone, 2);
    const slots = unwrap(
      await getPublicAvailabilityRaw(t.restaurantId, date, 2)
    ).slots as { scheduledAt: string }[];
    const booking = await createPublicReservationRaw(t.restaurantId, {
      partySize: 2,
      scheduledAt: slots[0]!.scheduledAt,
      guestName: `Booked Guest ${runId}`,
      guestPhone: phone(),
    });
    expect(booking.status, msg(booking.data)).toBe(201);
    const bookingView = unwrap(
      await getManagedReservationRaw(tokenOf(unwrap(booking).manageUrl))
    );
    expect(bookingView.kind).toBe("RESERVATION");
    expect(bookingView.placeInLine).toBeNull();
    expect(bookingView.quoteMinutes).toBeNull();
    expect(bookingView.partiesAhead).toBeNull();
    await emptyTheLine();
  });

  test("TC-1160: leaving the line — works from BOOKED and NOTIFIED, a left entry is out of the count and cannot leave twice", async () => {
    const a = await join();
    const left = await cancelManagedReservationRaw(tokenOf(a.manageUrl));
    expect(left.status, msg(left.data)).toBe(200);
    expect(msg(left.data).length).toBeGreaterThan(0);
    const view = unwrap(await getManagedReservationRaw(tokenOf(a.manageUrl)));
    expect(view.status).toBe("CANCELLED");
    expect(view.placeInLine).toBeNull();
    expect(view.cancellable).toBe(false);
    const again = await cancelManagedReservationRaw(tokenOf(a.manageUrl));
    expect(again.status).toBe(409);
    expect(errorCode(again.data)).toBe("RESERVATION_INVALID_TRANSITION");

    const b = await join();
    const notify = await notifyReservationTabletRaw(
      t.tabletToken,
      t.managerSession,
      b.reservationId
    );
    expect(notify.status, msg(notify.data)).toBe(200);
    const notified = unwrap(
      await getManagedReservationRaw(tokenOf(b.manageUrl))
    );
    expect(notified.status).toBe("NOTIFIED");
    expect(notified.cancellable).toBe(true);
    expect(notified.placeInLine).toBe(1);
    const leftNotified = await cancelManagedReservationRaw(
      tokenOf(b.manageUrl)
    );
    expect(leftNotified.status, msg(leftNotified.data)).toBe(200);
    inLine.length = 0;
  });

  test("TC-1161: party limits — above the owner's cap, or no table can fit → party_too_large and 409 on join", async () => {
    await settings({ onlineWaitlistMaxPartySize: 3 });
    const capped = unwrap(await getPublicWaitlistRaw(t.restaurantId, 4));
    expect(capped.status).toBe("party_too_large");
    expect(capped.maxPartySize).toBe(3);
    expect(capped.quoteMinutes).toBeNull();
    const refused = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ partySize: 4 })
    );
    expect(refused.status).toBe(409);
    expect(errorCode(refused.data)).toBe("WAITLIST_PARTY_TOO_LARGE");
    await settings({ onlineWaitlistMaxPartySize: null });

    // The tenant's one table seats 4: a party of 12 has nowhere to go.
    const noTable = unwrap(await getPublicWaitlistRaw(t.restaurantId, 12));
    expect(noTable.status).toBe("party_too_large");
    const refusedBig = await joinPublicWaitlistRaw(
      t.restaurantId,
      joinBody({ partySize: 12 })
    );
    expect(refusedBig.status).toBe(409);
    expect(errorCode(refusedBig.data)).toBe("WAITLIST_PARTY_TOO_LARGE");
  });

  test("TC-1162: wait too long — the next party's quote exceeds the owner's limit → wait_too_long and 409 on join", async () => {
    await join();
    await settings({ onlineWaitlistMaxWaitMinutes: 5 });
    const status = unwrap(await getPublicWaitlistRaw(t.restaurantId, 2));
    expect(status.status).toBe("wait_too_long");
    expect(status.quoteMinutes.high).toBeGreaterThan(5);
    const refused = await joinPublicWaitlistRaw(t.restaurantId, joinBody());
    expect(refused.status).toBe(409);
    expect(errorCode(refused.data)).toBe("WAITLIST_WAIT_TOO_LONG");
    await settings({ onlineWaitlistMaxWaitMinutes: null });
    await emptyTheLine();
  });

  test("TC-1163: outside business hours → closed and 409 WAITLIST_CLOSED; 24-hour hours → open again", async () => {
    const days = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ];
    await setBusinessHoursApi(
      t.token,
      t.restaurantId,
      days.map((day) => ({
        day,
        openingTime: null,
        closingTime: null,
        isClosed: true,
        is24Hours: false,
      }))
    );
    const status = unwrap(await getPublicWaitlistRaw(t.restaurantId, 2));
    expect(status.status).toBe("closed");
    expect(status.quoteMinutes).toBeNull();
    const refused = await joinPublicWaitlistRaw(t.restaurantId, joinBody());
    expect(refused.status).toBe(409);
    expect(errorCode(refused.data)).toBe("WAITLIST_CLOSED");

    await setBusinessHoursApi(
      t.token,
      t.restaurantId,
      days.map((day) => ({
        day,
        openingTime: null,
        closingTime: null,
        isClosed: false,
        is24Hours: true,
      }))
    );
    expect(unwrap(await getPublicWaitlistRaw(t.restaurantId, 2)).status).toBe(
      "open"
    );
  });

  test("TC-1164: the host pauses from the POS — 30 min, until resumed, resume; bad bodies are refused; the host feed says so", async () => {
    const pause = await onlinePauseTabletRaw(t.tabletToken, t.managerSession, {
      minutes: 30,
    });
    expect(pause.status, msg(pause.data)).toBe(200);
    const d = unwrap(pause);
    expect(d.enabled).toBe(true);
    expect(d.paused).toBe(true);
    const until = new Date(d.pausedUntil).getTime() - Date.now();
    expect(until).toBeGreaterThan(29 * 60_000);
    expect(until).toBeLessThanOrEqual(30 * 60_000 + 5_000);

    const status = unwrap(await getPublicWaitlistRaw(t.restaurantId, 2));
    expect(status.status).toBe("paused");
    const refused = await joinPublicWaitlistRaw(t.restaurantId, joinBody());
    expect(refused.status).toBe(409);
    expect(errorCode(refused.data)).toBe("WAITLIST_PAUSED");

    const host = await getHostRaw(t.tabletToken, t.managerSession);
    expect((host.data as any).onlineWaitlist.paused).toBe(true);

    const open = await onlinePauseTabletRaw(t.tabletToken, t.managerSession, {
      untilResume: true,
    });
    expect(unwrap(open).paused).toBe(true);
    expect(unwrap(open).pausedUntil).toBeNull();
    expect(unwrap(await getPublicWaitlistRaw(t.restaurantId, 2)).status).toBe(
      "paused"
    );

    for (const bad of [
      { minutes: 45 },
      { minutes: "30" },
      {},
      { untilResume: false },
    ]) {
      const res = await onlinePauseTabletRaw(
        t.tabletToken,
        t.managerSession,
        bad
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(errorCode(res.data)).toBe("WAITLIST_PAUSE_INVALID");
    }

    const resume = await onlinePauseTabletRaw(t.tabletToken, t.managerSession, {
      minutes: null,
    });
    expect(unwrap(resume).paused).toBe(false);
    expect(unwrap(await getPublicWaitlistRaw(t.restaurantId, 2)).status).toBe(
      "open"
    );
  });

  test("TC-1165: the owner mirror pauses and resumes; a guest's status order puts paused before party checks", async () => {
    const pause = await onlinePauseOwnerRaw(t.token, t.restaurantId, {
      minutes: 60,
    });
    expect(pause.status, msg(pause.data)).toBe(200);
    expect(unwrap(pause).paused).toBe(true);
    const read = unwrap(
      await getReservationSettingsOwnerRaw(t.token, t.restaurantId)
    );
    expect(read.onlineWaitlistPausedAt).toBeTruthy();
    expect(read.onlineWaitlistPausedUntil).toBeTruthy();
    expect(unwrap(await getPublicWaitlistRaw(t.restaurantId, 50)).status).toBe(
      "paused"
    );
    const resume = await onlinePauseOwnerRaw(t.token, t.restaurantId, {
      minutes: null,
    });
    expect(unwrap(resume).paused).toBe(false);
  });

  test("TC-1166: a server (no host capability) can't pause the line", async () => {
    const pin = "5177";
    const added = await createPinStaffTabletRaw(
      t.tabletToken,
      t.managerSession,
      {
        firstName: "Sam",
        lastName: "Server",
        pin,
        staffRole: "STAFF",
        capabilityRevokes: ["HOST_MANAGE_RESERVATIONS"],
      }
    );
    expect(added.status, JSON.stringify(added.data)).toBe(201);
    const session = await tabletStaffSignIn(
      t.tabletToken,
      String((added.data as any).data.id),
      pin
    );
    const res = await onlinePauseTabletRaw(t.tabletToken, session, {
      minutes: 30,
    });
    expect(res.status).toBe(403);
  });

  test("TC-1167: switching the waitlist off closes it again; entries already in line stay put", async () => {
    const a = await join();
    await settings({ onlineWaitlistEnabled: false });
    expect(unwrap(await getPublicWaitlistRaw(t.restaurantId, 2)).status).toBe(
      "disabled"
    );
    const view = unwrap(await getManagedReservationRaw(tokenOf(a.manageUrl)));
    expect(view.status).toBe("BOOKED");
    expect(view.placeInLine).toBe(1);
    await emptyTheLine();
  });
});
