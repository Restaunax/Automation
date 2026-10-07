# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-staff-hiring.spec.ts >> Hiring — invite, claim, job, role, staff app (API) >> TC-618: an owner-set PIN lets an invited (not yet claimed) person sign in on the POS
- Location: tests/dashboard/owner/api-staff-hiring.spec.ts:583:7

# Error details

```
Error: {"success":false,"message":"The PIN you entered is incorrect.","errorCode":"STAFF_PIN_INVALID","errorId":"6e7f5472-812b-4ac4-83dd-f64b1b17d8ac"}

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  510 |         restaurantName,
  511 |         staffMemberId: cam.staffMemberId,
  512 |         // PAYROLL only: no scheduling requests, no RestauNax Payroll stubs.
  513 |         requests: false,
  514 |         payStubs: false,
  515 |       }),
  516 |     ]);
  517 |     const periods = await staffAppRaw(
  518 |       login.accessToken,
  519 |       "GET",
  520 |       `/restaurants/${restaurantId}/pay-periods`
  521 |     );
  522 |     expect(periods.status).toBe(200);
  523 |   });
  524 | 
  525 |   test("TC-562: a deactivated staff member loses the POS and the staff app; the record stays", async () => {
  526 |     const off = await ownerStaffRaw(
  527 |       ownerToken,
  528 |       restaurantId,
  529 |       "DELETE",
  530 |       `/${cam.staffMemberId}`
  531 |     );
  532 |     expect(off.status, JSON.stringify(off.data)).toBe(200);
  533 | 
  534 |     const me = await staffAppRaw<{ data: Rec }>(cam.token, "GET", "/me");
  535 |     expect(me.status).toBe(200);
  536 |     expect(list(me.data.data.restaurants)).toHaveLength(0);
  537 |     const periods = await staffAppRaw(
  538 |       cam.token,
  539 |       "GET",
  540 |       `/restaurants/${restaurantId}/pay-periods`
  541 |     );
  542 |     expect(periods.status).toBe(404);
  543 | 
  544 |     // Her open POS session dies, and she can't sign in again.
  545 |     const session = await tabletRaw(
  546 |       tabletToken,
  547 |       "GET",
  548 |       "/staff/me",
  549 |       undefined,
  550 |       cam.session
  551 |     );
  552 |     expect(session.status).toBeGreaterThanOrEqual(400);
  553 |     const signIn = await tabletStaffSignInRaw(
  554 |       tabletToken,
  555 |       cam.staffMemberId,
  556 |       CAM_PIN
  557 |     );
  558 |     expect(signIn.status).toBeGreaterThanOrEqual(400);
  559 | 
  560 |     const active = await ownerStaffRaw(ownerToken, restaurantId, "GET");
  561 |     expect(list(active.data.data).some((s) => s.id === cam.staffMemberId)).toBe(
  562 |       false
  563 |     );
  564 |     const all = await ownerStaffRaw(
  565 |       ownerToken,
  566 |       restaurantId,
  567 |       "GET",
  568 |       "?includeInactive=true"
  569 |     );
  570 |     expect(
  571 |       list(all.data.data).find((s) => s.id === cam.staffMemberId)
  572 |     ).toMatchObject({ status: "inactive", isActive: false });
  573 |     // Her job and wage are kept for history.
  574 |     const jobs = await payrollRaw(
  575 |       ownerToken,
  576 |       restaurantId,
  577 |       "GET",
  578 |       `/members/${cam.staffMemberId}/jobs`
  579 |     );
  580 |     expect(list(jobs.data.data)[0]?.hourlyRateCents).toBe(1825);
  581 |   });
  582 | 
  583 |   test("TC-618: an owner-set PIN lets an invited (not yet claimed) person sign in on the POS", async () => {
  584 |     // PRODUCT BUG (found 2026-10-06): POST /restaurant/:rid/staff/:id/pin on a
  585 |     // pending email invitee answers 200 "PIN updated." but leaves the row
  586 |     // unactivated (setStaffPinDirect never sets activatedAt), so the person is
  587 |     // missing from the POS roster and /api/tablet/staff/sign-in answers 401
  588 |     // "The PIN you entered is incorrect." — restaunax-backend
  589 |     // src/Service/restaurantStaffService.ts setStaffPinDirect (~L1971) vs
  590 |     // eligibleCandidateWhere (~L1360, activatedAt: { not: null }). Expected:
  591 |     // either activate on an owner-set PIN (as POS-created staff are) or refuse
  592 |     // the PIN with a clear message. Remove test.fail() once fixed.
  593 |     test.fail();
  594 |     const invited = await inviteStaffRaw(ownerToken, restaurantId, {
  595 |       email: `auto-staff-pat-${runId}@${DOMAIN}`,
  596 |       firstName: "Pat",
  597 |       lastName: "Moss",
  598 |     });
  599 |     expect(invited.status).toBe(201);
  600 |     const patId = String(invited.data.data?.staffMemberId);
  601 |     const pin = await ownerStaffRaw(
  602 |       ownerToken,
  603 |       restaurantId,
  604 |       "POST",
  605 |       `/${patId}/pin`,
  606 |       { pin: "7391" }
  607 |     );
  608 |     expect(pin.status, JSON.stringify(pin.data)).toBe(200);
  609 |     const signIn = await tabletStaffSignInRaw(tabletToken, patId, "7391");
> 610 |     expect(signIn.status, JSON.stringify(signIn.data)).toBe(200);
      |                                                        ^ Error: {"success":false,"message":"The PIN you entered is incorrect.","errorCode":"STAFF_PIN_INVALID","errorId":"6e7f5472-812b-4ac4-83dd-f64b1b17d8ac"}
  611 |   });
  612 | });
  613 | 
```