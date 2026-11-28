# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-gift-card-disputes.spec.ts >> Gift card disputes — attributed to the holder (API + UI) >> TC-2047: a stolen-card gift card purchase lands on the restaurant that holds the card
- Location: tests/dashboard/owner/api-gift-card-disputes.spec.ts:214:9

# Error details

```
Error: purchase 400: {"success":false,"message":"This payment is being disputed, so it can't be used. Start a new payment.","errorCode":"PAYMENT_VALIDATION_FAILED","errorId":"bfa0e5c1-2301-4509-9831-44b3fe94e2e4"}

expect(received).toContain(expected) // indexOf

Expected value: 400
Received array: [200, 201]
```

# Test source

```ts
  62  |   const headers = scopeHeaders(scope, lang);
  63  |   return apiRequestRaw<T>(
  64  |     method,
  65  |     `${scopePrefix(scope)}${path}`,
  66  |     body,
  67  |     token,
  68  |     Object.keys(headers).length ? headers : undefined
  69  |   );
  70  | }
  71  | 
  72  | /** Path of the CSV export for a scope: `<prefix>/export.csv` + query. */
  73  | export const csvExportPath = (scope: Scope, query = ""): string =>
  74  |   `${scopePrefix(scope)}/export.csv${query}`;
  75  | 
  76  | /** The CSV export (text, not JSON): status, headers and the raw body. */
  77  | export async function ownerGiftCardCsvRaw(
  78  |   token: string,
  79  |   scope: Scope,
  80  |   query = ""
  81  | ): Promise<{ status: number; headers: Headers; text: string }> {
  82  |   const res = await fetch(`${BACKEND_URL}${csvExportPath(scope, query)}`, {
  83  |     headers: { Authorization: `Bearer ${token}`, ...scopeHeaders(scope) },
  84  |   });
  85  |   return { status: res.status, headers: res.headers, text: await res.text() };
  86  | }
  87  | 
  88  | /** Any POS gift card call: `/api/tablet/gift-cards{path}`. */
  89  | export function tabletGiftCardRaw<T = LooseJson>(
  90  |   tablet: string,
  91  |   session: string | undefined,
  92  |   method: "POST" | "PUT",
  93  |   path: string,
  94  |   body?: unknown
  95  | ): Promise<RawResponse<T>> {
  96  |   return tabletRaw<T>(tablet, method, `/gift-cards${path}`, body, session);
  97  | }
  98  | 
  99  | /**
  100 |  * Buy a card online the way a guest's browser does: PaymentIntent from the
  101 |  * backend, confirmed through Stripe's publishable key with a test token, then
  102 |  * `/api/gift-cards/purchase` with the client secret (so the code is revealed
  103 |  * even when the webhook minted the card first). `tok_createDispute` makes the
  104 |  * charge dispute itself a few seconds later.
  105 |  */
  106 | export async function buyGiftCardOnline(
  107 |   pk: string,
  108 |   restaurantId: string,
  109 |   amount: number,
  110 |   opts: {
  111 |     cardToken?: "tok_visa" | "tok_createDispute";
  112 |     recipientEmail?: string;
  113 |   } = {}
  114 | ): Promise<{ code: string; giftCardId: string; paymentIntentId: string }> {
  115 |   const publishableKey =
  116 |     pk || String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
  117 |   const intent = await apiRequestRaw<{ clientSecret?: string }>(
  118 |     "POST",
  119 |     "/api/stripe/gift-card-payment-intent",
  120 |     {
  121 |       amount,
  122 |       restaurantId,
  123 |       deliveryMethod: opts.recipientEmail ? "EMAIL" : "LINK",
  124 |       recipientEmail: opts.recipientEmail,
  125 |     }
  126 |   );
  127 |   expect(
  128 |     intent.status,
  129 |     `gift-card-payment-intent: ${JSON.stringify(intent.data)}`
  130 |   ).toBe(200);
  131 |   const clientSecret = String(intent.data.clientSecret ?? "");
  132 |   const paymentIntentId = clientSecret.split("_secret_")[0] ?? "";
  133 |   expect(paymentIntentId, "clientSecret carries the intent id").toMatch(/^pi_/);
  134 | 
  135 |   const pm = await stripePublicRaw(publishableKey, "POST", "/payment_methods", {
  136 |     type: "card",
  137 |     "card[token]": opts.cardToken ?? "tok_visa",
  138 |   });
  139 |   expect(pm.status, JSON.stringify(pm.data)).toBe(200);
  140 |   const confirmed = await stripePublicRaw(
  141 |     publishableKey,
  142 |     "POST",
  143 |     `/payment_intents/${paymentIntentId}/confirm`,
  144 |     { client_secret: clientSecret, payment_method: String(pm.data.id) }
  145 |   );
  146 |   expect(confirmed.status, JSON.stringify(confirmed.data)).toBe(200);
  147 | 
  148 |   const purchase = await apiRequestRaw<{
  149 |     data?: { id?: string; code?: string };
  150 |   }>("POST", "/api/gift-cards/purchase", {
  151 |     paymentIntentClientSecret: clientSecret,
  152 |     stripePaymentIntentId: paymentIntentId,
  153 |     amount,
  154 |     restaurantId,
  155 |     deliveryMethod: opts.recipientEmail ? "EMAIL" : "LINK",
  156 |     recipientEmail: opts.recipientEmail,
  157 |   });
  158 |   // 201 on a fresh mint, 200 when the webhook minted the card first.
  159 |   expect(
  160 |     [200, 201],
  161 |     `purchase ${purchase.status}: ${JSON.stringify(purchase.data)}`
> 162 |   ).toContain(purchase.status);
      |     ^ Error: purchase 400: {"success":false,"message":"This payment is being disputed, so it can't be used. Start a new payment.","errorCode":"PAYMENT_VALIDATION_FAILED","errorId":"bfa0e5c1-2301-4509-9831-44b3fe94e2e4"}
  163 |   const card = purchase.data.data ?? {};
  164 |   expect(card.id, "purchase returns the card id").toBeTruthy();
  165 |   expect(card.code, "purchase reveals the code").toBeTruthy();
  166 |   return {
  167 |     code: String(card.code),
  168 |     giftCardId: String(card.id),
  169 |     paymentIntentId,
  170 |   };
  171 | }
  172 | 
  173 | /** The masked shape every owner/tablet surface shows: ****-****-****-AB12. */
  174 | export const isMaskedCode = (s: string): boolean =>
  175 |   /^\*{4}-\*{4}-\*{4}-[A-Z0-9]{4}$/.test(s);
  176 | 
  177 | /** Dollars (a number or a numeric string) to whole cents. */
  178 | export const cents = (n: unknown): number => Math.round(Number(n) * 100);
  179 | 
  180 | /** Roll-forward: start + Σ lines = end, to the cent, and difference is 0. */
  181 | export const rollForwardTies = (rf: {
  182 |   startBalance: number;
  183 |   endBalance: number;
  184 |   difference: number;
  185 |   lines: Record<string, number>;
  186 | }): boolean =>
  187 |   cents(rf.startBalance) +
  188 |     Object.values(rf.lines).reduce((sum, v) => sum + cents(v), 0) ===
  189 |     cents(rf.endBalance) && cents(rf.difference) === 0;
  190 | 
  191 | /** Sum `{ amount, count }` rows; the amount is rounded to cents. */
  192 | export const sumMoneyCounts = (
  193 |   xs: { amount: number; count: number }[]
  194 | ): { amount: number; count: number } => ({
  195 |   amount: xs.reduce((s, x) => s + cents(x.amount), 0) / 100,
  196 |   count: xs.reduce((s, x) => s + x.count, 0),
  197 | });
  198 | 
```