# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/journey/06-the-books.spec.ts >> Journey 6 — the books (partner restaurants, read-only) >> TC-1032: New Restaurant — Overview names the Xero company; recent days are posted to Xero, balanced
- Location: tests/dashboard/journey/06-the-books.spec.ts:375:7

# Error details

```
Error: {"error":"FEATURE_NOT_ENTITLED","message":"This restaurant's subscription does not include the ACCOUNTING_SYNC feature.","feature":"ACCOUNTING_SYNC"}

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 403
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
          - generic "Books & taxes" [ref=e13]
        - generic [ref=e15]:
          - generic [ref=e18]:
            - combobox [ref=e19] [cursor=pointer]:
              - generic [ref=e20]:
                - img [ref=e21]
                - paragraph [ref=e23]: my 2 store — North Port, Florida
            - textbox: 1f5d8402-18ef-419c-9203-1a5a02ad541c
            - img
            - group
          - button "Account settings" [ref=e25] [cursor=pointer]:
            - generic [ref=e26]: R
          - button "Select Language" [ref=e28] [cursor=pointer]:
            - img [ref=e30]
            - text: EN
          - button [ref=e36] [cursor=pointer]:
            - img [ref=e37]
    - navigation "mailbox folders" [ref=e39]:
      - generic [ref=e41]:
        - button "Collapse sidebar" [ref=e43] [cursor=pointer]:
          - img [ref=e44]
        - generic [ref=e47]:
          - button "Today" [ref=e48] [cursor=pointer]:
            - img [ref=e50]
            - paragraph [ref=e52]: Today
          - button "Analytics" [ref=e53] [cursor=pointer]:
            - img [ref=e55]
            - paragraph [ref=e57]: Analytics
          - button "Orders" [ref=e58] [cursor=pointer]:
            - img [ref=e60]
            - paragraph [ref=e62]: Orders
          - button "Menu" [ref=e63] [cursor=pointer]:
            - img [ref=e65]
            - paragraph [ref=e67]: Menu
          - button "Customers" [ref=e68] [cursor=pointer]:
            - img [ref=e70]
            - paragraph [ref=e72]: Customers
          - button "Billing" [ref=e73] [cursor=pointer]:
            - img [ref=e75]
            - paragraph [ref=e77]: Billing
          - button "Image Library" [ref=e78] [cursor=pointer]:
            - img [ref=e80]
            - paragraph [ref=e82]: Image Library
          - button "Store Settings" [ref=e83] [cursor=pointer]:
            - img [ref=e85]
            - paragraph [ref=e87]: Store Settings
          - button "Store Operations" [ref=e89] [cursor=pointer]:
            - img [ref=e91]
            - paragraph [ref=e93]: Store Operations
            - img [ref=e95]
          - button "Job Applications" [ref=e97] [cursor=pointer]:
            - img [ref=e99]
            - paragraph [ref=e101]: Job Applications
          - 'button "Menu TVs Add-on: TV menu boards from your menu" [ref=e102] [cursor=pointer]':
            - img [ref=e104]
            - paragraph [ref=e106]: Menu TVs
            - 'img "Add-on: TV menu boards from your menu" [ref=e108]':
              - img [ref=e109]
          - button "Restaurant Staff" [ref=e111] [cursor=pointer]:
            - img [ref=e113]
            - paragraph [ref=e115]: Restaurant Staff
          - button "Books & taxes" [ref=e116] [cursor=pointer]:
            - img [ref=e118]
            - paragraph [ref=e120]: Books & taxes
          - 'button "RestauNax Voice Add-on: AI answers your phone" [ref=e121] [cursor=pointer]':
            - img [ref=e123]
            - paragraph [ref=e126]: RestauNax Voice
            - 'img "Add-on: AI answers your phone" [ref=e128]':
              - img [ref=e129]
          - button "Google reviews" [ref=e131] [cursor=pointer]:
            - img [ref=e133]
            - paragraph [ref=e135]: Google reviews
          - button "Promotions" [ref=e137] [cursor=pointer]:
            - img [ref=e139]
            - paragraph [ref=e141]: Promotions
            - img [ref=e143]
          - button "Gift cards" [ref=e145] [cursor=pointer]:
            - img [ref=e147]
            - paragraph [ref=e149]: Gift cards
          - button "Supply Shop" [ref=e150] [cursor=pointer]:
            - img [ref=e152]
            - paragraph [ref=e154]: Supply Shop
          - button "Social Media" [ref=e156] [cursor=pointer]:
            - img [ref=e158]
            - paragraph [ref=e160]: Social Media
            - img [ref=e162]
          - button "RestauNax Products" [ref=e164] [cursor=pointer]:
            - img [ref=e166]
            - paragraph [ref=e168]: RestauNax Products
        - button "Owner Settings" [ref=e171] [cursor=pointer]:
          - img [ref=e173]
          - paragraph [ref=e176]: Owner Settings
    - main [ref=e177]:
      - generic [ref=e179]:
        - img [ref=e180]
        - paragraph [ref=e182]:
          - generic [ref=e183]: "Managing:"
          - text: my 2 store
      - generic [ref=e185]:
        - heading "Books & taxes" [level=5] [ref=e186]
        - paragraph [ref=e187]: Your daily sales go to your books by themselves. We tell you only when something needs you.
        - generic [ref=e188]:
          - img [ref=e190] [cursor=pointer]
          - tablist [ref=e194]:
            - tab "Overview" [ref=e195] [cursor=pointer]:
              - img [ref=e196]
              - text: Overview
            - tab "Package for your accountant" [ref=e198] [cursor=pointer]:
              - img [ref=e199]
              - text: Package for your accountant
            - tab "Sales summary" [ref=e201] [cursor=pointer]:
              - img [ref=e202]
              - text: Sales summary
            - tab "Sales tax" [ref=e204] [cursor=pointer]:
              - img [ref=e205]
              - text: Sales tax
            - tab "Payouts" [ref=e208] [cursor=pointer]:
              - img [ref=e209]
              - text: Payouts
            - tab "Your accountant" [ref=e211] [cursor=pointer]:
              - img [ref=e212]
              - text: Your accountant
            - tab "Books" [ref=e214] [cursor=pointer]:
              - img [ref=e215]
              - text: Books
            - tab "Card deposits" [selected] [ref=e217] [cursor=pointer]:
              - img [ref=e218]
              - text: Card deposits
            - tab "Monthly send" [ref=e220] [cursor=pointer]:
              - img [ref=e221]
              - text: Monthly send
            - tab "Year end" [ref=e223] [cursor=pointer]:
              - img [ref=e224]
              - text: Year end
            - tab "Tax calendar" [ref=e227] [cursor=pointer]:
              - img [ref=e228]
              - text: Tax calendar
          - img [ref=e231] [cursor=pointer]
        - generic [ref=e235]:
          - generic [ref=e236]:
            - generic [ref=e237]:
              - heading "Card deposits" [level=6] [ref=e238]
              - paragraph [ref=e239]: Each card deposit Stripe sends to your bank is posted to QuickBooks Online with its fees, so it matches the line on your bank feed in one click.
            - generic [ref=e240]:
              - generic [ref=e241]:
                - generic [ref=e242]: From
                - generic [ref=e244]:
                  - textbox "From" [ref=e245]: 2026-10-21
                  - group
              - generic [ref=e246]:
                - generic [ref=e247]: To
                - generic [ref=e249]:
                  - textbox "To" [ref=e250]: 2026-11-25
                  - group
              - button "Check for new deposits" [ref=e251] [cursor=pointer]
          - generic [ref=e254]:
            - generic [ref=e255]:
              - generic [ref=e256]: File format
              - generic [ref=e257]:
                - combobox "File format" [ref=e258] [cursor=pointer]: RestauNax CSV
                - textbox: restaunax
                - img
                - group
            - button "Download file" [ref=e259] [cursor=pointer]:
              - img [ref=e261]
              - text: Download file
          - table [ref=e263]:
            - rowgroup [ref=e264]:
              - row "Bank date Amount What it carried Status" [ref=e265]:
                - columnheader "Bank date" [ref=e266]
                - columnheader "Amount" [ref=e267]
                - columnheader "What it carried" [ref=e268]
                - columnheader "Status" [ref=e269]
                - columnheader [ref=e270]
            - rowgroup [ref=e271]:
              - row "Tue, Nov 24, 2026 $3,489.67 92 orders · $108.36 in fees Posted View" [ref=e272]:
                - cell "Tue, Nov 24, 2026" [ref=e273]
                - cell "$3,489.67" [ref=e274]
                - cell "92 orders · $108.36 in fees" [ref=e275]:
                  - paragraph [ref=e276]: 92 orders · $108.36 in fees
                - cell "Posted" [ref=e277]:
                  - generic [ref=e279]: Posted
                - cell "View" [ref=e280]:
                  - button "View" [ref=e281] [cursor=pointer]
              - row "Mon, Nov 23, 2026 $2,529.84 76 orders · $77.66 in fees Posted View" [ref=e282]:
                - cell "Mon, Nov 23, 2026" [ref=e283]
                - cell "$2,529.84" [ref=e284]
                - cell "76 orders · $77.66 in fees" [ref=e285]:
                  - paragraph [ref=e286]: 76 orders · $77.66 in fees
                - cell "Posted" [ref=e287]:
                  - generic [ref=e289]: Posted
                - cell "View" [ref=e290]:
                  - button "View" [ref=e291] [cursor=pointer]
              - row "Mon, Nov 23, 2026 $4,465.54 131 orders · $136.96 in fees Posted View" [ref=e292]:
                - cell "Mon, Nov 23, 2026" [ref=e293]
                - cell "$4,465.54" [ref=e294]
                - cell "131 orders · $136.96 in fees" [ref=e295]:
                  - paragraph [ref=e296]: 131 orders · $136.96 in fees
                - cell "Posted" [ref=e297]:
                  - generic [ref=e299]: Posted
                - cell "View" [ref=e300]:
                  - button "View" [ref=e301] [cursor=pointer]
              - row "Thu, Nov 19, 2026 $2,068.26 59 orders · $62.98 in fees Posted View" [ref=e302]:
                - cell "Thu, Nov 19, 2026" [ref=e303]
                - cell "$2,068.26" [ref=e304]
                - cell "59 orders · $62.98 in fees" [ref=e305]:
                  - paragraph [ref=e306]: 59 orders · $62.98 in fees
                - cell "Posted" [ref=e307]:
                  - generic [ref=e309]: Posted
                - cell "View" [ref=e310]:
                  - button "View" [ref=e311] [cursor=pointer]
              - row "Wed, Nov 18, 2026 $4,016.84 109 orders · $119.89 in fees Posted View" [ref=e312]:
                - cell "Wed, Nov 18, 2026" [ref=e313]
                - cell "$4,016.84" [ref=e314]
                - cell "109 orders · $119.89 in fees" [ref=e315]:
                  - paragraph [ref=e316]: 109 orders · $119.89 in fees
                - cell "Posted" [ref=e317]:
                  - generic [ref=e319]: Posted
                - cell "View" [ref=e320]:
                  - button "View" [ref=e321] [cursor=pointer]
              - row "Tue, Nov 17, 2026 $3,406.67 92 orders · $106.13 in fees Posted View" [ref=e322]:
                - cell "Tue, Nov 17, 2026" [ref=e323]
                - cell "$3,406.67" [ref=e324]
                - cell "92 orders · $106.13 in fees" [ref=e325]:
                  - paragraph [ref=e326]: 92 orders · $106.13 in fees
                - cell "Posted" [ref=e327]:
                  - generic [ref=e329]: Posted
                - cell "View" [ref=e330]:
                  - button "View" [ref=e331] [cursor=pointer]
              - row "Mon, Nov 16, 2026 $3,016.48 77 orders · $93.62 in fees Posted View" [ref=e332]:
                - cell "Mon, Nov 16, 2026" [ref=e333]
                - cell "$3,016.48" [ref=e334]
                - cell "77 orders · $93.62 in fees" [ref=e335]:
                  - paragraph [ref=e336]: 77 orders · $93.62 in fees
                - cell "Posted" [ref=e337]:
                  - generic [ref=e339]: Posted
                - cell "View" [ref=e340]:
                  - button "View" [ref=e341] [cursor=pointer]
              - row "Mon, Nov 16, 2026 $4,737.41 132 orders · $144.66 in fees Posted View" [ref=e342]:
                - cell "Mon, Nov 16, 2026" [ref=e343]
                - cell "$4,737.41" [ref=e344]
                - cell "132 orders · $144.66 in fees" [ref=e345]:
                  - paragraph [ref=e346]: 132 orders · $144.66 in fees
                - cell "Posted" [ref=e347]:
                  - generic [ref=e349]: Posted
                - cell "View" [ref=e350]:
                  - button "View" [ref=e351] [cursor=pointer]
              - row "Thu, Nov 12, 2026 $1,889.91 58 orders · $58.16 in fees Posted View" [ref=e352]:
                - cell "Thu, Nov 12, 2026" [ref=e353]
                - cell "$1,889.91" [ref=e354]
                - cell "58 orders · $58.16 in fees" [ref=e355]:
                  - paragraph [ref=e356]: 58 orders · $58.16 in fees
                - cell "Posted" [ref=e357]:
                  - generic [ref=e359]: Posted
                - cell "View" [ref=e360]:
                  - button "View" [ref=e361] [cursor=pointer]
              - row "Thu, Nov 12, 2026 $6,385.72 182 orders · $188.88 in fees Posted View" [ref=e362]:
                - cell "Thu, Nov 12, 2026" [ref=e363]
                - cell "$6,385.72" [ref=e364]
                - cell "182 orders · $188.88 in fees" [ref=e365]:
                  - paragraph [ref=e366]: 182 orders · $188.88 in fees
                - cell "Posted" [ref=e367]:
                  - generic [ref=e369]: Posted
                - cell "View" [ref=e370]:
                  - button "View" [ref=e371] [cursor=pointer]
              - row "Mon, Nov 9, 2026 $2,464.34 66 orders · $71.77 in fees Posted View" [ref=e372]:
                - cell "Mon, Nov 9, 2026" [ref=e373]
                - cell "$2,464.34" [ref=e374]
                - cell "66 orders · $71.77 in fees" [ref=e375]:
                  - paragraph [ref=e376]: 66 orders · $71.77 in fees
                - cell "Posted" [ref=e377]:
                  - generic [ref=e379]: Posted
                - cell "View" [ref=e380]:
                  - button "View" [ref=e381] [cursor=pointer]
              - row "Mon, Nov 9, 2026 $2,955.99 79 orders · $86.04 in fees Posted View" [ref=e382]:
                - cell "Mon, Nov 9, 2026" [ref=e383]
                - cell "$2,955.99" [ref=e384]
                - cell "79 orders · $86.04 in fees" [ref=e385]:
                  - paragraph [ref=e386]: 79 orders · $86.04 in fees
                - cell "Posted" [ref=e387]:
                  - generic [ref=e389]: Posted
                - cell "View" [ref=e390]:
                  - button "View" [ref=e391] [cursor=pointer]
              - row "Tue, Nov 3, 2026 $192.68 4 orders · $5.55 in fees Posted View" [ref=e392]:
                - cell "Tue, Nov 3, 2026" [ref=e393]
                - cell "$192.68" [ref=e394]
                - cell "4 orders · $5.55 in fees" [ref=e395]:
                  - paragraph [ref=e396]: 4 orders · $5.55 in fees
                - cell "Posted" [ref=e397]:
                  - generic [ref=e399]: Posted
                - cell "View" [ref=e400]:
                  - button "View" [ref=e401] [cursor=pointer]
              - row "Mon, Nov 2, 2026 $148.78 4 orders · $4.33 in fees Posted View" [ref=e402]:
                - cell "Mon, Nov 2, 2026" [ref=e403]
                - cell "$148.78" [ref=e404]
                - cell "4 orders · $4.33 in fees" [ref=e405]:
                  - paragraph [ref=e406]: 4 orders · $4.33 in fees
                - cell "Posted" [ref=e407]:
                  - generic [ref=e409]: Posted
                - cell "View" [ref=e410]:
                  - button "View" [ref=e411] [cursor=pointer]
              - row "Mon, Nov 2, 2026 $185.15 5 orders · $5.38 in fees Posted View" [ref=e412]:
                - cell "Mon, Nov 2, 2026" [ref=e413]
                - cell "$185.15" [ref=e414]
                - cell "5 orders · $5.38 in fees" [ref=e415]:
                  - paragraph [ref=e416]: 5 orders · $5.38 in fees
                - cell "Posted" [ref=e417]:
                  - generic [ref=e419]: Posted
                - cell "View" [ref=e420]:
                  - button "View" [ref=e421] [cursor=pointer]
              - row "Thu, Oct 29, 2026 $95.10 3 orders · $3.31 in fees Posted View" [ref=e422]:
                - cell "Thu, Oct 29, 2026" [ref=e423]
                - cell "$95.10" [ref=e424]
                - cell "3 orders · $3.31 in fees" [ref=e425]:
                  - paragraph [ref=e426]: 3 orders · $3.31 in fees
                - cell "Posted" [ref=e427]:
                  - generic [ref=e429]: Posted
                - cell "View" [ref=e430]:
                  - button "View" [ref=e431] [cursor=pointer]
              - row "Wed, Oct 28, 2026 $181.84 3 orders · $6.51 in fees Posted View" [ref=e432]:
                - cell "Wed, Oct 28, 2026" [ref=e433]
                - cell "$181.84" [ref=e434]
                - cell "3 orders · $6.51 in fees" [ref=e435]:
                  - paragraph [ref=e436]: 3 orders · $6.51 in fees
                - cell "Posted" [ref=e437]:
                  - generic [ref=e439]: Posted
                - cell "View" [ref=e440]:
                  - button "View" [ref=e441] [cursor=pointer]
              - row "Tue, Oct 27, 2026 $225.29 4 orders · $6.46 in fees Posted View" [ref=e442]:
                - cell "Tue, Oct 27, 2026" [ref=e443]
                - cell "$225.29" [ref=e444]
                - cell "4 orders · $6.46 in fees" [ref=e445]:
                  - paragraph [ref=e446]: 4 orders · $6.46 in fees
                - cell "Posted" [ref=e447]:
                  - generic [ref=e449]: Posted
                - cell "View" [ref=e450]:
                  - button "View" [ref=e451] [cursor=pointer]
              - row "Mon, Oct 26, 2026 $142.16 2 orders · $4.04 in fees Posted View" [ref=e452]:
                - cell "Mon, Oct 26, 2026" [ref=e453]
                - cell "$142.16" [ref=e454]
                - cell "2 orders · $4.04 in fees" [ref=e455]:
                  - paragraph [ref=e456]: 2 orders · $4.04 in fees
                - cell "Posted" [ref=e457]:
                  - generic [ref=e459]: Posted
                - cell "View" [ref=e460]:
                  - button "View" [ref=e461] [cursor=pointer]
              - row "Mon, Oct 26, 2026 $139.56 4 orders · $4.08 in fees Posted View" [ref=e462]:
                - cell "Mon, Oct 26, 2026" [ref=e463]
                - cell "$139.56" [ref=e464]
                - cell "4 orders · $4.08 in fees" [ref=e465]:
                  - paragraph [ref=e466]: 4 orders · $4.08 in fees
                - cell "Posted" [ref=e467]:
                  - generic [ref=e469]: Posted
                - cell "View" [ref=e470]:
                  - button "View" [ref=e471] [cursor=pointer]
              - row "Thu, Oct 22, 2026 $106.80 3 orders · $3.54 in fees Posted View" [ref=e472]:
                - cell "Thu, Oct 22, 2026" [ref=e473]
                - cell "$106.80" [ref=e474]
                - cell "3 orders · $3.54 in fees" [ref=e475]:
                  - paragraph [ref=e476]: 3 orders · $3.54 in fees
                - cell "Posted" [ref=e477]:
                  - generic [ref=e479]: Posted
                - cell "View" [ref=e480]:
                  - button "View" [ref=e481] [cursor=pointer]
              - row "Wed, Oct 21, 2026 $260.48 6 orders · $8.87 in fees Posted View" [ref=e482]:
                - cell "Wed, Oct 21, 2026" [ref=e483]
                - cell "$260.48" [ref=e484]
                - cell "6 orders · $8.87 in fees" [ref=e485]:
                  - paragraph [ref=e486]: 6 orders · $8.87 in fees
                - cell "Posted" [ref=e487]:
                  - generic [ref=e489]: Posted
                - cell "View" [ref=e490]:
                  - button "View" [ref=e491] [cursor=pointer]
  - button "Open chat" [ref=e492] [cursor=pointer]:
    - img [ref=e493]
```

# Test source

```ts
  1   | /**
  2   |  * 06-the-books.spec.ts — "a week in a restaurant", part 6: the restaurant's
  3   |  * days reach its books and its sales tax service (TC-1028..1025).
  4   |  * docs/COVERAGE_MAP.md §3, phase 7 (Track B). Tag `@partner`.
  5   |  *
  6   |  * READ-ONLY, on the QA restaurants a person connected to the partners'
  7   |  * test systems (restaunax/docs/features/QA_PARTNER_CONNECTIONS.md), whose
  8   |  * days the QA simulator runs every day:
  9   |  *   my 2 store      QuickBooks sandbox + Avalara (Neaj's trial)
  10  |  *   New Restaurant  Xero demo company
  11  |  *   Sally's Pizza   nothing connected — the control
  12  |  * Nothing here connects, posts, sends or changes a setting. It reads with
  13  |  * the admin login (platform staff may view books), in the browser where an
  14  |  * owner would look and through the API for the entries.
  15  |  *
  16  |  * A restaurant that is missing or no longer connected skips its tests, so
  17  |  * a partner's sandbox being reset never fails the run. Days are checked from
  18  |  * two days back, so a day that hasn't posted yet doesn't either.
  19  |  *
  20  |  *   TC-1028 my 2 store: Overview says each connection is working, in words.
  21  |  *   TC-1303 my 2 store: every posted day keeps what was posted as a version
  22  |  *           (W2:A3 history drawer).
  23  |  *   TC-1029 my 2 store: each recent day is posted to QuickBooks as one
  24  |  *           balanced entry with its own number.
  25  |  *   TC-1030 my 2 store: on days without refunds, the tax Avalara has is the
  26  |  *           tax in that day's entry, for the same orders.
  27  |  *   TC-1030b my 2 store: on a day with refunds too (RestauNax #1104, on QA 2026-10-30).
  28  |  *   TC-1031 my 2 store: each posted card deposit's entry balances, its bank
  29  |  *           line is the payout, and the Card deposits tab lists it.
  30  |  *   TC-1032 New Restaurant: Overview names the Xero company; recent days are
  31  |  *           posted to Xero, balanced.
  32  |  *   TC-1033 Sally's Pizza: with nothing connected the page invites setup,
  33  |  *           shows no error, and no day failed.
  34  |  */
  35  | import type { Page } from "@playwright/test";
  36  | import * as allure from "allure-js-commons";
  37  | import { test, expect } from "../../../fixtures/base";
  38  | import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
  39  | import {
  40  |   apiLogin,
  41  |   accountingRaw,
  42  |   adminSearchRestaurantsRaw,
  43  |   type LooseJson,
  44  | } from "../../../utils/apiHelper";
  45  | import { addDays } from "../../../utils/backOfficeApi";
  46  | import { DESKTOP, expectHumanText } from "../../../utils/humanQa";
  47  | 
  48  | const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
  49  | const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
  50  | const PARTNER = { tag: ["@partner"] };
  51  | 
  52  | type Rec = Record<string, LooseJson>;
  53  | const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
  54  | 
  55  | /** "Wednesday, Oct 28" — how the health lines name a day. */
  56  | const longDay = (date: string) =>
  57  |   new Intl.DateTimeFormat("en-US", {
  58  |     weekday: "long",
  59  |     month: "short",
  60  |     day: "numeric",
  61  |     timeZone: "UTC",
  62  |   }).format(new Date(`${date}T12:00:00Z`));
  63  | 
  64  | test.describe.configure({ mode: "serial" });
  65  | 
  66  | test.describe("Journey 6 — the books (partner restaurants, read-only)", () => {
  67  |   test.skip(
  68  |     !ADMIN_EMAIL || !ADMIN_PASSWORD,
  69  |     "ADMIN_EMAIL / ADMIN_PASSWORD not set"
  70  |   );
  71  | 
  72  |   let adminToken = "";
  73  |   const ids: Record<string, string> = {};
  74  |   let session: UiLoginSession | undefined;
  75  |   /** Days two or more days old: the simulator's day has had time to post. */
  76  |   const cutoff = addDays(new Date().toISOString().slice(0, 10), -2);
  77  | 
  78  |   const page = (): Page => {
  79  |     if (!session) throw new Error("no browser session");
  80  |     return session.page;
  81  |   };
  82  |   const books = async (name: string) => {
  83  |     const id = ids[name] ?? "";
  84  |     test.skip(!id, `QA has no restaurant named "${name}"`);
  85  |     const r = await accountingRaw(adminToken, id, "GET", "");
> 86  |     expect(r.status, JSON.stringify(r.data)).toBe(200);
      |                                              ^ Error: {"error":"FEATURE_NOT_ENTITLED","message":"This restaurant's subscription does not include the ACCOUNTING_SYNC feature.","feature":"ACCOUNTING_SYNC"}
  87  |     return { id, integration: r.data.data as Rec };
  88  |   };
  89  |   const recentDays = async (id: string, n = 3) => {
  90  |     const r = await accountingRaw(adminToken, id, "GET", "/days");
  91  |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  92  |     const data = r.data.data as Rec | Rec[];
  93  |     return (Array.isArray(data) ? data : list(data.days))
  94  |       .filter((d) => String(d.businessDate ?? d.date) <= cutoff)
  95  |       .slice(0, n);
  96  |   };
  97  |   const dayEntry = async (id: string, date: string) => {
  98  |     const r = await accountingRaw(adminToken, id, "GET", `/days/${date}`);
  99  |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  100 |     return r.data.data as Rec;
  101 |   };
  102 |   const openBooks = async (id: string, section = "") => {
  103 |     await page().goto(
  104 |       `/restaurant/restaurantId/${id}/restaurantManagement?tab=books-taxes${
  105 |         section ? `&section=${section}` : ""
  106 |       }`,
  107 |       { waitUntil: "domcontentloaded" }
  108 |     );
  109 |     await expect(
  110 |       // exact: the Overview also has "Show more in Books & taxes".
  111 |       page().getByRole("heading", { name: "Books & taxes", exact: true })
  112 |     ).toBeVisible({ timeout: 30_000 });
  113 |   };
  114 |   /** A posted day: one balanced entry, numbered RNX-yymmdd-<rid start>. */
  115 |   const expectPosted = async (
  116 |     id: string,
  117 |     date: string,
  118 |     provider: string
  119 |   ): Promise<Rec> => {
  120 |     const day = await dayEntry(id, date);
  121 |     // W2:A3: a day posted under the older journal rules that changed since
  122 |     // waits for the owner (STALE, rulesChanged) instead of being re-posted
  123 |     // behind their back; it is still in the books.
  124 |     if (day.status === "STALE" && day.rulesChanged === true) {
  125 |       test.info().annotations.push({
  126 |         type: "note",
  127 |         description: `${date} posted under older journal rules; waits for a re-send`,
  128 |       });
  129 |     } else {
  130 |       expect(day.status, `${date}: ${JSON.stringify(day.error)}`).toBe(
  131 |         "POSTED"
  132 |       );
  133 |     }
  134 |     expect(day.provider).toBe(provider);
  135 |     expect(day.externalId, `${date} has no id in the books`).toBeTruthy();
  136 |     expect(String(day.docNumber)).toBe(
  137 |       `RNX-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-${id.slice(0, 4)}`
  138 |     );
  139 |     const entry = day.entry as Rec;
  140 |     expect(entry.balanced, date).toBe(true);
  141 |     expect(entry.debitCents, date).toBe(entry.creditCents);
  142 |     expect(entry.leftoverCents, date).toBe(0);
  143 |     const lines = list(entry.lines);
  144 |     const side = (s: string) =>
  145 |       lines
  146 |         .filter((l) => l.side === s)
  147 |         .reduce((sum, l) => sum + Number(l.cents), 0);
  148 |     expect(side("DEBIT"), date).toBe(Number(entry.debitCents));
  149 |     expect(side("CREDIT"), date).toBe(Number(entry.creditCents));
  150 |     // Lines come with words, never keys.
  151 |     for (const l of lines) expect(String(l.label)).not.toMatch(/^[a-z_]+:/);
  152 |     return entry;
  153 |   };
  154 | 
  155 |   test.beforeAll(async ({ browser }) => {
  156 |     test.setTimeout(120_000);
  157 |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  158 |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  159 |     for (const name of ["my 2 store", "New Restaurant", "Sally's Pizza"]) {
  160 |       const found = await adminSearchRestaurantsRaw(adminToken, name);
  161 |       ids[name] =
  162 |         (found.data.restaurants ?? []).find((r) => r.name === name)?.id ?? "";
  163 |     }
  164 |     session = await loginViaUi(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
  165 |   });
  166 | 
  167 |   test.afterAll(async () => {
  168 |     if (session) await session.context.close().catch(() => {});
  169 |   });
  170 | 
  171 |   test.beforeEach(async () => {
  172 |     await allure.label("feature", "Journey — the books (partners)");
  173 |     await allure.label("severity", "normal");
  174 |     await page().setViewportSize(DESKTOP);
  175 |   });
  176 | 
  177 |   test(
  178 |     "TC-1028: my 2 store — Overview says each connection is working, in words",
  179 |     PARTNER,
  180 |     async () => {
  181 |       const { id, integration } = await books("my 2 store");
  182 |       test.skip(
  183 |         integration.provider !== "QUICKBOOKS" || integration.connected !== true,
  184 |         `my 2 store is no longer connected to QuickBooks (${String(integration.provider)})`
  185 |       );
  186 |       const company = String(integration.companyName);
```