/**
 * A minimal ZIP writer, stored (uncompressed) entries only.
 *
 * Shipping a set has to work in a browser with no dependency and no server, so
 * this is about sixty lines of the format rather than a library. Stored entries
 * are legal ZIP and every tool reads them; the files are small text anyway.
 */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(n: number): void {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]));
  }

  u32(n: number): void {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]));
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** Pack text files into a ZIP archive. */
export function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const out = new Writer();
  const entries: Entry[] = [];

  for (const [path, text] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const entry: Entry = { name, data, crc: crc32(data), offset: out.length };
    entries.push(entry);

    out.u32(0x04034b50); // local file header
    out.u16(20); // version needed
    out.u16(0); // flags
    out.u16(0); // stored
    out.u16(0); // time
    out.u16(0); // date
    out.u32(entry.crc);
    out.u32(data.length);
    out.u32(data.length);
    out.u16(name.length);
    out.u16(0); // extra length
    out.push(name);
    out.push(data);
  }

  const directoryAt = out.length;
  for (const entry of entries) {
    out.u32(0x02014b50); // central directory header
    out.u16(20); // version made by
    out.u16(20); // version needed
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.name.length);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u32(0);
    out.u32(entry.offset);
    out.push(entry.name);
  }

  const directorySize = out.length - directoryAt;
  out.u32(0x06054b50); // end of central directory
  out.u16(0);
  out.u16(0);
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(directorySize);
  out.u32(directoryAt);
  out.u16(0);

  return out.concat();
}
