/**
 * 23-reservations-audit-round2.spec.ts — the newest reservation work against
 * the REAL local stack: booking hours past midnight, the guest's own language,
 * same-day availability from the floor's prediction, the Tonight summary and
 * the reservation items in Needs you today. Spec:
 * restaunax/docs/features/TABLE_RESERVATIONS.md, back-office/NEEDS_YOU_TODAY.md.
 *
 * Real HTTP throughout. Three local reaches, all refusing anything but localhost:
 *  - E2E_LOCAL_DATABASE_URL: a tenant's time zone is set so the time of day is
 *    what the test needs (12:10 AM is a state, not something to wait for), rows
 *    are aged instead of sleeping. Never a delete.
 *  - BACKEND_DIR: backend's scripts/e2e/reservationProbe.ts runs the real worker
 *    code with no route: the morning summary and the reminder sweep.
 *  - E2E_BACKEND_LOG: SMS is off locally, and the backend logs the exact text it
 *    would have sent; that log file is read here.
 * Mail comes from the local Mailpit (MAILPIT_LOCAL_URL, default :8025).
 *
 * Run: BACKEND_DIR=<backend> KEEP_TEST_DATA=true E2E_BACKEND_LOG=<log>
 *   scripts/with-stripe-test-env.sh ./node_modules/.bin/playwright test
 *   --config $PWD/playwright.local.config.ts tests/pos/23-...
 *
 * TC-1900 → TC-1942. Gated on probeReservationsPhase4.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateGuestPhone, generateRunId } from "../../utils/testData";
import { localDateKey } from "../../utils/dealSchedule";
import {
  apiRequestRaw,
  createPinStaffTabletRaw,
  createReservationDateOverrideOwnerRaw,
  createReservationOwnerRaw,
  createReservationServicePeriodOwnerRaw,
  createReservationTabletRaw,
  createTableOwnerRaw,
  createTabletOrderRaw,
  getFloorRaw,
  getHostRaw,
  getPublicAvailabilityDaysRaw,
  getPublicAvailabilityRaw,
  listReservationDateOverridesOwnerRaw,
  listReservationsOwnerRaw,
  openRegisterSessionPos,
  patchReservationOwnerRaw,
  putReservationSettingsOwnerRaw,
  setFeatureOverrideAdminRaw,
  settleTabCashRaw,
} from "../../utils/apiHelper";
import {
  probeReservationsPhase4,
  requireRelease,
} from "../../utils/releaseGate";
import {
  clockInRaw,
  createDepositRuleRaw,
  errorCode,
  getRotationRaw,
  joinPublicWaitlistRaw,
  localDbReady,
  localSql,
  mintPhase4Tenant,
  msg,
  onlinePauseOwnerRaw,
  openCheckBody,
  seatWalkInWithServerRaw,
  unwrap,
  type Phase4Tenant,
} from "../../utils/reservationPhase4Api";
import { stripeTestModeReady } from "../../utils/stripeTestMode";

const CREDS_OK = !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD;
const BACKEND_DIR = process.env.BACKEND_DIR ?? "";
const BACKEND_LOG = process.env.E2E_BACKEND_LOG ?? "";
const MAILPIT = process.env.MAILPIT_LOCAL_URL ?? "http://localhost:8025";
const MIN = 60_000;
const PUBLIC_RES = (rid: string) =>
  `/api/public/restaurants/${rid}/reservations`;

type Slot = { time: string; scheduledAt: string; depositCents?: number | null };

/** A zone where it is `hour` o'clock now, so the time of day is what a test
 * needs. Minutes stay the real ones; tests leave an hour or more of slack. */
const zoneAtLocalHour = (hour: number): string => {
  let offset = hour - new Date().getUTCHours();
  if (offset < -12) offset += 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return "Etc/GMT";
  // POSIX sign: Etc/GMT+5 is five hours BEHIND UTC.
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
};

const setZone = (t: Phase4Tenant, zone: string): void => {
  localSql(
    `update "Restaurant" set timezone = '${zone}' where id = '${t.restaurantId}'`
  );
  t.timeZone = zone;
};

/** The minted tenant's every-day periods off; the test states its own. */
const clearPeriods = (t: Phase4Tenant): void => {
  localSql(
    `update "ReservationServicePeriod" set "isActive" = false where "restaurantId" = '${t.restaurantId}'`
  );
};

const weekdayOf = (dateKey: string): number =>
  new Date(`${dateKey}T12:00:00Z`).getUTCDay();

const addDays = (dateKey: string, days: number): string => {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const period = async (
  t: Phase4Tenant,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  extra: Record<string, unknown> = {}
) => {
  const res = await createReservationServicePeriodOwnerRaw(
    t.token,
    t.restaurantId,
    {
      name: `Night ${dayOfWeek} ${startTime}`,
      dayOfWeek,
      startTime,
      endTime,
      slotIntervalMinutes: 30,
      maxPartiesPerSlot: 5,
      isActive: true,
      ...extra,
    }
  );
  expect(res.status, msg(res.data)).toBeLessThan(300);
};

const slotsOf = async (
  t: Phase4Tenant,
  date: string,
  partySize = 2
): Promise<Slot[]> => {
  const res = await getPublicAvailabilityRaw(t.restaurantId, date, partySize);
  expect(res.status, msg(res.data)).toBe(200);
  return unwrap(res).slots as Slot[];
};

const ownerList = async (t: Phase4Tenant, date: string) => {
  const res = await listReservationsOwnerRaw(t.token, t.restaurantId, { date });
  expect(res.status, msg(res.data)).toBe(200);
  return {
    rows: unwrap(res) as { id: string; scheduledAt: string; kind: string }[],
    serviceToday: (res.data as any).serviceToday as string,
  };
};

const hostList = async (t: Phase4Tenant, date?: string) => {
  const res = await getHostRaw(t.tabletToken, t.managerSession, date);
  expect(res.status, msg(res.data)).toBe(200);
  return {
    rows: unwrap(res) as { id: string; scheduledAt: string; kind: string }[],
    serviceToday: (res.data as any).serviceToday as string,
  };
};

/** The exact texts the backend would have sent this phone since `since`. */
const smsTextsTo = (guestPhone: string, since: number): string[] => {
  const last4 = guestPhone.replace(/\D/g, "").slice(-4);
  return readFileSync(BACKEND_LOG, "utf8")
    .split("\n")
    .filter((l) => l.includes('"sms_skipped_disabled"') && l.includes(last4))
    .flatMap((l) => {
      try {
        const row = JSON.parse(l) as {
          ts: string;
          toLast4: string;
          message: string;
        };
        return row.toLast4 === last4 && Date.parse(row.ts) >= since
          ? [row.message]
          : [];
      } catch {
        return [];
      }
    });
};

const waitForSms = async (
  guestPhone: string,
  since: number,
  pattern: RegExp
): Promise<string> => {
  let found = "";
  await expect
    .poll(
      () => {
        found =
          smsTextsTo(guestPhone, since).find((m) => pattern.test(m)) ?? "";
        return found;
      },
      { timeout: 30_000, intervals: [500] }
    )
    .not.toBe("");
  return found;
};

/** GSM-7 basic set + extension: a text outside it bills 70 characters a part. */
const GSM7 =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

interface Mail {
  subject: string;
  text: string;
  html: string;
}

const mailTo = async (address: string, subject: RegExp): Promise<Mail> => {
  let found: Mail | null = null;
  await expect
    .poll(
      async () => {
        const list = (await (
          await fetch(
            `${MAILPIT}/api/v1/search?limit=20&query=${encodeURIComponent(`to:"${address}"`)}`
          )
        ).json()) as { messages: { ID: string; Subject: string }[] };
        const hit = list.messages.find((m) => subject.test(m.Subject));
        if (!hit) return false;
        const full = (await (
          await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)
        ).json()) as { Subject: string; Text: string; HTML: string };
        found = { subject: full.Subject, text: full.Text, html: full.HTML };
        return true;
      },
      { timeout: 30_000, intervals: [1000] }
    )
    .toBe(true);
  return found!;
};

/** Runs real worker code in a process of its own (backend scripts/e2e). */
const probe = (args: string[]): { result: any; output: string } => {
  const output = execFileSync(
    "./node_modules/.bin/tsx",
    ["scripts/e2e/reservationProbe.ts", ...args],
    {
      cwd: BACKEND_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DATABASE_URL: process.env.E2E_LOCAL_DATABASE_URL,
        EMAIL_SANDBOX_PROVIDER: "mailpit",
        MAILPIT_SMTP_HOST: "localhost",
        MAILPIT_SMTP_PORT: "1025",
        MAILPIT_SMTP_USER: "",
        MAILPIT_SMTP_PASS: "",
        ENABLE_LIVE_EMAIL: "false",
        ENABLE_SMS: "false",
        NODE_ENV: "development",
        REDIS_HOST: "localhost",
      },
    }
  );
  const line = output.split("\n").find((l) => l.startsWith("RESULT:"));
  if (!line) throw new Error(`probe answered nothing: ${output.slice(-500)}`);
  return { result: JSON.parse(line.slice("RESULT:".length)), output };
};

const needsYouKinds = async (t: Phase4Tenant): Promise<string[]> => {
  const res = await apiRequestRaw<any>(
    "GET",
    `/api/needs-you/restaurant/${t.restaurantId}`,
    undefined,
    t.token
  );
  expect(res.status, msg(res.data)).toBe(200);
  const items = (res.data?.data?.items ?? res.data?.items) as {
    kind: string;
  }[];
  return items.map((i) => i.kind);
};

test.describe("POS — Reservations audit, round 2 @reservations-phase4", () => {
  test.skip(!CREDS_OK, "ADMIN creds needed (the file mints its own tenants)");
  test.skip(
    !localDbReady() || !BACKEND_DIR,
    "Local stack only: E2E_LOCAL_DATABASE_URL + BACKEND_DIR (RUNNING_TESTS.md)"
  );
  test.describe.configure({ timeout: 4 * MIN });

  const runId = generateRunId();
  let seq = 400;
  const phone = () => generateGuestPhone(runId, ++seq);
  const name = (label: string) => `${label} ${runId}`;
  const email = (label: string) =>
    `${label}-${runId}-${++seq}@restaunax.test`.toLowerCase();

  const fresh = async (
    label: string,
    opts: Parameters<typeof mintPhase4Tenant>[1] = {}
  ): Promise<Phase4Tenant> => {
    const t = await mintPhase4Tenant(runId, {
      label: `${label}${++seq}`,
      maxPartiesPerSlot: 20,
      ...opts,
    });
    requireRelease(
      "reservationsPhase4",
      await probeReservationsPhase4(t.token, t.restaurantId)
    );
    return t;
  };

  /** Friday 22:00-01:00 on a weekday of its own, with a 30-minute turn so a
   * party fits before 1 AM up to a 12:30 AM start. */
  const overnightTenant = async (
    label: string,
    opts: {
      start?: string;
      end?: string;
      periodExtra?: Record<string, unknown>;
      mint?: Parameters<typeof mintPhase4Tenant>[1];
      daysAhead?: number;
    } = {}
  ) => {
    const t = await fresh(label, opts.mint);
    setZone(t, "America/New_York");
    const settings = await putReservationSettingsOwnerRaw(
      t.token,
      t.restaurantId,
      { defaultDurationMinutes: 30 }
    );
    expect(settings.status, msg(settings.data)).toBe(200);
    clearPeriods(t);
    const day = localDateKey(t.timeZone, opts.daysAhead ?? 3);
    await period(
      t,
      weekdayOf(day),
      opts.start ?? "22:00",
      opts.end ?? "01:00",
      opts.periodExtra
    );
    return { t, day, next: addDays(day, 1) };
  };

  const book = async (
    t: Phase4Tenant,
    scheduledAt: string,
    extra: Record<string, unknown> = {},
    headers?: Record<string, string>
  ) => {
    const guestPhone = phone();
    const res = await apiRequestRaw<any>(
      "POST",
      PUBLIC_RES(t.restaurantId),
      {
        partySize: 2,
        scheduledAt,
        guestName: name("Guest"),
        guestPhone,
        clientRequestId: `r2-${runId}-${++seq}`,
        ...extra,
      },
      undefined,
      headers
    );
    return { res, guestPhone };
  };

  const booked = async (
    t: Phase4Tenant,
    scheduledAt: string,
    extra: Record<string, unknown> = {},
    headers?: Record<string, string>
  ) => {
    const { res, guestPhone } = await book(t, scheduledAt, extra, headers);
    expect(res.status, msg(res.data)).toBe(201);
    const d = unwrap(res);
    return {
      id: (d.id ?? d.reservationId) as string,
      token: String(d.manageUrl).split("/").pop() as string,
      guestPhone,
      deposit: d.deposit,
    };
  };

  const staffBooking = async (
    t: Phase4Tenant,
    scheduledAt: string | Date,
    extra: Record<string, unknown> = {}
  ) => {
    const res = await createReservationOwnerRaw(t.token, t.restaurantId, {
      partySize: 2,
      scheduledAt:
        scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt,
      guestName: name("Staff booked"),
      guestPhone: phone(),
      ...extra,
    });
    expect(res.status, msg(res.data)).toBeLessThan(300);
    return unwrap(res) as { id: string; deposit?: unknown };
  };

  test.beforeEach(async () => {
    await allure.label("feature", "Reservations — audit round 2");
  });

  // ── 1. Booking hours past midnight ──────────────────────────────────────

  test("TC-1900: a 22:00-01:00 period offers slots past midnight, they book, and a booking is on one list, the night it started", async () => {
    const { t, day, next } = await overnightTenant("nightlist");
    const slots = await slotsOf(t, day);
    expect(slots.map((s) => s.time)).toEqual([
      "22:00",
      "22:30",
      "23:00",
      "23:30",
      "00:00",
      "00:30",
    ]);
    const after = slots[5]!;
    const wall = new Intl.DateTimeFormat("en-CA", {
      timeZone: t.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(after.scheduledAt));
    expect(wall).toBe(next);
    expect(await slotsOf(t, next)).toEqual([]);

    const late = await booked(t, after.scheduledAt);
    const early = await booked(t, slots[1]!.scheduledAt);

    const owner = await ownerList(t, day);
    expect(owner.rows.map((r) => r.id).sort()).toEqual(
      [late.id, early.id].sort()
    );
    expect((await ownerList(t, next)).rows).toEqual([]);

    const host = await hostList(t, day);
    expect(host.rows.map((r) => r.id).sort()).toEqual(
      [late.id, early.id].sort()
    );
    expect((await hostList(t, next)).rows).toEqual([]);

    // Not last night yet: "today" is the calendar date, on both routes.
    const today = localDateKey(t.timeZone);
    expect(owner.serviceToday).toBe(today);
    expect(host.serviceToday).toBe(today);
  });

  test("TC-1901: a closure for the service day closes its after-midnight slots, counts its bookings once, and leaves the next day alone", async () => {
    const { t, day, next } = await overnightTenant("nightclosed");
    await period(t, weekdayOf(next), "12:00", "14:00");
    const slots = await slotsOf(t, day);
    const after = slots.find((s) => s.time === "00:30")!;
    await booked(t, after.scheduledAt);

    const closeNext = await createReservationDateOverrideOwnerRaw(
      t.token,
      t.restaurantId,
      { date: next, closed: true }
    );
    expect(closeNext.status, msg(closeNext.data)).toBeLessThan(300);
    const overrides = async () =>
      unwrap(
        await listReservationDateOverridesOwnerRaw(t.token, t.restaurantId)
      ) as { date: string; affectedReservations: number }[];
    const affected = async (d: string) =>
      (await overrides()).find((o) => o.date.startsWith(d))
        ?.affectedReservations;
    // The next calendar date is not whose booking it is.
    expect(await affected(next)).toBe(0);
    // Next day's closure leaves the night before bookable.
    expect((await slotsOf(t, day)).map((s) => s.time)).toContain("00:00");
    expect(await slotsOf(t, next)).toEqual([]);

    const closeDay = await createReservationDateOverrideOwnerRaw(
      t.token,
      t.restaurantId,
      { date: day, closed: true }
    );
    expect(closeDay.status, msg(closeDay.data)).toBeLessThan(300);
    expect(await affected(day)).toBe(1);

    const closed = await getPublicAvailabilityRaw(t.restaurantId, day, 2);
    expect(unwrap(closed).slots).toEqual([]);
    expect(unwrap(closed).closed).toBe(true);

    const other = slots.find((s) => s.time === "00:00")!;
    const refused = await book(t, other.scheduledAt);
    expect(refused.res.status).toBe(409);
    expect(errorCode(refused.res.data)).toBe("RESERVATION_SLOT_UNAVAILABLE");

    const staff = await staffBooking(t, other.scheduledAt);
    expect((staff as any).closedDate).toBe(true);
  });

  test("TC-1902: pacing and tables are one night across midnight: same lock, same counts", async () => {
    const { t, day } = await overnightTenant("nightpace", {
      start: "23:00",
      end: "01:00",
      periodExtra: { slotIntervalMinutes: 15, maxPartiesPerSlot: 1 },
      mint: { tableCapacity: 4 },
    });
    const slots = await slotsOf(t, day);
    const beforeMidnight = slots.find((s) => s.time === "23:45")!;
    const afterMidnight = slots.find((s) => s.time === "00:00")!;
    expect(beforeMidnight).toBeTruthy();
    expect(afterMidnight).toBeTruthy();

    // One table, overlapping across midnight, at the same moment: the lock is
    // the night's, so exactly one gets it.
    const race = await Promise.all([
      book(t, beforeMidnight.scheduledAt),
      book(t, afterMidnight.scheduledAt),
    ]);
    const statuses = race.map((r) => r.res.status).sort();
    expect(statuses, JSON.stringify(race.map((r) => r.res.data))).toEqual([
      201, 409,
    ]);
    const left = (await slotsOf(t, day)).map((s) => s.time);
    expect(left).not.toContain("23:45");
    expect(left).not.toContain("00:00");

    // A second table: the floor has room, so the cap of 1 refuses alone.
    const table = await createTableOwnerRaw(t.token, t.restaurantId, {
      name: `Second ${runId}`,
      capacity: 4,
    });
    expect(table.status, msg(table.data)).toBe(201);
    const late = (await slotsOf(t, day)).find((s) => s.time === "00:30")!;
    await booked(t, late.scheduledAt);
    const sameSlot = await book(t, late.scheduledAt);
    expect(sameSlot.res.status).toBe(409);
    expect(errorCode(sameSlot.res.data)).toBe("RESERVATION_PACING_FULL");
    expect((await slotsOf(t, day)).map((s) => s.time)).not.toContain("00:30");
  });

  test("TC-1903: /days judges a night under the day it starts on", async () => {
    const { t, day, next } = await overnightTenant("nightdays");
    const days = async () =>
      unwrap(
        await getPublicAvailabilityDaysRaw(t.restaurantId, {
          from: day,
          to: next,
          partySize: 2,
        })
      );
    let reply = await days();
    expect(reply.days).toEqual([
      { date: day, status: "available" },
      { date: next, status: "no_service" },
    ]);
    expect(reply.today).toBe(localDateKey(t.timeZone));

    const close = await createReservationDateOverrideOwnerRaw(
      t.token,
      t.restaurantId,
      { date: day, closed: true }
    );
    expect(close.status, msg(close.data)).toBeLessThan(300);
    reply = await days();
    expect(reply.days[0]).toEqual({ date: day, status: "closed" });
  });

  test("TC-1904: an end past 06:00 is refused; 06:00 itself and equal times behave", async () => {
    const t = await fresh("nightbad");
    const attempt = (startTime: string, endTime: string) =>
      createReservationServicePeriodOwnerRaw(t.token, t.restaurantId, {
        name: `Try ${startTime}-${endTime}`,
        dayOfWeek: 2,
        startTime,
        endTime,
        slotIntervalMinutes: 30,
        maxPartiesPerSlot: 5,
        isActive: true,
      });
    for (const [start, end] of [
      ["22:00", "07:00"],
      ["17:00", "14:00"],
      ["22:00", "22:00"],
      ["22:00", "06:01"],
    ] as const) {
      const res = await attempt(start, end);
      expect(res.status, `${start}-${end}`).toBe(400);
      expect(errorCode(res.data)).toBe("RESERVATION_PERIOD_TIME_INVALID");
    }
    const ok = await attempt("22:00", "06:00");
    expect(ok.status, msg(ok.data)).toBeLessThan(300);
  });

  test("TC-1905: daylight saving: the skipped hour offers nothing, the repeated hour offers each time once, and a booking stays on its night", async () => {
    const t = await fresh("nightdst");
    const settings = await putReservationSettingsOwnerRaw(
      t.token,
      t.restaurantId,
      { defaultDurationMinutes: 30, advanceBookingDays: 365 }
    );
    expect(settings.status, msg(settings.data)).toBe(200);
    clearPeriods(t);

    // US spring forward: Sunday 2027-03-14, 02:00 → 03:00.
    setZone(t, "America/New_York");
    const spring = "2027-03-13";
    await period(t, weekdayOf(spring), "22:00", "04:00");
    const springSlots = await slotsOf(t, spring);
    const afterMidnight = springSlots.filter((s) => s.time < "12:00");
    expect(afterMidnight.map((s) => s.time)).toEqual([
      "00:00",
      "00:30",
      "01:00",
      "01:30",
      "03:00",
      "03:30",
    ]);
    const atThree = afterMidnight.find((s) => s.time === "03:00")!;
    // 1:30 EST and 3:00 EDT are half an hour apart in real time.
    const halfHour =
      Date.parse(atThree.scheduledAt) -
      Date.parse(afterMidnight.find((s) => s.time === "01:30")!.scheduledAt);
    expect(halfHour).toBe(30 * MIN);
    const b = await booked(t, atThree.scheduledAt);
    expect((await ownerList(t, spring)).rows.map((r) => r.id)).toEqual([b.id]);
    expect((await ownerList(t, addDays(spring, 1))).rows).toEqual([]);

    // Sydney falls back: Sunday 2027-04-04, 03:00 → 02:00. Also a Saturday, so
    // the same period serves.
    setZone(t, "Australia/Sydney");
    const autumn = "2027-04-03";
    const autumnSlots = await slotsOf(t, autumn);
    const instants = autumnSlots.map((s) => Date.parse(s.scheduledAt));
    expect(new Set(instants).size).toBe(instants.length);
    expect([...instants].sort((a, b2) => a - b2)).toEqual(instants);
    const repeated = autumnSlots.filter((s) => s.time === "02:30");
    expect(repeated).toHaveLength(1);
    const c = await booked(t, repeated[0]!.scheduledAt);
    expect((await ownerList(t, autumn)).rows.map((r) => r.id)).toEqual([c.id]);
    expect((await ownerList(t, addDays(autumn, 1))).rows).toEqual([]);
  });

  test("TC-1906: at 1 AM last night is still today: what is left can be booked online, on last night's list, and it ends when the period does", async () => {
    const t = await fresh("night1am");
    await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      defaultDurationMinutes: 30,
    });
    clearPeriods(t);
    setZone(t, zoneAtLocalHour(1));
    const calendarToday = localDateKey(t.timeZone);
    const lastNight = addDays(calendarToday, -1);
    await period(t, weekdayOf(lastNight), "22:00", "05:00");

    const strip = unwrap(
      await getPublicAvailabilityDaysRaw(t.restaurantId, {
        from: lastNight,
        to: calendarToday,
        partySize: 2,
      })
    );
    expect(strip.today).toBe(lastNight);
    expect(strip.days[0]).toEqual({ date: lastNight, status: "available" });

    // A widget starts its strip at the guest's own date, and there the rest of
    // the night is on offer too.
    const fromCalendar = unwrap(
      await getPublicAvailabilityDaysRaw(t.restaurantId, {
        from: calendarToday,
        to: addDays(calendarToday, 1),
        partySize: 2,
      })
    );
    expect(fromCalendar.days[0]).toEqual({
      date: calendarToday,
      status: "available",
    });
    const offered = await slotsOf(t, calendarToday);
    expect(offered.length).toBeGreaterThan(0);
    expect(Date.parse(offered[0]!.scheduledAt)).toBeGreaterThan(Date.now());
    expect((await slotsOf(t, lastNight)).map((s) => s.scheduledAt)).toEqual(
      offered.map((s) => s.scheduledAt)
    );

    const b = await booked(t, offered[0]!.scheduledAt);

    // Every list agrees, and the host's plain "today" is that list.
    const owner = await ownerList(t, lastNight);
    expect(owner.rows.map((r) => r.id)).toEqual([b.id]);
    expect(owner.serviceToday).toBe(lastNight);
    expect((await ownerList(t, calendarToday)).rows).toEqual([]);
    const host = await hostList(t);
    expect(host.rows.map((r) => r.id)).toEqual([b.id]);
    expect(host.serviceToday).toBe(lastNight);

    // Past the period's end: an ordinary day again.
    setZone(t, zoneAtLocalHour(7));
    const later = localDateKey(t.timeZone);
    const afterEnd = unwrap(
      await getPublicAvailabilityDaysRaw(t.restaurantId, {
        from: addDays(later, -1),
        to: later,
        partySize: 2,
      })
    );
    expect(afterEnd.today).toBe(later);
    expect(afterEnd.days[0].status).toBe("passed");
    expect((await hostList(t)).serviceToday).toBe(later);
  });

  test("TC-1907: deposit rules match the service day: Friday's rule covers Friday's 12:30 AM, Saturday's doesn't", async () => {
    test.skip(!stripeTestModeReady(), "Needs Stripe test mode");
    const { t, day, next } = await overnightTenant("nightdep", {
      mint: { stripe: true },
    });
    await period(t, weekdayOf(next), "12:00", "14:00");
    const on = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      depositsEnabled: true,
    });
    expect(on.status, msg(on.data)).toBe(200);
    const rule = async (body: Record<string, unknown>) => {
      const res = await createDepositRuleRaw(t.token, t.restaurantId, {
        amountType: "PER_GUEST",
        ...body,
      });
      expect(res.status, msg(res.data)).toBe(201);
    };
    await rule({
      name: "Friday dinner",
      amountCents: 2000,
      daysOfWeek: [weekdayOf(day)],
      startTime: "18:00",
    });
    await rule({
      name: "Saturday",
      amountCents: 5000,
      daysOfWeek: [weekdayOf(next)],
    });

    const slots = await slotsOf(t, day);
    expect(slots.find((s) => s.time === "22:00")!.depositCents).toBe(4000);
    const after = slots.find((s) => s.time === "00:30")!;
    expect(after.depositCents).toBe(4000);
    // Saturday's own lunch is Saturday's rule, so the calendar still works.
    expect((await slotsOf(t, next))[0]!.depositCents).toBe(10000);

    const b = await booked(t, after.scheduledAt, { policyAccepted: true });
    expect(b.deposit.amountCents).toBe(4000);

    // A rule on a specific date: the service date.
    await rule({ name: "That night", amountCents: 7000, specificDates: [day] });
    await rule({ name: "Next date", amountCents: 9000, specificDates: [next] });
    const dated = await slotsOf(t, day);
    expect(dated.find((s) => s.time === "00:00")!.depositCents).toBe(14000);
  });

  test("TC-1908: server rotation doesn't reset at midnight: last seated and covers today hold until the business day ends", async () => {
    const t = await fresh("rotmidnight");
    const payroll = await setFeatureOverrideAdminRaw(
      t.adminToken,
      t.restaurantId,
      "PAYROLL",
      true
    );
    expect(payroll.ok, msg(payroll.data)).toBe(true);
    const on = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      serverRotationEnabled: true,
    });
    expect(on.status, msg(on.data)).toBe(200);
    const pin = "5233";
    const added = await createPinStaffTabletRaw(
      t.tabletToken,
      t.managerSession,
      { firstName: "Nia", lastName: "Late", pin, staffRole: "STAFF" }
    );
    expect(added.status, msg(added.data)).toBe(201);
    const nia = String((added.data as any).data.id);
    const clocked = await clockInRaw(t.tabletToken, {
      staffMemberId: nia,
      pin,
    });
    expect(clocked.status, msg(clocked.data)).toBe(200);

    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, t.tableId, {
        serverStaffMemberId: nia,
        guestCount: 3,
      })
    );
    expect(check.status, msg(check.data)).toBe(201);
    // Seated 2.5 hours ago. At 1 AM that is before midnight, yesterday's date.
    localSql(
      `update "Order" set "tabOpenedAt" = now() - interval '150 minutes', "seatedAt" = now() - interval '150 minutes' where id = '${check.data.id}'`
    );
    const row = async () =>
      (
        unwrap(await getRotationRaw(t.tabletToken, t.managerSession)) as any[]
      ).find((r) => r.staffMemberId === nia);

    setZone(t, zoneAtLocalHour(1));
    const lateShift = await row();
    expect(lateShift.coversToday).toBe(3);
    expect(lateShift.lastSeatedAt).toBeTruthy();

    // At 5 AM it was seated before the 4 AM line: a new day.
    setZone(t, zoneAtLocalHour(5));
    const nextDay = await row();
    expect(nextDay.coversToday).toBe(0);
    expect(nextDay.lastSeatedAt).toBeNull();
  });

  // ── 2. The guest's language ─────────────────────────────────────────────

  test("TC-1910: a Spanish booking stores es and hears everything in Spanish, GSM-7: confirmation, changed, cancelled, reminder", async () => {
    test.skip(
      !BACKEND_LOG || !existsSync(BACKEND_LOG),
      "Needs E2E_BACKEND_LOG"
    );
    const since = Date.now() - 1000;
    const t = await fresh("langes");
    setZone(t, zoneAtLocalHour(10));
    const es = { "Accept-Language": "es-MX,es;q=0.9,en;q=0.5" };
    const guestEmail = email("es");

    // A Saturday, so a weekday name with an accent would show up if there were one.
    let daysAhead = 2;
    while (weekdayOf(localDateKey(t.timeZone, daysAhead)) !== 6) daysAhead++;
    const slots = await slotsOf(t, localDateKey(t.timeZone, daysAhead));
    const first = slots.find((s) => s.time === "18:00")!;
    const b = await booked(t, first.scheduledAt, { guestEmail }, es);

    const row = localSql<{ guestLocale: string }>(
      `select "guestLocale" from "Reservation" where id = '${b.id}'`
    )[0]!;
    expect(row.guestLocale).toBe("es");

    const confirmed = await waitForSms(b.guestPhone, since, /mesa para 2/);
    expect(confirmed).not.toMatch(/table for|Manage|Confirmation code/);
    expect(confirmed).toMatch(GSM7);
    // The date reads the Spanish way, with no chance of 2/11 meaning February.
    expect(confirmed).toMatch(/\d{1,2} [a-z]{3,4}/);

    // The running backend's sandbox inbox may not be this one: the same real
    // send, from a process pointed at the local Mailpit.
    probe(["confirm", t.restaurantId, b.id]);
    const mail = await mailTo(guestEmail, /.*/);
    expect(mail.subject).not.toMatch(/\b(your|reservation|confirmed)\b/i);
    expect(mail.subject).toMatch(/reserva/i);
    expect(`${mail.text}`).toMatch(/reserva/i);
    expect(`${mail.text}`).not.toMatch(
      /\b(Your reservation|Party of|Manage)\b/
    );
    // Spelled, not 7/11: es-US dates are day-first and read as a US date.
    expect(mail.text).toMatch(/\d{1,2} [a-z]{3,4} \d{4}/);

    // The guest moves it from the manage link.
    const later = slots.find((s) => s.time === "19:00")!;
    const moved = await apiRequestRaw<any>(
      "PATCH",
      `/api/public/reservations/manage/${b.token}`,
      { scheduledAt: later.scheduledAt },
      undefined,
      es
    );
    expect(moved.status, msg(moved.data)).toBe(200);
    const changed = await waitForSms(
      b.guestPhone,
      since,
      /reserva actualizada/
    );
    expect(changed).toMatch(GSM7);

    // Staff change: in the guest's language, whatever the staff's.
    const staffMove = slots.find((s) => s.time === "20:00")!;
    const edited = await patchReservationOwnerRaw(
      t.token,
      t.restaurantId,
      b.id,
      { scheduledAt: staffMove.scheduledAt }
    );
    expect(edited.status, msg(edited.data)).toBe(200);

    const cancelled = await patchReservationOwnerRaw(
      t.token,
      t.restaurantId,
      b.id,
      { status: "CANCELLED" }
    );
    expect(cancelled.status, msg(cancelled.data)).toBe(200);
    const gone = await waitForSms(b.guestPhone, since, /fue cancelada/);
    expect(gone).toMatch(GSM7);

    // The reminder comes from the worker's sweep.
    const set = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      reminderLeadMinutes: 120,
    });
    expect(set.status, msg(set.data)).toBe(200);
    const soon = (await slotsOf(t, localDateKey(t.timeZone))).find(
      (s) => Date.parse(s.scheduledAt) > Date.now() + 60 * MIN
    )!;
    const r = await booked(t, soon.scheduledAt, {}, es);
    const { output } = probe(["reminders"]);
    const reminder = output
      .split("\n")
      .filter(
        (l) =>
          l.includes('"sms_skipped_disabled"') &&
          l.includes(`"toLast4":"${r.guestPhone.slice(-4)}"`)
      )
      .map((l) => (JSON.parse(l) as { message: string }).message)
      .join("\n");
    // The running backend's own sweep can get there first; either way it is logged.
    const text =
      reminder || (await waitForSms(r.guestPhone, since, /recordatorio/));
    expect(text).toContain("recordatorio");
    expect(text).toMatch(GSM7);
    expect(
      localSql<{ smsType: string }>(
        `select "smsType" from "SmsLog" where "reservationId" = '${r.id}' and "smsType" = 'RESERVATION_REMINDER'`
      ).length
    ).toBe(1);
  });

  test("TC-1911: joining the waitlist in Spanish gets the Spanish text; an unknown language is English", async () => {
    test.skip(
      !BACKEND_LOG || !existsSync(BACKEND_LOG),
      "Needs E2E_BACKEND_LOG"
    );
    const since = Date.now() - 1000;
    const t = await fresh("langwl");
    setZone(t, zoneAtLocalHour(12));
    const on = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      onlineWaitlistEnabled: true,
    });
    expect(on.status, msg(on.data)).toBe(200);
    const join = async (headers: Record<string, string>) => {
      const guestPhone = phone();
      const res = await joinPublicWaitlistRaw(
        t.restaurantId,
        {
          partySize: 2,
          guestName: name("Waiting"),
          guestPhone,
          clientRequestId: `r2wl-${runId}-${++seq}`,
        },
        headers
      );
      expect(res.status, msg(res.data)).toBe(201);
      return guestPhone;
    };
    const es = await join({ "Accept-Language": "es" });
    const inSpanish = await waitForSms(es, since, /lista de espera/);
    expect(inSpanish).toMatch(GSM7);
    expect(inSpanish).not.toMatch(/You're on the list/);
    const fr = await join({ "Accept-Language": "fr-FR,fr;q=0.9" });
    expect(await waitForSms(fr, since, /on the list/)).toMatch(GSM7);
  });

  test("TC-1912: an unknown language books in English; a staff booking stays English whatever language the request came in", async () => {
    test.skip(
      !BACKEND_LOG || !existsSync(BACKEND_LOG),
      "Needs E2E_BACKEND_LOG"
    );
    const since = Date.now() - 1000;
    const t = await fresh("langen");
    const day = localDateKey(t.timeZone, 3);
    const slots = await slotsOf(t, day);

    const french = await booked(
      t,
      slots[4]!.scheduledAt,
      {},
      { "Accept-Language": "fr-FR,fr;q=0.9" }
    );
    expect(
      localSql<{ guestLocale: string | null }>(
        `select "guestLocale" from "Reservation" where id = '${french.id}'`
      )[0]!.guestLocale ?? "en"
    ).toBe("en");
    expect(await waitForSms(french.guestPhone, since, /table for 2/)).toMatch(
      GSM7
    );

    const guestPhone = phone();
    const staffEmail = email("staff");
    const staff = await apiRequestRaw<any>(
      "POST",
      `/restaurant/${t.restaurantId}/reservations`,
      {
        partySize: 2,
        scheduledAt: slots[8]!.scheduledAt,
        guestName: name("Phone call"),
        guestPhone,
        guestEmail: staffEmail,
      },
      t.token,
      { "Accept-Language": "es" }
    );
    expect(staff.status, msg(staff.data)).toBeLessThan(300);
    expect(unwrap(staff).guestLocale ?? null).toBeNull();
    expect(await waitForSms(guestPhone, since, /table for 2/)).not.toMatch(
      /mesa/
    );
    probe(["confirm", t.restaurantId, unwrap(staff).id]);
    const staffMail = await mailTo(staffEmail, /./);
    expect(staffMail.subject).toMatch(/reservation/i);
    expect(staffMail.text).not.toMatch(/\breserva\b/i);

    const posPhone = phone();
    const pos = await createReservationTabletRaw(
      t.tabletToken,
      t.managerSession,
      {
        kind: "RESERVATION",
        partySize: 2,
        scheduledAt: slots[12]!.scheduledAt,
        guestName: name("POS call"),
        guestPhone: posPhone,
      }
    );
    expect(pos.status, msg(pos.data)).toBeLessThan(300);
    expect(await waitForSms(posPhone, since, /table for 2/)).not.toMatch(
      /mesa/
    );

    // ...unless staff say so.
    const told = phone();
    const asked = await createReservationOwnerRaw(t.token, t.restaurantId, {
      partySize: 2,
      scheduledAt: slots[16]!.scheduledAt,
      guestName: name("Asked for Spanish"),
      guestPhone: told,
      guestLocale: "es",
    });
    expect(asked.status, msg(asked.data)).toBeLessThan(300);
    expect(await waitForSms(told, since, /mesa para 2/)).toMatch(GSM7);
  });

  // ── 3. Same-day availability from the floor's prediction ────────────────

  const nowSlots = async (t: Phase4Tenant) =>
    (await slotsOf(t, localDateKey(t.timeZone))).map((s) => ({
      ...s,
      at: Date.parse(s.scheduledAt),
    }));

  const predictedFreeAt = async (t: Phase4Tenant, tableId: string) => {
    const floor = unwrap(await getFloorRaw(t.tabletToken));
    const row = (floor.tables as any[]).find((x) => x.table.id === tableId);
    expect(row, "table on the floor").toBeTruthy();
    expect(row.estimatedFreeAt, `prediction for ${row.state}`).toBeTruthy();
    return { freeAt: Date.parse(row.estimatedFreeAt), state: row.state };
  };

  const BUFFER = 15 * MIN;

  /** Hidden before the predicted free time (+ reset buffer), listed after,
   * and the listed slot really books. */
  const expectSlotsFollowPrediction = async (
    t: Phase4Tenant,
    freeAt: number
  ) => {
    const slots = await nowSlots(t);
    const cutoff = freeAt + BUFFER;
    expect(slots.filter((s) => s.at < cutoff).map((s) => s.time)).toEqual([]);
    const firstAfter = slots.find((s) => s.at >= cutoff);
    expect(firstAfter, "a slot after the predicted free time").toBeTruthy();
    // Nothing right after the buffer was lost: the very next quarter hour.
    expect(firstAfter!.at - cutoff).toBeLessThan(15 * MIN + 1000);
    const b = await booked(t, firstAfter!.scheduledAt);
    expect(b.id).toBeTruthy();
  };

  const busyTenant = async (label: string) => {
    const t = await fresh(label);
    // Midday: the whole 4-hour near-term window is inside today's hours.
    setZone(t, zoneAtLocalHour(11));
    return t;
  };

  test("TC-1920: an open check hides slots only until the floor predicts it free", async () => {
    const t = await busyTenant("busycheck");
    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, t.tableId)
    );
    expect(check.status, msg(check.data)).toBe(201);
    const { freeAt, state } = await predictedFreeAt(t, t.tableId);
    expect(state).toBe("OCCUPIED");
    expect(freeAt).toBeGreaterThan(Date.now());
    await expectSlotsFollowPrediction(t, freeAt);
  });

  test("TC-1921: a seated walk-in hides slots only until the floor predicts it free", async () => {
    const t = await busyTenant("busywalkin");
    const seat = await seatWalkInWithServerRaw(
      t.tabletToken,
      t.managerSession,
      t.tableId,
      { guestCount: 2 }
    );
    expect(seat.status, msg(seat.data)).toBeLessThan(300);
    const { freeAt, state } = await predictedFreeAt(t, t.tableId);
    expect(state).toBe("SEATED");
    await expectSlotsFollowPrediction(t, freeAt);
  });

  test("TC-1922: a paid table nobody cleared hides slots only until the floor predicts it free", async () => {
    const t = await busyTenant("busypaid");
    await openRegisterSessionPos(t.tabletToken, t.managerSession);
    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, t.tableId)
    );
    expect(check.status, msg(check.data)).toBe(201);
    const paid = await settleTabCashRaw(
      t.tabletToken,
      t.managerSession,
      check.data.id as string,
      { amount: 10, cashTendered: 20, idempotencyKey: `r2-${runId}-${++seq}` }
    );
    expect(paid.status, msg(paid.data)).toBeLessThan(300);
    const { freeAt, state } = await predictedFreeAt(t, t.tableId);
    expect(state).toBe("PAID");
    await expectSlotsFollowPrediction(t, freeAt);
  });

  test("TC-1923: a full room of check, walk-in and paid table: the first table to free decides", async () => {
    const t = await busyTenant("busyall");
    const table = async (label: string) => {
      const res = await createTableOwnerRaw(t.token, t.restaurantId, {
        name: `${label} ${runId}`,
        capacity: 4,
      });
      expect(res.status, msg(res.data)).toBe(201);
      return unwrap(res).id as string;
    };
    const walkInTable = await table("Walk-in");
    const paidTable = await table("Paid");

    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, t.tableId)
    );
    expect(check.status, msg(check.data)).toBe(201);
    const seat = await seatWalkInWithServerRaw(
      t.tabletToken,
      t.managerSession,
      walkInTable,
      { guestCount: 2 }
    );
    expect(seat.status, msg(seat.data)).toBeLessThan(300);
    await openRegisterSessionPos(t.tabletToken, t.managerSession);
    const paidCheck = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, paidTable)
    );
    expect(paidCheck.status, msg(paidCheck.data)).toBe(201);
    const paid = await settleTabCashRaw(
      t.tabletToken,
      t.managerSession,
      paidCheck.data.id as string,
      { amount: 10, cashTendered: 20, idempotencyKey: `r2-${runId}-${++seq}` }
    );
    expect(paid.status, msg(paid.data)).toBeLessThan(300);

    const free = await Promise.all(
      [t.tableId, walkInTable, paidTable].map(
        async (id) => (await predictedFreeAt(t, id)).freeAt
      )
    );
    await expectSlotsFollowPrediction(t, Math.min(...free));
  });

  test("TC-1924: a check open over 6 hours gets no prediction: the table is taken for the whole near-term window, as before", async () => {
    const t = await busyTenant("busystale");
    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, t.tableId)
    );
    expect(check.status, msg(check.data)).toBe(201);
    localSql(
      `update "Order" set "tabOpenedAt" = now() - interval '7 hours', "seatedAt" = now() - interval '7 hours' where id = '${check.data.id}'`
    );
    const slots = await nowSlots(t);
    const window = Date.now() + 4 * 60 * MIN;
    expect(slots.filter((s) => s.at <= window).map((s) => s.time)).toEqual([]);
    const beyond = slots.find((s) => s.at > window);
    expect(beyond, "a slot beyond the near-term window").toBeTruthy();
    const b = await booked(t, beyond!.scheduledAt);
    expect(b.id).toBeTruthy();
  });

  // ── 4. Tonight in the owner's morning summary ───────────────────────────

  /** A local time today, as an instant, on a whole-hour zone. */
  const todayAt = (t: Phase4Tenant, hhmm: string, plusDays = 0): Date => {
    const zone = t.timeZone;
    const key = addDays(localDateKey(zone), plusDays);
    const m = /Etc\/GMT([+-])(\d+)/.exec(zone);
    const behind = m ? (m[1] === "+" ? Number(m[2]) : -Number(m[2])) : 0;
    const [h, min] = hhmm.split(":").map(Number);
    return new Date(
      Date.parse(`${key}T00:00:00Z`) + (h! + behind) * 3600_000 + min! * MIN
    );
  };

  test("TC-1930: Tonight counts expected bookings once, in EN and ES, excluding cancelled, no-show and tomorrow", async () => {
    const t = await fresh("tonight");
    setZone(t, zoneAtLocalHour(8));
    await staffBooking(t, todayAt(t, "18:00"), { partySize: 2 });
    await staffBooking(t, todayAt(t, "19:00"), {
      partySize: 4,
      guestNotes: "Peanut allergy at the table",
    });
    const gone = await staffBooking(t, todayAt(t, "20:00"), { partySize: 3 });
    const cancel = await patchReservationOwnerRaw(
      t.token,
      t.restaurantId,
      gone.id,
      { status: "CANCELLED" }
    );
    expect(cancel.status, msg(cancel.data)).toBe(200);
    const noShow = await staffBooking(t, todayAt(t, "20:30"), { partySize: 5 });
    localSql(
      `update "Reservation" set status = 'NO_SHOW' where id = '${noShow.id}'`
    );
    await staffBooking(t, todayAt(t, "18:00", 1), { partySize: 8 });

    const { result } = probe(["tonight", t.restaurantId]);
    expect(result.figures.bookings).toBe(2);
    expect(result.figures.guests).toBe(6);
    expect(result.figures.allergies).toBe(1);
    expect(result.en.headline).toBe(
      "Tonight: 2 bookings, 6 guests, first at 6:00 PM"
    );
    expect(result.en.details).toEqual(["1 with an allergy note"]);
    expect(result.es.headline).toMatch(
      /^Esta noche: 2 reservas, 6 personas, primera: 6:00\s*p\.\s*m\.$/
    );
    expect(result.es.details).toEqual(["1 con una nota de alergia"]);
  });

  test("TC-1931: a lunch restaurant reads Today, not Tonight, and with no add-on or no bookings there is no line", async () => {
    const t = await fresh("tonightlunch");
    setZone(t, zoneAtLocalHour(8));
    expect(probe(["tonight", t.restaurantId]).result.figures).toBeNull();

    await staffBooking(t, todayAt(t, "12:00"), { partySize: 2 });
    const { result } = probe(["tonight", t.restaurantId]);
    expect(result.en.headline).toBe(
      "Today: 1 booking, 2 guests, first at 12:00 PM"
    );
    expect(result.es.headline).toMatch(
      /^Hoy: 1 reserva, 2 personas, primera: 12:00\s*p\.\s*m\.$/
    );

    const off = await setFeatureOverrideAdminRaw(
      t.adminToken,
      t.restaurantId,
      "TABLE_RESERVATIONS",
      false
    );
    expect(off.ok, msg(off.data)).toBe(true);
    expect(probe(["tonight", t.restaurantId]).result.figures).toBeNull();
  });

  test("TC-1932: after-midnight bookings count once: on the night they belong to, not on the next morning's summary, even past the 4 AM business day", async () => {
    const t = await fresh("tonightnight");
    await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      defaultDurationMinutes: 30,
    });
    clearPeriods(t);
    setZone(t, zoneAtLocalHour(8));
    const today = localDateKey(t.timeZone);
    await period(t, weekdayOf(today), "22:00", "05:00");
    await staffBooking(t, todayAt(t, "23:00"), { partySize: 2 });
    await staffBooking(t, todayAt(t, "00:30", 1), { partySize: 3 });
    // Past the business day's 4 AM, still tonight's period.
    await staffBooking(t, todayAt(t, "04:30", 1), { partySize: 4 });
    await staffBooking(t, todayAt(t, "12:00", 1), { partySize: 7 });

    const now = await probe(["tonight", t.restaurantId]);
    expect(now.result.figures.bookings).toBe(3);
    expect(now.result.figures.guests).toBe(9);

    const tomorrowMorning = todayAt(t, "08:00", 1).toISOString();
    const next = await probe(["tonight", t.restaurantId, tomorrowMorning]);
    expect(next.result.figures.bookings).toBe(1);
    expect(next.result.figures.guests).toBe(7);

    // The list the host looks at agrees with what the owner was told.
    const list = await ownerList(t, today);
    expect(list.rows).toHaveLength(3);
    expect((await hostList(t, today)).rows).toHaveLength(3);
    expect((await ownerList(t, addDays(today, 1))).rows).toHaveLength(1);
  });

  test("TC-1933: the real morning summary reaches Mailpit with the line, in the owner's language", async () => {
    const t = await fresh("tonightmail");
    setZone(t, zoneAtLocalHour(8));
    await staffBooking(t, todayAt(t, "18:00"), { partySize: 2 });
    const yesterday = addDays(localDateKey(t.timeZone), -1);

    const en = probe(["morning", t.restaurantId, yesterday]);
    expect(en.result.sent).toBeGreaterThan(0);
    const english = await mailTo(t.ownerEmail, /./);
    expect(english.html).toContain(
      "Tonight: 1 booking, 2 guests, first at 6:00"
    );

    localSql(`update "User" set locale = 'es' where email = '${t.ownerEmail}'`);
    const before = Date.now();
    const es = probe(["morning", t.restaurantId, yesterday]);
    expect(es.result.sent).toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const list = (await (
            await fetch(
              `${MAILPIT}/api/v1/search?limit=5&query=${encodeURIComponent(`to:"${t.ownerEmail}"`)}`
            )
          ).json()) as { messages: { ID: string; Created: string }[] };
          const hit = list.messages.find(
            (m) => Date.parse(m.Created) >= before - 2000
          );
          if (!hit) return "";
          return (
            (await (
              await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)
            ).json()) as { HTML: string }
          ).HTML;
        },
        { timeout: 30_000, intervals: [1000] }
      )
      .toContain("Esta noche: 1 reserva, 2 personas");
  });

  // ── 5. Needs you today ──────────────────────────────────────────────────

  test("TC-1940: a party no table seats shows until a table or combination fits", async () => {
    const t = await fresh("needtable");
    setZone(t, zoneAtLocalHour(8));
    const kinds = () => needsYouKinds(t);
    expect(await kinds()).not.toContain("RESERVATION_NO_TABLE");

    await staffBooking(t, todayAt(t, "18:00"), { partySize: 4 });
    expect(await kinds()).not.toContain("RESERVATION_NO_TABLE");

    // Tomorrow's big party isn't today's problem.
    await staffBooking(t, todayAt(t, "18:00", 1), { partySize: 10 });
    expect(await kinds()).not.toContain("RESERVATION_NO_TABLE");

    await staffBooking(t, todayAt(t, "19:00"), { partySize: 10 });
    expect(await kinds()).toContain("RESERVATION_NO_TABLE");

    const big = await createTableOwnerRaw(t.token, t.restaurantId, {
      name: `Banquet ${runId}`,
      capacity: 12,
    });
    expect(big.status, msg(big.data)).toBe(201);
    expect(await kinds()).not.toContain("RESERVATION_NO_TABLE");
  });

  test("TC-1941: an unpaid staff deposit today shows; a guest still in online checkout and tomorrow's don't; add-on off returns none", async () => {
    test.skip(!stripeTestModeReady(), "Needs Stripe test mode");
    const t = await fresh("needdep", { stripe: true });
    setZone(t, zoneAtLocalHour(8));
    const on = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      depositsEnabled: true,
    });
    expect(on.status, msg(on.data)).toBe(200);
    const rule = await createDepositRuleRaw(t.token, t.restaurantId, {
      amountCents: 2000,
      amountType: "PER_GUEST",
    });
    expect(rule.status, msg(rule.data)).toBe(201);
    const kinds = () => needsYouKinds(t);

    // Online and in checkout: the sweep releases it by itself.
    const slot = (await slotsOf(t, localDateKey(t.timeZone))).find(
      (s) => Date.parse(s.scheduledAt) > Date.now() + 120 * MIN
    )!;
    const online = await booked(t, slot.scheduledAt, { policyAccepted: true });
    expect(online.deposit.status ?? "PENDING").toBe("PENDING");
    expect(await kinds()).not.toContain("RESERVATION_DEPOSIT_DUE");

    await staffBooking(t, todayAt(t, "18:00", 1), { requireDeposit: true });
    expect(await kinds()).not.toContain("RESERVATION_DEPOSIT_DUE");

    const staff = await staffBooking(t, todayAt(t, "19:00"), {
      requireDeposit: true,
    });
    expect((staff.deposit as { status: string }).status).toBe("PENDING");
    expect(await kinds()).toContain("RESERVATION_DEPOSIT_DUE");

    // The Tonight line owes both: its 40.00 each, whoever took the booking.
    const tonight = probe(["tonight", t.restaurantId]).result;
    expect(tonight.figures.depositsOwed).toBe(2);
    expect(tonight.en.details).toContain("2 deposits still owed ($80.00)");
    expect(tonight.es.details).toContain("2 depósitos sin pagar ($80.00)");

    // A deposit refund that failed shows until one goes through.
    expect(await kinds()).not.toContain("RESERVATION_REFUND_FAILED");
    localSql(
      `update "ReservationDeposit" set "refundFailedAt" = now() where "reservationId" = '${online.id}'`
    );
    expect(await kinds()).toContain("RESERVATION_REFUND_FAILED");

    // Without the add-on, none of them, whatever rows exist.
    const off = await setFeatureOverrideAdminRaw(
      t.adminToken,
      t.restaurantId,
      "TABLE_RESERVATIONS",
      false
    );
    expect(off.ok, msg(off.data)).toBe(true);
    const without = await kinds();
    expect(without.filter((k) => k.startsWith("RESERVATION_"))).toEqual([]);

    const back = await setFeatureOverrideAdminRaw(
      t.adminToken,
      t.restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    expect(back.ok, msg(back.data)).toBe(true);
    localSql(
      `update "ReservationDeposit" set "refundFailedAt" = null where "reservationId" = '${online.id}'`
    );
    expect(await kinds()).not.toContain("RESERVATION_REFUND_FAILED");
    expect(await kinds()).toContain("RESERVATION_DEPOSIT_DUE");

    const cancelled = await patchReservationOwnerRaw(
      t.token,
      t.restaurantId,
      staff.id,
      { status: "CANCELLED" }
    );
    expect(cancelled.status, msg(cancelled.data)).toBe(200);
    expect(await kinds()).not.toContain("RESERVATION_DEPOSIT_DUE");
  });

  test("TC-1942: the online waitlist left paused over an hour during open hours shows; a fresh pause, a timed pause and a resume don't", async () => {
    const t = await fresh("needpause");
    setZone(t, zoneAtLocalHour(12));
    const on = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      onlineWaitlistEnabled: true,
    });
    expect(on.status, msg(on.data)).toBe(200);
    const kinds = () => needsYouKinds(t);
    expect(await kinds()).not.toContain("RESERVATION_WAITLIST_PAUSED");

    const pause = await onlinePauseOwnerRaw(t.token, t.restaurantId, {
      untilResume: true,
    });
    expect(pause.status, msg(pause.data)).toBe(200);
    expect(await kinds()).not.toContain("RESERVATION_WAITLIST_PAUSED");

    localSql(
      `update "ReservationSettings" set "onlineWaitlistPausedAt" = now() - interval '61 minutes' where "restaurantId" = '${t.restaurantId}'`
    );
    expect(await kinds()).toContain("RESERVATION_WAITLIST_PAUSED");

    const resume = await onlinePauseOwnerRaw(t.token, t.restaurantId, {
      minutes: null,
    });
    expect(resume.status, msg(resume.data)).toBe(200);
    expect(await kinds()).not.toContain("RESERVATION_WAITLIST_PAUSED");

    const timed = await onlinePauseOwnerRaw(t.token, t.restaurantId, {
      minutes: 30,
    });
    expect(timed.status, msg(timed.data)).toBe(200);
    localSql(
      `update "ReservationSettings" set "onlineWaitlistPausedAt" = now() - interval '61 minutes' where "restaurantId" = '${t.restaurantId}'`
    );
    expect(await kinds()).not.toContain("RESERVATION_WAITLIST_PAUSED");
  });
});
