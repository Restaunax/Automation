/**
 * Mailpit HTTP API wrapper.
 * Docs: https://mailpit.axllent.org/docs/api-v1/ · UI: https://mail.qa.restaunax.com
 *
 * QA routes all outbound mail to a self-hosted Mailpit inbox (the backend's
 * EMAIL_SANDBOX_PROVIDER=mailpit). Polls the inbox until a message addressed to
 * `toEmail` arrives, then fetches its HTML/text body.
 *
 * Design notes for whoever touches this next — each one is a trap we already hit:
 *
 * - We poll `GET /api/v1/messages` and filter CLIENT-SIDE rather than using
 *   `GET /api/v1/search`. Do not "optimise" this:
 *     · search `to:` is SUBSTRING matching, not exact — `to:"mahmud@x.com"`
 *       matches `nmahmud@x.com`, so a result set is only ever a superset and
 *       exact matching has to happen here anyway;
 *     · search behaviour on plus-addresses (`test+<uuid>@…`, which
 *       generateDemoFormData produces) is unverified, and a search that
 *       silently returns nothing doesn't fail fast — it times out.
 * - The inbox is SHARED (other runs, and humans reading the UI). Never call
 *   DELETE /api/v1/messages. Staleness is handled by the `Created` guard below.
 * - `after:`/`before:` in the search query are DATE-ONLY in Mailpit v1.21.8 —
 *   the time component is silently dropped — so they cannot express a
 *   per-run baseline. The guard is a client-side `Created` comparison.
 * - The list is newest-first, and `messages_count` is the total matching, not
 *   the size of the returned page.
 */

/** Per-worker baseline: mail already in the inbox at startup isn't ours. */
const PROCESS_START_MS = Date.now();

/**
 * `Created` comes from Mailpit's clock; the baseline from the runner's. If the
 * runner ran ahead, a strict comparison would filter out every real message and
 * every email test would fail identically and mysteriously. Slack it.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

const PAGE_LIMIT = 100;
/** Bounds a single poll at PAGE_LIMIT * MAX_PAGES messages. */
const MAX_PAGES = 5;

export interface MailpitMessage {
  /** Mailpit ids are opaque strings, not numbers. */
  id: string;
  subject: string;
  to_email: string;
  from_email: string;
  created_at: string;
  html_body: string;
  text_body: string;
}

interface MailpitAddress {
  Name?: string;
  Address?: string;
}

interface MailpitListItem {
  ID: string;
  Subject: string;
  From?: MailpitAddress | null;
  To?: MailpitAddress[] | null;
  /** RFC3339 with milliseconds, e.g. "2026-07-19T21:42:12.542Z". */
  Created: string;
}

interface MailpitListResponse {
  messages_count: number;
  messages: MailpitListItem[];
}

interface MailpitDetail {
  ID: string;
  Subject: string;
  From?: MailpitAddress | null;
  To?: MailpitAddress[] | null;
  Text?: string;
  HTML?: string;
}

interface MailpitConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

/**
 * Reads config lazily (not at module load) so dotenv ordering can't bite.
 * Credentials are optional here on purpose — an unauthenticated request fails
 * loudly with a 401, which is a better signal than a silent skip.
 */
function mailpitConfig(): MailpitConfig {
  const baseUrl = process.env.MAILPIT_BASE_URL;
  if (!baseUrl) {
    throw new Error("MAILPIT_BASE_URL must be set in .env");
  }

  const user = process.env.MAILPIT_UI_USER;
  const password = process.env.MAILPIT_UI_PASSWORD;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (user) {
    const basic = Buffer.from(`${user}:${password ?? ""}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), headers };
}

/** GET a Mailpit JSON endpoint. Never logs the auth header. */
async function mailpitGet<T>(cfg: MailpitConfig, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, { headers: cfg.headers });
  if (!res.ok) {
    throw new Error(`Mailpit ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Newest-first list, walked back only as far as `baselineMs`. Older messages
 * can never match, so there is no reason to page past them.
 */
async function listSince(
  cfg: MailpitConfig,
  baselineMs: number
): Promise<MailpitListItem[]> {
  const collected: MailpitListItem[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const { messages } = await mailpitGet<MailpitListResponse>(
      cfg,
      `/api/v1/messages?limit=${PAGE_LIMIT}&start=${page * PAGE_LIMIT}`
    );
    if (!messages?.length) return collected;

    for (const item of messages) {
      if (Date.parse(item.Created) <= baselineMs) return collected;
      collected.push(item);
    }

    // A short page means we reached the end of the inbox.
    if (messages.length < PAGE_LIMIT) return collected;
  }

  console.warn(
    `[emailHelper] Scanned ${MAX_PAGES * PAGE_LIMIT} messages without reaching the ` +
      `baseline — the inbox is busier than the scan window. A match may be missed.`
  );
  return collected;
}

/** The recipient address (as Mailpit has it) if this message is addressed to `toEmail`. */
function matchRecipient(
  item: { To?: MailpitAddress[] | null },
  toEmail: string
): string | undefined {
  const wanted = toEmail.trim().toLowerCase();
  return item.To?.find((r) => r.Address?.trim().toLowerCase() === wanted)
    ?.Address;
}

export interface WaitForEmailOptions {
  subjectPattern?: RegExp;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /**
   * Ignore messages received before this instant. Defaults to when this worker
   * process started — sufficient for the normal "assert the mail my test just
   * caused" case, since generated recipients are uuid-unique. Pass an explicit
   * value when a test triggers a SECOND email to an address it already used and
   * must not match the first.
   */
  notBefore?: Date | string | number;
}

function toMs(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
}

/**
 * Polls Mailpit until an email addressed to `toEmail` arrives, then returns it
 * with html_body/text_body populated. Throws on timeout.
 */
export async function waitForEmail(
  toEmail: string,
  options: WaitForEmailOptions = {}
): Promise<MailpitMessage> {
  const {
    subjectPattern,
    timeoutMs = 30_000,
    pollIntervalMs = 2_000,
    notBefore,
  } = options;

  const cfg = mailpitConfig();
  const baselineMs =
    toMs(notBefore ?? PROCESS_START_MS) - CLOCK_SKEW_TOLERANCE_MS;
  const deadline = Date.now() + timeoutMs;

  // Retained across polls purely so the timeout error can say something useful
  // about what WAS in the inbox.
  let lastSeen: MailpitListItem[] = [];

  while (Date.now() < deadline) {
    let messages: MailpitListItem[];
    try {
      messages = await listSince(cfg, baselineMs);
    } catch (err) {
      // Transient Mailpit API error — log and retry rather than abort
      console.warn(`[emailHelper] Mailpit poll error (retrying): ${err}`);
      await sleep(pollIntervalMs);
      continue;
    }
    lastSeen = messages;

    // Newest-first, so the first hit is the most recent — if a flow resent,
    // the caller means the email they just caused.
    const match = messages.find((m) => {
      const recipientMatch = !!matchRecipient(m, toEmail);
      const subjectMatch = subjectPattern
        ? subjectPattern.test(m.Subject)
        : true;
      return recipientMatch && subjectMatch;
    });

    if (match) {
      const detail = await mailpitGet<MailpitDetail>(
        cfg,
        `/api/v1/message/${match.ID}`
      );
      return {
        id: match.ID,
        subject: match.Subject,
        // The address we matched, not To[0] — a multi-recipient message would
        // otherwise report someone else's address back to the assertion.
        to_email: matchRecipient(match, toEmail) ?? toEmail,
        from_email: match.From?.Address ?? "",
        // Mailpit's receipt time — the same field the staleness guard reads.
        // (The detail endpoint's `Date` is the header the sender wrote.)
        created_at: match.Created,
        html_body: detail.HTML ?? "",
        text_body: detail.Text ?? "",
      };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for email to <${toEmail}>` +
      `${subjectPattern ? ` matching ${subjectPattern}` : ""}. ` +
      `Saw ${lastSeen.length} message(s) since the baseline` +
      `${describeRecipients(lastSeen)}.`
  );
}

/** Recipient summary for the timeout message — on a shared inbox this is the debug. */
function describeRecipients(items: MailpitListItem[]): string {
  if (!items.length) return "";
  const addresses = [
    ...new Set(
      items
        .flatMap((m) => m.To?.map((r) => r.Address ?? "?") ?? [])
        .filter(Boolean)
    ),
  ];
  const shown = addresses.slice(0, 10);
  const suffix = addresses.length > shown.length ? ", …" : "";
  return ` addressed to: ${shown.join(", ")}${suffix}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts the user-invitation token from an invitation email body.
 * The backend builds the link as `…/invitation?userToken=<64-hex>` — this is
 * the only place the token is exposed (the invite API never returns it). The
 * extracted value is sent back to /register as `userInvitationToken`.
 */
export function extractInviteToken(emailBody: string): string {
  // The HTML body HTML-encodes the '=' (userToken&#x3D;<hex>); the text body
  // keeps it raw. Accept '=', '&#x3D;', '&#61;', or '%3D'.
  const match = emailBody.match(
    /userToken(?:=|&#x3d;|&#61;|%3d)([a-f0-9]{16,})/i
  );
  const token = match?.[1];
  if (!token) {
    throw new Error(
      "Invitation token not found in email body (expected ?userToken=<hex>)"
    );
  }
  return token;
}
