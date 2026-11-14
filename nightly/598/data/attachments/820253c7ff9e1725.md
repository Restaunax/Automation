# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-accountant-multi-client.spec.ts >> Accountant across clients — the books, read-only (W2:A10, API + browser) >> TC-1339: the accountant reads each client's books — settings, accounts, journal, a day's entry, deposits, sales summary
- Location: tests/dashboard/owner/api-accountant-multi-client.spec.ts:174:7

# Error details

```
Error: a {"error":"NO_ACCESS_TOKEN","message":"Access token is required. Please log in."}

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  80  | 
  81  |   const invite = async (key: "a" | "b") => {
  82  |     const sentAt = new Date();
  83  |     const r = await booksRaw(
  84  |       tenants[key].owner,
  85  |       tenants[key].id,
  86  |       "POST",
  87  |       "/accountants",
  88  |       {
  89  |         email: accountant.email,
  90  |         firstName: "Morgan",
  91  |         lastName: "Books",
  92  |       }
  93  |     );
  94  |     expect(r.status, JSON.stringify(r.data)).toBe(201);
  95  |     const mail = await waitForEmail(accountant.email, {
  96  |       subjectPattern: new RegExp(`read-only access to .*${runId}${key}`, "i"),
  97  |       timeoutMs: 90_000,
  98  |       notBefore: sentAt,
  99  |     });
  100 |     return {
  101 |       rowId: String((r.data.data as Rec).id),
  102 |       token: extractInviteToken(mail.text_body || mail.html_body),
  103 |     };
  104 |   };
  105 | 
  106 |   test.beforeAll(async () => {
  107 |     test.setTimeout(240_000);
  108 |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
  109 |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  110 |     for (const key of ["a", "b", "c"] as const) {
  111 |       const t = await createSecondOwner(adminToken, `${runId}${key}`, {
  112 |         alwaysFresh: true,
  113 |       });
  114 |       if (!t.restaurantId) throw new Error(`[acct-multi] no tenant ${key}`);
  115 |       tenants[key].owner = t.accessToken;
  116 |       tenants[key].id = t.restaurantId;
  117 |       tenants[key].name = `Automation Owner2 Store ${runId}${key}`;
  118 |       const g = await setFeatureOverrideAdminRaw(
  119 |         adminToken,
  120 |         t.restaurantId,
  121 |         "ACCOUNTING_SYNC",
  122 |         true,
  123 |         `automation accountant multi ${runId}`
  124 |       );
  125 |       if (!g.ok)
  126 |         throw new Error(`[acct-multi] grant: ${JSON.stringify(g.data)}`);
  127 |       const closed = await closeDayWebRaw(t.accessToken, t.restaurantId);
  128 |       if (closed.status !== 201)
  129 |         throw new Error(`[acct-multi] close: ${JSON.stringify(closed.data)}`);
  130 |       tenants[key].day = String((closed.data.data as Rec).businessDate).slice(
  131 |         0,
  132 |         10
  133 |       );
  134 |     }
  135 |   });
  136 | 
  137 |   test.afterAll(async () => {
  138 |     for (const t of Object.values(tenants)) {
  139 |       if (adminToken && t.id)
  140 |         await deleteTestRestaurant(adminToken, t.id).catch(() => {});
  141 |     }
  142 |   });
  143 | 
  144 |   test.beforeEach(async () => {
  145 |     await allure.label("feature", "Books & taxes — accountant");
  146 |     await allure.label("severity", "critical");
  147 |   });
  148 | 
  149 |   test("TC-1338: two owners invite the same accountant; one account, both clients in the switcher list @email", async () => {
  150 |     const a = await invite("a");
  151 |     const claimed = await registerWithInvite({
  152 |       firstName: "Morgan",
  153 |       lastName: "Books",
  154 |       email: accountant.email,
  155 |       password: accountant.password,
  156 |       userInvitationToken: a.token,
  157 |     });
  158 |     expect(claimed.role).toBe("USER");
  159 |     const b = await invite("b");
  160 |     accountant.rowB = b.rowId;
  161 |     // An existing account takes a second client while signed in, as the
  162 |     // invitation page does: password login ignores an invitation token.
  163 |     const login = await apiLogin(accountant.email, accountant.password);
  164 |     accountant.token = login.accessToken;
  165 |     const claim = await claimStaffInviteSignedInRaw(accountant.token, b.token);
  166 |     expect(claim.status, JSON.stringify(claim.data)).toBe(200);
  167 | 
  168 |     const clients = await accountantRaw(accountant.token, "/clients");
  169 |     expect(clients.status).toBe(200);
  170 |     const ids = list(clients.data.data).map((c) => c.restaurantId);
  171 |     expect(ids.sort()).toEqual([tenants.a.id, tenants.b.id].sort());
  172 |   });
  173 | 
  174 |   test("TC-1339: the accountant reads each client's books — settings, accounts, journal, a day's entry, deposits, sales summary", async () => {
  175 |     for (const key of ["a", "b"] as const) {
  176 |       const t = tenants[key];
  177 |       const get = (path: string) =>
  178 |         accountantRaw(accountant.token, books(t.id, path));
  179 |       const settings = await get("");
> 180 |       expect(settings.status, `${key} ${JSON.stringify(settings.data)}`).toBe(
      |                                                                          ^ Error: a {"error":"NO_ACCESS_TOKEN","message":"Access token is required. Please log in."}
  181 |         200
  182 |       );
  183 |       expect(JSON.stringify(settings.data)).not.toMatch(
  184 |         /accessToken|refreshToken/
  185 |       );
  186 |       const matching = await get("/matching");
  187 |       expect(matching.status).toBe(200);
  188 |       expect(list((matching.data.data as Rec).rows).length).toBeGreaterThan(0);
  189 |       const days = await get(`/days${range(t)}`);
  190 |       expect(days.status).toBe(200);
  191 |       expect(list(days.data.data)).toEqual([
  192 |         expect.objectContaining({ businessDate: t.day, closed: true }),
  193 |       ]);
  194 |       const entry = await get(`/days/${t.day}`);
  195 |       expect(entry.status).toBe(200);
  196 |       expect(((entry.data.data as Rec).entry as Rec).balanced).toBe(true);
  197 |       const deposits = await get(`/deposits${range(t)}`);
  198 |       expect(deposits.status).toBe(200);
  199 |       const summary = await get(`/sales-summary${range(t)}`);
  200 |       expect(summary.status).toBe(200);
  201 |       expect(summary.data.data).toMatchObject({ ties: true, closedDays: 1 });
  202 |     }
  203 |   });
  204 | 
  205 |   test("TC-1340: the accountant downloads the QuickBooks file and the sales summary CSV", async () => {
  206 |     const t = tenants.a;
  207 |     const qbo = await downloadRaw(
  208 |       accountant.token,
  209 |       `/api/accountant${books(t.id, `/export.csv${range(t)}&format=quickbooks`)}`
  210 |     );
  211 |     expect(qbo.status).toBe(200);
  212 |     expect(qbo.body.toString("utf8").split(/\r?\n/)[0]).toBe(
  213 |       "Journal No.,Journal Date,Account Name,Journal/Description,Debits,Credits"
  214 |     );
  215 |     const check = await accountantRaw(
  216 |       accountant.token,
  217 |       books(t.id, `/export/check${range(t)}&format=xero`)
  218 |     );
  219 |     expect(check.status).toBe(200);
  220 |     const csv = await downloadRaw(
  221 |       accountant.token,
  222 |       `/api/accountant${books(t.id, `/sales-summary.csv${range(t)}`)}`
  223 |     );
  224 |     expect(csv.status).toBe(200);
  225 |     expect(csv.headers.get("content-type")).toContain("text/csv");
  226 |   });
  227 | 
  228 |   test("TC-1341: every write is refused — 403 under /api/accountant, 404 on the owner's own routes; nothing changed", async () => {
  229 |     const t = tenants.a;
  230 |     const tok = accountant.token;
  231 |     for (const [method, path] of [
  232 |       ["POST", books(t.id, `/days/${t.day}/post`)],
  233 |       ["PUT", books(t.id, "/mapping")],
  234 |       ["PATCH", books(t.id)],
  235 |       ["DELETE", books(t.id)],
  236 |       ["POST", books(t.id, "/deposits/sync")],
  237 |     ] as const) {
  238 |       const r = await accountantAnyRaw(tok, method, path, {});
  239 |       expect(r.status, `${method} ${path}`).toBe(403);
  240 |       expect(r.data.message).toBe(
  241 |         "This is a read-only view of the client's books."
  242 |       );
  243 |     }
  244 |     for (const [method, path, body] of [
  245 |       ["PUT", "/mapping", { mapping: { tips: { name: "Mine" } } }],
  246 |       ["POST", "/mapping/preset", { preset: "SIMPLE" }],
  247 |       ["PATCH", "/settings", { toleranceCents: 0 }],
  248 |       ["POST", `/days/${t.day}/post`, undefined],
  249 |     ] as const) {
  250 |       const r = await accountingRaw(tok, t.id, method, path, body);
  251 |       expect(r.status, `${method} ${path}`).toBe(404);
  252 |     }
  253 |     const mine = await accountingRaw(t.owner, t.id, "GET", "");
  254 |     expect((mine.data.data as Rec).mappingPreset).toBe("DETAILED");
  255 |     expect(((mine.data.data as Rec).mapping as Rec).tips).toBeUndefined();
  256 |   });
  257 | 
  258 |   test("TC-1342: a client they don't serve, or a made-up id, is 404; a revoke closes that client only", async () => {
  259 |     for (const id of [tenants.c.id, "00000000-0000-4000-8000-000000000000"]) {
  260 |       for (const path of [
  261 |         "",
  262 |         `/days${range(tenants.c)}`,
  263 |         `/sales-summary${range(tenants.c)}`,
  264 |       ]) {
  265 |         const r = await accountantRaw(accountant.token, books(id, path));
  266 |         expect(r.status, `${id}${path}`).toBe(404);
  267 |       }
  268 |     }
  269 |     const removed = await booksRaw(
  270 |       tenants.b.owner,
  271 |       tenants.b.id,
  272 |       "DELETE",
  273 |       `/accountants/${accountant.rowB}`
  274 |     );
  275 |     expect(removed.status, JSON.stringify(removed.data)).toBe(200);
  276 |     expect(
  277 |       (
  278 |         await accountantRaw(
  279 |           accountant.token,
  280 |           books(tenants.b.id, `/days${range(tenants.b)}`)
```