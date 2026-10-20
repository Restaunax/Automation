import { test, expect } from "@playwright/test";
import {
  apiBreakdownLines,
  assertSameLines,
  assertSums,
  normaliseMoney,
  readEmailItemNames,
  readEmailLines,
  type Line,
} from "../../utils/orderBreakdown";

// The spec's section 9 reference example.
const REF: Line[] = [
  { kind: "SUBTOTAL", label: "Subtotal", amount: 39.48 },
  { kind: "PROMOTION", label: "Free garlic knots", amount: -3.99 },
  { kind: "POINTS", label: "Rewards (200 pts)", amount: -2 },
  { kind: "DELIVERY_FEE", label: "Delivery fee", amount: 4.99 },
  { kind: "FREE_DELIVERY", label: "Free delivery", amount: -4.99 },
  { kind: "SERVICE_FEE", label: "Service fee", amount: 1.5 },
  { kind: "TAX", label: "Tax", amount: 2.68 },
  { kind: "TIP", label: "Tip", amount: 5 },
  { kind: "TOTAL", label: "Total", amount: 42.67 },
  { kind: "GIFT_CARD", label: "Gift card", amount: -10 },
  { kind: "CHARGED", label: "Charged", amount: 32.67 },
];

test.describe("normaliseMoney", () => {
  test("U+2212 minus, hyphen, commas, plus, nbsp", () => {
    expect(normaliseMoney("−$10.00")).toBe(-10);
    expect(normaliseMoney("-$10.00")).toBe(-10);
    expect(normaliseMoney("$1,234.50")).toBe(1234.5);
    expect(normaliseMoney("−$1,000.05")).toBe(-1000.05);
    expect(normaliseMoney("+$2.00")).toBe(2);
    expect(normaliseMoney(" $3.99 ")).toBe(3.99);
  });
  test("throws on non-money text", () => {
    expect(() => normaliseMoney("Free")).toThrow(/not a money amount/);
    expect(() => normaliseMoney("")).toThrow();
  });
});

test.describe("assertSums", () => {
  test("accepts the reference example (a)(b)(c)", () => {
    assertSums(REF, "Reference", {
      items: [{ amount: 21.5 }, { amount: 13.99 }, { amount: 3.99 }],
    });
  });
  test("accepts an order with no tender", () => {
    assertSums(REF.slice(0, 9), "Reference");
  });
  test("(b) rejects a total that does not add up", () => {
    const bad = REF.map((l) =>
      l.kind === "TOTAL" ? { ...l, amount: 42.68 + 0.01 } : l
    );
    expect(() => assertSums(bad, "Wind checkout")).toThrow(
      /^\[Wind checkout\] \(b\)/
    );
  });
  test("(c) rejects a wrong CHARGED and a missing CHARGED", () => {
    const bad = REF.map((l) =>
      l.kind === "CHARGED" ? { ...l, amount: 33.67 } : l
    );
    expect(() => assertSums(bad, "Email")).toThrow(/^\[Email\] \(c\)/);
    expect(() => assertSums(REF.slice(0, 10), "Email")).toThrow(/no CHARGED/);
  });
  test("(a) rejects items that do not add up to SUBTOTAL", () => {
    expect(() =>
      assertSums(REF, "Backend", { items: [{ amount: 39 }] })
    ).toThrow(/^\[Backend\] \(a\)/);
  });
  test("rejects a list with no TOTAL, naming the surface", () => {
    expect(() =>
      assertSums(
        REF.filter((l) => l.kind !== "TOTAL"),
        "Dashboard"
      )
    ).toThrow(/^\[Dashboard\] .*no TOTAL/);
  });
  test("rejects an empty list", () => {
    expect(() => assertSums([], "POS")).toThrow(/^\[POS\] .*empty/);
  });
});

test.describe("assertSameLines", () => {
  test("fails loudly, naming the surface, on an empty actual list", () => {
    expect(() => assertSameLines(REF, [], "Wind checkout")).toThrow(
      /\[Wind checkout\].*ZERO/
    );
  });
  test("fails on an empty oracle", () => {
    expect(() => assertSameLines([], REF, "POS")).toThrow(/\[POS\]/);
  });
  test("label case, a trailing colon and kinds are ignored", () => {
    const actual = REF.map(({ label, amount }) => ({
      label: label === "Total" ? "TOTAL" : `${label}:`,
      amount,
    }));
    assertSameLines(REF, actual, "Dashboard");
  });
  test("reports a differing amount, a differing label and a length mismatch", () => {
    const amt = REF.map((l) => (l.kind === "TAX" ? { ...l, amount: 2.69 } : l));
    expect(() => assertSameLines(REF, amt, "Email")).toThrow(
      /\[Email\].*differ/s
    );
    const lbl = REF.map((l) =>
      l.kind === "TIP" ? { ...l, label: "Gratuity" } : l
    );
    expect(() => assertSameLines(REF, lbl, "Email")).toThrow(/differ/);
    expect(() => assertSameLines(REF, REF.slice(1), "Email")).toThrow(/differ/);
  });
});

test.describe("apiBreakdownLines", () => {
  test("returns totals, then refund lines and net paid", () => {
    const lines = apiBreakdownLines({
      breakdown: {
        totals: [{ kind: "TOTAL", label: "Total", amount: 10 }],
        refunds: {
          lines: [{ kind: "REFUND", label: "Refund", amount: -4 }],
          netPaidLine: { kind: "NET_PAID", label: "Net paid", amount: 6 },
        },
      },
    });
    expect(lines.map((l) => l.kind)).toEqual(["TOTAL", "REFUND", "NET_PAID"]);
  });
  test("throws when there is no breakdown", () => {
    expect(() => apiBreakdownLines({})).toThrow(/no breakdown/);
  });
});

// Markup shaped like templates/emails/_partials/breakdownTotals.html.
const row = (label: string, amount: string, cls = "e-t-sec") =>
  `<tr><td align="left" class="${cls}" style="padding:5px 0;">${label}</td>` +
  `<td align="right" width="96" class="e-money ${cls}" style="width:96px;">${amount}</td></tr>`;

test.describe("readEmailLines", () => {
  const html =
    `<table width="600"><tr><td class="e-money">$99.99</td><td>other</td></tr></table>` +
    `<table role="presentation" width="280" align="right" cellpadding="0">` +
    row("Subtotal", "$39.48") +
    row("Chef&#x27;s special &amp; sides", "−$3.99", "e-ok") +
    `<tr><td colspan="2" style="height:12px;">&nbsp;</td></tr>` +
    `<tr><td colspan="2" class="e-brand-rule" style="height:2px;">&nbsp;</td></tr>` +
    `<tr><td align="left" class="e-t-sec">Total</td>` +
    `<td align="right" width="96" class="e-money e-total e-t-pri">$1,042.67</td></tr>` +
    `<tr><td colspan="2" align="right" class="e-t-sec">You saved $4.01 with Solo Delight</td></tr>` +
    `</table><div style="clear:both">&nbsp;</div>`;

  test("reads label/amount rows of the totals table only", () => {
    expect(readEmailLines(html)).toEqual([
      { label: "Subtotal", amount: 39.48 },
      { label: "Chef's special & sides", amount: -3.99 },
      { label: "Total", amount: 1042.67 },
    ]);
  });
  test("throws when the totals table is absent", () => {
    expect(() => readEmailLines("<p>hi</p>")).toThrow(/no totals table/);
  });
});

test.describe("readEmailItemNames", () => {
  const html =
    `<table role="table" width="100%"><thead><tr><th>Item</th><th>Qty</th><th class="e-money">Amount</th></tr></thead><tbody>` +
    `<tr><td valign="top" class="e-t-pri">Platter</td><td>1</td><td class="e-money">$20.00</td></tr>` +
    `<tr><td class="e-t-mut">+ Bacon &times;2</td><td></td><td class="e-money">$3.00</td></tr>` +
    `<tr><td valign="top" class="e-t-pri">Cookie <span class="e-ok e-bd">Free</span></td><td>1</td>` +
    `<td class="e-money"><span class="e-t-mut">$4.00</span><br>$4.00</td></tr>` +
    `</tbody></table>`;

  test("reads each row's name cell, badge included", () => {
    expect(readEmailItemNames(html)).toEqual([
      "Platter",
      "+ Bacon ×2",
      "Cookie Free",
    ]);
  });
  test("throws when the item table is absent", () => {
    expect(() => readEmailItemNames("<p>hi</p>")).toThrow(/no item table/);
  });
});
