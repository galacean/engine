/**
 * Deterministic multi-lane 96-bit streaming FNV-1a hash over arbitrary JSON-like
 * structures without allocating a concatenated serialized string.
 */
export function hashSignatureValue(root: unknown): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  let h3 = 0x85ebca77;

  const mix = (byte: number): void => {
    h1 = Math.imul(h1 ^ byte, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((byte + 0x9e) & 0xff), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ ((byte * 33) & 0xff), 0xc2b2ae35) >>> 0;
  };

  const mixStr = (value: string): void => {
    mix(0x53); // 'S'
    const len = value.length;
    mix(len & 0xff);
    mix((len >>> 8) & 0xff);
    mix((len >>> 16) & 0xff);
    for (let i = 0; i < len; i++) {
      const code = value.charCodeAt(i);
      mix(code & 0xff);
      if (code > 0xff) mix((code >>> 8) & 0xff);
    }
  };

  const f64 = new Float64Array(1);
  const u8 = new Uint8Array(f64.buffer);

  const mixNum = (value: number): void => {
    mix(0x4e); // 'N'
    if (Object.is(value, -0)) value = 0;
    f64[0] = value;
    for (let i = 0; i < 8; i++) mix(u8[i]!);
  };

  const visit = (value: unknown): void => {
    if (value === null) {
      mix(0x30);
      return;
    }
    if (value === undefined) {
      mix(0x31);
      return;
    }
    const t = typeof value;
    if (t === "boolean") {
      mix(value ? 0x32 : 0x33);
      return;
    }
    if (t === "number") {
      mixNum(value as number);
      return;
    }
    if (t === "string") {
      mixStr(value as string);
      return;
    }
    if (Array.isArray(value)) {
      mix(0x5b); // '['
      const len = value.length;
      for (let i = 0; i < len; i++) {
        const item = value[i];
        visit(item === undefined ? null : item);
      }
      mix(0x5d); // ']'
      return;
    }
    if (ArrayBuffer.isView(value)) {
      mix(0x56); // 'V'
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      for (let i = 0; i < bytes.length; i++) mix(bytes[i]!);
      return;
    }
    if (t === "object") {
      mix(0x7b); // '{'
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        const v = record[k];
        if (v === undefined || typeof v === "function" || typeof v === "symbol") continue;
        mixStr(k);
        visit(v);
      }
      mix(0x7d); // '}'
    }
  };

  visit(root);
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}${h3.toString(16).padStart(8, "0")}`;
}
