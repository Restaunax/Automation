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

## The Four Areas We Test

| Area        | Who Uses It              | Tests                                                        |
| ----------- | ------------------------ | ------------------------------------------------------------ |
| 🌐 Public   | Anyone on the internet   | TC-01, TC-02                                                 |
| 🔐 Admin    | Internal Restaunax staff | TC-03 → TC-12, TC-32                                         |
| 🏠 Owner    | Restaurant owners        | TC-13 → TC-21, TC-27 → TC-31, TC-33 → TC-53 (excl. TC-22–26) |
| 🛒 Customer | People ordering food     | TC-22 → TC-26                                                |

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

## TC-07 — Admin Can View Full Details of a Demo Request

**Status:** ✅ Passing

### What it checks

Clicking "View/Edit Details" from the Actions menu opens a side panel showing the full information about that demo request.

### How it works, step by step

1. The test opens the Actions menu on the demo row
2. It clicks "View/Edit Details"
3. It confirms a panel slides in from the right side of the screen showing "Request Details"
4. It closes the panel

### Why it matters

The main table only shows basic info. Admins need the full picture — number of locations, business needs, preferred contact time — to have an informed conversation with the prospect.

---

## TC-08 — Admin Can Open the Send Follow-up Email Dialog

**Status:** ✅ Passing

### What it checks

Clicking "Send Follow-up Email" opens a dialog (pop-up window) where the admin can write and send an email to the prospect.

### How it works, step by step

1. The test opens the Actions menu
2. It clicks "Send Follow-up Email"
3. It confirms a dialog box appears with "Send Follow-up Email" as the title
4. It closes the dialog without sending

### Why it matters

Quick email follow-up is critical in sales. If this dialog doesn't open, admins have to leave the platform to send emails, slowing down their response time.

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

## TC-10 — Admin Can Open the Assign Request Dialog

**Status:** ✅ Passing

### What it checks

Clicking "Assign Request" opens a dialog where the admin can hand the demo request off to a specific team member.

### How it works, step by step

1. The test opens the Actions menu
2. It clicks "Assign Request"
3. It confirms the "Assign Demo Request" dialog appears
4. It closes the dialog

### Why it matters

When teams are busy, requests need to be distributed among staff. If assignment doesn't work, there's no accountability for who's handling which prospect.

---

## TC-11 — Admin Can Open the Schedule Demo Dialog

**Status:** ✅ Passing

### What it checks

Clicking "Schedule Demo" opens a dialog where the admin can pick a date and time for the product demo meeting.

### How it works, step by step

1. The test opens the Actions menu
2. It clicks "Schedule Demo"
3. It confirms the "Schedule Demo" dialog appears
4. It closes the dialog

### Why it matters

Scheduling is the most important step in converting a lead. If this dialog is broken, admins can't book meetings directly from the platform.

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

## TC-17 — Owner Can Open Tax Settings

**Status:** ⏭️ Skipped — tax settings route (`/tax`) is EMPLOYEE-only; OWNER role gets Access Denied

### What it checks

The owner can navigate to the Tax Settings page for their restaurant and see a form to enter their sales tax rate.

### How it works, step by step

1. The test goes directly to the tax settings page for the test restaurant
2. It confirms the tax rate input field is visible (showing placeholder text "e.g., 7.5")

### Why it matters

Tax must be correctly applied to every customer order. If owners can't set their tax rate, either customers are charged the wrong amount or the restaurant loses money.

---

## TC-18 — Owner Can Save a Tax Rate

**Status:** ⏭️ Skipped — tax settings route (`/tax`) is EMPLOYEE-only; OWNER role gets Access Denied

### What it checks

An owner can type a tax rate (like 8.5%) and save it — receiving a success confirmation message.

### How it works, step by step

1. The test opens the tax settings page
2. It types "8.5" into the tax rate field
3. It clicks the "Save Tax Settings" button
4. It confirms the message "Tax settings updated successfully!" appears on screen

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

## TC-36 — Owner Can View Their Billing and Subscription

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to their restaurant's subscription page and see their current plan information.

### How it works, step by step

1. The test navigates directly to the subscription page for the test restaurant
2. It confirms content related to the current plan or billing is visible on screen

### Why it matters

Owners need to see what plan they're on, manage their billing, and upgrade if needed. A broken subscription page means owners can't self-serve their account management.

---

## TC-37 — Owner Can Access the Loyalty Program Setup

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to the Loyalty Program page and see the rewards setup options.

### How it works, step by step

1. The test navigates to the loyalty program page (`/restaurant/loyalty`)
2. It confirms the "Loyalty" heading is visible
3. It confirms content related to points or rewards is visible

### Why it matters

Loyalty programs keep customers coming back. If the loyalty setup page is broken, owners can't create or manage reward programs — a key feature for customer retention.

---

## TC-38 — Owner Can Access Uber Eats Settings

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to the Uber Eats integration settings page for their restaurant.

### How it works, step by step

1. The test navigates directly to the Uber Eats settings page for the test restaurant
2. It confirms the page loads and shows "Uber Eats" content

### Why it matters

Many restaurants use Uber Eats as a delivery channel alongside direct ordering. If this settings page is broken, owners can't connect or manage their Uber Eats integration — potentially losing a significant revenue stream.

---

## TC-39 — Owner Can Access the Deals Section

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to the Deals section in the sidebar and see an option to create a new deal.

### How it works, step by step

1. The test opens the restaurant management portal
2. It clicks "Deals" in the sidebar
3. It confirms the deals area loads with a "Create Deal" or "Add Deal" button visible

### Why it matters

Deals are time-limited promotions that drive sales. If owners can't access the deals section, they lose a key marketing tool for increasing order volume during slow periods.

---

## TC-40 — Owner Can Open the Restaurant Info Form

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can navigate to Store Settings → Restaurant Info and see the editable form with the restaurant name and phone number fields.

### How it works, step by step

1. The test opens the restaurant management portal
2. It expands "Store Settings" in the sidebar and clicks "Restaurant Info"
3. It confirms the form is visible — specifically the Restaurant Name input and Phone Number input

### Why it matters

Restaurant Info is where owners maintain their core business details — name, contact number, address, description. If this form doesn't load, owners can't update any of these details.

---

## TC-41 — Owner Can Edit and Save the Restaurant Phone Number

**Status:** ⏭️ Skipped (test not yet implemented)

### What it checks

An owner can change their restaurant's phone number and save it — receiving a success confirmation message.

### How it works, step by step

1. The test opens the Restaurant Info form
2. It clears the current phone number and types a new test number (5551234567)
3. It clicks the Save button
4. It confirms a success message appears on screen

### Why it matters

If saving restaurant info doesn't work, every change an owner makes — phone number, business description, contact details — will be silently lost. Customers and delivery drivers could end up with outdated contact information.

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

**Status:** ⏭️ Skipped (owner login not configured — needed to seed test data)

### What it checks

A customer visiting the restaurant's online ordering link can see the menu page load successfully.

### How it works, step by step

1. The test opens the customer ordering website with the test restaurant's ID
2. It confirms the URL changes to the menu page — the page has loaded

### Why it matters

If the menu page doesn't load, no customer can see what's available to order. The restaurant's entire online ordering is down.

---

## TC-23 — Customer Can Click a Menu Item and See Add to Cart

**Status:** ⏭️ Skipped (owner login not configured — needed to seed test data)

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

**Status:** ⏭️ Skipped (owner login not configured — needed to seed test data)

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

**Status:** ⏭️ Skipped (owner login not configured — needed to seed test data)

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

**Status:** ⏭️ Skipped (owner login not configured — needed to seed test data)

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

# 📊 Test Summary

| #     | Test Case                                       | Area     | Status     |
| ----- | ----------------------------------------------- | -------- | ---------- |
| TC-01 | Demo request form works                         | Public   | ✅ Passing |
| TC-02 | Confirmation email is sent                      | Public   | ⏭️ Skipped |
| TC-03 | Admin can log in                                | Admin    | ✅ Passing |
| TC-04 | Admin finds demo request                        | Admin    | ✅ Passing |
| TC-05 | Admin opens actions menu                        | Admin    | ✅ Passing |
| TC-06 | Admin changes demo status                       | Admin    | ✅ Passing |
| TC-07 | Admin views full request details                | Admin    | ✅ Passing |
| TC-08 | Admin opens follow-up email dialog              | Admin    | ✅ Passing |
| TC-09 | Delete confirmation + cancel works              | Admin    | ✅ Passing |
| TC-10 | Admin opens assign request dialog               | Admin    | ✅ Passing |
| TC-11 | Admin opens schedule demo dialog                | Admin    | ✅ Passing |
| TC-12 | Proceed to onboarding navigates correctly       | Admin    | ✅ Passing |
| TC-13 | Owner sees My Restaurants page                  | Owner    | ✅ Passing |
| TC-14 | Owner sees their restaurant card                | Owner    | ✅ Passing |
| TC-15 | Owner opens restaurant management portal        | Owner    | ✅ Passing |
| TC-16 | Owner navigates to Store Settings               | Owner    | ✅ Passing |
| TC-17 | Owner opens tax settings page                   | Owner    | ⏭️ Skipped |
| TC-18 | Owner saves a tax rate                          | Owner    | ⏭️ Skipped |
| TC-19 | Owner opens menu management                     | Owner    | ✅ Passing |
| TC-20 | Owner creates a menu category                   | Owner    | ✅ Passing |
| TC-21 | Owner adds a menu item                          | Owner    | ✅ Passing |
| TC-22 | Customer sees menu page                         | Customer | ⏭️ Skipped |
| TC-23 | Customer opens item and sees Add to Cart        | Customer | ⏭️ Skipped |
| TC-24 | Customer reaches checkout with cart             | Customer | ⏭️ Skipped |
| TC-25 | Customer fills details and reaches payment      | Customer | ⏭️ Skipped |
| TC-26 | Customer completes full order end to end        | Customer | ⏭️ Skipped |
| TC-27 | Owner reaches the publish page                  | Owner    | ⏭️ Skipped |
| TC-28 | Publish checklist items are visible             | Owner    | ⏭️ Skipped |
| TC-29 | Owner views the Orders tab                      | Owner    | ✅ Passing |
| TC-30 | Owner opens the Create Coupon form              | Owner    | ✅ Passing |
| TC-31 | Owner creates a new coupon                      | Owner    | ✅ Passing |
| TC-32 | Admin sees the Restaurants list                 | Admin    | ✅ Passing |
| TC-33 | Owner configures hours of operation             | Owner    | ⏭️ Skipped |
| TC-34 | Owner accesses employee management              | Owner    | ⏭️ Skipped |
| TC-35 | Owner views the analytics dashboard             | Owner    | ⏭️ Skipped |
| TC-36 | Owner views billing and subscription            | Owner    | ⏭️ Skipped |
| TC-37 | Owner accesses loyalty program setup            | Owner    | ⏭️ Skipped |
| TC-38 | Owner accesses Uber Eats settings               | Owner    | ⏭️ Skipped |
| TC-39 | Owner accesses the Deals section                | Owner    | ⏭️ Skipped |
| TC-40 | Owner opens the Restaurant Info form            | Owner    | ⏭️ Skipped |
| TC-41 | Owner edits and saves restaurant phone number   | Owner    | ⏭️ Skipped |
| TC-42 | Owner renames a menu category                   | Owner    | ⏭️ Skipped |
| TC-43 | Owner edits a menu item name and price          | Owner    | ✅ Passing |
| TC-44 | Owner deletes a menu item                       | Owner    | ⏭️ Skipped |
| TC-45 | Owner deletes a menu category                   | Owner    | ✅ Passing |
| TC-46 | Owner opens the Stripe setup page               | Owner    | ✅ Passing |
| TC-47 | Stripe stepper shows all 4 steps                | Owner    | ✅ Passing |
| TC-48 | Stripe page shows header description            | Owner    | ✅ Passing |
| TC-49 | Owner sees Set Up Stripe Account button         | Owner    | ✅ Passing |
| TC-50 | Stripe requirements section is visible          | Owner    | ✅ Passing |
| TC-51 | Stripe success callback page loads              | Owner    | ✅ Passing |
| TC-52 | Restaurant Dashboard button redirects correctly | Owner    | ✅ Passing |
| TC-53 | Connect button calls create API and redirects   | Owner    | ✅ Passing |

**32 passing · 21 skipped · 0 failing**

Skipped tests fall into three groups: **route access** (TC-17, TC-18, TC-27, TC-28 — these routes are employee-only and return Access Denied for the owner role); **missing UI** (TC-42, TC-44 — the edit/delete buttons don't exist in the current menu editor); **not yet implemented** (TC-22 to TC-26, TC-33 to TC-41 — test code hasn't been written yet).

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
Skipped tests fall into three categories: (1) the feature is restricted to a different role on QA (e.g. `/tax` and `/publish` are employee-only, so owner tests get Access Denied); (2) the UI doesn't yet expose the needed button or element (e.g. no delete button on menu item cards); or (3) the test case has been documented but the automated test code hasn't been written yet. Each skipped test explains its specific reason in the Status line.
