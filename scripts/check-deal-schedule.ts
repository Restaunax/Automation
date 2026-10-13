/**
 * Self-check for utils/dealSchedule.ts — pure, no network. Run under two
 * runner timezones to prove the helper never reads the host clock/zone:
 *   TZ=UTC npx tsx scripts/check-deal-schedule.ts
 *   TZ=Pacific/Kiritimati npx tsx scripts/check-deal-schedule.ts
 */
import assert from "node:assert/strict";

import {
  addDaysToKey,
  atLocal,
  dayNameOfKey,
  formatClockEn,
  formatDateKeyEn,
  formatInstantClockEn,
  hhmm,
  isInsideWindow,
  laterTodayWindow,
  liveNowWindow,
  localDateKey,
  localParts,
  mentionsClock,
  minutesOf,
  normalizeSpaces,
  openSpanOn,
  shortDayEn,
  zonedInstant,
} from "../utils/dealSchedule";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const AKL = "Pacific/Auckland";

// Wall clock → instant, both sides of DST and the date line.
assert.equal(
  zonedInstant(NY, "2026-10-07", 900).toISOString(),
  "2026-10-07T19:00:00.000Z"
); // EDT
assert.equal(
  zonedInstant(NY, "2026-12-01", 900).toISOString(),
  "2026-12-01T20:00:00.000Z"
); // EST
assert.equal(
  zonedInstant(AKL, "2026-10-07", 900).toISOString(),
  "2026-10-07T02:00:00.000Z"
); // NZDT +13
assert.equal(
  zonedInstant(LA, "2027-03-14", 210).toISOString(),
  "2027-03-14T10:30:00.000Z"
); // 03:30 PDT on spring-forward day
assert.equal(atLocal(NY, "2026-10-07", "15:00"), "2026-10-07T19:00:00.000Z");

// Instant → wall clock.
assert.deepEqual(localParts(NY, new Date("2026-10-06T03:00:00Z")), {
  dateKey: "2026-10-05",
  dayName: "MONDAY",
  minuteOfDay: 23 * 60,
});
assert.equal(
  localDateKey(NY, 2, new Date("2026-10-06T03:00:00Z")),
  "2026-10-07"
);
assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");
assert.equal(dayNameOfKey("2026-10-10"), "SATURDAY");

// Formatting.
assert.equal(hhmm(-30), "23:30");
assert.equal(hhmm(1440 + 75), "01:15");
assert.equal(minutesOf("11:00:00"), 660);
assert.equal(formatClockEn("15:00"), "3:00 PM");
assert.equal(formatClockEn("00:30"), "12:30 AM");
assert.equal(formatClockEn("12:00"), "12:00 PM");
assert.equal(
  formatInstantClockEn(NY, new Date("2026-10-07T19:00:00Z")),
  "3:00 PM"
);
assert.equal(formatDateKeyEn("2026-10-10"), "Oct 10");
assert.equal(shortDayEn("MONDAY"), "Mon");
assert.equal(
  normalizeSpaces("3:00\u202fPM  –\u00a05:00 PM"),
  "3:00 PM – 5:00 PM"
);
assert.equal(mentionsClock("Available from 3:00\u202fPM", "15:00"), true);
assert.equal(mentionsClock("Disponible desde las 15:00", "15:00"), true);
assert.equal(mentionsClock("Desde las 9:00", "09:00"), true);
assert.equal(mentionsClock("Available from 4:00 PM", "15:00"), false);
assert.equal(mentionsClock("19:00–21:00", "09:00"), false);

// Windows.
const noon = new Date("2026-10-05T16:07:00Z"); // 12:07 NY
assert.deepEqual(laterTodayWindow(NY, { now: noon }), {
  dateKey: "2026-10-05",
  start: "13:15",
  end: "14:15",
  startMinute: 795,
  endMinute: 855,
});
assert.equal(
  laterTodayWindow(NY, { now: new Date("2026-10-06T03:30:00Z") }),
  null
); // 23:30 NY
assert.equal(laterTodayWindow(NY, { now: noon, notAfter: 840 }), null);
assert.deepEqual(liveNowWindow(NY, { now: noon }), {
  dateKey: "2026-10-05",
  start: "11:30",
  end: "13:45",
  startMinute: 690,
  endMinute: 825,
});
const w = liveNowWindow(NY, { now: noon })!;
assert.equal(isInsideWindow(NY, "2026-10-05T16:00:00.000Z", w), true); // 12:00 NY
assert.equal(isInsideWindow(NY, "2026-10-05T18:00:00.000Z", w), false); // 14:00 NY
assert.equal(isInsideWindow(NY, "2026-10-06T16:00:00.000Z", w), false); // next day

// Business-hours span.
const hours = [
  {
    day: "MONDAY",
    openingTime: "11:00:00",
    closingTime: "21:00:00",
    isClosed: false,
    is24Hours: false,
  },
  {
    day: "FRIDAY",
    openingTime: "11:00:00",
    closingTime: "02:00:00",
    isClosed: false,
    is24Hours: false,
  },
  {
    day: "SUNDAY",
    openingTime: null,
    closingTime: null,
    isClosed: true,
    is24Hours: false,
  },
  {
    day: "TUESDAY",
    openingTime: "00:00:00",
    closingTime: "23:59:59",
    isClosed: false,
    is24Hours: true,
  },
];
assert.deepEqual(openSpanOn(hours, "2026-10-05"), { open: 660, close: 1260 }); // Monday
assert.deepEqual(openSpanOn(hours, "2026-10-09"), { open: 660, close: 1439 }); // Friday overnight capped
assert.equal(openSpanOn(hours, "2026-10-11"), null); // Sunday closed
assert.equal(openSpanOn(hours, "2026-10-07"), null); // Wednesday: no row → closed
assert.deepEqual(openSpanOn(hours, "2026-10-06"), { open: 0, close: 1439 }); // 24h
assert.deepEqual(openSpanOn([], "2026-10-06"), { open: 0, close: 1439 }); // no hours = open

console.log("dealSchedule self-check: OK");
