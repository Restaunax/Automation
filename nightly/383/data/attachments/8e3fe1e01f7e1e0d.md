# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos/10-table-turns.spec.ts >> POS — Table Turns, Walk-in Seating & Waitlist Quote >> TC-737: turn insights count this run's turns by how they cleared; an unsupported `days` falls back to 30
- Location: tests/pos/10-table-turns.spec.ts:654:7

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 4
Received:    2
```

# Test source

```ts
  566 |           managerSession,
  567 |           blockedTable.id,
  568 |           "BLOCKED"
  569 |         )
  570 |       ).status
  571 |     ).toBe(200);
  572 |     const blocked = await seatWalkInTabletRaw(
  573 |       tabletToken,
  574 |       managerSession,
  575 |       blockedTable.id,
  576 |       2
  577 |     );
  578 |     expect(blocked.status, msg(blocked.data)).toBe(409);
  579 |     expect(errorCode(blocked.data)).toBe("RESERVATION_CONFLICT");
  580 |   });
  581 | 
  582 |   test("TC-734: a walk-in may sit at a PAID table — the old turn closes and the table reads SEATED", async () => {
  583 |     await allure.description(
  584 |       "Seating the next party is the host saying the table was reset: a " +
  585 |         "PAID table (default policy) accepts a walk-in seat (200), its turn " +
  586 |         "closes SEATED_OVER, and the floor reads SEATED with no paidTurn."
  587 |     );
  588 |     const table = await newTable("Paid Seat");
  589 |     await payInFull(await openCheck(table.id));
  590 |     expect((await floorRow(table.id))?.state).toBe("PAID");
  591 | 
  592 |     const seated = await seatWalkInTabletRaw(
  593 |       tabletToken,
  594 |       managerSession,
  595 |       table.id,
  596 |       2
  597 |     );
  598 |     expect(seated.status, msg(seated.data)).toBe(200);
  599 |     const row = await floorRow(table.id);
  600 |     expect(row?.state).toBe("SEATED");
  601 |     expect(row?.paidTurn).toBeFalsy();
  602 |   });
  603 | 
  604 |   // ── Floor extras, waitlist quote, insights ──────────────────────────────
  605 | 
  606 |   test("TC-735: the floor's server strip counts the manager's open tables and covers", async () => {
  607 |     await allure.description(
  608 |       "GET /api/tablet/floor → `servers`: one row per server with open " +
  609 |         "checks. After the MANAGER opens a check for 4 guests, their row " +
  610 |         "has openTables ≥ 1 and covers ≥ 4."
  611 |     );
  612 |     const table = await newTable("Server Strip");
  613 |     await openCheck(table.id, { guestCount: 4 });
  614 |     const servers = (await floor()).servers as any[];
  615 |     const mine = servers.find((s) => s.staffMemberId === managerStaffMemberId);
  616 |     expect(mine, JSON.stringify(servers)).toBeTruthy();
  617 |     expect(mine.openTables).toBeGreaterThanOrEqual(1);
  618 |     expect(mine.covers).toBeGreaterThanOrEqual(4);
  619 |     expect(mine.lastSatAt).toBeTruthy();
  620 |   });
  621 | 
  622 |   test("TC-736: waitlist quote — a party of 2 gets a LIVE quote with fitting tables; party size 0 and 100 → 400", async () => {
  623 |     await allure.description(
  624 |       "GET /api/tablet/waitlist/quote?partySize=2 on a floor with free " +
  625 |         "4-tops → 200, reason LIVE, fittingTables ≥ 1, and a low/high " +
  626 |         "range where low ≤ high. partySize 0 and 100 (1..99) → 400 " +
  627 |         "RESERVATION_PARTY_SIZE_INVALID."
  628 |     );
  629 |     await newTable("Quote Free");
  630 |     const quote = await getWaitlistQuoteTabletRaw(
  631 |       tabletToken,
  632 |       managerSession,
  633 |       2
  634 |     );
  635 |     expect(quote.status, msg(quote.data)).toBe(200);
  636 |     const q = unwrap(quote);
  637 |     expect(q.reason).toBe("LIVE");
  638 |     expect(q.fittingTables).toBeGreaterThanOrEqual(1);
  639 |     expect(typeof q.partiesAhead).toBe("number");
  640 |     if (q.lowMinutes != null && q.highMinutes != null)
  641 |       expect(q.lowMinutes).toBeLessThanOrEqual(q.highMinutes);
  642 | 
  643 |     for (const partySize of [0, 100]) {
  644 |       const bad = await getWaitlistQuoteTabletRaw(
  645 |         tabletToken,
  646 |         managerSession,
  647 |         partySize
  648 |       );
  649 |       expect(bad.status, `partySize ${partySize}`).toBe(400);
  650 |       expect(errorCode(bad.data)).toBe("RESERVATION_PARTY_SIZE_INVALID");
  651 |     }
  652 |   });
  653 | 
  654 |   test("TC-737: turn insights count this run's turns by how they cleared; an unsupported `days` falls back to 30", async () => {
  655 |     await allure.description(
  656 |       "GET /restaurant/:rid/reservation-turn-times/insights?days=7 after " +
  657 |         "the turns above: days 7, totalTurns ≥ 4, clearedManually ≥ 1 " +
  658 |         "(TC-728's Clear), clearedBySeating ≥ 2 (TC-727's next check, " +
  659 |         "TC-734's walk-in), and bookingSources zero-filled for WEB / MOBILE " +
  660 |         "/ PHONE. ?days=5 isn't an option → answered for 30 days."
  661 |     );
  662 |     const res = await getTurnInsightsOwnerRaw(token, restaurantId, 7);
  663 |     expect(res.status, msg(res.data)).toBe(200);
  664 |     const insights = unwrap(res);
  665 |     expect(insights.days).toBe(7);
> 666 |     expect(insights.totalTurns).toBeGreaterThanOrEqual(4);
      |                                 ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  667 |     expect(insights.clearedManually).toBeGreaterThanOrEqual(1);
  668 |     expect(insights.clearedBySeating).toBeGreaterThanOrEqual(2);
  669 |     for (const source of ["WEB", "MOBILE", "PHONE"])
  670 |       expect(typeof insights.bookingSources?.[source], source).toBe("number");
  671 | 
  672 |     const fallback = await getTurnInsightsOwnerRaw(token, restaurantId, 5);
  673 |     expect(fallback.status, msg(fallback.data)).toBe(200);
  674 |     expect(unwrap(fallback).days).toBe(30);
  675 |   });
  676 | });
  677 | 
```