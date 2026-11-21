# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-books-exports.spec.ts >> Books exports — Simple accounts, QuickBooks / Xero files, sales summary (API) >> TC-1336: the sales summary CSV — a row per day, a total row and the 'Ties to journal' column
- Location: tests/dashboard/owner/api-books-exports.spec.ts:337:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  250 |       `/api/accounting/${restaurantId}/export.csv${range()}&format=xero`
  251 |     );
  252 |     expect(file.status).toBe(200);
  253 |     expect(rowsOf(file.body.toString("utf8"))[0]).toBe(XERO_HEADER);
  254 | 
  255 |     const check = await accountingRaw(
  256 |       ownerToken,
  257 |       restaurantId,
  258 |       "GET",
  259 |       `/export/check${range()}&format=xero&source=days`
  260 |     );
  261 |     expect(check.status, JSON.stringify(check.data)).toBe(200);
  262 |     expect(check.data.data).toMatchObject({
  263 |       format: "XERO",
  264 |       source: "days",
  265 |       exported: 1,
  266 |       skipped: [],
  267 |     });
  268 | 
  269 |     const bad = await accountingRaw(
  270 |       ownerToken,
  271 |       restaurantId,
  272 |       "GET",
  273 |       `/export/check${range()}&format=sage`
  274 |     );
  275 |     expect(bad.status).toBe(400);
  276 |     const badFile = await downloadRaw(
  277 |       ownerToken,
  278 |       `/api/accounting/${restaurantId}/export.csv${range()}&format=sage`
  279 |     );
  280 |     expect(badFile.status).toBe(400);
  281 |   });
  282 | 
  283 |   test("TC-1334: the RestauNax CSV stays as it was; card deposits download in the QuickBooks layout too", async () => {
  284 |     const plain = await downloadRaw(
  285 |       ownerToken,
  286 |       `/api/accounting/${restaurantId}/export.csv${range()}`
  287 |     );
  288 |     expect(plain.status).toBe(200);
  289 |     expect(rowsOf(plain.body.toString("utf8").replace(/^\uFEFF/, ""))[0]).toBe(
  290 |       "Date,Journal no.,Account,Debit,Credit,Description,Location,Status"
  291 |     );
  292 |     const deposits = await downloadRaw(
  293 |       ownerToken,
  294 |       `/api/accounting/${restaurantId}/deposits/export.csv${range()}&format=quickbooks`
  295 |     );
  296 |     expect(deposits.status).toBe(200);
  297 |     expect(rowsOf(deposits.body.toString("utf8"))).toEqual([QBO_HEADER]);
  298 |   });
  299 | 
  300 |   test("TC-1335: the sales summary — per day and in total, and it ties to the books", async () => {
  301 |     const r = await accountingRaw(
  302 |       ownerToken,
  303 |       restaurantId,
  304 |       "GET",
  305 |       `/sales-summary${range()}`
  306 |     );
  307 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  308 |     const s = r.data.data as Rec;
  309 |     expect(s).toMatchObject({
  310 |       startDate: day,
  311 |       endDate: day,
  312 |       ties: true,
  313 |       closedDays: 1,
  314 |       openDays: 0,
  315 |     });
  316 |     const totals = s.totals as Rec;
  317 |     expect(totals).toMatchObject({
  318 |       grossSalesCents: 0,
  319 |       netSalesCents: 0,
  320 |       taxCents: 0,
  321 |       tipsCents: 0,
  322 |     });
  323 |     expect((totals.check as Rec).ties).toBe(true);
  324 |     const only = list(s.days)[0] ?? {};
  325 |     expect(only).toMatchObject({ date: day, closed: true });
  326 |     expect(((only.figures as Rec).check as Rec).ties).toBe(true);
  327 | 
  328 |     const tooLong = await accountingRaw(
  329 |       ownerToken,
  330 |       restaurantId,
  331 |       "GET",
  332 |       "/sales-summary?startDate=2026-01-01&endDate=2026-10-01"
  333 |     );
  334 |     expect(tooLong.status).toBe(400);
  335 |   });
  336 | 
  337 |   test("TC-1336: the sales summary CSV — a row per day, a total row and the 'Ties to journal' column", async () => {
  338 |     const csv = await downloadRaw(
  339 |       ownerToken,
  340 |       `/api/accounting/${restaurantId}/sales-summary.csv${range()}`,
  341 |       { "Accept-Language": "en" }
  342 |     );
  343 |     expect(csv.status).toBe(200);
  344 |     const rows = rowsOf(csv.body.toString("utf8").replace(/^\uFEFF/, ""));
  345 |     const [header = "", first = "", total = ""] = rows;
  346 |     expect(
  347 |       header.startsWith(
  348 |         "Business date,Orders,Gross sales,Comps,Discounts,Refunds,Net sales,"
  349 |       )
> 350 |     ).toBe(true);
      |       ^ Error: expect(received).toBe(expected) // Object.is equality
  351 |     expect(header.endsWith(",Ties to journal")).toBe(true);
  352 |     expect(rows).toHaveLength(3);
  353 |     expect(first.startsWith(`${day},`)).toBe(true);
  354 |     expect(first.endsWith(",Yes")).toBe(true);
  355 |     expect(total.startsWith("Total,")).toBe(true);
  356 |   });
  357 | 
  358 |   test("TC-1337: the sales-by-day CSV — net sales after refunds, with refunds and the old figure beside it", async () => {
  359 |     const r = await reportsRaw(
  360 |       ownerToken,
  361 |       restaurantId,
  362 |       "GET",
  363 |       `/sales-by-day.csv${range()}`
  364 |     );
  365 |     expect(r.status).toBe(200);
  366 |     const header = rowsOf(String(r.data).replace(/^\uFEFF/, ""))[0] ?? "";
  367 |     expect(header.split(",").slice(0, 7)).toEqual([
  368 |       "Business date",
  369 |       "Day",
  370 |       "Orders",
  371 |       "Net sales",
  372 |       "Refunds",
  373 |       "Net sales before refunds",
  374 |       "Source",
  375 |     ]);
  376 |   });
  377 | });
  378 | 
```