# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos/08-register-cash.spec.ts >> POS — Register / Cash Drawer >> TC-427: DEVICE_NOT_REGISTER — a KITCHEN_DISPLAY device refuses register/open
- Location: tests/pos/08-register-cash.spec.ts:316:7

# Error details

```
Error: Restaurant owners can only provision Server or Kitchen Display devices. Contact a platform admin for register or kiosk devices.

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 403
```

# Test source

```ts
  235 |           status === "REFUNDED"
  236 |         )
  237 |           continue;
  238 |         const cancel = await cancelTabletOrderRaw(
  239 |           tabletToken,
  240 |           staffSession,
  241 |           orderId,
  242 |           "Automation cleanup"
  243 |         );
  244 |         if (!cancel.ok && registerOpenOnDevice1) {
  245 |           // Settled legs block cancel — close it out with cash instead.
  246 |           await settleTabCashRaw(tabletToken, staffSession, orderId, {
  247 |             amount: round2(Number(read.data?.total ?? 0)),
  248 |             cashTendered: 10_000,
  249 |             idempotencyKey: `cleanup-${orderId}`,
  250 |           });
  251 |         }
  252 |       } catch (err) {
  253 |         // Best-effort: the tenant is archived below regardless — a stray
  254 |         // order on a throwaway restaurant is harmless, a teardown failure
  255 |         // masking the test results above is not.
  256 |         console.warn(`[register-cash] cleanup failed for ${orderId}:`, err);
  257 |       }
  258 |     }
  259 |     if (registerOpenOnDevice1) {
  260 |       // Best-effort: whatever the true expected total is, an oversized
  261 |       // countedCash still closes the session so it doesn't linger against
  262 |       // the throwaway tenant.
  263 |       await closeRegisterSessionPosRaw(tabletToken, staffSession, {
  264 |         countedCash: 1_000_000,
  265 |       }).catch(() => {
  266 |         /* tenant is about to be archived regardless */
  267 |       });
  268 |     }
  269 |     const t = await freshOwnerToken().catch(() => token);
  270 |     // Best-effort: the restaurant is about to be archived regardless, so a
  271 |     // failed revoke here is not worth surfacing as a test failure.
  272 |     await deleteFeatureOverrideAdminRaw(
  273 |       adminToken,
  274 |       restaurantId,
  275 |       "TABLE_RESERVATIONS"
  276 |     ).catch(() => {});
  277 |     // Best-effort: the throwaway restaurant these belong to is archived
  278 |     // below regardless — a stray menu item/group orphaned by a failed
  279 |     // delete here is harmless, and a teardown failure would only mask the
  280 |     // test results above.
  281 |     if (item)
  282 |       await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
  283 |     if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  284 |     if (device) await deactivateTabletDevice(t, restaurantId, device.id);
  285 |     if (secondDevice)
  286 |       await deactivateTabletDevice(t, restaurantId, secondDevice.id);
  287 |     // Best-effort: a failed archive orphans a harmless throwaway tenant
  288 |     // rather than masking the test results above with a teardown failure.
  289 |     if (restaurantId && !process.env.OWNER2_EMAIL)
  290 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  291 |   });
  292 | 
  293 |   test.beforeEach(async () => {
  294 |     await allure.label("feature", "POS Register / Cash Drawer");
  295 |     await allure.label("severity", "critical");
  296 |     token = await freshOwnerToken();
  297 |   });
  298 | 
  299 |   test("TC-426: settle-cash is refused with no open register — asserted BEFORE any register/open in this file", async () => {
  300 |     await allure.description(
  301 |       "assertDrawerOperableBy returns null when NO session is open on this " +
  302 |         "device; settle-cash then answers 400 with error:register.notOpen " +
  303 |         "('There is no open register on this device.'). This runs first in " +
  304 |         "the file, before device #1 ever opens a session."
  305 |     );
  306 |     const { id } = await openCheck(`Register Gate ${runId}`, 1);
  307 |     const attempt = await settleTabCashRaw(tabletToken, staffSession, id, {
  308 |       amount: ITEM_PRICE,
  309 |       cashTendered: ITEM_PRICE,
  310 |       idempotencyKey: `tc426-${runId}`,
  311 |     });
  312 |     expect(attempt.status, msg(attempt.data)).toBe(400);
  313 |     expect(msg(attempt.data).toLowerCase()).toContain("no open register");
  314 |   });
  315 | 
  316 |   test("TC-427: DEVICE_NOT_REGISTER — a KITCHEN_DISPLAY device refuses register/open", async () => {
  317 |     await allure.description(
  318 |       "A second device, flipped to KITCHEN_DISPLAY by the owner (device-mode " +
  319 |         "PATCH), signs in the SAME manager and calls register/open → 400 " +
  320 |         "with error:register.notRegisterDevice ('This device is not a " +
  321 |         "register, so it has no cash drawer.'). The ONE deliberate second " +
  322 |         "tabletLogin in this task."
  323 |     );
  324 |     secondDevice = await createTabletDevice(
  325 |       adminToken,
  326 |       restaurantId,
  327 |       `Automation Register KDS ${runId}`
  328 |     );
  329 |     const modeChange = await updateDeviceModeOwnerRaw(
  330 |       token,
  331 |       restaurantId,
  332 |       secondDevice.id,
  333 |       "KITCHEN_DISPLAY"
  334 |     );
> 335 |     expect(modeChange.status, msg(modeChange.data)).toBe(200);
      |                                                     ^ Error: Restaurant owners can only provision Server or Kitchen Display devices. Contact a platform admin for register or kiosk devices.
  336 | 
  337 |     const secondTabletToken = await tabletLogin(
  338 |       secondDevice.name,
  339 |       secondDevice.code
  340 |     );
  341 |     const secondSession = await tabletStaffSignIn(
  342 |       secondTabletToken,
  343 |       managerStaffMemberId,
  344 |       managerPin
  345 |     );
  346 | 
  347 |     const attempt = await openRegisterSessionPosRaw(
  348 |       secondTabletToken,
  349 |       secondSession,
  350 |       { openingFloat: 100 }
  351 |     );
  352 |     expect(attempt.status, msg(attempt.data)).toBe(400);
  353 |     expect(msg(attempt.data).toLowerCase()).toContain("not a register");
  354 |   });
  355 | 
  356 |   test("TC-428: open succeeds once; a second open on the same device is refused", async () => {
  357 |     await allure.description(
  358 |       "POST register/open {openingFloat:100} → 201 on device #1 (a " +
  359 |         "REGISTER-mode device the manager self-authorizes via " +
  360 |         "OPEN_REGISTER). A second open while one is already active → 400 " +
  361 |         "error:register.alreadyOpen."
  362 |     );
  363 |     const opened = await openRegisterSessionPosRaw(tabletToken, staffSession, {
  364 |       openingFloat: 100,
  365 |     });
  366 |     expect(opened.status, msg(opened.data)).toBe(201);
  367 |     expect(unwrap(opened).sessionId).toBeTruthy();
  368 |     registerOpenOnDevice1 = true;
  369 | 
  370 |     const again = await openRegisterSessionPosRaw(tabletToken, staffSession, {
  371 |       openingFloat: 50,
  372 |     });
  373 |     expect(again.status, msg(again.data)).toBe(400);
  374 |     expect(msg(again.data).toLowerCase()).toContain("already open");
  375 |   });
  376 | 
  377 |   test("TC-429: cash math — cashTendered over the amount computes exact change; under the amount is refused", async () => {
  378 |     await allure.description(
  379 |       "settle-cash: cashTendered=15 against a $10 leg → cashChange 5. " +
  380 |         "cashTendered=5 against a $10 leg → 400 (cashTendered checked BEFORE " +
  381 |         "the drawer gate, so this fires on its own input validation)."
  382 |     );
  383 |     const { id } = await openCheck(`Cash Math ${runId}`, 1); // total 10
  384 | 
  385 |     const over = await settleTabCashRaw(tabletToken, staffSession, id, {
  386 |       amount: ITEM_PRICE,
  387 |       cashTendered: 15,
  388 |       idempotencyKey: `tc429-over-${runId}`,
  389 |     });
  390 |     expect(over.status, msg(over.data)).toBe(200);
  391 |     expect(over.data.cashChange).toBe(5);
  392 |     expect(over.data.closed).toBe(true);
  393 | 
  394 |     const { id: id2 } = await openCheck(`Cash Math Under ${runId}`, 1);
  395 |     const under = await settleTabCashRaw(tabletToken, staffSession, id2, {
  396 |       amount: ITEM_PRICE,
  397 |       cashTendered: 5,
  398 |       idempotencyKey: `tc429-under-${runId}`,
  399 |     });
  400 |     expect(under.status, msg(under.data)).toBe(400);
  401 |   });
  402 | 
  403 |   test("TC-430: idempotency replay — the same key twice produces exactly ONE payment row", async () => {
  404 |     await allure.description(
  405 |       "Two settle-cash calls with the SAME idempotencyKey: the first is a " +
  406 |         "genuine leg, the second replays it (replayed:true, same leg id, " +
  407 |         "remaining unchanged) — the owner statistics detail endpoint (the " +
  408 |         "one whose Prisma `include` actually selects `payments` — " +
  409 |         "getOrderFullRaw's own route does NOT) shows exactly one SUCCEEDED " +
  410 |         "payment for this order."
  411 |     );
  412 |     const { id } = await openCheck(`Idempotent ${runId}`, 2); // total 20
  413 |     const key = `tc430-${runId}`;
  414 | 
  415 |     const first = await settleTabCashRaw(tabletToken, staffSession, id, {
  416 |       amount: 10,
  417 |       cashTendered: 10,
  418 |       idempotencyKey: key,
  419 |     });
  420 |     expect(first.status, msg(first.data)).toBe(200);
  421 |     const legId = first.data.leg?.id;
  422 |     expect(first.data.remaining).toBe(10);
  423 | 
  424 |     const replay = await settleTabCashRaw(tabletToken, staffSession, id, {
  425 |       amount: 10,
  426 |       cashTendered: 10,
  427 |       idempotencyKey: key,
  428 |     });
  429 |     expect(replay.status, msg(replay.data)).toBe(200);
  430 |     expect(replay.data.replayed).toBe(true);
  431 |     expect(replay.data.leg?.id).toBe(legId);
  432 |     expect(replay.data.remaining).toBe(10);
  433 | 
  434 |     const full = await getOrderStatisticsDetailRaw(token, id);
  435 |     expect(full.status, msg(full.data)).toBe(200);
```