/**
 * dual-pricing.spec.ts — Dashboard side of dual pricing v2 (owner + admin UI).
 * Backend restaunax #683 is on QA. The API contract is covered in
 * tests/pos/09-dual-pricing.spec.ts (TC-484..493); this file holds the UI
 * cases, fixme'd until the dashboard route-prefix fix (restaunax #684) is on
 * QA and the selectors (markup field, Convert menu dialog, Order Settings
 * gating) can be pinned.
 */

import { test } from "../../../fixtures/base";

test.describe("Dashboard — Dual pricing v2", () => {
  test.fixme("TC-494: admin Update Restaurant shows the card markup field; the owner toggle is disabled until a markup exists; the Convert menu dialog previews CR/CA rows and hides once run", async () => {});
});
