# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/marketing-automations.spec.ts >> Admin — Marketing automations >> TC-203: the enabled switch toggles a program and persists
- Location: tests/dashboard/admin/marketing-automations.spec.ts:117:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Test source

```ts
  47  |       "Win-Back, Welcome, and VIP rows render with the explainer banner, the global caps fields, and the pace helper text (nobody-is-skipped copy)."
  48  |     );
  49  |     const marketing = createAdminMarketingPage(adminPage);
  50  | 
  51  |     await marketing.gotoCampaignScheduler();
  52  |     await marketing.openAutomationsSubTab();
  53  | 
  54  |     await allure.step("Intro banner + global caps render", async () => {
  55  |       await expect(marketing.introBanner()).toBeVisible();
  56  |       await expect(marketing.capsTitle()).toBeVisible();
  57  |       await expect(marketing.frequencyCapInput()).toBeVisible();
  58  |       await expect(marketing.dailyCapInput()).toBeVisible();
  59  |       await expect(marketing.dailyPaceHelper()).toBeVisible();
  60  |     });
  61  | 
  62  |     await allure.step("All three program rows render", async () => {
  63  |       for (const type of ["Win-Back", "Welcome", "VIP"] as const) {
  64  |         await expect(marketing.programRow(type)).toBeVisible();
  65  |       }
  66  |     });
  67  |   });
  68  | 
  69  |   test("TC-202: edit dialog shows per-type fields, locks the template, and persists a change", async ({
  70  |     adminPage,
  71  |   }) => {
  72  |     await allure.description(
  73  |       "Win-Back's dialog shows its inactivity threshold, the email template is view-only (disabled input — content can never mismatch the program), and a cooldown change round-trips through save + reload."
  74  |     );
  75  |     const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  76  |     const winBack = (await getAutomationsApi(accessToken)).find(
  77  |       (a) => a.type === "WIN_BACK"
  78  |     );
  79  |     expect(winBack, "Seeded WIN_BACK automation missing on QA").toBeTruthy();
  80  |     const originalCooldown = winBack!.cooldownDays;
  81  |     const newCooldown = originalCooldown === 61 ? 62 : 61;
  82  | 
  83  |     const marketing = createAdminMarketingPage(adminPage);
  84  |     try {
  85  |       await marketing.gotoCampaignScheduler();
  86  |       await marketing.openAutomationsSubTab();
  87  |       await marketing.openEditDialog("Win-Back");
  88  | 
  89  |       await allure.step("Per-type field + locked template", async () => {
  90  |         await expect(
  91  |           marketing.dialogFieldInput("Days without an order")
  92  |         ).toBeVisible();
  93  |         await expect(
  94  |           marketing.dialogFieldInput("Email template")
  95  |         ).toBeDisabled();
  96  |       });
  97  | 
  98  |       await allure.step("Change cooldown and save", async () => {
  99  |         const cooldown = marketing.dialogFieldInput("Cooldown (days)");
  100 |         await cooldown.fill(String(newCooldown));
  101 |         await marketing.saveDialog();
  102 |       });
  103 | 
  104 |       await allure.step("Change persisted (API)", async () => {
  105 |         const after = (await getAutomationsApi(accessToken)).find(
  106 |           (a) => a.id === winBack!.id
  107 |         );
  108 |         expect(after?.cooldownDays).toBe(newCooldown);
  109 |       });
  110 |     } finally {
  111 |       await patchAutomationApi(accessToken, winBack!.id, {
  112 |         cooldownDays: originalCooldown,
  113 |       }).catch(() => {});
  114 |     }
  115 |   });
  116 | 
  117 |   test("TC-203: the enabled switch toggles a program and persists", async ({
  118 |     adminPage,
  119 |   }) => {
  120 |     await allure.description(
  121 |       "Flipping a program's Enabled switch persists to the backend; the test restores the original state so no automation is left accidentally enabled/disabled on QA."
  122 |     );
  123 |     const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  124 |     const vip = (await getAutomationsApi(accessToken)).find(
  125 |       (a) => a.type === "VIP"
  126 |     );
  127 |     expect(vip, "Seeded VIP automation missing on QA").toBeTruthy();
  128 |     const originalEnabled = vip!.isEnabled;
  129 | 
  130 |     const marketing = createAdminMarketingPage(adminPage);
  131 |     try {
  132 |       await marketing.gotoCampaignScheduler();
  133 |       await marketing.openAutomationsSubTab();
  134 | 
  135 |       await allure.step("Flip the VIP switch", async () => {
  136 |         await marketing.programSwitch("VIP").click();
  137 |       });
  138 | 
  139 |       await allure.step("New state persisted (API)", async () => {
  140 |         await expect
  141 |           .poll(async () => {
  142 |             const after = (await getAutomationsApi(accessToken)).find(
  143 |               (a) => a.id === vip!.id
  144 |             );
  145 |             return after?.isEnabled;
  146 |           })
> 147 |           .toBe(!originalEnabled);
      |            ^ Error: expect(received).toBe(expected) // Object.is equality
  148 |       });
  149 |     } finally {
  150 |       await toggleAutomationApi(accessToken, vip!.id, originalEnabled).catch(
  151 |         () => {}
  152 |       );
  153 |     }
  154 |   });
  155 | 
  156 |   test("TC-212: the stats endpoint returns the full campaign-grade funnel", async () => {
  157 |     await allure.description(
  158 |       "Every automation exposes the same funnel the event campaigns report — pending/sent/failed/skipped/opened/clicked/redeemed/discountValueGiven — all numeric, so 'what worked' is always answerable."
  159 |     );
  160 |     const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  161 |     const first = (await getAutomationsApi(accessToken))[0];
  162 |     expect(first, "No automations seeded on QA").toBeTruthy();
  163 |     if (!first) return;
  164 | 
  165 |     const stats = await getAutomationStatsApi(accessToken, first.id);
  166 |     for (const field of [
  167 |       "pending",
  168 |       "sent",
  169 |       "failed",
  170 |       "skipped",
  171 |       "opened",
  172 |       "clicked",
  173 |       "redeemed",
  174 |       "discountValueGiven",
  175 |     ] as const) {
  176 |       expect(typeof stats[field], `stats.${field}`).toBe("number");
  177 |     }
  178 |   });
  179 | 
  180 |   test("TC-213: SMS controls live in the edit dialog behind the channel toggle", async ({
  181 |     adminPage,
  182 |   }) => {
  183 |     await allure.description(
  184 |       "The edit dialog offers Email and SMS channel switches; flipping SMS on reveals the SMS message editor. Dialog is cancelled — nothing persists."
  185 |     );
  186 |     const marketing = createAdminMarketingPage(adminPage);
  187 |     await marketing.gotoCampaignScheduler();
  188 |     await marketing.openAutomationsSubTab();
  189 |     await marketing.openEditDialog("Win-Back");
  190 | 
  191 |     // MUI Switch exposes role="switch", not "checkbox"
  192 |     const smsSwitch = marketing
  193 |       .dialog()
  194 |       .getByRole("switch", { name: "SMS", exact: true });
  195 |     await expect(
  196 |       marketing.dialog().getByRole("switch", { name: "Email", exact: true })
  197 |     ).toBeVisible();
  198 |     await expect(smsSwitch).toBeVisible();
  199 | 
  200 |     const smsWasOn = await smsSwitch.isChecked();
  201 |     if (!smsWasOn) {
  202 |       await smsSwitch.click();
  203 |     }
  204 |     // The SMS body is a multiline TextField → textarea, not input.
  205 |     await expect(
  206 |       marketing
  207 |         .dialog()
  208 |         .locator(".MuiFormControl-root")
  209 |         .filter({ has: adminPage.locator("label", { hasText: "SMS message" }) })
  210 |         .locator("textarea")
  211 |         .first()
  212 |     ).toBeVisible();
  213 | 
  214 |     // Draft-only change — cancel, nothing persists.
  215 |     await marketing.cancelDialog();
  216 |   });
  217 | 
  218 |   test(
  219 |     "TC-1098: clicking a switch's label text does not flip it — only the switch does",
  220 |     {
  221 |       tag: "@switch-click",
  222 |     },
  223 |     async ({ adminPage }) => {
  224 |       await allure.description(
  225 |         "Dashboard-wide rule (theme-level, every FormControlLabel around a Switch): a click on the label text, " +
  226 |           "description or row never toggles the setting; only the switch does. Checked on the SMS channel " +
  227 |           "switch: click the 'SMS' text → unchanged; click the switch → flipped exactly once. Dialog is " +
  228 |           "cancelled — nothing persists."
  229 |       );
  230 |       const marketing = createAdminMarketingPage(adminPage);
  231 |       await marketing.gotoCampaignScheduler();
  232 |       await marketing.openAutomationsSubTab();
  233 |       await marketing.openEditDialog("Win-Back");
  234 | 
  235 |       const smsSwitch = marketing
  236 |         .dialog()
  237 |         .getByRole("switch", { name: "SMS", exact: true });
  238 |       await expect(smsSwitch).toBeVisible();
  239 |       // The label is "SMS" + an info icon in one span — click the label part,
  240 |       // not the switch.
  241 |       const smsLabelText = marketing
  242 |         .dialog()
  243 |         .locator(".MuiFormControlLabel-root", {
  244 |           has: adminPage.getByRole("switch", { name: "SMS", exact: true }),
  245 |         })
  246 |         .locator(".MuiFormControlLabel-label");
  247 |       const wasOn = await smsSwitch.isChecked();
```