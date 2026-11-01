/**
 * api-google-reviews.spec.ts — Google review replies (RestauNax branch
 * feat/google-review-replies), API level. Tag `@google-reviews`.
 *
 * Runs against the backend's FAKE Google client (GOOGLE_BUSINESS_PROVIDER=fake,
 * REVIEW_REPLY_AI=fake): connect goes through the fake consent redirect, there
 * are two fake locations, and each location holds 8 seeded reviews (one
 * already replied). The fake gives the same locations to EVERY user, so only
 * one restaurant can hold FAKE_PLACE_1 at a time — this file links the OWNER's
 * first restaurant and disconnects in afterAll (and at the start, to clear a
 * leftover from an aborted run).
 *
 * Needs: OWNER_EMAIL/OWNER_PASSWORD. Optional:
 *   OWNER2_EMAIL/OWNER2_PASSWORD — owner of ANOTHER restaurant (stranger 403)
 *   GBR_VIEWER_EMAIL/GBR_VIEWER_PASSWORD — a user with VIEW_RESTAURANT only
 *     who is a co-owner of the OWNER's first restaurant (canManage:false)
 * Each optional case skips with a reason when its credentials are missing.
 *
 * Gated by RELEASED_ON_QA.googleReviews: while false, the file skips when the
 * routes answer 404; against a stack that has the change it runs for real.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { apiLogin, getOwnerRestaurants } from "../../../utils/apiHelper";
import { requireRelease, probeGoogleReviews } from "../../../utils/releaseGate";
import * as gb from "../../../utils/googleBusinessApi";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const OWNER2_EMAIL = process.env.OWNER2_EMAIL ?? "";
const OWNER2_PASSWORD = process.env.OWNER2_PASSWORD ?? "";
const VIEWER_EMAIL = process.env.GBR_VIEWER_EMAIL ?? "";
const VIEWER_PASSWORD = process.env.GBR_VIEWER_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

test.describe("Google review replies — API", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set"
  );

  let token = "";
  let rid = "";
  let strangerRid = "";
  let strangerToken = "";
  let connected = false;
  /** Reviews this test file replied to — deleted again in afterEach. */
  const replied = new Set<string>();

  /** An unreplied review that has text, newest first, `skip` places in. */
  async function unrepliedReview(skip = 0): Promise<gb.GbReview> {
    const res = await gb.listReviews(token, rid, {
      filter: "unreplied",
      limit: 50,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const rows = (res.data.data?.reviews ?? []).filter((r) => r.comment);
    expect(rows.length, "needs seeded unreplied reviews").toBeGreaterThan(skip);
    return rows[skip]!;
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const owned = await getOwnerRestaurants(token);
    rid = owned[0]?.id ?? "";
    test.skip(!rid, "the owner has no restaurant");
    requireRelease("googleReviews", await probeGoogleReviews(token, rid));

    const status = await gb.getStatus(token, rid);
    expect(status.status, JSON.stringify(status.data)).toBe(200);
    test.skip(
      status.data.data?.available === false,
      "Google Business is not configured on this backend (available:false)"
    );
    // Clear a leftover connection from an aborted run.
    if (status.data.data?.connection || status.data.data?.link) {
      await gb.disconnect(token, rid);
    }
    if (OWNER2_EMAIL && OWNER2_PASSWORD) {
      const o2 = await apiLogin(OWNER2_EMAIL, OWNER2_PASSWORD);
      strangerToken = o2.accessToken;
      const mine = new Set(owned.map((r) => r.id));
      strangerRid =
        (await getOwnerRestaurants(strangerToken)).find((r) => !mine.has(r.id))
          ?.id ?? "";
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Google review replies");
    await allure.label("severity", "normal");
  });

  test.afterEach(async () => {
    if (!token || !rid) return;
    for (const id of [...replied]) {
      await gb.deleteReply(token, rid, id);
      replied.delete(id);
    }
  });

  test.afterAll(async () => {
    if (!token || !rid) return;
    // Frees FAKE_PLACE_1 for the next run / other restaurants.
    await gb.disconnect(token, rid);
  });

  test(
    "status of an unconnected restaurant: available, can manage, no connection",
    { tag: ["@google-reviews"] },
    async () => {
      const res = await gb.getStatus(token, rid);
      expect(res.status).toBe(200);
      expect(res.data.data).toMatchObject({
        available: true,
        canManage: true,
        connection: null,
        link: null,
      });
    }
  );

  test(
    "connect through the fake consent screen, link a location and sync",
    { tag: ["@google-reviews"] },
    async () => {
      test.setTimeout(120_000);
      const started = await gb.startConnect(token, rid);
      expect(started.status, JSON.stringify(started.data)).toBe(200);
      const url = new URL(started.data.data!.url);
      expect(url.pathname).toBe("/api/google-business-oauth/fake-consent");

      const consent = await gb.followFakeConsent(started.data.data!.url);
      expect(consent.status).toBe(302);
      expect(consent.code).toBe("fake");
      expect(consent.state).toBeTruthy();

      const cb = await gb.oauthCallback(token, consent.code!, consent.state!);
      expect(cb.status, JSON.stringify(cb.data)).toBe(200);
      expect(cb.data.data?.restaurantId).toBe(rid);

      let status = await gb.getStatus(token, rid);
      expect(status.data.data?.connection?.googleEmail).toBeTruthy();

      if (!status.data.data?.link) {
        const locs = await gb.listLocations(token, rid);
        expect(locs.status).toBe(200);
        const target = locs.data.data!.locations.find(
          (l) => l.locationName === gb.FAKE_LOCATION_1
        );
        expect(target, "fake location 1 is listed").toBeTruthy();
        const link = await gb.linkLocation(token, rid, gb.FAKE_LOCATION_1);
        test.skip(
          link.status === 409 &&
            link.data.errorCode === "GOOGLE_BUSINESS_ALREADY_LINKED",
          "FAKE_PLACE_1 is held by another restaurant (the fake gives every user the same locations)"
        );
        expect(link.status, JSON.stringify(link.data)).toBe(200);
      }
      connected = true;

      // Sync, then wait for the reviews to land.
      for (let i = 0; i < 10; i++) {
        await gb.syncReviews(token, rid);
        status = await gb.getStatus(token, rid);
        if ((status.data.data?.counts.total ?? 0) > 0) break;
        await new Promise((r) => setTimeout(r, 1_500));
      }
      expect(status.data.data?.link?.title).toBeTruthy();
      expect(status.data.data?.counts.total).toBeGreaterThan(0);
    }
  );

  test(
    "list: filters, rating and cursor paging",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const all = await gb.listReviews(token, rid, { limit: 50 });
      expect(all.status).toBe(200);
      const rows = all.data.data!.reviews;
      expect(rows.length).toBeGreaterThanOrEqual(8);
      const times = rows.map((r) => Date.parse(r.createTime));
      expect([...times].sort((a, b) => b - a)).toEqual(times); // newest first

      const unreplied = (
        await gb.listReviews(token, rid, { filter: "unreplied", limit: 50 })
      ).data.data!.reviews;
      const repliedRows = (
        await gb.listReviews(token, rid, { filter: "replied", limit: 50 })
      ).data.data!.reviews;
      expect(unreplied.every((r) => r.reply === null)).toBe(true);
      expect(repliedRows.length).toBeGreaterThan(0);
      expect(repliedRows.every((r) => r.reply !== null)).toBe(true);
      expect(unreplied.length + repliedRows.length).toBe(rows.length);

      const fives = (await gb.listReviews(token, rid, { rating: 5, limit: 50 }))
        .data.data!.reviews;
      expect(fives.length).toBeGreaterThan(0);
      expect(fives.every((r) => r.starRating === 5)).toBe(true);

      const p1 = await gb.listReviews(token, rid, { limit: 3 });
      expect(p1.data.data!.reviews).toHaveLength(3);
      expect(p1.data.data!.nextCursor).toBeTruthy();
      const p2 = await gb.listReviews(token, rid, {
        limit: 3,
        cursor: p1.data.data!.nextCursor!,
      });
      expect(p2.status).toBe(200);
      const ids1 = p1.data.data!.reviews.map((r) => r.id);
      const ids2 = p2.data.data!.reviews.map((r) => r.id);
      expect(ids2.length).toBeGreaterThan(0);
      expect(ids2.filter((id) => ids1.includes(id))).toEqual([]);
      expect(ids2[0]).toBe(rows[3]!.id);
    }
  );

  test(
    "reply TYPED: stored as a typed reply, then listed as replied",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const review = await unrepliedReview(0);
      const text = "Thank you for visiting, we appreciate it.";
      const res = await gb.putReply(token, rid, review.id, {
        comment: text,
        source: "TYPED",
      });
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      replied.add(review.id);
      expect(res.data.data!.review.reply).toMatchObject({
        comment: text,
        source: "TYPED",
      });
      expect(["PENDING", "APPROVED"]).toContain(
        res.data.data!.review.reply!.state
      );

      const replies = (
        await gb.listReviews(token, rid, { filter: "replied", limit: 50 })
      ).data.data!.reviews;
      expect(replies.map((r) => r.id)).toContain(review.id);
    }
  );

  test(
    "reply AI_ASSISTED with the suggestion's id",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const review = await unrepliedReview(1);
      const s = await gb.suggestReply(token, rid, review.id);
      expect(s.status, JSON.stringify(s.data)).toBe(200);
      expect(s.data.data!.text.length).toBeGreaterThan(10);
      expect(s.data.data!.suggestionId).toBeTruthy();

      const res = await gb.putReply(token, rid, review.id, {
        comment: s.data.data!.text,
        source: "AI_ASSISTED",
        suggestionId: s.data.data!.suggestionId,
      });
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      replied.add(review.id);
      expect(res.data.data!.review.reply?.source).toBe("AI_ASSISTED");
      expect(res.data.data!.review.reply?.comment).toBe(s.data.data!.text);
    }
  );

  test(
    "edit a reply: a second PUT replaces the text",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const review = await unrepliedReview(2);
      const first = await gb.putReply(token, rid, review.id, {
        comment: "First version of the reply.",
        source: "TYPED",
      });
      expect(first.status, JSON.stringify(first.data)).toBe(200);
      replied.add(review.id);
      const edited = await gb.putReply(token, rid, review.id, {
        comment: "Edited version of the reply.",
        source: "TYPED",
      });
      expect(edited.status, JSON.stringify(edited.data)).toBe(200);
      expect(edited.data.data!.review.reply?.comment).toBe(
        "Edited version of the reply."
      );
      const replies = (
        await gb.listReviews(token, rid, { filter: "replied", limit: 50 })
      ).data.data!.reviews;
      expect(replies.find((r) => r.id === review.id)?.reply?.comment).toBe(
        "Edited version of the reply."
      );
    }
  );

  test(
    "delete a reply: the review is unreplied again",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const review = await unrepliedReview(3);
      const put = await gb.putReply(token, rid, review.id, {
        comment: "A reply that will be removed.",
        source: "TYPED",
      });
      expect(put.status, JSON.stringify(put.data)).toBe(200);
      const del = await gb.deleteReply(token, rid, review.id);
      expect(del.status, JSON.stringify(del.data)).toBe(200);
      expect(del.data.data!.review.reply).toBeNull();
      const unreplied = (
        await gb.listReviews(token, rid, { filter: "unreplied", limit: 50 })
      ).data.data!.reviews;
      expect(unreplied.map((r) => r.id)).toContain(review.id);
    }
  );

  test(
    "a reply Google rejects (REJECT_ME) shows REJECTED, also after a sync",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const review = await unrepliedReview(4);
      const put = await gb.putReply(token, rid, review.id, {
        comment: "REJECT_ME please.",
        source: "TYPED",
      });
      expect(put.status, JSON.stringify(put.data)).toBe(200);
      replied.add(review.id);
      expect(put.data.data!.review.reply?.state).toBe("REJECTED");
      expect(put.data.data!.review.reply?.policyViolation).toBeTruthy();

      const sync = await gb.syncReviews(token, rid);
      expect(sync.status).toBe(200);
      const after = (
        await gb.listReviews(token, rid, { filter: "replied", limit: 50 })
      ).data.data!.reviews;
      expect(after.find((r) => r.id === review.id)?.reply?.state).toBe(
        "REJECTED"
      );
    }
  );

  test(
    "a reply over 4,096 BYTES (multi-byte text under 4,096 characters) is a 400",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const review = await unrepliedReview(0);
      const comment = "日".repeat(1400); // 1,400 characters = 4,200 bytes
      expect(comment.length).toBeLessThan(4096);
      expect(Buffer.byteLength(comment, "utf8")).toBeGreaterThan(4096);
      const res = await gb.putReply(token, rid, review.id, {
        comment,
        source: "TYPED",
      });
      expect(res.status).toBe(400);
      expect(res.data.errorCode).toBe("GOOGLE_BUSINESS_REPLY_INVALID");
      expect(res.data.details?.code).toBe("TOO_LONG");
      const empty = await gb.putReply(token, rid, review.id, {
        comment: "   ",
        source: "TYPED",
      });
      expect(empty.status).toBe(400);
      expect(empty.data.details?.code).toBe("EMPTY");
    }
  );

  test(
    "a restaurant the user does not control answers 403",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(
        !strangerRid,
        "OWNER2 credentials (or a second restaurant) are not available"
      );
      expect((await gb.getStatus(token, strangerRid)).status).toBe(403);
      expect((await gb.listReviews(token, strangerRid)).status).toBe(403);
      expect((await gb.startConnect(token, strangerRid)).status).toBe(403);
      expect((await gb.getReplySettings(token, strangerRid)).status).toBe(403);
      // and the other way round: the second owner cannot read ours
      expect((await gb.getStatus(strangerToken, rid)).status).toBe(403);
    }
  );

  test(
    "a view-only co-owner reads the status with canManage:false and cannot write",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(
        !VIEWER_EMAIL || !VIEWER_PASSWORD,
        "GBR_VIEWER_EMAIL / GBR_VIEWER_PASSWORD not set"
      );
      test.skip(!connected, "connect step did not complete");
      const viewer = (await apiLogin(VIEWER_EMAIL, VIEWER_PASSWORD))
        .accessToken;
      const status = await gb.getStatus(viewer, rid);
      expect(status.status, JSON.stringify(status.data)).toBe(200);
      expect(status.data.data?.canManage).toBe(false);
      expect((await gb.listReviews(viewer, rid)).status).toBe(200);
      expect((await gb.startConnect(viewer, rid)).status).toBe(403);
      const review = await unrepliedReview(0);
      const put = await gb.putReply(viewer, rid, review.id, {
        comment: "Not allowed.",
        source: "TYPED",
      });
      expect(put.status).toBe(403);
    }
  );

  test(
    "reply settings reject a phone number, email and link; valid settings round-trip",
    { tag: ["@google-reviews"] },
    async () => {
      const before = await gb.getReplySettings(token, rid);
      expect(before.status, JSON.stringify(before.data)).toBe(200);
      const original = before.data.data!.settings;

      for (const bad of [
        "call us at 555-123-4567",
        "mail owner@example.com",
        "see https://example.com",
      ]) {
        const res = await gb.putReplySettings(token, rid, { contactLine: bad });
        expect(res.status, bad).toBe(400);
        expect(res.data.errorCode).toBe(
          "GOOGLE_BUSINESS_REPLY_SETTINGS_INVALID"
        );
        expect(res.data.details).toMatchObject({
          field: "contactLine",
          code: "CONTACT_DETAILS",
        });
      }
      expect(
        (await gb.getReplySettings(token, rid)).data.data!.settings
      ).toEqual(original);

      try {
        const ok = await gb.putReplySettings(token, rid, {
          tone: "PROFESSIONAL",
          signOff: "The team",
          contactLine: "ask for the manager",
        });
        expect(ok.status, JSON.stringify(ok.data)).toBe(200);
        expect(ok.data.data!.settings).toMatchObject({
          tone: "PROFESSIONAL",
          signOff: "The team",
          contactLine: "ask for the manager",
        });
      } finally {
        await gb.putReplySettings(token, rid, {
          tone: original.tone,
          signOff: original.signOff ?? "",
          contactLine: original.contactLine ?? "",
          guidance: original.guidance ?? "",
        });
      }
    }
  );

  test(
    "disconnect removes the connection and the link",
    { tag: ["@google-reviews"] },
    async () => {
      test.skip(!connected, "connect step did not complete");
      const res = await gb.disconnect(token, rid);
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      expect(res.data.data?.unlinkedRestaurantIds).toContain(rid);
      const status = await gb.getStatus(token, rid);
      expect(status.data.data).toMatchObject({ connection: null, link: null });
      connected = false;
    }
  );
});
