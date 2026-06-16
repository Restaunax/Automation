/**
 * Mailtrap Email Testing (sandbox) API wrapper.
 * Docs: https://api-docs.mailtrap.io/ → "Email Testing API".
 *
 * Polls a sandbox inbox until a message addressed to `toEmail` arrives, then
 * fetches its HTML/text body. In QA all outbound mail is captured here.
 *
 * NOTE: the legacy `/api/v1/inboxes/:id/messages` endpoint returns
 * 403 "Endpoint is not supported for API tokens". The current API is
 * account-scoped — `/api/accounts/:accountId/inboxes/:inboxId/messages` — and
 * message bodies are fetched separately via each message's `html_path`/`txt_path`.
 * The account id is auto-discovered (or set `MAILTRAP_ACCOUNT_ID` to skip the
 * lookup).
 */

const MAILTRAP_BASE = "https://mailtrap.io";

export interface MailtrapMessage {
  id: number;
  subject: string;
  to_email: string;
  from_email: string;
  created_at: string;
  html_body: string;
  text_body: string;
}

interface MailtrapListItem {
  id: number;
  subject: string;
  to_email: string;
  from_email: string;
  created_at: string;
  html_path?: string;
  txt_path?: string;
}

const authHeaders = (apiToken: string) => ({ "Api-Token": apiToken });

let cachedAccountId: string | undefined;

/** Resolve the Mailtrap account id (env override → cached → first account). */
async function resolveAccountId(apiToken: string): Promise<string> {
  if (process.env.MAILTRAP_ACCOUNT_ID) return process.env.MAILTRAP_ACCOUNT_ID;
  if (cachedAccountId) return cachedAccountId;

  const res = await fetch(`${MAILTRAP_BASE}/api/accounts`, {
    headers: authHeaders(apiToken),
  });
  if (!res.ok) {
    throw new Error(
      `Mailtrap /api/accounts → ${res.status}: ${await res.text()}`
    );
  }
  const accounts = (await res.json()) as { id: number }[];
  if (!accounts.length) {
    throw new Error("No Mailtrap accounts available for this API token");
  }
  cachedAccountId = String(accounts[0].id);
  return cachedAccountId;
}

async function fetchInboxMessages(
  accountId: string,
  inboxId: string,
  apiToken: string
): Promise<MailtrapListItem[]> {
  const url = `${MAILTRAP_BASE}/api/accounts/${accountId}/inboxes/${inboxId}/messages`;
  const res = await fetch(url, { headers: authHeaders(apiToken) });
  if (!res.ok) {
    throw new Error(`Mailtrap messages → ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as
    | MailtrapListItem[]
    | { data: MailtrapListItem[] };
  return Array.isArray(json) ? json : (json.data ?? []);
}

/** Fetch a message body part (html_path / txt_path). Empty string on failure. */
async function fetchBody(
  path: string | undefined,
  apiToken: string
): Promise<string> {
  if (!path) return "";
  const res = await fetch(`${MAILTRAP_BASE}${path}`, {
    headers: authHeaders(apiToken),
  });
  return res.ok ? res.text() : "";
}

export interface WaitForEmailOptions {
  subjectPattern?: RegExp;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Polls Mailtrap until an email addressed to `toEmail` arrives, then returns it
 * with html_body/text_body populated. Throws on timeout.
 */
export async function waitForEmail(
  toEmail: string,
  options: WaitForEmailOptions = {}
): Promise<MailtrapMessage> {
  const {
    subjectPattern,
    timeoutMs = 30_000,
    pollIntervalMs = 2_000,
  } = options;

  const apiToken = process.env.MAILTRAP_API_TOKEN;
  const inboxId = process.env.MAILTRAP_INBOX_ID;

  if (!apiToken || !inboxId) {
    throw new Error(
      "MAILTRAP_API_TOKEN and MAILTRAP_INBOX_ID must be set in .env"
    );
  }

  const accountId = await resolveAccountId(apiToken);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let messages: MailtrapListItem[];
    try {
      messages = await fetchInboxMessages(accountId, inboxId, apiToken);
    } catch (err) {
      // Transient Mailtrap API error — log and retry rather than abort
      console.warn(`[emailHelper] Mailtrap poll error (retrying): ${err}`);
      await sleep(pollIntervalMs);
      continue;
    }

    const match = messages.find((m) => {
      const recipientMatch =
        m.to_email?.toLowerCase() === toEmail.toLowerCase();
      const subjectMatch = subjectPattern
        ? subjectPattern.test(m.subject)
        : true;
      return recipientMatch && subjectMatch;
    });

    if (match) {
      const [html, text] = await Promise.all([
        fetchBody(match.html_path, apiToken),
        fetchBody(match.txt_path, apiToken),
      ]);
      return {
        id: match.id,
        subject: match.subject,
        to_email: match.to_email,
        from_email: match.from_email,
        created_at: match.created_at,
        html_body: html,
        text_body: text,
      };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for email to <${toEmail}>`
  );
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
  if (!match) {
    throw new Error(
      "Invitation token not found in email body (expected ?userToken=<hex>)"
    );
  }
  return match[1];
}
