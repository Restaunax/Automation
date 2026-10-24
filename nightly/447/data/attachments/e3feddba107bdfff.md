# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/27-order-breakdown.spec.ts >> Order money breakdown — one order, every surface >> email: the confirmation email's totals match the backend @email
- Location: tests/dashboard/owner/27-order-breakdown.spec.ts:384:7

# Error details

```
Error: Timed out after 60000ms waiting for email to <autouser_breakdown_93d21d3e@demomailtrap.co> matching /Your Order Confirmation/. Saw 1 message(s) since the baseline addressed to: neajmahmud.dev@gmail.com.
```

# Test source

```ts
  149 | 
  150 | /** The recipient address (as Mailpit has it) if this message is addressed to `toEmail`. */
  151 | function matchRecipient(
  152 |   item: { To?: MailpitAddress[] | null },
  153 |   toEmail: string
  154 | ): string | undefined {
  155 |   const wanted = toEmail.trim().toLowerCase();
  156 |   return item.To?.find((r) => r.Address?.trim().toLowerCase() === wanted)
  157 |     ?.Address;
  158 | }
  159 | 
  160 | export interface WaitForEmailOptions {
  161 |   subjectPattern?: RegExp;
  162 |   timeoutMs?: number;
  163 |   pollIntervalMs?: number;
  164 |   /**
  165 |    * Ignore messages received before this instant. Defaults to when this worker
  166 |    * process started — sufficient for the normal "assert the mail my test just
  167 |    * caused" case, since generated recipients are uuid-unique. Pass an explicit
  168 |    * value when a test triggers a SECOND email to an address it already used and
  169 |    * must not match the first.
  170 |    */
  171 |   notBefore?: Date | string | number;
  172 | }
  173 | 
  174 | function toMs(value: Date | string | number): number {
  175 |   if (value instanceof Date) return value.getTime();
  176 |   if (typeof value === "number") return value;
  177 |   return Date.parse(value);
  178 | }
  179 | 
  180 | /**
  181 |  * Polls Mailpit until an email addressed to `toEmail` arrives, then returns it
  182 |  * with html_body/text_body populated. Throws on timeout.
  183 |  */
  184 | export async function waitForEmail(
  185 |   toEmail: string,
  186 |   options: WaitForEmailOptions = {}
  187 | ): Promise<MailpitMessage> {
  188 |   const {
  189 |     subjectPattern,
  190 |     timeoutMs = 30_000,
  191 |     pollIntervalMs = 2_000,
  192 |     notBefore,
  193 |   } = options;
  194 | 
  195 |   const cfg = mailpitConfig();
  196 |   const baselineMs =
  197 |     toMs(notBefore ?? PROCESS_START_MS) - CLOCK_SKEW_TOLERANCE_MS;
  198 |   const deadline = Date.now() + timeoutMs;
  199 | 
  200 |   // Retained across polls purely so the timeout error can say something useful
  201 |   // about what WAS in the inbox.
  202 |   let lastSeen: MailpitListItem[] = [];
  203 | 
  204 |   while (Date.now() < deadline) {
  205 |     let messages: MailpitListItem[];
  206 |     try {
  207 |       messages = await listSince(cfg, baselineMs);
  208 |     } catch (err) {
  209 |       // Transient Mailpit API error — log and retry rather than abort
  210 |       console.warn(`[emailHelper] Mailpit poll error (retrying): ${err}`);
  211 |       await sleep(pollIntervalMs);
  212 |       continue;
  213 |     }
  214 |     lastSeen = messages;
  215 | 
  216 |     // Newest-first, so the first hit is the most recent — if a flow resent,
  217 |     // the caller means the email they just caused.
  218 |     const match = messages.find((m) => {
  219 |       const recipientMatch = !!matchRecipient(m, toEmail);
  220 |       const subjectMatch = subjectPattern
  221 |         ? subjectPattern.test(m.Subject)
  222 |         : true;
  223 |       return recipientMatch && subjectMatch;
  224 |     });
  225 | 
  226 |     if (match) {
  227 |       const detail = await mailpitGet<MailpitDetail>(
  228 |         cfg,
  229 |         `/api/v1/message/${match.ID}`
  230 |       );
  231 |       return {
  232 |         id: match.ID,
  233 |         subject: match.Subject,
  234 |         // The address we matched, not To[0] — a multi-recipient message would
  235 |         // otherwise report someone else's address back to the assertion.
  236 |         to_email: matchRecipient(match, toEmail) ?? toEmail,
  237 |         from_email: match.From?.Address ?? "",
  238 |         // Mailpit's receipt time — the same field the staleness guard reads.
  239 |         // (The detail endpoint's `Date` is the header the sender wrote.)
  240 |         created_at: match.Created,
  241 |         html_body: detail.HTML ?? "",
  242 |         text_body: detail.Text ?? "",
  243 |       };
  244 |     }
  245 | 
  246 |     await sleep(pollIntervalMs);
  247 |   }
  248 | 
> 249 |   throw new Error(
      |         ^ Error: Timed out after 60000ms waiting for email to <autouser_breakdown_93d21d3e@demomailtrap.co> matching /Your Order Confirmation/. Saw 1 message(s) since the baseline addressed to: neajmahmud.dev@gmail.com.
  250 |     `Timed out after ${timeoutMs}ms waiting for email to <${toEmail}>` +
  251 |       `${subjectPattern ? ` matching ${subjectPattern}` : ""}. ` +
  252 |       `Saw ${lastSeen.length} message(s) since the baseline` +
  253 |       `${describeRecipients(lastSeen)}.`
  254 |   );
  255 | }
  256 | 
  257 | /** Recipient summary for the timeout message — on a shared inbox this is the debug. */
  258 | function describeRecipients(items: MailpitListItem[]): string {
  259 |   if (!items.length) return "";
  260 |   const addresses = [
  261 |     ...new Set(
  262 |       items
  263 |         .flatMap((m) => m.To?.map((r) => r.Address ?? "?") ?? [])
  264 |         .filter(Boolean)
  265 |     ),
  266 |   ];
  267 |   const shown = addresses.slice(0, 10);
  268 |   const suffix = addresses.length > shown.length ? ", …" : "";
  269 |   return ` addressed to: ${shown.join(", ")}${suffix}`;
  270 | }
  271 | 
  272 | function sleep(ms: number): Promise<void> {
  273 |   return new Promise((resolve) => setTimeout(resolve, ms));
  274 | }
  275 | 
  276 | /**
  277 |  * Extracts the user-invitation token from an invitation email body.
  278 |  * The backend builds the link as `…/invitation?userToken=<64-hex>` — this is
  279 |  * the only place the token is exposed (the invite API never returns it). The
  280 |  * extracted value is sent back to /register as `userInvitationToken`.
  281 |  */
  282 | export function extractInviteToken(emailBody: string): string {
  283 |   // The HTML body HTML-encodes the '=' (userToken&#x3D;<hex>); the text body
  284 |   // keeps it raw. Accept '=', '&#x3D;', '&#61;', or '%3D'.
  285 |   const match = emailBody.match(
  286 |     /userToken(?:=|&#x3d;|&#61;|%3d)([a-f0-9]{16,})/i
  287 |   );
  288 |   const token = match?.[1];
  289 |   if (!token) {
  290 |     throw new Error(
  291 |       "Invitation token not found in email body (expected ?userToken=<hex>)"
  292 |     );
  293 |   }
  294 |   return token;
  295 | }
  296 | 
```