# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-lima/11-checkout-and-order.spec.ts >> Lima — checkout and payment >> TC-L42: an invalid coupon is rejected
- Location: tests/customer-lima/11-checkout-and-order.spec.ts:101:7

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/enter code/i).first()

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e9] [cursor=pointer]
      - generic [ref=e12]:
        - link "Home" [ref=e13] [cursor=pointer]:
          - /url: /boithok-khana-kitchen
        - link "Menu" [ref=e14] [cursor=pointer]:
          - /url: /boithok-khana-kitchen/menu
        - link "Careers" [ref=e15] [cursor=pointer]:
          - /url: /boithok-khana-kitchen/careers
      - button "Login" [ref=e18] [cursor=pointer]:
        - img [ref=e20]
        - text: Login
      - button "shopping cart with 1 items" [ref=e22] [cursor=pointer]:
        - generic [ref=e23]:
          - img [ref=e24]
          - generic [ref=e26]: "1"
  - main [ref=e27]:
    - generic [ref=e29]:
      - generic [ref=e30]:
        - heading "Complete Your Order" [level=4] [ref=e31]
        - generic [ref=e32]:
          - paragraph [ref=e33]: Already A Member?
          - generic [ref=e34]:
            - generic [ref=e35]: Phone Number
            - generic [ref=e36]:
              - textbox "Phone Number" [active] [ref=e37]:
                - /placeholder: (555) 555-5555
                - text: "5552088124"
              - group:
                - generic: Phone Number
          - button "Sign In" [ref=e38] [cursor=pointer]
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e41]:
            - heading "How would you like to receive your order?" [level=6] [ref=e42]
            - generic [ref=e44]:
              - heading "Choose Service Type" [level=6] [ref=e45]
              - generic [ref=e46]:
                - generic [ref=e49] [cursor=pointer]:
                  - generic [ref=e50]:
                    - img [ref=e52]
                    - heading "Delivery" [level=6] [ref=e54]
                  - generic [ref=e55]:
                    - img [ref=e56]
                    - generic [ref=e59]: 54-64 min
                - generic [ref=e61] [cursor=pointer]:
                  - img [ref=e63]
                  - generic [ref=e65]:
                    - generic [ref=e66]:
                      - img [ref=e68]
                      - heading "Pickup" [level=6] [ref=e70]
                    - generic [ref=e71]:
                      - img [ref=e72]
                      - generic [ref=e75]: 20-25 min
          - generic [ref=e76]:
            - heading "Customer Information" [level=6] [ref=e77]
            - generic [ref=e78]:
              - generic [ref=e80]:
                - generic [ref=e81]:
                  - text: First Name
                  - generic [ref=e82]: "*"
                - generic [ref=e83]:
                  - textbox "First Name" [ref=e84]: Auto
                  - group:
                    - generic: First Name *
              - generic [ref=e86]:
                - generic [ref=e87]:
                  - text: Last Name
                  - generic [ref=e88]: "*"
                - generic [ref=e89]:
                  - textbox "Last Name" [ref=e90]: Lima
                  - group:
                    - generic: Last Name *
              - generic [ref=e92]:
                - generic [ref=e93]:
                  - text: Email Address
                  - generic [ref=e94]: "*"
                - generic [ref=e95]:
                  - textbox "Email Address" [ref=e96]: autouser_lima_9ba36bef@demomailtrap.co
                  - group:
                    - generic: Email Address *
              - generic [ref=e98]:
                - generic:
                  - text: Phone Number
                  - generic: "*"
                - generic [ref=e99]:
                  - textbox "Phone Number" [ref=e100]:
                    - /placeholder: (555) 123-4567
                  - group:
                    - generic: Phone Number *
          - generic [ref=e102]:
            - generic [ref=e103]:
              - checkbox [checked] [ref=e104] [cursor=pointer]
              - paragraph [ref=e105] [cursor=pointer]: Enroll into promotional emails from Boithok Khana Kitchen -
            - generic [ref=e106]:
              - checkbox [checked] [ref=e107] [cursor=pointer]
              - paragraph [ref=e108] [cursor=pointer]: Get promotional texts from Boithok Khana Kitchen -
            - generic [ref=e109]:
              - text: By signing up, you agree to receive email marketing communications from Boithok Khana Kitchen - and our technology partner
              - link "RestauNax" [ref=e110] [cursor=pointer]:
                - /url: https://www.restaunax.com
              - text: and consent to our
              - link "Terms and policies" [ref=e111] [cursor=pointer]:
                - /url: https://order.qa.restaunax.com/boithok-khana-kitchen/terms
              - text: . You may receive email or SMS notifications from us for order updates and account access and can opt out any time.
          - generic [ref=e114]:
            - generic [ref=e115]:
              - generic [ref=e116]:
                - img [ref=e117]
                - generic [ref=e119]: Boithok Khana Kitchen -
              - generic [ref=e120] [cursor=pointer]:
                - switch "Join Program" [ref=e123]
                - generic [ref=e126]: Join Program
            - generic [ref=e127]:
              - generic [ref=e128]:
                - img [ref=e129]
                - generic [ref=e132]:
                  - text: Earn
                  - strong [ref=e133]: 12 points
                  - text: from this order
              - generic [ref=e134]:
                - img [ref=e135]
                - generic [ref=e137]: 1x points per $1
            - generic [ref=e138]:
              - separator [ref=e139]
              - paragraph [ref=e140]: Join the Boithok Khana Kitchen - to start earning points on this and future orders. It's free and instant!
          - generic [ref=e142]:
            - generic [ref=e143]:
              - img [ref=e144]
              - heading "Gift Card" [level=6] [ref=e146]
            - generic [ref=e148]:
              - generic [ref=e149]:
                - generic [ref=e150]: Gift Card Code
                - generic [ref=e152]:
                  - textbox "Gift Card Code" [ref=e153]:
                    - /placeholder: XXXX-XXXX-XXXX-XXXX
                  - group
              - button "Apply" [disabled]
          - generic [ref=e154]:
            - heading "Pickup Information" [level=6] [ref=e155]
            - generic [ref=e156]:
              - heading "Boithok Khana Kitchen -" [level=6] [ref=e157]
              - paragraph [ref=e158]: 1102 Liberty Avenue, Brooklyn, New York, 11208
              - generic [ref=e159]:
                - img [ref=e160]
                - generic [ref=e162]: Pickup Location
          - generic [ref=e163]:
            - heading "Add Tip" [level=6] [ref=e164]
            - group [ref=e165]:
              - button "15%" [pressed] [ref=e166] [cursor=pointer]
              - button "18%" [ref=e167] [cursor=pointer]
              - button "20%" [ref=e168] [cursor=pointer]
              - button "25%" [ref=e169] [cursor=pointer]
              - button "Custom" [ref=e170] [cursor=pointer]
          - generic [ref=e171]:
            - heading "Special Instructions (Optional)" [level=6] [ref=e172]
            - generic [ref=e174]:
              - textbox "Any special requests or dietary restrictions..." [ref=e175]
              - group
          - alert [ref=e177]:
            - img [ref=e179]
            - generic [ref=e181]:
              - paragraph [ref=e182]: Complete Your Information
              - paragraph [ref=e183]: Please fill out all required fields above to proceed with payment.
        - generic [ref=e185]:
          - heading "Order Summary" [level=6] [ref=e186]
          - list [ref=e187]:
            - listitem [ref=e188]:
              - generic [ref=e191]:
                - paragraph [ref=e193]: 1x Automation Burger
                - paragraph [ref=e194]: $12.99
          - separator [ref=e195]
          - generic [ref=e196]:
            - generic [ref=e197]:
              - paragraph [ref=e198]: Subtotal
              - paragraph [ref=e199]: $12.99
            - generic [ref=e200]:
              - paragraph [ref=e201]: Tax
              - generic [ref=e202]: $1.14
            - generic [ref=e203]:
              - paragraph [ref=e204]: Tip
              - paragraph [ref=e205]: $1.95
          - separator [ref=e206]
          - generic [ref=e207]:
            - heading "Total" [level=6] [ref=e208]
            - generic [ref=e209]: $16.08
  - contentinfo [ref=e210]:
    - paragraph [ref=e211]: Boithok Khana Kitchen -
    - generic [ref=e212]:
      - generic [ref=e213]:
        - paragraph [ref=e214]: Powered by
        - link "RestauNax RestauNax" [ref=e215] [cursor=pointer]:
          - /url: https://www.restaunax.com
          - img "RestauNax" [ref=e216]
          - paragraph [ref=e217]: RestauNax
      - paragraph [ref=e218]: "|"
      - generic [ref=e219]:
        - link "Terms" [ref=e220] [cursor=pointer]:
          - /url: https://www.restaunax.com/website-terms
        - paragraph [ref=e221]: "|"
        - link "Privacy" [ref=e222] [cursor=pointer]:
          - /url: https://www.restaunax.com/privacy-policy
```

# Test source

```ts
  1   | import { type Page, type Locator, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Template Lima — cart and checkout.
  5   |  *
  6   |  * Locators are written against Lima's own MUI markup and visible copy, not
  7   |  * ported from pages/customer/*. Wind is Next + Tailwind with different
  8   |  * components, roles and labels; a shared locator set across two UI frameworks
  9   |  * is how a suite becomes brittle. The JOURNEY is what the two have in common,
  10  |  * and that is worth extracting only once both suites exist.
  11  |  */
  12  | export const createLimaCheckoutPage = (page: Page) => {
  13  |   // ── Cart ──────────────────────────────────────────────────────────────────
  14  | 
  15  |   const proceedToCheckoutButton = (): Locator =>
  16  |     page
  17  |       .getByTestId("proceed-to-checkout")
  18  |       .or(page.getByRole("button", { name: /proceed to checkout/i }))
  19  |       .first();
  20  | 
  21  |   const emptyCartMessage = (): Locator =>
  22  |     page.getByText(/cart is empty|no items/i).first();
  23  | 
  24  |   const couponInput = (): Locator =>
  25  |     page.getByPlaceholder(/enter code/i).first();
  26  | 
  27  |   const applyCouponButton = (): Locator =>
  28  |     page.getByRole("button", { name: /^apply$/i }).first();
  29  | 
  30  |   const applyCoupon = async (code: string): Promise<void> => {
> 31  |     await couponInput().fill(code);
      |                         ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  32  |     await applyCouponButton().click();
  33  |   };
  34  | 
  35  |   const goToCheckout = async (): Promise<void> => {
  36  |     await proceedToCheckoutButton().click();
  37  |     await expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });
  38  |   };
  39  | 
  40  |   // ── Checkout ──────────────────────────────────────────────────────────────
  41  | 
  42  |   const field = (label: RegExp): Locator => page.getByLabel(label).first();
  43  | 
  44  |   const fillCustomerInfo = async (info: {
  45  |     firstName: string;
  46  |     lastName: string;
  47  |     email: string;
  48  |     phone: string;
  49  |   }): Promise<void> => {
  50  |     await field(/first name/i).fill(info.firstName);
  51  |     await field(/last name/i).fill(info.lastName);
  52  |     await field(/email/i).fill(info.email);
  53  |     await field(/phone/i).fill(info.phone);
  54  |   };
  55  | 
  56  |   const serviceTypeButton = (type: "PICKUP" | "DELIVERY"): Locator =>
  57  |     page
  58  |       .getByTestId("service-type-button")
  59  |       .filter({ hasText: type === "PICKUP" ? /pickup/i : /delivery/i })
  60  |       .or(
  61  |         page.getByRole("button", {
  62  |           name: type === "PICKUP" ? /pickup/i : /delivery/i,
  63  |         })
  64  |       )
  65  |       .first();
  66  | 
  67  |   const giftCardInput = (): Locator =>
  68  |     page.getByPlaceholder(/XXXX-XXXX-XXXX-XXXX/i).first();
  69  | 
  70  |   /**
  71  |    * The submit button. Lima labels it "Order Now" — the same words the embed
  72  |    * button uses, which is deliberate on their side and a locator hazard on
  73  |    * ours, so scope it to the payment form rather than the whole page.
  74  |    */
  75  |   const placeOrderButton = (): Locator =>
  76  |     page
  77  |       .getByTestId("place-order")
  78  |       .or(page.getByRole("button", { name: /^order now$/i }))
  79  |       .last();
  80  | 
  81  |   /** Total as rendered, for asserting a discount actually moved it. */
  82  |   const readTotal = async (): Promise<number | null> => {
  83  |     const row = page.getByText(/^total/i).first();
  84  |     if ((await row.count()) === 0) return null;
  85  |     const text = await row
  86  |       .locator("xpath=..")
  87  |       .innerText()
  88  |       .catch(() => "");
  89  |     const match = /\$\s?([\d,]+\.\d{2})/.exec(text);
  90  |     return match?.[1] ? parseFloat(match[1].replace(/,/g, "")) : null;
  91  |   };
  92  | 
  93  |   const errorAlert = (): Locator =>
  94  |     page.getByRole("alert").filter({ hasText: /.+/ }).first();
  95  | 
  96  |   const assertOnCheckout = () =>
  97  |     expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });
  98  | 
  99  |   const assertOrderConfirmed = () =>
  100 |     expect(page).toHaveURL(/\/order-confirmation\//, { timeout: 60_000 });
  101 | 
  102 |   return {
  103 |     proceedToCheckoutButton,
  104 |     emptyCartMessage,
  105 |     couponInput,
  106 |     applyCouponButton,
  107 |     applyCoupon,
  108 |     goToCheckout,
  109 |     fillCustomerInfo,
  110 |     serviceTypeButton,
  111 |     giftCardInput,
  112 |     placeOrderButton,
  113 |     readTotal,
  114 |     errorAlert,
  115 |     assertOnCheckout,
  116 |     assertOrderConfirmed,
  117 |   };
  118 | };
  119 | 
  120 | export type LimaCheckoutPage = ReturnType<typeof createLimaCheckoutPage>;
  121 | 
```