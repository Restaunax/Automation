/**
 * zipReader.ts — read the entries of a downloaded ZIP (e.g. the year-end
 * package) without a dependency. Walks the central directory; supports
 * stored (method 0) and deflated (method 8, node's zlib) entries. Test
 * input only — no ZIP64, no encryption.
 */
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function readZip(zip: Buffer): ZipEntry[] {
  // The end-of-central-directory record sits in the last 22 + 65535 bytes.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a ZIP: no end-of-central-directory");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== CENTRAL_SIGNATURE) {
      throw new Error(`bad central directory entry ${n}`);
    }
    const method = zip.readUInt16LE(p + 10);
    const compressedSize = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLength);
    if (zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new Error(`bad local header for ${name}`);
    }
    const start =
      localOffset +
      30 +
      zip.readUInt16LE(localOffset + 26) +
      zip.readUInt16LE(localOffset + 28);
    const raw = zip.subarray(start, start + compressedSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`${name}: unsupported compression method ${method}`);
    entries.push({ name, data });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
