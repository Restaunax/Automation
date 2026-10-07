# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-payroll-export.spec.ts >> Payroll export — every format from the approved period (API) >> TC-600: Gusto, ADP RUN and Paychex files carry the same hours and money
- Location: tests/dashboard/owner/api-payroll-export.spec.ts:397:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Last_name,First_name,Gusto_employee_id,Title,Regular_hours,Overtime_hours,Double_overtime_hours,paycheck_tips,cash_tips"
Received: "[object Object]"
```

# Test source

```ts
  299 |       "/declarations",
  300 |       {
  301 |         staffMemberId: ivy.id,
  302 |         businessDate: addDays(p1, 2),
  303 |         amountCents: 500,
  304 |       }
  305 |     );
  306 |     expect(late.status).toBe(403);
  307 |   });
  308 | 
  309 |   test("TC-598: preview warns what each format is missing, and records nothing", async () => {
  310 |     const rx = await preview("RESTAUNAX");
  311 |     expect(rx).toMatchObject({ format: "RESTAUNAX", rowCount: 2 });
  312 |     expect(codes(rx)).toEqual(["MISSING_PAYROLL_ID", "MISSING_PAYROLL_ID"]);
  313 |     for (const w of list(rx.warnings))
  314 |       expect(String(w.message)).not.toMatch(/^api:/);
  315 | 
  316 |     const adp = await preview("ADP_RUN");
  317 |     expect(codes(adp)).toEqual(
  318 |       [
  319 |         "MISSING_COMPANY_CODE",
  320 |         "MISSING_EARNING_CODE",
  321 |         "MISSING_EARNING_CODE",
  322 |         "MISSING_EARNING_CODE",
  323 |         "MISSING_PAYROLL_ID",
  324 |         "MISSING_PAYROLL_ID",
  325 |       ].sort()
  326 |     );
  327 |     const paychex = await preview("PAYCHEX");
  328 |     expect(codes(paychex)).toContain("MISSING_CLIENT_ID");
  329 | 
  330 |     const periods = await payrollRaw(
  331 |       ownerToken,
  332 |       restaurantId,
  333 |       "GET",
  334 |       "/pay-periods?count=4"
  335 |     );
  336 |     expect(
  337 |       list(periods.data.data.periods).find((p) => p.startDate === p1)?.status
  338 |     ).toBe("APPROVED");
  339 | 
  340 |     // Fill Hal's payroll ID, the job code and the provider codes.
  341 |     await ownerStaffRaw(ownerToken, restaurantId, "PATCH", `/${hal.id}`, {
  342 |       payrollEmployeeId: "E-100",
  343 |     });
  344 |     await payrollRaw(ownerToken, restaurantId, "PATCH", `/jobs/${barista}`, {
  345 |       payrollCode: "BAR",
  346 |     });
  347 |     const earnings = {
  348 |       regular: "REG",
  349 |       overtime: "OT",
  350 |       doubleTime: "DT",
  351 |       tipsPaid: "TIPS",
  352 |       tipsReported: "CTIPS",
  353 |     };
  354 |     const saved = await putPayrollSettingsRaw(ownerToken, restaurantId, {
  355 |       export: {
  356 |         defaultFormat: "ADP_RUN",
  357 |         adp: { companyCode: "ABC", earningCodes: earnings },
  358 |         paychex: { clientId: "9876", payComponents: earnings },
  359 |       },
  360 |     });
  361 |     expect(saved.status, JSON.stringify(saved.data)).toBe(200);
  362 |     expect(codes(await preview("ADP_RUN"))).toEqual(["MISSING_PAYROLL_ID"]);
  363 |     expect(codes(await preview("PAYCHEX"))).toEqual(["MISSING_PAYROLL_ID"]);
  364 |   });
  365 | 
  366 |   test("TC-599: the RestauNax file — one row per person per job, totals = the approval", async () => {
  367 |     const r = await file("RESTAUNAX");
  368 |     expect(r.status, String(r.data)).toBe(200);
  369 |     restaunaxFile = String(r.data);
  370 |     const rows = lines(r.data);
  371 |     expect(rows).toHaveLength(3);
  372 |     // periodStart, periodEnd, payrollId, last, first, job, jobCode, rate,
  373 |     // reg h, OT h, DT h, straight, premium, wages, tipsPaid, fromDrawer,
  374 |     // declared, grossPaid — sorted by last name.
  375 |     expect(rows[1]).toBe(
  376 |       `${p1},${addDays(p1, 6)},E-100,Avery,Hal,${baristaName},BAR,15.00,40.00,4.00,0.00,660.00,30.00,690.00,0.00,0.00,12.34,690.00`
  377 |     );
  378 |     expect(rows[2]).toBe(
  379 |       `${p1},${addDays(p1, 6)},,Zane,Ivy,${hostName},,14.00,8.00,0.00,0.00,112.00,0.00,112.00,0.00,0.00,0.00,112.00`
  380 |     );
  381 |     const wages = rows
  382 |       .slice(1)
  383 |       .reduce((s, l) => s + Math.round(Number(l.split(",")[13]) * 100), 0);
  384 |     expect(wages).toBe(80200);
  385 | 
  386 |     const periods = await payrollRaw(
  387 |       ownerToken,
  388 |       restaurantId,
  389 |       "GET",
  390 |       "/pay-periods?count=4"
  391 |     );
  392 |     expect(
  393 |       list(periods.data.data.periods).find((p) => p.startDate === p1)?.status
  394 |     ).toBe("EXPORTED");
  395 |   });
  396 | 
  397 |   test("TC-600: Gusto, ADP RUN and Paychex files carry the same hours and money", async () => {
  398 |     const gusto = lines((await file("GUSTO")).data);
> 399 |     expect(gusto[0]).toBe(
      |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  400 |       "Last_name,First_name,Gusto_employee_id,Title,Regular_hours,Overtime_hours,Double_overtime_hours,paycheck_tips,cash_tips"
  401 |     );
  402 |     expect(gusto).toContain(
  403 |       `Avery,Hal,E-100,${baristaName},40.00,4.00,0.00,0.00,12.34`
  404 |     );
  405 |     expect(gusto).toContain(`Zane,Ivy,,${hostName},8.00,0.00,0.00,0.00,0.00`);
  406 | 
  407 |     const adp = lines((await file("ADP_RUN")).data);
  408 |     const dates = `W,${usDate(p1)},${usDate(addDays(p1, 6))}`;
  409 |     expect(adp).toEqual(
  410 |       expect.arrayContaining([
  411 |         `ABC,${dates},E-100,REG,40.00,,BAR`,
  412 |         `ABC,${dates},E-100,OT,4.00,,BAR`,
  413 |         `ABC,${dates},E-100,CTIPS,,12.34,BAR`,
  414 |         `ABC,${dates},,REG,8.00,,`,
  415 |       ])
  416 |     );
  417 |     expect(adp).toHaveLength(5);
  418 | 
  419 |     const paychex = lines((await file("PAYCHEX")).data);
  420 |     expect(paychex[0]).toBe(
  421 |       "Client ID,Worker ID,Job Number,Pay Component,Rate,Hours,Amount"
  422 |     );
  423 |     expect(paychex).toEqual(
  424 |       expect.arrayContaining([
  425 |         "9876,E-100,BAR,REG,15.00,40.00,",
  426 |         "9876,E-100,BAR,OT,15.00,4.00,",
  427 |         "9876,E-100,BAR,CTIPS,,,12.34",
  428 |         "9876,,,REG,14.00,8.00,",
  429 |       ])
  430 |     );
  431 |   });
  432 | 
  433 |   test("TC-601: a re-export after a raise is the same file (built from the approval)", async () => {
  434 |     await payrollRaw(ownerToken, restaurantId, "PATCH", `/jobs/${barista}`, {
  435 |       defaultHourlyRateCents: 1700,
  436 |     });
  437 |     const again = await file("RESTAUNAX");
  438 |     expect(String(again.data)).toBe(restaunaxFile);
  439 |   });
  440 | 
  441 |   test("TC-602: the staff app shows Hal the approved wages and hours", async () => {
  442 |     const r = await staffAppRaw<{ data: Rec }>(
  443 |       hal.token,
  444 |       "GET",
  445 |       `/restaurants/${restaurantId}/pay-periods/${p1}`
  446 |     );
  447 |     expect(r.status).toBe(200);
  448 |     expect(r.data.data).toMatchObject({
  449 |       approved: true,
  450 |       status: "EXPORTED",
  451 |       regularMinutes: 2400,
  452 |       overtimeMinutes: 240,
  453 |       wagesCents: 69000,
  454 |     });
  455 |     expect(list(r.data.data.shifts)).toHaveLength(6);
  456 |     expect(list(r.data.data.jobs)[0]).toMatchObject({
  457 |       rateCents: 1500,
  458 |       wagesCents: 69000,
  459 |     });
  460 |   });
  461 | 
  462 |   test("TC-603: an unapproved period can't be exported; reopening an exported period is allowed with a reason", async () => {
  463 |     expect((await file("GUSTO", p2)).status).toBe(400);
  464 |     const reopened = await payrollRaw(
  465 |       ownerToken,
  466 |       restaurantId,
  467 |       "POST",
  468 |       `/pay-periods/${p1}/reopen`,
  469 |       { reason: "Ivy's Thursday was wrong" }
  470 |     );
  471 |     expect(reopened.status, JSON.stringify(reopened.data)).toBe(200);
  472 |     expect((await file("RESTAUNAX")).status, "reopened = not exportable").toBe(
  473 |       400
  474 |     );
  475 |   });
  476 | });
  477 | 
```