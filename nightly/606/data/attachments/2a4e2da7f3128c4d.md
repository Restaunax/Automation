# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-addon-billing.spec.ts >> Add-on billing — Add-ons page, requests, refusals, Team bundle, payroll headcount (API) >> TC-781: every per-location service is a row with its terms in fields; each one can be requested or says 'talk to us'
- Location: tests/dashboard/owner/api-addon-billing.spec.ts:297:7

# Error details

```
Error: MENU_TVS

expect(received).toEqual(expected) // deep equality

- Expected  - 0
+ Received  + 1

@@ -8,10 +8,11 @@
    "canRequestAdd",
    "canRequestRemove",
    "commitmentEndsAt",
    "committedRemoval",
    "contactUs",
+   "discount",
    "endsAt",
    "feature",
    "includedWith",
    "launchPriceApplied",
    "offer",
```

# Test source

```ts
  219 |     const r = await adminAddonsRaw(
  220 |       adminToken,
  221 |       "POST",
  222 |       `/requests/${requestId}/fulfil`,
  223 |       body
  224 |     );
  225 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  226 |     return r.data.data as Rec;
  227 |   };
  228 | 
  229 |   /** Take every SEED_FEATURES add-on off the seed now, and drop its open requests. */
  230 |   const resetSeed = async () => {
  231 |     if (!seedId || !adminToken) return;
  232 |     const listed = await adminAddonsRaw<Rec[]>(
  233 |       adminToken,
  234 |       "GET",
  235 |       `/restaurants/${seedId}`
  236 |     );
  237 |     for (const a of list(listed.data)) {
  238 |       const feature = String((a.addon as Rec | null)?.feature ?? "");
  239 |       if (a.isActive && a.activeInstanceId && SEED_FEATURES.includes(feature))
  240 |         await adminAddonsRaw(
  241 |           adminToken,
  242 |           "DELETE",
  243 |           `/restaurants/instances/${String(a.activeInstanceId)}`
  244 |         );
  245 |     }
  246 |     if (!live || !seedToken) return;
  247 |     for (const r of await hqList("OPEN")) {
  248 |       const feature = String((r.addon as Rec | null)?.feature ?? "");
  249 |       if (
  250 |         (r.restaurant as Rec | null)?.id === seedId &&
  251 |         SEED_FEATURES.includes(feature)
  252 |       )
  253 |         await ownerAddonRequestCancelRaw(seedToken, seedId, String(r.id));
  254 |     }
  255 |   };
  256 | 
  257 |   test.beforeAll(async () => {
  258 |     test.setTimeout(180_000);
  259 |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  260 |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  261 |     const tenant = await createSecondOwner(adminToken, `${runId}a`, {
  262 |       alwaysFresh: true,
  263 |     });
  264 |     const other = await createSecondOwner(adminToken, `${runId}b`, {
  265 |       alwaysFresh: true,
  266 |     });
  267 |     if (!tenant.restaurantId || !other.restaurantId)
  268 |       throw new Error("[api-addon-billing] no tenant");
  269 |     restaurantId = tenant.restaurantId;
  270 |     ownerToken = tenant.accessToken;
  271 |     ownerEmail = tenant.email;
  272 |     otherId = other.restaurantId;
  273 |     otherOwner = other.accessToken;
  274 |     live = await addonRequestsLive(adminToken);
  275 |     stage6 = live && (await probeRequestFlowStage6(adminToken));
  276 |     if (OWNER_EMAIL && OWNER_PASSWORD) {
  277 |       seedToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  278 |       seedId = readSharedState().restaurantId;
  279 |     }
  280 |     if (live) await resetSeed();
  281 |   });
  282 | 
  283 |   test.afterAll(async () => {
  284 |     test.setTimeout(120_000);
  285 |     if (live) await resetSeed().catch(() => {});
  286 |     for (const id of [restaurantId, otherId]) {
  287 |       if (adminToken && id)
  288 |         await deleteTestRestaurant(adminToken, id).catch(() => {});
  289 |     }
  290 |   });
  291 | 
  292 |   test.beforeEach(async () => {
  293 |     await allure.label("feature", "Add-on billing");
  294 |     await allure.label("severity", "critical");
  295 |   });
  296 | 
  297 |   test("TC-781: every per-location service is a row with its terms in fields; each one can be requested or says 'talk to us'", async () => {
  298 |     requireAddonRequests(live);
  299 |     const data = await rows();
  300 |     expect(data).toMatchObject({
  301 |       canRequest: true,
  302 |       subscriptionStatus: null,
  303 |       payrollBilling: null,
  304 |     });
  305 |     expect(data).not.toHaveProperty("canPurchase");
  306 |     const features = list(data.features);
  307 |     expect(features.map((f) => f.feature)).toEqual(
  308 |       expect.arrayContaining([
  309 |         "SCHEDULING",
  310 |         "TIP_MANAGEMENT",
  311 |         "TEAM_BUNDLE",
  312 |         "PAYROLL",
  313 |         "ACCOUNTING_SYNC",
  314 |       ])
  315 |     );
  316 |     const offers: string[] = [];
  317 |     for (const f of features) {
  318 |       const at = String(f.feature);
> 319 |       expect(Object.keys(f).sort(), at).toEqual([...ROW_FIELDS].sort());
      |                                         ^ Error: MENU_TVS
  320 |       expect(f.source, at).toBeNull();
  321 |       expect(f, at).toMatchObject({
  322 |         canRequestRemove: false,
  323 |         activeAddonId: null,
  324 |         pendingAdd: null,
  325 |         pendingRemove: null,
  326 |         replaces: [],
  327 |       });
  328 |       if (f.offer) {
  329 |         offers.push(at);
  330 |         expect(Object.keys(f.offer as Rec)).toEqual(
  331 |           expect.arrayContaining(OFFER_FIELDS)
  332 |         );
  333 |         // One trial per feature, ever: a fresh restaurant is still eligible.
  334 |         if ((f.offer as Rec).trialDays)
  335 |           expect((f.offer as Rec).trialEligible).toBe(true);
  336 |         expect(f, at).toMatchObject({
  337 |           canRequestAdd: true,
  338 |           requestAddonId: (f.offer as Rec).addonId,
  339 |           contactUs: false,
  340 |         });
  341 |       } else {
  342 |         // No price in the catalog: "talk to us", never a disabled button.
  343 |         expect(f, at).toMatchObject({
  344 |           canRequestAdd: false,
  345 |           requestAddonId: null,
  346 |           contactUs: true,
  347 |         });
  348 |       }
  349 |     }
  350 |     // The selfServe switch is gone: every active flat add-on in the catalog
  351 |     // is offered (QA's catalog has one for each back-office service).
  352 |     expect(offers).toEqual(
  353 |       expect.arrayContaining(["SCHEDULING", "TIP_MANAGEMENT", "TEAM_BUNDLE"])
  354 |     );
  355 |     for (const a of list(data.addons)) {
  356 |       for (const gone of GONE_FIELDS) expect(a).not.toHaveProperty(gone);
  357 |       expect(a).toMatchObject({ pendingAdd: null, pendingRemove: null });
  358 |       expect(typeof a.canRequestAdd).toBe("boolean");
  359 |       expect(typeof a.canRequestRemove).toBe("boolean");
  360 |     }
  361 |     test.info().annotations.push({
  362 |       type: "catalogue",
  363 |       description: `requestable on QA: ${offers.join(", ") || "none"}`,
  364 |     });
  365 |   });
  366 | 
  367 |   test("TC-782: the old buy/remove routes are gone (404); a request is refused in words; another owner can't look or ask", async () => {
  368 |     requireAddonRequests(live);
  369 |     const offer = (row(await rows(), "SCHEDULING")?.offer as Rec).addonId;
  370 |     expect(offer, "QA's catalog offers Scheduling").toBeTruthy();
  371 | 
  372 |     // The old owner purchase and removal no longer exist.
  373 |     expect(
  374 |       (
  375 |         await ownerAddonsRaw(ownerToken, restaurantId, "POST", {
  376 |           addonId: offer,
  377 |         })
  378 |       ).status
  379 |     ).toBe(404);
  380 |     expect(
  381 |       (await ownerAddonRemoveRaw(ownerToken, restaurantId, ZERO_ID)).status
  382 |     ).toBe(404);
  383 | 
  384 |     const refused = async (body: Rec, status: number, message: string) => {
  385 |       const r = await ownerAddonRequestRaw(ownerToken, restaurantId, body);
  386 |       expect(r.status, JSON.stringify(r.data)).toBe(status);
  387 |       expect(r.data.message).toBe(message);
  388 |     };
  389 |     await refused({}, 400, MSG.invalid);
  390 |     await refused({ addonId: offer, kind: "BUY" }, 400, MSG.invalid);
  391 |     await refused({ addonId: ZERO_ID, kind: "ADD" }, 404, MSG.addonNotFound);
  392 |     await refused({ addonId: offer, kind: "REMOVE" }, 400, MSG.notOn);
  393 |     const unknown = await ownerAddonRequestCancelRaw(
  394 |       ownerToken,
  395 |       restaurantId,
  396 |       ZERO_ID
  397 |     );
  398 |     expect(unknown.status).toBe(404);
  399 |     expect(unknown.data.message).toBe(MSG.requestNotFound);
  400 | 
  401 |     // Another restaurant's owner can neither look nor ask; HQ's list is HQ's.
  402 |     expect((await ownerAddonsRaw(otherOwner, restaurantId, "GET")).status).toBe(
  403 |       403
  404 |     );
  405 |     expect(
  406 |       (
  407 |         await ownerAddonRequestRaw(otherOwner, restaurantId, {
  408 |           addonId: offer,
  409 |           kind: "ADD",
  410 |         })
  411 |       ).status
  412 |     ).toBe(403);
  413 |     expect(
  414 |       (await ownerAddonRequestCancelRaw(otherOwner, restaurantId, ZERO_ID))
  415 |         .status
  416 |     ).toBe(403);
  417 |     expect(
  418 |       (await adminAddonsRaw(ownerToken, "GET", "/requests?status=OPEN")).status
  419 |     ).toBe(403);
```