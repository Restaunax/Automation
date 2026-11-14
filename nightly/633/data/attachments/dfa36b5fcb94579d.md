# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-google-reviews.spec.ts >> Google review replies — API >> connect through the fake consent screen, link a location and sync
- Location: tests/dashboard/owner/api-google-reviews.spec.ts:163:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "/api/google-business-oauth/fake-consent"
Received: "/o/oauth2/v2/auth"
```

# Test source

```ts
  71  |     replied.add(reviewId);
  72  |     return gb.putReply(token, rid, reviewId, body);
  73  |   };
  74  | 
  75  |   /** An unreplied review that has text, newest first, `skip` places in. */
  76  |   async function unrepliedReview(skip = 0): Promise<gb.GbReview> {
  77  |     const res = await gb.listReviews(token, rid, {
  78  |       filter: "unreplied",
  79  |       limit: 50,
  80  |     });
  81  |     expect(res.status, JSON.stringify(res.data)).toBe(200);
  82  |     const rows = (res.data.data?.reviews ?? []).filter((r) => r.comment);
  83  |     expect(rows.length, "needs seeded unreplied reviews").toBeGreaterThan(skip);
  84  |     return rows[skip]!;
  85  |   }
  86  | 
  87  |   test.beforeAll(async () => {
  88  |     test.setTimeout(120_000);
  89  |     token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  90  |     const owned = await getOwnerRestaurants(token);
  91  |     rid = owned[0]?.id ?? "";
  92  |     test.skip(!rid, "the owner has no restaurant");
  93  |     requireRelease("googleReviews", await probeGoogleReviews(token, rid));
  94  | 
  95  |     const status = await gb.getStatus(token, rid);
  96  |     expect(status.status, JSON.stringify(status.data)).toBe(200);
  97  |     test.skip(
  98  |       status.data.data?.available === false,
  99  |       "Google Business is not configured on this backend (available:false)"
  100 |     );
  101 |     // Clear a leftover connection from an aborted run.
  102 |     if (status.data.data?.connection || status.data.data?.link) {
  103 |       await gb.disconnect(token, rid);
  104 |     }
  105 |     if (OWNER2_EMAIL && OWNER2_PASSWORD) {
  106 |       const o2 = await apiLogin(OWNER2_EMAIL, OWNER2_PASSWORD);
  107 |       strangerToken = o2.accessToken;
  108 |       const mine = new Set(owned.map((r) => r.id));
  109 |       strangerRid =
  110 |         (await getOwnerRestaurants(strangerToken)).find((r) => !mine.has(r.id))
  111 |           ?.id ?? "";
  112 |     }
  113 |   });
  114 | 
  115 |   test.beforeEach(async () => {
  116 |     await allure.label("feature", "Google review replies");
  117 |     await allure.label("severity", "normal");
  118 |   });
  119 | 
  120 |   test.afterEach(async () => {
  121 |     test.setTimeout(180_000);
  122 |     if (!token || !rid) return;
  123 |     for (const id of [...replied]) {
  124 |       replied.delete(id);
  125 |       try {
  126 |         // 200 (removed / already gone) is all that matters; never throw here.
  127 |         await gb.deleteReply(token, rid, id);
  128 |       } catch {
  129 |         /* best effort */
  130 |       }
  131 |     }
  132 |   });
  133 | 
  134 |   test.afterAll(async () => {
  135 |     test.setTimeout(120_000);
  136 |     if (!token || !rid) return;
  137 |     try {
  138 |       // A failed alert-settings test must not leave the switches flipped.
  139 |       if (alertBaseline) await gb.putReplySettings(token, rid, alertBaseline);
  140 |     } catch {
  141 |       /* best effort: the disconnect below must still run */
  142 |     } finally {
  143 |       // Frees FAKE_PLACE_1 for the next run / other restaurants.
  144 |       await gb.disconnect(token, rid).catch(() => undefined);
  145 |     }
  146 |   });
  147 | 
  148 |   test(
  149 |     "status of an unconnected restaurant: available, can manage, no connection",
  150 |     { tag: ["@google-reviews"] },
  151 |     async () => {
  152 |       const res = await gb.getStatus(token, rid);
  153 |       expect(res.status).toBe(200);
  154 |       expect(res.data.data).toMatchObject({
  155 |         available: true,
  156 |         canManage: true,
  157 |         connection: null,
  158 |         link: null,
  159 |       });
  160 |     }
  161 |   );
  162 | 
  163 |   test(
  164 |     "connect through the fake consent screen, link a location and sync",
  165 |     { tag: ["@google-reviews"] },
  166 |     async () => {
  167 |       test.setTimeout(120_000);
  168 |       const started = await gb.startConnect(token, rid);
  169 |       expect(started.status, JSON.stringify(started.data)).toBe(200);
  170 |       const url = new URL(started.data.data!.url);
> 171 |       expect(url.pathname).toBe("/api/google-business-oauth/fake-consent");
      |                            ^ Error: expect(received).toBe(expected) // Object.is equality
  172 | 
  173 |       const consent = await gb.followFakeConsent(started.data.data!.url);
  174 |       expect(consent.status).toBe(302);
  175 |       expect(consent.code).toBe("fake");
  176 |       expect(consent.state).toBeTruthy();
  177 | 
  178 |       const cb = await gb.oauthCallback(token, consent.code!, consent.state!);
  179 |       expect(cb.status, JSON.stringify(cb.data)).toBe(200);
  180 |       expect(cb.data.data?.restaurantId).toBe(rid);
  181 | 
  182 |       let status = await gb.getStatus(token, rid);
  183 |       expect(status.data.data?.connection?.googleEmail).toBeTruthy();
  184 | 
  185 |       if (!status.data.data?.link) {
  186 |         const locs = await gb.listLocations(token, rid);
  187 |         expect(locs.status).toBe(200);
  188 |         const target = locs.data.data!.locations.find(
  189 |           (l) => l.locationName === gb.FAKE_LOCATION_1
  190 |         );
  191 |         expect(target, "fake location 1 is listed").toBeTruthy();
  192 |         const link = await gb.linkLocation(token, rid, gb.FAKE_LOCATION_1);
  193 |         test.skip(
  194 |           link.status === 409 &&
  195 |             link.data.errorCode === "GOOGLE_BUSINESS_ALREADY_LINKED",
  196 |           "FAKE_PLACE_1 is held by another restaurant (the fake gives every user the same locations)"
  197 |         );
  198 |         expect(link.status, JSON.stringify(link.data)).toBe(200);
  199 |       }
  200 |       connected = true;
  201 | 
  202 |       // Sync, then wait for the reviews to land.
  203 |       for (let i = 0; i < 10; i++) {
  204 |         await gb.syncReviews(token, rid);
  205 |         status = await gb.getStatus(token, rid);
  206 |         if ((status.data.data?.counts.total ?? 0) > 0) break;
  207 |         await new Promise((r) => setTimeout(r, 1_500));
  208 |       }
  209 |       expect(status.data.data?.link?.title).toBeTruthy();
  210 |       expect(status.data.data?.counts.total).toBeGreaterThan(0);
  211 |     }
  212 |   );
  213 | 
  214 |   test(
  215 |     "list: filters, rating and cursor paging",
  216 |     { tag: ["@google-reviews"] },
  217 |     async () => {
  218 |       test.skip(!connected, "connect step did not complete");
  219 |       const all = await gb.listReviews(token, rid, { limit: 50 });
  220 |       expect(all.status).toBe(200);
  221 |       const rows = all.data.data!.reviews;
  222 |       expect(rows.length).toBeGreaterThanOrEqual(8);
  223 |       const times = rows.map((r) => Date.parse(r.createTime));
  224 |       expect([...times].sort((a, b) => b - a)).toEqual(times); // newest first
  225 | 
  226 |       const unreplied = (
  227 |         await gb.listReviews(token, rid, { filter: "unreplied", limit: 50 })
  228 |       ).data.data!.reviews;
  229 |       const repliedRows = (
  230 |         await gb.listReviews(token, rid, { filter: "replied", limit: 50 })
  231 |       ).data.data!.reviews;
  232 |       expect(unreplied.every((r) => r.reply === null)).toBe(true);
  233 |       expect(repliedRows.length).toBeGreaterThan(0);
  234 |       expect(repliedRows.every((r) => r.reply !== null)).toBe(true);
  235 |       expect(unreplied.length + repliedRows.length).toBe(rows.length);
  236 | 
  237 |       const fives = (await gb.listReviews(token, rid, { rating: 5, limit: 50 }))
  238 |         .data.data!.reviews;
  239 |       expect(fives.length).toBeGreaterThan(0);
  240 |       expect(fives.every((r) => r.starRating === 5)).toBe(true);
  241 | 
  242 |       const p1 = await gb.listReviews(token, rid, { limit: 3 });
  243 |       expect(p1.data.data!.reviews).toHaveLength(3);
  244 |       expect(p1.data.data!.nextCursor).toBeTruthy();
  245 |       const p2 = await gb.listReviews(token, rid, {
  246 |         limit: 3,
  247 |         cursor: p1.data.data!.nextCursor!,
  248 |       });
  249 |       expect(p2.status).toBe(200);
  250 |       const ids1 = p1.data.data!.reviews.map((r) => r.id);
  251 |       const ids2 = p2.data.data!.reviews.map((r) => r.id);
  252 |       expect(ids2.length).toBeGreaterThan(0);
  253 |       expect(ids2.filter((id) => ids1.includes(id))).toEqual([]);
  254 |       expect(ids2[0]).toBe(rows[3]!.id);
  255 |     }
  256 |   );
  257 | 
  258 |   test(
  259 |     "reply TYPED: stored as a typed reply, then listed as replied",
  260 |     { tag: ["@google-reviews"] },
  261 |     async () => {
  262 |       test.skip(!connected, "connect step did not complete");
  263 |       const review = await unrepliedReview(0);
  264 |       const text = "Thank you for visiting, we appreciate it.";
  265 |       const res = await putTracked(review.id, {
  266 |         comment: text,
  267 |         source: "TYPED",
  268 |       });
  269 |       expect(res.status, JSON.stringify(res.data)).toBe(200);
  270 |       expect(res.data.data!.review.reply).toMatchObject({
  271 |         comment: text,
```