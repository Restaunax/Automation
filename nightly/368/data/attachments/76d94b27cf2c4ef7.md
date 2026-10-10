# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/11-deals.spec.ts >> Owner — Deals >> schedule >> TC-528: both chip rows are always visible — Weekdays/Weekends + day chips, Any time / meal periods with their server hours / Happy hour / Custom; presets fill the pickers, Any time hides them; the summary names days, hours and zone; meal type is not in Extra details
- Location: tests/dashboard/owner/11-deals.spec.ts:1098:9

# Error details

```
Error: Dashboard deal-schedule UI (restaunax Plan 2) is not on QA yet — no schedule section in the deal form

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1  | /**
  2  |  * dealScheduleGate.ts — deploy gates for the deal-scheduling specs.
  3  |  *
  4  |  * These specs land before (or while) the restaunax / template-wind /
  5  |  * template-lima changes they exercise reach QA. While a part's flag is false
  6  |  * its tests SKIP with a reason (deploy lag is not a product failure). Once the
  7  |  * part is confirmed on QA, flip its flag to true: the same call then FAILS
  8  |  * when the capability is missing, so a regression can't hide as a skip.
  9  |  */
  10 | import { test, expect } from "../fixtures/base";
  11 | 
  12 | export const SCHEDULING_ON_QA = {
  13 |   /** restaunax Plan 1 — /active carries `timeZone`. */
  14 |   backend: true,
  15 |   /** restaunax Plan 2 — the deal form has the schedule section. */
  16 |   dashboard: true,
  17 |   /** Plan 4 — template-wind renders deal-schedule-summary. */
  18 |   wind: true,
  19 |   /** Plan 4 — template-lima renders deal-schedule-summary + sends dealItemId. */
  20 |   lima: true,
  21 | };
  22 | 
  23 | export type SchedulingPart = keyof typeof SCHEDULING_ON_QA;
  24 | 
  25 | const REASON: Record<SchedulingPart, string> = {
  26 |   backend:
  27 |     "Deal scheduling backend (restaunax Plan 1) is not on QA yet — /active has no timeZone",
  28 |   dashboard:
  29 |     "Dashboard deal-schedule UI (restaunax Plan 2) is not on QA yet — no schedule section in the deal form",
  30 |   wind: "template-wind deal-schedule UI (Plan 4) is not on QA yet — no deal-schedule-summary on the deal card",
  31 |   lima: "template-lima deal-schedule UI (Plan 4) is not on QA yet — no deal-schedule-summary / dealItemId",
  32 | };
  33 | 
  34 | /** Skip (flag off) or fail (flag on) when `present` is false. */
  35 | export function requireScheduling(
  36 |   part: SchedulingPart,
  37 |   present: boolean
  38 | ): void {
  39 |   if (SCHEDULING_ON_QA[part]) {
> 40 |     expect(present, REASON[part]).toBe(true);
     |                                   ^ Error: Dashboard deal-schedule UI (restaunax Plan 2) is not on QA yet — no schedule section in the deal form
  41 |     return;
  42 |   }
  43 |   test.skip(!present, REASON[part]);
  44 | }
  45 | 
```