# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/39-portal-navigation-ui.spec.ts >> Owner — portal navigation: Back and unsaved changes (UI) >> TC-1947: unsaved edits ask on Back and on a sidebar click; Keep editing keeps them, Leave leaves
- Location: tests/dashboard/owner/39-portal-navigation-ui.spec.ts:210:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#auto-gratuity-notice')
Expected substring: "gratuity is added"
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('#auto-gratuity-notice')

```

```yaml
- banner:
  - text: LOCATION Automation Owner2 Store 4d44ba57 — Miami — Store Settings
  - paragraph: Automation Owner2 Store 4d44ba57
  - text: Miami, FL
  - button "Account settings": A
  - button "Select Language":
    - img
    - text: EN
  - button
- navigation "mailbox folders":
  - button "Collapse sidebar"
  - button "Today":
    - paragraph: Today
  - button "Analytics":
    - paragraph: Analytics
  - button "Orders":
    - paragraph: Orders
  - button "Menu":
    - paragraph: Menu
  - button "Customers":
    - paragraph: Customers
  - button "Billing":
    - paragraph: Billing
  - button "Image Library":
    - paragraph: Image Library
  - button "Store Settings":
    - paragraph: Store Settings
  - button "Store Operations":
    - paragraph: Store Operations
  - button "Job Applications":
    - paragraph: Job Applications
  - 'button "Menu TVs Add-on: TV menu boards from your menu"':
    - paragraph: Menu TVs
    - 'img "Add-on: TV menu boards from your menu"'
  - button "Restaurant Staff":
    - paragraph: Restaurant Staff
  - button "Books & taxes":
    - paragraph: Books & taxes
  - 'button "RestauNax Voice Add-on: AI answers your phone"':
    - paragraph: RestauNax Voice
    - 'img "Add-on: AI answers your phone"'
  - button "Google reviews":
    - paragraph: Google reviews
  - button "Promotions":
    - paragraph: Promotions
  - button "Gift cards":
    - paragraph: Gift cards
  - button "Supply Shop":
    - paragraph: Supply Shop
  - button "Social Media":
    - paragraph: Social Media
  - button "RestauNax Products":
    - paragraph: RestauNax Products
  - button "Owner Settings":
    - paragraph: Owner Settings
- main:
  - paragraph: "Managing: Automation Owner2 Store 4d44ba57"
  - heading "Restaurant Settings" [level=1]
  - tablist:
    - tab "Ordering & hours"
    - tab "Fees & tips" [selected]
    - tab "Dine-in"
    - tab "Sales tax"
    - tab "Connections"
  - heading "Tips & gratuity" [level=6]
  - paragraph: How tips are suggested to your guests, and the gratuity added automatically for large parties.
  - paragraph: Suggested tip percentages
  - button "More info"
  - text: Percentages to suggest
  - combobox "15%, 18%, 20%"
  - paragraph: Pick up to six. These print on guest checks and show on the customer screen.
  - switch "Allow a custom tip amount" [checked]
  - text: Allow a custom tip amount Calculate tip on
  - combobox "Subtotal (before tax)"
  - group "Where guests are asked for a tip":
    - text: Where guests are asked for a tip
    - switch "On the customer screen at the counter"
    - text: On the customer screen at the counter
    - switch "On the self-order kiosk" [checked]
    - text: On the self-order kiosk
    - paragraph: The printed guest check and card slip always show your suggested tips.
  - heading "Fees at checkout" [level=6]
  - paragraph: Two optional charges on top of the food. Use a service fee when every order should carry one. Use auto-gratuity when large dine-in parties should pay a set tip.
  - heading "On a $50.00 order" [level=6]
  - paragraph: Guests pay the food, tax and any tip they choose. No extra fees are on.
  - text: Tips guests add themselves always go to your staff.
  - heading "Sales tax on these fees" [level=6]
  - heading "Your state's rule" [level=6]
  - text: "Not confirmed yet: check it before relying on it"
  - paragraph: Not taxable when it is a gratuity paid in full to staff. Taxable when the house keeps it.
  - text: "Source: State (FL), checked Oct 31, 2026."
  - link "Read the source":
    - /url: https://www.flrules.org/gateway/ruleNo.asp?id=12A-1.0011
  - text: This is a suggestion that no accountant has confirmed yet. Nothing changes at checkout until you confirm it.
  - paragraph: "Service fee: taxed today · your state's rule says taxed (the restaurant keeps it)"
  - paragraph: "Auto-gratuity for large parties: taxed today · your state's rule says taxed (the restaurant keeps it)"
  - alert: Please confirm your state's rule. Until you do, each fee is taxed exactly as you set it below.
  - button "Confirm this rule"
  - heading "Service fee" [level=6]
  - paragraph: A percentage on every qualifying order, cash or card. You choose which orders and who keeps it.
  - switch "Add a service fee More info"
  - paragraph: Add a service fee
  - button "More info"
  - paragraph: Applied automatically to the order types and channels below. Table checks get it when they open and it follows the food as items are added or the check is split.
  - separator
  - heading "Auto-gratuity for large parties" [level=6]
  - paragraph: A set tip added to dine-in checks for large parties. Needs table service.
  - switch "Auto-gratuity for large parties More info"
  - paragraph: Auto-gratuity for large parties
  - button "More info"
  - paragraph: Parties of the size you set get this percentage added to their check before it prints. Servers can remove it for a table that prefers to tip on the slip.
  - paragraph: "RestauNax setup: your day closes at 4 AM, time zone From the address. Set by RestauNax."
  - button "Show all"
  - link "Contact support":
    - /url: mailto:support@restaunax.com
  - heading "Recent changes" [level=6]
  - paragraph: Who changed which setting, and when.
  - text: Area
  - combobox "Fees & tips"
  - paragraph: No changes recorded yet.
- button "Open chat"
```

# Test source

```ts
  119 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  120 |     if (session) await session.context.close().catch(() => {});
  121 |   });
  122 | 
  123 |   test.beforeEach(async () => {
  124 |     await allure.label("feature", "Portal navigation (dashboard)");
  125 |     await allure.label("severity", "critical");
  126 |     await page().setViewportSize(DESKTOP);
  127 |   });
  128 | 
  129 |   test("TC-1944: Back walks back through sidebar tabs, one at a time, to Today", async () => {
  130 |     await openHome();
  131 |     await expect(page().getByText("Today so far")).toBeVisible({
  132 |       timeout: 25_000,
  133 |     });
  134 |     await sidebar("Orders").click();
  135 |     await expectParam("tab", "Orders");
  136 |     await sidebar("Customers").click();
  137 |     await expectParam("tab", "Customers");
  138 |     // The tab already open: nothing new to go back through.
  139 |     await sidebar("Customers").click();
  140 | 
  141 |     await page().goBack();
  142 |     await expectParam("tab", "Orders");
  143 |     await page().goBack();
  144 |     await expectParam("tab", null);
  145 |     expect(new URL(page().url()).pathname).toBe(home());
  146 |     await expect(page().getByText("Today so far")).toBeVisible({
  147 |       timeout: 25_000,
  148 |     });
  149 |   });
  150 | 
  151 |   test("TC-1945: Back shows the previous subtab on Customers, Store Settings and Owner Settings", async () => {
  152 |     await openHome("?tab=Customers");
  153 |     await subtab("Customer Groups").click();
  154 |     await expectParam("customerTab", "segments");
  155 |     await expect(subtab("Customer Groups")).toHaveAttribute(
  156 |       "aria-selected",
  157 |       "true"
  158 |     );
  159 |     await page().goBack();
  160 |     await expectParam("customerTab", null);
  161 |     await expect(subtab("All Customers")).toHaveAttribute(
  162 |       "aria-selected",
  163 |       "true"
  164 |     );
  165 | 
  166 |     await openHome("?tab=Store%20Settings");
  167 |     await subtab("Fees & tips").click();
  168 |     await expectParam("settingsTab", "fees");
  169 |     await page().goBack();
  170 |     await expectParam("settingsTab", null);
  171 |     await expectParam("tab", "Store Settings");
  172 | 
  173 |     await openHome("?tab=Owner%20Settings");
  174 |     await subtab("Notifications").click();
  175 |     await expectParam("settingsView", "notifications");
  176 |     await page().goBack();
  177 |     await expectParam("settingsView", null);
  178 |     await expect(subtab("Automated Reports")).toHaveAttribute(
  179 |       "aria-selected",
  180 |       "true"
  181 |     );
  182 |   });
  183 | 
  184 |   test("TC-1946: the note printed on the check is plain text that follows the party size, percent and name", async () => {
  185 |     await openGratuity();
  186 |     await expect(gratuityToggle()).not.toBeChecked();
  187 |     await gratuityToggle().click();
  188 |     const note = page().locator("#auto-gratuity-notice");
  189 |     await expect(note).toHaveText(
  190 |       "Parties of 6 or more: 18% gratuity is added."
  191 |     );
  192 |     await expect(page().locator("textarea#auto-gratuity-notice")).toHaveCount(
  193 |       0
  194 |     );
  195 |     await page().locator("#auto-gratuity-min-guests").fill("8");
  196 |     await expect(note).toHaveText(
  197 |       "Parties of 8 or more: 18% gratuity is added."
  198 |     );
  199 |     await page().getByRole("button", { name: "Other" }).click();
  200 |     await page().locator("#auto-gratuity-percent").fill("17.5");
  201 |     await expect(note).toHaveText(
  202 |       "Parties of 8 or more: 17.5% gratuity is added."
  203 |     );
  204 |     await page().locator("#auto-gratuity-label").fill("Service charge");
  205 |     await expect(note).toHaveText(
  206 |       "Parties of 8 or more: 17.5% service charge is added."
  207 |     );
  208 |   });
  209 | 
  210 |   test("TC-1947: unsaved edits ask on Back and on a sidebar click; Keep editing keeps them, Leave leaves", async () => {
  211 |     await openHome("?tab=Orders");
  212 |     await sidebar("Store Settings").click();
  213 |     await expectParam("tab", "Store Settings");
  214 |     await subtab("Fees & tips").click();
  215 |     await expectParam("settingsTab", "fees");
  216 |     await expect(gratuityToggle()).toBeVisible({ timeout: 25_000 });
  217 |     await gratuityToggle().click();
  218 |     const note = page().locator("#auto-gratuity-notice");
> 219 |     await expect(note).toContainText("gratuity is added");
      |                        ^ Error: expect(locator).toContainText(expected) failed
  220 | 
  221 |     // Back asks, and staying keeps the screen and the edit.
  222 |     await page().goBack();
  223 |     let ask = activeDialog(page());
  224 |     await expect(ask).toContainText("Leave without saving?");
  225 |     await ask.getByRole("button", { name: "Keep editing" }).click();
  226 |     await expect(page().getByRole("dialog")).toHaveCount(0);
  227 |     await expectParam("settingsTab", "fees");
  228 |     await expect(note).toContainText("gratuity is added");
  229 | 
  230 |     // A sidebar click asks too.
  231 |     await sidebar("Customers").click();
  232 |     ask = activeDialog(page());
  233 |     await expect(ask).toContainText("Leave without saving?");
  234 |     await ask.getByRole("button", { name: "Keep editing" }).click();
  235 |     await expectParam("tab", "Store Settings");
  236 |     await expect(note).toContainText("gratuity is added");
  237 | 
  238 |     // Leave goes where they asked, once, with no second question.
  239 |     await sidebar("Customers").click();
  240 |     await activeDialog(page()).getByRole("button", { name: "Leave" }).click();
  241 |     await expectParam("tab", "Customers");
  242 |     await expect(page().getByRole("dialog")).toHaveCount(0);
  243 |   });
  244 | 
  245 |   test("TC-1948: with nothing unsaved, moving around never asks", async () => {
  246 |     await openGratuity();
  247 |     for (const name of ["Orders", "Store Settings", "Customers", "Billing"]) {
  248 |       await sidebar(name).click();
  249 |       await expectParam("tab", name);
  250 |       await expect(page().getByRole("dialog")).toHaveCount(0);
  251 |     }
  252 |     await page().goBack();
  253 |     await expectParam("tab", "Customers");
  254 |     await expect(page().getByRole("dialog")).toHaveCount(0);
  255 |   });
  256 | 
  257 |   test("TC-1949: Post History's Create Post stays inside the portal", async () => {
  258 |     await openHome("?tab=social-history");
  259 |     const create = page().getByRole("button", { name: "Create Post" }).first();
  260 |     await expect(create).toBeVisible({ timeout: 25_000 });
  261 |     await create.click();
  262 |     await expectParam("tab", "social-create");
  263 |     expect(new URL(page().url()).pathname).toBe(home());
  264 |     await expect(page().getByText(/not found/i)).toHaveCount(0);
  265 |   });
  266 | 
  267 |   test("TC-1950: Staff — unsaved payroll settings ask; Back shows the previous subtab", async () => {
  268 |     // Reached by clicks: Back from a full page load leaves the app, where only
  269 |     // the browser's own prompt can ask.
  270 |     await openHome();
  271 |     await sidebar("Restaurant Staff").click();
  272 |     await subtab("Settings").click();
  273 |     await subtab("Pay & overtime").click();
  274 |     await expectParam("staffTab", "payrollSettings");
  275 |     const schedule = page().getByRole("combobox", { name: "Every two weeks" });
  276 |     await expect(schedule).toBeVisible({ timeout: 25_000 });
  277 |     await schedule.click();
  278 |     await page().getByRole("option", { name: "Every week" }).click();
  279 |     await expect(page().getByText("You have unsaved changes.")).toBeVisible();
  280 | 
  281 |     await page().goBack();
  282 |     const ask = activeDialog(page());
  283 |     await expect(ask).toContainText("Leave without saving?");
  284 |     await ask.getByRole("button", { name: "Keep editing" }).click();
  285 |     await expect(page().getByRole("dialog")).toHaveCount(0);
  286 |     await expectParam("staffTab", "payrollSettings");
  287 |     await expect(page().getByText("You have unsaved changes.")).toBeVisible();
  288 | 
  289 |     await subtab("People").click();
  290 |     await activeDialog(page()).getByRole("button", { name: "Leave" }).click();
  291 |     await expectParam("staffTab", "people");
  292 |     await expect(page().getByRole("dialog")).toHaveCount(0);
  293 |     // The form has gone, so its edits no longer stand in the way of Back.
  294 |     await expect(page().getByText("You have unsaved changes.")).toHaveCount(0);
  295 | 
  296 |     await page().goBack();
  297 |     await expectParam("staffTab", "payrollSettings");
  298 |     await expect(page().getByText("You have unsaved changes.")).toHaveCount(0);
  299 |     await expect(page().getByRole("dialog")).toHaveCount(0);
  300 |   });
  301 | });
  302 | 
```