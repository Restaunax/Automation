# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-gift-cards-owner.spec.ts >> Owner gift cards — standalone restaurant (API) >> TC-2000: the list and a card's detail show masked codes and resolved text
- Location: tests/dashboard/owner/api-gift-cards-owner.spec.ts:283:9

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
    "amount": 50,
    "balanceAfter": 50,
-   "channel": "WEBSITE",
+   "channel": "UNKNOWN",
    "kind": "SOLD",
    "tender": "CARD",
  }
```

# Test source

```ts
  226 |       recordGiftCardForCleanup(imported.id);
  227 | 
  228 |       // The web card: sold by card at the seed restaurant, the only QA
  229 |       // restaurant whose Stripe setup is finished.
  230 |       const seed = await seedRestaurantForCardSales(adminToken, [50]);
  231 |       S = seed.restaurantId;
  232 |       ownerS = seed.ownerToken;
  233 |       restoreSeed = seed.restore;
  234 |       seedTz = (await getRestaurantTimeZonePublic(S)) || seedTz;
  235 |       seedSoldBefore = await seedWebsiteSold();
  236 |       const pk = String(
  237 |         (await stripeConfigRaw()).data.data?.publishableKey ?? ""
  238 |       );
  239 |       const bought = await buyGiftCardOnline(pk, S, 50, {
  240 |         recipientEmail: webRecipient,
  241 |       });
  242 |       web = { id: bought.giftCardId, code: bought.code };
  243 |       recordGiftCardForCleanup(web.id);
  244 | 
  245 |       batchLabel = `Auto owner stock ${runId}`;
  246 |       const batch = await createGiftCardBatchRaw(adminToken, {
  247 |         restaurantId: A,
  248 |         quantity: 2,
  249 |         label: batchLabel,
  250 |       });
  251 |       if (!batch.ok || !batch.data.data)
  252 |         throw new Error(`[gc-owner] batch: ${JSON.stringify(batch.data)}`);
  253 |       batchId = batch.data.data.id;
  254 | 
  255 |       const b = await createSecondOwner(adminToken, `${runId}b`, {
  256 |         alwaysFresh: true,
  257 |       });
  258 |       if (!b.restaurantId) throw new Error("[gc-owner] no tenant B");
  259 |       B = b.restaurantId;
  260 |       ownerB = b.accessToken;
  261 |       const seededB = await seedFundedGiftCard(adminToken, B, 10);
  262 |       recordGiftCardForCleanup(seededB.id);
  263 |     });
  264 | 
  265 |     test.afterAll(async () => {
  266 |       if (!adminToken) return;
  267 |       await restoreSeed().catch(() => {});
  268 |       for (const id of [batchId, secondBatchId])
  269 |         if (id) await freezeGiftCardBatchRaw(adminToken, id).catch(() => {});
  270 |       for (const id of [A, B, ...extraRestaurants]) {
  271 |         if (id)
  272 |           await deleteTestRestaurant(adminToken, id).catch(() => {
  273 |             /* archive is best-effort; globalTeardown sweeps the users */
  274 |           });
  275 |       }
  276 |     });
  277 | 
  278 |     test.beforeEach(async () => {
  279 |       await allure.label("feature", "Owner gift cards");
  280 |       await allure.label("severity", "critical");
  281 |     });
  282 | 
  283 |     test("TC-2000: the list and a card's detail show masked codes and resolved text", async () => {
  284 |       gate();
  285 |       const list = await asA("GET", "/cards");
  286 |       expect(list.status, JSON.stringify(list.data)).toBe(200);
  287 |       const body = dataOf(list.data);
  288 |       expect(body.total).toBeGreaterThanOrEqual(2);
  289 |       for (const card of body.giftCards as Rec[]) {
  290 |         expect(isMaskedCode(card.displayCode), card.displayCode).toBe(true);
  291 |         if (card.status === "INACTIVE") {
  292 |           // Unsold printed stock has no holder yet.
  293 |           expect(card.heldBy).toBeNull();
  294 |           expect(card.heldHere).toBe(false);
  295 |         } else {
  296 |           expect(card.heldHere).toBe(true);
  297 |           expect(card.heldBy.id).toBe(A);
  298 |         }
  299 |         expect(looksLikeKey(card.statusText), card.statusText).toBe(false);
  300 |       }
  301 |       expect(JSON.stringify(list.data)).not.toContain(imported.code);
  302 | 
  303 |       const last4 = imported.code.replace(/[^A-Za-z0-9]/g, "").slice(-4);
  304 |       const found = await asA("GET", `/cards?search=${last4}`);
  305 |       expect(found.status, JSON.stringify(found.data)).toBe(200);
  306 |       const ids = (dataOf(found.data).giftCards as Rec[]).map((c) => c.id);
  307 |       expect(ids).toEqual([imported.id]);
  308 | 
  309 |       // The web card, at the seed restaurant: found by its last 4 among S's
  310 |       // cards (others may share them), masked, sold on the website by card.
  311 |       const webLast4 = web.code.replace(/[^A-Za-z0-9]/g, "").slice(-4);
  312 |       const atS = await asS("GET", `/cards?search=${webLast4}`);
  313 |       expect(atS.status, JSON.stringify(atS.data)).toBe(200);
  314 |       expect((dataOf(atS.data).giftCards as Rec[]).map((c) => c.id)).toContain(
  315 |         web.id
  316 |       );
  317 |       expect(JSON.stringify(atS.data)).not.toContain(web.code);
  318 | 
  319 |       const detail = await asS("GET", `/cards/${web.id}`);
  320 |       expect(detail.status, JSON.stringify(detail.data)).toBe(200);
  321 |       const card = dataOf(detail.data);
  322 |       const first = (card.history as Rec[]).find(
  323 |         (h) => h.kind === "SOLD"
  324 |       ) as Rec;
  325 |       expect(first, JSON.stringify(card.history)).toBeTruthy();
> 326 |       expect(first).toMatchObject({
      |                     ^ Error: expect(received).toMatchObject(expected)
  327 |         kind: "SOLD",
  328 |         channel: "WEBSITE",
  329 |         tender: "CARD",
  330 |         amount: 50,
  331 |         balanceAfter: 50,
  332 |       });
  333 |       expect(looksLikeKey(first.label), first.label).toBe(false);
  334 |       expect(card.canResend).toBe(true);
  335 |       expect(JSON.stringify(detail.data)).not.toContain(web.code);
  336 | 
  337 |       const impDetail = await asA("GET", `/cards/${imported.id}`);
  338 |       expect(impDetail.status, JSON.stringify(impDetail.data)).toBe(200);
  339 |       const kinds = (dataOf(impDetail.data).history as Rec[]).map(
  340 |         (h) => h.kind
  341 |       );
  342 |       expect(kinds).toContain("IMPORTED");
  343 |       expect(JSON.stringify(impDetail.data)).not.toContain(imported.code);
  344 |     });
  345 | 
  346 |     test("TC-2001: another owner's cards answer 403 on the scope and 404 on the id, like a missing card", async () => {
  347 |       gate();
  348 |       const scopeOfA = { restaurantId: A };
  349 |       const scopeOfB = { restaurantId: B };
  350 |       for (const path of ["/cards", "/reports/summary"]) {
  351 |         const r = await ownerGiftCardRaw<Rec>(ownerB, scopeOfA, "GET", path);
  352 |         expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(403);
  353 |         expect(r.data.code).toBe("FORBIDDEN");
  354 |       }
  355 | 
  356 |       const theirs = await ownerGiftCardRaw<Rec>(
  357 |         ownerB,
  358 |         scopeOfB,
  359 |         "GET",
  360 |         `/cards/${web.id}`
  361 |       );
  362 |       const missing = await ownerGiftCardRaw<Rec>(
  363 |         ownerB,
  364 |         scopeOfB,
  365 |         "GET",
  366 |         `/cards/${randomUUID()}`
  367 |       );
  368 |       expect(theirs.status, JSON.stringify(theirs.data)).toBe(404);
  369 |       expect(theirs.data.code).toBe("CARD_NOT_FOUND");
  370 |       expect(theirs.data).toEqual(missing.data);
  371 | 
  372 |       const noToken = await apiRequestRaw(
  373 |         "GET",
  374 |         `/api/gift-cards/restaurants/${A}/cards`,
  375 |         undefined,
  376 |         undefined,
  377 |         { "X-Restaurant-Id": A }
  378 |       );
  379 |       expect(noToken.status).toBe(401);
  380 | 
  381 |       const attempts: [string, string, unknown][] = [
  382 |         ["POST", `/cards/${web.id}/freeze`, { reason: "Not mine" }],
  383 |         ["POST", `/cards/${web.id}/resend`, undefined],
  384 |         ["PUT", `/cards/${web.id}/recipient`, { recipientEmail: webRecipient }],
  385 |       ];
  386 |       for (const [method, path, body] of attempts) {
  387 |         const r = await ownerGiftCardRaw<Rec>(
  388 |           ownerB,
  389 |           scopeOfB,
  390 |           method as "POST" | "PUT",
  391 |           path,
  392 |           body
  393 |         );
  394 |         expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(404);
  395 |         expect(r.data.code).toBe("CARD_NOT_FOUND");
  396 |       }
  397 |       // Still the seed's card, still untouched.
  398 |       const detail = await asS("GET", `/cards/${web.id}`);
  399 |       expect(dataOf(detail.data).status).toBe("ACTIVE");
  400 |     });
  401 | 
  402 |     test("TC-2002: the owner freezes and unfreezes; no money moves", async () => {
  403 |       gate();
  404 |       const before = await summary();
  405 |       const freeze = (reason: string) =>
  406 |         asA("POST", `/cards/${imported.id}/freeze`, { reason });
  407 | 
  408 |       const empty = await freeze("");
  409 |       expect(empty.status, JSON.stringify(empty.data)).toBe(400);
  410 |       expect(empty.data.code).toBe("REASON_REQUIRED");
  411 |       const system = await freeze(" funding_disputed ");
  412 |       expect(system.status, JSON.stringify(system.data)).toBe(400);
  413 |       expect(system.data.code).toBe("INVALID_REASON");
  414 | 
  415 |       try {
  416 |         const ok = await freeze("Customer lost it");
  417 |         expect(ok.status, JSON.stringify(ok.data)).toBe(200);
  418 |         expect(dataOf(ok.data).status).toBe("FROZEN");
  419 |         expect(dataOf(ok.data).freeze).toMatchObject({
  420 |           origin: "OWNER",
  421 |           canLift: true,
  422 |           reasonText: "Customer lost it",
  423 |         });
  424 |         const again = await freeze("Customer lost it");
  425 |         expect(again.status).toBe(409);
  426 |         expect(again.data.code).toBe("ALREADY_FROZEN");
```