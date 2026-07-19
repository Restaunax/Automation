# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/users.spec.ts >> Admin — User Management >> Invite dialog >> TC-104: inviting an existing email is rejected
- Location: tests/dashboard/admin/users.spec.ts:139:9

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('[role="dialog"]').filter({ hasText: 'Invite New User' }).getByRole('alert')
Expected pattern: /already|in use|exists/i
Received string:  "An unexpected error occurred. Please try again later."
Timeout: 10000ms

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('[role="dialog"]').filter({ hasText: 'Invite New User' }).getByRole('alert')
    24 × locator resolved to <div role="alert" class="MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation0 MuiAlert-root MuiAlert-colorError MuiAlert-standardError MuiAlert-standard css-1t7h6xp">…</div>
       - unexpected value "An unexpected error occurred. Please try again later."

```

```yaml
- alert: An unexpected error occurred. Please try again later.
```

# Test source

```ts
  117 | 
  118 |   const assertNoResults = (): Promise<void> =>
  119 |     expect(page.getByText(S.noUsersFound)).toBeVisible({ timeout: 10_000 });
  120 | 
  121 |   // Filter Selects: testid-first with positional fallback (TEST_PLAN →
  122 |   // "Locator strategy"). data-testid=user-role-filter/user-status-filter live
  123 |   // on the Select roots in frontend source; scoping to the combobox INSIDE
  124 |   // the testid root makes both branches resolve to the same node once the
  125 |   // testids reach QA ([0]=role, [1]=status are the legacy positions).
  126 |   const roleFilterCombobox = () =>
  127 |     page
  128 |       .getByTestId("user-role-filter")
  129 |       .locator('[role="combobox"]')
  130 |       .or(page.locator('[role="combobox"]').nth(0))
  131 |       .first();
  132 |   const statusFilterCombobox = () =>
  133 |     page
  134 |       .getByTestId("user-status-filter")
  135 |       .locator('[role="combobox"]')
  136 |       .or(page.locator('[role="combobox"]').nth(1))
  137 |       .first();
  138 | 
  139 |   const filterByRole = async (roleLabel: string): Promise<void> => {
  140 |     await roleFilterCombobox().click();
  141 |     await listbox.getByRole("option", { name: roleLabel, exact: true }).click();
  142 |     await listbox.waitFor({ state: "hidden" }).catch(() => {});
  143 |   };
  144 |   const filterByStatus = async (statusLabel: string): Promise<void> => {
  145 |     await statusFilterCombobox().click();
  146 |     await listbox
  147 |       .getByRole("option", { name: statusLabel, exact: true })
  148 |       .click();
  149 |     await listbox.waitFor({ state: "hidden" }).catch(() => {});
  150 |   };
  151 | 
  152 |   // ── invite dialog ───────────────────────────────────────────────────────--
  153 |   const openInviteDialog = async (): Promise<void> => {
  154 |     await page.getByRole("button", { name: S.inviteUserBtn }).click();
  155 |     await expect(inviteDialog).toBeVisible({ timeout: 10_000 });
  156 |   };
  157 | 
  158 |   const inviteNameField = (label: string): Locator =>
  159 |     inviteDialog
  160 |       .locator(`.MuiFormControl-root:has(label:has-text("${label}")) input`)
  161 |       .first();
  162 | 
  163 |   const inviteEmailInput = (): Locator =>
  164 |     inviteDialog.locator('input[type="email"]');
  165 | 
  166 |   /** Select a role in the open invite dialog (display name, e.g. "Owner"). */
  167 |   const selectInviteRole = async (roleLabel: string): Promise<void> => {
  168 |     await inviteDialog.locator('[role="combobox"]').first().click();
  169 |     await listbox.getByRole("option", { name: roleLabel, exact: true }).click();
  170 |     await listbox.waitFor({ state: "hidden" }).catch(() => {});
  171 |   };
  172 | 
  173 |   const cancelInviteDialog = async (): Promise<void> => {
  174 |     await inviteDialog.getByRole("button", { name: "Cancel" }).click();
  175 |     await inviteDialog.waitFor({ state: "hidden", timeout: 5_000 });
  176 |   };
  177 | 
  178 |   const fillInvite = async (opts: InviteOptions): Promise<void> => {
  179 |     await inviteDialog.locator('input[type="email"]').fill(opts.email);
  180 |     if (opts.firstName)
  181 |       await inviteNameField("First Name").fill(opts.firstName);
  182 |     if (opts.lastName) await inviteNameField("Last Name").fill(opts.lastName);
  183 |     // Role Select is the first combobox in the dialog (the owner restaurant
  184 |     // Autocomplete only appears AFTER a role is chosen).
  185 |     await inviteDialog.locator('[role="combobox"]').first().click();
  186 |     await listbox.getByRole("option", { name: opts.role, exact: true }).click();
  187 |     if (opts.restaurant) {
  188 |       const ac = inviteDialog.getByPlaceholder(S.restaurantSearchPlaceholder);
  189 |       await ac.fill(opts.restaurant);
  190 |       await page
  191 |         .locator('[role="option"]')
  192 |         .filter({ hasText: opts.restaurant })
  193 |         .first()
  194 |         .click();
  195 |     }
  196 |   };
  197 | 
  198 |   /** Click Send and return the invite network response (any status). */
  199 |   const submitInvite = async () => {
  200 |     const [resp] = await Promise.all([
  201 |       page.waitForResponse((r) => r.url().includes("/api/admin/users/invite")),
  202 |       inviteDialog
  203 |         .getByRole("button", {
  204 |           name: new RegExp(`${S.sendInvitation}|${S.sending}`),
  205 |         })
  206 |         .click(),
  207 |     ]);
  208 |     return resp;
  209 |   };
  210 | 
  211 |   const inviteSubmitButton = (): Locator =>
  212 |     inviteDialog.getByRole("button", {
  213 |       name: new RegExp(`${S.sendInvitation}|${S.sending}`),
  214 |     });
  215 | 
  216 |   const assertInviteError = (substr: string | RegExp): Promise<void> =>
> 217 |     expect(inviteDialog.getByRole("alert")).toContainText(substr);
      |                                             ^ Error: expect(locator).toContainText(expected) failed
  218 | 
  219 |   const ownerRestaurantAutocomplete = (): Locator =>
  220 |     inviteDialog.getByPlaceholder(S.restaurantSearchPlaceholder);
  221 | 
  222 |   // ── detail side sheet & tabs ────────────────────────────────────────────--
  223 |   const openUserDetails = async (email: string): Promise<void> => {
  224 |     await findRowByEmail(email).first().click();
  225 |     await expect(sideSheet).toBeVisible({ timeout: 10_000 });
  226 |     // Detail GET drives tab rendering — wait for the tablist to settle.
  227 |     await sideSheet
  228 |       .getByRole("tab")
  229 |       .first()
  230 |       .waitFor({ state: "visible", timeout: 10_000 });
  231 |   };
  232 | 
  233 |   const switchTab = async (tabName: string): Promise<void> => {
  234 |     await sideSheet.getByRole("tab", { name: tabName }).click();
  235 |   };
  236 |   const assertTabPresent = (tabName: string): Promise<void> =>
  237 |     expect(sideSheet.getByRole("tab", { name: tabName })).toBeVisible();
  238 |   const assertTabAbsent = (tabName: string): Promise<void> =>
  239 |     expect(sideSheet.getByRole("tab", { name: tabName })).toHaveCount(0);
  240 | 
  241 |   const closeSideSheet = async (): Promise<void> => {
  242 |     // Two "Close" controls exist (header X IconButton + footer Button) — the
  243 |     // header one is first in the DOM; either dismisses the drawer.
  244 |     await sideSheet.getByRole("button", { name: S.close }).first().click();
  245 |     await sideSheet.waitFor({ state: "hidden", timeout: 5_000 });
  246 |   };
  247 | 
  248 |   // ── settings tab ────────────────────────────────────────────────────────--
  249 |   /** Change role via the Settings tab. newRole = enum value, e.g. "OWNER". */
  250 |   const changeRole = async (newRole: string) => {
  251 |     await sideSheet.getByRole("button", { name: S.changeRoleBtn }).click();
  252 |     const dlg = page
  253 |       .locator('[role="dialog"]')
  254 |       .filter({ hasText: S.changeRoleDialogTitle });
  255 |     await expect(dlg).toBeVisible({ timeout: 10_000 });
  256 |     await dlg.locator('[role="combobox"]').click();
  257 |     await listbox.getByRole("option", { name: newRole, exact: true }).click();
  258 |     const [resp] = await Promise.all([
  259 |       page.waitForResponse(
  260 |         (r) =>
  261 |           /\/api\/roles\/users\/[^/]+$/.test(r.url()) &&
  262 |           r.request().method() === "PUT"
  263 |       ),
  264 |       dlg.getByRole("button", { name: S.changeRoleBtn }).click(),
  265 |     ]);
  266 |     return resp;
  267 |   };
  268 | 
  269 |   const toggleStatus = async () => {
  270 |     const btn = sideSheet.getByRole("button", {
  271 |       name: new RegExp(`${S.deactivate}|${S.activate}`),
  272 |     });
  273 |     const [resp] = await Promise.all([
  274 |       page.waitForResponse((r) => r.url().includes("/toggle-status")),
  275 |       btn.click(),
  276 |     ]);
  277 |     // The action triggers a detail re-fetch that re-renders the tab — wait for
  278 |     // it so the button reflects the new state before any follow-up toggle.
  279 |     await page
  280 |       .waitForResponse(
  281 |         (r) =>
  282 |           /\/api\/admin\/users\/[^/?]+$/.test(r.url()) &&
  283 |           r.request().method() === "GET"
  284 |       )
  285 |       .catch(() => {});
  286 |     return resp;
  287 |   };
  288 | 
  289 |   const sendPasswordReset = async () => {
  290 |     const [resp] = await Promise.all([
  291 |       page.waitForResponse((r) =>
  292 |         r.url().includes("/login/password-reset/request")
  293 |       ),
  294 |       sideSheet.getByRole("button", { name: S.sendPasswordReset }).click(),
  295 |     ]);
  296 |     return resp;
  297 |   };
  298 | 
  299 |   // ── permissions tab ─────────────────────────────────────────────────────--
  300 |   const addPermissionsButton = (): Locator =>
  301 |     sideSheet.getByRole("button", { name: S.addPermissions });
  302 | 
  303 |   /**
  304 |    * Open the Add-Permissions dialog, select the first OFFERED option (whatever
  305 |    * the catalog currently exposes — never hardcoded), submit. Returns the POST
  306 |    * response so the spec can confirm via the API which permission was granted.
  307 |    */
  308 |   const addFirstAvailablePermission = async () => {
  309 |     await addPermissionsButton().click();
  310 |     const dlg = page
  311 |       .locator('[role="dialog"]')
  312 |       .filter({ hasText: S.addPermissionsDialogTitle });
  313 |     await expect(dlg).toBeVisible({ timeout: 10_000 });
  314 |     await dlg.getByRole("combobox").click();
  315 |     const firstOption = page
  316 |       .locator('[role="listbox"] [role="option"]')
  317 |       .first();
```