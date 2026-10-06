/**
 * dealScheduleGate.ts — deploy gates for the deal-scheduling specs.
 *
 * These specs land before (or while) the restaunax / template-wind /
 * template-lima changes they exercise reach QA. While a part's flag is false
 * its tests SKIP with a reason (deploy lag is not a product failure). Once the
 * part is confirmed on QA, flip its flag to true: the same call then FAILS
 * when the capability is missing, so a regression can't hide as a skip.
 */
import { test, expect } from "../fixtures/base";

export const SCHEDULING_ON_QA = {
  /** restaunax Plan 1 — /active carries `timeZone`. */
  backend: true,
  /** restaunax Plan 2 — the deal form has the schedule section. */
  dashboard: true,
  /** Plan 4 — template-wind renders deal-schedule-summary. */
  wind: true,
  /** Plan 4 — template-lima renders deal-schedule-summary + sends dealItemId. */
  lima: false,
};

export type SchedulingPart = keyof typeof SCHEDULING_ON_QA;

const REASON: Record<SchedulingPart, string> = {
  backend:
    "Deal scheduling backend (restaunax Plan 1) is not on QA yet — /active has no timeZone",
  dashboard:
    "Dashboard deal-schedule UI (restaunax Plan 2) is not on QA yet — no schedule section in the deal form",
  wind: "template-wind deal-schedule UI (Plan 4) is not on QA yet — no deal-schedule-summary on the deal card",
  lima: "template-lima deal-schedule UI (Plan 4) is not on QA yet — no deal-schedule-summary / dealItemId",
};

/** Skip (flag off) or fail (flag on) when `present` is false. */
export function requireScheduling(
  part: SchedulingPart,
  present: boolean
): void {
  if (SCHEDULING_ON_QA[part]) {
    expect(present, REASON[part]).toBe(true);
    return;
  }
  test.skip(!present, REASON[part]);
}
