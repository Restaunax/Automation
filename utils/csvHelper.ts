/**
 * csvHelper.ts — tiny RFC-4180 CSV parser for asserting on exported files
 * (Orders-tab CSV export). Handles quoted fields, escaped quotes ("") and
 * CRLF/LF line endings. Returns rows of string cells; a trailing empty line
 * is dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Convenience: header row + array of {header: value} objects. */
export function csvToObjects(text: string): {
  header: string[];
  rows: Record<string, string>[];
} {
  const [header = [], ...body] = parseCsv(text);
  const rows = body.map((cells) =>
    Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]))
  );
  return { header, rows };
}
