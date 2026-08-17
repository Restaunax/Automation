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

| Area              | Who Uses It                        | Tests                                                                                                                                                                                                                                |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🌐 Public         | Anyone on the internet             | TC-01, TC-02, TC-59 → TC-61, TC-74, TC-75, TC-93 → TC-96                                                                                                                                                                             |
| 🔐 Admin          | Internal Restaunax staff           | TC-03 → TC-12, TC-32, TC-76, TC-77, TC-98, TC-101 → TC-124 (user management, `users.spec.ts`)                                                                                                                                        |
| 🏠 Owner          | Restaurant owners                  | TC-13 → TC-16, TC-19 → TC-21, TC-27 → TC-31, TC-35, TC-42 → TC-53 (excl. TC-22–26), TC-62 → TC-70, TC-78, TC-82 → TC-92, TC-127 → TC-129, TC-131 → TC-142, TC-145 → TC-164, TC-224, TC-225, TC-231 → TC-254, TC-262, TC-288 → TC-319 |
| 🛒 Customer       | People ordering food               | TC-22 → TC-26, TC-64, TC-99, TC-125, TC-126, TC-165 → TC-178, TC-184 → TC-197                                                                                                                                                        |
| 🍳 POS            | Restaurant kitchen / tablet        | TC-100 (`--project=pos`)                                                                                                                                                                                                             |
| 🔒 Access Control | Testing role/permission boundaries | TC-54 → TC-58, TC-71 → TC-73, TC-81                                                                                                                                                                                                  |
| 🚪 Onboarding     | New restaurant owners              | TC-93 → TC-97, TC-182, TC-183 (spans Public sign-up and Employee restaurant creation)                                                                                                                                                |
| 👔 Employee       | Company-side setup staff           | TC-143, TC-144, TC-182, TC-183 (TC-17/18 tax and TC-97 also run under the EMPLOYEE role)                                                                                                                                             |
| 🌐 API-Level      | No UI — direct backend calls       | TC-65, TC-66, TC-68, TC-69, TC-79, TC-80, TC-255 → TC-261 (`api-orders.spec.ts`), TC-263 → TC-287 (`api-menu.spec.ts`), TC-323, TC-324                                                                                               |

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

1. The test opens the Restaunax demo booking page
2. It fills in the form with a test contact's details:
   - First name, last name, email address, phone number
   - Restaurant name and preferred way to be contacted
3. It checks the box agreeing to the terms
4. It clicks the Submit button
5. It checks that a success message appears on screen

### Why it matters

This is how potential new restaurant clients first contact Restaunax. If this form is broken, Restaunax loses leads — no one can request a demo.

---

## TC-02 — Confirmation Email Is Sent After Demo Request

**Status:** ⏭️ Skipped (email testing account not connected yet)

### What it checks

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

**Status:** ✅ Passing

### What it checks

Clicking "Send Follow-up Email" opens a pre-filled email (subject and body already written from a template) that the admin can send — and sending it actually delivers an email and updates the request's status.

### How it works, step by step

1. The test opens the Actions menu and clicks "Send Follow-up Email"
2. It clicks "Send Email" on the pre-filled dialog
3. It confirms the request's status badge changes from "New" to "Contacted"
4. If email testing is configured (Mailpit), it also confirms a real email actually arrived in the test inbox
5. It resets the status back to "New" so it doesn't affect other tests that expect a fresh request

### Why it matters

This is the core outreach action in the sales process. If sending silently failed, prospects would never hear back and the admin would have no way of knowing — the status change is what previously made this dialog untested beyond "does it open."

> Previously this test only confirmed the dialog opened, without ever clicking Send.

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
3. It finds the seed test restaurant by name in the table and confirms its row is visible

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

TC-90 explicitly scoped the order-detail dialog to read-only assertions, leaving status change entirely uncovered. Also surfaced (not new — re-confirms an already-documented finding) that `PUT /api/order/orderId/:id/status` still has no auth/permission middleware live on QA; see `TEST_COVERAGE.md`'s Known Technical Debt (`TC-100`/`TC-179`).

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
| **TC-248** | Export → Current View downloads `orders_<date>[…].csv`; the POST carries `exportType:"current"` + the search; the CSV has the 32 documented columns and exactly the three named seed rows; adding the Pending filter narrows the CSV to A.                                                                                                     | First real export test (TC-135 only checked the button existed).                                                                      |
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
| **TC-260** | Export with no matching rows → `400 "No orders found"`; a matching export streams a 32-column CSV containing our seeded receipt.                                                                                          |
| **TC-261** | `sortBy=total&sortDirection=asc` is non-decreasing; `limit=2` caps the page and `totalPages = ceil(totalCount / 2)`.                                                                                                      |

Deferred on purpose (decision 2026-08-15): auth / tenant-isolation pins (TC-226..230) — see `docs/ORDERS_TAB_TEST_STRATEGY.md` §1 / §4-P0.

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
3. It confirms the dashboard header loaded — the "Restaurant Analytics" title, the Refresh control, and the date-range selector are all visible

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
3. Confirm the dashboard resolves again (cards or empty state) with no load error

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

## TC-42 — Owner Can Edit a Menu Category Name

**Status:** ⏭️ Skipped — no edit button on category header in the current menu editor UI

### What it checks

An owner can rename an existing menu category and see the updated name reflected in the menu list.

### How it works, step by step

1. The test navigates to the Menu tab for the seed restaurant
2. It clicks the edit icon on the "Test Starters" category created in TC-20
3. It clears the name and types a new one ("Test Starters Edited")
4. It clicks Save and confirms the renamed category is visible

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

**Status:** ✅ Passing (6 deliberate `test.fail()` pins — see below)

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

| TC         | What it checks                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-288** | Sidebar Menu → "Menu Availability Management"; seeded category "6 Available"; Manage Menu → builder.                                                    |
| **TC-289** | Switch OFF → ConsequenceDialog "Mark "X" as sold out?" → PATCH `{outOfStock:true}` → chips 5/1 + toast; ON → no dialog; Cancel keeps it available.      |
| **TC-290** | "Restore All to Available" appears only with out-of-stock items; its dialog names the count; restores the whole category.                               |
| **TC-291** | Star → Featured accordion `n/5`; un-star; the 6th is refused with the cap error while the counter stays 5/5.                                            |
| **TC-292** | Refresh re-fetches and reflects a change made via API behind the page.                                                                                  |
| **TC-293** | A menu-less restaurant shows "No menu data available" → "Open menu builder" (which, for a hours-less restaurant, is CreateStore's Business Hours step). |

### Builder, wizard, item detail (`04c-menu-item-editor.spec.ts`)

| TC               | What it checks                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-294**       | New Category presets; duplicate name → "already exists in category".                                                                                    |
| **TC-295**       | Wizard step-0 rules: min 2 chars, price > 0 (QA build says "Price must be positive"), ≤ $9,999.99, description ≤ 500.                                   |
| **TC-296**       | Wizard saves an item with a Sets-Final-Price size group, a paid extra (Allow Multiples) and a free group; API stores the modes; detail page lists them. |
| **TC-297**       | Wizard image step uploads a PNG through the hidden file input; item carries `imageUrls`.                                                                |
| **TC-298**       | "Start from a Template" (lazy per cuisine → Pizza) prefills name/price.                                                                                 |
| **TC-299**       | Clone Item → wizard prefilled "<name> (Copy)" → second independent item.                                                                                |
| **TC-300**       | Card click → item detail page; Edit → edit wizard; Back returns.                                                                                        |
| **TC-301**       | Detail Upload (dialog → Save changes) / Remove Image (confirm) round-trip.                                                                              |
| **TC-302**       | Detail Delete → soft delete: builder card badged "No longer available", merged-menu read hides it, detail shows the inactive banner.                    |
| **TC-303**       | Delete blocked by an active deal → "Cannot Delete This Item" dialog listing the deal.                                                                   |
| **TC-304**       | Reorder modifiers — keyboard drag in the dnd-kit sheet persists the order.                                                                              |
| **TC-305**       | Card star toggles featured; Menu tab's Featured accordion reflects it.                                                                                  |
| **TC-306 / 307** | Presence smokes: Clone Menu dialog; AI Menu Import / Bulk AI Images / Paste Menu Item dialogs open and close (nothing generated).                       |

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
| **TC-319**    | "Manage shared menu" from the chain shell opens the chain-aware LOCATION builder (there is no separate chain builder).                                                                                                                                        |

### Storefront hand-off (`customer/06-menu-handoff.spec.ts`) and admin chains (`admin/chains.spec.ts`)

| TC         | What it checks                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-320** | Owner 86s an item → Template Wind no longer lists it → restore → back.                                                                                              |
| **TC-321** | Per-location override: Wind shows $14 at A and $12 at B; the public `/quote` (what checkout charges) returns 14 at A / 12 at B.                                     |
| **TC-322** | Uncarry at A → absent from Wind A only.                                                                                                                             |
| **TC-323** | Admin links an existing store (menu kept): its own items interleave at that location only; unlink → back to 2.                                                      |
| **TC-324** | Unlink refused for a live store ("gone live") and a non-member (404); cancelling the order lets it leave; admin DELETE only archives and never detaches membership. |

**Real product findings from this batch (2026-08-16):** (1) authenticated IDOR across most `/menu` mutations (TC-283..286 pins); (2) chain "Restore All to Available" doesn't un-86 locations (TC-282 pin); (3) "Reset all to shared" in the per-location pricing dialog doesn't reset saved overrides (TC-317 pin); (4) UX: the caption under the Menu-tab availability switch labels the opposite state (the chip next to the name is correct); (5) `CHANNEL_PRICING_DESIGN.md` says the override routes are unauthenticated — the code mounts them behind `requireAuth` (TC-274 pins the code). The "shown $14, charged $12" chain defect described in that design doc is **fixed on QA** (TC-321 proves the quote uses the override).

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
2. The test seeds the cart, types the code into the checkout coupon box, clicks Apply, and verifies the discount appears (a "Saving $X.XX" block and a "Coupon (CODE)" line in the order summary).
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
3. Click Delivery, type an address into the Google Places autocomplete, and pick the first suggestion. If Google Places returns no suggestion (external dependency), the test **skips** with a clear reason.
4. Assert the quote resolved — the green "Delivery Available" fee box **or** the red "Delivery Not Available" box. Both prove `/api/delivery/quote` fired and the UI handled it. No Stripe, no order placed.

### Why it matters

Delivery had zero coverage — every prior order test used Pickup. A broken address field, quote call, or unhandled out-of-area response would ship unnoticed. The graceful skips keep it honest on restaurants/environments where delivery genuinely isn't configured.

---

## TC-165–170 — Gift Card Purchase and Balance Check

**Status:** ✅ TC-167–170 passing (needs `TEMPLATE_WIND_URL` + `ADMIN_EMAIL`/`ADMIN_PASSWORD`). TC-165/TC-166 (the two Stripe-payment purchase flows) are `test.fixme` as of 2026-07-11 — intermittently blocked by Stripe Radar's invisible hCaptcha challenge on the Pay click, confirmed via live network trace, not a product or test-code bug. See TEST_COVERAGE.md's Known Technical Debt.

### What they check

Gift cards had **zero test coverage anywhere** before this pass — no POM, no API helper, not one test. This batch covers the `/gift-cards` purchase page end to end as a guest: TC-165 (preset denomination, "Send as Gift"), TC-166 (custom amount within the restaurant's configured range), TC-167/TC-168 (custom amount below/above range blocked client-side), TC-169 (the public balance-check tool shows the correct balance for a freshly purchased code), TC-170 (balance check shows "not found" for a bogus code).

### How it works, step by step

1. Fetch the restaurant's live gift-card config (`GET /api/gift-cards/config/restaurant/:id`) to compute realistic amounts instead of hardcoding assumed min/max defaults.
2. Pick a preset or type a custom amount, choose "Send as Gift" (guest-accessible — unlike "For Myself", which requires login), fill a recipient email, continue to payment, and fill a Stripe test card via the shared `fillStripePaymentElement` helper (extended to also fill an optional billing ZIP field this purchase flow's Payment Element configuration requires but checkout's doesn't).
3. Read the formatted code off the confirmation screen; look up its DB id via the admin gift-card list (search on the sanitized, dash-stripped code — the admin API masks codes in list results but searches the raw column) and record it in a cleanup file.
4. `globalTeardown` best-effort **freezes** every recorded test gift card at the end of the run — there's no delete endpoint for gift cards (only freeze), unlike coupons.

### Why it matters

Gift cards are real revenue with real Stripe charges. An amount-validation regression, a broken confirmation screen, or a balance-check tool that silently shows the wrong number would have shipped with zero warning.

---

## TC-171–178 — Gift Card Redemption at Checkout

**Status:** ✅ Passing, except TC-177 (`test.fixme` — real bug, see below)

### What they check

The checkout-side "Gift Card" box (`RewardSection`), seeded via the public purchase endpoint and admin freeze/adjust endpoints rather than the purchase UI (faster, and mirrors how `createCouponRaw` seeds coupons for checkout tests): TC-171 (valid card applied shows the discount), TC-172 (Remove clears it), TC-173 (invalid code rejected), TC-174 (a card manually depleted to $0 via admin adjust is rejected), TC-175 (an admin-frozen card is rejected), TC-176 (a coupon and a gift card both apply to the same order simultaneously — currently-supported behavior, not a test of the separate `canCombineWithCoupons` config flag, which isn't enforced by either side today), TC-178 (a card that only partially covers the total still routes the remainder through Stripe).

### Why it matters

Same reasoning as coupons (TC-125) — the discount math and rejection paths are exactly the kind of thing that silently breaks and overcharges or undercharges a customer with no error anywhere.

### A real bug found along the way (TC-177, `test.fixme`)

TC-177 set out to prove a gift card that fully covers an order's total skips Stripe entirely (per `checkout/page.tsx`'s documented $0-total branch). Live network tracing during authoring showed something different: `POST /api/order/new/...` succeeds (**201** — the order **is** created), but the frontend then still attempts to create a Stripe PaymentIntent for the now-$0 remainder anyway, which the backend correctly rejects (**400** — Stripe requires a minimum chargeable amount). The customer is left stuck on the checkout page with a console error and no confirmation screen, even though their order actually went through server-side. Filed as `test.fixme` with the real behavior documented rather than asserting the broken flow as correct — same pattern as TC-92's coupon-edit bug.

---

## TC-184–188 — Customer Checkout Quick Wins

**Status:** ✅ Passing (verified on CI against QA, 2026-07-19)

### What they check

Five previously-untested checkout behaviors, all over existing wiring: TC-184 (the `?item=<id>` landing-page deep link auto-opens that item's modal — no card click), TC-185 (`/checkout` with an empty cart renders the "Your Cart is Empty" screen instead of the form), TC-186 (tip presets and the custom tip input flow into the **server-quoted** total — asserted as relative total movement so no tax-math assumptions), TC-187 (a `minOrderAmount` coupon is **auto-removed** when removing a cart line drops the order below its minimum — CouponSection's debounced revalidation against `/api/coupons/validate`), TC-188 (a $0.25 item quotes a total under Stripe's $0.50 floor — the proceed button disables with "Minimum $0.50 Required" plus the explainer banner, and no order is ever created).

### Notes from authoring

Two findings worth keeping: (1) the backend's "Order must be at least $X to use this coupon" revalidation message renders only **transiently** before the next revalidation cycle clears it, so TC-187 asserts the removal itself (applied block gone, box back to code-entry state), not the error copy; (2) cleaning up a seeded menu category requires **permanent** (admin) item deletion first — soft-deleted items still trip the category-delete guard (the TC-67 rule), which is why TC-188's fixture teardown passes the admin token. TC-188's cheap item is real, not just a sessionStorage entry, because the server quote reprices the cart from DB prices.

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

The deal purchase path, previously zero coverage: TC-195 (opening `/deals/<id>` auto-adds the deal to the cart, per-slot progress shows "0 of 1 items added", filling the slot via "Add to Deal" flips to "Deal Complete!" and checkout offers the normal Proceed to Payment button), TC-196 (an unfilled slot leaves checkout's proceed button disabled and labeled "Complete Deals to Continue"), TC-197 (with a deal in the cart, applying **any** coupon code is blocked client-side with "Cannot combine coupons with deals" — the check fires before validation, so no seeded coupon is needed).

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
5. It navigates "Back to chains" and confirms the new chain's row is visible in the grid
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

| #               | Test Case                                                                                                                                                                                                                                                                                                                                                       | Area                  | Status                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01           | Demo request form works                                                                                                                                                                                                                                                                                                                                         | Public                | ✅ Passing                                                                                                                                |
| TC-02           | Confirmation email is sent                                                                                                                                                                                                                                                                                                                                      | Public                | ⏭️ Skipped                                                                                                                                |
| TC-03           | Admin can log in                                                                                                                                                                                                                                                                                                                                                | Admin                 | ✅ Passing                                                                                                                                |
| TC-04           | Admin finds demo request                                                                                                                                                                                                                                                                                                                                        | Admin                 | ✅ Passing                                                                                                                                |
| TC-05           | Admin opens actions menu                                                                                                                                                                                                                                                                                                                                        | Admin                 | ✅ Passing                                                                                                                                |
| TC-06           | Admin changes demo status                                                                                                                                                                                                                                                                                                                                       | Admin                 | ✅ Passing                                                                                                                                |
| TC-07           | Admin edits and saves notes on a demo request                                                                                                                                                                                                                                                                                                                   | Admin                 | ✅ Passing                                                                                                                                |
| TC-08           | Admin sends a follow-up email (status flips, email delivered)                                                                                                                                                                                                                                                                                                   | Admin                 | ✅ Passing                                                                                                                                |
| TC-09           | Delete confirmation + cancel works                                                                                                                                                                                                                                                                                                                              | Admin                 | ✅ Passing                                                                                                                                |
| TC-98           | Admin permanently deletes a demo request                                                                                                                                                                                                                                                                                                                        | Admin                 | ✅ Passing                                                                                                                                |
| TC-10           | Admin assigns a demo request to a team member                                                                                                                                                                                                                                                                                                                   | Admin                 | ✅ Passing                                                                                                                                |
| TC-11           | Admin schedules a demo (status flips to Scheduled)                                                                                                                                                                                                                                                                                                              | Admin                 | ✅ Passing                                                                                                                                |
| TC-12           | Proceed to onboarding navigates correctly                                                                                                                                                                                                                                                                                                                       | Admin                 | ✅ Passing                                                                                                                                |
| TC-101 → TC-118 | Admin user management: invite, search/filter, detail sheet, role/status/permissions (no TC-108)                                                                                                                                                                                                                                                                 | Admin                 | ✅ Passing (invite/reset tagged `@email` — run via `npm run test:email`)                                                                  |
| TC-76 / TC-77   | Role/status changes with bad input are rejected (API negatives)                                                                                                                                                                                                                                                                                                 | Admin                 | ✅ Passing                                                                                                                                |
| TC-123          | Invited user claims access and logs in with the right access level                                                                                                                                                                                                                                                                                              | Admin                 | ✅ Passing (tagged `@email` — run via `npm run test:email`)                                                                               |
| TC-124          | A bogus invite token grants no elevated access                                                                                                                                                                                                                                                                                                                  | Admin                 | ✅ Passing                                                                                                                                |
| TC-13           | Owner sees My Restaurants page                                                                                                                                                                                                                                                                                                                                  | Owner                 | ✅ Passing                                                                                                                                |
| TC-14           | Owner sees their restaurant card                                                                                                                                                                                                                                                                                                                                | Owner                 | ✅ Passing                                                                                                                                |
| TC-15           | Owner opens restaurant management portal                                                                                                                                                                                                                                                                                                                        | Owner                 | ✅ Passing                                                                                                                                |
| TC-16           | Owner navigates to Store Settings                                                                                                                                                                                                                                                                                                                               | Owner                 | ✅ Passing                                                                                                                                |
| TC-17           | Employee opens tax settings page                                                                                                                                                                                                                                                                                                                                | Employee              | ✅ Passing                                                                                                                                |
| TC-18           | Employee saves a tax rate                                                                                                                                                                                                                                                                                                                                       | Employee              | ✅ Passing                                                                                                                                |
| TC-19           | Owner opens menu management                                                                                                                                                                                                                                                                                                                                     | Owner                 | ✅ Passing                                                                                                                                |
| TC-20           | Owner creates a menu category                                                                                                                                                                                                                                                                                                                                   | Owner                 | ✅ Passing                                                                                                                                |
| TC-21           | Owner adds a menu item                                                                                                                                                                                                                                                                                                                                          | Owner                 | ✅ Passing                                                                                                                                |
| TC-22           | Customer sees menu page                                                                                                                                                                                                                                                                                                                                         | Customer              | ✅ Passing                                                                                                                                |
| TC-23           | Customer opens item and sees Add to Cart                                                                                                                                                                                                                                                                                                                        | Customer              | ✅ Passing                                                                                                                                |
| TC-24           | Customer reaches checkout with cart                                                                                                                                                                                                                                                                                                                             | Customer              | ✅ Passing                                                                                                                                |
| TC-25           | Customer fills details and reaches payment                                                                                                                                                                                                                                                                                                                      | Customer              | ✅ Passing                                                                                                                                |
| TC-26           | Customer completes full order end to end                                                                                                                                                                                                                                                                                                                        | Customer              | ✅ Passing                                                                                                                                |
| TC-99           | Customer adds to cart and reaches checkout via the real UI                                                                                                                                                                                                                                                                                                      | Customer              | ✅ Passing                                                                                                                                |
| TC-125          | Customer applies a coupon at checkout (valid + bogus)                                                                                                                                                                                                                                                                                                           | Customer              | ✅ Passing                                                                                                                                |
| TC-126          | Selecting Delivery drives the address → quote round-trip                                                                                                                                                                                                                                                                                                        | Customer              | ✅ Passing / graceful skip                                                                                                                |
| TC-100          | Restaurant receives + processes an order (POS lifecycle)                                                                                                                                                                                                                                                                                                        | POS                   | ✅ Passing (`--project=pos`)                                                                                                              |
| TC-27           | Owner reaches the publish page                                                                                                                                                                                                                                                                                                                                  | Owner                 | ⏭️ Skipped                                                                                                                                |
| TC-28           | Publish checklist items are visible                                                                                                                                                                                                                                                                                                                             | Owner                 | ⏭️ Skipped                                                                                                                                |
| TC-29           | Owner views the Orders tab                                                                                                                                                                                                                                                                                                                                      | Owner                 | ✅ Passing                                                                                                                                |
| TC-30           | Owner opens the Create Coupon form                                                                                                                                                                                                                                                                                                                              | Owner                 | ✅ Passing                                                                                                                                |
| TC-31           | Owner creates a new coupon                                                                                                                                                                                                                                                                                                                                      | Owner                 | ✅ Passing                                                                                                                                |
| TC-32           | Admin sees the Restaurants list                                                                                                                                                                                                                                                                                                                                 | Admin                 | ✅ Passing                                                                                                                                |
| TC-33           | Owner configures hours of operation                                                                                                                                                                                                                                                                                                                             | Owner                 | ⏭️ Not yet implemented (narrative placeholder, no test code)                                                                              |
| TC-34           | Owner accesses employee management                                                                                                                                                                                                                                                                                                                              | Owner                 | ⏭️ Not yet implemented (narrative placeholder, no test code)                                                                              |
| TC-35           | Owner views the analytics dashboard                                                                                                                                                                                                                                                                                                                             | Owner                 | ✅ Passing                                                                                                                                |
| TC-42           | Owner renames a menu category                                                                                                                                                                                                                                                                                                                                   | Owner                 | ⏭️ Skipped                                                                                                                                |
| TC-43           | Owner edits a menu item name and price                                                                                                                                                                                                                                                                                                                          | Owner                 | ✅ Passing                                                                                                                                |
| TC-44           | Owner deletes a menu item                                                                                                                                                                                                                                                                                                                                       | Owner                 | ⏭️ Skipped                                                                                                                                |
| TC-45           | Owner deletes a menu category                                                                                                                                                                                                                                                                                                                                   | Owner                 | ✅ Passing                                                                                                                                |
| TC-46           | Owner opens the Stripe setup page                                                                                                                                                                                                                                                                                                                               | Owner                 | ✅ Passing                                                                                                                                |
| TC-47           | Stripe stepper shows all 4 steps                                                                                                                                                                                                                                                                                                                                | Owner                 | ✅ Passing                                                                                                                                |
| TC-48           | Stripe page shows header description                                                                                                                                                                                                                                                                                                                            | Owner                 | ✅ Passing                                                                                                                                |
| TC-49           | Owner sees Set Up Stripe Account button                                                                                                                                                                                                                                                                                                                         | Owner                 | ✅ Passing                                                                                                                                |
| TC-50           | Stripe requirements section is visible                                                                                                                                                                                                                                                                                                                          | Owner                 | ✅ Passing                                                                                                                                |
| TC-51           | Stripe success callback page loads                                                                                                                                                                                                                                                                                                                              | Owner                 | ✅ Passing                                                                                                                                |
| TC-52           | Restaurant Dashboard button redirects correctly                                                                                                                                                                                                                                                                                                                 | Owner                 | ✅ Passing                                                                                                                                |
| TC-53           | Connect button calls create API and redirects                                                                                                                                                                                                                                                                                                                   | Owner                 | ✅ Passing                                                                                                                                |
| TC-54           | OWNER denied `/publish` route                                                                                                                                                                                                                                                                                                                                   | Access Control        | ✅ Passing                                                                                                                                |
| TC-55           | OWNER denied `/tax` route                                                                                                                                                                                                                                                                                                                                       | Access Control        | ✅ Passing                                                                                                                                |
| TC-56           | Owner can reach shared menu management                                                                                                                                                                                                                                                                                                                          | Access Control        | ✅ Passing                                                                                                                                |
| TC-57           | Admin can reach shared menu management                                                                                                                                                                                                                                                                                                                          | Access Control        | ✅ Passing                                                                                                                                |
| TC-58           | Employee can reach shared menu management                                                                                                                                                                                                                                                                                                                       | Access Control        | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                                                                                             |
| TC-59           | Valid credentials reach the dashboard                                                                                                                                                                                                                                                                                                                           | Public                | ✅ Passing                                                                                                                                |
| TC-60           | Invalid credentials show an error                                                                                                                                                                                                                                                                                                                               | Public                | ✅ Passing                                                                                                                                |
| TC-61           | Unknown email shows an error                                                                                                                                                                                                                                                                                                                                    | Public                | ✅ Passing                                                                                                                                |
| TC-62           | Menu item wizard blocks blank name/price                                                                                                                                                                                                                                                                                                                        | Owner                 | ✅ Passing                                                                                                                                |
| TC-63           | Invalid coupon discount % is rejected                                                                                                                                                                                                                                                                                                                           | Owner                 | ✅ Passing                                                                                                                                |
| TC-64           | Declined card shows a payment error                                                                                                                                                                                                                                                                                                                             | Customer              | ✅ Passing (needs `TEMPLATE_WIND_URL`)                                                                                                    |
| TC-65           | Menu item with no name rejected (API)                                                                                                                                                                                                                                                                                                                           | API-Level             | ✅ Passing                                                                                                                                |
| TC-66           | Coupon with no code rejected (API)                                                                                                                                                                                                                                                                                                                              | API-Level             | ✅ Passing                                                                                                                                |
| TC-68           | Coupon with negative discount rejected (API)                                                                                                                                                                                                                                                                                                                    | API-Level             | ✅ Passing                                                                                                                                |
| TC-69           | Garbage Bearer token rejected (API)                                                                                                                                                                                                                                                                                                                             | API-Level             | ✅ Passing                                                                                                                                |
| TC-70           | Nonexistent order search shows empty state                                                                                                                                                                                                                                                                                                                      | Owner                 | ✅ Passing                                                                                                                                |
| TC-71           | Unauthenticated visitor redirected from `/restaurant/stores`                                                                                                                                                                                                                                                                                                    | Access Control        | ✅ Passing                                                                                                                                |
| TC-72           | Unauthenticated visitor redirected from `/admin`                                                                                                                                                                                                                                                                                                                | Access Control        | ✅ Passing                                                                                                                                |
| TC-73           | Unauthenticated visitor redirected from a restaurant management URL                                                                                                                                                                                                                                                                                             | Access Control        | ✅ Passing                                                                                                                                |
| TC-74           | Demo form — unchecked terms blocks submit                                                                                                                                                                                                                                                                                                                       | Public                | ✅ Passing                                                                                                                                |
| TC-75           | Demo form — invalid email blocks submit                                                                                                                                                                                                                                                                                                                         | Public                | ✅ Passing                                                                                                                                |
| TC-76           | Admin — invalid role value rejected (API)                                                                                                                                                                                                                                                                                                                       | Admin                 | ✅ Passing                                                                                                                                |
| TC-77           | Admin — status toggle on nonexistent user rejected (API)                                                                                                                                                                                                                                                                                                        | Admin                 | ✅ Passing                                                                                                                                |
| TC-78           | Failed Stripe create-account shows error                                                                                                                                                                                                                                                                                                                        | Owner                 | ✅ Passing                                                                                                                                |
| TC-79           | Owner without CREATE_RESTAURANT can't self-create (API)                                                                                                                                                                                                                                                                                                         | API-Level             | ✅ Passing                                                                                                                                |
| TC-80           | Demo request with no email rejected (API)                                                                                                                                                                                                                                                                                                                       | API-Level             | ✅ Passing                                                                                                                                |
| TC-81           | OWNER denied `/restaurant/loyalty` route                                                                                                                                                                                                                                                                                                                        | Access Control        | ✅ Passing                                                                                                                                |
| TC-82           | Owner reaches Uber Eats delivery settings                                                                                                                                                                                                                                                                                                                       | Owner                 | ✅ Passing                                                                                                                                |
| TC-83           | Uber Eats delivery configuration section visible                                                                                                                                                                                                                                                                                                                | Owner                 | ✅ Passing                                                                                                                                |
| TC-84           | Owner reaches Subscription Management page                                                                                                                                                                                                                                                                                                                      | Owner                 | ✅ Passing                                                                                                                                |
| TC-85           | Subscription page shows plan details                                                                                                                                                                                                                                                                                                                            | Owner                 | ✅ Passing                                                                                                                                |
| TC-86           | Owner reaches Manage Deals tab                                                                                                                                                                                                                                                                                                                                  | Owner                 | ✅ Passing                                                                                                                                |
| TC-87           | Manage Deals shows Create Deal action                                                                                                                                                                                                                                                                                                                           | Owner                 | ✅ Passing                                                                                                                                |
| TC-88           | Owner edits and saves a Store Settings field                                                                                                                                                                                                                                                                                                                    | Owner                 | ✅ Passing                                                                                                                                |
| TC-89           | Filters button opens the filter panel                                                                                                                                                                                                                                                                                                                           | Owner                 | ✅ Passing                                                                                                                                |
| TC-90           | Order detail view opens                                                                                                                                                                                                                                                                                                                                         | Owner                 | ✅ Passing                                                                                                                                |
| TC-91           | Created coupon visible in Manage Coupons list                                                                                                                                                                                                                                                                                                                   | Owner                 | ✅ Passing                                                                                                                                |
| TC-92           | Owner edits an existing coupon's discount value                                                                                                                                                                                                                                                                                                                 | Owner                 | ✅ Passing — backend #481 fixed (numeric fields coerced on form + update controller)                                                      |
| TC-93           | Visitor registers a new account                                                                                                                                                                                                                                                                                                                                 | Onboarding / Public   | ✅ Passing                                                                                                                                |
| TC-94           | Sign-up — already-used email is rejected                                                                                                                                                                                                                                                                                                                        | Onboarding / Public   | ✅ Passing                                                                                                                                |
| TC-95           | Sign-up — mismatched confirm-password blocks submit                                                                                                                                                                                                                                                                                                             | Onboarding / Public   | ✅ Passing                                                                                                                                |
| TC-96           | Sign-up — weak password rejected client-side                                                                                                                                                                                                                                                                                                                    | Onboarding / Public   | ✅ Passing                                                                                                                                |
| TC-97           | Employee creates a restaurant on behalf of a client                                                                                                                                                                                                                                                                                                             | Onboarding / Employee | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                                                                                             |
| TC-127          | Analytics dashboard resolves (data or empty) without error                                                                                                                                                                                                                                                                                                      | Owner                 | ✅ Passing                                                                                                                                |
| TC-128          | Analytics date-range picker opens with presets                                                                                                                                                                                                                                                                                                                  | Owner                 | ✅ Passing                                                                                                                                |
| TC-129          | Changing the analytics range reloads the dashboard                                                                                                                                                                                                                                                                                                              | Owner                 | ✅ Passing                                                                                                                                |
| TC-131          | Orders grid renders a real column set                                                                                                                                                                                                                                                                                                                           | Owner                 | ✅ Passing                                                                                                                                |
| TC-132          | Filtering by Order Status re-queries the grid                                                                                                                                                                                                                                                                                                                   | Owner                 | ✅ Passing                                                                                                                                |
| TC-133          | Resetting the filters restores the default status                                                                                                                                                                                                                                                                                                               | Owner                 | ✅ Passing                                                                                                                                |
| TC-134          | Order detail dialog shows items and total                                                                                                                                                                                                                                                                                                                       | Owner                 | ✅ Passing                                                                                                                                |
| TC-135          | Orders toolbar exposes an Export control                                                                                                                                                                                                                                                                                                                        | Owner                 | ✅ Passing                                                                                                                                |
| TC-136          | Owner views the Customers directory                                                                                                                                                                                                                                                                                                                             | Owner                 | ✅ Passing                                                                                                                                |
| TC-137          | Customer directory search re-queries the server                                                                                                                                                                                                                                                                                                                 | Owner                 | ✅ Passing                                                                                                                                |
| TC-138          | Owner switches to the Customer Groups (segments) sub-tab                                                                                                                                                                                                                                                                                                        | Owner                 | ✅ Passing                                                                                                                                |
| TC-139          | Owner views the Owner Settings (Automated Reports) form                                                                                                                                                                                                                                                                                                         | Owner                 | ✅ Passing                                                                                                                                |
| TC-140          | Owner Settings Notifications sub-tab shows coming-soon                                                                                                                                                                                                                                                                                                          | Owner                 | ✅ Passing                                                                                                                                |
| TC-141          | Owner views the Daily Report (current business day)                                                                                                                                                                                                                                                                                                             | Owner                 | ✅ Passing                                                                                                                                |
| TC-142          | Seeded orders reflected in today's Daily Report KPIs                                                                                                                                                                                                                                                                                                            | Owner                 | ✅ Passing                                                                                                                                |
| TC-143          | Employee reaches the publish page                                                                                                                                                                                                                                                                                                                               | Employee              | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                                                                                             |
| TC-144          | Employee sees publish checklist items                                                                                                                                                                                                                                                                                                                           | Employee              | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                                                                                             |
| TC-145          | Owner creates a FIXED_AMOUNT coupon                                                                                                                                                                                                                                                                                                                             | Owner                 | ✅ Passing                                                                                                                                |
| TC-146          | Owner creates a FIXED_ITEM coupon                                                                                                                                                                                                                                                                                                                               | Owner                 | ✅ Passing                                                                                                                                |
| TC-147          | FIXED_ITEM with no menu item selected is blocked (native validation)                                                                                                                                                                                                                                                                                            | Owner                 | ✅ Passing                                                                                                                                |
| TC-148          | Non-positive FIXED_AMOUNT value is rejected                                                                                                                                                                                                                                                                                                                     | Owner                 | ✅ Passing                                                                                                                                |
| TC-149          | End date before start date is rejected                                                                                                                                                                                                                                                                                                                          | Owner                 | ✅ Passing                                                                                                                                |
| TC-150          | Empty coupon code is blocked (native validation)                                                                                                                                                                                                                                                                                                                | Owner                 | ✅ Passing                                                                                                                                |
| TC-151          | Duplicate coupon code on the same restaurant is rejected                                                                                                                                                                                                                                                                                                        | Owner                 | ✅ Passing                                                                                                                                |
| TC-152          | Coupon code input truncates at 20 characters                                                                                                                                                                                                                                                                                                                    | Owner                 | ✅ Passing                                                                                                                                |
| TC-153          | Manage Coupons search filters by code                                                                                                                                                                                                                                                                                                                           | Owner                 | ✅ Passing                                                                                                                                |
| TC-154          | Manage Coupons search filters by description                                                                                                                                                                                                                                                                                                                    | Owner                 | ✅ Passing                                                                                                                                |
| TC-155          | Manage Coupons search with no matches shows empty state                                                                                                                                                                                                                                                                                                         | Owner                 | ✅ Passing                                                                                                                                |
| TC-156          | Manage Coupons status filter narrows to Active                                                                                                                                                                                                                                                                                                                  | Owner                 | ✅ Passing                                                                                                                                |
| TC-157          | Manage Coupons table sorts by Code                                                                                                                                                                                                                                                                                                                              | Owner                 | ✅ Passing                                                                                                                                |
| TC-158          | Owner copies a coupon code from the Manage Coupons list                                                                                                                                                                                                                                                                                                         | Owner                 | ✅ Passing                                                                                                                                |
| TC-159          | Duplicate pre-fills a new coupon form from an existing coupon                                                                                                                                                                                                                                                                                                   | Owner                 | ✅ Passing                                                                                                                                |
| TC-160          | Owner deletes a coupon via the typed-confirmation dialog                                                                                                                                                                                                                                                                                                        | Owner                 | ✅ Passing                                                                                                                                |
| TC-161          | Cancelling the delete confirmation leaves the coupon untouched                                                                                                                                                                                                                                                                                                  | Owner                 | ✅ Passing                                                                                                                                |
| TC-162          | Edit pre-fills the form with the coupon's existing values                                                                                                                                                                                                                                                                                                       | Owner                 | ✅ Passing                                                                                                                                |
| TC-163          | Send to Customers is disabled for an expired coupon                                                                                                                                                                                                                                                                                                             | Owner                 | ✅ Passing                                                                                                                                |
| TC-164          | Reset Form clears the create-coupon form back to defaults                                                                                                                                                                                                                                                                                                       | Owner                 | ✅ Passing                                                                                                                                |
| TC-165          | Guest purchases a gift card (preset denomination, Send as Gift)                                                                                                                                                                                                                                                                                                 | Customer              | ⏭️ `test.fixme` — intermittently blocked by Stripe Radar's invisible hCaptcha, see TEST_COVERAGE.md                                       |
| TC-166          | Guest purchases a gift card with a custom amount                                                                                                                                                                                                                                                                                                                | Customer              | ⏭️ `test.fixme` — same cause as TC-165                                                                                                    |
| TC-167          | Custom gift-card amount below the minimum is rejected                                                                                                                                                                                                                                                                                                           | Customer              | ✅ Passing                                                                                                                                |
| TC-168          | Custom gift-card amount above the maximum is rejected                                                                                                                                                                                                                                                                                                           | Customer              | ✅ Passing                                                                                                                                |
| TC-169          | Gift card balance check shows the correct balance                                                                                                                                                                                                                                                                                                               | Customer              | ✅ Passing                                                                                                                                |
| TC-170          | Gift card balance check shows not-found for a nonexistent code                                                                                                                                                                                                                                                                                                  | Customer              | ✅ Passing                                                                                                                                |
| TC-171          | Valid gift card applied at checkout shows the discount                                                                                                                                                                                                                                                                                                          | Customer              | ✅ Passing                                                                                                                                |
| TC-172          | Removing an applied gift card clears the discount                                                                                                                                                                                                                                                                                                               | Customer              | ✅ Passing                                                                                                                                |
| TC-173          | Invalid gift card code is rejected at checkout                                                                                                                                                                                                                                                                                                                  | Customer              | ✅ Passing                                                                                                                                |
| TC-174          | A depleted ($0 balance) gift card is rejected at checkout                                                                                                                                                                                                                                                                                                       | Customer              | ✅ Passing                                                                                                                                |
| TC-175          | A frozen gift card is rejected at checkout                                                                                                                                                                                                                                                                                                                      | Customer              | ✅ Passing                                                                                                                                |
| TC-176          | A coupon and a gift card both apply to the same order                                                                                                                                                                                                                                                                                                           | Customer              | ✅ Passing                                                                                                                                |
| TC-177          | Gift card fully covering the order skips Stripe                                                                                                                                                                                                                                                                                                                 | Customer              | ⏭️ `test.fixme` — real bug: order 201s, then frontend still attempts a doomed $0 PaymentIntent (400), customer stuck with no confirmation |
| TC-178          | Gift card partially covering the order still charges the remainder                                                                                                                                                                                                                                                                                              | Customer              | ✅ Passing                                                                                                                                |
| TC-181          | Admin navigates to Chain Management and sees the chains grid with its default columns                                                                                                                                                                                                                                                                           | Admin                 | ✅ Passing                                                                                                                                |
| TC-182          | Full onboarding chain: sign-up → create → hours → menu → publish checklist → assign → owner sees it                                                                                                                                                                                                                                                             | Onboarding / Employee | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` (checklist step verified live via standalone scratch specs, see write-up)                   |
| TC-183          | Business Hours step: defaults, Open/24 Hours/Closed toggling, advances to Menu                                                                                                                                                                                                                                                                                  | Onboarding / Employee | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` (verified live via ADMIN substitution before commit)                                        |
| TC-184          | `?item=` deep link auto-opens that item's modal                                                                                                                                                                                                                                                                                                                 | Customer              | ✅ Passing                                                                                                                                |
| TC-185          | /checkout with an empty cart shows the empty-cart message                                                                                                                                                                                                                                                                                                       | Customer              | ✅ Passing                                                                                                                                |
| TC-186          | Tip presets and custom tip flow into the server-quoted total                                                                                                                                                                                                                                                                                                    | Customer              | ✅ Passing                                                                                                                                |
| TC-187          | Coupon auto-removed when the cart drops below its minimum order amount                                                                                                                                                                                                                                                                                          | Customer              | ✅ Passing                                                                                                                                |
| TC-188          | Quoted total under Stripe's $0.50 minimum blocks payment                                                                                                                                                                                                                                                                                                        | Customer              | ✅ Passing                                                                                                                                |
| TC-189          | Required modifier group blocks Add to Cart until a selection                                                                                                                                                                                                                                                                                                    | Customer              | ✅ Passing                                                                                                                                |
| TC-190          | maxSelections=1 group behaves as a radio — B replaces A                                                                                                                                                                                                                                                                                                         | Customer              | ✅ Passing                                                                                                                                |
| TC-191          | maxSelections cap disables remaining options in a multi-select group                                                                                                                                                                                                                                                                                            | Customer              | ✅ Passing                                                                                                                                |
| TC-192          | ADJUSTS_PRICE modifier adds its price to the item total                                                                                                                                                                                                                                                                                                         | Customer              | ✅ Passing                                                                                                                                |
| TC-193          | REPLACES_PRICE modifier overrides the base price                                                                                                                                                                                                                                                                                                                | Customer              | ✅ Passing                                                                                                                                |
| TC-194          | allowsDuplicates quantity stepper multiplies the modifier price                                                                                                                                                                                                                                                                                                 | Customer              | ✅ Passing                                                                                                                                |
| TC-195          | Deal builder auto-adds the deal; completing its slot enables checkout                                                                                                                                                                                                                                                                                           | Customer              | ✅ Passing                                                                                                                                |
| TC-196          | Incomplete deal blocks checkout with "Complete Deals to Continue"                                                                                                                                                                                                                                                                                               | Customer              | ✅ Passing                                                                                                                                |
| TC-197          | A coupon cannot be combined with a deal in the cart                                                                                                                                                                                                                                                                                                             | Customer              | ✅ Passing                                                                                                                                |
| TC-223          | Admin creates a chain from an API-seeded founding restaurant via the real Create Chain UI flow                                                                                                                                                                                                                                                                  | Admin                 | ✅ Passing                                                                                                                                |
| TC-224          | Owner advances an order's status via the "Mark as X" button                                                                                                                                                                                                                                                                                                     | Owner                 | ✅ Passing                                                                                                                                |
| TC-225          | Owner cancels a Stripe-paid order and triggers a real refund                                                                                                                                                                                                                                                                                                    | Owner                 | ✅ Passing                                                                                                                                |
| TC-231 → TC-252 | Orders tab deep coverage: search hits (receipt/name/email), search-mode banner, status/type filters return the right rows, filter badge, sort, pagination, refresh, detail money/items/customer/delivery, full pickup + delivery lifecycles, unpaid cancel, Keep Order, CSV export content, export disabled at 0, header stats, empty date range, bad deep link | Owner                 | ✅ Passing                                                                                                                                |
| TC-253          | Customer's real Stripe order reaches the owner (same receipt/items/total/contact) and is worked to Picked Up                                                                                                                                                                                                                                                    | Owner                 | ✅ Passing                                                                                                                                |
| TC-254          | After Cancel & Refund: customer-side read is REFUNDED, second refund rejected, refund email received                                                                                                                                                                                                                                                            | Owner                 | ✅ Passing (email step needs `MAILPIT_BASE_URL`)                                                                                          |
| TC-255 → TC-261 | Orders API contract: invalid status 400, cancel-twice 400, refund-unpaid 400, INITIALIZED hidden by default, backwards move pinned (259b fixme), export 0-rows 400 + 32-col CSV, sort/paging                                                                                                                                                                    | API-Level (Owner)     | ✅ Passing (TC-259b ⏭️ fixme)                                                                                                             |
| TC-262          | Search by customer phone number finds the order (regression guard for the int4-overflow 500 fixed in RestauNax #589)                                                                                                                                                                                                                                            | Owner                 | ✅ Passing                                                                                                                                |

A 2026-07-11 pass added TC-182/183, the first chained end-to-end onboarding test and dedicated Business Hours coverage — see their write-ups above for two real product findings surfaced along the way (no dashboard UI path to assign a new owner; an assign-restaurant 500 on a request that actually succeeded). See `docs/onboarding-product-fix-proposal.md`.

A 2026-07-19 pass added TC-184–188 (customer checkout quick wins: item deep link, empty cart, tip → server quote, coupon minimum-order revalidation, Stripe $0.50 floor — all passing; see the write-up above). This batch is the first coverage added under the new wind-deploy trigger model, where every push to template-wind's `qa` branch runs the customer project automatically. The same pass added TC-189–194 (ItemModal modifier rules — required groups, radio semantics, selection caps, ADJUSTS/REPLACES pricing, duplicate quantities), all passing. And TC-195–197 (deal builder, incomplete-deal checkout gate, deal↔coupon exclusion — the deal purchase path's first coverage), all passing.

**144 passing · 21 skipped · 1 failing (env-only)** — as of 2026-07-10. The one failure (TC-58) fails only in environments without `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` set; it passes wherever those credentials exist. (Owner-side expansion on 2026-07-07 added TC-35 + TC-127–129 for the Analytics tab, TC-131–135 deepening the Orders tab, TC-136–138 for the Customers tab, TC-139–140 for the Owner Settings tab, and TC-141–142 for the Daily Report tab — all passing. A 2026-07-10 pass added TC-145–164, expanding Coupons UI coverage far beyond the original 4 tests: all three discount types, the full Manage Coupons list (search/filter/sort/copy), and row actions — duplicate, delete, edit-prefill, and disabled Send-to-Customers. Two of these (TC-147, TC-150) surfaced a real UX finding: the code and menu-item fields rely on native HTML5 `required` validation, so the app's own custom error text for those specific fields never has a chance to render — the browser's native constraint-validation UI intercepts the submit first. A same-day follow-up pass added TC-165–178, giving gift cards their first-ever coverage (purchase + checkout redemption) and expanding the customer-checkout coupon path beyond the original single combined test — this also required setting `TEMPLATE_WIND_URL` for the first time in this environment, which surfaced and fixed several previously-latent regressions in the whole customer suite: the checkout coupon Apply button colliding with the new (unconditionally-rendered) gift-card Apply button, a `seedCart()` race that could leave a prior coupon/gift-card applied across re-seeds within one test, a stale rejection-message regex, `selectPickup()` targeting a since-removed radio input (the control is now a button), and a stale order-number regex on the confirmation page.)

Skipped tests fall into four groups: **route access** (TC-27, TC-28, TC-81 — publish/tax/loyalty are employee/admin-only and return Access Denied for the owner role); **missing UI** (TC-42, TC-44 — the edit/delete buttons don't exist in the current menu editor); **missing credentials in this environment** (TC-58, TC-97, plus TC-17/TC-18 in environments without `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`; TC-02 without `MAILPIT_BASE_URL`); and **real bugs** (TC-177 — a gift card fully covering an order 201s the order but then fails a doomed $0 Stripe PaymentIntent — filed as `test.fixme` with the exact error rather than asserting broken behavior as correct; TC-92's coupon-edit 500 was fixed under RestauNax #481 and is now a passing test). TC-33 and TC-34 remain narrative-only placeholders with no test code at all — not the same as a skipped/fixme test.

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
