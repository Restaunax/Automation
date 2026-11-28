# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/restaurant-closeout.spec.ts >> HQ — Restaurant close-out >> TC-935: the Deactivate dialog offers pay-or-return per device (return by default) and confirming closes the restaurant out
- Location: tests/dashboard/admin/restaurant-closeout.spec.ts:120:7

# Error details

```
Error: POST assignment → 400: {"success":false,"error":"Item is not available for assignment (current status: ASSIGNED)"}
```

# Test source

```ts
  1   | /**
  2   |  * closeOutApi.ts — restaurant close-out helpers (RestauNax PR #1038,
  3   |  * docs/features/FINAL_INVOICE_AND_EQUIPMENT_RECOVERY_DESIGN.md).
  4   |  *
  5   |  * Staff deactivation (HQ → Restaurants → Deactivate) runs the close-out:
  6   |  * offline, closing payout, final balance, and a pay-or-return choice per
  7   |  * RestauNax device. Admin routes live under /api/admin/close-out/* (+ the
  8   |  * waiver at /api/admin/charges/:id/waive, ADMIN only, reason required).
  9   |  *
  10  |  * Equipment fixture: ONE persistent catalogue item + inventory unit
  11  |  * ("AUTO Close-out Tablet", serial AUTO-CLOSEOUT-1), reused every run — the
  12  |  * spec assigns it FREE (no Stripe charge) to a throwaway restaurant, and
  13  |  * cleanup marks it returned and back IN_STOCK, so runs never pile hardware
  14  |  * rows up on QA.
  15  |  */
  16  | import { apiRequestRaw, type RawResponse } from "./apiHelper";
  17  | 
  18  | export const CLOSEOUT_CATALOG_NAME = "AUTO Close-out Tablet";
  19  | export const CLOSEOUT_SERIAL = "AUTO-CLOSEOUT-1";
  20  | const CLOSEOUT_VENDOR = "Automation";
  21  | const CLOSEOUT_SKU = "AUTO-CLOSEOUT";
  22  | 
  23  | interface Envelope<T> {
  24  |   success?: boolean;
  25  |   data?: T;
  26  |   error?: string;
  27  |   message?: string;
  28  | }
  29  | 
  30  | const must = <T>(res: RawResponse<Envelope<T>>, what: string): T => {
  31  |   if (!res.ok || res.data?.data === undefined)
> 32  |     throw new Error(`${what} → ${res.status}: ${JSON.stringify(res.data)}`);
      |           ^ Error: POST assignment → 400: {"success":false,"error":"Item is not available for assignment (current status: ASSIGNED)"}
  33  |   return res.data.data as T;
  34  | };
  35  | 
  36  | /** Find-or-create the fixture catalogue item + unit; returns the unit id. */
  37  | export async function ensureCloseOutDevice(adminToken: string): Promise<{
  38  |   catalogItemId: string;
  39  |   inventoryItemId: string;
  40  | }> {
  41  |   const catalog = must(
  42  |     await apiRequestRaw<
  43  |       Envelope<{ items: Array<{ id: string; name: string }> }>
  44  |     >(
  45  |       "GET",
  46  |       `/api/admin/equipment/catalog?search=${encodeURIComponent(CLOSEOUT_CATALOG_NAME)}`,
  47  |       undefined,
  48  |       adminToken
  49  |     ),
  50  |     "GET catalog"
  51  |   );
  52  |   let catalogItemId = catalog.items.find(
  53  |     (i) => i.name === CLOSEOUT_CATALOG_NAME
  54  |   )?.id;
  55  |   if (!catalogItemId) {
  56  |     catalogItemId = must(
  57  |       await apiRequestRaw<Envelope<{ id: string }>>(
  58  |         "POST",
  59  |         "/api/admin/equipment/catalog",
  60  |         {
  61  |           name: CLOSEOUT_CATALOG_NAME,
  62  |           slug: "auto-close-out-tablet",
  63  |           category: "ACCESSORY",
  64  |           vendor: CLOSEOUT_VENDOR,
  65  |           vendorSku: CLOSEOUT_SKU,
  66  |           model: "AUTO-1",
  67  |           retailPrice: 199,
  68  |           rentalPrice: 0,
  69  |           hasSerialNumber: true,
  70  |           description:
  71  |             "Automation fixture for the close-out E2E — never ship it",
  72  |         },
  73  |         adminToken
  74  |       ),
  75  |       "POST catalog"
  76  |     ).id;
  77  |   }
  78  | 
  79  |   const inventory = must(
  80  |     await apiRequestRaw<
  81  |       Envelope<{
  82  |         items: Array<{
  83  |           id: string;
  84  |           serialNumber: string | null;
  85  |           status: string;
  86  |         }>;
  87  |       }>
  88  |     >(
  89  |       "GET",
  90  |       `/api/admin/equipment/inventory?catalogItemId=${catalogItemId}&search=${CLOSEOUT_SERIAL}`,
  91  |       undefined,
  92  |       adminToken
  93  |     ),
  94  |     "GET inventory"
  95  |   );
  96  |   const unit = inventory.items.find((i) => i.serialNumber === CLOSEOUT_SERIAL);
  97  |   if (unit) {
  98  |     if (unit.status !== "IN_STOCK" && unit.status !== "ASSIGNED") {
  99  |       await apiRequestRaw(
  100 |         "PUT",
  101 |         `/api/admin/equipment/inventory/${unit.id}`,
  102 |         { status: "IN_STOCK" },
  103 |         adminToken
  104 |       );
  105 |     }
  106 |     return { catalogItemId, inventoryItemId: unit.id };
  107 |   }
  108 |   const created = must(
  109 |     await apiRequestRaw<Envelope<{ id: string }>>(
  110 |       "POST",
  111 |       "/api/admin/equipment/inventory",
  112 |       {
  113 |         catalogItemId,
  114 |         serialNumber: CLOSEOUT_SERIAL,
  115 |         unitCost: 0,
  116 |         condition: "USED",
  117 |         notes: "Automation fixture for the close-out E2E",
  118 |       },
  119 |       adminToken
  120 |     ),
  121 |     "POST inventory"
  122 |   );
  123 |   return { catalogItemId, inventoryItemId: created.id };
  124 | }
  125 | 
  126 | /** A FREE assignment (no charge, no Stripe). Returns the assignment id. */
  127 | export async function assignFreeDevice(
  128 |   adminToken: string,
  129 |   inventoryItemId: string,
  130 |   restaurantId: string
  131 | ): Promise<string> {
  132 |   return must(
```