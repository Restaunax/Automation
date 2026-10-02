# Physical Test Ledger

The maintained record of what Playwright/API automation **cannot** reach, because the behavior
lives in hardware, an OS-level gesture, a carrier SMS network, or a payment network's own
attestation flow — not in a REST response or a DOM node. Automation proves the software; this
ledger is how the _hardware_ gets proven, on the same release cadence.

**Why it exists**: this repo's coverage docs (`TEST_CASES.md`, `TEST_COVERAGE.md`, `TEST_PLAN.md`)
answer "what did we automate," which quietly implies everything else is untested. It isn't — it's
tested by hand, on real devices, and that testing needs the same discipline as a CI gate or it rots
silently. The rule this file enforces: **if it's not automated and not on this list, it isn't
tested.** A behavior that is neither covered by a spec file nor entered here has no test coverage
at all, full stop — that gap is a bug in this ledger, not an acceptable state.

**How to use it**: before cutting a production release (a Sunmi Partner Platform push, an App
Store/Play submission, or any build going to a restaurant's physical device — see
`device-in-store`'s `docs/DEPLOYMENT_STRATEGY.md` for the two delivery paths), walk every entry
below and run its manual procedure against real hardware. Treat a failed physical check exactly
like a failed CI check: it blocks the release until fixed or explicitly waived by whoever owns the
release. Log the run (device, date, result) whichever way this team currently tracks release
sign-off — that log lives outside this repo; this file only owns _what_ to check and _how_.

**Standing rule**: any new behavior that can only be verified physically — a new gesture, a new
piece of hardware, a new carrier/network dependency, a new OS-kiosk interaction — **must be added
to this ledger in the same PR that ships it**. Do not defer "I'll document it later"; a shipped
physical-only behavior with no ledger entry is the exact failure mode this file exists to prevent.

---

## 1. Card-present payment on a physical reader

- **What**: a real card (chip, tap, or swipe) is presented to a physical Stripe Terminal reader
  and the payment actually captures.
- **Why it's physical**: `card_present` PaymentIntents require a real reader talking to Stripe's
  terminal hardware attestation; there is no server-side or emulated equivalent for the actual tap/
  insert/swipe interaction on **this** repo's test surface today (see the deferred alternative
  below). Per reader path, each has its own physical quirk:
  - **M2 USB kiosk reader** — cold-boot USB permission grant (`ensureUsbReaderPermission`); a
    reader plugged in before the app requests permission silently never connects.
  - **T3 built-in tap-to-pay** — Apple/Google tap-to-pay attestation; as of the last fleet check,
    only 4 of 7 test devices pass attestation, and the patch window is rolling — a device that
    worked last release can fail this release with no code change on our side.
  - **Bluetooth / internet (WisePad / BBPOS-class) readers** — pairing state, battery, and
    reconnection after the app backgrounds.
- **Manual procedure**: for each reader class in the fleet, run one full happy-path charge (chip
  or tap, whichever the reader supports) plus one deliberately declined card, confirm the order's
  `OrderPayment` row lands `SUCCEEDED`/`FAILED` correctly, and confirm the receipt prints (see
  entry 2). For the T3, additionally confirm tap-to-pay attestation still passes on that specific
  physical unit — it is unit-specific, not fleet-wide.
- **When to re-run**: every production release; additionally any time a device's OS/security patch
  updates (attestation can silently break), a new reader model is introduced, or the Stripe
  Terminal SDK version bumps.
- **Future automation candidate (deliberately deferred)**: Stripe's simulated-reader test helper
  (`testHelpers.terminal.readers.presentPaymentMethod`) can drive a _simulated_ reader through the
  Terminal SDK without real hardware, which would let a `pos` spec exercise the create-intent →
  present → capture arc end to end. Deferred rather than built now because it still doesn't
  exercise the physical failure modes above (USB cold-boot, tap attestation, BT pairing) that are
  the actual source of field incidents — it would cover the software plumbing this repo's API-level
  specs (`pos/03-open-checks.spec.ts` TC-382, `pos/06-reservations-lifecycle.spec.ts`) already
  cover via create/cancel-intent assertions, at real cost (SDK wiring, CI runner support) for
  overlapping value. Worth revisiting if the physical incident rate on the plumbing side (not the
  hardware side) rises.

## 2. Kitchen-ticket & receipt printing

- **What**: an order actually prints, legibly, on the intended physical printer.
- **Why it's physical**: `device-in-store`'s printer stack spans the Sunmi built-in printer (AIDL
  service, buffered print calls — see that repo's CLAUDE.md on the buffer-deadlock history) and
  LAN ESC/POS printers on port 9100; nothing about paper feed, print head contact, cutter behavior,
  or actual character legibility survives a mocked print job.
- **Manual procedure**: for both print paths present in the fleet —
  - **Built-in Sunmi printer**: fire one kitchen ticket and one customer receipt from a live order;
    confirm no double-spacing (the AIDL `printText` already appends `\n`), confirm the print
    doesn't stall (buffered calls must not be `await`ed mid-transaction), and separately run
    Sunmi's own "Print Test" diagnostic if anything looks wrong.
  - **LAN 9100 printer(s)**: same two ticket types, confirm the correct printer role fires (a
    `kitchenTicket`-role printer should not receive `customerReceipt` content and vice versa — see
    `printRouter.ts`'s per-device config).
  - **Cutter behavior**: on any V3H unit (or any model confirmed not to support `cutPaper`),
    confirm a failed/unsupported cut does NOT block or corrupt the rest of the receipt.
  - **Ticket content spot-check**: read the physical ticket/receipt against the order — items,
    modifiers, prices, and (once Phase C2 ships) seat labels for dine-in tickets.
- **When to re-run**: every production release touching `printerService.ts`, `printerCompatibility.ts`,
  any adapter under `services/adapters/`, or `printRouter.ts`; any time a new printer model joins
  the fleet; any time the auto-fire designation (`TabletDevice.autoFireTickets`) logic changes.

## 3. Cash-drawer kick pulse

- **What**: opening a register session (or a cash tender) actually fires the electrical pulse that
  kicks the physical cash drawer open.
- **Why it's physical**: automation (`pos/08-register-cash.spec.ts`) asserts the **ledger** —
  `RegisterSession` open/close, `overShort`, cash-leg `OrderPayment` rows — never the drawer
  hardware itself. A passing API test proves the money math is right; it says nothing about whether
  the drawer physically opened.
- **Manual procedure**: on a REGISTER-mode device with a drawer wired in, open a register session
  and confirm the drawer kicks; take a cash payment on an open check and confirm it kicks again (if
  the fleet's config fires per-tender, not just per-open).
- **When to re-run**: every production release touching `registerService.ts` or the register open/
  cash-tender code paths; any time a device's drawer cable/kick-pulse wiring changes.

## 4. Kiosk lock-task / Sunmi Profile behavior

- **What**: a kiosk or register device boots into the locked, single-app state and stays there
  through a reboot, a crash, or an attempted exit.
- **Why it's physical**: this is Android + Sunmi Profile system behavior (`mLockTaskModeState=
LOCKED_SUNMI`), not app code — it can't be exercised without a real device power cycle. It also
  spans the one deliberately-manual escape hatch (the Temporary Exit Password) that must never be
  reachable except through the intended flow.
- **Manual procedure**: power-cycle a provisioned kiosk/register device and confirm it auto-
  relaunches into the app locked (no launcher, no notification shade reachable); confirm
  `android.settings.SETTINGS` remains unreachable from anywhere in the app (this is also asserted
  by a device-in-store test, but the _lock itself_ still needs a physical boot to prove); confirm
  the Temporary Exit Password is the only way out and that support still holds it.
- **When to re-run**: every production release; any time the Sunmi Profile config changes (App
  Settings, Default Startup, Kiosk Mode, Super Permissions); after any device factory reset or
  re-provisioning.

## 5. RN gesture feel — pinch/pan smoothness, tap reliability, double-tap zoom

- **What**: touch interactions on real glass feel correct — no dropped taps, no janky pinch/pan,
  no accidental double-tap-zoom triggering when a single tap was intended.
- **Why it's physical**: Maestro/Playwright-style automation drives _functional_ taps (does the
  right handler fire) but has no signal for _feel_ — frame timing under real touch input, the
  2026-08-26 tap-stealing bug class (a gesture recognizer higher in the tree swallowing a child's
  tap), or whether a pinch gesture tracks the finger smoothly on the actual GPU/digitizer combo of
  a given Sunmi unit.
- **Manual procedure**: on each device model in the fleet, pinch/pan the floor canvas
  (`FloorCanvas`) and confirm smooth tracking with no stutter; rapid-tap a control that sits near a
  scrollable/pannable region and confirm no taps are stolen; double-tap the floor canvas and
  confirm zoom behaves as intended (not as an accidental double-fire of a single-tap handler).
- **When to re-run**: every production release touching `FloorCanvas`, any gesture-handling
  component, or the RN gesture-handler/reanimated dependency versions; whenever a new device model
  joins the fleet (touch/digitizer characteristics vary by hardware).

## 6. OTA application mechanics

- **What**: an EAS OTA update actually reaches and applies to a device that's already running.
- **Why it's physical**: per the 2026-08-27 lesson, applying an OTA requires a **true cold start**
  — Sunmi's keep-alive behavior can mask a failed/stuck update by keeping the old JS bundle running
  indefinitely, so a device can _look_ updated (app is responsive) while still running stale code.
  This can't be verified from the EAS dashboard or a socket ping; it needs a physical power cycle.
- **Manual procedure**: publish an OTA update to the target channel/runtime version, then fully
  power off (not just background) a device on that channel, power it back on, and confirm the new
  bundle is what actually launches (check a version marker or a deliberately-changed screen
  element) — not just that the app opens.
- **When to re-run**: every OTA push intended to reach devices already in the field; any time the
  `runtimeVersion` policy or channel wiring changes (see `device-in-store` CLAUDE.md's OTA vs.
  Sunmi Partner Platform table — a version bump silently orphans prior updates).

## 7. Real SMS delivery

- **What**: an SMS (reservation confirmation, waitlist notify, OTP, etc.) actually arrives on a
  real phone.
- **Why it's physical**: by design, QA **logs SMS sends without actually sending them**
  (`ENABLE_SMS` is unset there) — automation can assert "the send was attempted with the right
  body/number" but cannot assert "a human's phone buzzed." Only production, with `ENABLE_SMS` set,
  sends for real, and that's not a target automation runs against.
- **Manual procedure**: on a controlled production or production-like number, trigger the SMS path
  under test (reservation confirm, waitlist notify) and confirm receipt on a real handset within
  the expected window, with correct content.
- **When to re-run**: any production release touching an SMS-sending code path; periodically as a
  spot-check even without a code change, since carrier-side delivery can silently degrade
  independent of our code.

## 8. Socket-driven live UI refresh

- **What**: a live event (`newOrder`, `orderStatusUpdate`, `deviceModeChanged`, etc.) actually
  refreshes the on-screen UI on a device that's just sitting there, without a manual reload.
- **Why it's physical/manual today**: today's API suites poll the backend directly and never
  render a screen, so they prove the event _fires_ server-side but not that a real device's socket
  client receives it and repaints. (Maestro can partially cover this later — flagged as a future
  candidate, not built yet.)
- **Manual procedure**: with a device sitting idle on the Orders/Floor screen, trigger the event
  from another client (place an order, change a device's mode from the dashboard) and confirm the
  first device's UI updates live, with no manual refresh and no visible reconnect flicker; also
  confirm behavior across the manual ~60s reconnect retry by toggling the device's network off/on.
- **When to re-run**: every production release touching `socketService.ts`, `useOrderSocket`, or
  any consumer of the socket events listed in `device-in-store`'s CLAUDE.md.

## 9. Owed C1 on-device checks (device-in-store)

Four checks from Phase C1's final review remain **currently owed** — carried here from
`device-in-store`'s `docs/OPERATIONS_LOG.md` so they don't get lost between repos. Clear them,
then delete this entry (or mark it done with the date) rather than letting it go stale:

1. **`uiautomator` phone-layout measurement at 360dp** — confirm the host-stand/floor controls
   measure correctly on the V3H's actual 360dp width, by dumping real bounds
   (`adb shell uiautomator dump`), not by eyeballing a screenshot.
2. **SVG floor-canvas pinch/pan feel** on real touch hardware (`FloorCanvas`, `react-native-svg` +
   gesture handling) — overlaps entry 5 above; do it once and let it satisfy both.
3. **Three-deep `Sheet` stacking** — confirm a Sheet opened from a Sheet opened from a Sheet still
   applies its own safe-area insets correctly and doesn't visually collapse or clip at that depth.
4. **Host-toggle tap target** — confirm the host-stand's mode/section toggle control has a
   comfortably tappable target on real hardware, not just a passing `minTouchTarget` token value.

## 10. Owner portal Tables & Floor — native drag-and-drop placement

- **What**: dragging a table chip out of the "Unplaced" tray and dropping it onto the floor canvas
  (`FloorCanvas`, react-konva) in the owner dashboard.
- **Why it's physical/manual**: this is a browser test-infrastructure limitation, not a portal bug
  — confirmed during Task 4 (`tests/dashboard/owner/18-tables-floor.spec.ts`, TC-436), both headless
  and headed, against live QA. Chromium's CDP-driven synthetic mouse events don't initiate native
  HTML5 drag negotiation (`dragstart` never fires) for a plain `draggable` element; this is a known
  Playwright/CDP gap. `placeTableFromTray` makes a real, honest attempt at the native drag
  (mousedown → move → mouseup) before falling back to the equally first-class click-to-place path
  that `UnplacedTray.tsx` itself documents ("Click a table to place it on the floor, or drag it onto
  the canvas") — every automated run exercises click-to-place, never the drag gesture itself, and
  `console.warn`s on every fallback so a future Playwright/Chromium fix would be visible in CI logs.
- **Manual procedure**: on a real desktop/laptop browser (not through CDP automation), open Tables &
  Floor with at least one unplaced table, drag its tray chip onto the canvas with a real mouse, and
  confirm it places at the drop point and persists on reload.
- **When to re-run**: every production release touching `FloorCanvas.tsx`, `UnplacedTray.tsx`, or
  the drag-and-drop wiring between them; re-check whether the Playwright/CDP gap has closed on any
  Playwright/Chromium upgrade (if it has, TC-436 should be upgraded to assert the real drag and this
  entry retired).

---

## 11. Physical gift cards — the print run and the card in hand

- **What**: a `physical-gift-card` supply-shop order goes to the printer with the batch CSV
  (`Card export`), the cards come back with the number and a Code-128 barcode on the back, and a
  card from the box (a) types in at a register and loads, (b) scans on a USB scanner / the V3H
  camera, (c) redeems at checkout.
- **Why it's physical**: everything up to the CSV is automated (TC-446–483). The printer's
  personalisation — barcode symbology, placement, quiet zone, the readable number beneath it —
  and the scanner's read of that print exist only on plastic. A CSV that is right and a card
  that does not scan is the failure mode that costs a whole run.
- **How**: after the first run from the preferred supplier (Continental BizMag — see the shop's
  supplier directory) arrives: pick three cards from different parts of the box; for each,
  `GET /api/gift-cards/balance/<printed number>` must return `INACTIVE`; scan the barcode with a
  USB scanner in keyboard mode into a text field — the typed string must equal the number under
  it; then load one at a register by cash, redeem it at checkout, and void one load the same day.
  Card-vs-barcode mismatches or a non-scanning symbol block the batch, not the release.

## Known findings awaiting product fixes

Not physical tests — these are real bugs discovered while building this arc's automation, recorded
here (rather than only in a task report) so they don't get lost. Clear an entry once the fix ships
and its regression coverage lands, the same discipline as the rest of this file.

- **Portal accessibility bug: an error Snackbar rendered while a `SideSheet` (Drawer-based form)
  stays open is `aria-hidden` and invisible to assistive tech.** Found live during Task 4
  (`tests/dashboard/owner/19-reservations.spec.ts`, TC-443's turn-time overlap case). MUI's Modal
  marks everything outside an open modal `aria-hidden="true"` for focus-trapping, but the app's
  single global Snackbar (`StandaloneTabPage`) mounts outside the Drawer's own subtree at the page
  root — so an error toast that should tell the owner what went wrong is invisible to a screen
  reader (and to Playwright's `getByRole("alert")`) for as long as the sheet stays open on a failed
  save. Not turn-time-specific: any Drawer/SideSheet form whose error path leaves the sheet open
  (table name conflict, section name conflict, service-period time-invalid, table capacity invalid,
  etc. — anything using `SectionFormSheet`/`TableFormSheet`/`ServicePeriodFormSheet`/
  `TurnTimeFormSheet`) inherits the same bug. Fix suggestion: render the Snackbar inside each
  Drawer's own subtree (or a portal unaffected by the modal's `aria-hidden` sweep), or close the
  sheet before/alongside showing the error toast the way dialogs elsewhere in the app do. The one
  test that hits it (`turnTimeOverlapSnackbar()` in `OwnerReservationsPage.ts`) is deliberately
  scoped by CSS class instead of role, with a comment explaining why role-based lookup is broken
  here — a workaround, not a fix.

---

## Covered elsewhere, not physical

Listed here only so nobody re-adds these as ledger entries or, worse, forgets they exist because
they don't show up in either this file's list or the obvious spec file:

- **The double-ticket client race** — covered by `device-in-store`'s Jest suite
  (`src/context/__tests__/placeOpenCheck.test.tsx`), not by this repo or by hand. Not physical: it's
  a pure client-state race, fully reproducible in a JS test environment.
- **The carried-over check** (an open table check from a prior business day still appears in
  `GET /orders/current` after the day rolls over) — covered by backend Vitest in the `restaunax`
  repo, landing with RestauNax PR #672. Not physical: server-side state machine logic, no
  hardware involved.
- **`RESERVED_SOON` floor-state derivation** — real, correct, derived code in
  `tableStateService.ts`, confirmed by reading the source during Task 3 of this arc, but
  **unreachable via the API** on this Phase A surface: every write path to `ReservationTable`
  (`reservationSeatService.ts`'s `seatReservation`) always transitions the reservation to SEATED in
  the same transaction, so there is no "assign without seating" verb to trigger the state from
  outside the process. `pos/06-reservations-lifecycle.spec.ts`'s TC-417 is `test.fixme`d with the
  full evidence chain rather than faked — listed here so the gap isn't silently rediscovered as
  "we forgot to test RESERVED_SOON." A future admin/god-mode "block this table for an upcoming
  party" verb would make this reachable and testable; nothing today does.
