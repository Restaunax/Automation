# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/01-menu-browsing.spec.ts >> Customer — Menu Browsing >> TC-184: the ?item= deep link auto-opens that item's modal
- Location: tests/customer/01-menu-browsing.spec.ts:78:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('add-to-cart').or(getByRole('button', { name: /add to cart/i })).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('add-to-cart').or(getByRole('button', { name: /add to cart/i })).first()

```

```yaml
- main:
  - status
  - navigation:
    - img "Boithok Khana Kitchen -"
    - text: Boithok Khana Kitchen -
    - button "Menu"
    - button "Catering"
    - button "Gift Cards"
    - button "Our Story"
    - button "Loyalty"
    - button "Events"
    - button "Gallery"
    - button "More"
    - button "Log in"
    - button
  - heading "Boithok Khana Kitchen - Menu" [level=1]
  - paragraph: Discover our delicious selection of fresh, made-to-order items. Each dish is crafted with care using the finest ingredients.
  - heading "Menu Categories" [level=3]
  - navigation:
    - button "Appetizers(1)"
    - button "Entrees(2)"
    - button "Burgers & Sandwiches(3)"
    - button "Sides(1)"
    - button "Desserts(1)"
    - button "ZZ Probe Img(1)"
    - button "ZZ Probe Img(1)"
    - button "Automation Items(1)"
    - button "Automation Menu Promo 8605364e(6)"
    - button "Automation Menu Scenarios 001dc802(13)"
    - button "Automation Menu Try 850281ed(4)"
    - button "Automation Menu Scenario Pizzas 001dc802(2)"
  - heading "Today's Deals" [level=2]
  - text: Save 15%
  - heading "Solo Delight Combo" [level=3]
  - paragraph: A perfect meal just for you!
  - text: "Includes: 1x Philly Cheesesteak 1x Loaded Fries $20.68 $17.58"
  - button "View Deal"
  - text: Save 15%
  - heading "Family Feast Special" [level=3]
  - paragraph: A hearty meal for the whole family to enjoy!
  - text: "Includes: 1x Chicken Wings 1x Build Your Burger 1x Build Your Burger +1 more $61.02 $51.87"
  - button "View Deal"
  - heading "Appetizers" [level=2]
  - link "Chicken Wings Chicken Wings $15.51 Crispy chicken wings tossed in your favorite sauce Customizable • 5 options Add to Cart":
    - /url: /menu/chicken-wings
    - img "Chicken Wings"
    - heading "Chicken Wings" [level=3]
    - text: $15.51
    - paragraph: Crispy chicken wings tossed in your favorite sauce
    - text: Customizable • 5 options Add to Cart
  - heading "Entrees" [level=2]
  - link "Loaded Mac & Cheese Loaded Mac & Cheese $11.37 Creamy, cheesy macaroni with your choice of mix-ins Customizable • 4 options Add to Cart":
    - /url: /menu/loaded-mac-cheese
    - img "Loaded Mac & Cheese"
    - heading "Loaded Mac & Cheese" [level=3]
    - text: $11.37
    - paragraph: Creamy, cheesy macaroni with your choice of mix-ins
    - text: Customizable • 4 options Add to Cart
  - link "Fish & Chips Fish & Chips $16.55 Beer-battered cod with crispy fries and tartar sauce Customizable • 4 options Add to Cart":
    - /url: /menu/fish-chips
    - img "Fish & Chips"
    - heading "Fish & Chips" [level=3]
    - text: $16.55
    - paragraph: Beer-battered cod with crispy fries and tartar sauce
    - text: Customizable • 4 options Add to Cart
  - heading "Burgers & Sandwiches" [level=2]
  - link "Build Your Burger Build Your Burger $14.48 Start with our 1/3 lb Angus beef patty and customize every detail Customizable • 8 options Add to Cart":
    - /url: /menu/build-your-burger
    - img "Build Your Burger"
    - heading "Build Your Burger" [level=3]
    - text: $14.48
    - paragraph: Start with our 1/3 lb Angus beef patty and customize every detail
    - text: Customizable • 8 options Add to Cart
  - link "Philly Cheesesteak Philly Cheesesteak $13.44 Thinly sliced steak with melted cheese on a hoagie roll Customizable • 5 options Add to Cart":
    - /url: /menu/philly-cheesesteak
    - img "Philly Cheesesteak"
    - heading "Philly Cheesesteak" [level=3]
    - text: $13.44
    - paragraph: Thinly sliced steak with melted cheese on a hoagie roll
    - text: Customizable • 5 options Add to Cart
  - link "Triple Decker Club Triple Decker Club $14.48 Classic club sandwich with turkey, bacon, and all the fixings Customizable • 4 options Add to Cart":
    - /url: /menu/triple-decker-club
    - img "Triple Decker Club"
    - heading "Triple Decker Club" [level=3]
    - text: $14.48
    - paragraph: Classic club sandwich with turkey, bacon, and all the fixings
    - text: Customizable • 4 options Add to Cart
  - heading "Sides" [level=2]
  - link "Loaded Fries Loaded Fries $7.23 Crispy golden fries with your choice of toppings Customizable • 2 options Add to Cart":
    - /url: /menu/loaded-fries
    - img "Loaded Fries"
    - heading "Loaded Fries" [level=3]
    - text: $7.23
    - paragraph: Crispy golden fries with your choice of toppings
    - text: Customizable • 2 options Add to Cart
  - heading "Desserts" [level=2]
  - link "Build Your Sundae Build Your Sundae $8.27 Premium ice cream with your choice of toppings and sauces Customizable • 4 options Add to Cart":
    - /url: /menu/build-your-sundae
    - img "Build Your Sundae"
    - heading "Build Your Sundae" [level=3]
    - text: $8.27
    - paragraph: Premium ice cream with your choice of toppings and sauces
    - text: Customizable • 4 options Add to Cart
  - heading "ZZ Probe Img" [level=2]
  - link "ZZ Probe Img Item ZZ Probe Img Item $3.00 Add to Cart":
    - /url: /menu/zz-probe-img-item
    - img "ZZ Probe Img Item"
    - heading "ZZ Probe Img Item" [level=3]
    - text: $3.00 Add to Cart
  - heading "ZZ Probe Img" [level=2]
  - link "ZZ Probe Img Item ZZ Probe Img Item $3.00 Add to Cart":
    - /url: /menu/zz-probe-img-item
    - img "ZZ Probe Img Item"
    - heading "ZZ Probe Img Item" [level=3]
    - text: $3.00 Add to Cart
  - heading "Automation Items" [level=2]
  - link "Automation Burger Automation Burger $12.99 Add to Cart":
    - /url: /menu/automation-burger
    - img "Automation Burger"
    - heading "Automation Burger" [level=3]
    - text: $12.99 Add to Cart
  - heading "Automation Menu Promo 8605364e" [level=2]
  - link "AUTO Promo Wrap 8605364e AUTO Promo Wrap 8605364e $10.00 $5.00 Half price Add to Cart":
    - /url: /menu/auto-promo-wrap-8605364e
    - img "AUTO Promo Wrap 8605364e"
    - heading "AUTO Promo Wrap 8605364e" [level=3]
    - text: $10.00 $5.00 Half price Add to Cart
  - link "AUTO Promo Bowl 8605364e AUTO Promo Bowl 8605364e $12.00 Add to Cart":
    - /url: /menu/auto-promo-bowl-8605364e
    - img "AUTO Promo Bowl 8605364e"
    - heading "AUTO Promo Bowl 8605364e" [level=3]
    - text: $12.00 Add to Cart
  - link "AUTO Promo Cookie 8605364e AUTO Promo Cookie 8605364e $4.00 Add to Cart":
    - /url: /menu/auto-promo-cookie-8605364e
    - img "AUTO Promo Cookie 8605364e"
    - heading "AUTO Promo Cookie 8605364e" [level=3]
    - text: $4.00 Add to Cart
  - link "AUTO Promo Salad 8605364e AUTO Promo Salad 8605364e $6.00 Add to Cart":
    - /url: /menu/auto-promo-salad-8605364e
    - img "AUTO Promo Salad 8605364e"
    - heading "AUTO Promo Salad 8605364e" [level=3]
    - text: $6.00 Add to Cart
  - link "AUTO Promo Fries 8605364e AUTO Promo Fries 8605364e $3.00 Add to Cart":
    - /url: /menu/auto-promo-fries-8605364e
    - img "AUTO Promo Fries 8605364e"
    - heading "AUTO Promo Fries 8605364e" [level=3]
    - text: $3.00 Add to Cart
  - link "AUTO Promo Soda 8605364e AUTO Promo Soda 8605364e $2.00 Add to Cart":
    - /url: /menu/auto-promo-soda-8605364e
    - img "AUTO Promo Soda 8605364e"
    - heading "AUTO Promo Soda 8605364e" [level=3]
    - text: $2.00 Add to Cart
  - heading "Automation Menu Scenarios 001dc802" [level=2]
  - link "AUTO Scn Wings 001dc802 AUTO Scn Wings 001dc802 $10.00 Automation promotion scenario item Customizable • 1 options Add to Cart":
    - /url: /menu/auto-scn-wings-001dc802
    - img "AUTO Scn Wings 001dc802"
    - heading "AUTO Scn Wings 001dc802" [level=3]
    - text: $10.00
    - paragraph: Automation promotion scenario item
    - text: Customizable • 1 options Add to Cart
  - link "AUTO Scn Fries 001dc802 AUTO Scn Fries 001dc802 $4.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-fries-001dc802
    - img "AUTO Scn Fries 001dc802"
    - heading "AUTO Scn Fries 001dc802" [level=3]
    - text: $4.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Chicken Gyro 001dc802 AUTO Scn Chicken Gyro 001dc802 $11.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-chicken-gyro-001dc802
    - img "AUTO Scn Chicken Gyro 001dc802"
    - heading "AUTO Scn Chicken Gyro 001dc802" [level=3]
    - text: $11.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Lamb Gyro 001dc802 AUTO Scn Lamb Gyro 001dc802 $12.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-lamb-gyro-001dc802
    - img "AUTO Scn Lamb Gyro 001dc802"
    - heading "AUTO Scn Lamb Gyro 001dc802" [level=3]
    - text: $12.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Beef Gyro 001dc802 AUTO Scn Beef Gyro 001dc802 $13.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-beef-gyro-001dc802
    - img "AUTO Scn Beef Gyro 001dc802"
    - heading "AUTO Scn Beef Gyro 001dc802" [level=3]
    - text: $13.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Rice Bowl 001dc802 AUTO Scn Rice Bowl 001dc802 $11.99 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-rice-bowl-001dc802
    - img "AUTO Scn Rice Bowl 001dc802"
    - heading "AUTO Scn Rice Bowl 001dc802" [level=3]
    - text: $11.99
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Beef Patty 001dc802 AUTO Scn Beef Patty 001dc802 $4.99 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-beef-patty-001dc802
    - img "AUTO Scn Beef Patty 001dc802"
    - heading "AUTO Scn Beef Patty 001dc802" [level=3]
    - text: $4.99
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Garlic Knots 001dc802 AUTO Scn Garlic Knots 001dc802 $3.99 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-garlic-knots-001dc802
    - img "AUTO Scn Garlic Knots 001dc802"
    - heading "AUTO Scn Garlic Knots 001dc802" [level=3]
    - text: $3.99
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Baklava 001dc802 AUTO Scn Baklava 001dc802 $5.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-baklava-001dc802
    - img "AUTO Scn Baklava 001dc802"
    - heading "AUTO Scn Baklava 001dc802" [level=3]
    - text: $5.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Sub 001dc802 AUTO Scn Sub 001dc802 $9.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-sub-001dc802
    - img "AUTO Scn Sub 001dc802"
    - heading "AUTO Scn Sub 001dc802" [level=3]
    - text: $9.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Cola 001dc802 AUTO Scn Cola 001dc802 $2.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-cola-001dc802
    - img "AUTO Scn Cola 001dc802"
    - heading "AUTO Scn Cola 001dc802" [level=3]
    - text: $2.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Lemonade 001dc802 AUTO Scn Lemonade 001dc802 $3.00 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-lemonade-001dc802
    - img "AUTO Scn Lemonade 001dc802"
    - heading "AUTO Scn Lemonade 001dc802" [level=3]
    - text: $3.00
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - link "AUTO Scn Iced Tea 001dc802 AUTO Scn Iced Tea 001dc802 $2.50 Automation promotion scenario item Add to Cart":
    - /url: /menu/auto-scn-iced-tea-001dc802
    - img "AUTO Scn Iced Tea 001dc802"
    - heading "AUTO Scn Iced Tea 001dc802" [level=3]
    - text: $2.50
    - paragraph: Automation promotion scenario item
    - text: Add to Cart
  - heading "Automation Menu Try 850281ed" [level=2]
  - link "🍽 AUTO Try Chicken Gyro 850281ed $12.00 Add to Cart":
    - /url: /menu/auto-try-chicken-gyro-850281ed
    - text: 🍽
    - heading "AUTO Try Chicken Gyro 850281ed" [level=3]
    - text: $12.00 Add to Cart
  - link "🍽 AUTO Try Lamb Gyro 850281ed $13.00 Add to Cart":
    - /url: /menu/auto-try-lamb-gyro-850281ed
    - text: 🍽
    - heading "AUTO Try Lamb Gyro 850281ed" [level=3]
    - text: $13.00 Add to Cart
  - link "🍽 AUTO Try Soda 850281ed $2.00 Add to Cart":
    - /url: /menu/auto-try-soda-850281ed
    - text: 🍽
    - heading "AUTO Try Soda 850281ed" [level=3]
    - text: $2.00 Add to Cart
  - link "🍽 AUTO Try Cookie 850281ed $4.00 Add to Cart":
    - /url: /menu/auto-try-cookie-850281ed
    - text: 🍽
    - heading "AUTO Try Cookie 850281ed" [level=3]
    - text: $4.00 Add to Cart
  - heading "Automation Menu Scenario Pizzas 001dc802" [level=2]
  - link "AUTO Scn Margherita 001dc802 AUTO Scn Margherita 001dc802 $14.00 Automation promotion scenario item Customizable • 1 options Add to Cart":
    - /url: /menu/auto-scn-margherita-001dc802
    - img "AUTO Scn Margherita 001dc802"
    - heading "AUTO Scn Margherita 001dc802" [level=3]
    - text: $14.00
    - paragraph: Automation promotion scenario item
    - text: Customizable • 1 options Add to Cart
  - link "AUTO Scn Pepperoni 001dc802 AUTO Scn Pepperoni 001dc802 $16.00 Automation promotion scenario item Customizable • 1 options Add to Cart":
    - /url: /menu/auto-scn-pepperoni-001dc802
    - img "AUTO Scn Pepperoni 001dc802"
    - heading "AUTO Scn Pepperoni 001dc802" [level=3]
    - text: $16.00
    - paragraph: Automation promotion scenario item
    - text: Customizable • 1 options Add to Cart
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
  1   | import { type Page, expect } from "@playwright/test";
  2   | 
  3   | // Single source of truth for the storefront host (defaults to the QA Template
  4   | // Wind storefront, wind.restaunax.com — NOT qa.restaunax.com, the marketing site).
  5   | import { TEMPLATE_WIND_URL } from "../../utils/testData";
  6   | 
  7   | export const createCustomerMenuPage = (page: Page) => {
  8   |   const goto = async (restaurantId: string) => {
  9   |     await page.goto(`${TEMPLATE_WIND_URL}/menu?restaurantId=${restaurantId}`, {
  10  |       waitUntil: "domcontentloaded",
  11  |     });
  12  |   };
  13  | 
  14  |   // ?item=<id> is the landing-page deep link: MenuPage auto-opens that item's
  15  |   // modal and scrolls to its group once the menu loads.
  16  |   const gotoWithItem = async (restaurantId: string, itemId: string) => {
  17  |     await page.goto(
  18  |       `${TEMPLATE_WIND_URL}/menu?restaurantId=${restaurantId}&item=${itemId}`,
  19  |       { waitUntil: "domcontentloaded" }
  20  |     );
  21  |   };
  22  | 
  23  |   // Testid-first with legacy fallback (TEST_PLAN → "Locator strategy"):
  24  |   // data-testid=menu-item-card exists in template-wind source; until the QA
  25  |   // deployment carries it, fall back to the item-name <h3> heading (the click
  26  |   // bubbles up to the card's onClick either way).
  27  |   const menuItemCard = (name: string) =>
  28  |     page
  29  |       .getByTestId("menu-item-card")
  30  |       .filter({ hasText: name })
  31  |       .or(page.getByRole("heading", { name, exact: true }))
  32  |       .first();
  33  | 
  34  |   const floatingCartButton = () =>
  35  |     page
  36  |       .getByTestId("view-cart")
  37  |       .or(page.getByRole("button", { name: /view cart/i }))
  38  |       .first();
  39  | 
  40  |   const assertPageLoaded = () =>
  41  |     expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });
  42  | 
  43  |   const openItemModal = (itemName: string) => menuItemCard(itemName).click();
  44  | 
  45  |   // ItemModal: source now has role="dialog" + data-testid=item-modal, but the
  46  |   // QA deployment may predate both — the "Add to Cart — $…" button only
  47  |   // exists while the modal is open, so it stays the modal-open signal that
  48  |   // works on every deployment.
  49  |   const assertItemModalOpen = () =>
> 50  |     expect(addToCartButton()).toBeVisible({ timeout: 10_000 });
      |                               ^ Error: expect(locator).toBeVisible() failed
  51  | 
  52  |   const addToCartButton = () =>
  53  |     page
  54  |       .getByTestId("add-to-cart")
  55  |       .or(page.getByRole("button", { name: /add to cart/i }))
  56  |       .first();
  57  | 
  58  |   const clickAddToCart = () => addToCartButton().click();
  59  | 
  60  |   const assertCartButtonVisible = () =>
  61  |     expect(floatingCartButton()).toBeVisible({ timeout: 10_000 });
  62  | 
  63  |   // On the menu route the floating cart button now navigates straight to
  64  |   // /checkout (MenuPage's router.push("/checkout")) — there is no in-page
  65  |   // CartSummary "Proceed to Checkout" modal on this route anymore, so clicking
  66  |   // View Cart IS the navigation.
  67  |   const openCart = () => floatingCartButton().click();
  68  | 
  69  |   const proceedToCheckout = async () => {
  70  |     // openCart()'s click already routes here. It's a client-side navigation, so
  71  |     // the RestaurantProvider (mounted in the root layout) keeps the restaurant
  72  |     // resolved and the checkout form renders even without the ?restaurantId=
  73  |     // query param — only the full-page seedCart path needs it. Confirm arrival.
  74  |     await page.waitForURL(/\/checkout/, { timeout: 15_000 });
  75  |   };
  76  | 
  77  |   /**
  78  |    * /menu with extra query params (`promo`, `dealAdded`, …) on top of the
  79  |    * ?restaurantId= QA override.
  80  |    */
  81  |   const gotoWithParams = async (
  82  |     restaurantId: string,
  83  |     params: Record<string, string>
  84  |   ) => {
  85  |     const q = new URLSearchParams({ restaurantId, ...params });
  86  |     await page.goto(`${TEMPLATE_WIND_URL}/menu?${q.toString()}`, {
  87  |       waitUntil: "domcontentloaded",
  88  |     });
  89  |   };
  90  | 
  91  |   // ── Automatic sale on an item (MenuItemCard: struck regular price +
  92  |   // shown price + label, from the public menu's `promotion` field). The card
  93  |   // root is the testid'd card holding the item's name.
  94  |   const itemCard = (name: string) =>
  95  |     page.getByTestId("menu-item-card").filter({
  96  |       has: page.getByRole("heading", { name, exact: true }),
  97  |     });
  98  |   const cardRegularPrice = (name: string) =>
  99  |     itemCard(name).getByTestId("regular-price");
  100 |   const cardSaleLabel = (name: string) =>
  101 |     itemCard(name).getByTestId("sale-label");
  102 | 
  103 |   // ── "Keep shopping" from a deal builder: a one-shot confirmation
  104 |   // ("<deal> added to your cart", read from the cart) on /menu.
  105 |   const dealAddedConfirmation = () =>
  106 |     page.getByTestId("deal-added-confirmation");
  107 | 
  108 |   /** A deal on the menu's "Today's Deals" list, any deal type (by its name heading). */
  109 |   const dealHeading = (dealName: string) =>
  110 |     page.getByRole("heading", { name: dealName, exact: true });
  111 | 
  112 |   return {
  113 |     goto,
  114 |     gotoWithItem,
  115 |     gotoWithParams,
  116 |     itemCard,
  117 |     cardRegularPrice,
  118 |     cardSaleLabel,
  119 |     dealAddedConfirmation,
  120 |     dealHeading,
  121 |     menuItemCard,
  122 |     floatingCartButton,
  123 |     assertPageLoaded,
  124 |     openItemModal,
  125 |     assertItemModalOpen,
  126 |     addToCartButton,
  127 |     clickAddToCart,
  128 |     assertCartButtonVisible,
  129 |     openCart,
  130 |     proceedToCheckout,
  131 |   };
  132 | };
  133 | 
```