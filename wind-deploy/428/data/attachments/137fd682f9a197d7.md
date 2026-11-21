# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/02-checkout.spec.ts >> Customer — Checkout gift card >> TC-178: a gift card that partially covers the order still requires Stripe payment for the remainder
- Location: tests/customer/02-checkout.spec.ts:761:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Order Confirmed!' })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('heading', { name: 'Order Confirmed!' })

```

```yaml
- main:
  - button "Back"
  - heading "Checkout" [level=1]
  - paragraph: Boithok Khana Kitchen -
  - heading "Payment Information" [level=3]
  - heading "Payment Error" [level=4]
  - paragraph: Customer cus_UrSn1efSv5jn7F already has the maximum number of payment methods attached.
  - iframe
  - button "Complete Order"
  - paragraph: Your payment information is encrypted and secure. Powered by Stripe.
  - heading "Order Summary" [level=3]
  - heading "1x Automation Burger" [level=4]
  - text: $12.99
  - button "Remove item"
  - text: Have a coupon code?
  - textbox "Enter code"
  - button "Apply" [disabled]
  - text: Subtotal $12.99 Tax $1.14 Tip $1.95 Gift Card -$5.00 Total $11.08
- contentinfo:
  - text: Powered by
  - link "RestauNax RestauNax":
    - /url: https://www.restaunax.com
    - img "RestauNax"
    - text: RestauNax
  - text: "|"
  - link "Terms":
    - /url: https://www.restaunax.com/website-terms
  - text: "|"
  - link "Privacy":
    - /url: https://www.restaunax.com/privacy-policy
- alert
```

# Test source

```ts
  709 |     const restaurantId = readRestaurantId();
  710 |     const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
  711 |     const checkoutPage = createCustomerCheckoutPage(page);
  712 |     const couponCode = generateCouponCode();
  713 |     let giftCardCode = "";
  714 | 
  715 |     await allure.step("Seed a coupon and a gift card", async () => {
  716 |       const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
  717 |       const res = await createCouponRaw(accessToken, restaurantId, {
  718 |         code: couponCode,
  719 |         type: "PERCENTAGE",
  720 |         value: 10,
  721 |         startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  722 |         endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  723 |         status: "ACTIVE",
  724 |       });
  725 |       expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
  726 |         true
  727 |       );
  728 |       const giftCard = await seedGiftCard(restaurantId, 10);
  729 |       recordGiftCardForCleanup(giftCard.id);
  730 |       giftCardCode = giftCard.code;
  731 |     });
  732 | 
  733 |     await checkoutPage.seedCart(
  734 |       restaurantId,
  735 |       menuItemId,
  736 |       menuItemName,
  737 |       menuItemPrice
  738 |     );
  739 | 
  740 |     await allure.step("Apply both the coupon and the gift card", async () => {
  741 |       await checkoutPage.applyCoupon(couponCode);
  742 |       await checkoutPage.assertCouponApplied(couponCode, "10% off your order");
  743 |       await checkoutPage.applyGiftCard(giftCardCode);
  744 |       await checkoutPage.assertGiftCardApplied();
  745 |     });
  746 |   });
  747 | 
  748 |   // A gift card funded well above the order total should cover the entire
  749 |   // charge and skip Stripe (per checkout/page.tsx's $0-total branch). Live
  750 |   // network trace instead shows: POST /api/order/new/... succeeds (201, the
  751 |   // order IS created), but the frontend then still attempts to create a
  752 |   // Stripe PaymentIntent for the now-$0 remainder anyway, which the backend
  753 |   // correctly rejects (400, "Error creating order" logged client-side) —
  754 |   // stripe requires a minimum charge amount. The customer is left stuck on
  755 |   // the checkout page with no confirmation, even though their order actually
  756 |   // went through server-side. Same class of bug as TC-92 (real, not a test
  757 |   // bug) — filed as fixme rather than asserting the broken behavior as
  758 |   // correct. Tracked in TEST_COVERAGE.md's Known Technical Debt.
  759 |   test.fixme("TC-177: a gift card that fully covers the order completes without a Stripe step", async () => {});
  760 | 
  761 |   test("TC-178: a gift card that partially covers the order still requires Stripe payment for the remainder", async ({
  762 |     page,
  763 |   }) => {
  764 |     await allure.description(
  765 |       "A gift card funded below the order total covers only part of the charge — the customer still " +
  766 |         "pays the remainder via Stripe, and the order completes normally."
  767 |     );
  768 | 
  769 |     const restaurantId = readRestaurantId();
  770 |     const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
  771 |     const checkoutPage = createCustomerCheckoutPage(page);
  772 | 
  773 |     const giftCard = await allure.step(
  774 |       "Seed a small-balance gift card (comfortably below any single-item order total)",
  775 |       async () => {
  776 |         const card = await seedGiftCard(restaurantId, 5);
  777 |         recordGiftCardForCleanup(card.id);
  778 |         return card;
  779 |       }
  780 |     );
  781 |     test.skip(
  782 |       giftCard.currentBalance >= menuItemPrice,
  783 |       "Seed menu item price is too low for a partial-coverage scenario"
  784 |     );
  785 | 
  786 |     await checkoutPage.seedCart(
  787 |       restaurantId,
  788 |       menuItemId,
  789 |       menuItemName,
  790 |       menuItemPrice
  791 |     );
  792 |     await checkoutPage.fillCustomerInfo(
  793 |       "Jane",
  794 |       "Tester",
  795 |       "jane@restaunax-test.com",
  796 |       "5559876543"
  797 |     );
  798 |     await checkoutPage.selectPickup();
  799 |     await checkoutPage.applyGiftCard(giftCard.code);
  800 |     await checkoutPage.assertGiftCardApplied();
  801 | 
  802 |     await checkoutPage.clickProceedToPayment();
  803 |     await checkoutPage.assertPaymentSectionVisible();
  804 |     await checkoutPage.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
  805 |     await checkoutPage.completeOrder();
  806 | 
  807 |     await expect(
  808 |       page.getByRole("heading", { name: "Order Confirmed!" })
> 809 |     ).toBeVisible({ timeout: 20_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  810 |   });
  811 | });
  812 | 
  813 | // ── Physical gift card STOCK at checkout. A pre-printed card is a code with no
  814 | // money on it until a register loads it; presenting one at checkout must be
  815 | // refused like any other unusable card. Seeds the stock through the admin
  816 | // batch endpoints (there is no purchase — that is the point) and reads the
  817 | // code back from the printer export.
  818 | test.describe("Customer — Checkout physical gift card stock", () => {
  819 |   test.skip(
  820 |     !TEMPLATE_WIND_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
  821 |     "TEMPLATE_WIND_URL and ADMIN_EMAIL/PASSWORD must be set in .env"
  822 |   );
  823 | 
  824 |   test.beforeEach(async () => {
  825 |     await allure.label("feature", "Customer Ordering");
  826 |     await allure.label("severity", "critical");
  827 |   });
  828 | 
  829 |   test("TC-477: an unloaded (INACTIVE) physical card is refused at checkout", async ({
  830 |     page,
  831 |   }) => {
  832 |     await allure.description(
  833 |       "A card minted for the printer but never loaded at a register has status INACTIVE and a zero " +
  834 |         "balance. Applying its code at checkout shows the rejection and applies nothing — the opposite of " +
  835 |         "TC-171's funded card."
  836 |     );
  837 | 
  838 |     const restaurantId = readRestaurantId();
  839 |     const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
  840 |     const checkoutPage = createCustomerCheckoutPage(page);
  841 |     const runId = generateRunId();
  842 |     const adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD))
  843 |       .accessToken;
  844 | 
  845 |     const { batchId, code } = await allure.step(
  846 |       "Mint one card of stock and read its code",
  847 |       async () => {
  848 |         const batch = await createGiftCardBatchRaw(adminToken, {
  849 |           restaurantId,
  850 |           quantity: 1,
  851 |           label: `Auto stock ${runId}`,
  852 |         });
  853 |         expect(batch.status, JSON.stringify(batch.data)).toBe(201);
  854 |         const csv = await exportGiftCardBatchCsvRaw(
  855 |           adminToken,
  856 |           batch.data.data!.id
  857 |         );
  858 |         expect(csv.status, String(csv.data).slice(0, 200)).toBe(200);
  859 |         const { rows } = csvToObjects(csv.data);
  860 |         const first = rows[0];
  861 |         expect(first, "one exported row").toBeTruthy();
  862 |         await allure.parameter("Gift card code", first?.code_display ?? "");
  863 |         return { batchId: batch.data.data!.id, code: first?.code ?? "" };
  864 |       }
  865 |     );
  866 | 
  867 |     try {
  868 |       await checkoutPage.seedCart(
  869 |         restaurantId,
  870 |         menuItemId,
  871 |         menuItemName,
  872 |         menuItemPrice
  873 |       );
  874 |       await checkoutPage.applyGiftCard(code);
  875 |       await checkoutPage.assertGiftCardRejected();
  876 |     } finally {
  877 |       // Stock that never sold is frozen so the code can never be loaded later.
  878 |       await freezeGiftCardBatchRaw(adminToken, batchId).catch(() => {
  879 |         /* cleanup is best-effort; the tenant is the shared seed restaurant */
  880 |       });
  881 |     }
  882 |   });
  883 | });
  884 | 
```