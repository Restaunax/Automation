# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-promotion-preview.spec.ts >> Owner — Promotion preview (API) >> TC-872: creating a preview returns a one-hour lima URL
- Location: tests/dashboard/owner/api-promotion-preview.spec.ts:181:7

# Error details

```
Error: {"success":false,"message":"A combo needs at least 2 items. You can add the same item twice.","errorCode":"DEAL_VALIDATION_FAILED","errorId":"e7383d1f-3322-4e2d-b42d-6a884fe8dd81"}

expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 400
```

# Test source

```ts
  7   |  * restaurant / per identity, so this file can never evict
  8   |  * 26-promotion-preview's previews or spend its limiter budget. The tenant gets
  9   |  * a tax rate (/quote refuses without one) and a per-run
  10  |  * "Automation Menu Preview <id>" category with three AUTO items.
  11  |  *
  12  |  * Every test ends its own preview(s) in `finally` (at most two live at once —
  13  |  * TC-878); afterAll ends anything left as a backstop, hard-deletes the items,
  14  |  * deletes the category and archives the tenant. A preview never takes a deal
  15  |  * slot; TC-873 holds ONE real deal slot on the tenant (its own cap) for the
  16  |  * length of the test, deleted in finally.
  17  |  *
  18  |  * The backend refuses to mint previews (503 PROMOTION_PREVIEW_UNAVAILABLE)
  19  |  * while its ORDERING_BASE_URL is unset; the whole file then skips with that
  20  |  * reason instead of failing — any other answer runs the tests as written.
  21  |  * Nightly lane (no @smoke).
  22  |  */
  23  | import * as allure from "allure-js-commons";
  24  | import { test, expect } from "../../../fixtures/base";
  25  | import {
  26  |   apiLogin,
  27  |   apiRequestRaw,
  28  |   BACKEND_URL,
  29  |   createMenuGroupNamed,
  30  |   createDealApi,
  31  |   createMenuItemFull,
  32  |   createSecondOwner,
  33  |   deleteDealApi,
  34  |   deleteTestMenuGroup,
  35  |   deleteTestRestaurant,
  36  |   ensureTaxRate,
  37  |   getActiveDealsCountRaw,
  38  |   permanentlyDeleteMenuItemApi,
  39  | } from "../../../utils/apiHelper";
  40  | import {
  41  |   createRestaurantPreviewRaw,
  42  |   endPreviewRaw,
  43  |   getPreviewRaw,
  44  |   previewHeader,
  45  |   type PreviewCreated,
  46  | } from "../../../utils/previewApi";
  47  | import { listPromotions } from "../../../utils/promotionsApi";
  48  | import {
  49  |   generateRunId,
  50  |   LIMA_ORDERING_URL,
  51  |   readRestaurantId,
  52  |   readSharedState,
  53  | } from "../../../utils/testData";
  54  | 
  55  | const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
  56  | const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
  57  | const DAY = 24 * 60 * 60 * 1000;
  58  | const TOKEN_IN_URL = /\/preview\/([A-Za-z0-9_-]{43})$/;
  59  | const UNAVAILABLE_REASON =
  60  |   "Previews are switched off on this backend (503 PROMOTION_PREVIEW_UNAVAILABLE): set ORDERING_BASE_URL on QA, then re-run";
  61  | 
  62  | test.describe("Owner — Promotion preview (API)", () => {
  63  |   test.skip(
  64  |     !ADMIN_EMAIL || !ADMIN_PASSWORD,
  65  |     "ADMIN_* credentials not set in .env (admin mints the throwaway tenant)"
  66  |   );
  67  |   test.describe.configure({ mode: "serial" });
  68  | 
  69  |   const runId = generateRunId();
  70  |   let adminToken = "";
  71  |   let token = "";
  72  |   let restaurantId = "";
  73  |   let groupId = "";
  74  |   let previewsUnavailable = false;
  75  |   const items: { id: string; name: string; price: number }[] = [];
  76  |   /** Every token ever minted — afterAll's backstop (DELETE is idempotent). */
  77  |   const opened: string[] = [];
  78  |   /** The per-run item at `i` (Burger $12, Cookie $4, Soda $2); throws if beforeAll did not seed it. */
  79  |   const item = (i: number) => {
  80  |     const found = items[i];
  81  |     if (!found) throw new Error(`per-run menu item ${i} was not seeded`);
  82  |     return found;
  83  |   };
  84  | 
  85  |   const comboBody = (name: string, extra: Record<string, unknown> = {}) => ({
  86  |     source: "DEAL",
  87  |     body: {
  88  |       name,
  89  |       dealPrice: 9.5,
  90  |       items: [
  91  |         {
  92  |           menuItemId: item(0).id,
  93  |           quantity: 1,
  94  |           itemName: item(0).name,
  95  |           itemPrice: item(0).price,
  96  |           role: "INCLUDED",
  97  |         },
  98  |       ],
  99  |       ...extra,
  100 |     },
  101 |   });
  102 |   const open = async (
  103 |     body: Record<string, unknown>
  104 |   ): Promise<PreviewCreated> => {
  105 |     const res = await createRestaurantPreviewRaw(token, restaurantId, body);
  106 |     if (res.data.data?.token) opened.push(res.data.data.token);
> 107 |     expect(res.status, JSON.stringify(res.data)).toBe(201);
      |                                                  ^ Error: {"success":false,"message":"A combo needs at least 2 items. You can add the same item twice.","errorCode":"DEAL_VALIDATION_FAILED","errorId":"e7383d1f-3322-4e2d-b42d-6a884fe8dd81"}
  108 |     return res.data.data!;
  109 |   };
  110 |   /** The preview's own deal id, from its payload. */
  111 |   const previewDealId = async (previewToken: string): Promise<string> => {
  112 |     const res = await getPreviewRaw(previewToken);
  113 |     expect(res.status, JSON.stringify(res.data)).toBe(200);
  114 |     return (res.data.data!.promotion as { id: string }).id;
  115 |   };
  116 | 
  117 |   test.beforeAll(async () => {
  118 |     test.setTimeout(180_000);
  119 |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  120 |     // alwaysFresh: never OWNER2's persistent restaurant — this file seeds
  121 |     // items and previews onto the tenant and archives it afterwards.
  122 |     const tenant = await createSecondOwner(adminToken, runId, {
  123 |       alwaysFresh: true,
  124 |     });
  125 |     if (!tenant.restaurantId)
  126 |       throw new Error(
  127 |         "[api-promotion-preview] could not mint the throwaway tenant restaurant"
  128 |       );
  129 |     token = tenant.accessToken;
  130 |     restaurantId = tenant.restaurantId;
  131 | 
  132 |     // Availability probe — an empty body. The backend answers 503 before it
  133 |     // validates anything when previews are off; otherwise it is a 400 and
  134 |     // nothing is created.
  135 |     const probe = await createRestaurantPreviewRaw(token, restaurantId, {});
  136 |     if (
  137 |       probe.status === 503 &&
  138 |       probe.data.errorCode === "PROMOTION_PREVIEW_UNAVAILABLE"
  139 |     ) {
  140 |       previewsUnavailable = true;
  141 |       return;
  142 |     }
  143 | 
  144 |     // /quote refuses restaurants without a tax rate.
  145 |     await ensureTaxRate(adminToken, restaurantId);
  146 |     groupId = (
  147 |       await createMenuGroupNamed(token, `Automation Menu Preview ${runId}`, {
  148 |         restaurantId,
  149 |       })
  150 |     ).id;
  151 |     for (const [label, price] of [
  152 |       ["Burger", 12],
  153 |       ["Cookie", 4],
  154 |       ["Soda", 2],
  155 |     ] as const) {
  156 |       const name = `AUTO Preview ${label} ${runId}`;
  157 |       const seeded = await createMenuItemFull(token, groupId, name, price);
  158 |       items.push({ id: seeded.id, name, price });
  159 |     }
  160 |   });
  161 | 
  162 |   test.afterAll(async () => {
  163 |     if (!token) return;
  164 |     // Backstop only — each test ends its previews in finally. Previews first:
  165 |     // they reference the per-run items.
  166 |     for (const t of opened) await endPreviewRaw(t).catch(() => {});
  167 |     for (const row of items)
  168 |       await permanentlyDeleteMenuItemApi(adminToken, row.id).catch(() => {});
  169 |     if (groupId) await deleteTestMenuGroup(token, groupId).catch(() => {});
  170 |     // Admin DELETE archives the throwaway restaurant (never a hard delete).
  171 |     if (restaurantId)
  172 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  173 |   });
  174 | 
  175 |   test.beforeEach(async () => {
  176 |     test.skip(previewsUnavailable, UNAVAILABLE_REASON);
  177 |     await allure.label("feature", "Promotions");
  178 |     await allure.label("severity", "critical");
  179 |   });
  180 | 
  181 |   test("TC-872: creating a preview returns a one-hour lima URL", async () => {
  182 |     const created = await open(comboBody(`AUTO Preview Combo ${runId}`));
  183 |     try {
  184 |       expect(
  185 |         created.previewUrl.startsWith(`${LIMA_ORDERING_URL}/preview/`)
  186 |       ).toBe(true);
  187 |       expect(TOKEN_IN_URL.exec(created.previewUrl)?.[1]).toBe(created.token);
  188 |       const ttl = Date.parse(created.expiresAt) - Date.now();
  189 |       expect(ttl).toBeGreaterThan(55 * 60 * 1000);
  190 |       expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
  191 |     } finally {
  192 |       await endPreviewRaw(created.token);
  193 |     }
  194 |   });
  195 | 
  196 |   test("TC-873: a preview is never listed or counted", async () => {
  197 |     // One real ACTIVE deal on the tenant (its own cap, never the seed's), so
  198 |     // the count/list parity below is non-vacuous: 1 slot held, preview not.
  199 |     const real = await createDealApi(
  200 |       token,
  201 |       restaurantId,
  202 |       `AUTO Preview Real Combo ${runId}`,
  203 |       14,
  204 |       [
  205 |         { id: item(0).id, name: item(0).name, price: item(0).price },
  206 |         { id: item(1).id, name: item(1).name, price: item(1).price },
  207 |       ],
```