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
 \* `--grep @labor-engines`, `--grep @tax-depth`, `--grep @print-builders`,
 \* `--grep @team-comms`, `--grep @staff-setup`, `--grep @daily-views`,
 \* `--grep @growth-a`, `--grep @reservations-audit`,
 \* `--grep @reservations-phase4`,
 * `--grep @attribution`, `--grep @affiliate-commission`,
 * `--grep @books-offboarding`, `--grep @hq-notices`, `--grep @split-hours`,
 * `--grep @owner-gift-cards`.
 */
import { test, expect } from "../fixtures/base";
import { apiRequestRaw } from "./apiHelper";
import { FRONTEND_URL } from "./testData";

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
  /** RestauNax branch feat/sales-attribution — who brought a restaurant in
   *  (HQ "Brought in by", card leaderboard, affiliate Sales tab). */
  attribution: true,
  /** RestauNax branch feat/sales-attribution (Plan 2) — affiliate commission
   *  plan, program defaults, termination outcome. */
  affiliateCommission: true,
  /** RestauNax back-office audit, Stage 1 paywall (branch bo1031/paywall,
   *  docs/features/back-office/audit-2026-10/W5_PAYWALL_TASKS.md): Menu TVs,
   *  Social Media and Voice AI gated; 404 before the add-on check (L2);
   *  company staff read-only on payroll (L4); Partner API labor needs
   *  Timecards (M1). On QA since 2026-11-01. */
  paywallStage1: true,
  /** RestauNax back-office audit, Stage 6 request flow (branch
   *  bo1031/reqflow, W5:P1–P4): a request made before the subscription is
   *  active waits (WAITING) and opens on activation; HQ lists waiting ones
   *  (?status=WAITING, waitingCount) and can decline (DECLINED); products
   *  carry accountLive / pendingRequestStatus. Flip once it is on QA. */
  requestFlowStage6: true,
  /** RestauNax back-office audit, Stage 6 simulator (W0:SIM-10..12): the
   *  QA sim's daily report carries the volume, labour and scenario checks
   *  (close.volume, time.laborPercent, tips.cashDeclared, …). Flip once the
   *  simulator with them runs on QA. Still false on 2026-11-01 although the
   *  code is merged: flip it only after the QA sim restaurants are
   *  re-enrolled AND the first live day has run on the new code (TC-1535
   *  reads that day's report). */
  simScenariosStage6: false,
  /** RestauNax back-office audit, Stage 5 labor-law engines (branch
   *  bo1031/engines, W3:M1 / H2 / M5): "Use my state's rules" overtime
   *  (default STATE), break packs + break decisions, premium pay, the
   *  owner's labor-rule confirmation (`/api/compliance/:rid/labor-rules`) and
   *  predictive scheduling. On QA since 2026-11-01. */
  laborEngines: true,
  /** RestauNax back-office audit, Stage 7 tax depth (branch
   *  bo1031/taxdepth, W4:H2 / M3 / H3 / M5 / M4 / M9 / L5): scheduled rate
   *  changes, the rate check + HQ rate review, filing classes, calendar
   *  periods, exemption certificates, the DAVO feed (salesTax:read) and the
   *  year-end fees / gift-card sections. Flip once it is on QA. */
  taxDepthStage7: true,
  /** RestauNax PR #1125, feat/supply-shop-table-card-extras (print builders):
   *  no free table-card print file (owner self-print 403 ORDER_TO_PRINT),
   *  the table card photo + follow code, /q/follow redirects, print-assets
   *  endpoints, the promo card builder, HQ shopping in the owner's own shop,
   *  and the reworked Finalise dialog (markup, packages, Finalise later).
   *  Kept false (2026-11-01): not part of the back-office QA run, and
   *  TC-1120 answers 400 instead of 403 TABLE_QR_ORDER_TO_PRINT on QA — not
   *  investigated yet. */
  printBuilders: false,
  /** RestauNax branch fix/reservations-audit (2026-10-31 audit fixes):
   *  allergyAlert / createdAt on staff rows, public timeZone + party bounds,
   *  checked waitlist/ARRIVED edits, partial seating, CONFIRMED linkable,
   *  RESERVATION_TABLES_REQUIRED, public input caps, pacing suggestion, and
   *  the dashboard's reworked Bookings/Settings screens. */
  reservationsAudit: true,
  /** RestauNax branch feat/reservations-phase4: online waitlist, server
   *  rotation and reservation deposits (all add-on only, off by default). */
  reservationsPhase4: true,
  /** RestauNax back-office audit, growth track B (branch bo1031/growthb,
   *  W0:MF-6 / MF-10): mobile clock-in from the staff app (owner settings,
   *  geofenced punches) and one-way staff announcements with read receipts.
   *  Flip once it is on QA. */
  teamCommsGrowthB: true,
  /** RestauNax back-office audit, Stage 6 setup & staff simplification
   *  (branch bo1031/uxsetup, W0:J1-a / J1-b / OB-1 / OB-3 / OB-4 / OB-5):
   *  the five-question setup interview
   *  (`/restaurant/:rid/back-office/setup-interview`), the Staff page as
   *  People · Schedule · Payday · Tips · Settings, one Permissions screen,
   *  one payroll mode shown, tip policy presets first + Advanced, and the
   *  RestauNax setup values on one line. Flip once it is on QA. */
  staffSetupStage6: true,
  /** RestauNax back-office audit, Stage 7 growth A (branch bo1031/growtha,
   *  W0:MF-5 / MF-7 / MF-9): prime cost (`/api/staff/prime-cost/:rid`),
   *  staff/jobs/wages import (`/api/staff/import/:rid`) and the nightly cash
   *  tip-out sheet (`/api/staff/tip-sheet/:rid`). On QA since
   *  2026-11-01; the prime cost card before the first sale needs RestauNax
   *  #1130. */
  growthAStage7: true,
  /** RestauNax back-office audit, Stage 6 daily views (branch bo1031/uxdaily,
   *  W0:J5 / J6 / J2 / MF-4 / J8): the approve preview, "Send to my
   *  accountant" (accountant-bundle + ZIP), the schedule forecast override and
   *  target labor %, GET /api/today/:id, and every discount type in the
   *  exceptions summary. Flip once it is on QA. */
  dailyViewsStage6: true,
  /** RestauNax branch feat/google-review-replies — /api/google-business/*
   *  (connect a Google Business Profile, list reviews, post/edit/delete
   *  replies, AI drafts, reply settings). */
  googleReviews: false,
  /** RestauNax branch feat/books-offboarding — books and Avalara Disconnect
   *  is RestauNax staff only; past entries stay downloadable without the
   *  add-on (GET /api/accounting/:id/past). Flip once it is on QA. */
  booksOffboarding: true,
  /** RestauNax feat/owner-gift-cards (plans A + B + web) — owner gift card
   *  reports, cards, batches, cash-out, disputes and the POS sell/reload
   *  routes. Flip once it is on QA. */
  ownerGiftCards: false,
  /** RestauNax feat/gift-cards-owner-ux (backend): GET config carries
   *  `canEditPlatformFields`; an owner PUT silently drops `isEnabled`,
   *  `allowCashFunding` and `allowPhysicalActivation` (RestauNax staff still
   *  write them through the owner route); the stock report is paged
   *  (`?page&limit` → `total`, `page`, `limit`, `totalPages`, `totals` over
   *  every batch). Flip once it is on QA. */
  giftCardsOwnerUx: false,
  /** The dashboard half of feat/gift-cards-owner-ux: "Set up by RestauNax"
   *  read-only rows for owners, the stock report's pagination, Chain
   *  settlement only on a chain or chain member page, no "Money held by" /
   *  "Sold at" in the drawer and finder (chain-only captions). Deployed
   *  separately from the backend. Flip after 41-gift-cards-ui.spec.ts is
   *  green on QA. */
  giftCardsOwnerUxDashboard: false,
  /** RestauNax PR #1174, feat/hq-notices — HQ → Operations → Notices
   *  (`/api/admin/notices/*`, permission HQ_OPERATIONS_NOTICES), the public
   *  unsubscribe/resubscribe page and `/api/notices/*`. RestauNax PR #1174 —
   *  API on QA since 2026-11-14; the API/email cases of TC-1980..1989 ran
   *  7/7 (the 3 browser cases are gated by hqNoticesDashboard below). */
  hqNotices: true,
  /** The dashboard half of RestauNax PR #1174: HQ → Operations → Notices,
   *  the restaurant list's "Send a notice" and the public unsubscribe page.
   *  Deployed separately from the backend (on 2026-11-14 the QA backend had
   *  the API while the QA dashboard bundle had no Notices yet); on the QA
   *  dashboard since RestauNax PR #1175 + #1180 deployed, 2026-11-14. */
  hqNoticesDashboard: true,
  /** RestauNax branch feat/split-hours (docs/features/SPLIT_HOURS.md) — a
   *  day, weekly or a holiday date, can have several open windows; hours rows
   *  carry `windows`, and the order gate, ordering status and the save
   *  preview read them. Flip once the backend is on QA and
   *  api-split-hours.spec.ts is green there. */
  splitHours: false,
  /** The dashboard half of feat/split-hours: "Add hours" in the business
   *  hours editor and the holiday dialog. Deployed separately from the
   *  backend. Flip after 41-split-hours-ui.spec.ts is green on QA. */
  splitHoursDashboard: false,
  /** Template-lima feat/split-hours: the break of a split day on the
   *  ordering site ("We reopen at 5:00 PM", today's hours with every window,
   *  slots only inside a window). Deployed separately from the backend. Flip
   *  after customer-lima/20-split-hours.spec.ts is green on QA. */
  splitHoursLima: false,
  /** Template-wind feat/split-hours: the break of a split day on the
   *  restaurant website (hero "Closed · Opens 5:00 PM", every window in the
   *  hours table, checkout offers only times inside a window and leaves ASAP
   *  when the restaurant closes). Deployed separately from the backend. Flip
   *  after customer/15-split-hours.spec.ts is green on QA. */
  splitHoursWind: false,
  /** RestauNax feat/split-hours (b09705706): the public waitlist status read
   *  (`GET /api/public/restaurants/:id/waitlist`) answers 200 `disabled` for a
   *  restaurant without the reservations add-on instead of 403
   *  RESERVATIONS_NOT_ENABLED (apps call it on launch). While this is false
   *  TC-1236 accepts the old 403 too; flip it once the backend is on QA and
   *  the 403 becomes a failure. */
  waitlistStatusWithoutAddon: false,
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
  attribution:
    "Restaurant attribution (RestauNax feat/sales-attribution) is not on this environment yet — /api/admin/attribution answers 404",
  affiliateCommission:
    "Affiliate commission (RestauNax feat/sales-attribution) is not on this environment yet — /api/affiliates/admin/program-defaults answers 404",
  reservationsAudit:
    "The reservations audit fixes (RestauNax fix/reservations-audit) are not on this environment yet — the booking-hours suggestion carries no suggestedMaxPartiesPerSlot",
  reservationsPhase4:
    "Reservations phase 4 (online waitlist, server rotation, deposits — RestauNax feat/reservations-phase4) is not on this environment yet — reservation settings carry no onlineWaitlistEnabled",
  paywallStage1:
    "The Stage 1 paywall fixes (RestauNax bo1031/paywall) are not on this environment yet",
  simScenariosStage6:
    "The Stage 6 simulator checks (W0:SIM-10..12) are not in QA's daily report yet",
  requestFlowStage6:
    "Waiting / declined add-on requests (RestauNax bo1031/reqflow, Stage 6) are not on this environment yet — HQ's request list has no waitingCount",
  laborEngines:
    "The Stage 5 labor-law engines (RestauNax bo1031/engines) are not on this environment yet — /api/compliance/:id/labor-rules answers 404",
  staffSetupStage6:
    "The Stage 6 setup interview and Staff page simplification (RestauNax bo1031/uxsetup) are not on this environment yet — /restaurant/:id/back-office/setup-interview answers 404",
  taxDepthStage7:
    "The Stage 7 tax depth (RestauNax bo1031/taxdepth) is not on this environment yet — /api/tax/:id/rate-check answers 404",
  printBuilders:
    "Print builders (no free table-card print file, photo + follow code, promo card builder, HQ shops in the owner's shop) are not on this environment yet — /restaurant/:id/print-assets/social does not answer",
  teamCommsGrowthB:
    "Mobile clock-in + staff announcements (RestauNax bo1031/growthb, W0:MF-6 / MF-10) are not on this environment yet — /api/staff/announcements/:id answers 404",
  growthAStage7:
    "The Stage 7 growth A track (RestauNax bo1031/growtha: prime cost, staff import, cash tip-out sheet) is not on this environment yet — /api/staff/tip-sheet/:id/settings answers 404",
  dailyViewsStage6:
    "The Stage 6 daily views (RestauNax bo1031/uxdaily) are not on this environment yet — /api/today/:id answers 404",
  googleReviews:
    "Google review replies (RestauNax feat/google-review-replies) is not on this environment yet — /api/google-business/:id answers 404",
  booksOffboarding:
    "Books offboarding (RestauNax feat/books-offboarding) is not on this environment yet — /api/accounting/:id/past answers 404",
  ownerGiftCards:
    "Owner gift cards (RestauNax feat/owner-gift-cards) are not on this environment yet — /api/gift-cards/restaurants/:id/reports/summary answers 404",
  giftCardsOwnerUx:
    "The gift cards owner UX follow-up (RestauNax feat/gift-cards-owner-ux) is not on this environment yet — GET /api/gift-cards/restaurants/:id/config carries no canEditPlatformFields",
  giftCardsOwnerUxDashboard:
    "The gift cards owner UX screens (RestauNax feat/gift-cards-owner-ux) are not on this dashboard yet — locales/en/giftCards.json has no settings.platformGroup",
  hqNotices:
    "HQ notices (RestauNax PR #1174, feat/hq-notices) are not on this environment yet — /api/admin/notices answers 404",
  hqNoticesDashboard:
    "The HQ notices dashboard screens (RestauNax PR #1174) are not on this dashboard yet — locales/en/admin.json has no `notices` block",
  splitHours:
    "Split hours (RestauNax feat/split-hours) are not on this environment yet — saved hours rows carry no `windows`",
  splitHoursDashboard:
    "The split hours editor (RestauNax feat/split-hours) is not on this dashboard yet — locales/en/common.json has no businessHours.addHours",
  splitHoursLima:
    "Split hours (Template-lima feat/split-hours) are not on this ordering site yet — the order-time notice has no order-time-notice test id",
  waitlistStatusWithoutAddon:
    "The public waitlist status still answers 403 without the reservations add-on (RestauNax feat/split-hours b09705706 is not on this environment yet)",
  splitHoursWind:
    "Split hours (Template-wind feat/split-hours) are not on this website yet — checkout has no order-time-notice in the break",
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
 * Is restaurant attribution deployed? `GET /api/admin/attribution/funnel` is
 * a read-only admin list that only exists with feat/sales-attribution.
 */
export async function probeAttribution(adminToken: string): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    "/api/admin/attribution/funnel?payee=card",
    undefined,
    adminToken
  );
  return res.status !== 404;
}

/**
 * Is the affiliate commission plan deployed? `GET
 * /api/affiliates/admin/program-defaults` is a read-only admin route that only
 * exists with feat/sales-attribution (Plan 2).
 */
export async function probeAffiliateCommission(
  adminToken: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    "/api/affiliates/admin/program-defaults",
    undefined,
    adminToken
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
 * Is books offboarding deployed? `GET /api/accounting/:id/past` answers 200
 * once it is (404 before, for a restaurant with the add-on).
 */
export async function probeBooksOffboarding(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/accounting/${restaurantId}/past`,
    undefined,
    ownerToken
  );
  return res.status === 200;
}

/**
 * Are owner gift cards deployed? `GET /api/gift-cards/restaurants/:rid/
 * reports/summary` answers 200 once they are (404 before). Only 404 means
 * "backend missing": a deployed backend answers a tenant without GIFT_CARDS
 * (a home-food seller) 403 FEATURE_NOT_AVAILABLE, which is still "deployed",
 * and any other answer surfaces as a real failure rather than a skip
 * (same rule as probeTaxDepthStage7). Read-only.
 */
export async function probeOwnerGiftCards(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/gift-cards/restaurants/${restaurantId}/reports/summary`,
    undefined,
    ownerToken,
    { "X-Restaurant-Id": restaurantId }
  );
  return res.status !== 404;
}

/**
 * Is the gift cards owner UX follow-up deployed (backend)? `GET
 * /api/gift-cards/restaurants/:rid/config` (an owner read) carries a boolean
 * `canEditPlatformFields` only with it. Read-only.
 */
export async function probeGiftCardsOwnerUx(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw<{
    data?: { canEditPlatformFields?: unknown };
  }>(
    "GET",
    `/api/gift-cards/restaurants/${restaurantId}/config`,
    undefined,
    ownerToken,
    { "X-Restaurant-Id": restaurantId }
  );
  return (
    res.status === 200 &&
    typeof res.data?.data?.canEditPlatformFields === "boolean"
  );
}

/**
 * Is the gift cards owner UX DASHBOARD deployed? Its
 * `locales/en/giftCards.json` has `settings.platformGroup` ("Set up by
 * RestauNax") only with the change. Read-only, no auth.
 */
export async function probeGiftCardsOwnerUxDashboard(): Promise<boolean> {
  try {
    const res = await fetch(
      `${FRONTEND_URL.replace(/\/+$/, "")}/locales/en/giftCards.json`
    );
    if (!res.ok) return false;
    const json = (await res.json()) as {
      settings?: { platformGroup?: unknown };
    };
    return typeof json.settings?.platformGroup === "string";
  } catch {
    return false;
  }
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

/**
 * Are mobile clock-in + staff announcements deployed? `GET /api/staff/
 * announcements/:rid` is a new router mount (404 before it exists); the
 * owner of a TIMECARDS restaurant gets 200. Read-only.
 */
export async function probeTeamCommsGrowthB(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/staff/announcements/${restaurantId}`,
    undefined,
    ownerToken
  );
  return res.status !== 404;
}

/**
 * Is the Stage 6 setup & staff simplification deployed? `GET
 * /restaurant/:rid/back-office/setup-interview` answers every owner of the
 * restaurant (an unavailable interview says so, never a 403) and only exists
 * with the change; the dashboard's new Staff layout ships with it. Read-only.
 */
export async function probeStaffSetupStage6(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/back-office/setup-interview`,
    undefined,
    ownerToken
  );
  return res.status !== 404;
}

/**
 * Is the Stage 7 growth A track deployed? `GET /api/staff/tip-sheet/:rid/settings`
 * exists only with it (403 without Tip Management, never 404). Read-only.
 */
export async function probeGrowthAStage7(
  ownerToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/staff/tip-sheet/${restaurantId}/settings`,
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

/**
 * Are Google review replies deployed? `GET /api/google-business/:id` answers
 * every signed-in user who controls the restaurant (never 404 once the route
 * exists), so a 404 means the change is not on this environment.
 */
export async function probeGoogleReviews(
  accessToken: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    `/api/google-business/${restaurantId}`,
    undefined,
    accessToken
  );
  return res.status !== 404;
}

/**
 * Are HQ notices deployed? `GET /api/admin/notices` exists only with RestauNax
 * PR #1174; an admin without HQ_OPERATIONS_NOTICES gets 403 (still "present"),
 * so only a 404 means the route is missing. Read-only.
 */
export async function probeHqNotices(adminToken: string): Promise<boolean> {
  const res = await apiRequestRaw(
    "GET",
    "/api/admin/notices?pageSize=1",
    undefined,
    adminToken
  );
  return res.status !== 404;
}

/**
 * Is the HQ notices DASHBOARD deployed? The dashboard serves its locale files
 * statically; `locales/en/admin.json` carries a `notices` block only with the
 * change. Read-only, no auth.
 */
export async function probeHqNoticesDashboard(): Promise<boolean> {
  try {
    const res = await fetch(
      `${FRONTEND_URL.replace(/\/+$/, "")}/locales/en/admin.json`
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { notices?: unknown };
    return typeof json.notices === "object" && json.notices !== null;
  } catch {
    return false;
  }
}

/**
 * Is the split-hours BACKEND deployed? A saved hours row carries a `windows`
 * key (null for a one-window day) only with RestauNax feat/split-hours.
 * Read-only. The restaurant needs at least one saved day: with no rows there
 * is nothing to read the key from, and this answers false.
 */
export async function probeSplitHours(
  token: string,
  restaurantId: string
): Promise<boolean> {
  const res = await apiRequestRaw<{ businessHours?: unknown }>(
    "GET",
    `/restaurant/${restaurantId}/hours`,
    undefined,
    token
  );
  const rows = Array.isArray(res.data?.businessHours)
    ? (res.data.businessHours as Record<string, unknown>[])
    : [];
  return rows.length > 0 && rows.every((row) => "windows" in row);
}

/**
 * Is the split-hours DASHBOARD deployed? Its `locales/en/common.json` has
 * `businessHours.addHours` ("Add hours") only with the change. Read-only, no
 * auth.
 */
export async function probeSplitHoursDashboard(): Promise<boolean> {
  try {
    const res = await fetch(
      `${FRONTEND_URL.replace(/\/+$/, "")}/locales/en/common.json`
    );
    if (!res.ok) return false;
    const json = (await res.json()) as {
      businessHours?: { addHours?: unknown };
    };
    return typeof json.businessHours?.addHours === "string";
  } catch {
    return false;
  }
}
