# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/21-supply-shop-quotes-and-stands.spec.ts >> Owner — Print Shop: quotes and stands that come with the cards @supply-shop >> TC-1018: the cart shows the stands under the cards, one per card, with no Remove of their own
- Location: tests/dashboard/owner/21-supply-shop-quotes-and-stands.spec.ts:333:7

# Error details

```
TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - generic [ref=e9]:
            - img [ref=e10]
            - generic [ref=e12]: LOCATION
          - generic "Automation Owner2 Store dc6064da — Miami — Supply Shop" [ref=e13]
        - generic [ref=e15]:
          - generic [ref=e17]:
            - img [ref=e18]
            - generic [ref=e20]:
              - paragraph [ref=e21]: Automation Owner2 Store dc6064da
              - generic [ref=e22]: Miami, FL
          - button "Account settings" [ref=e24] [cursor=pointer]:
            - generic [ref=e25]: A
          - button "Select Language" [ref=e27] [cursor=pointer]:
            - img [ref=e29]
            - text: EN
          - button [ref=e35] [cursor=pointer]:
            - img [ref=e36]
    - navigation "mailbox folders" [ref=e38]:
      - generic [ref=e40]:
        - button "Collapse sidebar" [ref=e42] [cursor=pointer]:
          - img [ref=e43]
        - generic [ref=e46]:
          - button "Today" [ref=e47] [cursor=pointer]:
            - img [ref=e49]
            - paragraph [ref=e51]: Today
          - button "Analytics" [ref=e52] [cursor=pointer]:
            - img [ref=e54]
            - paragraph [ref=e56]: Analytics
          - button "Orders" [ref=e57] [cursor=pointer]:
            - img [ref=e59]
            - paragraph [ref=e61]: Orders
          - button "Menu" [ref=e62] [cursor=pointer]:
            - img [ref=e64]
            - paragraph [ref=e66]: Menu
          - button "Customers" [ref=e67] [cursor=pointer]:
            - img [ref=e69]
            - paragraph [ref=e71]: Customers
          - button "Billing" [ref=e72] [cursor=pointer]:
            - img [ref=e74]
            - paragraph [ref=e76]: Billing
          - button "Image Library" [ref=e77] [cursor=pointer]:
            - img [ref=e79]
            - paragraph [ref=e81]: Image Library
          - button "Store Settings" [ref=e82] [cursor=pointer]:
            - img [ref=e84]
            - paragraph [ref=e86]: Store Settings
          - button "Store Operations" [ref=e88] [cursor=pointer]:
            - img [ref=e90]
            - paragraph [ref=e92]: Store Operations
            - img [ref=e94]
          - button "Job Applications" [ref=e96] [cursor=pointer]:
            - img [ref=e98]
            - paragraph [ref=e100]: Job Applications
          - 'button "Menu TVs Add-on: TV menu boards from your menu" [ref=e101] [cursor=pointer]':
            - img [ref=e103]
            - paragraph [ref=e105]: Menu TVs
            - 'img "Add-on: TV menu boards from your menu" [ref=e107]':
              - img [ref=e108]
          - button "Restaurant Staff" [ref=e110] [cursor=pointer]:
            - img [ref=e112]
            - paragraph [ref=e114]: Restaurant Staff
          - button "Books & taxes" [ref=e115] [cursor=pointer]:
            - img [ref=e117]
            - paragraph [ref=e119]: Books & taxes
          - 'button "RestauNax Voice Add-on: AI answers your phone" [ref=e120] [cursor=pointer]':
            - img [ref=e122]
            - paragraph [ref=e125]: RestauNax Voice
            - 'img "Add-on: AI answers your phone" [ref=e127]':
              - img [ref=e128]
          - button "Google reviews" [ref=e130] [cursor=pointer]:
            - img [ref=e132]
            - paragraph [ref=e134]: Google reviews
          - button "Promotions" [ref=e136] [cursor=pointer]:
            - img [ref=e138]
            - paragraph [ref=e140]: Promotions
            - img [ref=e142]
          - button "Gift cards" [ref=e144] [cursor=pointer]:
            - img [ref=e146]
            - paragraph [ref=e148]: Gift cards
          - button "Supply Shop" [ref=e149] [cursor=pointer]:
            - img [ref=e151]
            - paragraph [ref=e153]: Supply Shop
          - button "Social Media" [ref=e155] [cursor=pointer]:
            - img [ref=e157]
            - paragraph [ref=e159]: Social Media
            - img [ref=e161]
          - button "RestauNax Products" [ref=e163] [cursor=pointer]:
            - img [ref=e165]
            - paragraph [ref=e167]: RestauNax Products
        - button "Owner Settings" [ref=e170] [cursor=pointer]:
          - img [ref=e172]
          - paragraph [ref=e175]: Owner Settings
    - main [ref=e176]:
      - generic [ref=e178]:
        - img [ref=e179]
        - paragraph [ref=e181]:
          - generic [ref=e182]: "Managing:"
          - text: Automation Owner2 Store dc6064da
      - generic [ref=e184]:
        - generic [ref=e185]:
          - button "Back to the shop" [ref=e186] [cursor=pointer]
          - heading "Table QR cards" [level=5] [ref=e187]
          - paragraph [ref=e188]: Guests scan the card on their table, order, and pay on their phone. Set up your cards, check the proof PDF, and we'll print them and ship them to you.
        - heading "1. How it sits on the table" [level=6] [ref=e189]
        - generic [ref=e190]:
          - radiogroup "1. How it sits on the table" [ref=e191]:
            - radio "Folded table tent One sheet of card folded into a triangle that stands on its own, the same card on both sides. Nothing to assemble. Stands on its own — no stand needed $1.50–$2.25 each" [ref=e192] [cursor=pointer]:
              - img [ref=e194]
              - heading "Folded table tent" [level=6] [ref=e196]
              - paragraph [ref=e197]: One sheet of card folded into a triangle that stands on its own, the same card on both sides. Nothing to assemble.
              - paragraph [ref=e198]: Stands on its own — no stand needed
              - paragraph [ref=e199]: $1.50–$2.25 each
            - radio "Card in a clear stand A flat 4 × 6 in card in a slanted acrylic holder that keeps it dry. Reprint the card without new stands. Comes with a clear stand for each card $6.50–$7.82 each with its stand" [checked] [ref=e200] [cursor=pointer]:
              - img [ref=e202]
              - heading "Card in a clear stand" [level=6] [ref=e204]
              - paragraph [ref=e205]: A flat 4 × 6 in card in a slanted acrylic holder that keeps it dry. Reprint the card without new stands.
              - paragraph [ref=e206]: Comes with a clear stand for each card
              - paragraph [ref=e207]: $6.50–$7.82 each with its stand
            - radio "Premium acrylic sign Your design printed straight onto a 7 × 5 in acrylic panel with its own base. The longest-lasting option. Acrylic sign included $22.00–$33.00 each" [ref=e208] [cursor=pointer]:
              - img [ref=e210]
              - heading "Premium acrylic sign" [level=6] [ref=e213]
              - paragraph [ref=e214]: Your design printed straight onto a 7 × 5 in acrylic panel with its own base. The longest-lasting option.
              - paragraph [ref=e215]: Acrylic sign included
              - paragraph [ref=e216]: $22.00–$33.00 each
          - button "Already have stands? Order replacement cards" [ref=e217] [cursor=pointer]
        - generic [ref=e218]:
          - heading "2. Design" [level=6] [ref=e219]
          - paragraph [ref=e220]: Each design uses your restaurant's logo and colours. Pick the one you like.
        - alert [ref=e221]:
          - img [ref=e223]
          - generic [ref=e225]:
            - paragraph [ref=e226]: We couldn't use your brand colour on these cards, so each design prints in its own default colours.
            - paragraph [ref=e227]: Contact support to update your logo or brand colours.
        - radiogroup "2. Design" [ref=e228]:
          - radio "Clean White card, number in your brand colour, QR framed below. Suits any restaurant." [checked] [ref=e229] [cursor=pointer]:
            - status [ref=e232]:
              - progressbar "Updating the preview" [ref=e233]:
                - img [ref=e234]
            - generic [ref=e236]:
              - heading "Clean" [level=6] [ref=e237]
              - generic [ref=e238]: White card, number in your brand colour, QR framed below. Suits any restaurant.
          - radio "Bold colour A big block of your brand colour with a large number staff can spot across the room." [ref=e239] [cursor=pointer]:
            - status [ref=e242]:
              - progressbar "Updating the preview" [ref=e243]:
                - img [ref=e244]
            - generic [ref=e246]:
              - heading "Bold colour" [level=6] [ref=e247]
              - generic [ref=e248]: A big block of your brand colour with a large number staff can spot across the room.
          - radio "Dark Black card with a bright QR panel. Suits bars, evening service and dim rooms." [ref=e249] [cursor=pointer]:
            - status [ref=e252]:
              - progressbar "Updating the preview" [ref=e253]:
                - img [ref=e254]
            - generic [ref=e256]:
              - heading "Dark" [level=6] [ref=e257]
              - generic [ref=e258]: Black card with a bright QR panel. Suits bars, evening service and dim rooms.
          - radio "Classic menu Tinted card, double frame and a serif face. Feels like part of your printed menu." [ref=e259] [cursor=pointer]:
            - status [ref=e262]:
              - progressbar "Updating the preview" [ref=e263]:
                - img [ref=e264]
            - generic [ref=e266]:
              - heading "Classic menu" [level=6] [ref=e267]
              - generic [ref=e268]: Tinted card, double frame and a serif face. Feels like part of your printed menu.
        - generic [ref=e269]:
          - heading "Photo and follow code (optional)" [level=6] [ref=e270]
          - paragraph [ref=e271]: Add a photo across the top of the card, and a small follow-us code along the bottom. The order code stays the big one.
          - generic [ref=e272]:
            - button "Add a photo" [ref=e274] [cursor=pointer]:
              - img [ref=e276]
              - text: Add a photo
            - generic [ref=e278]:
              - switch "Add a follow-us code" [ref=e281] [cursor=pointer]
              - generic [ref=e284]: Add a follow-us code
        - separator [ref=e285]
        - heading "Set up cards" [level=6] [ref=e286]
        - generic [ref=e287]:
          - generic [ref=e288]: What do you need?
          - radiogroup "What do you need?" [ref=e289]:
            - generic [ref=e290] [cursor=pointer]:
              - generic [ref=e291]:
                - radio "A card for each table" [ref=e292]
                - img [ref=e294]
              - generic [ref=e296]: A card for each table
            - generic [ref=e297] [cursor=pointer]:
              - generic [ref=e298]:
                - radio "Same card on every table" [checked] [ref=e299]
                - generic [ref=e300]:
                  - img [ref=e301]
                  - img [ref=e303]
              - generic [ref=e305]: Same card on every table
        - generic [ref=e306]:
          - generic [ref=e307]: How many cards?
          - generic [ref=e308]: "Every card is identical: \"Scan to order\" with your restaurant's name and logo, and no table number. Guests who scan it get your normal ordering page, not ordering to their table."
          - generic [ref=e310]:
            - spinbutton "How many cards?" [ref=e311]: "3"
            - group
        - separator [ref=e312]
        - heading "Check and order your cards" [level=6] [ref=e313]
        - paragraph [ref=e314]: 3 identical cards
        - generic [ref=e316]:
          - button "Preview PDF" [disabled]
          - generic [ref=e317]: A full-size proof with the RestauNax mark across it, showing exactly how we'll print your cards.
        - paragraph [ref=e318]: "Table QR cards are printed by RestauNax: order them below and we'll ship them to you."
        - alert [ref=e319]:
          - generic [ref=e320]:
            - generic [ref=e321]: A clear stand comes with each card
            - paragraph [ref=e322]: We'll add 3 clear stands to your cart with your cards. There's nothing else to order.
            - paragraph [ref=e323]: $7.00 each · $5.50 each from 25
        - generic [ref=e324]:
          - heading "Your first card" [level=6] [ref=e325]
          - status [ref=e328]:
            - progressbar "Updating the preview" [ref=e329]:
              - img [ref=e330]
        - paragraph [ref=e332]: Estimated $10.00 – $15.00 for 3 cards, shipping included.
        - 'heading "Estimated total with stands: $40.00 – $49.50, shipping included." [level=6] [ref=e333]'
        - alert [ref=e334]:
          - img [ref=e336]
          - generic [ref=e338]: You won't be charged now. You'll get one final invoice when we place your order.
        - generic [ref=e339]:
          - button "Add to cart" [disabled]
  - button "Open chat" [ref=e340] [cursor=pointer]:
    - img [ref=e341]
```

# Test source

```ts
  1   | import { type Locator, type Page, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Owner — Print Shop, the parts the cart added (RestauNax #1072/#1075/#1100):
  5   |  * a not-yet-launched product's one-click "Request a quote" on its catalog
  6   |  * card, the Table QR cards builder (with its optional photo and follow-us
  7   |  * code, and no free print file since the print-builders release), and the
  8   |  * cart.
  9   |  *
  10  |  * Every name the cart shows arrives translated from the server; the builder
  11  |  * and catalog read the frontend's EN bundle. MUI cards carry no test ids, so
  12  |  * a product's card is found by its title (a MUI subtitle1, rendered as h6).
  13  |  */
  14  | export const createOwnerSupplyCartPage = (page: Page) => {
  15  |   const goto = async (restaurantId: string) => {
  16  |     await page.goto(
  17  |       `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=supply-shop`,
  18  |       { waitUntil: "domcontentloaded" }
  19  |     );
  20  |     await expect(page.getByRole("tab", { name: "Browse" })).toBeVisible({
  21  |       timeout: 20_000,
  22  |     });
  23  |   };
  24  | 
  25  |   // ── Catalog ────────────────────────────────────────────────────────────────
  26  |   /** The whole catalog card (picture, text and the quote button below it). */
  27  |   const catalogCard = (name: string): Locator =>
  28  |     page
  29  |       .locator(".MuiCard-root")
  30  |       .filter({ has: page.getByRole("heading", { name, exact: true }) })
  31  |       .first();
  32  | 
  33  |   const quoteButton = (name: string): Locator =>
  34  |     catalogCard(name).getByRole("button", {
  35  |       name: /^(Request a quote|Requested)$/,
  36  |     });
  37  | 
  38  |   /**
  39  |    * The quote button lies wholly inside its card. It used to be pushed past
  40  |    * the card's clipped bottom edge (RestauNax #1097).
  41  |    */
  42  |   const expectQuoteButtonInsideCard = async (name: string) => {
  43  |     const card = await catalogCard(name).boundingBox();
  44  |     const button = await quoteButton(name).boundingBox();
  45  |     expect(card, `${name}: card has a box`).not.toBeNull();
  46  |     expect(button, `${name}: quote button has a box`).not.toBeNull();
  47  |     const c = card!;
  48  |     const b = button!;
  49  |     expect(b.y, `${name}: button top inside the card`).toBeGreaterThanOrEqual(
  50  |       c.y
  51  |     );
  52  |     expect(
  53  |       b.y + b.height,
  54  |       `${name}: button bottom inside the card`
  55  |     ).toBeLessThanOrEqual(c.y + c.height + 0.5);
  56  |     expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  57  |   };
  58  | 
  59  |   const openProduct = async (name: string) => {
  60  |     await catalogCard(name).locator(".MuiCardActionArea-root").click();
  61  |   };
  62  | 
  63  |   // ── Table QR cards builder ─────────────────────────────────────────────────
  64  |   const sameCardMode = () =>
  65  |     page.getByRole("radio", { name: "Same card on every table" });
  66  |   const sameCount = () => page.locator("#tableqr-same-count");
  67  |   /** A format tile (role radio) by its name, e.g. "Card in a clear stand". */
  68  |   const formatTile = (name: string) =>
  69  |     page.getByRole("radio").filter({ hasText: name });
  70  |   const standsIncluded = () =>
  71  |     page
  72  |       .getByRole("alert")
  73  |       .filter({ hasText: "A clear stand comes with each card" });
  74  |   const standsQuestion = () => page.getByText("Need stands for these?");
  75  |   const addToCartButton = () =>
  76  |     page.getByRole("button", { name: "Add to cart", exact: true });
  77  | 
  78  |   /** "Same card on every table" × `count`, in `format`. */
  79  |   const chooseSameCards = async (count: number, format: string) => {
  80  |     await sameCardMode().check();
  81  |     await sameCount().fill(String(count));
  82  |     await sameCount().blur();
  83  |     await formatTile(format).click();
  84  |     await expect(formatTile(format)).toHaveAttribute("aria-checked", "true");
  85  |   };
  86  | 
  87  |   /** Add to cart, wait for the server, then open the cart from the snackbar. */
  88  |   const addToCartAndOpenCart = async () => {
> 89  |     const added = page.waitForResponse(
      |                        ^ TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"
  90  |       (r) =>
  91  |         /\/table-qr-cards\/cart$/.test(r.url()) &&
  92  |         r.request().method() === "POST"
  93  |     );
  94  |     await addToCartButton().click();
  95  |     const res = await added;
  96  |     expect(res.ok(), `add to cart → ${res.status()}`).toBeTruthy();
  97  |     await page.getByRole("button", { name: "View cart" }).click();
  98  |     await expect(
  99  |       page.getByRole("heading", { name: "Your cart" })
  100 |     ).toBeVisible();
  101 |   };
  102 | 
  103 |   // ── Builder: proof only, ordered to print ──────────────────────────────────
  104 |   const actionsTitle = () =>
  105 |     page.getByText("Check and order your cards", { exact: true });
  106 |   const previewPdfButton = () =>
  107 |     page.getByRole("button", { name: "Preview PDF", exact: true });
  108 |   /** Gone since the print-builders release: owners order their cards. */
  109 |   const selfPrintButton = () =>
  110 |     page.getByRole("button", { name: "Download and print myself" });
  111 |   const orderToPrintNote = () =>
  112 |     page.getByText(
  113 |       "Table QR cards are printed by RestauNax: order them below and we'll ship them to you.",
  114 |       { exact: true }
  115 |     );
  116 | 
  117 |   // ── Builder: photo and follow code (optional) ──────────────────────────────
  118 |   const extrasTitle = () =>
  119 |     page.getByText("Photo and follow code (optional)", { exact: true });
  120 |   const addPhotoButton = () =>
  121 |     page.getByRole("button", { name: "Add a photo", exact: true });
  122 |   /** The photo picker side sheet's two sources. */
  123 |   const photoSourceTab = (name: "Your photos" | "Menu items") =>
  124 |     page.getByRole("tab", { name, exact: true });
  125 |   const menuSearch = () => page.getByLabel("Search your menu");
  126 |   const closePhotoPicker = () =>
  127 |     page.getByRole("button", { name: "Cancel", exact: true }).click();
  128 |   const followSwitch = () =>
  129 |     page.getByRole("switch", { name: "Add a follow-us code" });
  130 |   /** A platform toggle; its name carries the handle or "Not added yet". */
  131 |   const platformToggle = (platform: "Instagram" | "Facebook" | "TikTok") =>
  132 |     page.getByRole("button", { name: new RegExp(`^${platform}\\b`) });
  133 |   const followLinkInput = () => page.locator("#follow-link");
  134 |   const saveFollowLinkButton = () =>
  135 |     page.getByRole("button", { name: "Save", exact: true });
  136 | 
  137 |   // ── Cart ───────────────────────────────────────────────────────────────────
  138 |   /** One cart line's card, by the start of its name. */
  139 |   const cartLine = (namePrefix: string): Locator =>
  140 |     page
  141 |       .locator(".MuiCard-root")
  142 |       .filter({
  143 |         has: page.getByText(new RegExp(`^${namePrefix}`), { exact: false }),
  144 |       })
  145 |       .first();
  146 | 
  147 |   return {
  148 |     goto,
  149 |     catalogCard,
  150 |     quoteButton,
  151 |     expectQuoteButtonInsideCard,
  152 |     openProduct,
  153 |     sameCardMode,
  154 |     sameCount,
  155 |     formatTile,
  156 |     standsIncluded,
  157 |     standsQuestion,
  158 |     addToCartButton,
  159 |     chooseSameCards,
  160 |     addToCartAndOpenCart,
  161 |     actionsTitle,
  162 |     previewPdfButton,
  163 |     selfPrintButton,
  164 |     orderToPrintNote,
  165 |     extrasTitle,
  166 |     addPhotoButton,
  167 |     photoSourceTab,
  168 |     menuSearch,
  169 |     closePhotoPicker,
  170 |     followSwitch,
  171 |     platformToggle,
  172 |     followLinkInput,
  173 |     saveFollowLinkButton,
  174 |     cartLine,
  175 |   };
  176 | };
  177 | 
  178 | export type OwnerSupplyCartPage = ReturnType<typeof createOwnerSupplyCartPage>;
  179 | 
```