# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/users.spec.ts >> Admin — User Management >> Settings tab >> TC-117: admin can send a password reset email
- Location: tests/dashboard/admin/users.spec.ts:333:9

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  247 | 
  248 |       // USER role → Overview / Permissions / Settings only.
  249 |       await users.assertTabPresent(users.S.tabOverview);
  250 |       await users.assertTabPresent(users.S.tabPermissions);
  251 |       await users.assertTabPresent(users.S.tabSettings);
  252 |       await users.assertTabAbsent(users.S.tabDemos);
  253 |       await users.assertTabAbsent(users.S.tabRestaurants);
  254 | 
  255 |       await expect(
  256 |         users.sideSheet.getByText(users.S.overviewBasicInfo)
  257 |       ).toBeVisible();
  258 |     });
  259 | 
  260 |     test("TC-113: OWNER detail exposes all tabs incl. read-only Restaurants", async ({
  261 |       adminPage,
  262 |     }) => {
  263 |       const { email } = await createTargetUser("OWNER");
  264 |       const users = createAdminUsersPage(adminPage);
  265 |       await users.goto();
  266 |       await users.searchUser(email);
  267 |       await users.openUserDetails(email);
  268 | 
  269 |       for (const tab of [
  270 |         users.S.tabOverview,
  271 |         users.S.tabDemos,
  272 |         users.S.tabRestaurants,
  273 |         users.S.tabPermissions,
  274 |         users.S.tabSettings,
  275 |       ]) {
  276 |         await users.assertTabPresent(tab);
  277 |       }
  278 |       // Restaurants tab is read-only here (no assign/unassign UI) — just renders.
  279 |       await users.switchTab(users.S.tabRestaurants);
  280 |       await expect(users.sideSheet).toBeVisible();
  281 |     });
  282 | 
  283 |     test("TC-114: the side sheet can be closed", async ({ adminPage }) => {
  284 |       const { email } = await createTargetUser("USER");
  285 |       const users = createAdminUsersPage(adminPage);
  286 |       await users.goto();
  287 |       await users.searchUser(email);
  288 |       await users.openUserDetails(email);
  289 |       await users.closeSideSheet();
  290 |     });
  291 |   });
  292 | 
  293 |   // ── Group D — Settings tab actions ─────────────────────────────────────────
  294 |   test.describe("Settings tab", () => {
  295 |     test("TC-115: admin can change a user's role", async ({ adminPage }) => {
  296 |       const { id, email } = await createTargetUser("USER");
  297 |       const users = createAdminUsersPage(adminPage);
  298 |       await users.goto();
  299 |       await users.searchUser(email);
  300 |       await users.openUserDetails(email);
  301 |       await users.switchTab(users.S.tabSettings);
  302 | 
  303 |       // The inline success Alert is wiped by the detail re-fetch (which
  304 |       // unmounts the tab), so assert on the PUT response + the server state.
  305 |       const resp = await users.changeRole("EMPLOYEE");
  306 |       expect(resp.ok()).toBeTruthy();
  307 | 
  308 |       const updated = await adminGetUser(adminToken, id);
  309 |       expect(updated.role).toBe("EMPLOYEE");
  310 |     });
  311 | 
  312 |     test("TC-116: admin can deactivate then reactivate a user", async ({
  313 |       adminPage,
  314 |     }) => {
  315 |       const { id, email } = await createTargetUser("USER");
  316 |       const users = createAdminUsersPage(adminPage);
  317 |       await users.goto();
  318 |       await users.searchUser(email);
  319 |       await users.openUserDetails(email);
  320 |       await users.switchTab(users.S.tabSettings);
  321 | 
  322 |       // Confirm via the response + server state (the inline Alert is transient,
  323 |       // wiped by the re-fetch the toggle triggers).
  324 |       const deactivate = await users.toggleStatus();
  325 |       expect(deactivate.ok()).toBeTruthy();
  326 |       expect((await adminGetUser(adminToken, id)).isActive).toBe(false);
  327 | 
  328 |       const reactivate = await users.toggleStatus();
  329 |       expect(reactivate.ok()).toBeTruthy();
  330 |       expect((await adminGetUser(adminToken, id)).isActive).toBe(true);
  331 |     });
  332 | 
  333 |     test(
  334 |       "TC-117: admin can send a password reset email",
  335 |       {
  336 |         tag: "@email",
  337 |       },
  338 |       async ({ adminPage }) => {
  339 |         const { email } = await createTargetUser("USER");
  340 |         const users = createAdminUsersPage(adminPage);
  341 |         await users.goto();
  342 |         await users.searchUser(email);
  343 |         await users.openUserDetails(email);
  344 |         await users.switchTab(users.S.tabSettings);
  345 | 
  346 |         const resp = await users.sendPasswordReset();
> 347 |         expect(resp.ok()).toBeTruthy();
      |                           ^ Error: expect(received).toBeTruthy()
  348 |         await users.assertSideSheetAlert(users.S.passwordResetSuccess);
  349 |       }
  350 |     );
  351 |   });
  352 | 
  353 |   // ── Group E — Permissions tab (fully dynamic) ──────────────────────────────
  354 |   test.describe("Permissions tab", () => {
  355 |     test("TC-118: admin can add then remove a user-specific permission", async ({
  356 |       adminPage,
  357 |     }) => {
  358 |       await allure.description(
  359 |         "Permissions are discovered at runtime: the test grants whatever the " +
  360 |           "Add dialog currently offers, never a hardcoded permission name."
  361 |       );
  362 |       const { id, email } = await createTargetUser("USER");
  363 |       const users = createAdminUsersPage(adminPage);
  364 |       await users.goto();
  365 |       await users.searchUser(email);
  366 |       await users.openUserDetails(email);
  367 |       await users.switchTab(users.S.tabPermissions);
  368 | 
  369 |       const before = (await getUserPermissions(adminToken, id))
  370 |         .userSpecificPermissions.length;
  371 | 
  372 |       // Add the first OFFERED permission (whatever the catalog exposes now).
  373 |       // Confirm via the POST response + server state (the inline Alert is wiped
  374 |       // by the re-fetch the action triggers).
  375 |       const addResp = await users.addFirstAvailablePermission();
  376 |       expect(addResp.ok()).toBeTruthy();
  377 | 
  378 |       const afterAdd = (await getUserPermissions(adminToken, id))
  379 |         .userSpecificPermissions.length;
  380 |       expect(afterAdd).toBe(before + 1);
  381 | 
  382 |       // Remove it again.
  383 |       const removeResp = await users.removeFirstUserPermission();
  384 |       expect(removeResp.ok()).toBeTruthy();
  385 | 
  386 |       const afterRemove = (await getUserPermissions(adminToken, id))
  387 |         .userSpecificPermissions.length;
  388 |       expect(afterRemove).toBe(before);
  389 |     });
  390 |   });
  391 | 
  392 |   // ── Group F0 — API-level negative cases ─────────────────────────────────────
  393 |   // Self-deactivation is deliberately NOT tested here: it would risk locking
  394 |   // out the shared ADMIN_EMAIL account this whole suite depends on if the
  395 |   // backend doesn't guard against it.
  396 |   test.describe("Settings tab — negative", () => {
  397 |     test("TC-76: changing a user's role to an unknown value is rejected", async () => {
  398 |       const { id } = await createTargetUser("USER");
  399 |       const res = await updateUserRoleRaw(adminToken, id, "NOT_A_ROLE");
  400 | 
  401 |       expect(res.ok).toBe(false);
  402 |       expect(res.status).toBe(400);
  403 |       // Role must be unchanged on the server.
  404 |       expect((await adminGetUser(adminToken, id)).role).toBe("USER");
  405 |     });
  406 | 
  407 |     test("TC-77: toggling status of a nonexistent user id is rejected", async () => {
  408 |       const res = await toggleUserStatusRaw(
  409 |         adminToken,
  410 |         "00000000-0000-0000-0000-000000000000"
  411 |       );
  412 | 
  413 |       expect(res.ok).toBe(false);
  414 |       expect(res.status).toBe(404);
  415 |     });
  416 |   });
  417 | 
  418 |   // ── Group F — Negative claim (API, no email sandbox needed) ────────────────
  419 |   test.describe("Invite claim — defensive", () => {
  420 |     test("TC-124: a bogus invite token grants no elevated access", async () => {
  421 |       const email = generateUserEmail("badtoken");
  422 |       recordUserForCleanup(email);
  423 | 
  424 |       const res = await registerRaw({
  425 |         firstName: "Auto",
  426 |         lastName: "BadToken",
  427 |         email,
  428 |         password: TEST_USER_PASSWORD,
  429 |         userInvitationToken: "deadbeef-not-a-real-token",
  430 |       });
  431 | 
  432 |       // Registration still succeeds, but the user stays a plain USER and the
  433 |       // invitation is NOT processed.
  434 |       expect(res.status).toBe(201);
  435 |       expect(res.data.role).toBe("USER");
  436 |       expect(
  437 |         (res.data as { invitationProcessed?: boolean }).invitationProcessed
  438 |       ).toBeFalsy();
  439 |     });
  440 |   });
  441 | 
  442 |   // ── Group G — Full journey: invite → email → claim → login (@email) ────────
  443 |   // Sends a real invite email and reads the token back out of QA's Mailpit
  444 |   // inbox. Tagged @email so `npm run test:email` can select it on its own.
  445 |   test.describe("Invite → claim → login journey", { tag: "@email" }, () => {
  446 |     test.skip(!mailpitReady, "Requires the Mailpit sandbox (MAILPIT_BASE_URL)");
  447 | 
```