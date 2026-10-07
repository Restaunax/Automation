# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-pos-screen-loads.spec.ts >> POS screen loads never 403 (API) >> TC-649: the safe opens for a cashier only with a manager's MANAGE_SAFE approval
- Location: tests/dashboard/owner/api-pos-screen-loads.spec.ts:224:7

# Error details

```
Error: no approval

expect(received).toBe(expected) // Object.is equality

Expected: 403
Received: 400
```

# Test source

```ts
  134 |         await deactivateTabletDevice(adminToken, restaurantId, deviceId);
  135 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  136 |     }
  137 |   });
  138 | 
  139 |   test.beforeEach(async () => {
  140 |     await allure.label("feature", "POS screen loads");
  141 |     await allure.label("severity", "critical");
  142 |   });
  143 | 
  144 |   test("TC-647: the permissions catalogue loads for anyone; the role catalogue and staff management stay with managers", async () => {
  145 |     const mine = await tabletRaw<Rec>(
  146 |       tabletToken,
  147 |       "GET",
  148 |       "/staff/capabilities",
  149 |       undefined,
  150 |       kai.session
  151 |     );
  152 |     expect(mine.status, JSON.stringify(mine.data)).toBe(200);
  153 |     expect(list(mine.data.data.groups).length).toBeGreaterThan(0);
  154 |     expect(mine.data.data).not.toHaveProperty("roles");
  155 |     expect(mine.data.data).not.toHaveProperty("roleBases");
  156 | 
  157 |     const boss = await tabletRaw<Rec>(
  158 |       tabletToken,
  159 |       "GET",
  160 |       "/staff/capabilities",
  161 |       undefined,
  162 |       owner.session
  163 |     );
  164 |     expect(boss.status).toBe(200);
  165 |     expect(list(boss.data.data.roles).map((r) => r.name)).toContain("Kitchen");
  166 |     expect(boss.data.data.roleBases).toBeTruthy();
  167 | 
  168 |     const manage = await tabletRaw(
  169 |       tabletToken,
  170 |       "GET",
  171 |       "/staff/manage",
  172 |       undefined,
  173 |       kai.session
  174 |     );
  175 |     expect(manage.status).toBe(403);
  176 |   });
  177 | 
  178 |   test("TC-648: the host stand loads for anyone, without guests' contact details; writes stay refused", async () => {
  179 |     const view = await tabletRaw<Rec>(
  180 |       tabletToken,
  181 |       "GET",
  182 |       "/host",
  183 |       undefined,
  184 |       kai.session
  185 |     );
  186 |     expect(view.status, JSON.stringify(view.data)).toBe(200);
  187 |     expect(view.data.canManage).toBe(false);
  188 |     const row = list(view.data.data).find(
  189 |       (r) => r.guestName === `Guest ${runId}`
  190 |     );
  191 |     expect(row).toBeTruthy();
  192 |     expect(row).not.toHaveProperty("guestPhone");
  193 |     expect(row).not.toHaveProperty("guestEmail");
  194 | 
  195 |     const write = await tabletRaw(
  196 |       tabletToken,
  197 |       "POST",
  198 |       "/reservations",
  199 |       {
  200 |         partySize: 3,
  201 |         guestName: `Nope ${runId}`,
  202 |         guestPhone: generateSeedPhone(),
  203 |       },
  204 |       kai.session
  205 |     );
  206 |     expect(write.status).toBe(403);
  207 | 
  208 |     const host = await tabletRaw<Rec>(
  209 |       tabletToken,
  210 |       "GET",
  211 |       "/host",
  212 |       undefined,
  213 |       owner.session
  214 |     );
  215 |     expect(host.data.canManage).toBe(true);
  216 |     const full = list(host.data.data).find(
  217 |       (r) => r.guestName === `Guest ${runId}`
  218 |     );
  219 |     // Contact details are present for a manager (a walk-in keeps the phone).
  220 |     expect(full).toHaveProperty("guestEmail");
  221 |     expect(String(full?.guestPhone ?? "")).toContain(guestPhone.slice(-4));
  222 |   });
  223 | 
  224 |   test("TC-649: the safe opens for a cashier only with a manager's MANAGE_SAFE approval", async () => {
  225 |     const safe = (headers?: Record<string, string>) =>
  226 |       tabletRaw<Rec>(
  227 |         tabletToken,
  228 |         "GET",
  229 |         "/safe",
  230 |         undefined,
  231 |         kai.session,
  232 |         headers
  233 |       );
> 234 |     expect((await safe()).status, "no approval").toBe(403);
      |                                                  ^ Error: no approval
  235 |     expect(
  236 |       (await safe({ "x-approval-token": "forged.token.value" })).status
  237 |     ).toBe(403);
  238 | 
  239 |     const approve = (capability: string) =>
  240 |       tabletRaw<Rec>(
  241 |         tabletToken,
  242 |         "POST",
  243 |         "/authorize-action",
  244 |         { capability, managerPin: owner.pin, approverStaffMemberId: owner.id },
  245 |         kai.session
  246 |       );
  247 |     const discount = await approve("APPROVE_DISCOUNT");
  248 |     expect(discount.status, JSON.stringify(discount.data)).toBe(200);
  249 |     expect(
  250 |       (await safe({ "x-approval-token": String(discount.data.data.token) }))
  251 |         .status,
  252 |       "a token for another capability"
  253 |     ).toBe(403);
  254 | 
  255 |     const ok = await approve("MANAGE_SAFE");
  256 |     expect(ok.status, JSON.stringify(ok.data)).toBe(200);
  257 |     expect(ok.data.data.selfAuthorized).toBe(false);
  258 |     const opened = await safe({
  259 |       "x-approval-token": String(ok.data.data.token),
  260 |     });
  261 |     expect(opened.status, JSON.stringify(opened.data)).toBe(200);
  262 |     expect(opened.data.data).toHaveProperty("entries");
  263 | 
  264 |     // The manager opens it on their own.
  265 |     const own = await tabletRaw(
  266 |       tabletToken,
  267 |       "GET",
  268 |       "/safe",
  269 |       undefined,
  270 |       owner.session
  271 |     );
  272 |     expect(own.status).toBe(200);
  273 |   });
  274 | });
  275 | 
```