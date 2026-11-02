# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-supply-shop.spec.ts >> Owner — Supply shop API contract >> TC-481: the owner's order list carries the estimate and nothing internal
- Location: tests/dashboard/owner/api-supply-shop.spec.ts:188:7

# Error details

```
Error: [supply-shop] order create failed: {"success":false,"code":"NOT_LAUNCHED","error":"This item isn't available to order right now."}
```

# Test source

```ts
  5985 |     restaurantHeader(restaurantId)
  5986 |   );
  5987 | }
  5988 | 
  5989 | export function getSupplyProofOwnerRaw(
  5990 |   ownerToken: string,
  5991 |   restaurantId: string,
  5992 |   orderId: string
  5993 | ): Promise<
  5994 |   RawResponse<{
  5995 |     success: boolean;
  5996 |     data: { versionId: string; version: number; proofUrls: string[] };
  5997 |   }>
  5998 | > {
  5999 |   return apiRequestRaw(
  6000 |     "GET",
  6001 |     `/api/supply-shop/orders/${orderId}/proof`,
  6002 |     undefined,
  6003 |     ownerToken,
  6004 |     restaurantHeader(restaurantId)
  6005 |   );
  6006 | }
  6007 | 
  6008 | export function approveSupplyProofOwnerRaw(
  6009 |   ownerToken: string,
  6010 |   restaurantId: string,
  6011 |   orderId: string,
  6012 |   versionId: string
  6013 | ): Promise<
  6014 |   RawResponse<{ success: boolean; code?: string; data?: SupplyOrder }>
  6015 | > {
  6016 |   return apiRequestRaw(
  6017 |     "POST",
  6018 |     `/api/supply-shop/orders/${orderId}/approve-proof`,
  6019 |     { versionId },
  6020 |     ownerToken,
  6021 |     restaurantHeader(restaurantId)
  6022 |   );
  6023 | }
  6024 | 
  6025 | export function requestSupplyRevisionsOwnerRaw(
  6026 |   ownerToken: string,
  6027 |   restaurantId: string,
  6028 |   orderId: string,
  6029 |   note: string
  6030 | ): Promise<RawResponse<{ success: boolean; data?: SupplyOrder }>> {
  6031 |   return apiRequestRaw(
  6032 |     "POST",
  6033 |     `/api/supply-shop/orders/${orderId}/request-revisions`,
  6034 |     { note },
  6035 |     ownerToken,
  6036 |     restaurantHeader(restaurantId)
  6037 |   );
  6038 | }
  6039 | 
  6040 | export function cancelSupplyOrderOwnerRaw(
  6041 |   ownerToken: string,
  6042 |   restaurantId: string,
  6043 |   orderId: string
  6044 | ): Promise<RawResponse<{ success: boolean; data?: SupplyOrder }>> {
  6045 |   return apiRequestRaw(
  6046 |     "POST",
  6047 |     `/api/supply-shop/orders/${orderId}/cancel`,
  6048 |     { reason: "automation cleanup" },
  6049 |     ownerToken,
  6050 |     restaurantHeader(restaurantId)
  6051 |   );
  6052 | }
  6053 | 
  6054 | /**
  6055 |  * Composite: design → order → commit (IMMEDIATE). The order comes back in
  6056 |  * IN_DESIGN — every catalog product requires artwork. Throws on any refusal
  6057 |  * so a broken setup fails loudly instead of as a mystery later.
  6058 |  */
  6059 | export async function placeSupplyOrderViaApi(
  6060 |   ownerToken: string,
  6061 |   restaurantId: string,
  6062 |   opts: {
  6063 |     variantId: string;
  6064 |     quantity: number;
  6065 |     message: string;
  6066 |     paymentTerm?: string;
  6067 |   }
  6068 | ): Promise<SupplyOrder> {
  6069 |   const design = await createSupplyDesignOwnerRaw(ownerToken, restaurantId, {
  6070 |     variantId: opts.variantId,
  6071 |     name: `Automation design ${opts.message}`,
  6072 |     brief: { message: opts.message },
  6073 |   });
  6074 |   if (!design.ok) {
  6075 |     throw new Error(
  6076 |       `[supply-shop] design create failed: ${JSON.stringify(design.data)}`
  6077 |     );
  6078 |   }
  6079 |   const order = await createSupplyOrderOwnerRaw(ownerToken, restaurantId, {
  6080 |     variantId: opts.variantId,
  6081 |     quantity: opts.quantity,
  6082 |     designId: design.data.data.id,
  6083 |   });
  6084 |   if (!order.ok) {
> 6085 |     throw new Error(
       |           ^ Error: [supply-shop] order create failed: {"success":false,"code":"NOT_LAUNCHED","error":"This item isn't available to order right now."}
  6086 |       `[supply-shop] order create failed: ${JSON.stringify(order.data)}`
  6087 |     );
  6088 |   }
  6089 |   const committed = await commitSupplyOrderOwnerRaw(
  6090 |     ownerToken,
  6091 |     restaurantId,
  6092 |     order.data.data.id,
  6093 |     opts.paymentTerm ?? "IMMEDIATE"
  6094 |   );
  6095 |   if (!committed.ok) {
  6096 |     throw new Error(
  6097 |       `[supply-shop] commit failed: ${JSON.stringify(committed.data)}`
  6098 |     );
  6099 |   }
  6100 |   return committed.data.data.order;
  6101 | }
  6102 | 
  6103 | // ── Supply shop (admin) ──────────────────────────────────────────────────────
  6104 | //
  6105 | // Role-gated (`requireRole(["ADMIN"])`), not permission-gated — the HQ_CARDS_*
  6106 | // permissions only decide what the sidebar shows.
  6107 | 
  6108 | export function getAdminSupplyCatalogRaw(
  6109 |   adminToken: string
  6110 | ): Promise<RawResponse<{ success: boolean; data: SupplyCatalogProduct[] }>> {
  6111 |   return apiRequestRaw(
  6112 |     "GET",
  6113 |     "/api/admin/supply-shop/catalog",
  6114 |     undefined,
  6115 |     adminToken
  6116 |   );
  6117 | }
  6118 | 
  6119 | export const SUPPLY_GIFT_CARD_PRODUCT_SLUG = "physical-gift-card";
  6120 | export const SUPPLY_GIFT_CARD_VARIANT_SLUG = "cr80-plastic";
  6121 | 
  6122 | /** The `physical-gift-card` variant id on this environment (the catalog is seeded, ids are not). */
  6123 | export async function resolveGiftCardVariantId(
  6124 |   adminToken: string
  6125 | ): Promise<string> {
  6126 |   const res = await getAdminSupplyCatalogRaw(adminToken);
  6127 |   if (!res.ok) {
  6128 |     throw new Error(
  6129 |       `[supply-shop] admin catalog failed: ${JSON.stringify(res.data)}`
  6130 |     );
  6131 |   }
  6132 |   const product = res.data.data.find(
  6133 |     (p) => p.slug === SUPPLY_GIFT_CARD_PRODUCT_SLUG
  6134 |   );
  6135 |   const variant = product?.variants.find(
  6136 |     (v) => v.slug === SUPPLY_GIFT_CARD_VARIANT_SLUG
  6137 |   );
  6138 |   if (!variant) {
  6139 |     throw new Error(
  6140 |       `[supply-shop] ${SUPPLY_GIFT_CARD_PRODUCT_SLUG}/${SUPPLY_GIFT_CARD_VARIANT_SLUG} is not in the catalog — has the seed run on this environment?`
  6141 |     );
  6142 |   }
  6143 |   return variant.id;
  6144 | }
  6145 | 
  6146 | export interface AdminSupplyOrder extends SupplyOrder {
  6147 |   settled: boolean;
  6148 |   awaitingOwnerPayment: boolean;
  6149 |   margin: number;
  6150 |   restaurant: { id: string; name: string };
  6151 |   adminNotes?: string | null;
  6152 |   pendingFulfilment?: unknown;
  6153 | }
  6154 | 
  6155 | export function listAdminSupplyOrdersRaw(
  6156 |   adminToken: string,
  6157 |   params: {
  6158 |     queue?: "design" | "fulfilment";
  6159 |     status?: string;
  6160 |     restaurantId?: string;
  6161 |   } = {}
  6162 | ): Promise<RawResponse<{ success: boolean; data: AdminSupplyOrder[] }>> {
  6163 |   const search = new URLSearchParams();
  6164 |   if (params.queue) search.set("queue", params.queue);
  6165 |   if (params.status) search.set("status", params.status);
  6166 |   if (params.restaurantId) search.set("restaurantId", params.restaurantId);
  6167 |   const qs = search.toString();
  6168 |   return apiRequestRaw(
  6169 |     "GET",
  6170 |     `/api/admin/supply-shop/orders${qs ? `?${qs}` : ""}`,
  6171 |     undefined,
  6172 |     adminToken
  6173 |   );
  6174 | }
  6175 | 
  6176 | export function getAdminSupplyOrderRaw(
  6177 |   adminToken: string,
  6178 |   orderId: string
  6179 | ): Promise<RawResponse<{ success: boolean; data: AdminSupplyOrder }>> {
  6180 |   return apiRequestRaw(
  6181 |     "GET",
  6182 |     `/api/admin/supply-shop/orders/${orderId}`,
  6183 |     undefined,
  6184 |     adminToken
  6185 |   );
```