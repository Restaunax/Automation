# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos/07-waitlist-public.spec.ts >> POS — Waitlist & Public Reservation Booking >> TC-421: public create happy path returns a manage link; the manage view is public-safe
- Location: tests/pos/07-waitlist-public.spec.ts:398:7

# Error details

```
Error: This restaurant is in preview mode and hasn't been published yet, so this feature isn't available. Publish the restaurant to enable it.

expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 400
```

# Test source

```ts
  313 |       partySize: 2,
  314 |       guestName: `Waitlist Add ${runId}`,
  315 |       guestPhone: nextGuestPhone(),
  316 |       quotedWaitMinutes: 15,
  317 |     });
  318 |     expect(added.status, msg(added.data)).toBe(201);
  319 |     const data = unwrap(added);
  320 |     expect(data.kind).toBe("WAITLIST");
  321 |     expect(data.quotedWaitMinutes).toBe(15);
  322 | 
  323 |     const noPhone = await createReservationTabletRaw(
  324 |       tabletToken,
  325 |       staffSession,
  326 |       {
  327 |         partySize: 2,
  328 |         guestName: `No Phone ${runId}`,
  329 |       }
  330 |     );
  331 |     expect(noPhone.status, msg(noPhone.data)).toBe(400);
  332 |     expect(errorCode(noPhone.data)).toBe("RESERVATION_PHONE_REQUIRED");
  333 |   });
  334 | 
  335 |   test("TC-419: notify flips a BOOKED waitlist entry to NOTIFIED with an expiry stamped", async () => {
  336 |     await allure.description(
  337 |       "POST .../reservations/:id/notify on a BOOKED waitlist entry → 200, " +
  338 |         "status NOTIFIED, notifyExpiresAt set (now + " +
  339 |         "waitlistNotifyTimeoutMinutes). Delivery is NOT asserted — QA SMS is " +
  340 |         "log-only by design."
  341 |     );
  342 |     const added = await createReservationTabletRaw(tabletToken, staffSession, {
  343 |       partySize: 2,
  344 |       guestName: `Notify Me ${runId}`,
  345 |       guestPhone: nextGuestPhone(),
  346 |     });
  347 |     expect(added.status, msg(added.data)).toBe(201);
  348 |     const id = unwrap(added).id;
  349 | 
  350 |     const notified = await notifyReservationTabletRaw(
  351 |       tabletToken,
  352 |       staffSession,
  353 |       id
  354 |     );
  355 |     expect(notified.status, msg(notified.data)).toBe(200);
  356 |     const data = unwrap(notified);
  357 |     expect(data.status).toBe("NOTIFIED");
  358 |     expect(data.notifyExpiresAt).toBeTruthy();
  359 |   });
  360 | 
  361 |   test("TC-420: public availability reflects config — window-clipped slots, empty+closed on an overridden date", async () => {
  362 |     await allure.description(
  363 |       "GET .../reservation-availability for a date matching the ONE " +
  364 |         "12:00-14:00 period returns slots ONLY inside that window (every " +
  365 |         'slot.time in ["12:00","14:00")). A ReservationDateOverride ' +
  366 |         "closing a date on the SAME weekday → 200 with an EMPTY slots array " +
  367 |         "and closed:true (not an error status — getAvailability's own " +
  368 |         "contract, confirmed against source)."
  369 |     );
  370 |     const avail = await getPublicAvailabilityRaw(restaurantId, availDate, 2);
  371 |     expect(avail.status, msg(avail.data)).toBe(200);
  372 |     const availData = unwrap(avail);
  373 |     expect(availData.closed).toBe(false);
  374 |     const slots = availData.slots as { time: string }[];
  375 |     expect(slots.length).toBeGreaterThan(0);
  376 |     for (const slot of slots) {
  377 |       expect(slot.time >= "12:00" && slot.time < "14:00", slot.time).toBe(true);
  378 |     }
  379 | 
  380 |     const override = await createReservationDateOverrideOwnerRaw(
  381 |       token,
  382 |       restaurantId,
  383 |       { date: closedDate, closed: true, note: "TC-420 closed" }
  384 |     );
  385 |     expect(override.status, msg(override.data)).toBe(201);
  386 | 
  387 |     const closedAvail = await getPublicAvailabilityRaw(
  388 |       restaurantId,
  389 |       closedDate,
  390 |       2
  391 |     );
  392 |     expect(closedAvail.status, msg(closedAvail.data)).toBe(200);
  393 |     const closedData = unwrap(closedAvail);
  394 |     expect(closedData.closed).toBe(true);
  395 |     expect((closedData.slots as unknown[]).length).toBe(0);
  396 |   });
  397 | 
  398 |   test("TC-421: public create happy path returns a manage link; the manage view is public-safe", async () => {
  399 |     await allure.description(
  400 |       "POST .../reservations (public, no auth) → 201, confirmationCode + " +
  401 |         "manageUrl carrying the manage token. GET the manage view with that " +
  402 |         "token → 200, a public-safe projection (status/scheduledAt/" +
  403 |         "partySize/guestName/restaurantName/cancellable/confirmationCode) " +
  404 |         "with NO internalNotes field at all."
  405 |     );
  406 |     const scheduledAt = await freshSlot(availDate);
  407 |     const created = await createPublicReservationRaw(restaurantId, {
  408 |       guestName: `Public Guest ${runId}`,
  409 |       guestPhone: nextGuestPhone(),
  410 |       partySize: 2,
  411 |       scheduledAt,
  412 |     });
> 413 |     expect(created.status, msg(created.data)).toBe(201);
      |                                               ^ Error: This restaurant is in preview mode and hasn't been published yet, so this feature isn't available. Publish the restaurant to enable it.
  414 |     const createdData = unwrap(created);
  415 |     expect(createdData.confirmationCode).toBeTruthy();
  416 |     expect(createdData.manageUrl).toBeTruthy();
  417 |     const manageToken = String(createdData.manageUrl).split("/").pop()!;
  418 | 
  419 |     const managed = await getManagedReservationRaw(manageToken);
  420 |     expect(managed.status, msg(managed.data)).toBe(200);
  421 |     const managedData = unwrap(managed);
  422 |     expect(managedData.status).toBe("BOOKED");
  423 |     expect(managedData.confirmationCode).toBe(createdData.confirmationCode);
  424 |     expect(managedData.cancellable).toBe(true);
  425 |     expect("internalNotes" in managedData).toBe(false);
  426 |     expect("guestPhone" in managedData).toBe(false);
  427 |     expect("manageToken" in managedData).toBe(false);
  428 |   });
  429 | 
  430 |   test("TC-422: manage cancel — DELETE cancels once; a repeat DELETE is a 409 conflict, not a 400", async () => {
  431 |     await allure.description(
  432 |       "DELETE .../manage/:manageToken on a BOOKED reservation → 200, status " +
  433 |         "CANCELLED. A SECOND DELETE on the now-terminal reservation → 409 " +
  434 |         "RESERVATION_INVALID_TRANSITION — the manage-cancel handler uses 409 " +
  435 |         "deliberately (its own comment: a stale manage page reload is a " +
  436 |         "conflict with current state, not a malformed request), diverging " +
  437 |         "from the brief's assumed 400."
  438 |     );
  439 |     const scheduledAt = await freshSlot(availDate);
  440 |     const created = unwrap(
  441 |       await createPublicReservationRaw(restaurantId, {
  442 |         guestName: `Cancel Once ${runId}`,
  443 |         guestPhone: nextGuestPhone(),
  444 |         partySize: 2,
  445 |         scheduledAt,
  446 |       })
  447 |     );
  448 |     const manageToken = String(created.manageUrl).split("/").pop()!;
  449 | 
  450 |     const cancelled = await cancelManagedReservationRaw(manageToken);
  451 |     expect(cancelled.status, msg(cancelled.data)).toBe(200);
  452 |     expect(unwrap(cancelled).status).toBe("CANCELLED");
  453 | 
  454 |     const again = await cancelManagedReservationRaw(manageToken);
  455 |     expect(again.status, msg(again.data)).toBe(409);
  456 |     expect(errorCode(again.data)).toBe("RESERVATION_INVALID_TRANSITION");
  457 |   });
  458 | 
  459 |   test("TC-423: cancel-after-seated is refused — PUBLIC may only cancel from BOOKED/CONFIRMED", async () => {
  460 |     await allure.description(
  461 |       "Book publicly, then arrive + seat on the tablet (ARRIVED then " +
  462 |         "SEATED) — the manage DELETE now hits PUBLIC_ALLOWED_SOURCES' " +
  463 |         "source-scoping (CANCELLED only legal from BOOKED/CONFIRMED for " +
  464 |         "actor PUBLIC) → 409 RESERVATION_INVALID_TRANSITION, same divergence " +
  465 |         "from the brief's 400 as TC-422."
  466 |     );
  467 |     const table = unwrap(
  468 |       await createTableOwnerRaw(token, restaurantId, {
  469 |         name: `Seated Cancel ${runId}`,
  470 |       })
  471 |     );
  472 |     const scheduledAt = await freshSlot(availDate);
  473 |     const created = unwrap(
  474 |       await createPublicReservationRaw(restaurantId, {
  475 |         guestName: `Seated Cancel ${runId}`,
  476 |         guestPhone: nextGuestPhone(),
  477 |         partySize: 2,
  478 |         scheduledAt,
  479 |       })
  480 |     );
  481 |     const manageToken = String(created.manageUrl).split("/").pop()!;
  482 | 
  483 |     const arrived = await reservationStatusTabletRaw(
  484 |       tabletToken,
  485 |       staffSession,
  486 |       created.reservationId,
  487 |       "arrive"
  488 |     );
  489 |     expect(arrived.status, msg(arrived.data)).toBe(200);
  490 | 
  491 |     const seated = await seatReservationTabletRaw(
  492 |       tabletToken,
  493 |       staffSession,
  494 |       created.reservationId,
  495 |       { tableIds: [table.id] }
  496 |     );
  497 |     expect(seated.status, msg(seated.data)).toBe(201);
  498 | 
  499 |     const attempt = await cancelManagedReservationRaw(manageToken);
  500 |     expect(attempt.status, msg(attempt.data)).toBe(409);
  501 |     expect(errorCode(attempt.data)).toBe("RESERVATION_INVALID_TRANSITION");
  502 |   });
  503 | 
  504 |   test("TC-424: per-phone cap — a second future booking on the same phone is refused", async () => {
  505 |     await allure.description(
  506 |       "With maxOpenReservationsPerPhone:1, the SAME phone booking a second " +
  507 |         "future slot → 409 RESERVATION_MAX_OPEN_REACHED (the first booking " +
  508 |         "still counts as an open reservation on that phone)."
  509 |     );
  510 |     const capped = await putReservationSettingsOwnerRaw(token, restaurantId, {
  511 |       maxOpenReservationsPerPhone: 1,
  512 |     });
  513 |     expect(capped.status, msg(capped.data)).toBe(200);
```