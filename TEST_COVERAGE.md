# Restaunax — Test Coverage Map

> Last updated: 2026-06-15

---

## Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Covered and passing |
| ⏭️ | Covered but skipped (missing env credentials) |
| ❌ | Not covered — needs to be written |
| ⚠️ | Partially covered — dialog opens but feature not fully tested |

---

## 🔐 Admin

| Feature | Test | Status |
|---------|------|--------|
| Demo form submission | TC-01 | ✅ |
| Confirmation email sent | TC-02 | ⏭️ Skipped (Mailtrap not configured) |
| Admin login | TC-03 | ✅ |
| Find demo request by email | TC-04 | ✅ |
| Demo action menu items visible | TC-05 | ✅ |
| Change demo status inline | TC-06 | ✅ |
| View/Edit details side sheet | TC-07 | ⚠️ Opens only — fields not verified |
| Send follow-up email dialog | TC-08 | ⚠️ Opens only — email not sent |
| Assign request dialog | TC-10 | ⚠️ Opens only — assignment not tested |
| Schedule demo dialog | TC-11 | ⚠️ Opens only — date not set |
| Delete confirmation + cancel | TC-09 | ⚠️ Cancel path only — actual delete not tested |
| Proceed to onboarding navigation | TC-12 | ✅ |
| Admin restaurant list | — | ❌ Not written |
| Admin subscription management | — | ❌ Not written |
| Admin finance reports | — | ❌ Not written |
| Admin system logs | — | ❌ Not written |
| Admin leads management | — | ❌ Not written |
| Admin chains management | — | ❌ Not written |

---

## 🏠 Owner

| Feature | Test | Status |
|---------|------|--------|
| My Restaurants list page loads | TC-13 | ⏭️ Skipped (no owner credentials) |
| Seed restaurant card visible | TC-14 | ⏭️ Skipped (no owner credentials) |
| Restaurant management portal loads | TC-15 | ⏭️ Skipped (no owner credentials) |
| Store Settings sidebar navigation | TC-16 | ⏭️ Skipped (no owner credentials) |
| Tax settings page loads | TC-17 | ⏭️ Skipped (no owner credentials) |
| Save tax rate | TC-18 | ⏭️ Skipped (no owner credentials) |
| Menu tab loads | TC-19 | ⏭️ Skipped (no owner credentials) |
| Create menu category | TC-20 | ⏭️ Skipped (no owner credentials) |
| Add menu item to category | TC-21 | ⏭️ Skipped (no owner credentials) |
| Hours of operation setup | — | ❌ Not written |
| Publish restaurant | — | ❌ Not written |
| Unpublish restaurant | — | ❌ Not written |
| View orders list | — | ❌ Not written |
| Create coupon | — | ❌ Not written |
| Create deal | — | ❌ Not written |
| Employee management | — | ❌ Not written |
| Loyalty rewards setup | — | ❌ Not written |
| Analytics dashboard | — | ❌ Not written |
| Billing / subscription | — | ❌ Not written |
| Uber Eats settings | — | ❌ Not written |
| Edit restaurant info | — | ❌ Not written |

---

## 🛒 Customer

| Feature | Test | Status |
|---------|------|--------|
| Menu page loads | TC-22 | ⏭️ Skipped (no owner credentials) |
| Open item modal + Add to Cart visible | TC-23 | ⏭️ Skipped (no owner credentials) |
| Checkout form visible with cart | TC-24 | ⏭️ Skipped (no owner credentials) |
| Fill checkout form + proceed to payment | TC-25 | ⏭️ Skipped (no owner credentials) |
| Complete full order with Stripe card | TC-26 | ⏭️ Skipped (no owner credentials) |
| Delivery order (address + delivery fee) | — | ❌ Not written |
| Apply coupon at checkout | — | ❌ Not written |
| OTP member login (phone number) | — | ❌ Not written |
| Loyalty points redemption | — | ❌ Not written |
| Gift card purchase | — | ❌ Not written |
| Declined payment handling | — | ❌ Not written |
| Order with modifiers selected | — | ❌ Not written |

---

## 📱 Staff / POS (Device In Store)

| Feature | Test | Status |
|---------|------|--------|
| Tablet login with name + code | — | ❌ Not written |
| View incoming orders | — | ❌ Not written |
| Accept / confirm an order | — | ❌ Not written |
| Mark order as preparing | — | ❌ Not written |
| Mark order as ready | — | ❌ Not written |
| Mark order as picked up / delivered | — | ❌ Not written |
| Cancel an order | — | ❌ Not written |

---

## 🔗 End-to-End Journeys

| Journey | Status |
|---------|--------|
| Demo submitted → Admin finds and processes it | ⚠️ Partial (TC-01, TC-04–TC-12) |
| Owner publishes menu → Customer can see and order | ❌ Not written |
| Customer places order → Staff sees it → Staff accepts | ❌ Not written |
| Customer places order → Owner views it in dashboard | ❌ Not written |
| Admin onboards demo → Restaurant is live | ❌ Not written |

---

## 📊 Coverage Summary

| Area | Written | Passing | Skipped | Not Written |
|------|---------|---------|---------|-------------|
| Admin | 12 | 10 | 1 | 6 |
| Owner | 9 | 0 | 9 | 12 |
| Customer | 5 | 0 | 5 | 7 |
| Staff / POS | 0 | 0 | 0 | 7 |
| End-to-End | 0 | 0 | 0 | 5 |
| **Total** | **26** | **10** | **15** | **37** |

> **Overall coverage: ~41% of known features have tests written**

---

## 🎯 Recommended Next Batch — Priority Order

| Priority | Area | Reason |
|----------|------|--------|
| 🔴 1 | Staff / POS — order lifecycle | Zero coverage on core business flow |
| 🔴 2 | Owner — publish restaurant | Blocker for customer tests to work |
| 🔴 3 | Owner — hours of operation | Required before orders can be accepted |
| 🟡 4 | Owner — view orders | Owners need to monitor revenue |
| 🟡 5 | Owner — create coupon | High-value marketing feature |
| 🟡 6 | Customer — delivery order | Second most common order type |
| 🟡 7 | Admin — restaurant list | Admin oversight of all clients |
| 🟢 8 | Customer — apply coupon | Common checkout variation |
| 🟢 9 | Full E2E — customer orders → staff accepts | Validates entire platform works together |
| 🟢 10 | Admin dialogs — actually test features inside | Current tests only check dialogs open |

---

## ⚠️ Known Technical Debt

| Issue | Affected Tests | Risk |
|-------|---------------|------|
| Submit button label unknown | TC-21 | 🔴 High — regex fallback may not match |
| Category container selector unverified | TC-20, TC-23 | 🔴 High — may select wrong element |
| Pickup radio may be custom styled (not `<input>`) | TC-25, TC-26 | 🔴 High — click may do nothing |
| Stripe iframe selector unverified | TC-26 | 🔴 High — card fill may silently fail |
| Seed restaurant not published | TC-22–TC-26 | 🔴 High — menu page may redirect |
| TC-12 onboarding URL regex unverified | TC-12 | 🟡 Medium |
| TC-16 tab URL encoding unverified | TC-16 | 🟡 Medium |
| TC-06 leaves status as "Contacted" on QA | TC-06 | 🟡 Medium — dirty test data |
| TC-18 leaves tax rate at 8.5% on QA | TC-18 | 🟡 Medium — dirty test data |
| TC-20/21 leave category + item on QA | TC-20, TC-21 | 🟡 Medium — dirty test data |
| MUI class selectors fragile to upgrades | TC-14, TC-15, TC-20 | 🟢 Low |
| TC-03 only checks URL not dashboard content | TC-03 | 🟢 Low |
| TC-07–TC-11 only open dialogs, no feature testing | TC-07–TC-11 | 🟢 Low |
