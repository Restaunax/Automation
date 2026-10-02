# Menu — Test Strategy & Coverage Audit (owner portal + chain menu)

_Owner dashboard → Restaurant Management → **Menu** tab, the **menu builder**
(`/restaurant/restaurantId/:id`), the **item wizard / item detail** pages, and the
**chain menu** surfaces. Written 2026-08-15 with the same method as
`ORDERS_TAB_TEST_STRATEGY.md` §6 (inventory UI → inventory backend → map tests → gap
list in three layers)._

Sources read for this audit (all in the `restaunax` repo unless noted):

- Docs: `docs/features/CHAIN_RESTAURANTS.md` (**source of truth for chains**),
  `docs/technical/MENU_MODIFIER_SYSTEM.md` (**source of truth for modifier pricing**),
  `docs/features/CHANNEL_PRICING_DESIGN.md`, `docs/features/MENU_PRICING_BY_ORDER_SOURCE.md`,
  `docs/ux/RESTAURANT_MANAGEMENT_AUDIT.md` (Menu-tab UX rules), `docs/features/FEATURE_ENTITLEMENTS_AND_ADDONS.md`,
  `docs/features/uber-eats/UBER_EATS_MENU_SYNC_PLAN.md`, `docs/features/VOICE_AI_IMPLEMENTATION_PLAN.md` (availability invariant).
- Backend: `prisma/schema.prisma` (`Menu`, `MenuGroup`, `MenuItem`, `MenuItemLocationOverride`,
  `ModifierLocationOverride`, `ModifierGroup`, `Modifier`, `ImageUrls`, `RestaurantGroup`),
  `src/routes/menu/menu.ts`, `src/routes/upload/upload.ts`, `src/routes/admin/chainRoutes.ts`,
  `src/controller/menu/menuController.ts`, `src/Service/menuFetchService.ts`, `src/Service/restaurantAccessService.ts`.
- Frontend: `RestaurantManagement/MenuManagementPage.tsx` (the tab), `CreateStore/CreateStore.tsx` +
  `MenuGroup/*` (the builder), `AddCategoryItem/*` (wizard, item detail, reorder sheet),
  `RestaurantManagement/LocationPricingEditor.tsx`, `MenuScopeBar.tsx`, `Chain/ChainManagementShell.tsx`,
  `hooks/useFanOutConfirm.ts`, `AddCategory/AddCategory.tsx`, `public/locales/en/{menu,restaurant,common}.json`.
- This repo: `tests/dashboard/owner/04-menu-management.spec.ts` (TC-19, 20, 21, 42, 43, 44, 45, 62, 67),
  `pages/dashboard/owner/OwnerMenuPage.ts`, `pages/dashboard/restaurant/MenuManagementPage.ts` (stub),
  `tests/dashboard/admin/chains.spec.ts` (TC-181, 223 — the chain-fixture pattern), `utils/apiHelper.ts` menu helpers.

---

> **Status 2026-08-17:** §4 + §6 are **implemented and green on QA** — `api-menu.spec.ts` (TC-263..287, 25),
> `04b-menu-availability.spec.ts` (TC-288..293), `04c-menu-item-editor.spec.ts` (TC-294..307), `17-chain-menu.spec.ts`
> (TC-308..319), `customer/06-menu-handoff.spec.ts` (TC-320..322), `admin/chains.spec.ts` (TC-323/324) — 62 tests, six
> `test.fail()` pins. Deviations from the plan below, all recorded in the specs: TC-317 became the "Reset all to shared"
> pin (its planned content merged into TC-308); TC-319 asserts the real behaviour (no chain-scoped builder route —
> "Manage shared menu" opens a chain-aware location builder); TC-321 asserts the charge on the public `/quote` endpoint
> because the fixture locations are unpublished (Wind's item modal is inert there); TC-302's soft-deleted card stays in
> the builder with a "No longer available" badge (the builder reads `/restaurant/restaurantId/:id`, not the filtered menus
> read). New findings beyond §1: `LocationPricingEditor.resetAll` bug (TC-317), the inverted availability caption, the
> `$` quick-adjust being relative to SHARED prices, and "admin restaurant DELETE only archives and never detaches chain
> membership" (TC-324). The fan-out confirm IS live on QA (shared category save, shared featured toggle) but the wizard
> save did not show it. Frontend testids were NOT added — every needed control already exposes a stable accessible name
> (MUI tooltips become `aria-label`s on the icon buttons), so the POMs use those; §5's testid list stays a nice-to-have.

> **Update 2026-08-17 (later):** RestauNax #602 is merged and on QA; the six pins were flipped to plain tests
> (TC-282 rewritten to the agreed contract — location-scoped reset with `restaurantId`, master path without it).
> The QA frontend now also renders the corrected switch caption, so the state text appears twice per row and
> `MenuAvailabilityPage` asserts on the chip (`.first()`).
>
> **Fix status 2026-08-17:** the §1 findings are fixed in RestauNax PR
> [#602](https://github.com/Restaunax/RestauNax/pull/602) (issue #601): ownership guards on every menu write,
> per-location Restore All (`restaurantId` in the body; button hidden in the chain shell), Reset-all-to-shared,
> the inverted caption, quick-adjust hint, plus `data-testid`s (`menu-availability-switch`, `menu-featured-toggle`,
> `menu-price-override`, `menu-carry-toggle`, `menu-restore-all`, `menu-source-chip` — the POMs are testid-first
> with the accessible-name fallback). **When #602 reaches QA, the pins TC-282, TC-283..286 and TC-317 will start
> failing on the nightly — that is the signal to flip them to plain tests** (also drop the `test.fail()` and update
> `TEST_CASES.md`). Decisions recorded with the user: quick-adjust stays relative to the SHARED price (label
> fixed); Restore All at a location clears that location's overrides only.

## 0. TL;DR

- **How the menu system works (one paragraph):** a `Menu` belongs to exactly one restaurant **or** one
  `RestaurantGroup` (= the chain; DB CHECK XOR). `MenuGroup` = category (no sortOrder, no
  active flag, always ordered by name). `MenuItem` has `outOfStock` (86), `isActive` (soft delete),
  `featured` (max 5 per standalone restaurant), `ownerRestaurantId` (`null` = shared; set = a
  **location-only** item sitting under a shared chain category). Modifiers: `ModifierGroup`
  (`INCLUDED` / `ADJUSTS_PRICE` / `REPLACES_PRICE`, min/max, one level of nesting, child groups
  forced free) → `Modifier` (price, isDefault, allowsDuplicates, outOfStock, sortOrder). **There is no
  category rename/reorder, no item reorder, no availability schedule, no allergens/tags, no
  per-service-type item price** — only modifiers/modifier-groups are reorderable.
- **How chains change it:** membership is `Restaurant.restaurantGroupId != null` (no other flag). The
  founding store's menu is **re-parented** to the group; every member reads the same rows through the
  single resolver `getMergedMenuForRestaurant`, which merges two override tables:
  `MenuItemLocationOverride` (`priceOverride`, `isOutOfStock`, `isCarried`) and
  `ModifierLocationOverride` (`priceOverride`, row = override, delete = revert). Name / description /
  image / modifier _structure_ / `featured` are **shared and fan out** to every location; base price,
  each priced modifier's price, out-of-stock and carried are **per location**. Locations can add their
  own item into a shared category (`ownerRestaurantId`) — invisible to other locations and excluded from
  chain deals. Nothing is "published/propagated": everyone reads the same row.
- **What is tested today:** the builder's happy path only — reach the builder, create category, add item
  (skips modifiers + image), edit name/price, delete empty category, blank-field validation, non-empty
  category not deletable. **Nothing** on the actual `?tab=Menu` page (availability / featured / restore
  all), nothing on the item detail page (image upload / remove / delete / reorder modifiers), no modifier
  pricing modes, no clone item, no clone menu, no chain behaviour, no API contract, no storefront
  hand-off.
- **Two 🔴 findings that outrank the test plan** (§1): most `/menu` mutations have **no ownership check**
  (authenticated IDOR); and on a chain menu "Restore All to Available" **does not** un-86 locations.
- **Plan:** ~55 new tests in three layers (§4), 12 in a chain-fixture file, 3 storefront journeys.
  Fixture strategy for chains in §5 — needs one decision from you.

---

## 1. 🔴 Findings that outrank the test plan

Found while inventorying the backend for §3. Each becomes a `test.fail()` pin (same pattern as
TC-226..230 / TC-262) so the suite flips green the day the fix lands.

1. **Authenticated IDOR across the menu write surface** (`menuController.ts`, `uploadController.ts`).
   Behind `requireAuth` only — **no** `assertControlsRestaurant` / `assertControlsMenuOwner`:
   `PUT /menu/menu-items/:id/changes` (edit item — fans out chain-wide!), `DELETE /menu/menuItemId/:id`,
   `DELETE /menu/group/:id`, `POST /menu/item/new`, `POST /menu/group/new` (restaurant branch),
   `POST /menu/restaurant/clone`, `POST /menu/bulk-import`, `PUT /menu/menu-items/:id/modifier-order`,
   `GET /menu/itemId/:id`, and both `POST|DELETE /upload/menu/item/picture/:menuItemId`. Any signed-in
   owner with a foreign item/group id can edit, image-swap or soft-delete another restaurant's menu. The
   controller header (`menuController.ts:114-120`) names this bug class and the fix was applied to
   availability / override / featured / reset only. **Should be a RestauNax issue.** Pins: TC-283..287.
2. **Chain "Restore All to Available" is a no-op for locations** — `resetGroupAvailability` clears master
   `MenuItem.outOfStock` only, never `MenuItemLocationOverride.isOutOfStock`; but on a chain, per-location
   86 is _only_ written to the override. Pin: TC-282.
3. **Docs disagree with code on override-route auth.** `CHANNEL_PRICING_DESIGN.md` says the price-override
   routes sit _above_ `requireAuth`; `routes/menu/menu.ts` today mounts them _after_ `router.use(requireAuth)`
   (line 62). TC-274 asserts the code (401 unauthenticated); if it ever regresses to the doc's claim the
   suite catches it.
4. Already-documented debt that the new tests will keep visible: soft-deleted items **permanently block**
   category deletion (`TEST_COVERAGE.md` → Known Technical Debt); `applyMenuItemChanges` deletes modifier
   groups by bare `id in [...]` (not scoped to the item); AI import / bulk-import can't target a chain master
   menu; `resetGroupAvailability` gate mismatch for staff on chain menus (`UBER_EATS_TODO.md` #16).

---

## 2. The approach — three layers, not one

```
Layer 3  Storefront journey   owner 86s / prices / hides an item  ──►  wind menu + checkout reflect it
         (3 tests)            page (anonymous, TEMPLATE_WIND_URL) + ownerPage in ONE test

Layer 2  Owner UI             API-seeded categories/items/chain  ──►  tab, builder, wizard, detail, chain
         (most tests)         availability, featured, restore, CRUD, modifiers, images, overrides, scope

Layer 1  API contract         owner JWT hits /menu/* and /upload/menu/* directly
         (fast, many)         validation, pricing normalisation, delete rules, chain override rules, authz pins
```

**Why this split**

- The Menu tab has **no data of its own** — everything is a projection of `MenuItem` rows and override
  rows. Seed exactly the rows a test needs via the API (`createTestMenuGroup` / `createTestMenuItem`,
  new `createTestMenuItemFull` with modifier groups, `setPriceOverrideRaw`, …), assert the UI on _those_
  rows, and restore what you mutate. That is how "86 at location A doesn't 86 location B" becomes a
  deterministic assertion instead of "the switch flipped".
- Layer 1 catches the things a UI test can't reach or would take minutes to reach: `INCLUDED` prices
  forced to 0, one-level nesting cap, 409 delete-blockers, `requiresChainItem` on a standalone override,
  the IDOR pins, chain-wide `featured`. These are the tests that save you when someone "just refactors
  the controller" — the user's stated goal.
- Layer 3 is where "the customer sees the same menu the owner set" is proven. Three are enough: sold-out
  item not addable; per-location price shows _and charges_ the override (the exact defect
  `CHANNEL_PRICING_DESIGN.md` describes: "shown $14, charged $12"); un-carried item absent from that
  location's storefront only.

**Two pages, not one.** `?tab=Menu` renders **Menu Availability Management** (toggle-only: featured,
availability, restore-all, per-location price/carry for chains, "Manage Menu" button). Category / item
CRUD lives in the **builder** at `/restaurant/restaurantId/:id` (`CreateStore` step 2 = `MenuGroupDisplay`),
whose "Add … Item" / "Edit Item" / card-click go to three more routes:
`…/groupId/:gid` (4-step wizard), `…/groupId/:gid/itemId/:iid` (item detail page — image actions,
Edit, Reorder modifiers, Delete), `…/itemId/:iid/edit`. Chain twins: `/chain/:groupId/restaurantManagement?tab=Menu`
and `/chain/:groupId/groupId/:gid…`. Playwright needs a POM per page (§5).

**Selectors that exist today:** `data-testid` = `menu-item-card`, `menu-item-edit`, `menu-item-clone`
(item cards only); `data-tour` = `tab-Menu`, `menu-featured-toggle`, `menu-availability-toggle`;
confirm dialogs = `role=dialog` + `#confirm-dialog-title`; MUI tooltips are **not** aria-labels.
Chain chips ("From shared menu", "This location only", "Shared · all N locations"), the `$` price icon
and the eye carry icon have **no testid** — the plan adds `data-testid` to those in the frontend in the
same change (TEST_PLAN → Locator strategy: never add another `.nth()`), with the usual
testid-first-legacy-fallback in the POM until QA has the deploy.

---

## 3. What the surface does vs. what's tested

Legend: ✅ proven · 🟡 touched (visibility only / partial) · ❌ not covered · ⛔ not a feature (don't write a test)

### 3.1 Menu tab — `restaurantManagement?tab=Menu` (`MenuManagementPage.tsx`)

| Control / behaviour                                                                                                                                | Backend call                                                         | Today |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----- |
| Sidebar "Menu" (`data-tour=tab-Menu`) → tab renders "Menu Availability Management"                                                                 | `GET /menu/restaurants/:id/menus`                                    | ❌    |
| "Manage Menu" → builder `/restaurant/restaurantId/:id`                                                                                             | —                                                                    | ❌    |
| "Refresh" / "Refreshing…" re-fetches                                                                                                               | same GET                                                             | ❌    |
| Empty state "No menu data available" → "Open menu builder"                                                                                         | —                                                                    | ❌    |
| Featured accordion, `n/5` chip, help tip; star toggle add/remove; **cap at 5**                                                                     | `PATCH /menu/menu-items/:id/featured`                                | ❌    |
| Per-category accordion: "{n} Available" / "{n} Out of Stock" chips                                                                                 | —                                                                    | ❌    |
| Availability Switch (`data-tour=menu-availability-toggle`), OFF → ConsequenceDialog "Mark "X" as sold out?" → "Mark sold out"; ON → no dialog      | `PATCH /menu/menu-items/:id/availability {outOfStock, restaurantId}` | ❌    |
| "Restore All to Available" (only when a group has out-of-stock) → dialog "Restore all out-of-stock items in this group?" → "Restore all"           | `POST /menu/menu-groups/:gid/reset-availability`                     | ❌    |
| Edit pencil → `…/itemId/:iid/edit`                                                                                                                 | —                                                                    | ❌    |
| Chain (location view): banner, "{s} shared (chain) · {l} only this location", chips "From shared menu"/"This location only"                        | GET returns `chain{…}` + `source`                                    | ❌    |
| Chain: `$` icon → **LocationPricingEditor** (base + per-modifier override, "Reset to shared price", "Reset all to shared", "Adjust all by $/%")    | `PATCH …/location-pricing` / `…/price-override`                      | ❌    |
| Chain: eye icon carry/uncarry → dialog "Remove "X" from this location's menu?"                                                                     | `PATCH …/carried {restaurantId,isCarried}`                           | ❌    |
| Chain: featured toggle = chain-wide → fan-out confirm "Heads up — chain-wide change"                                                               | `PATCH …/featured`                                                   | ❌    |
| Chain shell (`/chain/:gid/…?tab=Menu`, `forceChainMode`): shared banner; availability/price/carry **hidden**; "Manage shared menu (all locations)" | GET `?sharedItemsOnly=true`                                          | ❌    |
| Search / filter / bulk select / export / publish inside the tab                                                                                    | —                                                                    | ⛔    |

### 3.2 Builder — `/restaurant/restaurantId/:id` (`MenuGroupDisplay`, `MenuGroupItemList`, `MenuItemCard`, `AddCategory`)

| Control / behaviour                                                                                                                 | Backend call                                                                 | Today                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| Reach builder, "New Category" visible                                                                                               | `GET /restaurant/restaurantId/:id`                                           | ✅ TC-19                                    |
| "New Category" dialog: 17 preset chips, free-text, duplicate-name error, "Save changes"                                             | `POST /menu/group/new`                                                       | 🟡 TC-20 (free text only)                   |
| Category tab strip (`aria-label="menu categories tabs"`) — click scrolls to section                                                 | —                                                                            | 🟡 (used as assertion, not tested)          |
| "Delete" category — only when empty; confirm dialog                                                                                 | `DELETE /menu/group/:id`                                                     | ✅ TC-45, TC-67 (non-empty hides button)    |
| Category rename / reorder / enable-disable / schedule                                                                               | —                                                                            | ⛔ (TC-42 rightly skipped)                  |
| "Add {Category} Item" → wizard; card `data-testid=menu-item-card`                                                                   | —                                                                            | ✅ TC-21                                    |
| Card click → item detail page                                                                                                       | `GET /menu/itemId/:id`                                                       | ❌                                          |
| Card "Edit Item" (`menu-item-edit`) → edit wizard; save                                                                             | `PUT /menu/menu-items/:id/changes`                                           | ✅ TC-43 (name+price only)                  |
| Card "Clone Item" (`menu-item-clone`) → wizard prefilled `?cloneFrom=`                                                              | `POST /menu/item/new`                                                        | ❌                                          |
| Card star = featured; badges "Featured" / "No longer available" / "Shared" / "Only here"                                            | `PATCH …/featured`                                                           | ❌                                          |
| "Clone Menu" dialog (source restaurant → Entire/Categories/Items → "Clone {n} Items"); **disabled for chain members** with tooltip  | `GET restaurant/owned`, `POST /menu/restaurant/clone`                        | ❌                                          |
| "Generate Menu" (AI import: file / URL), "Generate Images" (bulk AI), "Add Sample Menu Data"                                        | `/menu/ai-import/*`, `/upload/menu/bulk-*`, `POST /menu/bulk-import`         | ❌ (presence-only in plan; no real AI runs) |
| Empty state: "No categories yet" / "Add First Category" / "Clone from Restaurant" / "AI Import from File"                           | —                                                                            | ❌                                          |
| Chain: MenuScopeBar "Editing menu for: … this location only" / "Switch to all N locations" / "EDITING SHARED MENU"                  | —                                                                            | ❌                                          |
| Chain: category chip "Shared · all N locations" / "Only at this location"; Add-Category scope radio; "Who is this item for?" dialog | `POST /menu/group/new {groupId}` / `POST /menu/item/new {ownerRestaurantId}` | ❌                                          |

### 3.3 Item wizard — `…/groupId/:gid[/itemId/:iid/edit]` (`AddCategoryItem`, `CreateMenuItem`, `ModifierGroupFields`, `ModifierRow`, `ChildModifierGroupFields`, `ItemImageUpload`)

| Step / behaviour                                                                                                                                                                                                                           | Today                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Step 0 name / price / description; blur validation "Item name is required" / "Price is required"; Next disabled                                                                                                                            | ✅ TC-21/43/62                                                           |
| Step 0 other rules: min 2 chars, "Price must be at least $0.01", "Price cannot exceed $9,999.99", "Description cannot exceed 500 characters", `weightOz` required when shipping enabled                                                    | ❌                                                                       |
| Step 0 helpers "Paste from Website" (AI) / "Start from a Template" (gallery → "Use This Item")                                                                                                                                             | ❌ (template gallery deterministic → in plan; paste = AI, presence only) |
| Step 1 "Add Modifier Group": Group Name, Pricing (Free / Adds to Price / Sets Final Price), Min/Max, options with Default Selected + Allow Multiples, sub-group ("Free sub-group"), delete group/option confirms, "AI Suggest" (edit mode) | ❌                                                                       |
| Step 2 image: drag-drop zone + hidden `<input type=file>` (accept images, 50 MB, `maxFiles=10` but only [0] uploads), "Replace Image", Retry/Skip on failure                                                                               | ❌                                                                       |
| Step 3 review rows + "All validations passed!"; auto-submit on entering Review (current build), else "Save Item"                                                                                                                           | 🟡 (relied on, not asserted)                                             |
| Chain banners: "Shared chain menu item — changes … apply to all N chain locations" / "This item is for this location only"                                                                                                                 | ❌                                                                       |
| Fan-out confirm on saving a shared item ("Heads up — chain-wide change" → Continue), suppressed per session                                                                                                                                | ❌                                                                       |

### 3.4 Item detail page — `…/groupId/:gid/itemId/:iid` (`MenuItemDisplay`, `ModifierReorderSheet`)

| Control / behaviour                                                                                                                                                               | Backend call                                                      | Today                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | --- |
| Image overlay: "Upload" (replace confirm "Yes, Replace"), "Remove Image" ("Yes, Remove"), "AI Generate", "Enhance", "Upload from Phone" (SMS link)                                | `POST                                                             | DELETE /upload/menu/item/picture/:id`, AI/mobile routes | ❌  |
| "Customization Options" list (Min/Max/Unlimited + chips)                                                                                                                          | `GET /menu/itemId/:id`                                            | ❌                                                      |
| Bottom bar: "Preview", "Edit", "Reorder modifiers" (dnd-kit sheet, "Save order", toast "Modifier order saved"), "Delete" (gated `DELETE_MENU_ITEM`), "Permanently Delete" (ADMIN) | `PUT …/modifier-order`, `DELETE /menu/menuItemId/:id[/permanent]` | ❌                                                      |
| Delete blocked → dialog "Cannot Delete This Item" listing Active Deals / Active Coupons                                                                                           | 409 `{blockers}`                                                  | ❌                                                      |
| Inactive banner "This item is no longer available. All actions are disabled."                                                                                                     | —                                                                 | ❌                                                      |

### 3.5 Backend contract (`/menu/*`, `/upload/menu/*`) — rules a test can pin

| Rule (from `menuController.ts` / `menuFetchService.ts`)                                                                                                                                                                                                                                                                                                 | Today                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `GET /menu/restaurants/:id/menus` is public; hides `isActive=false`; returns `chain` + per-item `source`, `masterPrice`, `effectivePrice`, `isCarried`, `outOfStock` merged                                                                                                                                                                             | ❌                                  |
| `POST /menu/item/new` requires name+price+groupId; `weightOz` required when shipping enabled                                                                                                                                                                                                                                                            | 🟡 TC-65 (no name only)             |
| Modifier normalisation: `INCLUDED` prices → 0; child groups forced `INCLUDED`/0; nesting capped at ONE level; `sortOrder` = array index                                                                                                                                                                                                                 | ❌                                  |
| `PUT …/changes` diff payload `{deleted, added, updated}` in one transaction; `body.menuItemId` must equal param                                                                                                                                                                                                                                         | ❌                                  |
| `PUT …/modifier-order` index → sortOrder; foreign ids silently no-op                                                                                                                                                                                                                                                                                    | ❌                                  |
| `PATCH …/availability`: `outOfStock` required (400); standalone/owned item → writes `MenuItem.outOfStock`; shared chain item → requires `restaurantId` (400) and writes **only** the override; membership check                                                                                                                                         | ❌                                  |
| `POST …/reset-availability` clears master `outOfStock` for the group (see §1.2 for the chain gap)                                                                                                                                                                                                                                                       | ❌                                  |
| `PATCH …/featured`: standalone cap 5 (6th rejected); chain master items uncapped + chain-wide                                                                                                                                                                                                                                                           | ❌                                  |
| `DELETE /menu/menuItemId/:id` = **soft** (`isActive=false`, image rows deleted); 409 `{blockers:{coupons,deals}}` when an unexpired coupon / ACTIVE deal references it; `/permanent` = ADMIN only                                                                                                                                                       | ❌                                  |
| `DELETE /menu/group/:id` → 400 `cannotDeleteCategoryWithItems` if any item (incl. soft-deleted — debt); hard delete otherwise                                                                                                                                                                                                                           | 🟡 (globalTeardown works around it) |
| `PATCH …/price-override` / `…/location-pricing` / `…/carried`: `restaurantId` required; `assertControlsRestaurant` **before** item lookup; **shared chain items only** (400 `requiresChainItem` for standalone or location-owned); `priceOverride:null` clears; modifier override for a modifier not on the item → 400; modifier `null` deletes the row | ❌                                  |
| `POST /menu/item/new {ownerRestaurantId}`: non-member → 400 `restaurantNotInChain`; restaurant-owned group ≠ owner → 400 `requiresChainGroupForLocationItem`                                                                                                                                                                                            | ❌                                  |
| `POST /menu/restaurant/clone` into a chain member → 400 `cloneTargetChainMember`                                                                                                                                                                                                                                                                        | ❌                                  |
| Chain reads: `chainItemOwnerWhere` — a location never sees another location's private item; `isCarried=false` dropped on customer paths, kept + flagged on owner path                                                                                                                                                                                   | ❌                                  |
| Authz: availability/override/featured/reset guarded (`assertControlsRestaurant` / `assertControlsMenuOwner`, chain owner controls every member); **everything else unguarded** (§1.1)                                                                                                                                                                   | ❌                                  |

---

## 4. Gap list, prioritised (proposed TCs start at TC-263)

P1 = the tab's core promises + the money/chain rules + the pins · P2 = the rest of the owner surface · P3 = nice-to-have / presence smokes.

### Layer 1 — API contract (`tests/dashboard/owner/api-menu.spec.ts`; owner JWT; each test seeds its own group/items and hard-cleans via the admin permanent-delete)

| TC     | P   | Assertion                                                                                                                                                                                                                                                            |
| ------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-263 | P1  | `GET /menu/restaurants/:id/menus` (no token) → 200; shape `{menus[{groups[{items}]}], chain}`; a soft-deleted item is absent; `outOfStock` and `featured` present per item                                                                                           |
| TC-264 | P1  | `POST /menu/item/new`: missing price → 4xx; missing groupId → 4xx; happy path returns id (TC-65 already covers no-name)                                                                                                                                              |
| TC-265 | P1  | Modifier normalisation: create item with an `INCLUDED` group whose options carry prices → stored 0; child group with `ADJUSTS_PRICE` → stored `INCLUDED`/0; grandchild group dropped; `sortOrder` = submitted index                                                  |
| TC-266 | P1  | `PUT …/changes`: add a group, rename an option, delete a group in ONE call → `GET /menu/itemId/:id` reflects all three; mismatched `body.menuItemId` → 400                                                                                                           |
| TC-267 | P2  | `PUT …/modifier-order`: reversed order persists; a foreign group id in the payload is a no-op (its sortOrder unchanged)                                                                                                                                              |
| TC-268 | P1  | `PATCH …/availability` on a standalone item: `{outOfStock:true}` → GET shows `outOfStock:true`; missing field → 400; back to false                                                                                                                                   |
| TC-269 | P1  | `POST …/reset-availability`: 3 items 86'd → all `outOfStock:false` after; group with none → 200 no-op                                                                                                                                                                |
| TC-270 | P1  | Featured cap: feature 5 seeded items → 6th → 4xx (assert status + message); un-feature one → 6th succeeds; restore                                                                                                                                                   |
| TC-271 | P1  | Soft delete: `DELETE /menu/menuItemId/:id` → menus GET hides it, `GET /menu/itemId/:id` still 200 with `isActive:false`; owner token on `/permanent` → 403; admin → 200                                                                                              |
| TC-272 | P1  | Delete blocked: seed item + ACTIVE deal (`createDealApi`) → DELETE → 409 with `blockers.deals[]` naming the deal; delete deal → DELETE → 200                                                                                                                         |
| TC-273 | P1  | `DELETE /menu/group/:id` with an active item → 400 `cannotDeleteCategoryWithItems`; empty → 200. Documented-debt sub-case (only a soft-deleted item inside → still 400) recorded as a `test.fail()` pin **only if** the team agrees it's a bug — else asserted as-is |
| TC-274 | P1  | Override routes on a **standalone** item: `price-override` → 400 `requiresChainItem`; missing `restaurantId` → 400; no token → 401 (resolves the doc/code disagreement, §1.3)                                                                                        |
| TC-275 | P1  | **Chain**: `price-override` at location A → menus GET for A shows `effectivePrice=override`, `masterPrice=master`; B unchanged; `null` clears (A back to master)                                                                                                     |
| TC-276 | P1  | **Chain**: `location-pricing` — base + one `REPLACES_PRICE` size override → GET for A resolves `modifier.price` to override, `masterPrice` kept; modifier id from another item → 400; `null` for the modifier deletes the row                                        |
| TC-277 | P1  | **Chain**: `carried:false` at A → owner GET (A) still lists it with `isCarried:false`; **customer** menu endpoint for A omits it; B still lists it; restore                                                                                                          |
| TC-278 | P1  | **Chain**: availability on a shared item without `restaurantId` → 400; with A → A `outOfStock:true`, B `false`, master row untouched (owner GET at B); restore                                                                                                       |
| TC-279 | P1  | **Chain**: `POST /menu/item/new {groupId: sharedGroup, ownerRestaurantId: A}` → A lists it `source:"RESTAURANT"`, B does not; `ownerRestaurantId` = a non-member restaurant → 400 `restaurantNotInChain`                                                             |
| TC-280 | P2  | **Chain**: `POST /menu/restaurant/clone` with a chain member as target → 400 `cloneTargetChainMember`                                                                                                                                                                |
| TC-281 | P2  | **Chain**: `featured` on a shared item → both A and B GET show `featured:true` (chain-wide); location-only item featured → only its location                                                                                                                         |
| TC-282 | P1  | 🔴 pin (`test.fail()`): **Chain** `reset-availability` after a per-location 86 → A still `outOfStock:true` (expected: cleared)                                                                                                                                       |
| TC-283 | P1  | 🔴 pin: second owner's JWT `PUT /menu/menu-items/{seedItem}/changes` → expected 403, currently 200                                                                                                                                                                   |
| TC-284 | P1  | 🔴 pin: second owner `DELETE /menu/menuItemId/{seedItem}` → expected 403 (test restores via admin if it "succeeds")                                                                                                                                                  |
| TC-285 | P1  | 🔴 pin: second owner `POST /menu/item/new {groupId: seedGroup}` and `DELETE /menu/group/{emptySeedGroup}` → expected 403                                                                                                                                             |
| TC-286 | P1  | 🔴 pin: second owner `POST /upload/menu/item/picture/{seedItem}` → expected 403                                                                                                                                                                                      |
| TC-287 | P1  | Positive control for the pins: second owner on the **guarded** routes (`availability`, `featured`, `price-override`) → 403 today (proves the token/fixture, and that the guarded set stays guarded)                                                                  |

_"Second owner" = a per-run OWNER created through the existing admin user-management helpers
(`adminCreateUser` + `assignRestaurantToUserApi` to a throwaway restaurant) — no new `.env` secret needed;
falls back to `OWNER2_EMAIL/PASSWORD` if present._

### Layer 2a — Menu tab UI (`tests/dashboard/owner/04b-menu-availability.spec.ts`, POM `MenuAvailabilityPage`; seeds one private group with 3 items per file)

| TC     | P   | Assertion                                                                                                                                                                                                                                        |
| ------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-288 | P1  | Sidebar `data-tour=tab-Menu` → "Menu Availability Management"; seeded group accordion visible with "3 Available"; "Manage Menu" lands on the builder (`New Category` visible)                                                                    |
| TC-289 | P1  | Availability OFF → ConsequenceDialog "Mark "X" as sold out?" → "Mark sold out" → `PATCH …/availability` body `{outOfStock:true}` (waitForResponse) → caption "Out of Stock", chips "2 Available"/"1 Out of Stock"; ON → no dialog, chips restore |
| TC-290 | P1  | "Restore All to Available" absent when none out; 86 two via API → button present → dialog names 2 items → "Restore all" → `POST …/reset-availability` → "3 Available"                                                                            |
| TC-291 | P1  | Featured: star on seeded item → appears in Featured accordion, chip `n/5`; un-star removes; at 5/5 the 6th star is disabled or errors (assert whichever the UI does; API side is TC-270)                                                         |
| TC-292 | P2  | "Refresh" fires the menus GET (waitForResponse) and re-renders a change made via API meanwhile (86 one item behind the UI's back → after Refresh caption "Out of Stock")                                                                         |
| TC-293 | P2  | Empty state on a menu-less throwaway restaurant (API-created + assigned to owner): "No menu data available" → "Open menu builder" → builder empty state "No categories yet" / "Add First Category"                                               |

### Layer 2b — Builder, wizard, item detail (`04-menu-management.spec.ts` extended + `04c-menu-item-editor.spec.ts`; POMs `OwnerMenuPage`(builder), `MenuItemWizardPage`, `MenuItemDetailPage`)

| TC     | P   | Assertion                                                                                                                                                                                                                                                                                                                                               |
| ------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-294 | P2  | New Category via preset chip ("Desserts") → tab appears; re-adding same name → "… already exists in category" error, dialog stays open                                                                                                                                                                                                                  |
| TC-295 | P1  | Wizard step-0 rules: 1-char name → "at least 2 characters"; price `0` → "at least $0.01"; `10000` → "cannot exceed $9,999.99"; 501-char description → "cannot exceed 500 characters"; Next stays disabled                                                                                                                                               |
| TC-296 | P1  | Wizard step-1 modifiers: add 3 groups — "Size" **Sets Final Price** (Small/Large, min1 max1, Large default), "Extras" **Adds to Price** (+1.50, Allow Multiples), "Remove" **Free** (min0) → Review lists 3 groups → save → item detail "Customization Options" shows Min/Max + chips; `GET /menu/itemId/:id` pricing modes match and Free prices are 0 |
| TC-297 | P1  | Wizard step-2 image: `setInputFiles` on the hidden file input with `fixtures/assets/menu-item.png` → preview → save → detail page `<img>` src non-empty and `GET /menu/itemId/:id` has `imageUrls`                                                                                                                                                      |
| TC-298 | P2  | Wizard "Start from a Template" → gallery → search "burger" → "Use This Item" → step-0 name/price prefilled                                                                                                                                                                                                                                              |
| TC-299 | P1  | Card "Clone Item" (`menu-item-clone`) → wizard prefilled with source name/price → save → two cards; the clone is a separate id                                                                                                                                                                                                                          |
| TC-300 | P1  | Card click → item detail page URL `…/itemId/:iid`, name/price/description rendered; "Edit" → edit wizard; browser Back returns                                                                                                                                                                                                                          |
| TC-301 | P1  | Item detail image: "Upload" (file input) → confirm "Yes, Replace" when one exists → `POST /upload/menu/item/picture`; "Remove Image" → "Yes, Remove" → `DELETE …/picture` → placeholder shown                                                                                                                                                           |
| TC-302 | P1  | Item detail "Delete" (if the owner holds `DELETE_MENU_ITEM` — discover via `/me` permissions, else `test.skip` with reason): confirm → soft delete → builder card shows "No longer available" badge (or is absent) → detail page shows the inactive banner and disabled actions                                                                         |
| TC-303 | P1  | Item detail "Delete" blocked: item referenced by an ACTIVE deal (API-seeded) → dialog "Cannot Delete This Item" listing the deal under "Active Deals" → OK; item still active                                                                                                                                                                           |
| TC-304 | P2  | "Reorder modifiers" sheet opens with the item's groups; keyboard-drag one handle (`aria-label="Drag to reorder …"`, Space/ArrowDown/Space) → "Save order" → toast "Modifier order saved" → `GET` order changed (falls back to API-only if dnd-kit ignores keyboard)                                                                                     |
| TC-305 | P2  | Card star toggles featured; badge "Featured" appears; reflected on the Menu tab's Featured accordion                                                                                                                                                                                                                                                    |
| TC-306 | P2  | "Clone Menu" dialog: opens, lists another owned restaurant as source (needs ≥2 owned — chain fixture provides), "Select Categories" → pick one → "Clone 1 Items"… **as a UI smoke only**; the actual clone into the seed restaurant is executed via API in TC-280's sibling and cleaned                                                                 |
| TC-307 | P3  | Presence smokes (no AI calls): "Generate Menu" opens "AI Menu Import" with Upload File / Import from URL tabs; "Generate Images" opens "Bulk AI Image Generation"; wizard "Paste Text" opens "Paste Menu Item"; "AI Suggest" visible in edit mode. Close each.                                                                                          |

### Layer 2c — Chain menu UI (`tests/dashboard/owner/17-chain-menu.spec.ts`; POMs `ChainMenuPage`, `LocationPricingDialog`; serial; fixture §5)

| TC     | P   | Assertion                                                                                                                                                                                                                                                                                                                     |
| ------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-308 | P1  | Location A Menu tab: chain banner "You're editing A. Shared items come from the chain menu…", split summary "{s} shared (chain) · {l} only this location", chip "From shared menu" on a shared item; builder MenuScopeBar "Editing menu for: A · this location only" + "Switch to all 2 locations" → `/chain/:gid/…?tab=Menu` |
| TC-309 | P1  | Chain shell Menu tab: banner "This is your shared menu — changes here apply to all 2 locations…"; availability switch, `$` icon and eye icon **absent**; "Manage shared menu (all locations)" → chain builder with "EDITING SHARED MENU" bar and "Back to A only"                                                             |
| TC-310 | P1  | Per-location price: `$` icon on a shared item at A → dialog `Pricing for "X" at this location` → Base price 14.00 (shared $12.00 shown) → Save → tooltip/label "Location price: $14.00"; B's tab still shows shared; "Reset to shared price" → cleared; API GET agrees                                                        |
| TC-311 | P1  | Per-location 86: switch OFF at A → confirm → A "Out of Stock"; B's tab "Available"; ON at A restores                                                                                                                                                                                                                          |
| TC-312 | P1  | Carry: eye icon at A → "Remove "X" from this location's menu?" → "Remove from menu" → row shows restore state; customer menu GET for A omits, B includes; restore                                                                                                                                                             |
| TC-313 | P1  | Fan-out: edit a shared item at A → save → "Heads up — chain-wide change … all 2 locations" → Continue → new name visible on **both** locations' tabs; item editor banner "Shared chain menu item — changes … apply to all 2 chain locations"                                                                                  |
| TC-314 | P1  | Scope on add: at A, "Add {shared category} Item" → "Who is this item for?" → "Just this store" → wizard banner "This item is for this location only" → save → card badge "Only here" at A; absent at B. Repeat with "All my stores" → badge "Shared", present at B                                                            |
| TC-315 | P2  | New Category at A with scope radio "Just this store" → chip "Only at this location"; "All my stores (shared across 2)" → chip "Shared · all 2 locations" and visible in the chain shell                                                                                                                                       |
| TC-316 | P2  | Featured on a shared item at A → fan-out confirm → starred at B too; on a location-only item → no confirm, only A                                                                                                                                                                                                             |
| TC-317 | P2  | Location-only item shows **no** `$` price icon and no eye icon (override machinery is for shared items only); "Clone Menu" button disabled in A's builder with the chain tooltip                                                                                                                                              |
| TC-318 | P2  | LocationPricingEditor per-modifier: override the "Large" size price → row chip "Overridden", "Reset all to shared" clears both base and modifier; "Adjust all by 10 %" → Apply → previews rounded values (assert numbers)                                                                                                     |
| TC-319 | P3  | Chain "Manage shared menu" builder → Add Category has no scope radio (already shared); category chip "Shared · all 2 locations"                                                                                                                                                                                               |

### Layer 3 — Storefront hand-off (`tests/customer/06-menu-handoff.spec.ts`; `page` = anonymous on `TEMPLATE_WIND_URL`, `ownerPage` = owner; seeded item)

| TC     | P   | Assertion                                                                                                                                                                                                               |
| ------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-320 | P1  | Owner 86s the seed item (UI, TC-289 path) → wind `/menu?restaurantId=` shows it sold-out / not addable; owner restores → addable again                                                                                  |
| TC-321 | P1  | **Chain**: override price at A ($14 vs $12) → wind `?restaurantId=A` shows $14, `?restaurantId=B` shows $12; add at A → cart/checkout subtotal uses **$14** (the "shown $14, charged $12" defect class); clear override |
| TC-322 | P2  | **Chain**: uncarry at A → wind A menu lacks the item, B has it; restore                                                                                                                                                 |

Counts: Layer 1 = 25 · 2a = 6 · 2b = 14 · 2c = 12 · 3 = 3 → **60 new TCs** (P1 ≈ 38). Deliberately **not** planned:
real AI generation/import (cost + nondeterministic), "Add Sample Menu Data" (pollutes the seed restaurant),
"Upload from Phone" (SMS), "Permanently Delete" via UI (admin-only; API-covered in TC-271), Uber republish.

---

## 5. Suggested layout, fixtures & decisions

**Files**

```
tests/dashboard/owner/
  04-menu-management.spec.ts        # existing TC-19..67 + TC-294, 295, 299, 300, 305, 306, 307
  04b-menu-availability.spec.ts     # TC-288..293  (the ?tab=Menu page)
  04c-menu-item-editor.spec.ts      # TC-296..298, 301..304 (wizard steps 1-2, item detail)
  17-chain-menu.spec.ts             # TC-308..319  (serial; chain fixture)
  api-menu.spec.ts                  # TC-263..287
tests/customer/06-menu-handoff.spec.ts   # TC-320..322
pages/dashboard/restaurant/
  MenuAvailabilityPage.ts           # repurpose the stub MenuManagementPage.ts (already targets ?tab=Menu; role-agnostic)
  MenuBuilderPage.ts                # = today's OwnerMenuPage (move + re-export to keep imports)
  MenuItemWizardPage.ts             # step 0-3 drivers: fillBasics, addModifierGroup(mode,…), uploadImage(file), review/save
  MenuItemDetailPage.ts             # image actions, edit/delete/reorder, blocked-delete dialog, inactive banner
  LocationPricingDialog.ts          # base/modifier rows, reset, adjust-all, save
  ChainMenuPage.ts                  # chain shell + MenuScopeBar + fan-out confirm helpers
fixtures/assets/menu-item.png       # 1 small real PNG for upload tests
utils/apiHelper.ts                  # + createTestMenuItemFull(groups), getMenuItemApi, getPublicMenu(restaurantId),
                                    #   applyMenuItemChangesRaw, reorderModifiersRaw, setAvailabilityRaw, resetGroupAvailabilityRaw,
                                    #   toggleFeaturedRaw, setPriceOverrideRaw, setLocationPricingRaw, setCarriedRaw,
                                    #   deleteMenuItemRaw, cloneMenuRaw, uploadMenuItemImageRaw, ensureAutomationChain(),
                                    #   createSecondOwner()
```

**Chain fixture — the one real decision.** Today's QA owner (`OWNER_EMAIL`) owns exactly one restaurant
(`5f12beef… Boithok Khana Kitchen`, `restaurantGroupId=null`), so no chain exists to test against.
Options:

| Option                                                                                                                                                                                                                                                                                                                                                                                                         | Pros                                                                                                         | Cons                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (recommended)** — persistent chain owned by the seed OWNER, **created-if-missing** by `globalSetup` via the admin API: two throwaway restaurants "Automation Chain A/B" (`createRestaurantRaw` + `assignRestaurantToUserApi`) → `POST /api/admin/chains {foundingRestaurantId, name:"Automation Chain"}` → `POST /api/admin/chains/:gid/restaurants/B/link {seedMaster:true}`; ids written to shared state | No new secret; deterministic; created once, reused nightly; unlink/dissolve never attempted (no orphan risk) | The seed owner permanently owns 3 restaurants → **`SEED_RESTAURANT_ID=5f12beef-…` must be pinned in `.env`/CI** (today unset → globalSetup falls back to `restaurants[0]`, which could become a chain member); any test asserting "owner has 1 restaurant" must be checked (grep found none) |
| B — per-run throwaway chain, torn down by unlink → auto-dissolve → delete restaurants                                                                                                                                                                                                                                                                                                                          | Leaves nothing behind when it works                                                                          | Slow (≈10 API calls per run), and unlink is refused for the anchor member / live locations — teardown will fail sometimes and leave the same residue as A without the benefit of reuse                                                                                                       |
| C — a second owner account (`OWNER2_EMAIL/PASSWORD`) that owns a pre-provisioned chain                                                                                                                                                                                                                                                                                                                         | Cleanest tenant separation; also serves the authz pins directly                                              | New secret in `.env` + CI; a second `ownerPage` fixture/session; someone has to provision it once                                                                                                                                                                                            |

Recommendation: **A**, plus pin `SEED_RESTAURANT_ID` in `.env` and the CI secret. The authz pins
(TC-283..287) use a per-run second owner minted through the admin user-management API (already in
`apiHelper.ts` for the admin user-tab suite), so no `.env` change for them either.

**Frontend testids to add in the same change** (RestauNax PR, per TEST_PLAN locator rule):
`menu-availability-switch`, `menu-featured-toggle` (promote the `data-tour` to a testid or keep both),
`menu-price-override`, `menu-carry-toggle`, `menu-source-chip`, `menu-restore-all`,
`menu-scope-bar-switch`, `fanout-confirm-continue`, `menu-item-delete`, `menu-item-reorder`.
POMs ship with the testid-first-with-fallback pattern so they pass on QA before the deploy.

**Data hygiene**

- Every file seeds its own `Automation Menu <RUN_ID>` group + items via API and hard-deletes via the
  admin `/permanent` route in `afterAll` (soft delete would block the group delete — documented debt);
  `globalTeardown.deleteAutomationMenuGroups` stays the sweeper (extend its name filter to `Automation Menu *`).
- Never mutate the seed restaurant's real categories/items (customer tests order from them).
- Chain tests restore every override (`priceOverride:null`, `isCarried:true`, `outOfStock:false`) in
  `afterEach`; the fixture chain's own menu is throwaway so a leak only affects the next chain run.

**Reporting**: Allure `feature` labels — "Owner Menu Management" (builder/wizard/detail),
"Owner Menu Availability" (tab), "Chain Menu" (2c), "Menu API Contract" (Layer 1), "Menu → Storefront" (Layer 3).
`TEST_CASES.md`, `TEST_COVERAGE.md`, `TEST_PLAN.md` coverage table + Roadmap updated with each batch.

---

## 6. Suggested build order (each step lands green before the next)

1. Helpers + `SEED_RESTAURANT_ID` pin + `fixtures/assets/menu-item.png` + `ensureAutomationChain()` (guarded: skips chain files with a clear reason if admin creds are missing).
2. Layer 1 `api-menu.spec.ts` (TC-263..287) — fastest feedback, no UI, surfaces backend surprises early; file the RestauNax IDOR issue.
3. Layer 2a `04b-menu-availability.spec.ts` (TC-288..293) + `MenuAvailabilityPage` POM.
4. Layer 2b wizard/detail (TC-295..305) + POMs; extend `04-menu-management.spec.ts`.
5. Layer 2c `17-chain-menu.spec.ts` (TC-308..319) + chain POMs (+ frontend testid PR).
6. Layer 3 hand-off (TC-320..322).
   6b. **Admin side of chains** (asked 2026-08-15, agreed as a trailing step so it never blocks the owner
   layers): TC-223 already covers "form a chain from a founding store" in the admin UI, and the fixture
   above exercises the admin create + link **API**. Still open in the admin UI: the "add existing
   restaurant" link wizard (menu `keep` vs `adopt`, `seedMaster`) and the unlink guards (anchor member /
   live location refused). Plan: `admin/chains.spec.ts` TC-323 (link a throwaway store to the fixture chain
   with `menu:"keep"` → its own items interleave; then unlink it — it never went live, so unlink is
   allowed and the chain stays at 2) and TC-324 (unlink refused for the anchor member; API contract via
   `POST /api/admin/chains/:gid/restaurants/:rid/unlink`). Extend `ensureAutomationChain` only if a third
   persistent location is ever needed — prefer throwaway stores for link/unlink.
7. Docs sweep (`TEST_CASES.md`, `TEST_COVERAGE.md`, `TEST_PLAN.md`), `graphify update .`, one PR.
