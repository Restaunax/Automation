/**
 * orderBreakdown.ts — read one order's money lines from every surface and
 * compare them to the backend's `breakdown` (the oracle).
 *
 * Contract: restaunax docs/features/ORDER_MONEY_BREAKDOWN.md. A surface renders
 * the server's `totals` lines as given, so the readers here return ordered
 * (label, amount) pairs and `assertSameLines` deep-compares them. Nothing here
 * recomputes money except `assertSums`, which checks the contract invariants.
 *
 * Readers return totals + refunds lines only. Info lines ("You saved $X…")
 * carry no amount of their own and are never summed.
 */
import type { Locator, Page } from "@playwright/test";

export type Line = { kind?: string; label: string; amount: number };

/** The slice of `MoneyBreakdown` (restaunax-backend) these helpers read. */
export type ApiBreakdown = {
  items?: {
    key?: string;
    name?: string;
    quantity?: number;
    amount: number;
    marker?: string;
    markerLabel?: string;
  }[];
  info?: { kind: string; label: string; amount: number }[];
  totals?: { kind: string; label: string; amount: number }[];
  refunds?: {
    lines: { kind: string; label: string; amount: number }[];
    netPaidLine?: { kind: string; label: string; amount: number };
  };
};

const cents = (n: number) => Math.round(n * 100);

/**
 * "−$10.00" (U+2212), "-$10.00", "$1,234.50", "+$2" -> number. Throws on text
 * that is not a money amount, so a mis-scoped locator fails loudly.
 */
export function normaliseMoney(text: string): number {
  const cleaned = text.replace(/[−–—‐‑]/g, "-").replace(/[\s\u00a0$,+]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`normaliseMoney: "${text}" is not a money amount`);
  }
  return Math.round(parseFloat(cleaned) * 100) / 100;
}

/** Lowercase, collapse whitespace (incl. nbsp), drop a trailing colon. */
const normLabel = (s: string) =>
  s
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .replace(/:$/, "")
    .toLowerCase();

/** The backend oracle: totals, then refund lines and "Net paid" when refunded. */
export function apiBreakdownLines(order: {
  breakdown?: ApiBreakdown | null;
}): Line[] {
  const b = order.breakdown;
  if (!b?.totals) {
    throw new Error("apiBreakdownLines: order has no breakdown.totals");
  }
  const lines: Line[] = b.totals.map(({ kind, label, amount }) => ({
    kind,
    label,
    amount,
  }));
  if (b.refunds) {
    for (const l of b.refunds.lines) {
      lines.push({ kind: l.kind, label: l.label, amount: l.amount });
    }
    if (b.refunds.netPaidLine) {
      const n = b.refunds.netPaidLine;
      lines.push({ kind: n.kind, label: n.label, amount: n.amount });
    }
  }
  return lines;
}

/** Visible text of an element's own text nodes (skips nested spans). */
const ownText = (el: Element): string =>
  Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? "")
    .join("");

async function readTestIdRows(
  scope: Locator,
  prefix: string,
  sections: string[]
): Promise<Line[]> {
  const lines: Line[] = [];
  for (const section of sections) {
    const rows = scope.locator(`[data-testid^="${prefix}${section}-"]`);
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const testId = (await row.getAttribute("data-testid")) ?? "";
      const kind = testId.slice(`${prefix}${section}-`.length);
      // A line row has a label span and an amount span; an info row has only
      // its label, never an amount, so it is not a money line.
      const labelBox = row.locator("xpath=(.//span)[1]");
      const amountBox = row.locator("xpath=(.//span)[last()]");
      if ((await row.locator("xpath=.//span").count()) < 2) continue;
      const label = await labelBox.evaluate(ownText);
      lines.push({
        kind,
        label: label.trim(),
        amount: normaliseMoney(await amountBox.innerText()),
      });
    }
  }
  return lines;
}

/**
 * Wind checkout order summary. The bottom line (TOTAL, or CHARGED when a
 * tender was used) is not a `breakdown-totals-*` row: it is
 * `checkout-total-label` + `checkout-total`, so it is appended last. Local
 * extras ("(5%)", "(credit cards)") sit in nested spans and are ignored.
 */
export async function readWindCheckoutLines(page: Page): Promise<Line[]> {
  const lines = await readTestIdRows(page.locator("body"), "breakdown-", [
    "totals",
    "refunds",
  ]);
  const amount = page.getByTestId("checkout-total");
  if ((await amount.count()) > 0) {
    const label = (
      await page.getByTestId("checkout-total-label").innerText()
    ).trim();
    lines.push({
      kind: lines.some((l) => l.kind === "TOTAL") ? "CHARGED" : "TOTAL",
      label,
      amount: normaliseMoney(await amount.innerText()),
    });
  }
  return lines;
}

/** Wind (and lima) order-confirmation page: `order-breakdown-{section}-{KIND}`. */
export async function readWindConfirmationLines(page: Page): Promise<Line[]> {
  return readTestIdRows(page.locator("body"), "order-breakdown-", [
    "totals",
    "refunds",
  ]);
}

/**
 * Dashboard order-details sheet. There is no per-row hook: each money row is
 * `<p>label</p><p>$amount</p>` (labels carry no colon), so collect, in DOM
 * order, every `<p>` whose next sibling `<p>` is a money amount. Pass the
 * details sheet/dialog locator (`createOwnerOrdersPage(p).detailSheet()`), not
 * the page, so unrelated rows are out of scope.
 */
export async function readDashboardLines(scope: Locator): Promise<Line[]> {
  const pairs = await scope.evaluate((root) => {
    const money = /^[−-]?\$[\d,]+\.\d{2}$/;
    const out: { label: string; amount: string }[] = [];
    root.querySelectorAll("p").forEach((p) => {
      const next = p.nextElementSibling;
      const amount =
        next?.tagName === "P" ? (next.textContent ?? "").trim() : "";
      if (
        next &&
        money.test(amount) &&
        !money.test((p.textContent ?? "").trim())
      ) {
        out.push({ label: (p.textContent ?? "").trim(), amount });
      }
    });
    return out;
  });
  return pairs.map((p) => ({
    label: p.label,
    amount: normaliseMoney(p.amount),
  }));
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x3D;/g, "=")
    .replace(/&#x60;/g, "`")
    .replace(/&minus;/g, "−")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const cellText = (html: string) =>
  decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/**
 * Money rows of a confirmation email's HTML, in order. Parses the totals table
 * of `_partials/breakdownTotals.html` (the `width="280"` table): every `<tr>`
 * with a label `<td>` and an `e-money` `<td>`. Info rows (one `colspan` cell)
 * and rule/spacer rows have no money cell and are skipped. Refund lines and
 * "Net paid" follow the totals in the same table.
 */
export function readEmailLines(html: string): Line[] {
  const table = /<table[^>]*\bwidth="280"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!table) {
    throw new Error(
      'readEmailLines: no totals table (width="280") in the email'
    );
  }
  const lines: Line[] = [];
  for (const row of (table[1] ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(row[1] ?? "").matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    const money = cells.find((c) => /\be-money\b/.test(c[1] ?? ""));
    if (!money || cells.length < 2) continue;
    const label = cellText(cells[0]?.[2] ?? "");
    lines.push({ label, amount: normaliseMoney(cellText(money[2] ?? "")) });
  }
  return lines;
}

/**
 * Deep-compare ordered (label, amount) pairs against the oracle. Labels are
 * compared case-insensitively (a surface may upper-case TOTAL); kinds are not
 * compared because not every surface exposes them. An empty list on either
 * side fails, naming the surface: a reader that found nothing must not pass.
 */
export function assertSameLines(
  expected: Line[],
  actual: Line[],
  surfaceName: string
): void {
  if (actual.length === 0) {
    throw new Error(
      `[${surfaceName}] read ZERO money lines (selector/markup drift?); expected ${expected.length}`
    );
  }
  if (expected.length === 0) {
    throw new Error(
      `[${surfaceName}] the expected (oracle) line list is empty`
    );
  }
  const show = (ls: Line[]) =>
    ls.map((l) => `${l.label} = ${l.amount.toFixed(2)}`).join(" | ");
  const same =
    expected.length === actual.length &&
    expected.every(
      (e, i) =>
        normLabel(e.label) === normLabel(actual[i]?.label ?? "") &&
        cents(e.amount) === cents(actual[i]?.amount ?? NaN)
    );
  if (!same) {
    throw new Error(
      `[${surfaceName}] money lines differ from the backend breakdown\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`
    );
  }
}

/**
 * The contract invariants over a kind-bearing line list:
 *  (b) the lines before TOTAL add up to TOTAL;
 *  (c) TOTAL plus the tenders (GIFT_CARD, STORE_CREDIT, negative) = CHARGED,
 *      and CHARGED exists exactly when a tender does;
 *  (a) optional: the item amounts add up to SUBTOTAL.
 * Tolerance is one cent.
 */
export function assertSums(
  lines: Line[],
  opts: { items?: { amount: number }[] } = {}
): void {
  if (lines.length === 0) throw new Error("assertSums: empty line list");
  const iTotal = lines.findIndex((l) => l.kind === "TOTAL");
  if (iTotal < 0) throw new Error("assertSums: no TOTAL line");
  const total = lines[iTotal]?.amount ?? NaN;
  const before = lines.slice(0, iTotal).reduce((s, l) => s + l.amount, 0);
  if (Math.abs(cents(before) - cents(total)) > 1) {
    throw new Error(
      `(b) lines before TOTAL sum to ${before.toFixed(2)}, TOTAL is ${total.toFixed(2)}`
    );
  }
  const after = lines.slice(iTotal + 1);
  const tenders = after
    .filter((l) => l.kind === "GIFT_CARD" || l.kind === "STORE_CREDIT")
    .reduce((s, l) => s + l.amount, 0);
  const charged = after.find((l) => l.kind === "CHARGED");
  if (tenders !== 0 && !charged) {
    throw new Error("(c) a tender was used but there is no CHARGED line");
  }
  if (charged && Math.abs(cents(total + tenders) - cents(charged.amount)) > 1) {
    throw new Error(
      `(c) TOTAL ${total.toFixed(2)} + tenders ${tenders.toFixed(2)} != CHARGED ${charged.amount.toFixed(2)}`
    );
  }
  if (opts.items) {
    const sub = lines.find((l) => l.kind === "SUBTOTAL");
    if (!sub) throw new Error("(a) no SUBTOTAL line to compare the items to");
    const sum = opts.items.reduce((s, i) => s + i.amount, 0);
    if (Math.abs(cents(sum) - cents(sub.amount)) > 1) {
      throw new Error(
        `(a) items sum to ${sum.toFixed(2)}, SUBTOTAL is ${sub.amount.toFixed(2)}`
      );
    }
  }
}
