# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-tips.spec.ts >> Tips — pools, tip-outs, cash (API) >> TC-596: the tips CSV carries the same numbers
- Location: tests/dashboard/owner/api-tips.spec.ts:499:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: "Ana Tipsy,1.00,0.00,10.00,0.00,0.00,2.00,0.00,0.00,8.00"
Received array: ["Name,Hours,Card tips,Cash tips,Tips through payroll,Declared cash tips,Tip-outs given,Tip-outs received,Given to the pool,Pool received,Card fee withheld,Net tips", "Ana Tipsy,1.00,0.00,10.00,0.00,0.00,0.00,0.00,2.00,0.00,0.00,8.00", "Cal Tipsy,0.67,0.00,6.00,0.00,0.00,0.00,0.00,1.20,0.00,0.00,4.80", "Ben Tipsy,1.00,0.00,0.00,0.00,6.50,0.00,0.00,0.00,3.20,0.00,3.20"]
```

# Test source

```ts
  412 |     expect(credit.status).toBe(400);
  413 |     const fine = await policy(
  414 |       {
  415 |         contributors: [
  416 |           { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 20 },
  417 |         ],
  418 |         recipients: [{ jobId: jobs.busser, points: 1 }],
  419 |       },
  420 |       { usesTipCredit: true }
  421 |     );
  422 |     expect(fine.status, JSON.stringify(fine.data)).toBe(200);
  423 |     // Out-of-range values are clamped, never stored as typed.
  424 |     const clamped = await policy({
  425 |       contributors: [
  426 |         { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 250 },
  427 |       ],
  428 |       recipients: [{ jobId: jobs.busser, points: 1 }],
  429 |     });
  430 |     expect(clamped.status).toBe(200);
  431 |     expect(clamped.data.data.policy.pool.contributors[0].percent).toBe(100);
  432 |   });
  433 | 
  434 |   test("TC-594: a recipient job turned managerial after saving gets nothing — and nothing is taken", async () => {
  435 |     await save({
  436 |       contributors: [
  437 |         { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 20 },
  438 |       ],
  439 |       recipients: [{ jobId: jobs.busser, points: 1 }],
  440 |     });
  441 |     const flip = await payrollRaw(
  442 |       ownerToken,
  443 |       restaurantId,
  444 |       "PATCH",
  445 |       `/jobs/${jobs.busser}`,
  446 |       { isManagerial: true }
  447 |     );
  448 |     expect(flip.status, JSON.stringify(flip.data)).toBe(200);
  449 |     const { ana: a, cal: c, ben: b, data } = await nets();
  450 |     expect(list(data.days)[0]?.notes).toContain("NO_ELIGIBLE_RECIPIENTS");
  451 |     expect(a).toMatchObject({ poolOutCents: 0, netCents: 1000 });
  452 |     expect(c).toMatchObject({ poolOutCents: 0, netCents: 600 });
  453 |     expect(b.netCents ?? 0).toBe(0);
  454 |     await payrollRaw(
  455 |       ownerToken,
  456 |       restaurantId,
  457 |       "PATCH",
  458 |       `/jobs/${jobs.busser}`,
  459 |       {
  460 |         isManagerial: false,
  461 |       }
  462 |     );
  463 |   });
  464 | 
  465 |   test("TC-595: declared cash tips are the person's own — reported, never pooled; a correction supersedes", async () => {
  466 |     const declare = (amountCents: number) =>
  467 |       tipsRaw(ownerToken, restaurantId, "POST", "/declarations", {
  468 |         staffMemberId: ben.id,
  469 |         businessDate: today,
  470 |         amountCents,
  471 |       });
  472 |     expect((await declare(700)).status).toBe(201);
  473 |     let r = await nets();
  474 |     expect(r.ben).toMatchObject({ declaredCashCents: 700, poolInCents: 320 });
  475 |     // Net (what payroll pays) excludes declared cash.
  476 |     expect(r.ben.netCents).toBe(320);
  477 |     expect(r.data.totals.declaredCashCents).toBe(700);
  478 | 
  479 |     expect((await declare(650)).status).toBe(201);
  480 |     r = await nets();
  481 |     expect(r.ben.declaredCashCents).toBe(650);
  482 | 
  483 |     const stranger = await tipsRaw(
  484 |       ownerToken,
  485 |       restaurantId,
  486 |       "POST",
  487 |       "/declarations",
  488 |       {
  489 |         staffMemberId: "00000000-0000-4000-8000-000000000000",
  490 |         businessDate: today,
  491 |         amountCents: 100,
  492 |       }
  493 |     );
  494 |     expect(stranger.status).toBe(404);
  495 |     const silly = await declare(600_000);
  496 |     expect(silly.status, "over $5,000 is a typo").toBe(400);
  497 |   });
  498 | 
  499 |   test("TC-596: the tips CSV carries the same numbers", async () => {
  500 |     const csv = await tipsRaw<string>(
  501 |       ownerToken,
  502 |       restaurantId,
  503 |       "GET",
  504 |       `/report.csv?startDate=${today}&endDate=${today}`
  505 |     );
  506 |     expect(csv.status).toBe(200);
  507 |     const rows = String(csv.data)
  508 |       .replace(/^\uFEFF/, "")
  509 |       .split("\n");
  510 |     expect(rows).toHaveLength(4); // header + Ana, Cal, Ben
  511 |     // name, hours, card, cash, payroll, declared, given, received, fee, net
> 512 |     expect(rows).toContain(
      |                  ^ Error: expect(received).toContain(expected) // indexOf
  513 |       "Ana Tipsy,1.00,0.00,10.00,0.00,0.00,2.00,0.00,0.00,8.00"
  514 |     );
  515 |     expect(rows).toContain(
  516 |       "Cal Tipsy,0.67,0.00,6.00,0.00,0.00,1.20,0.00,0.00,4.80"
  517 |     );
  518 |     expect(rows).toContain(
  519 |       "Ben Tipsy,1.00,0.00,0.00,0.00,6.50,0.00,3.20,0.00,3.20"
  520 |     );
  521 |   });
  522 | });
  523 | 
```