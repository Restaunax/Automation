# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/demo/03-qa-sim-day.spec.ts >> Admin — QA Run a day: the live, lawful week >> the live-day and lawful-wage checks are never red after the fix shipped
- Location: tests/dashboard/admin/demo/03-qa-sim-day.spec.ts:112:9

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "my 2 store 2026-11-04 time.ordersSpread: 30 sales fell in only 4 different hours (at least 6 expected).",
+ ]
```

# Test source

```ts
  33  | 
  34  | const NEVER_RED = [
  35  |   "payroll.minWage",
  36  |   "time.ordersSpread",
  37  |   "time.punchSource",
  38  |   "time.shortShift",
  39  |   "tips.managerReceives",
  40  |   "tips.noReceiverDays",
  41  | ];
  42  | 
  43  | /** The Stage 6 simulator checks (restaunax qaSim/verify/rules/scenarios.ts). */
  44  | const STAGE6_CHECKS = [
  45  |   "close.volume",
  46  |   "time.laborPercent",
  47  |   "tips.cashDeclared",
  48  |   "time.openOvernight",
  49  |   "close.reminderSent",
  50  |   "books.provisionalPosted",
  51  |   "close.voidAfterPayment",
  52  |   "tax.refundNetted",
  53  |   "tips.splitLegs",
  54  |   "close.lateSales",
  55  | ];
  56  | 
  57  | interface CheckLine {
  58  |   check: string;
  59  |   businessDate: string;
  60  |   verdict: "OK" | "WAITING" | "WRONG" | "NOT_APPLICABLE";
  61  |   code: string;
  62  |   text: string;
  63  | }
  64  | interface ChecksDetail {
  65  |   restaurantName: string;
  66  |   problems: CheckLine[];
  67  |   waiting: CheckLine[];
  68  |   ok: CheckLine[];
  69  |   notChecked: CheckLine[];
  70  | }
  71  | interface SimRow {
  72  |   restaurantId: string;
  73  |   restaurantName: string;
  74  |   enabled: boolean;
  75  |   lastRun: { status: string; trigger?: string } | null;
  76  | }
  77  | 
  78  | async function hqGet<T>(token: string, path: string): Promise<T> {
  79  |   const res = await fetch(`${BACKEND_URL}${path}`, {
  80  |     headers: { Authorization: `Bearer ${token}` },
  81  |   });
  82  |   expect(res.status, `GET ${path}`).toBe(200);
  83  |   const body = (await res.json()) as { data: T };
  84  |   return body.data;
  85  | }
  86  | 
  87  | test.describe(
  88  |   "Admin — QA Run a day: the live, lawful week",
  89  |   { tag: ["@demo"] },
  90  |   () => {
  91  |     let token = "";
  92  |     let rows: SimRow[] = [];
  93  | 
  94  |     test.beforeAll(async () => {
  95  |       // A check that can't sign in must fail, never pass silently.
  96  |       expect(ADMIN_EMAIL, "ADMIN_EMAIL is required").not.toBe("");
  97  |       expect(ADMIN_PASSWORD, "ADMIN_PASSWORD is required").not.toBe("");
  98  |       token = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  99  |       rows = await hqGet<SimRow[]>(token, "/api/admin/qa-sim/restaurants");
  100 |     });
  101 | 
  102 |     test("every run says how it was played (live day or compressed button press)", async () => {
  103 |       await allure.severity("normal");
  104 |       for (const r of rows) {
  105 |         if (!r.lastRun) continue;
  106 |         expect(["MANUAL", "AUTO", "LIVE"], r.restaurantName).toContain(
  107 |           r.lastRun.trigger
  108 |         );
  109 |       }
  110 |     });
  111 | 
  112 |     test("the live-day and lawful-wage checks are never red after the fix shipped", async () => {
  113 |       await allure.severity("critical");
  114 |       const enabled = rows.filter((r) => r.enabled);
  115 |       test.skip(
  116 |         enabled.length === 0,
  117 |         "No enrolled test restaurant on this environment"
  118 |       );
  119 |       const red: string[] = [];
  120 |       for (const r of enabled) {
  121 |         const d = await hqGet<ChecksDetail>(
  122 |           token,
  123 |           `/api/admin/qa-sim/checks/${r.restaurantId}`
  124 |         );
  125 |         for (const line of d.problems) {
  126 |           if (!NEVER_RED.includes(line.check)) continue;
  127 |           if (line.businessDate < LIVE_SINCE) continue;
  128 |           red.push(
  129 |             `${d.restaurantName} ${line.businessDate} ${line.check}: ${line.text}`
  130 |           );
  131 |         }
  132 |       }
> 133 |       expect(red).toEqual([]);
      |                   ^ Error: expect(received).toEqual(expected) // deep equality
  134 |     });
  135 | 
  136 |     test("the reference tax-rate check is at worst amber, and every line is text, not a key", async () => {
  137 |       await allure.severity("normal");
  138 |       for (const r of rows.filter((x) => x.enabled)) {
  139 |         const d = await hqGet<ChecksDetail>(
  140 |           token,
  141 |           `/api/admin/qa-sim/checks/${r.restaurantId}`
  142 |         );
  143 |         const all = [...d.problems, ...d.waiting, ...d.ok, ...d.notChecked];
  144 |         for (const line of all.filter(
  145 |           (l) => l.check === "tax.rateMatchesState"
  146 |         )) {
  147 |           expect(
  148 |             line.verdict,
  149 |             `${d.restaurantName} ${line.businessDate}`
  150 |           ).not.toBe("WRONG");
  151 |         }
  152 |         for (const line of all) {
  153 |           expect(line.text, line.check).not.toMatch(/^api:|qaSim\.checks\./);
  154 |         }
  155 |       }
  156 |     });
  157 | 
  158 |     test("TC-1535: each day checked with the Stage 6 rules carries every one of them, as text", async () => {
  159 |       await allure.severity("normal");
  160 |       const enabled = rows.filter((r) => r.enabled);
  161 |       test.skip(
  162 |         enabled.length === 0,
  163 |         "No enrolled test restaurant on this environment"
  164 |       );
  165 |       let seen = false;
  166 |       const missing: string[] = [];
  167 |       for (const r of enabled) {
  168 |         const d = await hqGet<ChecksDetail>(
  169 |           token,
  170 |           `/api/admin/qa-sim/checks/${r.restaurantId}`
  171 |         );
  172 |         const all = [...d.problems, ...d.waiting, ...d.ok, ...d.notChecked];
  173 |         const byDate = new Map<string, Set<string>>();
  174 |         for (const line of all) {
  175 |           if (!STAGE6_CHECKS.includes(line.check)) continue;
  176 |           expect(line.text, line.check).not.toMatch(/^api:|qaSim\.checks\./);
  177 |           const set = byDate.get(line.businessDate) ?? new Set<string>();
  178 |           set.add(line.check);
  179 |           byDate.set(line.businessDate, set);
  180 |         }
  181 |         for (const [date, checks] of byDate) {
  182 |           seen = true;
  183 |           const absent = STAGE6_CHECKS.filter((c) => !checks.has(c));
  184 |           if (absent.length)
  185 |             missing.push(`${d.restaurantName} ${date}: ${absent.join(", ")}`);
  186 |         }
  187 |       }
  188 |       // Before the Stage 6 simulator reaches QA no day has these checks.
  189 |       requireRelease("simScenariosStage6", seen);
  190 |       expect(missing).toEqual([]);
  191 |     });
  192 |   }
  193 | );
  194 | 
```