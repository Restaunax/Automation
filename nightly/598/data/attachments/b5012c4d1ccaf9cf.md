# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-books-exports.spec.ts >> Books exports — Simple accounts, QuickBooks / Xero files, sales summary (API) >> TC-1334: the RestauNax CSV stays as it was; card deposits download in the QuickBooks layout too
- Location: tests/dashboard/owner/api-books-exports.spec.ts:282:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 403
```

# Test source

```ts
  187 |       { preset: "DETAILED" }
  188 |     );
  189 |     expect(off.status).toBe(200);
  190 |     expect((off.data.data as Rec).mappingPreset).toBe("DETAILED");
  191 |     expect(
  192 |       ((off.data.data as Rec).mapping as Rec)["sales:default"]
  193 |     ).toBeUndefined();
  194 | 
  195 |     const bad = await accountingRaw(
  196 |       ownerToken,
  197 |       restaurantId,
  198 |       "POST",
  199 |       "/mapping/preset",
  200 |       { preset: "FANCY" }
  201 |     );
  202 |     expect(bad.status).toBe(400);
  203 | 
  204 |     const changes = await settingChangesRaw(ownerToken, restaurantId, {
  205 |       area: "books",
  206 |     });
  207 |     const items = changes.data.data?.items ?? [];
  208 |     expect(
  209 |       items.find((i) => i.field === "accountingMappingPreset"),
  210 |       JSON.stringify(items)
  211 |     ).toMatchObject({ area: "books", newValue: expect.any(String) });
  212 |   });
  213 | 
  214 |   test("TC-1332: the QuickBooks Online file — the importer's exact headers, no BOM, MM/DD/YYYY; the day shows as exported", async () => {
  215 |     const file = await downloadRaw(
  216 |       ownerToken,
  217 |       `/api/accounting/${restaurantId}/export.csv${range()}&format=quickbooks`
  218 |     );
  219 |     expect(file.status).toBe(200);
  220 |     expect(file.headers.get("content-type")).toContain("text/csv");
  221 |     expect(file.headers.get("content-disposition")).toContain(
  222 |       `quickbooks-journal-${day}-to-${day}.csv`
  223 |     );
  224 |     expect(file.body[0]).not.toBe(0xef); // no UTF-8 BOM before "Journal No."
  225 |     const rows = rowsOf(file.body.toString("utf8"));
  226 |     expect(rows[0]).toBe(QBO_HEADER);
  227 |     const [y, m, d] = day.split("-");
  228 |     for (const r of rows.slice(1)) expect(r).toContain(`,${m}/${d}/${y},`);
  229 | 
  230 |     const days = await accountingRaw(
  231 |       ownerToken,
  232 |       restaurantId,
  233 |       "GET",
  234 |       `/days${range()}`
  235 |     );
  236 |     expect(list(days.data.data)).toEqual([
  237 |       expect.objectContaining({
  238 |         businessDate: day,
  239 |         closed: true,
  240 |         exportFormat: "QUICKBOOKS_ONLINE",
  241 |         exportedAt: expect.any(String),
  242 |       }),
  243 |     ]);
  244 |   });
  245 | 
  246 |   test("TC-1333: the Xero manual journal file — exact headers; the check lists nothing left out; an unknown format is refused", async () => {
  247 |     const file = await downloadRaw(
  248 |       ownerToken,
  249 |       `/api/accounting/${restaurantId}/export.csv${range()}&format=xero`
  250 |     );
  251 |     expect(file.status).toBe(200);
  252 |     expect(rowsOf(file.body.toString("utf8"))[0]).toBe(XERO_HEADER);
  253 | 
  254 |     const check = await accountingRaw(
  255 |       ownerToken,
  256 |       restaurantId,
  257 |       "GET",
  258 |       `/export/check${range()}&format=xero&source=days`
  259 |     );
  260 |     expect(check.status, JSON.stringify(check.data)).toBe(200);
  261 |     expect(check.data.data).toMatchObject({
  262 |       format: "XERO",
  263 |       source: "days",
  264 |       exported: 1,
  265 |       skipped: [],
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
> 287 |     expect(plain.status).toBe(200);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
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
  366 |     expect(header.split(",").slice(0, 7)).toEqual([
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