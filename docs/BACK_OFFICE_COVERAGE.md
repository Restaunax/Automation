# Back-office coverage plan

The back office (timecards, tips, payroll export and Gusto, scheduling, the
Restaunax Staff app, roles, service fee, sales tax, reports) was built in
`restaunax` from 2026-10-03 to 2026-10-06 — spec and tracker in
`restaunax/docs/features/back-office/README.md`. None of it had end-to-end
coverage. This file is the plan for it, in priority order, and its status.

All of it targets **QA** like the rest of the suite, so a step can only pass
once its backend is merged to `qa` and deployed.

## Approach

- **API first.** Most of the back office is rules on the server (who may take
  a shift, what a pay period pays, how tips split). API specs prove them
  directly and stay stable; a few UI specs then cover the screens a manager
  actually uses.
- **One throwaway tenant per file** (`createSecondOwner`), with the add-ons it
  needs granted by override (`setFeatureOverrideAdminRaw`) — never the shared
  seed restaurant, whose settings other files assert. Grant **packages**
  (`SCHEDULING`, `PAYROLL`): `TIMECARDS` and `TIP_MANAGEMENT` are components
  and the override is refused for them; the packages imply them.
- **Real staff accounts.** Restaunax Staff signs people in with their own
  RestauNax account, so specs invite staff and claim the invite from Mailpit
  (`waitForEmail` + `extractInviteToken` + `registerWithInvite`). These files
  skip without `MAILPIT_BASE_URL`.
- **The Staff mobile app's screens** are covered by component tests in
  `Restaunax-Staff`; here we cover every backend call it makes.

## Order and status

Every spec mints its own tenant and deletes it after. "Passing" means the CI
dispatch of `e2e.yml` on the PR branch against QA.

| #   | Area                                                                                                                                                                                                                                                                                                                                                                          | Spec                               | TCs                 | Status                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Restaunax Staff requests: time off, availability, release → pick up → approve, walls, owner email                                                                                                                                                                                                                                                                             | `api-staff-requests.spec.ts`       | TC-543..552         | Passing on QA (2026-10-06)                                                                         |
| 2   | Hiring: invite → email → register with the invite → on the staff list → job + own wage → role on the POS (Staff refused, custom role, role edit live) → guards (no self-edit, no escalation) → Restaunax Staff `/me` → deactivation closes POS + staff app; single-use invite                                                                                                 | `api-staff-hiring.spec.ts`         | TC-553..562, TC-618 | Passing on QA (2026-10-06); TC-618 asserts the B1 fix (#909)                                       |
| 3   | Add-on gating (packaging v2): none → SCHEDULING → SCHEDULING+TIP_MANAGEMENT → TIP_MANAGEMENT alone → PAYROLL alone (Tip Management shown INCLUDED, not addable) → none, across owner API, dashboard + POS feature sets, POS time clock (free breaks, job picker, clock-in rule), staff app; TIMECARDS refused as a component; HOME_FOOD                                       | `api-addon-gating.spec.ts`         | TC-563..569, TC-635 | Rewritten for v2 — see PR #85                                                                      |
| 4   | Scheduling: costed week in cents (personal rate, unpaid break, open shift), projected overtime, warnings (overlap, job not held, short rest, can't notify), publish + emails, staff app sees published only, edit after publish, copy week as open (DST), clock-in rule BLOCK/WARN/early window/OFF with manager PIN, time-off notice + blackouts, approval toggles, show pay | `api-scheduling.spec.ts`           | TC-570..579, TC-636 | Passing on QA (2026-10-06); TC-576 runs only before ~22:30 Miami; TC-636 asserts the B2 fix (#909) |
| 5   | Timecards & pay periods: blended-rate overtime ($760.00), FEDERAL/CALIFORNIA/CUSTOM, raise never re-prices, breaks (unpaid meal, paid rest, overage conversion), missed break blocks approval until reviewed, approve locks, reopen needs reason, labor report + CSV, staff app hours before / pay after approval, POS job picker + breaks                                    | `api-timecards.spec.ts`            | TC-580..587         | Passing on QA (2026-10-06)                                                                         |
| 6   | Tips: no pool, pool by points × hours, EQUAL, tip-out % of tips, % of sales, legal guards, managerial-after-save, declared cash (never pooled, supersedes), tips CSV — exact cents                                                                                                                                                                                            | `api-tips.spec.ts`                 | TC-588..596         | Passing on QA (2026-10-06)                                                                         |
| 7   | Payroll export: only approved periods, preview warnings per format, RestauNax / Gusto / ADP RUN / Paychex files row by row, totals = approval, EXPORTED, identical re-export after a raise, staff app wages                                                                                                                                                                   | `api-payroll-export.spec.ts`       | TC-597..603         | Passing on QA (2026-10-06)                                                                         |
| 8   | Discount / comp / custom-item permissions (S2) and roles (S3) through the order API; manager PIN approval limit; exceptions summary                                                                                                                                                                                                                                           | `api-discount-permissions.spec.ts` | TC-604..610         | Passing on QA (2026-10-06)                                                                         |
| 9   | Service fee (S1): off by default, rate, counter claim (right / short / legacy POS), minimum, order types, channels (POS vs online quote), taxable, HOUSE/STAFF frozen, device can't edit, clamping                                                                                                                                                                            | `api-service-fee.spec.ts`          | TC-611..617         | Passing on QA (2026-10-06)                                                                         |
| 10  | Sales tax (R2) several rates + tax-free item, quote, report + CSV per rate, rate change frozen; R1 sales-by-day CSV and A1 accounting day entry agree with the orders                                                                                                                                                                                                         | `api-sales-tax-reports.spec.ts`    | TC-619..624         | Passing on QA (2026-10-06)                                                                         |
| 11  | Gusto (P4/P5): probe whether QA's backend has Gusto configured; connect URL or a clear refusal                                                                                                                                                                                                                                                                                | `api-payroll-gusto.spec.ts`        | TC-625..627         | Blocked: QA Dokploy needs GUSTO vars (TC-625/627 pass, TC-626 skips)                               |
| 12  | Dashboard UI: Staff tabs follow SCHEDULING / PAYROLL, roles, jobs, payroll modes, gated deep link                                                                                                                                                                                                                                                                             | `21-back-office-staff-ui.spec.ts`  | TC-628..634         | Passing on QA (2026-10-06)                                                                         |
| 13  | Basic breaks with no add-on: break types on the time clock, owner edits them (`/staff/break-types`), start/end, unpaid excluded from hours / paid included, rules ignored without TIMECARDS and enforced with it                                                                                                                                                              | `api-free-breaks.spec.ts`          | TC-637..641         | see PR #85                                                                                         |
| 14  | "Clocks in" off: `tracksTime` PATCH (non-boolean 400), staff app flag, clock-in rule never blocks, no attendance, no schedule cost, out of timecards/labor/export, tips still count hours, back on                                                                                                                                                                            | `api-clocks-in.spec.ts`            | TC-642..646         | see PR #85                                                                                         |
| 15  | POS screen loads never 403: capabilities catalogue (no role catalogue for non-managers), host stand view-only without contacts, writes refused; safe opens with a MANAGE_SAFE approval token only                                                                                                                                                                             | `api-pos-screen-loads.spec.ts`     | TC-647..649         | see PR #85                                                                                         |

### Settings tested for their effect

| Setting                                                                                           | Test                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Role permissions (custom role, role edit)                                                         | TC-553, TC-559, TC-609              |
| Job default rate vs personal rate                                                                 | TC-557, TC-570, TC-582              |
| `clockInRule` OFF / WARN / BLOCK, `earlyClockInMinutes`                                           | TC-566, TC-576                      |
| `minRestHours` (8 → 0)                                                                            | TC-572                              |
| `notifyByEmail`                                                                                   | TC-572                              |
| Publish notify mode CHANGED / NONE                                                                | TC-573, TC-574                      |
| `timeOffMinNoticeDays`, `timeOffBlackouts`                                                        | TC-577                              |
| `availabilityNeedsApproval`, `shiftChangesNeedApproval`                                           | TC-578 (+ TC-549/550 with approval) |
| `showPayToStaff`                                                                                  | TC-579, TC-586                      |
| Overtime preset FEDERAL / CALIFORNIA / CUSTOM                                                     | TC-581                              |
| Break types, rules (`afterHours`, waivable), `convertPaidOverageToUnpaid`                         | TC-583, TC-584                      |
| Pay frequency WEEKLY + anchor                                                                     | TC-580..587, TC-597..603            |
| Tip pool on/off, points, BY_HOURS / EQUAL, contributors (% tips, % sales), tip credit, managerial | TC-588..594                         |
| Export settings (ADP company + earning codes, Paychex client + components, payroll ID, job code)  | TC-598..600                         |
| POS approval policy (allowance %, custom items, required reasons)                                 | TC-605, TC-607, TC-608              |
| Service fee (enabled, percent, minimum, types, channels, taxable, distribution)                   | TC-611..617                         |
| Tax rates (default, coded, exempt, rate change)                                                   | TC-619..622                         |

### Not covered end to end (and why)

- **Card-fee withholding from tips** (P2): needs a _captured card tip_; QA can
  only produce one through Stripe Terminal hardware or a Connect-onboarded
  storefront checkout. The engine math is unit-tested in restaunax
  (`tipEngine`). Same for "tips paid in the paycheck" amounts from card
  orders: the export spec covers declared cash in an approved period.
- **Tips in an approved pay period from orders**: order tips land on today's
  business day, and a period can only be approved once it's over.
- **Gusto connection / RestauNax Payroll runs**: only if QA's Dokploy has the
  GUSTO\_\* variables (TC-625 reports it; TC-626/627 branch on it).
- **HOME_FOOD trimming**: TC-635 covers the owner catalogue and purchase
  refusal; an admin override deliberately still grants (the documented
  escape hatch), so QA can't show the trim of a _plan_ feature.
- **UI flows** (publish from the grid, approve a period, approve a request with
  a note): the UI spec covers visibility and rendering; the flows are covered
  through the API they call.

### Product bugs found

- **B1 — owner-set PIN doesn't activate an invited person** — FIXED in
  restaunax #909; TC-618 now asserts the fix. `POST /restaurant/:rid/staff/:id/pin` on a pending email
  invitee answers 200 "PIN updated." but leaves `activatedAt` null, so the
  person is missing from the POS roster and sign-in says "The PIN you entered
  is incorrect." (`setStaffPinDirect` in `restaurantStaffService.ts` vs
  `eligibleCandidateWhere`, `activatedAt: { not: null }`). Either activate on
  an owner-set PIN (as POS-created staff are) or refuse with a clear message.
- **B2 — an approved early clock-in isn't linked to its shift** — FIXED in
  restaunax #909; TC-636 now asserts the fix. Under the BLOCK (or WARN) clock-in rule, an EARLY clock-in is
  stored with `clockInException: "EARLY"` but `scheduledShiftId: null`
  (`tabletStaffController.ts` clockIn: `scheduledShiftId = match.kind ===
"MATCHED" ? … : null`, although `match.shift` is known). Scheduled-vs-actual
  reads only linked clock-ins, so someone who came in early with a manager's
  approval shows as not in / no-show for the shift they're working. CI
  evidence: `{"clockInException":"EARLY","scheduledShiftId":null,"attendance":{"status":"UPCOMING","clockInAt":null}}`
  while the person is on the clock.

### Smaller findings (not failing tests)

- i18n: the staff invite email subject is hard-coded English
  (`restaurantStaffService.inviteStaff`, not `getEmailSubject`), and the
  portal/POS PIN and staff-manage responses carry English literals ("Enter the
  new PIN.", "PIN updated.", "You are not authorized to manage staff.",
  "Staff member updated.") — against restaunax's i18n rule.
- By design, a POS open check's food tax is the device's claim (a mismatch is
  only logged as `pos_tax_mismatch`), so a device that sends `tax: 0` on
  taxable items is accepted (the service fee's tax is still the server's).

## Running

```bash
npx playwright test --project=dashboard tests/dashboard/owner/api-staff-requests.spec.ts
# or on CI, for one area:
gh workflow run e2e.yml --ref <branch> -f grep="TC-5[4-9][0-9]|TC-6[0-3][0-9]" -f project=dashboard
```

Locally the Mailpit-dependent files need `MAILPIT_BASE_URL`,
`MAILPIT_UI_USER` and `MAILPIT_UI_PASSWORD` in `.env` (QA's Mailpit is behind
basic auth).
