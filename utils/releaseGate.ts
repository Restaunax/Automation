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
 * `--grep @bugfix-1036`, `--grep @settings-safety`, `--grep @switch-click`.
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
