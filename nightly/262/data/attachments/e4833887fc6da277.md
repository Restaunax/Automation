# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos/07-waitlist-public.spec.ts >> POS — Waitlist & Public Reservation Booking >> TC-425: the public gate — flipping onlineBookingEnabled off refuses create, restored in finally
- Location: tests/pos/07-waitlist-public.spec.ts:534:7

# Error details

```
Error: This restaurant is in preview mode and hasn't been published yet, so this feature isn't available. Publish the restaurant to enable it.

expect(received).toBe(expected) // Object.is equality

Expected: 403
Received: 400
```

# Test source

```ts
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
  514 | 
  515 |     const guestPhone = nextGuestPhone();
  516 |     const first = await createPublicReservationRaw(restaurantId, {
  517 |       guestName: `Cap One ${runId}`,
  518 |       guestPhone,
  519 |       partySize: 2,
  520 |       scheduledAt: await freshSlot(availDate),
  521 |     });
  522 |     expect(first.status, msg(first.data)).toBe(201);
  523 | 
  524 |     const second = await createPublicReservationRaw(restaurantId, {
  525 |       guestName: `Cap Two ${runId}`,
  526 |       guestPhone,
  527 |       partySize: 2,
  528 |       scheduledAt: await freshSlot(availDate),
  529 |     });
  530 |     expect(second.status, msg(second.data)).toBe(409);
  531 |     expect(errorCode(second.data)).toBe("RESERVATION_MAX_OPEN_REACHED");
  532 |   });
  533 | 
  534 |   test("TC-425: the public gate — flipping onlineBookingEnabled off refuses create, restored in finally", async () => {
  535 |     await allure.description(
  536 |       "With TABLE_RESERVATIONS granted but onlineBookingEnabled:false, " +
  537 |         "public create → 403 RESERVATIONS_NOT_ENABLED (the SAME code the " +
  538 |         "entitlement-missing case uses — a satellite client hides the " +
  539 |         "booking widget on one code regardless of which half of the gate " +
  540 |         "failed). Restored ON in `finally`."
  541 |     );
  542 |     try {
  543 |       const off = await putReservationSettingsOwnerRaw(token, restaurantId, {
  544 |         onlineBookingEnabled: false,
  545 |       });
  546 |       expect(off.status, msg(off.data)).toBe(200);
  547 | 
  548 |       const attempt = await createPublicReservationRaw(restaurantId, {
  549 |         guestName: `Gate Off ${runId}`,
  550 |         guestPhone: nextGuestPhone(),
  551 |         partySize: 2,
  552 |         scheduledAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
  553 |       });
> 554 |       expect(attempt.status, msg(attempt.data)).toBe(403);
      |                                                 ^ Error: This restaurant is in preview mode and hasn't been published yet, so this feature isn't available. Publish the restaurant to enable it.
  555 |       expect(errorCode(attempt.data)).toBe("RESERVATIONS_NOT_ENABLED");
  556 |     } finally {
  557 |       await putReservationSettingsOwnerRaw(token, restaurantId, {
  558 |         onlineBookingEnabled: true,
  559 |       }).catch((err) =>
  560 |         console.warn("[TC-425] could not restore onlineBookingEnabled:", err)
  561 |       );
  562 |     }
  563 |   });
  564 | });
  565 | 
```