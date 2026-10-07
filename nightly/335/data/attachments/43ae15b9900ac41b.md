# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-addon-gating.spec.ts >> Back-office add-ons gate every surface (API) >> TC-566: SCHEDULING only — schedule, jobs and the clock-in rule appear; tips and payroll runs don't
- Location: tests/dashboard/owner/api-addon-gating.spec.ts:299:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 403
```

# Test source

```ts
  225 |         .map((b) => b.id)
  226 |         .sort()
  227 |     ).toEqual(["meal", "rest"]);
  228 |     expect(clock.clockInRule).toBe("OFF");
  229 |     const me = list(clock.data).find((s) => s.id === ownerMemberId) ?? {};
  230 |     expect(list(me.jobs)).toHaveLength(0);
  231 | 
  232 |     // Basic clock in/out stays free (STAFF floor).
  233 |     const inn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
  234 |       staffMemberId: ownerMemberId,
  235 |       pin: PIN,
  236 |     });
  237 |     expect(inn.status, JSON.stringify(inn.data)).toBe(200);
  238 |     // Basic breaks are free (packaging v2): a break starts and ends with no
  239 |     // add-on; api-free-breaks covers the hours.
  240 |     const brk = await tabletRaw<Rec>(
  241 |       tabletToken,
  242 |       "POST",
  243 |       "/staff/break/start",
  244 |       { staffMemberId: ownerMemberId, pin: PIN, breakTypeId: "rest" }
  245 |     );
  246 |     expect(brk.status, JSON.stringify(brk.data)).toBe(200);
  247 |     const brkEnd = await tabletRaw<Rec>(
  248 |       tabletToken,
  249 |       "POST",
  250 |       "/staff/break/end",
  251 |       {
  252 |         staffMemberId: ownerMemberId,
  253 |         pin: PIN,
  254 |       }
  255 |     );
  256 |     expect(brkEnd.status, JSON.stringify(brkEnd.data)).toBe(200);
  257 |     const out = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-out", {
  258 |       staffMemberId: ownerMemberId,
  259 |       pin: PIN,
  260 |     });
  261 |     expect(out.status, JSON.stringify(out.data)).toBe(200);
  262 | 
  263 |     const signIn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/sign-in", {
  264 |       staffMemberId: ownerMemberId,
  265 |       pin: PIN,
  266 |     });
  267 |     expect(signIn.status).toBe(200);
  268 |     const session = String(signIn.data.data.staffSessionToken);
  269 |     const review = await tabletRaw(
  270 |       tabletToken,
  271 |       "GET",
  272 |       "/timecards/review",
  273 |       undefined,
  274 |       session
  275 |     );
  276 |     expect(review.status, "timecard review needs TIMECARDS").toBe(403);
  277 |     const today = await tabletRaw(
  278 |       tabletToken,
  279 |       "GET",
  280 |       "/schedule/today",
  281 |       undefined,
  282 |       session
  283 |     );
  284 |     expect(today.status, "today's schedule needs SCHEDULING").toBe(403);
  285 |   });
  286 | 
  287 |   test("TC-565: no add-ons — Restaunax Staff doesn't list the restaurant and refuses time off", async () => {
  288 |     // A restaurant with none of the staff-app sections isn't listed at all.
  289 |     expect(await staffAppRequests()).toBeUndefined();
  290 |     const off = await staffAppRaw(
  291 |       ownerToken,
  292 |       "POST",
  293 |       `/restaurants/${restaurantId}/time-off`,
  294 |       { startDate: day(20), endDate: day(20), type: "UNPAID" }
  295 |     );
  296 |     expect(off.status).toBe(403);
  297 |   });
  298 | 
  299 |   test("TC-566: SCHEDULING only — schedule, jobs and the clock-in rule appear; tips and payroll runs don't", async () => {
  300 |     await grant("SCHEDULING");
  301 |     expect(await features()).toEqual(["SCHEDULING", "TIMECARDS"]);
  302 |     expect(await ownerStatuses()).toEqual({
  303 |       jobs: 200,
  304 |       settings: 200,
  305 |       schedule: 200,
  306 |       tips: 403,
  307 |       // P4 (connect your own Gusto) sends approved hours: TIMECARDS.
  308 |       provider: 200,
  309 |     });
  310 |     // Running payroll through RestauNax (P5) is PAYROLL only.
  311 |     const provider = await payrollProviderRaw(
  312 |       ownerToken,
  313 |       restaurantId,
  314 |       "GET",
  315 |       ""
  316 |     );
  317 |     expect(provider.data.data.payrollEntitled).toBe(false);
  318 |     const embedded = await payrollProviderRaw(
  319 |       ownerToken,
  320 |       restaurantId,
  321 |       "POST",
  322 |       "/embedded/start",
  323 |       { legalName: `Automation ${runId} LLC`, acceptTerms: true }
  324 |     );
> 325 |     expect(embedded.status).toBe(400);
      |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  326 |     expect(String(embedded.data.message)).toMatch(
  327 |       /RestauNax Payroll is its own add-on/
  328 |     );
  329 | 
  330 |     // The clock-in rule is OFF until the owner picks one; with SCHEDULING
  331 |     // the POS gets whatever they pick.
  332 |     expect((await timeClock()).clockInRule).toBe("OFF");
  333 |     const rule = await payrollRaw(
  334 |       ownerToken,
  335 |       restaurantId,
  336 |       "PUT",
  337 |       "/settings",
  338 |       {
  339 |         scheduling: { clockInRule: "WARN" },
  340 |       }
  341 |     );
  342 |     expect(rule.status, JSON.stringify(rule.data)).toBe(200);
  343 |     const clock = await timeClock();
  344 |     expect(clock.clockInRule).toBe("WARN");
  345 |     expect(
  346 |       list(clock.breakTypes)
  347 |         .map((b) => b.id)
  348 |         .sort()
  349 |     ).toEqual(["meal", "rest"]);
  350 |     expect(await staffAppRequests()).toMatchObject({
  351 |       requests: true,
  352 |       schedule: true,
  353 |       hours: true,
  354 |       tips: false,
  355 |       payStubs: false,
  356 |     });
  357 | 
  358 |     // Data made under SCHEDULING, to prove it survives the add-on going.
  359 |     const job = await createStaffJobRaw(ownerToken, restaurantId, {
  360 |       name: `Line cook ${runId}`,
  361 |       defaultHourlyRateCents: 1700,
  362 |     });
  363 |     expect(job.status, JSON.stringify(job.data)).toBe(201);
  364 |     jobId = String(job.data.data?.id);
  365 |     const held = await setMemberJobsRaw(
  366 |       ownerToken,
  367 |       restaurantId,
  368 |       ownerMemberId,
  369 |       [{ jobId, isPrimary: true }]
  370 |     );
  371 |     expect(held.status, JSON.stringify(held.data)).toBe(200);
  372 |     const shift = await createShiftRaw(ownerToken, restaurantId, {
  373 |       staffMemberId: ownerMemberId,
  374 |       jobId,
  375 |       startAt: `${SHIFT_DATE}T18:00:00.000Z`,
  376 |       endAt: `${SHIFT_DATE}T22:00:00.000Z`,
  377 |     });
  378 |     expect(shift.status, JSON.stringify(shift.data)).toBe(201);
  379 |     shiftId = String(shift.data.data?.shift.id);
  380 | 
  381 |     // The POS job picker now offers it.
  382 |     const me = list((await timeClock()).data).find(
  383 |       (s) => s.id === ownerMemberId
  384 |     );
  385 |     expect(list(me?.jobs).length).toBe(1);
  386 |   });
  387 | 
  388 |   test("TC-567: SCHEDULING + TIP_MANAGEMENT, then Tip Management alone — tips without the schedule", async () => {
  389 |     await grant("TIP_MANAGEMENT");
  390 |     expect(await features()).toEqual(
  391 |       ["SCHEDULING", "TIMECARDS", "TIP_MANAGEMENT"].sort()
  392 |     );
  393 |     expect((await ownerStatuses()).tips).toBe(200);
  394 |     const provider = await payrollProviderRaw(
  395 |       ownerToken,
  396 |       restaurantId,
  397 |       "GET",
  398 |       ""
  399 |     );
  400 |     expect(provider.data.data.payrollEntitled, "tips aren't payroll").toBe(
  401 |       false
  402 |     );
  403 | 
  404 |     // Tip Management on its own: it brings TIMECARDS (tips split by hours).
  405 |     await remove("SCHEDULING");
  406 |     expect(await features()).toEqual(["TIMECARDS", "TIP_MANAGEMENT"].sort());
  407 |     expect(await ownerStatuses()).toEqual({
  408 |       jobs: 200,
  409 |       settings: 200,
  410 |       schedule: 403,
  411 |       tips: 200,
  412 |       provider: 200,
  413 |     });
  414 |     // Losing SCHEDULING turns the saved WARN rule off on the POS.
  415 |     expect((await timeClock()).clockInRule).toBe("OFF");
  416 |     expect(await staffAppRequests()).toMatchObject({
  417 |       requests: false,
  418 |       schedule: false,
  419 |       hours: true,
  420 |       tips: true,
  421 |     });
  422 |   });
  423 | 
  424 |   test("TC-568: PAYROLL alone brings tips and timecards; Tip Management can't be bought on top; TIMECARDS is never granted alone", async () => {
  425 |     await remove("TIP_MANAGEMENT");
```