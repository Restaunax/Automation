# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/gift-card-batches.spec.ts >> Admin — Physical gift card batches >> TC-470: 'Card export' downloads the printer's data file for the batch
- Location: tests/dashboard/admin/gift-card-batches.spec.ts:126:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 0
+ Received  + 1

@@ -1,10 +1,11 @@
  Array [
    "sequence",
    "code",
    "code_display",
    "barcode_value",
+   "qr_value",
    "card_last4",
    "batch_id",
    "batch_label",
    "scope_type",
    "scope_name",
```

# Test source

```ts
  32  |   listGiftCardsAdminRaw,
  33  |   unfreezeGiftCardRaw,
  34  |   adjustGiftCardBalanceRaw,
  35  |   getGiftCardBalanceRaw,
  36  |   validateGiftCardPublicRaw,
  37  | } from "../../../utils/apiHelper";
  38  | 
  39  | const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
  40  | const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
  41  | 
  42  | const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/;
  43  | 
  44  | const msg = (body: unknown): string =>
  45  |   body && typeof body === "object" && "message" in body
  46  |     ? String((body as { message: unknown }).message)
  47  |     : JSON.stringify(body);
  48  | 
  49  | test.describe("Admin — Physical gift card batches", () => {
  50  |   test.skip(
  51  |     !ADMIN_EMAIL || !ADMIN_PASSWORD,
  52  |     "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  53  |   );
  54  | 
  55  |   const runId = generateRunId();
  56  |   const label = `Auto batch ${runId}`;
  57  |   let adminToken = "";
  58  |   let restaurantId = "";
  59  |   let restaurantName = "";
  60  |   let batchId = "";
  61  |   let codes: string[] = [];
  62  |   let batches: AdminGiftCardBatchesPage;
  63  | 
  64  |   test.beforeAll(async () => {
  65  |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  66  |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  67  |     const tenant = await createSecondOwner(adminToken, runId);
  68  |     if (!tenant.restaurantId) {
  69  |       throw new Error(
  70  |         "[gift-card-batches] could not mint the throwaway tenant restaurant"
  71  |       );
  72  |     }
  73  |     restaurantId = tenant.restaurantId;
  74  |     restaurantName = `Automation Owner2 Store ${runId}`;
  75  |     const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
  76  |       isEnabled: true,
  77  |     });
  78  |     if (!cfg.ok)
  79  |       throw new Error(
  80  |         `[gift-card-batches] config write failed: ${msg(cfg.data)}`
  81  |       );
  82  |   });
  83  | 
  84  |   test.afterAll(async () => {
  85  |     if (!adminToken) return;
  86  |     // Stock that never sold is frozen so the codes can never be loaded.
  87  |     if (batchId) {
  88  |       await freezeGiftCardBatchRaw(adminToken, batchId).catch(() => {
  89  |         /* already frozen by TC-473 — nothing to do */
  90  |       });
  91  |     }
  92  |     if (restaurantId && !process.env.OWNER2_EMAIL) {
  93  |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
  94  |         /* archive is best-effort; globalTeardown sweeps the user */
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
> 132 |     expect(header).toEqual([
      |                    ^ Error: expect(received).toEqual(expected) // deep equality
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
  195 |     expect(card, "a card from the batch").toBeTruthy();
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
```