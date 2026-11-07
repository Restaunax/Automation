# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-tips.spec.ts >> Tips — pools, tip-outs, cash (API) >> TC-596: the tips CSV carries the same numbers
- Location: tests/dashboard/owner/api-tips.spec.ts:500:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Name,Hours,Card tips,Cash tips,Tips through payroll,Declared cash tips,Tip-outs given,Tip-outs received,Given to the pool,Pool received,Card fee withheld,Net tips,Unassigned tips shared,Paid from drawer,Cash tips kept at shift"
Received: "Name,Hours,Card tips,Cash tips,Tips through payroll,Declared cash tips,Tip-outs given,Tip-outs received,Given to the pool,Pool received,Card fee withheld,Net tips,Unassigned tips shared,Paid from drawer,Cash tips kept at shift,Service charges (paid as wages)"
```

# Test source

```ts
  414 |     const fine = await policy(
  415 |       {
  416 |         contributors: [
  417 |           { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 20 },
  418 |         ],
  419 |         recipients: [{ jobId: jobs.busser, points: 1 }],
  420 |       },
  421 |       { usesTipCredit: true }
  422 |     );
  423 |     expect(fine.status, JSON.stringify(fine.data)).toBe(200);
  424 |     // Out-of-range values are clamped, never stored as typed.
  425 |     const clamped = await policy({
  426 |       contributors: [
  427 |         { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 250 },
  428 |       ],
  429 |       recipients: [{ jobId: jobs.busser, points: 1 }],
  430 |     });
  431 |     expect(clamped.status).toBe(200);
  432 |     expect(clamped.data.data.policy.pool.contributors[0].percent).toBe(100);
  433 |   });
  434 | 
  435 |   test("TC-594: a recipient job turned managerial after saving gets nothing — and nothing is taken", async () => {
  436 |     await save({
  437 |       contributors: [
  438 |         { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 20 },
  439 |       ],
  440 |       recipients: [{ jobId: jobs.busser, points: 1 }],
  441 |     });
  442 |     const flip = await payrollRaw(
  443 |       ownerToken,
  444 |       restaurantId,
  445 |       "PATCH",
  446 |       `/jobs/${jobs.busser}`,
  447 |       { isManagerial: true }
  448 |     );
  449 |     expect(flip.status, JSON.stringify(flip.data)).toBe(200);
  450 |     const { ana: a, cal: c, ben: b, data } = await nets();
  451 |     expect(list(data.days)[0]?.notes).toContain("NO_ELIGIBLE_RECIPIENTS");
  452 |     expect(a).toMatchObject({ poolOutCents: 0, netCents: 1000 });
  453 |     expect(c).toMatchObject({ poolOutCents: 0, netCents: 600 });
  454 |     expect(b.netCents ?? 0).toBe(0);
  455 |     await payrollRaw(
  456 |       ownerToken,
  457 |       restaurantId,
  458 |       "PATCH",
  459 |       `/jobs/${jobs.busser}`,
  460 |       {
  461 |         isManagerial: false,
  462 |       }
  463 |     );
  464 |   });
  465 | 
  466 |   test("TC-595: declared cash tips are the person's own — reported, never pooled; a correction supersedes", async () => {
  467 |     const declare = (amountCents: number) =>
  468 |       tipsRaw(ownerToken, restaurantId, "POST", "/declarations", {
  469 |         staffMemberId: ben.id,
  470 |         businessDate: today,
  471 |         amountCents,
  472 |       });
  473 |     expect((await declare(700)).status).toBe(201);
  474 |     let r = await nets();
  475 |     expect(r.ben).toMatchObject({ declaredCashCents: 700, poolInCents: 320 });
  476 |     // Net (what payroll pays) excludes declared cash.
  477 |     expect(r.ben.netCents).toBe(320);
  478 |     expect(r.data.totals.declaredCashCents).toBe(700);
  479 | 
  480 |     expect((await declare(650)).status).toBe(201);
  481 |     r = await nets();
  482 |     expect(r.ben.declaredCashCents).toBe(650);
  483 | 
  484 |     const stranger = await tipsRaw(
  485 |       ownerToken,
  486 |       restaurantId,
  487 |       "POST",
  488 |       "/declarations",
  489 |       {
  490 |         staffMemberId: "00000000-0000-4000-8000-000000000000",
  491 |         businessDate: today,
  492 |         amountCents: 100,
  493 |       }
  494 |     );
  495 |     expect(stranger.status).toBe(404);
  496 |     const silly = await declare(600_000);
  497 |     expect(silly.status, "over $5,000 is a typo").toBe(400);
  498 |   });
  499 | 
  500 |   test("TC-596: the tips CSV carries the same numbers", async () => {
  501 |     const csv = await tipsRaw<string>(
  502 |       ownerToken,
  503 |       restaurantId,
  504 |       "GET",
  505 |       `/report.csv?startDate=${today}&endDate=${today}`
  506 |     );
  507 |     expect(csv.status).toBe(200);
  508 |     const rows = String(csv.data)
  509 |       .replace(/^\uFEFF/, "")
  510 |       .split("\n");
  511 |     expect(rows).toHaveLength(4); // header + Ana, Cal, Ben
  512 |     // Rule-based tip-outs (tip-out waterfall, P6) got their own columns, next
  513 |     // to the pool's; this policy has a pool and no tip-out rules.
> 514 |     expect(rows[0]).toBe(
      |                     ^ Error: expect(received).toBe(expected) // Object.is equality
  515 |       "Name,Hours,Card tips,Cash tips,Tips through payroll,Declared cash tips," +
  516 |         "Tip-outs given,Tip-outs received,Given to the pool,Pool received," +
  517 |         "Card fee withheld,Net tips," +
  518 |         // RestauNax 9d9578a45 (2026-10-22): cash tips never paid twice;
  519 |         // unassigned tips shared across the pay period.
  520 |         "Unassigned tips shared,Paid from drawer,Cash tips kept at shift"
  521 |     );
  522 |     // name, hours, card, cash, payroll, declared, tip-outs given, tip-outs
  523 |     // received, given to pool, pool received, fee, net, unassigned shared,
  524 |     // paid from drawer, cash kept at shift (none of the last three here)
  525 |     expect(rows).toContain(
  526 |       "Ana Tipsy,1.00,0.00,10.00,0.00,0.00,0.00,0.00,2.00,0.00,0.00,8.00,0.00,0.00,0.00"
  527 |     );
  528 |     expect(rows).toContain(
  529 |       "Cal Tipsy,0.67,0.00,6.00,0.00,0.00,0.00,0.00,1.20,0.00,0.00,4.80,0.00,0.00,0.00"
  530 |     );
  531 |     expect(rows).toContain(
  532 |       "Ben Tipsy,1.00,0.00,0.00,0.00,6.50,0.00,0.00,0.00,3.20,0.00,3.20,0.00,0.00,0.00"
  533 |     );
  534 |   });
  535 | });
  536 | 
```