# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/07-coupons.spec.ts >> Owner — Coupons >> TC-92: owner can edit an existing coupon's discount value
- Location: tests/dashboard/owner/07-coupons.spec.ts:841:7

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: locator('input[name="value"]')
Expected: "10"
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toHaveValue" with timeout 10000ms
  - waiting for locator('input[name="value"]')
    3 × locator resolved to <input value="" id="_r_7i_" required="" name="value" type="number" aria-invalid="false" class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputAdornedStart css-5dhmgj"/>
      - unexpected value ""

```

```yaml
- banner:
  - text: LOCATION Boithok Khana Kitchen - — Brooklyn — Manage Coupons
  - paragraph: Boithok Khana Kitchen -
  - text: Brooklyn, New York
  - button "Account settings": a
  - button "Select Language":
    - img
    - text: EN
  - button
- navigation "mailbox folders":
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
  - button "Restaurant Staff":
    - paragraph: Restaurant Staff
  - button "Coupons":
    - paragraph: Coupons
  - button "Deals":
    - paragraph: Deals
  - button "Owner Settings":
    - paragraph: Owner Settings
- main:
  - paragraph: "Managing: Boithok Khana Kitchen -"
  - heading "Coupon Management" [level=1]
  - button "Quick Templates"
  - button "Create Custom"
  - paragraph: My Coupons
  - button "More info"
  - text: "6"
  - paragraph: Org Coupons (Enrolled)
  - button "More info"
  - text: 19/ 19
  - paragraph: Active
  - button "More info"
  - text: "25"
  - paragraph: Inactive
  - button "More info"
  - text: "0"
  - paragraph: Expired
  - button "More info"
  - text: "0"
  - tablist:
    - tab "All (25)" [selected]
    - tab "My Coupons (6)"
    - tab "Organization (19)"
  - text: Search
  - textbox "Search":
    - /placeholder: Search coupon code or description
  - text: Status
  - combobox "All Statuses"
  - button "Refresh"
  - alert: Some coupons listed here are managed by RestauNax on your behalf. These are part of automated marketing campaigns that send promotional emails to your customers around holidays and special events. You can opt out of any campaign by toggling the enrollment switch.
  - table:
    - rowgroup:
      - row "Source Enrolled Code Type Value Description Valid Until Times Redeemed More info Status Actions":
        - columnheader "Source"
        - columnheader "Enrolled"
        - columnheader "Code":
          - button "Code"
        - columnheader "Type"
        - columnheader "Value"
        - columnheader "Description"
        - columnheader "Valid Until":
          - button "Valid Until"
        - columnheader "Times Redeemed More info":
          - text: Times Redeemed
          - button "More info"
        - columnheader "Status"
        - columnheader "Actions"
    - rowgroup:
      - row "Created by your restaurant This location only — AUTOFA99E09A Percentage 10% - Aug 20, 2026 Unlimited Active":
        - cell "Created by your restaurant This location only": My Coupon Location
        - cell "—":
          - paragraph: —
        - cell "AUTOFA99E09A":
          - paragraph: AUTOFA99E09A
          - button
        - cell "Percentage"
        - cell "10%"
        - cell "-"
        - cell "Aug 20, 2026"
        - cell "Unlimited"
        - cell "Active"
        - cell:
          - button
      - row "Created by your restaurant This location only — AUTO1278BD65 Percentage 10% - Aug 20, 2026 Unlimited Active":
        - cell "Created by your restaurant This location only": My Coupon Location
        - cell "—":
          - paragraph: —
        - cell "AUTO1278BD65":
          - paragraph: AUTO1278BD65
          - button
        - cell "Percentage"
        - cell "10%"
        - cell "-"
        - cell "Aug 20, 2026"
        - cell "Unlimited"
        - cell "Active"
        - cell:
          - button
      - row "Created by your restaurant This location only — WINBACK-ZI6K Percentage 15% Win-Back Lapsed Customers Jul 18, 2031 Unlimited Active":
        - cell "Created by your restaurant This location only": My Coupon Location
        - cell "—":
          - paragraph: —
        - cell "WINBACK-ZI6K":
          - paragraph: WINBACK-ZI6K
          - button
        - cell "Percentage"
        - cell "15%"
        - cell "Win-Back Lapsed Customers"
        - cell "Jul 18, 2031"
        - cell "Unlimited"
        - cell "Active"
        - cell:
          - button
      - row "Created by RestauNax organization Independence Day Enrolled - Customers will receive this coupon JULY4TH27 Percentage 15% Independence Day Special - 15% off your order Jul 11, 2027 Unlimited Active -":
        - cell "Created by RestauNax organization Independence Day":
          - img "RestauNax"
          - paragraph: RestauNax
          - text: Independence Day
        - cell "Enrolled - Customers will receive this coupon":
          - switch [checked]
        - cell "JULY4TH27":
          - paragraph: JULY4TH27
          - button
        - cell "Percentage"
        - cell "15%"
        - cell "Independence Day Special - 15% off your order"
        - cell "Jul 11, 2027"
        - cell "Unlimited"
        - cell "Active"
        - cell "-"
      - row "Created by your restaurant This location only — ANN-CRJKTY4B Fixed Amount $5.00 - Jul 30, 2026 Unlimited Active":
        - cell "Created by your restaurant This location only": My Coupon Location
        - cell "—":
          - paragraph: —
        - cell "ANN-CRJKTY4B":
          - paragraph: ANN-CRJKTY4B
          - button
        - cell "Fixed Amount"
        - cell "$5.00"
        - cell "-"
        - cell "Jul 30, 2026"
        - cell "Unlimited"
        - cell "Active"
        - cell:
          - button
      - row "Created by RestauNax organization Father's Day Enrolled - Customers will receive this coupon FATHERSDAY27 Percentage 15% Father's Day Special - 15% off your order Jun 27, 2027 Unlimited Active -":
        - cell "Created by RestauNax organization Father's Day":
          - img "RestauNax"
          - paragraph: RestauNax
          - text: Father's Day
        - cell "Enrolled - Customers will receive this coupon":
          - switch [checked]
        - cell "FATHERSDAY27":
          - paragraph: FATHERSDAY27
          - button
        - cell "Percentage"
        - cell "15%"
        - cell "Father's Day Special - 15% off your order"
        - cell "Jun 27, 2027"
        - cell "Unlimited"
        - cell "Active"
        - cell "-"
      - row "Created by your restaurant This location only — OFF100 Percentage 100% - Jul 23, 2026 Unlimited Active":
        - cell "Created by your restaurant This location only": My Coupon Location
        - cell "—":
          - paragraph: —
        - cell "OFF100":
          - paragraph: OFF100
          - button
        - cell "Percentage"
        - cell "100%"
        - cell "-"
        - cell "Jul 23, 2026"
        - cell "Unlimited"
        - cell "Active"
        - cell:
          - button
      - row "Created by your restaurant This location only — OFF10 Percentage 10% - Jul 23, 2026 Unlimited Active":
        - cell "Created by your restaurant This location only": My Coupon Location
        - cell "—":
          - paragraph: —
        - cell "OFF10":
          - paragraph: OFF10
          - button
        - cell "Percentage"
        - cell "10%"
        - cell "-"
        - cell "Jul 23, 2026"
        - cell "Unlimited"
        - cell "Active"
        - cell:
          - button
      - row "Created by RestauNax organization Memorial Day Enrolled - Customers will receive this coupon MEMORIAL27 Percentage 15% Memorial Day Special - 15% off your order Jun 7, 2027 Unlimited Active -":
        - cell "Created by RestauNax organization Memorial Day":
          - img "RestauNax"
          - paragraph: RestauNax
          - text: Memorial Day
        - cell "Enrolled - Customers will receive this coupon":
          - switch [checked]
        - cell "MEMORIAL27":
          - paragraph: MEMORIAL27
          - button
        - cell "Percentage"
        - cell "15%"
        - cell "Memorial Day Special - 15% off your order"
        - cell "Jun 7, 2027"
        - cell "Unlimited"
        - cell "Active"
        - cell "-"
      - row "Created by RestauNax organization Mother's Day Enrolled - Customers will receive this coupon MOTHERSDAY27 Percentage 15% Mother's Day Special - 15% off your order May 16, 2027 Unlimited Active -":
        - cell "Created by RestauNax organization Mother's Day":
          - img "RestauNax"
          - paragraph: RestauNax
          - text: Mother's Day
        - cell "Enrolled - Customers will receive this coupon":
          - switch [checked]
        - cell "MOTHERSDAY27":
          - paragraph: MOTHERSDAY27
          - button
        - cell "Percentage"
        - cell "15%"
        - cell "Mother's Day Special - 15% off your order"
        - cell "May 16, 2027"
        - cell "Unlimited"
        - cell "Active"
        - cell "-"
  - paragraph: "Rows per page:"
  - 'combobox "Rows per page: 10"': "10"
  - paragraph: 1–10 of 25
  - button "Go to previous page" [disabled]
  - button "Go to next page"
- button "Open chat"
```

# Test source

```ts
  773 |     await couponPage.openRowActionMenu(couponCode);
  774 |     await couponPage.editMenuItem().click();
  775 | 
  776 |     await expect(couponPage.couponCodeInput()).toHaveValue(couponCode, {
  777 |       timeout: 10_000,
  778 |     });
  779 |     await expect(couponPage.discountValueInput()).toHaveValue("10");
  780 |   });
  781 | 
  782 |   test("TC-163: Send to Customers is disabled for an expired coupon", async ({
  783 |     ownerPage,
  784 |   }) => {
  785 |     await allure.description(
  786 |       "The row action menu's Send to Customers item is disabled once a coupon's computed status is " +
  787 |         "Expired (only enabled while ACTIVE)."
  788 |     );
  789 | 
  790 |     const { restaurantId } = readSharedState();
  791 |     const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
  792 |     const couponPage = createOwnerCouponPage(ownerPage);
  793 |     const expiredCode = generateCouponCode();
  794 | 
  795 |     await allure.step("Seed an already-expired coupon", async () => {
  796 |       const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
  797 |       const past = new Date();
  798 |       past.setDate(past.getDate() - 10);
  799 |       const evenEarlier = new Date(past);
  800 |       evenEarlier.setDate(evenEarlier.getDate() - 5);
  801 |       const res = await createCouponRaw(accessToken, restaurantId, {
  802 |         code: expiredCode,
  803 |         type: "PERCENTAGE",
  804 |         value: 10,
  805 |         startDate: evenEarlier.toISOString(),
  806 |         endDate: past.toISOString(),
  807 |       });
  808 |       expect(res.status, JSON.stringify(res.data)).toBe(201);
  809 |     });
  810 | 
  811 |     await mgmtPage.goto(restaurantId);
  812 |     await couponPage.navigateToManageCoupons();
  813 |     await couponPage.search(expiredCode);
  814 |     await couponPage.openRowActionMenu(expiredCode);
  815 | 
  816 |     await expect(couponPage.sendToCustomersMenuItem()).toBeDisabled();
  817 |   });
  818 | 
  819 |   test("TC-164: Reset Form clears the create-coupon form back to defaults", async ({
  820 |     ownerPage,
  821 |   }) => {
  822 |     await allure.description(
  823 |       "After partially filling the create form, Reset Form clears the code and description fields."
  824 |     );
  825 | 
  826 |     const { restaurantId } = readSharedState();
  827 |     const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
  828 |     const couponPage = createOwnerCouponPage(ownerPage);
  829 | 
  830 |     await mgmtPage.goto(restaurantId);
  831 |     await couponPage.navigateToCreateCoupon();
  832 | 
  833 |     await couponPage.couponCodeInput().fill(generateCouponCode());
  834 |     await couponPage.descriptionInput().fill("temporary description");
  835 |     await couponPage.resetFormButton().click();
  836 | 
  837 |     await expect(couponPage.couponCodeInput()).toHaveValue("");
  838 |     await expect(couponPage.descriptionInput()).toHaveValue("");
  839 |   });
  840 | 
  841 |   test("TC-92: owner can edit an existing coupon's discount value", async ({
  842 |     ownerPage,
  843 |   }) => {
  844 |     await allure.description(
  845 |       "Editing a coupon's discount value and saving persists the new value. This previously 500'd " +
  846 |         "server-side because the form sent `value` as a string but Prisma's coupon.update() expects a " +
  847 |         "Float (RestauNax #481); the fix coerces numeric fields on both the form and the update " +
  848 |         "controller. Verifies the update toast appears and the new value is reflected server-side."
  849 |     );
  850 | 
  851 |     const { restaurantId } = readSharedState();
  852 |     const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
  853 |     const couponPage = createOwnerCouponPage(ownerPage);
  854 |     const couponCode = generateCouponCode();
  855 | 
  856 |     // Create a coupon at 10%, then edit it to 25%.
  857 |     await mgmtPage.goto(restaurantId);
  858 |     await couponPage.navigateToCreateCoupon();
  859 |     await couponPage.fillCouponForm(couponCode, "10");
  860 |     await couponPage.submit();
  861 |     await couponPage.assertSuccessToast();
  862 | 
  863 |     await couponPage.navigateToManageCoupons();
  864 |     await couponPage.search(couponCode);
  865 |     // Wait for the filtered row before opening its ⋮ menu (see TC-159/TC-162).
  866 |     await expect(couponPage.couponRowByCode(couponCode)).toBeVisible({
  867 |       timeout: 10_000,
  868 |     });
  869 |     await couponPage.openRowActionMenu(couponCode);
  870 |     await couponPage.editMenuItem().click();
  871 | 
  872 |     // Wait for the edit form to pre-fill before changing the value (see TC-162).
> 873 |     await expect(couponPage.discountValueInput()).toHaveValue("10", {
      |                                                   ^ Error: expect(locator).toHaveValue(expected) failed
  874 |       timeout: 10_000,
  875 |     });
  876 |     await couponPage.discountValueInput().fill("25");
  877 |     await couponPage.submit();
  878 |     await couponPage.assertCouponUpdatedToast();
  879 | 
  880 |     // Verify the new value persisted server-side. Codes are stored uppercased,
  881 |     // so match case-insensitively.
  882 |     const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
  883 |     const coupons = await getRestaurantCoupons(accessToken, restaurantId);
  884 |     const edited = coupons.find(
  885 |       (c) => c.code.toUpperCase() === couponCode.toUpperCase()
  886 |     );
  887 |     expect(
  888 |       edited,
  889 |       `coupon ${couponCode} not found in restaurant coupons`
  890 |     ).toBeTruthy();
  891 |     expect(edited?.value).toBe(25);
  892 |   });
  893 | 
  894 |   test("TC-209: owner can create a Free Delivery coupon (no discount value)", async ({
  895 |     ownerPage,
  896 |   }) => {
  897 |     await allure.description(
  898 |       "Selecting the Free Delivery discount type hides the discount-value field (the fee waiver is computed at checkout), and the created coupon persists with type FREE_DELIVERY."
  899 |     );
  900 | 
  901 |     const { restaurantId } = readSharedState();
  902 |     const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
  903 |     const couponPage = createOwnerCouponPage(ownerPage);
  904 |     const couponCode = generateCouponCode();
  905 | 
  906 |     await allure.step("Open the Create Coupon form", async () => {
  907 |       await mgmtPage.goto(restaurantId);
  908 |       await couponPage.navigateToCreateCoupon();
  909 |     });
  910 | 
  911 |     await allure.step(
  912 |       "Pick Free Delivery — the value field disappears",
  913 |       async () => {
  914 |         await couponPage.couponCodeInput().fill(couponCode);
  915 |         await allure.parameter("Coupon code", couponCode);
  916 |         await couponPage.selectDiscountType("Free Delivery");
  917 |         await expect(couponPage.discountValueInput()).toBeHidden();
  918 |       }
  919 |     );
  920 | 
  921 |     await allure.step("Submit and verify success toast", async () => {
  922 |       await couponPage.submit();
  923 |       await couponPage.assertSuccessToast();
  924 |     });
  925 | 
  926 |     await allure.step("Coupon persisted as FREE_DELIVERY (API)", async () => {
  927 |       const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
  928 |       const coupons = await getRestaurantCoupons(accessToken, restaurantId);
  929 |       const created = coupons.find((c) => c.code === couponCode);
  930 |       expect(created, `coupon ${couponCode} missing from API`).toBeTruthy();
  931 |       expect(created?.type).toBe("FREE_DELIVERY");
  932 |     });
  933 |   });
  934 | });
  935 | 
```