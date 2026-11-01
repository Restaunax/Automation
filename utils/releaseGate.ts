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
 * `--grep @labor-engines`, `--grep @tax-depth`, `--grep @daily-views`.
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
  /** RestauNax back-office audit, Stage 1 paywall (branch bo1031/paywall,
   *  docs/features/back-office/audit-2026-10/W5_PAYWALL_TASKS.md): Menu TVs,
   *  Social Media and Voice AI gated; 404 before the add-on check (L2);
   *  company staff read-only on payroll (L4); Partner API labor needs
   *  Timecards (M1). Flip once it is on QA. */
  paywallStage1: false,
  /** RestauNax back-office audit, Stage 6 request flow (branch
   *  bo1031/reqflow, W5:P1–P4): a request made before the subscription is
   *  active waits (WAITING) and opens on activation; HQ lists waiting ones
   *  (?status=WAITING, waitingCount) and can decline (DECLINED); products
   *  carry accountLive / pendingRequestStatus. Flip once it is on QA. */
  requestFlowStage6: false,
  /** RestauNax back-office audit, Stage 6 simulator (W0:SIM-10..12): the
   *  QA sim's daily report carries the volume, labour and scenario checks
   *  (close.volume, time.laborPercent, tips.cashDeclared, …). Flip once the
   *  simulator with them runs on QA. */
  simScenariosStage6: false,
  /** RestauNax back-office audit, Stage 5 labor-law engines (branch
   *  bo1031/engines, W3:M1 / H2 / M5): "Use my state's rules" overtime
   *  (default STATE), break packs + break decisions, premium pay, the
   *  owner's labor-rule confirmation (`/api/compliance/:rid/labor-rules`) and
   *  predictive scheduling. Flip once it is on QA. */
  laborEngines: false,
  /** RestauNax back-office audit, Stage 7 tax depth (branch
   *  bo1031/taxdepth, W4:H2 / M3 / H3 / M5 / M4 / M9 / L5): scheduled rate
   *  changes, the rate check + HQ rate review, filing classes, calendar
   *  periods, exemption certificates, the DAVO feed (salesTax:read) and the
   *  year-end fees / gift-card sections. Flip once it is on QA. */
  taxDepthStage7: false,
  /** RestauNax back-office audit, Stage 6 daily views (branch bo1031/uxdaily,
   *  W0:J5 / J6 / J2 / MF-4 / J8): the approve preview, "Send to my
   *  accountant" (accountant-bundle + ZIP), the schedule forecast override and
   *  target labor %, GET /api/today/:id, and every discount type in the
   *  exceptions summary. Flip once it is on QA. */
  dailyViewsStage6: false,
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
  paywallStage1:
    "The Stage 1 paywall fixes (RestauNax bo1031/paywall) are not on this environment yet",
  simScenariosStage6:
    "The Stage 6 simulator checks (W0:SIM-10..12) are not in QA's daily report yet",
  requestFlowStage6:
    "Waiting / declined add-on requests (RestauNax bo1031/reqflow, Stage 6) are not on this environment yet — HQ's request list has no waitingCount",
  laborEngines:
    "The Stage 5 labor-law engines (RestauNax bo1031/engines) are not on this environment yet — /api/compliance/:id/labor-rules answers 404",
  taxDepthStage7:
    "The Stage 7 tax depth (RestauNax bo1031/taxdepth) is not on this environment yet — /api/tax/:id/rate-check answers 404",
  dailyViewsStage6:
    "The Stage 6 daily views (RestauNax bo1031/uxdaily) are not on this environment yet — /api/today/:id answers 404",
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

/**
 * Is the Stage 1 paywall deployed? On a restaurant WITHOUT Menu TVs, the TV
 * list answers 403 FEATURE_NOT_ENTITLED once the gate exists (200 before).
 * Read-only.
 */
export async function probePaywallStage1(
  ownerToken: string,
  restaurantIdWithoutMenuTvs: string
): Promise<boolean> {
  const res = await apiRequestRaw<{ error?: string }>(
    "GET",
    `/api/menu-tv/restaurants/${restaurantIdWithoutMenuTvs}/devices`,
    undefined,
    ownerToken
  );
  return res.status === 403 && res.data?.error === "FEATURE_NOT_ENTITLED";
}

/**
 * Is the Stage 6 request flow deployed? HQ's request list answers a numeric
 * `waitingCount` next to `openCount` only with it. Read-only (the countOnly
 * form loads no requests).
 */
export async function probeRequestFlowStage6(
  adminToken: string
): Promise<boolean> {
  const res = await apiRequestRaw<{ waitingCount?: unknown }>(
    "GET",
    "/api/admin/addons/requests?countOnly=1",
    undefined,
    adminToken
  );
  return res.status === 200 && typeof res.data?.waitingCount === "number";
}

/**
 * Are the Stage 5 labor-law engines deployed? `GET /api/compliance/:rid/
 * labor-rules` is a core read (no add-on) for the restaurant's owner that
 * only exists with the change. Read-only.
 */
export async function probeLaborEngines(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/compliance/${restaurantId}/labor-rules`,
    undefined,
    ownerToken
  );
  return res.status !== 404;
}

/**
 * Is the Stage 7 tax depth deployed? `GET /api/tax/:rid/rate-check` is a
 * core read for the restaurant's owner that only exists with the change.
 * Read-only.
 */
export async function probeTaxDepthStage7(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/tax/${restaurantId}/rate-check`,
    undefined,
    ownerToken
  );
  return res.status !== 404;
}

/**
 * Are the Stage 6 daily views deployed? `GET /api/today/:rid` is a read the
 * restaurant's owner may always make; it only exists with the change.
 * Read-only.
 */
export async function probeDailyViewsStage6(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/today/${restaurantId}`,
    undefined,
    ownerToken
  );
  return res.status !== 404;
}
