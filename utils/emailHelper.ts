/**
 * Mailtrap Email Testing API wrapper.
 * Docs: https://api-docs.mailtrap.io/
 *
 * Polls the inbox until a message addressed to `toEmail` arrives,
 * or throws after `timeoutMs`.
 */

const MAILTRAP_BASE = "https://mailtrap.io/api/v1";

export interface MailtrapMessage {
  id: number;
  subject: string;
  to_email: string;
  from_email: string;
  created_at: string;
  html_body: string;
  text_body: string;
}

interface MailtrapListResponse {
  data: MailtrapMessage[];
}

async function fetchInboxMessages(
  inboxId: string,
  apiToken: string
): Promise<MailtrapMessage[]> {
  const url = `${MAILTRAP_BASE}/inboxes/${inboxId}/messages`;
  const res = await fetch(url, {
    headers: {
      "Api-Token": apiToken,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Mailtrap API error ${res.status}: ${await res.text()}`
    );
  }

  const json = (await res.json()) as MailtrapListResponse | MailtrapMessage[];
  // The v1 API returns an array directly for some endpoints
  return Array.isArray(json) ? json : json.data ?? [];
}

export interface WaitForEmailOptions {
  subjectPattern?: RegExp;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Polls Mailtrap until an email addressed to `toEmail` arrives.
 * Returns the matched message or throws on timeout.
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

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let messages: MailtrapMessage[];
    try {
      messages = await fetchInboxMessages(inboxId, apiToken);
    } catch (err) {
      // Transient Mailtrap API error — log and retry rather than abort
      console.warn(`[emailHelper] Mailtrap poll error (retrying): ${err}`);
      await sleep(pollIntervalMs);
      continue;
    }

    const match = messages.find((m) => {
      const recipientMatch =
        m.to_email.toLowerCase() === toEmail.toLowerCase();
      const subjectMatch = subjectPattern
        ? subjectPattern.test(m.subject)
        : true;
      return recipientMatch && subjectMatch;
    });

    if (match) {
      return match;
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
