/**
 * giftCardCsvFixture.ts — build the handover file a restaurant gives us when it
 * joins having already sold gift cards.
 *
 * Generated in code rather than checked in, the way utils/pdfFixture.ts builds
 * its PDF. That is not only convention here: an imported code becomes a
 * globally unique GiftCard.code, so a file on disk could be imported exactly
 * once and every rerun would collide with the last. Codes are seeded from the
 * run id instead.
 *
 * Shape is taken from the first real file we were handed: a UTF-8 BOM, the
 * headers "Card Number" and "Current Balance", 15-digit numeric codes, and
 * part-spent balances with cents. The backend guesses those two columns and
 * tolerates the BOM, so this exercises the real path rather than a tidied one.
 */

export interface GiftCardCsvRow {
  code: string;
  balance: number;
}

/** The vendor BIN the real cards carried. Kept so the fixture looks like one. */
const CODE_PREFIX = "9532344";

/** Four digits derived from the run id, so two runs never mint the same code. */
const runDigits = (runId: string): string => {
  let hash = 0;
  for (const ch of runId) hash = (hash * 31 + ch.charCodeAt(0)) % 10_000;
  return String(hash).padStart(4, "0");
};

/**
 * 15 numeric digits, like the vendor numbers we actually see: too long for our
 * own 16-character format and containing `0`/`1`, which our alphabet drops as
 * look-alikes. Both of those are the point — a client that only accepts our
 * format rejects these.
 */
export const giftCardCsvRows = (
  runId: string,
  balances: number[]
): GiftCardCsvRow[] =>
  balances.map((balance, i) => ({
    code: `${CODE_PREFIX}${runDigits(runId)}${String(i).padStart(4, "0")}`,
    balance,
  }));

/** Render rows as the file an owner would actually send: BOM, CRLF, 2 columns. */
export const buildGiftCardCsv = (
  rows: GiftCardCsvRow[],
  opts: { bom?: boolean; header?: [string, string] } = {}
): string => {
  const [codeHeader, balanceHeader] = opts.header ?? [
    "Card Number",
    "Current Balance",
  ];
  const body = [
    `${codeHeader},${balanceHeader}`,
    ...rows.map((r) => `${r.code},${r.balance}`),
  ].join("\r\n");
  return `${opts.bom === false ? "" : "﻿"}${body}\r\n`;
};

/** What a file is worth, for asserting the preview total. */
export const giftCardCsvTotal = (rows: GiftCardCsvRow[]): number =>
  Math.round(rows.reduce((sum, r) => sum + r.balance, 0) * 100) / 100;
