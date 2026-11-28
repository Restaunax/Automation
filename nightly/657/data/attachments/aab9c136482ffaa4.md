# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos/25-gift-card-care.spec.ts >> POS gift card care (API) >> TC-2024: any signed-in staff member finds a card, and an unknown or foreign code answers the same 404
- Location: tests/pos/25-gift-card-care.spec.ts:393:9

# Error details

```
Error: [gc-care] owner staff row: {"success":true,"data":[]}
```

# Test source

```ts
  221 |         data: {
  222 |           isThisDevice: boolean;
  223 |           session: {
  224 |             expectedCash: number;
  225 |           } | null;
  226 |         }[];
  227 |       }>(tablet, "GET", "/register/overview", undefined, owner.session);
  228 |       expect(r.status, JSON.stringify(r.data)).toBe(200);
  229 |       const mine = r.data.data.find((d) => d.isThisDevice);
  230 |       expect(mine?.session, "this device has an open drawer").toBeTruthy();
  231 |       return mine!.session!;
  232 |     };
  233 |     const sellCash = (session: string, amount: number, extra = {}) =>
  234 |       gc<{ data: { giftCardId: string; code: string } }>(
  235 |         session,
  236 |         "POST",
  237 |         "/sell",
  238 |         {
  239 |           amount,
  240 |           tender: "CASH",
  241 |           deliveryMethod: "PHYSICAL",
  242 |           idempotencyKey: randomUUID(),
  243 |           ...extra,
  244 |         }
  245 |       );
  246 |     const details = (session: string, code: string) =>
  247 |       gc<{ data: TabletDetails }>(session, "POST", "/details", { code });
  248 |     const refusal = (r: { data: unknown }) => {
  249 |       const body = r.data as Refusal;
  250 |       expect(looksLikeKey(body.error), `error text: ${body.error}`).toBe(false);
  251 |       return body;
  252 |     };
  253 |     const mint = async (
  254 |       firstName: string,
  255 |       pin: string,
  256 |       body: Record<string, unknown>
  257 |     ) => {
  258 |       const r = await createPinStaffTabletRaw(tablet, owner.session, {
  259 |         firstName,
  260 |         lastName: "Server",
  261 |         pin,
  262 |         ...body,
  263 |       });
  264 |       expect(r.status, JSON.stringify(r.data)).toBe(201);
  265 |       const id = String((r.data.data as { id: string }).id);
  266 |       return { id, session: await tabletStaffSignIn(tablet, id, pin) };
  267 |     };
  268 |     const approval = () => ({
  269 |       managerPin: owner.pin,
  270 |       approverStaffMemberId: owner.id,
  271 |     });
  272 | 
  273 |     test.beforeAll(async () => {
  274 |       test.setTimeout(240_000);
  275 |       if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  276 |       adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  277 |       const tenant = await createSecondOwner(adminToken, runId, {
  278 |         alwaysFresh: true,
  279 |       });
  280 |       if (!tenant.restaurantId) throw new Error("[gc-care] no tenant");
  281 |       rid = tenant.restaurantId;
  282 |       ownerToken = tenant.accessToken;
  283 |       // Probe before spending anything: no owner routes, nothing to seed.
  284 |       present = await probeOwnerGiftCards(ownerToken, rid);
  285 |       if (!present) return;
  286 | 
  287 |       await setRestaurantPublishedApi(adminToken, rid, true);
  288 |       await ensureBusinessHours(ownerToken, rid);
  289 |       const onboard = await stripeTestOnboardingRaw(ownerToken, rid);
  290 |       if (onboard.status !== 200)
  291 |         throw new Error(`[gc-care] stripe: ${JSON.stringify(onboard.data)}`);
  292 |       const cfg = await putGiftCardConfigAdminRaw(adminToken, rid, {
  293 |         isEnabled: true,
  294 |         allowPhysicalActivation: true,
  295 |         allowCashFunding: true,
  296 |       });
  297 |       if (!cfg.ok)
  298 |         throw new Error(`[gc-care] config: ${JSON.stringify(cfg.data)}`);
  299 |       tz = (await getRestaurantTimeZonePublic(rid)) || tz;
  300 | 
  301 |       const device = await createTabletDevice(
  302 |         adminToken,
  303 |         rid,
  304 |         `auto-gc-care-${runId}`
  305 |       );
  306 |       deviceId = device.id;
  307 |       tablet = await tabletLogin(device.name, device.code);
  308 |       const ownerMember = await setOwnerPosPin(ownerToken, rid, owner.pin);
  309 |       owner.id = ownerMember;
  310 |       owner.session = await tabletStaffSignIn(tablet, ownerMember, owner.pin);
  311 |       // The owner's staff row, for the name card history shows (TC-2024).
  312 |       const staff = await ownerStaffRaw(ownerToken, rid, "GET");
  313 |       const row = (
  314 |         (staff.data.data ?? []) as {
  315 |           id: string;
  316 |           firstName?: string;
  317 |           lastName?: string;
  318 |         }[]
  319 |       ).find((s) => s.id === ownerMember);
  320 |       if (!row?.firstName)
> 321 |         throw new Error(
      |               ^ Error: [gc-care] owner staff row: {"success":true,"data":[]}
  322 |           `[gc-care] owner staff row: ${JSON.stringify(staff.data)}`
  323 |         );
  324 |       const last = row.lastName?.trim();
  325 |       owner.label = last ? `${row.firstName} ${last[0]}.` : row.firstName;
  326 | 
  327 |       Object.assign(dee, await mint("Dee", dee.pin, { staffRole: "STAFF" }));
  328 |       Object.assign(
  329 |         rae,
  330 |         await mint("Rae", rae.pin, {
  331 |           staffRole: "STAFF",
  332 |           capabilityRevokes: ["SELL_GIFT_CARDS"],
  333 |         })
  334 |       );
  335 |       Object.assign(
  336 |         sam,
  337 |         await mint("Sam", sam.pin, {
  338 |           staffRole: "SHIFT_LEAD",
  339 |           capabilityGrants: ["MANAGE_GIFT_CARDS"],
  340 |         })
  341 |       );
  342 |       // The drawer is the owner's from here on (see the header).
  343 |       sessionId = await openRegisterSessionPos(tablet, owner.session, 100);
  344 | 
  345 |       // cashCard: the owner sells $25 cash, print-only.
  346 |       const sold = await sellCash(owner.session, 25);
  347 |       expect(sold.status, JSON.stringify(sold.data)).toBe(201);
  348 |       cashCard = { id: sold.data.data.giftCardId, code: sold.data.data.code };
  349 |       recordGiftCardForCleanup(cashCard.id);
  350 | 
  351 |       // emailCard: the owner sells $40 cash, emailed to a recipient.
  352 |       const emailed = await sellCash(owner.session, 40, {
  353 |         deliveryMethod: "EMAIL",
  354 |         recipientEmail: emailRecipient,
  355 |       });
  356 |       expect(emailed.status, JSON.stringify(emailed.data)).toBe(201);
  357 |       emailCard = {
  358 |         id: emailed.data.data.giftCardId,
  359 |         code: emailed.data.data.code,
  360 |       };
  361 |       recordGiftCardForCleanup(emailCard.id);
  362 | 
  363 |       // importedCard: opening balance from a migration.
  364 |       const imported = await seedFundedGiftCard(adminToken, rid, 15);
  365 |       importedCard = { id: imported.id, code: imported.code };
  366 |       recordGiftCardForCleanup(importedCard.id);
  367 | 
  368 |       // The stranger tenant and its one card.
  369 |       const stranger = await createSecondOwner(adminToken, `${runId}t`, {
  370 |         alwaysFresh: true,
  371 |       });
  372 |       if (!stranger.restaurantId) throw new Error("[gc-care] no stranger");
  373 |       strangerRid = stranger.restaurantId;
  374 |       const foreign = await seedFundedGiftCard(adminToken, strangerRid, 10);
  375 |       strangerCode = foreign.code;
  376 |       recordGiftCardForCleanup(foreign.id);
  377 |     });
  378 | 
  379 |     test.afterAll(async () => {
  380 |       if (!adminToken) return;
  381 |       if (rid && deviceId)
  382 |         await deactivateTabletDevice(adminToken, rid, deviceId).catch(() => {});
  383 |       for (const id of [rid, strangerRid]) {
  384 |         if (id) await deleteTestRestaurant(adminToken, id).catch(() => {});
  385 |       }
  386 |     });
  387 | 
  388 |     test.beforeEach(async () => {
  389 |       await allure.label("feature", "POS gift card care");
  390 |       await allure.label("severity", "critical");
  391 |     });
  392 | 
  393 |     test("TC-2024: any signed-in staff member finds a card, and an unknown or foreign code answers the same 404", async () => {
  394 |       gate();
  395 |       const r = await details(dee.session, cashCard.code);
  396 |       expect(r.status, JSON.stringify(r.data)).toBe(200);
  397 |       const d = r.data.data;
  398 |       expect(isMaskedCode(d.displayCode)).toBe(true);
  399 |       expect(d.heldHere).toBe(true);
  400 |       expect(d.history[0]).toMatchObject({
  401 |         kind: "SOLD",
  402 |         performedBy: owner.label,
  403 |       });
  404 |       expect(looksLikeKey(d.statusText)).toBe(false);
  405 |       expect(looksLikeKey(d.history[0]?.label)).toBe(false);
  406 |       expect(JSON.stringify(r.data)).not.toContain(cashCard.code);
  407 | 
  408 |       const web = await details(dee.session, emailCard.code);
  409 |       expect(web.status, JSON.stringify(web.data)).toBe(200);
  410 |       expect(web.data.data.recipient?.emailMasked).toMatch(MASKED_EMAIL);
  411 |       expect(JSON.stringify(web.data)).not.toContain(emailRecipient);
  412 | 
  413 |       const foreign = await details(dee.session, strangerCode);
  414 |       const randomCode = Array.from(
  415 |         { length: 16 },
  416 |         () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
  417 |       ).join("");
  418 |       const unknown = await details(dee.session, randomCode);
  419 |       expect(foreign.status, JSON.stringify(foreign.data)).toBe(404);
  420 |       expect(unknown.status, JSON.stringify(unknown.data)).toBe(404);
  421 |       expect(refusal(foreign)).toMatchObject({
```