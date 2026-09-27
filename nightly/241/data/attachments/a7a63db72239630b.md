# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/gift-card-batches.spec.ts >> Admin — Physical gift card batches >> TC-472: an admin balance adjustment cannot fund stock — that would mint money nobody paid for
- Location: tests/dashboard/admin/gift-card-batches.spec.ts:188:7

# Error details

```
Error: a card from the batch

expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
  95  |       });
  96  |     }
  97  |   });
  98  | 
  99  |   test.beforeEach(async ({ adminPage }) => {
  100 |     await allure.label("feature", "Gift cards — physical stock");
  101 |     await allure.label("severity", "critical");
  102 |     batches = createAdminGiftCardBatchesPage(adminPage);
  103 |   });
  104 | 
  105 |   test("TC-469: 'Mint a batch' creates INACTIVE stock — 5 cards, 5 in stock, none sold", async () => {
  106 |     await batches.goto(restaurantName);
  107 |     const minted = await batches.mintBatch({
  108 |       label,
  109 |       quantity: 5,
  110 |       vendorRef: `PO-${runId}`,
  111 |     });
  112 |     batchId = minted.data.id;
  113 |     await expect(batches.stockText(label, 5)).toBeVisible();
  114 | 
  115 |     const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
  116 |     const row = list.data.data.find((b) => b.id === batchId);
  117 |     expect(row).toMatchObject({
  118 |       label,
  119 |       quantity: 5,
  120 |       status: "DRAFT",
  121 |       exportCount: 0,
  122 |       counts: { inactive: 5, active: 0, depleted: 0, frozen: 0 },
  123 |     });
  124 |   });
  125 | 
  126 |   test("TC-470: 'Card export' downloads the printer's data file for the batch", async () => {
  127 |     await batches.goto(restaurantName);
  128 |     const download = await batches.exportCsv(label);
  129 |     expect(download.suggestedFilename()).toMatch(/^gift-cards-.*\.csv$/);
  130 |     const text = fs.readFileSync(await download.path(), "utf8");
  131 |     const { header, rows } = csvToObjects(text);
  132 |     expect(header).toEqual([
  133 |       "sequence",
  134 |       "code",
  135 |       "code_display",
  136 |       "barcode_value",
  137 |       "card_last4",
  138 |       "batch_id",
  139 |       "batch_label",
  140 |       "scope_type",
  141 |       "scope_name",
  142 |     ]);
  143 |     expect(rows).toHaveLength(5);
  144 |     for (const row of rows) {
  145 |       expect(row.code).toMatch(CODE_RE);
  146 |       expect(row.barcode_value).toBe(row.code);
  147 |       expect(row.batch_id).toBe(batchId);
  148 |       expect(row.scope_type).toBe("restaurant");
  149 |       expect(row.scope_name).toBe(restaurantName);
  150 |     }
  151 |     // Free text is always quoted — printers' importers are unforgiving of spaces.
  152 |     expect(text).toContain(`"${label}"`);
  153 |     expect(text).toContain(`"${restaurantName}"`);
  154 |     codes = rows.map((r) => r.code ?? "");
  155 | 
  156 |     const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
  157 |     expect(list.data.data.find((b) => b.id === batchId)).toMatchObject({
  158 |       status: "EXPORTED",
  159 |       exportCount: 1,
  160 |     });
  161 |   });
  162 | 
  163 |   test("TC-471: to the public, a stock card is a real card with nothing on it — not an unknown code", async () => {
  164 |     await allure.description(
  165 |       "balance → 200 + INACTIVE (so 'minted but unloaded' is distinguishable from a 404 typo); validate → " +
  166 |         "valid:false with the not-activated wording; a random well-formed code → 404."
  167 |     );
  168 |     const code = codes[0] ?? "";
  169 |     const balance = await getGiftCardBalanceRaw(code);
  170 |     expect(balance.status, JSON.stringify(balance.data)).toBe(200);
  171 |     expect((balance.data as { data: unknown }).data).toMatchObject({
  172 |       currentBalance: 0,
  173 |       initialBalance: 0,
  174 |       status: "INACTIVE",
  175 |     });
  176 | 
  177 |     const validate = await validateGiftCardPublicRaw(code, restaurantId);
  178 |     expect(validate.status).toBe(200);
  179 |     expect(validate.data.data.valid).toBe(false);
  180 |     expect(validate.data.data.reason).toMatch(
  181 |       /not been activated|not activated/i
  182 |     );
  183 | 
  184 |     const unknown = await getGiftCardBalanceRaw("ZZZZYYYYXXXXWWWW");
  185 |     expect(unknown.status).toBe(404);
  186 |   });
  187 | 
  188 |   test("TC-472: an admin balance adjustment cannot fund stock — that would mint money nobody paid for", async () => {
  189 |     const cards = await listGiftCardsAdminRaw(adminToken, {
  190 |       restaurantId,
  191 |       batchId,
  192 |     });
  193 |     expect(cards.status, JSON.stringify(cards.data)).toBe(200);
  194 |     const card = cards.data.data.giftCards[0];
> 195 |     expect(card, "a card from the batch").toBeTruthy();
      |                                           ^ Error: a card from the batch
  196 |     const adjust = await adjustGiftCardBalanceRaw(
  197 |       adminToken,
  198 |       card!.id,
  199 |       25,
  200 |       `automation ${runId}`
  201 |     );
  202 |     expect(adjust.status, JSON.stringify(adjust.data)).toBe(409);
  203 |     expect(adjust.data.code).toBe("NOT_ACTIVATABLE");
  204 |   });
  205 | 
  206 |   test("TC-473: 'Freeze stock' freezes every unsold card in the batch; freezing again finds nothing", async () => {
  207 |     await batches.goto(restaurantName);
  208 |     const frozen = await batches.freezeStock(label);
  209 |     expect(frozen.data.frozen).toBe(5);
  210 |     await expect(batches.frozenText(label, 5)).toBeVisible();
  211 | 
  212 |     const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
  213 |     expect(list.data.data.find((b) => b.id === batchId)).toMatchObject({
  214 |       status: "FROZEN",
  215 |       counts: { inactive: 0, frozen: 5 },
  216 |     });
  217 |     const again = await freezeGiftCardBatchRaw(adminToken, batchId);
  218 |     expect(again.data.data?.frozen).toBe(0);
  219 |   });
  220 | 
  221 |   test("TC-474: unfreezing a stock card restores INACTIVE — never ACTIVE, which would make it redeemable with no balance", async () => {
  222 |     const frozenCards = await listGiftCardsAdminRaw(adminToken, {
  223 |       restaurantId,
  224 |       batchId,
  225 |       status: "FROZEN",
  226 |     });
  227 |     const card = frozenCards.data.data.giftCards[0];
  228 |     expect(card, "a frozen card").toBeTruthy();
  229 |     const thawed = await unfreezeGiftCardRaw(adminToken, card!.id);
  230 |     expect(thawed.status, JSON.stringify(thawed.data)).toBe(200);
  231 | 
  232 |     const inactive = await listGiftCardsAdminRaw(adminToken, {
  233 |       restaurantId,
  234 |       batchId,
  235 |       status: "INACTIVE",
  236 |     });
  237 |     expect(inactive.data.data.giftCards.map((c) => c.id)).toContain(card!.id);
  238 |   });
  239 | 
  240 |   test("TC-475: batch quantity is validated — 0 and 5,001 are refused before a single card is minted", async () => {
  241 |     const zero = await createGiftCardBatchRaw(adminToken, {
  242 |       restaurantId,
  243 |       quantity: 0,
  244 |       label: `zero ${runId}`,
  245 |     });
  246 |     expect(zero.status, JSON.stringify(zero.data)).toBe(400);
  247 |     expect(zero.data.code).toBe("INVALID_QUANTITY");
  248 |     // 5,000 is the cap; 5,001 is refused. (Never mint 5,000 on QA — cost and rate limits.)
  249 |     const huge = await createGiftCardBatchRaw(adminToken, {
  250 |       restaurantId,
  251 |       quantity: 5001,
  252 |       label: `huge ${runId}`,
  253 |     });
  254 |     expect(huge.status, JSON.stringify(huge.data)).toBe(400);
  255 |     expect(huge.data.code).toBe("BATCH_TOO_LARGE");
  256 | 
  257 |     const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
  258 |     expect(list.data.data.filter((b) => b.label.includes(runId))).toHaveLength(
  259 |       1
  260 |     );
  261 |   });
  262 | 
  263 |   test("TC-476: the physical-card knobs round-trip through the config endpoint (cash off, custom cap)", async () => {
  264 |     await allure.description(
  265 |       "allowPhysicalActivation / allowCashFunding / maxCashFloatPerLocation are what the POS load path " +
  266 |         "reads. PUT stores them, GET returns them, and a negative cap is refused."
  267 |     );
  268 |     const put = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
  269 |       allowPhysicalActivation: true,
  270 |       allowCashFunding: false,
  271 |       maxCashFloatPerLocation: 750,
  272 |     });
  273 |     expect(put.status, JSON.stringify(put.data)).toBe(200);
  274 |     const get = await getGiftCardConfigAdminRaw(adminToken, restaurantId);
  275 |     expect(get.data.data).toMatchObject({
  276 |       isEnabled: true,
  277 |       allowPhysicalActivation: true,
  278 |       allowCashFunding: false,
  279 |       maxCashFloatPerLocation: 750,
  280 |     });
  281 |     const bad = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
  282 |       maxCashFloatPerLocation: -1,
  283 |     });
  284 |     expect(bad.status, JSON.stringify(bad.data)).toBe(400);
  285 |   });
  286 | });
  287 | 
```