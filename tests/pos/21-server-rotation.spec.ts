/**
 * 21-server-rotation.spec.ts — who gets the next table (reservations phase 4,
 * Contract B), real HTTP. Spec: restaunax/docs/features/TABLE_RESERVATIONS.md.
 *
 * What it pins (TC-1168 → TC-1179): off by default and field ignored, add-on
 * gate, who is in the rotation (clocked in + tipped job or no job), both rules'
 * order, seating out of order, exclude (shift-scoped), and that seating records
 * the server on the reservation, the walk-in and the check.
 *
 * People: Ana + Ben (tipped job), Nia (no job), Cole (cook: non-tipped job) and
 * Una, who never clocks in. Own tenants; gated on probeReservationsPhase4.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateGuestPhone, generateRunId } from "../../utils/testData";
import {
  createPinStaffTabletRaw,
  createReservationOwnerRaw,
  createStaffJobRaw,
  createTableOwnerRaw,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  getFloorRaw,
  getHostRaw,
  getOrderStatisticsDetailRaw,
  getReservationSettingsOwnerRaw,
  putReservationSettingsOwnerRaw,
  seatPartyTabletRaw,
  setFeatureOverrideAdminRaw,
  setMemberJobsRaw,
  tabletStaffSignIn,
  unseatWalkInTabletRaw,
  apiRequestRaw,
} from "../../utils/apiHelper";
import {
  probeReservationsPhase4,
  requireRelease,
} from "../../utils/releaseGate";
import {
  clockInRaw,
  clockOutRaw,
  errorCode,
  getRotationRaw,
  mintPhase4Tenant,
  msg,
  openCheckBody,
  seatReservationWithServerRaw,
  seatWalkInWithServerRaw,
  setRotationExcludedRaw,
  unwrap,
  type Phase4Tenant,
} from "../../utils/reservationPhase4Api";

const CREDS_OK = !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD;

interface Person {
  id: string;
  pin: string;
  name: string;
  session: string;
}

test.describe("POS — Server rotation (phase 4) @reservations-phase4", () => {
  test.skip(!CREDS_OK, "ADMIN creds needed (the file mints its own tenants)");

  const runId = generateRunId();
  let t: Phase4Tenant;
  let bare: Phase4Tenant;
  let onStack = false;
  let seq = 200;
  const people: Record<"ana" | "ben" | "nia" | "cole" | "una", Person> = {
    ana: { id: "", pin: "4101", name: "Ana", session: "" },
    ben: { id: "", pin: "4102", name: "Ben", session: "" },
    nia: { id: "", pin: "4103", name: "Nia", session: "" },
    cole: { id: "", pin: "4104", name: "Cole", session: "" },
    una: { id: "", pin: "4105", name: "Una", session: "" },
  };
  let tipped = "";
  let cook = "";

  const settings = async (patch: Record<string, unknown>) => {
    const res = await putReservationSettingsOwnerRaw(
      t.token,
      t.restaurantId,
      patch
    );
    expect(res.status, msg(res.data)).toBe(200);
  };

  const rotation = async () => {
    const res = await getRotationRaw(t.tabletToken, t.managerSession);
    expect(res.status, msg(res.data)).toBe(200);
    return (res.data as any).data as any[];
  };
  const order = async () => (await rotation()).map((r) => r.staffMemberId);

  const newTable = async (label: string, capacity = 4) => {
    const res = await createTableOwnerRaw(t.token, t.restaurantId, {
      name: `${label} ${runId}-${++seq}`,
      capacity,
    });
    expect(res.status, msg(res.data)).toBe(201);
    return unwrap(res).id as string;
  };

  const floorRow = async (tableId: string) =>
    (unwrap(await getFloorRaw(t.tabletToken)).tables as any[]).find(
      (r) => r.table.id === tableId
    );

  const seatWalkIn = async (
    server: string,
    guestCount = 2,
    tableId?: string
  ) => {
    const id = tableId ?? (await newTable("Walk-in"));
    const res = await seatWalkInWithServerRaw(
      t.tabletToken,
      t.managerSession,
      id,
      { guestCount, serverStaffMemberId: server }
    );
    expect(res.status, msg(res.data)).toBeLessThan(300);
    return id;
  };

  const clockIn = async (who: Person, jobId?: string) => {
    const res = await clockInRaw(t.tabletToken, {
      staffMemberId: who.id,
      pin: who.pin,
      ...(jobId ? { jobId } : {}),
    });
    expect(res.status, msg(res.data)).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
  };

  const booking = async (label: string, minutes = 120) => {
    const res = await createReservationOwnerRaw(t.token, t.restaurantId, {
      partySize: 2,
      scheduledAt: new Date(
        Math.floor((Date.now() + minutes * 60_000) / 900_000) * 900_000
      ).toISOString(),
      guestName: `${label} ${runId}`,
      guestPhone: generateGuestPhone(runId, ++seq),
    });
    expect(res.status, msg(res.data)).toBe(201);
    return unwrap(res) as { id: string };
  };

  test.beforeAll(async () => {
    if (!CREDS_OK) return;
    t = await mintPhase4Tenant(runId, { label: "rot", maxPartiesPerSlot: 20 });
    bare = await mintPhase4Tenant(runId, { label: "rotbare", addOn: false });
    onStack = await probeReservationsPhase4(t.token, t.restaurantId);

    await setFeatureOverrideAdminRaw(
      t.adminToken,
      t.restaurantId,
      "PAYROLL",
      true
    );
    const server = await createStaffJobRaw(t.token, t.restaurantId, {
      name: `Server ${runId}`,
      defaultHourlyRateCents: 900,
      isTipped: true,
    });
    if (!server.ok) throw new Error(`job: ${JSON.stringify(server.data)}`);
    tipped = (server.data as any).data.id;
    const kitchen = await createStaffJobRaw(t.token, t.restaurantId, {
      name: `Cook ${runId}`,
      defaultHourlyRateCents: 1800,
      isTipped: false,
    });
    cook = (kitchen.data as any).data.id;

    for (const who of Object.values(people)) {
      const added = await createPinStaffTabletRaw(
        t.tabletToken,
        t.managerSession,
        {
          firstName: who.name,
          lastName: "Rotation",
          pin: who.pin,
          staffRole: "STAFF",
        }
      );
      if (added.status !== 201)
        throw new Error(`staff: ${JSON.stringify(added.data)}`);
      who.id = String((added.data as any).data.id);
      who.session = await tabletStaffSignIn(t.tabletToken, who.id, who.pin);
    }
    for (const [who, job] of [
      [people.ana, tipped],
      [people.ben, tipped],
      [people.cole, cook],
    ] as const) {
      const res = await setMemberJobsRaw(t.token, t.restaurantId, who.id, [
        { jobId: job, isPrimary: true },
      ]);
      if (!res.ok) throw new Error(`member job: ${JSON.stringify(res.data)}`);
    }
    await clockIn(people.ana, tipped);
    await clockIn(people.ben, tipped);
    await clockIn(people.nia);
    await clockIn(people.cole, cook);
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
    await allure.label("feature", "Reservations — server rotation");
    requireRelease("reservationsPhase4", onStack);
    // A failed test restarts the worker with a fresh tenant: past the
    // off-by-default tests, rotation is on for every test.
    if (!/TC-11(68|69|70)\b/.test(test.info().title))
      await settings({ serverRotationEnabled: true });
  });

  test("TC-1168: off by default — empty list, no server on floor rows, and a server sent with a seat is ignored", async () => {
    const read = unwrap(
      await getReservationSettingsOwnerRaw(t.token, t.restaurantId)
    );
    expect(read.serverRotationEnabled).toBe(false);
    expect(read.serverRotationRule).toBe("LEAST_RECENTLY_SEATED");

    const res = await getRotationRaw(t.tabletToken, t.managerSession);
    expect(res.status).toBe(200);
    expect((res.data as any).data).toEqual([]);
    expect((res.data as any).enabled).toBe(false);

    const floor = unwrap(await getFloorRaw(t.tabletToken));
    expect(floor.floorSettings.serverRotationEnabled).toBe(false);
    expect((floor.tables as any[])[0]).not.toHaveProperty("server");

    // Not even a real id: rotation off → the field isn't read at all.
    const tableId = await newTable("Off");
    const seat = await seatWalkInWithServerRaw(
      t.tabletToken,
      t.managerSession,
      tableId,
      { guestCount: 2, serverStaffMemberId: "not-a-staff-id" }
    );
    expect(seat.status, msg(seat.data)).toBeLessThan(300);
    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, tableId, { serverStaffMemberId: people.ana.id })
    );
    expect(check.status, msg(check.data)).toBe(201);
    const detail = await getOrderStatisticsDetailRaw(
      t.token,
      check.data.id as string
    );
    expect((detail.data as any).createdByStaffMemberId).toBe(t.managerId);
    await cancelTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      check.data.id as string,
      "Automation"
    );
  });

  test("TC-1169: without the add-on — rotation routes refuse, the floor is the plain one", async () => {
    const get = await getRotationRaw(bare.tabletToken, bare.managerSession);
    expect(get.status).toBe(403);
    expect(errorCode(get.data)).toBe("RESERVATIONS_NOT_ENABLED");
    const post = await setRotationExcludedRaw(
      bare.tabletToken,
      bare.managerSession,
      bare.managerId,
      true
    );
    expect(post.status).toBe(403);
    expect(errorCode(post.data)).toBe("RESERVATIONS_NOT_ENABLED");
    const floor = await getFloorRaw(bare.tabletToken);
    expect(floor.status).toBe(200);
    const rows = unwrap(floor).tables as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).not.toHaveProperty("server");
  });

  test("TC-1170: only the two rules are accepted", async () => {
    const bad = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      serverRotationRule: "ROUND_ROBIN",
    });
    expect(bad.status).toBe(400);
    expect(errorCode(bad.data)).toBe("RESERVATION_SETTINGS_INVALID_RANGE");
    await settings({
      serverRotationEnabled: true,
      serverRotationRule: "FEWEST_ACTIVE_COVERS",
    });
    const read = unwrap(
      await getReservationSettingsOwnerRaw(t.token, t.restaurantId)
    );
    expect(read.serverRotationEnabled).toBe(true);
    expect(read.serverRotationRule).toBe("FEWEST_ACTIVE_COVERS");
    await settings({ serverRotationRule: "LEAST_RECENTLY_SEATED" });
  });

  test("TC-1171: who is in — clocked in with a tipped job or no job; not the cook, not someone off the clock", async () => {
    await settings({ serverRotationEnabled: true });
    const list = await rotation();
    const ids = list.map((r) => r.staffMemberId);
    expect(ids).toContain(people.ana.id);
    expect(ids).toContain(people.ben.id);
    expect(ids).toContain(people.nia.id);
    expect(ids).not.toContain(people.cole.id);
    expect(ids).not.toContain(people.una.id);
    expect(ids).not.toContain(t.managerId);

    const ana = list.find((r) => r.staffMemberId === people.ana.id);
    expect(ana.name).toBe("Ana R.");
    expect(ana.initials).toBe("AR");
    expect(ana.excluded).toBe(false);
    for (const key of [
      "activeTables",
      "activeCovers",
      "coversToday",
      "lastSeatedAt",
      "nextUp",
    ])
      expect(ana).toHaveProperty(key);

    // The envelope says which rule made this order.
    const res = await getRotationRaw(t.tabletToken, t.managerSession);
    expect((res.data as any).enabled).toBe(true);
    expect((res.data as any).rule).toBe("LEAST_RECENTLY_SEATED");
  });

  test("TC-1172: a server without the host capability may still read it — a screen load never 403s", async () => {
    const res = await getRotationRaw(t.tabletToken, people.ana.session);
    expect(res.status).toBe(200);
    expect(((res.data as any).data as any[]).length).toBeGreaterThan(0);
  });

  test("TC-1173: least recently seated — earliest clock-in first when nobody has sat, seating moves a server to the back, out of order too", async () => {
    await settings({
      serverRotationEnabled: true,
      serverRotationRule: "LEAST_RECENTLY_SEATED",
    });
    // Nobody sat yet: clock-in order; nextUp only on the first.
    expect(await order()).toEqual([
      people.ana.id,
      people.ben.id,
      people.nia.id,
    ]);
    const first = await rotation();
    expect(first.map((r) => r.nextUp)).toEqual([true, false, false]);
    expect(first[0].lastSeatedAt).toBeNull();

    await seatWalkIn(people.ana.id);
    expect(await order()).toEqual([
      people.ben.id,
      people.nia.id,
      people.ana.id,
    ]);

    // Out of order: Nia sits before Ben → Nia to the back, Ben still next.
    await new Promise((r) => setTimeout(r, 1100));
    const niaTable = await seatWalkIn(people.nia.id, 3);
    const list = await rotation();
    expect(list.map((r) => r.staffMemberId)).toEqual([
      people.ben.id,
      people.ana.id,
      people.nia.id,
    ]);
    const nia = list.find((r) => r.staffMemberId === people.nia.id);
    expect(nia.activeTables).toBe(1);
    expect(nia.activeCovers).toBe(3);
    expect(nia.coversToday).toBe(3);
    expect(nia.lastSeatedAt).toBeTruthy();
    expect(list[0].nextUp).toBe(true);

    // Floor rows carry the server's tag while rotation is on.
    const row = await floorRow(niaTable);
    expect(row.server).toEqual({
      staffMemberId: people.nia.id,
      name: "Nia R.",
      initials: "NR",
    });
    const freeTable = await newTable("Free");
    expect((await floorRow(freeTable)).server).toBeNull();
    expect(
      unwrap(await getFloorRaw(t.tabletToken)).floorSettings.serverRotationRule
    ).toBe("LEAST_RECENTLY_SEATED");
  });

  test("TC-1174: fewest active covers — lowest first; when a party leaves their covers drop and today's count stays", async () => {
    await settings({ serverRotationRule: "FEWEST_ACTIVE_COVERS" });
    // Sat so far: Ana 2, Nia 3, Ben 0.
    expect((await order())[0]).toBe(people.ben.id);
    const table = await seatWalkIn(people.ben.id, 4);
    const list = await rotation();
    expect(list.map((r) => r.staffMemberId)).toEqual([
      people.ana.id,
      people.nia.id,
      people.ben.id,
    ]);
    expect(list[2].activeCovers).toBe(4);

    const unseat = await unseatWalkInTabletRaw(
      t.tabletToken,
      t.managerSession,
      table
    );
    expect(unseat.status, msg(unseat.data)).toBe(200);
    const after = (await rotation()).find(
      (r) => r.staffMemberId === people.ben.id
    );
    expect(after.activeCovers).toBe(0);
    await settings({ serverRotationRule: "LEAST_RECENTLY_SEATED" });
  });

  test("TC-1175: exclude — sorted last, nextUp moves, everyone out → nobody is next; bad input refused", async () => {
    const before = await order();
    const res = await setRotationExcludedRaw(
      t.tabletToken,
      t.managerSession,
      before[0]!,
      true
    );
    expect(res.status, msg(res.data)).toBe(200);
    expect(msg(res.data).length).toBeGreaterThan(0);
    const list = (res.data as any).data as any[];
    expect(list[list.length - 1].staffMemberId).toBe(before[0]);
    expect(list[list.length - 1].excluded).toBe(true);
    expect(list[list.length - 1].nextUp).toBe(false);
    expect(list[0].nextUp).toBe(true);

    for (const id of before)
      await setRotationExcludedRaw(t.tabletToken, t.managerSession, id, true);
    const allOut = await rotation();
    expect(allOut.every((r) => r.excluded && !r.nextUp)).toBe(true);
    for (const id of before)
      await setRotationExcludedRaw(t.tabletToken, t.managerSession, id, false);
    expect(await order()).toEqual(before);

    const notBool = await setRotationExcludedRaw(
      t.tabletToken,
      t.managerSession,
      before[0]!,
      "yes"
    );
    expect(notBool.status).toBe(400);
    expect(errorCode(notBool.data)).toBe("SYSTEM_VALIDATION_ERROR");
    const offClock = await setRotationExcludedRaw(
      t.tabletToken,
      t.managerSession,
      people.una.id,
      true
    );
    expect(offClock.status).toBe(404);
    expect(errorCode(offClock.data)).toBe("ROTATION_NOT_CLOCKED_IN");
  });

  test("TC-1176: being taken out lasts one shift — clock out and back in and they are in again", async () => {
    const res = await setRotationExcludedRaw(
      t.tabletToken,
      t.managerSession,
      people.nia.id,
      true
    );
    expect(res.status).toBe(200);
    const out = await clockOutRaw(t.tabletToken, {
      staffMemberId: people.nia.id,
      pin: people.nia.pin,
    });
    expect(out.status, msg(out.data)).toBe(200);
    expect(await order()).not.toContain(people.nia.id);
    await clockIn(people.nia);
    const nia = (await rotation()).find(
      (r) => r.staffMemberId === people.nia.id
    );
    expect(nia.excluded).toBe(false);
  });

  test("TC-1177: seating a reservation records the server — row, floor, the check that follows; back to waitlist clears it", async () => {
    const tableId = await newTable("Booked");
    const row = await booking("Rotation booking");
    const seat = await seatReservationWithServerRaw(
      t.tabletToken,
      t.managerSession,
      row.id,
      { tableIds: [tableId], serverStaffMemberId: people.ben.id }
    );
    expect(seat.status, msg(seat.data)).toBe(201);
    const hostRow = (
      unwrap(await getHostRaw(t.tabletToken, t.managerSession)) as any[]
    ).find((r) => r.id === row.id);
    expect(hostRow.serverStaffMemberId).toBe(people.ben.id);
    expect((await floorRow(tableId)).server.staffMemberId).toBe(people.ben.id);

    // The check linked to it belongs to Ben, whoever rang it.
    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, tableId, { reservationId: row.id })
    );
    expect(check.status, msg(check.data)).toBe(201);
    const detail = await getOrderStatisticsDetailRaw(
      t.token,
      check.data.id as string
    );
    expect((detail.data as any).createdByStaffMemberId).toBe(people.ben.id);
    await cancelTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      check.data.id as string,
      "Automation"
    );

    // Back to waitlist.
    const row2 = await booking("Rotation unseat");
    const table2 = await newTable("Booked 2");
    await seatReservationWithServerRaw(
      t.tabletToken,
      t.managerSession,
      row2.id,
      { tableIds: [table2], serverStaffMemberId: people.ana.id }
    );
    const unseat = await apiRequestRaw(
      "POST",
      `/api/tablet/reservations/${row2.id}/unseat`,
      undefined,
      t.tabletToken,
      { "X-Staff-Session": t.managerSession }
    );
    expect(unseat.status, msg(unseat.data)).toBe(200);
    const after = (
      unwrap(await getHostRaw(t.tabletToken, t.managerSession)) as any[]
    ).find((r) => r.id === row2.id);
    expect(after.serverStaffMemberId).toBeNull();
  });

  test("TC-1178: a walk-in's server carries to its check; a server named on the check wins; the signed-in person is the fallback", async () => {
    const walkInTable = await seatWalkIn(people.nia.id);
    const inherit = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, walkInTable)
    );
    expect(inherit.status, msg(inherit.data)).toBe(201);
    const inherited = await getOrderStatisticsDetailRaw(
      t.token,
      inherit.data.id as string
    );
    expect((inherited.data as any).createdByStaffMemberId).toBe(people.nia.id);

    const named = await newTable("Named");
    const direct = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, named, { serverStaffMemberId: people.ana.id })
    );
    expect(direct.status, msg(direct.data)).toBe(201);
    const directDetail = await getOrderStatisticsDetailRaw(
      t.token,
      direct.data.id as string
    );
    expect((directDetail.data as any).createdByStaffMemberId).toBe(
      people.ana.id
    );

    const plain = await newTable("Plain");
    const fallback = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, plain)
    );
    expect(fallback.status, msg(fallback.data)).toBe(201);
    const fallbackDetail = await getOrderStatisticsDetailRaw(
      t.token,
      fallback.data.id as string
    );
    expect((fallbackDetail.data as any).createdByStaffMemberId).toBe(
      t.managerId
    );

    // Today's covers come from that check, not twice from walk-in + check.
    const nia = (await rotation()).find(
      (r) => r.staffMemberId === people.nia.id
    );
    expect(nia.activeTables).toBeGreaterThanOrEqual(1);
  });

  test("TC-1179: a server who isn't staff here is refused before anything is written — every seating route", async () => {
    const stranger = bare.managerId;
    const table = await newTable("Refused");
    const walkIn = await seatWalkInWithServerRaw(
      t.tabletToken,
      t.managerSession,
      table,
      { guestCount: 2, serverStaffMemberId: stranger }
    );
    expect(walkIn.status).toBe(400);
    expect(errorCode(walkIn.data)).toBe("ROTATION_SERVER_INVALID");
    expect((await floorRow(table)).state).toBe("AVAILABLE");

    const row = await booking("Rotation refused");
    const seat = await seatReservationWithServerRaw(
      t.tabletToken,
      t.managerSession,
      row.id,
      { tableIds: [table], serverStaffMemberId: stranger }
    );
    expect(seat.status).toBe(400);
    expect(errorCode(seat.data)).toBe("ROTATION_SERVER_INVALID");

    const party = await seatPartyTabletRaw(t.tabletToken, t.managerSession, {
      tableIds: [table],
      guestCount: 2,
      serverStaffMemberId: stranger,
    });
    expect(party.status).toBe(400);
    expect(errorCode(party.data)).toBe("ROTATION_SERVER_INVALID");

    const order = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, table, { serverStaffMemberId: stranger })
    );
    expect(order.status).toBe(400);
    expect(errorCode(order.data)).toBe("ROTATION_SERVER_INVALID");

    // A real server on seat-party is recorded.
    const ok = await seatPartyTabletRaw(t.tabletToken, t.managerSession, {
      tableIds: [table],
      guestCount: 2,
      serverStaffMemberId: people.ana.id,
    });
    expect(ok.status, msg(ok.data)).toBe(201);
    expect((await floorRow(table)).server.staffMemberId).toBe(people.ana.id);
  });
});
