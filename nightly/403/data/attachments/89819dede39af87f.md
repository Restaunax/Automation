# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-addon-billing.spec.ts >> Add-on billing — Add-ons page, refusals, Team bundle, payroll headcount (API) >> TC-781: every per-location service is a row with its terms in fields; nothing is offered as a locked button
- Location: tests/dashboard/owner/api-addon-billing.spec.ts:133:7

# Error details

```
Error: MENU_TVS

expect(received).toEqual(expected) // deep equality

- Expected  - 0
+ Received  + 3

@@ -1,13 +1,16 @@
  Array [
    "activeInstanceId",
    "activeInterval",
    "activePerUnitUsd",
    "activePriceUsd",
+   "activeUnitLabel",
    "canAdd",
    "canKeep",
    "canRemove",
+   "commitmentEndsAt",
+   "committedRemoval",
    "contactUs",
    "endsAt",
    "feature",
    "includedWith",
    "launchPriceApplied",
```

# Test source

```ts
  52  |   "activePriceUsd",
  53  |   "activeInterval",
  54  |   "activeInstanceId",
  55  |   "activePerUnitUsd",
  56  |   "trialEndsAt",
  57  |   "trialKind",
  58  |   "endsAt",
  59  |   "launchPriceApplied",
  60  |   "offer",
  61  |   "replaces",
  62  |   "canAdd",
  63  |   "canRemove",
  64  |   "canKeep",
  65  |   "contactUs",
  66  | ];
  67  | const OFFER_FIELDS = [
  68  |   "addonId",
  69  |   "monthlyPriceUsd",
  70  |   "perUnitUsd",
  71  |   "unitLabel",
  72  |   "trialDays",
  73  |   "trialKind",
  74  |   "trialEligible",
  75  |   "launchPriceUsd",
  76  |   "launchPriceMonths",
  77  |   "launchOfferEndsAt",
  78  | ];
  79  | const NOT_SELF_SERVE =
  80  |   "That add-on can't be added or removed here. Contact RestauNax support.";
  81  | const QA_NOT_READY =
  82  |   "QA can't run it: no self-serve back-office add-ons with trials in the catalogue (create-back-office-addons.ts not run on QA) and no API path to an ACTIVE subscription for a throwaway restaurant (Stripe ToS needs a human). Covered by restaunax addonBilling.int.test.ts.";
  83  | 
  84  | test.describe.configure({ mode: "serial" });
  85  | 
  86  | test.describe("Add-on billing — Add-ons page, refusals, Team bundle, payroll headcount (API)", () => {
  87  |   test.skip(
  88  |     !ADMIN_EMAIL || !ADMIN_PASSWORD,
  89  |     "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenants)"
  90  |   );
  91  | 
  92  |   const runId = generateRunId();
  93  |   let adminToken = "";
  94  |   let ownerToken = "";
  95  |   let restaurantId = "";
  96  |   let otherOwner = "";
  97  |   let otherId = "";
  98  | 
  99  |   const rows = async (token = ownerToken) => {
  100 |     const r = await ownerAddonsRaw(token, restaurantId, "GET");
  101 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  102 |     return r.data.data as Rec;
  103 |   };
  104 |   const row = (data: Rec, feature: string) =>
  105 |     list(data.features).find((f) => f.feature === feature);
  106 | 
  107 |   test.beforeAll(async () => {
  108 |     test.setTimeout(120_000);
  109 |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  110 |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  111 |     const tenant = await createSecondOwner(adminToken, `${runId}a`);
  112 |     const other = await createSecondOwner(adminToken, `${runId}b`);
  113 |     if (!tenant.restaurantId || !other.restaurantId)
  114 |       throw new Error("[api-addon-billing] no tenant");
  115 |     restaurantId = tenant.restaurantId;
  116 |     ownerToken = tenant.accessToken;
  117 |     otherId = other.restaurantId;
  118 |     otherOwner = other.accessToken;
  119 |   });
  120 | 
  121 |   test.afterAll(async () => {
  122 |     for (const id of [restaurantId, otherId]) {
  123 |       if (adminToken && id)
  124 |         await deleteTestRestaurant(adminToken, id).catch(() => {});
  125 |     }
  126 |   });
  127 | 
  128 |   test.beforeEach(async () => {
  129 |     await allure.label("feature", "Add-on billing");
  130 |     await allure.label("severity", "critical");
  131 |   });
  132 | 
  133 |   test("TC-781: every per-location service is a row with its terms in fields; nothing is offered as a locked button", async () => {
  134 |     const data = await rows();
  135 |     expect(data).toMatchObject({
  136 |       canPurchase: true,
  137 |       subscriptionStatus: null,
  138 |       payrollBilling: null,
  139 |     });
  140 |     const features = list(data.features);
  141 |     expect(features.map((f) => f.feature)).toEqual(
  142 |       expect.arrayContaining([
  143 |         "SCHEDULING",
  144 |         "TIP_MANAGEMENT",
  145 |         "TEAM_BUNDLE",
  146 |         "PAYROLL",
  147 |         "ACCOUNTING_SYNC",
  148 |       ])
  149 |     );
  150 |     const offers: string[] = [];
  151 |     for (const f of features) {
> 152 |       expect(Object.keys(f).sort(), String(f.feature)).toEqual(
      |                                                        ^ Error: MENU_TVS
  153 |         [...ROW_FIELDS].sort()
  154 |       );
  155 |       expect(f.source, String(f.feature)).toBeNull();
  156 |       expect(f.canRemove).toBe(false);
  157 |       expect(f.canKeep).toBe(false);
  158 |       expect(f.replaces).toEqual([]);
  159 |       if (f.offer) {
  160 |         offers.push(String(f.feature));
  161 |         expect(Object.keys(f.offer as Rec)).toEqual(
  162 |           expect.arrayContaining(OFFER_FIELDS)
  163 |         );
  164 |         // One trial per feature, ever: a fresh restaurant is still eligible.
  165 |         if ((f.offer as Rec).trialDays)
  166 |           expect((f.offer as Rec).trialEligible).toBe(true);
  167 |         expect(f.canAdd).toBe(true);
  168 |         expect(f.contactUs).toBe(false);
  169 |       } else {
  170 |         // No public price: "talk to us", never a disabled Add button.
  171 |         expect(f.canAdd).toBe(false);
  172 |         expect(f.contactUs).toBe(true);
  173 |       }
  174 |     }
  175 |     test.info().annotations.push({
  176 |       type: "catalogue",
  177 |       description: `self-serve offers on QA: ${offers.join(", ") || "none"}`,
  178 |     });
  179 |   });
  180 | 
  181 |   test("TC-782: buying is refused in words — not self-serve, unknown, not this owner's; removing an unknown add-on is 404", async () => {
  182 |     const data = await rows();
  183 |     const offered = new Set(
  184 |       list(data.features)
  185 |         .map((f) => (f.offer as Rec | null)?.addonId)
  186 |         .filter(Boolean)
  187 |     );
  188 |     const catalog = await adminAddonsRaw(adminToken, "GET", "/catalog");
  189 |     expect(catalog.status).toBe(200);
  190 |     const notSelfServe = list(catalog.data).find(
  191 |       (x) => x.isActive && !offered.has(x.id)
  192 |     );
  193 |     expect(
  194 |       notSelfServe,
  195 |       "QA's catalogue has an admin-only add-on"
  196 |     ).toBeTruthy();
  197 |     const refused = await ownerAddonsRaw(ownerToken, restaurantId, "POST", {
  198 |       addonId: notSelfServe!.id,
  199 |     });
  200 |     expect(refused.status).toBe(400);
  201 |     expect(refused.data.message).toBe(NOT_SELF_SERVE);
  202 |     const unknown = await ownerAddonsRaw(ownerToken, restaurantId, "POST", {
  203 |       addonId: "00000000-0000-4000-8000-000000000000",
  204 |     });
  205 |     expect(unknown.status).toBe(400);
  206 | 
  207 |     const gone = await ownerAddonRemoveRaw(
  208 |       ownerToken,
  209 |       restaurantId,
  210 |       "00000000-0000-4000-8000-000000000000"
  211 |     );
  212 |     expect(gone.status).toBe(404);
  213 | 
  214 |     // Another restaurant's owner can neither look nor buy.
  215 |     expect((await rows(ownerToken)).canPurchase).toBe(true);
  216 |     const peek = await ownerAddonsRaw(otherOwner, restaurantId, "GET");
  217 |     expect(peek.status).toBe(403);
  218 |     const buy = await ownerAddonsRaw(otherOwner, restaurantId, "POST", {
  219 |       addonId: notSelfServe!.id,
  220 |     });
  221 |     expect(buy.status).toBe(403);
  222 |   });
  223 | 
  224 |   test("TC-783: the Team bundle grants Scheduling and Tip Management; the page shows them included with it, not for sale", async () => {
  225 |     const day = new Date().toISOString().slice(0, 10);
  226 |     const before = {
  227 |       schedule: (
  228 |         await schedulingRaw(ownerToken, restaurantId, "GET", `?date=${day}`)
  229 |       ).status,
  230 |       tips: (await tipsRaw(ownerToken, restaurantId, "GET", "/policy")).status,
  231 |     };
  232 |     expect(before).toEqual({ schedule: 403, tips: 403 });
  233 | 
  234 |     const g = await setFeatureOverrideAdminRaw(
  235 |       adminToken,
  236 |       restaurantId,
  237 |       "TEAM_BUNDLE",
  238 |       true,
  239 |       `automation team bundle ${runId}`
  240 |     );
  241 |     expect(g.ok, JSON.stringify(g.data)).toBe(true);
  242 |     try {
  243 |       const features =
  244 |         (await getRestaurantFeaturesRaw(ownerToken, restaurantId)).data.data
  245 |           ?.features ?? [];
  246 |       expect(features).toEqual(
  247 |         expect.arrayContaining([
  248 |           "TEAM_BUNDLE",
  249 |           "SCHEDULING",
  250 |           "TIP_MANAGEMENT",
  251 |           "TIMECARDS",
  252 |         ])
```