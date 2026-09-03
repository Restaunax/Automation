# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/03-order-placement.spec.ts >> Customer — Order Placement >> TC-26: customer can complete a full order with Stripe test card and reach Order Confirmed
- Location: tests/customer/03-order-placement.spec.ts:31:7

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
  - paragraph: An unexpected error occurred. Please try again.
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
  - text: Subtotal $12.99 Tax $1.14 Tip $1.95 Total $16.08
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
  1  | import { type Page, expect } from "@playwright/test";
  2  | 
  3  | export const createCustomerOrderConfirmationPage = (page: Page) => {
  4  |   const assertConfirmed = () =>
> 5  |     expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible(
     |                                                                     ^ Error: expect(locator).toBeVisible() failed
  6  |       { timeout: 20_000 }
  7  |     );
  8  | 
  9  |   // "Order #" (label) and the number itself render as separate text nodes/
  10 |   // lines in the same card, not concatenated — the original `/Order # #/`
  11 |   // regex never matched either node (confirmed live). Match the label alone.
  12 |   const assertOrderNumberVisible = () =>
  13 |     expect(page.getByText("Order #", { exact: true })).toBeVisible({
  14 |       timeout: 10_000,
  15 |     });
  16 | 
  17 |   const assertCustomerName = (firstName: string) =>
  18 |     expect(page.getByText(`Thanks ${firstName}!`)).toBeVisible({
  19 |       timeout: 10_000,
  20 |     });
  21 | 
  22 |   return { assertConfirmed, assertOrderNumberVisible, assertCustomerName };
  23 | };
  24 | 
```