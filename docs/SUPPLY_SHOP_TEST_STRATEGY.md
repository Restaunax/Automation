# Supply shop + physical gift cards — test strategy

**Scope:** the web side of RestauNax #678 — the owner's Print Shop, the admin's Supply Shop and
gift-card batches, the public gift-card endpoints, and the customer checkout's reaction to
unloaded stock. **The POS (device-in-store, PR #38) is deliberately out of scope**; it gets its own
suite when that repo is next touched.

## 0. TL;DR

- **Nothing is charged when an owner places an order.** They see an estimate range
  (`[list, list × 1.25]` for the gift card — `$207.00 – $258.75` on 100 cards) and the order lands
  in `IN_DESIGN`. The admin's **Fulfil** is the one call that moves money: final price, or comp,
  then charge → cost record → post-fulfilment hook → `IN_PRODUCTION`.
- **Every catalog product requires artwork**, so the admin design step (upload a PDF → preflight →
  send proof) sits between placement and fulfilment in every E2E path. `utils/pdfFixture.ts`
  builds the PDF by hand; the right page size is trim + 0.125 in bleed per edge.
- **Comp is the only E2E route to a minted gift-card batch.** The CHARGE path on a throwaway
  tenant (no saved card) falls back to Stripe hosted Checkout, which cannot be completed on QA
  (Radar hCaptcha). Tests prove that path up to the link and the email, then stop.
- **A physical card is codes, not money** until a register loads it: `INACTIVE`, balance 0, public
  balance lookup → 200 `INACTIVE`, validate → "not activated yet", checkout refuses it, admin
  adjust refuses it (409 `NOT_ACTIVATABLE`), unfreeze restores `INACTIVE` not `ACTIVE`.

## 1. Findings that outranked the plan

| Finding                                                                                                                    | Where it lives now                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The admin **"Card export" button could not download** — `window.open` of a bearer-only API path on the frontend host.      | Fixed in #678 (blob through apiService, server filename, `Content-Disposition` exposed via CORS). TC-463 / TC-470 assert the real download. |
| Every supply-shop **email CTA linked `/supply-shop/orders/:id`**, which was never a route.                                 | Fixed in #678 → the restaurant's Print Shop tab. TC-449 opens the link.                                                                     |
| `PUT /api/admin/gift-cards/config` **ignored** `allowPhysicalActivation` / `allowCashFunding` / `maxCashFloatPerLocation`. | Fixed in #678. TC-476 round-trips them and refuses a negative cap.                                                                          |
| `INACTIVE` stock answered validate/link with "no longer active".                                                           | Fixed in #678 → "hasn't been activated yet". TC-471 asserts the wording.                                                                    |
| The HQ*CARDS*\* permissions are **UI-only**; the APIs are `requireRole(["ADMIN"])`.                                        | TC-468 asserts a 403 for an EMPLOYEE at the API, not the sidebar.                                                                           |

## 2. Files

| File                                                                                                                                                | TCs                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `tests/dashboard/owner/20-supply-shop.spec.ts`                                                                                                      | 446–455 (browser, throwaway tenant, `loginViaUi`)  |
| `tests/dashboard/admin/supply-shop.spec.ts`                                                                                                         | 456–468 (browser, `adminPage`, own tenant via API) |
| `tests/dashboard/admin/gift-card-batches.spec.ts`                                                                                                   | 469–476 (browser, `adminPage`)                     |
| `tests/dashboard/owner/api-supply-shop.spec.ts`                                                                                                     | 478–483 (API only)                                 |
| `tests/customer/02-checkout.spec.ts`                                                                                                                | 477                                                |
| `pages/dashboard/owner/OwnerSupplyShopPage.ts`, `pages/dashboard/admin/AdminSupplyShopPage.ts`, `pages/dashboard/admin/AdminGiftCardBatchesPage.ts` | POMs                                               |
| `utils/pdfFixture.ts`, `utils/apiHelper.ts` (`// ── Supply shop` + `// ── Gift cards: config + physical batches` banners)                           | helpers                                            |

## 3. What is API and what is browser

Setup and assertions run through the API; the browser does the one thing under test. Concretely:
placement is driven through the real brief form once (TC-448) and via `placeSupplyOrderViaApi`
everywhere else; the artwork upload is driven through the dialog once (TC-458) and via
`uploadSupplyArtworkRaw` + `sendSupplyProofRaw` everywhere else; fulfilment is driven through the
dialog for the charge (TC-460) and comp (TC-462) paths and via `fulfilSupplyOrderRaw` for the
negatives. Every browser assertion is then cross-checked against `GET /orders` (owner) or
`GET /api/admin/supply-shop/orders/:id`.

## 4. Known gaps (documented, not faked)

1. **Hosted Checkout completion** — see TL;DR. `TEST_COVERAGE.md` tech-debt row.
2. **NEXT_INVOICE / "On invoice"** — needs a subscribed tenant with a payment method. Tests branch
   on `quote.credit.eligible` so they self-heal.
3. **Free tier / "Free" total** — no product is free-tier eligible under the $10 cap.
4. **The design queue's empty state** — the admin table is cross-tenant on shared QA; never asserted.
5. **The physical print run** — `docs/PHYSICAL_TEST_LEDGER.md` §11.

## 5. Running

```bash
# needs RestauNax #678 deployed to the target; ADMIN_* (+ MAILPIT_BASE_URL for @email)
npx playwright test --project=dashboard tests/dashboard/owner/api-supply-shop.spec.ts   # fastest sanity check
npx playwright test --project=dashboard tests/dashboard/admin/gift-card-batches.spec.ts
npx playwright test --project=dashboard tests/dashboard/owner/20-supply-shop.spec.ts tests/dashboard/admin/supply-shop.spec.ts
npx playwright test --project=customer -g "TC-477"
```

Rate limits: `/api/admin` is 50 req/min per IP; the admin spec makes ~30 setup calls, so do not
run the three dashboard files in parallel from one machine. Owner tokens from `apiLogin` have no
refresh path (~15 min) — every late API call re-logs in (`ownerApi()`).

## 6. Repeatable method

1. Read the backend state machine first (`restaunax/docs/features/SUPPLY_SHOP.md` §7) and the
   card lifecycle (`docs/features/GIFT_CARDS_PHYSICAL.md`); the sets `SETTLED_STATUSES` /
   `UNSETTLED_FULFILLABLE_STATUSES` tell you which statuses a fulfil may charge from.
2. Quote the EN strings from `restaunax-frontend/public/locales/en/{supplyShop,admin}.json` — the
   estimate separator is an EN DASH (U+2013) and the margin line uses a MINUS SIGN (U+2212).
3. One order per path, threaded through a serial file; own the tenant; cancel what you can in
   `afterAll` (IN_PRODUCTION cannot be cancelled — the archived restaurant carries it).
