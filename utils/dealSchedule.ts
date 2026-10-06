/**
 * dealSchedule.ts — restaurant-local time math for the deal-scheduling specs.
 *
 * QA judges a deal's days / HH:mm window / dates on the RESTAURANT's clock
 * (restaunax deal scheduling, Plan 1). So every expectation in a schedule test
 * is computed in the restaurant's IANA zone — read from the API
 * (`/active` → `timeZone`) — never from the runner: CI runs in UTC, laptops
 * don't, and neither is the restaurant. Pure Intl, no dependencies, no I/O.
 * Self-check: scripts/check-deal-schedule.ts.
 */

export const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;
export type DayName = (typeof DAY_NAMES)[number];
export const WEEKDAYS: DayName[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
];

export interface LocalParts {
  dateKey: string;
  dayName: DayName;
  minuteOfDay: number;
}

/** A same-day HH:mm window on one restaurant-local date. */
export interface LocalWindow {
  dateKey: string;
  start: string;
  end: string;
  startMinute: number;
  endMinute: number;
}

/** A BusinessHours row as GET /restaurant/:id/hours returns it. */
export interface HoursRow {
  day: string;
  openingTime: string | null;
  closingTime: string | null;
  isClosed: boolean;
  is24Hours: boolean;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

const wallClock = (timeZone: string, at: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
};

export function dayNameOfKey(dateKey: string): DayName {
  return DAY_NAMES[new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()]!;
}

export function localParts(
  timeZone: string,
  at: Date = new Date()
): LocalParts {
  const w = wallClock(timeZone, at);
  const dateKey = `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
  return {
    dateKey,
    dayName: dayNameOfKey(dateKey),
    minuteOfDay: w.hour * 60 + w.minute,
  };
}

export function addDaysToKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The restaurant-local calendar date `offsetDays` from today. */
export function localDateKey(
  timeZone: string,
  offsetDays = 0,
  now: Date = new Date()
): string {
  return addDaysToKey(localParts(timeZone, now).dateKey, offsetDays);
}

export function hhmm(minuteOfDay: number): string {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function minutesOf(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** The UTC instant at which the restaurant's wall clock reads dateKey + minuteOfDay. */
export function zonedInstant(
  timeZone: string,
  dateKey: string,
  minuteOfDay: number
): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const wallAsUtc = Date.UTC(
    y ?? 1970,
    (mo ?? 1) - 1,
    d ?? 1,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60
  );
  const offsetAt = (t: number): number => {
    const w = wallClock(timeZone, new Date(t));
    const seconds = Math.floor(t / 1000) * 1000;
    return (
      Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - seconds
    );
  };
  const first = wallAsUtc - offsetAt(wallAsUtc);
  // Second pass settles instants whose offset differs from the guess's (DST edges).
  return new Date(wallAsUtc - offsetAt(first));
}

/** ISO instant (what `?at=` / `scheduledFor` carry) for a local date + "HH:mm". */
export function atLocal(
  timeZone: string,
  dateKey: string,
  time: string
): string {
  return zonedInstant(timeZone, dateKey, minutesOf(time)).toISOString();
}

/** "15:00" → "3:00 PM" — the backend's English formatClock. */
export function formatClockEn(time: string): string {
  const minutes = minutesOf(time);
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${pad2(minutes % 60)} ${h >= 12 ? "PM" : "AM"}`;
}

export function formatInstantClockEn(timeZone: string, at: Date): string {
  return formatClockEn(hhmm(localParts(timeZone, at).minuteOfDay));
}

/** "2026-10-10" → "Oct 10". */
export function formatDateKeyEn(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

/** "MONDAY" → "Mon". 2024-01-07 is a Sunday. */
export function shortDayEn(day: DayName): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, 7 + DAY_NAMES.indexOf(day))));
}

/** ICU puts U+202F / U+00A0 before AM/PM; DOM text has stray runs of whitespace. */
export function normalizeSpaces(s: string): string {
  return s
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does `text` show `time` ("HH:mm") — as English 12-hour ("3:00 PM") or as
 * 24-hour ("15:00" / "9:00")? Language-neutral: the apps send no
 * Accept-Language of their own, so UI text may come back in either form.
 */
export function mentionsClock(text: string, time: string): boolean {
  const t = normalizeSpaces(text);
  if (t.includes(formatClockEn(time))) return true;
  const h24 = hhmm(minutesOf(time));
  const pattern = h24.startsWith("0") ? `0?${h24.slice(1)}` : h24;
  return new RegExp(`(^|[^\\d:])${pattern}(?!\\d)`).test(t);
}

/**
 * A window that starts later TODAY (restaurant-local): the first 15-minute
 * mark at least `leadMinutes` from now (and not before `notBefore`), lasting
 * `lengthMinutes`, ending by `notAfter`. Null when today has no room left.
 */
export function laterTodayWindow(
  timeZone: string,
  opts: {
    now?: Date;
    leadMinutes?: number;
    lengthMinutes?: number;
    notBefore?: number;
    notAfter?: number;
  } = {}
): LocalWindow | null {
  const {
    now = new Date(),
    leadMinutes = 60,
    lengthMinutes = 60,
    notBefore = 0,
    notAfter = 1439,
  } = opts;
  const p = localParts(timeZone, now);
  const startMinute = Math.max(
    Math.ceil((p.minuteOfDay + leadMinutes) / 15) * 15,
    Math.ceil(notBefore / 15) * 15
  );
  const endMinute = startMinute + lengthMinutes;
  if (endMinute > notAfter) return null;
  return {
    dateKey: p.dateKey,
    start: hhmm(startMinute),
    end: hhmm(endMinute),
    startMinute,
    endMinute,
  };
}

/** A same-day window around NOW (restaurant-local). Null near midnight. */
export function liveNowWindow(
  timeZone: string,
  opts: { now?: Date; before?: number; after?: number } = {}
): LocalWindow | null {
  const { now = new Date(), before = 30, after = 90 } = opts;
  const p = localParts(timeZone, now);
  const startMinute = Math.floor((p.minuteOfDay - before) / 15) * 15;
  const endMinute = Math.ceil((p.minuteOfDay + after) / 15) * 15;
  if (startMinute < 0 || endMinute > 1439) return null;
  return {
    dateKey: p.dateKey,
    start: hhmm(startMinute),
    end: hhmm(endMinute),
    startMinute,
    endMinute,
  };
}

/** Is `instantIso` inside `w` on the restaurant clock (start incl., end excl.)? */
export function isInsideWindow(
  timeZone: string,
  instantIso: string,
  w: LocalWindow
): boolean {
  const p = localParts(timeZone, new Date(instantIso));
  return (
    p.dateKey === w.dateKey &&
    p.minuteOfDay >= w.startMinute &&
    p.minuteOfDay < w.endMinute
  );
}

/**
 * The open span on a local date, in minutes. An overnight close is capped at
 * 23:59 (same-day windows only). No hours configured = open all day (the
 * backend's isRestaurantOpenAt rule); no row / closed row = null.
 */
export function openSpanOn(
  hours: HoursRow[],
  dateKey: string
): { open: number; close: number } | null {
  if (hours.length === 0) return { open: 0, close: 1439 };
  const row = hours.find((h) => h.day === dayNameOfKey(dateKey));
  if (!row || (row.isClosed && !row.is24Hours)) return null;
  if (row.is24Hours || !row.openingTime || !row.closingTime)
    return { open: 0, close: 1439 };
  const open = minutesOf(row.openingTime);
  const close = minutesOf(row.closingTime);
  return { open, close: close <= open ? 1439 : close };
}
