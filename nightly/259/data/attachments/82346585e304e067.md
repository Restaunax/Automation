# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/gift-card-import.spec.ts >> Admin — Importing existing gift cards >> TC-505: undoing an import frees the numbers for a corrective import
- Location: tests/dashboard/admin/gift-card-import.spec.ts:249:7

# Error details

```
Error: expect(received).toMatchObject(expected)

Matcher error: received value must be a non-null object

Received has value: undefined
```

# Test source

```ts
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
  184 |     expect((validated.data as { data: unknown }).data).toMatchObject({
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
> 256 |     expect(before.data.data?.find((i) => i.id === importId)).toMatchObject({
      |                                                              ^ Error: expect(received).toMatchObject(expected)
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
  285 |     const first = await revertGiftCardImportRaw(adminToken, freshId, scope());
  286 |     expect(first.ok).toBeTruthy();
  287 | 
  288 |     const second = await revertGiftCardImportRaw(adminToken, freshId, scope());
  289 |     expect(second.ok, "a second revert has nothing to delete").toBeFalsy();
  290 |     expect(second.status).toBe(404);
  291 |   });
  292 | });
  293 | 
```