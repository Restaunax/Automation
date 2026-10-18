/**
 * pdfText.ts — the visible text of a generated PDF, good enough to assert a
 * sentence is printed on it. Inflates every FlateDecode content stream and
 * decodes the string operands of Tj / TJ (literal "(...)" and hex "<...>",
 * one byte per glyph — the WinAnsi standard fonts pdf-lib writes). Not a
 * general PDF parser: test input only.
 */
import { inflateSync } from "node:zlib";

const decodeLiteral = (s: string) =>
  s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, c: string) => {
    const map: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };
    return map[c] ?? String.fromCharCode(parseInt(c, 8));
  });

const decodeHex = (h: string) =>
  Buffer.from(
    h.replace(/\s+/g, "").padEnd(Math.ceil(h.length / 2) * 2, "0"),
    "hex"
  ).toString("latin1");

export function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const chunks: string[] = [];
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const header = raw.slice(Math.max(0, m.index - 300), m.index);
    let body = pdf.subarray(start, end);
    if (/FlateDecode/.test(header)) {
      try {
        body = inflateSync(body);
      } catch {
        continue; // not a content stream we can read (e.g. an image)
      }
    }
    const content = body.toString("latin1");
    const textRe = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g;
    for (const op of content.split(/\r?\n/)) {
      if (!/T[jJ]\s*$/.test(op.trim())) continue;
      const parts = op.match(textRe) ?? [];
      chunks.push(
        parts
          .map((p) =>
            p.startsWith("(")
              ? decodeLiteral(p.slice(1, -1))
              : decodeHex(p.slice(1, -1))
          )
          .join("")
      );
    }
    streamRe.lastIndex = end + "endstream".length;
  }
  return chunks.join("\n");
}
