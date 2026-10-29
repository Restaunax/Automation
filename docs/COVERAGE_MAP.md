# RestauNax E2E coverage map

Read-only audit, 2026-10-28. Compares what the platform lets people do with what
the Playwright suite in this repo proves on QA.

- **Suite read at:** `Automation` `origin/qa` (136 spec files under `tests/`).
- **Product read at:** `restaunax` `origin/qa` (`restaunax-frontend/src`,
  `restaunax-backend/src/routes`, `docs/features/**`), `device-in-store`
  `origin/qa` (`src/screens`, `src/components`).
- **Spec paths** below are relative to `Automation/`. **Product paths** are
  relative to `restaunax/` unless they start with `device-in-store/`.
  "Tab `x`" means the owner portal tab with `?tab=x`, defined in
  `restaunax-frontend/src/components/RestaurantManagement/PortalShell.tsx`.

## How to read the coverage column

| Value          | Means                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UI-journey`   | A browser test does what the user does (clicks, fills, saves) and checks the result.                                                                   |
| `UI-load-only` | A browser test opens the screen and checks it renders. Nothing is changed through it.                                                                  |
| `API-only`     | The rules are proven through the same HTTP calls the screen or device makes, but no browser clicks the screen. All of `tests/pos/**` is in this group. |
| `none`         | No spec touches it.                                                                                                                                    |

Two facts shape the whole map:

1. **The POS is never driven as a UI here.** `tests/pos/README.md`: "these drive
   the backend the device talks to rather than a browser UI". Every POS row is
   `API-only` at best. The POS's own screens are tested in `device-in-store`
   (Jest, 394 test files, plus `.maestro/`).
2. **The back office was built API-first on purpose.**
   `docs/BACK_OFFICE_COVERAGE.md` → _Not covered end to end_: "UI flows (publish
   from the grid, approve a period, approve a request with a note): the UI spec
   covers visibility and rendering; the flows are covered through the API they
   call." So the money rules are proven well; the clicks a manager makes are
   mostly not.

---

## 1. Feature inventory

Roles: **Owner** (incl. co-owner), **Manager/Staff** (POS roles via
`RestaurantStaffMember`), **Employee** (RestauNax company staff), **HQ admin**,
**Guest** / **Member** (customers), **Accountant**.

### 1.1 Orders & POS

| Feature                                                                               | Role(s)                | Where it lives                                                                                       | Coverage       | Spec(s)                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner order list: search, filters, sort, paging, detail sheet                         | Owner                  | Tab `Orders` (`components/OrderStatistics/Orders.tsx`)                                               | `UI-journey`   | `tests/dashboard/owner/06-orders.spec.ts` (TC-29, 70, 89, 90 …), `tests/dashboard/owner/api-orders.spec.ts` (TC-255..261)                                       |
| Owner cancel + full refund of a card order                                            | Owner                  | Tab `Orders` → order sheet                                                                           | `UI-journey`   | `tests/dashboard/owner/06b-orders-journey.spec.ts` (TC-225, TC-253 `@stripe`)                                                                                   |
| Partial refund                                                                        | Owner                  | `POST /api/order/statistics/refund/:orderId` (backend `routes/order`)                                | `none`         | — (TEST_PLAN.md lists it as out of scope: "no UI path reaches it")                                                                                              |
| Order CSV export                                                                      | Owner                  | Tab `Orders` (`OrderExportButton.tsx`)                                                               | `API-only`     | `api-orders.spec.ts` TC-260                                                                                                                                     |
| Orders tenancy / authz                                                                | Owner                  | backend `routes/order`                                                                               | `API-only`     | `tests/dashboard/owner/api-orders-authz.spec.ts`                                                                                                                |
| Order money breakdown, same on every surface                                          | All                    | `docs/features/ORDER_MONEY_BREAKDOWN.md`; backend `Service/orderBreakdown/`                          | `UI-journey`   | `tests/dashboard/owner/27-order-breakdown.spec.ts` (TC-898..901), `tests/unit/orderBreakdown.helper.spec.ts`                                                    |
| Combo food on tickets / KDS / manifests                                               | Staff                  | `docs/features/ORDER_FOOD_LINES.md`                                                                  | `API-only`     | `tests/pos/12-combo-food-surfaces.spec.ts`                                                                                                                      |
| POS: online order received and driven PENDING → PICKED_UP                             | Staff                  | `device-in-store` `OrdersScreen.tsx`                                                                 | `API-only`     | `tests/pos/01-order-lifecycle.spec.ts` (TC-100, 179)                                                                                                            |
| POS: counter sale (Order Now), cash tender, change                                    | Staff                  | `OrderNowScreen.tsx`, `order-now/CashTenderSheet.tsx`                                                | `API-only`     | `tests/pos/08-register-cash.spec.ts` (TC-429, 430)                                                                                                              |
| POS: split tender                                                                     | Staff                  | `order-now/SplitTenderPayment.tsx`                                                                   | `API-only`     | `08-register-cash.spec.ts` TC-432                                                                                                                               |
| POS: card payment on a reader (Stripe Terminal)                                       | Staff                  | `settings/ReaderSettings.tsx`, `PaymentProcessingModal.tsx`                                          | `none`         | — (intent create/cancel only: `tests/pos/03-open-checks.spec.ts` TC-382)                                                                                        |
| POS: open checks (open, add items, transfer, even split, tips, gift-card leg, cancel) | Staff, Manager         | `OpenChecksScreen.tsx`, `checks/*`; `docs/features/TABLE_SERVICE_OPEN_CHECKS.md`                     | `API-only`     | `tests/pos/03-open-checks.spec.ts` (TC-372..383)                                                                                                                |
| POS: split check **by item** (child orders)                                           | Staff                  | `checks/SplitCheckSheet.tsx`                                                                         | `none`         | —                                                                                                                                                               |
| POS: apply coupon / promotion, price preview                                          | Staff                  | `orders/ApplyCouponSheet.tsx`, `order-now/CouponInput.tsx`                                           | `API-only`     | `tests/pos/11-promotions.spec.ts` (TC-845..856), `tests/pos/02-free-delivery-coupon.spec.ts`                                                                    |
| POS: deals at the counter, channel + schedule rules                                   | Staff                  | `order-now/DealBuilderModal.tsx`                                                                     | `API-only`     | `tests/pos/10-deals.spec.ts` (TC-524..527, 712)                                                                                                                 |
| POS: discount / comp / custom item permissions, manager approval                      | Staff, Manager         | `docs/features/back-office/DISCOUNT_PERMISSIONS.md`                                                  | `API-only`     | `tests/dashboard/owner/api-discount-permissions.spec.ts` (TC-604..610)                                                                                          |
| Manager approvals log / exceptions summary                                            | Owner                  | Tab `store-audit-log` (`tabs/ApprovalLogTab.tsx`, `ExceptionsSummary.tsx`)                           | `API-only`     | `api-discount-permissions.spec.ts` TC-610 (summary numbers only)                                                                                                |
| POS: edit / modify a paid order and recharge (order handoff)                          | Staff                  | `orders/EditOrderModal.tsx`, `orders/HandoffList.tsx`; `docs/features/ORDER_HANDOFF.md`              | `none`         | —                                                                                                                                                               |
| POS: enter tip after close                                                            | Staff                  | `orders/EnterTipSheet.tsx` → `POST /api/tablet/orders/:id/tip`                                       | `none`         | —                                                                                                                                                               |
| POS: send pay link / key in card (MOTO)                                               | Staff                  | `payments/SendPayLinkSheet.tsx`, `payments/KeyInCardSheet.tsx`; `docs/features/PAY_LINK_EXTRAS.md`   | `none`         | —                                                                                                                                                               |
| POS: cancel / void an order                                                           | Staff, Manager         | `orders/OrderCancelModal.tsx`                                                                        | `API-only`     | `03-open-checks.spec.ts` TC-383 (open check only)                                                                                                               |
| POS: register open / close, blind count, drawer lock                                  | Staff, Manager         | `RegisterScreen.tsx`, `register/*`                                                                   | `API-only`     | `tests/pos/08-register-cash.spec.ts` (TC-426..433)                                                                                                              |
| POS: safe, cash movements, handover                                                   | Manager                | `register/SafePanel.tsx`, `CashMovementSheet.tsx`, `HandoverSheet.tsx`                               | `API-only`     | `tests/dashboard/owner/api-pos-screen-loads.spec.ts` TC-649 (safe opens with approval), `api-ux-audit.spec.ts` TC-663 (drawer owner). Movements, handover: none |
| POS: open day / close day wizard                                                      | Manager                | `register/OpenDayWizard.tsx`, `CloseDayWizard.tsx` → `/api/tablet/day-open`, `/api/tablet/day-close` | `none`         | — (web day close is called only as a fixture in `api-partner-api.spec.ts`, `api-accountant-access.spec.ts`)                                                     |
| Web Daily Report / day close                                                          | Owner                  | Tab `store-daily-close` (`tabs/DailyCloseTab.tsx`, `CloseDayWizardDialog.tsx`)                       | `UI-load-only` | `tests/dashboard/owner/15-daily-report.spec.ts` (TC-141, 142: today's KPIs grow). The close wizard: none                                                        |
| Web cash management / registers                                                       | Owner                  | Tabs `store-cash`, `store-registers`                                                                 | `none`         | —                                                                                                                                                               |
| Devices: pairing, device settings, who changed them                                   | Owner, Manager         | Tab `store-devices`; POS `RestaurantSettingsScreen.tsx`                                              | `API-only`     | `tests/pos/12-tablet-settings-staff-role.spec.ts` (TC-949..951). Pairing UI: none                                                                               |
| Store status: pause / resume online ordering                                          | Owner, Staff           | Tab `store-status` (`ordering/StoreStatusPage.tsx`); `docs/features/ORDER_AVAILABILITY_CONTROLS.md`  | `API-only`     | `12-tablet-settings-staff-role.spec.ts` TC-950                                                                                                                  |
| Kitchen stations / make line (KDS)                                                    | Staff                  | Tab `store-prep-stations`; POS `MakeLineScreen.tsx`                                                  | `API-only`     | `12-combo-food-surfaces.spec.ts` (food lines only)                                                                                                              |
| POS reports screen                                                                    | Manager                | `ReportsScreen.tsx`                                                                                  | `none`         | —                                                                                                                                                               |
| Self-order kiosk                                                                      | Guest                  | `KioskScreen.tsx`, `kiosk/*`                                                                         | `none`         | — (POS repo)                                                                                                                                                    |
| Receipt printing, printer setup                                                       | Staff                  | `PrinterSettingScreen.tsx`                                                                           | `none`         | — hardware; `docs/PHYSICAL_TEST_LEDGER.md`                                                                                                                      |
| Dual pricing (cash/card prices)                                                       | HQ admin, Owner, Staff | `docs/features/DUAL_PRICING.md`; Store Settings → Order Settings                                     | `UI-journey`   | `tests/dashboard/owner/dual-pricing.spec.ts` (TC-494), `tests/pos/09-dual-pricing.spec.ts`, `tests/customer/09-dual-pricing.spec.ts`                            |
| Delivery (Uber Direct) quote at checkout                                              | Guest                  | `docs/features/UBER_DIRECT.md`; wind checkout                                                        | `UI-journey`   | `tests/customer/02-checkout.spec.ts` TC-126, `27-order-breakdown.spec.ts` TC-900                                                                                |
| Delivery dispatch, courier tracking, cancel fees                                      | Owner, Staff           | backend `routes/delivery`; POS `Staff/NeedsCourierStrip.tsx`                                         | `none`         | —                                                                                                                                                               |
| Uber Eats marketplace settings                                                        | Owner                  | `/restaurant/restaurantId/:id/uber`; Store Settings → marketplaces                                   | `UI-load-only` | `tests/dashboard/owner/09-uber-settings.spec.ts` (TC-82, 83)                                                                                                    |
| Shipping orders (home food), order notice                                             | Owner                  | `components/shipping`, Store Settings                                                                | `UI-journey`   | `tests/dashboard/owner/28-shipping-order-notice.spec.ts` (TC-934, notice only). Shipping label / parcel flow: none                                              |
| Processing-fee pass-through                                                           | Owner, Guest           | Store Settings → fees; `docs/features/CARD_SURCHARGE_COMPLIANCE.md`                                  | `UI-journey`   | `tests/customer/03-processing-fee.spec.ts`, `tests/customer-lima/15-processing-fee.spec.ts`                                                                     |

### 1.2 Menu

| Feature                                            | Role(s)       | Where                                                                        | Coverage     | Spec(s)                                                                                                                                                                          |
| -------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu builder: categories, items, delete rules      | Owner         | Tab `menu-builder` (`MenuBuilderTab.tsx`)                                    | `UI-journey` | `tests/dashboard/owner/04-menu-management.spec.ts` (TC-19..21, 67)                                                                                                               |
| Item wizard, modifiers, images, presets, duplicate | Owner         | `MenuItemDetailSheet.tsx`, item edit routes                                  | `UI-journey` | `tests/dashboard/owner/04c-menu-item-editor.spec.ts` (TC-294..302)                                                                                                               |
| Availability (86), featured items, restore all     | Owner         | Tab `Menu` (`MenuManagementPage.tsx`)                                        | `UI-journey` | `tests/dashboard/owner/04b-menu-availability.spec.ts` (TC-288..291)                                                                                                              |
| Menu API rules (normalisation, diff save)          | Owner         | backend `routes/menu`                                                        | `API-only`   | `tests/dashboard/owner/api-menu.spec.ts` (TC-263..)                                                                                                                              |
| Chain menu, per-location price / 86                | Owner (chain) | `/chain/:groupId/restaurantManagement`; `docs/features/CHAIN_RESTAURANTS.md` | `UI-journey` | `tests/dashboard/owner/17-chain-menu.spec.ts` (TC-308..311), `tests/customer/06-menu-handoff.spec.ts` (TC-320..322)                                                              |
| Menu publish                                       | Employee, HQ  | `/restaurant/restaurantId/:id/publish`                                       | `none`       | `tests/dashboard/employee/menu-publish.spec.ts` and `owner/05-publish.spec.ts` are `fixme`/skip scaffolds; only the OWNER refusal is proven (`access/role-restrictions.spec.ts`) |
| Menu pricing by order source (channel prices)      | Owner         | `docs/features/MENU_PRICING_BY_ORDER_SOURCE.md`                              | `none`       | —                                                                                                                                                                                |
| Image library, AI images                           | Owner         | Tab `Image Library`, tab `media`                                             | `none`       | — (AI generation out of scope, TEST_PLAN.md)                                                                                                                                     |
| Menu edit on the POS                               | Manager       | `device-in-store` `MenuManagementScreen.tsx`                                 | `none`       | —                                                                                                                                                                                |

### 1.3 Promotions

| Feature                                                       | Role(s)       | Where                                                                             | Coverage     | Spec(s)                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create / edit / duplicate the six promotion types             | Owner         | Tabs `promotions`, `create-promotion`, `edit-promotion` (`components/Promotions`) | `UI-journey` | `tests/dashboard/owner/19-promotions.spec.ts` (TC-821..832, 941), `25-promotion-scenarios.spec.ts` (TC-863..866), `api-promotions.spec.ts`, `api-deals.spec.ts`                                                                                      |
| Try it as a customer (preview)                                | Owner         | Promotions → preview; `docs/features/PROMOTIONS.md`                               | `UI-journey` | `tests/dashboard/owner/26-promotion-preview.spec.ts` (TC-882..885), `api-promotion-preview.spec.ts` (TC-872..)                                                                                                                                       |
| Send a code promotion (email), send history                   | Owner         | Tab `promotion-campaigns` (`Promotions/send`)                                     | `UI-journey` | `tests/dashboard/owner/21-promotion-send.spec.ts` (TC-852, 857). SMS send: none                                                                                                                                                                      |
| Promotion results                                             | Owner         | Tab `promotion-results`                                                           | `none`       | — (POM has the tab; no assertion on results numbers found)                                                                                                                                                                                           |
| Chain promotions                                              | Owner (chain) | Chain shell                                                                       | `UI-journey` | `tests/dashboard/owner/20-chain-promotions.spec.ts` (TC-523, 533..534, 833..835, 854)                                                                                                                                                                |
| Storefront promotions (sale, BOGO, codes, bundles, free item) | Guest         | template-wind, template-lima                                                      | `UI-journey` | `tests/customer/10-promotions.spec.ts`, `tests/customer-lima/14-promotions.spec.ts`, `tests/customer/06-deals.spec.ts`, `08-deals-handoff.spec.ts`, `11-deal-item-choices.spec.ts`, `customer-lima/13-deals.spec.ts`, `15-deal-item-choices.spec.ts` |
| Free-delivery coupons                                         | Guest, Staff  | `docs/features/COUPON_RULES_AND_FREE_DELIVERY.md`                                 | `UI-journey` | `tests/customer/07-free-delivery.spec.ts`, `tests/pos/02-free-delivery-coupon.spec.ts`                                                                                                                                                               |

### 1.4 Tables & reservations

| Feature                                                  | Role(s)       | Where                                                            | Coverage     | Spec(s)                                                                                                                                                          |
| -------------------------------------------------------- | ------------- | ---------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sections, tables, floor editor                           | Owner         | Tab `tables` (`tabs/tables`)                                     | `UI-journey` | `tests/dashboard/owner/18-tables-floor.spec.ts` (TC-434..439), `tests/pos/04-floor-tables.spec.ts`                                                               |
| Reservation settings, service periods, turn times, hours | Owner         | Tab `reservations` (`tabs/reservations`)                         | `UI-journey` | `tests/dashboard/owner/19-reservations.spec.ts` (TC-440..445), `21-reservations-booking-hours.spec.ts` (TC-746..749), `tests/pos/05-reservations-config.spec.ts` |
| Host stand: book, arrive, seat, link a check, no-show    | Host, Manager | POS `FloorScreen.tsx`, `floor/HostBoard.tsx`                     | `API-only`   | `tests/pos/06-reservations-lifecycle.spec.ts` (TC-406..417)                                                                                                      |
| Table hold, walk-ins, turns, PAID-until-cleared          | Host, Staff   | POS floor                                                        | `API-only`   | `tests/pos/09-table-hold.spec.ts` (TC-713..745), `tests/pos/10-table-turns.spec.ts` (TC-727..737)                                                                |
| Waitlist                                                 | Host          | POS floor                                                        | `API-only`   | `tests/pos/07-waitlist-public.spec.ts`                                                                                                                           |
| Public self-service booking / manage booking             | Guest         | backend `routes/publicReservation`                               | `API-only`   | `tests/pos/07-waitlist-public.spec.ts` (TC-418..425). No guest booking page is driven in a browser                                                               |
| Reservation reminders, no-show sweeps (SMS)              | System        | `docs/features/TABLE_RESERVATIONS.md`                            | `none`       | — (carrier SMS: `docs/PHYSICAL_TEST_LEDGER.md`)                                                                                                                  |
| Tables without the add-on behave as before               | Owner, Staff  | CLAUDE.md rule; `reservationAccess.ts`                           | `API-only`   | `04-floor-tables.spec.ts` TC-391/392 (gates), `03-open-checks.spec.ts` (table service without the add-on)                                                        |
| Pay at the table (guest pays from the receipt QR)        | Guest, Owner  | Store Settings → `pay-at-table`; `docs/features/PAY_AT_TABLE.md` | `API-only`   | `tests/dashboard/owner/api-pay-at-table.spec.ts` (TC-680..690)                                                                                                   |

### 1.5 Customers & rewards

| Feature                                                | Role(s)      | Where                                              | Coverage     | Spec(s)                                                                                   |
| ------------------------------------------------------ | ------------ | -------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| Customer directory, search, segments                   | Owner        | Tab `Customers` (`components/CustomerManagement`)  | `UI-journey` | `tests/dashboard/owner/13-customers.spec.ts` (TC-136..138; search + tab switch, no edits) |
| Customer profile / details, send campaign to a segment | Owner        | `CustomerProfile.tsx`, `CustomerDetailsDialog.tsx` | `none`       | —                                                                                         |
| Rewards program setup                                  | Employee, HQ | `/restaurant/loyalty` (`components/Rewards`)       | `none`       | only the OWNER refusal: `tests/dashboard/access/role-restrictions.spec.ts`                |
| Member OTP login (lima)                                | Member       | template-lima                                      | `UI-journey` | `tests/customer-lima/12-rewards-otp.spec.ts` (TC-L50, L52)                                |
| Member OTP login + points at checkout (wind)           | Member       | template-wind                                      | `none`       | — (TEST_PLAN.md roadmap: "Reward-member checkout")                                        |
| Points redeemed at checkout                            | Member       | wind checkout                                      | `UI-journey` | `27-order-breakdown.spec.ts` TC-898 (points line in the breakdown)                        |
| Receipt reward claim                                   | Guest        | `docs/features/RECEIPT_REWARD_CLAIM.md`            | `API-only`   | `api-pay-at-table.spec.ts` TC-689                                                         |
| Reward worksheets                                      | Owner        | `/reward-worksheet`, `Rewards/WorksheetList.tsx`   | `none`       | —                                                                                         |
| Lifecycle marketing opt-out (owner)                    | Owner        | Tab `marketing-automations`                        | `UI-journey` | `tests/dashboard/owner/16-marketing-automations.spec.ts` (TC-206..208)                    |

### 1.6 Gift cards

| Feature                                                | Role(s)  | Where                                                                                                                 | Coverage     | Spec(s)                                                                                                                                |
| ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Buy a digital gift card online, balance check          | Guest    | template-wind `/gift-cards`                                                                                           | `UI-journey` | `tests/customer/04-gift-cards.spec.ts` (TC-165..170)                                                                                   |
| Pay with a gift card (full / partial / refused states) | Guest    | wind / lima checkout                                                                                                  | `UI-journey` | `tests/customer/02-checkout.spec.ts` (TC-171..178, 477), `tests/customer-lima/11-checkout-and-order.spec.ts` TC-L43                    |
| Gift card as a tender on an open check                 | Staff    | POS `order-now/GiftCardInput.tsx`                                                                                     | `API-only`   | `03-open-checks.spec.ts` TC-381                                                                                                        |
| Sell / load / activate a gift card at the register     | Staff    | `order-now/GiftCardPurchaseSheet.tsx`, `GiftCardActivateSheet.tsx`; `docs/features/GIFT_CARD_SALE_AT_THE_REGISTER.md` | `none`       | —                                                                                                                                      |
| Physical card batches (mint, export, freeze)           | HQ admin | HQ → Marketing → gift cards (`GiftCardBatchesPanel.tsx`)                                                              | `API-only`   | `tests/dashboard/admin/gift-card-batches.spec.ts` (TC-469..476; listed as "Browser" in TEST_PLAN.md, but the file makes no page calls) |
| Import existing gift cards                             | HQ admin | `GiftCardImportPanel.tsx`                                                                                             | `API-only`   | `tests/dashboard/admin/gift-card-import.spec.ts` (TC-499..506)                                                                         |
| Gift card liability (owner billing)                    | Owner    | Tab `Billing` (`Subscription/GiftCardLiabilityCard.tsx`)                                                              | `none`       | —                                                                                                                                      |

### 1.7 Staff & hiring

| Feature                                                     | Role(s)         | Where                                                                                | Coverage       | Spec(s)                                                                                                                                  |
| ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Invite staff → email → register → on the list → POS sign-in | Owner, Staff    | Tab `staff` → People (`components/Staff`)                                            | `API-only`     | `tests/dashboard/owner/api-staff-hiring.spec.ts` (TC-553..562, 618), `api-ux-audit.spec.ts` (TC-654, 659, 660)                           |
| Roles & custom roles, job + own wage                        | Owner           | Staff → Roles, Jobs & wages (`RolesTab.tsx`, `JobsAndWages.tsx`)                     | `UI-load-only` | `21-back-office-staff-ui.spec.ts` (TC-631 roles listed, TC-632 job shown); edits via API in `api-staff-hiring.spec.ts`                   |
| Staff area follows the add-ons, responsive                  | Owner           | Staff tab                                                                            | `UI-journey`   | `tests/dashboard/owner/21-back-office-staff-ui.spec.ts` (TC-628..634, 650), `22-ux-audit-staff-ui.spec.ts` (TC-664..666)                 |
| Staff on the POS (PIN staff, roster, role picker)           | Manager         | POS `StaffManagementScreen.tsx`, `Staff/StaffInviteSheet.tsx`                        | `API-only`     | `api-staff-hiring.spec.ts` TC-558, 618; role picker on device: `restaunax/docs/features/back-office/TEST_COVERAGE.md` §6 item 1 (manual) |
| Employee (company) invites a restaurant's staff             | Employee        | `/restaurant/:id/staff/invite`                                                       | `API-only`     | `tests/dashboard/employee/staff-invite.spec.ts` (TC-940)                                                                                 |
| `/staff` portal                                             | Staff           | `/staff`                                                                             | `UI-load-only` | `tests/dashboard/staff/staff-portal.spec.ts` (TC-180)                                                                                    |
| Co-owner invite / access                                    | Owner           | `Staff/CoOwnerDialog.tsx`                                                            | `none`         | — (`BACK_OFFICE_COVERAGE.md`: "no co-owner fixture in the suite")                                                                        |
| Job applications (careers)                                  | Owner           | Tab `jobs` (`Jobs/JobApplicationsPage.tsx`), backend `routes/careers`, `routes/jobs` | `none`         | —                                                                                                                                        |
| Training Academy (HQ + learner)                             | HQ admin, Staff | `/training`, HQ → Training                                                           | `UI-journey`   | `tests/dashboard/admin/training-hq.spec.ts` (TC-918..923), `tests/dashboard/learner/training-learner.spec.ts` (TC-924..927)              |
| Restaunax Staff app backend (my shifts, hours, pay)         | Staff           | backend `routes/staffApp`                                                            | `API-only`     | `api-staff-requests.spec.ts`, `api-payroll-export.spec.ts` TC-602, `api-tip-waterfall.spec.ts` TC-676                                    |

### 1.8 Scheduling

| Feature                                             | Role(s)         | Where                                                                    | Coverage     | Spec(s)                                                                                                                    |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Build, cost and publish a week; warnings; copy week | Owner, Manager  | Staff → Schedule (`Staff/schedule/ScheduleTab.tsx`)                      | `API-only`   | `tests/dashboard/owner/api-scheduling.spec.ts` (TC-570..575)                                                               |
| Publish notifies staff by email                     | Owner, Staff    | same                                                                     | `API-only`   | `api-scheduling.spec.ts` TC-573 `@email`                                                                                   |
| Clock-in rule (BLOCK / WARN / early window / OFF)   | Owner, Manager  | Payroll settings; POS `TimeClockScreen.tsx`                              | `API-only`   | `api-scheduling.spec.ts` TC-576, 636; `api-ux-audit.spec.ts` TC-652                                                        |
| Time off, availability, release → pick up → approve | Staff, Manager  | Staff → Requests (`Staff/requests/RequestsTab.tsx`); Restaunax Staff app | `API-only`   | `tests/dashboard/owner/api-staff-requests.spec.ts` (TC-543..552), `api-scheduling.spec.ts` TC-577, 578                     |
| POS schedule view                                   | Staff           | POS `ScheduleScreen.tsx`                                                 | `API-only`   | `api-ux-audit.spec.ts` TC-655                                                                                              |
| Holiday & special hours                             | Owner           | Store Settings → `holiday-hours` (`ordering/SpecialHoursSection.tsx`)    | `UI-journey` | `api-back-office-next-level.spec.ts` TC-946, `29-back-office-next-level-ui.spec.ts` TC-955 (list + remove; create via API) |
| Business hours                                      | Employee, Owner | Store Settings → `business-hours`                                        | `UI-journey` | `tests/dashboard/employee/hours-of-operation.spec.ts` (TC-183)                                                             |

### 1.9 Time clock & timecards

| Feature                                                     | Role(s)        | Where                                          | Coverage     | Spec(s)                                                                                                                                                                            |
| ----------------------------------------------------------- | -------------- | ---------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock in / out, job picker, breaks on the POS               | Staff          | POS `TimeClockScreen.tsx`                      | `API-only`   | `api-timecards.spec.ts` TC-587, `api-free-breaks.spec.ts` (TC-637..641), `api-ux-audit.spec.ts` TC-653                                                                             |
| Overtime (blended, FEDERAL / CALIFORNIA / CUSTOM), raises   | Owner          | Staff → Timecards, Payroll settings            | `API-only`   | `tests/dashboard/owner/api-timecards.spec.ts` (TC-580..582)                                                                                                                        |
| Missed break review, approve pay period, reopen with reason | Owner, Manager | Staff → Timecards (`payroll/TimecardsTab.tsx`) | `API-only`   | `api-timecards.spec.ts` TC-584, 585                                                                                                                                                |
| **Correct a timecard** (edit punch, add missing shift)      | Owner, Manager | Timecards → `payroll/ShiftDialogs.tsx`         | `API-only`   | manager entry `POST /api/staff/payroll/:rid/shifts` is used as setup in `api-timecards.spec.ts` / `api-payroll-export.spec.ts`; no test edits an existing punch through the dialog |
| Timecards opens on the oldest unapproved period             | Owner          | Timecards                                      | `UI-journey` | `22-ux-audit-staff-ui.spec.ts` TC-665                                                                                                                                              |
| Timecard review on the POS                                  | Manager        | POS `TimecardReviewScreen.tsx`                 | `none`       | —                                                                                                                                                                                  |
| Labor report + CSV                                          | Owner          | Staff → Labor (`payroll/LaborTab.tsx`)         | `API-only`   | `api-timecards.spec.ts` TC-585                                                                                                                                                     |
| "Clocks in" off per person                                  | Owner          | People                                         | `API-only`   | `tests/dashboard/owner/api-clocks-in.spec.ts` (TC-642..646)                                                                                                                        |
| Needs you today: period to approve                          | Owner          | Tab `today` (`components/NeedsYou`)            | `UI-journey` | `29-back-office-next-level-ui.spec.ts` TC-952 (button opens Timecards on the period), `api-back-office-next-level.spec.ts` TC-945                                                  |

### 1.10 Tips & service charges

| Feature                                                     | Role(s)      | Where                                                                                                                     | Coverage     | Spec(s)                                                                                        |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| Tip pool, tip-outs, legal guards, declared cash, tips CSV   | Owner        | Staff → Tips, Tip policy (`payroll/TipsTab.tsx`, `TipPolicyTab.tsx`)                                                      | `API-only`   | `tests/dashboard/owner/api-tips.spec.ts` (TC-588..596)                                         |
| Tip-out waterfall rules + Tips tab Gave / Received          | Owner        | Tip policy                                                                                                                | `UI-journey` | `23-tip-waterfall-ui.spec.ts` (TC-677..679), `api-tip-waterfall.spec.ts` (TC-667..676)         |
| Card-fee withholding from card tips                         | Owner        | `docs/features/back-office/PAYROLL_02_TIPS.md`                                                                            | `API-only`   | only through `POST /preview` (`api-tip-waterfall.spec.ts` TC-669); no real captured card tip   |
| Tips from real orders inside an approved period             | Owner        | Timecards / Tips                                                                                                          | `none`       | — (`BACK_OFFICE_COVERAGE.md`: "a period can only be approved once it's over")                  |
| Service fee (rate, minimum, channels, taxable, HOUSE/STAFF) | Owner        | Store Settings → `service-fee` (`tabs/ServiceFeeSettings.tsx`)                                                            | `API-only`   | `tests/dashboard/owner/api-service-fee.spec.ts` (TC-611..617). Settings form: none             |
| Service charge → staff (share like tips), #1078             | Owner        | `payroll/ServiceChargesSection.tsx`, `tabs/StaffShareChoice.tsx`; `docs/features/back-office/SERVICE_CHARGES_TO_STAFF.md` | `none`       | —                                                                                              |
| Auto-gratuity                                               | Owner, Staff | Store Settings → `auto-gratuity` (`tabs/AutoGratuitySettings.tsx`); `docs/features/AUTO_GRATUITY.md`                      | `API-only`   | only as part of the bill in `api-pay-at-table.spec.ts` TC-683 (18%); thresholds/settings: none |
| Suggested tip presets                                       | Owner, Guest | `tabs/SuggestedTipPresets.tsx`                                                                                            | `UI-journey` | storefront side only: `customer/02-checkout.spec.ts` TC-186. Owner setting: none               |
| Staff tip receipt                                           | Staff        | Restaunax Staff API                                                                                                       | `API-only`   | `api-tip-waterfall.spec.ts` TC-676                                                             |

### 1.11 Payroll & Gusto

| Feature                                                            | Role(s)  | Where                                                                                                         | Coverage       | Spec(s)                                                                                                                   |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Payroll export files (RestauNax, Gusto, ADP RUN, Paychex)          | Owner    | Staff → Payday (`payroll/ExportPayrollDialog.tsx`)                                                            | `API-only`     | `tests/dashboard/owner/api-payroll-export.spec.ts` (TC-597..603)                                                          |
| Payday: deadline and steps in words                                | Owner    | Staff → Payday (`payroll/PaydayTab.tsx`)                                                                      | `UI-load-only` | `29-back-office-next-level-ui.spec.ts` TC-953, `api-back-office-next-level.spec.ts` TC-944                                |
| Payroll settings (pay frequency, overtime preset, mode)            | Owner    | Staff → Payroll settings (`payroll/PayrollSettingsTab.tsx`)                                                   | `UI-load-only` | `21-back-office-staff-ui.spec.ts` TC-630 (three ways shown), `api-ux-audit.spec.ts` TC-661                                |
| Connect own Gusto (P4) and send a pay period                       | Owner    | `payroll/PayrollProviderCard.tsx`, `SendToProviderButton.tsx`, `/payroll/oauth-return/:provider`              | `API-only`     | `tests/dashboard/owner/api-payroll-gusto.spec.ts` (TC-625..627: probe + connect URL/refusal only). Sending a period: none |
| RestauNax Payroll (Gusto Embedded, P5): add staff, onboarding, run | Owner    | `payroll/EmbeddedPayrollPanel.tsx`, `GustoFlowDialog.tsx`; `docs/features/back-office/PAYROLL_05_EMBEDDED.md` | `none`         | — (`api-addon-billing.spec.ts` TC-788 "payroll card" is `fixme`)                                                          |
| HQ payroll connections, headcount                                  | HQ admin | HQ → `PayrollConnections`                                                                                     | `none`         | — (finding F2 in `BACK_OFFICE_COVERAGE.md`)                                                                               |
| Staff pay stub                                                     | Staff    | Restaunax Staff API                                                                                           | `API-only`     | `api-payroll-export.spec.ts` TC-602 (wages + hours)                                                                       |

### 1.12 Books, QuickBooks/Xero & deposits

| Feature                                                 | Role(s)           | Where                                                                                                          | Coverage     | Spec(s)                                                                                                                                                               |
| ------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Books & taxes tab gating, sections open, request add-on | Owner             | Tab `books-taxes` (`components/BooksTaxes/BooksTaxesPage.tsx`)                                                 | `UI-journey` | `tests/dashboard/owner/24-books-gating-ui.spec.ts` (TC-789..791, 897)                                                                                                 |
| Books setup wizard, connect QuickBooks / Xero (OAuth)   | Owner             | `BooksSetupWizard.tsx`, `ConnectionCard.tsx`, `/accounting/oauth-return/:provider`                             | `none`       | — (connected by hand: `restaunax/docs/features/QA_PARTNER_CONNECTIONS.md`)                                                                                            |
| Account matching                                        | Owner             | `AccountMatchingPanel.tsx`                                                                                     | `none`       | —                                                                                                                                                                     |
| Closed day posts a journal entry                        | System, Owner     | `docs/features/back-office/ACCOUNTING_SYNC.md`                                                                 | `API-only`   | A1 entry balances: `api-sales-tax-reports.spec.ts` TC-624, partner `/days` journal: `api-partner-api.spec.ts` TC-756. Posting to QuickBooks/Xero: none                |
| Card deposits = Stripe payout, posted                   | Owner             | `DepositsSection.tsx`                                                                                          | `API-only`   | `tests/dashboard/owner/api-books-deposits-live.spec.ts` (TC-772..773 `@books-live`, read-only; TC-773 skips while none posted), `api-books-taxes.spec.ts` TC-770, 771 |
| Tax calendar, year-end package                          | Owner, Accountant | `TaxCalendarPanel.tsx`, `YearEndPanel.tsx`                                                                     | `API-only`   | `tests/dashboard/owner/api-books-taxes.spec.ts` (TC-763..769; TC-768 `test.fail` = finding F1)                                                                        |
| Accountant invite + read-only workspace                 | Owner, Accountant | `AccountantsPanel.tsx`, `/accountant/:restaurantId`                                                            | `UI-journey` | `tests/dashboard/owner/api-accountant-access.spec.ts` (TC-774..780; TC-777 opens the workspace in a browser)                                                          |
| Partner API keys, webhooks (Connected apps)             | Owner             | Store Settings → `connected-apps` (`components/PartnerApi`)                                                    | `API-only`   | `tests/dashboard/owner/api-partner-api.spec.ts` (TC-754..762)                                                                                                         |
| Payouts & earnings by day                               | Owner             | Tab `Billing` (`Subscription/PayoutHistory.tsx`, `EarningsByDay.tsx`); `docs/features/PAYOUTS_AND_EARNINGS.md` | `none`       | —                                                                                                                                                                     |

### 1.13 Sales tax & Avalara

| Feature                                                        | Role(s)           | Where                                                            | Coverage     | Spec(s)                                                                                                        |
| -------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| Tax rates (default, coded, tax-free item, rate change)         | Employee, Owner   | `/restaurant/restaurantId/:id/tax`; Store Settings → `sales-tax` | `UI-journey` | `tests/dashboard/employee/tax-settings.spec.ts` (set + save), `api-sales-tax-reports.spec.ts` TC-619, 620, 622 |
| Sales tax report per rate + CSV, sales-by-day CSV              | Owner, Accountant | `tabs/salesTax`; `docs/features/back-office/SALES_TAX.md`        | `API-only`   | `api-sales-tax-reports.spec.ts` TC-621, 623                                                                    |
| Avalara connection, closed days sent                           | Owner             | `BooksTaxes/AvalaraSection.tsx`                                  | `none`       | —                                                                                                              |
| Delivery-fee tax rules v2 / POS tax refusal (release switches) | System            | env `DELIVERY_FEE_TAX_RULES_V2`, `POS_TAX_REFUSAL_ENABLED`       | `none`       | — (both off by default; `BACK_OFFICE_COVERAGE.md` notes the device's tax claim is accepted)                    |

### 1.14 Settings & settings safety

| Feature                                              | Role(s)   | Where                                                                                                   | Coverage       | Spec(s)                                                                                                                                                |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Store Settings field edit + save                     | Owner     | Tab `Store Settings` (`RestaurantSettingsPage.tsx`)                                                     | `UI-journey`   | `tests/dashboard/owner/02-restaurant-management.spec.ts` (TC-88, self-reverting)                                                                       |
| Recent changes (who changed what)                    | Owner     | Store Settings (`RestaurantManagement/settingsChanges`); `docs/features/back-office/SETTINGS_SAFETY.md` | `UI-journey`   | `29-back-office-next-level-ui.spec.ts` TC-956, `api-settings-safety.spec.ts` TC-942                                                                    |
| POS settings changes need a signed-in role           | Manager   | POS settings                                                                                            | `API-only`     | `tests/pos/12-tablet-settings-staff-role.spec.ts` (TC-949..951)                                                                                        |
| Dangerous changes name their consequence / refused   | Owner     | SETTINGS_SAFETY.md §5                                                                                   | `API-only`     | `api-settings-safety.spec.ts` (1 active test). Consequence dialogs in the UI: none                                                                     |
| Order settings, order preparation, receipts, dine-in | Owner     | Store Settings → `order-settings`, `order-preparation`, `receipts`, `table-service`                     | `none`         | — (receipt QR list via API only: `api-pay-at-table.spec.ts` TC-681)                                                                                    |
| Owner Settings: automated reports, morning summary   | Owner     | Tab `Owner Settings` (`components/OwnerSettings`)                                                       | `UI-journey`   | `tests/dashboard/owner/14-owner-settings.spec.ts` (TC-139), `29-back-office-next-level-ui.spec.ts` TC-957, `api-back-office-next-level.spec.ts` TC-948 |
| Account language                                     | Owner     | Top bar                                                                                                 | `UI-journey`   | `22-ux-audit-staff-ui.spec.ts` TC-666, `api-ux-audit.spec.ts` TC-658                                                                                   |
| Back-office setup checklist                          | Owner     | `components/BackOffice/BackOfficeSetupCard.tsx`                                                         | `UI-journey`   | `29-back-office-next-level-ui.spec.ts` TC-954, `api-back-office-next-level.spec.ts` TC-943                                                             |
| Branding config                                      | Owner, HQ | `BrandingConfigPage.tsx`                                                                                | `UI-load-only` | `tests/dashboard/admin/branding.spec.ts` (TC-932)                                                                                                      |

### 1.15 Billing / subscription & add-ons

| Feature                                                              | Role(s)         | Where                                                                                                                                       | Coverage       | Spec(s)                                                                                                                                 |
| -------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Subscription page, plan details                                      | Owner           | `/restaurant/restaurantId/:id/subscription`, tab `Billing`                                                                                  | `UI-load-only` | `tests/dashboard/owner/10-subscription.spec.ts` (TC-84, 85)                                                                             |
| Payment method (card or bank), bank verification, invoices           | Owner           | `Subscription/PaymentMethodManager.tsx`, `BankVerificationAlert.tsx`, `BillingHistory.tsx`; `docs/features/OWNER_ACTIVATION_AND_BILLING.md` | `none`         | —                                                                                                                                       |
| Stripe Connect onboarding (payouts)                                  | Owner           | `/restaurant/restaurantId/:id/setupStripe`                                                                                                  | `UI-journey`   | `tests/dashboard/owner/08-payment-settings.spec.ts` (TC-46..53, 78, 928; create-account call and the error path are route-mocked)       |
| Add-on requests (owner asks, HQ attaches / removes)                  | Owner, HQ admin | `/restaurant/:id/addons` (`Subscription/OwnerAddonsTab.tsx`); HQ `AddonCatalogAdmin`                                                        | `API-only`     | `tests/dashboard/owner/api-addon-billing.spec.ts` (TC-781..787, 894..896); one UI request + cancel: `24-books-gating-ui.spec.ts` TC-897 |
| Add-on gating (what each package unlocks)                            | Owner, Staff    | `docs/features/back-office/E0_ENTITLEMENTS_AND_PACKAGING.md`                                                                                | `API-only`     | `tests/dashboard/owner/api-addon-gating.spec.ts` (TC-563..569, 635); UI side `21-back-office-staff-ui.spec.ts`                          |
| Trials                                                               | Owner, HQ       | ADDON_BILLING.md                                                                                                                            | `none`         | TC-785, TC-788 are `test.fixme` (no catalog trial on QA)                                                                                |
| Disputes / chargebacks                                               | Owner           | `Subscription/DisputesTab.tsx`, `/refund-evidence`; `docs/features/CHARGEBACK_DEFENSE.md`                                                   | `none`         | —                                                                                                                                       |
| HQ close-out (deactivate, equipment returns, closing balance, waive) | HQ admin        | HQ → Restaurants / Equipment / Billing attention                                                                                            | `UI-journey`   | `tests/dashboard/admin/restaurant-closeout.spec.ts` (TC-935..939)                                                                       |

### 1.16 Marketing

| Feature                                           | Role(s)  | Where                                                                              | Coverage     | Spec(s)                                                                       |
| ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| HQ campaign events (org coupons, holidays)        | HQ admin | HQ → Marketing (`MarketingManagement`)                                             | `UI-journey` | `tests/dashboard/admin/marketing-campaigns.spec.ts` (TC-198..200, 211)        |
| HQ lifecycle automations (Win-Back, Welcome, VIP) | HQ admin | HQ → Marketing                                                                     | `UI-journey` | `tests/dashboard/admin/marketing-automations.spec.ts` (TC-201..203, 210, 212) |
| Owner automated marketing on/off                  | Owner    | Tab `marketing-automations`                                                        | `UI-journey` | `tests/dashboard/owner/16-marketing-automations.spec.ts`                      |
| Owner sends a promotion                           | Owner    | Tab `promotion-campaigns`                                                          | `UI-journey` | `tests/dashboard/owner/21-promotion-send.spec.ts`                             |
| Social media accounts, posts, reels, AI video     | Owner    | Tabs `social-accounts`, `social-create`, `social-history`, `social-reels`, `media` | `none`       | — (out of scope: TEST_PLAN.md, external OAuth)                                |
| Unsubscribe page                                  | Guest    | `/unsubscribe`                                                                     | `none`       | —                                                                             |
| Short links in SMS                                | System   | `docs/features/SHORT_LINKS.md`; backend `routes/shortLink`                         | `none`       | —                                                                             |

### 1.17 Analytics & reports

| Feature                                   | Role(s)           | Where                                    | Coverage       | Spec(s)                                                                                    |
| ----------------------------------------- | ----------------- | ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| Analytics tab shell + date range          | Owner             | Tab `Analytics` (`components/Analytics`) | `UI-journey`   | `tests/dashboard/owner/12-analytics.spec.ts` (TC-35, 127..129). Chart values: out of scope |
| Daily report KPIs                         | Owner             | Tab `store-daily-close`                  | `UI-load-only` | `15-daily-report.spec.ts` (TC-141, 142)                                                    |
| Sales tax, sales by day, labor, tips CSVs | Owner, Accountant | various                                  | `API-only`     | `api-sales-tax-reports.spec.ts`, `api-timecards.spec.ts` TC-585, `api-tips.spec.ts` TC-596 |
| Storefront analytics (GTM per restaurant) | Owner             | `docs/features/STOREFRONT_ANALYTICS.md`  | `none`         | —                                                                                          |
| HQ owner health score                     | HQ admin          | HQ → Owners                              | `API-only`     | `tests/dashboard/admin/owner-health-score.spec.ts` (TC-931; no page calls)                 |

### 1.18 Supply shop

| Feature                                      | Role(s)  | Where                                       | Coverage     | Spec(s)                                                                                 |
| -------------------------------------------- | -------- | ------------------------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| Owner: brief → quote → proof → approve → pay | Owner    | Tab `supply-shop` (`components/SupplyShop`) | `UI-journey` | `tests/dashboard/owner/20-supply-shop.spec.ts` (TC-446..455), `api-supply-shop.spec.ts` |
| HQ: design queue, artwork, fulfil            | HQ admin | HQ → `SupplyShop`                           | `UI-journey` | `tests/dashboard/admin/supply-shop.spec.ts` (TC-456..468)                               |
| Table QR card ordered from the print shop    | Owner    | `docs/features/TABLE_QR_ORDERING.md` §8     | `UI-journey` | `tests/table-qr/tableQrOrdering.spec.ts` (2 active tests)                               |

### 1.19 Menu TV

| Feature                                   | Role(s)         | Where                                                          | Coverage | Spec(s)                                                         |
| ----------------------------------------- | --------------- | -------------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| Pair / unpair a TV, edit, layouts         | Owner           | Tab `menu-tvs` (`components/MenuTvs`); backend `routes/menuTv` | `none`   | — (only the add-on request: `api-addon-billing.spec.ts` TC-896) |
| HQ TV provisioning                        | HQ admin        | HQ → `MenuTvProvisioning`                                      | `none`   | —                                                               |
| TV player shows the menu, follows changes | In-store screen | `restaunax-tv-display`; `docs/features/MENU_TV_DISPLAY.md`     | `none`   | —                                                               |

### 1.20 Voice

| Feature                                              | Role(s)  | Where                                                                 | Coverage | Spec(s)                                    |
| ---------------------------------------------------- | -------- | --------------------------------------------------------------------- | -------- | ------------------------------------------ |
| Voice ordering, reservations by phone, call transfer | Guest    | `restaunax-voice/` sidecar + backend `Service/voice/`, `routes/voice` | `none`   | — (out of scope: TEST_PLAN.md, live calls) |
| HQ voice management                                  | HQ admin | HQ → `VoiceManagement`                                                | `none`   | —                                          |

### 1.21 HQ / admin

| Feature                                                                                                                                                                                                                     | Role(s)      | Where                                                                      | Coverage     | Spec(s)                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| User management (invite, claim, roles, permissions)                                                                                                                                                                         | HQ admin     | HQ → `UserManagement`                                                      | `UI-journey` | `tests/dashboard/admin/users.spec.ts` (TC-76, 77, 102..124)                               |
| Restaurants list, ownership invite                                                                                                                                                                                          | HQ admin     | HQ → `RestaurantManagement`                                                | `UI-journey` | `tests/dashboard/admin/restaurants.spec.ts` (TC-32, 930)                                  |
| Demo requests                                                                                                                                                                                                               | HQ admin     | HQ → `DemoManagemant`                                                      | `UI-journey` | `tests/dashboard/admin/demo/01-demo-management.spec.ts`, `02-demo-actions.spec.ts`        |
| Chains: create, link / unlink                                                                                                                                                                                               | HQ admin     | HQ → `ChainManagement`                                                     | `API-only`   | `tests/dashboard/admin/chains.spec.ts` (TC-181, 223, 323, 324; no page calls in the file) |
| Onboarding chain (sign-up → employee → assign)                                                                                                                                                                              | Employee, HQ | `/restaurant/new`, HQ                                                      | `UI-journey` | `tests/dashboard/employee/onboarding-chain.spec.ts` (TC-182), `restaurant-create.spec.ts` |
| Training HQ, supply shop, gift cards, marketing, close-out                                                                                                                                                                  | HQ admin     | see areas above                                                            | see above    | see above                                                                                 |
| Add-on catalog, subscription plans                                                                                                                                                                                          | HQ admin     | `AddonCatalogAdmin`, `SubscriptionPlanAdmin`                               | `API-only`   | HQ attach via API in `api-addon-billing.spec.ts` TC-784, 894..896; plans: none            |
| QA "Run a day" simulator                                                                                                                                                                                                    | HQ admin     | HQ → Operations → Demo Data (`DemoTools`); `docs/features/QA_RUN_A_DAY.md` | `none`       | —                                                                                         |
| Domains, short links, app versions, system logs, support, affiliates, signups, leads/onboarding quotes, equipment, expenses, finance overview, disputes, shipping claims, partners, social admin, owner portal, connections | HQ admin     | `restaunax-frontend/src/Admin/components/*`                                | `none`       | — (lead onboarding: TEST_PLAN.md "Not attempted")                                         |
| Public: sign-in, sign-up, demo request                                                                                                                                                                                      | Guest        | `/sign-in`, `/sign-up`, `/demo`                                            | `UI-journey` | `tests/dashboard/public/sign-in.spec.ts`, `sign-up.spec.ts`, `01-demo-request.spec.ts`    |
| Access control (role walls, unauthenticated)                                                                                                                                                                                | All          | routers                                                                    | `UI-journey` | `tests/dashboard/access/*.spec.ts`                                                        |
| Password reset, staff PIN reset                                                                                                                                                                                             | All          | `/reset-password`, `/staff/reset-pin/:token`                               | `none`       | —                                                                                         |

### 1.22 Customer ordering web (template-wind, template-lima)

| Feature                                                  | Role(s)       | Where                  | Coverage     | Spec(s)                                                                                                                         |
| -------------------------------------------------------- | ------------- | ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Browse menu, item modal, modifiers                       | Guest         | wind `/menu`; lima     | `UI-journey` | `tests/customer/01-menu-browsing.spec.ts`, `05-modifiers.spec.ts` (TC-189..194), `tests/customer-lima/10-menu-and-cart.spec.ts` |
| Checkout: pickup, tip, coupon, gift card, delivery quote | Guest         | wind `/checkout`; lima | `UI-journey` | `tests/customer/02-checkout.spec.ts`, `tests/customer-lima/11-checkout-and-order.spec.ts`                                       |
| Pay with Stripe test card, declined card                 | Guest         | wind, lima             | `UI-journey` | `tests/customer/03-order-placement.spec.ts` (TC-26, 64), `customer-lima/11-checkout-and-order.spec.ts` (TC-L40, L41)            |
| 3DS bank check (in page + redirect)                      | Guest         | wind, lima             | `UI-journey` | `tests/customer/12-3ds-bank-check.spec.ts`, `tests/customer-lima/16-3ds-bank-check.spec.ts`                                     |
| Lima tenancy: slugs, isolation, routing                  | Guest         | template-lima          | `UI-journey` | `tests/customer-lima/01-slug-resolution.spec.ts`, `02-tenant-isolation.spec.ts`, `03-routing-basename.spec.ts`                  |
| Scheduled pickup ("order for later")                     | Guest         | wind checkout          | `UI-journey` | only with deals: `customer/08-deals-handoff.spec.ts` TC-536, 537. General scheduling rules: none (TEST_PLAN.md roadmap)         |
| Closed store / not published / paused ordering banners   | Guest         | wind, lima             | `none`       | — (TEST_PLAN.md roadmap: "Customer availability gates")                                                                         |
| Chain location picker                                    | Guest         | wind (chain mode)      | `none`       | — (lima chain slug resolves: TC-L02, no picker journey)                                                                         |
| Order confirmation email                                 | Guest, Member | email                  | `UI-journey` | `27-order-breakdown.spec.ts` (email test, TC-901 `@email`)                                                                      |
| Wind landing-page blocks (deals grid etc.)               | Guest         | template-wind blocks   | `UI-journey` | `customer/08-deals-handoff.spec.ts` TC-538 (Deals grid only)                                                                    |

### 1.23 Table QR

| Feature                                               | Role(s) | Where                                                  | Coverage     | Spec(s)                                  |
| ----------------------------------------------------- | ------- | ------------------------------------------------------ | ------------ | ---------------------------------------- |
| Guest scans the table card, orders dine-in (TABLE_QR) | Guest   | template-lima; `docs/features/TABLE_QR_ORDERING.md` §7 | `UI-journey` | `tests/table-qr/tableQrOrdering.spec.ts` |
| Retired card falls back to the normal ordering page   | Guest   | same                                                   | `UI-journey` | `tests/table-qr/tableQrOrdering.spec.ts` |
| Table QR order arrives on the POS at the right table  | Staff   | POS Orders / Floor                                     | `none`       | —                                        |

### 1.24 Counts

Counted from the rows above (one row = one feature; a row with mixed coverage
is counted by its column value; the "Training HQ, supply shop …" pointer row
in 1.21 is not counted).

| Area                              | UI-journey | UI-load-only | API-only |   none |
| --------------------------------- | ---------: | -----------: | -------: | -----: |
| Orders & POS                      |          7 |            2 |       17 |     12 |
| Menu                              |          4 |            0 |        1 |      4 |
| Promotions                        |          6 |            0 |        0 |      1 |
| Tables & reservations             |          2 |            0 |        6 |      1 |
| Customers & rewards               |          4 |            0 |        1 |      4 |
| Gift cards                        |          2 |            0 |        3 |      2 |
| Staff & hiring                    |          2 |            2 |        4 |      2 |
| Scheduling                        |          2 |            0 |        5 |      0 |
| Time clock & timecards            |          2 |            0 |        6 |      1 |
| Tips & service charges            |          2 |            0 |        5 |      2 |
| Payroll & Gusto                   |          0 |            2 |        3 |      2 |
| Books, QuickBooks/Xero & deposits |          2 |            0 |        4 |      3 |
| Sales tax & Avalara               |          1 |            0 |        1 |      2 |
| Settings & settings safety        |          5 |            1 |        2 |      1 |
| Billing / subscription & add-ons  |          2 |            1 |        2 |      3 |
| Marketing                         |          4 |            0 |        0 |      3 |
| Analytics & reports               |          1 |            1 |        2 |      1 |
| Supply shop                       |          3 |            0 |        0 |      0 |
| Menu TV                           |          0 |            0 |        0 |      3 |
| Voice                             |          0 |            0 |        0 |      2 |
| HQ / admin                        |          6 |            0 |        2 |      3 |
| Customer ordering web             |          8 |            0 |        0 |      2 |
| Table QR                          |          2 |            0 |        0 |      1 |
| **Total (195 features)**          |     **67** |        **9** |   **64** | **55** |

Note: the "HQ / admin → none" count of 3 treats the long row of 20 HQ panels as
one feature; panel by panel, about 20 HQ screens have no spec.

---

## 2. Gaps ranked by risk

Order: money, payroll and tax first; then daily operations; then admin. Each
gap says what a QA tester would do, what must exist first, and whether
Playwright on QA can do it.

Two QA facts decide most "automatable?" answers:

- **Card money on QA.** The suite has only Stripe's publishable key. It already
  pays like a guest does: `tok_visa` → PaymentMethod → confirm the
  PaymentIntent (`api-pay-at-table.spec.ts`), and QA-only dummy Connect
  onboarding (`/stripe/test-onboarding`). A **card-present** tip needs a reader.
  The QA simulator registers a Stripe simulated reader
  (`POST /api/tablet/terminal/register-reader`, `simulated-wpe`, see
  `restaunax/docs/features/QA_RUN_A_DAY.md` §2), but presenting a card on a
  simulated reader is a Stripe test-helper call that needs the **secret** key,
  which the suite must not hold. Either the backend exposes a QA-only "present
  test card" route (as it does for test onboarding), or card tips come from
  the simulator's own run.
- **Partner sandboxes are connected by hand on named QA restaurants**, not on
  throwaway tenants: "my 2 store" (QuickBooks sandbox, Gusto demo, Avalara),
  "New Restaurant" (Xero), "Sally's Pizza" (control), Rehearsal Kitchen
  (QuickBooks, read-only in `@books-live`). Source:
  `restaunax/docs/features/QA_PARTNER_CONNECTIONS.md`. Tests there must be
  read-mostly and tagged so they can be excluded.

### Money, payroll and tax

| #   | Gap                                                                                                                                         | QA tester journey                                                                                                                                                                                                                                   | Preconditions                                                                                                           | Automatable on QA?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Real card tips → approved period → export / Gusto / pay stub** (only cash or `/preview` today)                                            | Server takes a card payment with a $5 tip on the reader; at period end the owner approves; Tips tab, export file, Gusto pay run and the staff pay stub all show $5 less the card-fee withholding.                                                   | PAYROLL add-on, tip policy with withholding, ended pay period, a card leg captured with a tip.                          | **Partly.** Online card tip: yes (wind checkout with `4242…` or the pay-at-table guest path, both already used). Card-present tip: needs a QA-only backend route to present a test card on the simulated reader, or read the tips the QA simulator produced. Ended period: backdate with weekly pay frequency + anchor (pattern in `api-payroll-export.spec.ts`), the tip must land in that period, so the order has to be placed in it: today only cash declarations can. Ask backend for a QA-only way, or assert on the simulator's restaurants next morning. |
| G2  | **Owner corrects a timecard and approves the period through the screens**                                                                   | Timecards → open Dee's shift with a missing clock-out → set 22:00, reason "forgot to clock out" → save: hours and overtime update; a missed-break flag → Review → approve; Approve period → locked banner; Reopen asks a reason.                    | SCHEDULING or PAYROLL; an ended period with a broken punch (create via the manager shift API first).                    | **Yes.** All throwaway-tenant: `createSecondOwner` + `setFeatureOverrideAdminRaw`, shifts via `POST /api/staff/payroll/:rid/shifts`. Assert in the dialog (message inside the open dialog, Save busy while saving), then reload and compare with `GET` timecards. Listed as not done in `docs/BACK_OFFICE_COVERAGE.md` and `restaunax/docs/features/back-office/TEST_COVERAGE.md` §6.5.                                                                                                                                                                          |
| G3  | **Pay period sent to Gusto (own Gusto P4 / RestauNax Payroll P5)**                                                                          | Payday → "Send to Gusto" → Gusto shows the period's hours and tips on the open payroll; Payday says sent; a second send is refused or idempotent. P5: add a staff member to RestauNax Payroll, finish onboarding, run payroll, staff sees the stub. | Gusto keys on QA Dokploy (added 2026-10-21 per QA_PARTNER_CONNECTIONS.md), a Gusto-connected restaurant ("my 2 store"). | **Partly.** OAuth consent and Gusto's own onboarding flows are third-party pages: do once by hand. After that, an `@partner` read-mostly spec on "my 2 store" can assert our Payday status and pay-run record. Re-check TC-625..627: they branch on "is Gusto configured", which is now true on QA, so their expected branch may have changed. Sending a real pay run each night writes to the Gusto demo company: run on demand, not nightly.                                                                                                                   |
| G4  | **Closed day posts to QuickBooks / Xero**                                                                                                   | Close the day → next hour Books & taxes shows the day "Posted" with a link; QuickBooks has one journal entry with sales, tax, tips that balance.                                                                                                    | ACCOUNTING_SYNC add-on, QBO sandbox (my 2 store) / Xero demo (New Restaurant), account matching done.                   | **Partly.** Our side (status, entry lines from the backend) yes, read-only on the connected restaurants. QuickBooks's own copy: only via our backend (no QBO credentials in the suite). Posting is a write to the sandbox; let the QA simulator's day close produce it and assert next run. Today only the journal is checked (`api-sales-tax-reports.spec.ts` TC-624).                                                                                                                                                                                          |
| G5  | **Card deposit matches the Stripe payout**                                                                                                  | Stripe pays out → Books & taxes → Deposits lists the payout with fees and bank line = payout, posted with `RNXD-…`.                                                                                                                                 | Connected account with Stripe test bank numbers (QA_PARTNER_CONNECTIONS.md §6), payouts actually happening.             | **Partly.** `api-books-deposits-live.spec.ts` TC-773 exists but skips while nothing is posted; finding F4 says Rehearsal Kitchen's deposits are stuck at "Accounts needed". Fix F4 first, then un-skip. Throwaway tenants can't get payouts.                                                                                                                                                                                                                                                                                                                     |
| G6  | **Avalara**                                                                                                                                 | Books & taxes → Avalara connected; after a day close the day appears in Avalara Transactions; Closed days list shows its orders and tax.                                                                                                            | Avalara sandbox on "my 2 store" (FL nexus).                                                                             | **Partly**, same model as G4: assert our Avalara section after the simulator's day; no spec today. Add a "dash, not $0.00" check once that owed fix lands (QA*PARTNER_CONNECTIONS.md \_Owed*).                                                                                                                                                                                                                                                                                                                                                                   |
| G7  | **Service charge → staff (#1078) and auto-gratuity settings**                                                                               | Owner turns on "share like tips", sets auto-gratuity 18% for 6+ guests; a 6-top check carries it; Tips/payroll shows staff share; without the add-on it's hidden.                                                                                   | PAYROLL / TIP_MANAGEMENT; table service on.                                                                             | **Yes**, API + one settings UI journey. POS check via tablet API (`createTabletOrderRaw`, `settleTabCashRaw`).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| G8  | **POS money paths with no test: tip after close, pay link, keyed card, partial refund, split by item, modify & recharge, void with refund** | Server enters a tip on a closed card order; sends a pay link and the guest pays from the phone; keys in a card; owner refunds one item; server splits a check by item; edits a paid order and recharges the difference.                             | REGISTER device + staff session; Stripe test Connect account.                                                           | **Mostly yes** via the tablet API plus Stripe publishable-key confirmation (pay link = same pattern as pay-at-table). Keyed card: the POS collects card data in Stripe's own sheet; at API level confirm with `tok_visa` if the backend intent is a normal card intent. Card-present capture: no (reader).                                                                                                                                                                                                                                                       |
| G9  | **Day close on the POS and on the web**                                                                                                     | Manager: Close day wizard → count drawer → deposit → summary; storefront and POS refuse orders until next opening; Open day next morning. Owner: Daily Report → Close day.                                                                          | REGISTER device, register session open.                                                                                 | **Yes** (tablet API `/api/tablet/day-close`, `/api/tablet/day-open`; web `CloseDayWizardDialog` via UI). Use a throwaway tenant: a close pauses ordering (QA_RUN_A_DAY.md §2 item 8).                                                                                                                                                                                                                                                                                                                                                                            |
| G10 | **Owner billing: payment method, bank verification, invoices, payouts tab, disputes**                                                       | Owner adds a bank account, verifies with micro-deposits, sees invoices; Payouts lists yesterday's payout with its orders; a dispute appears with "Submit evidence".                                                                                 | Real subscription (only the seed restaurant has one on QA, `BACK_OFFICE_COVERAGE.md`).                                  | **Partly.** Payouts / earnings / disputes read screens: yes on the seed or a simulator restaurant (chargeback is produced by the simulator's `pm_card_createDispute`, QA_RUN_A_DAY.md §3). Changing the seed's payment method: no (shared, irreversible-ish); do by hand.                                                                                                                                                                                                                                                                                        |
| G11 | **Sales tax report and service-fee settings through the screens**                                                                           | Store Settings → Sales tax: add a rate, mark a category tax-free; Service fee form; report tab totals match orders.                                                                                                                                 | none beyond a throwaway tenant.                                                                                         | **Yes.** The rules are API-proven (`api-sales-tax-reports.spec.ts`, `api-service-fee.spec.ts`); add one UI journey each.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G12 | **Gift card sold / activated at the register; liability card**                                                                              | Cashier sells a $25 card (cash), activates a physical card from stock; guest spends it online; owner sees liability go up then down.                                                                                                                | REGISTER device; minted batch (pattern in `admin/gift-card-batches.spec.ts`).                                           | **Yes**, tablet API + wind checkout UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Daily operations

| #   | Gap                                                                                          | QA tester journey                                                                                                                                         | Preconditions                                             | Automatable on QA?                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| G13 | **Invite an employee and build/publish the schedule through the screens**                    | People → Invite → email → employee registers; Schedule grid → add shifts by drag/dialog → Publish → staff email; Requests → approve time off with a note. | SCHEDULING, Mailpit.                                      | **Yes.** APIs proven; UI flows listed as not done (`BACK_OFFICE_COVERAGE.md`). Drag may need the dialog path instead of a drag gesture.    |
| G14 | **Menu publish (employee)**                                                                  | Employee opens Publish, publishes, storefront shows the new menu.                                                                                         | `EMPLOYEE_EMAIL`/`PASSWORD`.                              | **Yes.** Scaffold exists: `tests/dashboard/employee/menu-publish.spec.ts` (fixme).                                                         |
| G15 | **Customer availability gates**                                                              | Owner pauses ordering → storefront shows "not taking orders"; unpublished store is browse-only; closed store forces "Schedule for later".                 | Throwaway restaurant with an ordering slug (lima).        | **Yes** on a throwaway tenant (never the seed). TEST_PLAN.md roadmap item.                                                                 |
| G16 | **Wind member login + points**                                                               | Member logs in with OTP on wind, earns points on an order, redeems next time.                                                                             | QA test phone / OTP readable (TEST_PLAN.md "Still open"). | **Partly**: lima has OTP login (TC-L50); wind needs the same helper.                                                                       |
| G17 | **Menu TV pairing and display**                                                              | Owner pairs a TV with the code shown on the screen, picks a layout; TV shows the menu; an 86 disappears on the TV.                                        | MENU_TV add-on, the tv-display web app on QA.             | **Yes** for pairing (tv-display is a Vite web app: open it in a browser page, read the code, pair from the dashboard). Kiosk hardware: no. |
| G18 | **Table QR order reaches the right table on the POS**                                        | Guest orders from the table card; POS floor shows the order on T4; server settles it.                                                                     | table service on; card printed (fixture).                 | **Yes**, extend `tests/table-qr/tableQrOrdering.spec.ts` with tablet API reads.                                                            |
| G19 | **Delivery dispatch (Uber Direct)**                                                          | Delivery order → courier requested → status updates → cancel fee handling.                                                                                | Uber Direct test credentials on QA.                       | **Unknown**: depends on Uber sandbox on QA; if absent, keep to backend integration tests.                                                  |
| G20 | **POS screens themselves** (timecard review, reports, kiosk, make line, menu edit, settings) | as on the device                                                                                                                                          | real device or emulator.                                  | **No** in Playwright. Belongs in `device-in-store` (Jest + `.maestro/`).                                                                   |

### Admin

| #   | Gap                                                                                                          | QA tester journey                                                  | Automatable on QA?                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| G21 | HQ add-on attach / remove through the HQ screen                                                              | HQ → Add-ons → pending request → Attach → owner sees it included.  | **Yes.** API proven (`api-addon-billing.spec.ts`); add the HQ click path.                                                            |
| G22 | QA "Run a day" simulator panel                                                                               | HQ → Demo Data → Test restaurants → Run today → report; Check now. | **Yes**, and worth it: it is the source of "a real day" for G1/G3–G6. Never on restaurants others test by hand (it pauses ordering). |
| G23 | Domains, short links, app versions, system logs, support, finance, equipment, disputes, partners, voice mgmt | open each, do its main action.                                     | **Yes** for most (load + one action). Domains touches Cloudflare: read-only only.                                                    |
| G24 | Chains admin in the browser                                                                                  | HQ → Chains → create, link, unlink.                                | **Yes**; `tests/dashboard/admin/chains.spec.ts` is API-level today.                                                                  |

### Top 10 (in order)

1. G1 real card tips through payroll
2. G2 timecard correction + approval in the UI
3. G3 Gusto send / RestauNax Payroll
4. G4 day posts to QuickBooks / Xero
5. G5 card deposit matches payout
6. G8 POS money paths (tip after close, pay link, keyed card, partial refund, split by item, recharge)
7. G9 day close (POS + web)
8. G6 Avalara
9. G7 service charge → staff and auto-gratuity
10. G13 hire + schedule + requests through the screens

---

## 3. Proposed "restaurant week" end-to-end journey

One story, one restaurant, run in order. Each phase is one PR, one spec file
under a new `tests/journey/` folder, sharing a tenant created in phase 0 and
saved to a JSON state file (as `globalSetup` does for the seed). A phase can
also run alone by creating what it needs.

**Two tracks.** Track A (phases 0–6) runs on a **throwaway tenant** every
night: everything RestauNax owns. Track B (phase 7) runs **read-mostly** on the
partner-connected QA restaurants after the QA simulator's day, tagged
`@partner`, so a broken sandbox never blocks the nightly.

### Visible-feedback checks (one helper, used in every UI step)

Add `utils/visibleFeedback.ts` with:

- `expectMessageInActiveDialog(page, text|regex)`: the success or error text
  is inside the dialog that is open (`role=dialog` topmost), not only a
  snackbar behind it.
- `expectBusyWhile(button, action)`: while the request is in flight the button
  is disabled or `aria-busy`, and enabled again after.
- `expectPersistsAfterReload(page, read)`: reload and read the same value back.
- `expectNoRawText(page)`: no raw i18n key (`/\b[a-z]+(\.[a-zA-Z0-9]+){2,}\b/`
  on visible text), no `NaN`, `undefined`, `null`, `$NaN`, `Invalid date`.
- Run each phase also with the account language set to Spanish once
  (`api-ux-audit.spec.ts` TC-658 shows how), since `restaunax` requires EN+ES.

### Phase 0: open the restaurant (PR 1)

**Built (2026-10-29), phases 0–2 together:**
`tests/dashboard/journey/01-open-hire-schedule.spec.ts`, TC-978..989.

- **Roles:** HQ admin (API), Owner (UI).
- **Steps:** `createSecondOwner`; grant PAYROLL + SCHEDULING + TIP_MANAGEMENT
  (packages only, per `BACK_OFFICE_COVERAGE.md`) by override; dummy Stripe
  Connect onboarding; ordering slug; tax rate 7%; a small menu (burger, fries,
  beer in an alcohol category); table service on, two tables; weekly pay
  frequency with the anchor set so **last week is a finished period**; REGISTER
  device + `tabletLogin`.
- **Assertions:** Back-office setup card ticks each step from real data
  (TC-943 pattern); Staff tabs present for the add-ons; no raw text.

### Phase 1: hire (PR 2)

- **Roles:** Owner (UI), new employee (browser + Mailpit), Manager (POS API).
- **Steps:** Jobs & wages → add Server $12.00 and Busser $11.00 in the UI;
  People → Invite Dee as Staff with job Server; Mailpit invite → register with
  the link; owner gives Dee her own wage $13.00 in the UI; manager sets a PIN.
- **Assertions:** the invite dialog shows "Invitation sent" inside the dialog;
  Save busy while saving; Dee on the list after reload with "Has account";
  Dee signs in on the POS (`tabletStaffSignIn`) and Staff role can't discount
  (TC-558 pattern).

### Phase 2: schedule (PR 3)

- **Roles:** Owner (UI), Dee (Restaunax Staff API).
- **Steps:** Schedule → this week → add Dee Mon–Fri 11:00–19:00 through the
  shift dialog, Busser shifts; check the week cost in dollars; Publish; Dee
  asks for Thursday off; owner opens Requests → Approve with a note.
- **Assertions:** cost = hours × $13.00 to the cent (TC-570 math); publish
  confirmation names how many people are told; Mailpit has one email per
  person; staff API shows published shifts only; the approved request shows
  the note and a warning on Thursday's shift; persists after reload.

### Phase 3: service day (PR 4)

**Built (2026-10-29):** `tests/dashboard/journey/02-service-day.spec.ts`,
TC-990..1000. Differences from the plan, and why:

- No tip on the counter cash sale: a single-tender cash sale is created with
  tip 0 and paid by `mark-paid`, which takes no tip (device-in-store does the
  same). The cash tip is on T1's second leg instead.
- The owner holds the drawer and takes the cash. Dee ringing an order is fine,
  but a cash payment into someone else's drawer is refused
  (`DRAWER_NOT_YOURS`); TC-991 checks that refusal.
- The manager-approved discount and pay-at-table move to the POS money paths
  phase; both are API-proven already (`api-discount-permissions`,
  `api-pay-at-table`).
- The 30-minute break is started and ended at once (a real clock can't be
  faked). Phase 4 corrects hours on last week's seeded shifts instead.

- **Roles:** Dee (POS API), Manager (POS API), Guest (wind or lima UI).
- **Steps:** open register; Dee clocks in as Server (clock-in rule WARN);
  counter cash order with $3 tip; open check on T1, add items, 18%
  auto-gratuity off, settle in two cash legs; manager-approved 10% discount;
  a guest web order with a $4 card tip (Stripe test card); pay-at-table guest
  pays T2 with `tok_visa`; Dee takes and ends a 30-min unpaid break; clocks
  out; close the register with a blind count; **close the day** (G9).
- **Assertions:** each POS response's breakdown total = server quote; owner
  Orders tab lists every order with Receipt # (never relabelled "Order #");
  Daily Report KPIs = sum of the orders; after day close the storefront shows
  the paused banner (G15).

### Phase 4: owner reviews the week (PR 5)

- **Roles:** Owner (UI).
- **Steps:** Needs you today shows last week's period to approve → button →
  Timecards on that period (TC-952). Last week was made in phase 0 setup with
  manager shift entries, including one shift with no clock-out and one missed
  meal break. Correct the missing clock-out in the shift dialog with a reason;
  review the missed break; Approve period; try Reopen without a reason.
- **Assertions:** corrected hours and overtime update in the open dialog and
  in the period total; approve is refused while the break is unreviewed with
  the server's sentence shown in the dialog; after approval the period reads
  locked after reload; Reopen without reason is refused in words; labor report
  = timecards (TC-585 numbers).

### Phase 5: tips (PR 6)

- **Roles:** Owner (UI).
- **Steps:** Tip policy → Waterfall preset (servers give 20% to bussers) →
  Save; Tips tab for this week's day and the approved period.
- **Assertions:** this week: Gave / Received to the cent for the phase-3 cash
  and card tips (the card tip shows the withholding); the approved period:
  declared tips frozen in the approval; tips CSV = the tab; no false
  "nobody worked as Bartender" notes on empty days (open finding B3, mark
  `test.fail` until fixed).

### Phase 6: payroll out (PR 7)

- **Roles:** Owner (UI), Dee (staff API).
- **Steps:** Payday → deadline text; Export → RestauNax and Gusto CSV
  downloads; Dee's pay stub.
- **Assertions:** downloaded file rows = the approval totals (TC-599/600
  checks, but through the download button); a re-export is identical;
  Payday says "exported"; staff API shows the approved hours and wages; busy
  state on the export button.

### Phase 7: the books (PR 8, `@partner`, Track B)

- **Where:** "my 2 store" (QuickBooks sandbox + Gusto demo + Avalara),
  "New Restaurant" (Xero), "Sally's Pizza" (control), after the QA simulator
  ran their day (`restaunax/docs/features/QA_RUN_A_DAY.md`).
- **Steps (read-mostly):** Books & taxes → yesterday Posted (QuickBooks /
  Xero); Deposits → payout row matches the Stripe payout, posted; Avalara →
  closed day listed; Payday → period sent to Gusto (status only); Sally's
  Pizza: day closes with nothing connected and no error banners.
- **Assertions:** entry balances (debits = credits); deposit bank line =
  payout amount; doc number `RNXD-yymmdd-…`; Avalara day tax = sales tax
  report; no "failed" chips; accountant view (TC-777 pattern) shows the same
  numbers.
- **Guard:** never post, connect or send from this phase; exclude with
  `--grep-invert @partner` like `@books-live` today.

### Phase 8: numbers agree (PR 9)

- **Steps:** API reads only, on the Track A tenant.
- **Assertions:** sales tax report = orders; sales-by-day CSV = Daily Report;
  partner API `/days` (create a key) = the same day; A1 journal = the same
  sales and tax (TC-623/624/756 pattern, but for the journey's own day).

---

## 4. Out of scope for Playwright

| What                                                                                  | Why                           | Where its tests belong                                                                                            |
| ------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Owner mobile app screens (orders, menu, staff, billing, chain scope)                  | React Native                  | `Restaunax-Owner` (Jest, 213 test files). Its backend calls are covered here where they share routes              |
| Restaunax Staff app screens (my shifts, hours, tips, requests)                        | React Native                  | `Restaunax-Staff` (Jest, 22 test files). Its API contract is covered here (`api-staff-requests.spec.ts` etc.)     |
| Customer ordering app                                                                 | React Native                  | `restaunax-ordering-app` (Jest + `.maestro/` / `maestro/`)                                                        |
| POS screens, kiosk, make line, timecard review, role picker on device                 | React Native on Sunmi devices | `device-in-store` (Jest, 394 test files, `.maestro/`)                                                             |
| Card readers (M2, Terminal), receipt and label printers, cash drawer, barcode scanner | Hardware                      | `docs/PHYSICAL_TEST_LEDGER.md` (this repo) + `device-in-store/HARDWARE_SMOKE_TEST.md`                             |
| Menu TV kiosk player (Linux + Chromium box)                                           | Hardware / OS kiosk           | `restaunax-tv-display` (the web app itself can be driven by Playwright, see G17)                                  |
| Real SMS delivery, push notifications (FCM / APNs)                                    | Carrier / store builds        | `docs/PHYSICAL_TEST_LEDGER.md`; `restaunax/docs/features/back-office/TEST_COVERAGE.md` §6.7                       |
| Live phone calls (voice ordering)                                                     | Non-deterministic, telephony  | `restaunax` (`restaunax-voice/` tests, `docs/features/VOICE_TEST_COVERAGE.md`)                                    |
| Third-party consent pages (Gusto, QuickBooks, Xero, Avalara OAuth; Gusto onboarding)  | Partner UIs                   | Done once by hand per `restaunax/docs/features/QA_PARTNER_CONNECTIONS.md`; logic in `restaunax` integration tests |
| Apple Pay / Google Pay, Stripe webhook "authorize then leave"                         | Wallets / webhooks            | `restaunax` integration tests (`BACK_OFFICE_COVERAGE.md` → Pay at the table)                                      |
| Social posting, AI image/video                                                        | External OAuth / paid APIs    | none (TEST_PLAN.md out of scope)                                                                                  |

---

## Sources read

- `Automation`: `TEST_PLAN.md` (_Implemented Today_, _Roadmap_), `CLAUDE.md`,
  `docs/BACK_OFFICE_COVERAGE.md`, `docs/PHYSICAL_TEST_LEDGER.md`,
  `tests/pos/README.md`, test titles of every `tests/**/*.spec.ts`.
- `restaunax`: `restaunax-frontend/src/components/RestaurantManagement/PortalShell.tsx`
  (tabs), `storeSettingsNav.ts`, `components/Staff/StaffDashboard.tsx`,
  `components/{BooksTaxes,Subscription,Staff/payroll,MenuTvs,Promotions}`,
  `src/Admin/components/*`, `routers/*` (paths), `restaunax-backend/src/routes/*`,
  `docs/features/QA_RUN_A_DAY.md`, `QA_PARTNER_CONNECTIONS.md`,
  `back-office/TEST_COVERAGE.md`, `back-office/SETTINGS_SAFETY.md`,
  `TABLE_QR_ORDERING.md`.
- `device-in-store`: `src/screens/*`, `src/components/*` (origin/qa).

Caveat: coverage was judged from spec titles, the coverage docs and page-call
counts per file, not by running the suite. A spec whose title promises more
than its body proves would be over-counted here.
