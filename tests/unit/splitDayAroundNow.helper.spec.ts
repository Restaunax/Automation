import { test, expect } from "@playwright/test";
import {
  localParts,
  splitDayAroundNow,
  zonedInstant,
} from "../../utils/dealSchedule";

const ZONE = "America/New_York";
/** The instant the restaurant's clock reads `minute` on 2026-11-16 (a Monday). */
const at = (minute: number) => zonedInstant(ZONE, "2026-11-16", minute);

test.describe("splitDayAroundNow", () => {
  test("break: now sits between the two windows, on 15-minute marks", () => {
    const plan = splitDayAroundNow(ZONE, "break", at(15 * 60 + 52));
    expect(plan).not.toBeNull();
    expect(plan!.dayName).toBe("MONDAY");
    expect(plan!.dateKey).toBe("2026-11-16");
    expect(plan!.windows).toEqual([
      { openingTime: "13:30:00", closingTime: "15:30:00" },
      { openingTime: "17:00:00", closingTime: "19:00:00" },
    ]);
  });

  test("first: now is inside the first window", () => {
    const plan = splitDayAroundNow(ZONE, "first", at(11 * 60 + 7));
    expect(plan!.windows).toEqual([
      { openingTime: "10:30:00", closingTime: "12:15:00" },
      { openingTime: "13:15:00", closingTime: "15:15:00" },
    ]);
  });

  test("every minute of the day: a plan keeps its promise, or there is none", () => {
    for (let minute = 0; minute < 1440; minute += 1) {
      const now = at(minute);
      expect(localParts(ZONE, now).minuteOfDay).toBe(minute);
      for (const where of ["break", "first"] as const) {
        const plan = splitDayAroundNow(ZONE, where, now);
        if (!plan) continue;
        const { first, second } = plan;
        expect(first.startMinute).toBeGreaterThanOrEqual(0);
        expect(first.endMinute).toBeGreaterThan(first.startMinute);
        expect(second.startMinute).toBeGreaterThan(first.endMinute);
        expect(second.endMinute).toBeGreaterThan(second.startMinute);
        expect(second.endMinute).toBeLessThanOrEqual(1425);
        if (where === "break") {
          expect(minute - first.endMinute).toBeGreaterThanOrEqual(20);
          expect(second.startMinute - minute).toBeGreaterThanOrEqual(60);
        } else {
          expect(minute - first.startMinute).toBeGreaterThanOrEqual(30);
          expect(first.endMinute - minute).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });

  test("no room near midnight", () => {
    expect(splitDayAroundNow(ZONE, "break", at(10))).toBeNull();
    expect(splitDayAroundNow(ZONE, "break", at(23 * 60 + 30))).toBeNull();
    expect(splitDayAroundNow(ZONE, "first", at(5))).toBeNull();
    expect(splitDayAroundNow(ZONE, "first", at(23 * 60))).toBeNull();
    // The nightly starts at 06:00 UTC = 01:00 in New York in winter.
    expect(splitDayAroundNow(ZONE, "break", at(60))).not.toBeNull();
    expect(splitDayAroundNow(ZONE, "first", at(60))).not.toBeNull();
  });
});
