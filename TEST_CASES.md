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

| Area              | Who Uses It                        | Tests                                                                                                            |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 🌐 Public         | Anyone on the internet             | TC-01, TC-02, TC-59 → TC-61, TC-74, TC-75, TC-93 → TC-96                                                         |
| 🔐 Admin          | Internal Restaunax staff           | TC-03 → TC-12, TC-32, TC-76, TC-77, TC-98, TC-101 → TC-124 (user management, `users.spec.ts`)                    |
| 🏠 Owner          | Restaurant owners                  | TC-13 → TC-16, TC-19 → TC-21, TC-27 → TC-31, TC-42 → TC-53 (excl. TC-22–26), TC-62 → TC-70, TC-78, TC-82 → TC-92 |
| 🛒 Customer       | People ordering food               | TC-22 → TC-26, TC-64, TC-99, TC-125, TC-126                                                                      |
| 🍳 POS            | Restaurant kitchen / tablet        | TC-100 (`--project=pos`)                                                                                         |
| 🔒 Access Control | Testing role/permission boundaries | TC-54 → TC-58, TC-71 → TC-73, TC-81                                                                              |
| 🚪 Onboarding     | New restaurant owners              | TC-93 → TC-97 (spans Public sign-up and Employee restaurant creation)                                            |
| 👔 Employee       | Company-side setup staff           | TC-143, TC-144 (TC-17/18 tax and TC-97 also run under the EMPLOYEE role)                                         |
| 🌐 API-Level      | No UI — direct backend calls       | TC-65, TC-66, TC-68, TC-69, TC-79, TC-80                                                                         |

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

This test requires a special email testing service (Mailtrap) to be connected. Once configured, it will run automatically.

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
4. If email testing is configured (Mailtrap), it also confirms a real email actually arrived in the test inbox
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

> **Note:** TC-33, TC-34, and TC-35 below are narrative placeholders for
> features that still have no test code at all (no `test()` or `test.skip()`
> call anywhere in `tests/`) — unlike most other "Skipped" entries in this
> doc, which correspond to a real `test.skip()`/`test.fixme()` in the suite.
> They're kept as a backlog description, not a status report on existing code.

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

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to the Analytics section and see summary metrics like total orders or total revenue.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Analytics" in the sidebar
3. It confirms the analytics dashboard loads with at least one key metric visible (e.g. Total Orders, Total Revenue, or Total Sales)

### Why it matters

Analytics is how owners track the performance of their restaurant. Without it, they have no visibility into revenue trends, popular items, or customer behavior.

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

## TC-100 — Restaurant Receives and Processes an Order Through the POS Lifecycle

**Status:** ✅ Passing (needs `OWNER_EMAIL`/`OWNER_PASSWORD`); run with `--project=pos`

### What it checks

The other half of the core business loop. TC-26 proves a customer can _place_ an order; TC-100 proves the restaurant _receives_ it and can drive it through the kitchen lifecycle. API-level, because the POS is a React Native app (`device-in-store`) — these tests hit the same backend the device talks to.

### How it works, step by step

1. `beforeAll`: owner API login; provision a POS tablet device (returns a one-time plaintext code); tablet logs in for a real POS session.
2. A customer order is seeded via the public order API with `total: 0`, which the backend marks paid (`PENDING`) with no Stripe.
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

# 📊 Test Summary

| #      | Test Case                                                           | Area                  | Status                                                       |
| ------ | ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| TC-01  | Demo request form works                                             | Public                | ✅ Passing                                                   |
| TC-02  | Confirmation email is sent                                          | Public                | ⏭️ Skipped                                                   |
| TC-03  | Admin can log in                                                    | Admin                 | ✅ Passing                                                   |
| TC-04  | Admin finds demo request                                            | Admin                 | ✅ Passing                                                   |
| TC-05  | Admin opens actions menu                                            | Admin                 | ✅ Passing                                                   |
| TC-06  | Admin changes demo status                                           | Admin                 | ✅ Passing                                                   |
| TC-07  | Admin edits and saves notes on a demo request                       | Admin                 | ✅ Passing                                                   |
| TC-08  | Admin sends a follow-up email (status flips, email delivered)       | Admin                 | ✅ Passing                                                   |
| TC-09  | Delete confirmation + cancel works                                  | Admin                 | ✅ Passing                                                   |
| TC-98  | Admin permanently deletes a demo request                            | Admin                 | ✅ Passing                                                   |
| TC-10  | Admin assigns a demo request to a team member                       | Admin                 | ✅ Passing                                                   |
| TC-11  | Admin schedules a demo (status flips to Scheduled)                  | Admin                 | ✅ Passing                                                   |
| TC-12  | Proceed to onboarding navigates correctly                           | Admin                 | ✅ Passing                                                   |
| TC-13  | Owner sees My Restaurants page                                      | Owner                 | ✅ Passing                                                   |
| TC-14  | Owner sees their restaurant card                                    | Owner                 | ✅ Passing                                                   |
| TC-15  | Owner opens restaurant management portal                            | Owner                 | ✅ Passing                                                   |
| TC-16  | Owner navigates to Store Settings                                   | Owner                 | ✅ Passing                                                   |
| TC-17  | Employee opens tax settings page                                    | Employee              | ✅ Passing                                                   |
| TC-18  | Employee saves a tax rate                                           | Employee              | ✅ Passing                                                   |
| TC-19  | Owner opens menu management                                         | Owner                 | ✅ Passing                                                   |
| TC-20  | Owner creates a menu category                                       | Owner                 | ✅ Passing                                                   |
| TC-21  | Owner adds a menu item                                              | Owner                 | ✅ Passing                                                   |
| TC-22  | Customer sees menu page                                             | Customer              | ✅ Passing                                                   |
| TC-23  | Customer opens item and sees Add to Cart                            | Customer              | ✅ Passing                                                   |
| TC-24  | Customer reaches checkout with cart                                 | Customer              | ✅ Passing                                                   |
| TC-25  | Customer fills details and reaches payment                          | Customer              | ✅ Passing                                                   |
| TC-26  | Customer completes full order end to end                            | Customer              | ✅ Passing                                                   |
| TC-99  | Customer adds to cart and reaches checkout via the real UI          | Customer              | ✅ Passing                                                   |
| TC-125 | Customer applies a coupon at checkout (valid + bogus)               | Customer              | ✅ Passing                                                   |
| TC-126 | Selecting Delivery drives the address → quote round-trip            | Customer              | ✅ Passing / graceful skip                                   |
| TC-100 | Restaurant receives + processes an order (POS lifecycle)            | POS                   | ✅ Passing (`--project=pos`)                                 |
| TC-27  | Owner reaches the publish page                                      | Owner                 | ⏭️ Skipped                                                   |
| TC-28  | Publish checklist items are visible                                 | Owner                 | ⏭️ Skipped                                                   |
| TC-29  | Owner views the Orders tab                                          | Owner                 | ✅ Passing                                                   |
| TC-30  | Owner opens the Create Coupon form                                  | Owner                 | ✅ Passing                                                   |
| TC-31  | Owner creates a new coupon                                          | Owner                 | ✅ Passing                                                   |
| TC-32  | Admin sees the Restaurants list                                     | Admin                 | ✅ Passing                                                   |
| TC-33  | Owner configures hours of operation                                 | Owner                 | ⏭️ Not yet implemented (narrative placeholder, no test code) |
| TC-34  | Owner accesses employee management                                  | Owner                 | ⏭️ Not yet implemented (narrative placeholder, no test code) |
| TC-35  | Owner views the analytics dashboard                                 | Owner                 | ⏭️ Not yet implemented (narrative placeholder, no test code) |
| TC-42  | Owner renames a menu category                                       | Owner                 | ⏭️ Skipped                                                   |
| TC-43  | Owner edits a menu item name and price                              | Owner                 | ✅ Passing                                                   |
| TC-44  | Owner deletes a menu item                                           | Owner                 | ⏭️ Skipped                                                   |
| TC-45  | Owner deletes a menu category                                       | Owner                 | ✅ Passing                                                   |
| TC-46  | Owner opens the Stripe setup page                                   | Owner                 | ✅ Passing                                                   |
| TC-47  | Stripe stepper shows all 4 steps                                    | Owner                 | ✅ Passing                                                   |
| TC-48  | Stripe page shows header description                                | Owner                 | ✅ Passing                                                   |
| TC-49  | Owner sees Set Up Stripe Account button                             | Owner                 | ✅ Passing                                                   |
| TC-50  | Stripe requirements section is visible                              | Owner                 | ✅ Passing                                                   |
| TC-51  | Stripe success callback page loads                                  | Owner                 | ✅ Passing                                                   |
| TC-52  | Restaurant Dashboard button redirects correctly                     | Owner                 | ✅ Passing                                                   |
| TC-53  | Connect button calls create API and redirects                       | Owner                 | ✅ Passing                                                   |
| TC-54  | OWNER denied `/publish` route                                       | Access Control        | ✅ Passing                                                   |
| TC-55  | OWNER denied `/tax` route                                           | Access Control        | ✅ Passing                                                   |
| TC-56  | Owner can reach shared menu management                              | Access Control        | ✅ Passing                                                   |
| TC-57  | Admin can reach shared menu management                              | Access Control        | ✅ Passing                                                   |
| TC-58  | Employee can reach shared menu management                           | Access Control        | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                |
| TC-59  | Valid credentials reach the dashboard                               | Public                | ✅ Passing                                                   |
| TC-60  | Invalid credentials show an error                                   | Public                | ✅ Passing                                                   |
| TC-61  | Unknown email shows an error                                        | Public                | ✅ Passing                                                   |
| TC-62  | Menu item wizard blocks blank name/price                            | Owner                 | ✅ Passing                                                   |
| TC-63  | Invalid coupon discount % is rejected                               | Owner                 | ✅ Passing                                                   |
| TC-64  | Declined card shows a payment error                                 | Customer              | ✅ Passing (needs `TEMPLATE_WIND_URL`)                       |
| TC-65  | Menu item with no name rejected (API)                               | API-Level             | ✅ Passing                                                   |
| TC-66  | Coupon with no code rejected (API)                                  | API-Level             | ✅ Passing                                                   |
| TC-68  | Coupon with negative discount rejected (API)                        | API-Level             | ✅ Passing                                                   |
| TC-69  | Garbage Bearer token rejected (API)                                 | API-Level             | ✅ Passing                                                   |
| TC-70  | Nonexistent order search shows empty state                          | Owner                 | ✅ Passing                                                   |
| TC-71  | Unauthenticated visitor redirected from `/restaurant/stores`        | Access Control        | ✅ Passing                                                   |
| TC-72  | Unauthenticated visitor redirected from `/admin`                    | Access Control        | ✅ Passing                                                   |
| TC-73  | Unauthenticated visitor redirected from a restaurant management URL | Access Control        | ✅ Passing                                                   |
| TC-74  | Demo form — unchecked terms blocks submit                           | Public                | ✅ Passing                                                   |
| TC-75  | Demo form — invalid email blocks submit                             | Public                | ✅ Passing                                                   |
| TC-76  | Admin — invalid role value rejected (API)                           | Admin                 | ✅ Passing                                                   |
| TC-77  | Admin — status toggle on nonexistent user rejected (API)            | Admin                 | ✅ Passing                                                   |
| TC-78  | Failed Stripe create-account shows error                            | Owner                 | ✅ Passing                                                   |
| TC-79  | Owner without CREATE_RESTAURANT can't self-create (API)             | API-Level             | ✅ Passing                                                   |
| TC-80  | Demo request with no email rejected (API)                           | API-Level             | ✅ Passing                                                   |
| TC-81  | OWNER denied `/restaurant/loyalty` route                            | Access Control        | ✅ Passing                                                   |
| TC-82  | Owner reaches Uber Eats delivery settings                           | Owner                 | ✅ Passing                                                   |
| TC-83  | Uber Eats delivery configuration section visible                    | Owner                 | ✅ Passing                                                   |
| TC-84  | Owner reaches Subscription Management page                          | Owner                 | ✅ Passing                                                   |
| TC-85  | Subscription page shows plan details                                | Owner                 | ✅ Passing                                                   |
| TC-86  | Owner reaches Manage Deals tab                                      | Owner                 | ✅ Passing                                                   |
| TC-87  | Manage Deals shows Create Deal action                               | Owner                 | ✅ Passing                                                   |
| TC-88  | Owner edits and saves a Store Settings field                        | Owner                 | ✅ Passing                                                   |
| TC-89  | Filters button opens the filter panel                               | Owner                 | ✅ Passing                                                   |
| TC-90  | Order detail view opens                                             | Owner                 | ✅ Passing                                                   |
| TC-91  | Created coupon visible in Manage Coupons list                       | Owner                 | ✅ Passing                                                   |
| TC-92  | Owner edits an existing coupon's discount value                     | Owner                 | ⏭️ `test.fixme` — real backend bug (500)                     |
| TC-93  | Visitor registers a new account                                     | Onboarding / Public   | ✅ Passing                                                   |
| TC-94  | Sign-up — already-used email is rejected                            | Onboarding / Public   | ✅ Passing                                                   |
| TC-95  | Sign-up — mismatched confirm-password blocks submit                 | Onboarding / Public   | ✅ Passing                                                   |
| TC-96  | Sign-up — weak password rejected client-side                        | Onboarding / Public   | ✅ Passing                                                   |
| TC-97  | Employee creates a restaurant on behalf of a client                 | Onboarding / Employee | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                |
| TC-143 | Employee reaches the publish page                                   | Employee              | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                |
| TC-144 | Employee sees publish checklist items                               | Employee              | ⏭️ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`                |

**91 passing · 20 skipped · 1 failing (env-only)** — as of 2026-07-08. The one failure (TC-58) fails only in environments without `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` set; it passes wherever those credentials exist.

Skipped tests fall into four groups: **route access** (TC-27, TC-28, TC-81 — publish/tax/loyalty are employee/admin-only and return Access Denied for the owner role); **missing UI** (TC-42, TC-44 — the edit/delete buttons don't exist in the current menu editor); **missing credentials in this environment** (TC-58, TC-97, plus TC-17/TC-18 in environments without `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`; TC-02 without Mailtrap); and **a real backend bug** (TC-92 — editing any coupon 500s server-side, filed as `test.fixme` with the exact error rather than asserting broken behavior as correct). TC-33 to TC-35 remain narrative-only placeholders with no test code at all — not the same as a skipped/fixme test.

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
