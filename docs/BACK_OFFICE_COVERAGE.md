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

| #   | Area                                                                                                                                                                                                                                                     | Spec                                               | TCs         | Status                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------- | ------------------------------- |
| 1   | Restaunax Staff requests: time off (rules, inbox, approve, week warning), availability (approve, week overlay), release → pick up → approve, walls (staff can't open the inbox, can't withdraw a coworker's request, other restaurants 404), owner email | `tests/dashboard/owner/api-staff-requests.spec.ts` | TC-543..552 | Passing on QA (CI 2026-10-06)   |
| 2   | Scheduling: build and publish a week, staff are emailed, the staff app shows it, warnings (overlap, no rate)                                                                                                                                             | `api-scheduling.spec.ts`                           | —           | Next                            |
| 3   | Timecards and pay periods: punch edits, approve, export file totals = approval                                                                                                                                                                           | —                                                  | —           | Planned                         |
| 4   | Tips: pool rules, card-fee withholding, cash declarations                                                                                                                                                                                                | —                                                  | —           | Planned                         |
| 5   | Service fee on every ticket; roles; manager-only discounts refused for staff                                                                                                                                                                             | —                                                  | —           | Planned                         |
| 6   | Sales tax (several rates, tax-exempt) and report CSVs                                                                                                                                                                                                    | —                                                  | —           | Planned                         |
| 7   | Gusto connection and RestauNax Payroll against Gusto's demo                                                                                                                                                                                              | —                                                  | —           | Needs the Gusto demo keys on QA |
| 8   | UI: Staff → Requests (approve with a note), schedule markers, settings                                                                                                                                                                                   | —                                                  | —           | After 1–2                       |

## Running

```bash
npx playwright test --project=dashboard tests/dashboard/owner/api-staff-requests.spec.ts
# or on CI, for one area:
gh workflow run e2e.yml --ref <branch> -f grep="TC-54[3-9]|TC-55[0-2]" -f project=dashboard
```

Locally the Mailpit-dependent files need `MAILPIT_BASE_URL`,
`MAILPIT_UI_USER` and `MAILPIT_UI_PASSWORD` in `.env` (QA's Mailpit is behind
basic auth).
