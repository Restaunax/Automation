# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/gift-card-import.spec.ts >> Admin — Importing existing gift cards >> TC-501: an imported card is redeemable at the restaurant that imported it
- Location: tests/dashboard/admin/gift-card-import.spec.ts:178:7

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
-   "valid": true,
+   "valid": false,
  }
```

# Test source

```ts
  84  |     if (!tenant.restaurantId) {
  85  |       throw new Error(
  86  |         "[gift-card-import] could not mint the throwaway tenant restaurant"
  87  |       );
  88  |     }
  89  |     restaurantId = tenant.restaurantId;
  90  |     restaurantName = `Automation Owner2 Store ${runId}`;
  91  |     const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
  92  |       isEnabled: true,
  93  |     });
  94  |     if (!cfg.ok)
  95  |       throw new Error(
  96  |         `[gift-card-import] config write failed: ${msg(cfg.data)}`
  97  |       );
  98  |   });
  99  | 
  100 |   test.afterAll(async () => {
  101 |     if (!adminToken) return;
  102 |     // Undo before archiving: an imported code is globally unique, so leaving
  103 |     // it behind would poison the number for any future run.
  104 |     if (importId) {
  105 |       await revertGiftCardImportRaw(adminToken, importId, scope()).catch(() => {
  106 |         /* already reverted by TC-505 */
  107 |       });
  108 |     }
  109 |     if (restaurantId && !process.env.OWNER2_EMAIL) {
  110 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
  111 |         /* archive is best-effort; globalTeardown sweeps the user */
  112 |       });
  113 |     }
  114 |   });
  115 | 
  116 |   test.beforeEach(async ({ adminPage }) => {
  117 |     await allure.label("feature", "Gift cards — importing existing cards");
  118 |     await allure.label("severity", "critical");
  119 |     importPage = createAdminGiftCardImportPage(adminPage);
  120 |   });
  121 | 
  122 |   test("TC-499: the preview reports what would be created and writes nothing", async () => {
  123 |     await allure.description(
  124 |       "A dry run over the real handover shape: BOM, 'Card Number'/'Current " +
  125 |         "Balance' headers, 15-digit codes. Nothing may exist afterwards."
  126 |     );
  127 |     const preview = await previewGiftCardImportRaw(adminToken, scope(), csv);
  128 | 
  129 |     expect(preview.ok, `preview → ${preview.status}`).toBeTruthy();
  130 |     const plan = preview.data.data;
  131 |     expect(plan, "preview returned no plan").toBeTruthy();
  132 |     expect(plan).toMatchObject({
  133 |       willCreate: rows.length,
  134 |       willSkip: 0,
  135 |       totalValue: total,
  136 |     });
  137 |     // The columns were guessed, not configured.
  138 |     expect(plan?.mapping).toEqual({
  139 |       codeColumn: "Card Number",
  140 |       balanceColumn: "Current Balance",
  141 |     });
  142 |     expect(plan?.problems ?? []).toHaveLength(0);
  143 | 
  144 |     // A dry run that wrote something is not a dry run.
  145 |     const balance = await getGiftCardBalanceRaw(row(0).code);
  146 |     expect(balance.status, "preview must not create cards").toBe(404);
  147 |   });
  148 | 
  149 |   test("TC-500: importing through the panel creates spendable cards", async () => {
  150 |     await importPage.goto(restaurantName);
  151 |     await importPage.openImport();
  152 | 
  153 |     const preview = await importPage.chooseFile(csv, `${label}.csv`);
  154 |     expect(preview.data.willCreate).toBe(rows.length);
  155 | 
  156 |     // What the admin is shown before committing is what they are agreeing to.
  157 |     await expect(
  158 |       importPage.reviewChip(`${rows.length} cards to import`)
  159 |     ).toBeVisible();
  160 |     await expect(
  161 |       importPage.reviewChip(`$${total.toFixed(2)} in balances`)
  162 |     ).toBeVisible();
  163 | 
  164 |     const result = await importPage.confirmImport(rows.length);
  165 |     importId = result.data.importId;
  166 |     expect(result.data.created).toBe(rows.length);
  167 |     await importPage.closeWizard();
  168 | 
  169 |     // The point of the whole feature: their customer's card now works.
  170 |     const balance = await getGiftCardBalanceRaw(row(1).code);
  171 |     expect(balance.status, JSON.stringify(balance.data)).toBe(200);
  172 |     expect((balance.data as { data: unknown }).data).toMatchObject({
  173 |       currentBalance: row(1).balance,
  174 |       status: "ACTIVE",
  175 |     });
  176 |   });
  177 | 
  178 |   test("TC-501: an imported card is redeemable at the restaurant that imported it", async () => {
  179 |     const validated = await validateGiftCardPublicRaw(
  180 |       row(0).code,
  181 |       restaurantId
  182 |     );
  183 |     expect(validated.status, JSON.stringify(validated.data)).toBe(200);
> 184 |     expect((validated.data as { data: unknown }).data).toMatchObject({
      |                                                        ^ Error: expect(received).toMatchObject(expected)
  185 |       valid: true,
  186 |     });
  187 |   });
  188 | 
  189 |   test("TC-502: re-uploading the same file changes nothing", async () => {
  190 |     await allure.description(
  191 |       "Idempotency is what makes a nervous admin able to retry. A second " +
  192 |         "import of the same codes must skip, never double a customer's balance."
  193 |     );
  194 |     const preview = await previewGiftCardImportRaw(adminToken, scope(), csv);
  195 | 
  196 |     expect(preview.data.data).toMatchObject({
  197 |       willCreate: 0,
  198 |       willSkip: rows.length,
  199 |     });
  200 | 
  201 |     const again = await importGiftCardsRaw(adminToken, scope(), csv);
  202 |     expect(again.ok).toBeTruthy();
  203 |     expect(again.data.data).toMatchObject({ created: 0, skipped: rows.length });
  204 | 
  205 |     const balance = await getGiftCardBalanceRaw(row(1).code);
  206 |     expect(
  207 |       (balance.data as { data: { currentBalance: number } }).data
  208 |         .currentBalance,
  209 |       "a re-import must not top the card up"
  210 |     ).toBe(row(1).balance);
  211 |   });
  212 | 
  213 |   test("TC-503: a bad row is reported and the good rows still import", async () => {
  214 |     const mixed = buildGiftCardCsv([
  215 |       { code: `${row(0).code.slice(0, 11)}9001`, balance: 12.5 },
  216 |       { code: "", balance: 5 },
  217 |     ]).replace("\r\n\r\n", "\r\n");
  218 |     const preview = await previewGiftCardImportRaw(adminToken, scope(), mixed);
  219 | 
  220 |     expect(preview.ok, "row problems belong inside a 200").toBeTruthy();
  221 |     const plan = preview.data.data;
  222 |     expect(plan?.willCreate).toBe(1);
  223 |     expect(plan?.problems ?? []).not.toHaveLength(0);
  224 |     // Row numbers are what the admin reads off their own spreadsheet, so the
  225 |     // header has to count as row 1.
  226 |     expect(plan?.problems?.[0]?.row ?? 0).toBeGreaterThan(1);
  227 |   });
  228 | 
  229 |   test("TC-504: the export hands back every imported balance", async () => {
  230 |     const csvOut = await exportGiftCardsCsvRaw(adminToken, scope());
  231 |     expect(csvOut.ok, `export → ${csvOut.status}`).toBeTruthy();
  232 | 
  233 |     const parsed = csvToObjects(
  234 |       String(csvOut.data).replace(/^\uFEFF/, "")
  235 |     ).rows;
  236 |     const mine = parsed.filter((r) => r.code === row(0).code);
  237 |     expect(mine, "the imported card must be in the file").toHaveLength(1);
  238 |     expect(mine[0]?.source).toBe("imported");
  239 |     // Shown exactly as printed: we do not know how the previous system grouped
  240 |     // it, so inventing `9532-3441-...` would misrepresent the card.
  241 |     expect(mine[0]?.code_display).toBe(row(0).code);
  242 | 
  243 |     const exportedTotal = parsed
  244 |       .filter((r) => r.source === "imported")
  245 |       .reduce((sum, r) => sum + Number(r.current_balance), 0);
  246 |     expect(Math.round(exportedTotal * 100) / 100).toBe(total);
  247 |   });
  248 | 
  249 |   test("TC-505: undoing an import frees the numbers for a corrective import", async () => {
  250 |     await allure.description(
  251 |       "GiftCard.code is unique platform-wide, so importing to the wrong " +
  252 |         "restaurant burns the numbers everywhere and the corrective import " +
  253 |         "fails every row. Undo is the only way out of that without SQL."
  254 |     );
  255 |     const before = await listGiftCardImportsRaw(adminToken, scope());
  256 |     expect(before.data.data?.find((i) => i.id === importId)).toMatchObject({
  257 |       usedCardCount: 0,
  258 |       revertable: true,
  259 |     });
  260 | 
  261 |     const reverted = await revertGiftCardImportRaw(
  262 |       adminToken,
  263 |       importId,
  264 |       scope()
  265 |     );
  266 |     expect(reverted.ok, `revert → ${reverted.status}`).toBeTruthy();
  267 |     expect(reverted.data.data?.deletedCards).toBe(rows.length);
  268 | 
  269 |     // The card is gone, and its number is available again.
  270 |     const balance = await getGiftCardBalanceRaw(row(0).code);
  271 |     expect(balance.status).toBe(404);
  272 |     const preview = await previewGiftCardImportRaw(adminToken, scope(), csv);
  273 |     expect(preview.data.data?.willCreate).toBe(rows.length);
  274 | 
  275 |     importId = "";
  276 |   });
  277 | 
  278 |   test("TC-506: an import cannot be reverted twice", async () => {
  279 |     // Re-import so this test owns its own row rather than depending on order.
  280 |     const fresh = await importGiftCardsRaw(adminToken, scope(), csv);
  281 |     expect(fresh.ok).toBeTruthy();
  282 |     const freshId = fresh.data.data?.importId ?? "";
  283 |     expect(freshId).not.toBe("");
  284 | 
```