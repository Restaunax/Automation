/**
 * googleBusinessApi.ts — typed wrappers over /api/google-business/* (Google
 * review replies, RestauNax feat/google-review-replies).
 *
 * The backend runs a FAKE Google client on QA/local (GOOGLE_BUSINESS_PROVIDER=
 * fake): the consent screen is a backend page that redirects straight back
 * with code=fake, and every user sees the same two locations
 * (FAKE_PLACE_1 / FAKE_PLACE_2). A location can be linked to ONE restaurant at
 * a time, so specs must disconnect/unlink in their teardown.
 *
 * Replies are throttled to 10 writes (PUT/DELETE) per rolling minute per
 * restaurant (429 GOOGLE_BUSINESS_REPLY_THROTTLED); putReply/deleteReply wait
 * out the window and retry so a long serial spec does not flake.
 */
import { apiRequestRaw, BACKEND_URL, type RawResponse } from "./apiHelper";

export const FAKE_LOCATION_1 = "locations/fake-loc-1";
export const FAKE_PLACE_1 = "FAKE_PLACE_1";

export interface GbStatus {
  available: boolean;
  canManage: boolean;
  connection: {
    /** Null when Google didn't share the account's email. */
    googleEmail: string | null;
    connectedByName: string | null;
    needsReconnect: boolean;
  } | null;
  link: {
    title: string;
    address: string | null;
    lastSyncedAt: string | null;
    lastSyncError: string | null;
    lastSyncErrorCode: "RECONNECT" | "FAILED" | null;
  } | null;
  counts: { total: number; unreplied: number; averageRating: number | null };
}

export interface GbReply {
  comment: string;
  updateTime: string;
  state: "PENDING" | "APPROVED" | "REJECTED" | null;
  policyViolation: string | null;
  source: "TYPED" | "AI_ASSISTED" | "EXTERNAL" | null;
}

export interface GbReview {
  id: string;
  reviewerName: string;
  starRating: number;
  comment: string | null;
  createTime: string;
  reply: GbReply | null;
}

export interface GbLocation {
  accountName: string;
  locationName: string;
  title: string;
  address: string | null;
  placeId: string | null;
  linkedRestaurantId: string | null;
  linkedElsewhere: boolean;
}

export interface GbReplySettings {
  tone: "WARM" | "PROFESSIONAL" | "CASUAL";
  signOff: string | null;
  contactLine: string | null;
  guidance: string | null;
  /** 1-3 star reviews push to the owner app (default true). */
  alertLowRatings: boolean;
  /** 4-5 star reviews push to the owner app (default false). */
  alertHighRatings: boolean;
  /** One 9 AM email with the last 24 hours of reviews (default false). */
  dailyDigest: boolean;
}

/** Standard success / error envelope. */
export interface GbEnvelope<T = unknown> {
  success?: boolean;
  message?: string;
  errorCode?: string;
  details?: { code?: string; field?: string };
  data?: T;
}

type Res<T> = Promise<RawResponse<GbEnvelope<T>>>;

const base = (rid: string) => `/api/google-business/${rid}`;
const call = <T>(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Res<T> => apiRequestRaw<GbEnvelope<T>>(method, path, body, token);

export const getStatus = (token: string, rid: string) =>
  call<GbStatus>("GET", base(rid), token);

export const startConnect = (token: string, rid: string) =>
  call<{ url: string }>("POST", `${base(rid)}/connect`, token);

/**
 * The fake consent screen: GET the URL WITHOUT following the redirect and
 * read code + state off the Location header. The URL's host is whatever the
 * backend believes its own address is, so only its path + query are used.
 */
export async function followFakeConsent(
  consentUrl: string
): Promise<{ status: number; code: string | null; state: string | null }> {
  const u = new URL(consentUrl);
  const res = await fetch(`${BACKEND_URL}${u.pathname}${u.search}`, {
    redirect: "manual",
  });
  const location = res.headers.get("location");
  if (!location) return { status: res.status, code: null, state: null };
  const back = new URL(location);
  return {
    status: res.status,
    code: back.searchParams.get("code"),
    state: back.searchParams.get("state"),
  };
}

export const oauthCallback = (token: string, code: string, state: string) =>
  call<{ restaurantId: string; startingLinked: boolean; linkedCount: number }>(
    "POST",
    "/api/google-business-oauth/callback",
    token,
    { code, state }
  );

export const listLocations = (token: string, rid: string) =>
  call<{ locations: GbLocation[] }>("GET", `${base(rid)}/locations`, token);

export const linkLocation = (
  token: string,
  rid: string,
  locationName: string
) => call("POST", `${base(rid)}/link`, token, { locationName });

export const unlinkLocation = (token: string, rid: string) =>
  call("DELETE", `${base(rid)}/link`, token);

export const disconnect = (token: string, rid: string) =>
  call<{ unlinkedRestaurantIds: string[] }>(
    "POST",
    `${base(rid)}/disconnect`,
    token
  );

export interface ReviewQuery {
  filter?: "all" | "unreplied" | "replied";
  rating?: number;
  cursor?: string;
  limit?: number;
}

export const listReviews = (
  token: string,
  rid: string,
  q: ReviewQuery = {}
) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined) qs.set(k, String(v));
  const suffix = qs.toString() ? `?${qs}` : "";
  return call<{ reviews: GbReview[]; nextCursor: string | null }>(
    "GET",
    `${base(rid)}/reviews${suffix}`,
    token
  );
};

export const syncReviews = (token: string, rid: string) =>
  call<{ lastSyncedAt: string | null }>("POST", `${base(rid)}/sync`, token);

export const suggestReply = (
  token: string,
  rid: string,
  reviewId: string,
  previous?: string
) =>
  call<{ text: string; suggestionId: string }>(
    "POST",
    `${base(rid)}/reviews/${reviewId}/suggest-reply`,
    token,
    previous ? { previous } : {}
  );

/** Retry a throttled (429) write once the rolling minute has cleared. */
async function throttled<T>(send: () => Res<T>): Res<T> {
  let res = await send();
  for (let i = 0; i < 6 && res.status === 429; i++) {
    if (
      res.data?.errorCode &&
      res.data.errorCode !== "GOOGLE_BUSINESS_REPLY_THROTTLED"
    )
      break;
    await new Promise((r) => setTimeout(r, 11_000));
    res = await send();
  }
  return res;
}

export const putReply = (
  token: string,
  rid: string,
  reviewId: string,
  body: {
    comment: string;
    source: "TYPED" | "AI_ASSISTED";
    suggestionId?: string;
  }
) =>
  throttled(() =>
    call<{ review: GbReview }>(
      "PUT",
      `${base(rid)}/reviews/${reviewId}/reply`,
      token,
      body
    )
  );

export const deleteReply = (token: string, rid: string, reviewId: string) =>
  throttled(() =>
    call<{ review: GbReview }>(
      "DELETE",
      `${base(rid)}/reviews/${reviewId}/reply`,
      token
    )
  );

export const getReplySettings = (token: string, rid: string) =>
  call<{ settings: GbReplySettings }>(
    "GET",
    `${base(rid)}/reply-settings`,
    token
  );

export const putReplySettings = (
  token: string,
  rid: string,
  body: Partial<GbReplySettings>
) =>
  call<{ settings: GbReplySettings }>(
    "PUT",
    `${base(rid)}/reply-settings`,
    token,
    body
  );
