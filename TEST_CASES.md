# Restaunax — Automated Test Cases

### Plain English Documentation for Non-Technical Readers

---

## What Is This Document?

This document explains every automated test we have written for the Restaunax platform. Each test is written as a computer program that pretends to be a real person using the website — it clicks buttons, fills in forms, and checks that things work correctly.

Think of each test as a **quality checklist item** that runs automatically every time we make a change to the software.

---

## How to Read This Document

Each test case includes:

- **What it checks** — the real-world action being tested
- **How it works** — what the automated test actually does, step by step
- **Why it matters** — what would break for a real customer or staff member if this failed
- **Status** — whether it currently passes ✅, is skipped ⏭️, or needs attention ⚠️

---

## The Areas We Test

| Area              | Who Uses It                        | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🌐 Public         | Anyone on the internet             | TC-01, TC-02, TC-59 → TC-61, TC-74, TC-75, TC-93 → TC-96                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 🔐 Admin          | Internal Restaunax staff           | TC-03 → TC-12, TC-32, TC-76, TC-77, TC-98, TC-101 → TC-124 (user management, `users.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 🏠 Owner          | Restaurant owners                  | TC-13 → TC-16, TC-19 → TC-21, TC-27 → TC-29, TC-35, TC-42 → TC-53 (excl. TC-22–26), TC-62, TC-65 → TC-70, TC-78, TC-82 → TC-85, TC-88 → TC-90, TC-127 → TC-129, TC-131 → TC-142, TC-224, TC-225, TC-231 → TC-254, TC-262, TC-288 → TC-319, TC-533, TC-534, TC-821 → TC-835, TC-852 → TC-854, TC-857, TC-859 → TC-889 (Promotions; TC-863 → TC-870 are the end-to-end scenarios; TC-872 → TC-889 are "Try it as a customer") — retired 2026-10-15 with the old Coupon/Deal pages and no longer live: TC-30, TC-31, TC-63, TC-86, TC-87, TC-91, TC-92, TC-145 → TC-164, TC-351 → TC-366, TC-528 → TC-532, TC-540, TC-541, TC-702 → TC-704, TC-952 → TC-957 (`29-back-office-next-level-ui.spec.ts`) |
| 🛒 Customer       | People ordering food               | TC-22 → TC-26, TC-64, TC-99, TC-125, TC-126, TC-165 → TC-178, TC-184 → TC-197, TC-320 → TC-322, TC-367 → TC-371, TC-535 → TC-538, TC-836 → TC-844, TC-890 → TC-893, TC-906, TC-907, TC-914 → TC-917, TC-L60 → TC-L63, TC-L64 → TC-L70, TC-L73 → TC-L76                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 🍳 POS            | Restaurant kitchen / tablet        | TC-100 (`--project=pos`), TC-524 → TC-527, TC-712 (`pos/10-deals.spec.ts`), TC-845 → TC-851, TC-855, TC-856 (`pos/11-promotions.spec.ts`), TC-908 → TC-913 (`pos/12-combo-food-surfaces.spec.ts`), TC-949 → TC-951 (`pos/12-tablet-settings-staff-role.spec.ts`), TC-972 → TC-977 (`pos/13-app-release-gating.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                           |
| 🔒 Access Control | Testing role/permission boundaries | TC-54 → TC-58, TC-71 → TC-73, TC-81                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 🚪 Onboarding     | New restaurant owners              | TC-93 → TC-97, TC-182, TC-183 (spans Public sign-up and Employee restaurant creation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 👔 Employee       | Company-side setup staff           | TC-143, TC-144, TC-940, TC-182, TC-183 (TC-17/18 tax and TC-97 also run under the EMPLOYEE role)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 🌐 API-Level      | No UI — direct backend calls       | TC-65, TC-66, TC-68, TC-69, TC-79, TC-80, TC-226 → TC-230 (`api-orders-authz.spec.ts`), TC-255 → TC-261 (`api-orders.spec.ts`), TC-263 → TC-287 (`api-menu.spec.ts`), TC-323, TC-324, TC-325 → TC-350 (`api-deals.spec.ts`), TC-508 → TC-523, TC-539, TC-542 (deal scheduling), TC-691 → TC-701 (guided deal types), TC-754 → TC-788, TC-894 → TC-896 (Books & taxes, partner API, accountant, add-on billing — `docs/BACK_OFFICE_COVERAGE.md`), TC-800 → TC-820 (`api-promotions.spec.ts`), TC-943 → TC-948 (`api-back-office-next-level.spec.ts`)                                                                                                                                               |

TC-17 and TC-18 (tax settings) run under the **Employee** role, not Owner —
`/tax` is an EMPLOYEE/ADMIN-only route and the OWNER role gets Access Denied.
They're kept in the Owner Dashboard section below since that's where the
narrative flow for restaurant setup naturally continues. TC-97 (restaurant
creation) is also an Employee-role test, documented under Onboarding.

---

---

# 🌐 SECTION 1 — Public Pages

> These tests check what any visitor to the Restaunax website can see and do — no login required.

---

## TC-01 — Demo Request Form Works

**Status:** ✅ Passing

### What it checks

A restaurant owner who visits the Restaunax website and fills out the "Book a Demo" form gets a success confirmation on screen.

### How it works, step by step

1. The test opens the dashboard's `/demo` link and confirms it forwards to the marketing site's `/get-started` form (the form moved there on 2026-08-08; `/demo` must keep redirecting forever because affiliate links and printed QR codes point at it)
2. It fills in the form with a test contact's details:
   - First name, last name, email address, a dialable US phone number
   - Restaurant name (the form no longer asks for a contact preference — every lead is called)
3. It checks the box agreeing to the terms
4. It clicks the Submit button and confirms the request was accepted by the server
5. It checks that a success message appears on screen, then deletes the test lead

### Why it matters

This is how potential new restaurant clients first contact Restaunax. If this form is broken, Restaunax loses leads — no one can request a demo.

---

## TC-02 — Confirmation Email Is Sent After Demo Request

**Status:** ✅ Passing (`@demo @email`; skipped when `MAILPIT_BASE_URL` is unset)

### What it checks

After a demo request, the person who submitted it receives a confirmation email.

### How it works, step by step

1. The test submits a restaurant demo request through the same API the /get-started form calls (`POST /api/demo-requests`)
2. It waits up to 60 seconds for "Your Demo Request Has Been Received" in QA's Mailpit inbox, addressed to the submitted email
3. It checks the email greets the requester by name
4. It deletes the seeded demo request afterwards

### Why it matters

If the confirmation email is not sent, potential clients might think their request never went through and contact Restaunax again — or worse, go to a competitor.

## What it checks

After filling out the demo form, the person who submitted it receives a confirmation email.

### How it works, step by step

1. After TC-01 submits the form, this test waits up to 30 seconds
2. It checks a test email inbox for a new email addressed to the test contact
3. It confirms the email arrived

### Why it matters

If the confirmation email is not sent, potential clients might think their request never went through and contact Restaunax again — or worse, go to a competitor.

### Why it's currently skipped

This test is unfinished: it waits for a confirmation email but never submits the demo form. QA’s Mailpit sandbox is wired up, so only the missing submit step blocks it.

---

---

# 🔐 SECTION 2 — Admin Dashboard

> These tests check what Restaunax's internal staff can do in the Admin area. The Admin is the person at Restaunax who manages restaurant clients, reviews demo requests, and handles onboarding.

---

## TC-03 — Admin Can Log In

**Status:** ✅ Passing

### What it checks

An admin staff member can successfully log in and reach their dashboard.

### How it works, step by step

1. The test uses a pre-saved admin login session (like a remembered browser login)
2. It confirms the admin is on a dashboard page — not stuck on the login screen

### Why it matters

If admins can't log in, no internal work can be done — no demo requests managed, no restaurants onboarded.

---

## TC-04 — Admin Can Find a Demo Request

**Status:** ✅ Passing

### What it checks

After a potential client submits the demo form (TC-01), the admin can find that person's request in the Demo Management table.

### How it works, step by step

1. The test goes to the Admin Dashboard → Demo tab
2. It searches by the email address of the person who submitted the form in TC-01
3. It checks that:
   - A row appears in the table with the correct name
   - The status shows "NEW" (meaning nobody has acted on it yet)
   - The date and time it was submitted is displayed

### Why it matters

If demo requests don't show up in the admin table, Restaunax staff won't know someone requested a demo — meaning that lead is lost.

---

## TC-05 — Admin Can Open the Actions Menu on a Demo Request

**Status:** ✅ Passing

### What it checks

When an admin finds a demo request, they can click an "Actions" button to see a menu of things they can do with that request.

### How it works, step by step

1. The test finds the demo row from TC-04
2. It clicks the Actions button (three dots or similar) on that row
3. It checks that the following six options are visible in the menu:
   - **View/Edit Details** — read more about the request
   - **Assign Request** — hand it off to a team member
   - **Schedule Demo** — book a meeting
   - **Send Follow-up Email** — contact the prospect
   - **Proceed to Onboarding** — start creating their restaurant account
   - **Delete demo** — remove the request

### Why it matters

These are the core actions an admin needs to manage a prospect through the sales process. If any option is missing, the team can't complete their workflow.

---

## TC-06 — Admin Can Change the Status of a Demo Request

**Status:** ✅ Passing

### What it checks

An admin can change the status of a demo request directly from the table — for example, changing it from "New" to "Contacted."

### How it works, step by step

1. The test finds the demo row
2. It clicks the status dropdown on that row
3. It selects "Contacted" from the list
4. It confirms the status badge on the row now shows "Contacted"

### Why it matters

Status tracking lets the admin team know where each prospect is in the sales process. Without it, multiple people might contact the same prospect, or no one might follow up at all.

---

## TC-07 — Admin Can Edit and Save Notes on a Demo Request

**Status:** ✅ Passing

### What it checks

Clicking "View/Edit Details" opens a side panel where the admin can write internal notes about a prospect and save them — and the note is still there next time the panel is opened.

### How it works, step by step

1. The test opens the Actions menu on the demo row and clicks "View/Edit Details"
2. It types a test note into the Notes field and clicks "Save Changes"
3. The panel closes automatically on a successful save (there's no separate success message — the panel closing is the signal)
4. The test reopens the panel and confirms the note it typed is still there

### Why it matters

Notes are how admins track what's been discussed with a prospect across multiple conversations. If saving silently failed, that history would be lost without anyone noticing.

> Previously this test only confirmed the panel opened, without ever typing into or saving the Notes field.

---

## TC-08 — Admin Can Send a Follow-up Email

**Status:** ❌ Failing — app bug (see note below)

### What it checks

Clicking "Send Follow-up Email" opens the "Follow-up email" composer pre-filled for this lead (subject and body). The platform no longer sends it — the rep copies it and sends from their own inbox — so the test records the follow-up with "Mark as contacted", which must log the touch and update the request's status.

### How it works, step by step

1. The test opens the Actions menu and clicks "Send Follow-up Email"
2. It confirms the composer is addressed to this lead and pre-filled, and that opening it changed nothing
3. It clicks "Mark as contacted", confirms the send time, and checks the server accepted it
4. It confirms the request's status badge changes from "New" to "Contacted"
5. It resets the status back to "New" so it doesn't affect other tests that expect a fresh request

### Why it matters

This is the core outreach action in the sales process. If sending silently failed, prospects would never hear back and the admin would have no way of knowing — the status change is what previously made this dialog untested beyond "does it open."

> Previously this test only confirmed the dialog opened, without ever clicking Send.

> **Known app bug (2026-10-02):** the composer's default send time is the minute it was OPENED (truncated, and only Copy refreshes it — "Mark as contacted" does not), while the server refuses a send time earlier than the lead's `createdAt`. A rep who opens the composer in the minute the lead arrived gets 400 "The send time cannot be earlier than when the request arrived." with the default, however long they wait. This test opens it seconds after seeding its lead, so it reproduces that every run.

---

## TC-09 — Admin Sees a Confirmation Before Deleting a Demo Request

**Status:** ✅ Passing

### What it checks

When an admin clicks "Delete demo," a confirmation dialog appears asking them to confirm — preventing accidental deletions. Clicking Cancel keeps the record intact.

### How it works, step by step

1. The test opens the Actions menu
2. It clicks "Delete demo"
3. It confirms a warning dialog appears that includes the prospect's full name
4. It clicks Cancel
5. It confirms the demo row still exists in the table

### Why it matters

Accidental deletion of a demo request means losing a potential client permanently. The confirmation step is a safety net.

---

## TC-98 — Admin Can Permanently Delete a Demo Request

**Status:** ✅ Passing

### What it checks

Confirming the delete dialog (instead of cancelling) actually removes the demo request — it disappears from the list and can no longer be found.

### How it works, step by step

1. The test creates its own throwaway demo request first (via a direct API call, not through the demo form) — this way it isn't deleting the shared request that TC-04 through TC-12 all rely on
2. It searches for that throwaway request, opens Delete, and clicks the real "Delete" button (not Cancel)
3. It searches again and confirms the row is gone

### Why it matters

TC-09 only proved the _cancel_ path works. This proves the delete button itself actually works — without it, this test suite had no evidence the delete feature functioned at all, only that backing out of it did.

---

## TC-10 — Admin Can Assign a Demo Request to a Team Member

**Status:** ✅ Passing

### What it checks

Clicking "Assign Request" opens a dialog where the admin can search for a team member by name or email and hand the request off to them.

### How it works, step by step

1. The test opens the Actions menu and clicks "Assign Request"
2. It types the admin test account's email into the search box, waits for it to appear as a suggestion, and clicks it
3. It clicks "Assign" and confirms (from the server's response) that the request now has that person as the assignee

### Why it matters

When teams are busy, requests need to be distributed among staff. If assignment doesn't work, there's no accountability for who's handling which prospect. (The dashboard doesn't show the assignee's name anywhere visible after assigning, so this test checks the server's response directly rather than something on screen.)

> Previously this test only confirmed the dialog opened, without ever searching for or selecting anyone.

---

## TC-11 — Admin Can Schedule a Demo

**Status:** ✅ Passing

### What it checks

Clicking "Schedule Demo" opens a dialog where the admin can pick a date and time for the product demo meeting — and actually scheduling it updates the request's status.

### How it works, step by step

1. The test opens the Actions menu and clicks "Schedule Demo"
2. It types a date and time into the date/time field — the date is **computed at run time** (always 7 days ahead), never hardcoded, so the test can't silently start scheduling demos in the past
3. It clicks "Schedule Demo" to confirm and checks the request's status badge changed to "Scheduled"
4. It resets the status back to "New" in a `finally` block, so even a mid-test failure can't leave the shared demo request in the wrong state

### Why it matters

Scheduling is the most important step in converting a lead. If this dialog is broken, admins can't book meetings directly from the platform.

> Previously this test only confirmed the dialog opened, without ever picking a date or clicking Schedule.

---

## TC-12 — Proceed to Onboarding Takes Admin to Restaurant Setup

**Status:** ✅ Passing

### What it checks

When a prospect has agreed to move forward, clicking "Proceed to Onboarding" takes the admin to the restaurant creation form — ready to start setting up the new client's account.

### How it works, step by step

1. The test opens the Actions menu
2. It clicks "Proceed to Onboarding"
3. It confirms the page URL changes to the restaurant setup page

### Why it matters

This is the moment a prospect becomes a paying customer. A broken link here would mean manually navigating to the setup page, adding friction and opportunity for mistakes.

---

## TC-32 — Admin Can See the Restaurants List

**Status:** ✅ Passing

### What it checks

An admin can navigate to the Restaurants tab in the admin dashboard and see a list of restaurants including the test restaurant.

### How it works, step by step

1. The test navigates to the Admin Dashboard → Restaurants tab
2. It confirms the "Restaurants" heading is visible
3. It confirms the table renders rows
4. The list is server-paginated and newest-first (QA holds 100+ restaurants), so it searches for the seed restaurant by name — as an admin would — and confirms its row is visible

### Why it matters

Admin oversight of all restaurant accounts is essential for account management, support, and billing. If this page is broken, admins can't see or manage any of their clients.

---

## TC-101 → TC-124 — Admin User Management (`users.spec.ts`)

**Status:** ✅ Passing (invite/reset/claim cases are tagged `@email` — run in the default suite; `npm run test:email` selects just them)

The admin Users screen is where Restaunax staff invite, inspect, and manage every account on the platform. This block covers the whole surface; each test in one line:

| TC     | What it checks                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| TC-101 | Admin can invite a new user (email-gated)                                                                   |
| TC-102 | An invalid email shows an error and sends no request                                                        |
| TC-103 | Submit stays disabled until a role is selected                                                              |
| TC-104 | Inviting an already-registered email is rejected                                                            |
| TC-105 | Choosing the Owner role reveals the restaurant autocomplete                                                 |
| TC-106 | Cancel resets the invite form                                                                               |
| TC-107 | Search finds a user by email                                                                                |
| TC-109 | Role filter narrows the list                                                                                |
| TC-110 | Status filter narrows the list                                                                              |
| TC-111 | Clicking a row opens the detail side sheet                                                                  |
| TC-112 | A USER's detail shows only the role-appropriate tabs                                                        |
| TC-113 | An OWNER's detail exposes all tabs, including read-only Restaurants                                         |
| TC-114 | The side sheet can be closed                                                                                |
| TC-115 | Admin can change a user's role                                                                              |
| TC-116 | Admin can deactivate then reactivate a user                                                                 |
| TC-117 | Admin can send a password-reset email (email-gated)                                                         |
| TC-118 | Admin can add then remove a user-specific permission                                                        |
| TC-76  | Changing a role to an unknown value is rejected by the backend (API negative)                               |
| TC-77  | Toggling status of a nonexistent user id is rejected (API negative)                                         |
| TC-123 | An invited user can claim access via the emailed token and log in with the right access level (email-gated) |
| TC-124 | A bogus invite token grants no elevated access                                                              |

### Why it matters

User management is the platform's front door for staff and owners alike: a broken invite flow blocks onboarding entirely, and a broken role/permission editor is a security problem, not just a UI bug. The negative cases (TC-76/77/102/104/124) prove the backend rejects bad input rather than trusting the UI to prevent it.

---

---

# 🏠 SECTION 3 — Owner Dashboard

> These tests check what a restaurant owner can do after they've been set up on Restaunax. The owner manages their restaurant's details, menu, pricing, and more.

---

## TC-13 — Owner Can Reach Their Restaurant List

**Status:** ✅ Passing

### What it checks

A restaurant owner can log in and see a page titled "My Restaurants" listing their restaurant(s).

### How it works, step by step

1. The test uses the owner's saved login session
2. It navigates to the "My Restaurants" page
3. It confirms the "My Restaurants" heading is visible on screen

### Why it matters

This is the owner's home base. If they can't see their restaurant list, they can't access any management features.

---

## TC-14 — Owner Can See Their Restaurant Card

**Status:** ✅ Passing

### What it checks

The owner's specific restaurant appears as a card on the "My Restaurants" page with the correct name.

### How it works, step by step

1. The test opens the My Restaurants page
2. It looks for a card that contains the test restaurant's name
3. It confirms the card is visible

### Why it matters

If the owner's restaurant doesn't appear, they have no way to manage it — menu, orders, settings, everything is inaccessible.

---

## TC-15 — Owner Can Enter Their Restaurant's Management Area

**Status:** ✅ Passing

### What it checks

Clicking into a restaurant opens the full management portal with a navigation sidebar.

### How it works, step by step

1. The test navigates directly to the restaurant management page
2. It confirms the left-hand navigation sidebar is visible on screen

### Why it matters

The management portal is where the owner does everything — menu editing, viewing orders, settings, analytics. If it doesn't load, the owner is locked out of their own restaurant.

---

## TC-16 — Owner Can Navigate to Store Settings

**Status:** ✅ Passing

### What it checks

Clicking "Store Settings" in the sidebar navigation takes the owner to their store settings section.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Store Settings" in the left sidebar
3. It confirms the page URL updates to reflect Store Settings is open

### Why it matters

Store Settings is where owners configure operating hours, delivery options, and other core restaurant details. A broken link means they can't update these settings.

---

## TC-17 — Employee Can Open Tax Settings

**Status:** ✅ Passing — `tests/dashboard/employee/tax-settings.spec.ts` (needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env`, else skipped)

**Note:** this test originally lived under `tests/dashboard/owner/` as a
permanent skip, because the tax settings route (`/tax`) is EMPLOYEE/ADMIN-only
and OWNER gets Access Denied. It moved to the employee suite once the
`employeePage` fixture (an authenticated EMPLOYEE browser session) was added.

### What it checks

The employee can navigate to the Tax Settings page for a restaurant and see a form to enter its sales tax rate.

### How it works, step by step

1. The test goes directly to the tax settings page for the test restaurant, authenticated as the employee
2. It confirms the tax rate input field is visible (showing placeholder text "e.g., 7.5")

### Why it matters

Tax must be correctly applied to every customer order. If the employee setting up a restaurant can't set its tax rate, either customers are charged the wrong amount or the restaurant loses money.

---

## TC-18 — Employee Can Save a Tax Rate

**Status:** ✅ Passing — `tests/dashboard/employee/tax-settings.spec.ts` (needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env`, else skipped)

**Note:** moved from `tests/dashboard/owner/` — see TC-17.

### What it checks

An employee can change the tax rate and save it — and the change actually persists (verified by reloading the page, not just trusting the toast). The original rate is restored afterward.

### How it works, step by step

1. The test opens the tax settings page as the employee and reads the current rate
2. It types a different rate (7.5 or 8.5, whichever differs from the current value) and clicks "Save Tax Settings"
3. It confirms the "Tax settings updated successfully!" toast, then **reloads the page and verifies the new rate persisted**
4. In a `finally` block it restores the original rate — the tax rate feeds real order totals on the shared QA restaurant, so the test must never leave it mutated

### Why it matters

Without being able to save the tax rate, every order placed through the restaurant would either have incorrect tax or no tax — a financial and compliance problem.

---

## TC-19 — Owner Can Open the Menu Management Tab

**Status:** ✅ Passing

### What it checks

Clicking "Menu" in the sidebar opens the menu management area where the owner can manage their food categories and items.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Menu" in the sidebar
3. It confirms the "Add Category" button is visible on screen

### Why it matters

If the menu tab doesn't load, the owner cannot add, edit, or remove any food items — meaning their online menu is frozen as-is.

---

## TC-20 — Owner Can Create a Menu Category

**Status:** ✅ Passing

### What it checks

An owner can create a new menu category (like "Appetizers" or "Desserts") to organise their menu items.

### How it works, step by step

1. The test opens the menu management area
2. It clicks "Add Category"
3. It types "Test Starters" as the category name
4. It clicks "Save changes"
5. It confirms the new "Test Starters" category appears on the menu

### Why it matters

Categories make it easy for customers to browse the menu. Without the ability to create them, owners are stuck with a flat, unorganised list of food items.

---

## TC-21 — Owner Can Add a Menu Item

**Status:** ✅ Passing

### What it checks

An owner can add a new food item inside a category — with a name, price, and description.

### How it works, step by step

1. The test opens the menu management area
2. It finds the "Test Starters" category (created in TC-20)
3. It clicks "Add Item" inside that category
4. It fills in:
   - **Name:** Automation Bruschetta
   - **Price:** $9.99
   - **Description:** Test item created by Playwright automation
5. It saves the item
6. It confirms the success message "Menu item created successfully!" appears

### Why it matters

Adding menu items is the most fundamental thing a restaurant owner does when setting up. If this is broken, the restaurant's menu will be empty and customers can't order anything.

---

## TC-27 — Owner Can Reach the Publish Page

**Status:** ⏭️ Skipped — publish route (`/publish`) is EMPLOYEE-only; OWNER role gets Access Denied

### What it checks

An owner can navigate to the Publish page for their restaurant and see the "Publish Restaurant" button.

### How it works, step by step

1. The test navigates directly to the restaurant's publish page
2. It confirms the "Publish Restaurant" button is visible on screen

### Why it matters

Publishing is what makes a restaurant go live for customers. If the publish page is broken or the button is missing, the restaurant can't be activated and no customer orders are possible.

---

## TC-28 — Publish Page Shows the Required Checklist

**Status:** ⏭️ Skipped — publish route (`/publish`) is EMPLOYEE-only; OWNER role gets Access Denied

### What it checks

The Publish page shows a checklist of things the owner must complete before their restaurant can go live.

### How it works, step by step

1. The test opens the restaurant's publish page
2. It checks that the following four checklist items are all visible:
   - **Hours of Operation** — the restaurant must set its opening hours
   - **Menu Setup** — at least one menu item must exist
   - **Restaurant Information** — basic details like name and address must be filled in
   - **Payment Processing** — payment must be configured to accept orders

### Why it matters

The checklist prevents owners from accidentally publishing an incomplete restaurant. If any item is missing from the checklist, owners have no guidance on what to fix before going live.

---

## TC-29 — Owner Can View the Orders Tab

**Status:** ✅ Passing

### What it checks

An owner can click "Orders" in the restaurant sidebar and see the orders management area with a search bar and filter options.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Orders" in the left sidebar
3. It confirms the orders tab loads — specifically that the search bar ("Search orders, customers, phone...") is visible
4. It confirms the "Filters" button is also visible

### Why it matters

Orders is how owners track their revenue and see what customers have purchased. If this tab doesn't load, owners are blind to their business activity.

> **Related Orders-tab cases:** TC-70 (empty search), TC-89 (Filters button opens the panel), TC-90 (order detail opens), and the deeper checks TC-131 → TC-135 below.

---

## TC-131 — Orders Grid Renders a Real Column Set

**Status:** ✅ Passing

### What it checks

The Orders DataGrid renders meaningful columns — the "Status" header is in view and there are several column headers total.

### How it works, step by step

1. Navigate to the Orders tab
2. Assert the "Status" column header is visible
3. Assert the grid has ≥ 5 column headers

### Why it matters

TC-29 only checked the search UI. This confirms the grid itself is populated with the columns owners triage on. The DataGrid **virtualizes columns horizontally**, so far-right headers (Payment, Subtotal) aren't in the DOM at the default viewport — hence the in-view "Status" + header-count assertion instead of naming every column.

---

## TC-132 — Filtering by Order Status Re-Queries the Grid

**Status:** ✅ Passing

### What it checks

Choosing a status in the Filters panel and applying it fires the management fetch and closes the panel.

### How it works, step by step

1. Navigate to the Orders tab
2. Open Filters, select "Pending" in the Order Status dropdown
3. Apply, and wait for the `GET /api/order/statistics/management/*` response — assert it returns OK
4. Confirm the grid is still present after filtering

### Why it matters

TC-89 only opened the filter panel. This exercises the filter end-to-end, proving a status selection actually drives a new server query.

---

## TC-133 — Resetting the Filters Restores the Default Status

**Status:** ✅ Passing

### What it checks

After narrowing the Order Status filter, the Reset button returns it to "All Statuses".

### How it works, step by step

1. Navigate to the Orders tab, open Filters
2. Select "Pending" and confirm the control shows "Pending"
3. Click Reset (this also closes the panel — `handleResetFilters` → `handleFilterMenuClose`)
4. Reopen Filters and confirm the status is back to "All Statuses"

### Why it matters

Owners need to clear a filter without reloading the page. The reopen step documents the real UI behavior (Reset closes the panel), so the test isn't brittle.

---

## TC-134 — Order Detail Dialog Shows Items and Total

**Status:** ✅ Passing

### What it checks

Opening an order's detail dialog renders the line-items section and the money summary, not just the header block.

### How it works, step by step

1. Navigate to the Orders tab (a zero-total order is API-seeded in `beforeAll`, so a row always exists)
2. Open the first order's detail dialog
3. Assert "Order Information", "Order Details" (items), and "Order Total" are all visible

### Why it matters

TC-90 only asserted the header ("Order Information"). This deepens it to confirm owners can actually see what was ordered and what it totalled.

---

## TC-135 — Orders Toolbar Exposes an Export Control

**Status:** ✅ Passing

### What it checks

The Orders tab offers an Export action.

### How it works, step by step

1. Navigate to the Orders tab
2. Confirm the Export button is visible

### Why it matters

Owners export orders for reporting and accounting; this verifies the entry point exists. (Kept to a visibility check — it does not trigger a real download against shared QA.)

---

## TC-224 — Owner Advances an Order's Status via "Mark as X"

**Status:** ✅ Passing

### What it checks

The order-detail sheet's status control is a single forward-only "Mark as {next status}" button — not a dropdown. Clicking it PUTs `/api/order/orderId/:id/status` and the button itself advances to reflect the next status in the sequence.

### How it works, step by step

1. Seed a `PENDING` order via the API (`createSeededOrder`)
2. Deep-link straight to that order's detail sheet (`?tab=Orders&detailOrderId=<id>`)
3. Click "Mark as Confirmed"; capture the status PUT response and confirm it succeeded with `status: "CONFIRMED"`
4. Confirm the button now reads "Mark as Preparing"

### Why it matters

TC-90 explicitly scoped the order-detail dialog to read-only assertions, leaving status change entirely uncovered. It also surfaced (not new — re-confirms an already-documented finding) that `PUT /api/order/orderId/:id/status` had no auth/permission middleware live on QA at the time; that gap is now resolved — see `TEST_COVERAGE.md`'s Known Technical Debt (`TC-100`/`TC-179`).

---

## TC-225 — Owner Cancels a Stripe-Paid Order and Triggers a Real Refund

**Status:** ✅ Passing

### What it checks

There is no standalone "Refund" button reachable in the dashboard — the only refund path is "Cancel Order," whose nested confirmation dialog smart-detects a completed Stripe payment and switches to refund copy/wording. Confirming triggers a real `stripe.refunds.create` server-side.

### How it works, step by step

1. Drive a full real customer checkout on Template Wind (Stripe `VISA_SUCCESS` test card, same flow as TC-26) with a run-unique customer name/email; extract the new order's id from the `/order-confirmation/<orderId>` URL
2. As owner, deep-link to that order's detail sheet and click "Cancel Order"
3. Confirm the nested dialog shows the paid-refund copy ("will be refunded") and its confirm button reads "Cancel & Refund" — proof the smart-detection branch fired correctly for a real charge
4. Confirm "Cancel & Refund"; capture the `PUT /api/order/statistics/cancel/:orderId` response and confirm `action: "REFUNDED"` with a real `refundId`

### Why it matters

First-ever coverage of the refund path, and it tests the flow that's actually reachable — the legacy standalone Refund dialog in `OrderDetailsDialog.tsx` (`showRefundDialog`) is dead code, never triggered from anywhere in the component. Also confirms the response shape (`{ success, action, refundAmount, refundId }`), useful for anyone else needing to assert against this endpoint. The separate standalone partial-refund endpoint (`POST /api/order/statistics/refund/:orderId`) has no UI path at all and is out of scope for a dashboard E2E test.

---

## TC-231 → TC-252, TC-262 — Owner Orders Tab, Deep Coverage (2026-08-15)

**Status:** ✅ Passing

These were added by the first tab-by-tab coverage audit (`docs/ORDERS_TAB_TEST_STRATEGY.md`). Until now the Orders tab had smoke coverage only — the tab renders, the filter panel opens, one status click, one paid refund. Nothing proved that search finds the right order, that filters return the right rows, that the money the owner sees matches what was recorded, that the export contains the right data, or that a customer's order actually reaches the owner. All of these tests live in `tests/dashboard/owner/06-orders.spec.ts` unless noted, use API-seeded orders (no Stripe) that share a run-unique surname, and assert on the server response as well as on the screen.

**Seed set** (`beforeAll`, all with the same run-unique last name): **A** pickup, Pending, with a tip and special instructions · **B** delivery, Confirmed, with a delivery fee, address and notes · **C** pickup, Cancelled · **D** pickup, Confirmed, guest (no contact). Tests that change an order seed their own throwaway order.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                 | Why it matters                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-231** | Searching by a receipt number sends `?search=`, our row is in the response and rendered; every returned row genuinely matches (receipt `contains` or exact daily order #).                                                                                                                                                                     | Receipt search is how support finds an order from a customer email.                                                                   |
| **TC-232** | Searching by the customer's last name returns exactly the three named seed rows; searching by the email's unique local part returns order A.                                                                                                                                                                                                   | Proves the "search by name / email" promise of the search box.                                                                        |
| **TC-233** | Search mode shows the "Searching all orders (date range ignored)" banner; **Clear Search** re-queries WITHOUT `search` and WITH the date range, hides the banner and empties the box.                                                                                                                                                          | Owners must be able to get back to their date-scoped list.                                                                            |
| **TC-234** | Status filter = Pending (scoped by surname) → request `status=PENDING`, response is exactly [A]; B and C rows gone.                                                                                                                                                                                                                            | TC-132 proved the request fires; this proves the rows are right.                                                                      |
| **TC-235** | Type filter = Delivery → `orderType=DELIVERY`, response is exactly [B].                                                                                                                                                                                                                                                                        | First coverage of the Order Type filter.                                                                                              |
| **TC-236** | Filters button badge reads "2" with status+type set, disappears after Reset, "1" with only a status.                                                                                                                                                                                                                                           | The badge is the owner's only cue that a filter is hiding rows.                                                                       |
| **TC-237** | Sort "Highest Amount" → `sortBy=total&sortDirection=desc` and totals are non-increasing; "Lowest Amount" → ascending.                                                                                                                                                                                                                          | Sorting is server-side; grid column sorting is disabled.                                                                              |
| **TC-238** | Rows-per-page 25 → `limit=25&page=1`; with >10 rows, next page → `page=2`; a size change snaps back to page 1 (page-2 step annotated and skipped on a fresh QA).                                                                                                                                                                               | Server pagination contract.                                                                                                           |
| **TC-239** | Refresh re-issues the list request.                                                                                                                                                                                                                                                                                                            | There is no auto-refresh on this tab (only shipping socket events) — Refresh is how new orders appear.                                |
| **TC-240** | Detail sheet Subtotal / Tax / Tip / **Customer paid** equal the values the backend recorded for the seed (read back from the create response — tax is recomputed server-side); the delivery seed shows its Delivery Fee row.                                                                                                                   | First money assertion on this tab. Pricing is server-authoritative, so we compare to what the server recorded, never to what we sent. |
| **TC-241** | Order Items table shows the item × 1 at its price, heading "Order Items (1)", and the special instructions are shown.                                                                                                                                                                                                                          | Owners cook from this list.                                                                                                           |
| **TC-242** | Customer Info tab shows name / phone / email from the order's contact snapshot; a guest order shows "Guest" / "N/A" / "N/A".                                                                                                                                                                                                                   | Snapshot-over-customer is the documented rule; guest fallbacks must not crash or show blanks.                                         |
| **TC-243** | Delivery Info tab shows street + unit, city/state/zip, delivery notes and "Delivered by the restaurant"; a pickup order has no Delivery Info tab.                                                                                                                                                                                              | First coverage of the Delivery Info tab.                                                                                              |
| **TC-244** | Full **pickup** lifecycle from the sheet: Pending → Confirmed → Preparing → Ready → Picked Up, each click confirmed by the status PUT; at the end the "Mark as" button is gone, the chip says Picked Up, four steps are complete, the sheet is still open.                                                                                     | TC-224 covered one click; this covers the whole day-to-day path.                                                                      |
| **TC-245** | Full **delivery** lifecycle incl. Out for Delivery → Delivered.                                                                                                                                                                                                                                                                                | Delivery has a longer path than pickup.                                                                                               |
| **TC-246** | Cancelling an **unpaid** order: dialog "Cancel Order — Receipt #…", no "will be refunded" copy, confirm button reads "Cancel Order" (not "Cancel & Refund"); PUT cancel → `{success:true, action:"CANCELLED"}`; success alert; the sheet auto-closes; re-opened it shows Cancelled with no Cancel / Mark-as buttons and no progress stepper.   | The common non-Stripe cancel path — TC-225 only covered the paid one.                                                                 |
| **TC-247** | "Keep Order" closes the dialog with **zero** cancel requests and the order untouched.                                                                                                                                                                                                                                                          | Backing out must be side-effect free.                                                                                                 |
| **TC-248** | Export → Current View downloads `orders_<date>[…].csv`; the POST carries `exportType:"current"` + the search; the CSV has the 33 documented columns and exactly the three named seed rows; adding the Pending filter narrows the CSV to A.                                                                                                     | First real export test (TC-135 only checked the button existed).                                                                      |
| **TC-249** | Export is disabled while the view has 0 rows and re-enabled when rows are back.                                                                                                                                                                                                                                                                | Exporting nothing is a backend 400; the UI must not offer it.                                                                         |
| **TC-250** | Header stat cards: (API, timezone-proof) seeding two pickup orders raises Total Orders and Pickup count by ≥2 and Net Sales by ≥2× price in a yesterday→tomorrow window; (UI) the four cards render exactly what the stats endpoint returned, Update Stats re-fires it, and the "Today" preset re-fires it with browser-local start=end=today. | First coverage of the header numbers. Assert deltas, never absolutes — seeded orders are permanent QA residue.                        |
| **TC-251** | A custom range far in the past → stats return 0 → "No orders in this date range" with a "Change date range" CTA that re-opens the picker.                                                                                                                                                                                                      | Empty state must invite recovery.                                                                                                     |
| **TC-252** | `?detailOrderId=<garbage>` → the lookup 4xx's, no detail sheet, dashboard + grid still render, no uncaught page error.                                                                                                                                                                                                                         | Deep links come from emails/Slack and go stale.                                                                                       |
| **TC-262** | Searching by the customer's 10-digit **phone number** returns their order (matched on `customer.phone` and the on-order phone snapshot).                                                                                                                                                                                                       | The search placeholder promises phone search — this test found it broken (see below) and is now the permanent regression guard.       |

**Real product bug surfaced by TC-262 (2026-08-15) — FIXED the same day:** the list endpoint (`getFilteredOrders`) treated any all-digit search term as a daily order number and handed `Number(term)` to Prisma as an `int4`. A 10-digit phone number overflowed Postgres integer range → `500 "Value out of range for the type"`, so "search by phone" was broken for essentially every real phone number. Fixed in RestauNax commit `48726a9e` (PR #589 → qa): the order-number branch is guarded with `/^\d{1,9}$/` in all three places it occurred — `getFilteredOrders`, `exportOrders`, and the chain order feed (`chainController.ts`), the last of which the original report had missed. TC-262 ran as `test.fail()` until the QA deploy carried the fix, then flipped to a normal passing test — it is now the regression guard.

**A second latent suite bug fixed in the same pass:** the customer POMs (`CustomerCheckoutPage`, `CustomerMenuPage`, `CustomerGiftCardPage`, `CustomerDealPage`) carried their own fallback of `https://qa.restaunax.com` (the marketing site) instead of the shared `TEMPLATE_WIND_URL` (`wind.restaunax.com`). CI never noticed because the variable is set there; locally, every Stripe test navigated to a 404. They now import the shared constant.

---

## TC-253 / TC-254 — Customer → Owner Journeys (`06b-orders-journey.spec.ts`)

**Status:** ✅ Passing (TC-254's Mailpit step runs only where `MAILPIT_BASE_URL` is set — i.e. CI)

### What they check

**TC-253** is _the_ through-line this whole effort was about: a guest places a real Stripe pickup order on Template Wind (one browser context), and the owner (a second, logged-in context in the same test) sees that exact order — same receipt number, "Customer paid" equal to the checkout total, the item listed, Payment Status COMPLETED, Customer Info showing the name / phone / email the customer typed — then finds it in the grid by the customer's surname (exactly one row) and works it Confirmed → Preparing → Ready → Picked Up. It never searches by the confirmation page's "Order #", which is the daily number, not the permanent receipt.

**TC-225** (moved here from `06-orders.spec.ts` so a Stripe hiccup can't fail the 30-test owner-UI file) is unchanged, and now continues into **TC-254**: after the refund, the customer's own receipt-scoped read (`GET /api/order/:id?receipt=`) shows `REFUNDED`, a second refund attempt is rejected (400), and — where Mailpit is configured — the customer receives the "Refund Confirmation" email.

### Why it matters

Everything else in the Orders suite seeds orders through the API. Only these tests prove the hand-off between the two halves of the product: what a customer paid for is what the owner sees and can act on.

---

## TC-255 → TC-261 — Owner Orders API Contract (`api-orders.spec.ts`)

**Status:** ✅ Passing (TC-259b is a `test.fixme` twin, skipped on purpose)

No browser. An owner JWT calls the order-management endpoints directly, asserting the rules the tab depends on:

| TC         | Rule                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-255** | An unknown status ("BOGUS", and the enum-but-not-allowed `INITIALIZED`) is a `400 "Invalid order status"` on both `PUT /api/order/orderId/:id/status` and `PUT /api/order/statistics/:id/status`; the order is untouched. |
| **TC-256** | Cancelling an already-cancelled order → `400 "already been cancelled"`.                                                                                                                                                   |
| **TC-257** | Refunding an unpaid order → `400 "Only completed payments can be refunded"` (no Stripe call).                                                                                                                             |
| **TC-258** | INITIALIZED (pre-payment placeholder) orders are hidden from the owner list by default; passing `status=INITIALIZED` explicitly **does** return them — pinned as current behaviour pending a product decision.            |
| **TC-259** | **Pinned:** backwards moves (Picked Up → Pending) are accepted today (200) and reset `completedAt` to null. **TC-259b** (`fixme`) documents the expected 409 once a state machine lands.                                  |
| **TC-260** | Export with no matching rows → `400 "No orders found"`; a matching export streams a 33-column CSV (incl. dual-pricing `Cash Discount`) containing our seeded receipt.                                                     |
| **TC-261** | `sortBy=total&sortDirection=asc` is non-decreasing; `limit=2` caps the page and `totalPages = ceil(totalCount / 2)`.                                                                                                      |

Auth / tenant-isolation pins (TC-226..230) were deferred on 2026-08-15 pending the backend fix and are now implemented — see the next section.

---

## TC-226 → TC-230 — Orders API Auth & Tenant Isolation (`api-orders-authz.spec.ts`)

_Added 2026-08-19. Pins for the two security holes found in the 2026-08-15 Orders-tab audit
(`docs/ORDERS_TAB_TEST_STRATEGY.md` §1), both fixed in RestauNax PR #621 (merged to qa 2026-08-19):
the anonymous `GET /api/order/now` all-orders PII dump is **deleted**, and the five
`/api/order/statistics/*` read routes now enforce restaurant ownership (403) instead of only the
`VIEW_RESTAURANT` permission. The second tenant is minted per run via `createSecondOwner`
(admin-created throwaway OWNER + restaurant, archived in `afterAll`; `OWNER2_EMAIL/PASSWORD` env
creds are used instead when both are set — no new secret is required)._

| TC          | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-226**  | `GET /api/order/now` never answers 200 again. The route is deleted, so "now" falls through to the public `GET /api/order/:orderId` matcher → `404 ORDER_NOT_FOUND` (pinned live on QA), with or without a token. `@smoke`                                                                                                                                                                                                     |
| **TC-227**  | An owner of another restaurant gets **403** on the management list, the stats header and the order detail of the seed restaurant; unknown order ids are **404** (lookup precedes the ownership check); the real owner (and the intruder on their own restaurant) still get 200.                                                                                                                                               |
| **TC-227b** | [pinned] The receipt route (`GET /statistics/:orderId/receipt`) currently **500s for everyone** — `generateOrderReceipt` selects the nonexistent `Restaurant.street` scalar, so the query throws before #621's ownership check is reached. No leak (equally dead for its owner); the error envelope carries no order payload. Fixme twin **TC-227c** holds the post-fix expectation (403 intruder / 404 unknown / 200 owner). |
| **TC-228**  | Cross-tenant `POST /statistics/export/:restaurantId` → 403; the real owner's export → 200 CSV containing the seeded receipt #.                                                                                                                                                                                                                                                                                                |
| **TC-229**  | The mutating paths that already enforced ownership pre-fix stay enforced: intruder status-update (both PUT variants), cancel and refund → 403 and the order is untouched.                                                                                                                                                                                                                                                     |
| **TC-230**  | All eight statistics routes (management, stats, export, detail, receipt, status, cancel, refund) → **401** with no bearer token.                                                                                                                                                                                                                                                                                              |

---

## TC-136 — Owner Can View the Customers Directory

**Status:** ✅ Passing

### What it checks

An owner can open the Customers tab and see the customer directory — the sub-tabs, search field, and the Total Customers stat.

### How it works, step by step

1. Open the restaurant management portal
2. Click "Customers" in the sidebar (PortalShell menu id `Customers` → `?tab=Customers`)
3. Confirm the "All Customers" and "Customer Groups" sub-tabs, the "Search by name, email, or phone" field, and the "Total Customers" stat card are all visible; and no load-error alert is shown

### Why it matters

The Customers tab is the owner's built-in CRM — the only in-product view of who their customers are and what they've spent. It was previously untested.

---

## TC-137 — Customer Directory Search Re-Queries the Server

**Status:** ✅ Passing

### What it checks

Typing in the customer search fires `GET /api/customers/restaurant/:id` with the search term.

### How it works, step by step

1. Navigate to the Customers tab and confirm the directory loaded
2. Type a search term and wait for the `GET /api/customers/restaurant/*?search=…` response — assert it returns OK
3. Confirm no load-error alert appears

### Why it matters

Confirms search filters against the backend (server-side), not just the currently-loaded page — the behaviour owners rely on to find a specific customer in a large base.

---

## TC-138 — Owner Can Switch to the Customer Groups (Segments) Sub-Tab

**Status:** ✅ Passing

### What it checks

Selecting the "Customer Groups" sub-tab renders the Customer Segments view with its segment cards.

### How it works, step by step

1. Navigate to the Customers tab
2. Click the "Customer Groups" sub-tab
3. Confirm the "Customer Segments" heading and a representative segment card ("VIP") are visible (data from `GET /api/customers/restaurant/:id/segments`)

### Why it matters

Segments (VIP, Loyal, Inactive, One-Time, Big Spenders) are how owners target marketing; this verifies the sub-tab loads its data. The third sub-tab (Analytics) is intentionally not covered — it's a data-dependent "coming soon" surface.

---

## TC-139 — Owner Can View the Owner Settings (Automated Reports) Form

**Status:** ✅ Passing

### What it checks

An owner can open the Owner Settings tab and see the settings view — the title, both sub-tabs (Automated Reports / Notifications), and the Automated Reports form sections.

### How it works, step by step

1. Open the restaurant management portal
2. Click "Owner Settings" in the sidebar (PortalShell menu id `Owner Settings` → `?tab=Owner Settings`)
3. Confirm the "Owner Settings" title and both sub-tabs are visible
4. Once the settings fetch (`GET api/owner-settings/reports/:id`) resolves, confirm the "Order Notifications" and "Automated Business Reports" sections render

### Why it matters

Owner Settings is where owners control automated summary emails — an account-wide setting. **Read-only on purpose:** the report toggles auto-save (PUT) to the shared QA owner account and can trigger real emails, so the test never flips a switch or saves. It also deliberately avoids the Schedule section and Save button, which only render when the master toggle is ON (`settings.enabled &&`) — account-state-dependent on shared QA.

---

## TC-140 — Owner Settings Notifications Sub-Tab Shows Coming-Soon

**Status:** ✅ Passing

### What it checks

Selecting the Notifications sub-tab shows the "launching soon" placeholder.

### How it works, step by step

1. Navigate to the Owner Settings tab
2. Click the "Notifications" sub-tab
3. Confirm the "Notification settings — launching soon" placeholder is visible

### Why it matters

Documents that the Notifications surface is not yet functional, so no future test should assert real notification settings there — the same pattern used for the Customers→Analytics "coming soon" sub-tab.

---

## TC-141 — Owner Can View the Daily Report (current business day)

**Status:** ✅ Passing

### What it checks

An owner can open Store Operations → Daily Report and see the current business day's live report render.

### How it works, step by step

1. Open the restaurant management portal
2. Open the "Store Operations" flyout in the sidebar and click "Daily Report" (`store-daily-close` → `?tab=store-daily-close`, renders `DailyCloseTab`)
3. Confirm the "At a Glance" comparison-KPI block and its Net Sales / Orders tiles render, with no load error
4. A `beforeAll` seeds real orders into today's business day (see TC-142) so the report has genuine data behind it

### Why it matters

The Daily Report is the owner's end-of-day snapshot (net sales, orders, tips, channels). Testing it required solving a data problem — see TC-142.

---

## TC-142 — Seeded Orders Are Reflected in Today's Daily Report KPIs

**Status:** ✅ Passing

### What it checks

Deterministic proof that the report aggregates real order data: after seeding N orders with a known net-sales amount into the current business day, the day's KPIs grow by at least that much.

### How it works, step by step

1. `beforeAll`: log in as owner, read the current business day's KPIs (`GET /restaurant/:id/daily-close?include=report` → `comparisons.current`) as a **baseline**, then seed **3 CONFIRMED orders at $15 net each** via the new `createSeededOrder` helper.
2. The test re-reads the KPIs and asserts `orderCount` grew by **≥ 3** and `netSales` grew by **≥ $45** vs. baseline.
3. Uses `≥` (not `==`) because other specs can add orders to the same day concurrently — they only ever increase it.

### Why it matters

**This is how we solved "not enough data for a meaningful report."** Key mechanism (no Stripe needed):

- The report buckets orders by `createdAt`, so orders created "now" already land in today's business day (the 4 AM cutoff is applied identically to the order and the view).
- Revenue reads the order's own `subtotal`/`total`, and the backend trusts client-supplied totals.
- A nonzero order is created in status `INITIALIZED` (excluded from reports), so `createSeededOrder` **creates then bumps** the order to `CONFIRMED` via the status endpoint (which has no source-state check).

Seeded orders are permanent QA residue (no order-delete API), which is why the assertions are delta-based. See the `createSeededOrder` / `getDailyReportKpis` helpers in `utils/apiHelper.ts`. The "Close Day" mutation flow (writing a persisted `DailyClose`) is intentionally out of scope.

---

## TC-30 — Owner Can Navigate to the Create Coupon Form

**Status:** ✅ Passing

### What it checks

An owner can expand the Coupons section in the sidebar and open the Create Coupon form.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks the "Coupons" section in the sidebar (which expands to show sub-options)
3. It clicks "Create Coupon"
4. It confirms the coupon creation form appears — showing a field for the coupon code

### Why it matters

Coupons are a key marketing tool for restaurants to attract customers. If the form doesn't open, owners can't run promotions or discounts.

---

## TC-31 — Owner Can Create a New Coupon

**Status:** ✅ Passing

### What it checks

An owner can fill out the coupon form with a code, discount amount, and date range — then save it and receive a success message.

### How it works, step by step

1. The test opens the Create Coupon form
2. It fills in:
   - **Coupon Code:** a unique auto-generated code (e.g. AUTO123456)
   - **Discount Value:** 10 (meaning 10% off)
   - **Start Date:** 1 July 2026
   - **End Date:** 31 December 2026
3. It clicks the "Create Coupon" button
4. It confirms the message "Coupon created successfully!" appears on screen

### Why it matters

If coupon creation fails, the restaurant can't run any promotions. This directly impacts the owner's ability to attract and retain customers.

---

> **Note:** TC-33 and TC-34 below are narrative placeholders for
> features that still have no test code at all (no `test()` or `test.skip()`
> call anywhere in `tests/`) — unlike most other "Skipped" entries in this
> doc, which correspond to a real `test.skip()`/`test.fixme()` in the suite.
> They're kept as a backlog description, not a status report on existing code.
> (TC-35, formerly listed here, is now implemented — see below.)

## TC-33 — Owner Can Configure Hours of Operation

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to the Hours of Operation section and see all seven days of the week ready to be configured.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Hours" in the sidebar
3. It confirms the hours tab loads
4. It checks that all seven days are visible: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday

### Why it matters

Without setting hours, the restaurant's online ordering page won't show customers when they can place orders. It's one of the first things an owner must configure before going live.

---

## TC-34 — Owner Can Access Employee Management

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to the Employee Management section and see an option to add new staff members.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Employees" in the sidebar
3. It confirms the employee management area loads with an "Add Employee" button visible

### Why it matters

Owners need to add and manage their restaurant staff on the platform. If this section doesn't load, they can't assign roles, set access levels, or onboard new team members.

---

## TC-35 — Owner Can View the Analytics Dashboard

**Status:** ✅ Passing

### What it checks

An owner can navigate to the Analytics section and see the Restaurant Analytics dashboard load with its header controls.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Analytics" in the sidebar (PortalShell menu id `Analytics` → `?tab=Analytics`)
3. It confirms the dashboard header loaded — the "Restaurant Analytics" title, the Refresh control, and the date-range selector are all visible; the selector names the default window ("Last 30 days" — since RestauNax 5ca965101 it shows the preset name instead of the literal dates)

### Why it matters

Analytics is how owners track the performance of their restaurant. Without it, they have no visibility into revenue trends, popular items, or customer behavior.

> This placeholder was previously "Skipped — not yet implemented." It is now implemented in `tests/dashboard/owner/12-analytics.spec.ts` (POM: `OwnerAnalyticsPage`), alongside the deeper analytics checks TC-127 → TC-129 below. Same precedent as TC-84/85 filling the old TC-36 placeholder.

---

## TC-127 — Analytics Dashboard Resolves Without Erroring

**Status:** ✅ Passing

### What it checks

Once the `/api/analytics/dashboard/:restaurantId` fetch completes, the page shows either the summary cards (when the window has orders) or the "no data for this range" empty state — and never the load-error alert.

### How it works, step by step

1. Navigate to the Analytics tab
2. Assert that either the "Total Orders" summary card **or** the empty-state message is visible (data-volume-agnostic, so it's deterministic on shared QA)
3. Assert the "Failed to load dashboard data" error alert has zero matches

### Why it matters

Proves the analytics fetch path works end-to-end regardless of how much order data QA currently holds, instead of a brittle assertion that assumes a specific number of orders.

---

## TC-128 — Analytics Date-Range Picker Opens With Presets

**Status:** ✅ Passing

### What it checks

Clicking the date-range button opens the picker popover exposing the Quick Select presets (Last 7 days / Last 30 days).

### How it works, step by step

1. Navigate to the Analytics tab and confirm it loaded
2. Click the date-range button (its label is the formatted current window)
3. Confirm the "Last 7 days" and "Last 30 days" preset buttons are visible

### Why it matters

Changing the reporting window is the primary interaction on the analytics page; this verifies the control is actually reachable, not just present.

---

## TC-129 — Changing the Range Reloads the Dashboard

**Status:** ✅ Passing

### What it checks

Selecting the "Last 7 days" preset and applying it re-fetches the dashboard for the new window.

### How it works, step by step

1. Navigate to the Analytics tab
2. Open the picker, apply "Last 7 days", and wait for the `GET /api/analytics/dashboard/*` response — assert it returns OK
3. Confirm the dashboard resolves again (cards or empty state) with no load error, and the date-range trigger now reads "Last 7 days"

### Why it matters

Verifies the date filter actually drives a new query rather than just updating the button label, so owners see data for the window they picked.

---

## TC-84 / TC-85 — Owner Can View Their Billing and Subscription

**Status:** ✅ Passing

### What it checks

An owner can navigate to the Subscription Management page and see their current plan, price, and plan details.

### How it works, step by step

1. The test navigates directly to `/restaurant/restaurantId/:id/subscription`
2. It confirms the "Subscription Management" heading is visible and the page isn't redirected to Access Denied — this route is gated by a permission (`MODIFY_RESTAURANT`), not a role, so OWNER can reach it directly
3. A second test confirms the "Plan Details" section (current plan, price) renders

### Why it matters

Owners need to see what plan they're on and their billing status. These are read-only assertions on purpose — the test never changes the shared QA account's real billing state.

> Earlier documentation described this as "TC-36" and marked it not-yet-implemented; the real, passing tests were built as TC-84/TC-85.

---

## TC-81 — Owner Is Denied the Loyalty Program Page

**Status:** ✅ Passing

### What it checks

An owner who navigates directly to `/restaurant/loyalty` is redirected to Access Denied.

### How it works, step by step

1. The test logs in as OWNER and navigates to `/restaurant/loyalty`
2. It confirms the URL ends up on `/access-denied`

### Why it matters

Earlier documentation (formerly "TC-37") assumed owners could reach the loyalty setup page directly. Checking the actual frontend route guard found `/restaurant/loyalty` is gated `[ADMIN, EMPLOYEE]` only — **OWNER is excluded**, the same as the `/publish` and `/tax` routes. This test (and the corrected `CLAUDE.md` route table) documents the real behavior instead of the wrong assumption.

---

## TC-82 / TC-83 — Owner Can Access Uber Eats Settings

**Status:** ✅ Passing

### What it checks

An owner can navigate directly to the Uber Eats delivery settings page for their restaurant and see the delivery configuration.

### How it works, step by step

1. The test navigates to `/restaurant/restaurantId/:id/uber` as OWNER
2. It confirms the "Uber Direct Delivery Settings" heading is visible and the page isn't redirected to Access Denied — this route's guard explicitly includes `Role.OWNER`, unlike publish/tax/loyalty
3. A second test confirms the "Delivery Configuration" section (mode, provider, environment) renders

### Why it matters

Many restaurants use Uber Eats as a delivery channel. If this settings page is broken, owners can't view their delivery integration status.

> Earlier documentation described this as "TC-38" and marked it not-yet-implemented; the real, passing tests were built as TC-82/TC-83.

---

## TC-86 / TC-87 — Owner Can Access the Deals Section

**Status:** ✅ Passing

### What it checks

An owner can expand the Deals section in the sidebar, reach the Manage Deals tab, and see the Create Deal action.

### How it works, step by step

1. The test opens the restaurant management portal and expands the "Deals" flyout section in the sidebar
2. It clicks "Manage Deals" and confirms the URL contains `?tab=deals` with the "Manage Deals" heading visible
3. A second test confirms the "Create Deal" button is visible on that tab

### Why it matters

Deals are time-limited promotions that drive sales. These tests are navigation-only for now — a full create-deal flow needs a deals API helper (for setup/cleanup) that doesn't exist yet, so it wasn't force-fit into this pass.

> Earlier documentation described this as "TC-39" and marked it not-yet-implemented; the real, passing tests were built as TC-86/TC-87.

---

## TC-88 — Owner Can Edit and Save a Store Settings Field

**Status:** ✅ Passing

### What it checks

An owner can change a Store Settings field (the delivery order standard prep time) and save it, seeing a success confirmation — and the test restores the original value afterward.

### How it works, step by step

1. The test opens Store Settings and reads the current delivery prep-time value
2. It changes the value by 1 minute and clicks "Save changes"
3. It confirms the "Settings saved successfully" toast appears
4. It sets the field back to its original value and saves again, so the shared QA restaurant's data isn't left mutated

### Why it matters

If saving restaurant settings doesn't work, every change an owner makes will be silently lost. The self-reverting design means this test can run repeatedly without corrupting the seed restaurant's real configuration.

> Earlier documentation described a "Restaurant Info" form under "TC-40"/"TC-41" (name/phone number editing) that turned out not to exist on the live Store Settings tab — the only editable fields found were the order-preparation-time numbers. The real, passing test was built as TC-88.

---

## TC-42 — Owner Can Rename a Menu Category

**Status:** ✅ Passing

### What it checks

An owner can rename an existing menu category in the menu builder and the new name sticks.

### How it works, step by step

1. The test opens the menu builder for the seed restaurant and creates a throwaway category ("Test Starters <run> Rename")
2. It clicks "Rename category" next to the category heading, types the new name and presses Enter
3. It confirms the heading and the category tab show the new name and the old tab is gone
4. It reloads the builder and confirms the new name is still there
5. It deletes the renamed category (the teardown sweep catches it if the test dies first)

### Why it matters

If category editing is broken, owners cannot correct typos or reorganise their menu structure. Customers would see incorrect category names on the ordering site.

---

## TC-43 — Owner Can Edit a Menu Item Name and Price

**Status:** ✅ Passing

### What it checks

An owner can open a menu item, change its name and price, save successfully, and see a confirmation.

### How it works, step by step

1. The test navigates to the Menu tab
2. It clicks the edit icon on the item created in TC-21 ("Automation Bruschetta")
3. It updates the name to "Automation Bruschetta Edited" and the price to $12.99
4. It saves and confirms a success toast appears

### Why it matters

If item editing is broken, owners cannot update prices or fix item names after they are published. Customers could be charged the wrong price.

---

## TC-44 — Owner Can Delete a Menu Item

**Status:** ⏭️ Skipped — no delete button on menu item cards in the current UI; only Edit and Clone are available

### What it checks

An owner can delete a menu item from a category and confirm it no longer appears in the menu.

### How it works, step by step

1. The test navigates to the Menu tab
2. It clicks the delete icon on "Automation Bruschetta Edited" (created and edited in TC-21 / TC-43)
3. It confirms the deletion dialog if prompted
4. It verifies the item is no longer visible in the category

### Why it matters

If item deletion is broken, owners cannot remove sold-out or discontinued items. Customers could try to order items that are no longer available.

---

## TC-45 — Owner Can Delete a Menu Category

**Status:** ✅ Passing

### What it checks

An owner can delete an empty menu category and confirm it no longer appears in the menu list.

### How it works, step by step

1. The test navigates to the Menu tab
2. It clicks the delete icon on "Test Starters Edited" (the renamed category from TC-42, now empty after TC-44)
3. It confirms the deletion dialog if prompted
4. It verifies the category is no longer visible

### Why it matters

If category deletion is broken, owners are left with empty or outdated sections cluttering their menu. This also serves as cleanup — TC-42 to TC-45 together leave QA in the same state as before the tests ran.

---

---

# 🛒 SECTION 4 — Customer Ordering

> These tests check what a customer experiences when they visit a restaurant's online ordering page, browse the menu, and place an order. This uses the customer-facing website (not the owner dashboard).

---

## TC-22 — Customer Can See the Menu Page

**Status:** ✅ Passing (needs `OWNER_EMAIL`/`OWNER_PASSWORD` and `TEMPLATE_WIND_URL` pointing at a real per-restaurant Template Wind deployment — the bare `qa.restaunax.com` root only serves the marketing site)

### What it checks

A customer visiting the restaurant's online ordering link can see the menu page load successfully.

### How it works, step by step

1. The test opens the customer ordering website with the test restaurant's ID
2. It confirms the URL changes to the menu page — the page has loaded

### Why it matters

If the menu page doesn't load, no customer can see what's available to order. The restaurant's entire online ordering is down.

---

## TC-23 — Customer Can Click a Menu Item and See Add to Cart

**Status:** ✅ Passing (needs `OWNER_EMAIL`/`OWNER_PASSWORD` and `TEMPLATE_WIND_URL` pointing at a real per-restaurant Template Wind deployment — the bare `qa.restaunax.com` root only serves the marketing site)

### What it checks

When a customer clicks on a food item, a pop-up appears showing the item details with an "Add to Cart" button.

### How it works, step by step

1. The test opens the menu page
2. It finds the test food item ("Automation Burger") and clicks on it
3. It confirms a pop-up window opens
4. It confirms the "Add to Cart" button is visible inside the pop-up

### Why it matters

If clicking an item doesn't open the details pop-up, customers can't add anything to their cart — meaning zero orders can be placed.

---

## TC-24 — Customer Can Reach the Checkout Page With Items in Cart

**Status:** ✅ Passing (needs `OWNER_EMAIL`/`OWNER_PASSWORD` and `TEMPLATE_WIND_URL` pointing at a real per-restaurant Template Wind deployment — the bare `qa.restaunax.com` root only serves the marketing site)

### What it checks

A customer who has items in their cart can proceed to the checkout page and see the order form.

### How it works, step by step

1. The test adds a test item to the cart behind the scenes (simulating what a customer does after clicking Add to Cart)
2. It navigates to the checkout page
3. It confirms the customer information form is visible — specifically the First Name field

### Why it matters

If the checkout page doesn't load with cart contents, no customer can complete a purchase — the restaurant makes no revenue.

---

## TC-25 — Customer Can Fill in Their Details and Reach the Payment Step

**Status:** ✅ Passing (needs `OWNER_EMAIL`/`OWNER_PASSWORD` and `TEMPLATE_WIND_URL` pointing at a real per-restaurant Template Wind deployment — the bare `qa.restaunax.com` root only serves the marketing site)

### What it checks

A customer can fill in their name, email, and phone number, choose "Pickup," and move to the payment step where they'll enter card details.

### How it works, step by step

1. The test puts items in the cart and goes to checkout
2. It fills in the customer details:
   - **First Name:** Jane
   - **Last Name:** Tester
   - **Email:** jane@restaunax-test.com
   - **Phone:** 555-987-6543
3. It selects "Pickup" as the order type
4. It clicks "Proceed to Payment"
5. It confirms the payment section appears (showing a "Complete Order" button)

### Why it matters

If the form doesn't accept customer details or the Proceed button doesn't work, the checkout process is completely broken — no one can pay.

---

## TC-263 → TC-324 — Menu Management, Deep Coverage (owner portal + chains, 2026-08-16)

**Status:** ✅ Passing. The six `test.fail()` pins this batch shipped with (TC-282, TC-283..286, TC-317) were flipped to plain tests on 2026-08-17 the same day RestauNax PR #602 (issue #601) reached QA — they now assert the FIXED behaviour.

Added by the second tab-by-tab audit (`docs/MENU_TAB_TEST_STRATEGY.md`). Until now the menu had builder smoke coverage only (TC-19..67). These tests cover the actual **Menu tab** (`?tab=Menu`, "Menu Availability Management"), the **builder** cards, the 4-step **item wizard** (modifiers + image), the **item detail** page, the whole **chain** menu model (shared vs. per-location), the backend **API contract**, and the **storefront hand-off**. Layout: `api-menu.spec.ts` (TC-263..287), `04b-menu-availability.spec.ts` (TC-288..293), `04c-menu-item-editor.spec.ts` (TC-294..307), `17-chain-menu.spec.ts` (TC-308..319), `customer/06-menu-handoff.spec.ts` (TC-320..322), `admin/chains.spec.ts` (TC-323, TC-324).

**Chain fixture:** a persistent two-location "Automation Chain" (Loc A / Loc B, owned by the seed OWNER, 24-h hours + tax) is created once by `globalSetup` (`ensureAutomationChain`) and reused; chain tests skip with a reason if it can't be built.

### API contract (`api-menu.spec.ts`)

| TC                     | What it checks                                                                                                                                                                                                                                   | Why it matters                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **TC-263**             | The menu read is public, hides soft-deleted items, carries `outOfStock`/`featured`.                                                                                                                                                              | Storefront and owner UI share this read.                                 |
| **TC-264**             | Create item requires price + groupId.                                                                                                                                                                                                            | Validation contract.                                                     |
| **TC-265**             | Modifier normalisation: Free groups store $0, child groups forced free, one level of nesting, sortOrder = index.                                                                                                                                 | `MENU_MODIFIER_SYSTEM.md` rules every customer app relies on.            |
| **TC-266**             | The deep-editor diff payload (deleted / added / modified) applies in one call; mismatched id → 400.                                                                                                                                              | The wizard's save contract.                                              |
| **TC-267**             | Modifier reorder is index-based and ignores foreign ids.                                                                                                                                                                                         | Tenant-safe reorder.                                                     |
| **TC-268 / 269**       | Availability toggle writes `outOfStock` (400 without the flag); reset-availability restores a whole category.                                                                                                                                    | The Menu tab's two core actions.                                         |
| **TC-270**             | A standalone restaurant can feature at most 5 items (6th → "You can only have 5 featured items").                                                                                                                                                | Storefront featured strip cap.                                           |
| **TC-271 / 272 / 273** | Item delete is soft and `/permanent` is admin-only; an item used by an ACTIVE deal can't be deleted (409 + blockers); a category with items can't be deleted (400).                                                                              | Data-loss guards.                                                        |
| **TC-274**             | Override routes reject standalone items ("only available for chain master items"), require restaurantId and a token.                                                                                                                             | Chain-only machinery stays chain-only.                                   |
| **TC-275 – 281**       | Chain: per-location price override (A only, null clears), location-pricing for a size, carry off hides from A's storefront only, per-location 86, location-only items invisible to B, clone into a chain member refused, featured is chain-wide. | The whole `CHAIN_RESTAURANTS.md` override model, asserted at the source. |
| **TC-282** 🔴          | pin — chain reset-availability should un-86 locations (today it only clears the master flag).                                                                                                                                                    | Real bug.                                                                |
| **TC-283 – 286** 🔴    | pins — another owner must NOT be able to edit / delete / create-into / image-swap our menu (today: 200 — authenticated IDOR on `PUT …/changes`, `DELETE menuItemId`, `POST item/new`, `DELETE group`, `POST upload/…/picture`).                  | Security.                                                                |
| **TC-287**             | Positive control: the guarded routes (availability / featured / price-override) do return 403 to a second owner.                                                                                                                                 | Proves the pins' fixture.                                                |

### Menu tab (`04b-menu-availability.spec.ts`)

| TC         | What it checks                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-288** | Sidebar Menu → "Menu Availability Management"; seeded category "6 Available"; "Add or edit items" (was "Manage Menu") → builder as the portal's `?tab=menu-builder` tab (sidebar kept); "Back to Menu" returns. |
| **TC-289** | Switch OFF → scope dialog "Mark "X" as sold out?" ("Where should this be unavailable?", Everywhere preselected) → PATCH `{outOfStock:true}` → chips 5/1 + toast; ON → no dialog; Cancel keeps it available.     |
| **TC-290** | "Restore All to Available" appears only with out-of-stock items; its dialog names the count; restores the whole category.                                                                                       |
| **TC-291** | Star → Featured accordion `n/5`; un-star; the 6th is refused with the cap error while the counter stays 5/5.                                                                                                    |
| **TC-292** | Refresh re-fetches and reflects a change made via API behind the page.                                                                                                                                          |
| **TC-293** | A menu-less restaurant shows "No menu data available" → "Add your first items" → the in-portal builder tab with "No categories yet" + New Category.                                                             |

### Builder, wizard, item detail (`04c-menu-item-editor.spec.ts`)

| TC               | What it checks                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-294**       | New Category presets; duplicate name → "already exists in category".                                                                                                                                                             |
| **TC-295**       | Wizard step-0 rules: min 2 chars, price > 0 (QA build says "Price must be positive"), ≤ $9,999.99, description ≤ 500.                                                                                                            |
| **TC-296**       | Wizard saves an item with a Sets-Final-Price size group, a paid extra (Allow Multiples) and a free group; API stores the modes; detail page lists them.                                                                          |
| **TC-297**       | Wizard image step uploads a PNG through the hidden file input; item carries `imageUrls`.                                                                                                                                         |
| **TC-298**       | "Start from a Template" (lazy per cuisine → Pizza) prefills name/price.                                                                                                                                                          |
| **TC-299**       | Clone Item → wizard prefilled "<name> (Copy)" → second independent item.                                                                                                                                                         |
| **TC-300**       | Card click ("View Details") → item detail PANEL in place (no navigation); panel Edit Item → edit wizard (`?from=builder`), Back returns to the builder; "Preview as a customer sees it" → full item page with `?action=preview`. |
| **TC-301**       | Detail Upload (dialog → Save changes) / Remove Image (confirm) round-trip.                                                                                                                                                       |
| **TC-302**       | Detail Delete → soft delete: builder card badged "No longer available", merged-menu read hides it, detail shows the inactive banner.                                                                                             |
| **TC-303**       | Delete blocked by an active deal → "Cannot Delete This Item" dialog listing the deal.                                                                                                                                            |
| **TC-304**       | Reorder modifiers — keyboard drag in the dnd-kit sheet persists the order.                                                                                                                                                       |
| **TC-305**       | Card star toggles featured; Menu tab's Featured accordion reflects it.                                                                                                                                                           |
| **TC-306 / 307** | Presence smokes: Clone Menu dialog; AI Menu Import / Bulk AI Images / Paste Menu Item dialogs open and close (nothing generated).                                                                                                |

### Chain menu (`17-chain-menu.spec.ts`)

| TC            | What it checks                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-308**    | Location A: "Managing … part of your chain", location banner, split summary, "From shared menu" vs "This location only" chips; only shared items get the $ / carry icons; builder scope bar + disabled Clone Menu; "Switch to all 2 locations" → chain shell. |
| **TC-309**    | Chain shell Menu tab: shared banner, availability switch disabled, no $ / carry icons, A's private item hidden.                                                                                                                                               |
| **TC-310**    | $ dialog: base 14 at A → "Location price: $14" + "1 location has a different price"; B still 12; reset row → shared.                                                                                                                                          |
| **TC-311**    | 86 at A leaves B available (both UI and API).                                                                                                                                                                                                                 |
| **TC-312**    | Carry off at A → "Add back…" icon, absent from A's customer read, present at B; add back.                                                                                                                                                                     |
| **TC-313**    | Renaming a shared item at A fans out to B (fan-out confirm accepted when shown).                                                                                                                                                                              |
| **TC-314**    | "Who is this item for?" — Just this store → `?ownerOnly=1`, location-only banner, item absent at B; All my stores → present at both.                                                                                                                          |
| **TC-315**    | New Category scope radio: Just this store → "Only at this location"; All my stores → fan-out confirm → "Shared · all 2 locations", visible at B.                                                                                                              |
| **TC-316**    | Featuring a shared item is chain-wide; a local item stays local.                                                                                                                                                                                              |
| **TC-317** 🔴 | pin — "Reset all to shared" should reset SAVED overrides to the shared prices (today it only discards unsaved edits — `LocationPricingEditor.resetAll` seeds from the override).                                                                              |
| **TC-318**    | $ dialog per-modifier override (Large 18) + base; "%" quick-adjust previews relative to the SHARED prices; row resets clear all.                                                                                                                              |
| **TC-319**    | "Manage shared menu" from the chain shell opens the same chain-aware builder as the chain shell's `?tab=menu-builder` tab (anchored on a member; no chain-keyed builder): shared chip, "Who is this category for?" scope, Back to Menu.                       |

### Storefront hand-off (`customer/06-menu-handoff.spec.ts`) and admin chains (`admin/chains.spec.ts`)

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-320** | Owner 86s an item → Template Wind no longer lists it → restore → back.                                                                                                                                                                                                                                                                                                             |
| **TC-321** | Per-location override: Wind shows $14 at A and $12 at B; the public `/quote` (what checkout charges) returns 14 at A / 12 at B.                                                                                                                                                                                                                                                    |
| **TC-322** | Uncarry at A → absent from Wind A only.                                                                                                                                                                                                                                                                                                                                            |
| **TC-323** | Admin links an existing store (menu kept): its own items interleave at that location only; unlink → back to 2.                                                                                                                                                                                                                                                                     |
| **TC-324** | Unlink refused for a live store ("gone live") and a non-member (404); cancelling the order lets it leave; admin DELETE only archives and never detaches membership. The store is published just long enough to take its order (unpublished stores refuse orders since restaunax 04d3c8d0e), then unpublished — a published location is itself "established" and could never leave. |

**Real product findings from this batch (2026-08-16):** (1) authenticated IDOR across most `/menu` mutations (TC-283..286 pins); (2) chain "Restore All to Available" doesn't un-86 locations (TC-282 pin); (3) "Reset all to shared" in the per-location pricing dialog doesn't reset saved overrides (TC-317 pin); (4) UX: the caption under the Menu-tab availability switch labels the opposite state (the chip next to the name is correct); (5) `CHANNEL_PRICING_DESIGN.md` says the override routes are unauthenticated — the code mounts them behind `requireAuth` (TC-274 pins the code). The "shown $14, charged $12" chain defect described in that design doc is **fixed on QA** (TC-321 proves the quote uses the override).

---

## TC-325 → TC-371 — Deals, Deep Coverage (owner portal + chains + storefront, 2026-08-18)

**Status (2026-10-15):** 🗄️ the dashboard half — TC-351 → TC-364 (`11-deals`) and TC-365/366 (`18-chain-deals`) — is **retired** with the old Deals pages (see “Retired with the old Coupon and Deal pages” in the Promotions section); TC-325 → TC-350 (API) and TC-367 → TC-371 (storefront) stay live. Historical status: ✅ Passing (53/53 in the combined run, incl. the pre-existing TC-86/87/195..197). Shipped with **eleven `test.fail()` pins** for RestauNax bugs found by the audit; **all were FIXED in RestauNax #618/#619 and are live on QA — the pins were flipped to plain passing tests on 2026-08-19** (TC-334, 335b, 336, 341, 343, 347..350, 358 now assert the fixed behaviour).

Added by the third tab-by-tab audit (`docs/PROMOTIONS_TEST_STRATEGY.md`). Until now Deals had two navigation checks (TC-86/87) and three storefront checks (TC-195..197). These tests cover the **Manage Deals** table (`?tab=deals`), the **Create / Edit** form (`?tab=create-deal`), the 10-active **cap**, **Deal Analytics** (`?tab=deal-analytics`), the **AI Generator** (presence only — the paid generate call is never made), the **chain** deal model, the backend **API contract** (validation, qty-1 slot invariant, availability window, `/validate`, what the customer is **charged** via the public `/quote`, stats, bulk, authz), and the **storefront hand-off** including one **paid** Stripe order that proves the usage counters. Layout: `api-deals.spec.ts` (TC-325..350), `11-deals.spec.ts` (TC-351..364), `18-chain-deals.spec.ts` (TC-365, 366), `customer/08-deals-handoff.spec.ts` (TC-367..371).

**Isolation:** the API file mints its own throwaway tenant per run (`createSecondOwner` → restaurant archived in `afterAll`) — the seed restaurant carries five real ACTIVE deals and only ten may be active, so the UI/storefront files keep a two-deal ACTIVE footprint there and re-activate with a cap-tolerant retry. The seed OWNER doubles as the cross-tenant "intruder" for the authz pins.

### API contract (`api-deals.spec.ts`, throwaway tenant)

| TC                | What it checks                                                                                                                                                                                                  | Why it matters                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| **TC-325**        | Create computes `originalPrice` / `savingsAmount` / `savingsPercentage` (1 dp) server-side, defaults to ACTIVE, `imageUrl` null, and splits a qty-2 slot into two qty-1 `DealItem` rows (sortOrder renumbered). | The platform-wide "one row per unit" invariant every client relies on. |
| **TC-326**        | Create validation strings: missing fields, price ≤ 0, bad `HH:MM` start/end, unknown restaurant.                                                                                                                | Validation contract.                                                   |
| **TC-327**        | Owner list: `computedStatus EXPIRED` for a past `endDate` (status stays ACTIVE), `isAvailable false` when a required item is 86'd, newest first.                                                                | What the table's badges/switch derive from.                            |
| **TC-328**        | `GET /:id` 404; `PUT` is a patch — rename keeps slots, new `items` re-create every row (ids change) and reprice.                                                                                                | Edit contract; clients holding `dealItemId` must refetch.              |
| **TC-329**        | `PATCH /status` round-trip + messages; anything but ACTIVE/INACTIVE → 400.                                                                                                                                      | The switch.                                                            |
| **TC-330**        | DELETE is a hard delete (GET 404, list shrinks); unknown → 404.                                                                                                                                                 | Data-loss semantics (documented in the confirm dialog).                |
| **TC-331**        | Public `/active` lists only ACTIVE deals inside every window (status, `startDate`/`endDate`, `validDays`, `HH:MM`, single-sided bound ignored); `/validate` explains the reason; unknown restaurant → `200 []`. | What the storefront renders.                                           |
| **TC-332**        | 86'ing a required slot item hides the deal from `/active`; restore brings it back.                                                                                                                              | Availability layer 4.                                                  |
| **TC-333**        | Public `/validate`: 400/404/400 branches, "Deal is valid", INACTIVE verdict, unfilled-slot issue.                                                                                                               | Checkout pre-check.                                                    |
| **TC-334**        | An 11th ACTIVE create at the cap is refused (was a create-path bypass; fixed #618).                                                                                                                             |
| **TC-335 / 335b** | `active-count` shape; PATCH and `PUT {status:ACTIVE}` at the cap both refused with `MAX_ACTIVE_DEALS_REACHED` (PUT path fixed #618).                                                                            |
| **TC-336**        | `PUT` re-applies create's validation — price 0 / "9am" rejected (fixed #618; a 0 price would flow into the charge).                                                                                             |
| **TC-337**        | `/quote` charges `dealPrice × qty`, reports `savings`, ignores the client's `dealPrice`.                                                                                                                        | Server-authoritative pricing.                                          |
| **TC-338**        | `/quote` upcharge: ADJUSTS at full price, REPLACES as the delta above the default, downgrade clamped 0, client `upchargeAmount` ignored.                                                                        | The upcharge contract (`dealPricing.ts`).                              |
| **TC-339**        | `/quote` rejects a foreign restaurant's deal and an INACTIVE deal with the customer-facing messages.                                                                                                            | Tenant safety + window re-enforced at charge time.                     |
| **TC-340**        | `/stats` summary deltas (+2 total / +1 active; `activeCount` ignores `validDays`), shape of `topDeals` / `usageTrend` / `audienceDistribution`.                                                                 | Deal Analytics source.                                                 |
| **TC-341**        | Bulk: `[]` → 400, two → 201 with counts; `aiGenerated:false` honoured (`                                                                                                                                        |                                                                        | true`→`?? false`, fixed #618). |
| **TC-342**        | Public `GET /ai/questions` is static with the four question ids.                                                                                                                                                | Generator step 0, no AI call.                                          |
| **TC-343**        | The engine refuses a % coupon on an order with a deal — coupon 0 + `coupon_deal_exclusive` ERROR (fixed #619, option A; every client).                                                                          |
| **TC-344**        | Chain deal: offered at BOTH locations, quoted at Loc B, listed by `/api/chains/:gid/deals`, absent from a member's owner list, non-chain item → 400, deleted via `/api/deals/:id`.                              | `CHAIN_RESTAURANTS.md` deal model.                                     |
| **TC-345**        | Positive control: a non-owner gets 403 on the chain deal routes (`requireChainOwner`).                                                                                                                          | Shows what the per-restaurant routes should do.                        |
| **TC-346**        | Unauthenticated → 401 on every protected route.                                                                                                                                                                 | Baseline.                                                              |
| **TC-347 – 350**  | Another owner gets 403 reading our deals/stats/menu-picker/deal, deactivating, editing, creating-into or deleting (IDOR fixed #618; same class as menu #601).                                                   |

### Manage Deals table, form, analytics, AI (`11-deals.spec.ts`) — retired 2026-10-15 (see “Retired with the old Coupon and Deal pages”)

| TC         | What it checks                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-351** | Rows cell-for-cell for API-seeded deals (name, "N items", `$deal` + struck `$orig`, "X% off", "All days"/"All day" vs "Mon, Wed" + "11:00 - 14:00", badge, "0 times", "Location" chip); stat cards equal the page's own list response.                         |
| **TC-352** | Search by name / description; no match → "No deals found" + "Create Your First Deal"; Refresh re-fetches.                                                                                                                                                      |
| **TC-353** | Status filter Active / Inactive / Expired; expired row = disabled switch + "Cannot toggle expired deals".                                                                                                                                                      |
| **TC-354** | Sort by Price and Savings against the server numbers.                                                                                                                                                                                                          |
| **TC-355** | Row expand → "Deal Items" chips `1x <item> ($price)` (one per qty-1 slot).                                                                                                                                                                                     |
| **TC-356** | Switch: activate (cap-tolerant) → PATCH 200 + "Deal activated successfully" + badge; deactivate back.                                                                                                                                                          |
| **TC-357** | Delete → confirm dialog (title, "You're about to delete…", 3 consequences); Cancel keeps it; Confirm → DELETE 200 + snackbar + row gone + API 404.                                                                                                             |
| **TC-358** | Searching from page 2 shows the matching row — pagination resets on filter (fixed #618).                                                                                                                                                                       |
| **TC-359** | Cap banners: "You have N of 10 deals enabled" at ≥ 8, "Maximum active deals reached" at 10, activating another → warning snackbar with the backend message; top-ups torn down inside the test.                                                                 |
| **TC-360** | Rewritten for guided deal types: four type cards; COMBO = one line per unit (picking the Burger again adds a line; no qty box, no duplicate snackbar); live `deal-price-preview`; remove reprices; name required; a combo at its regular price is never saved. |
| **TC-361** | Rewritten for guided deal types: COMBO via the form (Burger ×2 lines + Fries at 21) → POST 201 `dealType` COMBO → snackbar → table; API: three qty-1 INCLUDED rows + computed savings.                                                                         |
| **TC-362** | Rewritten for guided deal types: Edit via row menu, prefilled lines; rename, reprice, remove + add a line → PUT 200 → snackbar → row + API updated (still COMBO).                                                                                              |
| **TC-363** | Deal Analytics metric cards + summaries equal `GET /stats`; top table (or "No deal usage data yet").                                                                                                                                                           |
| **TC-364** | AI Generator smoke: heading, stepper, server questionnaire, Meal Type disabled, "Generate Deals" gated on audience + price range — never clicked.                                                                                                              |

### Chain shell (`18-chain-deals.spec.ts`) — retired 2026-10-15 (see TC-833 → TC-835)

| TC         | What it checks                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-365** | Chain shell lists the chain deal ("Chain" chip, "across 2 chain locations", "View Analytics" → `/deal-stats`); member location: Deals disabled ("Managed at chain level"), owner list excludes it, public `/active` at A and B includes it. |
| **TC-366** | Chain create through the form: "Create deal for all 2 locations" → fan-out confirm "Heads up — chain-wide change" → POST `/api/chains/:gid/deals` 201 → "Chain" row; offered at both locations.                                             |

### Storefront hand-off (`customer/08-deals-handoff.spec.ts`)

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-367** | "Today's Deals" on `/menu` shows the owner's card (Save %, Includes chips, struck price, View Deal → builder); owner pauses it from the Promotions row menu (row "Paused") → card gone + builder "Deal not found"; Turn on (row "Live", cap-tolerant) → back.                                                                                                                                                                                                                                                                                          |
| **TC-368** | Multi-item builder (burger ×2 + fries): header "Save 21%" / "You save $5.50" / "Available: All days, All day", two fixed steps — ONE "2 × <burger>" step (the server stores the burger ×2 as two quantity-1 rows; spec §13 groups them; no options, so no unit rows and no Customize) and the fries — "All set" from the start, never two "<burger>" steps → one "Add deal to cart"; checkout "Part of deal" ×3, deal row, "You're saving $5.50"; the page's own `/quote` carries `orderDeals` (claimed items stripped) and prices `dealsSubtotal 21`. |
| **TC-369** | Modifier on a slot (+$2 ADJUSTS) → build-up "Items $15.00 / Upgrades +$2.00 (Extra Cheese +$2.00) / Subtotal $17.00" (replaced the old "Modifiers/Upgrades" row, template-wind #117), expanded "(+$2.00)", quote `upcharge 2 / lineTotal 17`.                                                                                                                                                                                                                                                                                                          |
| **TC-370** | 86'ing a required slot item pulls the deal from `/menu` and the builder; restore brings it back.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **TC-371** | Paid journey (Stripe test card): confirmation lists "1x <deal>" + "Deal Savings −$5.50"; the order carries `orderDeals[0] {dealId, dealPrice 21}` + 3 items and `dealDiscountAmount 5.5`; `Deal.timesUsed` +1 / `totalRevenue` +21 on payment; the Promotions list row shows the use and "$5.50" saved, and Results' Top promotions lists it with the same numbers (the old Manage Deals revenue cell has no Promotions equivalent; revenue stays asserted through the deal API).                                                                      |

**Real product findings from this batch (2026-08-18) — ALL FIXED in RestauNax #618/#619, live on QA 2026-08-19, pins flipped to plain tests:** (1) authenticated IDOR on **every** `/api/deals` route (TC-347..350; reads verified live on QA); (2) `MAX_ACTIVE_DEALS` bypassable via create and `PUT` (TC-334, 335b); (3) `PUT /:dealId` has no validation — price 0 accepted (TC-336); (4) the pricing engine stacks a coupon on a deal although the rules doc says it never does — only template-wind blocks it client-side (TC-343); (5) Manage Deals pagination isn't reset on filter (TC-358); (6) `bulkCreateDeals` forces `aiGenerated: true` (TC-341); note-only: template-wind `DealsGridBlock` reads the wrong shape and never renders prices, `OrderDeal` snapshots are client-supplied (stats can be corrupted, not the charge), and the confirmation page greets a returning phone number by the **stored** customer name rather than the name typed at checkout (TC-371 uses a fresh phone).

---

## TC-508 → TC-542, TC-L60 → TC-L63 — Deal Scheduling (restaurant-local schedules, 2026-10)

**Status:** ⏭️ Gated. Baseline cases (TC-524..526, TC-L60..L62) pass on today's QA. The rest SKIP with a reason until restaunax Plan 1 (backend), Plan 2 (dashboard) and Plan 4 (template-wind / template-lima) are on QA (`utils/dealScheduleGate.ts`). After each part is confirmed, its gate is flipped and a missing capability FAILS instead.

Deals carry days, an HH:mm window (overnight allowed) and start/end dates, judged on the **restaurant's** clock (spec `restaunax/docs/superpowers/specs/2026-10-05-deal-scheduling-design.md`). Every expectation is computed from the restaurant's timezone (read from `/active` → `timeZone`) with `utils/dealSchedule.ts`. Nothing uses the runner's clock.

### API contract (`dashboard/owner/api-deals.spec.ts`, throwaway tenant)

| TC                     | What it checks                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-331** (rewritten) | `/active` hides INACTIVE / ended / not-started / other-weekday deals placed by dates and weekdays that are wrong in every zone; with Plan 1 it carries `timeZone` and null schedule text for an unrestricted deal. |
| **TC-508**             | `GET /api/deals/meal-periods` → Breakfast 05–11, Lunch 11–14, Dinner 17–22, Late Night 22–05, All Day null.                                                                                                        |
| **TC-509**             | 15:00–17:00 via `?at=`: listed earlier that day with `availableNow:false`, `nextAvailableAt`, "Available from 3:00 PM"; live 15:00 (incl.) – 17:00 (excl.); start-only window runs to midnight.                    |
| **TC-510**             | Overnight 22:00–02:00 belongs to its start day; live 01:30 next day, gone 02:00, not the night before.                                                                                                             |
| **TC-511**             | Dates are local calendar days, inclusive, returned as `YYYY-MM-DD`.                                                                                                                                                |
| **TC-512**             | Off for the whole local day → omitted; Spanish text via `Accept-Language`.                                                                                                                                         |
| **TC-513**             | `?at=` past (> 5 min), > 30 days or garbage → 400.                                                                                                                                                                 |
| **TC-542**             | `/active` carries `timeZone` and null schedule text for an unrestricted deal (split out of TC-331 so its base part reports passed on pre-Plan-1 QA).                                                               |
| **TC-539**             | `?channel=in_person&includeUnavailable=1` (the POS list) adds a deal that is off all day (`availableNow:false`, next start, summary); without the flag it stays omitted; an ended deal never appears.              |
| **TC-514**             | `/quote` with `scheduledFor` outside the window → 400 `DEAL_NOT_AVAILABLE_AT_TIME` + details; inside → 200; ASAP judged now.                                                                                       |
| **TC-515**             | Order placement with `scheduledFor` outside the window refused; inside accepted.                                                                                                                                   |
| **TC-516**             | Owner list `liveStatus` LIVE / LATER_TODAY / SCHEDULED / ENDED / OFF + `timeZone` / `timeZoneLabel`.                                                                                                               |
| **TC-517**             | Date-ended deals don't count toward the 10-active cap; a last-day deal whose window is over is `ENDED` but still holds its slot until the date passes.                                                             |
| **TC-518**             | An ended deal can't be switched on (400 `DEAL_ENDED`, PATCH and PUT) until its end date moves.                                                                                                                     |
| **TC-519**             | Create / PUT validation messages; all seven days → `[]`, ISO → date, overnight + options kept.                                                                                                                     |
| **TC-520**             | Bulk create validated before any write; valid bulk keeps schedule + occasion.                                                                                                                                      |
| **TC-521**             | `schedule-check`: closed days and windows starting before opening warn, named by restaurant; no hours → none; bad days → 400.                                                                                      |
| **TC-522**             | `schedule-check` negative: a window running past closing (or overnight inside an overnight day) is not flagged.                                                                                                    |

### Chain shell (`dashboard/owner/18-chain-deals.spec.ts`) — TC-523/533/534 now run from `20-chain-promotions.spec.ts`

| TC         | What it checks                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-523** | Chain create and chain bulk run the shared validation.                                                                                                     |
| **TC-533** | Chain form summary "in each location's local time"; the closed-day warning names only that location; table caption.                                        |
| **TC-534** | Chain `schedule-check`: one warning per closed location (by name); none otherwise. Location B's hours are changed for one day three days out and restored. |

### Dashboard (`dashboard/owner/11-deals.spec.ts`)

**Retired 2026-10-15** with `11-deals.spec.ts` — see “Retired with the old Coupon and Deal pages” in the Promotions section.

| TC                     | What it checks                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-353** (rewritten) | Status filter Live now / Coming up / Off / Ended; ended switch disabled with "This deal has ended. Change its last day to turn it back on."                                                                                                            |
| **TC-528**             | Both chip rows always visible (Weekdays/Weekends + days; Any time / meal periods with server hours / Happy hour / Custom); presets fill the MUI pickers; Any time hides them; summary sentence with days, hours, zone; meal type not in Extra details. |
| **TC-529**             | Lunch + Weekdays saves 11:00–14:00, `mealType: Lunch`, five days; Edit pre-selects them.                                                                                                                                                               |
| **TC-540**             | Custom after Lunch clears the meal type; a typed 4–6 PM window saves with `mealType: null`.                                                                                                                                                            |
| **TC-541**             | Editing Dinner's start keeps `mealType: Dinner`; "Until close" sends `validTimeEnd: null`; typed first/last days are sent and stored as `YYYY-MM-DD`.                                                                                                  |
| **TC-530**             | Breakfast before opening / closed day → yellow warning from the page's own `schedule-check`, link to business hours, save not blocked.                                                                                                                 |
| **TC-531**             | Live-status chips (Live now / server availabilityLabel e.g. Available from … / Starts … / Ended / Off), schedule column, ended switch disabled with an "ended" tooltip.                                                                                |
| **TC-532**             | AI generator: meal type unlocked; stubbed (never-paid) suggestion cards show their schedule; "Edit before saving" → "Edit this suggestion?" → Edit opens Create Deal pre-filled.                                                                       |

### Storefronts and POS

| TC         | Where                            | What it checks                                                                                                                                                                  |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-535** | wind `customer/08-deals-handoff` | Later-today deal: "Available from …" + schedule on the card; builder option radios `aria-disabled` and "Add deal to cart" disabled.                                             |
| **TC-536** | wind                             | Scheduled pickup inside the window: the quote with `scheduledFor` prices the deal.                                                                                              |
| **TC-537** | wind                             | Pickup outside the window: server message naming the deal, Remove deal / Change time; Remove deal clears it.                                                                    |
| **TC-538** | wind                             | The Deals grid block (placed on the catering page by an admin, restored after) shows real prices, struck originals, item names and schedule text from the page's own `/active`. |
| **TC-L60** | lima `customer-lima/13-deals`    | Today's Deals card renders.                                                                                                                                                     |
| **TC-L61** | lima                             | Fixed items included → one Add → cart.                                                                                                                                          |
| **TC-L62** | lima                             | Checkout quote carries `orderDeals` (+ `dealItemId` once Plan 4 ships) at the deal price.                                                                                       |
| **TC-L63** | lima                             | Later-today deal shows its schedule and "Available from …".                                                                                                                     |
| **TC-524** | `pos/10-deals`                   | `?channel=in_person` lists everywhere + in-store deals, not online-only (and the reverse online).                                                                               |
| **TC-525** | pos                              | A deal rings up on an open check; the order carries it.                                                                                                                         |
| **TC-526** | pos                              | An online-only deal is refused at the counter.                                                                                                                                  |
| **TC-527** | pos                              | A deal outside its schedule is refused with `DEAL_NOT_AVAILABLE_AT_TIME` (no `details` on the POS); a deal in the current local window rings up.                                |

---

## TC-800 → — Promotions (2026-10)

**Status:** the promotions automation plan (spec `restaunax/docs/features/PROMOTIONS.md`): API (TC-800 → TC-820), owner UI (TC-821 → TC-832, TC-853), chain (TC-833 → TC-835, TC-854), template-wind (TC-836 → TC-844), template-lima (TC-L64 → TC-L70), POS (TC-845 → TC-851, TC-855, TC-856) and Send (TC-852, TC-857). TC-857 passes since RestauNax #972 (toast fix). TC-858 is intentionally unused — never assigned, not a missing test. TC-825/859/860 cover the redesigned Create screen (RestauNax #971); TC-861 covers Change-in-place on list pickers (#972). TC-862 covers a combo "Choose from these items" line saved from its ticks alone, shown in Edit and grown by one choice — it fails on QA until RestauNax fix/combo-option-lines deploys (owner-reported 2026-10-15). TC-863 → TC-870 (`25-promotion-scenarios.spec.ts`) take eight real-world promotions from the dashboard UI to the lima AND wind checkout (build → exact server read-back → edit → storefront picks → quote-checked checkout); TC-863 fails on QA until RestauNax #974 deploys (the same ticks defect), and scenarios that expose an app bug end as fixme "BUG: …". TC-871 is the un-helped path of the page object's Cancel (the "Leave without saving?" confirm). TC-872 → TC-881, TC-888, TC-889 (`api-promotion-preview.spec.ts`) pin the preview API (create, hidden from lists and the cap, header-only quote / deal list / sale price, refusals, replace, cache leak, end, cross-tenant isolation, reservation and pay-balance refusal); TC-882 → TC-887 (`26-promotion-preview.spec.ts`) drive it from the dashboard to lima. TC-872 → TC-881, TC-888, TC-889 fail on QA until the RestauNax preview backend deploys, and the file skips (not fails) while QA's backend answers 503 PROMOTION_PREVIEW_UNAVAILABLE (ORDERING_BASE_URL unset). All Allure results carry the feature label "Promotions". TC-890 (lima) and TC-891 (wind) pin guided deal choices: an incomplete deal never reaches the cart — an Add before every step is picked points at the first missing step and adds nothing; the complete deal is added once (fail on QA until template-lima / template-wind feat/deal-choice-ux deploy). TC-892 (wind) and TC-893 (lima) pin spec §13: two of the same fixed item with options are ONE "2 × <item>" step with a Customize row per unit (fail on QA until template-wind / template-lima feat/deal-fixed-units deploy).

### API contract (`dashboard/owner/api-promotions.spec.ts`, throwaway tenant)

| TC         | What it checks                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-800** | An order code redeems as `ORDER` via `/api/promotions/redeem-code` and appears in the promotions list.                                                                                 |
| **TC-801** | An unknown code is refused (>= 400, `success:false`) with resolved text, never an i18n key.                                                                                            |
| **TC-802** | Quote: 3 gyros ($41.97) + SAVE15 (15% off $30+, cap $4.50) → `appliedPromotion.savings` 4.50, title set, `codeOutcome` APPLIED.                                                        |
| **TC-803** | Quote: $24.98 of food + SAVE15 → not applied, `codeOutcome` NOT_ELIGIBLE, message mentions the minimum.                                                                                |
| **TC-804** | redeem-code SAVE2 → `{kind:"BUNDLE", dealId}`.                                                                                                                                         |
| **TC-805** | Quote: SAVE2 (BOGO_FIXED_PRICE, "one of these items") with Lamb + Chicken → line total 13.99 + 1.99 = 15.98.                                                                           |
| **TC-806** | Quote: SAVE3 combo (bowl + gyro + patty, AUTOMATIC) → deal price 21.99, no code, no ERROR issue.                                                                                       |
| **TC-807** | Quote: FIRST5 for a guest with a fresh `customerEmail` → $5 applied.                                                                                                                   |
| **TC-808** | Quote: FIRST5 for an email with a prior confirmed order on the tenant → refused, "only for a first order".                                                                             |
| **TC-809** | Old-client protection: an AUTOMATIC first-order promotion is not quoted to a guest with no identity (control: applied with an email).                                                  |
| **TC-810** | Best wins: AUTOMATIC 10% ($4.20) beats a $1 code → `codeOutcome` BETTER_OFFER_APPLIED, sentence names the code, the winner and both amounts.                                           |
| **TC-811** | Bundle exclusivity: SAVE3 combo + SAVE15 code (cart over $30) → code refused (`coupon_deal_exclusive`), combo stays 21.99.                                                             |
| **TC-812** | Free delivery alongside a bundle: combo + FREE_DELIVERY code, DELIVERY, fee 5.99 (legacy quote body) → fee waived 5.99, combo 21.99. Tenant moved to NY (FL refuses any delivery fee). |
| **TC-813** | ITEM_SALE 50% off Garlic Knots (AUTOMATIC): public menu `promotion.salePrice` 2.00 + label; quote savings = 3.99 − menu sale price.                                                    |
| **TC-814** | FREE_ITEM soda over $40 (SPEND): quote at $45.96 → `freeItemOffer` = soda; with the soda added → discounted 2.49.                                                                      |
| **TC-815** | CODE-only deal: hidden from `/active` (v2) without `?code=`, listed with it; quote without the line `code` → ERROR `deal_not_eligible` reason `code_required`; with it → priced 12.00. |
| **TC-816** | Version gate: the BOGO_FIXED_PRICE deal is absent from `/active` without `X-Promotions-Version: 2`, present with it.                                                                   |
| **TC-817** | `/api/coupons/validate` rule layer: a code valid only on another day (restaurant zone) → 400 "isn't available right now"; the same code shape valid today → 200, $2.                   |
| **TC-818** | Pause: SAVE15 + SAVE3 INACTIVE → redeem refused, no `appliedPromotion`, deal gone from `/active`, list rows INACTIVE; re-activating restores all four.                                 |
| **TC-819** | Line quantity 1000 and 0.5 → 400 "whole number from 1 to 999".                                                                                                                         |
| **TC-820** | Legacy FIXED_ITEM "$2 off a patty": 3 patties → validate and quote both discount $2 exactly once (regression pin).                                                                     |

### Owner UI (`dashboard/owner/19-promotions.spec.ts`, seed restaurant)

Own data: a per-run "Automation Menu Promo <id>" category with three items (two to sell, one free gift) so a live sale never reprices the shared seed item; every promotion has an AUTO name (and AUTO code when it takes one) and is deleted in its test's `finally`. Statuses read as the dashboard shows them ("Live", "Paused").

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-821** | Old links still work: `?tab=coupons` / `deals` → `promotions`, `create-deal` → `create-promotion`, `deal-analytics` → `promotion-results`, `ai-deals` → `create-promotion&ai=1`.                                                                                                                                                                                                                                                                                                                                                     |
| **TC-822** | Create "Money off the order": 15% off, orders over $30, up to $4.50, only with an AUTO code → preview names 15% and $30; Turn on → row Live with "Code <code>"; `listPromotions` has it ACTIVE with that code.                                                                                                                                                                                                                                                                                                                       |
| **TC-823** | Create "Sale on items" (applies by itself) 50% off an own item → row shows "Menu" (no code); the public online menu item carries `promotion.salePrice` = half its price.                                                                                                                                                                                                                                                                                                                                                             |
| **TC-824** | Create "Buy one, get one": They buy = choose from two items, Same item, for a set price $1.99 → row Live; public `/active` (X-Promotions-Version: 2) lists the deal with both items as `options` on its lines. Waits for a free deal slot first.                                                                                                                                                                                                                                                                                     |
| **TC-825** | Create screen, nothing picked: six goal chips show; "Sell items together" lists a combo built from the restaurant's menu ("<A> + <B> + … for $<price>", From your menu); picking it selects Combo price, prefills those items and the price, preview shows the price; Save for later (paused — the example may use another file's per-run items, which an ACTIVE deal would keep from being deleted, and it takes no deal slot) → server row INACTIVE, deal has the same items at that price and saves 5%–20%. Deleted in `finally`. |
| **TC-826** | Create "Free item" (spend $40, own gift item, only with an AUTO code — an automatic spend offer would reach every other file's cart over $40), "Free delivery" (orders over $15, cover up to $8, AUTO code) and "Combo price" from its card — two wraps (the second via "Add the same item again") + a bowl for $15, waits for a free deal slot → all three rows Live; the server deal holds 2 units of the wrap and 1 of the bowl.                                                                                                  |
| **TC-827** | Validation: "$ off" 0 and a custom time window 11:00 AM–11:00 AM → "A few answers need your attention", "Enter an amount above $0.", "The end time must be different from the start time."; still on Create; nothing saved.                                                                                                                                                                                                                                                                                                          |
| **TC-828** | Edit round-trip on an API-seeded 15% coupon: Edit opens prefilled with 15 → 20 → Save changes → coupon API value 20.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **TC-829** | Row menu Pause → "Paused" + server INACTIVE; Turn on → "Live" + server ACTIVE.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **TC-830** | Row menu Delete → one confirm ("Delete this promotion?"): Cancel keeps the row and the server row; Delete removes both.                                                                                                                                                                                                                                                                                                                                                                                                              |
| **TC-831** | Results: five KPI cards + day-by-day trend (or "No results yet") for 30 days, then 60 days.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **TC-832** | `@smoke` The Promotions list loads for the seed restaurant (heading + table or empty state); read-only.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **TC-853** | Row menu Duplicate → "Copy a promotion" prefilled from an API-seeded $3-off coupon (Money off the order, "Amount off" 3, name "Copy of <name>", empty code); Cancel → back on the list, no second promotion on the server.                                                                                                                                                                                                                                                                                                           |
| **TC-941** | Start day follows the restaurant's clock: the owner's browser runs in a zone already on a later date than the restaurant's (`Pacific/Kiritimati`, UTC+14); a "Money off the order" created and turned on there lands **Live** (not Scheduled). Regression for the 10-24 pre-release run (RestauNax #1045). Skipped in the hours when that zone is not ahead of the restaurant's date.                                                                                                                                                |

### Chain shell (`dashboard/owner/20-chain-promotions.spec.ts`)

Replaces `18-chain-deals.spec.ts`. Uses the persistent "Automation Chain" fixture; every chain promotion is AUTO-named and deleted in the test's `finally` (a chain promotion is one row owned by the chain, so deleting it removes it at every location).

| TC         | What it checks                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-833** | Chain shell `?tab=promotions` lists the chain's promotions (an API-seeded chain coupon shows its code and "Live"; `GET /api/chains/:gid/promotions` has it); the chain create page says "Applies to all N locations of <chain>". The UI has no per-row "Chain" chip: the chain scope is the shell itself.                            |
| **TC-834** | Chain Create → Money off the order → Turn on opens "Heads up — chain-wide change" ("create a promotion … This will affect all N locations in your chain", N = member count, at least 2); Cancel saves nothing; Continue → row Live and the chain list API has it ACTIVE.                                                             |
| **TC-835** | Member location: the Promotions sidebar entry is disabled; `?tab=promotions` and `?tab=create-promotion` show "Managed at chain level" instead of the page; `?tab=marketing-automations` still opens "Automated Marketing".                                                                                                          |
| **TC-854** | A chain deal (API-created, AUTO-named) is in the public `/active` list (v2) at BOTH member locations; after deleting it, gone from both. Public half of old TC-365/366.                                                                                                                                                              |
| **TC-523** | (kept id) Chain create and chain bulk create run the shared schedule validation (400 with the exact messages).                                                                                                                                                                                                                       |
| **TC-534** | (kept id) Chain `schedule-check`: one warning per closed location, named; none when every location is open.                                                                                                                                                                                                                          |
| **TC-533** | (kept id, re-pointed) In the chain shell's promotion form the "When?" card warns by location name only when a day is closed at one location. The old "(in each location's local time)" summary wording and the Deals table caption no longer exist: the promotion form hides the summary line by design and the Deals table is gone. |

### Storefront — template-wind (`customer/10-promotions.spec.ts`, seed restaurant)

Seeded through the API in `beforeAll` on a per-run "Automation Menu Promo Wind <id>" category (Wrap $10, Platter $20, Gyro A $12 / B $13, Burger $12 with Size Regular/Large $15 REPLACES + Bacon +$1.50, Cookie $4): a 50% automatic sale on the Wrap, a free Cookie over $55 (automatic), a 15%-off-$30+ (cap $4.50) code, a "2nd gyro for $1.99" BOGO with A/B options (menu + code) and a CODE-only Platter + Burger combo for $25. All AUTO-named, removed in `afterAll` (each delete checked).

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-836** | Menu card of the sale item: struck regular price ($10.00, line-through), the sale price and the label exactly as the public online menu's `promotion` (salePrice 5, "Half price"); an item outside the sale shows neither.                                                                                                                                                                |
| **TC-837** | BOGO builder: two pick steps ("Required"), each offering Gyro A and Gyro B as unchecked radios; picking A ("✓ Done") then B → "All set" and the bar's deal price = the server's `/quote` dealPrice for those picks; "Add deal to cart" → View Cart → the page's `/quote` carries the deal at that price, deal row + 2× "Part of deal".                                                    |
| **TC-838** | Cart 2 × Platter ($40) + the order code in the code box → the page's `/quote` (couponId = the code's promotion) applies it with the promotion's title and savings 4.50 (acceptance set); code pill + "Saving $4.50" + summary row "<title> -$4.50"; Total = the latest page `/quote` `amountToCharge`, which is for the code.                                                             |
| **TC-839** | The BOGO's code in the checkout code box opens `/deals/<id>?code=<code>` (builder heading); `/menu?promo=<code>` does the same.                                                                                                                                                                                                                                                           |
| **TC-840** | Cart 3 × Platter ($60) → "You've earned a free <Cookie> — Add it"; Add → the page's `/quote` holds the Cookie at its price and applies the free-item promotion for exactly the Cookie's price ($4.00), no further offer; summary "<title> -$4.00", the button is gone, Total = latest `/quote`.                                                                                           |
| **TC-841** | The CODE-only combo is absent from public `/active` (v2) and the menu's deals (the BOGO, a control, is listed); its code in the code box opens its builder with `?code=`; built → the page's `/quote` sends the line's `code`, prices it at $25, no `code_required` issue; no "This deal needs its code", no "Review your order", and with the form filled Proceed to Payment is enabled. |
| **TC-842** | Complete the BOGO → "Add deal to cart" → "Keep shopping" (absent until the Add) → `/menu` shows "<deal> added to your cart" and strips `dealAdded`; a reload shows nothing; a crafted `?dealAdded=<random id>` shows nothing (and is stripped) while the real deal id (control) shows the confirmation.                                                                                   |
| **TC-843** | Combo with Burger → Large + Bacon (modal confirm "Done"; the burger step reads "Large, Bacon · +$4.50"): checkout shows Items, Upgrades "+$4.50" and the itemised "Large +$3.00 · Bacon +$1.50"; Items + Upgrades = Subtotal to the cent, Upgrades = the page `/quote` deal upcharge (4.50), Subtotal = the quote's subtotal.                                                             |
| **TC-844** | The one real wind card order: 2 × Platter + the order code, pickup guest, `VISA_SUCCESS` → "Order Confirmed!"; the order (owner `GET /api/order/:id`) has `couponId` = the code's promotion, `discountAmount` = the quote's savings, `total` = the Pay total shown before paying (which equalled the latest `/quote` amountToCharge).                                                     |

### Storefront — template-lima (`customer-lima/14-promotions.spec.ts`, seed restaurant by slug)

Same API seed as the wind file (`seedStorefrontPromotions`, labelled "Lima": per-run "Automation Menu Promo Lima <id>" category, 50% automatic sale on the Wrap, 15%-off-$30+ (cap $4.50) code, "2nd gyro for $1.99" BOGO with A/B options (menu + code), CODE-only Platter + Burger combo for $25) but **no free item** — a spend-triggered gift offers itself to every cart over $55, so only one file may run one. Lima's code box is on the cart (no quote there: "Savings shown at checkout"); the promotion line, code outcome and Total are on checkout. All AUTO-named, removed in `afterAll` (each delete checked).

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-L64** | `/<slug>/menu` card of the sale item (`menu-item-card`): struck regular price `menu-item-regular-price` ($10.00, line-through), the sale price and `menu-item-sale-label` exactly as the public online menu's `promotion`; an item outside the sale shows neither.                                                                                                                                       |
| **TC-L65** | BOGO builder `/<slug>/deal/<id>`: two `deal-choice-slot`s, each offering Gyro A and B as unchecked radios (step "Required"); pick A (`aria-checked`, "✓ Done", 1 of 2) then B → "All set" and the bar's price = the server's `/quote` dealPrice for those picks; "Add deal to cart" → View Cart → cart lists the deal; checkout's page `/quote` prices the deal at it.                                   |
| **TC-L66** | Cart 2 × Platter ($40) + the order code in the cart box → redeem-code 200, chip "Coupon: <CODE>" + "Savings shown at checkout"; checkout's page `/quote` (couponId = the code's promotion) applies it with the title and savings 4.50; summary row "<title> -$4.50", "Code <CODE>" + "Saving $4.50"; Total = the latest page `/quote` `amountToCharge` (re-read inside the poll), which is for the code. |
| **TC-L67** | The BOGO's code in the cart box opens `/<slug>/deal/<id>?code=<code>` (builder heading); `/<slug>/menu?promo=<code>` does the same.                                                                                                                                                                                                                                                                      |
| **TC-L68** | Complete the BOGO → "Add deal to cart" → "Keep shopping" (`deal-keep-shopping`, absent until the Add) → `/<slug>/menu` with `deal-added-confirmation` "<deal> added to your cart" (inside its 3 s auto-hide); a reload shows nothing (router state cleared); the cart lists the deal.                                                                                                                    |
| **TC-L69** | CODE-only combo via `?code=`, Burger → Large + Bacon: checkout shows `summary-items`, `summary-upgrades` "+$4.50" and `summary-upgrade-details` "Large +$3.00 · Bacon +$1.50"; Items + Upgrades = Subtotal to the cent, Upgrades = the page `/quote` deal upcharge (4.50), Subtotal = the quote's subtotal.                                                                                              |
| **TC-L70** | The one real lima card order: 2 × Platter + the order code, pickup guest, `VISA_SUCCESS` → `/<slug>/order-confirmation/<id>`; the order (owner `GET /api/order/:id`) has `couponId` = the code's promotion, `discountAmount` = the quote's savings, `total` = the Total shown before paying (which equalled the latest `/quote` amountToCharge).                                                         |

### Guided deal choices — an incomplete deal never reaches the cart (`customer-lima/14-promotions.spec.ts`, `customer/10-promotions.spec.ts`)

Both tests build one "2nd gyro for $1.99" BOGO (two pick steps) on the seed restaurant through the API and delete it in `finally` (one deal slot each, only while the test runs). They fail on QA until the guided deal pages (template-lima / template-wind `feat/deal-choice-ux`) deploy.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-890** | Lima, guided deal choices: an Add with nothing picked (and again with step 1 picked, step 2 left) shows 'Pick one to continue.' (role=alert) in the first unfinished step, its status reads 'Required', the step root is focused, and the cart stays empty ("Your Cart is Empty", nav count 0, no deal); leaving mid-build leaves no partial deal; picking both steps and one Add puts the deal in the cart.                                   |
| **TC-891** | Wind, guided deal choices: an Add with nothing picked (and again with step 1 picked, step 2 left) shows 'Pick one to continue.' (role=alert) in the first unfinished step with status 'Required', and adds nothing (checkout is empty: no deal, no "Complete Deals to Continue"); leaving mid-build leaves no partial deal; picking both steps and one Add puts the deal in the cart. Focus is not asserted (wind focuses the step's control). |

### Identical fixed items — one "{qty} × {name}" step, customised per unit (`customer/08-deals-handoff.spec.ts`, `customer-lima/13-deals.spec.ts`)

Spec addendum §13 (`restaunax/docs/superpowers/specs/2026-10-17-deal-choice-guidance-design.md`). Each test seeds its own two items in the file's per-run category — a $10 burger with an optional "Bacon" (+$1.50) and an $8 melt with a REQUIRED "Sauce" (Ranch $0 / Chipotle +$0.75) — and one $30 combo of 2 × each (the server stores four quantity-1 rows), cap-safe on the seed restaurant and deleted in `finally`. They fail on QA until template-wind / template-lima `feat/deal-fixed-units` deploy.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-892** | Wind: two steps, "2 × <burger>" ✓ Included and "2 × <melt>" Required, each with two `deal-unit-row`s ("<item> 1" / "<item> 2", "Included", button "Customize" / "Choose options" named "Customize <item> n" / "Choose options for <item> n"; four distinct `data-unit-key`s; no step-level Customize or summary); progress "0 of 1", bar $30.00. Customise Burger 2 with Bacon → row 2 "Bacon" + "+$1.50", row 1 "Included" with no options, bar $31.50; Burger 1 reopens unticked. Melt 1 → Ranch, then Add → refused: `deal-step-error` "Choose options for <melt> 2", that unit's button focused, nothing added. Melt 2 → Chipotle ("+$0.75") → "All set", "Add deal to cart · $32.25" → one Add. Checkout `/quote` request: one `orderDeals` item per DealItem row (dealItemIds = the deal's rows), upchargeAmount 0 / 1.50 (burgers) and 0 / 0.75 (melts); response upcharge 2.25, lineTotal 32.25, subtotal 32.25; summary two "1x <burger>" and two "1x <melt>" lines ("Part of deal" ×4, "+ Bacon" / "+ Ranch" / "+ Chipotle" once each), Items $30.00, Upgrades +$2.25 (Bacon, Chipotle), Subtotal $32.25. |
| **TC-893** | Lima: the same journey on `/<slug>/deal/<id>` with `deal-step-unit` rows (labels, "Included", button text + accessible names, four unit keys, no step-level Customize or summary, progress "0 of 1", bar $30.00); Burger 2 + Bacon → "+$1.50" while Burger 1 stays "Included" and reopens unticked; Melt 1 → Ranch, Add refused with role=alert "Choose options for <melt> 2" and that unit's button focused; Melt 2 → Chipotle → $32.25 → one Add. Checkout `/quote`: one item per DealItem row with upchargeAmount 0 / 1.50 and 0 / 0.75; response upcharge 2.25, lineTotal 32.25, subtotal 32.25; summary Items $30.00, Upgrades +$2.25 (Bacon, Chipotle), Subtotal $32.25.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### The choices inside a deal reach the order (`customer/11-deal-item-choices.spec.ts`, `customer-lima/15-deal-item-choices.spec.ts`, tag `@deal-item-choices`)

Production 2026-10-20: a web deal order reached the kitchen with the wings' 20 PC upcharge paid but no modifiers, so the ticket could not say what to cook. TC-369 / TC-371 only check a deal slot's MONEY; these check the CHOICES. Each test seeds its own "Wings" ($10; Size ADJUSTS_PRICE 10 PC $0 / 20 PC +$4.99, where 20 PC opens a NESTED free "Wing Sauce" group with Buffalo; free "Dips" group with Ranch Dip — `utils/dealItemChoices.ts` `seedChoiceItem`) plus a plain side, one deal (deleted in `finally`), and places ONE real Stripe test-card order. Payload/order assertions are `expect.soft`, so one run reports both the sent and the stored gap. **Fail on QA until the template-wind / template-lima `hotfix/deal-item-modifiers` and the backend deal-item fixes deploy** (QA 2026-10-20: the sent item has no `selectedModifiers`/`specialInstructions`; the stored `orderDealItems[].selectedModifiers` is `[]`).

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-906** | Wind: wings + fries @ $14; in the deal builder pick 20 PC → Buffalo (nested) → Ranch Dip. Checkout `/quote`: server `upcharge 4.99 / lineTotal 18.99` (pricing unchanged); the body's `orderDeals[].items[<wings>].selectedModifiers` carries all three modifierIds and Buffalo's `parentModifierId` = 20 PC. Paid order (owner GET /api/order/:id): `orderDealItems[<wings>].selectedModifiers` names all three, Buffalo keeps `parentModifierId`. Also types a note in the item sheet's "Special Instructions" box (template-wind #143) and asserts `specialInstructions` in `/quote` and on the stored item; the fill is unconditional, so until #143 is on QA the test fails at the box (not found). |
| **TC-907** | Lima: wings + soup @ $12, same picks plus a note typed in the item sheet's "Special Instructions" box. Same `/quote` checks (`upcharge 4.99 / lineTotal 16.99`) plus `specialInstructions` = the note; the paid order's `orderDealItems[<wings>]` names the three choices, keeps the nested `parentModifierId`, and carries the note. Submits with `LimaCheckoutPage.placeOrderAndConfirm` (re-presses Order Now only when the press never reached Stripe — the Link-panel race lost one submit on QA).                                                                                                                                                                                                  |

### A combo item is just food (`pos/12-combo-food-surfaces.spec.ts`, tag `@combo-food`)

restaunax #1017 (2026-10-21, `docs/features/ORDER_FOOD_LINES.md`): an order's food lives in `orderItems` AND `orderDeals[].orderDealItems`, and every count / make / report surface now reads both (`foodLinesOf`). API only, on a per-run throwaway tenant (tax 0, published, open 24h, Stripe TEST Connect onboarding): Burger $10 with a free "Double" that opens a free nested "Smoky", Fries $4, Soda $3, a COMBO of all three for $12, and two prep stations — Grill (default) and Bar (Soda assigned). Two PAID online pickup orders, placed with the storefront's own calls (placeOrder → `/api/stripe/payment-intent` → Stripe test card with the publishable key → `/api/stripe/confirm-payment`, `utils/comboFoodSurfaces.ts`), same customer phone, the combo's burger carrying Double → Smoky and a note: (a) combo-only, 2 × combo; (b) 1 × combo + 2 × fries à la carte. Until restaunax #1018 the POS could not ring (a): `POST /api/tablet/create-order` refused an order with no à-la-carte line. TC-913 now pins that it accepts one.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-908** | `foodItemCount` = Σ food units: (a) 6 (3 parts × 2 combos, `orderItems: []`), (b) 5 (3 + 2 fries) — on the owner list (`/api/order/statistics/management/:rid`), owner detail (`/api/order/statistics/:id`), `GET /api/order/:id`, and the customer's mobile history (`/api/mobile/customer/orders` after OTP sign-in with QA's 123456).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **TC-909** | Owner detail `breakdown`: the deal row's 3 `children` each have `key` = `deal:<orderDealId>:<orderDealItemId>` (matches `/^deal:[^:]+:[^:]+$/` and the stored ids), per-deal `quantity` 1; the burger child carries the note and `modifiers[]` with `modifierId` (Double, Smoky), Smoky's `parentModifierId` = Double's `modifierId`; fries / soda carry no note or picks. Both orders.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **TC-910** | KDS make line (`GET /api/tablet/prep-stations/:key/lines`, device JWT; the device's `prepStationKey` is set with the admin device-config PATCH before each read): Grill shows (a)'s burger ×2 with Double + Smoky and the note and fries ×2, never the soda; (b)'s combo fries and à-la-carte fries are ONE line ×3. Bar shows the soda ×2 / ×1 and nothing else from these orders.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **TC-911** | **fixme:** the Uber Direct manifest of a combo DELIVERY order. Not observable on QA: `manifest_items` is sent only in Uber's create-delivery request (the `Delivery` row stores no manifest or pickup note), and the suite has no paid-DELIVERY dispatch path with Uber Direct credentials.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **TC-912** | Owner statistics (`/api/order/statistics/restaurantId/:rid`, default 30 business days, fresh tenant): top sellers count combo units — Burger and Soda `totalQuantity` 3 / `comboQuantity` 3 / `totalRevenue` 0, Fries 5 / 3 / 8.00 (à-la-carte only) — and net sales (`totalRevenue`) equal the two orders' own subtotals (24 + 20), so the deal's money is counted once.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **TC-913** | Register cash sale of ONLY the combo (restaunax #1018): `POST /api/tablet/create-order` with `orderItems: []`, one `orderDeals` entry shaped like the real POS request (dealItemId, menuItemId/Name/Price, quantity, `selectedModifiers` with Double on the burger), `orderSource: IN_STORE`, `orderType: PICKUP`, `paymentMethod: CASH`, subtotal = total = $12, tax 0. Uses its own ADMIN-created REGISTER device, the owner's POS PIN and an open drawer (closed and deactivated in its finally). Asserts 201 with total 12; the owner detail has no à-la-carte lines, one deal with the 3 components, the burger's Double, and `foodItemCount` 3. The same body with `orderDeals: []` still answers 400 "Order must have at least one item". Runs last in the file because it adds an order to the tenant TC-912 counts. |

### A card that needs a bank check — 3D Secure (`customer/12-3ds-bank-check.spec.ts` wind, `customer-lima/16-3ds-bank-check.spec.ts` lima, tag `@3ds`)

A card that needs a 3D Secure bank check used to send the customer, after the bank, to the `return_url` `/payment-success`, a route that does not exist: charged, then a 404. The fix (template-wind #138 and its template-lima twin) points `return_url` at `/checkout/return` (lima: `/<slug>/checkout/return`). That page calls `POST /api/stripe/confirm-payment`, clears the cart and lands on `/order-confirmation/:id`; a failed check goes back to checkout with the error.

The card is Stripe's "always authenticate" test card **4000 0027 6000 3184** (`STRIPE_CARDS.VISA_3DS_ALWAYS`); in test mode the bank is Stripe's test page with Complete / Fail. **Stripe.js runs that check IN THE PAGE by default** (a modal, the `three-ds-2-challenge` iframe): the storefront's in-place branch finishes the order and `return_url` is never visited (checked on QA 2026-10-23, both storefronts). So each outcome is tested twice: in the page, and as a real **full-page redirect**. For the redirect the test flips `use_stripe_sdk` to `false` on the storefront's own Stripe confirm call (Stripe's documented flag for "Stripe.js handles the next action"); Stripe answers with `redirect_to_url`, Stripe.js sends the whole page to Stripe's hosted 3DS page (`hooks.stripe.com/3d_secure_2/hosted`), and Complete / Fail there sends the browser to the storefront's OWN `return_url` with Stripe's real `payment_intent` + `payment_intent_client_secret` (+ `source_type=card`; the hosted page adds no `redirect_status`). The redirect tests are the only coverage of the return page (`utils/stripe3ds.ts`).

Every test adds the item through the real menu (wind: no seeded init script, which would re-seed the cart on the redirect back and hide whether the return page cleared it), uses a fresh customer email + phone and Pickup, captures the order id and PaymentIntent from the page's own `POST /api/stripe/payment-intent`, asserts the `return_url` sent to Stripe, and counts `POST /api/stripe/confirm-payment` calls. Paid orders are refunded and unpaid placeholders cancelled in `afterAll`.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-914** | Wind, in the page, **Complete**: `return_url` = `<wind>/checkout/return`; the challenge opens on `/checkout`; lands on `/order-confirmation/<the order>` with "Order Confirmed!" and "Thanks Auto!"; exactly one confirm-payment call; owner `GET /api/order/:id` → `paymentStatus` COMPLETED, status not INITIALIZED; the PaymentIntent (read from Stripe with the publishable key) `succeeded`; the owner list for the customer's email holds exactly this one order; the confirmation's money lines equal the order's `breakdown`; the cart is empty (sessionStorage, and "Your Cart is Empty" on `/checkout`). |
| **TC-915** | Wind, in the page, **Fail**: stays on `/checkout` under "Payment Error" ("We are unable to authenticate your payment method…"), the item still in the Order Summary and Complete Order still offered; no confirm-payment; the order is INITIALIZED and not COMPLETED; the PaymentIntent is `requires_payment_method` (nothing charged); the owner sees no order for the email.                                                                                                                                                                                                                                     |
| **TC-916** | Wind, full-page redirect, **Complete**: the page goes to Stripe's hosted 3DS page, then to `/checkout/return?payment_intent=<this PI>&payment_intent_client_secret=<its secret>`; the secret is gone from the address bar; then everything TC-914 checks (the one confirm-payment call and the cleared cart now come from the return page).                                                                                                                                                                                                                                                                        |
| **TC-917** | Wind, full-page redirect, **Fail**: back through `/checkout/return` for this PaymentIntent to `/checkout`, showing Stripe's message ("The provided PaymentMethod has failed authentication…"), cart intact, Proceed to Payment offered; then everything TC-915 checks.                                                                                                                                                                                                                                                                                                                                             |
| **TC-L73** | Lima, in the page, **Complete**: `return_url` = `<lima>/<slug>/checkout/return`; lands on `/<slug>/order-confirmation/<the order>` ("Thank You for Your Order!", lima's heading); the same backend and money-line checks as TC-914 (lima's rows are read with `readLimaConfirmationLines`); the tenant cart (`rx:r_<rid>:cart`) is empty, the cart badge shows 0 and `/<slug>/cart` is empty.                                                                                                                                                                                                                      |
| **TC-L74** | Lima, in the page, **Fail**: stays on `/<slug>/checkout` with the authentication error, the tenant cart still holds the item; the same backend checks as TC-915.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **TC-L75** | Lima, full-page redirect, **Complete**: Stripe's hosted page → `/<slug>/checkout/return?payment_intent=…&payment_intent_client_secret=…` (inside the basename) → `CheckoutReturn` confirms once, clears the cart and lands on the confirmation; the same checks as TC-L73.                                                                                                                                                                                                                                                                                                                                         |
| **TC-L76** | Lima, full-page redirect, **Fail**: `/<slug>/checkout/return` → `/<slug>/checkout` with the error, cart kept; the same backend checks as TC-L74.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Status:** ✅ Passing on QA (2026-10-23, 8/8 on five local runs of both files together, plus each file alone once). Findings: (1) Stripe test mode runs this card's check in the page, so until these tests nothing had ever visited `/checkout/return`; (2) after a redirect the failure message is Stripe's raw API text ("The provided PaymentMethod has failed authentication. You can provide payment_method_data or a new PaymentMethod…"), while wind's in-page failure shows the friendlier "We are unable to authenticate your payment method…". That is a copy gap in the storefronts; the tests assert only the authentication wording.

### One order, every surface (`dashboard/owner/27-order-breakdown.spec.ts`, TC-898 serial with @email on the last step; TC-899 and TC-900 each their own describe — TC-900 needs no wind)

Spec `restaunax/docs/features/ORDER_MONEY_BREAKDOWN.md`. One real Stripe test-card pickup order on wind: an AUTOMATIC free item bought by the run's own item (BUY_ITEM trigger, cart under $55), 100 of 200 imported points redeemed after OTP sign-in, a partial $10 gift card and a 15% tip. The backend `breakdown` is the oracle. A free item and a combo cannot share an order, so the combo is a second paid wind order (TC-899, CODE-only combo platter + burger for $25 via `withStorefrontCombo`, cap-safe, deleted in its finally); wind delivery needs a Places suggestion QA does not return, so delivery / FREE_DELIVERY is API-only (TC-900, `POST /api/order/:rid/quote`).

| TC          | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-898**  | The wind checkout lines (Subtotal, promotion, Rewards (100 pts), Tax, Tip, Total, Gift card, Charged) add up and equal the page's own /quote breakdown (required); the wind confirmation, the owner's `GET /api/order/:id`, the dashboard order sheet and the POS current feed show the same ordered (label, amount) lines; the email's totals table matches and its subject carries `Receipt #<receiptNumber>` (`@email`, needs Mailpit). FREE marker on the gift item row: backend `items[].marker` = FREE; wind confirmation `order-breakdown-item-<key>` shows the server's `markerLabel`; dashboard item row shows the server's exact `markerLabel`; email item row reads "<name> <markerLabel>". **Exempt:** the wind checkout (its item rows come from the local cart, not `breakdown.items`, and render no marker; the gift line shows its regular price and the discount is the promotion line) and the POS feed (compared on totals only; no item UI in an API read). |
| **TC-899**  | A CODE-only combo (platter $20 + burger $12 for $25) built from its code on wind and paid with the Stripe test card. Checkout lines add up and equal the page's /quote breakdown, which prices the combo. Backend `GET /api/order/:id`: one item row with `children` (name = the deal name, amount $25, children = platter + burger); `info` holds DEAL_SAVINGS labelled exactly `You saved $<amount> with <deal name>`, its amount equal to the checkout /quote's `deals[0].savings`; no totals line is that info line and the totals still sum (items = SUBTOTAL, lines = TOTAL); `Order.total` = the TOTAL line (no tender on this order). Wind confirmation: `order-breakdown-item-<key>` shows `1x <deal>`, `1x <platter>`, `1x <burger>`; `order-breakdown-info-DEAL_SAVINGS` shows the label; its money lines equal the backend's. Dashboard sheet: same money lines, the deal row, both contents and the info caption.                                                  |
| **TC-900**  | API only (own describe and one-item menu; no wind or storefront seed). Precondition, asserted first: the seed `baseDeliveryFee` ≤ the promotion's $10 cap (a capped waiver is a fixture limit, not a breakdown bug). With a CODE FREE_DELIVERY promotion (real name `AUTO Breakdown free delivery <runId>`, min $1, cap $10, passed as `couponId`) a DELIVERY quote with the seed restaurant's `baseDeliveryFee` (public `GET /restaurant/:id/details`) has DELIVERY_FEE = the fee, immediately followed by FREE_DELIVERY = −fee labelled with the promotion's name; sums hold. The same quote without the promotion has DELIVERY_FEE and no FREE_DELIVERY line. The promotion is deleted in the test's finally (afterAll backstop).                                                                                                                                                                                                                                            |
| **TC-901**  | A reward member whose saved email is **blank** signs in on wind, types an email at checkout and pays with the Stripe test card. The order stores the typed address (`Order.email`), and the confirmation email ("Your Order Confirmation", `Receipt #<receiptNumber>`) arrives at that address in Mailpit. Pins RestauNax #1011 (`orderRecipientEmail`: the checkout email first, the saved email only as a fallback). It used to be a `test.fixme` known bug: the receipt went to `order.customer.email`, so this member got none. `@email`, skipped when `MAILPIT_BASE_URL` is unset.                                                                                                                                                                                                                                                                                                                                                                                         |
| **TC-1240** | Own describe, own throwaway tenant and POS (no wind). Wings $14.99 with a "Size" group that REPLACES the price ("24 Wings" $27.99) and an ADJUSTS add-on (Extra Sauce $1.50). A POS cash sale in the POS's shape (price $27.99, size row $0): the owner's `GET /api/order/:id` has subtotal $29.49, each sold modifier carries its group's `pricingMode` (REPLACES_PRICE / ADJUSTS_PRICE), the breakdown line is $29.49 with the size row at $0 and the sauce at $1.50, and the lines add up (audit W2:E3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **TC-1241** | The same tenant's day-close preview counts that line as item sales: `definitionVersion` 2, gross = net = $29.49, total collected $31.55 (W2:E2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### POS — price-preview and cash orders (`pos/11-promotions.spec.ts`, throwaway tenant, acceptance set)

Throwaway tenant (tax 0%) seeded by `seedAcceptanceSet`; ADMIN-created REGISTER device → tablet login → owner PIN → staff session → register open. Orders are cash tenders, except TC-851's unpaid CARD delivery tickets (never paid, so no courier dispatch); every order is cancelled in `afterAll`.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-845** | `POST /api/tablet/orders/price-preview`, 3 chicken gyros ($38.97) + SAVE15: applied promotion = SAVE15, savings 4.50 (15% capped), `amountToCharge` 34.47.                                                                                                                                                                                                                                       |
| **TC-846** | An AUTOMATIC `ITEM_SALE` ($1 off Garlic Knots) is applied by the preview with no code (savings 1, charge 2.99).                                                                                                                                                                                                                                                                                  |
| **TC-847** | SAVE15 on a cart holding the SAVE3 combo: the code issue is `coupon_deal_exclusive`, severity ERROR, "Coupons can't be combined with deals. Remove the deal or the coupon to continue."; the code is not applied.                                                                                                                                                                                |
| **TC-848** | FIRST5 with no customer phone: `promotion_not_eligible` / `first_order_needs_customer` with "Add the customer's phone number to use a first-order promotion." and nothing applied; with a new phone it applies ($5).                                                                                                                                                                             |
| **TC-849** | Cash `create-order` with SAVE15 `couponId` + `discountAmount` 4.50: 201; the stored order has `couponId`, `discountAmount` 4.50 and `total` = the preview's `amountToCharge`.                                                                                                                                                                                                                    |
| **TC-850** | CODE-only combo on `create-order`: without `code` on the deal line → 400 "This deal needs its code. Enter the deal's code to add it."; with it → 201, `orderDeals[0]` at the deal price, total = deal + patty.                                                                                                                                                                                   |
| **TC-851** | Old POS build (no `deliveryDiscount` claim), unpaid CARD DELIVERY tickets with a synthetic `quoteDetails` (tenant has `canAcceptDeliveries` set by admin; nothing is paid, so no courier dispatch): an entered FREE_DELIVERY code waives the $6 fee (stored `couponId`, `deliveryDiscount` 6, total = items); with an AUTOMATIC free-delivery promotion live and no code, the fee is not waived. |
| **TC-855** | Price-preview with no device token → 401.                                                                                                                                                                                                                                                                                                                                                        |
| **TC-856** | Cash order claiming `discountAmount` 5.50 against SAVE15's 4.50 cap → 400 "We couldn't verify your order total…" (floor tolerance 0.05).                                                                                                                                                                                                                                                         |

### Send (`dashboard/owner/21-promotion-send.spec.ts`, seed restaurant, `@email`)

Each test makes one AUTO code promotion (a coupon — no deal slot) and deletes it in `finally`. The recipient is a unique Mailpit address (`generateUserEmail`); without `MAILPIT_BASE_URL` the email step is skipped and annotated (CI always has it).

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-852** | Row menu "Send to customers" → "Send a promotion" opens on that promotion → Email to a unique address → `send-to-contact` 200; the Mailpit email's subject names the restaurant and its body carries the code and the restaurant name; Send & campaigns opened on the promotion (`?tab=promotion-campaigns&promotion=<id>`) shows "Direct sends (1)" with the "Direct" chip in its Send history.                                                                      |
| **TC-857** | After Send from a list row, the dialog closes and the "Promotion sent." toast shows (fixed in RestauNax #972: the dialog is no longer remounted on close). The send itself is TC-852.                                                                                                                                                                                                                                                                                 |
| **TC-859** | Pick the Buy one, get one card first → goal chips are gone, every example card is a Buy one, get one card, and the hint "Next: pick what customers buy, and what they get." shows. Read-only.                                                                                                                                                                                                                                                                         |
| **TC-860** | After a BOGO example + Sunday on, clicking Combo price asks "Switch to Combo price?" (body: items and amounts cleared, days/times/limits stay); "Keep Buy one, get one" leaves the form; "Switch" selects Combo with no items and Sunday still on. Read-only.                                                                                                                                                                                                         |
| **TC-861** | Create → Combo price with three items; "Change <second item>" opens the search on that line, picking another item replaces it in place (item1, NEW, item3); "Change <first item>" then "Keep <first item>" leaves the list unchanged; Save for later (no deal slot) stores the deal with items item1, NEW, item3.                                                                                                                                                     |
| **TC-862** | Create → Combo price: two fixed items, then "Choose from these items" with three items ticked and "Add these choices" NOT pressed; Save for later (no deal slot). The server deal has one line whose options are exactly those three items; Edit shows the line with the same choices; changing it to four ticked choices and Save changes is a change (no "Nothing to save") and the server line has all four. Fails until RestauNax fix/combo-option-lines deploys. |
| **TC-871** | Create → Money off the order, 15%, a name, then Cancel: "Leave without saving?" opens (not skipped); "Keep editing" keeps every answer; Cancel → "Leave" returns to the list and nothing was saved. The un-helped path of `OwnerCreatePromotionPage.cancel()`, which confirms the dialog for its callers.                                                                                                                                                             |

### Real-world scenarios (`dashboard/owner/25-promotion-scenarios.spec.ts`, seed restaurant + chain location A)

Each scenario is ONE test: build it in the dashboard UI (no helper that confirms a step an owner might skip), read the deal / coupon back from the server exactly, edit one meaningful thing and read back again, then on template-lima AND template-wind open it from the menu's deals list, make every choice, Keep shopping, open cart → checkout and compare the page with the page's own `/quote`: deal price and upcharge, Items + Upgrades = Subtotal (or a plain Subtotal), "You're saving", Total = the latest quote's `amountToCharge`. No card payment. The promotion is deleted in `finally` (one ACTIVE deal at most, only while a scenario runs). A scenario that hits an app bug records it with a screenshot, finishes every other check, then ends as `test.fixme("BUG: …")` — and passes again by itself once fixed. Tag: `@scenario` (nightly lane).

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-863** | S1 (the owner-reported combo): Wings (Size 8 pc default / 10 pc +$3) + Fries + Chicken Gyro with "+ Add an option" adding Lamb / Beef Gyro (a "Customer picks 1" line; Done never pressed), $21.99 → read back three lines with the three gyro options → edit $22.49 → lima + wind: one pick step whose radiogroup is named "Pick 1: Chicken…, Lamb… or Beef…"; lima: 10 pc + Lamb → deal $22.49, upgrades $3.00; wind: the size left at its 8 pc default + Lamb → upcharge $0, no upgrades line, combo price unchanged by the pricier gyro. Fails on QA until RestauNax #974 deploys (the form drops the ticks and refuses $21.99 against $14 of fixed items). |
| **TC-864** | S2: Buy one, get one — They buy and They get each "Choose from" the three gyros, For a set price $1.99 → read back BOGO_FIXED_PRICE, getPrice, BUY + GET option lines → edit $2.49 → buy Beef, get Chicken: the cheaper one at $2.49, deal $15.49 (builder bar + quote), saving $8.51.                                                                                                                                                                                                                                                                                                                                                                          |
| **TC-865** | S3: Rice bowl + gyro + patty, $21.99 (fixed items) → read back → edit: Change the patty to garlic knots (position kept) → lima and wind: each fixed step "✓ Included", "All set" from the start, one Add: deal $21.99, no upgrades, saving $4.99.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **TC-866** | S4: two "Any item from" category picks on a per-run pizza category (each line reads "Customer picks 1 from <category> · 2 items"), $19.99 → read back two category lines → edit $20.99 → Margherita + extra cheese, Pepperoni + mushrooms: deal $20.99, upgrades $2.50 itemised. "You're saving" bug recorded (see below).                                                                                                                                                                                                                                                                                                                                      |
| **TC-867** | S5 (hour-independent — days, not times): Rice Bowl + Fries $13.99 valid only on TOMORROW's weekday (restaurant zone, all day) → read back that one day, no time window → the public v2 list does not offer it, lima and wind receive that list (their own /active response, the positive control) and show no card, and its builder says 'Deal not found' → edit: today only → listed availableNow, both storefronts build and price it. Skipped only within 2 minutes of midnight.                                                                                                                                                                             |
| **TC-868** | S6: Free item — Baklava when they spend $25, ONLY WITH A CODE (no automatic spend offer on the seed restaurant) → read back the coupon (FREE_ITEM, gift, SPEND, $25, CODE) → edit $30 → three gyros ($33), code → the quote's free-item offer button → Add → the gift priced and discounted in full (-$5.00), Total = latest quote, on lima (code on the cart) and wind.                                                                                                                                                                                                                                                                                        |
| **TC-869** | S7: Sub + "Choose from" Cola / Lemonade / Iced Tea, $9.99 → read back → Lemonade goes out of stock → edit $10.49 → the public v2 list, lima and wind offer only Cola and Iced Tea → Sub + Iced Tea priced $10.49; "You're saving" from the picks.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **TC-870** | S8: chain shell → Combo price (per-run chain Wrap + Drink), $10.49 → the "Heads up — chain-wide change … all N locations" confirm → read back (owned by the chain group) → edit $10.99 in the chain shell → location A on wind (`?restaurantId`) and lima (the chain's slug → location picker → Order here; A is published for that step through `utils/publishBackstop` — restored in finally, else by globalTeardown / the next globalSetup from a marker file) prices it $10.99.                                                                                                                                                                             |

**Fixed (template-wind #125 + template-lima, verified on QA 2026-10-17):** on a combo with a "choose from" or "any from a category" line, both storefronts used to compute "You're saving" from the deal's stored regular price (every pick line at its CHEAPEST choice) instead of the items the customer picked. TC-863 / TC-866 / TC-869 now assert the saving strictly from the picks; BOGO deals are priced from picks and were always correct.

### "Try it as a customer" — API (`dashboard/owner/api-promotion-preview.spec.ts`)

Runs on its own throwaway tenant (`createSecondOwner`, alwaysFresh, tax rate set), never the seed restaurant, so its 5-live-preview cap and create rate limit are not shared with `26-promotion-preview`. A per-run "Automation Menu Preview <id>" category with three items (Burger $12, Cookie $4, Soda $2). Every test ends its own previews in `finally` (at most two live at once); afterAll is a backstop, then the items are hard-deleted, the category deleted and the tenant archived. A preview never takes a deal slot. The file skips with a clear reason while the backend answers 503 `PROMOTION_PREVIEW_UNAVAILABLE` (its ORDERING_BASE_URL is unset).

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-872** | POST /api/promotions/restaurant/:id/previews (combo) → 201; `previewUrl` = `<LIMA_ORDERING_URL>/preview/<43-char token>`, `token` matches, `expiresAt` 55–60 minutes ahead.                                                                                                                                                                                                                     |
| **TC-873** | With one real ACTIVE deal on the tenant: the preview's deal id (from its payload) is absent from the Promotions list; while it is live the active-deal count is 1, the real deal's row has `holdsDealSlot: true`, and the count equals the list's DEAL rows with `holdsDealSlot` (retried to 30 s); the plain public deal list never contains the preview. The real deal is deleted in finally. |
| **TC-874** | /quote with `X-Promotion-Preview` prices the preview deal at its dealPrice; the same body without the header is refused (400).                                                                                                                                                                                                                                                                  |
| **TC-875** | /active with the header returns the preview FIRST with `isPreview: true`, `Cache-Control: no-store`, `Vary: X-Promotion-Preview`.                                                                                                                                                                                                                                                               |
| **TC-876** | GET /api/promotions/preview/:token returns resolved banner text: the code sentence for a CODE deal, two notes, no subtitle on a create.                                                                                                                                                                                                                                                         |
| **TC-877** | An order POST carrying the header → 403 `PROMOTION_PREVIEW_NOT_ORDERABLE`; the same body without it is still refused (the deal is hidden).                                                                                                                                                                                                                                                      |
| **TC-878** | A create with `replaces: <first token>` ends the first preview (404 `PROMOTION_PREVIEW_ENDED`).                                                                                                                                                                                                                                                                                                 |
| **TC-879** | Cache leak: a plain /active request right after a preview request never contains the preview and varies on the header.                                                                                                                                                                                                                                                                          |
| **TC-880** | An ITEM_SALE preview decorates the item ($12 → $6) only with the header; a money-off coupon preview → 400 `PROMOTION_PREVIEW_UNSUPPORTED`.                                                                                                                                                                                                                                                      |
| **TC-881** | A FREE_ITEM preview's quote offers the gift; after DELETE both the site resolver (`?preview=`) and the preview read answer 404.                                                                                                                                                                                                                                                                 |
| **TC-888** | A token minted on the throwaway tenant, sent on the SEED restaurant: its /active has no preview deal, no `isPreview`, no `no-store`; /quote answers exactly as without the header; `/api/public/site?preview=` resolves the token's own restaurant, never the seed.                                                                                                                             |
| **TC-889** | With the header, a public reservation create and a pay-balance payment-intent request are refused with 403 (invalid payloads, so nothing real is created).                                                                                                                                                                                                                                      |

### "Try it as a customer" — dashboard → lima (`dashboard/owner/26-promotion-preview.spec.ts`)

The seed restaurant with a per-run "Automation Menu Try <id>" category (Chicken Gyro $12, Lamb Gyro $13, Soda $2, Cookie $4). Each test builds the promotion in Create (TC-883: Edit), presses "Try it as a customer" and follows the new tab to lima's `/preview/<token>/…`. Nothing is saved live except TC-883's paused combo (deleted in finally); every preview is ended in its test's `finally` (afterAll is a backstop). The file skips while the backend answers 503 `PROMOTION_PREVIEW_UNAVAILABLE`; a backend without the preview route (404) fails it.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-882** | Unsaved BOGO ("They buy" = both gyros as one choose-from line, Same item, they pay $1.99) → Try it → banner "Preview — orders can't be placed", the builder, one pick per slot = $14.99, Keep shopping → the preview menu with the Preview chip; + Soda → checkout Total = the latest /quote, the blocked-checkout notice, no Order now; the preview's deal id is not in the Promotions list and holds no slot (active count = the list's slot holders). |
| **TC-883** | Edit a paused $12.99 combo (Gyro + Soda) to $9.49 → Try it: banner "Unsaved changes to …", the builder shows $9.49; the stored deal still reads $12.99 and stays paused.                                                                                                                                                                                                                                                                                 |
| **TC-884** | Sale on items, 50% off the Chicken Gyro → Try it lands on the menu; the card shows the sale label, $6.00 and the struck $12.00.                                                                                                                                                                                                                                                                                                                          |
| **TC-885** | Free item (buy the Chicken Gyro, get the Cookie) → banner "Add … to your cart to see the free … at checkout."; the gyro in the cart → checkout offers "You've earned a free …" next to the blocked-checkout notice.                                                                                                                                                                                                                                      |
| **TC-886** | A second press replaces the first preview (first token → 404); back on the first tab (focus re-check) it shows "This preview has ended…", also after a reload (the server's ended page); End preview in the second tab's banner ends it (404) and the tab closes; a direct order POST with the first preview's deal id is refused.                                                                                                                       |
| **TC-887** | Desktop: the button and its hint sit in the live preview panel for a combo; "In-store only" shows it disabled with the in-store reason; Money off and Free delivery show no button; at 390 px it is inside the expanded Preview bar and not in the save buttons' row.                                                                                                                                                                                    |

### Retired with the old Coupon and Deal pages (2026-10-15)

The dashboard's Manage/Create Coupon and Manage/Create Deal pages, Deal Analytics and the old deal form were replaced by one Promotions section, so `dashboard/owner/07-coupons.spec.ts` and `dashboard/owner/11-deals.spec.ts` were deleted. Each old case maps to its replacement or is dropped with the reason.

| Old TC          | Was                                                                                 | Now                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-30           | Navigate to the Create Coupon form                                                  | TC-821 (old link redirects), TC-822 (Create promotion)                                                                                                                                                                                                                                                                                 |
| TC-31           | Fill and submit a new coupon                                                        | TC-822                                                                                                                                                                                                                                                                                                                                 |
| TC-63           | Invalid discount % rejected                                                         | TC-827 (amount validation; the 1–100 percent range is unit-tested in the dashboard's `promotionForm.test.ts`)                                                                                                                                                                                                                          |
| TC-91           | Created coupon visible in the list                                                  | TC-822                                                                                                                                                                                                                                                                                                                                 |
| TC-92           | Edit a coupon's discount value                                                      | TC-828                                                                                                                                                                                                                                                                                                                                 |
| TC-145          | Create a FIXED_AMOUNT coupon                                                        | TC-822 (same "Money off the order" card; the "$ off" kind is driven in TC-827, saved by the API in TC-829/830)                                                                                                                                                                                                                         |
| TC-146          | Create a FIXED_ITEM coupon                                                          | dropped: behaviour removed — Create no longer makes "$X off one item"; existing ones edit under Sale on items. API pin: TC-820                                                                                                                                                                                                         |
| TC-147          | FIXED_ITEM without an item rejected                                                 | dropped: behaviour removed (as TC-146)                                                                                                                                                                                                                                                                                                 |
| TC-148          | Non-positive FIXED_AMOUNT rejected                                                  | TC-827                                                                                                                                                                                                                                                                                                                                 |
| TC-149          | End date before start date rejected                                                 | dropped: the date-order rule moved into the "When?" card (unit-tested, `promotionForm.test.ts`); TC-827 pins the time-window equivalent                                                                                                                                                                                                |
| TC-150          | Empty code rejected                                                                 | dropped: the code is now suggested and pre-filled; the required rule is unit-tested                                                                                                                                                                                                                                                    |
| TC-151          | Duplicate code rejected                                                             | dropped: replaced by the live "Already used" code check on Create; uniqueness is enforced server-side                                                                                                                                                                                                                                  |
| TC-152          | Code input truncates at 20 characters                                               | dropped: input detail of the deleted form                                                                                                                                                                                                                                                                                              |
| TC-153          | List search by code                                                                 | dropped: behaviour removed — the list has no search box (status and type filters only)                                                                                                                                                                                                                                                 |
| TC-154          | List search by description                                                          | dropped: behaviour removed (no search)                                                                                                                                                                                                                                                                                                 |
| TC-155          | Search with no matches → empty state                                                | dropped: behaviour removed (no search)                                                                                                                                                                                                                                                                                                 |
| TC-156          | Status filter narrows to Active                                                     | dropped: filters are client-side over the server's rows and unit-tested (`listModel.test.ts`)                                                                                                                                                                                                                                          |
| TC-157          | Table sorts by Code                                                                 | dropped: behaviour removed — no column sorting (the server orders the rows)                                                                                                                                                                                                                                                            |
| TC-158          | Copy a code from the list                                                           | dropped: behaviour removed — no copy button                                                                                                                                                                                                                                                                                            |
| TC-159          | Duplicate pre-fills a new coupon form                                               | TC-853                                                                                                                                                                                                                                                                                                                                 |
| TC-160          | Delete via typed confirmation                                                       | TC-830 (one confirm now, no typing)                                                                                                                                                                                                                                                                                                    |
| TC-161          | Cancelling delete leaves the coupon                                                 | TC-830 (Cancel step before the delete)                                                                                                                                                                                                                                                                                                 |
| TC-162          | Edit pre-fills the form                                                             | TC-828                                                                                                                                                                                                                                                                                                                                 |
| TC-163          | Send disabled for an expired coupon                                                 | dropped: Send is hidden on ended rows and disabled on paused ones (unit-tested, `listModel.test.ts`)                                                                                                                                                                                                                                   |
| TC-164          | Reset Form clears the create form                                                   | dropped: behaviour removed — no reset button                                                                                                                                                                                                                                                                                           |
| TC-209          | Create a Free Delivery coupon                                                       | TC-826                                                                                                                                                                                                                                                                                                                                 |
| TC-216          | Free Delivery needs a minimum and a fee cap                                         | dropped: the two required fields are unit-tested (`promotionForm.test.ts`); TC-826 saves a valid one                                                                                                                                                                                                                                   |
| TC-86           | Reach the Manage Deals tab                                                          | TC-821, TC-832                                                                                                                                                                                                                                                                                                                         |
| TC-87           | Create Deal and AI Generate actions shown                                           | TC-821 (AI link → `create-promotion&ai=1`), TC-832                                                                                                                                                                                                                                                                                     |
| TC-351          | Table rows cell-for-cell + stat cards                                               | TC-822 → TC-826 (row status and "How customers get it" per type)                                                                                                                                                                                                                                                                       |
| TC-352          | Search + empty state + Refresh                                                      | dropped: behaviour removed (no search)                                                                                                                                                                                                                                                                                                 |
| TC-353          | Status filter + ended row's disabled switch                                         | dropped: filters unit-tested; the switch became the row menu (TC-829)                                                                                                                                                                                                                                                                  |
| TC-354          | Sort by Price / Savings                                                             | dropped: behaviour removed (no sorting)                                                                                                                                                                                                                                                                                                |
| TC-355          | Expand a row to list its slots                                                      | dropped: behaviour removed — rows show a one-line summary instead                                                                                                                                                                                                                                                                      |
| TC-356          | Status switch off / on                                                              | TC-829                                                                                                                                                                                                                                                                                                                                 |
| TC-357          | Delete confirmation                                                                 | TC-830                                                                                                                                                                                                                                                                                                                                 |
| TC-358          | Search from page 2 resets pagination                                                | dropped: behaviour removed (no search)                                                                                                                                                                                                                                                                                                 |
| TC-359          | Active-deal cap banners + refused toggle                                            | deferred (E2E) — covered by dashboard model unit tests in RestauNax PR #973 (`restaunax-frontend/src/components/Promotions/model/__tests__/listModel.test.ts`, the "(TC-359)" blocks); the E2E needs the seed restaurant at its 10-active-deal cap, which would block every parallel deal spec (server cap pinned by api-deals TC-335) |
| TC-360          | Guided form asks the type first                                                     | TC-824, TC-826 (six-card picker)                                                                                                                                                                                                                                                                                                       |
| TC-361          | Create a combo                                                                      | TC-826 (combo from its card); TC-825 (from an example) pending                                                                                                                                                                                                                                                                         |
| TC-362          | Edit a deal round-trip                                                              | TC-828 — partial: coupon edit only; the deal edit path is not covered                                                                                                                                                                                                                                                                  |
| TC-702          | BOGO free with "Same item"                                                          | TC-824 (BOGO with Same item, set-price reward)                                                                                                                                                                                                                                                                                         |
| TC-703          | BOGO 50% off                                                                        | TC-824 — partial: BOGO with a set-price reward only; the % off reward is not covered                                                                                                                                                                                                                                                   |
| TC-704          | Combo of two of the same item                                                       | TC-826 (combo with the same item on two lines; server keeps 2 units)                                                                                                                                                                                                                                                                   |
| TC-363          | Deal Analytics                                                                      | TC-831 (Results)                                                                                                                                                                                                                                                                                                                       |
| TC-364          | AI Deal Generator smoke                                                             | TC-821 — partial: checks the URL only (`create-promotion&ai=1`); the generator rendering is not checked                                                                                                                                                                                                                                |
| TC-528 → TC-532 | Deal schedule chips, save round-trip, hours warning, status chips, AI edit pre-fill | dropped: the deal schedule form became the "When?" rule card; schedule rules stay pinned by the API (api-deals TC-508 → TC-522); TC-827 drives the custom time window                                                                                                                                                                  |
| TC-540, TC-541  | Custom clears meal type; Until close; typed dates                                   | dropped: as TC-528 → TC-532                                                                                                                                                                                                                                                                                                            |
| TC-365          | Chain shell lists the chain deal; member Deals managed at chain level               | TC-833 (chain list), TC-854 (public availability at A and B), TC-835 (member disabled); the "Chain" chip / "across N locations" caption / "View Analytics" are gone with the Deals page (Results: TC-831 covers the chain scope through the same page)                                                                                 |
| TC-366          | Chain deal create through the fan-out confirm                                       | TC-834, TC-854 (public availability at both locations) (Money off the order; the confirm and chain list are the same contract)                                                                                                                                                                                                         |
| TC-523          | Chain create / bulk run the shared validation                                       | TC-523 (kept, `20-chain-promotions.spec.ts`)                                                                                                                                                                                                                                                                                           |
| TC-533          | Chain form summary zone wording, closed-day warning, table caption                  | TC-533 (kept, warning half only): summary wording and the Deals table caption dropped — the promotion form hides the summary line and the Deals table is retired                                                                                                                                                                       |
| TC-534          | Chain schedule-check per closed location                                            | TC-534 (kept, `20-chain-promotions.spec.ts`)                                                                                                                                                                                                                                                                                           |

## TC-691 → TC-712 — Guided Deal Types (type-first deals, 2026-10)

**Status:** ✅ Passing on QA (2026-10-09, after restaunax #927 + #928). The deploy gate was removed — these always run.

Deals are now picked by type first (spec `restaunax/docs/features/DEAL_TYPES.md`): `COMBO` (default; ≥ 2 unit rows, owner price below regular), `BOGO_FREE`, `BOGO_PERCENT_OFF`, `PERCENT_OFF` (price computed server-side). Every write re-reads item prices from the menu.

### API contract (`dashboard/owner/api-deals.spec.ts`, throwaway tenant — Burger 10, Fries 6.50, Drink 4)

| TC         | What it checks                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-691** | `BOGO_FREE` Burger BUY + Burger GET with no `dealPrice` → 201 at 10 (1× the item), originalPrice 20, roles BUY/GET persisted and read back.                                                                                                                                                            |
| **TC-692** | `BOGO_PERCENT_OFF` 50%: Burger BUY + Fries GET → 13.25, `discountPercent` 50.                                                                                                                                                                                                                          |
| **TC-693** | `PERCENT_OFF` on a single item (25% off the Burger) → 7.50, one INCLUDED row.                                                                                                                                                                                                                          |
| **TC-694** | A client `dealPrice` is ignored for computed types (BOGO sent 1 → 10; 10% off sent 999 → 9); a client `itemPrice` (99 / 50) is replaced by the menu's — originalPrice 16.50.                                                                                                                           |
| **TC-695** | 400 + exact `error:deal.type.*` text: invalidType, invalidRole (BOGO row without role, COMBO row marked BUY), bogoNeedsBuyAndGet, discountPercentRange (missing/0/100/12.5), comboNeedsTwoItems (one unit — the API used to accept it), priceMustBeBelowRegular (at and above 16.50); nothing written. |
| **TC-696** | A COMBO of the same item twice (two rows, or quantity 2) is accepted → two INCLUDED Burger rows, originalPrice 20.                                                                                                                                                                                     |
| **TC-697** | Price-only PUT re-validated against the stored rows: 16.50 → 400 priceMustBeBelowRegular (price unchanged); 11 → 200 with the row ids UNCHANGED; percent-only PUT on a BOGO 50% → 20% reprices to 15.20 in place.                                                                                      |
| **TC-698** | Legacy create (no `dealType`, no roles) → COMBO, `discountPercent` null, INCLUDED rows; the owner list carries `dealType`.                                                                                                                                                                             |
| **TC-699** | `/quote` charges a BOGO_FREE deal its computed price: lineTotal 10, savings 10 (client `dealPrice` 0.01 ignored).                                                                                                                                                                                      |
| **TC-700** | Bulk (AI path): a BOGO_FREE without `dealPrice` is created at 10; a one-unit combo is reported in `errors[]` (comboNeedsTwoItems) without failing the batch.                                                                                                                                           |
| **TC-701** | Public `/ai/questions` has the 5th question `dealTypes` (type `multiple`, options exactly COMBO / BOGO_FREE / BOGO_PERCENT_OFF / BOGO_FIXED_PRICE / PERCENT_OFF, each labelled + described).                                                                                                           |

### Dashboard (`dashboard/owner/11-deals.spec.ts`, seed restaurant, +1 active deal per test, deleted in `finally`) — retired 2026-10-15 (see “Retired with the old Coupon and Deal pages”)

| TC         | What it checks                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-702** | BOGO free with "Same item": Burger in They buy → Same item → They get; preview $10.00 → POST `dealType` BOGO_FREE; API two Burger rows BUY/GET at 10. |
| **TC-703** | BOGO 50% off: Burger buy, Fries get, percent 50 → preview $13.25 → API `discountPercent` 50, dealPrice 13.25, Fries is the GET row.                   |
| **TC-704** | Combo of two of the same item: Burger picked twice → two lines at 15 → row "2 items" $15.00 / $20.00; API two INCLUDED Burger rows.                   |

TC-360 → TC-362 were rewritten for the same form (see the Deals section above). Fixture changes elsewhere, for the new rules (all work before AND after the deploy): `customer/06-deals` seeds its single-slot deal as `PERCENT_OFF` 20% (a one-item combo is now refused; the slot count stays 1); `api-menu` TC-272 and `04c` TC-303 seed their blocker deal (cap-safe, slot given back in `finally`) with quantity 2 of the item; `11-deals` schedule tests (TC-529/530/540/541) and `18-chain-deals` TC-366 add items through `addComboItems` (guided COMBO lines or the legacy picker); TC-532 accepts a guided line or a legacy card.

### Slot matching + "buy any X, get one free" (TC-705 → TC-712)

**Status:** ✅ Passing on QA (2026-10-09). Spec: `restaunax/docs/features/DEAL_TYPES.md` → "Deal picks must match their slots", "Buy any pizza, get one free", "Orders store what the server charged". API cases add an "Automation Pizza" category to the throwaway tenant: Small 8, Large 14, and a Slice 5 that is 86'd.

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-705** | `/quote`, COMBO Burger + Fries at 12: right picks → 200 (with slot ids, or without in any order). 400 `pricingDealSelectionNotInDeal`: Drink instead of Fries (no ids), Drink named into the Fries slot, Burger/Fries swapped slots, a third item. 400 `pricingDealSlotUnfilled`: Fries slot empty (with/without ids), no picks. `/validate` flags the Drink in the Fries slot with the same sentence. |
| **TC-706** | Storefront `placeOrder` (tenant published for the test): the same wrong pick (with/without `dealItemId`) and the empty slot → 400 with the same sentences; no order created.                                                                                                                                                                                                                           |
| **TC-707** | `BOGO_FREE` with category lines (Any pizza BUY + Any pizza GET) → 201, `dealPrice` 8 = cheapest IN-STOCK pizza (the 86'd 5 is ignored), originalPrice 16; both rows category rows snapshotted at 8, roles BUY/GET.                                                                                                                                                                                     |
| **TC-708** | `/quote` equal-or-lesser value: Small + Large → 14 (savings 8) with no ids, Large in BUY, AND Small in BUY / Large in GET; two Larges → 14; two Smalls → 8; client `dealPrice` 0.01 ignored. A Burger (other category) in the GET slot or beside a Large → 400 `pricingDealSelectionNotInDeal`.                                                                                                        |
| **TC-709** | `BOGO_PERCENT_OFF` 50 with category lines → stored 12 (8 + 4); `/quote` Small BUY + Large GET → 18 (14 + half of 8), two Larges → 21.                                                                                                                                                                                                                                                                  |
| **TC-710** | `PERCENT_OFF` with a category line (alone, or beside a fixed item) → 400 `deal.type.categoryNotAllowedForPercentOff`, nothing written; control: a COMBO of Burger + Any pizza at 15 is still accepted at its set price.                                                                                                                                                                                |
| **TC-711** | A placed category-BOGO order (Small + Large; body claims `dealPrice` 0.01 and `menuItemPrice` 0.01) stores `OrderDeal.dealPrice` 14 and the picks' `menuItemPrice` 8 / 14 from the menu. Leaves one INITIALIZED order on the throwaway tenant.                                                                                                                                                         |
| **TC-712** | `pos/10-deals`: an open-check ticket with the Soda in the combo's Fries slot (without and with `dealItemId`) → 400 `pricingDealSelectionNotInDeal`; only the Burger → 400 `pricingDealSlotUnfilled`. Before the deploy it rings up (201, cancelled in afterAll) and SKIPS.                                                                                                                             |

Fixture audit (2026-10-09): every existing deal body already picks exactly its slots' items — `api-deals` /quote + order cases (TC-337/338/339/343/344/514/515/675), `pos/10-deals` (Burger + Fries), `customer/08-deals-handoff` `seedCartWithDeal` (the deal's own rows + `dealItemId`), and the UI-built carts in `customer/06-deals`, `08-deals-handoff`, `customer-lima/13-deals`. No fixture change was needed.

---

## TC-26 — Customer Can Complete a Full Order and See Order Confirmation

**Status:** ✅ Passing (needs `OWNER_EMAIL`/`OWNER_PASSWORD` and `TEMPLATE_WIND_URL` pointing at a real per-restaurant Template Wind deployment — the bare `qa.restaunax.com` root only serves the marketing site)

### What it checks

A customer can go through the entire ordering process from start to finish — including payment — and reach the "Order Confirmed!" page.

### How it works, step by step

1. The test puts items in the cart and goes to checkout
2. It fills in the customer details (same as TC-25)
3. It selects "Pickup"
4. It clicks "Proceed to Payment"
5. It enters a **Stripe test card number** (`4242 4242 4242 4242`) — this is a fake card that Stripe provides for testing, it never charges real money
6. It enters an expiry date (12/30) and security code (123)
7. It clicks "Complete Order"
8. It confirms:
   - The page changes to the order confirmation screen
   - The heading "Order Confirmed!" is visible
   - An order number is displayed
   - The customer's first name ("Jane") appears in the thank-you message

### Why it matters

This is the most critical test in the entire suite. If a customer cannot complete an order, the restaurant earns nothing and the customer goes elsewhere. This test validates the entire money flow works end to end.

---

## TC-99 — Customer Can Add to Cart and Reach Checkout Through the Real UI

**Status:** ✅ Passing (same env requirements as TC-22 → TC-26)

### What it checks

The genuine user path from menu to checkout: open an item, click "Add to Cart", open the cart via the floating "View Cart" button, and click through to the checkout page.

### How it works, step by step

1. The test opens the menu and clicks the seed item to open its modal
2. It clicks "Add to Cart" and confirms the floating "View Cart" button appears
3. It opens the cart and clicks the checkout button ("Proceed to Checkout" / "Checkout & Sign In")
4. It confirms the browser lands on `/checkout` with the customer info form visible

### Why it matters

Every other checkout test injects the cart directly into browser storage for speed (see TC-24). That's a fair trade-off — but only if at least one test proves the _real_ add-to-cart wiring works. This is that test: if the cart button, cart modal, or storage schema breaks for actual customers, this is the test that catches it.

---

## TC-125 — Customer Can Apply a Coupon at Checkout

**Status:** ✅ Passing (needs `TEMPLATE_WIND_URL` + `OWNER_EMAIL`/`OWNER_PASSWORD`)

### What it checks

The customer-facing coupon **redemption** path — previously untested. Coupons were created in the owner UI (TC-31/91) but no test ever applied one as a customer.

### How it works, step by step

1. `beforeAll` seeds a 10%-off coupon (`AUTO…` code) on the seed restaurant via the owner coupon API, and confirms it's queryable.
2. The test seeds the cart, types the code into the checkout coupon box, clicks Apply, and verifies the discount appears: the applied-code pill shows the code, a "Saving $X.XX" line sits under it, and the order summary shows the server's promotion line (`appliedPromotion.title` from `/quote`, e.g. "10% off your order") with the same amount (PROMOTIONS.md "Clients as built (plan 3)").
3. It then applies a bogus code and verifies the rejection error, with no discount.
4. The seeded coupon is swept by `globalTeardown` (the existing `AUTO*` cleanup) — no per-test cleanup needed.

### Why it matters

Coupons are a revenue lever. A backend that accepts a code but never discounts, or a UI that silently drops the applied coupon, would go unnoticed — the owner-side create test can't see it. This exercises the whole validate-and-apply round-trip a paying customer actually hits.

---

## TC-126 — Selecting Delivery Drives the Address → Quote Round-Trip

**Status:** ✅ Passing / graceful skip (needs `TEMPLATE_WIND_URL` + `OWNER_EMAIL`/`OWNER_PASSWORD`)

### What it checks

That choosing **Delivery** and entering an address fires the delivery-quote round-trip and the UI resolves it — either an available fee or a clean "not available" message. This is **quote-wiring coverage only**, not a full delivery order (that needs QA's delivery provider configured and a genuinely deliverable address).

### How it works, step by step

1. Seed the cart and open checkout.
2. If the restaurant doesn't offer Delivery (pickup-only / ship-only — the Delivery button is absent), the test **skips** rather than fails.
3. Click Delivery, type an address into wind's address autocomplete (backed by the backend geo proxy, `GET /api/public/geo/autocomplete`), and pick the first suggestion. If the proxy returns no suggestion (external dependency), the test **skips** with a clear reason. (Until 2026-10-23 the POM looked for Google's `.pac-item` rows, which wind no longer renders, so this and TC-215/TC-218 always skipped.)
4. Assert the quote resolved — the green "Delivery Available" fee box **or** the red "Delivery Not Available" box. Both prove `/api/delivery/quote` fired and the UI handled it. No Stripe, no order placed.

### Why it matters

Delivery had zero coverage — every prior order test used Pickup. A broken address field, quote call, or unhandled out-of-area response would ship unnoticed. The graceful skips keep it honest on restaurants/environments where delivery genuinely isn't configured.

---

## TC-165–170 — Gift Card Purchase and Balance Check

**Status:** ✅ All passing (needs `TEMPLATE_WIND_URL` + `ADMIN_EMAIL`/`ADMIN_PASSWORD`). TC-165/166/169 were `test.fixme` from 2026-07-11 to 2026-10-23 (Stripe Radar's invisible hCaptcha on the Pay click); re-written on 2026-10-23, they pass repeatedly (18/18 in a `--repeat-each=3` run). Each buys a real test-mode card, checks its public balance, and records it for the teardown freeze.

### What they check

Gift cards had **zero test coverage anywhere** before this pass — no POM, no API helper, not one test. This batch covers the `/gift-cards` purchase page end to end as a guest: TC-165 (preset denomination, "Send as Gift"), TC-166 (custom amount within the restaurant's configured range), TC-167/TC-168 (custom amount below/above range blocked client-side), TC-169 (the public balance-check tool shows the correct balance for a freshly purchased code), TC-170 (balance check shows "not found" for a bogus code).

### How it works, step by step

1. Fetch the restaurant's live gift-card config (`GET /api/gift-cards/config/restaurant/:id`) to compute realistic amounts instead of hardcoding assumed min/max defaults.
2. Pick a preset or type a custom amount, choose "Send as a gift" (guest-accessible — unlike "For me", which requires login), fill a recipient email, continue to payment, and fill a Stripe test card via the shared `fillStripePaymentElement` helper (extended to also fill an optional billing ZIP field this purchase flow's Payment Element configuration requires but checkout's doesn't).
3. Read the formatted code off the confirmation screen; look up its DB id via the admin gift-card list (search on the sanitized, dash-stripped code — the admin API masks codes in list results but searches the raw column) and record it in a cleanup file.
4. `globalTeardown` best-effort **freezes** every recorded test gift card at the end of the run — there's no delete endpoint for gift cards (only freeze), unlike coupons.

### Why it matters

Gift cards are real revenue with real Stripe charges. An amount-validation regression, a broken confirmation screen, or a balance-check tool that silently shows the wrong number would have shipped with zero warning.

---

## TC-171–178 — Gift Card Redemption at Checkout

**Status:** ✅ All passing

### What they check

The checkout-side "Gift Card" box (`RewardSection`), seeded via the admin gift-card import (`seedFundedGiftCard` — an ACTIVE, funded card at the seed restaurant) and admin freeze/adjust endpoints rather than the purchase UI (faster, and mirrors how `createCouponRaw` seeds coupons for checkout tests; the public purchase endpoint can no longer seed since it requires a verified, succeeded Stripe PaymentIntent — backend 93e5fecb9): TC-171 (valid card applied shows the discount), TC-172 (Remove clears it), TC-173 (invalid code rejected), TC-174 (a card manually depleted to $0 via admin adjust is rejected), TC-175 (an admin-frozen card is rejected), TC-176 (a coupon and a gift card both apply to the same order simultaneously — currently-supported behavior, not a test of the separate `canCombineWithCoupons` config flag, which isn't enforced by either side today), TC-178 (a card that only partially covers the total still routes the remainder through Stripe).

### Why it matters

Same reasoning as coupons (TC-125) — the discount math and rejection paths are exactly the kind of thing that silently breaks and overcharges or undercharges a customer with no error anywhere.

### TC-177: a gift card that covers the whole order

TC-177 pays a pickup order entirely with a $200 seeded card: "Proceed to payment" goes straight to "Order Confirmed!" with no card step, and the card's balance drops by the order's TOTAL (read from the backend breakdown). It was a `test.fixme` from 2026-07 until 2026-10-23 for a real bug (the order was created, then the page tried a $0 Stripe PaymentIntent and left the customer stuck); that bug is gone on QA.

---

## TC-184–188 — Customer Checkout Quick Wins

**Status:** ✅ Passing (verified on CI against QA, 2026-07-19)

### What they check

Five previously-untested checkout behaviors, all over existing wiring: TC-184 (the `?item=<id>` landing-page deep link auto-opens that item's modal — no card click), TC-185 (`/checkout` with an empty cart renders the "Your Cart is Empty" screen instead of the form), TC-186 (tip presets and the custom tip input flow into the **server-quoted** total — asserted as relative total movement so no tax-math assumptions), TC-187 (a `minOrderAmount` coupon **stops applying** when removing a cart line drops the order below its minimum — the re-quote drops the discount and raises an ERROR issue on the code: the sentence "Your order doesn't meet the minimum for that coupon." sits next to the code with "Remove the code to continue", and Pay reads "Review your order" and is disabled; since Promotions the code is no longer auto-removed), TC-188 (a $0.25 item quotes a total under Stripe's $0.50 floor — the proceed button disables with "Minimum $0.50 Required" plus the explainer banner, and no order is ever created).

### Notes from authoring

Two findings worth keeping: (1) the backend's "Order must be at least $X to use this coupon" revalidation message renders only **transiently** before the next revalidation cycle clears it, so TC-187 used to assert the removal itself, not the error copy (since Promotions the code stays and its sentence is shown persistently, so TC-187 now asserts it); (2) cleaning up a seeded menu category requires **permanent** (admin) item deletion first — soft-deleted items still trip the category-delete guard (the TC-67 rule), which is why TC-188's fixture teardown passes the admin token. TC-188's cheap item is real, not just a sessionStorage entry, because the server quote reprices the cart from DB prices.

---

## TC-189–194 — Item Modifier Rules

**Status:** ✅ Passing (verified on CI against QA, 2026-07-19)

### What they check

The ItemModal's modifier engine — the storefront's richest client-side logic, previously untested end to end: TC-189 (a required group with no default shows its Required pill and keeps Add to Cart disabled until a pick), TC-190 (a `maxSelections=1` group renders real radio inputs — choosing B deselects A), TC-191 (a `maxSelections=2` checkbox group disables the third, unchecked option at the cap), TC-192 (an ADJUSTS_PRICE add-on raises the Add to Cart label's live price by its own price), TC-193 (a REPLACES_PRICE size **replaces** the base price — default Small $8.00 on a $10.00 item, Large reprices to $12.00), TC-194 (an `allowsDuplicates` modifier's Qty stepper multiplies its contribution).

### How the fixtures work

Four items are seeded with **inline `modifierGroups` on the item-create endpoint** (`POST /menu/item/new` accepts `NewModifierGroup[]` with nested modifiers — verified in the backend controller), under one own "Automation Items" group. Modifier option names are run-unique so `getByRole` name matching can never collide. Cleanup deletes the group in `afterAll` with the admin token (permanent item deletes — the category-delete guard again), backstopped by globalTeardown's sweep. New POM: `pages/customer/CustomerItemModal.ts` (real radio/checkbox inputs, price read from the Add to Cart label, icon-only Qty steppers reached from the adjacent "Qty:" text).

---

## TC-195–197 — Deal Builder & Deal↔Coupon Exclusion

**Status:** ✅ Passing (verified on CI against QA, 2026-07-19)

### What they check

The deal purchase path, previously zero coverage: TC-195 (opening `/deals/<id>` adds nothing; the fixed item is included, "All set"; one "Add deal to cart" puts the deal in the cart and checkout offers the normal Proceed to Payment button), TC-196 (rewritten for guided deal choices, spec §11: opening the builder and leaving adds nothing, so checkout shows the empty cart, no deal row and no "Complete Deals to Continue" — the old assertion pinned the half-built auto-add), TC-197 (with a completed deal in the cart, a real seeded AUTO 10% coupon is refused by the server's pricing with "Coupons can't be combined with deals…" next to the code and no saving applied — a bundle is the customer's promotion, PROMOTIONS.md money rule 3; a real code is needed so the refusal comes from that rule, not "code not found"). Since guided deal types (2026-10) the single-slot fixture is a `PERCENT_OFF` 20% deal — a one-item COMBO is refused by the backend — sent with the same price as `dealPrice` so it seeds on both sides of the deploy.

### How the fixtures work

One own single-slot deal on the seed menu item, created via `POST /api/deals/restaurant/:id` with **no day/time restrictions** so it's always active, `AUTO`-prefixed and deleted in `afterAll` — with a new `deleteAutomationDeals` sweep in globalTeardown (mirroring the coupon sweep) backstopping interrupted runs. New apiHelpers: `createDealRaw`, `getRestaurantDeals`, `deleteDealApi`, `deleteAutomationDeals`; new POM `pages/customer/CustomerDealPage.ts`.

---

## TC-100 — Restaurant Receives and Processes an Order Through the POS Lifecycle

**Status:** ✅ Passing (needs `OWNER_EMAIL`/`OWNER_PASSWORD`); run with `--project=pos`

### What it checks

The other half of the core business loop. TC-26 proves a customer can _place_ an order; TC-100 proves the restaurant _receives_ it and can drive it through the kitchen lifecycle. API-level, because the POS is a React Native app (`device-in-store`) — these tests hit the same backend the device talks to.

### How it works, step by step

1. `beforeAll`: owner API login; provision a POS tablet device (returns a one-time plaintext code); tablet logs in for a real POS session.
2. A customer order is seeded via the public order API at its real menu price (the backend's pricing guard rejects `total: 0` since 2026-07-09), then bumped to `PENDING` — the state a just-paid order lands in — with no Stripe.
3. Assert the order shows up in the restaurant's live current-orders feed (the "received" half).
4. Drive it `PENDING → CONFIRMED → PREPARING → READY → PICKED_UP`, confirming each transition at the API, and that the fulfilled order remains on today's feed at its terminal status.
5. `afterAll`: deactivate the tablet device (there's no device-delete API).

### Why it matters

This was the single biggest business-risk gap: nothing verified that a placed order ever reaches the kitchen or can be worked. Tablet-initiated cancel/refund (needs a staff session) is tracked as a follow-up ([#15](https://github.com/Restaunax/Automation/issues/15)).

---

## TC-179 — Current-Orders + Status Reject an Unauthenticated Caller

**Status:** ✅ Passing; run with `--project=pos`

### What it checks

`GET /api/order/restaurants/:id/orders/current` and `PUT /api/order/orderId/:id/status` both reject a caller with no access token.

### How it works, step by step

1. Call the current-orders feed with no `Authorization` header; assert `401`.
2. Call the status-update route with no `Authorization` header (against a dummy order id); assert `401`.

### Why it matters

Both routes previously accepted any caller — an anonymous request could read every order's customer PII off the live feed or tamper with order status. Kept as `test.fixme` ([#17](https://github.com/Restaunax/Automation/issues/17)) until the backend's `requireTabletOrPermission` fix was confirmed live on QA (2026-09-22); see `TEST_COVERAGE.md`'s Known Technical Debt.

---

## TC-46 — Owner Can Navigate to the Stripe Setup Page

**Status:** ✅ Passing

### What it checks

The owner can open the payment settings page for their restaurant and see the "Payment Setup" heading.

### How it works, step by step

1. The test navigates directly to `/restaurant/restaurantId/<id>/setupStripe`
2. It confirms the "Payment Setup" heading is visible on screen

### Why it matters

If the payment setup page doesn't load, the owner cannot connect Stripe and the restaurant cannot accept any online payments.

---

## TC-47 — Stripe Onboarding Page Shows the 4-Step Progress Stepper

**Status:** ✅ Passing

### What it checks

The page displays a stepper with four labelled steps guiding the owner through Stripe setup.

### How it works, step by step

1. The test navigates to the Stripe setup page
2. It checks that all four step labels are visible: **Check Status**, **Create Account**, **Verify Details**, **Start Accepting**

### Why it matters

The stepper tells the owner exactly where they are in the onboarding process. If any step is missing or mislabelled, owners may not know what action to take next.

---

## TC-48 — Stripe Setup Page Shows the Explanatory Header Description

**Status:** ✅ Passing

### What it checks

Below the heading, a short sentence explains that Stripe is used to accept payments and grow the restaurant business.

### How it works, step by step

1. The test navigates to the Stripe setup page
2. It confirms the subtitle text "Connect with Stripe to start accepting payments and grow your restaurant business" is visible

### Why it matters

New owners who haven't heard of Stripe need this context to understand what they're signing up for and why.

---

## TC-49 — Owner Without a Stripe Account Sees the "Set Up Stripe Account" Button

**Status:** ✅ Passing

### What it checks

When a restaurant hasn't connected Stripe yet, the primary action button on the page reads "Set Up Stripe Account".

### How it works, step by step

1. The test **intercepts the Stripe status API** before navigating, returning `hasAccount: false` — this forces the page to render the pre-setup UI regardless of the QA account's real Stripe state
2. It navigates to the Stripe setup page
3. It confirms the "Set Up Stripe Account" button is visible

### Why it matters

If this button is missing or has the wrong label, the owner cannot start the Stripe connection process and the restaurant is stuck — it cannot take payments.

---

## TC-50 — Stripe Setup Page Shows the "What You'll Need" Requirements Section

**Status:** ✅ Passing

### What it checks

The page shows a checklist of four items the owner needs to have ready before completing Stripe verification.

### How it works, step by step

1. The test **intercepts the Stripe status API** before navigating, returning `hasAccount: false` — this forces the page to render the pre-setup UI regardless of the QA account's real Stripe state
2. It navigates to the Stripe setup page
3. It confirms the section heading "What You'll Need" is visible
4. It confirms all four requirement items are listed: **Personal Information**, **Business Details**, **Bank Account**, **Payout Settings**

### Why it matters

Without this checklist, owners start Stripe onboarding unprepared and may abandon it halfway through — leaving the restaurant unable to accept payments.

---

## TC-51 — Stripe Success Callback Page Loads After Onboarding Redirect

**Status:** ✅ Passing

### What it checks

After Stripe finishes onboarding and redirects the owner back to the app, the success/return page loads correctly and shows the owner their account status.

### How it works, step by step

1. The test navigates directly to `/stripe-onboarding-success?restaurantId=<id>` — this simulates Stripe redirecting the owner back after onboarding
2. The page fetches the current Stripe account status from the server
3. The test checks that a heading appears — either **"Stripe Account Successfully Connected!"** (if fully set up) or **"Stripe Account Setup In Progress"** (if more steps are needed)
4. The test confirms the **"Restaurant Dashboard"** button is visible regardless of Stripe status

### Why it matters

If this page fails to load after the Stripe redirect, the owner is left on a broken screen with no way to get back to their restaurant. The redirect is the final step of the payment setup flow — it must work reliably.

---

## TC-52 — Clicking "Restaurant Dashboard" Redirects to Restaurant Management

**Status:** ✅ Passing

### What it checks

After completing (or partially completing) Stripe setup, the owner can click "Restaurant Dashboard" and be taken directly back to managing their restaurant.

### How it works, step by step

1. The test opens the Stripe success/callback page
2. It clicks the **"Restaurant Dashboard"** button
3. It confirms the browser navigates to `/restaurant/restaurantId/<id>/restaurantManagement`

### Why it matters

This is the exit point of the entire payment setup flow. If the button doesn't redirect correctly, the owner is stuck on the callback page and cannot return to their restaurant — they would have to navigate manually. A broken redirect here means a poor owner experience every time they set up payments.

---

## TC-53 — Clicking "Set Up Stripe Account" Calls the Create API and Redirects to Stripe

**Status:** ✅ Passing

### What it checks

When the owner clicks "Set Up Stripe Account", the app calls the backend to create a Stripe Connect account and immediately redirects the owner's browser to Stripe's onboarding website.

### How it works, step by step

1. The test intercepts the Stripe status API to return `hasAccount: false`, so the button appears
2. It intercepts the **create-account API** (`POST /api/stripe/account/restaurant/:id/create`) and returns a fake Stripe Connect URL — this proves the correct endpoint is called without touching the real Stripe API
3. It intercepts `connect.stripe.com` with a stub response so the browser redirect completes inside the test environment
4. It clicks the "Set Up Stripe Account" button
5. It confirms the browser navigated to a `connect.stripe.com` URL
6. It confirms the create API was called with the correct `restaurantId`

### Why it matters

This is the critical handoff from the app to Stripe. If the button calls the wrong endpoint, or the response URL isn't followed, the owner never reaches Stripe's onboarding and cannot connect payments. This test verifies the entire chain — button click → API call → redirect — without needing a real Stripe account or leaving the test environment.

---

---

# 🔒 SECTION 5 — Access Control, Negative Cases, Onboarding

> These tests check the "shouldn't work" side of the platform: wrong passwords, blank required fields, requests with no login at all, and the handful of paths a brand-new restaurant owner has to go through before they can operate. Individual step-by-step write-ups aren't included for each one (there are dozens) — see the Test Summary table above for the full list by TC number.

**Access control** (TC-54, TC-55, TC-56–58, TC-71–73, TC-81): confirms that role and permission boundaries are enforced server-side, not just hidden in the UI — an OWNER hitting `/publish`, `/tax`, or `/restaurant/loyalty` directly gets redirected to Access Denied; a completely logged-out visitor hitting any protected dashboard URL gets redirected to `/sign-in`; owner/admin/employee can all reach the shared menu-management screen. If any of these broke, a user could see or reach a screen (or data) their role shouldn't have access to.

**Form validation negatives** (TC-59–61, TC-62, TC-63, TC-74, TC-75, TC-95, TC-96): confirms that bad input is actually rejected — wrong password or unknown email on sign-in, blank name/price in the menu-item wizard, an out-of-range coupon discount, a demo request with unchecked terms or a malformed email, mismatched or too-short sign-up passwords. If validation silently accepted any of these, bad data would reach the database or a customer would see a confusing failure with no explanation.

**API-level negatives** (TC-65, TC-66, TC-68, TC-69, TC-76, TC-77, TC-79, TC-80): the same idea, but bypassing the UI entirely and hitting the backend directly — proving the _server_ rejects a menu item with no name, a coupon with no code or a negative value, a garbage login token, an unknown role name, a status-toggle on a user that doesn't exist, and a restaurant-creation attempt from an account without permission. This matters because a determined user (or a bug in a different client, like the mobile app) could bypass the website's own validation — the backend has to hold the line independently.

**Sign-up and restaurant creation** (TC-93–97): covers two of the four distinct "onboarding" paths in the app — a visitor registering a plain account (which starts as role `USER`, not `OWNER`, until it creates a restaurant), and a company employee creating a restaurant on behalf of a client. A third path (an admin-side AI tool that turns a sales lead into a restaurant) was investigated but not implemented — the version of the site currently running on QA doesn't match what's in the code repository for that specific feature, so there was nothing reliable to test against.

---

---

# 👔 SECTION 6 — Employee Dashboard

> These tests check the **company-side setup staff** role (EMPLOYEE) — not to be confused with a restaurant owner's own staff. EMPLOYEE can publish menus and configure tax on behalf of a client, which OWNER is explicitly denied (see TC-27/TC-28 and the access matrix TC-54/TC-55). Tests here skip automatically unless `EMPLOYEE_EMAIL` / `EMPLOYEE_PASSWORD` are set in `.env` — a skip is a gate, not a failure.

---

## TC-143 — Employee Can Reach the Publish Page

**Status:** ⏭️ Skipped locally (no `EMPLOYEE_*` credentials in this environment) — real everywhere they exist

### What it checks

Unlike OWNER, who gets Access Denied on the publish page (TC-27, TC-54), an EMPLOYEE can open it and see the "Publish Restaurant" button.

### How it works, step by step

1. The test signs in as EMPLOYEE and navigates directly to the restaurant's publish page
2. It confirms the "Publish Restaurant" button is visible on screen

### Why it matters

This is the key proof of the OWNER-vs-EMPLOYEE permission split for publishing. If EMPLOYEE lost this access, no restaurant could ever be taken live, since owners cannot self-publish.

---

## TC-144 — Employee Sees the Required Checklist on the Publish Page

**Status:** ⏭️ Skipped locally (no `EMPLOYEE_*` credentials in this environment) — real everywhere they exist

### What it checks

The same four-item checklist described in TC-28 (Hours of Operation, Menu Setup, Restaurant Information, Payment Processing) is visible to an EMPLOYEE on the publish page.

### How it works, step by step

1. The test signs in as EMPLOYEE and opens the restaurant's publish page
2. It checks that all four checklist items are visible

### Why it matters

Confirms EMPLOYEE gets the same completeness guidance as any other role that can reach this page, so a client's restaurant is never published half-configured.

---

## TC-940 — Employee Can Invite a Restaurant's Staff (API)

**Status:** ✅ Passing — `tests/dashboard/employee/staff-invite.spec.ts` (needs `EMPLOYEE_*`, `ADMIN_*` and `MAILPIT_BASE_URL`, else skipped)

### What it checks

Product decision (2026-10-23): a company EMPLOYEE **can** invite a restaurant's (POS) staff, matching `POST /restaurant/:id/staff/invite` (`requireOwnerOrAdmin` lets EMPLOYEE through). Inviting **company** users (`/api/admin/users/invite`) stays ADMIN-only.

### How it works, step by step

1. The test mints a throwaway owner + restaurant and signs in as EMPLOYEE
2. EMPLOYEE invites an auto-named staff member — the API returns 201 with a staff member id
3. The restaurant's owner lists staff and the new record is there
4. EMPLOYEE posting to `/api/admin/users/invite` gets 403
5. Cleanup removes the staff row and purges the restaurant (asserted)

### Why it matters

Company setup staff onboard clients end to end, including the client's staff; the 403 keeps the company-user invite admin-only.

---

## TC-942 — Owner Can't Change RestauNax Setup Fields (API)

**Status:** ✅ Passing on QA (2026-10-27) — `tests/dashboard/owner/api-settings-safety.spec.ts`. Settings safety shipped in RestauNax PR #1074; `RELEASED_ON_QA.settingsSafety` is now `true`, so a missing capability FAILS instead of skipping (`--grep @settings-safety`)

### What it checks

The restaurant's time zone, business type, business-day cutoff, deposit-at-close, slug, published/isActive and the other setup fields are RestauNax-only (`docs/features/back-office/SETTINGS_SAFETY.md` §4). An OWNER token that changes the time zone on `PUT /restaurant/:id/basic-info` gets **403 `HQ_ONLY_FIELDS`** (`fields: ["timezone"]`, "Only RestauNax can change this — contact support."); echoing the current value still works; an ADMIN token may change it.

### How it works, step by step

1. Mint a throwaway owner + restaurant; probe `GET /api/restaurantId/:id/settings/setup` (404 = not deployed → skip)
2. Owner sends a different zone → 403 with the message; the stored zone is unchanged
3. Owner sends the current zone back → 200
4. Admin sends the new zone → 200 and it is stored
5. Cleanup deletes the restaurant

### Why it matters

The zone re-times every report and the business type decides the feature trim; an owner changing either by accident breaks their books. Specs that need a zone move it with the admin token (`api-scheduling`, `api-tips`, `api-tip-waterfall`, `23-tip-waterfall-ui`).

---

## TC-943 → TC-957 — Back Office: The Next Level (RestauNax PR #1074)

**Status:** ✅ Passing on QA (2026-10-27).

What PR #1074 added for the owner, and what these tests prove (spec: restaunax `docs/superpowers/specs/2026-10-27-back-office-next-level/README.md`, `docs/features/back-office/NEEDS_YOU_TODAY.md`, `SETTINGS_SAFETY.md`, `docs/features/HOLIDAY_HOURS.md`). Every file mints its own throwaway owner + restaurant and deletes it afterwards; none touches the shared seed restaurant or the QA sim restaurants. The rules are checked at API level; each dashboard screen gets one light browser check.

### API (`dashboard/owner/api-back-office-next-level.spec.ts`)

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-943** | "Set up your back office" (`GET /api/staff/back-office/:rid/setup`): no add-on → an empty list, not a 403. With SCHEDULING the steps come in the order that works (jobs → assign jobs → pay schedule → publish schedule → payroll mode → approve a period → sales tax rate), jobs is `next`, the steps that need jobs are `blocked` with "Needs your jobs first", each links to its screen (approve → `staffTab=payday`). Adding a job ticks its step and unblocks the others. |
| **TC-944** | Payday header (`GET …/pay-periods/:start/payday`) for a finished period: mode `FILE` (no Gusto), deadline source `PROVIDER` with the resolved sentence. A date that isn't a period start → 400 `NOT_A_PAY_PERIOD` with a plain message.                                                                                                                                                                                                                                        |
| **TC-945** | "Needs you today" (`GET /api/needs-you/restaurant/:rid`): a finished period with hours → one `PAY_PERIOD_APPROVAL` item (TODAY, resolved text, `webPath` = Staff → Timecards on that period, an Owner-app route); `/api/needs-you/mine` carries it; a user who doesn't control the restaurant gets 200 with `canManage:false` and no items (never a 403). Approving the period clears it and Payday reads APPROVED.                                                            |
| **TC-946** | Holiday & special hours (`/api/restaurantId/:rid/special-hours`): create today closed with a note (201); refusals in plain words (same date twice, a past date, open with no times); a stranger → 403; the ordering status says `CLOSED_BY_HOURS` "Closed today: <note>" and the public `/restaurant/:id/details` says closed and lists the date; edit to 10:00–14:00; delete → 200, again → 404.                                                                              |
| **TC-947** | Settings change history (`GET …/settings/changes`): an owner's settings change is one row (area `ordering`, actor OWNER by name, old → new) with a resolved sentence; the `hours` filter leaves it out; the nine areas are listed; a stranger → 403.                                                                                                                                                                                                                           |
| **TC-948** | Morning summary ("Yesterday at your restaurant"): on by default while the business report stays off; `PUT /api/owner-settings/reports/:rid {morningSummaryEnabled}` turns it off and on, nothing else moves; a stranger → 403.                                                                                                                                                                                                                                                 |

### POS (`pos/12-tablet-settings-staff-role.spec.ts`, `@settings-safety`)

| TC         | What it checks                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-949** | `PUT /api/tablet/settings` with a plain STAFF member's `X-Staff-Session` and a device setting (alone, or mixed with `acceptingOrders`) → 403 `STAFF_CAPABILITY_REQUIRED`, `capability: MANAGE_DEVICE_SETTINGS`, "Your role can't change store settings. Ask a manager."; nothing is written. |
| **TC-950** | The same person may pause (`{acceptingOrders:false}`) and resume (`acceptingOrders` + `orderingPausedForDayClose` + `orderingAutoResumeAt`) online ordering; both are in the history as STAFF with their name and the device.                                                                |
| **TC-951** | A manager session may change a device setting (recorded as STAFF by name); an old POS build with no staff session is still accepted and recorded as DEVICE ("… (no one signed in) …").                                                                                                       |

### Dashboard (`dashboard/owner/29-back-office-next-level-ui.spec.ts`)

| TC         | What it checks                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-952** | The restaurant opens on Today: the "Needs you today" card shows the period to approve with the server's title; its button opens Staff → Timecards on that period. |
| **TC-953** | Staff → Time & pay → Payday shows the server's deadline sentence, the period picker and the steps (fix flags, approve, run payroll).                              |
| **TC-954** | The "Set up your back office" card on Staff shows "N of M done" and the server's next step; "Go there" opens that step's screen.                                  |
| **TC-955** | Store Settings → Ordering & hours → Holiday & special hours lists the date ("Closed all day", the note); Remove → confirm → deleted on the server.                |
| **TC-956** | Store Settings → Recent changes shows the owner's change as the server's sentence.                                                                                |
| **TC-957** | Owner Settings → "Yesterday at your restaurant" switch saves off, then on (checked against the API).                                                              |

The Staff regroup itself (People · Schedule · Payday · Tips · Settings since Stage 6, then the group's own tabs) is covered by the rewritten TC-628 → TC-634 and TC-650 (`21-back-office-staff-ui`: the groups and tabs per add-on, deep links, the one-question payroll choice) and TC-664 (`22-ux-audit-staff-ui`: every group and every tab reachable at 1024 and 390 px, page never wider than the screen).

---

## TC-1180 → TC-1186 — Paid add-ons: Menu TVs, Social Media, Voice AI, partner labor, company staff (API)

**Status:** ⏳ Written 2026-10-31; skips on QA (`RELEASED_ON_QA.paywallStage1` false) until the RestauNax Stage 1 paywall fixes (`bo1031/paywall`, back-office audit W5) are deployed there, then fails if they regress. Missing ADMIN (or EMPLOYEE) credentials fail these in CI and skip only locally (`utils/envGate.ts`, W5:T7).

### `dashboard/owner/api-addon-gating.spec.ts` (second block, two throwaway owners)

| TC          | What it checks                                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1180** | Without Menu TVs: claiming a TV, the TV list and layouts answer 403 `FEATURE_NOT_ENTITLED` in words; starting a pairing stays free and the TV waits on its code.                                                        |
| **TC-1181** | With an HQ Menu TVs grant the TV is claimed and shows the menu; taking the grant away pauses it: `/me` 200, empty menu, `paused.reason` ADDON_OFF and a resolved message, heartbeat still 200, unpairing still allowed. |
| **TC-1182** | Social Media: accounts, posts, featured reels, creating a post and AI media quota refuse without the add-on and answer 200 with an HQ grant.                                                                            |
| **TC-1183** | Voice AI: the owner summary needs the add-on; PATCH voice config `enabled: true` is refused without it.                                                                                                                 |
| **TC-1184** | Another owner probing payroll, tips, scheduling, payroll provider, accounting, Menu TVs and social routes gets 404, add-ons on or off — never "you lack the add-on".                                                    |

### `dashboard/owner/api-partner-api.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1185** | Labor is the Timecards package: once the location loses it, `/labor` answers 403 `FEATURE_NOT_ENTITLED`, the owner's scope list drops `labor:read` and a new key with it is refused; granting it back restores `/labor`. (TC-754 now expects `labor:read` missing from a no-add-on location's catalogue.) |

### `dashboard/employee/payroll-read-only.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1186** | Company staff (EMPLOYEE) read jobs, settings and the tip policy; creating a job, changing payroll settings or the tip policy answers 403 `PLATFORM_EMPLOYEE_READ_ONLY` in words; the same job created by an ADMIN goes through. |

---

## TC-1210 → TC-1214 — Compliance rules (API)

**Status:** ⏳ Written 2026-10-31; passes once RestauNax back-office audit Stage 2 (`bo1031/rules`, `GET /api/compliance/:rid/rules`) is on QA.

Throwaway restaurant (Miami, FL). The rules are seeded on every backend start; only government, high-confidence wage rows load CONFIRMED.

### `dashboard/owner/api-compliance-rules.spec.ts`

| TC          | What it checks                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1210** | Every rule comes back with a resolved label, summary and status (never an i18n key), a status of CONFIRMED / DRAFT / MISSING, and https sources.       |
| **TC-1211** | Florida's minimum wage on 2026-11-01 is $15.00, tipped $11.98, CONFIRMED from the state's government source; on 2026-06-01 the earlier $14.00 applies. |
| **TC-1212** | The delivery-fee taxability rule is DRAFT (sales-tax rules wait for the CPA).                                                                          |
| **TC-1213** | Spanish: "Salario mínimo", summary "por hora".                                                                                                         |
| **TC-1214** | No token 401, another owner 403, a malformed date 400 with a resolved message. Fails, never skips, without admin or owner credentials.                 |

---

## TC-1251 → TC-1256 — Sales-tax rules, refund split and POS refusal (API)

**Status:** ⏳ Written 2026-11-01; passes once RestauNax back-office audit Stage 3 tax track (`bo1031/taxrules`) is on QA.

Every sales-tax rule on QA is DRAFT (a suggestion until the CPA confirms) and no restaurant is opted in to POS refusal, so these check that nothing changes until someone confirms, and what a confirmation does. TC-611 was rewritten with them: a never-saved service fee now starts taxable.

### `dashboard/owner/api-service-fee.spec.ts`

| TC          | What it checks                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1251** | `GET /service-charge`: the state's rule with status (DRAFT or MISSING) and source, nothing confirmed, the owner asked; a fee saved untaxed is still charged untaxed. |
| **TC-1252** | A bad answer and a non-sales-tax rule key are refused (400); the owner confirms, the rule reads decided by the owner and the HOUSE fee is taxed on the next order.   |
| **TC-1253** | Under the confirmed rule, saving `taxable: false` still taxes the fee (the server sets it from who keeps it), and the POS settings carry the same flag.              |

### `dashboard/owner/api-sales-tax-reports.spec.ts`

| TC          | What it checks                                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1254** | `GET /delivery-fee`: legacy rules, `needsOwnerAnswer`, a DRAFT or MISSING state rule, and the explanation says nobody has confirmed it.                                                             |
| **TC-1255** | A paid online order (burger + beer + tip); refunding only the beer by its line gives back $0.80 alcohol-rate tax and nothing at the food rate; the books' tax per rate equals the report's net tax. |
| **TC-1256** | `GET/PUT /pos-refusal`: off and not opted in; opting in still leaves it off (no register has sold); a bad value is refused; the admin kill switch is admin-only and validated (never flipped).      |

A sale whose card capture FAILED (audit W4:M6) can't be staged on QA without Stripe's secret key; the backend integration test `salesTax.int` proves the report leaves it out.

---

## TC-1360 → TC-1370 — Paid pay periods lock; the day-close ordering pause is a choice (API + Lima)

**Status:** ⏳ Written 2026-11-01; passes once RestauNax back-office audit Stage 4 (`bo1031/paylock`: W3:H7 paid pay periods, W0:J4-b ordering pause at day close + Resume lifts the night) is on QA.

Every file uses its own throwaway tenant, deleted in `afterAll`, so a PAID period (which can never be reopened) and a closed day never outlive the run. The overnight pause ending at the opening time itself (not at the next 15-minute sweep) is covered by the backend tests only — not practical to wait for on QA.

### `dashboard/owner/api-timecards.spec.ts`

| TC          | What it checks                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1360** | `POST /pay-periods/:start/mark-paid` on the approved, finished P1 → 200 `PAID` with `paidAt`; the pay-periods list says the same.                                                                  |
| **TC-1361** | Marking it paid again is a no-op: the same `paidAt`.                                                                                                                                               |
| **TC-1362** | Reopening a paid period → 403 `PERIOD_PAID` with the resolved sentence (correct the shift instead).                                                                                                |
| **TC-1363** | A correction inside the paid period is allowed (+30 min); P1's payday view stays PAID with `paidAt`; the next period's payday lists it in `adjustmentsIn` (Gus, from P1, 30 min, ≥ $7.50, reason). |

### `dashboard/owner/api-payroll-export.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1364** | Mark-paid on a period that isn't approved (reopened P1) → 400 `PERIOD_NOT_APPROVED`, "This pay period isn't approved."                                                                                                                           |
| **TC-1365** | Exported P2 is still locked for corrections (403 `PERIOD_LOCKED`); marked paid → PAID; a re-export returns the same RestauNax file (no new column, Gusto has no `prior_period_adjustment`) and the period stays PAID.                            |
| **TC-1366** | Ivy's 4 h added to paid P2 ($64.00) is carried by P1 (`adjustmentsIn`, exact cents/minutes/reason); P2's file is unchanged; P1 approved again gets a "Prior-period adjustment" column (Ivy 64.00, Hal 0.00) and Gusto `prior_period_adjustment`. |

### `pos/15-day-close.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1367** | After a default close (TC-1054/1058 now assert `orderingPaused: true`), the owner's `ordering/resume` lifts the night: `closedForNight` false, the storefront accepts orders, and Recent changes has `ordering` / `orderingPausedForDayClose`. |
| **TC-1368** | A close with `pauseOrdering: false` → `orderingPaused: false`; not CLOSED_FOR_NIGHT; the storefront still accepts orders.                                                                                                                      |

### `customer-lima/17-availability.spec.ts`

| TC          | What it checks                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1369** | After Close Day (TC-L80, now asserting `orderingPaused: true`), the owner's Resume brings Proceed to Checkout back and the storefront reports accepting. |
| **TC-1370** | A web close with `pauseOrdering: false` leaves checkout offered and the storefront accepting.                                                            |

## TC-1630 → TC-1637 — Tax math v2: combos taxed per component, tax-included prices (API)

**Status:** ⏳ Written 2026-11-01; passes once RestauNax back-office audit Stage 7 POS tax math (`bo1031/postax`: W4:M2 + H5) is on QA.

`dashboard/owner/api-tax-math-v2.spec.ts` runs on its own throwaway tenant (rates State 8.35% default, Alcohol 10%; Pint $7.00 "price includes tax", Burger $9, tax-free Side $3, Beer $6 at Alcohol, a $12 combo of the last three) and puts the switch back off in `afterAll`. It fails (never skips) without admin credentials. The numbers are the backend's shared server/POS parity fixtures.

| TC          | What it checks                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1630** | `GET /tax-math`: off by default, the register list, the tax-included item count and the disclosure rule; a non-boolean `PUT` → 400; on, then back off.               |
| **TC-1631** | `PUT /menu` round-trips `taxIncluded` on an item; a save without the field (an older client) leaves it unchanged.                                                    |
| **TC-1632** | Switch off: the tax-included pint is taxed on top ($7.00 + $0.58), with no TAX_INCLUDED line.                                                                        |
| **TC-1633** | Switch off: the combo is taxed at the default rate ($1.00 on $12).                                                                                                   |
| **TC-1634** | Switch on: the pint quotes $7.00 flat; no TAX line; breakdown info TAX_INCLUDED $0.54.                                                                               |
| **TC-1635** | Switch on: the combo is taxed per component, $0.50 + $0.40 = $0.90 (Side tax-free).                                                                                  |
| **TC-1636** | POS price preview with the switch on: an older build (no `supportsTaxMathV2`) gets the v1 $0.58; a v2 build gets $0 on top; the register is listed as not on v2 yet. |
| **TC-1637** | `api-sales-tax-reports.spec.ts`: a restaurant that never opted in keeps today's report (food sales $30, tax collected $1.92, nothing unallocated).                   |

---

## TC-1460 → TC-1475 — Staff operations: auto clock-out, disputes of manager edits, termination and final pay, tipped occupation codes (API + UI)

**Status:** ⏳ Written 2026-11-01; passes once RestauNax back-office audit Stage 5 (`bo1031/staffops`: W3:M3 auto clock-out, W3:M7 disputes, W3:M9 termination / final pay / former staff, W3:H6 TTOC + Form 8027 allocation, W4:M8 overtime split in the file) is on QA. The two UI checks also need the Stage 5 dashboard.

Every file uses its own throwaway tenant (Miami), deleted in `afterAll`, so terminations never touch seeded QA staff. The nightly auto clock-out sweep itself (and the POS answer with a real token) is covered by the backend tests only (`autoClockOut.int`) — not practical to wait for on QA.

### `dashboard/owner/api-staff-ops.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1460** | POS clock-in carries `pendingAutoClockOuts: []` and `autoClockOutAnswerToken: null` (nothing swept); `POST /tablet/staff/auto-clock-out/respond` with a bad or missing token → 401 "This question expired. Clock in again to answer it." |
| **TC-1461** | Terminating someone on the clock → 400 "This person is still clocked in. Clock them out first."; no termination recorded (final-pay 404).                                                                                                |
| **TC-1462** | The owner's manual entry shows in the employee's `GET /staff-app/restaurants/:id/shift-edits` (CREATE line, reason, `needsAnswer`, resolved label); `/me` has `shiftEditsToAnswer: 1` and `formerRestaurants: []`.                       |
| **TC-1463** | Answer validation: DISPUTED without a note → 400 `NOTE_REQUIRED`; a bad status → 400 `INVALID_STATUS`; an unknown shift → 404 `NOT_FOUND`; nothing recorded.                                                                             |
| **TC-1464** | The dispute is saved; a second answer → 409 `ALREADY_ANSWERED`; the timecard line has `EMPLOYEE_DISPUTE` + `employeeResponse`; the period can't be approved; `GET /disputes` and Needs you `TIMECARD_DISPUTE` (deep links) carry it.     |
| **TC-1465** | Resolve without a note → 400; unknown shift → 404 "There is no open dispute on this shift."; resolved → gone from disputes and Needs you, the flag cleared, the employee sees the resolution, `shiftEditsToAnswer: 0`.                   |
| **TC-1466** | `GET /tip-occupation-codes`: 101 "Bartenders" (restaurant), restaurant codes first, resolved labels, source + verified date.                                                                                                             |
| **TC-1467** | Job `tipOccupationCode`: "999" → 400 (IRS list sentence); "101" saved and listed; "" clears to null.                                                                                                                                     |
| **TC-1468** | Payroll settings `staffOps` defaults (auto clock-out on, large food establishment off), partial PUT round-trip, restored; `GET /tip-allocation` bad range → 400, `enabled` follows the setting (text only when off).                     |
| **TC-1469** | P1 (8 h, no overtime) approved and exported: the RestauNax file has no federal/state overtime columns; the employee's `year-end/:year` figures ($128.00, 0 FLSA minutes, note); a year out of range → 404.                               |
| **TC-1470** | Terminate validation: missing / unknown reason → 400 "Choose why the employment ended."; a bad or > 60-days-ahead last day → 400; an unknown person → 404.                                                                               |
| **TC-1471** | A quit: FinalPayStatus (deadline QUIT, rule status, sentence); the final-pays list and GET final-pay; Needs you `FINAL_PAY` (payday deep link); off-cycle refused without RestauNax Payroll; mark paid takes it off both.                |
| **TC-1472** | A discharge (basis FIRED): the employee's `/me` lists the restaurant under `formerRestaurants` (year-end, stubs flag, access until); year-end still reads; shift edits → 404.                                                            |

### `dashboard/owner/api-payroll-export.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1473** | Hal's 4 h of federal overtime adds "Federal (FLSA) overtime hours", "State-only overtime hours" and the qualified premium columns before Gross paid (Hal 4.00 / 0.00 / 30.00, Ivy zeros); gross unchanged. TC-599's exact rows now carry them. |

### `dashboard/owner/36-staff-ops-ui.spec.ts`

| TC          | What it checks                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1474** | Payroll settings shows "Clock out forgotten shifts at the end of the business day" (on) and "Large food establishment" (off) switches. |
| **TC-1475** | The Add job dialog offers the "Tipped occupation code" field for a tipped job.                                                         |

## TC-1430 → TC-1438 — Labor-law engines: state overtime, break decisions, labor rules, predictive scheduling (API)

**Status:** ⏳ Written 2026-11-01; gated by `RELEASED_ON_QA.laborEngines` (`utils/releaseGate.ts`, tag `@labor-engines`). They skip with a reason until RestauNax back-office audit Stage 5 (`bo1031/engines`: W3:M1 state overtime, W3:H2 break packs + break decisions, W3:M5 premium pay and predictive scheduling) is on QA (the probe is `GET /api/compliance/:id/labor-rules` → not 404). After that, flip the flag so a regression fails.

All three files use their own Miami tenant. Florida has federal overtime (40 h weekly, a DRAFT state row), no meal- or rest-break law and no fair-workweek rule, so no premium is earned. The cases assert the shapes and the Florida answers, and every amount the older cases assert is unchanged. Earning a premium under a CONFIRMED rule (California, New York, Seattle) and the clock-out `breakPremium` notice are covered by the backend integration test, not on QA.

### `dashboard/owner/api-timecards.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1430** | Timecards carry `laborRules`: date, Florida, `minUnpaidBreakMinutes: 20`, predictive `NO_RULE`. Overtime is FEDERAL / `SAVED` (TC-581 left it FEDERAL). Every rule has a known key, status and `decidedBy`. Optional `premiums` / `breakViolations` / `breakDecision` have the right shape when present. `premiumPayCents` and `premiumOwedCents` are 0. The 13 h day stays $234.00.                                                                                                                    |
| **TC-1431** | `POST /shifts/:id/break-decision` on the p2 shift that missed its meal: an invalid decision → 400 "Choose Pay premium or Employee waived."; WAIVED with no reason or a blank one → 400 "Enter a reason for this change."; the employee's own token → 403. PAY_PREMIUM → 200 with `breakDecision`/`breakDecisionAt` and the resolved message; MISSED_BREAK stays in `flags` but leaves `blockingFlags`. WAIVED with the attested reason → 200, waiver message, reason stored and in the shift's history. |
| **TC-1432** | A restaurant with no saved settings defaults to `overtime.preset: "STATE"` (Florida's stand-in numbers are federal) and `location.recommendedPreset` is FEDERAL. PUT `{preset: "STATE", dailyThresholdHours: 6}` saves STATE with the federal numbers (the number is ignored). `laborRules.overtime.applied` is STATE_RULE or FEDERAL_UNTIL_CONFIRMED and the 13 h day is unchanged. Editing numbers is CUSTOM, then back to STATE.                                                                     |
| **TC-1433** | `GET /api/compliance/:id/labor-rules`: all seven labor rule keys, each with a resolved `label` / `summary` / `statusLabel` (no i18n keys), status, `needsConfirmation` (only on DRAFT), and `sources` with `sourceUrl` and a `jurisdictionLabel`. Florida overtime is present with a source. A staff member's token → 403.                                                                                                                                                                              |
| **TC-1434** | `POST /labor-rules/:ruleKey/confirm`: `bogus` → 400 with the sentence; `minimumWage` (not a labor rule) → 400; the staff token → 403. Confirming `overtime` → 200 and "…: confirmed. Pay follows this rule from now on." Afterwards it is CONFIRMED with no confirmation pending, and under STATE the timecards apply `STATE_RULE`.                                                                                                                                                                     |

### `dashboard/owner/api-free-breaks.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1435** | Free tier (no add-on): the labor rules (a core read) report `minUnpaidBreakMinutes: 20`, the federal floor behind TC-1150 / TC-1151, because Florida's meal-break row says no requirement. A break decision on Rae's shift → 403 `FEATURE_NOT_ENTITLED`, because it is a Timecards action. |

### `dashboard/owner/api-scheduling.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1436** | The schedule week carries `predictiveScheduling`: Miami → `covered: false`, `NO_RULE`, no notice days, no rule value, and `minRestHours` equal to the owner's setting. `settings.predictive` defaults to AUTO / no network. Any NOTICE_PREMIUM warning has the contract's shape, and weeks 1–3 have none.                                                      |
| **TC-1437** | `scheduling.predictive` saves `{COVERED, franchiseNetwork, 12, 300}` exactly. The owner's "covered" can't invent a rule (still `NO_RULE`). Bad values never return 400: an unknown coverage or a non-boolean keeps the saved value, counts clamp to 0..10,000,000 and round, a non-number keeps the saved count, and null clears it. Reset to AUTO afterwards. |
| **TC-1438** | Publishing week 2 (`NONE`) answers with `premiums: []`, and any premium row has the contract's shape. After a change to a published shift there is still no NOTICE_PREMIUM, and the republish owes nothing.                                                                                                                                                    |

Also in this pass: `api-free-breaks` and `api-scheduling` now FAIL (instead of skipping) without `ADMIN_EMAIL` / `ADMIN_PASSWORD` (and, for scheduling, Mailpit), the same as `api-timecards` (W5:T7).

## TC-1099 → TC-1102 — Customers: the numbers add up (API)

**Status:** ⏳ Written 2026-10-31; fails on QA until the restaunax fix (`fix/customer-insights-numbers`) is deployed there.

Throwaway restaurant: two identified online customers (Ana twice, Ben once) and two anonymous cash walk-ins on a register. Definitions: restaunax `docs/user-stories/customer-management-user-story.md` → "How the numbers are counted".

### `dashboard/owner/api-customer-insights.spec.ts`

| TC          | What it checks                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1099** | The customer profile returns the customer's `id`; "Discounts sent" (`/api/coupons/personal-codes/customer/:id`) answers 200 for it.                           |
| **TC-1100** | Analytics summary: 2 customers (the walk-in record is not a third), 3 orders, 2 new + 0 returning = 2; `walkInOrders` 2.                                      |
| **TC-1101** | Monthly trends: per month new + returning = `activeCustomers`, none negative (Ana counts once); the Analytics segments add up to `totalAllTimeCustomers` (2). |
| **TC-1102** | `/segments`: `totalCustomers` 2 (distinct, walk-ins excluded); no group and no `healthyCustomers` (distinct VIP or Loyal) exceeds it.                         |

---

## TC-1098 — Switches toggle only from the switch

**Status:** ⏳ Written 2026-10-31; passes once the RestauNax frontend fix (`fix/switch-click-target`) is on QA.

Dashboard-wide rule set in the theme: a click on a switch's label text, description or row never toggles it. Checked once on a non-persisting switch; every other spec toggles switches with `getByRole("switch")`.

### `dashboard/admin/marketing-automations.spec.ts`

| TC          | What it checks                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1098** | Win-Back edit dialog: clicking the "SMS" label text leaves the SMS switch as it was; clicking the switch flips it once; then Cancel. |

---

## TC-1094 → TC-1097 — HQ: add-on requests (UI)

**Status:** ✅ 4 of 4 passing on QA (2026-10-31).

`docs/COVERAGE_MAP.md` G21. Browser as HQ (admin). The rules and the real attach / scheduled removal on the seed restaurant are `api-addon-billing.spec.ts` (TC-781..787, TC-894..896). A throwaway restaurant can't get a subscription on QA (activation needs its Stripe account to accept Stripe's terms by hand), so this file pins what HQ's screen does with a throwaway owner's requests and never touches the seed.

### `dashboard/admin/addon-requests-ui.spec.ts`

| TC          | What it checks                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1094** | The owner asks for Menu TVs: under Open, the restaurant's card says "Turn on", Menu TVs, "Asked by <name> (<email>) · <when>", with Attach and Mark done.                                                    |
| **TC-1095** | Attach asks first ("Attach Menu TVs for <restaurant>?", "It goes on their subscription now, prorated…"), then "This restaurant has no subscription to add it to."; the request stays open; nothing attached. |
| **TC-1096** | Mark done → "Marked done. The owners have been emailed."; gone from Open; Closed shows Done and "Handled by …"; Menu TVs is not on.                                                                          |
| **TC-1097** | A Payroll request the owner withdraws leaves Open; Closed says "Cancelled by the owner".                                                                                                                     |

---

## TC-1090 → TC-1093 — Table QR orders on the POS

**Status:** ✅ 4 of 4 passing on QA (2026-10-31).

`docs/COVERAGE_MAP.md` G18. The guest's browser path is `table-qr/tableQrOrdering.spec.ts`; this is what the restaurant and the register see afterwards. Per `TABLE_QR_ORDERING.md` a card order is PREPAID like any online order: it carries the table but never opens a check or takes the table. A throwaway restaurant (table service, Stripe TEST) with floor tables T4 and T5, a numbered card "T4" linked to T4, a blank card on T5, and a REGISTER device. Orders are placed with the card's code, as the ordering site does, and paid with a test card.

### `pos/18-table-qr-on-pos.spec.ts`

| TC          | What it checks                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **TC-1090** | An order from T4's card: DINE_IN, TABLE_QR, `tableId` = T4, `tableNumber` "T4", no open check; payment completes. |
| **TC-1091** | The register's order search finds it by the guest's name, marked TABLE_QR, table T4.                              |
| **TC-1092** | T4 isn't taken: the floor shows no check on T4; a server opens a check on T4 and it is the only check there.      |
| **TC-1093** | A blank card on T5 sends its order to T5 (`tableId` T5, `tableNumber` "T5", the table's name).                    |

---

## TC-1086 → TC-1089 — Reward member on the website: earn, then spend

**Status:** ✅ 4 of 4 passing on QA (2026-10-31). Needs RestauNax #1119 on QA (a 555 test phone gets the fixed code 123456 even while QA's real texts are on).

`docs/COVERAGE_MAP.md` G16. Browser on template-wind, the seed restaurant (program: 1 point per $, 100 points = $5 off, 100 to redeem). A fresh member is imported with 90 points and signs in at checkout with 123456. Two real Stripe test-card orders (`utils/windPayment.ts`).

### `customer/13-member-points.spec.ts`

| TC          | What it checks                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1086** | Signed in: "90 points available", "You need 10 more points to redeem", no Redeem button.                                                                                                              |
| **TC-1087** | An order of the seed item(s) is paid; the program's points for it (≥ 10) are on the balance at once (e.g. 102).                                                                                       |
| **TC-1088** | The next order redeems 100 points: "Redemption Applied", $5.00 off; the order records 100 points / $5.                                                                                                |
| **TC-1089** | The balance is the old one less 100 plus what the second order earned. Points are earned on food less coupons, NOT less points or gift cards (documented rule, web and POS), so it earns full points. |

---

## TC-L83 → TC-L86 — Ordering site outside business hours (Template-lima #135)

**Status:** ✅ 4 of 4 passing on QA (2026-10-31), all strict. TC-L86 caught a wording bug, fixed by Template-lima #135.

`docs/COVERAGE_MAP.md` G15 ("Schedule for later"). Browser on template-lima, a throwaway restaurant open 24 h every day, with TODAY closed through Holiday & special hours ("Family day"). A guest adds a burger.

### `customer-lima/18-outside-hours.spec.ts`

| TC         | What it checks                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-L83** | Proceed to Checkout for ASAP → "Restaurant is currently closed. Please schedule your order for later or try again when we're open." (stays on the cart); an ASAP order → "This restaurant is closed today (Family day). Check their hours and order another day." |
| **TC-L84** | Change time: "As soon as possible" disabled, "Restaurant is currently closed", "Today's hours: Closed"; Schedule for later is picked with Tomorrow; Done; checkout opens ("Complete Your Order").                                                                 |
| **TC-L85** | The server refuses an order for 11:45 PM tonight (still the holiday) and takes one for noon tomorrow (201, `scheduledFor` kept).                                                                                                                                  |
| **TC-L86** | The dialog says "We're closed today." and "Restaurant hours for Saturday:" (was "We're closed on friday", "saturday").                                                                                                                                            |

---

## TC-L77 → TC-L82 — Ordering site when the restaurant isn't taking orders (RestauNax #1118)

**Status:** ✅ 6 of 6 passing on QA (2026-10-31), all strict. TC-L80 and TC-L82 caught product bugs, fixed by RestauNax #1118.

`docs/COVERAGE_MAP.md` G15. Browser on template-lima, a throwaway restaurant with its own ordering slug (7% tax, open 24 h, Burger $12). One guest's cart is kept across the file; the owner changes the restaurant's state through the API between tests (as Store status does).

### `customer-lima/17-availability.spec.ts`

| TC         | What it checks                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-L77** | Open: the cart offers Proceed to Checkout.                                                                                                                                                                                                                              |
| **TC-L78** | Paused 30 min: "This restaurant is currently not accepting online orders", "Ordering Unavailable" disabled; an order → "This restaurant has paused online orders. Ordering reopens at h:mm PM."                                                                         |
| **TC-L79** | Resumed: Proceed to Checkout is back.                                                                                                                                                                                                                                   |
| **TC-L80** | After Close Day an order → "This restaurant has closed for the night…", and the cart must say not accepting with checkout off. Before the fix the cart still offered Proceed to Checkout and the guest was refused only at Pay.                                         |
| **TC-L81** | Not published: "This restaurant is not accepting orders at this time. You can browse the menu, but items can't be added to a cart."; the burger is listed but has no Add to Cart.                                                                                       |
| **TC-L82** | A refused guest reads guest words: unpublished → "This restaurant isn't taking online orders yet."; paused until resumed → "This restaurant isn't taking online orders right now. Please try again later." (was "Publish the restaurant…" / "closed or not accepting"). |

---

## TC-1081 → TC-1085 — Staff requests in the dashboard (UI)

**Status:** ✅ 5 of 5 passing on QA (2026-10-31). Needs Mailpit.

`docs/COVERAGE_MAP.md` G13 (the owner's inbox; inviting and publishing are the journey, TC-984..987; the API rules are TC-543..552). Browser, a throwaway restaurant with SCHEDULING; Ana and Bo claim real accounts from their invite emails. From Restaunax Staff (its API) Ana asks for a day off ("wedding"), releases a shift ("exam") that Bo picks up, and Bo asks for Sundays off.

### `dashboard/owner/35-staff-requests-ui.spec.ts`

| TC          | What it checks                                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1081** | "Requests 3", "Waiting (3)": Ana's unpaid day off with "“wedding”" and "Already scheduled for 1 shift:"; the trade "Ana Ruiz → Bo Lee" with "“exam”"; Bo's availability, Sun "Unavailable all day" vs now "Available". |
| **TC-1082** | Approve the day off with a note → "Approved. They have been told.", "Waiting (2)"; Ana's own list says APPROVED with the note; the shift stays and the schedule flags it (TIME_OFF).                                   |
| **TC-1083** | Approve the trade → the shift is Bo's on the schedule.                                                                                                                                                                 |
| **TC-1084** | Deny the Sundays with a reason → "Denied. They have been told."; Bo's availability shows it DENIED with the reason, nothing pending.                                                                                   |
| **TC-1085** | "Nothing is waiting for you.", the tab's red count hidden; Decided shows the three notes.                                                                                                                              |

---

## TC-1074 → TC-1079 — Sales tax and service fee (UI) (RestauNax #1116)

**Status:** ✅ 6 of 6 passing on QA (2026-10-31), all strict. TC-1074 caught a product bug (a second rate added straight after the first silently became the default, moving the whole menu to its rate), fixed by RestauNax #1116.

`docs/COVERAGE_MAP.md` G11. Browser, a per-run throwaway restaurant (published, Stripe TEST) with Food: Burger $10; Drinks: Beer $8, Water $2. The server's rules are TC-619..624 and `api-service-fee`; the first rate and its rename are the journey (TC-982..983).

### `dashboard/owner/34-sales-tax-ui.spec.ts`

| TC          | What it checks                                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1074** | The first rate (6%) then "Alcohol" 9% straight after: "Alcohol (9%) saved.", Recent changes names it, Sales tax stays the default, the default can't be removed. Before the fix Alcohol became the default. |
| **TC-1075** | Drinks → Alcohol (9%) by category; Water → Tax-free by item; Save; after a reload: Drinks "Alcohol (9%)", Food "Default (Sales tax)", Water "Tax-free", Beer "Same as its category" / "Taxed at Alcohol".   |
| **TC-1076** | Editing Alcohol to 10% asks first ("Change Alcohol?"); Cancel keeps 9%.                                                                                                                                     |
| **TC-1077** | Service fee 3% "Kitchen fee": "A $20.00 order pays $0.60.", "Guests see “Kitchen fee”."; Save asks "Start charging a service fee?"; "Service fee saved"; kept after a reload.                               |
| **TC-1078** | An online order (2 burgers, a beer, a water) is priced by those settings: $30.00 food, $0.90 fee, $1.92 tax ($1.20 + $0.72), $32.82.                                                                        |
| **TC-1079** | The sales tax report for yesterday–today: taxable $28.00, non-taxable $2.00, tax collected and net tax $1.92; by rate: Sales tax (6%) $20.00 → $1.20, Alcohol (9%) $8.00 → $0.72.                           |

---

## TC-1066 → TC-1073 — POS auto-gratuity

**Status:** ✅ 8 of 8 passing on QA (2026-10-31).

`docs/COVERAGE_MAP.md` G7, the floor half (the owner's settings and the server's guards are TC-958..964). No browser: the POS is played through its API. A per-run throwaway restaurant (table service, 7% tax): parties of 6+ get 18%, not taxed, kept by the house. The owner holds the drawer and is the manager; Dee is a Staff-role server. Six $12 burgers: $72 + $5.04 tax + $12.96 gratuity = $90.00.

### `pos/17-auto-gratuity.spec.ts`

| TC          | What it checks                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1066** | A party of 6 gets the 18% on its own ($90.00); a party of 4 doesn't ($51.36).                                                                                                       |
| **TC-1067** | A party of 0 → "Guest count must be a whole number from 1 to N."; the party of 4 becomes 6 and $8.64 is added ($60.00).                                                             |
| **TC-1068** | Dee removing it → "A manager PIN is required."; with the owner's PIN it comes off ($77.04) and stays off when a 7th guest sits; Dee adds it back by hand with no approval ($90.00). |
| **TC-1069** | The owner lets servers remove it (`staffCanWaive`): Dee removes it with no PIN.                                                                                                     |
| **TC-1070** | Half paid in cash, then removing it → 409 "A payment has already been taken on this check, so its gratuity can no longer change."; the rest is paid, the check closes.              |
| **TC-1071** | With the rule off, adding it by hand → "Auto-gratuity is not turned on for this restaurant. Set it up in the dashboard first."                                                      |
| **TC-1072** | The day close preview: auto gratuity $12.96 on its own line, tips $0, 2 orders; gross $120.00 (food only, W2:E2), $141.36 total collected.                                          |
| **TC-1073** | With Tip Management, "paid to staff — the server on the check": Dee's 6-top → her tips report shows $12.96 as service charges (wages), $0 in tips, tip totals $0.                   |

---

## TC-1059 → TC-1065 — POS gift cards

**Status:** ✅ 7 of 7 passing on QA (2026-10-31).

`docs/COVERAGE_MAP.md` G12. No browser: the POS is played through its API, as device-in-store's gift card sheets call it. A per-run throwaway restaurant (7% tax, table service, Stripe TEST, gift cards on with cash and physical activation, a REGISTER device) and a minted batch of two printed cards. Every sale is cash, so the drawer can be checked (a card-tender sale needs a reader). The owner holds the drawer; Dee is a Staff-role server.

### `pos/16-gift-cards.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1059** | A $25 card sold for cash, printed: the full code comes back once (the receipt shows only the last four), the card holds $25, the owner owes $25 on 1 card.                                                                                                             |
| **TC-1060** | Refused in words, nothing sold: no tender ("Choose card or cash for this load."), an emailed card with no email ("Enter the customer's email, or sell the card as a printed receipt."), an amount not allowed ("That amount is outside what this restaurant allows."). |
| **TC-1061** | A printed stock card: the scan says INACTIVE, $0, activatable, and never repeats the full code; $40 cash activates it; the same tap again (same key) loads nothing more.                                                                                               |
| **TC-1062** | A mistaken $30 sale: the drawer's list shows ACTIVATED 40, SOLD 25, SOLD 30; Dee → "A manager PIN is required."; the owner voids it (card INACTIVE, $0); a second void → "That load was already voided."                                                               |
| **TC-1063** | A guest spends $12.84 of the $25 card online: the order is paid with nothing to charge; the card drops to $12.16.                                                                                                                                                      |
| **TC-1064** | The $40 card pays a $12.84 check at the register (closed, $27.16 left); its load can no longer be voided ("Some of that balance has already been spent…").                                                                                                             |
| **TC-1065** | The drawer counts out to the cent: $100 float + $95 gift card cash − $30 handed back = $165; the owner owes $39.32 on 2 cards; the unsold stock card holds $0.                                                                                                         |

---

## TC-1051 → TC-1058 — POS day close and day open (RestauNax #1114)

**Status:** ✅ 8 of 8 passing on QA (2026-10-31), all strict. TC-1057 caught a wording bug (Open Day refused a server with "You are not authorized to close the day."), fixed by RestauNax #1114.

`docs/COVERAGE_MAP.md` G9, the POS half (the web half is the journey, TC-996..1000). No browser: the POS is played through its API, as device-in-store's Close Day / Open Day wizards call it. A per-run throwaway restaurant (7% tax, Stripe TEST, a REGISTER device): a close pauses ordering, so never a shared one. The owner holds the drawer; Dee is a Staff-role server on the clock.

### `pos/15-day-close.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1051** | Dee (Staff) can't preview or close the day: "You are not authorized to close the day."                                                                                                                                                                                                                                                             |
| **TC-1052** | A $12.84 cash burger and a $12.84 keyed card burger (held for a tip); the preview lists the open drawer, Dee on the clock and the held card (4242), and the day: 2 orders, $24.00 gross (item sales, W2:E2), $25.68 collected, $1.68 tax.                                                                                                          |
| **TC-1053** | The close is refused in words: a negative deposit, the drawer still open ("Close every register drawer first…"), Dee still on the clock ("Clock out everyone still on shift first…"); the drawer counts out even ($112.84); a refused close takes no card (still `requires_capture`); the sweep clocks Dee out ("Clocked out 1 staff member(s)."). |
| **TC-1054** | "Day closed.": the record has the day's figures, the $12.84 deposit, and the held card charged (Stripe `succeeded`); a second close → 409 "Today's business day has already been closed." with `canReclose: true`.                                                                                                                                 |
| **TC-1055** | Closed for the night: a new POS ticket → "The business day is closed. Reopen the day before ringing new orders."; an online guest → "This restaurant has closed for the night. Online ordering opens again in the morning."; the owner's ordering status says CLOSED_FOR_NIGHT.                                                                    |
| **TC-1056** | The morning: the Open Day preview shows last night ($12.84 deposit, even drawer, note "Bag 1") and ordering paused; the owner opens with a $100 float ("Day opened."); ordering is back and the POS rings a ticket.                                                                                                                                |
| **TC-1057** | A second open → 409 "Today has already been opened."; Dee opening → "You are not allowed to open the day. Ask a shift lead or a manager." (it said she may not _close_ it).                                                                                                                                                                        |
| **TC-1058** | The store reopened: a plain second close → 409; with `reclose` → the whole day: 3 orders, $36.00 gross ($38.52 collected), two drawers ($200 floats, $225.68 counted, even), $25.68 deposited.                                                                                                                                                     |

---

## TC-1043 → TC-1050 — POS money paths (RestauNax #1112)

**Status:** ✅ 8 of 8 passing on QA (2026-10-30), all strict. TC-1049 caught a product bug (a guest charged for a cancelled counter card sale), fixed by RestauNax #1112.

`docs/COVERAGE_MAP.md` G8. No browser: the POS is played through its API, as device-in-store calls it. A per-run throwaway restaurant (table service, 7% tax, Stripe TEST, a REGISTER device); the owner holds the drawer, Dee is a Staff-role server. Cards are **keyed** (Stripe's publishable key makes the PaymentMethod from a test token, the server confirms it): the only card path without a reader. A reader-held card's tip-after-close success path needs hardware.

### `pos/14-money-paths.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1043** | A keyed card pays a $17.12 counter sale (held, paid); `tok_chargeDeclined` → 402 "The card was declined…"; no card → "Enter the card details to key in a card payment."                                                                                                                                |
| **TC-1044** | A tip after the card was taken, on a keyed card: "This card won't accept more than the amount already approved, so a tip can't be added to it."; a negative tip: "Enter a tip amount of zero or more."                                                                                                 |
| **TC-1045** | Pay link for an open check: no contact → "Enter the customer's phone number or email address…"; by email → the link ($16.05); the guest pays it from the phone with a $2 tip; the check closes.                                                                                                        |
| **TC-1046** | Split by item: the soda moves to its own $3.21 check, $17.12 stays; each is paid apart in cash; with a payment on it the check can't be split ("A payment has already been taken on this check, so it can't be split.").                                                                               |
| **TC-1047** | Adding fries to a keyed-card order leaves $4.28 due (a keyed hold has no room above what it approved); a keyed balance intent pays it; the order is $17.12, nothing due.                                                                                                                               |
| **TC-1048** | Taking the fries off a paid order: Dee (Staff) → "A manager PIN is required."; the owner's change → the order is $12.84 and nothing is owed back by hand.                                                                                                                                              |
| **TC-1049** | Cancelling a held counter card sale (fixed by #1112): the preview says "$12.84 released on the card", the cancel releases the hold (PaymentIntent `canceled`, so Day Close can't charge it) and the order closes REFUNDED. Before the fix the hold stayed `requires_capture` and Day Close charged it. |
| **TC-1050** | A cash order made smaller owes cash back; Dee isn't the drawer's holder ("This drawer belongs to another cashier."); the owner records it and nothing is owed.                                                                                                                                         |

---

## TC-1040 → TC-1042 — Partial refund from the dashboard (RestauNax #1109)

**Status:** ✅ 3 of 3 passing on QA (2026-10-30). RestauNax #1109 added the dashboard's Refund button and the server's "never more than is left" guard.

A per-run throwaway restaurant (7% tax, Stripe TEST) with one paid online order: $16.00 food + $1.12 tax + $3.00 tip = $20.12 on a test card. The owner works in the browser.

### `dashboard/owner/33-partial-refund-ui.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1040** | Orders → View Details → Refund: "Give back everything that's left: $20.12"; Partial Refund with "Maximum refundable: $20.12"; 0 and 25 are refused inside the dialog; $4.28 with a reason → "Refunded $4.28." seen; the order stays live (Refund and Cancel Order still offered). |
| **TC-1041** | The refund route refuses more than is left, in words: "Only $15.84 is left to refund on this order."                                                                                                                                                                              |
| **TC-1042** | Refund again: "Already refunded: $4.28", everything left is $15.84 → "Refunded $15.84."; no Refund button any more; a further refund answers "Only completed payments can be refunded".                                                                                           |

---

## TC-1034 → TC-1039 — Journey part 7: one closed day reads the same everywhere

**Status:** ✅ 6 of 6 passing on QA (2026-10-30).

The last part of "a week in a restaurant" (`docs/COVERAGE_MAP.md` §3, phase 8). One throwaway restaurant at about 16:00 local, 7% tax: an online order with a $3.00 card tip ($20.12), a counter cash sale ($17.12), table T1 in cash with a $5.00 tip ($30.68), then **$4.28 refunded** on the online order. The drawer is counted and the owner closes the day; every place that reports it is compared. The refund goes through `POST /api/order/statistics/refund/:id`, the route the Owner app and the POS use: **the dashboard has no partial refund** — its "Process Refund" dialog has had no button since 2025-12-17 (cancel & refund only), though the platform inventory and the service agreement draft promise partial refunds from the platform.

### `dashboard/journey/07-numbers-agree.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1034** | The day close (sales definitions 2, W2:E2): 3 orders, $56.00 gross, $51.96 net (the refund's $4.04 of sales out), $67.92 collected, $3.92 tax, $8.00 tips, 1 refund $4.28; cash 2 / $47.80, card 1 / $20.12; float $100, expected = counted $147.80, deposit $47.80. |
| **TC-1035** | The owner's Daily Report on the closed day: "Day closed by … · Deposit $47.80 · "Journey day 7""; Net sales $56.00, Tax $3.92, Tips $8.00, Gross $67.92, Refunds (1) $4.28; Cash 2 $47.80, Card 1 $20.12; no raw text.                                               |
| **TC-1036** | Sales tax report: 3 orders, $56.00 taxable, $3.92 collected, $0.24 given back with the refund ($4.28 × $1.12 / $20.12), $3.68 net — the one rate the same; collected = the close's tax.                                                                              |
| **TC-1037** | Sales-by-day CSV: the day, 3 orders, $56.00 net = the close.                                                                                                                                                                                                         |
| **TC-1038** | The books entry: balanced, 3 orders; sales = $56.00, tax = $3.68 net (RestauNax #1104), tips = $8.00, refunds $4.04 (the $4.28 less its tax), cash $47.80, card $20.12 − $4.28.                                                                                      |
| **TC-1039** | The partner API's day: CLOSED, version 1, 3 orders, net sales, tax = the entry's net tax, tips 800, refunds 404, tenders CASH 4780 / CARD 1584 (cents), and the same journal lines as the books entry.                                                               |

---

## TC-1028 → TC-1033 — Journey part 6: the books, on the partner restaurants (`@partner`, RestauNax #1104)

**Status:** ✅ 7 of 7 passing on QA (2026-10-30). TC-1030b guards RestauNax #1104 (on QA 2026-10-30; my 2 store's refund days re-posted to QuickBooks with the net tax).

The sixth part of "a week in a restaurant" (`docs/COVERAGE_MAP.md` §3, phase 7, Track B). **Read-only** on the QA restaurants a person connected to the partners' test systems (`restaunax/docs/features/QA_PARTNER_CONNECTIONS.md`), whose days the QA simulator runs: my 2 store (QuickBooks sandbox + Avalara), New Restaurant (Xero demo), Sally's Pizza (nothing, the control). It never connects, posts, sends or changes a setting; it reads with the admin login. A restaurant that is missing or disconnected skips its tests, and days are checked from two days back, so a partner sandbox reset or a day not yet posted never fails the run. Tagged `@partner`; runs nightly like `@books-live`.

### `dashboard/journey/06-the-books.spec.ts`

| TC           | What it checks                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1028**  | my 2 store, Books & taxes → Overview: "Posted through <day> to Sandbox Company US 9add.", "Deposits matched through <day>.", "Days are in Avalara (RestauNax) through <last sent day>.", "RestauNax Payroll is running."; no failed / refused / disconnected text; no raw text. |
| **TC-1029**  | my 2 store: the last three closed days are POSTED to QuickBooks with an id there, numbered `RNX-yymmdd-<restaurant id start>`, one balanced entry (debits = credits, nothing left over), lines in words.                                                                        |
| **TC-1030**  | my 2 store: on days without refunds, Avalara's tax for the day = the entry's sales tax lines, for the same number of orders; Avalara's health is OK.                                                                                                                            |
| **TC-1030b** | **Fixed by #1104:** on a day with refunds too — the entry kept the refunded tax as owed (Oct 26: $19.13 vs $17.59; Oct 27: $11.42 vs $11.07). Skips if no recent day had a refund.                                                                                              |
| **TC-1031**  | my 2 store: each posted card deposit's entry balances and its bank line is the payout; Card deposits lists the latest by bank date and amount, "Posted".                                                                                                                        |
| **TC-1032**  | New Restaurant: Overview says "Posted through <day> to Demo Company (US)."; the last three closed days are POSTED to Xero, balanced.                                                                                                                                            |
| **TC-1033**  | Sally's Pizza (nothing connected): no day FAILED; Overview says "Set it up once" and "Tell us where you keep your books.", no error text; Books offers Connect QuickBooks Online and Connect Xero.                                                                              |

---

## TC-1022 → TC-1027 — Journey part 5: the owner takes the week to payroll (RestauNax #1103)

**Status:** ✅ 7 of 7 passing on QA (2026-10-29), TC-1027 with Mailpit only. TC-1025b guards the wording RestauNax #1103 fixed (on QA 2026-10-29).

The fifth part of "a week in a restaurant" (`docs/COVERAGE_MAP.md` §3, phase 6). One throwaway restaurant on the payroll-file setup, weekly periods from a Sunday. Last week, approved: Dee (Server, her own $13.00) 40 h = $520.00, Ben (Busser, $11.00) 2 h = $22.00. With Mailpit, Dee accepted her invite and has an account.

### `dashboard/journey/05-payroll-out.spec.ts`

| TC           | What it checks                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1022**  | Payday on the approved week: the deadline says the provider sets it; Fix flagged shifts "Nothing flagged", Approve the hours "Approved", Run payroll "Download the file for your payroll provider"; no raw text.                           |
| **TC-1023**  | Export for payroll: the file comes from the approval; RestauNax CSV is the format; "Check these before you upload:" names Dee and Ben as having no payroll ID, with "Add it in People → Edit." (seen on top).                              |
| **TC-1024**  | People → Actions for Dee → Edit → Payroll ID EMP-101 → "Saved changes for Dee Pay." seen; the export then warns about Ben only.                                                                                                            |
| **TC-1025**  | Download: `payroll-restaunax-<start>-to-<end>.csv`; Dee EMP-101, Server, $13.00, 40.00 h, $520.00 wages and gross; Ben Busser, $11.00, 2.00 h, $22.00; "Payroll file downloaded. The period is marked exported." seen.                     |
| **TC-1025b** | **Fixed by #1103:** after the download Payday says "Approved, and the payroll file is downloaded. Upload it to your payroll provider if you haven't yet." and Run payroll "File downloaded" (it said "approved and payroll run" / "Done"). |
| **TC-1026**  | The Gusto file: Dee EMP-101, Server, 40.00 regular, 0.00 overtime; Ben Busser 2.00; the RestauNax file downloaded again is the same file, byte for byte.                                                                                   |
| **TC-1027**  | Dee's Restaunax Staff: the week is approved and exported, 2,400 regular minutes, no overtime, $520.00 (Mailpit only).                                                                                                                      |

---

## TC-1008 → TC-1013 — Journey part 4: the owner shares the tips (RestauNax #1101)

**Status:** ✅ 6 of 6 passing on QA (2026-10-29). TC-1011 and TC-1012 also guard RestauNax #1101 (on QA 2026-10-29): the tip-outs list biggest amount first, the person picker is labelled "Staff member" and lists people by name.

The fourth part of "a week in a restaurant" (`docs/COVERAGE_MAP.md` §3, phase 5). One throwaway restaurant at about 16:00 local, no tax, Pay at the table on. Today: Dee (Server) 6 h, Ana (Server) 4 h, Ben (Busser) 5 h, Cy (Busser) 3 h. Dee's table pays at the register with a $30 cash tip; Ana's guest pays from the phone with a $20 tip on a test card, so the card tip sits on Ana's own check.

### `dashboard/journey/04-tips.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1008** | No rules yet: $50.00 collected, $50.00 to staff, $0.00 card fees; Dee paid $30.00, Ana $20.00.                                                                                                                                                                       |
| **TC-1009** | Tip policy by hand: Add a rule → Server gives 20% of their tips to Busser, split by hours (the order line says "20% of tips"); card fee out of card tips at a fixed 3%; the unsaved bar is seen; "Tip policy saved" seen; all still set after a reload; no raw text. |
| **TC-1010** | Tips: $50.00 collected, $49.40 to staff, $0.60 card fees (3% of the $20.00 card tip, wherever it went); Dee gave $6.00 → $24.00; Ana gave $4.00, fee $0.48 → $15.52; Ben +$6.25, fee $0.08 → $6.17; Cy +$3.75, fee $0.04 → $3.71.                                    |
| **TC-1011** | Where the tip-outs went: "Server → Busser: $10.00", from Dee $6.00 and Ana $4.00, to Ben $6.25 and Cy $3.75.                                                                                                                                                         |
| **TC-1012** | Enter cash tips: an empty Save says "Choose a person and enter an amount of $0 or more." in the dialog; Ben's $12.00 shows as declared, his Paid stays $6.17 and the staff total $49.40.                                                                             |
| **TC-1013** | Download CSV: the file's header starts with Name; each person's tips, tip-outs, fee, net and declared cash match the tab; net + fees = $50.00 to the cent.                                                                                                           |

## TC-1014 → TC-1021 — Print Shop: Request a quote, and stands that come with the cards (RestauNax #1075, #1097, #1100, #1102)

**Status:** ✅ 7 passing on QA (2026-10-29); TC-1016 reads Mailpit, so it runs only where `MAILPIT_BASE_URL` is set (CI). TC-1020 is strict (`RELEASED_ON_QA.cartRemoveStands`, RestauNax #1102): before #1102, removing the cards left their stands in the cart.

One throwaway restaurant (always fresh, so its cart is its own) with the Print Shop granted and an ordering slug, because table cards print the ordering link. Nothing is charged: the Print Shop charges at fulfilment, and the orders placed in TC-1021 are cancelled.

### `dashboard/owner/21-supply-shop-quotes-and-stands.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1014** | The catalog lists an unlaunched product (Flyer) as `QUOTE` with no price, tiers or add-ons. Table QR cards list a **required** Clear card stands add-on for `cards-with-stand`, priced (no vendor cost) even though stands are not launched. The optional stands for replacement cards appear only once HQ launches them. |
| **TC-1015** | Flyer's "Request a quote" sits wholly inside its card at desktop and 390 px (RestauNax #1097). One click → "Requested", disabled, with "We've asked our team for a price"; still "Requested" after a reload. HQ has exactly one open request from this restaurant; a second ask returns `created: false`.                 |
| **TC-1016** | `@email` HQ's alert "Quote request: <restaurant> — Flyer" arrives and carries the restaurant id.                                                                                                                                                                                                                          |
| **TC-1017** | In the Table QR cards builder, "Same card on every table" × 3 + "Card in a clear stand": the tile says "Comes with a clear stand for each card" and prices "each with its stand"; the notice says "We'll add 3 clear stands to your cart with your cards."; "Need stands for these?" is never asked.                      |
| **TC-1018** | Add to cart → View cart: "Clear card stands · needed to hold your table cards", Quantity 3, "Removed with your table cards" and no Remove; the cards have Remove; "Shipping (arrives in 1 package)". The API agrees: stands linked to the cards and required.                                                             |
| **TC-1019** | The stands alone can't change quantity or be removed (409 `ADD_ON_REQUIRED`); a client can't send the required stands itself (400 `ADD_ON_NOT_ALLOWED`); the old one-line order endpoint refuses the format (409 `USE_CART_FOR_FORMAT`); the cart is unchanged.                                                           |
| **TC-1020** | Removing the cards in the cart removes the stands too; the cart reads empty (RestauNax #1102).                                                                                                                                                                                                                            |
| **TC-1021** | Checkout places cards and stands together (stands linked and required); HQ's queue has both lines; the owner can't cancel the stands alone (409 `ADD_ON_REQUIRED`); cancelling the cards cancels both.                                                                                                                    |

---

## TC-1001 → TC-1007 — Journey part 3: the owner reviews and approves last week (RestauNax #1099)

**Status:** ✅ 8 of 8 passing on QA (2026-10-29). TC-1002b and TC-1007 guard the bugs RestauNax #1099 fixed (on QA 2026-10-29).

The third part of "a week in a restaurant" (`docs/COVERAGE_MAP.md` §3, phase 4). One throwaway restaurant (Eastern Time) with weekly pay periods from a Sunday and a meal-break rule (30 min unpaid after 5 h, waivable). Last week was entered from the paper sheet: Dee (Server, her own $13.00) works Mon/Thu/Fri/Sat 11:00–19:00 with the break, Tue with no break, and Wed 11:00 – Thu 03:00 (she forgot to clock out). Ben (Busser, $11.00) works Fri 18:00–22:00.

### `dashboard/journey/03-review-the-week.spec.ts`

| TC           | What it checks                                                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1001**  | Today's Needs you today says "2 timecards need fixing … Fix them to approve <week>. Payroll uses these hours."; Fix timecards opens Timecards on that period with Needs review only on; "2 shifts need review before you can approve this period." seen; Approve disabled. |
| **TC-1002**  | Before the fixes Dee is 40:00 regular + 14:00 overtime, $793.00, "2 to review"; Tuesday says Missed break, Wednesday Missed break and Long shift; no raw text.                                                                                                             |
| **TC-1002b** | **Fixed by #1099:** shifts a manager typed in don't say "Edited"; Wednesday's clock-out reads "3:00 AM (Thu)"; Correct as is suggests "e.g. Took the meal break off the clock".                                                                                            |
| **TC-1003**  | Wednesday's Edit times: the times are said to be in the restaurant's zone; Save with no reason says "Enter a reason for this change." in the dialog; with a reason, out at 15:30: "Timecard updated." seen, Dee 40:00 + 2:30, $568.75, "1 shift needs review".             |
| **TC-1004**  | Tuesday, Correct as is with a reason: "Timecard updated." seen, "Nothing needs review in this pay period.", Ready to approve, Approve enabled.                                                                                                                             |
| **TC-1005**  | Total 44:00 + 2:30, $612.75 (Ben 4:00, $44.00); Approve: "Pay period approved. Its timecards are now locked." seen, the locked notice shows, still Approved after a reload with Reopen period offered.                                                                     |
| **TC-1006**  | Reopen with no reason says "Enter a reason for this change." in the dialog; Cancel; the period is still approved and locked.                                                                                                                                               |
| **TC-1007**  | **Fixed by #1099:** the owner types the week into Labor; by person Dee 40.00 / 2.50 / $568.75, Ben 4.00 / $44.00, total $612.75; by job Server and Busser the same (it showed "Pick a valid date range of up to a year." for that week).                                   |

---

## TC-990 → TC-1000 — Journey part 2: a service day, closed by the owner

**Status:** ✅ 11 of 11 passing on QA (2026-10-29).

The second part of "a week in a restaurant" (`docs/COVERAGE_MAP.md` §3, phase 3). One throwaway restaurant at about 16:00 local, open 10:00–23:00, 7% tax, table service, a Stripe TEST account and a REGISTER device. The owner holds the drawer; Dee (a Server) rings the orders. The register is played through the POS API the way device-in-store calls it; the owner reads and closes the day **in the browser**.

### `dashboard/journey/02-service-day.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-990**  | Dee clocks in on the POS as a Server (the time clock shows her shift); the owner opens the drawer with a $100 float.                                                                                                                                  |
| **TC-991**  | Counter sale, burger + fries: the price preview says $16.00 + 7% = $1.12; the order is $17.12, daily Order #1. Dee taking the cash into the owner's drawer is refused ("This drawer belongs to another cashier."); the owner takes $20 and it's paid. |
| **TC-992**  | Table T1, 2 burgers + 2 beers $38.52: the guests pay $19.26 each in cash (change $0.74 on a $20), the second with a $5 tip; the check closes with nothing left.                                                                                       |
| **TC-993**  | A guest orders a burger online with a $4 tip on a Stripe test card: $16.84, paid.                                                                                                                                                                     |
| **TC-994**  | Table T2 ($10.70) stays open; Dee starts a meal break (the time clock shows it) and ends it, still on the clock.                                                                                                                                      |
| **TC-995**  | Daily Report, not yet closed: net $74.00, tax $5.18, tips $9.00, gross $88.18, 4 orders, Uncollected (1) $10.70; Cash 3 payments $60.64, Card 1 $16.84; one register still open; by employee Dee 3 / $71.34, online 1 / $16.84; no raw text.          |
| **TC-996**  | Close Day: the checklist shows the open drawer (seen on top), T2's $10.70 under Dee S., the online order nobody accepted (a warning), Dee still clocked in; Next is disabled; no raw text.                                                            |
| **TC-997**  | On the POS T2 is paid and the drawer is counted blind: expected $171.34, counted $171.34, over/short $0.00. The wizard then says "Nothing outstanding"; Clock out selected clocks Dee out (the time clock agrees) and Next turns on.                  |
| **TC-998**  | The summary: 4 orders, gross $88.18, net $74.00, tax $5.18, tips $9.00, 0 / 0 / 0, cash $71.34, card $16.84, floats $100.00, expected and counted $171.34, over/short $0.00.                                                                          |
| **TC-999**  | Confirm: deposit suggested $71.34; -5 says "Enter a valid deposit amount (0 or more)." inside the dialog; Close Day shows "Day closed by … · Deposit $71.34 · "Journey day 2"" on top, still there after a reload.                                    |
| **TC-1000** | Store status: "Closed for the night · reopens <day> 10:00 AM"; a guest's online order is refused with "This restaurant has closed for the night. Online ordering opens again in the morning."; Orders lists #1000–#1003 with Order #1–#4 beside them. |

---

## TC-978 → TC-989 — Journey part 1: open, hire, schedule (RestauNax #1094, #1096)

**Status:** ✅ 13 of 13 passing on QA (2026-10-29), including the Mailpit steps TC-985/TC-987. TC-980, TC-983 and TC-986b guard bugs RestauNax #1094 fixed; TC-989 guards the header overlap RestauNax #1096 fixed (both on QA 2026-10-29).

The first part of "a week in a restaurant" (`docs/COVERAGE_MAP.md` §3, phases 0–2). One throwaway restaurant with PAYROLL + SCHEDULING + TIP_MANAGEMENT; the owner follows the "Set up your back office" checklist in the browser, the way a new owner does. Every message is checked **on screen and on top** (`utils/humanQa.ts`).

### `dashboard/journey/01-open-hire-schedule.spec.ts`

| TC          | What it checks                                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-978**  | The checklist starts "0 of N done", the steps that need jobs say "Needs your jobs first", no raw keys; Go there opens Jobs & wages ("No jobs yet").                                                                                                                                                          |
| **TC-979**  | Add a job: an empty Save says "Enter a job name." and a rate of -5 says "Enter an hourly rate like 15 or 15.50.", both inside the dialog; Server $12.00 and Busser $11.00 (tipped) are listed; "… saved." seen.                                                                                              |
| **TC-980**  | Fixed by #1094: the checklist ticks the jobs step without a reload (it kept saying "0 of 8 done").                                                                                                                                                                                                           |
| **TC-981**  | Pay schedule → Every week from a Sunday: unsaved-changes bar, "Payroll settings saved." seen, still weekly with the same date after a reload.                                                                                                                                                                |
| **TC-982**  | Sales tax: the first rate is offered as "Sales tax", Save waits for a percent; 7% becomes the Default row; after a reload Recent changes says "… added sales tax rate Sales tax (7%)".                                                                                                                       |
| **TC-983**  | Fixed by #1094: renaming the rate shows "State sales tax (7%) saved." and Recent changes shows it without a reload (no message at all before).                                                                                                                                                               |
| **TC-984**  | Invite Dee as a Server: Send invite disabled until the form is filled; "Invite sent to …" seen on top while the "Jobs & pay" window opens; Server checked + primary, rate placeholder $12.00, her own $13.00 saved; she's on People after a reload.                                                          |
| **TC-985**  | Dee's invite email arrives (Mailpit); in her own browser the link says "You've Been Invited!", Step 2 waits for the PIN, a mismatched PIN says "PINs don't match.", 1234 is refused as too easy, her PIN is set; Create Account opens sign-up with her email filled in; she signs up and her password works. |
| **TC-986**  | Next week: Dee's Monday 11:00–19:00 with a 30-min unpaid break → "7.50 h · $97.50" (her $13.00, not the job's $12.00), "Not published"; Publish says "1 change will be published.", "Published 1 change." seen; after a reload it's published and "Last published …" shows.                                  |
| **TC-986b** | Fixed by #1094: an empty week's Publish hint says "No shifts this week yet. Add a shift, then publish." (it said every shift was already published).                                                                                                                                                         |
| **TC-987**  | Dee sees the published shift (job Server) in Restaunax Staff (Mailpit only).                                                                                                                                                                                                                                 |
| **TC-988**  | After a reload "N of M done" = the server's checklist, and jobs, assign jobs, pay schedule, publish schedule and sales tax are ticked.                                                                                                                                                                       |
| **TC-989**  | **Fixed by #1096:** with a long restaurant name, the header's page title ends before the name block on the right (it ran underneath).                                                                                                                                                                        |

---

## TC-958 → TC-971 — Catch-up for QA 2026-10-28 (RestauNax #1078, #1088, #1090)

**Status:** ✅ Passing on QA (2026-10-28). TC-971 is a **known product bug**, marked `test.fail()` (see below).

Checked the way a human QA tester checks it (`utils/humanQa.ts`): a message must be **on screen and on top** of everything (the topmost element at its centre is the message itself — RestauNax #1090's Send-again message passed `toBeVisible()` while hidden behind the open dialog), the text must be words (no raw i18n key, raw timestamp, `undefined`/`NaN`), each screen is also checked at phone width (390px, nothing overflows), and busy states, Cancel/Escape/Discard and reload-persistence are exercised.

### Service charges paid to staff — API (`dashboard/owner/api-service-charges-to-staff.spec.ts`)

| TC         | What it checks                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-958** | Without Tip Management or Payroll a NEW "paid to staff" is refused for the service fee and the auto-gratuity (400 `STAFF_SHARE_NOT_ENTITLED`, a readable message); nothing is saved; re-saving what is stored still works. |
| **TC-959** | A NEW auto-gratuity above 25% is refused (400 `GRATUITY_PERCENT_TOO_HIGH`, readable); 25% is accepted.                                                                                                                     |
| **TC-960** | With Tip Management, STAFF + "the server on the check" (service fee) and STAFF + "share it like tips" (gratuity) save and read back; HOUSE clears it.                                                                      |

### Fees at checkout — dashboard (`dashboard/owner/30-service-charges-ui.spec.ts`)

| TC         | What it checks                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-961** | Without the add-on "Paid to staff (as wages)" is truly absent (no radio); "The restaurant keeps it." and "add Tip Management" are seen; phone width readable, no overflow.                                                                                                            |
| **TC-962** | With Tip Management: Paid to staff → "Who gets it" opens on "Share it like tips"; pick "The server on the check"; a double click on Save sends ONE request; "Service fee saved" is seen on top; after a reload both choices are still picked and the server agrees.                   |
| **TC-963** | Auto-gratuity %: the checkout's suggested tip percentages + Other; Other 30 → "Enter a percent from 1 to 25." seen, Save disabled; Other 25 → "Add 25% to large parties?" ($200.00 → $50.00); Cancel saves nothing; "Use 25%" saves, "Auto-gratuity saved" seen, kept after a reload. |
| **TC-964** | Phone width with the add-on: the choices, Save and "Discard changes" are reachable; Discard puts the choice back and sends nothing.                                                                                                                                                   |

### Card deposits — dashboard (`dashboard/owner/31-books-deposits-ui.spec.ts`, `@books-live`, "Rehearsal Kitchen (QA)")

| TC         | What it checks                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-965** | The list reads in words; a deposit's window shows what it carried and "Deposited to your bank" = the row; "Advanced: debits and credits" totals balance; Escape and Close close it.                                                                                                                                                                                |
| **TC-966** | Send again: Cancel sends nothing and keeps the deposit window; confirming shows "Sending…" on a disabled button (request held by `page.route`), then the result **inside the open window, on top** (#1090); one request; the list still says Posted. The one write: one already-posted deposit is re-sent, which replaces its own entry in the QuickBooks sandbox. |
| **TC-967** | Phone width: View, Send again and Close reachable; nothing overflows.                                                                                                                                                                                                                                                                                              |

"Returned · paid again" (#1088) can't be produced on QA (a bank has to return a payout) — covered by restaunax `booksDeposits.int.test.ts`. `api-books-deposits-live.spec.ts` now also accepts the new `RETURNED` status.

### Settings history (`dashboard/owner/api-settings-history.spec.ts`, `32-settings-history-ui.spec.ts`, `@settings-safety`)

| TC         | What it checks                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-968** | Holiday hours: adding a date writes ONE "Holiday hours" row (area `hours`); moving it writes a removal + an addition; deleting writes a removal; every sentence is words.                                                                                                                  |
| **TC-969** | Pausing and resuming orders writes two "Accepting new orders" rows and never a row for `orderingPausedAt`, nor a raw timestamp.                                                                                                                                                            |
| **TC-970** | "Add a date": Save disabled without a date; Cancel and Escape add nothing; with a date it saves, "Special hours saved" seen on top, the list shows it without a reload; after a reload Recent changes (filtered to Hours) shows the one "Holiday hours" sentence in words; phone width OK. |
| **TC-971** | **Known bug (test.fail):** after the FIRST holiday on a restaurant with no history, Recent changes on the same page keeps saying "No changes recorded yet" until a reload (reproduced 2/2). When fixed this reports "passed unexpectedly" — remove the mark.                               |

### Changed

- **TC-616** (`api-service-fee.spec.ts`): STAFF now needs Tip Management (#1078). It asserts the refusal without the add-on, then grants it, checks `serviceFeeAllocation: TIP_RULES` is frozen, and that a STAFF rule saved before the add-on lapsed is frozen as HOUSE on new orders.

---

## TC-972 → TC-977 — Mobile release gating: app check-in + feature gates

**Status:** ⏳ Runs on QA once the restaunax `feat/mobile-release-gating` backend is deployed (passes against a local backend: `BACKEND_URL=http://localhost:9000`).

Every mobile app (Owner, Staff, customer ordering app, POS) reports its build to the backend on launch, and asks which server-side feature gates are on for its build (spec: restaunax `docs/features/MOBILE_RELEASE_GATING.md`). Both routes are public; these API-level checks (`pos/13-app-release-gating.spec.ts`, `--project=pos`) need no token and create nothing but one check-in row under a fresh random installation id. That row's `deviceModel` is `"automation"`, so it is recognizable in Admin → App versions → Owner → Installations.

| TC         | What it checks                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-972** | `POST /api/app/check-in` with a fresh UUID installation id (owner, ios, 1.0.0, `deviceModel: "automation"`) → 204.                                       |
| **TC-973** | The same check-in with an installation id that is not a UUID → 400 (nothing stored).                                                                     |
| **TC-974** | `GET /api/app/features?appType=owner&platform=ios&version=1.0.0` → 200 `{ success: true, data: { features: [...] } }`.                                   |
| **TC-975** | The feature lookup with `platform=web` → 400 (only ios and android exist).                                                                               |
| **TC-976** | `GET /api/app/ota/urgency?appType=owner&platform=ios&channel=production&runtimeVersion=native-1` → 200, `data.urgency` is NORMAL, IMPORTANT or CRITICAL. |
| **TC-977** | The OTA urgency lookup with `platform=web` → 400.                                                                                                        |

### Why it matters

The apps hide a feature that needs a new store build until its gate is switched on; if the lookup broke, every gated feature would stay off (or an old binary could be told to use a module it lacks). The check-in feeds the dashboard's "who runs which build" view that decides when a gate, or an old version, is safe to retire.

---

## TC-181 — Admin Chain Management (list)

**Status:** ✅ Passing

### What it checks

The admin Chain Management screen (`/admin?tab=chains`) loads a DataGrid with its default-visible columns: Chain, Owner, Restaurants (plus a row-action column). Read-only — no chain data is assumed to pre-exist, since chains aren't part of the shared QA seed.

### How it works, step by step

1. The test signs in as ADMIN and navigates to `/admin?tab=chains`
2. It confirms the "Chain Management" heading is visible
3. It confirms the grid's default-visible column headers (Chain, Owner, Restaurants) are visible

### Why it matters

This was previously a bare `test.fixme` scaffold with a wrong URL (`/admin?tab=restaurant&section=chains` — the frontend never reads a `section` param; the real route is `/admin?tab=chains`). First-ever coverage for a fully-built admin feature that had none.

---

## TC-223 — Admin Creates a Chain

**Status:** ✅ Passing

### What it checks

The real "Create Chain" flow: an admin picks a "founding" restaurant (one that already has a menu, an assigned owner, and doesn't already belong to a chain) and submits, producing a new chain whose detail panel auto-opens showing the founding restaurant as its first member.

### How it works, step by step

1. The test (as ADMIN) seeds a throwaway restaurant via the API, adds a menu group + item to it, and assigns the seed OWNER account as its owner — all three are hard requirements the UI itself enforces, confirmed live (see "Why it matters")
2. It navigates to Chain Management, opens "Create Chain", and searches/selects the founding restaurant in the debounced autocomplete
3. It submits (chain name left blank, so it defaults to the founding restaurant's name) and confirms the "Chain created" success toast
4. It confirms the detail panel auto-opens with the chain name heading and the founding restaurant listed as a member
5. It navigates "Back to chains", narrows the grid with its toolbar "Search…" box (QA holds 100+ chains at 25/page — each run's orphan group accumulates), and confirms the new chain's row is visible
6. Cleanup deletes the throwaway restaurant via the existing admin restaurant-delete endpoint

### Why it matters

Surfaced a real, previously-undocumented product requirement: **a founding restaurant must already have an assigned owner**, or the create form shows an inline alert ("This restaurant has no owner assigned...") and blocks submission — confirmed live 2026-07-29, not mentioned anywhere this test's research initially found. Also confirmed by source read that there is **no edit/rename UI and no `DELETE /api/admin/chains/:id` endpoint** — a chain only dissolves implicitly when unlinked down to its last member — so this test's cleanup (deleting the founding restaurant directly) may leave an orphan `RestaurantGroup` row in QA, the same class of accepted residue already documented for orphan menu groups. See `TEST_COVERAGE.md`'s Known Technical Debt table for both findings, plus a third: `ChainDetailPanel.tsx`'s "Remove from chain" button appears hardcoded `disabled` regardless of member count.

---

## TC-182 — Full Onboarding Chain

**Status:** ⏭️ Skipped locally (no `EMPLOYEE_*` credentials in this environment) — the Publish-checklist step (new 2026-07-29) is verified live against QA via standalone scratch specs (one against the already-published seed restaurant, one against a throwaway API-created restaurant) rather than the full ADMIN-substituted chain, which currently fails earlier at the Step 0 form for an unrelated, pre-existing reason (see Known Technical Debt)

### What it checks

The real, previously-untested production onboarding journey, chained end to end in one test: a visitor signs up (`Role.USER`), an employee creates a restaurant on their behalf (Step 0), sets its Business Hours (Step 1), adds a menu category (Step 2), and reaches the Publish checklist — then an admin assigns the still-unowned restaurant to the new user, promoting them to `OWNER`, and that owner sees their restaurant appear in My Restaurants.

### How it works, step by step

1. A fresh visitor signs up via `/sign-up`
2. An employee session creates a restaurant (Step 0 of `CreateStore.tsx`) — the restaurant exists but has no owner yet
3. The employee sets Business Hours (Step 1) — selecting "Open" for Monday–Friday, which auto-fills default 9-5 hours
4. The employee adds a menu category (Step 2)
5. The employee opens the Publish checklist and confirms it honestly reflects partial setup: Hours of Operation, Menu Setup, and Restaurant Information all show complete, Payment Processing shows incomplete, and the Publish Restaurant button is correctly disabled as a result
6. An admin looks up the new user by email and calls the restaurant-assignment API directly — **not through the dashboard UI**, because none currently exists (see "Why it matters" below)
7. The same browser session the visitor signed up in (still authenticated) navigates to My Restaurants and confirms the new restaurant is there

### Why it matters

Before this test, sign-up (TC-93), restaurant creation (TC-97), and publish (TC-143/144) were four disconnected fragments in different spec files, with nothing proving they chain into a real journey — `TEST_COVERAGE.md` called this out explicitly. Building this test surfaced two real product findings along the way, not just a coverage gap:

- **There is no dashboard UI path to assign a restaurant to a new owner.** The only frontend components referencing the assign-restaurant endpoint are dead code (imported nowhere), and the tab that would host that action is never rendered for a fresh `USER` account in the first place. This test calls the backend endpoint directly as a stand-in — there's nothing to click yet. See `docs/onboarding-product-fix-proposal.md`.
- **That same endpoint can 500 on a request that actually succeeded** — a non-critical welcome-email failure (confirmed live: a Mailtrap quota exhaustion) throws from inside the same try block as the (already-committed) database writes. The test's helper tolerates this specific known cause and verifies the real outcome instead of trusting the HTTP status. _(2026-07-19: QA moved to self-hosted Mailpit, so that particular trigger is gone — but the non-transactional bug stands and any send failure reproduces it.)_

Still stops short of actually publishing — the checklist requires Payment Processing (Stripe Connect), which has no API shortcut to fake. The 2026-07-29 pass instead asserts the checklist's partial state honestly (see step 5 above) rather than skipping Publish entirely, closing the gap `TEST_COVERAGE.md`'s Roadmap flagged between TC-182 and TC-143/144.

---

## TC-183 — Business Hours Step Behavior

**Status:** ⏭️ Skipped locally (no `EMPLOYEE_*` credentials in this environment) — verified live via the same ADMIN-substitution approach as TC-182

### What it checks

The Business Hours step (`HoursOfOperation.tsx`) of the onboarding wizard, which had zero prior coverage anywhere despite being a required step for every new restaurant: every day defaults to Closed; selecting Open reveals the opening/closing time pickers pre-filled with a default 9:00 AM–5:00 PM; selecting 24 Hours or Closed hides those pickers; and submitting with at least one day open advances the wizard to the Menu step.

### How it works, step by step

1. An employee creates a fresh restaurant and reaches Step 1
2. The test confirms Monday defaults to the "Closed" radio with no time pickers visible
3. It selects "Open" for Monday and confirms two time pickers appear, pre-filled with the default hours
4. It selects "24 Hours" and confirms the time pickers disappear again
5. It switches back to "Closed" and confirms the same
6. It sets Monday back to "Open" and submits, confirming the wizard advances to the Menu step

### Why it matters

This step is unavoidable for every single new restaurant, and its default-value and show/hide logic had never been exercised by any test. It's also the step directly upstream of TC-182's chain.

---

# 📊 Test Summary

| #                 | Test Case                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Area                     | Status                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01             | Demo request form works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Public                   | ✅ Passing                                                                                                                                |
| TC-02             | Confirmation email is sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Public                   | ⏭️ Skipped                                                                                                                                |
| TC-03             | Admin can log in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Admin                    | ✅ Passing                                                                                                                                |
| TC-04             | Admin finds demo request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Admin                    | ✅ Passing                                                                                                                                |
| TC-05             | Admin opens actions menu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Admin                    | ✅ Passing                                                                                                                                |
| TC-06             | Admin changes demo status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Admin                    | ✅ Passing                                                                                                                                |
| TC-07             | Admin edits and saves notes on a demo request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Admin                    | ✅ Passing                                                                                                                                |
| TC-08             | Admin records a follow-up as contacted (status flips)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Admin                    | ❌ App bug                                                                                                                                |
| TC-09             | Delete confirmation + cancel works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Admin                    | ✅ Passing                                                                                                                                |
| TC-98             | Admin permanently deletes a demo request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Admin                    | ✅ Passing                                                                                                                                |
| TC-10             | Admin assigns a demo request to a team member                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Admin                    | ✅ Passing                                                                                                                                |
| TC-11             | Admin schedules a demo (status flips to Scheduled)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Admin                    | ✅ Passing                                                                                                                                |
| TC-12             | Proceed to onboarding navigates correctly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Admin                    | ✅ Passing                                                                                                                                |
| TC-101 → TC-118   | Admin user management: invite, search/filter, detail sheet, role/status/permissions (no TC-108)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Admin                    | ✅ Passing (invite/reset tagged `@email` — run via `npm run test:email`)                                                                  |
| TC-76 / TC-77     | Role/status changes with bad input are rejected (API negatives)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Admin                    | ✅ Passing                                                                                                                                |
| TC-123            | Invited user claims access and logs in with the right access level                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Admin                    | ✅ Passing (tagged `@email` — run via `npm run test:email`)                                                                               |
| TC-124            | A bogus invite token grants no elevated access                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Admin                    | ✅ Passing                                                                                                                                |
| TC-13             | Owner sees My Restaurants page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                    | ✅ Passing                                                                                                                                |
| TC-14             | Owner sees their restaurant card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner                    | ✅ Passing                                                                                                                                |
| TC-15             | Owner opens restaurant management portal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | ✅ Passing                                                                                                                                |
| TC-16             | Owner navigates to Store Settings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Owner                    | ✅ Passing                                                                                                                                |
| TC-17             | Employee opens tax settings page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Employee                 | ✅ Passing                                                                                                                                |
| TC-18             | Employee saves a tax rate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Employee                 | ✅ Server check passes; reload-prefill step skips until RestauNax #1036 is on QA                                                          |
| TC-19             | Owner opens menu management                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner                    | ✅ Passing                                                                                                                                |
| TC-20             | Owner creates a menu category                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | ✅ Passing                                                                                                                                |
| TC-21             | Owner adds a menu item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                    | ✅ Passing                                                                                                                                |
| TC-22             | Customer sees menu page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Customer                 | ✅ Passing                                                                                                                                |
| TC-23             | Customer opens item and sees Add to Cart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Customer                 | ✅ Passing                                                                                                                                |
| TC-24             | Customer reaches checkout with cart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Customer                 | ✅ Passing                                                                                                                                |
| TC-25             | Customer fills details and reaches payment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Customer                 | ✅ Passing                                                                                                                                |
| TC-26             | Customer completes full order end to end                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Customer                 | ✅ Passing                                                                                                                                |
| TC-99             | Customer adds to cart and reaches checkout via the real UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Customer                 | ✅ Passing                                                                                                                                |
| TC-125            | Customer applies a coupon at checkout (valid + bogus)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Customer                 | ✅ Passing                                                                                                                                |
| TC-126            | Selecting Delivery drives the address → quote round-trip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Customer                 | ✅ Passing / graceful skip                                                                                                                |
| TC-100            | Restaurant receives + processes an order (POS lifecycle)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | POS                      | ✅ Passing (`--project=pos`)                                                                                                              |
| TC-179            | Current-orders + status reject an unauthenticated caller                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | POS                      | ✅ Passing (`--project=pos`)                                                                                                              |
| TC-27             | Owner reaches the publish page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                    | ⏭️ Skipped                                                                                                                                |
| TC-28             | Publish checklist items are visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Owner                    | ⏭️ Skipped                                                                                                                                |
| TC-29             | Owner views the Orders tab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner                    | ✅ Passing                                                                                                                                |
| TC-30             | Owner opens the Create Coupon form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-31             | Owner creates a new coupon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-32             | Admin sees the Restaurants list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Admin                    | ✅ Passing                                                                                                                                |
| TC-33             | Owner configures hours of operation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Owner                    | ⏭️ Not yet implemented (narrative placeholder, no test code)                                                                              |
| TC-34             | Owner accesses employee management                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner                    | ⏭️ Not yet implemented (narrative placeholder, no test code)                                                                              |
| TC-35             | Owner views the analytics dashboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Owner                    | ✅ Passing                                                                                                                                |
| TC-42             | Owner renames a menu category                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | ⏭️ Skipped                                                                                                                                |
| TC-43             | Owner edits a menu item name and price                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                    | ✅ Passing                                                                                                                                |
| TC-44             | Owner deletes a menu item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner                    | ⏭️ Skipped                                                                                                                                |
| TC-45             | Owner deletes a menu category                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | ✅ Passing                                                                                                                                |
| TC-46             | Owner opens the Stripe setup page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Owner                    | ✅ Passing                                                                                                                                |
| TC-47             | Stripe stepper shows all 4 steps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner                    | ✅ Passing                                                                                                                                |
| TC-48             | Stripe page shows header description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner                    | ✅ Passing                                                                                                                                |
| TC-49             | Owner sees Set Up Stripe Account button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner                    | ✅ Passing                                                                                                                                |
| TC-50             | Stripe requirements section is visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                    | ✅ Passing                                                                                                                                |
| TC-51             | Stripe success callback page loads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner                    | ✅ Passing                                                                                                                                |
| TC-52             | Restaurant Dashboard button redirects correctly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner                    | ✅ Passing                                                                                                                                |
| TC-53             | Connect button calls create API and redirects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | ✅ Passing                                                                                                                                |
| TC-54             | OWNER denied `/publish` route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Access Control           | ✅ Passing                                                                                                                                |
| TC-55             | OWNER denied `/tax` route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Access Control           | ✅ Passing                                                                                                                                |
| TC-56             | Owner can reach shared menu management                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Access Control           | ✅ Passing                                                                                                                                |
| TC-57             | Admin can reach shared menu management                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Access Control           | ✅ Passing                                                                                                                                |
| TC-58             | Employee can reach shared menu management                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Access Control           | ✅ Passing                                                                                                                                |
| TC-59             | Valid credentials reach the dashboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Public                   | ✅ Passing                                                                                                                                |
| TC-60             | Invalid credentials show an error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Public                   | ✅ Passing                                                                                                                                |
| TC-61             | Unknown email shows an error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Public                   | ✅ Passing                                                                                                                                |
| TC-62             | Menu item wizard blocks blank name/price                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | ✅ Passing                                                                                                                                |
| TC-63             | Invalid coupon discount % is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-64             | Declined card shows a payment error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Customer                 | ✅ Passing (needs `TEMPLATE_WIND_URL`)                                                                                                    |
| TC-65             | Menu item with no name rejected (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | API-Level                | ✅ Passing                                                                                                                                |
| TC-66             | Coupon with no code rejected (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | API-Level                | ✅ Passing                                                                                                                                |
| TC-68             | Coupon with negative discount rejected (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | API-Level                | ✅ Passing                                                                                                                                |
| TC-69             | Garbage Bearer token rejected (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | API-Level                | ✅ Passing                                                                                                                                |
| TC-70             | Nonexistent order search shows empty state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner                    | ✅ Passing                                                                                                                                |
| TC-71             | Unauthenticated visitor redirected from `/restaurant/stores`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Access Control           | ✅ Passing                                                                                                                                |
| TC-72             | Unauthenticated visitor redirected from `/admin`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Access Control           | ✅ Passing                                                                                                                                |
| TC-73             | Unauthenticated visitor redirected from a restaurant management URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Access Control           | ✅ Passing                                                                                                                                |
| TC-74             | Demo form — unchecked terms blocks submit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Public                   | ✅ Passing                                                                                                                                |
| TC-75             | Demo form — invalid email blocks submit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Public                   | ✅ Passing                                                                                                                                |
| TC-76             | Admin — invalid role value rejected (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Admin                    | ✅ Passing                                                                                                                                |
| TC-77             | Admin — status toggle on nonexistent user rejected (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Admin                    | ✅ Passing                                                                                                                                |
| TC-78             | Failed Stripe create-account shows error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | ✅ Passing                                                                                                                                |
| TC-79             | Owner without CREATE_RESTAURANT can't self-create (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | API-Level                | ✅ Passing                                                                                                                                |
| TC-80             | Demo request with no email rejected (API)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | API-Level                | ✅ Passing                                                                                                                                |
| TC-81             | OWNER denied `/restaurant/loyalty` route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Access Control           | ✅ Passing                                                                                                                                |
| TC-82             | Owner reaches Uber Eats delivery settings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner                    | ✅ Passing                                                                                                                                |
| TC-83             | Uber Eats delivery configuration section visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner                    | ✅ Passing                                                                                                                                |
| TC-84             | Owner reaches Subscription Management page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner                    | ✅ Passing                                                                                                                                |
| TC-85             | Subscription page shows plan details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner                    | ✅ Passing                                                                                                                                |
| TC-86             | Owner reaches Manage Deals tab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-87             | Manage Deals shows Create Deal action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-88             | Owner edits and saves a Store Settings field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner                    | ✅ Passing                                                                                                                                |
| TC-89             | Filters button opens the filter panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner                    | ✅ Passing                                                                                                                                |
| TC-90             | Order detail view opens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner                    | ✅ Passing                                                                                                                                |
| TC-91             | Created coupon visible in Manage Coupons list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-92             | Owner edits an existing coupon's discount value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-93             | Visitor registers a new account                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Onboarding / Public      | ✅ Passing                                                                                                                                |
| TC-94             | Sign-up — already-used email is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Onboarding / Public      | ✅ Passing                                                                                                                                |
| TC-95             | Sign-up — mismatched confirm-password blocks submit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Onboarding / Public      | ✅ Passing                                                                                                                                |
| TC-96             | Sign-up — weak password rejected client-side                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Onboarding / Public      | ✅ Passing                                                                                                                                |
| TC-97             | Employee creates a restaurant on behalf of a client                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Onboarding / Employee    | ✅ Passing — cleanup asserts the restaurant is purged                                                                                     |
| TC-127            | Analytics dashboard resolves (data or empty) without error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner                    | ✅ Passing                                                                                                                                |
| TC-128            | Analytics date-range picker opens with presets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                    | ✅ Passing                                                                                                                                |
| TC-129            | Changing the analytics range reloads the dashboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner                    | ✅ Passing                                                                                                                                |
| TC-131            | Orders grid renders a real column set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner                    | ✅ Passing                                                                                                                                |
| TC-132            | Filtering by Order Status re-queries the grid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | ✅ Passing                                                                                                                                |
| TC-133            | Resetting the filters restores the default status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Owner                    | ✅ Passing                                                                                                                                |
| TC-134            | Order detail dialog shows items and total                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner                    | ✅ Passing                                                                                                                                |
| TC-135            | Orders toolbar exposes an Export control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | ✅ Passing                                                                                                                                |
| TC-136            | Owner views the Customers directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Owner                    | ✅ Passing                                                                                                                                |
| TC-137            | Customer directory search re-queries the server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner                    | ✅ Passing                                                                                                                                |
| TC-138            | Owner switches to the Customer Groups (segments) sub-tab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | ✅ Passing                                                                                                                                |
| TC-139            | Owner views the Owner Settings (Automated Reports) form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner                    | ✅ Passing                                                                                                                                |
| TC-140            | Owner Settings Notifications sub-tab shows coming-soon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                    | ✅ Passing                                                                                                                                |
| TC-141            | Owner views the Daily Report (current business day)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Owner                    | ✅ Passing                                                                                                                                |
| TC-142            | Seeded orders reflected in today's Daily Report KPIs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner                    | ✅ Passing                                                                                                                                |
| TC-143            | Employee reaches the publish page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Employee                 | ✅ Passing                                                                                                                                |
| TC-144            | Employee sees publish checklist items                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Employee                 | ✅ Passing                                                                                                                                |
| TC-145            | Owner creates a FIXED_AMOUNT coupon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-146            | Owner creates a FIXED_ITEM coupon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-147            | FIXED_ITEM with no menu item selected is blocked (native validation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-148            | Non-positive FIXED_AMOUNT value is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-149            | End date before start date is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-150            | Empty coupon code is blocked (native validation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-151            | Duplicate coupon code on the same restaurant is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-152            | Coupon code input truncates at 20 characters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-153            | Manage Coupons search filters by code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-154            | Manage Coupons search filters by description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-155            | Manage Coupons search with no matches shows empty state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-156            | Manage Coupons status filter narrows to Active                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-157            | Manage Coupons table sorts by Code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-158            | Owner copies a coupon code from the Manage Coupons list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-159            | Duplicate pre-fills a new coupon form from an existing coupon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-160            | Owner deletes a coupon via the typed-confirmation dialog                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-161            | Cancelling the delete confirmation leaves the coupon untouched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-162            | Edit pre-fills the form with the coupon's existing values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-163            | Send to Customers is disabled for an expired coupon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-164            | Reset Form clears the create-coupon form back to defaults                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-165            | Guest purchases a gift card (preset denomination, Send as Gift)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Customer                 | ⏭️ `test.fixme` — intermittently blocked by Stripe Radar's invisible hCaptcha, see TEST_COVERAGE.md                                       |
| TC-166            | Guest purchases a gift card with a custom amount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Customer                 | ⏭️ `test.fixme` — same cause as TC-165                                                                                                    |
| TC-167            | Custom gift-card amount below the minimum is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Customer                 | ✅ Passing                                                                                                                                |
| TC-168            | Custom gift-card amount above the maximum is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Customer                 | ✅ Passing                                                                                                                                |
| TC-169            | Gift card balance check shows the correct balance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Customer                 | ✅ Passing                                                                                                                                |
| TC-170            | Gift card balance check shows not-found for a nonexistent code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Customer                 | ✅ Passing                                                                                                                                |
| TC-171            | Valid gift card applied at checkout shows the discount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Customer                 | ✅ Passing                                                                                                                                |
| TC-172            | Removing an applied gift card clears the discount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Customer                 | ✅ Passing                                                                                                                                |
| TC-173            | Invalid gift card code is rejected at checkout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Customer                 | ✅ Passing                                                                                                                                |
| TC-174            | A depleted ($0 balance) gift card is rejected at checkout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Customer                 | ✅ Passing                                                                                                                                |
| TC-175            | A frozen gift card is rejected at checkout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Customer                 | ✅ Passing                                                                                                                                |
| TC-176            | A coupon and a gift card both apply to the same order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Customer                 | ✅ Passing                                                                                                                                |
| TC-177            | Gift card fully covering the order skips Stripe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Customer                 | ⏭️ `test.fixme` — real bug: order 201s, then frontend still attempts a doomed $0 PaymentIntent (400), customer stuck with no confirmation |
| TC-178            | Gift card partially covering the order still charges the remainder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Customer                 | ✅ Passing                                                                                                                                |
| TC-181            | Admin navigates to Chain Management and sees the chains grid with its default columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Admin                    | ✅ Passing                                                                                                                                |
| TC-182            | Full onboarding chain: sign-up → create → hours → menu → publish checklist → assign → owner sees it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Onboarding / Employee    | ✅ Passing (2026-10-23: adds a menu item; cleanup can only archive — it has a menu)                                                       |
| TC-183            | Business Hours step: defaults, Open/24 Hours/Closed toggling, advances to Menu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Onboarding / Employee    | ✅ Passing — asserts the restaurant is purged on cleanup                                                                                  |
| TC-184            | `?item=` deep link auto-opens that item's modal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Customer                 | ✅ Passing                                                                                                                                |
| TC-185            | /checkout with an empty cart shows the empty-cart message                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Customer                 | ✅ Passing                                                                                                                                |
| TC-186            | Tip presets and custom tip flow into the server-quoted total                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Customer                 | ✅ Passing                                                                                                                                |
| TC-187            | Coupon stops applying and blocks Pay ("Remove the code to continue") when the cart drops below its minimum order amount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Customer                 | ✅ Passing                                                                                                                                |
| TC-188            | Quoted total under Stripe's $0.50 minimum blocks payment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Customer                 | ✅ Passing                                                                                                                                |
| TC-189            | Required modifier group blocks Add to Cart until a selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Customer                 | ✅ Passing                                                                                                                                |
| TC-190            | maxSelections=1 group behaves as a radio — B replaces A                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Customer                 | ✅ Passing                                                                                                                                |
| TC-191            | maxSelections cap disables remaining options in a multi-select group                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Customer                 | ✅ Passing                                                                                                                                |
| TC-192            | ADJUSTS_PRICE modifier adds its price to the item total                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Customer                 | ✅ Passing                                                                                                                                |
| TC-193            | REPLACES_PRICE modifier overrides the base price                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Customer                 | ✅ Passing                                                                                                                                |
| TC-194            | allowsDuplicates quantity stepper multiplies the modifier price                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Customer                 | ✅ Passing                                                                                                                                |
| TC-195            | Deal builder adds the deal with one Add; checkout proceeds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Customer                 | ✅ Passing                                                                                                                                |
| TC-196            | An incomplete deal never reaches the cart (opening the builder adds nothing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Customer                 | 🔄 Rewritten 2026-10-17 (guided deal choices) — awaiting a QA run                                                                         |
| TC-197            | A real coupon is refused by the server ("Coupons can't be combined with deals…") with a completed deal in the cart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Customer                 | ✅ Passing                                                                                                                                |
| TC-223            | Admin creates a chain from an API-seeded founding restaurant via the real Create Chain UI flow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Admin                    | ✅ Passing                                                                                                                                |
| TC-224            | Owner advances an order's status via the "Mark as X" button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner                    | ✅ Passing                                                                                                                                |
| TC-225            | Owner cancels a Stripe-paid order and triggers a real refund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner                    | ✅ Passing                                                                                                                                |
| TC-231 → TC-252   | Orders tab deep coverage: search hits (receipt/name/email), search-mode banner, status/type filters return the right rows, filter badge, sort, pagination, refresh, detail money/items/customer/delivery, full pickup + delivery lifecycles, unpaid cancel, Keep Order, CSV export content, export disabled at 0, header stats, empty date range, bad deep link                                                                                                                                                                                                                                                                  | Owner                    | ✅ Passing                                                                                                                                |
| TC-253            | Customer's real Stripe order reaches the owner (same receipt/items/total/contact) and is worked to Picked Up                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner                    | ✅ Passing                                                                                                                                |
| TC-254            | After Cancel & Refund: customer-side read is REFUNDED, second refund rejected, refund email received                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner                    | ✅ Passing (email step needs `MAILPIT_BASE_URL`)                                                                                          |
| TC-226 → TC-230   | Orders API auth & tenant isolation: /api/order/now deleted (404, was an anonymous PII dump), cross-tenant statistics reads/export 403 + unknown-order 404-first, mutating paths 403, all routes 401 without a token (pins for RestauNax #621; receipt route pinned as an everyone-500 backend bug, TC-227b + 227c fixme)                                                                                                                                                                                                                                                                                                         | API-Level (Owner)        | ✅ Passing (TC-227c ⏭️ fixme)                                                                                                             |
| TC-255 → TC-261   | Orders API contract: invalid status 400, cancel-twice 400, refund-unpaid 400, INITIALIZED hidden by default, backwards move pinned (259b fixme), export 0-rows 400 + 33-col CSV, sort/paging                                                                                                                                                                                                                                                                                                                                                                                                                                     | API-Level (Owner)        | ✅ Passing (TC-259b ⏭️ fixme)                                                                                                             |
| TC-262            | Search by customer phone number finds the order (regression guard for the int4-overflow 500 fixed in RestauNax #589)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner                    | ✅ Passing                                                                                                                                |
| TC-263 → TC-324   | Menu deep coverage: API contract, Menu tab, wizard/detail, chain menu, storefront hand-off, admin chain link/unlink (`api-menu`, `04b`, `04c`, `17-chain-menu`, `customer/06-menu-handoff`, `admin/chains`)                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner / Admin / Customer | ✅ Passing (pins flipped 2026-08-17 after RestauNax #602)                                                                                 |
| TC-325 → TC-350   | Deals API contract: create math + qty-1 split, validation, list projections, patch, status, hard delete, public /active + /validate windows, cap, PUT validation, /quote charge + upcharge + rejections, coupon ⊥ deal, stats, bulk, AI questions, chain scope, 401s, IDOR TC-347..350 (`api-deals.spec.ts`)                                                                                                                                                                                                                                                                                                                     | Owner (throwaway tenant) | ✅ Passing (§1 fixes #618/#619 verified 2026-08-19; pins flipped)                                                                         |
| TC-351 → TC-364   | Manage Deals table (rows, search, filter, sort, expand, toggle, delete, pagination TC-358, cap banners), Create/Edit form (validation, live math, create, edit), Deal Analytics, AI Generator smoke (`11-deals.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-365 → TC-366   | Chain shell deals: Chain chip / rollup / View Analytics, member managed-at-chain-level, create through the fan-out confirm (`18-chain-deals.spec.ts`, deleted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner (chain)            | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages” (TC-833 → TC-835)                                                |
| TC-367 → TC-371   | Deals → storefront: Today's Deals card + owner toggle, multi-slot builder + checkout summary + page /quote, modifier upcharge, 86'd slot hides the deal, paid Stripe order → orderDeals + timesUsed + Promotions row / Results (`customer/08-deals-handoff.spec.ts`)                                                                                                                                                                                                                                                                                                                                                             | Customer + Owner         | ✅ Passing (one real test-card order per run)                                                                                             |
| TC-836 → TC-844   | Storefront promotions on template-wind: sale on the menu card, BOGO option picks at the server price, order code (title, saving, total = page /quote), bundle code + ?promo= open the builder, free-item offer, CODE-only combo, Keep shopping one-shot confirmation, upgrade build-up, ONE paid code order → couponId / discountAmount / total (`customer/10-promotions.spec.ts`)                                                                                                                                                                                                                                               | Customer                 | ✅ Passing (one real test-card order per run)                                                                                             |
| TC-372 → TC-383   | Table-service open checks (POS tab API, throwaway tenant): flag gate 403, open → DINE_IN/CONFIRMED/unpaid + table fields, tender-at-open 400s, `/tablet/tables` summary (remaining=total, daily+receipt numbers, server), table transfer, mid-meal modify (no balanceDue), 2-leg cash close `@smoke`, even 3-split + idempotent replay + post-close 400, per-leg tip math, gift-leg negatives, card-leg create/cancel intents, cancel guard (`pos/03-open-checks.spec.ts`)                                                                                                                                                       | POS                      | ✅ Passing (2026-08-19; gift happy path blocked — no QA mint path; card capture = device-lane)                                            |
| TC-384 → TC-395   | Floor & tables API (POS, throwaway tenant): section/table/combination CRUD, owner OR-gate (`tableServiceEnabled` OR entitlement) vs tablet host-stand's entitlement-ALONE gate, `/api/tablet/floor` derived payload, capability-split tablet writes (`pos/04-floor-tables.spec.ts`)                                                                                                                                                                                                                                                                                                                                              | POS                      | ✅ Passing (2026-08-27)                                                                                                                   |
| TC-396 → TC-405   | Reservation configuration API (POS, throwaway tenant): `ReservationSettings`/`ServicePeriod`/`TurnTime`/`DateOverride` CRUD + validation, owner/host-stand phone-booking create (always ADVISORY mode — min-notice/advance-window never enforced on this path) (`pos/05-reservations-config.spec.ts`)                                                                                                                                                                                                                                                                                                                            | POS                      | ✅ Passing (2026-08-27)                                                                                                                   |
| TC-406 → TC-417   | Reservation lifecycle API (POS, throwaway tenant): book → arrive → seat → link → settle-in-cash arc `@smoke` (TC-406), override-conflict re-seat (MANAGER steals the table; STAFF sees 409), manual table hold (TC-417, `TABLE_HELD`), unlink-on-cancelled-order (status stays SEATED, order link only clears), status-transition capability splits (`pos/06-reservations-lifecycle.spec.ts`)                                                                                                                                                                                                                                    | POS                      | 🔄 Updated 2026-10-12 (TC-406 PAID→CLEAR, TC-417 hold) — awaiting a QA run                                                                |
| TC-418 → TC-425   | Waitlist + public self-service booking API (POS, throwaway tenant): waitlist add/notify, public STRICT-mode availability + create + manage-cancel (409, not the owner surface's 400), `onlineBookingEnabled` gate (`pos/07-waitlist-public.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                             | POS                      | ✅ Passing (2026-08-27)                                                                                                                   |
| TC-426 → TC-433   | Register / cash-drawer API (POS, throwaway tenant + second device): open/close lifecycle, drawer-exclusivity lock (a locked-out PIN staff can't even sign in — `STAFF_TERMINAL_LOCKED`), cash-leg math + idempotent replay, blind-count `overShort` sign convention (`pos/08-register-cash.spec.ts`)                                                                                                                                                                                                                                                                                                                             | POS                      | ✅ Passing (2026-08-27)                                                                                                                   |
| TC-713 → TC-726   | Manual table hold + host-stand booking edit API (POS, throwaway tenant): hold window, TABLE_HELD on every seat path, held/seated parties let through, join suggestions, overlap/undersized/waitlist refusals, keep, PATCH edit + hold release (`pos/09-table-hold.spec.ts`)                                                                                                                                                                                                                                                                                                                                                      | POS                      | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-727 → TC-737   | Table turns API (POS, throwaway tenant): after-payment policies, turn settings validation, check-presented, walk-in seating, server strip, waitlist quote, turn insights (`pos/10-table-turns.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                          | POS                      | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-738            | Host list for every staff member, guest contact only for hosts; non-host hold 403 (`pos/09-table-hold.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | POS                      | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-739 → TC-741   | Booking hours: suggested windows from business hours, bulk create, hoursConflict (`pos/05-reservations-config.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | POS                      | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-742 → TC-744   | Public date strip (multi-day availability) + booking source MOBILE/WEB + insights counts (`pos/07-waitlist-public.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | POS                      | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-745            | Owner-app push-token register/sign-out (`pos/09-table-hold.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | POS                      | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-746 → TC-749   | Owner portal browser: Reservations — booking hours from business hours (dialog + bulk save), closed-day warning + row chip, after-payment policy, Insights tab + bookings by source (`dashboard/owner/21-reservations-booking-hours.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                    | Owner                    | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-750 → TC-753   | Owner portal browser: Tables & Floor editor rework — add-panel preset, undo/redo/discard, empty-section state, shortcuts dialog (`dashboard/owner/18-tables-floor.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner                    | 🆕 Written 2026-10-13 — awaiting a QA run                                                                                                 |
| TC-434 → TC-439   | Owner portal browser: Tables & Floor tab — entitlement-gated nav (OR-gate), section/table create, canvas placement (via the "All tables" browser since the 2026-10-07 editor rework), edit/reselect, merge, deactivate, delete (`dashboard/owner/18-tables-floor.spec.ts`)                                                                                                                                                                                                                                                                                                                                                       | Owner                    | ✅ Passing (2026-08-27)                                                                                                                   |
| TC-440 → TC-445   | Owner portal browser: Reservations tab — entitlement-only nav gate, pacing-guard refusal with zero service periods, capped-period booking, turn-time band overlap (error-toast a11y bug — see `docs/PHYSICAL_TEST_LEDGER.md`), cancel/no-show (`dashboard/owner/19-reservations.spec.ts`)                                                                                                                                                                                                                                                                                                                                        | Owner                    | ✅ Passing (2026-08-27)                                                                                                                   |
| TC-446 → TC-455   | Owner portal browser: Print Shop — gift-card product offered to every restaurant (gift cards on or off), brief form quotes a RANGE (EN DASH) + "not charged now" and ends in Add to cart; the cart repeats the range, holds the pay choice + Place order (#1072) → SC-basket, IN_DESIGN, no charge, checkoutPlaced email + CTA; proof "Check your design" → "I'd like changes" → stale approve 409 → "Looks good" → "Ordered"; HQ finalises the basket on a card-less QA tenant → "needs your payment" + "Pay $207.00 to print" link + chargePaymentNeeded email; cancel from AWAITING_PAYMENT; on-behalf order hides adminNotes | Owner                    | ✅ Passing (2026-10-29) — healed for the cart and one-charge finalise (RestauNax #1072, #1075)                                            |
| TC-456 → TC-468   | Admin browser: Supply Shop — design queue row (⋯ menu leads with the next step), US-Letter artwork WARNED (never blocked), Upload artwork → Send to restaurant → PROOF_READY "With owner", Finalise dialog drafts the basket (prefill / range / ceiling; above it → "Send for approval"; margin), no saved card → one charge + payment link, "Awaiting owner payment", 2nd finalise 409; place-on-behalf, COMP → IN_PRODUCTION + gift-card batch + compedCost, Card export CSV, finalise/fulfil negatives, owner checkout refuses COMP / FREE_TIER, idempotent minting, liability unchanged, employee 403                        | Admin                    | ✅ Passing (2026-10-29) — healed for the ⋯-only row and the Finalise dialog (RestauNax #1075)                                             |
| TC-469 → TC-476   | Admin browser: Physical card stock — mint 5, export CSV (quoted text, EXPORTED), public balance 200 INACTIVE / validate not-activated / unknown 404, admin adjust 409 NOT_ACTIVATABLE, freeze 5 then 0, unfreeze → INACTIVE, quantity 0/5001 refused, config knobs round-trip                                                                                                                                                                                                                                                                                                                                                    | Admin                    | ✅ Written (2026-08-28) — needs RestauNax #678 on QA                                                                                      |
| TC-499 → TC-506   | Admin browser + API: Existing gift cards — preview a handover CSV (BOM, "Card Number"/"Current Balance", 15-digit codes) and confirm it wrote nothing; import through the panel and spend-check a card; validate at the importing restaurant; re-upload skips all rows and does not top a card up; a row with no code is reported while the good row still imports; export contains the card, marked `imported`, with its number unformatted; undo deletes the cards and frees the numbers so a corrective import succeeds; a second undo 404s                                                                                   | Admin                    | ✅ Written (2026-08-31) — needs RestauNax #703 on QA                                                                                      |
| TC-477            | Customer checkout: an unloaded (INACTIVE) physical card is refused                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Customer                 | ✅ Written (2026-08-28)                                                                                                                   |
| TC-478 → TC-483   | Owner supply-shop API: tier math + 25% spread, X-Restaurant-Id tenancy, search finds the gift card gift-cards-on-or-off, list strips internals, proof refusals, cancel twice                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner (API)              | ✅ Written (2026-08-28)                                                                                                                   |
| TC-542            | Deal scheduling API: `/active` timeZone + null schedule text on an unrestricted deal (`api-deals`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner (API)              | ⏭️ Written (2026-10-05), gated on deploy                                                                                                  |
| TC-539            | Deal scheduling API: POS `includeUnavailable=1` lists day-off deals as unavailable, never ended ones (`api-deals`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner (API)              | ⏭️ Written (2026-10-05), gated on deploy                                                                                                  |
| TC-508 → TC-523   | Deal scheduling API: meal periods, `?at=` window / overnight / dates / omitted / validation, quote + order at `scheduledFor`, live status, cap excludes ended, ended can't be re-enabled, create/PUT/bulk/chain validation, business-hours `schedule-check` incl. past-closing negative (`api-deals`, `20-chain-promotions` for the chain half)                                                                                                                                                                                                                                                                                  | Owner (API)              | ⏭️ Written (2026-10-05), gated on deploy                                                                                                  |
| TC-524 → TC-527   | POS deals: in-store channel list, ring-up, online-only refused, out-of-schedule refused (`pos/10-deals`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | POS (API)                | ⏭️ Written (2026-10-05), gated on deploy                                                                                                  |
| TC-540, TC-541    | Deal form: Custom clears the meal type; editing a meal's hours keeps it; Until close; typed dates (`11-deals`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-528 → TC-534   | Deal scheduling UI: chip row + presets + summary, save round-trip, hours warning, live-status chips, AI Edit pre-fill, chain caption + per-location warnings (`11-deals`; chain half now `20-chain-promotions`)                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner                    | 🗄️ TC-528–532 retired 2026-10-15 (see “Retired with the old Coupon and Deal pages”); TC-533/534 now in `20-chain-promotions`              |
| TC-535 → TC-538   | Wind: "Available from…", scheduled pickup unlocks the deal, checkout time error, Deals grid block (`customer/08-deals-handoff`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Customer                 | ⏭️ Written (2026-10-05), gated on deploy                                                                                                  |
| TC-691 → TC-701   | Guided deal types API: BOGO free / BOGO % off / % off computed prices + roles, client price ignored, deal.type.\* 400s, same-item combo, price-only PUT keeps rows, legacy = COMBO, BOGO /quote, bulk errors[], AI `dealTypes` question (`api-deals`)                                                                                                                                                                                                                                                                                                                                                                            | Owner (throwaway tenant) | ⏭️ Written (2026-10-09), gated on deploy                                                                                                  |
| TC-702 → TC-704   | Guided deal form: BOGO free via Same item, BOGO 50% off, combo of two of the same item (`11-deals`); TC-360 → TC-362 rewritten for the same form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner                    | 🗄️ Retired 2026-10-15 — see “Retired with the old Coupon and Deal pages”                                                                  |
| TC-705 → TC-712   | Deal slot matching + "buy any X, get one free": wrong / missing picks refused on `/quote`, `placeOrder`, `/validate` and the POS; category BOGO "from" price + equal-or-lesser-value quote; BOGO 50% category; % off refuses category lines; order stores the server price (`api-deals`, `pos/10-deals`)                                                                                                                                                                                                                                                                                                                         | Owner (API) + POS (API)  | ⏭️ Written (2026-10-09), gated on deploy                                                                                                  |
| TC-L60 → TC-L63   | Lima deals: render, build, checkout payload, later-today availability (`customer-lima/13-deals`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Customer (Lima)          | ⏭️ Written (2026-10-05), gated on deploy                                                                                                  |
| TC-L64 → TC-L70   | Lima storefront promotions: sale on the menu card, BOGO "Pick 1" option picks at the server price, cart code → checkout title + saving + Total = page /quote, bundle code + ?promo= open the builder, Keep shopping one-shot confirmation, upgrade build-up, ONE paid code order → couponId / discountAmount / total (`customer-lima/14-promotions.spec.ts`)                                                                                                                                                                                                                                                                     | Customer (Lima)          | ✅ Passing (one real test-card order per run)                                                                                             |
| TC-892, TC-893    | Identical fixed items as ONE "2 × <item>" step with a Customize row per unit — customise one unit, required options refused per unit, one quote line per unit (`customer/08-deals-handoff` wind, `customer-lima/13-deals` lima)                                                                                                                                                                                                                                                                                                                                                                                                  | Customer (Wind + Lima)   | ⏭️ Written (2026-10-17), gated on deploy                                                                                                  |
| TC-906, TC-907    | The choices made inside a deal (paid size, nested free sauce, free dip; lima also the item note) are sent in /quote orderDeals[].items[].selectedModifiers and stored on the paid order's orderDealItems (`customer/11-deal-item-choices` wind, `customer-lima/15-deal-item-choices` lima, `@deal-item-choices`)                                                                                                                                                                                                                                                                                                                 | Customer (Wind + Lima)   | ⏭️ Written (2026-10-20), fails on QA until the deal-item-modifiers fixes deploy                                                           |
| TC-908 → TC-913   | A combo item is just food (TC-913: a register cash sale of only the combo): foodItemCount on owner list/detail + customer history, breakdown deal-child keys / notes / nested picks, KDS make line per station, top sellers count combo units with deal revenue counted once; Uber manifest fixme (`pos/12-combo-food-surfaces`, `@combo-food`)                                                                                                                                                                                                                                                                                  | POS + Owner (API)        | ✅ Passing (2026-10-21), TC-911 fixme (manifest not observable on QA)                                                                     |
| TC-914 → TC-917   | Wind: a card that needs a 3D Secure bank check — Complete and Fail, in the page AND as a real full-page redirect to wind's own `/checkout/return`: order confirmed + paid once + cart empty, or the error on checkout + nothing charged (`customer/12-3ds-bank-check`, `@3ds`)                                                                                                                                                                                                                                                                                                                                                   | Customer                 | ✅ Passing (2026-10-23)                                                                                                                   |
| TC-L73 → TC-L76   | Lima: the same four, the redirect returning to `/<slug>/checkout/return` inside the tenant basename (`customer-lima/16-3ds-bank-check`, `@3ds`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Customer (Lima)          | ✅ Passing (2026-10-23)                                                                                                                   |
| TC-L77 → TC-L82   | Lima: the ordering site when the restaurant isn't taking orders: paused, resumed, closed for the night, not published, guest wording (`customer-lima/17-availability`)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Customer (Lima)          | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-1180 → TC-1186 | Paid add-ons (throwaway tenants, API): Menu TVs claim/list/layouts gated and the TV paused not unpaired, Social Media and AI media, Voice AI summary and re-enable, another owner gets 404, partner labor needs Timecards, company staff read-only on payroll (`owner/api-addon-gating`, `owner/api-partner-api`, `employee/payroll-read-only`)                                                                                                                                                                                                                                                                                  | Owner / Employee         | ⏳ Needs RestauNax Stage 1 paywall on QA                                                                                                  |
| TC-1210 → TC-1214 | Compliance rules (throwaway FL tenant): every rule as text with status and source, FL minimum wage by date, sales-tax rules DRAFT, Spanish, 401/403/400 (`owner/api-compliance-rules`)                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                    | ⏳ Needs restaunax Stage 2 on QA                                                                                                          |
| TC-1360 → TC-1370 | Paid pay periods (mark-paid, idempotent, never reopened, corrections carried as prior-period adjustments, export column only when carried) and the day-close ordering pause choice (default pause, `pauseOrdering: false`, Resume lifts the night) (`owner/api-timecards`, `owner/api-payroll-export`, `pos/15-day-close`, `customer-lima/17-availability`)                                                                                                                                                                                                                                                                      | Owner / POS / Lima       | ⏳ Needs restaunax Stage 4 on QA                                                                                                          |
| TC-1630 → TC-1637 | Tax math v2 (throwaway tenant): the switch (off by default, validated), "price includes tax" on the menu, the pint and the combo quoted off and on, the POS preview gated on `supportsTaxMathV2`, an opted-out restaurant's report unchanged (`owner/api-tax-math-v2`, `owner/api-sales-tax-reports`)                                                                                                                                                                                                                                                                                                                            |
| TC-1460 → TC-1475 | Staff operations (throwaway tenant): POS auto clock-out question + 401s, terminate refused on the clock, Staff app shift edits + dispute (NOTE_REQUIRED / 409), owner disputes + resolve, Needs you TIMECARD_DISPUTE / FINAL_PAY, TTOC list + job code, staffOps settings + 8027 allocation, no-overtime file without the split columns (overtime adds them, TC-1473), year-end figures, termination + final pay + former staff; UI: the two staffOps switches, the TTOC field (`owner/api-staff-ops`, `owner/api-payroll-export`, `owner/36-staff-ops-ui`)                                                                      |
| TC-1430 → TC-1438 | Labor-law engines (Stage 5, W3:M1/H2/M5): timecards `laborRules` + premium fields, break decision (Pay premium / Employee waived, reason, 403 for staff and on the free tier), STATE overtime preset as the default, `GET /api/compliance/:id/labor-rules` + confirm, the 20-minute federal floor, schedule `predictiveScheduling` / NOTICE_PREMIUM shape / `scheduling.predictive` normalizer / publish `premiums` (`owner/api-timecards`, `owner/api-free-breaks`, `owner/api-scheduling`)                                                                                                                                     | Owner                    | ⏳ Gated (`laborEngines`) until restaunax Stage 5 is on QA                                                                                |
| TC-1099 → TC-1102 | Customers numbers (throwaway tenant): profile id, walk-ins not customers, new + returning add up, segments partition, distinct Groups total (`owner/api-customer-insights`)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner                    | ⏳ Needs restaunax fix on QA                                                                                                              |
| TC-1098           | A click on a switch's label text does not flip it; only the switch does (`admin/marketing-automations`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Admin                    | ⏳ Written 2026-10-31 (needs the frontend fix on QA)                                                                                      |
| TC-1094 → TC-1097 | HQ add-on requests (browser, throwaway owner): the request under Open, Attach refused in words without a subscription, Mark done, an owner-withdrawn request (`admin/addon-requests-ui`)                                                                                                                                                                                                                                                                                                                                                                                                                                         | Admin                    | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-1090 → TC-1093 | Table QR orders on the POS (throwaway tenant): a card order is paid dine-in TABLE_QR for its table, the register finds it, the table isn't taken, a blank card follows its table (`pos/18-table-qr-on-pos`)                                                                                                                                                                                                                                                                                                                                                                                                                      | POS                      | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-1086 → TC-1089 | Website reward member (wind, seed restaurant): OTP sign-in with 90 points, an order earns points at once, the next redeems 100 for $5, the balance adds up (`customer/13-member-points`)                                                                                                                                                                                                                                                                                                                                                                                                                                         | Customer (Wind)          | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-L83 → TC-L86   | Lima: outside business hours (today closed for a holiday): ASAP stopped in words, Schedule for later picks tomorrow, the server takes tomorrow not tonight, the closed-day wording (`customer-lima/18-outside-hours`)                                                                                                                                                                                                                                                                                                                                                                                                            | Customer (Lima)          | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-943 → TC-948   | Back office next level API (throwaway tenant): setup checklist order + blocked steps + ticks itself, Payday mode + deadline sentence, Needs you today approval item + deep link + stranger never 403, holiday & special hours CRUD + "closed today", settings change history, morning summary switch (`dashboard/owner/api-back-office-next-level`)                                                                                                                                                                                                                                                                              | Owner                    | ✅ Passing (2026-10-27)                                                                                                                   |
| TC-949 → TC-951   | POS store settings need MANAGE_DEVICE_SETTINGS: plain staff refused (403 STAFF_CAPABILITY_REQUIRED), pause/resume allowed and recorded by name, manager + old-build device recorded (`pos/12-tablet-settings-staff-role`, `@settings-safety`)                                                                                                                                                                                                                                                                                                                                                                                    | POS                      | ✅ Passing (2026-10-27)                                                                                                                   |
| TC-952 → TC-957   | Owner portal browser: Needs you today on Today, Payday tab, back-office setup card, holiday hours list + remove, Recent changes, morning summary switch (`dashboard/owner/29-back-office-next-level-ui`)                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                    | ✅ Passing (2026-10-27)                                                                                                                   |
| TC-958 → TC-964   | Service charges paid to staff: server refuses STAFF without Tip Management and gratuity > 25%; Fees at checkout choices hidden without the add-on, saved once on a double click, seen on top, kept after reload; gratuity presets + Other with inline limit and confirm/Cancel; phone width (`api-service-charges-to-staff`, `30-service-charges-ui`)                                                                                                                                                                                                                                                                            | Dashboard + API          | ✅ Passing (2026-10-28)                                                                                                                   |
| TC-965 → TC-967   | Card deposits on the QuickBooks sandbox restaurant: list in words, balanced entry, Escape/Close, Send again busy state and result inside the open window (#1090), phone width (`31-books-deposits-ui`, `@books-live`)                                                                                                                                                                                                                                                                                                                                                                                                            | Dashboard                | ✅ Passing (2026-10-28)                                                                                                                   |
| TC-968 → TC-971   | Settings history: one "Holiday hours" row per date, move = removal + addition, pause never logs a timestamp; Add a date Cancel/Escape/Save; TC-971 known bug — Recent changes doesn't refresh after the first holiday (`api-settings-history`, `32-settings-history-ui`, `@settings-safety`)                                                                                                                                                                                                                                                                                                                                     | Dashboard + API          | ✅ Passing (2026-10-28); TC-971 expected-fail (product bug)                                                                               |
| TC-972 → TC-977   | Mobile release gating: app check-in (204 / bad id 400), feature lookup, OTA urgency lookup (`pos/13-app-release-gating.spec.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| TC-978 → TC-989   | Journey part 1 (throwaway tenant, browser): the owner follows the back-office checklist — jobs with validation in the dialog, weekly pay schedule, 7% sales tax with Recent changes, invite Dee with her own $13.00 rate, schedule + publish a shift ($97.50); four bugs fixed by RestauNax #1094 and #1096 (`journey/01-open-hire-schedule`)                                                                                                                                                                                                                                                                                    | Dashboard                | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-990 → TC-1000  | Journey part 2 (throwaway tenant, POS API + browser): Dee clocks in, a counter sale, a split T1 check with a cash tip, an online order with a card tip, an open T2; the Daily Report adds up; Close Day blocks on the drawer, the open check and Dee on the clock, then closes with the deposit; ordering closed for the night (`journey/02-service-day`)                                                                                                                                                                                                                                                                        | Dashboard                | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-1001 → TC-1007 | Journey part 3 (throwaway tenant, browser): Needs you today → Timecards for last week; fix a forgotten clock-out with a reason, confirm a missed break as is, approve (locked after reload), reopen needs a reason; Labor agrees; TC-1002b/1007 guard RestauNax #1099's fixes (`journey/03-review-the-week`)                                                                                                                                                                                                                                                                                                                     | Dashboard                | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-1008 → TC-1013 | Journey part 4 (throwaway tenant, browser): the owner writes a tip-out rule by hand with a 3% card fee; a cash tip at the register and a card tip paid at the table; Tips, the tip-outs breakdown, declared cash tips and the CSV agree to the cent (`journey/04-tips`)                                                                                                                                                                                                                                                                                                                                                          | Dashboard                | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-1014 → TC-1021 | Print Shop (throwaway tenant, browser + API): an unlaunched product is Request a quote (no price; one click; the button inside its card at 390 px; HQ request + alert email); Card in a clear stand comes with linked, required stands — shown in the builder and cart, never changed, removed or cancelled alone, placed together (`owner/21-supply-shop-quotes-and-stands`)                                                                                                                                                                                                                                                    | Owner                    | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-1022 → TC-1027 | Journey part 5 (throwaway tenant, browser): Payday on an approved week; Export for payroll warns about missing payroll IDs, the owner adds one in People; the RestauNax and Gusto files = the approval, a re-download is identical; Dee sees her pay in Restaunax Staff; TC-1025b guards RestauNax #1103's fix (`journey/05-payroll-out`)                                                                                                                                                                                                                                                                                        | Dashboard                | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-1028 → TC-1033 | Journey part 6 (`@partner`, read-only on the QA partner restaurants): QuickBooks / Xero days posted and balanced, Avalara's tax = the books', card deposits = payouts, the unconnected control shows no error; TC-1030b guards RestauNax #1104's fix (`journey/06-the-books`)                                                                                                                                                                                                                                                                                                                                                    | Dashboard                | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-1034 → TC-1039 | Journey part 7 (throwaway tenant, POS API + browser): a day with cash, card, tips and a partial refund, closed; the close, the Daily Report, the sales tax report, the sales-by-day CSV, the books entry and the partner API agree to the cent (`journey/07-numbers-agree`)                                                                                                                                                                                                                                                                                                                                                      | Dashboard                | ✅ Passing (2026-10-29)                                                                                                                   |
| TC-1040 → TC-1042 | Partial refund from the dashboard (throwaway tenant, browser): part of a paid card order, then the rest; bad and too-large amounts refused in the dialog; the route never refunds more than is left; guards RestauNax #1109 (`33-partial-refund-ui`)                                                                                                                                                                                                                                                                                                                                                                             | Dashboard                | ✅ Passing (2026-10-30)                                                                                                                   |
| TC-1081 → TC-1085 | Staff requests in the dashboard (browser, throwaway tenant, Mailpit): the inbox, a day off approved with a note, a trade approved, availability denied with a reason, Decided (`owner/35-staff-requests-ui`)                                                                                                                                                                                                                                                                                                                                                                                                                     | Dashboard                | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-1074 → TC-1079 | Sales tax and service fee (browser, throwaway tenant): a second rate, tax by category and item (tax-free), the change-rate confirm, the service fee form, an order priced by them, the sales tax report agreeing (`owner/34-sales-tax-ui`)                                                                                                                                                                                                                                                                                                                                                                                       | Dashboard                | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-1066 → TC-1073 | POS auto-gratuity (throwaway tenant, POS API): a party of 6 gets it, it follows the party size, removal needs a manager unless allowed, a payment freezes it, day close shows it apart from tips, a staff share reaches the server as wages (`pos/17-auto-gratuity`)                                                                                                                                                                                                                                                                                                                                                             | Dashboard                | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-1059 → TC-1065 | POS gift cards (throwaway tenant, POS API): sold for cash, refusals, a printed card activated, a mistaken sale voided (manager only), spent online and at the register, the drawer and the owner's liability (`pos/16-gift-cards`)                                                                                                                                                                                                                                                                                                                                                                                               | Dashboard                | ✅ Passing (2026-10-31)                                                                                                                   |
| TC-1051 → TC-1058 | POS day close and day open (throwaway tenant, POS API): who may close or open, what blocks a close, the held card charged at close, closed for the night on the POS and online, the morning open, a reopened day closed again (`pos/15-day-close`)                                                                                                                                                                                                                                                                                                                                                                               | Dashboard                | ✅ Passing (2026-10-30)                                                                                                                   |
| TC-1043 → TC-1050 | POS money paths (throwaway tenant, POS API): keyed card sale and decline, tip after close refused on a keyed card, pay link paid from the phone, split by item, balance after an edit, manager-gated refund by edit, cancel of a held card sale releases the card (RestauNax #1112), cash refund owed (`pos/14-money-paths`)                                                                                                                                                                                                                                                                                                     | Dashboard                | ✅ Passing (2026-10-30)                                                                                                                   |

A 2026-08-27 pass added TC-384–445, the table-management-reservations arc: `pos/04-floor-tables.spec.ts` through `pos/08-register-cash.spec.ts` (API level, five throwaway-tenant files covering the floor/table registry, reservation configuration, reservation lifecycle, waitlist + public booking, and register/cash-drawer), plus `dashboard/owner/18-tables-floor.spec.ts` and `19-reservations.spec.ts` (real-browser coverage of the same two owner-portal tabs). 62 tests written across the seven files (61 passing on QA, 1 deliberate `test.fixme` — TC-417, see its row above). Two real product findings surfaced along the way — an owner-portal accessibility bug (error Snackbars behind an open SideSheet are `aria-hidden`) and a confirmed Playwright/CDP limitation on native canvas drag-and-drop — are recorded as physical/manual entries in the new `docs/PHYSICAL_TEST_LEDGER.md`, which is now this repo's release-gate companion to this file for anything hardware-, gesture-, or carrier-network-shaped that automation cannot reach.

A 2026-08-28 pass added TC-446–483, the supply-shop "place now, charge at fulfilment" + physical gift cards arc (web side only — the POS is out of scope and gets its own suite later): `dashboard/owner/20-supply-shop.spec.ts` and `dashboard/admin/supply-shop.spec.ts` (browser), `dashboard/admin/gift-card-batches.spec.ts` (browser), `dashboard/owner/api-supply-shop.spec.ts` (API) and TC-477 in `customer/02-checkout.spec.ts`. Strategy: `docs/SUPPLY_SHOP_TEST_STRATEGY.md`. Two things cannot be driven on QA and are documented rather than faked: completing Stripe hosted Checkout (Radar hCaptcha — the CHARGE path is proven up to the payment link, and COMP is the only route to a minted batch), and NEXT_INVOICE (a throwaway tenant has no subscription; tests branch on `quote.credit.eligible`).

A 2026-08-19 pass added TC-372–383 (`tests/pos/03-open-checks.spec.ts`) — first coverage of the table-service OPEN CHECKS feature shipped the same day (backend #620/#623; contract: `restaunax/docs/features/TABLE_SERVICE_OPEN_CHECKS.md`). Runs on a per-run throwaway tenant through the full POS auth chain built for it (ADMIN-created REGISTER device → tablet JWT → owner POS PIN → `X-Staff-Session` → register/open): flag gate, the born-unpaid DINE_IN/CONFIRMED contract, the no-tender-at-open 400s, the tables grid summary (daily `orderNumber` vs permanent `receiptNumber` naming rule), transfer, mid-meal modify, even cash splits with idempotencyKey replay semantics, per-leg tips, gift-leg negatives, card-leg intent create/cancel, and the settled-leg cancel guard. All 12 passing on QA on first run. Two documented gaps: the gift-leg HAPPY path needs an ACTIVE gift card and QA has no mint path without real money (purchase verifies a succeeded Stripe PaymentIntent; admin gift-card routes only freeze/adjust existing cards) — becomes coverable if an admin/demo mint endpoint ever ships; and card-leg CAPTURE needs a physical reader (`card_present` PI), so it stays device-lane coverage.

A 2026-07-11 pass added TC-182/183, the first chained end-to-end onboarding test and dedicated Business Hours coverage — see their write-ups above for two real product findings surfaced along the way (no dashboard UI path to assign a new owner; an assign-restaurant 500 on a request that actually succeeded). See `docs/onboarding-product-fix-proposal.md`.

A 2026-07-19 pass added TC-184–188 (customer checkout quick wins: item deep link, empty cart, tip → server quote, coupon minimum-order revalidation, Stripe $0.50 floor — all passing; see the write-up above). This batch is the first coverage added under the new wind-deploy trigger model, where every push to template-wind's `qa` branch runs the customer project automatically. The same pass added TC-189–194 (ItemModal modifier rules — required groups, radio semantics, selection caps, ADJUSTS/REPLACES pricing, duplicate quantities), all passing. And TC-195–197 (deal builder, incomplete-deal checkout gate, deal↔coupon exclusion — the deal purchase path's first coverage), all passing.

**144 passing · 21 skipped · 1 failing (env-only)** — as of 2026-07-10. The one failure (TC-58) fails only in environments without `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` set; it passes wherever those credentials exist. (Owner-side expansion on 2026-07-07 added TC-35 + TC-127–129 for the Analytics tab, TC-131–135 deepening the Orders tab, TC-136–138 for the Customers tab, TC-139–140 for the Owner Settings tab, and TC-141–142 for the Daily Report tab — all passing. A 2026-07-10 pass added TC-145–164, expanding Coupons UI coverage far beyond the original 4 tests: all three discount types, the full Manage Coupons list (search/filter/sort/copy), and row actions — duplicate, delete, edit-prefill, and disabled Send-to-Customers. Two of these (TC-147, TC-150) surfaced a real UX finding: the code and menu-item fields rely on native HTML5 `required` validation, so the app's own custom error text for those specific fields never has a chance to render — the browser's native constraint-validation UI intercepts the submit first. A same-day follow-up pass added TC-165–178, giving gift cards their first-ever coverage (purchase + checkout redemption) and expanding the customer-checkout coupon path beyond the original single combined test — this also required setting `TEMPLATE_WIND_URL` for the first time in this environment, which surfaced and fixed several previously-latent regressions in the whole customer suite: the checkout coupon Apply button colliding with the new (unconditionally-rendered) gift-card Apply button, a `seedCart()` race that could leave a prior coupon/gift-card applied across re-seeds within one test, a stale rejection-message regex, `selectPickup()` targeting a since-removed radio input (the control is now a button), and a stale order-number regex on the confirmation page.)

Skipped tests fall into four groups: **route access** (TC-27, TC-28, TC-81 — publish/tax/loyalty are employee/admin-only and return Access Denied for the owner role); **covered elsewhere** (TC-44 — the item card has no delete button; deletion is on the item detail page, TC-302); **missing credentials in this environment** (TC-58, TC-97, plus TC-17/TC-18 in environments without `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`); and **real bugs**, all fixed since (TC-177's gift-card dead end and TC-92's coupon-edit 500, RestauNax #481, are passing tests now). TC-33 and TC-34 remain narrative-only placeholders with no test code at all — not the same as a skipped/fixme test.

---

# ❓ Frequently Asked Questions

**Q: Does any test use real money or real data?**
No. All tests run against a test environment (QA). Payment tests use Stripe's official test card numbers — they simulate a real transaction but never charge anyone.

**Q: Does any test create real restaurant accounts or orders?**
Tests do create temporary data in the QA environment (test restaurants, test orders), but everything is automatically cleaned up when the tests finish.

**Q: How often do these tests run?**
They can be run manually at any time with one command (`npm run test`). They are designed to also run automatically whenever a developer makes a change to the codebase.

**Q: What happens when a test fails?**
A failed test means something in the software is not working as expected. The test suite saves a screenshot and recording of the failure so developers can see exactly what went wrong.

**Q: Why are some tests skipped?**
Skipped tests fall into three categories: (1) the feature is restricted to a different role on QA (e.g. `/publish` is employee-only, so owner tests get Access Denied — the tax settings tests used to be in this category too, but they've since been moved to run under the employee role instead, where they pass); (2) the UI doesn't yet expose the needed button or element (e.g. no delete button on menu item cards); or (3) the test case has been documented but the automated test code hasn't been written yet. Each skipped test explains its specific reason in the Status line.

---

## TC-1150 → TC-1154 — Payroll and books audit fixes, Stage 1 (API)

**Status:** ⏳ Written 2026-10-31; fails on QA until the restaunax back-office audit fixes (`bo1031/payroll`, W3:H1, W3:H4, W2:A7) are deployed there.

| TC          | Spec                              | What it checks                                                                                                                                   |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-1150** | `dashboard/owner/api-free-breaks` | An unpaid break type under 20 minutes is refused (400, names the type and "20 minutes"); nothing is saved.                                       |
| **TC-1151** | `dashboard/owner/api-free-breaks` | An unpaid break taken for 12 minutes stays paid time: `unpaidBreakMinutes` 0, `paidMinutes` = the whole shift (29 CFR 785.18).                   |
| **TC-1152** | `dashboard/owner/api-tips`        | A new tip policy defaults to `PERCENT_ONLY` card-fee withholding; a saved `ACTUAL_FEE` mode is kept.                                             |
| **TC-1153** | `dashboard/owner/api-tips`        | With the address in CA: the saved withholding reads as off, saving withholding is refused in plain words, saving it off works; moved back to FL. |
| **TC-1154** | `dashboard/owner/api-books-taxes` | Rounding tolerance above $5.00 refused in plain words; a tolerance and a mapping change show in Recent changes (area `books`, who, new value).   |

`journey/04-tips` also checks the percentage-only radio is the default when withholding is switched on.

---

## TC-1330 → TC-1343 — Books exports and the accountant's books, Stage 4 (API + browser)

**Status:** ⏳ Written 2026-11-01; fails on QA until the restaunax back-office audit Stage 4 books exports and access track (`bo1031/booksaccess`: W2:S1, A11, A8, A10) is deployed there.

| TC          | Spec                                          | What it checks                                                                                                                                     |
| ----------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1330** | `dashboard/owner/api-books-exports`           | Import files, export check, sales summary and the mapping preset: 403 without the Books & Taxes add-on, 200 with it.                               |
| **TC-1331** | `dashboard/owner/api-books-exports`           | "Simple accounts": the sales entry maps to six named accounts in one click; back to detailed; unknown preset 400; the change is in Recent changes. |
| **TC-1332** | `dashboard/owner/api-books-exports`           | QuickBooks Online file: Intuit's exact headers, no BOM, MM/DD/YYYY dates; the day then shows `exportFormat: QUICKBOOKS_ONLINE` and `exportedAt`.   |
| **TC-1333** | `dashboard/owner/api-books-exports`           | Xero manual journal file: exact headers (`*Narration … TrackingOption2`); the export check lists nothing left out; an unknown format is 400.       |
| **TC-1334** | `dashboard/owner/api-books-exports`           | The RestauNax CSV keeps its headers; card deposits download in the QuickBooks layout.                                                              |
| **TC-1335** | `dashboard/owner/api-books-exports`           | Sales summary for a closed day: per day and in total, ties to the books; a range over 93 days is 400.                                              |
| **TC-1336** | `dashboard/owner/api-books-exports`           | Sales summary CSV: day rows, a Total row, "Ties to journal" column.                                                                                |
| **TC-1337** | `dashboard/owner/api-books-exports`           | Sales-by-day CSV: Net sales (after refunds), Refunds, Net sales before refunds.                                                                    |
| **TC-1338** | `dashboard/owner/api-accountant-multi-client` | Two owners invite one accountant (new account, then sign-in with the second link); `/api/accountant/clients` lists both. `@email`                  |
| **TC-1339** | `dashboard/owner/api-accountant-multi-client` | For each client: books settings (no tokens), accounts, journal days, a day's balanced entry, deposits, sales summary that ties.                    |
| **TC-1340** | `dashboard/owner/api-accountant-multi-client` | The accountant downloads the QuickBooks file and the sales summary CSV; the Xero check answers.                                                    |
| **TC-1341** | `dashboard/owner/api-accountant-multi-client` | Every write refused: 403 "read-only view" under `/api/accountant`, 404 on the owner's `/api/accounting` routes; nothing changed.                   |
| **TC-1342** | `dashboard/owner/api-accountant-multi-client` | A client they don't serve and a made-up id are 404; B's revoke closes B only.                                                                      |
| **TC-1343** | `dashboard/owner/api-accountant-multi-client` | Browser: Journal, Deposits, Accounts and Sales summary tabs load with no 401/403; the file download is offered.                                    |

`api-accountant-access` TC-779 also tries the new writes (Simple preset on the owner route, posting a day and saving the mapping under `/api/accountant`).

---

## TC-1400 → TC-1418 — Employer group, combined overtime, sick time and PTO, Stage 5 (API)

**Status:** ⏳ Written 2026-11-01; fails on QA until the restaunax back-office audit Stage 5 employer track (`bo1031/employer`: W3:C4, W3:H5) is deployed there.

| TC          | Spec                                    | What it checks                                                                                                                                          |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-1400** | `dashboard/owner/api-employer-group`    | `/api/employers` list, create and read are 401 without a sign-in.                                                                                       |
| **TC-1401** | `dashboard/owner/api-employer-group`    | Create refuses a 9-digit EIN (last 4 only), an unknown pay frequency, a bad workweek day / anchor date and a blank name: 400 INVALID + field.           |
| **TC-1402** | `dashboard/owner/api-employer-group`    | The owner groups their two restaurants: 201 view (EIN last 4, weekly calendar, no payroll company, canManage); in the list and on read.                 |
| **TC-1403** | `dashboard/owner/api-employer-group`    | A restaurant the owner doesn't control is 404; one already grouped is 400 ALREADY_GROUPED; another owner gets 404 and doesn't see it listed.            |
| **TC-1404** | `dashboard/owner/api-employer-group`    | People: the owner's two staff records are unlinked and suggested as one person `matchedBy: ACCOUNT`; record shape.                                      |
| **TC-1405** | `dashboard/owner/api-employer-group`    | Link needs two records (one → 400); linked → one person, suggestion gone; unlinking prunes the person; unknown record 404.                              |
| **TC-1406** | `dashboard/owner/api-employer-group`    | A member's `GET /settings` names the employer; changing payFrequency there is 403 SET_BY_EMPLOYER; same value 200; an employer change shows on both.    |
| **TC-1407** | `dashboard/owner/api-employer-group`    | `GET /payroll/:rid/employer` summary (`combinedOvertime: true`); removed from the group the restaurant edits its own calendar; re-adding is idempotent. |
| **TC-1408** | `dashboard/owner/api-employer-group`    | A group PTO policy (employerId set) blocks delete: 400 HAS_ACCRUAL_POLICIES, still refused after retiring it.                                           |
| **TC-1409** | `dashboard/owner/api-employer-group`    | RestauNax EMPLOYEE reads the group (canManage false); create, change, delete, add-restaurant are 403 PLATFORM_EMPLOYEE_READ_ONLY.                       |
| **TC-1410** | `dashboard/owner/api-employer-overtime` | Linked person, one week: 25 h at A + 25 h at B → A 25 h regular / 0 OT, B 15 h regular / 10 h OT, $150.00 premium.                                      |
| **TC-1411** | `dashboard/owner/api-employer-overtime` | Unlinked, the same hours are two 25 h weeks with no overtime; linking again brings B's overtime back.                                                   |
| **TC-1412** | `dashboard/owner/api-employer-overtime` | Deleting the employer (nothing attached) makes both restaurants independent: `/employer` null, group 404, no overtime.                                  |
| **TC-1413** | `dashboard/owner/api-time-off-accrual`  | No policy: scope RESTAURANT, the CA sick leave rule suggested (60 min per 30 h), nothing applied; the Staff app's balances are empty.                   |
| **TC-1414** | `dashboard/owner/api-time-off-accrual`  | `fromRule` on a DRAFT rule is 400 DRAFT_RULE; with `acknowledgeDraft` → 201 SICK policy from the rule; the suggestion goes away.                        |
| **TC-1415** | `dashboard/owner/api-time-off-accrual`  | Custom PTO 201; a second PTO or sick policy 400 POLICY_EXISTS; zero accrual / unknown kind 400 INVALID.                                                 |
| **TC-1416** | `dashboard/owner/api-time-off-accrual`  | `GET /accrual/balances`: the owner's record with a zero SICK and PTO balance view each.                                                                 |
| **TC-1417** | `dashboard/owner/api-time-off-accrual`  | Staff app `time-off-balances`: both balances (no policy ids), empty history.                                                                            |
| **TC-1418** | `dashboard/owner/api-time-off-accrual`  | Retiring both policies: none in force, the suggestion returns, Staff app empty; an unknown policy id is 404 POLICY_NOT_FOUND.                           |

`api-employer-group` leaves one empty Employer row per run by design: a group that ever had a sick/PTO policy can't be deleted (TC-1408).
## TC-1530 → TC-1537 — Stage 6: add-on request flow and simulator checks

RestauNax back-office audit Stage 6 (bo1031/reqflow, W5:P1–P4, W0:SIM-10..12). Gated by `RELEASED_ON_QA.requestFlowStage6` / `simScenariosStage6` (`utils/releaseGate.ts`) until it reaches QA. Once it is there, a throwaway restaurant's requests are WAITING, so TC-894/895 and TC-1094..1097 follow whichever the backend does, and TC-1095/1096 skip because they need an OPEN request (TC-1537 covers that on the seed).

| TC | Spec | What it proves |
| --- | --- | --- |
| **TC-1530** | `dashboard/owner/api-addon-billing` | An account that isn't live gets every product with `accountLive: false`, `reason: ACCOUNT_NOT_ACTIVE` and the text "Available once your account is live" (and the ES text). The Products page answer also has `accountLive: false`. |
| **TC-1531** | `dashboard/owner/api-addon-billing` | Asking before the account is live returns 201 WAITING with "Request saved…". The product shows `pendingRequestStatus: WAITING`. HQ `?status=WAITING` lists it with `waitingCount`; it is not in Open. Attach answers 409; the owner can cancel. |
| **TC-1532** | `dashboard/owner/api-addon-billing` | Decline: 401 without sign-in, 403 for an owner, 404 for an unknown id, 409 "Only an open request can be declined." |
| **TC-1533** | `dashboard/owner/api-addon-billing` | Seed (live): the request is OPEN. HQ declines it with a reason: DECLINED, shown under Closed, reason emailed. When the owner asks again, Mark done closes it. |
| **TC-1534** | `dashboard/owner/api-addon-billing` | `GET /api/tablet/features` returns `accountLive` and `availableProducts` (request date and status, reason); `available` lists the same products. |
| **TC-1535** | `dashboard/admin/demo/03-qa-sim-day` | Every day checked with the Stage 6 rules carries all ten checks (close.volume … close.lateSales), as text. Read-only. |
| **TC-1536** | `dashboard/admin/addon-requests-ui` | The Waiting toggle shows a count and the note. A not-live restaurant's request is shown as "Waiting for the account", with no Attach, Mark done or Decline. |
| **TC-1537** | `dashboard/admin/addon-requests-ui` | Seed, using its own request: the Decline dialog (product + restaurant, optional reason). Cancel keeps the request open. Decline shows "Request declined…" and Closed shows Declined. |

## TC-1600 → TC-1618 — Stage 7: sales tax depth

RestauNax back-office audit Stage 7, tax depth track (bo1031/taxdepth, W4:H2, M3, H3, M5, M4, M9, L5). Gated by `RELEASED_ON_QA.taxDepthStage7` (`utils/releaseGate.ts`, probe `GET /api/tax/:id/rate-check`) until it reaches QA. Tag `@tax-depth`. The midnight switch-over of a scheduled rate is proved by restaunax `taxDepth.int.test.ts` (QA has no clock control).

| TC | Spec | What it proves |
| --- | --- | --- |
| **TC-1600** | `dashboard/owner/api-tax-depth` | The rate check: default rate, reference, review window, warnings as text. "My rates are right" records `confirmedAt`; the review is no longer due. |
| **TC-1601** | `dashboard/owner/api-tax-depth` | Scheduling a rate: today, a past date or a malformed date is 400; a date 45 days out is 201, listed as pending with the current percent; the rate still charges 8%. |
| **TC-1602** | `dashboard/owner/api-tax-depth` | Cancelling a scheduled change removes it from pending; cancelling it again is 404. |
| **TC-1603** | `dashboard/owner/api-tax-depth` | A rate takes a filing class (017 on create, 011 on edit); a non-code is 400. `/filing-classes` answers 200 with a list for any state (empty for NY). |
| **TC-1604** | `dashboard/owner/api-tax-depth` | The report discloses its period: `BUSINESS_DAY` with the cutoff by default, `CALENDAR` (cutoff null) with `basis=calendar`; the CSV's second line says which; `byClass` is a list. |
| **TC-1605** | `dashboard/owner/api-tax-depth` | Certificates: missing buyer / unknown reason refused; create normalises the state (NY) and flags EXPIRED; an edit to a later expiry clears it; listed. |
| **TC-1606** | `dashboard/owner/api-tax-depth` | A certificate image: a text file is 400, a PDF is stored and served as an https link. |
| **TC-1607** | `dashboard/owner/api-tax-depth` | Linking a certificate to a sale that wasn't exempt is 400; an unknown order is 404. |
| **TC-1608** | `dashboard/owner/api-tax-depth` | The POS list (`/api/tablet/tax-exempt-certificates`) carries the certificate with its reason in the device's language (ES "Gobierno"); no device = 401; an archived certificate leaves the list. |
| **TC-1609** | `dashboard/owner/api-tax-depth` | The card-surcharge rule for NY: pass-through off, rule DRAFT → allowed, untaxed, warning UNCONFIRMED as text. |
| **TC-1610** | `dashboard/owner/api-tax-depth` | The DAVO feed: a `salesTax:read` key reads two days; jurisdictions add up to net tax collected, which ties to the report; `basis=calendar` honoured; the CSV bridge header; a `menu:read` key is 403. |
| **TC-1611** | `dashboard/owner/api-tax-depth` | The HQ rate review: owner 403; admin sees the tenant's row (8%, NY) with a result as text, worst first, and the CSV. |
| **TC-1612** | `dashboard/owner/api-books-taxes` | The year-end package has `12-fees-paid-to-restaunax.csv` and `13-gift-card-liability-at-year-end.csv`; both download alone; a fresh tenant's fees are all 0.00 and its gift card balance 0 on Dec 31. (TC-767 now accepts the later stages' files, in order, after the first nine.) |
| **TC-1613** | `dashboard/owner/37-sales-tax-depth-ui` | "Check your rate" shows 8%; "My rates are right" shows the thanks and records the check. |
| **TC-1614** | `dashboard/owner/37-sales-tax-depth-ui` | "Schedule a change" (New rate 8.5%, Starts on +45 days) is listed under Scheduled rate changes; the rate row still says 8%; Cancel change removes it. |
| **TC-1615** | `dashboard/owner/37-sales-tax-depth-ui` | A new rate "Packaged beer" with Business class 017 shows the class in the rates list. |
| **TC-1616** | `dashboard/owner/37-sales-tax-depth-ui` | Add certificate (buyer, Government, number, an expiry in the past): the row shows Government and is flagged expired. |
| **TC-1617** | `dashboard/owner/37-sales-tax-depth-ui` | The report's Dates choice: Calendar dates shows "midnight to midnight"; Business days shows the business-day line. |
| **TC-1618** | `dashboard/admin/tax-rate-review-ui` | HQ → Finance → Sales tax rate review lists the tenant at 8% with a result, no edit control, and downloads `tax-rate-review-<date>.csv`. |

## TC-1700 → TC-1712 — Stage 6: setup interview and the simpler Staff page

RestauNax back-office audit Stage 6, setup & staff simplification track (bo1031/uxsetup, W0:J1-a, J1-b, OB-1, OB-3, OB-4, OB-5). Gated by `RELEASED_ON_QA.staffSetupStage6` (`utils/releaseGate.ts`, probe `GET /restaurant/:id/back-office/setup-interview`) until it reaches QA. Tag `@staff-setup`. A CONFIRMED pay-frequency rule refusing the interview needs an owner confirmation QA can't make: restaunax `setupInterview.int.test.ts` proves it. The rewritten Staff-layout tests TC-628 → TC-634, TC-650 (`21-back-office-staff-ui`), TC-664 (`22-ux-audit-staff-ui`) and TC-677 (`23-tip-waterfall-ui`) carry the same gate where they read the new layout.

| TC | Spec | What it proves |
| --- | --- | --- |
| **TC-1700** | `dashboard/owner/api-setup-interview` | GET for an Arizona counter-service owner (Scheduling + Tips): state AZ / Arizona from the address, pool by hours recommended, four pay frequencies (monthly flagged with a note), payroll file / own Gusto only (no Payroll add-on), "do you schedule" yes; text, never keys; the checklist reports the interview as available, not answered. |
| **TC-1701** | `dashboard/owner/api-setup-interview` | POST writes all five in one go: overtime preset STATE, every two weeks, payroll file, no schedule (clock-in rule off), a pool by hours (a Counter job made); the checklist's jobs, pay schedule, tip rules, payroll and schedule steps are done; the settings history (area staff) has a row per answer. |
| **TC-1702** | `dashboard/owner/api-setup-interview` | The same answers again change nothing (no job, 0 history rows); GET reads them back. |
| **TC-1703** | `dashboard/owner/api-setup-interview` | RestauNax Payroll without the add-on is skipped with a sentence (ES) and the file stays chosen (provider `chosenMode` FILE); monthly in Arizona saves with a pay-frequency warning while the rule is DRAFT (refused once CONFIRMED). |
| **TC-1704** | `dashboard/owner/api-setup-interview` | A state other than the address's is 400 STATE_NOT_ADDRESS naming AZ (the full name "Arizona" is accepted); an unknown pay frequency or a missing payroll mode is 400 INVALID_ANSWER. |
| **TC-1705** | `dashboard/owner/api-setup-interview` | Another owner is refused (403/404) both ways; a restaurant without Timecards gets 200 `available:false` on GET and 403 FEATURE_NOT_ENTITLED on POST; no token is 401. |
| **TC-1706** | `dashboard/owner/api-setup-interview` | Choosing own Gusto adds "Connect your Gusto account" to the checklist (payroll mode still done); back to the file removes it. |
| **TC-1707** | `dashboard/owner/22-ux-audit-staff-ui` | Every old `?staffTab=` link lands on its screen in People · Schedule · Payday · Tips · Settings (roles → Permissions, shifts → Timecards and breaks → Pay & overtime with Timecards, `settings` → Settings); roles opens the one Permissions screen with both sections. |
| **TC-1708** | `dashboard/owner/23-tip-waterfall-ui` | Tip policy: the presets card sits above the tip-outs; a Bar sales rule hides its category choice and the approval guard until Advanced is opened. |
| **TC-1709** | `dashboard/owner/38-setup-staff-simplify-ui` | The interview dialog from the setup card: Arizona from the address, pool by hours pre-picked, no RestauNax Payroll, save → overtime preset STATE, every two weeks, payroll file; the checklist steps are done and struck through on the card. |
| **TC-1710** | `dashboard/owner/38-setup-staff-simplify-ui` | One Permissions screen: Shift lead loses "Comp an item" (Save role) and comps need a reason (Save permissions) without leaving it; the exceptions link opens People. |
| **TC-1711** | `dashboard/owner/38-setup-staff-simplify-ui` | With the payroll file chosen, Pay & overtime shows only it (no Gusto / RestauNax Payroll wording); "Change payroll method" brings back "Do you already use Gusto?". |
| **TC-1712** | `dashboard/owner/38-setup-staff-simplify-ui` | Store Settings: an owner sees the RestauNax setup values as one line with a mailto "Contact support"; the values (e.g. "Business day ends at") only after "Show details". |

## TC-1730 → TC-1735 — Stage 6: daily views

RestauNax back-office audit Stage 6, daily views track (bo1031/uxdaily, W0:J5, J6/OB-2, J2, MF-4, J8). Gated by `RELEASED_ON_QA.dailyViewsStage6` (`utils/releaseGate.ts`, probe `GET /api/today/:id`) until it reaches QA. Tag `@daily-views`. The overtime-approaching and void/comp pushes are proved by restaunax unit tests (`ownerAlertRules`, `voidCompAlert`) and `dailyViews.int.test.ts` (QA has no push inbox).

| TC | Spec | What it proves |
| --- | --- | --- |
| **TC-1730** | `dashboard/owner/api-timecards` | The approve preview of an approved period is its frozen snapshot (Gus: wages + premiums = the timecards' total, minutes match); reopened with nothing changed, the rebuilt preview has the same people and totals; notices are sentences; re-approving keeps the totals. |
| **TC-1731** | `dashboard/owner/api-daily-views` | `GET /api/today/:id`: business date, last year's date 364 days back, sales / labor / on the clock, and the owner's money fields (labor cost, discounts, comps, voids); a fresh restaurant has no last-year figure. |
| **TC-1732** | `dashboard/owner/api-daily-views` | "Send to my accountant": last month's figures (sales tax, payroll with no periods) and the ZIP in RestauNax, QuickBooks and Xero layouts (PK header, README, sales-tax and payroll CSVs); month `2026-13` is 400. |
| **TC-1733** | `dashboard/owner/api-daily-views` | An expected-sales override of $600 makes that day `OVERRIDE` with labor % = wages / $600; a 25% target marks it over when above; clearing goes back to history; a negative amount and a 120% target are 400 in words. |
| **TC-1734** | `dashboard/owner/api-daily-views` | Preferences: a new restaurant reads void/comp off at $25, overtime at 38 h, Books tabs off; a partial save keeps the rest; overtime 0 minutes is 400. |
| **TC-1735** | `dashboard/owner/api-discount-permissions` | A $2 coupon on Kim's order is in the exceptions summary as `discountsByType.COUPON` (and on Kim's row); DEAL, POINTS and CASH_DISCOUNT are listed. |

`dashboard/owner/24-books-gating-ui` TC-790 (updated): with the change deployed, the accountant tab is "Send to my accountant" (figures + download, invite below) and Card deposits, Tax calendar and Year end are turned on from Overview → "Show more in Books & taxes" before every section is opened.

## TC-1760 → TC-1771 — Stage 7: growth A (prime cost, staff import, cash tip-out sheet)

| ID | Spec | What it proves |
|---|---|---|
| **TC-1760** | `dashboard/owner/api-growth-a` | Prime cost is gated like the labor report: 403 without Timecards; with it, 8 workweeks, each with labor and net sales and no prime cost % until costs are entered. |
| **TC-1761** | `dashboard/owner/api-growth-a` | Typing a week's costs: a date that isn't a workweek start and a negative cost are refused in words (ES "Ingresa cada costo como 0 o más."); food and beverage saved as TYPED, paper/other NONE. |
| **TC-1762** | `dashboard/owner/api-growth-a` | Invoice-total CSV: dry run (2 new, a bad date row reported), import, the same file again imports 0 (2 duplicates), paper/other comes from the invoice while food stays typed, undo removes 2. |
| **TC-1763** | `dashboard/owner/api-growth-a` | Staff import dry run of Toast's TimeEntries.csv: 2 people to add, the latest shift's wage per job, new jobs listed, a $1.00 rate flagged below the minimum wage; nothing written. |
| **TC-1764** | `dashboard/owner/api-growth-a` | Staff import: people, jobs and rates written, no email and no invite; the same file again adds nobody. |
| **TC-1765** | `dashboard/owner/api-growth-a` | Unknown headers are refused (UNRECOGNISED) until a column mapping is sent; the mapped import adds the person with their email; the invite goes out only when asked (`/invites`), an empty pick is 400. |
| **TC-1766** | `dashboard/owner/api-growth-a` | The cash tip-out sheet is off by default; paying while off is SHEET_OFF, in words. |
| **TC-1767** | `dashboard/owner/api-growth-a` | Turned on: the day's sheet (lines, totals, no open drawers); paying without an open drawer of that day is DRAWER_NOT_OPEN (ES text). |
| **TC-1768** | `dashboard/owner/api-growth-a` | Without Tip Management the sheet's routes answer 403. |
| **TC-1769** | `dashboard/owner/38-growth-a-ui` | People → Import: a CSV shows "1 to add", Import says "1 added and 0 updated. No invites were sent.", the person is in the list. |
| **TC-1770** | `dashboard/owner/38-growth-a-ui` | Analytics → Prime cost: Enter costs (Food 1500) saves and the week reads "Entered". |
| **TC-1771** | `dashboard/owner/38-growth-a-ui` | Tips → Nightly cash tip-out sheet: off by default; on, the Business day picker and "No tips for this day yet."; turned back off. |

## TC-1790 → TC-1803 — Growth track B: mobile clock-in + staff announcements

RestauNax back-office audit, growth track B (bo1031/growthb, W0:MF-6 mobile clock-in, W0:MF-10 staff announcements). Gated by `RELEASED_ON_QA.teamCommsGrowthB` (`utils/releaseGate.ts`, probe `GET /api/staff/announcements/:id`) until it reaches QA. Tag `@team-comms`. Spec: `dashboard/owner/api-team-comms` — a throwaway Miami restaurant created with coordinates (SCHEDULING + TIMECARDS, a Driver job), Dee (Driver, staff-app user) and Mia (manager), both invite → Mailpit → register, plus a second restaurant with TIMECARDS off. Settings are put back to off and every announcement is archived before both restaurants are deleted. Accepted punches (inside the fence, breaks, clock-out, MOBILE / OUTSIDE_GEOFENCE timecard flags) need a phone at the restaurant: restaunax `teamComms.int.test.ts` proves them.

| TC | Spec | What it proves |
| --- | --- | --- |
| **TC-1790** | `dashboard/owner/api-team-comms` | Mobile clock-in settings default: off, no jobs/roles, 150 m, outside punches not allowed, 50–2000 m bounds, the restaurant has a location. |
| **TC-1791** | `dashboard/owner/api-team-comms` | A radius of 5, 2001 or 120.5, a foreign job id or a non-boolean is 400 with text; 300 m saves (200 + message) and reads back; reset to 150. |
| **TC-1792** | `dashboard/owner/api-team-comms` | A manager's PUT is 403 and changes nothing. |
| **TC-1793** | `dashboard/owner/api-team-comms` | While off, the staff app's `/clock` answers `available: false, reason: NOT_ENABLED` with a message; `/me` has `mobileClockIn: false`. |
| **TC-1794** | `dashboard/owner/api-team-comms` | A punch with no / out-of-range / non-numeric location is 400 `MOBILE_CLOCK_IN_REFUSED` / `INVALID_LOCATION`. |
| **TC-1795** | `dashboard/owner/api-team-comms` | On for the Driver job: Dee's `/clock` is available (150 m, no shift, her job listed) and `/me` says `mobileClockIn: true`; Mia (no Driver job) gets `NOT_ELIGIBLE` on status and punch. |
| **TC-1796** | `dashboard/owner/api-team-comms` | A punch ~5.5 km away is 403 `OUTSIDE_GEOFENCE` with `details.distanceMeters` / `radiusMeters` and the distance in the message (EN and ES); no shift opens. Settings back to off. |
| **TC-1797** | `dashboard/owner/api-team-comms` | The owner sends to all staff: 201, text kept as typed, `recipientCount` ≥ 2, `readCount` 0. |
| **TC-1798** | `dashboard/owner/api-team-comms` | Empty title 400 `TITLE_REQUIRED` ("Add a title." / ES "Agrega un título."); empty message `BODY_REQUIRED`; JOBS with no jobs `JOBS_REQUIRED`. |
| **TC-1799** | `dashboard/owner/api-team-comms` | The manager's `managerCapabilities` include `announcements`; she sends to the Driver job: 201, `recipientCount` 1. |
| **TC-1800** | `dashboard/owner/api-team-comms` | Dee's inbox lists both; `/me` carries `announcements: true` and the unread count; opening one records `readAt` and lowers the count; Mia reading the job announcement is 404. |
| **TC-1801** | `dashboard/owner/api-team-comms` | The owner's list shows `readCount` 1; the detail lists Dee read and Mia unread, unread first. |
| **TC-1802** | `dashboard/owner/api-team-comms` | Pin puts it first; archive drops it from the list and the inbox; `includeArchived=true` still shows it with `archivedAt`. |
| **TC-1803** | `dashboard/owner/api-team-comms` | A restaurant without TIMECARDS: announcements (send + list) and the mobile clock-in settings are 403. |
