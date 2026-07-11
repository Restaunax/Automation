# Owner Onboarding — Product Fix Proposal

**Author context:** written by the Automation/QA pass that built the first end-to-end onboarding test (TC-182/183). Every finding below is confirmed by direct source reads and/or live reproduction against QA on 2026-07-11 — nothing here is speculative. This is a recommendation document for the frontend/backend teams to review; nothing described here has been implemented in the product repos.

## Priority 1 — There is no dashboard UI path to complete onboarding

**What's broken:** A restaurant created via `CreateStore.tsx` (`/restaurant/new`) has no owner (`owner: undefined` in `restaurantController.ts`'s create call). The backend fully supports assigning one afterward (`POST /api/user-restaurants/assign-restaurant`, which also promotes the target user's role `USER`→`OWNER`), but **no reachable UI in the dashboard calls this endpoint**:

- `UserRestaurantList.tsx` and `AssignRestaurantDialog.tsx` (both in `src/Admin/components/UserManagement/`) implement the exact assign dialog needed, referencing this endpoint directly — but neither file is imported anywhere in the app. Dead code.
- The `UserDetailsModal.tsx` tab list (`ROLE_CONFIG`) only grants the "Restaurants" tab to `OWNER` and `EMPLOYEE` roles. A fresh sign-up is `Role.USER` — the one role that would ever need _first-time_ assignment can never see that tab in the first place, even if the dead code were wired up.
- The dead code's own empty-state action links to `/admin/invite-restaurant-owner` — a route that doesn't exist anywhere in `AllRoutes.tsx`. It would 404.

**Why this matters:** this is very plausibly the actual reason onboarding "feels incomplete" — not just slow, but literally missing the step that turns a signed-up visitor into a restaurant owner. Someone in the org may be doing this today via direct database access or a script, which would explain why the gap hasn't blocked real usage but also why it's invisible until you try to test the flow end-to-end.

**Recommended fix (pick one):**

1. **Cheaper:** wire up the existing `UserRestaurantList.tsx`/`AssignRestaurantDialog.tsx` code, and extend `ROLE_CONFIG` in `UserDetailsModal.tsx` so `Role.USER` also gets the "Restaurants" tab (read-only until they own one, then showing the existing assign UI). This reuses code that's already written and tested-in-isolation-by-nobody but structurally complete.
2. **More correct long-term:** build the `/admin/invite-restaurant-owner` page the dead code already links to, using the `RestaurantInvitation` token flow the backend already implements (`handleRestaurantInvitation`, 48-hour expiry, auto-claims on the recipient's next login) — this handles the case where the intended owner hasn't signed up yet at all, which the direct-assign path can't do.

## Priority 2 — assign-restaurant fails loudly on a step that already succeeded

**What's broken:** `assignRestaurantToUser` (`userRestaurantController.ts`) does, in order, inside one try block:

1. `prisma.restaurant.update({ ownerId: userId })`
2. `prisma.user.update({ role: "OWNER" })` (if currently `USER`)
3. `sendEmail(...)` — a "you've been assigned a restaurant" welcome notification

Steps 1–2 are not wrapped in a transaction with step 3. If the email send throws (confirmed live: a Mailtrap quota exhaustion — `"The email limit is reached. Please upgrade your plan"`), the catch block returns a 500 to the caller, even though the ownership change already committed to the database. The caller has no way to distinguish "actually failed" from "succeeded, but the notification email didn't send."

**Recommended fix:** wrap the `sendEmail` call in its own try/catch that logs on failure but does not throw — matching the pattern already used elsewhere in this codebase (see `restaurantController.ts`'s demo-affiliate email, which explicitly comments "Don't fail the publish process if email fails"). The data operation and the notification should not share a failure mode.

## Priority 3 — `CreateStore.tsx` wizard UX debt

Confirmed via source read, not just impression:

- **Step 0 → Step 1 transition**: a hardcoded `setTimeout(1500)` after the restaurant is created, purely so a success toast is visible before navigating away. Recommend removing it — the toast library's own dismissal timing doesn't need to gate navigation.
- **Step 1 → Step 2 transition**: `HoursOfOperation.tsx` calls `navigate(0)` — a full browser page reload — after saving hours, discarding all React state and re-fetching everything from scratch, purely to move `CreateStore.tsx`'s `activeStep` from 1 to 2. Recommend replacing with a client-side re-fetch of the restaurant (the same `GET /restaurant/restaurantId/:id` call the component already makes elsewhere) followed by a local `setActiveStep(2)`, avoiding the reload entirely.
- **No guided path to Stripe/subscription**: the wizard ends after the Menu step (Step 2) with no call-to-action toward Stripe Connect or plan selection — both are separate screens the owner must discover unassisted. Recommend either adding a "Connect payments" prompt immediately after Step 2, or making the post-creation redirect land somewhere that surfaces the next required step explicitly.

## What this does NOT cover (deliberately out of scope for this pass)

- Actually building/testing a real Stripe Connect account-connection flow — flagged as a separate, larger piece of work if Priority 3's guidance is acted on.
- A UI-driven test for the "assign restaurant" action — there's nothing to test yet since Priority 1 is unresolved. TC-182 exercises the underlying capability via direct API call as a stand-in.
