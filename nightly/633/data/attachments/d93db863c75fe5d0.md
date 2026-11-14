# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-books-exports.spec.ts >> Books exports — Simple accounts, QuickBooks / Xero files, sales summary (API) >> TC-1337: the sales-by-day CSV — net sales after refunds, with refunds and the old figure beside it
- Location: tests/dashboard/owner/api-books-exports.spec.ts:357:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

@@ -3,7 +3,7 @@
    "Day",
    "Orders",
    "Net sales",
    "Refunds",
    "Net sales before refunds",
-   "Source",
+   "Compared date",
  ]
```

# Test source

```ts
  266 |     });
  267 | 
  268 |     const bad = await accountingRaw(
  269 |       ownerToken,
  270 |       restaurantId,
  271 |       "GET",
  272 |       `/export/check${range()}&format=sage`
  273 |     );
  274 |     expect(bad.status).toBe(400);
  275 |     const badFile = await downloadRaw(
  276 |       ownerToken,
  277 |       `/api/accounting/${restaurantId}/export.csv${range()}&format=sage`
  278 |     );
  279 |     expect(badFile.status).toBe(400);
  280 |   });
  281 | 
  282 |   test("TC-1334: the RestauNax CSV stays as it was; card deposits download in the QuickBooks layout too", async () => {
  283 |     const plain = await downloadRaw(
  284 |       ownerToken,
  285 |       `/api/accounting/${restaurantId}/export.csv${range()}`
  286 |     );
  287 |     expect(plain.status).toBe(200);
  288 |     expect(rowsOf(plain.body.toString("utf8").replace(/^\uFEFF/, ""))[0]).toBe(
  289 |       "Date,Journal no.,Account,Debit,Credit,Description,Location,Status"
  290 |     );
  291 |     const deposits = await downloadRaw(
  292 |       ownerToken,
  293 |       `/api/accounting/${restaurantId}/deposits/export.csv${range()}&format=quickbooks`
  294 |     );
  295 |     expect(deposits.status).toBe(200);
  296 |     expect(rowsOf(deposits.body.toString("utf8"))).toEqual([QBO_HEADER]);
  297 |   });
  298 | 
  299 |   test("TC-1335: the sales summary — per day and in total, and it ties to the books", async () => {
  300 |     const r = await accountingRaw(
  301 |       ownerToken,
  302 |       restaurantId,
  303 |       "GET",
  304 |       `/sales-summary${range()}`
  305 |     );
  306 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  307 |     const s = r.data.data as Rec;
  308 |     expect(s).toMatchObject({
  309 |       startDate: day,
  310 |       endDate: day,
  311 |       ties: true,
  312 |       closedDays: 1,
  313 |       openDays: 0,
  314 |     });
  315 |     const totals = s.totals as Rec;
  316 |     expect(totals).toMatchObject({
  317 |       grossSalesCents: 0,
  318 |       netSalesCents: 0,
  319 |       taxCents: 0,
  320 |       tipsCents: 0,
  321 |     });
  322 |     expect((totals.check as Rec).ties).toBe(true);
  323 |     const only = list(s.days)[0] ?? {};
  324 |     expect(only).toMatchObject({ date: day, closed: true });
  325 |     expect(((only.figures as Rec).check as Rec).ties).toBe(true);
  326 | 
  327 |     const tooLong = await accountingRaw(
  328 |       ownerToken,
  329 |       restaurantId,
  330 |       "GET",
  331 |       "/sales-summary?startDate=2026-01-01&endDate=2026-10-01"
  332 |     );
  333 |     expect(tooLong.status).toBe(400);
  334 |   });
  335 | 
  336 |   test("TC-1336: the sales summary CSV — a row per day, a total row and the 'Ties to journal' column", async () => {
  337 |     const csv = await downloadRaw(
  338 |       ownerToken,
  339 |       `/api/accounting/${restaurantId}/sales-summary.csv${range()}`,
  340 |       { "Accept-Language": "en" }
  341 |     );
  342 |     expect(csv.status).toBe(200);
  343 |     const rows = rowsOf(csv.body.toString("utf8").replace(/^\uFEFF/, ""));
  344 |     const [header = "", first = "", total = ""] = rows;
  345 |     expect(
  346 |       header.startsWith(
  347 |         "Business date,Orders,Gross sales,Comps,Discounts,Refunds,Net sales,"
  348 |       )
  349 |     ).toBe(true);
  350 |     expect(header.endsWith(",Ties to journal")).toBe(true);
  351 |     expect(rows).toHaveLength(3);
  352 |     expect(first.startsWith(`${day},`)).toBe(true);
  353 |     expect(first.endsWith(",Yes")).toBe(true);
  354 |     expect(total.startsWith("Total,")).toBe(true);
  355 |   });
  356 | 
  357 |   test("TC-1337: the sales-by-day CSV — net sales after refunds, with refunds and the old figure beside it", async () => {
  358 |     const r = await reportsRaw(
  359 |       ownerToken,
  360 |       restaurantId,
  361 |       "GET",
  362 |       `/sales-by-day.csv${range()}`
  363 |     );
  364 |     expect(r.status).toBe(200);
  365 |     const header = rowsOf(String(r.data).replace(/^\uFEFF/, ""))[0] ?? "";
> 366 |     expect(header.split(",").slice(0, 7)).toEqual([
      |                                           ^ Error: expect(received).toEqual(expected) // deep equality
  367 |       "Business date",
  368 |       "Day",
  369 |       "Orders",
  370 |       "Net sales",
  371 |       "Refunds",
  372 |       "Net sales before refunds",
  373 |       "Source",
  374 |     ]);
  375 |   });
  376 | });
  377 | 
```