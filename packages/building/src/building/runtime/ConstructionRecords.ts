/** Join explicit instance records without invoking any construction producer. */
export function concatenateRecords(records: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(records.reduce((n, b) => n + b.byteLength, 0));
  let p = 0;
  for (const b of records) {
    out.set(b, p);
    p += b.byteLength;
  }
  return out;
}
