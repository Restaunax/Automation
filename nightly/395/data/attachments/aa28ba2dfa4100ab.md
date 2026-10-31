# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-pay-at-table.spec.ts >> Pay at the table — the guest's phone, on QA (API) >> TC-687: first to pay wins — two phones on "everything left": one captured, the other released
- Location: tests/dashboard/owner/api-pay-at-table.spec.ts:971:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "CANCELLED"
Received: "NONE"
```

# Test source

```ts
  892  |     expect(closed.paidSoFar).toBe(100);
  893  |     expect(closed.remaining).toBe(0);
  894  |     const legs = closed.payments as Rec[];
  895  |     expect(legs.map((p) => p.amount)).toEqual([30, 17.5, 26.25, 26.25]);
  896  |     expect(legs.every((p) => p.byPhone === true && p.method === "CARD")).toBe(
  897  |       true
  898  |     );
  899  |     expect((closed.totals as Rec).tipsSoFar).toBe(4.5);
  900  |     // Dee's PaymentIntent captured exactly what was asked.
  901  |     expect(await piStatus(dee.pi)).toEqual({
  902  |       status: "succeeded",
  903  |       amount: 2625,
  904  |     });
  905  | 
  906  |     // The order is paid in full; the table is free.
  907  |     const order = (await getOrderFullRaw(ownerToken, checks.C0)).data as Rec;
  908  |     expect(order.paymentStatus).toBe("COMPLETED");
  909  |     const tables = await getTabletTablesRaw(tablet);
  910  |     const t0 = tables.data.tables?.find((t) => t.name === "T0");
  911  |     expect(t0?.openChecks ?? []).toHaveLength(0);
  912  |   });
  913  | 
  914  |   test("TC-686: the card fee — credit carries it per the restaurant setting, debit pays none", async () => {
  915  |     const on = await updateRestaurantSettingsRaw(adminToken, restaurantId, {
  916  |       passProcessingFeeToCustomer: true,
  917  |     });
  918  |     expect(on.status, JSON.stringify(on.data)).toBe(200);
  919  |     const b = await bill(tokens.C2);
  920  |     expect(b.cardFee).toEqual({
  921  |       passThrough: true,
  922  |       percent: 2.9,
  923  |       fixed: 0.3,
  924  |       creditOnly: true,
  925  |     });
  926  | 
  927  |     // Credit: $20.00 → fee on the share only, never on the tip.
  928  |     const q = await okQuote(tokens.C2, { mode: "AMOUNT", amount: 20, tip: 3 });
  929  |     const fee = cardFeeCents(2000);
  930  |     expect(cents(Number(q.fee))).toBe(fee);
  931  |     expect(cents(Number(q.total))).toBe(2000 + 300 + fee);
  932  |     const credit = await pay(tokens.C2, { mode: "AMOUNT", amount: 20, tip: 3 });
  933  |     expect(credit.finalize).toMatchObject({
  934  |       removed: false,
  935  |       funding: "credit",
  936  |     });
  937  |     expect(cents(Number((credit.done.leg as Rec).amount))).toBe(
  938  |       2000 + 300 + fee
  939  |     );
  940  |     expect(await piStatus(credit.pi)).toEqual({
  941  |       status: "succeeded",
  942  |       amount: 2000 + 300 + fee,
  943  |     });
  944  |     // The check counts $20.00 toward the meal; the fee isn't the table's debt.
  945  |     const R = cents(Number(b.remaining)) - 2000;
  946  |     expect(cents(Number(credit.done.remaining))).toBe(R);
  947  | 
  948  |     // Debit: the quote shows the fee, the card drops it before authorizing.
  949  |     const restQ = await okQuote(tokens.C2, { mode: "REST" });
  950  |     expect(cents(Number(restQ.fee))).toBe(cardFeeCents(R));
  951  |     const debit = await pay(tokens.C2, { mode: "REST" }, "tok_visa_debit");
  952  |     expect(debit.finalize).toMatchObject({
  953  |       removed: true,
  954  |       funding: "debit",
  955  |       fee: 0,
  956  |     });
  957  |     expect(cents(Number(debit.finalize.total))).toBe(R);
  958  |     expect(cents(Number((debit.done.leg as Rec).amount))).toBe(R);
  959  |     expect(await piStatus(debit.pi)).toEqual({
  960  |       status: "succeeded",
  961  |       amount: R,
  962  |     });
  963  |     expect(debit.done.closed).toBe(true);
  964  | 
  965  |     const off = await updateRestaurantSettingsRaw(adminToken, restaurantId, {
  966  |       passProcessingFeeToCustomer: false,
  967  |     });
  968  |     expect(off.status).toBe(200);
  969  |   });
  970  | 
  971  |   test('TC-687: first to pay wins — two phones on "everything left": one captured, the other released', async () => {
  972  |     const a = await intent(tokens.C3, { mode: "REST" });
  973  |     const b = await intent(tokens.C3, { mode: "REST" });
  974  |     expect(a.paymentIntentId).not.toBe(b.paymentIntentId);
  975  |     // A PENDING phone payment reserves nothing: both could be created.
  976  |     await authorize(a, await cardPm("tok_visa"));
  977  |     await authorize(b, await cardPm("tok_visa"));
  978  | 
  979  |     const first = await confirm(tokens.C3, a);
  980  |     expect(first.status, JSON.stringify(first.data)).toBe(200);
  981  |     expect((first.data.data as Rec).closed).toBe(true);
  982  |     c3WinnerLeg = String(((first.data.data as Rec).leg as Rec).id);
  983  | 
  984  |     const second = await confirm(tokens.C3, b);
  985  |     // Refused either way: if closing the check already released the loser's
  986  |     // authorization it answers NOT_READY (the intent is cancelled); if not,
  987  |     // the apply cancels it now and says so.
  988  |     expect(second.status, JSON.stringify(second.data)).toBe(409);
  989  |     if (second.data.code === "NOT_READY") {
  990  |       expect(JSON.stringify(second.data)).toContain("canceled");
  991  |     } else {
> 992  |       expect(second.data.released).toBe("CANCELLED");
       |                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  993  |       expect((second.data.bill as Rec).status).toBe("CLOSED");
  994  |     }
  995  |     expect((await piStatus(a)).status).toBe("succeeded");
  996  |     expect((await piStatus(b)).status).toBe("canceled");
  997  | 
  998  |     // A paid check takes no more money; its table is free.
  999  |     const late = await checkPayRaw("POST", tokens.C3, "/intent", {
  1000 |       mode: "REST",
  1001 |       idempotencyKey: newKey(),
  1002 |     });
  1003 |     expect(late.status).toBe(409);
  1004 |     expect(late.data.code).toBe("CHECK_CLOSED");
  1005 |     const closed = await bill(tokens.C3);
  1006 |     expect(closed.status).toBe("CLOSED");
  1007 |     expect((closed.payments as Rec[]).length).toBe(1);
  1008 |     const tables = await getTabletTablesRaw(tablet);
  1009 |     const t3 = tables.data.tables?.find((t) => t.name === "T3");
  1010 |     expect(t3?.openChecks ?? []).toHaveLength(0);
  1011 |   });
  1012 | 
  1013 |   test("TC-688: the receipt email — once per payment, English and Spanish @email", async () => {
  1014 |     const enTo = generateUserEmail("pat-en");
  1015 |     const en = await checkPayRaw("POST", tokens.C0, "/receipt", {
  1016 |       legId: c0Leg(0),
  1017 |       email: enTo,
  1018 |     });
  1019 |     expect(en.status, JSON.stringify(en.data)).toBe(200);
  1020 |     expect(en.data.message).toBe(`Receipt sent to ${enTo}.`);
  1021 |     const enMail = await waitForEmail(enTo, {
  1022 |       subjectPattern: /^Your receipt from /,
  1023 |       timeoutMs: 60_000,
  1024 |     });
  1025 |     expect(enMail.subject).toBe(`Your receipt from ${restaurantName}`);
  1026 |     expect(enMail.html_body).toContain("$34.50");
  1027 | 
  1028 |     const again = await checkPayRaw("POST", tokens.C0, "/receipt", {
  1029 |       legId: c0Leg(0),
  1030 |       email: generateUserEmail("pat-en2"),
  1031 |     });
  1032 |     expect(again.status).toBe(409);
  1033 |     expect(again.data.code).toBe("RECEIPT_ALREADY_SENT");
  1034 | 
  1035 |     const esTo = generateUserEmail("pat-es");
  1036 |     const es = await checkPayRaw(
  1037 |       "POST",
  1038 |       tokens.C0,
  1039 |       "/receipt",
  1040 |       { legId: c0Leg(1), email: esTo },
  1041 |       ES
  1042 |     );
  1043 |     expect(es.status, JSON.stringify(es.data)).toBe(200);
  1044 |     expect(es.data.message).toBe(`Recibo enviado a ${esTo}.`);
  1045 |     const esMail = await waitForEmail(esTo, {
  1046 |       subjectPattern: /^Tu recibo de /,
  1047 |       timeoutMs: 60_000,
  1048 |     });
  1049 |     expect(esMail.subject).toBe(`Tu recibo de ${restaurantName}`);
  1050 |     expect(esMail.html_body).toContain("$17.50");
  1051 | 
  1052 |     const badEmail = await checkPayRaw("POST", tokens.C0, "/receipt", {
  1053 |       legId: c0Leg(2),
  1054 |       email: "not-an-email",
  1055 |     });
  1056 |     expect(badEmail.status).toBe(400);
  1057 |     expect(badEmail.data.code).toBe("EMAIL_INVALID");
  1058 |     const noLeg = await checkPayRaw("POST", tokens.C0, "/receipt", {
  1059 |       legId: c0Leg(0).replace(/.$/, "0"),
  1060 |       email: generateUserEmail("pat-x"),
  1061 |     });
  1062 |     expect(noLeg.status).toBe(404);
  1063 | 
  1064 |     await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
  1065 |       settings: { enabled: true, collectReceiptEmail: false },
  1066 |     });
  1067 |     const off = await checkPayRaw("POST", tokens.C0, "/receipt", {
  1068 |       legId: c0Leg(2),
  1069 |       email: generateUserEmail("pat-off"),
  1070 |     });
  1071 |     expect(off.status).toBe(400);
  1072 |     expect(off.data.code).toBe("RECEIPTS_OFF");
  1073 |     await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
  1074 |       settings: { enabled: true },
  1075 |     });
  1076 |   });
  1077 | 
  1078 |   test("TC-689: earn points — a reward code for this payment (split) or the whole check (one payer)", async () => {
  1079 |     const before = await checkPayRaw("POST", tokens.C0, "/reward-claim", {
  1080 |       legId: c0Leg(2),
  1081 |     });
  1082 |     expect(before.status).toBe(200);
  1083 |     expect((before.data.data as Rec).eligible).toBe(false);
  1084 |     expect((before.data.data as Rec).reason).toBe("NO_PROGRAM");
  1085 | 
  1086 |     const program = await createRewardProgramRaw(adminToken, {
  1087 |       pointsPerDollar: 1,
  1088 |       pointsPerRedemption: 100,
  1089 |       redemptionValue: 5,
  1090 |       isActive: true,
  1091 |       participatingRestaurants: [{ restaurantId }],
  1092 |       receiptClaimEnabled: true,
```