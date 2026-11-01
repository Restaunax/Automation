/**
 * releaseGate.ts — deploy gates for specs that land before the RestauNax
 * change they exercise reaches QA (same contract as dealScheduleGate.ts).
 *
 * While a part's flag is false its tests SKIP with a reason when the
 * capability is missing — deploy lag is not a product failure, and the
 * nightly run on QA stays green. Run against a stack that has the change
 * (a local BACKEND_URL / FRONTEND_URL, or QA after the merge) and the same
 * tests run for real. Once the change is confirmed on QA, flip its flag to
 * true: the same call then FAILS when the capability is missing, so a
 * regression can't hide as a skip.
 *
 * Select a part's tests with its tag: `--grep @training`, `--grep @closeout`,
 * `--grep @bugfix-1036`, `--grep @settings-safety`, `--grep @switch-click`,
 * `--grep @print-builders`, `--grep @reservations-audit`,
 * `--grep @reservations-phase4`.
 */
import { test, expect } from "../fixtures/base";
import { apiRequestRaw } from "./apiHelper";

export const RELEASED_ON_QA = {
  /** RestauNax branch feat/training-academy — /training + HQ → People → Training. */
  training: false,
  /** RestauNax PR #1036 (fix/app-bug-batch-2026-10). */
  bugBatch: true,
  /** RestauNax PR #1038 (feat/restaurant-closeout). */
  closeOut: true,
  /** Settings safety (RestauNax-only setup fields, the change history, the
   *  POS staff-capability rule — docs/features/back-office/SETTINGS_SAFETY.md).
   *  Built on feat/ux-round3a, shipped in RestauNax PR #1074 ("back office:
   *  the next level"); on QA since 2026-10-27. */
  settingsSafety: true,
  /** RestauNax PR #1102 — removing table cards from the Print Shop cart
   *  removes the stands that came with them (before it, they stayed). On QA
   *  since 2026-10-29. */
  cartRemoveStands: true,
  /** RestauNax branch fix/switch-click-target — a click on a switch's label
   *  text or row no longer toggles it; only the switch does (theme-level). */
  switchClickTarget: false,
  /** RestauNax PR #1125, feat/supply-shop-table-card-extras (print builders):
   *  no free table-card print file (owner self-print 403 ORDER_TO_PRINT),
   *  the table card photo + follow code, /q/follow redirects, print-assets
   *  endpoints, the promo card builder, HQ shopping in the owner's own shop,
   *  and the reworked Finalise dialog (markup, packages, Finalise later). */
  printBuilders: false,
  /** RestauNax branch fix/reservations-audit (2026-10-31 audit fixes):
   *  allergyAlert / createdAt on staff rows, public timeZone + party bounds,
   *  checked waitlist/ARRIVED edits, partial seating, CONFIRMED linkable,
   *  RESERVATION_TABLES_REQUIRED, public input caps, pacing suggestion, and
   *  the dashboard's reworked Bookings/Settings screens. */
  reservationsAudit: false,
  /** RestauNax branch feat/reservations-phase4: online waitlist, server
   *  rotation and reservation deposits (all add-on only, off by default). */
  reservationsPhase4: false,
};

export type ReleasePart = keyof typeof RELEASED_ON_QA;

const REASON: Record<ReleasePart, string> = {
  training:
    "Training Academy (RestauNax feat/training-academy) is not on this environment yet — /api/training answers 404",
  bugBatch: "RestauNax PR #1036 (app bug batch) is not on this environment yet",
  closeOut:
    "Restaurant close-out (RestauNax PR #1038) is not on this environment yet — /api/admin/close-out answers 404",
  settingsSafety:
    "Settings safety (RestauNax PR #1074) is not on this environment yet — /api/restaurantId/:id/settings/setup answers 404",
  cartRemoveStands:
    "Removing cards also removes their stands (RestauNax PR #1102) is not on this environment yet",
  switchClickTarget:
    "Switches toggle only from the switch (RestauNax fix/switch-click-target) is not on this environment yet",
  reservationsAudit:
    "The reservations audit fixes (RestauNax fix/reservations-audit) are not on this environment yet — the booking-hours suggestion carries no suggestedMaxPartiesPerSlot",
  reservationsPhase4:
    "Reservations phase 4 (online waitlist, server rotation, deposits — RestauNax feat/reservations-phase4) is not on this environment yet — reservation settings carry no onlineWaitlistEnabled",
  printBuilders:
    "Print builders (no free table-card print file, photo + follow code, promo card builder, HQ shops in the owner's shop) are not on this environment yet — /restaurant/:id/print-assets/social does not answer",
};

/** Skip (flag off) or fail (flag on) when `present` is false. */
export function requireRelease(
  part: ReleasePart,
  present: boolean,
  detail?: string
): void {
  const reason = detail ? `${REASON[part]} (${detail})` : REASON[part];
  if (RELEASED_ON_QA[part]) {
    expect(present, reason).toBe(true);
    return;
  }
  test.skip(!present, reason);
}

/**
 * Like requireRelease, for a test whose OLD half still runs on a stack
 * without the change: returns whether the change is present (so the caller
 * runs the new assertions only then), and fails once the part's flag is on
 * and the change is missing.
 */
export function releasePresent(part: ReleasePart, present: boolean): boolean {
  if (RELEASED_ON_QA[part]) expect(present, REASON[part]).toBe(true);
  return present;
}

/**
 * Are the reservations audit fixes deployed? The booking-hours suggestion
 * (`GET /restaurant/:id/reservation-service-periods/suggested`, an owner read
 * on an entitled restaurant) carries `suggestedMaxPartiesPerSlot` only with
 * the change. Read-only.
 */
export async function probeReservationsAudit(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw<{
    data?: { suggestedMaxPartiesPerSlot?: unknown };
  }>(
    "GET",
    `/restaurant/${restaurantId}/reservation-service-periods/suggested`,
    undefined,
    ownerToken
  );
  return (
    res.status === 200 &&
    typeof res.data?.data?.suggestedMaxPartiesPerSlot === "number"
  );
}

/**
 * Is reservations phase 4 deployed? `GET /restaurant/:id/reservation-settings`
 * (an owner read on any restaurant) carries `onlineWaitlistEnabled` only with
 * the change. Read-only.
 */
export async function probeReservationsPhase4(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw<{
    data?: { onlineWaitlistEnabled?: unknown };
  }>(
    "GET",
    `/restaurant/${restaurantId}/reservation-settings`,
    undefined,
    ownerToken
  );
  return (
    res.status === 200 &&
    typeof res.data?.data?.onlineWaitlistEnabled === "boolean"
  );
}

/**
 * Is the Training Academy deployed? `GET /api/training/catalogue` is open to
 * every signed-in user (an empty list for anyone not in training), so a 404
 * means the route does not exist. Read-only.
 */
export async function probeTraining(accessToken: string): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    "/api/training/catalogue",
    undefined,
    accessToken
  );
  return res.status !== 404;
}

/**
 * Is the close-out deployed? `GET /api/admin/close-out/returns-due` is a
 * read-only admin list that only exists with PR #1038.
 */
export async function probeCloseOut(adminToken: string): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    "/api/admin/close-out/returns-due",
    undefined,
    adminToken
  );
  return res.status !== 404;
}

/**
 * Is settings safety deployed? `GET /api/restaurantId/:id/settings/setup` is
 * a read every owner may call (never 403) and only exists with the change.
 */
export async function probeSettingsSafety(
  accessToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/restaurantId/${restaurantId}/settings/setup`,
    undefined,
    accessToken
  );
  return res.status !== 404;
}

/**
 * Are the print builders deployed? `GET /restaurant/:id/print-assets/social`
 * is a read the owner (and HQ) may call and only exists with the change; it
 * answers `{ social: [] }` for a restaurant with no saved links. Read-only.
 */
export async function probePrintBuilders(
  accessToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw<{ data?: { social?: unknown } }>(
    "GET",
    `/restaurant/${restaurantId}/print-assets/social`,
    undefined,
    accessToken
  );
  return res.status === 200 && Array.isArray(res.data?.data?.social);
}
