# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-scheduling.spec.ts >> Scheduling — build, cost, warn, publish, clock-in rule (API) >> TC-575: copy a week as open shifts
- Location: tests/dashboard/owner/api-scheduling.spec.ts:468:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Array [
-   18,
-   18,
+   19,
    19,
+   20,
  ]
```

# Test source

```ts
  388 | 
  389 |     const mine = await staffAppRaw<{ data: Rec[] }>(
  390 |       dee.token,
  391 |       "GET",
  392 |       `/schedule?from=${at(w1, "00:00")}&to=${at(addDays(w1, 8), "00:00")}`
  393 |     );
  394 |     expect(mine.status).toBe(200);
  395 |     expect(mine.data.data.map((s) => s.id)).toEqual([ids.deeD1]);
  396 |     expect(mine.data.data[0]).toMatchObject({
  397 |       restaurantId,
  398 |       breakMinutes: 30,
  399 |       startAt: at(addDays(w1, 1), "18:00"),
  400 |     });
  401 | 
  402 |     for (const p of [dee, eve]) {
  403 |       const mail = await waitForEmail(p.email, {
  404 |         subjectPattern: /^Your schedule at /,
  405 |         timeoutMs: 90_000,
  406 |       });
  407 |       expect(mail.subject).toContain(restaurantName);
  408 |     }
  409 |     await removeShift(draft);
  410 |   });
  411 | 
  412 |   test("TC-574: editing a published shift keeps what staff were told until it's republished @email", async () => {
  413 |     const edited = await schedulingRaw(
  414 |       ownerToken,
  415 |       restaurantId,
  416 |       "PATCH",
  417 |       `/shifts/${ids.deeD1}`,
  418 |       {
  419 |         startAt: at(addDays(w1, 1), "19:00"),
  420 |         endAt: at(addDays(w1, 1), "23:00"),
  421 |       }
  422 |     );
  423 |     expect(edited.status, JSON.stringify(edited.data)).toBe(200);
  424 |     let w = await week(w1);
  425 |     const s = list(w.shifts).find((x) => x.id === ids.deeD1);
  426 |     expect(s?.pending).toBe(true);
  427 |     expect(new Date(s?.published.startAt).toISOString()).toBe(
  428 |       at(addDays(w1, 1), "18:00")
  429 |     );
  430 |     const range = `/schedule?from=${at(w1, "00:00")}&to=${at(addDays(w1, 8), "00:00")}`;
  431 |     let mine = await staffAppRaw<{ data: Rec[] }>(dee.token, "GET", range);
  432 |     expect(new Date(mine.data.data[0]?.startAt).toISOString()).toBe(
  433 |       at(addDays(w1, 1), "18:00")
  434 |     );
  435 | 
  436 |     const pub = await publishScheduleRaw(
  437 |       ownerToken,
  438 |       restaurantId,
  439 |       w1,
  440 |       "CHANGED"
  441 |     );
  442 |     expect(pub.data.data).toMatchObject({ published: 1, notified: 1 });
  443 |     w = await week(w1);
  444 |     expect(w.pendingCount).toBe(0);
  445 |     mine = await staffAppRaw<{ data: Rec[] }>(dee.token, "GET", range);
  446 |     expect(new Date(mine.data.data[0]?.startAt).toISOString()).toBe(
  447 |       at(addDays(w1, 1), "19:00")
  448 |     );
  449 |     const mail = await waitForEmail(dee.email, {
  450 |       subjectPattern: /^Schedule change at /,
  451 |       timeoutMs: 90_000,
  452 |     });
  453 |     expect(mail.subject).toContain(restaurantName);
  454 | 
  455 |     // "Nobody" publishes without telling anyone.
  456 |     const quiet = await schedulingRaw(
  457 |       ownerToken,
  458 |       restaurantId,
  459 |       "PATCH",
  460 |       `/shifts/${ids.eveD2}`,
  461 |       { breakMinutes: 15 }
  462 |     );
  463 |     expect(quiet.status).toBe(200);
  464 |     const none = await publishScheduleRaw(ownerToken, restaurantId, w1, "NONE");
  465 |     expect(none.data.data).toMatchObject({ published: 1, notified: 0 });
  466 |   });
  467 | 
  468 |   test("TC-575: copy a week as open shifts", async () => {
  469 |     const r = await schedulingRaw(
  470 |       ownerToken,
  471 |       restaurantId,
  472 |       "POST",
  473 |       "/copy-week",
  474 |       {
  475 |         fromDate: w1,
  476 |         toDate: w3,
  477 |         asOpen: true,
  478 |       }
  479 |     );
  480 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  481 |     const w = await week(w3);
  482 |     const shifts = list(w.shifts);
  483 |     expect(shifts).toHaveLength(3);
  484 |     expect(shifts.every((s) => s.staffMemberId === null)).toBe(true);
  485 |     expect(shifts.every((s) => s.pending)).toBe(true);
  486 |     // Same weekday and time, two weeks on.
  487 |     const times = shifts.map((s) => new Date(s.startAt).getUTCHours()).sort();
> 488 |     expect(times).toEqual([18, 18, 19]);
      |                   ^ Error: expect(received).toEqual(expected) // deep equality
  489 |   });
  490 | 
  491 |   test("TC-576: clock-in rule on the POS — BLOCK needs a manager, WARN flags, the early window and OFF", async () => {
  492 |     // A shift starting in an hour, today. Too close to local midnight and
  493 |     // "today" would end before it starts.
  494 |     const localHour = Number(
  495 |       new Intl.DateTimeFormat("en-US", {
  496 |         timeZone: "America/New_York",
  497 |         hour: "numeric",
  498 |         hourCycle: "h23",
  499 |       }).format(new Date())
  500 |     );
  501 |     test.skip(
  502 |       localHour >= 20,
  503 |       "late evening in Miami: no room for a shift today"
  504 |     );
  505 |     const start = new Date(
  506 |       Math.ceil((Date.now() + 60 * 60_000) / 60_000) * 60_000
  507 |     );
  508 |     const end = new Date(start.getTime() + 2 * 60 * 60_000);
  509 |     const today = await shift(
  510 |       dee.staffMemberId,
  511 |       start.toISOString(),
  512 |       end.toISOString()
  513 |     );
  514 |     const p = await publishScheduleRaw(
  515 |       ownerToken,
  516 |       restaurantId,
  517 |       start.toISOString().slice(0, 10),
  518 |       "NONE"
  519 |     );
  520 |     expect(p.status).toBe(200);
  521 | 
  522 |     const clockIn = (extra: Rec = {}) =>
  523 |       tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
  524 |         staffMemberId: dee.staffMemberId,
  525 |         pin: DEE_PIN,
  526 |         supportsClockInRules: true,
  527 |         ...extra,
  528 |       });
  529 |     const clockOut = async () => {
  530 |       const r = await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
  531 |         staffMemberId: dee.staffMemberId,
  532 |         pin: DEE_PIN,
  533 |       });
  534 |       expect(r.status, JSON.stringify(r.data)).toBe(200);
  535 |     };
  536 | 
  537 |     await settings({ clockInRule: "BLOCK", earlyClockInMinutes: 15 });
  538 |     const blocked = await clockIn();
  539 |     expect(blocked.status, JSON.stringify(blocked.data)).toBe(409);
  540 |     expect(blocked.data).toMatchObject({
  541 |       errorCode: "CLOCK_IN_APPROVAL_REQUIRED",
  542 |       details: { reason: "EARLY" },
  543 |     });
  544 |     expect(String(blocked.data.message)).toMatch(/\d/); // names the times
  545 |     // A wrong manager PIN doesn't approve it.
  546 |     const wrongPin = await clockIn({
  547 |       managerPin: "1357",
  548 |       approverStaffMemberId: ownerMemberId,
  549 |     });
  550 |     expect(wrongPin.status).toBeGreaterThanOrEqual(400);
  551 |     const approved = await clockIn({
  552 |       managerPin: OWNER_PIN,
  553 |       approverStaffMemberId: ownerMemberId,
  554 |     });
  555 |     expect(approved.status, JSON.stringify(approved.data)).toBe(200);
  556 |     expect(approved.data.data.shift).toMatchObject({
  557 |       clockInException: "EARLY",
  558 |       scheduledShiftId: today,
  559 |     });
  560 |     await clockOut();
  561 | 
  562 |     await settings({ clockInRule: "WARN" });
  563 |     const warned = await clockIn();
  564 |     expect(warned.status, JSON.stringify(warned.data)).toBe(200);
  565 |     expect(warned.data.data.shift.clockInException).toBe("EARLY");
  566 |     await clockOut();
  567 | 
  568 |     // Two hours' early window: now is inside it — a plain matched clock-in.
  569 |     await settings({ clockInRule: "BLOCK", earlyClockInMinutes: 120 });
  570 |     const matched = await clockIn();
  571 |     expect(matched.status, JSON.stringify(matched.data)).toBe(200);
  572 |     expect(matched.data.data.shift).toMatchObject({
  573 |       clockInException: null,
  574 |       scheduledShiftId: today,
  575 |     });
  576 |     await clockOut();
  577 | 
  578 |     await settings({ clockInRule: "OFF", earlyClockInMinutes: 15 });
  579 |     const off = await clockIn();
  580 |     expect(off.status).toBe(200);
  581 |     expect(off.data.data.shift.clockInException).toBeNull();
  582 |     await clockOut();
  583 |   });
  584 | 
  585 |   test("TC-577: time-off rules — minimum notice (sick exempt) and blackout dates", async () => {
  586 |     const blackout = day(40);
  587 |     await settings({
  588 |       timeOffMinNoticeDays: 7,
```