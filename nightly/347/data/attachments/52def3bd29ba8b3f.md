# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/22-ux-audit-staff-ui.spec.ts >> Owner — UX-audit fixes in the Staff area (UI) >> TC-664: at 1024px the Staff tab bar reaches every tab and the page fits the screen
- Location: tests/dashboard/owner/22-ux-audit-staff-ui.spec.ts:160:9

# Error details

```
Error: expect(locator).toBeInViewport() failed

Locator:  locator('.MuiTabs-root').first().getByRole('tab').nth(9)
Expected: in viewport
Received: viewport ratio 0
Timeout:  10000ms

Call log:
  - Expect "toBeInViewport" with timeout 10000ms
  - waiting for locator('.MuiTabs-root').first().getByRole('tab').nth(9)
    23 × locator resolved to <button role="tab" tabindex="0" type="button" aria-selected="true" class="MuiButtonBase-root Mui-focusVisible MuiTab-root MuiTab-textColorPrimary Mui-selected css-z2kxm2">Roles</button>
       - unexpected value "viewport ratio 0"

```

```yaml
- tab "Roles" [selected]
```

# Test source

```ts
  79  |     );
  80  |     await expect(page().getByRole("tab").first()).toBeVisible({
  81  |       timeout: 20_000,
  82  |     });
  83  |   };
  84  | 
  85  |   test.beforeAll(async ({ browser }) => {
  86  |     test.setTimeout(150_000);
  87  |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  88  |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  89  |     const tenant = await createSecondOwner(adminToken, runId);
  90  |     if (!tenant.restaurantId) throw new Error("[ux-ui] no tenant");
  91  |     restaurantId = tenant.restaurantId;
  92  |     ownerToken = tenant.accessToken;
  93  |     for (const f of ["SCHEDULING", "TIP_MANAGEMENT"])
  94  |       await setFeatureOverrideAdminRaw(adminToken, restaurantId, f, true);
  95  |     await putPayrollSettingsRaw(ownerToken, restaurantId, {
  96  |       payFrequency: "WEEKLY",
  97  |       periodAnchorDate: "2026-01-04",
  98  |       workweekStartDay: 0,
  99  |     });
  100 |     const me = await setOwnerPosPin(ownerToken, restaurantId, "8462");
  101 |     const jobId = String(
  102 |       (
  103 |         await createStaffJobRaw(ownerToken, restaurantId, {
  104 |           name: `Cook ${runId}`,
  105 |           defaultHourlyRateCents: 1500,
  106 |         })
  107 |       ).data.data?.id
  108 |     );
  109 |     await setMemberJobsRaw(ownerToken, restaurantId, me, [
  110 |       { jobId, isPrimary: true },
  111 |     ]);
  112 |     const periods = await payrollRaw(
  113 |       ownerToken,
  114 |       restaurantId,
  115 |       "GET",
  116 |       "/pay-periods?count=4"
  117 |     );
  118 |     const finished = list(periods.data.data?.periods)
  119 |       .filter((p) => p.status === "OPEN")
  120 |       .map((p) => String(p.startDate))
  121 |       .sort();
  122 |     // Hours in the two most recent finished periods: both need approving.
  123 |     for (const start of finished.slice(-2)) {
  124 |       const d = addDays(start, 2);
  125 |       const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
  126 |         staffMemberId: me,
  127 |         clockInAt: `${d}T14:00:00.000Z`,
  128 |         clockOutAt: `${d}T18:00:00.000Z`,
  129 |         jobId,
  130 |         reason: "Paper sheet",
  131 |       });
  132 |       if (r.status !== 201)
  133 |         throw new Error(`[ux-ui] shift: ${JSON.stringify(r.data)}`);
  134 |     }
  135 |     older = finished.slice(-2)[0] ?? "";
  136 |     ownerEmail = tenant.email;
  137 |     ownerPassword = process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`;
  138 |     session = await loginViaUi(browser, ownerEmail, ownerPassword);
  139 |   });
  140 | 
  141 |   test.afterAll(async () => {
  142 |     if (ownerToken)
  143 |       await usersRaw(ownerToken, "PATCH", "/me/locale", { locale: "en" }).catch(
  144 |         () => {}
  145 |       );
  146 |     if (adminToken && restaurantId)
  147 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  148 |     if (session) await session.context.close().catch(() => {});
  149 |   });
  150 | 
  151 |   test.beforeEach(async () => {
  152 |     await allure.label("feature", "UX audit (dashboard)");
  153 |     await allure.label("severity", "normal");
  154 |   });
  155 | 
  156 |   for (const [width, height] of [
  157 |     [1024, 800],
  158 |     [390, 844],
  159 |   ] as const) {
  160 |     test(`TC-664: at ${width}px the Staff tab bar reaches every tab and the page fits the screen`, async () => {
  161 |       await page().setViewportSize({ width, height });
  162 |       await openStaff();
  163 |       // The Staff tab bar only (some screens have tabs of their own).
  164 |       const bar = page().locator(".MuiTabs-root").first();
  165 |       const tabs = bar.getByRole("tab");
  166 |       const count = await tabs.count();
  167 |       expect(count).toBeGreaterThanOrEqual(10);
  168 |       // Walk the bar from the keyboard: each tab must scroll into view and
  169 |       // open. (The ‹ › arrows sit under the fixed top bar once the page has
  170 |       // scrolled, which makes them unclickable for automation — not users.)
  171 |       await page().evaluate(() => window.scrollTo(0, 0));
  172 |       await tabs.first().focus();
  173 |       for (let i = 0; i < count; i++) {
  174 |         const tab = tabs.nth(i);
  175 |         if (i > 0) await page().keyboard.press("ArrowRight");
  176 |         await expect(tab).toBeFocused();
  177 |         await page().keyboard.press("Enter");
  178 |         await expect(tab).toHaveAttribute("aria-selected", "true");
> 179 |         await expect(tab).toBeInViewport();
      |                           ^ Error: expect(locator).toBeInViewport() failed
  180 |       }
  181 |       const overflow = await page().evaluate(
  182 |         () =>
  183 |           document.documentElement.scrollWidth -
  184 |           document.documentElement.clientWidth
  185 |       );
  186 |       expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(1);
  187 |     });
  188 |   }
  189 | 
  190 |   test("TC-665: Timecards opens on the oldest period still waiting for approval", async () => {
  191 |     await page().setViewportSize({ width: 1280, height: 900 });
  192 |     await openStaff("timecards");
  193 |     const picker = page().locator("#pay-period");
  194 |     await expect(picker).toBeVisible({ timeout: 20_000 });
  195 |     await expect(picker).toContainText(shortDate(older), { timeout: 15_000 });
  196 |   });
  197 | 
  198 |   test("TC-666: the language picked in the top bar survives a reload", async () => {
  199 |     await openStaff();
  200 |     await page()
  201 |       .getByRole("button", { name: "Select Language" })
  202 |       .first()
  203 |       .click();
  204 |     await page()
  205 |       .getByRole("menuitem")
  206 |       .filter({ hasText: /Español|Spanish|ES/ })
  207 |       .first()
  208 |       .click();
  209 |     await expect(page().getByRole("tab", { name: "Personas" })).toBeVisible({
  210 |       timeout: 15_000,
  211 |     });
  212 |     await page().reload({ waitUntil: "domcontentloaded" });
  213 |     await expect(page().getByRole("tab", { name: "Personas" })).toBeVisible({
  214 |       timeout: 20_000,
  215 |     });
  216 |     // Saved to the account, not just the browser: a fresh sign-in says es.
  217 |     await expect
  218 |       .poll(async () => (await loginRaw(ownerEmail, ownerPassword)).data.locale)
  219 |       .toBe("es");
  220 |   });
  221 | });
  222 | 
```