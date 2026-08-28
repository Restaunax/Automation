/**
 * pdfFixture — a dependency-free PDF the supply-shop artwork preflight accepts.
 *
 * The admin design step uploads a print-ready PDF that the backend preflights
 * (`restaunax-backend/src/Service/supplyShop/preflightService.ts`). Since
 * 2026-08-28 that preflight is ADVISORY for size and page count (the printer
 * is the authority; a file may carry several layouts) — only an unreadable
 * file or a wrong QR blocks — so a single-page PDF at the briefed size with a
 * solid, non-black fill comes back clean (OK/WARN) and can be sent as a proof.
 * No PDF library is installed here (and none is needed): the file is
 * assembled by hand with a correct xref table, which pdf-lib parses cleanly.
 */

/** Bleed the backend expects on every edge — `DEFAULT_BLEED_IN` in geometry.ts. */
export const BLEED_IN = 0.125;

/** CR80 (credit-card size) trim, the `physical-gift-card` variant. */
export const CR80_TRIM_IN = { width: 3.375, height: 2.125 };

const PT_PER_IN = 72;

/** Trim + bleed on every edge, in PDF points. 3.625 × 2.375 in → 261 × 171 pt. */
export const CR80_PAGE_PT = {
  width: (CR80_TRIM_IN.width + 2 * BLEED_IN) * PT_PER_IN,
  height: (CR80_TRIM_IN.height + 2 * BLEED_IN) * PT_PER_IN,
};

export interface FlatPdfOptions {
  widthPt: number;
  heightPt: number;
  /** 0..1 each. Default is a mid blue — NOT pure black, which preflight flags. */
  rgb?: [number, number, number];
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/**
 * One page, one filled rectangle covering the whole page (bleed included), no
 * fonts, no images. Returns the bytes as a Buffer ready for a multipart upload.
 */
export function buildFlatPdf({
  widthPt,
  heightPt,
  rgb = [0.15, 0.35, 0.75],
}: FlatPdfOptions): Buffer {
  const [r, g, b] = rgb;
  const content = `${fmt(r)} ${fmt(g)} ${fmt(b)} rg 0 0 ${fmt(widthPt)} ${fmt(
    heightPt
  )} re f\n`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(widthPt)} ${fmt(
      heightPt
    )}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`,
  ];

  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}

/** A front for the physical gift card that preflight lets through. */
export const giftCardPassingPdf = (): Buffer =>
  buildFlatPdf({ widthPt: CR80_PAGE_PT.width, heightPt: CR80_PAGE_PT.height });

/** US Letter — the wrong size for every card product, so preflight WARNs on pageSize (advisory: the printer is the authority on size). */
export const letterPdf = (): Buffer =>
  buildFlatPdf({ widthPt: 612, heightPt: 792 });
