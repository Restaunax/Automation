# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-addon-gating.spec.ts >> Back-office add-ons gate every surface (API) >> TC-635: a home-food seller is never offered or sold back-office add-ons; only an explicit admin override grants them
- Location: tests/dashboard/owner/api-addon-gating.spec.ts:438:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Array [
-   "SCHEDULING",
    "TIMECARDS",
+   "SCHEDULING",
  ]
```

# Test source

```ts
  389 |       tips: 200,
  390 |       provider: 200,
  391 |     });
  392 |     // Losing SCHEDULING turns the saved WARN rule off on the POS.
  393 |     expect((await timeClock()).clockInRule).toBe("OFF");
  394 |     expect((await staffAppRequests())?.requests).toBe(false);
  395 |   });
  396 | 
  397 |   test("TC-568: a component can't be granted alone; revoking a component hides it under its package", async () => {
  398 |     const alone = await setFeatureOverrideAdminRaw(
  399 |       adminToken,
  400 |       restaurantId,
  401 |       "TIP_MANAGEMENT",
  402 |       true
  403 |     );
  404 |     expect(alone.status).toBe(400);
  405 |     // An admin may revoke a component inside a package.
  406 |     await grant("TIP_MANAGEMENT", false);
  407 |     expect(await features()).toEqual(["PAYROLL", "TIMECARDS"].sort());
  408 |     expect((await ownerStatuses()).tips).toBe(403);
  409 |     await remove("TIP_MANAGEMENT");
  410 |     expect((await ownerStatuses()).tips).toBe(200);
  411 |   });
  412 | 
  413 |   test("TC-569: removing the add-ons hides everything again; granting back finds the data intact", async () => {
  414 |     await remove("PAYROLL");
  415 |     expect(await features()).toEqual([]);
  416 |     expect(await ownerStatuses()).toEqual({
  417 |       jobs: 403,
  418 |       settings: 403,
  419 |       schedule: 403,
  420 |       tips: 403,
  421 |       provider: 403,
  422 |     });
  423 |     const me = list((await timeClock()).data).find(
  424 |       (s) => s.id === ownerMemberId
  425 |     );
  426 |     expect(list(me?.jobs), "no job picker without TIMECARDS").toHaveLength(0);
  427 | 
  428 |     await grant("SCHEDULING");
  429 |     const jobs = await payrollRaw(ownerToken, restaurantId, "GET", "/jobs");
  430 |     expect(list(jobs.data.data).some((j) => j.id === jobId)).toBe(true);
  431 |     const week = await getScheduleWeekRaw(ownerToken, restaurantId, SHIFT_DATE);
  432 |     expect(list(week.data.data?.shifts).some((s) => s.id === shiftId)).toBe(
  433 |       true
  434 |     );
  435 |     await remove("SCHEDULING");
  436 |   });
  437 | 
  438 |   test("TC-635: a home-food seller is never offered or sold back-office add-ons; only an explicit admin override grants them", async () => {
  439 |     const created = await createRestaurantRaw(adminToken, {
  440 |       name: `Automation Home Kitchen ${runId}`,
  441 |       street: "12 Garden Lane",
  442 |       city: "Miami",
  443 |       state: "FL",
  444 |       zipCode: "33101",
  445 |       cuisineType: "American",
  446 |       restaurantPhone: "3055550178",
  447 |       description: "Throwaway home-food seller (gating test)",
  448 |       minimumOrderPreparationTime: 0,
  449 |       businessType: "HOME_FOOD",
  450 |     });
  451 |     const homeId = String(
  452 |       (created.data as { restaurant?: { id?: string } })?.restaurant?.id ?? ""
  453 |     );
  454 |     expect(homeId, JSON.stringify(created.data)).not.toBe("");
  455 |     try {
  456 |       const backOfficeOf = async (id: string) =>
  457 |         (
  458 |           (await getRestaurantFeaturesRaw(adminToken, id)).data.data
  459 |             ?.features ?? []
  460 |         ).filter((f) => BACK_OFFICE.includes(f));
  461 |       expect(await backOfficeOf(homeId)).toEqual([]);
  462 | 
  463 |       // The self-serve catalogue: a storefront restaurant vs a home seller.
  464 |       const offered = async (token: string, id: string) =>
  465 |         list((await ownerAddonsRaw(token, id, "GET")).data.data?.addons).filter(
  466 |           (x) => BACK_OFFICE.includes(String(x.feature))
  467 |         );
  468 |       const forHome = await offered(adminToken, homeId);
  469 |       expect(forHome.map((x) => x.feature)).toEqual([]);
  470 |       const forStore = await offered(ownerToken, restaurantId);
  471 |       for (const addon of forStore) {
  472 |         const bought = await ownerAddonsRaw(adminToken, homeId, "POST", {
  473 |           addonId: addon.id,
  474 |         });
  475 |         expect(bought.status, `${addon.feature} sold to a home seller`).toBe(
  476 |           400
  477 |         );
  478 |       }
  479 |       test.info().annotations.push({
  480 |         type: "catalogue",
  481 |         description: `self-serve back-office add-ons on QA: ${
  482 |           forStore.map((x) => x.feature).join(", ") || "none"
  483 |         }`,
  484 |       });
  485 | 
  486 |       // Escape hatch by design (restaurantFeatureService step 3): an admin
  487 |       // override still grants, with the components.
  488 |       await setFeatureOverrideAdminRaw(adminToken, homeId, "SCHEDULING", true);
> 489 |       expect(await backOfficeOf(homeId)).toEqual(
      |                                          ^ Error: expect(received).toEqual(expected) // deep equality
  490 |         ["SCHEDULING", "TIMECARDS"].sort()
  491 |       );
  492 |     } finally {
  493 |       await deleteTestRestaurant(adminToken, homeId).catch(() => {});
  494 |     }
  495 |   });
  496 | });
  497 | 
```