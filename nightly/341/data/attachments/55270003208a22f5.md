# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-ux-audit.spec.ts >> UX-audit fixes (API) >> TC-658: the account language is saved
- Location: tests/dashboard/owner/api-ux-audit.spec.ts:457:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "\"locale\":\"es\""
Received string:    "{\"id\":\"66cf7e62-3726-489f-a30f-35ac58ec5df8\",\"email\":\"auto-ux-ola-734c47c4@demomailtrap.co\",\"firstName\":\"Ola\",\"lastName\":\"Ux\",\"role\":\"RESTAURANT_STAFF\",\"ownedRestaurants\":[],\"affiliate\":null,\"permissions\":[]}"
```

# Test source

```ts
  363 |       tabletToken,
  364 |       "PATCH",
  365 |       `/staff/manage/${kim.id}`,
  366 |       { tracksTime: false },
  367 |       owner.session
  368 |     );
  369 |     expect(off.status, JSON.stringify(off.data)).toBe(200);
  370 |     expect((await staffRow(kim.id))?.tracksTime).toBe(false);
  371 |     const clock = await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock");
  372 |     expect(list(clock.data.data).find((s) => s.id === kim.id)?.tracksTime).toBe(
  373 |       false
  374 |     );
  375 |     // A non-boolean is ignored, not saved.
  376 |     await tabletRaw(
  377 |       tabletToken,
  378 |       "PATCH",
  379 |       `/staff/manage/${kim.id}`,
  380 |       { tracksTime: "yes" },
  381 |       owner.session
  382 |     );
  383 |     expect((await staffRow(kim.id))?.tracksTime).toBe(false);
  384 |     await tabletRaw(
  385 |       tabletToken,
  386 |       "PATCH",
  387 |       `/staff/manage/${kim.id}`,
  388 |       { tracksTime: true },
  389 |       owner.session
  390 |     );
  391 | 
  392 |     expect((await staffRow(ola.id))?.hasAccount).toBe(true);
  393 |     expect((await staffRow(pat.id))?.hasAccount).toBe(false);
  394 |   });
  395 | 
  396 |   test("TC-657: default discount / comp / void reasons — EN and ES text, a saved list wins, a saved empty list stays empty", async () => {
  397 |     const read = async (lang: string) => {
  398 |       const r = await getRestaurantSettingsRaw(ownerToken, restaurantId, {
  399 |         "Accept-Language": lang,
  400 |       });
  401 |       expect(r.status).toBe(200);
  402 |       return r.data as Rec;
  403 |     };
  404 |     let en = await read("en");
  405 |     expect(en.posApprovalPolicy.reasons.discount).toMatchObject({
  406 |       usesDefaults: true,
  407 |     });
  408 |     expect(en.posApprovalPolicy.reasons.discount.options).toContain(
  409 |       "Employee meal"
  410 |     );
  411 |     expect(en.posReasonDefaults.void).toContain("Entered by mistake");
  412 |     const es = await read("es");
  413 |     expect(es.posApprovalPolicy.reasons.discount.options).toContain(
  414 |       "Comida de empleado"
  415 |     );
  416 | 
  417 |     const saved = await updateRestaurantSettingsRaw(ownerToken, restaurantId, {
  418 |       posApprovalPolicy: {
  419 |         staffDiscountAllowancePercent: 0,
  420 |         customItems: "ANYONE",
  421 |         reasons: {
  422 |           discount: { required: false, options: [`House rule ${runId}`] },
  423 |           comp: { required: false, options: [], usesDefaults: false },
  424 |           void: { required: false, options: [], usesDefaults: true },
  425 |         },
  426 |       },
  427 |     });
  428 |     expect(saved.status, JSON.stringify(saved.data)).toBe(200);
  429 |     en = await read("en");
  430 |     expect(en.posApprovalPolicy.reasons.discount).toMatchObject({
  431 |       usesDefaults: false,
  432 |       options: [`House rule ${runId}`],
  433 |     });
  434 |     expect(en.posApprovalPolicy.reasons.comp).toMatchObject({
  435 |       usesDefaults: false,
  436 |       options: [],
  437 |     });
  438 |     expect(en.posApprovalPolicy.reasons.void.usesDefaults).toBe(true);
  439 | 
  440 |     // The POS gets the same, in its language.
  441 |     const tablet = await tabletRaw<Rec>(
  442 |       tabletToken,
  443 |       "GET",
  444 |       "/settings",
  445 |       undefined,
  446 |       undefined,
  447 |       { "Accept-Language": "es" }
  448 |     );
  449 |     expect(tablet.status).toBe(200);
  450 |     const reasons = (tablet.data.data ?? tablet.data).posApprovalPolicy.reasons;
  451 |     expect(reasons.void).toMatchObject({ usesDefaults: true });
  452 |     expect(reasons.void.options).toContain("Ingresado por error");
  453 |     expect(reasons.discount.options).toEqual([`House rule ${runId}`]);
  454 |     expect(reasons.comp.options).toEqual([]);
  455 |   });
  456 | 
  457 |   test("TC-658: the account language is saved", async () => {
  458 |     const set = await usersRaw(ola.token, "PATCH", "/me/locale", {
  459 |       locale: "es",
  460 |     });
  461 |     expect(set.status, JSON.stringify(set.data)).toBe(200);
  462 |     const me = await usersRaw<Rec>(ola.token, "GET", "/me");
> 463 |     expect(JSON.stringify(me.data)).toContain('"locale":"es"');
      |                                     ^ Error: expect(received).toContain(expected) // indexOf
  464 |     const bad = await usersRaw(ola.token, "PATCH", "/me/locale", {
  465 |       locale: "fr",
  466 |     });
  467 |     expect(bad.status).toBe(400);
  468 |     await usersRaw(ola.token, "PATCH", "/me/locale", { locale: "en" });
  469 |   });
  470 | 
  471 |   test("TC-659: an existing account accepts its invite after signing in", async () => {
  472 |     rex.email = `auto-ux-rex-${runId}@${DOMAIN}`;
  473 |     rex.password = `Automation!Rex-${runId}`;
  474 |     recordUserForCleanup(rex.email);
  475 |     await register({
  476 |       firstName: "Rex",
  477 |       lastName: "Ux",
  478 |       email: rex.email,
  479 |       password: rex.password,
  480 |     });
  481 |     const inv = await inviteStaffRaw(ownerToken, restaurantId, {
  482 |       email: rex.email,
  483 |       firstName: "Rex",
  484 |       lastName: "Ux",
  485 |     });
  486 |     expect(inv.status).toBe(201);
  487 |     rex.id = String(inv.data.data?.staffMemberId);
  488 |     const mail = await waitForEmail(rex.email, {
  489 |       subjectPattern: /added to the team at/i,
  490 |       timeoutMs: 90_000,
  491 |     });
  492 |     const token = extractInviteToken(mail.text_body || mail.html_body);
  493 |     const login = await apiLogin(rex.email, rex.password);
  494 |     const claimed = await claimStaffInviteSignedInRaw(login.accessToken, token);
  495 |     expect(claimed.status, JSON.stringify(claimed.data)).toBe(200);
  496 |     const fresh = await apiLogin(rex.email, rex.password);
  497 |     const me = await staffAppRaw<{ data: Rec }>(
  498 |       fresh.accessToken,
  499 |       "GET",
  500 |       "/me"
  501 |     );
  502 |     expect(list(me.data.data.restaurants)).toEqual([
  503 |       expect.objectContaining({
  504 |         restaurantId,
  505 |         staffMemberId: rex.id,
  506 |         staffAppEnabled: true,
  507 |       }),
  508 |     ]);
  509 |     expect(me.data.data.staffWithoutAppSections).toEqual([]);
  510 |     expect(me.data.data).toHaveProperty("app");
  511 |     expect((await staffRow(rex.id))?.hasAccount).toBe(true);
  512 |   });
  513 | 
  514 |   test("TC-660: an active person without an account gets an account invite", async () => {
  515 |     pia.email = `auto-ux-pia-${runId}@${DOMAIN}`;
  516 |     recordUserForCleanup(pia.email);
  517 |     const inv = await inviteStaffRaw(ownerToken, restaurantId, {
  518 |       email: pia.email,
  519 |       firstName: "Pia",
  520 |       lastName: "Ux",
  521 |     });
  522 |     pia.id = String(inv.data.data?.staffMemberId);
  523 |     await waitForEmail(pia.email, {
  524 |       subjectPattern: /added to the team at/i,
  525 |       timeoutMs: 90_000,
  526 |     });
  527 |     const pin = await ownerStaffRaw(
  528 |       ownerToken,
  529 |       restaurantId,
  530 |       "POST",
  531 |       `/${pia.id}/pin`,
  532 |       {
  533 |         pin: "6491",
  534 |       }
  535 |     );
  536 |     expect(pin.status).toBe(200);
  537 |     expect(await staffRow(pia.id)).toMatchObject({
  538 |       status: "active",
  539 |       hasAccount: false,
  540 |     });
  541 | 
  542 |     const sent = await ownerStaffRaw(
  543 |       ownerToken,
  544 |       restaurantId,
  545 |       "POST",
  546 |       `/${pia.id}/resend-invite`
  547 |     );
  548 |     expect(sent.status, JSON.stringify(sent.data)).toBe(200);
  549 |     const mail = await waitForEmail(pia.email, {
  550 |       subjectPattern: /^Reminder: finish setting up your/,
  551 |       timeoutMs: 90_000,
  552 |     });
  553 |     expect(mail.subject).toContain(restaurantName);
  554 |     expect(extractInviteToken(mail.text_body || mail.html_body)).toBeTruthy();
  555 |   });
  556 | 
  557 |   test("TC-661: payroll settings say where the restaurant is and which overtime preset fits", async () => {
  558 |     const r = await payrollRaw(ownerToken, restaurantId, "GET", "/settings");
  559 |     expect(r.status).toBe(200);
  560 |     expect(r.data.data.location).toEqual({
  561 |       state: "FL",
  562 |       recommendedPreset: "FEDERAL",
  563 |     });
```