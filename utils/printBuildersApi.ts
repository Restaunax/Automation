/**
 * printBuildersApi.ts — the Print Shop's builders (RestauNax print builders:
 * docs/features/TABLE_QR_CARD_DESIGNS.md "Photo and follow code" + "No free
 * print files", PROMO_CARD_DESIGNS.md).
 *
 * - Table QR card PDFs and previews: binary answers, so they go through a
 *   plain fetch here (apiRequestRaw reads every body as text).
 * - Photos and follow links shared by the builders:
 *   `/restaurant/:id/print-assets/{photos,social,social-link}`.
 * - The promo card builder's setup read: `/restaurant/:id/promo-card`.
 * - The public follow-us redirectors `/q/follow/:restaurantId/:platform` and
 *   `/q/:token/follow` — always a 302, never a 4xx/5xx.
 *
 * Bare `/restaurant/:id/…` prefixes (no X-Restaurant-Id header).
 */
import { BACKEND_URL, apiRequestRaw, type RawResponse } from "./apiHelper";

export type FollowPlatform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";

export interface PrintPhoto {
  id: string;
  url: string;
  label: string | null;
}

export interface PrintSocialLink {
  platform: FollowPlatform;
  url: string;
  /** "@joespizza" for Instagram/TikTok, the page name for Facebook; null when not one account. */
  handle: string | null;
  scope: "chain" | "restaurant";
}

/** Success and refusal share one shape; refusals carry `errorCode` + resolved `message`. */
export type PrintEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  errorCode?: string;
  error?: string;
};

export function listPrintPhotosRaw(
  token: string,
  restaurantId: string,
  source: string,
  search?: string
): Promise<RawResponse<PrintEnvelope<{ photos: PrintPhoto[] }>>> {
  const query = new URLSearchParams({ source });
  if (search) query.set("search", search);
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/print-assets/photos?${query.toString()}`,
    undefined,
    token
  );
}

export function getPrintSocialRaw(
  token: string,
  restaurantId: string
): Promise<RawResponse<PrintEnvelope<{ social: PrintSocialLink[] }>>> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/print-assets/social`,
    undefined,
    token
  );
}

/** Saves the link on the restaurant itself (also shown on its website). */
export function putPrintSocialLinkRaw(
  token: string,
  restaurantId: string,
  platform: string,
  url: string
): Promise<RawResponse<PrintEnvelope<{ social: PrintSocialLink[] }>>> {
  return apiRequestRaw(
    "PUT",
    `/restaurant/${restaurantId}/print-assets/social-link`,
    { platform, url },
    token
  );
}

/** The promo card builder's setup: saved follow links + brand warnings. */
export function getPromoCardSetupRaw(
  token: string,
  restaurantId: string
): Promise<
  RawResponse<
    PrintEnvelope<{ social: PrintSocialLink[]; brandWarnings: unknown }>
  >
> {
  return apiRequestRaw(
    "GET",
    `/restaurant/${restaurantId}/promo-card`,
    undefined,
    token
  );
}

export interface BinaryResponse {
  status: number;
  contentType: string | null;
  headers: Headers;
  body: Buffer;
  /** The parsed body when it was JSON (a refusal), else null. */
  json: PrintEnvelope<unknown> | null;
}

/** PDFs render in a headless browser server-side: give them room. */
const RENDER_TIMEOUT_MS = 120_000;

async function postBinary(
  token: string,
  path: string,
  body: unknown
): Promise<BinaryResponse> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type");
  let json: PrintEnvelope<unknown> | null = null;
  if (contentType?.includes("application/json")) {
    try {
      json = JSON.parse(buffer.toString("utf8")) as PrintEnvelope<unknown>;
    } catch {
      /* not JSON after all */
    }
  }
  return {
    status: res.status,
    contentType,
    headers: res.headers,
    body: buffer,
    json,
  };
}

export interface TableCardsPdfBody {
  cardIds?: string[];
  sameForAll?: { count: number };
  format?: string;
  design?: string;
  proof?: boolean;
  /** Legacy (pre-format) clients: SELF_PRINT / PRINT_READY. */
  layout?: string;
  photo?: { source: string; id: string; focus?: { x: number; y: number } };
  follow?: string;
}

/** POST /restaurant/:id/table-qr-cards/pdf — the proof (`proof: true`) or the clean file. */
export function postTableCardsPdfRaw(
  token: string,
  restaurantId: string,
  body: TableCardsPdfBody
): Promise<BinaryResponse> {
  return postBinary(
    token,
    `/restaurant/${restaurantId}/table-qr-cards/pdf`,
    body
  );
}

export interface TableCardPreviewBody {
  format: string;
  design: string;
  label: string | null;
  sameForAll?: boolean;
  photo?: { source: string; id: string; focus?: { x: number; y: number } };
  follow?: string;
}

/** POST /restaurant/:id/table-qr-cards/preview — one face as a PNG (X-Photo-Quality with a photo). */
export function postTableCardPreviewRaw(
  token: string,
  restaurantId: string,
  body: TableCardPreviewBody
): Promise<BinaryResponse> {
  return postBinary(
    token,
    `/restaurant/${restaurantId}/table-qr-cards/preview`,
    body
  );
}

export const isPdf = (body: Buffer): boolean =>
  body.subarray(0, 5).toString("latin1") === "%PDF-";

export const isPng = (body: Buffer): boolean =>
  body
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/**
 * A public redirector, unauthenticated and NOT followed: the status and the
 * Location the printed code would send a customer to.
 */
export async function getRedirectRaw(
  path: string
): Promise<{ status: number; location: string | null }> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  // Drain the body so the connection is released.
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status, location: res.headers.get("location") };
}
