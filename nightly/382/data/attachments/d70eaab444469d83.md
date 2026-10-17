# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/19-reservations.spec.ts >> Owner — Reservations >> TC-445: phone-booking dialog — fill party/date+time/name/phone → confirmation code; appears in the day view with the right status chip; cancel updates it
- Location: tests/dashboard/owner/19-reservations.spec.ts:339:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('row').filter({ hasText: 'Auto Guest a310032a' }).locator('.MuiChip-label')
Expected: "Booked"
Error: strict mode violation: getByRole('row').filter({ hasText: 'Auto Guest a310032a' }).locator('.MuiChip-label') resolved to 2 elements:
    1) <span class="MuiChip-label MuiChip-labelSmall css-d6wmh0">Phone</span> aka getByText('Phone')
    2) <span class="MuiChip-label MuiChip-labelSmall css-4y436t">Booked</span> aka getByText('Booked')

Call log:
  - Expect "toHaveText" with timeout 10000ms
  - waiting for getByRole('row').filter({ hasText: 'Auto Guest a310032a' }).locator('.MuiChip-label')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e8]:
        - generic [ref=e10]:
          - generic [ref=e11]:
            - img [ref=e12]
            - generic [ref=e14]: LOCATION
          - generic [ref=e15]: Automation Owner2 Store a310032a — Miami — Reservations
        - generic [ref=e17]:
          - generic [ref=e19]:
            - img [ref=e20]
            - generic [ref=e22]:
              - paragraph [ref=e23]: Automation Owner2 Store a310032a
              - generic [ref=e24]: Miami, FL
          - button "Account settings" [ref=e26] [cursor=pointer]:
            - generic [ref=e27]: A
          - button "Select Language" [ref=e29] [cursor=pointer]:
            - img [ref=e31]
            - text: EN
          - button [ref=e37] [cursor=pointer]:
            - img [ref=e38]
    - navigation "mailbox folders" [ref=e40]:
      - generic [ref=e42]:
        - button "Collapse sidebar" [ref=e44] [cursor=pointer]:
          - img [ref=e45]
        - generic [ref=e48]:
          - button "Analytics" [ref=e49] [cursor=pointer]:
            - img [ref=e51]
            - paragraph [ref=e53]: Analytics
          - button "Orders" [ref=e54] [cursor=pointer]:
            - img [ref=e56]
            - paragraph [ref=e58]: Orders
          - button "Menu" [ref=e59] [cursor=pointer]:
            - img [ref=e61]
            - paragraph [ref=e63]: Menu
          - button "Customers" [ref=e64] [cursor=pointer]:
            - img [ref=e66]
            - paragraph [ref=e68]: Customers
          - button "Billing" [ref=e69] [cursor=pointer]:
            - img [ref=e71]
            - paragraph [ref=e73]: Billing
          - button "Image Library" [ref=e74] [cursor=pointer]:
            - img [ref=e76]
            - paragraph [ref=e78]: Image Library
          - button "Store Settings" [ref=e79] [cursor=pointer]:
            - img [ref=e81]
            - paragraph [ref=e83]: Store Settings
          - button "Store Operations" [ref=e85] [cursor=pointer]:
            - img [ref=e87]
            - paragraph [ref=e89]: Store Operations
            - img [ref=e91]
          - button "Job Applications" [ref=e93] [cursor=pointer]:
            - img [ref=e95]
            - paragraph [ref=e97]: Job Applications
          - button "Restaurant Staff" [ref=e98] [cursor=pointer]:
            - img [ref=e100]
            - paragraph [ref=e102]: Restaurant Staff
          - button "Coupons" [ref=e104] [cursor=pointer]:
            - img [ref=e106]
            - paragraph [ref=e108]: Coupons
            - img [ref=e110]
          - button "Deals" [ref=e113] [cursor=pointer]:
            - img [ref=e115]
            - paragraph [ref=e117]: Deals
            - img [ref=e119]
          - button "Print Shop" [ref=e121] [cursor=pointer]:
            - img [ref=e123]
            - paragraph [ref=e125]: Print Shop
        - button "Owner Settings" [ref=e128] [cursor=pointer]:
          - img [ref=e130]
          - paragraph [ref=e133]: Owner Settings
    - main [ref=e134]:
      - generic [ref=e136]:
        - img [ref=e137]
        - paragraph [ref=e139]:
          - generic [ref=e140]: "Managing:"
          - text: Automation Owner2 Store a310032a
      - generic [ref=e142]:
        - generic [ref=e143]:
          - img [ref=e145]
          - heading "Reservations" [level=1] [ref=e147]
        - generic [ref=e148]:
          - tablist [ref=e152]:
            - tab "Bookings" [selected] [ref=e153] [cursor=pointer]
            - tab "Settings" [ref=e154] [cursor=pointer]
            - tab "Insights" [ref=e155] [cursor=pointer]
          - generic [ref=e156]:
            - generic [ref=e157]:
              - generic [ref=e158]:
                - button "Previous day" [ref=e159] [cursor=pointer]:
                  - img [ref=e160]
                - heading "Tuesday, Oct 13, 2026" [level=6] [ref=e162]
                - button "Next day" [ref=e163] [cursor=pointer]:
                  - img [ref=e164]
                - button "Today" [ref=e166] [cursor=pointer]:
                  - img [ref=e168]
                  - text: Today
              - button "Add booking" [active] [ref=e170] [cursor=pointer]:
                - img [ref=e172]
                - text: Add booking
            - generic [ref=e174]:
              - generic [ref=e175]:
                - generic [ref=e176]: Status
                - generic [ref=e177]:
                  - combobox "All statuses" [ref=e178] [cursor=pointer]
                  - textbox: ALL
                  - img
                  - group
              - generic [ref=e179]:
                - generic [ref=e180]: Type
                - generic [ref=e181]:
                  - combobox "All types" [ref=e182] [cursor=pointer]
                  - textbox: ALL
                  - img
                  - group
            - table [ref=e184]:
              - rowgroup [ref=e185]:
                - row "Restaurant timezone unavailable — showing your browser's timezone instead (UTC). Guest Party Tables Notes History Status" [ref=e186]:
                  - columnheader "Restaurant timezone unavailable — showing your browser's timezone instead (UTC)." [ref=e187]: Time
                  - columnheader "Guest" [ref=e188]
                  - columnheader "Party" [ref=e189]
                  - columnheader "Tables" [ref=e190]
                  - columnheader "Notes" [ref=e191]
                  - columnheader "History" [ref=e192]
                  - columnheader "Status" [ref=e193]
                  - columnheader [ref=e194]
              - rowgroup [ref=e195]:
                - row "6:00 PM Auto Guest a310032a 5553441001 Phone 2 Not assigned No notes No history Booked Actions" [ref=e196]:
                  - cell "6:00 PM" [ref=e197]:
                    - paragraph [ref=e198]: 6:00 PM
                  - cell "Auto Guest a310032a 5553441001 Phone" [ref=e199]:
                    - paragraph [ref=e200]: Auto Guest a310032a
                    - generic [ref=e201]:
                      - generic [ref=e202]: "5553441001"
                      - generic [ref=e204]: Phone
                  - cell "2" [ref=e205]
                  - cell "Not assigned" [ref=e206]:
                    - paragraph [ref=e207]: Not assigned
                  - cell "No notes" [ref=e208]:
                    - generic [ref=e210]: No notes
                  - cell "No history" [ref=e211]
                  - cell "Booked" [ref=e212]:
                    - generic [ref=e214]: Booked
                  - cell "Actions" [ref=e215]:
                    - button "Actions" [ref=e216] [cursor=pointer]:
                      - img [ref=e217]
  - button "Open chat" [ref=e219] [cursor=pointer]:
    - img [ref=e220]
```

# Test source

```ts
  273 |       timeout: 10_000,
  274 |     });
  275 | 
  276 |     // Overlap attempt: 3–6 collides with the seeded 1–4 band.
  277 |     await reservationsPage.openCreateTurnTime();
  278 |     const overlapRes = await reservationsPage.saveTurnTimeForm({
  279 |       minPartySize: 3,
  280 |       maxPartySize: 6,
  281 |       durationMinutes: 75,
  282 |     });
  283 |     expect(overlapRes.status()).toBe(409);
  284 |     await expect(reservationsPage.turnTimeOverlapSnackbar()).toBeVisible({
  285 |       timeout: 5_000,
  286 |     });
  287 |   });
  288 | 
  289 |   test("TC-444: date override — close a date via the picker; appears in the upcoming list; delete it", async () => {
  290 |     await reservationsPage.gotoSettingsSubTab(restaurantId);
  291 | 
  292 |     const target = new Date();
  293 |     target.setDate(target.getDate() + 5);
  294 |     const displayText = formatOverrideDisplay(target);
  295 | 
  296 |     await reservationsPage.openAddDateOverride();
  297 |     await reservationsPage.setDateOverrideDate(formatMMDDYYYY(target));
  298 |     // "Closed all day" defaults ON — leave it, this IS "close a date".
  299 |     const res = await reservationsPage.saveDateOverride();
  300 |     expect(res.status()).toBe(201);
  301 |     await expect(reservationsPage.snackbar("Date override saved.")).toBeVisible(
  302 |       { timeout: 5_000 }
  303 |     );
  304 | 
  305 |     const row = reservationsPage.dateOverrideRow(displayText);
  306 |     await expect(row).toBeVisible({ timeout: 10_000 });
  307 |     await expect(row.locator(".MuiChip-label")).toHaveText("Closed");
  308 | 
  309 |     const list = unwrap(
  310 |       await listReservationDateOverridesOwnerRaw(ownerToken, restaurantId)
  311 |     ) as Record<string, unknown>[];
  312 |     expect(list.length).toBe(1);
  313 |     expect(list[0]?.closed).toBe(true);
  314 | 
  315 |     await reservationsPage.rowDeleteButton(row, "Delete").click();
  316 |     await reservationsPage
  317 |       .confirmDialog("Delete this date override?")
  318 |       .waitFor({ state: "visible", timeout: 5_000 });
  319 |     const [delRes] = await Promise.all([
  320 |       session.page.waitForResponse(
  321 |         (r) =>
  322 |           /\/reservation-date-overrides\/[^/]+$/.test(r.url()) &&
  323 |           r.request().method() === "DELETE",
  324 |         { timeout: 15_000 }
  325 |       ),
  326 |       reservationsPage
  327 |         .confirmDialogButton("Delete this date override?", "Delete")
  328 |         .click(),
  329 |     ]);
  330 |     expect(delRes.status()).toBe(200);
  331 |     await expect(row).toHaveCount(0);
  332 | 
  333 |     const listAfter = unwrap(
  334 |       await listReservationDateOverridesOwnerRaw(ownerToken, restaurantId)
  335 |     ) as Record<string, unknown>[];
  336 |     expect(listAfter.length).toBe(0);
  337 |   });
  338 | 
  339 |   test("TC-445: phone-booking dialog — fill party/date+time/name/phone → confirmation code; appears in the day view with the right status chip; cancel updates it", async () => {
  340 |     await allure.description(
  341 |       "Owner phone bookings are always ADVISORY (mode:'staff') — no min-" +
  342 |         "notice/advance-window enforcement, so any date/time works. Submitting " +
  343 |         "returns a confirmationCode and refreshes the day list (shared " +
  344 |         "refresh), so the row is visible without a manual reload; cancelling " +
  345 |         "via the row's kebab menu PATCHes status to CANCELLED."
  346 |     );
  347 |     await reservationsPage.gotoBookingsSubTab(restaurantId);
  348 |     await reservationsPage.addBookingButton().click();
  349 |     await expect(reservationsPage.phoneBookingDialog()).toBeVisible({
  350 |       timeout: 10_000,
  351 |     });
  352 | 
  353 |     const guestName = `Auto Guest ${runId}`;
  354 |     await reservationsPage.phoneBookingTimeInput().fill("18:00");
  355 |     await reservationsPage.phoneBookingNameInput().fill(guestName);
  356 |     await reservationsPage.phoneBookingPhoneInput().fill(nextGuestPhone());
  357 | 
  358 |     const res = await reservationsPage.submitPhoneBooking();
  359 |     expect(res.status()).toBe(201);
  360 |     await expect(reservationsPage.phoneBookingConfirmationCode()).toBeVisible({
  361 |       timeout: 10_000,
  362 |     });
  363 |     const code = (
  364 |       await reservationsPage.phoneBookingConfirmationCode().textContent()
  365 |     )?.trim();
  366 |     expect(code && code.length > 0).toBe(true);
  367 | 
  368 |     await reservationsPage.phoneBookingDoneButton().click();
  369 |     await expect(reservationsPage.phoneBookingDialog()).toBeHidden();
  370 | 
  371 |     const row = reservationsPage.bookingRow(guestName);
  372 |     await expect(row).toBeVisible({ timeout: 10_000 });
> 373 |     await expect(reservationsPage.bookingRowStatusChip(guestName)).toHaveText(
      |                                                                    ^ Error: expect(locator).toHaveText(expected) failed
  374 |       "Booked"
  375 |     );
  376 | 
  377 |     const cancelRes = await reservationsPage.cancelBookingViaMenu(guestName);
  378 |     expect(cancelRes.status()).toBe(200);
  379 |     await expect(reservationsPage.snackbar("Booking cancelled.")).toBeVisible({
  380 |       timeout: 5_000,
  381 |     });
  382 |     await expect(reservationsPage.bookingRowStatusChip(guestName)).toHaveText(
  383 |       "Cancelled"
  384 |     );
  385 |   });
  386 | });
  387 | 
```