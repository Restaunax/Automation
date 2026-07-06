# Restaunax Automation — Test Suite Reference

This repo contains Playwright E2E tests for the Restaunax platform. Tests target the **QA/Staging** environment. Credentials live in `.env`.

---

## Platform Overview

Restaunax is a SaaS platform that provides software for restaurants. It has five distinct applications:

| App                    | Location                           | Who uses it                                            |
| ---------------------- | ---------------------------------- | ------------------------------------------------------ |
| **Restaunax Backend**  | `../RestauNax/restaunax-backend/`  | API server (Node/Express/Prisma)                       |
| **Restaunax Frontend** | `../RestauNax/restaunax-frontend/` | Owner + Admin dashboard (React 19 + Vite)              |
| **Template Wind**      | `../template-wind/`                | Customer-facing ordering site (Next.js 15)             |
| **Ordering App**       | `../restaunax-ordering-app/`       | Customer mobile app (React Native + Expo)              |
| **Device In Store**    | `../device-in-store/`              | Restaurant POS / kitchen display (React Native + Expo) |

---

## Roles & What They Can Do

| Role                | Login method                          | Primary UI                                                                                                                                                                                | Backend prefix                                             |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `ADMIN`             | Email + password at `/sign-in`        | `/admin` dashboard                                                                                                                                                                        | `/api/admin/*`                                             |
| `OWNER`             | Email + password at `/sign-in`        | `/restaurant/*` pages                                                                                                                                                                     | `/restaurant`, `/menu`, `/api/order`, `/api/coupons`, etc. |
| `EMPLOYEE`          | Email + password                      | **Company-side** setup staff: can create restaurants, **publish menus**, edit **tax**, manage register devices; **cannot** invite staff. Not "owner with fewer perms" — see TEST_PLAN.md. | `/restaurant/*` + `/publish`, `/tax`                       |
| `RESTAURANT_STAFF`  | Tablet name + code at Device In Store | `TabletLoginScreen` → `OrdersScreen`                                                                                                                                                      | `/api/tablet/*`                                            |
| `Customer (guest)`  | No login                              | Template Wind `/menu` → `/checkout`                                                                                                                                                       | `/api/order/new/restaurantId/*`                            |
| `Customer (member)` | OTP phone login                       | Template Wind `/menu` → `/checkout`                                                                                                                                                       | Same + `/login/send-otp`, `/api/rewards/*`                 |

---

## Key Backend Routes by Role

### Owner

| Route prefix        | What it covers                 |
| ------------------- | ------------------------------ |
| `/restaurant`       | Create, edit, list restaurants |
| `/menu`             | Menu categories and items      |
| `/api/order`        | Orders, order statistics       |
| `/api/coupons`      | Coupon CRUD + campaigns        |
| `/api/deals`        | Deals + AI generation          |
| `/api/rewards`      | Loyalty reward programs        |
| `/api/gift-cards`   | Gift cards                     |
| `/api/analytics`    | Analytics & reports            |
| `/api/employees`    | Employee management            |
| `/api/tablet`       | POS tablet devices             |
| `/api/delivery`     | Delivery service integration   |
| `/api/social-media` | Social media accounts + posts  |
| `/api/marketing`    | Marketing campaigns            |
| `/api/voice`        | Voice ordering config          |
| `/api/media`        | AI video/image generation      |

### Admin

| Route prefix               | What it covers            |
| -------------------------- | ------------------------- |
| `/api/admin/restaurants`   | Restaurant management     |
| `/api/admin/chains`        | Chain administration      |
| `/api/admin/subscriptions` | Subscription management   |
| `/api/admin/leads`         | Lead onboarding           |
| `/api/admin/finance`       | Finance reports           |
| `/api/admin/equipment`     | Equipment tracking        |
| `/api/admin/expenses`      | Business expense tracking |
| `/api/admin/gift-cards`    | Gift card admin           |
| `/api/admin/social-media`  | Social media admin        |
| `/api/admin/print-orders`  | Print order management    |
| `/api/admin/system-logs`   | System error logs         |
| `/api/admin/demo`          | Demo request management   |

### Public / Customer

| Route prefix                           | What it covers                     |
| -------------------------------------- | ---------------------------------- |
| `/register`, `/login`                  | Auth                               |
| `/api/public/chains/*`                 | Chain info + locations             |
| `/api/order/restaurantId/*`            | Menu + restaurant data             |
| `/api/order/new/restaurantId/*`        | Create order                       |
| `/api/stripe/*`                        | Payment processing                 |
| `/login/send-otp`, `/login/verify-otp` | Customer OTP login (Template Wind) |
| `/login/mobile/*`                      | Customer OTP login (mobile app)    |

---

## Key Frontend Routes (Restaunax Dashboard)

| Who                    | Path                                                | Screen              |
| ---------------------- | --------------------------------------------------- | ------------------- |
| Owner                  | `/restaurant/stores`                                | My restaurants list |
| Owner                  | `/restaurant/restaurantId/:id/restaurantManagement` | Restaurant editor   |
| Owner                  | `/restaurant/restaurantId/:id/subscription`         | Billing & plan      |
| Employee, Admin        | `/restaurant/restaurantId/:id/publish`              | Menu publishing     |
| Employee, Admin        | `/restaurant/restaurantId/:id/tax`                  | Tax settings        |
| Owner, Employee, Admin | `/restaurant/restaurantId/:id/uber`                 | Uber Eats settings  |
| Employee, Admin        | `/restaurant/loyalty`                               | Loyalty program     |
| Admin                  | `/admin`                                            | Admin dashboard     |
| Staff                  | `/staff`                                            | Staff portal        |
| Public                 | `/sign-in`, `/sign-up`                              | Auth pages          |
| Public                 | `/demo`                                             | Demo booking form   |
| Public                 | `/affiliate`                                        | Affiliate signup    |

---

## Template Wind — Customer Ordering Site

**Base URL:** `TEMPLATE_WIND_URL` env var (e.g. `https://qa.restaunax.com`)

**Deployment:** Each restaurant gets its own deployment. QA override: append `?restaurantId=<id>` to skip the location picker.

### Key Pages

| Path                            | Purpose                                |
| ------------------------------- | -------------------------------------- |
| `/menu`                         | Browse menu, add items to cart         |
| `/checkout`                     | Service type → customer info → payment |
| `/order-confirmation/[orderId]` | Post-payment confirmation              |
| `/deals/[dealId]`               | Deal detail                            |
| `/gift-cards`                   | Gift card purchase                     |
| `/loyalty`                      | Loyalty program info                   |

### Customer Ordering Flow

1. `/menu` → browse → tap item → select modifiers → Add to Cart
2. `/checkout` → fill name/email/phone → pick Pickup or Delivery + time → tip → optional coupon/points → Stripe payment
3. `/order-confirmation/[orderId]` → verify order number, items, totals

### Cart

- Stored in **SessionStorage**, keyed by `restaurantId`
- Reward member token stored in **localStorage** (`rewardToken`)

---

## Device In Store — POS

**Auth:** `POST /api/tablet/login` (tablet name + alphanumeric code) → JWT

### Order Lifecycle

```
PENDING → CONFIRMED → PREPARING → READY → PICKED_UP / DELIVERED
```

- Accept order: `PUT /api/order/orderId/{orderId}/status`
- Cancel order: `POST /api/tablet/cancel-order/{orderId}`

### Real-Time

- Socket.IO events: `newOrder`, `orderStatusUpdated`, `deliveryStatusUpdated`
- Fallback poll: `GET /api/order/restaurants/{restaurantId}/orders/current`

---

## Ordering App — Mobile

**Auth:** OTP phone login — `POST /login/mobile/send-otp` → `POST /login/mobile/verify-otp` → token in expo-secure-store

**Order flow:** Same backend as Template Wind — `POST /api/order/new/restaurantId/{id}` → Stripe → confirmation

**Mobile tests:** Use API-level calls via `apiHelper.ts`; no UI automation for the native app.

---

## Complete Scenario Map

| Test scenario                              | Where it happens                                | Key endpoints                                    |
| ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------ |
| Customer places an order                   | Template Wind `/menu` → `/checkout`             | `POST /api/order/new/restaurantId/{id}` → Stripe |
| Restaurant sees new order                  | Device In Store (Socket.IO)                     | `GET /api/order/restaurants/{id}/orders/current` |
| Staff accepts / prepares / completes order | Device In Store (API)                           | `PUT /api/order/orderId/{id}/status`             |
| Owner creates a restaurant                 | Frontend `/restaurant/new`                      | `POST /restaurant/new`                           |
| Owner edits menu                           | Frontend `/restaurant/.../restaurantManagement` | `/menu` routes                                   |
| Owner views orders                         | Frontend order management                       | `GET /api/order/*`                               |
| Owner sets up coupons                      | Frontend coupon section                         | `/api/coupons`                                   |
| Admin views demo requests                  | Frontend `/admin` → demo tab                    | `GET /api/admin/demo`                            |
| Admin manages restaurants                  | Frontend `/admin`                               | `/api/admin/restaurants`                         |

---

## Test Structure

Organized **app → role → feature**. See `TEST_PLAN.md` for the canonical
reference (conventions, role model, how to add a test).

```
tests/
  dashboard/        — Restaunax dashboard (project: dashboard, baseURL FRONTEND_URL)
    public/         — Unauthenticated (demo form, sign-in/up)
    admin/          — Company admin manages everything
    owner/          — Restaurant client manages their own restaurant(s)
    employee/       — Company-side setup staff (publish/tax/create restaurant)
    staff/          — Thin /staff PIN-card stub (web)
  customer/         — Customer ordering (project: customer, baseURL TEMPLATE_WIND_URL)
  pos/              — Device In Store / POS — API-level placeholder (not a project)

pages/
  dashboard/
    auth/  public/  admin/  owner/   — POMs mirror the test axis
    restaurant/                      — role-agnostic POMs shared by owner/employee/admin (e.g. MenuManagementPage)
  customer/                          — Template Wind POMs (CustomerMenuPage, CustomerCheckoutPage, CustomerOrderConfirmationPage)
```

---

## Test Utilities

| File                   | Exports                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `utils/apiHelper.ts`   | `apiLogin()`, `createTestRestaurant()`, `deleteTestRestaurant()`                                |
| `utils/testData.ts`    | `generateDemoFormData()`, `generateRestaurantData()`, `readSharedState()`, `writeSharedState()` |
| `utils/emailHelper.ts` | Mailtrap API polling for email verification                                                     |
| `utils/stripeCards.ts` | Stripe test card constants                                                                      |
| `fixtures/base.ts`     | `ownerPage`, `adminPage`, `demoBookingPage` — auto-restores auth sessions                       |

---

## Auth & Session Management

- **Owner/Admin:** JWT from `POST /api/login`; sessions saved as `owner-auth.tmp.json` / `admin-auth.tmp.json`
- **Tablet/Staff:** JWT from `POST /api/tablet/login`; use directly in API calls
- **Customer (web):** No auth for guest; OTP for reward member (`POST /login/send-otp`)
- **Customer (mobile):** OTP via `POST /login/mobile/send-otp`

`globalSetup.ts` creates owner + admin + employee sessions before tests run. `globalTeardown.ts` cleans up test data: seed menu item/group, automation-created categories (`Test Starters *`/`TC45 Delete *`), `AUTO*` coupons, recorded test users, and this run's demo request.

---

## Environment Variables

```bash
# Restaunax dashboard + backend
FRONTEND_URL=https://app.qa.restaunax.com
BACKEND_URL=https://api.qa.restaunax.com

# Credentials (accounts already exist in QA)
OWNER_EMAIL=...
OWNER_PASSWORD=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...

# Customer storefront
TEMPLATE_WIND_URL=https://qa.restaunax.com
# Optional: pin the customer-site restaurant / the seed restaurant
TEMPLATE_WIND_RESTAURANT_ID=...
SEED_RESTAURANT_ID=...

# Email testing
MAILTRAP_API_TOKEN=...
MAILTRAP_INBOX_ID=...
TEST_EMAIL_DOMAIN=restaunax-test.com
```

---

## Run Commands

```bash
npm run test          # All tests, headless
npm run test:headed   # Visible browser
npm run test:ui       # Interactive Playwright UI
npm run test:debug    # Step-through debugger
npm run test:ci       # CI mode with Allure reporter
npm run report        # Generate + open Allure HTML report
npm run clean         # Delete test artifacts
```
