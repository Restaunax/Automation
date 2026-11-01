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

| #   | Area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Spec                               | TCs                 | Status                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Restaunax Staff requests: time off, availability, release → pick up → approve, walls, owner email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `api-staff-requests.spec.ts`       | TC-543..552         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 2   | Hiring: invite → email → register with the invite → on the staff list → job + own wage → role on the POS (Staff refused, custom role, role edit live) → guards (no self-edit, no escalation) → Restaunax Staff `/me` → deactivation closes POS + staff app; single-use invite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `api-staff-hiring.spec.ts`         | TC-553..562, TC-618 | Passing on QA (2026-10-06); TC-618 asserts the B1 fix (#909)                                                                                                                  |
| 3   | Add-on gating (packaging v2): none → SCHEDULING → SCHEDULING+TIP_MANAGEMENT → TIP_MANAGEMENT alone → PAYROLL alone (Tip Management shown INCLUDED, not addable) → none, across owner API, dashboard + POS feature sets, POS time clock (free breaks, job picker, clock-in rule), staff app; TIMECARDS refused as a component; HOME_FOOD                                                                                                                                                                                                                                                                                                                                                                                                                        | `api-addon-gating.spec.ts`         | TC-563..569, TC-635 | Passing on QA (2026-10-07)                                                                                                                                                    |
| 4   | Scheduling: costed week in cents (personal rate, unpaid break, open shift), projected overtime, warnings (overlap, job not held, short rest, can't notify), publish + emails, staff app sees published only, edit after publish, copy week as open (DST), clock-in rule BLOCK/WARN/early window/OFF with manager PIN, time-off notice + blackouts, approval toggles, show pay                                                                                                                                                                                                                                                                                                                                                                                  | `api-scheduling.spec.ts`           | TC-570..579, TC-636 | Passing on QA (2026-10-06); TC-576/TC-636 move the restaurant to a zone where it is noon (owner timezone override), so they run at any hour; TC-636 asserts the B2 fix (#909) |
| 5   | Timecards & pay periods: blended-rate overtime ($760.00), FEDERAL/CALIFORNIA/CUSTOM, raise never re-prices, breaks (unpaid meal, paid rest, overage conversion), missed break blocks approval until reviewed, approve locks, reopen needs reason, labor report + CSV, staff app hours before / pay after approval, POS job picker + breaks                                                                                                                                                                                                                                                                                                                                                                                                                     | `api-timecards.spec.ts`            | TC-580..587         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 6   | Tips: no pool, pool by points × hours, EQUAL, tip-out % of tips, % of sales, legal guards, managerial-after-save, declared cash (never pooled, supersedes), tips CSV — exact cents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `api-tips.spec.ts`                 | TC-588..596         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 7   | Payroll export: only approved periods, preview warnings per format, RestauNax / Gusto / ADP RUN / Paychex files row by row, totals = approval, EXPORTED, identical re-export after a raise, staff app wages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `api-payroll-export.spec.ts`       | TC-597..603         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 8   | Discount / comp / custom-item permissions (S2) and roles (S3) through the order API; manager PIN approval limit; exceptions summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `api-discount-permissions.spec.ts` | TC-604..610         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 9   | Service fee (S1): off by default, rate, counter claim (right / short / legacy POS), minimum, order types, channels (POS vs online quote), taxable, HOUSE/STAFF frozen, device can't edit, clamping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `api-service-fee.spec.ts`          | TC-611..617         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 10  | Sales tax (R2) several rates + tax-free item, quote, report + CSV per rate, rate change frozen; R1 sales-by-day CSV and A1 accounting day entry agree with the orders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `api-sales-tax-reports.spec.ts`    | TC-619..624         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 11  | Gusto (P4/P5): probe whether QA's backend has Gusto configured; connect URL or a clear refusal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `api-payroll-gusto.spec.ts`        | TC-625..627         | Blocked: QA Dokploy needs GUSTO vars (TC-625/627 pass, TC-626 skips)                                                                                                          |
| 12  | Dashboard UI: Staff tabs follow SCHEDULING / PAYROLL, roles, jobs, payroll modes, gated deep link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `21-back-office-staff-ui.spec.ts`  | TC-628..634         | Passing on QA (2026-10-06)                                                                                                                                                    |
| 13  | Basic breaks with no add-on: break types on the time clock, owner edits them (`/staff/break-types`), start/end, unpaid excluded from hours / paid included, rules ignored without TIMECARDS and enforced with it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `api-free-breaks.spec.ts`          | TC-637..641         | Passing on QA (2026-10-07)                                                                                                                                                    |
| 14  | "Clocks in" off: `tracksTime` PATCH (non-boolean 400), staff app flag, clock-in rule never blocks, no attendance, no schedule cost, out of timecards/labor/export, tips still count hours, back on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `api-clocks-in.spec.ts`            | TC-642..646         | Passing on QA (2026-10-07)                                                                                                                                                    |
| 15  | POS screen loads never 403: capabilities catalogue (no role catalogue for non-managers), host stand view-only without contacts, writes refused; safe opens with a MANAGE_SAFE approval token only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `api-pos-screen-loads.spec.ts`     | TC-647..649         | Passing on QA (2026-10-07)                                                                                                                                                    |
| 16  | UX-audit fixes (restaunax #913): "Get started" checklist ticks from real data; clock-in approved by a signed-in manager's session (refused for a Staff session); time-clock `hasPin` + `activeShift.jobName`; Spanish invite (subject/body, 7-day expiry, language kept); POS schedule for another day read-only; `tracksTime` from the POS; `hasAccount`; default discount/comp/void reasons EN/ES, saved list wins, saved-empty stays empty, tablet gets them; account language saved; existing account claims its invite after sign-in (`staffAppEnabled`, `app`); account invite for an active person without an account; payroll-settings `location`; add-ons page sources (`RESTAUNAX`, `INCLUDED_WITH`); manager-approved drawer belongs to the cashier | `api-ux-audit.spec.ts`             | TC-651..663         | Passing on QA (2026-10-08)                                                                                                                                                    |
| 17  | UX-audit dashboard: Staff tab bar reaches every tab at 1024 and 390 px with no horizontal page scroll; Timecards opens the oldest unapproved period; the language choice survives a reload and is saved to the account                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `22-ux-audit-staff-ui.spec.ts`     | TC-664..666         | Passing on QA (2026-10-08)                                                                                                                                                    |
| 18  | Tip-out waterfall API (P6, restaunax #924): run order (`tipOutOrder`), §5 Saturday gave/received/net to the cent (cash tips — card tips can't be captured on QA), the §5 card-fee arithmetic through `POST /preview`, validation EN/ES (cycle, self, managerial, tip credit, >100%), no receivers on shift, not clocked in, two-job day, % of category sales, no rules, staff tip receipt (approved only / pay hidden / no Tip Management)                                                                                                                                                                                                                                                                                                                     | `api-tip-waterfall.spec.ts`        | TC-667..676         | Passing on QA (2026-10-09, 3f02e5216)                                                                                                                                         |
| 19  | Tip-out waterfall dashboard: Waterfall preset → rules + flow + live example in dollars → Save; Tips tab Gave/Received and "Where the tip-outs went"; 390 px cards                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `23-tip-waterfall-ui.spec.ts`      | TC-677..679         | Passing on QA (2026-10-09) after the header-locator fix; see B3                                                                                                               |

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

### B3 — quiet days fill the tip report's warning list (open)

On the Tips tab, "Look at these before you approve the pay period" lists
"Sat, Oct 3: nobody worked as Bartender, so Server kept that tip-out. If
someone did, fix their timecard." for **every day in the range**, including
days with no tips and nobody on the clock (QA, 2026-10-09: six days of
false notes for a restaurant whose only tips were today's). Nobody kept
anything on those days. Cause: `tipEngine.ts`, tip-out loop — when a rule
has no receivers it sets `run.skipped = "NO_RECEIVERS"` and adds
`TIP_OUT_NO_RECEIVERS` before looking at the givers, so the note appears
even when no giver holds anything in the rule's from-job. Expected: note
only when some giver's tip-out would have been above $0. Effect: the real
"fix this timecard" warnings are buried under noise.

### Tip-out waterfall: what QA can't show

- **Card tips**: a card leg is verified against Stripe, so the §5 day runs on
  cash tips (card fee $0); the 3% fee math is asserted through `/preview`,
  the real engine on a made-up card day.
- **Tip-outs inside an approved pay period**: today's tips can only be
  approved once the period is over, so the receipt test approves a finished
  week with declared cash; tip-out amounts in a snapshot / export / Gusto pay
  run are covered by restaunax `payPeriodMoney.int.test.ts`.

### Runs at any hour

Specs that need "hours already worked today" or "a shift later today" (tips,
TC-576/TC-636) move their throwaway restaurant to a zone where it is about
noon (`zoneAtMidday` + `restaurantBasicInfoRaw {timezone}`), so the 06:00 UTC
nightly runs them instead of skipping.

### Changed on purpose by restaunax #913 (tests updated)

- Restaunax Staff `/me` keeps a restaurant with no staff-app sections
  (`staffAppEnabled: false`, `staffWithoutAppSections`) — TC-565, TC-569.
- The staff app's pay-period job lines carry `overtimeRateCents` /
  `doubleTimeRateCents` — TC-602 asserts $22.50 for a $15.00 job.
- The invite subject now goes through the email i18n helper (the earlier
  "hard-coded English subject" finding is fixed); expiry is 7 days.

### Smaller findings (not failing tests)

- i18n: the staff invite email subject is hard-coded English
  (`restaurantStaffService.inviteStaff`, not `getEmailSubject`), and the
  portal/POS PIN and staff-manage responses carry English literals ("Enter the
  new PIN.", "PIN updated.", "You are not authorized to manage staff.",
  "Staff member updated.") — against restaunax's i18n rule.
- By design, a POS open check's food tax is the device's claim (a mismatch is
  only logged as `pos_tax_mismatch`), so a device that sends `tax: 0` on
  taxable items is accepted (the service fee's tax is still the server's).

## Pay at the table (restaunax #926)

Not back office, but table service, and the same throwaway-tenant pattern:
`tests/dashboard/owner/api-pay-at-table.spec.ts` (TC-680..690). Status:
**passing on QA** (2026-10-09, all 11; run 38020726009). The spec runs with
`retries: 0`: one pass makes ~35 public writes against the 60 / 15 min per-IP
limit, so a retry would hit 429. The tenant gets an ordering slug
(`ensureOrderingSlug`): without a website or slug there is no storefront URL
and the pay-at-table QR never prints (TC-680 asserts that too).

The guest's phone is played by the test: the public `/api/public/check-pay`
API plus Stripe's own API with the **publishable** key from
`/api/stripe/config` (create a card PaymentMethod from `tok_visa` /
`tok_visa_debit`, confirm the PaymentIntent with its client secret), exactly
what the storefront page does. The tenant gets a Stripe test Connect account
from the QA-only dummy onboarding (`/stripe/test-onboarding`), without which
`/intent` answers 409 `PAYMENTS_UNAVAILABLE`.

| TC  | What it proves                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 680 | Owner `GET/PUT /pay-at-table`: defaults, minimum clamped to $0.50..$100, sharing needs by-item, availability (table service + storefront URL)                                                                                                                                      |
| 681 | Owner `GET/PUT /receipt-qr-codes`: default order, 400 `TOO_MANY_ON_SLIP` (EN + ES), `URL_NOT_HTTPS`, `URL_NOT_GOOGLE`, `SOCIAL_URL_INVALID`; a valid list keeps the owner's order and drops slips a kind can't print on                                                            |
| 682 | POS `POST /api/tablet/orders/:id/receipt-qrs`: the owner's order, pay link + typed code only on the CHECK slip, same token on a reprint, no rewards on an unpaid check, 400 `RECEIPT_TYPE_INVALID`                                                                                 |
| 683 | The bill: totals (8% tax, 3% service fee, 18% auto-gratuity) = the order total, "additional" 3/5/7% tips, no PII / no payment ids, typed-code lookup (lower case, no dash), 404, 410 `DISABLED`                                                                                    |
| 684 | Quotes: everything, even split (3 ways sum to the cent), by item, a third of a shared pizza, an amount + tip; refusals `AMOUNT_TOO_SMALL`, 409 `AMOUNT_EXCEEDS_REMAINING` with the bill, `TIP_TOO_LARGE` (EN + ES), `TIP_NEEDS_CONFIRMATION`, `BAD_PARTS`, `MODE_NOT_ALLOWED` (ES) |
| 685 | The spec's $100 example to the cent: Ana $30 (+ tip) → each dish $17.50 (table credit $7.50) → Ben's dish → Cal even 2 ways $26.25 → Dee the rest $26.25 → closed at $100.00; table free                                                                                           |
| 686 | Card fee with pass-through on: credit carries 3% (capped) on the share, never the tip; debit's fee is dropped before authorizing and the captured amount is the share                                                                                                              |
| 687 | First to pay wins: two intents for "everything left", both authorized; one captured, the other's authorization cancelled; a paid check refuses new intents (`CHECK_CLOSED`); table free                                                                                            |
| 688 | Receipt email in Mailpit, EN and ES (`Accept-Language`), once per payment (`RECEIPT_ALREADY_SENT`), `EMAIL_INVALID`, `RECEIPTS_OFF`                                                                                                                                                |
| 689 | Reward claim: `NO_PROGRAM` → per-payment code on a split check (same code on repeat), the whole check's code for one payer, `REWARDS_OFF`                                                                                                                                          |
| 690 | After a phone pays for items: POS edit removing them 409 (`paidByPhoneEdit`), coupon 409 (`paidByPhoneDiscount`), a pizza split in thirds refuses halves (`SHARE_CHANGED`), adding a salad keeps the paid one paid, the rest closes the check; table free                          |

Not covered on QA: the Stripe webhook rung (a phone that authorizes and
leaves) and wallets (Apple Pay / Google Pay) — #926's integration tests cover
the webhook against a Stripe fake.

## Books & Taxes, partner API, accountant, add-on billing (restaunax #943)

Merged to `qa` on 2026-10-13 (B2 card deposits, B3 partner API, B5
accountant + tax calendar + year end, add-on billing G1/G4/G5/G6/G11). Same
throwaway-tenant pattern; the Books & Taxes add-on (`ACCOUNTING_SYNC`) is
granted by override. Status: **passing on QA** (2026-10-15: CI runs 38663159994 + 38663449414 — 37 passed, TC-768 an expected failure (F1), TC-773 skipped while no deposit is posted, TC-785..788 fixme).

| Spec                              | TCs                                                               | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-partner-api.spec.ts`         | TC-754..762                                                       | Free (no add-on): Connected apps catalogue in words; API key shown once, never listed; `/me`, `/locations`, `/days` (cents, OPEN v0, balanced journal), `/tax`, `/orders` (no customer name/phone/email), payments, payouts, labor, menu; another location → 404 on every endpoint both ways (same body as a made-up id); missing scope → 403 naming it; webhook URL rules (https, public, no credentials), events need their scope, secret once; `webhook.test` and `day.closed` (from a real dashboard day close) in the delivery log with the receiver's status/body and the 1-minute retry; day CLOSED v1; audit rows are route patterns; staff view + revoke but can't mint; another owner 403; revoke → 401 at once, deliveries stop                                                                                                                                                                                                                                                                                                                                                                                                  |
| `api-books-taxes.spec.ts`         | TC-763..771                                                       | Every books route 403 without the add-on, 200 with it; tax calendar items in date order with who handles each; "quarterly" adds the sales tax returns on the 20th (weekend → Monday); estimated-tax reminders off; bad answers 400; Spanish; year-end summary, years, bad year 400; the ZIP (README, PDF, 9 CSVs, names exact), README + PDF text say "worksheets, not a tax filing"; single PDF/CSV downloads, bad part 400; card deposits with no connection (empty, "up to date", header-only CSV, overview OFF → SETTING_UP once a test Stripe account exists)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `api-books-deposits-live.spec.ts` | TC-772..773 (`@books-live`)                                       | Rehearsal Kitchen (QA) on the QuickBooks sandbox, **read-only**: each deposit's entry balances, bank line = payout, doc number = `RNXD-yymmdd-<payout>`, CSV lists them; "Post" on an already-posted deposit posts nothing new (skips while none is posted). Exclude with `--grep-invert @books-live`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `api-accountant-access.spec.ts`   | TC-774..780 (`@email`)                                            | Invite validation; invite → PENDING + Mailpit email; claim → a plain `USER` (no restaurants owned) that lists exactly this client; the `/accountant` workspace in the browser with no 401/403; reads overview, sales tax + CSV, tips, year end + ZIP; 11 writes refused; another restaurant 404 like a made-up id; add-on off → list still 200 (`available: false`), numbers 403 with the reason; revoke → 404 on the next request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `api-books-exports.spec.ts` | TC-1330..1337 | W2:S1/A11/A8: new routes 403 without the add-on; Simple six-account preset on/off (+ Recent changes); QuickBooks Online and Xero file headers exact, no BOM, US dates; days marked exported; export check; deposits in the QuickBooks layout; sales summary ties (JSON + CSV); sales-by-day CSV columns |
| `api-accountant-multi-client.spec.ts` | TC-1338..1343 (`@email`) | W2:A10: one accountant invited by two owners; reads each client's books (settings, accounts, days, entry, deposits, sales summary, files); every write 403 under /api/accountant and 404 on owner routes; other client 404; revoke closes one client; browser tabs with no 401/403 |
| `api-employer-group.spec.ts` | TC-1400..1409 | W3:C4 (D2): /api/employers 401 signed out; EIN last-4 / pay frequency / name validation; owner groups own restaurants only (others 404), ALREADY_GROUPED, another owner 404; people suggestion by account, link, unlink; member settings read-only (403 SET_BY_EMPLOYER, data.employer), /payroll/:rid/employer; delete refused with a policy, retired too; EMPLOYEE read-only |
| `api-employer-overtime.spec.ts` | TC-1410..1412 | W3:C4: combined workweek across two locations of one employer: 25 h + 25 h → 10 h overtime credited to the later location ($150.00 premium); unlinked records don't combine; deleting the group ends it |
| `api-time-off-accrual.spec.ts` | TC-1413..1418 | W3:H5: CA sick-leave rule suggested, never auto-applied; DRAFT_RULE until acknowledgeDraft; custom PTO, POLICY_EXISTS, INVALID; owner balances and Staff app balances shapes; retire brings the suggestion back; unknown policy 404 |
| `api-addon-billing.spec.ts`       | TC-781..784, TC-894..896, TC-786, TC-787 (+ TC-785, TC-788 fixme) | Since restaunax #998 owners REQUEST add-ons and HQ does it: rows carry every G11 field plus `canRequestAdd`/`canRequestRemove`/`pendingAdd`/`pendingRemove` (no `canAdd`/`canKeep`/`canRemove`), every active catalog add-on requestable, no price → "talk to us"; the old owner POST/DELETE are 404; request refusals in words (invalid, unknown add-on 404, remove what is not on, unknown request 404, another owner 403, HQ list 403 for owners); request → asking again returns the open one → HQ list (note, who asked) → owner cancels (409 twice, HQ fulfil 409); a failed Attach (no subscription) leaves it OPEN, Mark done closes it, support alert + owner email in Mailpit; on the SEED (ACTIVE subscription): Menu TVs request → HQ Attach with "Start the free trial" → on, DONE, owner email; removal request → scheduled for the period end, still on → "keep it" request → kept; Team bundle request replaces separately attached Scheduling + Tip Management; every seed add-on detached right after. Team bundle override grants Scheduling + Tip Management (+ Timecards); HQ payroll headcount month view (owner 403) |
| `24-books-gating-ui.spec.ts`      | TC-789..791, TC-897                                               | No Books & taxes sidebar item without the add-on (not a locked one), Connected apps loads; with it, all six sections open; removed → gone, deep link shows "Not part of this restaurant's plan" with the "request it in Billing → Add-ons" copy (#998; "add it from" before); seed owner: Go to Add-ons → Request this add-on (note) → "Request sent …" → Cancel request; no 401/403 on any load                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Not covered on QA (and why)

- **Trials and the payroll card** (TC-785, TC-788, `test.fixme`): no add-on
  in QA's catalog has `trialDays` (`prisma/scripts/create-back-office-addons.ts
--yes` not run on QA), and a trial is once per feature, so the seed
  restaurant — the only QA restaurant with an ACTIVE subscription; a
  throwaway can't get one (Stripe won't let a platform accept the Express
  ToS) — could run it once ever. The payroll card also needs a per-person
  price and QA Gusto Embedded keys. TC-896 asserts the trial whenever QA's
  catalog offers one. restaunax `addonRequests.int.test.ts` /
  `addonBilling.int.test.ts` cover them against an in-memory Stripe. Removal
  at the period end, "keep it" and the bundle swap are no longer blocked
  (restaunax #998 removed the self-serve flag; HQ attaches on the seed):
  TC-786, TC-787.
- **Co-owner and chain-owner requests**: no co-owner fixture in the suite;
  restaunax `ownerAddons.test.ts` / `addonRequests.int.test.ts` cover them.
- **Webhook signature**: no request-capture service in the suite and no
  third-party bin added; the receiver is an unrouted QA API path, so the
  delivery log proves delivery but not the `RestauNax-Signature` header.
  Verifying it needs a receiver that echoes headers (e.g. a tiny route on
  QA, or httpbin.org/anything — a new third-party dependency).
- **The OAuth consent flow** (HQ-registered partner, Allow/Deny, code
  exchange, refresh rotation): not exercised; it would register a partner app
  in HQ → Finance → Partners on every run. Integration-tested in restaunax.
- **Posting a new deposit to QuickBooks**: Rehearsal Kitchen is read-only
  here; posting would write to the sandbox company.
- **Reminder emails** (tax calendar 7/1 days, Jan 10, trial reminder) run on
  daily sweeps and can't be triggered by API.

### Product findings (#943)

- **F1 — the year-end CSVs don't say "not a tax filing"** (TC-768,
  `test.fail`). The doc says every file does; README and PDF do, the nine
  CSVs don't: `sectionCsv` is `toCsv(section.rows)`
  (restaunax `yearEndPackage.ts:378`). Fix: append a last row with
  `t("api:yearEnd.footer")` to each section (or in `sectionCsv`).
- **F2 — HQ "Count again" answers 500 for a location without a payroll
  connection.** `POST /api/admin/addons/payroll-headcount/:rid/refresh` →
  500 `PAYROLL_PROVIDER_FAILED` ("not connected") and a SystemError row
  (`adminAddonController.ts:909-945`, the catch-all `serverError`). Expected
  a 409/400 with the same sentence and no system log.
- **F4 — Rehearsal Kitchen's deposits stay "Accounts needed"** (observation,
  not a failing test). Its mapping has `deposit:bank` (Checking),
  `deposit:card_fees` and `deposit:delivery_costs`, yet all 10 deposits read
  `MAPPING_NEEDED` with those keys in `missingKeys`, and Books & taxes still
  says "pick your bank account and the account for card fees" (seen
  00:24–01:05 UTC, 2026-10-15). The hourly `sweepDeposits`
  (`depositService.ts:527`) should rebuild them and auto-post. Either the
  mapping was set within that hour or the sweep isn't reaching them — look
  for `accounting_deposit_sweep_failed` in Loki before calling it a bug.
- **F3 — gated deep link wording**: `?tab=books-taxes` without the add-on
  says "This feature isn't available for the selected restaurant's setup.
  Switch to a different restaurant…" — for an add-on, pointing at
  Billing → Add-ons would be the useful answer.

## Running

```bash
npx playwright test --project=dashboard tests/dashboard/owner/api-staff-requests.spec.ts
# or on CI, for one area:
gh workflow run e2e.yml --ref <branch> -f grep="TC-5[4-9][0-9]|TC-6[0-3][0-9]" -f project=dashboard
```

Locally the Mailpit-dependent files need `MAILPIT_BASE_URL`,
`MAILPIT_UI_USER` and `MAILPIT_UI_PASSWORD` in `.env` (QA's Mailpit is behind
basic auth).
