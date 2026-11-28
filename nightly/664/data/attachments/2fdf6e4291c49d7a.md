# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/40-accountant-package-ui.spec.ts >> Owner — Products → Books & Taxes opens the add-on's first section (UI) >> TC-1960: Products → Books & Taxes "See it in action" opens the add-on's first section
- Location: tests/dashboard/owner/40-accountant-package-ui.spec.ts:259:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "401 GET https://api.qa.restaunax.com/api/training/me",
+   "401 GET https://api.qa.restaunax.com/api/auth/verify",
+ ]
```

# Test source

```ts
  198 |     ).toBeEnabled();
  199 |     await dialog.getByRole("button", { name: "Close" }).click();
  200 |     await expect(dialog).toBeHidden();
  201 |     expect(refused).toEqual([]);
  202 |   });
  203 | 
  204 |   test('TC-1959: a package for only today is refused with "Nothing to include yet", in the language asked for (API)', async () => {
  205 |     // The restaurant's open business day (its time zone, 4 am cutoff).
  206 |     const day = await restaurantBusinessToday(restaurantId);
  207 |     const path = (extra = "") =>
  208 |       `/api/reports/${restaurantId}/accountant-package?startDate=${day}&endDate=${day}&format=pdf${extra}`;
  209 |     const cases: {
  210 |       name: string;
  211 |       extra: string;
  212 |       headers: Record<string, string>;
  213 |       want: string;
  214 |     }[] = [
  215 |       {
  216 |         name: "EN",
  217 |         extra: "&lang=en",
  218 |         headers: { "Accept-Language": "en" },
  219 |         want: NOTHING_YET.en,
  220 |       },
  221 |       {
  222 |         name: "ES by Accept-Language",
  223 |         extra: "",
  224 |         headers: { "Accept-Language": "es" },
  225 |         want: NOTHING_YET.es,
  226 |       },
  227 |       // The dashboard sends the language it is showing (lang=), which wins.
  228 |       {
  229 |         name: "ES by lang=",
  230 |         extra: "&lang=es",
  231 |         headers: { "Accept-Language": "en" },
  232 |         want: NOTHING_YET.es,
  233 |       },
  234 |     ];
  235 |     for (const c of cases) {
  236 |       const res = await apiRequestRaw<{ success?: boolean; message?: string }>(
  237 |         "GET",
  238 |         path(c.extra),
  239 |         undefined,
  240 |         ownerToken,
  241 |         c.headers
  242 |       );
  243 |       expect(res.status, `${c.name}: ${JSON.stringify(res.data)}`).toBe(400);
  244 |       expect(res.data.success, c.name).toBe(false);
  245 |       expect(res.data.message, c.name).toBe(c.want);
  246 |     }
  247 |   });
  248 | });
  249 | 
  250 | // TC-1960 runs on the SEED restaurant: Billing → Add-ons needs a subscription
  251 | // ("No Subscription Assigned" otherwise), and the seed is the one QA
  252 | // restaurant with one. Read-only: nothing is asked for.
  253 | test.describe("Owner — Products → Books & Taxes opens the add-on's first section (UI)", () => {
  254 |   test.skip(
  255 |     !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
  256 |     "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
  257 |   );
  258 | 
  259 |   test('TC-1960: Products → Books & Taxes "See it in action" opens the add-on\'s first section', async ({
  260 |     ownerPage,
  261 |   }) => {
  262 |     await allure.label("feature", "Books & taxes (dashboard)");
  263 |     await allure.label("severity", "critical");
  264 |     const seedId = readSharedState().restaurantId;
  265 |     const seedToken = (
  266 |       await apiLogin(process.env.OWNER_EMAIL!, process.env.OWNER_PASSWORD!)
  267 |     ).accessToken;
  268 |     // The Products list offers only what the restaurant lacks.
  269 |     const features =
  270 |       (await getRestaurantFeaturesRaw(seedToken, seedId)).data.data?.features ??
  271 |       [];
  272 |     test.skip(
  273 |       features.includes("ACCOUNTING_SYNC"),
  274 |       "the seed restaurant has Books & Taxes on — no product card to start from"
  275 |     );
  276 |     const refused: string[] = [];
  277 |     ownerPage.on("response", (res: PwResponse) => {
  278 |       if (
  279 |         /\/api\/|\/restaurant\//.test(res.url()) &&
  280 |         [401, 403].includes(res.status())
  281 |       )
  282 |         refused.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  283 |     });
  284 | 
  285 |     await ownerPage.goto(
  286 |       `/restaurant/restaurantId/${seedId}/restaurantManagement?tab=Billing&section=addons`,
  287 |       { waitUntil: "domcontentloaded" }
  288 |     );
  289 |     const card = ownerPage.getByTestId("product-card-ACCOUNTING_SYNC");
  290 |     await expect(card).toBeVisible({ timeout: 30_000 });
  291 |     await card.getByRole("button", { name: "See it in action" }).click();
  292 |     await expect(ownerPage).toHaveURL(/[?&]tab=books-taxes(&|$)/);
  293 |     await expect(ownerPage).toHaveURL(/[?&]section=books(&|$)/);
  294 |     // The add-on's first section says what it does, with the ask; no price.
  295 |     const teaser = ownerPage.getByTestId("books-addon-books");
  296 |     await expect(teaser).toBeVisible({ timeout: 30_000 });
  297 |     await expect(teaser.getByText(/\$\d/)).toHaveCount(0);
> 298 |     expect(refused).toEqual([]);
      |                     ^ Error: expect(received).toEqual(expected) // deep equality
  299 |   });
  300 | });
  301 | 
```